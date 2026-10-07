# Ordinary Vault UI: Test CAs, Factory Bindings, and Mainnet

[简体中文](./vault-ui-test-ca.zh-CN.md)

**You do not need to issue a project token before starting Vault UI development.** With a real deployed testnet factory, you can explicitly reuse Flap's same-chain public test CA for UI preview and applicable E2E checks.

This guide covers ordinary tax-token Vault UI, with `mode: "mini-app"` omitted. A public test CA is a deployed token, not a fabricated address. It does not replace your project's Vault or business integration tests. If neither your factory nor Vault is deployed, start with the built-in `/example` workflow fixture; do not invent a publishable project binding.

## 1. Three Separate Inputs

| Input | Where it goes | Purpose |
| --- | --- | --- |
| Factory address | `match.bindings[].chainId` + `factoryAddress` | Declares which factory this UI targets. Use a real deployed factory on that chain. |
| Test CA | `tokenAddresses` on that binding | Supplies token context for preview, ERC20 validation and E2E. In factory mode it is not a production CA restriction. |
| Production CA policy | Workbench/registry `caRestrictionMode`, confirmed by the platform | Determines whether production is restricted to specific CAs. It is not a public manifest field. |

Listing a public test CA beside your factory **does not associate them on-chain or create a Vault**. These are the intended UI target and proof input. If live reads identify a different factory or Vault for the CA, the chain relationship takes precedence; changing URL hints cannot override it.

The distinction between proof token and production restriction above is specific to factory mode. A no-factory token-scoped binding matches by CA; do not change scope just to avoid supplying a factory.

## 2. Public Test Addresses

Prefer a suitable project test CA when the developer already supplies one. Otherwise, explicitly pass the appropriate standard `7777` CA for ordinary tax-token Vault UI:

| Network | `chainId` | Public test CA |
| --- | --- | --- |
| BNB Testnet | `97` | `0xf8ac72e7adefbce6ff22d9a9238512933e247777` |
| BNB mainnet | `56` | `0x286184b2660a2822671a33f24c4517f593947777` |

The source of these addresses is [`src/shell/previewCoinDetail.ts`](../src/shell/previewCoinDetail.ts), under `TESTNET_UI_TEST_TOKEN_ADDRESS` and `MAINNET_UI_TEST_TOKEN_ADDRESS`. A read-only check with the repository's ERC20 validator on 2026-10-07 passed for both (`TEST`, 18 decimals). This does not establish any relationship to your factory, and does not exempt future runs from validation.

For other chains, use their [chain-specific proof tokens](./robinhood-testnet.md). Do not reuse a BNB address on another chain. Ordinary Vault scaffolding still requires an explicit `--token`; the preview shell's default address does not automatically populate your manifest.

## 3. Start on BNB Testnet Only

Use the current official template, Node.js 22+, Yarn, and **your real BNB Testnet factory**. Replace `0xYourTestnetFactory` below; the public CA can stay as written. The factory placeholder is explanatory text, not an acceptable deployment address.

```bash
yarn
yarn vault:scaffold my-vault \
  --name "My Vault UI" \
  --chain 97 --factory 0xYourTestnetFactory \
  --token 0xf8ac72e7adefbce6ff22d9a9238512933e247777 \
  --locales en,zh
```

Mainnet factory configuration is not required for a chain `97`-only start. Scaffold creates the core files, stable `artifactId` and local route. Keep those fields; the following is just the generated `match` structure, with a factory placeholder you must replace:

```json
{
  "match": {
    "bindings": [
      {
        "chainId": 97,
        "factoryAddress": "0xYourTestnetFactory",
        "tokenAddresses": ["0xf8ac72e7adefbce6ff22d9a9238512933e247777"]
      }
    ]
  }
}
```

Implement the UI, then start preview:

```bash
yarn dev
```

Replace the factory in this URL too; change port `3000` if your server uses another port:

```text
http://localhost:3000/my-vault?chainId=97&factoryAddress=0xYourTestnetFactory&tokenAddress=0xf8ac72e7adefbce6ff22d9a9238512933e247777
```

