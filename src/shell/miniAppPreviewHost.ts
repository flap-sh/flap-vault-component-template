import type { Address, TokenMarketPhase, VaultHostContext } from "../sdk/types";
import type { TokenRuntimeSnapshot } from "../sdk/types";
// The explicit extension keeps this pure helper directly executable by Node's
// type-stripping test runner; the project uses bundler module resolution.
// @ts-expect-error allowImportingTsExtensions is intentionally not global.
import { createTaxInfoHostContext, parsePortalTokenInfo, ZERO_ADDRESS } from "../sdk/taxInfo.ts";

export interface MiniAppPreviewHostInput {
  runtimeSnapshot?: TokenRuntimeSnapshot | null;
  tokenAddress?: Address;
  tokenStatus?: number;
  marketPhase?: TokenMarketPhase;
  listed?: boolean;
  tokenVersion?: number;
  taxRate?: number;
  quoteTokenAddress?: Address;
}

function tokenStatusFromMarketPhase(marketPhase?: TokenMarketPhase) {
  if (marketPhase === "internal-market") return 1;
  if (marketPhase === "dex-listed") return 2;
  if (marketPhase === "unknown") return 0;
  return undefined;
}

function is7777TaxTokenAddress(tokenAddress?: Address) {
  return tokenAddress?.toLowerCase().endsWith("7777") === true;
}

/**
 * Builds the deterministic Mini App preview host state without erasing live
 * 7777 tax-token data. 8888 Mini Apps keep their existing zero-tax surface.
 */
export function buildMiniAppPreviewHostContext(input: MiniAppPreviewHostInput): VaultHostContext {
  const { runtimeSnapshot } = input;
  const baseTokenInfo = runtimeSnapshot?.tokenInfo ?? undefined;
  const marketPhaseStatus = tokenStatusFromMarketPhase(input.marketPhase);
  const listedStatus = input.listed === undefined ? undefined : input.listed ? 2 : 1;
  const resolvedStatus = input.tokenStatus ?? marketPhaseStatus ?? listedStatus ?? baseTokenInfo?.status ?? 1;
  const isTaxTokenMiniApp = baseTokenInfo?.isTaxToken === true || is7777TaxTokenAddress(input.tokenAddress);
  const taxRateRaw = isTaxTokenMiniApp
    ? BigInt(Math.max(0, Math.trunc(input.taxRate ?? baseTokenInfo?.taxRate ?? 0)))
    : 0n;
  const defaultTokenVersion = isTaxTokenMiniApp ? 6 : 7;
  const parsedTokenInfo =
    parsePortalTokenInfo({
      status: resolvedStatus,
      tokenVersion: input.tokenVersion ?? baseTokenInfo?.tokenVersion ?? defaultTokenVersion,
      taxRate: taxRateRaw,
      quoteTokenAddress: input.quoteTokenAddress ?? baseTokenInfo?.quoteTokenAddress ?? ZERO_ADDRESS,
    }) ?? baseTokenInfo ?? undefined;
  const tokenInfo = parsedTokenInfo
    ? {
        ...parsedTokenInfo,
        exists: true,
        isTaxToken: isTaxTokenMiniApp,
        taxRate: Number(taxRateRaw),
        taxRateRaw,
        quoteTokenAddress: parsedTokenInfo.quoteTokenAddress ?? input.quoteTokenAddress ?? ZERO_ADDRESS,
      }
    : undefined;
  const taxInfo = isTaxTokenMiniApp ? runtimeSnapshot?.taxInfo ?? null : null;
  const vaultInfo = isTaxTokenMiniApp ? runtimeSnapshot?.vaultInfo ?? null : null;
  const copyScope = isTaxTokenMiniApp ? "tax" : "fee";

  return createTaxInfoHostContext({
    tokenInfo,
    taxInfo,
    vaultInfo,
    feeMode: isTaxTokenMiniApp ? runtimeSnapshot?.host?.feeMode : "unknown",
    giftVaultFactory: runtimeSnapshot?.giftVaultFactory,
    hasTaxVaults: isTaxTokenMiniApp ? runtimeSnapshot?.hasTaxVaults : false,
    copyScope,
  });
}
