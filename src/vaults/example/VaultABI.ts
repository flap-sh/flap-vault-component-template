import { parseAbi } from "viem";

export const exampleVaultAbi = parseAbi([
  "function vaultInfo() view returns (uint256 totalDeposited, uint256 rewardEndsAt)",
  "function myInfoOf(address user) view returns (uint256 deposited, uint256 claimable)",
  "function deposit(uint256 amount)",
  "function claim()",
]);
