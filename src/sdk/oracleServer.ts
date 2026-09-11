import { fetchProvisionedOracle } from "./oracle";
import { loadBnbUsdFromBinance } from "./binanceRuntimeOracle";
import type { Address, OracleProvision, RuntimeOracleRegistry } from "./types";

export const FLAP_RUNTIME_ORACLE_REGISTRY_ENV = "FLAP_RUNTIME_ORACLE_REGISTRY";
const DEFAULT_EXAMPLE_ORACLE_SIGNATURE = "0x000000000000000000000000000000000000dEaD" as Address;
const BNB_USD_ORACLE_ID = "bnb-usd-price";
const V2_POOL_RESERVES_ORACLE_ID = "v2-pool-reserves";
const X_VERIFIER_ORACLE_ID = "x-verifier";
const V2_POOL_RESERVES_ENDPOINTS: Record<number, string> = {
  56: "https://oracle.taxed.fun/v2-pool-reserves",
  97: "https://oracle-testnet.taxed.fun/v2-pool-reserves",
};
const X_VERIFIER_ENDPOINT = "https://x-verifier.taxvault.info/submit";
const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
const DECIMAL_ID_RE = /^\d+$/;

function normalizeAllowedParams(value: unknown) {
  if (!Array.isArray(value)) return undefined;
  const params = value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  return params.length ? params : undefined;
}

function normalizeFixedParams(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const params = Object.entries(value)
    .filter((entry): entry is [string, string] => typeof entry[0] === "string" && typeof entry[1] === "string")
    .map(([key, item]) => [key.trim(), item.trim()] as const)
    .filter(([key]) => key.length > 0);
  return params.length ? Object.fromEntries(params) : undefined;
}

function normalizeProvision(value: unknown): OracleProvision | null {
  if (typeof value === "string") {
    return value.trim() ? { endpoint: value.trim() } : null;
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.endpoint !== "string" || !record.endpoint.trim()) return null;
  if (Object.prototype.hasOwnProperty.call(record, "headers")) {
    throw new Error(
      `${FLAP_RUNTIME_ORACLE_REGISTRY_ENV} entries must not include headers. Flap runtime does not hold or forward upstream tokens; expose a reviewed no-secret HTTPS endpoint instead.`,
    );
  }

  return {
    endpoint: record.endpoint.trim(),
    allowedParams: normalizeAllowedParams(record.allowedParams),
    fixedParams: normalizeFixedParams(record.fixedParams),
  };
}

export function parseRuntimeOracleRegistry(raw: string | undefined): RuntimeOracleRegistry {
  if (!raw?.trim()) return {};

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(
      `${FLAP_RUNTIME_ORACLE_REGISTRY_ENV} must be valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${FLAP_RUNTIME_ORACLE_REGISTRY_ENV} must be a JSON object keyed by oracle id.`);
  }

  return Object.fromEntries(
    Object.entries(parsed)
      .map(([oracleId, provision]) => [oracleId, normalizeProvision(provision)] as const)
      .filter((entry): entry is [string, OracleProvision] => Boolean(entry[1])),
  );
}

export function resolveRuntimeOracleProvision(oracleId: string, registry: RuntimeOracleRegistry): OracleProvision | null {
  const provision = registry[oracleId];
  if (!provision) return null;
  return typeof provision === "string" ? { endpoint: provision } : provision;
}

export function loadDefaultRuntimeOracle<T>(oracleId: string): T | null {
  if (oracleId === "example-reward-oracle") {
    return {
      rewardMultiplierBps: 175,
      timestamp: Math.floor(Date.now() / 1000),
      signature: DEFAULT_EXAMPLE_ORACLE_SIGNATURE,
    } as T;
  }

  return null;
}

async function loadBuiltinRuntimeOracle<T>(oracleId: string, fetchImpl?: typeof fetch): Promise<T | null> {
  if (oracleId === V2_POOL_RESERVES_ORACLE_ID) return null;
  if (oracleId !== BNB_USD_ORACLE_ID) return null;
  return (await loadBnbUsdFromBinance(fetchImpl)) as T;
}

function readV2PoolReservesEndpoint(params?: Record<string, string>) {
  const chainId = Number(params?.chainId);
  const endpoint = Number.isInteger(chainId) ? V2_POOL_RESERVES_ENDPOINTS[chainId] : undefined;
  if (!endpoint) {
    throw new Error("v2-pool-reserves requires chainId 56 or 97.");
  }
  return endpoint;
}

function readV2PoolAddress(params?: Record<string, string>) {
  const pool = params?.pool?.trim();
  if (!pool || !ADDRESS_RE.test(pool)) {
    throw new Error("v2-pool-reserves requires a pool address.");
  }
  return pool;
}

function readXVerifierParams(params?: Record<string, string>) {
  const taxToken = params?.tax_token?.trim();
  const tweetId = params?.tweet_id?.trim();
  if (!taxToken || !ADDRESS_RE.test(taxToken)) {
    throw new Error("x-verifier requires tax_token as an EVM address.");
  }
  if (!tweetId || !DECIMAL_ID_RE.test(tweetId)) {
    throw new Error("x-verifier requires tweet_id as a decimal string.");
  }
  return { tax_token: taxToken, tweet_id: tweetId };
}

async function loadV2PoolReservesOracle<T>(params?: Record<string, string>, fetchImpl?: typeof fetch): Promise<T> {
  return fetchProvisionedOracle<T>({
    provision: {
      endpoint: readV2PoolReservesEndpoint(params),
      allowedParams: ["pool"],
    },
    params: {
      pool: readV2PoolAddress(params),
    },
    fetchImpl,
  });
}

async function loadXVerifierOracle<T>(params?: Record<string, string>, fetchImpl?: typeof fetch): Promise<T> {
  const response = await (fetchImpl ?? fetch)(X_VERIFIER_ENDPOINT, {
    body: JSON.stringify(readXVerifierParams(params)),
    cache: "no-store",
    headers: {
      "content-type": "application/json",
    },
    method: "POST",
  });

  if (!response.ok) {
    throw new Error(`x-verifier request returned ${response.status}.`);
  }
  return (await response.json()) as T;
}

export async function loadRuntimeOracle<T>({
  oracleId,
  params,
  registry,
  fetchImpl,
}: {
  oracleId: string;
  params?: Record<string, string>;
  registry: RuntimeOracleRegistry;
  fetchImpl?: typeof fetch;
}): Promise<T | null> {
  const provision = resolveRuntimeOracleProvision(oracleId, registry);
  if (provision) {
    return fetchProvisionedOracle<T>({
      provision,
      params,
      fetchImpl,
    });
  }
  if (oracleId === V2_POOL_RESERVES_ORACLE_ID) {
    return loadV2PoolReservesOracle<T>(params, fetchImpl);
  }
  if (oracleId === X_VERIFIER_ORACLE_ID) {
    return loadXVerifierOracle<T>(params, fetchImpl);
  }
  return loadBuiltinRuntimeOracle<T>(oracleId, fetchImpl);
}
