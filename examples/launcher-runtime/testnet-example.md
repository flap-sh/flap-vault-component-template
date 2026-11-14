# Pool Launch UI Demo on BSC Testnet

[Developer guide](README.md) · [简体中文](testnet-example.zh-CN.md)

The example covers creation, fundraising, token issuance, and post-launch claims for one reviewed factory pair.

- [Launcher source](launcher-demo/Component.tsx), [manifest](launcher-demo/manifest.json), and [translations](launcher-demo/i18n.json).
- [Companion Vault source](../../src/vaults/vault-demo/Component.tsx), [manifest](../../src/vaults/vault-demo/manifest.json), [ABI](../../src/vaults/vault-demo/VaultABI.ts), and [translations](../../src/vaults/vault-demo/i18n.json).

| BSC Testnet, chain ID 97 | Address |
| --- | --- |
| Launcher Factory | `0xc574f30e2ee26fe638eece6d9876217015cd0a38` |
| Vault Factory | `0xb89113e16c78989b7bccf5d0e13e99bf2c58dc32` |
| Pool Launch Portal | `0x000042108465206185a077edc3f3fd2b49060000` |
| Issued token used for Vault acceptance | `0x6d36b2959b88f5d9c3f83badd20405a4bcf37777` |

The two factories are separate contracts. The host approves their pairing. The issued token in the Vault manifest is a test fixture for acceptance. Factory-scoped mapping can serve later tokens from that Vault Factory under the configured CA policy.

## Run the example locally

Use Node.js 24 and Yarn 1.22.22. The official `main` branch includes the registered Vault preview route.

~~~sh
git clone --branch main \
  https://github.com/flap-sh/flap-vault-component-template.git
cd flap-vault-component-template
yarn install --frozen-lockfile
yarn launcher:check-source examples/launcher-runtime/launcher-demo
yarn typecheck
yarn dev
~~~

The Launcher source check reports the example's declared chain, Launcher Factory and configuration contract for handoff.

Use the local Vault preview to check layout, translations, wallet connection and read failures. During acceptance, the generic Template host reported `chain-read-unavailable` for the example's market phase and risk context. The Vault renders the corresponding warning and checks the wallet, market phase and account data before enabling actions. A compatible testnet host provides the full Launcher and Vault flow. [Open the local Vault preview](http://localhost:3000/vault-demo?chainId=97&factoryAddress=0xb89113e16c78989b7bccf5d0e13e99bf2c58dc32&tokenAddress=0x6d36b2959b88f5d9c3f83badd20405a4bcf37777&vaultAddress=0xcfa21bea1f9a3fef5907230ca30a3d37f404d321)

The companion Vault source was validated with `@flapsdk/vault-runtime@0.1.42`. Formal Vault acceptance requires an official stable Template checkout that satisfies the SDK provenance and freshness checks. The example uses `vault-demo` as its source folder. [Vault source package guide](../../docs/artifact-intake.md)

~~~sh
yarn vault:register vault-demo
yarn vault:check vault-demo
yarn vault:e2e vault-demo --chain 97 \
  --factory 0xb89113e16c78989b7bccf5d0e13e99bf2c58dc32 \
  --token 0x6d36b2959b88f5d9c3f83badd20405a4bcf37777 \
  --vault 0xcfa21bea1f9a3fef5907230ca30a3d37f404d321
yarn vault:package vault-demo
yarn vault:verify-package dist/vault-demo.zip
~~~

If E2E reports a missing Chromium installation, run `yarn playwright install chromium`. If the generic preview cannot resolve the chain context, pass `--base-url` with a Template E2E-compatible preview that serves the current source and provides the runner's source attestation.

## Launcher host contract

The Launcher manifest uses schema 2, `kind: "launcher-ui"`, and `configContract: "crowd-native-create/v1"`. The configuration contract identifier selects the factory adapter in the Flap host. Keep the `LauncherConfig` and `Launcher` named exports and the same message keys in `en`, `zh` and `ko`. The host passes the selected language's messages as `Record<string, string>`.

### LauncherConfig

The component receives `{ context, messages, resources, onChange }`.

- `context` contains `previewOnly`, `locale`, `identity`, `configContract: { id: "crowd-native-create", version: 1 }`, `initialValues` and `constraints`. The identity includes `market: "pool-launch"`, `factoryKind: "launcher"`, `chainId: 97` and `factoryAddress`.
- `onChange(values)` sends the complete draft with seven string fields. The fields are `name`, `symbol`, `description`, `metadataCid`, `targetRaiseWei`, `saleDurationSeconds` and `contributorBps`. The numeric values are decimal strings in native wei, seconds and basis points respectively.
- `constraints` contains `minimumTargetWei`, `maximumTargetWei`, `launchMinimumTargetWei` (string or null), `launchFloorAvailable`, `maxSaleDurationSeconds`, `minContributorBps` and `maxContributorBps`. The host uses the higher of the factory minimum and the live Portal minimum. An unavailable Portal floor blocks preparation.
- Check `resources.available` before calling `resources.uploadTokenMetadata({ name, symbol, description, image })`. The selected image is a browser `File`. A successful upload returns `Promise<{ cid: string }>`. Use the returned CID for the matching metadata. Clear it when the name, symbol, description or image changes.