Inspect the host readout's chain, token, factory, Vault and degradation reason. When the public CA cannot supply project Vault data, show unavailable data and missing-risk status, and keep dependent actions unavailable. Do not invent balances, rewards or low-risk status.

Run these in order, resolving blockers before continuing:

```bash
yarn vault:check my-vault
yarn vault:e2e my-vault --chain 97
yarn vault:package my-vault
yarn vault:verify-package dist/my-vault.zip
```

Success means zero blocking checks, a passing E2E report, an official generated ZIP and successful package verification. A public CA does not bypass these gates or guarantee that an arbitrary business component passes E2E.

E2E checks PC/iPad/H5 rendering, layout, phase and wrong-network states; **it does not certify project contract behavior**. If Chromium is missing, follow the error hint and run `yarn playwright install chromium`. `vault:e2e --token` is only a local override, not a replacement for manifest-declared proof input.

## 4. Move to Project Business Integration

| Goal | Inputs | What this verifies |
| --- | --- | --- |
| Build UI, check responsive layout and missing-data states | Same-chain public CA + real intended factory | UI and applicable E2E states, not project Vault existence or successful reads/writes. |
| Test balances, rewards, deposits and claims | Project CA + its real associated Vault/factory + ABI | Business behavior under actual deployment relationships and permissions. Prefer testnet. |
| Serve project users | Production factory/Vault, verified relationships and platform publication configuration | Runtime loading under the production binding; CA restrictions are a separate platform decision. |

For business integration, replace the correct binding's `tokenAddresses` with the project CA, check the live host Vault/factory, and exercise the required reads/writes. After changing the CA or manifest, rerun check → E2E → package → verify: old source-hash proof cannot be reused.

A no-factory single-Vault UI still needs a real `vaultAddresses` target. A public CA cannot create that Vault or prove it belongs to the CA. See the [manifest binding rules](./manifest.md).

## 5. Configure and Test BNB Mainnet

Mainnet uses chain `56`. For a mainnet-only UI preview, the following is an alternative starting command **only if `my-vault` does not already exist**. Replace the real mainnet factory:

```bash
yarn vault:scaffold my-vault \
  --name "My Vault UI" \
  --chain 56 --factory 0xYourMainnetFactory \
  --token 0x286184b2660a2822671a33f24c4517f593947777 \
  --locales en,zh
```

If you already created `my-vault` for testnet, retain its source and `artifactId`. Add this entry to `match.bindings` instead of scaffolding the same folder again:

```json
{
  "chainId": 56,
  "factoryAddress": "0xYourMainnetFactory",
  "tokenAddresses": ["0x286184b2660a2822671a33f24c4517f593947777"]
}
```

This is one binding, not a complete manifest. Keep the testnet entry first if desired. Add mainnet only when its real factory is ready. A mainnet factory-only entry plus a testnet proof token is also valid, but it is not evidence of a mainnet E2E run.

Mainnet preview:

```text
http://localhost:3000/my-vault?chainId=56&factoryAddress=0xYourMainnetFactory&tokenAddress=0x286184b2660a2822671a33f24c4517f593947777
```

Use `yarn vault:e2e my-vault --chain 56` to select mainnet explicitly. Without `--chain`, the current runner selects the first supported manifest binding with a usable proof token; it does not automatically test every chain. Each run writes the same `dist/e2e/my-vault/qa-report.json`. Preserve separate reports for multi-chain acceptance; packaging uses the current report. Real mainnet writes are not simulated transactions.

For testing on the live website, the Workbench operator validates, builds and publishes the ZIP following the [handoff flow](./artifact-intake.md), then supplies the complete **ordinary Vault UI** preview link. Check its network, test CA and artifact version. A Mini App `/mini-app` URL is a different surface. Changing the CA in a preview URL does not register a production binding.

Handoff steps:

