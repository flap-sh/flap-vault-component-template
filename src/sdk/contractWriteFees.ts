export const MAX_CONTRACT_WRITE_GAS = 5_000_000n;
export const MAX_GAS_PRICE_MULTIPLIER = 2n;

interface ContractWriteFeeOverrides {
  gas?: bigint;
  gasPrice?: bigint;
}

export async function resolveSafeContractWriteFeeOverrides(
  request: ContractWriteFeeOverrides,
  getNetworkGasPrice: () => Promise<bigint>,
): Promise<ContractWriteFeeOverrides> {
  if (request.gas !== undefined) {
    if (request.gas <= 0n) throw new Error("Contract write gas must be greater than zero.");
    if (request.gas > MAX_CONTRACT_WRITE_GAS) {
      throw new Error(`Contract write gas must not exceed ${MAX_CONTRACT_WRITE_GAS.toString()}.`);
    }
  }

  if (request.gasPrice !== undefined) {
    if (request.gasPrice <= 0n) throw new Error("Contract write gasPrice must be greater than zero.");
    const networkGasPrice = await getNetworkGasPrice();
    if (networkGasPrice <= 0n) throw new Error("The runtime returned an invalid network gas price.");
    const maximumGasPrice = networkGasPrice * MAX_GAS_PRICE_MULTIPLIER;
    if (request.gasPrice > maximumGasPrice) {
      throw new Error(
        `Contract write gasPrice ${request.gasPrice.toString()} exceeds the runtime safety limit ${maximumGasPrice.toString()}.`,
      );
    }
  }

  return {
    ...(request.gas === undefined ? {} : { gas: request.gas }),
    ...(request.gasPrice === undefined ? {} : { gasPrice: request.gasPrice }),
  };
}
