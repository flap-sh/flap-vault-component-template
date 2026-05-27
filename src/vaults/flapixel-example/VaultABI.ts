import { parseAbi } from "viem";

export const vaultAbi = parseAbi([
  "function taxToken() view returns (address)",
  "function nft() view returns (address)",
  "function tokenCostPerNFT() view returns (uint256)",
  "function dividendShareBps() view returns (uint16)",
  "function floorShareBps() view returns (uint16)",
  "function floorPool() view returns (uint256)",
  "function vaultInfo() view returns (uint256 currentFloorPrice, uint256 mintedNFTs, uint256 maxSupply, uint256 totalBuybackBurned, uint256 totalDividends, uint256 totalClaimed, uint256 burnedNFTs)",
  "function myInfoOf(address user) view returns (uint256 tokenBalance, uint256 nftBalance, uint256 claimedBNB, uint256 pendingBNB)",
  "function ownedTokensOf(address user) view returns (uint256[])",
  "function mintNFTWithTokenAmount(uint256 tokenAmount)",
  "function claim()",
  "function sellToVault(uint256[] tokenIds)",
]);

export const nftAbi = parseAbi([
  "function isApprovedForAll(address owner, address operator) view returns (bool)",
  "function setApprovalForAll(address operator, bool approved)",
]);
