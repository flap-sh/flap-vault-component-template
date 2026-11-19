import { parseAbi, toFunctionSelector, toFunctionSignature } from "viem";

export const VAULT_ASSEMBLY_ID = "vault-assembly-v1";
export const isVaultAssemblyChain = (chainId) => chainId === 56 || chainId === 97;
const [vaultAssemblyResolver, ...vaultAssemblyWrites] = parseAbi([
  "function businessVault() view returns (address)",
  "function commitTapeout(bytes32 commitment)",
  "function revealTapeout(address receiver,uint256[5] sortedIds,bytes netlist,bytes32 userNonce,bytes32 salt) payable returns (uint256 minerId)",
  "function verifyMiner(uint256 minerId) returns (bool)",
  "function approve(address spender,uint256 amount) returns (bool)",
  "function openFarmStake(uint256 tier,uint256 farmId) returns (uint256)",
  "function openFarmStakeAmount(uint256 tier,uint256 farmId,uint256 amount) returns (uint256)",
  "function buyFuel(uint256 id,uint256 tier,uint256 durationIndex,uint256 maximumCost) returns (uint256)",
  "function claimFarmProduction(uint256 id) returns (uint256)",
  "function claimMiner(uint256 id) returns (uint256)",
  "function claimStakePrincipal(uint256 id) returns (uint256)",
  "function claimStakeReward(uint256 id) returns (uint256)",
  "function claimMany(uint256[] minerIds) returns ((address token,address account,uint256[] minerIds,uint256[] amounts,uint256 total,uint256 positiveCount,uint64 asOf,bool complete,uint64 nextExpiry,uint256 asOfBlock))",
  "function claimRewards(address account,uint256[] miners,uint256[] stakes,uint256[] farms) returns ((address token,address account,(uint256[] ids,uint256[] amounts,uint256 total) miners,(uint256[] ids,uint256[] amounts,uint256 total) stakes,(uint256[] ids,uint256[] amounts,uint256 total) farms,uint256 total,uint256 positiveCount,uint256 asOfBlock,uint64 asOf,bool complete,uint64 nextExpiry))",
  "function createFarm(string name,uint256 expectedBurnCost,string logoCID) returns (uint256)",
  "function upgradeFarm(uint256 id)",
  "function joinFarm(uint256 id,uint256 farmId)",
  "function exitFarm(uint256 id)",
]);

const forbiddenName = /^(?:execute(?:Call|Batch)?|multicall|delegatecall|approve|increaseAllowance|decreaseAllowance|setApprovalForAll|transferOwnership|acceptOwnership|upgradeTo.*|setConfig|setSwapPath|setSplit)$/i;
const forbiddenSignatures = ["executeCall(address,uint256,bytes)", "approve(address,uint256)", "setApprovalForAll(address,bool)", "transferOwnership(address)", "upgradeTo(address)", "upgradeToAndCall(address,bytes)"];
const forbiddenSelectors = new Set(forbiddenSignatures.map(toFunctionSelector));
const executeSelectors = new Set(["execute(address,uint256,bytes,uint8)", "execute(address,uint256,bytes)"].map(toFunctionSelector));
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

function sameParameters(actual, expected) {
  return actual.length === expected.length && actual.every((parameter, index) =>
    parameter.type === expected[index].type
      && sameParameters(parameter.components ?? [], expected[index].components ?? []));
}

function sameFunction(actual, expected) {
  return toFunctionSignature(actual) === toFunctionSignature(expected)
    && actual.stateMutability === expected.stateMutability
    && sameParameters(actual.outputs, expected.outputs);
}

function parseVaultAssembly(input) {
  requireRule(Object.keys(input).every((key) => ["id", "label", "resolver", "allow"].includes(key))
    && input.label === "vault", "invalid-assembly-declaration");
  requireRule(sameFunction(func(input.resolver), vaultAssemblyResolver), "invalid-assembly-resolver");
  requireRule(Array.isArray(input.allow) && input.allow.length >= 2
    && input.allow.length <= vaultAssemblyWrites.length, "invalid-assembly-writes");
  const declared = input.allow.map(func);
  const writes = vaultAssemblyWrites.filter((method) => declared.some((entry) => sameFunction(entry, method)));
  requireRule(writes.length === declared.length
    && vaultAssemblyWrites.slice(0, 2).every((method) => writes.includes(method)), "invalid-assembly-writes");
  return { definition: structuredClone(input), resolver: structuredClone(vaultAssemblyResolver), writes: structuredClone(writes), reads: [] };
}

export function parseResolvedContract(input) {
  requireRule(input && typeof input === "object" && !Array.isArray(input), "invalid-declaration");
  if (input.id === VAULT_ASSEMBLY_ID) return parseVaultAssembly(input);
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
    // Only an explicitly declared execute signature may carry nested calldata.
    // Its semantics and arguments must be reviewed with the artifact by the host.
    const reviewedExecute = f.name === "execute";
    requireRule(!["view", "pure"].includes(f.stateMutability) && (reviewedExecute || !forbiddenName.test(f.name)) && !forbiddenSelectors.has(selector) && (reviewedExecute || (!executeSelectors.has(selector) && !f.inputs.some(hasDynamicBytes))), "forbidden-write");
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
