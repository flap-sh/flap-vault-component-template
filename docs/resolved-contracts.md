# Vault-resolved contracts, version 1

`match.bindings[].resolvedContracts` supports reviewed dynamic Vault-owned token/NFT modules without changing the Vault contract. It complements `withdrawNftAccount`; NULL bag withdrawal stays on the dedicated profile because it requires nested execution calldata, deployment pins and receipt-effect verification. A resolver must already exist on the Vault, accept one or more inputs and return exactly one address. NULL's `item(id)` tuple is not such a resolver.

Declare a policy only on its factory binding, for example:

```json
"resolvedContracts": [{
  "id": "position",
  "label": "nft",
  "resolver": "function poolOf(uint256 round) view returns (address)",
  "allow": ["function claim(uint256 amount,address to)"],
  "read": ["function pending() view returns (uint256)"],
  "checks": [
    { "kind": "owner", "target": "resolved" },
    { "kind": "recipient", "function": "function claim(uint256 amount,address to)", "arg": 1 }
  ]
}]
```

The signatures above are an illustration, not NULL ABI. Include the actual reviewed ABI. A declaration is review intent; production authorization comes from the host accepting the hash-verified artifact and its binding. Workbench prints every resolver, signature, code constraint, check and native-value cap, and always requires manual review. Do not accept an unreviewed manifest as authorization. Vault/factory provenance, upgrade authority and actual method semantics must be checked during review.

```ts
const position = await sdk.resolveContract("position", [round]);
// Use the genuine handle, never position.address as a write target.
const prepared = await sdk.simulateContract({
  contract: position,
  abi: parseAbi(["function claim(uint256 amount,address to)"]),
  functionName: "claim",
  args: [amount, sdk.wallet.address],
});
const hash = await sdk.writeContract(prepared.request);
const receipt = await sdk.waitForTx(hash);
if (receipt.status === "success") await sdk.refetch();
// Localize success/failure states and disable repeat clicks while pending.
```

Handles are frozen informational objects backed by a private WeakMap. Clones, forged handles, another Provider's handles, and handle+address overrides are rejected. Arguments/ABI and host policy/context are snapshotted to prevent mutation during asynchronous checks. Provider/context replacement invalidates old handles. Never persist a handle; resolve it again after a host/wallet change.

For writes, the runtime re-resolves the address, checks code and fixed predicates at one block, simulates, then repeats checks immediately before sending. It confirms the current wallet and network, including after simulation. Failed checks send nothing. Wallet confirmation/mining happen later: client checks are not an atomic on-chain allowlist and cannot prevent an upgrade or state change in that interval. Target contracts must enforce ownership and other critical permissions themselves. A successful generic receipt does not prove a token transfer effect; NULL's detailed receipt verification remains exclusive to its dedicated profile.

## Deliberately bounded rules

- At most 8 definitions per factory binding, 16 write signatures per definition, 8 fixed checks. Resolver signatures are view/pure, have 1-32 inputs and exactly one address output.
- Writes require an exact declared selector and reviewed ABI encoding. `execute`, `executeCall`, `executeBatch`, multicall, delegatecall, approvals and listed administrative methods/selectors are excluded. Dynamic `bytes` inputs, including tuple/array forms, are excluded to prevent nested calldata. These syntactic exclusions do not establish safety of a differently named function; review the code and arguments.
- Native value defaults to zero. `payable: true` requires a positive decimal `maxValueWei` and the selected function must be payable. The cap is per transaction, not a cumulative spending limit. General fee/gas ceilings remain unchanged.
- `read` defaults to `"any"` view/pure ABI methods; use a signature list for tighter reads.
- `codePattern: "eip6551-proxy"` verifies the full reference proxy shape including its footer. `codeHash` pins the runtime bytecode. `implementationCodeHash` is allowed only with that proxy pattern and pins its embedded implementation. A shape check alone does not prove registry provenance, NFT ownership or trusted implementation. Review/check these separately; NULL's dedicated profile does so.
- Fixed checks: `owner` calls owner() on Vault/resolved target; `ownerOf` calls ownerOf(resolver argument) and compares with sender; `recipient` compares a method's address argument with sender; `balance` bounds a method's uint argument by token balanceOf(user/resolved). Function/argument indexes are explicit. No arbitrary predicate strings, callback, expression evaluation or DSL.

## Raw targets and host integration

Production uses `contractTargetPolicy="strict"` (the default). Raw writes only reach the host's current Vault/token/factory, payment/quote/dividend token or active binding's declared fixed targets. A `contract: "nft"` label does not grant an address permission. Generic raw writes to a recognized EIP-6551 reference proxy fail regardless of its address or execution selector; use a dedicated profile or reviewed handle. The code-pattern check cannot identify every custom account implementation.

Local template and Workbench preview use `"warn"` to inventory legacy derived writes. The checker emits `manual-review/legacy-derived-write-target`. This is a migration aid, never production authorization; migrate affected artifacts before strict rollout. Reads keep their existing address behavior. Fixed external contracts remain declared in `externalContracts`.

`VaultRuntimeProvider` is available only from `@flapsdk/vault-runtime/host`, which artifact imports cannot access. Component SDK module shims remove the Provider even on older installed runtimes. The host refuses a resolvedContracts artifact unless `RESOLVED_CONTRACTS_VERSION === 1` and runtime-contract flags `resolvedContracts`, `strictContractTargets`, and `hostOnlyProvider` are all 1. Existing artifacts must also be checked for raw derived writes before upgrading the production host.

## Validation and release

Run `yarn test:resolved-contracts`, `yarn test:runtime-provider`, `yarn test:nft-account-withdrawal`, lint/typecheck and checker selftests. Tests include genuine/forged/expired handles, post-resolution address/code/implementation/owner/wallet/chain changes, ABI/selectors, native-value caps, recipient/balance, overloads, manifest/context mutation and real React Provider wiring with mocked chain clients. They are not an audit or a real project's fork proof.

Commit SDK changes, build one protected canary with `yarn runtime:pack:canary`, and run the same tarball in Workbench and the main host through `runtime:test:canary`. Official release packaging retains its existing freshness/main gate. After review/merge/release, update both consumers to the exact published runtime and lockfile. No npm publication, live approval, live transaction or contract modification is part of this branch.
