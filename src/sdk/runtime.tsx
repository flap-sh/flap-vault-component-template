"use client";

import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useAccount, useBalance, useChainId, useConnect, useDisconnect, usePublicClient, useSwitchChain, useWalletClient } from "wagmi";
import { formatUnits } from "viem";
import { Alert } from "@/src/ui";
import type {
  Address,
  ContractReadRequest,
  ContractWriteRequest,
  FlapI18n,
  FlapNotify,
  FlapWallet,
  FlapVaultSdk,
  HostRuntimeResult,
  OracleReader,
  SimulateResult,
  TxReceipt,
  VaultManifest,
  VaultRuntimeContext,
  VaultRuntimeContextOverrides,
} from "./types";
import { chainLabelForChain, createVaultRuntimeContext } from "./runtimeContext";
import { fetchOracleJson } from "./oracle";

const RuntimeContext = createContext<FlapVaultSdk | null>(null);
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

export function VaultRuntimeProvider({ children, manifest, i18n, runtimeContext: runtimeOverrides, hostRuntimeResult, locale = "en", oracleReader }: RuntimeProviderProps) {
  const [version, setVersion] = useState(0);
  const [messages, setMessages] = useState<ToastItem[]>([]);
  const toastTimersRef = useRef<Map<number, number>>(new Map());
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

  const notify = useMemo<FlapNotify>(() => {
    const push = (level: ToastLevel, message: string) => {
      const id = Date.now() + Math.floor(Math.random() * 1000);
      setMessages((items) => [{ id, level, message }, ...items].slice(0, 4));
      const timerId = window.setTimeout(() => {
        dismissMessage(id);
      }, 4200);
      toastTimersRef.current.set(id, timerId);
    };
    return {
      info: (message) => push("info", message),
      success: (message) => push("success", message),
      warning: (message) => push("warning", message),
      error: (message) => push("error", message),
    };
  }, [dismissMessage]);

  const wallet = useMemo<FlapWallet>(
    () => ({
      address: accountAddress,
      chainId: isConnected ? connectedChainId : undefined,
      chainLabel: isConnected ? chainLabelForChain(connectedChainId) : undefined,
      requiredChainId: runtimeContext.chainId,
      requiredChainLabel: chainLabelForChain(runtimeContext.chainId),
      isConnected,
      isWrongNetwork: Boolean(isConnected && connectedChainId !== runtimeContext.chainId),
      canSwitchChain: Boolean(switchChainAsync),
      isSwitchingChain,
      // Real native-token balance from the connected wallet. "0" until a wallet is connected.
      balance: nativeBalance ? formatUnits(nativeBalance.value, nativeBalance.decimals) : "0",
      // Wallet connection is host/shell-owned. In this preview the SDK forwards to the
      // injected wagmi connector so the surface is functional rather than a no-op stub.
      connect: () => {
        const connector = connectors[0];
        if (connector) connect({ connector });
      },
      disconnect: () => disconnect(),
      switchChain: async () => {
        if (!switchChainAsync) {
          throw new Error(`Switch wallet to ${chainLabelForChain(runtimeContext.chainId)} before continuing.`);
        }
        await switchChainAsync({ chainId: runtimeContext.chainId });
      },
    }),
    [accountAddress, connect, connectedChainId, connectors, disconnect, isConnected, isSwitchingChain, nativeBalance, runtimeContext.chainId, switchChainAsync],
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
      return (await publicClient.readContract({
        address: request.address,
        abi: request.abi,
        functionName: request.functionName,
        args: request.args,
      })) as T;
    },
    [publicClient],
  );

  const simulateContract = useCallback(
    async (request: ContractWriteRequest): Promise<SimulateResult> => {
      assertWalletWriteReady(`simulating ${request.functionName}`);
      if (!publicClient || !request.abi || !request.address) {
        throw new Error(`Contract simulation ${request.functionName} requires a public client, ABI, and address.`);
      }
      const simulation = await publicClient.simulateContract({
        account: accountAddress,
        address: request.address,
        abi: request.abi,
        functionName: request.functionName,
        args: request.args,
        value: request.value,
      });
      return { request, result: simulation.result };
    },
    [accountAddress, assertWalletWriteReady, publicClient],
  );

  const writeContract = useCallback(
    async (request: ContractWriteRequest): Promise<Address> => {
      assertWalletWriteReady(`writing ${request.functionName}`);
      if (!walletClient || !request.abi || !request.address) {
        throw new Error(`Contract write ${request.functionName} requires a wallet client, ABI, and address.`);
      }
      const hash = await walletClient.writeContract({
        address: request.address,
        abi: request.abi,
        functionName: request.functionName,
        args: request.args,
        value: request.value,
      });
      return hash as Address;
    },
    [assertWalletWriteReady, walletClient],
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
      readContract,
      simulateContract,
      writeContract,
      waitForTx,
      readOracle,
      refetch,
      refetchNonce: version,
      openExplorerTx,
    }),
    [i18nApi, notify, openExplorerTx, readContract, readOracle, refetch, runtimeContext, simulateContract, version, waitForTx, wallet, writeContract],
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

export function useFlapSdk() {
  const sdk = useContext(RuntimeContext);
  if (!sdk) throw new Error("useFlapSdk must be used within VaultRuntimeProvider.");
  return sdk;
}

export function useVaultContext() {
  return useFlapSdk().context;
}

export function useFlapI18n() {
  return useFlapSdk().i18n;
}

export function useFlapNotify() {
  return useFlapSdk().notify;
}
