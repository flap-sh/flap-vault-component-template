import { parseAbi } from "viem";

export const dexListedExampleVaultAbi = parseAbi([
  "function saleInfo() view returns (uint256 totalPurchased, uint256 remaining, uint256 minPurchase, uint256 maxPurchase)",
  "function purchaseOf(address user) view returns (uint256 purchased, uint256 claimable)",
  "function buyListed(uint256 amount)",
]);
