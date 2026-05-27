import type { Address } from "./types";

export interface TaxVaultHostChainConfig {
  portal: Address;
  taxTokenHelperAddress?: Address;
  vaultPortal?: Address;
  wrappedNativeTokenAddress?: Address;
  giftVaultFactory?: Address;
  hostChainSlug?: string;
  ipfsGateway?: string;
}

const taxVaultHostChains: Record<number, TaxVaultHostChainConfig> = {
  56: {
    portal: "0xe2ce6ab80874fa9fa2aae65d277dd6b8e65c9de0",
    taxTokenHelperAddress: "0x53841c73217735F37BC1775538b03b23feFD8346",
    vaultPortal: "0x90497450f2a706f1951b5bdda52B4E5d16f34C06",
    wrappedNativeTokenAddress: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
    giftVaultFactory: "0x025549F52B03cF36f9e1a337c02d3AA7Af66ab32",
    hostChainSlug: "bnb",
    ipfsGateway: "https://gateway.pinata.cloud",
  },
  97: {
    portal: "0x5bEacaF7ABCbB3aB280e80D007FD31fcE26510e9",
    taxTokenHelperAddress: "0xD64441e5FcD02D342B8cf6eBA10Ef6E40d0dA90f",
    vaultPortal: "0x027e3704fC5C16522e9393d04C60A3ac5c0d775f",
    wrappedNativeTokenAddress: "0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd",
    giftVaultFactory: "0xa02DA44D67DB6D692efa7f751b5952bd670d5326",
    hostChainSlug: "bnb-testnet",
    ipfsGateway: "https://gateway.pinata.cloud",
  },
};

export function getTaxVaultHostChainConfig(chainId: number) {
  return taxVaultHostChains[chainId];
}
