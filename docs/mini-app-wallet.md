# Shared wallet SDK for Vault UI and independent Apps

New development supports Vault UI and Mini App v2 only. Mini App v1 is deprecated for new development; existing bound-App SDK and wallet behavior remains compatible.

Vault UI and Mini App v2 use the same `@flapsdk/vault-runtime`, SDK implementation and host wallet. `latest` and `next` are release channels, not separate product SDKs. This change prepares `0.1.36-next.0`, based on stable template 0.1.35; publish it before upgrading consumer locks. It is not published by a local build.

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

A resolver is a reviewed view/pure function on its fixed root with a single address output. Returned targets must contain code; optional `codeHash` pins code for either roots or resolved targets. The runtime stores genuine handles privately, re-resolves before writes, simulates dynamic writes and checks again before forwarding. Addresses supplied by an external token API, copied handles and handle/address overrides do not authorize transactions. Dynamic targets cannot expose nested dynamic-bytes execution methods. Dynamic token approvals use a resolver policy with the exact approve signature, approved spender addresses and a bounded `maxApprovalWei` too. Critical ownership/provenance must also be enforced on-chain: an application-side check cannot make upgrades or mining atomic.

## Shared transaction flow

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

The SDK must be released once, then both main host and Workbench must pin that exact package and lockfile. Remove the main host's old `vault-runtime-next` alias so both Vault and App components consume one package/context. A local private canary can be used for joint tests; it cannot be used as source-package npm provenance. Keep source ZIP packaging blocked until the official next version and gitHead exist. Do not claim mock transport tests prove any project's real launch/trade/claim flow.
