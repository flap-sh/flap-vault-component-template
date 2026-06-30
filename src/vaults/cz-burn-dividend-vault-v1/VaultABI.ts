import { parseAbi } from "viem";

export const vaultAbi = parseAbi([
  "function paused() view returns (bool)",
  "function getFrontendUserInfo(address account) view returns ((address account, uint256 tokenBalance, uint256 burnedAmount, uint256 pendingReward, uint256 claimedReward, uint256 shareBps) info)",
  "function getFrontendVaultInfo() view returns ((address taxToken, address czWallet, uint256 minimumBurnAmount, uint256 totalBurned, uint256 totalBurners, uint256 totalBuybackBNB, uint256 totalBuybackToken, uint256 totalDistributedBNB, uint256 totalClaimedBNB, uint256 pendingBuybackBNB, uint256 pendingDustBNB, bool burnStarted, uint256 bnbBalance) info)",
  "function burn(uint256 amount)",
  "function claim()",
]);
