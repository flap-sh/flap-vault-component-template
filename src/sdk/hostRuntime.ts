import { loadTokenRuntimeSnapshot } from "./hostRead";
import { isValidAddress, readTaxVaultHostContext, ZERO_ADDRESS } from "./taxInfo";
import type {
  Address,
  HostRuntimeAddresses,
  HostRuntimeDataSource,
  HostRuntimeDegradeReason,
  HostRuntimeInput,
  HostRuntimeResult,
  HostRuntimeSources,
  HostRuntimeStatus,
  HostRuntimeWarning,
  TokenRuntimeSnapshot,
} from "./types";

function isResolvedAddress(address?: Address | null): address is Address {
  return Boolean(address && isValidAddress(address) && address !== ZERO_ADDRESS);
}

function pickAddress(...candidates: Array<Address | null | undefined>) {
  for (const candidate of candidates) {
    if (isResolvedAddress(candidate)) return candidate;
  }
  return undefined;
}

function resolveAddresses(input: Pick<HostRuntimeInput, "chainId" | "tokenAddress" | "factoryAddressHint" | "vaultAddressHint">, snapshot?: TokenRuntimeSnapshot | null): HostRuntimeAddresses {
  return {
    chainId: input.chainId,
    tokenAddress: input.tokenAddress,
    factoryAddressHint: input.factoryAddressHint,
    vaultAddressHint: input.vaultAddressHint,
    factoryAddress: pickAddress(input.factoryAddressHint, snapshot?.vaultInfo?.vaultFactory, snapshot?.taxInfo?.vaultInfo?.factory ?? undefined),
    vaultAddress: pickAddress(input.vaultAddressHint, snapshot?.vaultInfo?.vault, snapshot?.taxInfo?.vaultInfo?.addr ?? undefined),
  };
}

function hasPresentationMetadata(result: HostRuntimeResult) {
  return Boolean(result.presentation?.tokenName || result.presentation?.tokenSymbol || result.presentation?.tokenImageUrl);
}

function resolveTokenMetadataSource(snapshot: TokenRuntimeSnapshot | null, presentationDataAvailable: boolean): HostRuntimeDataSource {
  if (presentationDataAvailable) return "host-proxy";
  if (snapshot?.tokenName || snapshot?.tokenSymbol) return "onchain";
  return "unavailable";
}

function resolveSources(snapshot: TokenRuntimeSnapshot | null, presentationDataAvailable: boolean): HostRuntimeSources {
  return {
    tokenMetadata: resolveTokenMetadataSource(snapshot, presentationDataAvailable),
    taxState: snapshot?.taxInfo ? "onchain" : "unavailable",
    vaultState: snapshot?.vaultInfo?.found || snapshot?.taxInfo?.vaultInfo?.isVault ? "onchain" : "unavailable",
    presentation: presentationDataAvailable ? "host-proxy" : "unavailable",
  };
}

function collectWarnings(snapshot: TokenRuntimeSnapshot | null, addresses: HostRuntimeAddresses): HostRuntimeWarning[] {
  const warnings: HostRuntimeWarning[] = [];

  if (!snapshot?.taxInfo) warnings.push("tax-info-unavailable");
  if (snapshot?.tokenInfo?.quoteTokenAddress && !snapshot.paymentToken) warnings.push("payment-token-unavailable");
  if (!addresses.vaultAddress) warnings.push("vault-address-unavailable");
  if (!addresses.factoryAddress) warnings.push("factory-address-unavailable");

  return warnings;
}

function resolveChainFailure(snapshot: TokenRuntimeSnapshot | null): HostRuntimeDegradeReason | null {
  if (!snapshot) return "chain-read-unavailable";
  if (!snapshot.hostReadSupported) return "unsupported-chain";
  if (!snapshot.hostReadFromChain || !snapshot.tokenInfo) return "chain-read-unavailable";
  if (!snapshot.tokenInfo.exists) return "token-not-found";
  if (!snapshot.tokenInfo.isTaxToken) return "token-not-tax";
  return null;
}

