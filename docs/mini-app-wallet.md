# Shared wallet SDK for Vault UI and independent Apps

New development supports Vault UI and Mini App v2 only. Mini App v1 is deprecated for new development; existing bound-App SDK and wallet behavior remains compatible.

Vault UI and Mini App v2 use the same `@flapsdk/vault-runtime`, SDK implementation and host wallet. The shared stable **`0.1.38` is published on npm latest** (checked 2026-10-23). All historical next versions are deprecated, with downloads retained. `latest` and `next` are channels, not separate SDKs. See [main/latest release and host rollout status](main-migration.md).

Existing Vault UI keeps `const sdk = useFlapSdk()` and its bound Token/Vault context. Independent Apps use `const sdk = useFlapSdk({ chainId: 56 })` from `@/src/sdk`, with no fake CA or factory binding. `useMiniAppSdk()` remains backward compatible for old App identity/session consumers; its `forChain(56)` returns the same chain API.

The chain API provides `wallet`, `readContract`, `simulateContract`, `writeContract`, `resolveContract`, `waitForTx`, `getBalance`, `getGasPrice`, `getBlockNumber`, bounded `getContractEvents`, `uploadImage`, `uploadText`, `openExplorerTx` and declared-contract `sendTransaction`. Vault-specific NFT account withdrawals, resolved module policies and token-market context retain their existing bound APIs; independent identity does not invent those contexts. A wallet transaction does not require a second SIWE login. Session authentication is distinct from the connected signing wallet.

## Declare reviewed transaction capabilities

Add `walletChains` and `walletContracts` to the standalone manifest. Omit both for existing read-only Apps. Network IDs must be supported by the host. Fixed targets require exact function signatures; payable functions require a positive decimal `maxValueWei`. ERC20 approve requires `approvalSpenders` and `maxApprovalWei` and never permits a different spender or unlimited approval above the declared cap.

This is illustrative ABI, not the Flap Portal ABI or a deployable factory. Use the actual reviewed deployment addresses and signatures. No transaction is sent by declaring a manifest.

```json
"walletChains": [56],
"walletContracts": [{
  "id": "portal",
  "chainId": 56,
  "address": "0x2222222222222222222222222222222222222222",
  "allow": ["function launch(uint256 version) payable", "function buy(uint256 minOut) payable", "function sell(uint256 amount,uint256 minOut)"],
  "read": ["function vaultOf(address token) view returns (address)"],
  "maxValueWei": "100000000000000000",
  "resolvedContracts": [{
    "id": "rewards-vault",
    "resolver": "function vaultOf(address token) view returns (address)",
    "allow": ["function claim()"],
    "read": ["function pending(address wallet) view returns (uint256)"]
  }]
}]
```

A resolver is a reviewed view/pure function on its fixed root with a single address output. Returned targets must contain code; `codeHash` pins deployed bytecode for either roots or resolved targets. The runtime stores genuine handles privately, re-resolves before writes, simulates dynamic writes and checks again before forwarding. Addresses supplied by an external token API, copied handles and handle/address overrides do not authorize transactions. Dynamic token approvals use a resolver policy with the exact approve signature, approved spender addresses and a bounded `maxApprovalWei` too. Critical ownership and provenance must also be enforced on-chain.

### Fixed-length inputs declared as `bytes`

A standalone resolver can declare `writeConstraints` when a reviewed method takes an exact-length payload encoded as ABI `bytes`. Set `codeHash` on both the fixed root and resolved target. Each rule selects a single entry from the resolver's `allow` list by its four-byte function selector, and must list every top-level `bytes` parameter with its zero-based ABI input index and exact length in bytes. The lengths must be positive integers and sum to at most 4096 per method. An optional decimal `valueWei` sets the exact native value for a payable method within its existing `maxValueWei`.

For example, use this rule for a method that stores a 12-byte tag. Generate the selector when authoring the manifest and put the resulting hex string in JSON.

```ts
import { toFunctionSelector } from "viem";

const signature = "function storeTag(uint256 recordId, bytes tag)";
const rule = {
  selector: toFunctionSelector(signature),
  fixedBytes: [{ index: 1, length: 12 }],
};
// Use signature in the resolver's allow list and rule in its writeConstraints.
```