A draft before metadata upload can use the following values. Adjust the target to the live Portal minimum shown by the host.

```json
{
  "name": "Pool Launch Demo",
  "symbol": "POOLDEMO",
  "description": "Pool Launch testnet example",
  "metadataCid": "",
  "targetRaiseWei": "3000000000000000000",
  "saleDurationSeconds": "3600",
  "contributorBps": "5000"
}
```

The host validates the draft, prepares the exact request and shows the creation review. The user confirms the transaction in their wallet.

### Launcher

The component receives `{ context, messages, host }`.

- `context` contains `previewOnly`, `locale`, `identity`, `launcherAddress`, `snapshot` and `tokenTaxInfoHref`. The last three can be null. Render loading or unavailable states while the host obtains the snapshot. A guest snapshot has `account: null`.
- The snapshot includes the observed block and deadline, target and raised amounts, participation, issuance and refund state, actual token and pool addresses, and verified Vault information. `expectedToken` is the predicted address. Use `tokenAddress` and `launched` for issued-token state. Native amounts use wei. `launcherClaimableWei` and `launcherClaimedWei` are token base units. Deadline and block timestamp use Unix seconds.
- Check `host.available` and the relevant snapshot state before calling `host.requestAction(action, amountWei?)`. The action is `"contribute"`, `"launcher-claim"`, `"refund"` or `"vault-claim"`. Contribute takes a positive decimal integer string in wei. Omit the amount for the other actions. The promise represents the host preparation and review request. The wallet and receipt verification stay with the host.
- `host.refresh()` requests a fresh snapshot. Use the supplied `context.tokenTaxInfoHref` as the Vault navigation target when present. The host may preserve an approved companion artifact version in this URL.

Treat `context` as read-only. `previewOnly` describes capability restrictions. An interactive published-artifact preview on an enabled test host can supply `previewOnly: false`.

## Hand off and test the Launcher

To test just the Launcher, run the following command from the template root. Send Flap the resulting ZIP, chain and Launcher Factory address.

```bash
yarn launcher:package examples/launcher-runtime/launcher-demo
```

The command validates the source and writes `dist/launcher-demo-testnet-v1-launcher.zip`. Workbench performs final validation before build and publication. [Launcher source checks](README.md#check-your-launcher-source)

To test both UIs, send both source directories, both factory addresses, and the Vault acceptance token. Include any verified Vault source package you already have. Flap prepares one `flap-factory-pair-source-v2` ZIP for Workbench. Each built runtime has its own immutable version. The Launcher artifact uses `flap-launcher-runtime-v1`.

For normal Pool Launch routing, a caller with `AUDITOR_ROLE` maps the Launcher Factory to its Launcher artifact at scope 5. For a custom Vault UI, the operator also maps the Vault Factory at scope 3. On the enabled testnet host, the mapped factory opens creation at `/create/launcher?chain=bnb-testnet&factory=<launcher-factory>` and detail at `/launcher/<launcher-address>?chain=bnb-testnet`.

To preview a published Launcher before registry mapping, open the Workbench link with `artifactPath`. When a custom Vault UI is included, the link also carries `vaultArtifactPath` and the Vault page receives that version as its own `artifactPath`.

1. Connect a BSC Testnet wallet with enough tBNB for the operation and fees. Upload the token metadata, review the creation request, and confirm it. Open the new Launcher after the host verifies its creation receipt.
2. Review and approve a contribution. After the receipt succeeds, check the raised amount and your position. A contribution that fills the target can issue the token and create its pool and Vault in the same transaction.
3. After the host verifies issuance, open `/bnb-testnet/<issued-token>` to check the trade page. If your submission includes a Vault UI, use the same issued address at `/bnb-testnet/<issued-token>/taxinfo` to verify the Vault artifact and its on-chain context.
4. Claim allocated tokens from the Launcher with an eligible contributor account. Check the amount after the receipt succeeds. If your submission includes a Vault UI, also check cumulative revenue and the account's claimable amount. Vault revenue claims require a positive claimable amount and the eligible market phase.
5. For the refund path, use a separate Launcher that misses its target. After the deadline, confirm a refund from an account with a refundable contribution and check the updated amount.
