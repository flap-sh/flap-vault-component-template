import { resolveManifestBinding } from "./taxInfo";
import type { Address, CreateVaultRuntimeContextInput, VaultRuntimeContext, VaultRuntimeExtraConfig } from "./types";

const zeroAddress = "0x0000000000000000000000000000000000000000" as Address;

export function explorerForChain(chainId: number) {
  if (chainId === 56) return "https://bscscan.com";
  if (chainId === 97) return "https://testnet.bscscan.com";
  if (chainId === 4663) return "https://robinhoodchain.blockscout.com";
  return undefined;
}

export function chainLabelForChain(chainId: number) {
  if (chainId === 56) return "BNB Chain";
  if (chainId === 97) return "BNB Testnet";
  if (chainId === 4663) return "Robinhood Chain";
  return `Chain ${chainId}`;
}

function buildRuntimeExtraConfig(input: CreateVaultRuntimeContextInput): VaultRuntimeExtraConfig {
  const hostRuntimeResult = input.hostRuntimeResult;
  const runtimeOverrides = input.runtimeOverrides;

  return {
    ...(hostRuntimeResult
      ? {
          hostRuntimeStatus: hostRuntimeResult.status,
          hostRuntimePolicy: hostRuntimeResult.policy,
          hostRuntimeDegradeReason: hostRuntimeResult.degradeReason,
          hostRuntimeWarnings: hostRuntimeResult.warnings,
        }
      : {}),
    ...(hostRuntimeResult?.presentation?.extraConfig ?? {}),
    ...(runtimeOverrides?.extraConfig ?? {}),
  };
}

export function createVaultRuntimeContext(input: CreateVaultRuntimeContextInput): VaultRuntimeContext {
  const runtimeOverrides = input.runtimeOverrides;
  const resolvedBinding = resolveManifestBinding(input.manifest, {
    chainId: runtimeOverrides?.chainId ?? input.connectedChainId ?? input.hostRuntimeResult?.addresses.chainId,
    factoryAddress: runtimeOverrides?.factoryAddress ?? input.hostRuntimeResult?.addresses.factoryAddress,
    vaultAddress: runtimeOverrides?.vaultAddress ?? input.hostRuntimeResult?.addresses.vaultAddress,
    tokenAddress: runtimeOverrides?.tokenAddress ?? input.hostRuntimeResult?.addresses.tokenAddress,
  });
  const effectiveChainId =
    runtimeOverrides?.chainId ?? input.hostRuntimeResult?.addresses.chainId ?? input.connectedChainId ?? resolvedBinding?.chainId ?? input.manifest.match.bindings[0]?.chainId ?? 56;

  return {
    chainId: effectiveChainId,
    factoryAddress: runtimeOverrides?.factoryAddress ?? input.hostRuntimeResult?.addresses.factoryAddress ?? resolvedBinding?.factoryAddress ?? zeroAddress,
    tokenAddress: runtimeOverrides?.tokenAddress ?? input.hostRuntimeResult?.addresses.tokenAddress ?? zeroAddress,
    vaultAddress: runtimeOverrides?.vaultAddress ?? input.hostRuntimeResult?.addresses.vaultAddress ?? zeroAddress,
    userAddress: runtimeOverrides?.userAddress,
    tokenSymbol: runtimeOverrides?.tokenSymbol ?? input.hostRuntimeResult?.tokenSymbol,
    tokenName: runtimeOverrides?.tokenName ?? input.hostRuntimeResult?.tokenName,
    tokenImageUrl: runtimeOverrides?.tokenImageUrl ?? input.hostRuntimeResult?.tokenImageUrl,
    explorerBaseUrl: runtimeOverrides?.explorerBaseUrl ?? explorerForChain(effectiveChainId),
    paymentToken: runtimeOverrides?.paymentToken ?? input.hostRuntimeResult?.paymentToken,
    host: runtimeOverrides?.host ?? input.hostRuntimeResult?.host,
    extraConfig: buildRuntimeExtraConfig(input),
    manifest: input.manifest,
  };
}
