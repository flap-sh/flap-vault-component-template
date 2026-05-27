import type { Address } from "@/src/sdk";

export interface PreviewRuntimeDefaults {
  chainId: number;
  factoryAddress: Address;
  tokenAddress: Address;
  vaultAddress?: Address;
}

const previewRuntimeDefaults: Record<string, PreviewRuntimeDefaults> = {
  "community-buyback-example": {
    chainId: 56,
    factoryAddress: "0xC3e4EE8f3c616D16297fAfcB9daab122D31eFA9E",
    tokenAddress: "0x091652ebc0a0238d7151a868f22d7cfd2a267777",
    vaultAddress: "0x5093579176Ce1E6061fE5F808DBf972782B61c7d",
  },
  "flapixel-example": {
    chainId: 56,
    factoryAddress: "0x88a33780e1b3150Af85fBef52f344A43EBeC5A51",
    tokenAddress: "0x6BcC641D1eF33c4d7A2C9536a3E0356F77Ff7777",
    vaultAddress: "0x5592153295bc1b7fede99dfdad295aa3651811e4",
  },
};

export function getPreviewRuntimeDefaults(folderName: string) {
  return previewRuntimeDefaults[folderName];
}
