# Launch Configuration Surface

One reviewed artifact can provide both the post-launch Vault UI and the launch-time configuration UI for the same factory.

## Files and exports

Keep the four core package files. Add one optional file only when the factory needs a dedicated launch form:

```plain text
src/vaults/{folder-name}/
  Component.tsx
  LaunchConfig.tsx
  manifest.json
  VaultABI.ts
  i18n.json
```

Declare the surfaces in `manifest.json`:

```json
{
  "surfaces": ["vault-ui", "launch-config"]
}
```

`launch-config` requires at least one `match.bindings[].factoryAddress`. Export the component from `Component.tsx` so Workbench produces one `component.mjs` with both surfaces:

```tsx
export { default as LaunchConfig } from "./LaunchConfig";
```

The default export remains the post-launch Vault UI. Existing manifests that omit `surfaces` remain `vault-ui` only.

## Component contract

`LaunchConfig.tsx` receives `VaultLaunchConfigComponentProps` from `@/src/sdk`:

- `context.chainId`, `factoryAddress`, locale, token metadata, and the verified on-chain `vaultDataSchema()` result.
- `messages`, loaded from the package `i18n.json` for the active locale.
- `onChange(result)`, used to return either an invalid state or valid structured values.

Return structured values keyed by the on-chain schema field names. Do not ABI-encode bytes in the component. Do not render the final launch confirmation or send/simulate transactions. The flap.sh host validates the values against the on-chain schema, ABI-encodes `vaultData`, owns the Confirm button, and sends the launch transaction.

```tsx
onChange({
  status: "valid",
  values: { minBurnAmount: "1000000000000000000000" },
  summary: [{ label: t("summary.minimumBurn"), value: "1000 TOKEN" }],
});
```

All visible copy must come from `i18n.json`. `summary` is optional and display-only; it does not affect encoded values.

## Local testing

Run the template development server and open the launch surface directly:

```bash
yarn dev
```

```plain text
http://localhost:3000/{folder-name}?surface=launch-config
```

The developer homepage offers two entries. Open `/{folder-name}?surface=vault-ui` for the post-launch UI and `/{folder-name}?surface=launch-config` for the launch form; preview navigation switches between them while preserving language and runtime URL parameters. Packages without a declared/exported LaunchConfig show an explicit unavailable state instead of silently showing the Vault UI.

`?tab=custom` remains an alias for the hosted example link. Only `/example` supplies an explicitly labelled demonstration schema. Other launch previews read `vaultDataSchema()` from the manifest factory on its chain using the shared `VAULT_LAUNCH_SCHEMA_ABI` and `parseVaultLaunchSchema` SDK helpers. Schema read/parse failure and returned-field mismatches keep host confirmation disabled. `schema.fields[].decimals` is display metadata; component results use base units, not human-readable amounts. `isVaultLaunchConfigResultForSchema` checks payload shape only; it does not replace host ABI type/policy validation.

Then run the normal validation pipeline:

```bash
yarn vault:check {folder-name}
yarn vault:e2e {folder-name}
yarn vault:package {folder-name}
yarn vault:verify-package dist/{folder-name}.zip
```

`vault:e2e` tests the launch surface on PC, iPad, and H5, verifies invalid/valid states and host confirmation gating, and attests the exact `LaunchConfig.tsx` source hash. Workbench imports the same zip, verifies that the built module preserves the named export, and lets reviewers switch between the two surfaces. You do not need a separate hand-built “test package”; use the normal verified source zip.

### Schema-aware E2E inputs

The runner reads the schema exposed by the preview host for the selected chain/factory. It fills every schema field and compares the host's `data-launch-config-values` JSON against the expected typed values. It never clicks Confirm or sends a transaction. Give each native `input`, `textarea`, or `select` a `name`, `id`, or `data-launch-config-field` matching its schema field name. A legacy single-field form with exactly one editable control needs no extra marker.

Automatic samples cover addresses, Solidity integers, booleans, strings, bytes and supported typed arrays. Booleans may use checkboxes or a select with `true`/`false` values. Typed arrays use JSON in a text input or textarea. Unknown types, ambiguous controls, and top-level row arrays (`schema.isArray`) remain blocking until the runner supports their control layout; they are never silently skipped.

Numeric controls use base units by default. `schema.fields[].decimals` alone does not imply a UI conversion. If a control accepts human-readable amounts and converts them using that field's decimals, mark it explicitly:

```tsx
<Input name="minBurnAmount" data-launch-config-unit="human" /* ... */ />
```

The runner waits for asynchronous form state, checks valid values, exercises malformed/empty input when the field type can represent an invalid state, checks that stale valid output is removed, and restores valid state. It does not assume that numeric zero, boolean false, empty strings, or empty dynamic bytes are invalid.

The on-chain schema describes ABI types, not business rules such as a minimum amount or an owner allowlist. If automatic samples cannot satisfy those rules, provide a JSON test fixture with UI inputs and exact expected base-unit values:

```json
{
  "inputs": { "minBurnAmount": "2500" },
  "values": { "minBurnAmount": "2500000000000000000000" }
}
```

```bash
yarn vault:e2e {folder-name} --launch-config-fixture ./qa/launch-config.json
```

Keep the fixture outside `src/vaults/{folder-name}`. Fixture values must match the schema's field names and ABI types; they cannot override a failed assertion. The supplied fixture is recorded in the report. A failed generated sample is a request for an appropriate test case, not proof that the form's business rules are wrong. The normal passing-report, current-source-hash, package and Workbench checks still apply.

For a business rule that rejects an otherwise ABI-valid value, the fixture may also supply `"invalidInputs": { "fieldName": "rejected UI value" }`. The runner verifies that this input disables confirmation and removes the old result, then restores the valid sample. For example, a required consent checkbox may specify `"invalidInputs": { "consent": false }`. These samples assert an additional invalid state; they do not waive any validation.

For runner regression tests, run `yarn test:launch-config` and `yarn test:launch-config:browser`. These use controlled schemas and browser forms without creating production package proof; `yarn vault:e2e {folder-name}` still tests the actual preview and factory schema.

For end-to-end flap.sh preview after Workbench builds the artifact, open the normal launch URL with the real factory plus the Workbench `artifactPath` preview parameter. If loading, verification, compatibility, or rendering fails, flap.sh falls back to the generic on-chain-schema form.
