import type { PublicClient } from "viem";
import { erc20Abi } from "./erc20";
import { getTaxVaultHostChainConfig } from "./hostRuntimeConfig";
import { createTaxInfoHostContext, isValidAddress, parsePortalTokenInfo, parseTaxTokenInfo, parseVaultPortalInfo, ZERO_ADDRESS } from "./taxInfo";
import type { Address, FlapTokenInfo, PaymentToken, TokenMetadataSnapshot, TokenRuntimeSnapshot } from "./types";

const portalAbi = [
  {
    name: "getTokenV7",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "", type: "address" }],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "status", type: "uint8" },
          { name: "reserve", type: "uint256" },
          { name: "circulatingSupply", type: "uint256" },
          { name: "price", type: "uint256" },
          { name: "tokenVersion", type: "uint8" },
          { name: "r", type: "uint256" },
          { name: "h", type: "uint256" },
          { name: "k", type: "uint256" },
          { name: "dexSupplyThresh", type: "uint256" },
          { name: "quoteTokenAddress", type: "address" },
          { name: "nativeToQuoteSwapEnabled", type: "bool" },
          { name: "extensionID", type: "bytes32" },
          { name: "taxRate", type: "uint256" },
          { name: "pool", type: "address" },
          { name: "progress", type: "uint256" },
          { name: "lpFeeProfile", type: "uint8" },
          { name: "dexId", type: "uint8" },
        ],
      },
    ],
  },
] as const;

const taxTokenHelperAbi = [
  {
    name: "getTaxTokenInfo",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "taxToken", type: "address" }],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "marketBps", type: "uint16" },
          { name: "deflationBps", type: "uint16" },
          { name: "lpBps", type: "uint16" },
          { name: "dividendBps", type: "uint16" },
          { name: "feeRate", type: "uint16" },
          { name: "burntTokenAmount", type: "uint256" },
          { name: "totalQuoteSentToDividend", type: "uint256" },
          { name: "totalQuoteAddedToLiquidity", type: "uint256" },
          { name: "totalTokenAddedToLiquidity", type: "uint256" },
          { name: "totalQuoteSentToMarketing", type: "uint256" },
          { name: "marketingWallet", type: "address" },
          { name: "quoteToken", type: "address" },
          { name: "minimumShareBalance", type: "uint256" },
        ],
      },
    ],
  },
  {
    name: "getTaxTokenInfoV2",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "taxToken", type: "address" }],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "marketBps", type: "uint16" },
          { name: "deflationBps", type: "uint16" },
          { name: "lpBps", type: "uint16" },
          { name: "dividendBps", type: "uint16" },
          { name: "buyTaxRate", type: "uint16" },
          { name: "sellTaxRate", type: "uint16" },
          { name: "burntTokenAmount", type: "uint256" },
          { name: "totalQuoteSentToDividend", type: "uint256" },
          { name: "totalQuoteAddedToLiquidity", type: "uint256" },
          { name: "totalTokenAddedToLiquidity", type: "uint256" },
          { name: "totalQuoteSentToMarketing", type: "uint256" },
          { name: "dividendToken", type: "address" },
          { name: "quoteToken", type: "address" },
          { name: "minimumShareBalance", type: "uint256" },
          {
            name: "vaultInfo",
            type: "tuple",
            components: [
              { name: "addr", type: "address" },
              { name: "factory", type: "address" },
              { name: "riskLevel", type: "uint8" },
              { name: "isOfficialVault", type: "bool" },
              { name: "isVault", type: "bool" },
              { name: "isAIConsumer", type: "bool" },
            ],
          },
        ],
      },
    ],
  },
] as const;

const vaultPortalAbi = [
  {
    name: "tryGetVault",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "taxToken", type: "address" }],
    outputs: [
      { name: "found", type: "bool" },
      {
        name: "info",
        type: "tuple",
        components: [
          { name: "vault", type: "address" },
          { name: "vaultFactory", type: "address" },
          { name: "description", type: "string" },
          { name: "isOfficial", type: "bool" },
          { name: "riskLevel", type: "uint8" },
        ],
      },
    ],
  },
] as const;

async function readErc20Symbol(publicClient: PublicClient, address: Address) {
  try {
    const symbol = await publicClient.readContract({
      address,
      abi: erc20Abi,
      functionName: "symbol",
    });
    return typeof symbol === "string" && symbol.trim() ? symbol.trim() : undefined;
  } catch {
    return undefined;
  }
}

async function readErc20Name(publicClient: PublicClient, address: Address) {
  try {
    const name = await publicClient.readContract({
      address,
      abi: erc20Abi,
      functionName: "name",
    });
    return typeof name === "string" && name.trim() ? name.trim() : undefined;
  } catch {
    return undefined;
  }
}

async function readErc20Decimals(publicClient: PublicClient, address: Address) {
  try {
    const decimals = await publicClient.readContract({
      address,
      abi: erc20Abi,
      functionName: "decimals",
    });
    return typeof decimals === "number" ? decimals : 18;
  } catch {
    return 18;
  }
}

async function resolvePaymentToken(publicClient: PublicClient, tokenInfo: FlapTokenInfo): Promise<PaymentToken | undefined> {
  const quoteTokenAddress = tokenInfo.quoteTokenAddress;
  if (!quoteTokenAddress) return undefined;

  if (quoteTokenAddress === ZERO_ADDRESS) {
    const nativeCurrency = publicClient.chain?.nativeCurrency;
    return {
      address: ZERO_ADDRESS,
      symbol: nativeCurrency?.symbol ?? "NATIVE",
      decimals: nativeCurrency?.decimals ?? 18,
      isNative: true,
    };
  }

  if (!isValidAddress(quoteTokenAddress)) return undefined;

  const [symbol, decimals] = await Promise.all([readErc20Symbol(publicClient, quoteTokenAddress), readErc20Decimals(publicClient, quoteTokenAddress)]);

  return {
    address: quoteTokenAddress,
    symbol: symbol ?? "TOKEN",
    decimals,
    isNative: false,
  };
}