function createResult(params: {
  status: HostRuntimeStatus;
  input: Pick<HostRuntimeInput, "chainId" | "tokenAddress" | "factoryAddressHint" | "vaultAddressHint">;
  snapshot: TokenRuntimeSnapshot | null;
  degradeReason?: HostRuntimeDegradeReason;
  presentation?: HostRuntimeResult["presentation"];
  policy: HostRuntimeResult["policy"];
}): HostRuntimeResult {
  const addresses = resolveAddresses(params.input, params.snapshot);
  const basePresentation = params.presentation ?? null;
  const baseResult: HostRuntimeResult = {
    status: params.status,
    policy: params.policy,
    degradeReason: params.degradeReason,
    warnings: collectWarnings(params.snapshot, addresses),
    addresses,
    snapshot: params.snapshot,
    host: params.snapshot?.host ?? undefined,
    paymentToken: params.snapshot?.paymentToken,
    tokenSymbol: basePresentation?.tokenSymbol ?? params.snapshot?.tokenSymbol,
    tokenName: basePresentation?.tokenName ?? params.snapshot?.tokenName,
    tokenImageUrl: basePresentation?.tokenImageUrl,
    tokenDetailHref: basePresentation?.tokenDetailHref,
    chainHref: basePresentation?.chainHref,
    presentation: basePresentation,
    sources: {
      tokenMetadata: "unavailable",
      taxState: "unavailable",
      vaultState: "unavailable",
      presentation: "unavailable",
    },
  };

  baseResult.sources = resolveSources(params.snapshot, hasPresentationMetadata(baseResult));
  return baseResult;
}

export function resolveHostRuntimeAddresses(input: Pick<HostRuntimeInput, "chainId" | "tokenAddress" | "factoryAddressHint" | "vaultAddressHint">, snapshot?: TokenRuntimeSnapshot | null) {
  return resolveAddresses(input, snapshot);
}

export async function runHostRuntime(input: HostRuntimeInput): Promise<HostRuntimeResult> {
  const policy = input.policy ?? "prefer-full-host";

  if (!isResolvedAddress(input.tokenAddress)) {
    return createResult({
      status: "unavailable",
      input,
      snapshot: null,
      degradeReason: "invalid-token-address",
      policy,
    });
  }

  const snapshot = await loadTokenRuntimeSnapshot(input.publicClient, input.chainId, input.tokenAddress);
  const chainFailure = resolveChainFailure(snapshot);
  if (chainFailure) {
    return createResult({
      status: "unavailable",
      input,
      snapshot,
      degradeReason: chainFailure,
      policy,
    });
  }

  let presentation: HostRuntimeResult["presentation"] = null;
  let presentationFailure: HostRuntimeDegradeReason | undefined;

  if (input.presentationFetcher) {
    try {
      presentation = await input.presentationFetcher({
        chainId: input.chainId,
        tokenAddress: input.tokenAddress,
        factoryAddress: resolveAddresses(input, snapshot).factoryAddress,
        vaultAddress: resolveAddresses(input, snapshot).vaultAddress,
        snapshot: snapshot!,
      });
      if (!presentation) {
        presentationFailure = "host-presentation-unavailable";
      }
    } catch {
      presentationFailure = "host-presentation-unavailable";
    }
  } else {
    presentationFailure = "host-presentation-not-configured";
  }

  if (presentation) {
    return createResult({
      status: "full-host",
      input,
      snapshot,
      presentation,
      policy,
    });
  }

  if (policy === "require-full-host") {
    return createResult({
      status: "unavailable",
      input,
      snapshot,
      degradeReason: presentationFailure === "host-presentation-not-configured" ? "host-presentation-required" : "host-presentation-unavailable",
      policy,
    });
  }

  const result = createResult({
    status: "onchain",
    input,
    snapshot,
    degradeReason: presentationFailure,
    policy,
  });

  const hostSnapshot = readTaxVaultHostContext(result.host);
  if (!hostSnapshot.isSupportedCustomVaultToken) {
    return {
      ...result,
      status: "unavailable",
      degradeReason: "token-not-tax",
    };
  }

  return result;
}
