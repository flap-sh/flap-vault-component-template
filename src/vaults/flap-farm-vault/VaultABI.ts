import { parseAbi } from "viem";

export const vaultAbi = parseAbi([
  "function taxToken() view returns (address)",
  "function getRewardPoolBalance() view returns (uint256)",
  "function getUserPlotCount(address user) view returns (uint256)",
  "function getPlots(address user, uint256 offset, uint256 limit) view returns ((uint8 level,uint8 status,uint64 plantedAt,uint64 matureTime,uint16 boostBps,bool fertilized,uint256 totalClaimed)[] plots)",
  "function getProgress(address user, uint256 plotId) view returns (uint16)",
  "function getRemainingOutput(address user, uint256 plotId) view returns (uint256)",
  "function isReady(address user, uint256 plotId) view returns (bool)",
  "function seedBalance(address user, uint8 level) view returns (uint256)",
  "function fertilizerBalance(address user, uint8 level) view returns (uint256)",
  "function landConfigs(uint8 level) view returns (uint256 price, uint256 outputCap)",
  "function seedConfigs(uint8 level) view returns (uint256 price, uint64 matureTime, uint256 reward)",
  "function fertilizerConfigs(uint8 level) view returns (uint256 price, uint16 boostBps)",
  "function buyLand(uint256 amount)",
  "function buySeed(uint8 level, uint256 amount)",
  "function buyFertilizer(uint8 level, uint256 amount)",
  "function plant(uint256 plotId)",
  "function fertilize(uint256 plotId)",
  "function harvest(uint256 plotId)",
  "function upgradeLand(uint256 plotId)",
]);
