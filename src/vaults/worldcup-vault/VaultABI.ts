import { parseAbi } from "viem";

/** WorldCupVault @ 0xf637F19f3b01339798b290154e5346e55929b72A (BSC) */
export const vaultAbi = parseAbi([
  "function mintStamp(uint8 team, uint256 maxPrice) returns (uint256 tokenId)",
  "function mintStampBatch(uint8 team, uint8 count, uint256 maxPricePerStamp) returns (uint256 firstTokenId, uint256 totalPaid)",
  "function claimAll()",
  "function claimRange(uint256 start, uint256 end)",
  "function freeze()",
  "function stampPrice(uint8 team) view returns (uint256)",
  "function stampMinted() view returns (uint256)",
  "function stampsMintedAllTeams() view returns (uint256[])",
  "function pools() view returns (uint256 champion_, uint256 participation_, uint256 royalty_)",
  "function totalBurnedWC26() view returns (uint256)",
  "function totalRoyaltyReceived() view returns (uint256)",
  "function totalBnbBuyback() view returns (uint256)",
  "function royaltyPool() view returns (uint256)",
  "function myStampsAllTeams() view returns (uint256[])",
  "function myInfo() view returns (uint256 tokenBalance, uint256 stampCount, uint256 claimableBNB, uint256 mintSpentWC26, uint256 claimedBNB)",
  "function frozen() view returns (bool)",
  "function champion() view returns (uint8)",
]);

/** WorldCupViewer @ 0x00036192958C2aaAF9F445d3Cdc2979995EA333e (BSC) */
export const viewerAbi = parseAbi([
  "function getWorldCupWinner() view returns (uint256 matchId, string matchName, bool isResolved, uint256 teamId, string teamName)",
]);