1. The developer supplies the verified ZIP, target chain `56`, real mainnet factory and chosen test CA.
2. The Workbench operator publishes that version and copies the ordinary Vault UI (TaxInfo) preview link. BNB mainnet uses `utter.cash/bnb`; BNB Testnet uses `test.utter.cash/bnb-testnet`.
3. Review the new link and check the actual CA, factory, artifact version and risk/missing-data states. After source updates, package and publish again, then copy the new version's link instead of retaining the old `artifactPath`.

A mainnet public-CA link has the following shape. `<URL_ENCODED_ARTIFACT_PATH>` is an explanatory placeholder for the URL-encoded published `artifactId/version` from Workbench. Copying the complete generated link is preferred.

```text
https://utter.cash/bnb/0x286184b2660a2822671a33f24c4517f593947777/taxinfo?artifactPath=<URL_ENCODED_ARTIFACT_PATH>
```

The developer supplies the production intent; the platform confirms it in Workbench/registry:

| `caRestrictionMode` | Meaning |
| --- | --- |
| `none` | No extra CA restriction in factory/Vault mode; a test token remains necessary for package proof. |
| `reserved` | Future CA held for review; it cannot be officially published/routed as a verified binding yet. |
| `verified` | Platform applies production CA restrictions only after ERC20 and factory/Vault/token relationship verification. |

Do not put `caRestrictionMode`, `productionRestrictedTokenAddresses`, `restrictTokenAddresses`, `caPolicy` or global `tokenAddresses` in the public manifest. Publishing a test artifact, opening a versioned preview and registering its normal production entry are separate steps.

## 6. Troubleshooting

| Symptom | Check and action |
| --- | --- |
| Agent asks you to issue a project token first | Explain that this stage is ordinary Vault UI testing and supply a same-chain public CA, plus your real factory. Plan project deployments separately for business integration. |
| `manifest-binding/missing-test-token` | Put the CA in `match.bindings[].tokenAddresses`, or pass `--token` when scaffolding. A URL-only change is insufficient. |
| `manifest-binding/invalid-test-token-suffix` | Package proof accepts `7777`/`8888`; use this guide's `7777` tokens for ordinary tax-token Vault UI. Never edit an address suffix to manufacture a match. |
| `manifest-binding/invalid-erc20-token` | Inspect `tokenContract.detail` for the chain, deployment and ERC20 read failure. For RPC timeouts, fix connectivity and retry; the error does not always mean the CA itself is invalid. |
| Token unavailable / `manifest-binding-mismatch` | Inspect live factory/Vault values. Use a project CA with the intended relationship or a suitable public CA if the current token belongs to another factory. Do not disable matching. |
| Public CA loads the page but reads/claims fail | It is not your project Vault. Check the real Vault, ABI, relationships, permissions and test funding; retain unavailable UI states. |
| Two chains configured but only one tested | Run `--chain 97` and `--chain 56` separately and identify the network each report covers. |
| ERC20 passes but preview is unavailable | ERC20 validation does not guarantee Portal state, binding compatibility or complete business data. Inspect the host degradation reason. |
| `template-freshness/ahead`, `diverged` or `npm-outdated` | This is template provenance, not a CA error. Use the current official template per the [version rules](./versioning.md), preserving project source. Do not edit version strings or disable validation to bypass it. |

## Minimal Agent Brief

```text
Build an ordinary tax-token Vault UI; this stage is BNB Testnet UI preview and E2E only.
chainId: 97
factoryAddress: <my real BNB Testnet factory>
testTokenAddress: 0xf8ac72e7adefbce6ff22d9a9238512933e247777
Token source: public test token, not my production CA or proof of a deployed project Vault.
No mainnet binding is needed yet. I will provide the project CA, Vault and ABI for real business integration.
Read docs/vault-ui-test-ca.md and keep normal ERC20, binding and E2E validation.
```

Also supply the folder name, display name, ABI, actions, languages and phase requirements from the [beginner walkthrough](./from-zero-vault-ui.md). Confirm `caRestrictionMode` separately for production; never silently turn the public CA into a production restriction.
