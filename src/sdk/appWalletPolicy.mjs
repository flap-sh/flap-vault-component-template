import { parseAbi, toFunctionSelector, isAddress } from "viem";
export const APP_ERC20_APPROVAL_VERSION = 1;
export function hasAppErc20Approval(contracts) {
  return Array.isArray(contracts) && contracts.some((entry) => entry && typeof entry === "object" && Object.hasOwn(entry, "erc20Approval"));
}
const bad = (ok, reason) => { if (!ok) throw new Error(`app-wallet/${reason}`); };
const address = (a) => typeof a === "string" && isAddress(a, { strict: false }) && !/^0x0{40}$/i.test(a);
const identifier = (id) => typeof id === "string" && id.length <= 64 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id);
export const ERC20_APPROVE_SELECTOR = "0x095ea7b3";
export const PRESALE_CONTRIBUTE_QUOTE_SELECTOR = toFunctionSelector("contributeQuote(uint256)");
const admin = /^(?:execute(?:Call|Batch)?|multicall|delegatecall|setApprovalForAll|transferOwnership|acceptOwnership|upgradeTo.*|setConfig|setSwapPath|setSplit|increaseAllowance|decreaseAllowance)$/i;
const forbiddenSelectors = new Set(["execute(address,uint256,bytes,uint8)", "execute(address,uint256,bytes)", "executeCall(address,uint256,bytes)", "setApprovalForAll(address,bool)", "transferOwnership(address)", "upgradeTo(address)", "upgradeToAndCall(address,bytes)"].map(toFunctionSelector));
function signatures(items, read = false) {
  bad(Array.isArray(items) && items.length <= 32, "invalid-signatures");
  const abi = items.map((text) => { bad(typeof text === "string" && text.length <= 2048, "invalid-signature"); const entries = parseAbi([text]); bad(entries.length === 1 && entries[0].type === "function", "invalid-signature"); const f = entries[0]; bad(read ? ["view", "pure"].includes(f.stateMutability) : !["view", "pure"].includes(f.stateMutability) && !admin.test(f.name) && !forbiddenSelectors.has(toFunctionSelector(f)), "forbidden-function"); return f; });
  bad(new Set(abi.map(toFunctionSelector)).size === abi.length, "duplicate-selector"); return abi;
}
function approvalCap(value) {
  bad(typeof value === "string" && /^[1-9][0-9]{0,77}$/.test(value) && BigInt(value) < 2n ** 256n, "missing-approval-cap");
}
function validateErc20Approval(input) {
  bad(input && typeof input === "object" && !Array.isArray(input)
    && Object.keys(input).every((key) => ["allowlist", "maxApprovalWei"].includes(key)), "invalid-erc20-approval");
  const list = input.allowlist;
  bad(Array.isArray(list) && list.length > 0 && list.length <= 64
    && (list.length === 1 && list[0] === "*" || list.every(address)
      && new Set(list.map((item) => item.toLowerCase())).size === list.length), "invalid-erc20-approval-allowlist");
  approvalCap(input.maxApprovalWei);
  bad(BigInt(input.maxApprovalWei) < (1n << 256n) - 1n, "unlimited-erc20-approval");
}
function permissions(input, allowEmpty = false) {
  const writes = signatures(input.allow ?? []); const reads = signatures(input.read ?? [], true);
  bad(allowEmpty || writes.length + reads.length > 0, "empty-permissions");
  bad(input.maxValueWei === undefined || typeof input.maxValueWei === "string" && /^[1-9][0-9]{0,77}$/.test(input.maxValueWei) && BigInt(input.maxValueWei) < 2n ** 256n, "invalid-value-cap");
  if (writes.some((f) => f.stateMutability === "payable")) bad(input.maxValueWei !== undefined, "missing-value-cap");
  const approves = writes.filter((f) => f.name === "approve" || toFunctionSelector(f) === ERC20_APPROVE_SELECTOR);
  if (approves.length) {
    bad(approves.every((f) => f.name === "approve" && f.inputs.length === 2 && f.inputs[0].type === "address" && f.inputs[1].type === "uint256"), "invalid-approve");
    bad(Array.isArray(input.approvalSpenders) && input.approvalSpenders.length > 0 && input.approvalSpenders.length <= 8 && input.approvalSpenders.every(address), "missing-approval-spenders");
    approvalCap(input.maxApprovalWei);
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
  bad(identifier(input.id), "invalid-id");
  bad(input.codeHash === undefined || (typeof input.codeHash === "string" && input.codeHash.length === 66 && /^0x[0-9a-fA-F]{64}$/.test(input.codeHash)), "invalid-code-hash");
}

function checkPresaleApproval(declaration, resolved) {
  if (declaration === undefined) return;
  bad(hasOnlyFields(declaration, ["policyId", "launcherResolver", "maxApprovalWei"]) && identifier(declaration.policyId) && identifier(declaration.launcherResolver), "invalid-presale-approval");
  const cap = declaration.maxApprovalWei;
  bad(typeof cap === "string" && /^[1-9][0-9]{0,77}$/.test(cap) && BigInt(cap) < (2n ** 256n - 1n), "invalid-presale-approval-cap");
  const launcher = resolved.find((entry) => entry.definition.id === declaration.launcherResolver);
  bad(launcher?.writes.some((entry) => entry.name === "contributeQuote" && entry.stateMutability === "nonpayable"
    && entry.inputs.length === 1 && entry.inputs[0].type === "uint256" && entry.outputs.length === 0), "invalid-presale-launcher-resolver");
}
/** Pure parser shared by checker and host; no declarations authorize unreviewed artifacts. */
export function parseAppWalletContracts(value) {
  bad(Array.isArray(value) && value.length > 0 && value.length <= 16, "invalid-contracts");
  const ids = new Set(); const targets = new Set();
  return value.map((input) => {
    identity(input, [...common, "chainId", "address", "resolvedContracts", "presaleApproval", "erc20Approval"]);
    bad(Number.isSafeInteger(input.chainId) && input.chainId > 0 && address(input.address), "invalid-target");
    const key = `${input.chainId}:${input.address.toLowerCase()}`; bad(!targets.has(key) && !ids.has(input.id), "duplicate-contract"); targets.add(key); ids.add(input.id);
    if (Object.hasOwn(input, "erc20Approval")) validateErc20Approval(input.erc20Approval);
    const policy = permissions(input, Boolean(input.erc20Approval));
    bad(input.resolvedContracts === undefined || Array.isArray(input.resolvedContracts) && input.resolvedContracts.length <= 8, "invalid-resolvers");
    const resolved = (input.resolvedContracts ?? []).map((item) => {
      identity(item, [...common, "resolver", "writeConstraints"]); bad(!ids.has(item.id), "duplicate-resolver"); ids.add(item.id);
      bad(typeof item.resolver === "string" && item.resolver.length <= 2048, "invalid-resolver"); const entries = parseAbi([item.resolver]); const resolver = entries[0];
      bad(entries.length === 1 && resolver.type === "function" && ["view", "pure"].includes(resolver.stateMutability) && resolver.outputs.length === 1 && resolver.outputs[0].type === "address" && resolver.inputs.length <= 32, "invalid-resolver");
      const parsed = permissions(item);
      const writeConstraints = parseResolvedWriteConstraints(input, item, parsed.writes);
      return { ...parsed, resolver, ...(writeConstraints.size ? { writeConstraints } : {}) };
    });
    checkPresaleApproval(input.presaleApproval, resolved);
    return { ...policy, resolved };
  });
}
