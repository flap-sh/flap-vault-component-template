import type { AbiFunction } from "viem";
import type { Address } from "./types";
export interface AppWalletPermissions { id: string; allow?: string[]; read?: string[]; maxValueWei?: string; approvalSpenders?: Address[]; maxApprovalWei?: string; codeHash?: `0x${string}` }
export interface AppResolvedContract extends AppWalletPermissions { resolver: string }
export interface AppErc20Approval {
  allowlist: ["*"] | Address[];
  maxApprovalWei: string;
}
export interface AppWalletContract extends AppWalletPermissions { chainId: number; address: Address; resolvedContracts?: AppResolvedContract[]; erc20Approval?: AppErc20Approval }
export interface ParsedAppWalletPermissions { definition: AppWalletPermissions; writes: AbiFunction[]; reads: AbiFunction[] }
export interface ParsedAppWalletContract extends ParsedAppWalletPermissions { definition: AppWalletContract; resolved: (ParsedAppWalletPermissions & { resolver: AbiFunction })[] }
export const APP_ERC20_APPROVAL_VERSION: 1;
export function hasAppErc20Approval(value: unknown): boolean;
export function parseAppWalletContracts(value: unknown): ParsedAppWalletContract[];
