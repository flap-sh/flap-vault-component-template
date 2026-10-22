import type { VaultManifest } from "../sdk/types";

type SearchParams = { get(name: string): string | null };
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const ZERO_ADDRESS = /^0x0{40}$/i;

function readAddress(params: SearchParams, names: string[]) {
  const values = names.map((name) => params.get(name)).filter((value): value is string => value !== null);
  if (!values.length) return { present: false, value: undefined };
  if (values.some((value) => !ADDRESS.test(value) || ZERO_ADDRESS.test(value))
    || values.some((value) => value.toLowerCase() !== values[0].toLowerCase())) return null;
  return { present: true, value: values[0].toLowerCase() };
}

/** Launch schemas must use the requested factory, never an unrelated first binding. */
export function selectLaunchConfigPreviewBinding(manifest: Pick<VaultManifest, "match">, params: SearchParams) {
  const rawChainId = params.get("chainId");
  const chainId = rawChainId === null ? undefined : Number(rawChainId);
  if (rawChainId !== null && (!/^\d+$/.test(rawChainId) || !Number.isSafeInteger(chainId) || chainId! <= 0)) return null;
  const factory = readAddress(params, ["factoryAddress", "factory"]);
  const token = readAddress(params, ["tokenAddress", "token", "ca"]);
  const vault = readAddress(params, ["vaultAddress", "vault"]);
  if (!factory || !token || !vault) return null;
  const bindings = manifest.match.bindings.filter((entry) => Boolean(entry.factoryAddress));
  const hasHints = rawChainId !== null || factory.present || token.present || vault.present;
  if (!hasHints) return bindings[0] ?? null;
  // A Vault address alone does not identify a factory without an on-chain lookup.
  if (vault.present && !factory.present && !token.present) return null;
  const candidates = bindings.filter((entry) =>
    (chainId === undefined || entry.chainId === chainId)
    && (!factory.value || entry.factoryAddress?.toLowerCase() === factory.value)
    && (!token.value || !entry.tokenAddresses?.length || entry.tokenAddresses.some((address) => address.toLowerCase() === token.value)));
  return candidates.length === 1 ? candidates[0] : null;
}
