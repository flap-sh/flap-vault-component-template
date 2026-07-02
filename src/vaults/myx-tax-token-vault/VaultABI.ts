import { parseAbi } from "viem";

export const factoryAbi = parseAbi([
  "function newVault(address taxToken, address quoteToken, address creator, bytes vaultData) returns (address vault)",
]);
