import type { OracleProvision, OracleReadRequest, OracleReader } from "./types";

const DEFAULT_LOCAL_ORACLE_ENDPOINT_BASE = "/api/runtime/oracle";

export class OracleReadError extends Error {
  status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "OracleReadError";
    this.status = status;
  }
}

function appendSearchParams(url: URL, params?: Record<string, string>) {
  for (const [key, value] of Object.entries(params ?? {})) {
    url.searchParams.set(key, value);
  }
}

function toOracleProvision(provision: string | OracleProvision): OracleProvision {
  return typeof provision === "string" ? { endpoint: provision } : provision;
}

function buildProvisionedParams(provision: OracleProvision, params?: Record<string, string>) {
  const filteredParams =
    provision.allowedParams && provision.allowedParams.length
      ? Object.fromEntries(Object.entries(params ?? {}).filter(([key]) => provision.allowedParams?.includes(key)))
      : params;

  return {
    ...(filteredParams ?? {}),
    ...(provision.fixedParams ?? {}),
  };
}

export function buildLocalOracleUrl(oracleId: string, params?: Record<string, string>, endpointBase = DEFAULT_LOCAL_ORACLE_ENDPOINT_BASE) {
  const normalizedBase = endpointBase.replace(/\/+$/, "");
  const url = new URL(`${normalizedBase}/${encodeURIComponent(oracleId)}`, "http://localhost");
  appendSearchParams(url, params);
  return `${url.pathname}${url.search}`;
}

export async function fetchOracleJson<T>({
  endpoint,
  params,
  fetchImpl,
  headers,
}: {
  endpoint: string;
  params?: Record<string, string>;
  fetchImpl?: typeof fetch;
  headers?: HeadersInit;
}): Promise<T> {
  const fallbackOrigin = typeof window !== "undefined" ? window.location.origin : "http://localhost";
  const url = new URL(endpoint, fallbackOrigin);
  appendSearchParams(url, params);

  const response = await (fetchImpl ?? fetch)(url.toString(), {
    cache: "no-store",
    headers,
    method: "GET",
  });

  if (!response.ok) {
    throw new OracleReadError(`Oracle request returned ${response.status}.`, response.status);
  }

  return (await response.json()) as T;
}

export async function fetchProvisionedOracle<T>({
  provision,
  params,
  fetchImpl,
}: {
  provision: string | OracleProvision;
  params?: Record<string, string>;
  fetchImpl?: typeof fetch;
}): Promise<T> {
  const normalizedProvision = toOracleProvision(provision);

  return fetchOracleJson<T>({
    endpoint: normalizedProvision.endpoint,
    params: buildProvisionedParams(normalizedProvision, params),
    fetchImpl,
    headers: normalizedProvision.headers,
  });
}

export function createLocalOracleReader(options: { endpointBase?: string; fetchImpl?: typeof fetch } = {}): OracleReader {
  const endpointBase = options.endpointBase ?? DEFAULT_LOCAL_ORACLE_ENDPOINT_BASE;
  const fetchImpl = options.fetchImpl;

  return async function readLocalOracle<T>({ oracleId, params }: OracleReadRequest): Promise<T> {
    return fetchOracleJson<T>({
      endpoint: buildLocalOracleUrl(oracleId, params, endpointBase),
      fetchImpl,
    });
  };
}
