import { parseAbi, toFunctionSelector, isAddress } from "viem";
const bad = (ok, reason) => { if (!ok) throw new Error(`app-wallet/${reason}`); };
const address = (a) => typeof a === "string" && isAddress(a, { strict: false }) && !/^0x0{40}$/i.test(a);
const admin = /^(?:execute(?:Call|Batch)?|multicall|delegatecall|setApprovalForAll|transferOwnership|acceptOwnership|upgradeTo.*|setConfig|setSwapPath|setSplit|increaseAllowance|decreaseAllowance)$/i;
const forbiddenSelectors = new Set(["execute(address,uint256,bytes,uint8)", "execute(address,uint256,bytes)", "executeCall(address,uint256,bytes)", "setApprovalForAll(address,bool)", "transferOwnership(address)", "upgradeTo(address)", "upgradeToAndCall(address,bytes)"].map(toFunctionSelector));
function signatures(items, read = false) {
  bad(Array.isArray(items) && items.length <= 32, "invalid-signatures");
  const abi = items.map((text) => { bad(typeof text === "string" && text.length <= 2048, "invalid-signature"); const entries = parseAbi([text]); bad(entries.length === 1 && entries[0].type === "function", "invalid-signature"); const f = entries[0]; bad(read ? ["view", "pure"].includes(f.stateMutability) : !["view", "pure"].includes(f.stateMutability) && !admin.test(f.name) && !forbiddenSelectors.has(toFunctionSelector(f)), "forbidden-function"); return f; });
  bad(new Set(abi.map(toFunctionSelector)).size === abi.length, "duplicate-selector"); return abi;
}
function permissions(input) {
  const writes = signatures(input.allow ?? []); const reads = signatures(input.read ?? [], true);
  bad(writes.length + reads.length > 0, "empty-permissions");
  bad(input.maxValueWei === undefined || typeof input.maxValueWei === "string" && /^[1-9][0-9]{0,77}$/.test(input.maxValueWei) && BigInt(input.maxValueWei) < 2n ** 256n, "invalid-value-cap");
  if (writes.some((f) => f.stateMutability === "payable")) bad(input.maxValueWei !== undefined, "missing-value-cap");
  if (writes.some((f) => f.name === "approve")) {
    bad(writes.filter((f) => f.name === "approve").every((f) => toFunctionSelector(f) === "0x095ea7b3"), "invalid-approve");
    bad(Array.isArray(input.approvalSpenders) && input.approvalSpenders.length > 0 && input.approvalSpenders.length <= 8 && input.approvalSpenders.every(address), "missing-approval-spenders");
    bad(typeof input.maxApprovalWei === "string" && /^[1-9][0-9]{0,77}$/.test(input.maxApprovalWei) && BigInt(input.maxApprovalWei) < 2n ** 256n, "missing-approval-cap");
  } else bad(input.approvalSpenders === undefined && input.maxApprovalWei === undefined, "unexpected-approval-policy");
  return { definition: structuredClone(input), writes, reads };
}
const hasDynamicBytes = (parameter) => /^bytes(?:\[|$)/.test(parameter.type) || parameter.components?.some(hasDynamicBytes);
const common = ["id", "allow", "read", "maxValueWei", "approvalSpenders", "maxApprovalWei", "codeHash"];
function identity(input, keys) {
  bad(input && typeof input === "object" && !Array.isArray(input) && Object.keys(input).every((k) => keys.includes(k)), "unknown-field");
  bad(typeof input.id === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(input.id) && input.id.length <= 64, "invalid-id");
  bad(input.codeHash === undefined || /^0x[0-9a-fA-F]{64}$/.test(input.codeHash), "invalid-code-hash");
}
/** Pure parser shared by checker and host; no declarations authorize unreviewed artifacts. */
export function parseAppWalletContracts(value) {
  bad(Array.isArray(value) && value.length > 0 && value.length <= 16, "invalid-contracts");
  const ids = new Set(); const targets = new Set();
  return value.map((input) => {
    identity(input, [...common, "chainId", "address", "resolvedContracts"]);
    bad(Number.isSafeInteger(input.chainId) && input.chainId > 0 && address(input.address), "invalid-target");
    const key = `${input.chainId}:${input.address.toLowerCase()}`; bad(!targets.has(key) && !ids.has(input.id), "duplicate-contract"); targets.add(key); ids.add(input.id);
    const policy = permissions(input);
    bad(input.resolvedContracts === undefined || Array.isArray(input.resolvedContracts) && input.resolvedContracts.length <= 8, "invalid-resolvers");
    const resolved = (input.resolvedContracts ?? []).map((item) => {
      identity(item, [...common, "resolver"]); bad(!ids.has(item.id), "duplicate-resolver"); ids.add(item.id);
      bad(typeof item.resolver === "string" && item.resolver.length <= 2048, "invalid-resolver"); const entries = parseAbi([item.resolver]); const resolver = entries[0];
      bad(entries.length === 1 && resolver.type === "function" && ["view", "pure"].includes(resolver.stateMutability) && resolver.outputs.length === 1 && resolver.outputs[0].type === "address" && resolver.inputs.length <= 32, "invalid-resolver");
      const parsed = permissions(item); bad(parsed.writes.every((f) => !f.inputs.some(hasDynamicBytes)), "nested-calldata-not-allowed");
      return { ...parsed, resolver };
    });
    return { ...policy, resolved };
  });
}