export async function readErc20TokenMetadata(publicClient: PublicClient, tokenAddress?: Address | null): Promise<TokenMetadataSnapshot | null> {
  if (!tokenAddress || !isValidAddress(tokenAddress) || tokenAddress === ZERO_ADDRESS) return null;

  const [tokenSymbol, tokenName] = await Promise.all([readErc20Symbol(publicClient, tokenAddress), readErc20Name(publicClient, tokenAddress)]);
  if (!tokenSymbol && !tokenName) return null;

  return {
    tokenSymbol,
    tokenName,
  };
}

export async function loadTokenRuntimeSnapshot(
  publicClient: PublicClient,
  chainId: number,
  tokenAddress?: Address | null,
): Promise<TokenRuntimeSnapshot | null> {
  if (!tokenAddress || !isValidAddress(tokenAddress) || tokenAddress === ZERO_ADDRESS) return null;

  const metadata = await readErc20TokenMetadata(publicClient, tokenAddress);
  const chainConfig = getTaxVaultHostChainConfig(chainId);
  const baseSnapshot = {
    tokenSymbol: metadata?.tokenSymbol,
    tokenName: metadata?.tokenName,
    copyScope: "tax" as const,
  };

  if (!chainConfig) {
    return {
      ...baseSnapshot,
      hasTaxVaults: false,
      hostReadSupported: false,
      hostReadFromChain: false,
    };
  }

  let tokenData: unknown;
  try {
    tokenData = await publicClient.readContract({
      address: chainConfig.portal,
      abi: portalAbi,
      functionName: "getTokenV7",
      args: [tokenAddress],
    });
  } catch {
    return {
      ...baseSnapshot,
      hasTaxVaults: Boolean(chainConfig.vaultPortal),
      hostReadSupported: true,
      hostReadFromChain: false,
      giftVaultFactory: chainConfig.giftVaultFactory,
    };
  }

  const tokenInfo = parsePortalTokenInfo(tokenData as Record<string, unknown>);
  const hasTaxVaults = Boolean(chainConfig.vaultPortal);
  if (!tokenInfo) {
    return {
      ...baseSnapshot,
      hasTaxVaults,
      hostReadSupported: true,
      hostReadFromChain: false,
      giftVaultFactory: chainConfig.giftVaultFactory,
    };
  }

  const paymentToken = tokenInfo.exists ? await resolvePaymentToken(publicClient, tokenInfo) : undefined;
  if (!tokenInfo.exists) {
    const host = createTaxInfoHostContext({
      tokenInfo,
      giftVaultFactory: chainConfig.giftVaultFactory,
      hasTaxVaults,
      copyScope: "tax",
    });
    return {
      ...baseSnapshot,
      tokenInfo,
      host,
      giftVaultFactory: chainConfig.giftVaultFactory,
      paymentToken,
      hasTaxVaults,
      hostReadSupported: true,
      hostReadFromChain: true,
    };
  }

  const taxInfoPromise =
    tokenInfo.isTaxToken && chainConfig.taxTokenHelperAddress
      ? Promise.allSettled([
          publicClient.readContract({
            address: chainConfig.taxTokenHelperAddress,
            abi: taxTokenHelperAbi,
            functionName: "getTaxTokenInfo",
            args: [tokenAddress],
          }),
          publicClient.readContract({
            address: chainConfig.taxTokenHelperAddress,
            abi: taxTokenHelperAbi,
            functionName: "getTaxTokenInfoV2",
            args: [tokenAddress],
          }),
        ])
      : Promise.resolve(null);

  const vaultInfoPromise = chainConfig.vaultPortal
    ? publicClient
        .readContract({
          address: chainConfig.vaultPortal,
          abi: vaultPortalAbi,
          functionName: "tryGetVault",
          args: [tokenAddress],
        })
        .catch(() => undefined)
    : Promise.resolve(undefined);

  const [taxResults, vaultData] = await Promise.all([taxInfoPromise, vaultInfoPromise]);
  const baseTaxInfo = Array.isArray(taxResults) && taxResults[0]?.status === "fulfilled" ? taxResults[0].value : undefined;
  const taxInfoV2 = Array.isArray(taxResults) && taxResults[1]?.status === "fulfilled" ? taxResults[1].value : undefined;
  const taxInfo = baseTaxInfo
    ? parseTaxTokenInfo(baseTaxInfo, taxInfoV2, { wrappedNativeTokenAddress: chainConfig.wrappedNativeTokenAddress })
    : undefined;
  const vaultInfo = vaultData ? parseVaultPortalInfo(vaultData) : undefined;
  const host = createTaxInfoHostContext({
    tokenInfo,
    taxInfo,
    vaultInfo,
    giftVaultFactory: chainConfig.giftVaultFactory,
    hasTaxVaults,
    copyScope: "tax",
  });

  return {
    ...baseSnapshot,
    tokenInfo,
    taxInfo,
    vaultInfo,
    host,
    giftVaultFactory: chainConfig.giftVaultFactory,
    paymentToken,
    hasTaxVaults,
    hostReadSupported: true,
    hostReadFromChain: true,
  };
}
