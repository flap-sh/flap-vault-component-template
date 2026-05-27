import { parseAbi } from "viem";

export const vaultAbi = parseAbi([
  "function taxToken() view returns (address)",
  "function taxRateBps() view returns (uint256)",
  "function owner() view returns (address)",
  "function getVaultStats() view returns (uint256 treasuryBNB, uint256 proposalAllowedAt, uint256 currentProposalId, address approvedBuybackToken, bool buybackTokenLocked, address pancakeRouter, address wbnb, uint256 lastBuybackAt, uint256 nextBuybackAt)",
  "function getProposalInfo(uint256 proposalId) view returns (address proposedToken, uint256 voteStart, uint256 voteEnd, uint256 yesVotes, uint256 noVotes, bool finalized, bool approved)",
  "function getUserVoteInfo(uint256 proposalId, address user) view returns (uint256 stakeAmount, bool voted, bool support, bool withdrawable)",
  "function proposeBuybackToken(address proposedToken)",
  "function finalizeVote(uint256 proposalId)",
  "function stakeAndVote(bool support, uint256 amount)",
  "function withdrawAllStakes()",
]);
