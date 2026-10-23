"use client";
import { useMemo, useRef } from "react";
import { useAccount, useConfig } from "wagmi";
import { getAccount, getPublicClient, getWalletClient, switchChain, disconnect } from "wagmi/actions";
import { decodeFunctionResult, encodeFunctionData } from "viem";
import type { Address, ContractReadRequest, MediaUploader } from "./types";
import type { FlapWalletRuntime } from "./flapChainRuntime";
import { createLocalMediaUploader } from "./mediaUpload";

const defaultUploader = createLocalMediaUploader();
/** Host-only bridge. Always uses the enclosing WagmiProvider's connector/config. */
export function useFlapWalletRuntime({ connect, readOnly = false, mediaUploader = defaultUploader }: {
  connect(): void; readOnly?: boolean; mediaUploader?: MediaUploader;
}): FlapWalletRuntime {
  const config = useConfig();
  const account = useAccount();
  const connectRef = useRef(connect); connectRef.current = connect;
  return useMemo(() => {
    const publicClient = (chainId: number) => { const client = getPublicClient(config, { chainId }); if (!client) throw new Error(`No host public client for ${chainId}.`); return client; };
    const walletClient = async (chainId: number, expected: Address) => {
      if (readOnly) throw new Error("Preview fixtures cannot authorize transactions.");
      const client = await getWalletClient(config, { chainId });
      const current = getAccount(config);
      if (!current.isConnected || current.chainId !== chainId || current.address?.toLowerCase() !== expected.toLowerCase() || client.account.address.toLowerCase() !== expected.toLowerCase() || client.chain.id !== chainId) throw new Error("The host wallet changed. Review the account and network again.");
      return client;
    };
    return {
      chains: config.chains.map((chain) => ({ id: chain.id, name: chain.name, explorerBaseUrl: chain.blockExplorers?.default.url })), readOnly,
      getAccount: () => { const current = getAccount(config); return { address: current.address, chainId: current.chainId, isConnected: current.isConnected }; },
      generation: `${account.address ?? ""}:${account.chainId ?? ""}:${account.isConnected}`,
      connect: () => connectRef.current(), disconnect: () => { void disconnect(config); },
      switchChain: async (chainId) => { if (readOnly) throw new Error("Preview fixtures cannot switch a wallet."); await switchChain(config, { chainId }); },
      readContract: async (chainId, request: ContractReadRequest) => {
        const client = publicClient(chainId);
        if (request.gasPrice !== undefined) {
          const { data } = await client.call({ to: request.address, data: encodeFunctionData(request as never), account: request.account, gasPrice: request.gasPrice });
          return decodeFunctionResult({ abi: request.abi!, functionName: request.functionName, data: data ?? "0x" });
        }
        return client.readContract(request as never);
      },
      simulateContract: async (chainId, request) => (await publicClient(chainId).simulateContract(request as never)).result,
      writeContract: async (chainId, request) => (await walletClient(chainId, request.account)).writeContract(request as never),
      sendTransaction: async (chainId, request) => (await walletClient(chainId, request.account)).sendTransaction(request as never),
      waitForTx: async (chainId, hash) => { const receipt = await publicClient(chainId).waitForTransactionReceipt({ hash }); return { hash: receipt.transactionHash, status: receipt.status, blockNumber: receipt.blockNumber, logs: receipt.logs }; },
      getCode: (chainId, address) => publicClient(chainId).getCode({ address }),
      getGasPrice: (chainId) => publicClient(chainId).getGasPrice(), getBlockNumber: (chainId) => publicClient(chainId).getBlockNumber(),
      getBalance: (chainId, address) => publicClient(chainId).getBalance({ address }),
      getContractEvents: async (chainId, request) => publicClient(chainId).getContractEvents(request as never),
      upload: mediaUploader,
      openUrl: (url) => { window.open(url, "_blank", "noopener,noreferrer"); },
    };
  }, [config, readOnly, mediaUploader, account.address, account.chainId, account.isConnected]);
}
