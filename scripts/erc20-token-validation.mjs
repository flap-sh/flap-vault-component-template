import { createPublicClient, erc20Abi, http } from "viem";
import { bsc, bscTestnet } from "viem/chains";

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
export const REQUIRED_TEST_TOKEN_SUFFIXES = ["7777", "8888"];
export const REQUIRED_TEST_TOKEN_SUFFIX = REQUIRED_TEST_TOKEN_SUFFIXES.join(" or ");
const DEFAULT_RPC_URLS = {
  56: ["https://bsc-dataseed.binance.org", "https://bsc-rpc.publicnode.com"],
  97: ["https://data-seed-prebsc-1-s1.binance.org:8545", "https://bsc-testnet-rpc.publicnode.com"],
  4663: ["https://rpc.mainnet.chain.robinhood.com"],
};
const CHAIN_BY_ID = {
  56: bsc,
  97: bscTestnet,
};
const TOKEN_VALIDATION_FIX_HINT =
  "Replace the token address with a real deployed ERC20 contract on the declared chain, rerun yarn vault:check <folder-name>, then regenerate E2E/package proof.";
const TOKEN_SUFFIX_FIX_HINT =
  `Replace the test token with a real deployed ERC20 token address ending in ${REQUIRED_TEST_TOKEN_SUFFIX}, rerun yarn vault:check <folder-name>, then regenerate E2E/package proof.`;

function envValue(name) {
  const value = process.env[name];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function normalizeTokenAddress(value) {
  return typeof value === "string" && ADDRESS_RE.test(value) ? value : undefined;
}

export function hasRequiredTestTokenSuffix(value) {
  const address = normalizeTokenAddress(value)?.toLowerCase();
  return Boolean(address && REQUIRED_TEST_TOKEN_SUFFIXES.some((suffix) => address.endsWith(suffix)));
}

function chainRpcCandidates(chainId) {
  return [
    envValue(`VAULT_CHECK_RPC_${chainId}`),
    envValue(`WORKBENCH_RPC_${chainId}`),
    envValue(`CHAIN_${chainId}_RPC_URL`),
    chainId === 56 ? envValue("BSC_RPC_URL") ?? envValue("BNB_RPC_URL") : undefined,
    chainId === 97 ? envValue("BSC_TESTNET_RPC_URL") ?? envValue("BNB_TESTNET_RPC_URL") : undefined,
    ...(DEFAULT_RPC_URLS[chainId] ?? []),
  ].filter(Boolean);
}

function customChain(chainId, rpcUrl) {
  return {
    id: chainId,
    name: `Chain ${chainId}`,
    nativeCurrency: { name: "Native", symbol: "NATIVE", decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] }, public: { http: [rpcUrl] } },
  };
}

function createTokenClient(chainId, rpcUrl) {
  return createPublicClient({
    chain: CHAIN_BY_ID[chainId] ?? customChain(chainId, rpcUrl),
    transport: http(rpcUrl, { timeout: 8000, retryCount: 0 }),
  });
}

function describeError(error) {
  if (error && typeof error === "object" && "shortMessage" in error && typeof error.shortMessage === "string") {
    return error.shortMessage;
  }
  return error instanceof Error ? error.message : String(error);
}

function bytecodeBytes(bytecode) {
  return typeof bytecode === "string" && bytecode.startsWith("0x") ? Math.max(0, (bytecode.length - 2) / 2) : 0;
}

async function readRequiredErc20(client, address, functionName, args = []) {
  try {
    return await client.readContract({ address, abi: erc20Abi, functionName, args });
  } catch (error) {
    throw new Error(`${functionName}() failed: ${describeError(error)}`);
  }
}

export async function validateErc20TokenContract(chainId, tokenAddress) {
  const normalizedAddress = normalizeTokenAddress(tokenAddress);
  if (!Number.isSafeInteger(chainId) || chainId <= 0) {
    return { ok: false, chainId, tokenAddress, detail: `Invalid chainId ${chainId}.` };
  }
  if (!normalizedAddress) {
    return { ok: false, chainId, tokenAddress, detail: "Token address is not a valid 20-byte EVM address." };
  }

  const rpcUrls = chainRpcCandidates(chainId);
  if (!rpcUrls.length) {
    return {
      ok: false,
      chainId,
      tokenAddress: normalizedAddress,
      detail: `No RPC URL is configured for chainId ${chainId}. Set VAULT_CHECK_RPC_${chainId}.`,
    };
  }

  let lastError;
  for (const rpcUrl of rpcUrls) {
    try {
      const client = createTokenClient(chainId, rpcUrl);
      const bytecode = await client.getBytecode({ address: normalizedAddress });
      const byteLength = bytecodeBytes(bytecode);
      if (byteLength === 0) {
        throw new Error("contract bytecode is empty");
      }

      const decimals = await readRequiredErc20(client, normalizedAddress, "decimals");
      if (!Number.isInteger(decimals) || decimals < 0 || decimals > 255) {
        throw new Error(`decimals() returned invalid value ${String(decimals)}`);
      }

      const symbol = await readRequiredErc20(client, normalizedAddress, "symbol");
      if (typeof symbol !== "string" || !symbol.trim()) {
        throw new Error("symbol() did not return a non-empty string");
      }

      const totalSupply = await readRequiredErc20(client, normalizedAddress, "totalSupply");
      if (typeof totalSupply !== "bigint") {
        throw new Error("totalSupply() did not return a uint256 value");
      }

      await readRequiredErc20(client, normalizedAddress, "balanceOf", ["0x0000000000000000000000000000000000000000"]);

      return {
        ok: true,
        chainId,
        tokenAddress: normalizedAddress,
        rpcUrl,
        bytecodeBytes: byteLength,
        symbol,
        decimals,
        totalSupply: totalSupply.toString(),
      };
    } catch (error) {
      lastError = error;
    }
  }

  return {
    ok: false,
    chainId,
    tokenAddress: normalizedAddress,
    detail: describeError(lastError),
  };
}

