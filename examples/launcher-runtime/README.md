# Crowd Launcher and Vault UI example

[简体中文](README.zh-CN.md)

This test-branch example shows how to build three UI surfaces for one reviewed Crowd factory pair on BSC Testnet. The Launcher source exports the configuration and fundraising views. The companion Vault source uses the existing Vault SDK for revenue and claims.

- [Launcher source](crowd/Component.tsx), [manifest](crowd/manifest.json), and [translations](crowd/i18n.json).
- [Companion Vault source](../../src/vaults/crowd-vault/Component.tsx), [manifest](../../src/vaults/crowd-vault/manifest.json), [ABI](../../src/vaults/crowd-vault/VaultABI.ts), and [translations](../../src/vaults/crowd-vault/i18n.json).

| BSC Testnet, chain ID 97 | Address |
| --- | --- |
| Launcher Factory | `0xc574f30e2ee26fe638eece6d9876217015cd0a38` |
| Vault Factory | `0xb89113e16c78989b7bccf5d0e13e99bf2c58dc32` |
| Pool Launch Portal | `0x000042108465206185a077edc3f3fd2b49060000` |
| Issued token used for Vault acceptance | `0x6d36b2959b88f5d9c3f83badd20405a4bcf37777` |

The two factories are separate contracts. The host approves their pairing. The issued token in the Vault manifest is a test fixture for acceptance. Factory-scoped mapping can serve later tokens from that Vault Factory under the configured CA policy.

## Develop on the test branch

From the repository root, use Node.js 24 and Yarn 1.22.22.

~~~sh
git clone --branch test/crowd-launcher-v4 --single-branch \
  https://github.com/fsensen/flap-vault-component-template.git
cd flap-vault-component-template
yarn install --frozen-lockfile
yarn typecheck
yarn vault:register crowd-vault
yarn dev
~~~

The register command adds a local Template preview entry. Open `http://localhost:3000/crowd-vault`. For the issued fixture, pass `chainId=97`, the Vault Factory as `factoryAddress`, the issued token as `tokenAddress`, and `vaultAddress=0xcfa21bea1f9a3fef5907230ca30a3d37f404d321`. [Open the local Crowd Vault preview](http://localhost:3000/crowd-vault?chainId=97&factoryAddress=0xb89113e16c78989b7bccf5d0e13e99bf2c58dc32&tokenAddress=0x6d36b2959b88f5d9c3f83badd20405a4bcf37777&vaultAddress=0xcfa21bea1f9a3fef5907230ca30a3d37f404d321) The Template dev server provides the Vault preview. During this branch's acceptance check, the generic host reported `chain-read-unavailable` for the Crowd phase and risk context. The example renders that risk warning and derives action availability from the wallet, phase and account data. A Crowd-compatible Launcher host supplies the full configuration, fundraising and transaction-review flow.

The companion Vault source was validated with `@flapsdk/vault-runtime@0.1.42`. Use the official stable Template checkout and its required npm runtime provenance for the normal Vault check, E2E and package commands. The stable freshness check accepts the official template head. Use this test branch for `dev` and `typecheck`, and an official-head checkout for the formal acceptance commands. Follow the standard [Template guide](../../README.md) for supported validation. This branch supplies the example source and its integration contract. An authorized operator supplies the receiving Launcher host and factory-pair build workflow.

## Launcher host contract

The Launcher manifest uses schema 2, `kind: "launcher-ui"`, and `configContract: "crowd-native-create/v1"`. Keep the `LauncherConfig` and `Launcher` named exports and the same message keys in `en`, `zh` and `ko`. The host passes the selected language's messages as `Record<string, string>`.

### LauncherConfig

The component receives `{ context, messages, resources, onChange }`.

- `context` contains `previewOnly`, `locale`, `identity`, `configContract: { id: "crowd-native-create", version: 1 }`, `initialValues` and `constraints`. The identity includes `market: "pool-launch"`, `factoryKind: "launcher"`, `chainId: 97` and `factoryAddress`.
- `onChange(values)` sends the complete draft with seven string fields. The fields are `name`, `symbol`, `description`, `metadataCid`, `targetRaiseWei`, `saleDurationSeconds` and `contributorBps`. The numeric values are decimal strings in native wei, seconds and basis points respectively.
- `constraints` contains `minimumTargetWei`, `maximumTargetWei`, `launchMinimumTargetWei` (string or null), `launchFloorAvailable`, `maxSaleDurationSeconds`, `minContributorBps` and `maxContributorBps`. The host uses the higher of the factory minimum and the live Portal minimum. An unavailable Portal floor blocks preparation.
- Check `resources.available` before calling `resources.uploadTokenMetadata({ name, symbol, description, image })`. The selected image is a browser `File`. A successful upload returns `Promise<{ cid: string }>`. Use the returned CID for the matching metadata. Clear it when the name, symbol, description or image changes.

A draft before metadata upload can use the following values. Adjust the target to the live Portal minimum shown by the host.

```json
{
  "name": "Crowd Demo",
  "symbol": "CROWDDEMO",
  "description": "Crowd testnet launch example",
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

## Build and test the factory pair

1. Keep the Launcher and Vault sources as separate children of one Dev project. An authorized operator uses the supported factory-pair tools to prepare one `flap-factory-pair-source-v2` ZIP and submit it to Workbench. Include the formal Vault package and its required testnet E2E proof. The issued token above is the example's acceptance fixture.
2. Workbench validates and builds both children. The two published runtimes have independent immutable versions. The Launcher runtime uses `flap-launcher-runtime-v1`. For normal Pool Launch registration, scope 5 maps the Launcher Factory to its Launcher artifact and scope 3 maps the Vault Factory to its Vault artifact. The mapping caller holds the registry’s `AUDITOR_ROLE`. An authorized signer submits the mapping through the supported wallet or Safe workflow.
3. On an enabled BSC Testnet host, open `/create/launcher?chain=bnb-testnet&factory=<launcher-factory>`. After the user's creation receipt is verified, open `/launcher/<launcher-address>?chain=bnb-testnet`. Review each contribution before approving it in the test wallet. The contribution that fills the target can issue the token and create its pool and Vault.
4. After the host verifies issuance, the trade route is `/bnb-testnet/<issued-token>` and the Vault route is `/bnb-testnet/<issued-token>/taxinfo`. Use the actual issued token from the host. The Vault page resolves its own artifact and checks the on-chain Vault context.

For an operator-enabled preview of already published artifacts, use the Workbench-generated create or detail link with both `artifactPath` (Launcher version) and `vaultArtifactPath` (Vault version). These paths select immutable artifacts for the test session. The Vault page receives its companion path as `artifactPath`. Registry mapping and version preview are separate operations.
