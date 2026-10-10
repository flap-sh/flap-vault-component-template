import type { AbiFunction } from "viem";
import type { Address } from "./types";

export type ResolvedContractCheck =
  | { kind: "owner"; target: "vault" | "resolved" }
  | { kind: "ownerOf"; target: "vault" | "resolved"; resolverArg: number }
  | { kind: "recipient"; function: string; arg: number }
  | { kind: "balance"; function: string; amountArg: number; token: "token" | "resolved"; owner: "user" | "resolved" };

export interface ManifestResolvedContract {
  id: string;
  label: "vault" | "token" | "nft";
  resolver: string;
  allow: string[];
  read?: "any" | string[];
  payable?: boolean;
  /** Required when payable=true; decimal base units, no expression evaluation. */
  maxValueWei?: string;
  codePattern?: "none" | "eip6551-proxy";
  codeHash?: Address;
  implementationCodeHash?: Address;
  checks?: ResolvedContractCheck[];
}

/** Informational fields only. Runtime authorization lives in a private WeakMap. */
export interface ResolvedContractHandle {
  readonly id: string;
  readonly address: Address;
  readonly args: readonly unknown[];
  readonly chainId: number;
}

export interface ParsedResolvedContract {
  definition: ManifestResolvedContract;
  resolver: AbiFunction;
  writes: AbiFunction[];
  reads: "any" | AbiFunction[];
}
