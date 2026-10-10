import { parseAbi, toFunctionSelector } from "viem";

const forbiddenName = /^(?:execute(?:Call|Batch)?|multicall|delegatecall|approve|increaseAllowance|decreaseAllowance|setApprovalForAll|transferOwnership|acceptOwnership|upgradeTo.*|setConfig|setSwapPath|setSplit)$/i;
const forbiddenSignatures = ["execute(address,uint256,bytes,uint8)", "execute(address,uint256,bytes)", "executeCall(address,uint256,bytes)", "approve(address,uint256)", "setApprovalForAll(address,bool)", "transferOwnership(address)", "upgradeTo(address)", "upgradeToAndCall(address,bytes)"];
const forbiddenSelectors = new Set(forbiddenSignatures.map(toFunctionSelector));
const hash = /^0x[0-9a-fA-F]{64}$/;
const index = (x) => Number.isInteger(x) && x >= 0 && x < 32;
function requireRule(ok, reason) { if (!ok) throw new Error(`resolved-contract/${reason}`); }
function func(text) {
  requireRule(typeof text === "string" && text.length <= 512, "invalid-signature");
  const entries = parseAbi([text]);
  requireRule(entries.length === 1 && entries[0].type === "function", "invalid-signature");
  return entries[0];
}
const hasDynamicBytes = (p) => /^bytes(?:\[|$)/.test(p.type) || p.components?.some(hasDynamicBytes);
export function parseResolvedContract(input) {
  requireRule(input && typeof input === "object" && !Array.isArray(input), "invalid-declaration");
  const allowed = new Set(["id", "label", "resolver", "allow", "read", "payable", "maxValueWei", "codePattern", "codeHash", "implementationCodeHash", "checks"]);
  requireRule(Object.keys(input).every((k) => allowed.has(k)), "unknown-field");
  const definition = structuredClone(input);
  requireRule(typeof definition.id === "string" && definition.id.length <= 64 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(definition.id), "invalid-id");
  requireRule(["vault", "token", "nft"].includes(definition.label), "invalid-label");
  const resolver = func(definition.resolver);
  requireRule(["view", "pure"].includes(resolver.stateMutability) && resolver.outputs.length === 1 && resolver.outputs[0].type === "address" && resolver.inputs.length > 0 && resolver.inputs.length <= 32, "invalid-resolver");
  requireRule(Array.isArray(definition.allow) && definition.allow.length > 0 && definition.allow.length <= 16, "invalid-allow");
  const writes = definition.allow.map(func);
  const seen = new Set();
  for (const f of writes) {
    const selector = toFunctionSelector(f);
    requireRule(!["view", "pure"].includes(f.stateMutability) && !forbiddenName.test(f.name) && !forbiddenSelectors.has(selector) && !f.inputs.some(hasDynamicBytes), "forbidden-write");
    requireRule(!seen.has(selector), "duplicate-selector"); seen.add(selector);
  }
  const reads = definition.read === undefined || definition.read === "any" ? "any" : definition.read;
  requireRule(reads === "any" || (Array.isArray(reads) && reads.length <= 16), "invalid-read");
  const readFunctions = reads === "any" ? reads : reads.map(func);
  requireRule(readFunctions === "any" || readFunctions.every((f) => ["view", "pure"].includes(f.stateMutability)), "invalid-read");
  requireRule(definition.payable === undefined || typeof definition.payable === "boolean", "invalid-payable");
  if (definition.payable) requireRule(typeof definition.maxValueWei === "string" && /^[1-9][0-9]{0,77}$/.test(definition.maxValueWei) && BigInt(definition.maxValueWei) < 2n ** 256n, "missing-value-cap");
  else requireRule(definition.maxValueWei === undefined, "unexpected-value-cap");
  requireRule(definition.codePattern === undefined || ["none", "eip6551-proxy"].includes(definition.codePattern), "invalid-code-pattern");
  requireRule(definition.codeHash === undefined || hash.test(definition.codeHash), "invalid-code-hash");
  requireRule(definition.implementationCodeHash === undefined || (definition.codePattern === "eip6551-proxy" && hash.test(definition.implementationCodeHash)), "invalid-implementation-hash");
  requireRule(definition.checks === undefined || (Array.isArray(definition.checks) && definition.checks.length <= 8), "invalid-checks");
  for (const check of definition.checks ?? []) {
    requireRule(check && typeof check === "object" && !Array.isArray(check), "invalid-check");
    const keys = {
      owner: ["kind", "target"], ownerOf: ["kind", "target", "resolverArg"],
      recipient: ["kind", "function", "arg"], balance: ["kind", "function", "amountArg", "token", "owner"],
    }[check.kind];
    requireRule(Array.isArray(keys) && Object.keys(check).every((k) => keys.includes(k)) && keys.every((k) => k in check), "invalid-check");
    if (check.kind === "owner" || check.kind === "ownerOf") {
      requireRule(["vault", "resolved"].includes(check.target), "invalid-check-target");
      if (check.kind === "ownerOf") requireRule(index(check.resolverArg) && resolver.inputs[check.resolverArg]?.type === "uint256", "invalid-check-argument");
    } else {
      const f = func(check.function);
      const selected = writes.find((w) => toFunctionSelector(w) === toFunctionSelector(f));
      requireRule(selected, "unknown-check-function");
      if (check.kind === "recipient") requireRule(index(check.arg) && selected.inputs[check.arg]?.type === "address", "invalid-check-argument");
      else requireRule(index(check.amountArg) && /^uint(?:[0-9]+)?$/.test(selected.inputs[check.amountArg]?.type ?? "") && ["token", "resolved"].includes(check.token) && ["user", "resolved"].includes(check.owner), "invalid-check-argument");
    }
  }
  return { definition, resolver, writes, reads: readFunctions };
}
