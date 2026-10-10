# Reviewed NFT account withdrawal

The first profile is `null-bag-withdraw-v1`. It withdraws the bag ERC20 from a live NFT's EIP-6551 account to its current connected holder. It does not withdraw native BNB, accept a recipient, expose arbitrary execution, approve tokens, or support burned NFTs. No NULL contract change is required.

Declare review intent on the applicable factory binding:

```json
"nftAccountWithdrawals": [
  { "policyId": "reviewed-withdrawal", "profile": "null-bag-withdraw-v1" }
]
```

A declaration never authorizes a transaction. Flap separately supplies `nftAccountWithdrawalPolicies` to its host-owned `VaultRuntimeProvider`. The default is empty. Do not put approval objects into source packages, manifest, runtimeContext.extraConfig, endpoints, or values read from a Vault. Artifact code cannot import/construct the provider or access SDK namespace/default exports.

Host approval is deployment-specific: artifact identity, chain, factory, token, Vault, NFT, registry, account implementation, actual registry salt, exact deployed code hashes, and both Vault/NFT beacon and implementation pins. A reviewed factory alone is insufficient. The account implementation contains per-deployment immutable NFT/Vault addresses; its runtime hash is not a universal NULL hash. Verify the factory creation event/provenance and audit findings before enrolling the exact deployment. The host artifact registry must also verify the artifact's content hashes. Vault/NFT implementation changes invalidate approval until reviewed again.

```ts
if (typeof sdk.withdrawNftAccount !== "function") {
  // Render a localized disabled/unavailable state on an older host.
  return;
}
const receipt = await sdk.withdrawNftAccount({
  policyId: "reviewed-withdrawal",
  tokenId,
  amount, // bag ERC20 base units
});
```

The runtime derives the wallet locally using the EIP-6551 reference deployment code and compares registry.account, walletOf, tokenIdOfWallet, account code/footer and immutable back-references. It checks live ownerOf/controllerOf/owner, amount and balance; burned NFTs fail closed. Checks use one block per validation and are repeated after simulation immediately before signing. The wallet and chain are also checked before sending. A chain change, transfer or upgrade can still occur while a wallet confirmation is open; contract ownership checks remain authoritative, and a failed receipt is never shown as success. RPC integrity and the existing Guardian upgrade authority remain trust assumptions. Client validation cannot atomically prevent a Guardian upgrade between simulation and mining.

Only `execute(bag, 0, transfer(connectedHolder, amount), CALL)` is encoded. Generic simulateContract/writeContract reject the execute selector, including ABI aliases. Gas uses estimation plus margin with a 600,000 floor and the existing 5,000,000 ceiling; no global gas ceiling is widened. The simulation rejects an ERC20 false or malformed return, because the reviewed account implementation itself only checks low-level call success.

Handle all outcomes with localized copy:

| status | UI handling |
| --- | --- |
| `withdrawn` | Matching bag Transfer evidence confirmed. Display refreshed wallet/account balance and shares. Transfer-tax tokens may deliver less than the requested amount. |
| `withdrawn-sync-required` | Transfer confirmed, but the account emitted SyncFailed. Offer Vault.sync(tokenId); do not repeat withdrawal. |
| `reverted` | Failed transaction. Keep previous success state cleared and show failure. |
| `effect-unconfirmed` | Preserve the hash and show pending/verification needed; inspect receipt and chain state before retrying. No success message. |

The SDK returns the hash, recipient, account, requested amount, and receipt-block account balance when available. It triggers the normal refetch effect; the component must reload shares and recipient balance as well. Disable repeated clicks while awaiting the result. Do not call waitForTx again to reduce the detailed result to a generic success flag.

Deposit and sync remain existing permissions: transfer bag tokens to the NFT wallet, then call Vault.sync. These are separate transactions and each receipt must succeed independently. This profile does not add FSI indexing, kick, or a gallery UI.

## Verification and rollout

Run `yarn test:nft-account-withdrawal`, `yarn typecheck`, `yarn lint`, and checker selftests. Make a local feature commit, then run `yarn runtime:pack:canary` and test the same tarball in Workbench and the main host with `runtime:test:canary`. Canary testing never publishes a package or approves a deployment. Release the SDK from the official main workflow, then update both consumers' exact dependency and yarn.lock using that published version. Until then, consumers reject withdrawal artifacts on an older runtime; the production approval registry stays empty.

Before enabling a real deployment, run fork integration against its audited bytecode: owner/non-owner/burned cases, wrong registry/salt/wallet/footer, Beacon upgrades, transfer taxes and false returns, gas threshold, receipt reversion and SyncFailed, and post-transfer shares. Local mocked tests are not a completed contract audit or a fork execution proof.
