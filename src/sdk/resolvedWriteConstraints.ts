import { encodeFunctionData, toFunctionSelector, type AbiFunction, type EncodeFunctionDataParameters } from "viem";
import type { ContractWriteRequest } from "./types";

export interface ResolvedWriteConstraint {
  fixedBytes?: ReadonlyMap<number, number>;
  valueWei?: bigint;
  caseInsensitiveHexPrefix?: boolean;
}

export function checkReviewedContractCall(
  parameters: EncodeFunctionDataParameters,
  allowed: readonly AbiFunction[],
) {
  const data = encodeFunctionData(parameters);
  const selector = data.slice(0, 10);
  const entry = allowed.find((method) => toFunctionSelector(method) === selector);
  const abiMatches = entry !== undefined &&
    encodeFunctionData({ abi: [entry], functionName: entry.name, args: parameters.args }) === data;
  return { selector, entry, abiMatches };
}

export function checkResolvedWriteConstraint(
  request: Pick<ContractWriteRequest, "args" | "value">,
  constraint: ResolvedWriteConstraint,
) {
  const prefix = constraint.caseInsensitiveHexPrefix ? /^0x/i : /^0x/;
  let fixedBytesMatch = true;
  for (const [index, length] of constraint.fixedBytes ?? []) {
    const bytes = request.args?.[index];
    if (typeof bytes !== "string" || bytes.length !== 2 + 2 * length ||
        !prefix.test(bytes) || /[^a-f0-9]/i.test(bytes.slice(2))) {
      fixedBytesMatch = false;
      break;
    }
  }
  return {
    fixedBytesMatch,
    valueMatches: constraint.valueWei === undefined || (request.value ?? 0n) === constraint.valueWei,
  };
}
