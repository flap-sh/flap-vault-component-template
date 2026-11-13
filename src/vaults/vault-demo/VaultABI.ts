import { parseAbi } from "viem";

// ABI fragments for the demo revenue Vault contract on BSC Testnet.
export const vaultAbi = parseAbi([
  "function taxToken() view returns (address)",
  "function creator() view returns (address)",
  "function targetRaise() view returns (uint256)",
  "function contributorBps() view returns (uint16)",
  "function totalRevenue() view returns (uint256)",
  "function totalPaid() view returns (uint256)",
  "function claimed(address account) view returns (uint256)",
  "function entitled(address account) view returns (uint256)",
  "function claimable(address account) view returns (uint256)",
  "function claim()",
]);
