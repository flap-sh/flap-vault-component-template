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
const MAX_FIXED_BYTES_PER_CALL = 4096;

function hasOnlyFields(value, keys) {
  return value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).every((key) => keys.includes(key));
}

function parseResolvedWriteConstraints(root, resolved, writes) {
  const constraints = new Map();
  if (resolved.writeConstraints !== undefined) {
    const rules = resolved.writeConstraints;
    bad(Array.isArray(rules) && rules.length > 0 && rules.length <= writes.length, "invalid-write-constraints");
    bad(root.codeHash && resolved.codeHash, "missing-code-hash");

    for (const rule of rules) {
      bad(hasOnlyFields(rule, ["selector", "fixedBytes", "valueWei"]), "invalid-write-constraints");
      bad(typeof rule.selector === "string" && rule.selector.length === 10 && /^0x[0-9a-f]{8}$/i.test(rule.selector), "invalid-constrained-selector");
      const selector = rule.selector.toLowerCase();
      const entry = writes.find((method) => toFunctionSelector(method) === selector);
      bad(entry && !constraints.has(selector), "invalid-constrained-selector");
      bad(Array.isArray(rule.fixedBytes) && rule.fixedBytes.length > 0 && rule.fixedBytes.length <= entry.inputs.length, "invalid-fixed-bytes");

      const fixedBytes = new Map();
      let totalBytes = 0;
      for (const bound of rule.fixedBytes) {
        bad(hasOnlyFields(bound, ["index", "length"]) && Number.isSafeInteger(bound.index) && bound.index >= 0 && entry.inputs[bound.index]?.type === "bytes" && !fixedBytes.has(bound.index), "invalid-fixed-bytes");
        bad(Number.isSafeInteger(bound.length) && bound.length > 0 && bound.length <= MAX_FIXED_BYTES_PER_CALL, "invalid-fixed-bytes");
        fixedBytes.set(bound.index, bound.length);
        totalBytes += bound.length;
      }
      bad(totalBytes <= MAX_FIXED_BYTES_PER_CALL, "invalid-fixed-bytes");

      let valueWei;
      if (rule.valueWei !== undefined) {
        bad(entry.stateMutability === "payable" && typeof rule.valueWei === "string" && /^(?:0|[1-9][0-9]{0,77})$/.test(rule.valueWei), "invalid-exact-value");
        valueWei = BigInt(rule.valueWei);
        bad(String(valueWei) === rule.valueWei && valueWei <= BigInt(resolved.maxValueWei), "invalid-exact-value");
      }
      constraints.set(selector, { fixedBytes, valueWei });
    }
  }

  for (const method of writes) {
    const fixedBytes = constraints.get(toFunctionSelector(method))?.fixedBytes;
    bad(method.inputs.every((input, index) => !hasDynamicBytes(input) || (input.type === "bytes" && fixedBytes?.has(index))), "nested-calldata-not-allowed");
  }
  return constraints;
}

const common = ["id", "allow", "read", "maxValueWei", "approvalSpenders", "maxApprovalWei", "codeHash"];
function identity(input, keys) {
  bad(hasOnlyFields(input, keys), "unknown-field");
  bad(typeof input.id === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(input.id) && input.id.length <= 64, "invalid-id");
  bad(input.codeHash === undefined || (typeof input.codeHash === "string" && input.codeHash.length === 66 && /^0x[0-9a-fA-F]{64}$/.test(input.codeHash)), "invalid-code-hash");
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
      identity(item, [...common, "resolver", "writeConstraints"]); bad(!ids.has(item.id), "duplicate-resolver"); ids.add(item.id);
      bad(typeof item.resolver === "string" && item.resolver.length <= 2048, "invalid-resolver"); const entries = parseAbi([item.resolver]); const resolver = entries[0];
      bad(entries.length === 1 && resolver.type === "function" && ["view", "pure"].includes(resolver.stateMutability) && resolver.outputs.length === 1 && resolver.outputs[0].type === "address" && resolver.inputs.length <= 32, "invalid-resolver");
      const parsed = permissions(item);
      const writeConstraints = parseResolvedWriteConstraints(input, item, parsed.writes);
      return { ...parsed, resolver, ...(writeConstraints.size ? { writeConstraints } : {}) };
    });
    return { ...policy, resolved };
  });
}
