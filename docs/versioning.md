# Versioning

This template has four compatibility surfaces:

1. `agent-contract.json` for AI agent workflow and machine-readable rules.
2. `schemas/manifest.schema.json` for developer manifest validation.
3. `flap-vault-package.json` package format for Flap Artifact Workbench intake.
4. `dist/vault-runtime/runtime-contract.json` for the shared runtime package extraction contract.

The root `package.json` version is also the local template/runtime package version. As its first step, `vault:package` runs the complete Git/npm freshness preflight, fetches the official template, and automatically fast-forwards a checkout that is only behind `origin/main`, while preserving non-conflicting local Vault work; conflicts, ahead branches, and diverged branches stop without discarding changes. If npm becomes newer during that preflight, the command re-fetches `origin/main` before deciding the checkout is stale. When npm latest points to a source commit that is not yet available on `origin/main`, the machine-readable `template-freshness/npm-outdated` result marks `releaseSyncPending: true` and tells the developer to wait for the maintainer to finish the release instead of editing the local version. The latest package script otherwise requires local `HEAD` to exactly match `origin/main`, checks the version against npm latest `@flapsdk/vault-runtime`, and verifies that local git history contains the npm latest package's published `gitHead`. A checkout with a lower version or a manually edited version string without the matching source commit is blocked before `vault:check`, `build`, `runtime:package`, or `vault:package` can succeed.

Feature branches do not weaken that release rule. `yarn runtime:pack:canary` exists only for pre-merge consumer testing: it requires clean committed source, generates `<base>-canary.<gitHead>` with `private: true`, verifies and npm-packs it under `dist/npm`, and records the tarball SHA-256. It must never be published or used as the package provenance in a Vault source ZIP. After merge, increment the root version as required and rebuild the publishable package with `yarn runtime:package` plus `yarn runtime:verify-package` from official `main`.

## Explicit next SDK releases

When a maintainer explicitly requests an npm testing release from official `next`, use a version such as `0.1.32-next.0`, commit and push it to official `next`, and build from a clean checkout at exactly that remote head. Select that official ref for the existing freshness checks; do not remove the checks or publish a private canary:

```bash
FLAP_TEMPLATE_FRESHNESS_REF=upstream/next yarn runtime:package
yarn runtime:verify-package
```

`upstream` must point to the official `flap-sh/flap-vault-component-template` repository. The normal npm-latest ancestry/version checks still apply. Generated `*-next.*` packages carry `publishConfig: { access: "public", tag: "next" }`; always publish the verified `dist/vault-runtime` package with the `next` tag and confirm npm `latest` remains unchanged. Verify the public package version, integrity and `gitHead` against the checked package afterward. These testing SDK releases do not change the default official-main/latest rules for Vault source ZIP generation or stable releases.

## Agent Contract Version

Increment `agent-contract.json.version` when an Agent must change behavior to keep generating valid packages.

Examples:

- New required command in the done criteria.
- New required input field.
- New blocking package rule.
- Changed folder name, `artifactId`, preview registration, or action-stage workflow.

Do not increment it for copy-only docs edits or non-breaking extra examples.

## Manifest Schema

The manifest schema is developer-facing. Add fields only when they are safe for public package authors to declare.

Rules:

- Keep `additionalProperties: false`.
- Keep runtime-only fields out of the schema.
- Keep oracle, media, action registry, and runtime version policy out of developer manifests unless Flap intentionally changes the product boundary.
- If a new field is required, update `vault:scaffold`, `vault:check`, `agent-contract.json`, and docs in the same change.

## Package Format Version

Increment `PACKAGE_FORMAT_VERSION` in `scripts/vault-package.mjs` and `scripts/vault-verify-package.mjs` when the zip acceptance contract changes.

Examples:

- Marker file shape changes.
- Required packaged files change.
- Hash policy changes.
- Package kind changes.
- Workbench needs a new required metadata field.
- Runtime package provenance fields such as `runtimePackageGitHead` become required.
- E2E proof files or marker/metadata `e2e` summary fields become required.

The Flap Artifact Workbench should reject unsupported future versions and should explicitly decide whether to keep accepting older versions. Do not silently accept unknown package kinds or unknown format versions.

Current source packages use format version `6` and E2E report v2. Format 6 hashes all recursively packaged source and assets, carries the machine-readable capability profile contract, and requires matching marker/metadata E2E summaries. Workbench may keep reading legacy format 5 only when `capabilities` is absent; every `three-r3f-v1` package must use format 6.

## Runtime Contract Version

Increment `runtimeContractVersion` in `scripts/build-runtime-package.mjs` when the shared runtime package contract changes in a way Workbench or `flap.sh` must understand.

Examples:

- Runtime package subpath exports change.
- `stableAuthoringAliases` changes.
- `componentFacingEntrypoints` or `hostFacingEntrypoints` changes.
- Required runtime externals change.
- The generated `component.mjs` host/export contract changes.

Do not increment it for internal implementation-only changes that preserve the generated `runtime-contract.json` shape and semantics.

## Validation Rule

Any versioning change should run:

```bash
yarn ci
```

At minimum, run:

```bash
yarn vault:check:selftest
yarn vault:check example
yarn vault:e2e example
yarn vault:package example
yarn vault:verify-package dist/example.zip
yarn runtime:package
yarn runtime:verify-package
```

## Independent Mini Apps (manifest v2)

This explicit protocol takes precedence over the token requirements below **only** for `schemaVersion: 2`, `mode: "mini-app"`, `appModel: "standalone"` and a valid `slug`. Standalone Apps have `match.bindings: []`, no CA/factory/Vault or required chain, and canonical `/apps/{slug}` URLs. Old Mini Apps remain token-scoped.

Use `yarn app:scaffold <slug>` in the template and `useMiniAppSdk()` for host-owned session, i18n and notification access. Never add fake token addresses or zero-address runtime bindings. Source-package format 7 and E2E schema 3 require current source hashes and successful guest/connected checks on PC, iPad and H5. Existing provenance, import, endpoint, media and review boundaries still apply. The preview's session fixture is development-only; production sessions must come from the Flap host. See `docs/standalone-mini-apps.md`.
