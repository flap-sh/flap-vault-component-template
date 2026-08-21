"use client";

import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAccount, useBalance, useChainId, useConnect, useDisconnect, usePublicClient, useSwitchChain, useWalletClient } from "wagmi";
import { decodeFunctionResult, encodeFunctionData, formatUnits } from "viem";
import { Alert } from "@/src/ui";
import type {
  Address,
  ContractEventRequest,
  ContractReadRequest,
  ContractWriteRequest,
  FlapI18n,
  FlapNotify,
  FlapWallet,
  FlapVaultSdk,
  HostRuntimeResult,
  NftMetadataReader,
  NftMetadataReadRequest,
  NftMetadataSnapshot,
  OracleReader,
  SimulateResult,
  TxReceipt,
  VaultManifest,
  VaultRuntimeContext,
  VaultRuntimeContextOverrides,
} from "./types";
import { chainLabelForChain, createVaultRuntimeContext } from "./runtimeContext";
import { fetchOracleJson } from "./oracle";
import { createLocalNftMetadataReader, nftTokenUriAbi, vaultV2NftAbi } from "./nftMetadata";
import { RuntimeContext } from "./runtimeStore";
import { isValidAddress, ZERO_ADDRESS } from "./taxInfo";
import { resolveSafeContractWriteFeeOverrides } from "./contractWriteFees";
import { readContractEventsInBlockRanges } from "./contractEvents";

export { useFlapI18n, useFlapNotify, useFlapSdk, useVaultContext } from "./runtimeStore";

type ToastLevel = "info" | "success" | "warning" | "error";

interface ToastItem {
  id: number;
  level: ToastLevel;
  message: string;
}

interface RuntimeProviderProps {
  children: ReactNode;
  manifest: VaultManifest;
  i18n: Record<string, Record<string, string>>;
  runtimeContext?: VaultRuntimeContextOverrides;
  hostRuntimeResult?: HostRuntimeResult | null;
  locale?: string;
  oracleReader?: OracleReader;
  nftMetadataReader?: NftMetadataReader;
}

const defaultNftMetadataReader = createLocalNftMetadataReader();
const NFT_METADATA_MAX_CONCURRENCY = 6;
let activeNftMetadataReads = 0;
const pendingNftMetadataReads: Array<() => void> = [];

async function limitNftMetadataRead<T>(task: () => Promise<T>): Promise<T> {
  if (activeNftMetadataReads >= NFT_METADATA_MAX_CONCURRENCY) {
    await new Promise<void>((resolve) => pendingNftMetadataReads.push(resolve));
  }
  activeNftMetadataReads += 1;
  try {
    return await task();
  } finally {
    activeNftMetadataReads -= 1;
    pendingNftMetadataReads.shift()?.();
  }
}

function applyParams(value: string, params?: Record<string, string | number>) {
  if (!params) return value;
  return Object.entries(params).reduce((acc, [key, item]) => acc.replaceAll(`{${key}}`, String(item)), value);
}

function getPreviewOracleEndpoint(extraConfig: Record<string, unknown> | undefined, oracleId: string) {
  const oracleEndpoints = extraConfig?.oracleEndpoints;
  if (!oracleEndpoints || typeof oracleEndpoints !== "object" || Array.isArray(oracleEndpoints)) return undefined;
  const endpoint = (oracleEndpoints as Record<string, unknown>)[oracleId];
  return typeof endpoint === "string" ? endpoint : undefined;
}