function tokenContractIssue(ruleId, message, extra = {}) {
  return {
    severity: "blocking",
    ruleId,
    message,
    fixHint: TOKEN_VALIDATION_FIX_HINT,
    ...extra,
  };
}

export async function collectManifestErc20TokenIssues(manifest, { file = "manifest.json" } = {}) {
  const issues = [];
  const bindings = Array.isArray(manifest?.match?.bindings) ? manifest.match.bindings : [];
  const cache = new Map();
  for (const [bindingIndex, binding] of bindings.entries()) {
    if (!Number.isSafeInteger(binding?.chainId) || binding.chainId <= 0 || !Array.isArray(binding?.tokenAddresses)) continue;
    for (const [tokenIndex, tokenAddress] of binding.tokenAddresses.entries()) {
      const normalizedAddress = normalizeTokenAddress(tokenAddress);
      if (!normalizedAddress) continue;
      const field = `match.bindings[${bindingIndex}].tokenAddresses[${tokenIndex}]`;
      if (!hasRequiredTestTokenSuffix(normalizedAddress)) {
        issues.push(
          tokenContractIssue(
            "manifest-binding/invalid-test-token-suffix",
            `${field} must be a real test token address ending in ${REQUIRED_TEST_TOKEN_SUFFIX}: ${normalizedAddress}.`,
            {
              file,
              field,
              chainId: binding.chainId,
              tokenAddress: normalizedAddress,
              requiredSuffix: REQUIRED_TEST_TOKEN_SUFFIX,
              fixHint: TOKEN_SUFFIX_FIX_HINT,
            },
          ),
        );
        continue;
      }
      const cacheKey = `${binding.chainId}:${normalizedAddress.toLowerCase()}`;
      let result = cache.get(cacheKey);
      if (!result) {
        result = await validateErc20TokenContract(binding.chainId, normalizedAddress);
        cache.set(cacheKey, result);
      }
      if (!result.ok) {
        issues.push(
          tokenContractIssue(
            "manifest-binding/invalid-erc20-token",
            `${field} must be a real deployed ERC20 token on chainId ${binding.chainId}: ${normalizedAddress}. ${result.detail}`,
            {
              file,
              field,
              chainId: binding.chainId,
              tokenAddress: normalizedAddress,
              tokenContract: result,
            },
          ),
        );
      }
    }
  }
  return issues;
}

export async function collectE2EReportErc20TokenIssues(report, { file = "qa/e2e-report.json", folderName } = {}) {
  const chainId = report?.binding?.chainId;
  const tokenAddress = normalizeTokenAddress(report?.binding?.tokenAddress);
  if ((chainId !== 56 && chainId !== 97) || !tokenAddress) return [];
  if (!hasRequiredTestTokenSuffix(tokenAddress)) {
    return [
      tokenContractIssue(
        "e2e-report/invalid-test-token-suffix",
        `E2E report tokenAddress must be a real test token address ending in ${REQUIRED_TEST_TOKEN_SUFFIX}: ${tokenAddress}.`,
        {
          file,
          field: "binding.tokenAddress",
          folderName,
          chainId,
          tokenAddress,
          requiredSuffix: REQUIRED_TEST_TOKEN_SUFFIX,
          fixHint: `Use a real deployed BNB Chain token address ending in ${REQUIRED_TEST_TOKEN_SUFFIX}, rerun yarn vault:e2e ${folderName ?? "<folder-name>"}, then regenerate the source package.`,
        },
      ),
    ];
  }
  const result = await validateErc20TokenContract(chainId, tokenAddress);
  if (result.ok) return [];
  return [
    tokenContractIssue(
      "e2e-report/invalid-erc20-token",
      `E2E report tokenAddress must be a real deployed ERC20 token on chainId ${chainId}: ${tokenAddress}. ${result.detail}`,
      {
        file,
        field: "binding.tokenAddress",
        folderName,
        chainId,
        tokenAddress,
        tokenContract: result,
      },
    ),
  ];
}