The runtime checks constraints before simulation and again before wallet forwarding, using the genuine resolver handle and the reviewed ABI. Nested `bytes`, `bytes[]`, and prohibited execution or administrative methods remain blocked. Review how the contract interprets the payload and vet upgrade controls. A bytecode hash of a proxy does not pin its implementation. Length checks cover the payload size, so the contract must enforce its own payload semantics and authorization.

Use this field after the template, Workbench, and host runtime support `sdkFeatures.resolvedWriteConstraints: 1` from the same coordinated release.

## Shared transaction flow

`waitForTx(hash)` polls the original transaction hash through the public client selected for that operation. It queries immediately, then every 2 seconds after a pending or transient-error response, with an 8-second deadline per query and a 180-second total deadline. It returns the original success/reverted status; applications must check `status === "success"` before showing success or refreshing as successful. A timeout means the result is unknown: retain the hash and reconcile it before offering another transaction. Polling does not follow sped-up or cancelled replacement transactions; the original hash can time out. The public API and receipt fields remain compatible.

```tsx
import { parseAbi } from "viem";
import { useFlapSdk } from "@/src/sdk";

const sdk = useFlapSdk({ chainId: 56 });
// sdk.wallet.address/isConnected/isWrongNetwork use the host wallet.
// Offer sdk.wallet.connect() or explicit sdk.wallet.switchChain() as appropriate.

// Launch and buy/sell use a declared fixed Portal/factory address with its real ABI.
const prepared = await sdk.simulateContract({
  address: reviewedPortalAddress,
  abi: portalAbi,
  functionName: actualLaunchMethod,
  args: validatedLaunchArguments,
  value: nativeQuoteAmount,
});
const hash = await sdk.writeContract(prepared.request);
const receipt = await sdk.waitForTx(hash);
if (receipt.status !== "success") throw new Error("Transaction reverted");
// receipt.blockNumber and receipt.logs are available for launch event decoding.

// Rewards use a genuine handle, never an arbitrary API-returned address.
const vault = await sdk.resolveContract("rewards-vault", [selectedToken]);
const claim = await sdk.simulateContract({
  contract: vault, abi: parseAbi(["function claim()"]), functionName: "claim",
});
const claimHash = await sdk.writeContract(claim.request);
const claimReceipt = await sdk.waitForTx(claimHash);
if (claimReceipt.status === "success") await reloadRewards();
```

Localize product copy, disable repeated actions while pending, show selected token/target, amounts, recipient, slippage/minimum output and allowance before confirmation, handle rejection/reverts, and refresh only after successful receipts. Launch and trade still use the real Portal ABI/business rules, including native quote restrictions and regular/tax-token differences. The SDK is a wallet bridge, not an implementation of those product flows.

`sendTransaction({ to, data, value })` is an encoding alternative for a declared fixed contract. The host decodes and re-encodes against the reviewed signatures and checks the same limits. It cannot send arbitrary calldata, bypass resolvers, or transfer native currency to undeclared recipients.

## Preview, review and release

The template and Workbench use their enclosing host wallet provider, without injected-wallet access in uploaded source. Explicit `?appSession=guest` and `?appSession=connected` remain deterministic read-only fixtures. Default previews use a real connected wallet; authenticated login is only available inside the main Flap host. No fixture is proof of a real transaction.

Workbench prints `review.standaloneWallet` and displays the complete declared policy for human review. Upload, source hash, endpoint, asset and npm provenance checks remain required. New helper/policy files are explicitly included in Vercel validator tracing. No contract or endpoint receives implicit approval.

The published stable runtime is `0.1.38` on latest, with source `1220ee9813f73eafd434decb365a08ae6a681445`. Hosts must pin the same exact package and lockfile with matching validation inputs; source ZIPs retain the exact published version/gitHead and matching runtime/build/protocol inputs. App commands and CI use main/latest. Local canaries and mock transports remain integration tests, not uploaded ZIP provenance or proof of a project’s live launch/trade/claim flow. See [release status](main-migration.md).
