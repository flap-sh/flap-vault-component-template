export const MAX_CONTRACT_WRITE_GAS = 5_000_000n;
export const MAX_GAS_PRICE_MULTIPLIER = 2n;
// Pool launches can initialize pools and Vaults in the same transaction.
// Keep the BSC override below the 16,777,216 per-transaction network limit.
const BSC_MAX_CONTRACT_WRITE_GAS = 15_000_000n;

interface ContractWriteFeeOverrides {
  gas?: bigint;
  gasPrice?: bigint;
}

export async function resolveSafeContractWriteFeeOverrides(
  request: ContractWriteFeeOverrides,
  getNetworkGasPrice: () => Promise<bigint>,
  chainId: number,
): Promise<ContractWriteFeeOverrides> {
  if (request.gas !== undefined) {
    if (request.gas <= 0n) throw new Error("Contract write gas must be greater than zero.");
    const maximumGas = chainId === 56 || chainId === 97 ? BSC_MAX_CONTRACT_WRITE_GAS : MAX_CONTRACT_WRITE_GAS;
    if (request.gas > maximumGas) {
      throw new Error(`Contract write gas must not exceed ${maximumGas.toString()}.`);
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
