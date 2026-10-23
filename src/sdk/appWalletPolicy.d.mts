import type { AbiFunction } from "viem";
import type { Address } from "./types";
export interface AppWalletPermissions { id: string; allow?: string[]; read?: string[]; maxValueWei?: string; approvalSpenders?: Address[]; maxApprovalWei?: string; codeHash?: `0x${string}` }
export interface AppResolvedContract extends AppWalletPermissions { resolver: string }
export interface AppWalletContract extends AppWalletPermissions { chainId: number; address: Address; resolvedContracts?: AppResolvedContract[] }
export interface ParsedAppWalletPermissions { definition: AppWalletPermissions; writes: AbiFunction[]; reads: AbiFunction[] }
export interface ParsedAppWalletContract extends ParsedAppWalletPermissions { definition: AppWalletContract; resolved: (ParsedAppWalletPermissions & { resolver: AbiFunction })[] }
export function parseAppWalletContracts(value: unknown): ParsedAppWalletContract[];
