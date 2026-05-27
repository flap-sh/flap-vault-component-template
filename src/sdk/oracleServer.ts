import { fetchProvisionedOracle } from "./oracle";
import type { Address, OracleProvision, RuntimeOracleRegistry } from "./types";

export const FLAP_RUNTIME_ORACLE_REGISTRY_ENV = "FLAP_RUNTIME_ORACLE_REGISTRY";
const DEFAULT_EXAMPLE_ORACLE_SIGNATURE = "0x000000000000000000000000000000000000dEaD" as Address;

function normalizeHeaders(headers: unknown) {
  if (!headers || typeof headers !== "object" || Array.isArray(headers)) return undefined;
  const entries = Object.entries(headers)
    .filter(([, value]) => typeof value === "string")
    .map(([key, value]) => [key, value.trim()] as const)
    .filter(([, value]) => value);
  return entries.length ? Object.fromEntries(entries) : undefined;
}

function normalizeAllowedParams(value: unknown) {
  if (!Array.isArray(value)) return undefined;
  const params = value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  return params.length ? params : undefined;
}

function normalizeProvision(value: unknown): OracleProvision | null {
  if (typeof value === "string") {
    return value.trim() ? { endpoint: value.trim() } : null;
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.endpoint !== "string" || !record.endpoint.trim()) return null;

  return {
    endpoint: record.endpoint.trim(),
    headers: normalizeHeaders(record.headers),
    allowedParams: normalizeAllowedParams(record.allowedParams),
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
  if (!provision) return null;
  return fetchProvisionedOracle<T>({
    provision,
    params,
    fetchImpl,
  });
}
