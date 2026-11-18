import type { ParsedResolvedContract } from "./resolvedContractTypes";
export declare const VAULT_ASSEMBLY_ID: "vault-assembly-v1";
export function isVaultAssemblyChain(chainId: unknown): chainId is 56 | 97;
export function parseResolvedContract(input: unknown): ParsedResolvedContract;
