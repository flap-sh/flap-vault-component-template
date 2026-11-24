import type { AbiFunction } from "viem";
import type { Address } from "./types";
export interface AppWalletPermissions { id: string; allow?: string[]; read?: string[]; maxValueWei?: string; approvalSpenders?: Address[]; maxApprovalWei?: string; codeHash?: `0x${string}` }
export interface AppResolvedWriteConstraint {
  selector: `0x${string}`;
  fixedBytes: { index: number; length: number }[];
  valueWei?: string;
}
export interface AppResolvedContract extends AppWalletPermissions { resolver: string; writeConstraints?: AppResolvedWriteConstraint[] }
export interface AppPresaleApproval {
  policyId: string;
  launcherResolver: string;
  maxApprovalWei: string;
}
export interface AppErc20Approval {
  allowlist: ["*"] | Address[];
  maxApprovalWei: string;
}
export interface AppWalletContract extends AppWalletPermissions { chainId: number; address: Address; resolvedContracts?: AppResolvedContract[]; presaleApproval?: AppPresaleApproval; erc20Approval?: AppErc20Approval }
export interface ParsedAppWalletPermissions {
  definition: AppWalletPermissions;
  writes: AbiFunction[];
  reads: AbiFunction[];
  writeConstraints?: ReadonlyMap<string, { fixedBytes: ReadonlyMap<number, number>; valueWei?: bigint }>;
}
export interface ParsedAppWalletContract extends ParsedAppWalletPermissions { definition: AppWalletContract; resolved: (ParsedAppWalletPermissions & { resolver: AbiFunction })[] }
export declare const ERC20_APPROVE_SELECTOR: "0x095ea7b3";
export declare const PRESALE_CONTRIBUTE_QUOTE_SELECTOR: `0x${string}`;
export declare const APP_ERC20_APPROVAL_VERSION: 1;
export function hasAppErc20Approval(value: unknown): boolean;
export function parseAppWalletContracts(value: unknown): ParsedAppWalletContract[];