export function VaultRuntimeProvider({ children, manifest, i18n, runtimeContext: runtimeOverrides, hostRuntimeResult, locale = "en", oracleReader, nftMetadataReader }: RuntimeProviderProps) {
  const [version, setVersion] = useState(0);
  const [messages, setMessages] = useState<ToastItem[]>([]);
  const toastTimersRef = useRef<Map<number, number>>(new Map());
  const nftMetadataCacheRef = useRef<Map<string, Promise<NftMetadataSnapshot>>>(new Map());
  const vaultNftAddressCacheRef = useRef<Map<string, Promise<Address>>>(new Map());
  const { address: accountAddress, isConnected } = useAccount();
  const connectedChainId = useChainId();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChainAsync, isPending: isSwitchingChain } = useSwitchChain();
  const effectiveChainId = runtimeOverrides?.chainId ?? hostRuntimeResult?.addresses.chainId ?? connectedChainId ?? manifest.match.bindings[0]?.chainId ?? 56;
  const publicClient = usePublicClient({ chainId: effectiveChainId });
  const { data: walletClient } = useWalletClient();
  const { data: nativeBalance } = useBalance({ address: accountAddress, chainId: isConnected ? connectedChainId : undefined });

  const dismissMessage = useCallback((id: number) => {
    const timerId = toastTimersRef.current.get(id);
    if (timerId) {
      window.clearTimeout(timerId);
      toastTimersRef.current.delete(id);
    }
    setMessages((items) => items.filter((item) => item.id !== id));
  }, []);

  useEffect(() => {
    const timers = toastTimersRef.current;
    return () => {
      for (const timerId of timers.values()) {
        window.clearTimeout(timerId);
      }
      timers.clear();
    };
  }, []);

  const runtimeContext = useMemo<VaultRuntimeContext>(() => {
    return createVaultRuntimeContext({
      manifest,
      connectedChainId,
      hostRuntimeResult,
      runtimeOverrides: {
        ...runtimeOverrides,
        userAddress: runtimeOverrides?.userAddress ?? accountAddress,
      },
    });
  }, [accountAddress, connectedChainId, hostRuntimeResult, manifest, runtimeOverrides]);

  const i18nApi = useMemo<FlapI18n>(
    () => ({
      locale,
      t(key, fallback, params) {
        const defaultLocale = manifest.i18n[0];
        const resolved = i18n[locale]?.[key] ?? i18n[defaultLocale]?.[key] ?? i18n.en?.[key] ?? fallback ?? key;
        return applyParams(resolved, params);
      },
    }),
    [i18n, locale, manifest.i18n],
  );

  const push = useCallback(
    (level: ToastLevel, message: string) => {
      const id = Date.now() + Math.floor(Math.random() * 1000);
      setMessages((items) => [{ id, level, message }, ...items].slice(0, 4));
      const timerId = window.setTimeout(() => {
        dismissMessage(id);
      }, 4200);
      toastTimersRef.current.set(id, timerId);
    },
    [dismissMessage],
  );

  const notify = useMemo<FlapNotify>(
    () => ({
      info: (message) => push("info", message),
      success: (message) => push("success", message),
      warning: (message) => push("warning", message),
      error: (message) => push("error", message),
    }),
    [push],
  );

  const wallet = useMemo<FlapWallet>(
    () => {
      const previewWallet = runtimeOverrides?.previewWallet;
      const walletAddress = previewWallet?.address ?? accountAddress;
      const walletConnected = previewWallet?.isConnected ?? isConnected;
      const walletChainId = previewWallet?.chainId ?? connectedChainId;
      return {
        address: walletAddress,
        chainId: walletConnected ? walletChainId : undefined,
        chainLabel: walletConnected && walletChainId ? chainLabelForChain(walletChainId) : undefined,
        requiredChainId: runtimeContext.chainId,
        requiredChainLabel: chainLabelForChain(runtimeContext.chainId),
        isConnected: walletConnected,
        isWrongNetwork: Boolean(walletConnected && walletChainId && walletChainId !== runtimeContext.chainId),
        canSwitchChain: previewWallet?.canSwitchChain ?? Boolean(switchChainAsync),
        isSwitchingChain,
        // Real native-token balance from the connected wallet. "0" until a wallet is connected.
        balance: previewWallet ? "0" : nativeBalance ? formatUnits(nativeBalance.value, nativeBalance.decimals) : "0",
        // Wallet connection is host/shell-owned. In this preview the SDK forwards to the
        // injected wagmi connector so the surface is functional rather than a no-op stub.
        connect: () => {
          const connector = connectors[0];
          if (connector) connect({ connector });
        },
        disconnect: () => disconnect(),
        switchChain: async () => {
          if (previewWallet) {
            throw new Error(`Switch wallet to ${chainLabelForChain(runtimeContext.chainId)} before continuing.`);
          }
          if (!switchChainAsync) {
            throw new Error(`Switch wallet to ${chainLabelForChain(runtimeContext.chainId)} before continuing.`);
          }
          await switchChainAsync({ chainId: runtimeContext.chainId });
        },
      };
    },
    [accountAddress, connect, connectedChainId, connectors, disconnect, isConnected, isSwitchingChain, nativeBalance, runtimeContext.chainId, runtimeOverrides?.previewWallet, switchChainAsync],
  );

  const assertWalletWriteReady = useCallback(
    (actionLabel: string) => {
      if (!accountAddress) throw new Error("Wallet is not connected.");
      if (isConnected && connectedChainId !== runtimeContext.chainId) {
        throw new Error(`Wrong network. Switch wallet to ${chainLabelForChain(runtimeContext.chainId)} before ${actionLabel}.`);
      }
    },
    [accountAddress, connectedChainId, isConnected, runtimeContext.chainId],
  );

  const readContract = useCallback(
    async <T,>(request: ContractReadRequest): Promise<T> => {
      if (!publicClient || !request.abi || !request.address) {
        throw new Error(`Contract read ${request.functionName} requires a public client, ABI, and address.`);
      }
      if (request.gasPrice !== undefined) {
        if (request.gasPrice <= 0n) throw new Error("Contract read gasPrice must be greater than zero.");
        const data = encodeFunctionData({
          abi: request.abi,
          functionName: request.functionName,
          args: request.args,
        });
        const response = await publicClient.call({
          account: request.account,
          to: request.address,
          data,
          gasPrice: request.gasPrice,
        });
        if (!response.data) throw new Error(`Contract read ${request.functionName} returned no data.`);
        return decodeFunctionResult({
          abi: request.abi,
          functionName: request.functionName,
          args: request.args,
          data: response.data,
        }) as T;
      }
      return (await publicClient.readContract({
        address: request.address,
        abi: request.abi,
        functionName: request.functionName,
        args: request.args,
        account: request.account,
      })) as T;
    },
    [publicClient],
  );

  const getGasPrice = useCallback(async (): Promise<bigint> => {
    if (!publicClient) throw new Error("Gas-price lookup requires a public client.");
    const gasPrice = await publicClient.getGasPrice();
    if (gasPrice <= 0n) throw new Error("The runtime returned an invalid network gas price.");
    return gasPrice;
  }, [publicClient]);

  const getBlockNumber = useCallback(async (): Promise<bigint> => {
    if (!publicClient) throw new Error("Block-number lookup requires a public client.");
    const blockNumber = await publicClient.getBlockNumber();
    if (blockNumber < 0n) throw new Error("The runtime returned an invalid block number.");
    return blockNumber;
  }, [publicClient]);

  const getContractEvents = useCallback(
    async <T,>(request: ContractEventRequest): Promise<T[]> => {
      if (!publicClient || !request.abi || !request.address || !request.eventName.trim()) {
        throw new Error("Contract event lookup requires a public client, ABI, address, and event name.");
      }
      const toBlock = typeof request.toBlock === "bigint" ? request.toBlock : await getBlockNumber();
      return readContractEventsInBlockRanges<T>({
        fromBlock: request.fromBlock,
        toBlock,
        readRange: async ({ fromBlock, toBlock: chunkToBlock }) => {
          const events = await publicClient.getContractEvents({
            address: request.address,
            abi: request.abi,
            eventName: request.eventName,
            args: request.args,
            fromBlock,
            toBlock: chunkToBlock,
            strict: request.strict,
          } as never);
          return events as unknown as T[];
        },
      });
    },
    [getBlockNumber, publicClient],
  );

  const simulateContract = useCallback(
    async (request: ContractWriteRequest): Promise<SimulateResult> => {
      assertWalletWriteReady(`simulating ${request.functionName}`);
      if (!publicClient || !request.abi || !request.address) {
        throw new Error(`Contract simulation ${request.functionName} requires a public client, ABI, and address.`);
      }
      const feeOverrides = await resolveSafeContractWriteFeeOverrides(request, getGasPrice);
      const simulation = await publicClient.simulateContract({
        account: accountAddress,
        address: request.address,
        abi: request.abi,
        functionName: request.functionName,
        args: request.args,
        value: request.value,
        ...feeOverrides,
      });
      return { request, result: simulation.result };
    },
    [accountAddress, assertWalletWriteReady, getGasPrice, publicClient],
  );

  const writeContract = useCallback(
    async (request: ContractWriteRequest): Promise<Address> => {
      assertWalletWriteReady(`writing ${request.functionName}`);
      if (!walletClient || !request.abi || !request.address) {
        throw new Error(`Contract write ${request.functionName} requires a wallet client, ABI, and address.`);
      }
      const feeOverrides = await resolveSafeContractWriteFeeOverrides(request, getGasPrice);
      const hash = await walletClient.writeContract({
        address: request.address,
        abi: request.abi,
        functionName: request.functionName,
        args: request.args,
        value: request.value,
        ...feeOverrides,
      });
      return hash as Address;
    },
    [assertWalletWriteReady, getGasPrice, walletClient],
  );

  const waitForTx = useCallback(
    async (hash: Address): Promise<TxReceipt> => {
      if (!publicClient) throw new Error("Transaction receipt requires a public client.");
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      return { hash, status: receipt.status === "success" ? "success" : "reverted" };
    },
    [publicClient],
  );

  const readOracle = useCallback(
    async <T,>(oracleId: string, params?: Record<string, string>): Promise<T> => {
      if (oracleReader) {
        return oracleReader<T>({
          oracleId,
          params,
          context: runtimeContext,
        });
      }

      const endpoint = getPreviewOracleEndpoint(runtimeContext.extraConfig, oracleId);
      if (!endpoint) throw new Error(`Oracle ${oracleId} is not provisioned by the runtime.`);

      return fetchOracleJson<T>({
        endpoint,
        params,
      });
    },
    [oracleReader, runtimeContext],
  );

  const readNftMetadata = useCallback(
    async (request: NftMetadataReadRequest): Promise<NftMetadataSnapshot> => {
      if (request.tokenId < 0n) throw new Error("NFT tokenId must not be negative.");
      const vaultAddress = runtimeContext.vaultAddress;
      if (!isValidAddress(vaultAddress) || vaultAddress.toLowerCase() === ZERO_ADDRESS) {
        throw new Error("Vault V2 NFT metadata requires a valid runtime Vault address.");
      }
      const cacheKey = `${runtimeContext.chainId}:${vaultAddress.toLowerCase()}:${request.tokenId.toString()}:${version}`;
      const cached = nftMetadataCacheRef.current.get(cacheKey);
      if (cached) return cached;
      const pending = limitNftMetadataRead(async () => {
        const nftAddressCacheKey = `${runtimeContext.chainId}:${vaultAddress.toLowerCase()}:${version}`;
        let nftAddressPending = vaultNftAddressCacheRef.current.get(nftAddressCacheKey);
        if (!nftAddressPending) {
          nftAddressPending = readContract<Address>({
            contract: "vault",
            address: vaultAddress,
            abi: vaultV2NftAbi,
            functionName: "nft",
          }).then((nftAddress) => {
            if (!isValidAddress(nftAddress) || nftAddress.toLowerCase() === ZERO_ADDRESS) {
              throw new Error("Vault V2 nft() returned an invalid NFT address.");
            }
            return nftAddress;
          });
          vaultNftAddressCacheRef.current.set(nftAddressCacheKey, nftAddressPending);
          if (vaultNftAddressCacheRef.current.size > 32) {
            const oldestNftAddressKey = vaultNftAddressCacheRef.current.keys().next().value;
            if (oldestNftAddressKey) vaultNftAddressCacheRef.current.delete(oldestNftAddressKey);
          }
          nftAddressPending.catch(() => vaultNftAddressCacheRef.current.delete(nftAddressCacheKey));
        }
        const nftAddress = await nftAddressPending;
        const tokenUri = await readContract<string>({
          contract: "nft",
          address: nftAddress,
          abi: nftTokenUriAbi,
          functionName: "tokenURI",
          args: [request.tokenId],
        });
        if (typeof tokenUri !== "string" || !tokenUri.trim()) throw new Error("NFT tokenURI returned an empty value.");
        return (nftMetadataReader ?? defaultNftMetadataReader)({
          ...request,
          chainId: runtimeContext.chainId,
          nftAddress,
          tokenUri: tokenUri.trim(),
          context: runtimeContext,
        });
      });
      nftMetadataCacheRef.current.set(cacheKey, pending);
      if (nftMetadataCacheRef.current.size > 128) {
        const oldestKey = nftMetadataCacheRef.current.keys().next().value;
        if (oldestKey) nftMetadataCacheRef.current.delete(oldestKey);
      }
      pending.catch(() => nftMetadataCacheRef.current.delete(cacheKey));
      return pending;
    },
    [nftMetadataReader, readContract, runtimeContext, version],
  );

  const refetch = useCallback(async () => {
    setVersion((item) => item + 1);
  }, []);

  const openExplorerTx = useCallback(
    (hash: Address) => {
      if (!runtimeContext.explorerBaseUrl) return;
      window.open(`${runtimeContext.explorerBaseUrl.replace(/\/$/, "")}/tx/${hash}`, "_blank", "noreferrer");
    },
    [runtimeContext.explorerBaseUrl],
  );

  const sdk = useMemo<FlapVaultSdk>(
    () => ({
      context: runtimeContext,
      i18n: i18nApi,
      notify,
      wallet,
      getGasPrice,
      getBlockNumber,
      getContractEvents,
      readContract,
      simulateContract,
      writeContract,
      waitForTx,
      readOracle,
      readNftMetadata,
      refetch,
      refetchNonce: version,
      openExplorerTx,
    }),
    [getBlockNumber, getContractEvents, getGasPrice, i18nApi, notify, openExplorerTx, readContract, readNftMetadata, readOracle, refetch, runtimeContext, simulateContract, version, waitForTx, wallet, writeContract],
  );

  return (
    <RuntimeContext.Provider value={sdk}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-[min(360px,calc(100vw-2rem))] flex-col gap-2">
        {messages.map((message) => (
          <div key={message.id} className="pointer-events-auto">
            <Alert
              tone={message.level === "error" ? "danger" : message.level}
              className="cursor-pointer shadow-panel backdrop-blur-sm transition hover:translate-y-[-1px]"
            >
              <button type="button" className="w-full text-left" onClick={() => dismissMessage(message.id)}>
                {message.message}
              </button>
            </Alert>
          </div>
        ))}
      </div>
    </RuntimeContext.Provider>
  );
}
