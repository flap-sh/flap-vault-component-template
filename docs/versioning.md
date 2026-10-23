# Versioning

This template has four compatibility surfaces:

1. `agent-contract.json` for AI agent workflow and machine-readable rules.
2. `schemas/manifest.schema.json` for developer manifest validation.
3. `flap-vault-package.json` package format for Flap Artifact Workbench intake.
4. `dist/vault-runtime/runtime-contract.json` for the shared runtime package extraction contract.

The root `package.json` version is also the local template/runtime package version. As its first step, `vault:package` runs the complete Git/npm freshness preflight, fetches the official template, and automatically fast-forwards a checkout that is only behind `origin/main`, while preserving non-conflicting local Vault work; conflicts, ahead branches, and diverged branches stop without discarding changes. If npm becomes newer during that preflight, the command re-fetches `origin/main` before deciding the checkout is stale. When npm latest points to a source commit that is not yet available on `origin/main`, the machine-readable `template-freshness/npm-outdated` result marks `releaseSyncPending: true` and tells the developer to wait for the maintainer to finish the release instead of editing the local version. The latest package script otherwise requires local `HEAD` to exactly match `origin/main`, checks the version against npm latest `@flapsdk/vault-runtime`, and verifies that local git history contains the npm latest package's published `gitHead`. A checkout with a lower version or a manually edited version string without the matching source commit is blocked before `vault:check`, `build`, `runtime:package`, or `vault:package` can succeed.

Feature branches do not weaken that release rule. `yarn runtime:pack:canary` exists only for pre-merge consumer testing: it requires clean committed source, generates `<base>-canary.<gitHead>` with `private: true`, verifies and npm-packs it under `dist/npm`, and records the tarball SHA-256. It must never be published or used as the package provenance in a Vault source ZIP. After merge, increment the root version as required and rebuild the publishable package with `yarn runtime:package` plus `yarn runtime:verify-package` from official `main`.

## Stable release workflow

The `0.1.37` feature and consumer rollout requirements are documented in
[the release guide](releases/0.1.37.md) ([简体中文](releases/0.1.37.zh-CN.md)).
Prepare the root version and documentation on a branch from the latest official
`main`, commit as the SDK maintainer, and merge the release PR before building the
publishable package. A feature/release branch may be tested with a private canary
but must not replace the official-main release source.

After merge, use a clean checkout at the fetched official main head. If the fork
is named `origin`, explicitly choose the official `upstream/main` freshness ref:

```bash
FLAP_TEMPLATE_FRESHNESS_REF=upstream/main yarn ci
FLAP_TEMPLATE_FRESHNESS_REF=upstream/main yarn runtime:package
yarn runtime:verify-package
yarn test:runtime-provider --package
```

Inspect `dist/vault-runtime/package.json` and `runtime-contract.json`: version and
`gitHead` must match the intended release and official source; the package must
not be private or carry canary metadata. Create the `.tgz` from that verified
directory, record its SHA-256 and npm integrity, and inspect its README and exports.
The generated package README must describe newly added public APIs; updating only
the repository README is insufficient because source docs are not included in npm.

With maintainer publication authorization, publish the verified tarball publicly
under `latest`. Confirm the registry version, `gitHead`, integrity and downloaded
archive match, and preserve the existing `next` tag. Finally update consumer exact
pins and Yarn lockfiles, deploy matching host/checker changes, and verify the real
upload/gateway workflow. A successful npm publish does not upgrade deployed hosts.

## Main source integration

Vault UI and Mini App v2 will share `main` after the v2 merge, while `vault:*` and `app:*` retain distinct model/proof workflows. A source branch is not an npm channel. See [main integration status](main-migration.md) ([中文](main-migration.zh-CN.md)) for the current release identities, unpublished integration inputs and the command/CI transition still required before main-based App submission. The planned shared stable release is **`0.1.38` under latest**, not yet published. App commands, release-contract metadata and CI must be migrated to main/latest before release, then hosts must deploy the same exact stable runtime. All historical next versions will be deprecated after stable publication, with downloads retained; see [the version list and upgrade plan](main-migration.md#planned-stable-upgrade-and-preview-deprecation). This documentation does not perform publication, npm deprecation or changes to the implemented guards.

## Explicit next SDK releases

Release freshness is channel-specific. The following table describes the current implementation during the main integration; it is not the target main-based App configuration:

| Workflow | Official source | npm metadata used |
| --- | --- | --- |
| Stable Vault/template commands | `origin/main` | `@flapsdk/vault-runtime` on `latest` only |
| App v2 preview commands | `origin/feat/mini-app-v2` | `@flapsdk/vault-runtime` on `next` only |
| Preview runtime release | `origin/next` | `@flapsdk/vault-runtime` on `next` only |

There is no cross-channel version comparison. Advancing `latest` does not make an unchanged preview stale or require a new `next` release. Each channel still requires the official source head, a version at least as new as its own npm tag, and the published commit in its history. App v2 source ZIPs additionally require the exact published `next` version and unchanged runtime/build/protocol inputs from that published ancestor. This does not certify SDK API compatibility or replace host/Workbench version alignment.

Documentation and official authoring tools can advance `feat/mini-app-v2` without a new SDK release. Update and push that developer branch; leave the npm tag and the runtime release branch at their published identity. Developers pull the current official template head. Packaging compares actual file changes, including renames/deletions, rather than commit messages. It allows documentation, agent guidance, authoring scripts and separately checked App source; every other path is pinned by default. SDK/UI source, dependencies, build configuration, schemas/capability configuration, the runtime builder and ZIP/E2E protocol scripts remain pinned. Local SDK/tool edits are rejected, including staged and untracked files. Local App source/preview registration and docs remain allowed. The ZIP still records npm's published `runtimePackageGitHead`; source/E2E hashes and receiving Workbench review are unchanged.

When a maintainer explicitly requests an npm testing release from official `next`, use a version such as `0.1.40-next.0`, commit and push the same source commit to official `feat/mini-app-v2` and `next`, and build from a clean checkout at exactly that remote head. Select both the preview channel and official release ref; do not remove the checks or publish a private canary:

```bash
FLAP_TEMPLATE_FRESHNESS_REF=upstream/next yarn runtime:package:next
yarn runtime:verify-package
```

`upstream` must point to the official `flap-sh/flap-vault-component-template` repository. The npm `next` ancestry/version checks still apply. Generated `*-next.*` packages carry `publishConfig: { access: "public", tag: "next" }`; always publish the verified `dist/vault-runtime` package with the `next` tag and confirm npm `latest` remains unchanged. Verify the public package version, integrity and `gitHead` against the checked package afterward. These testing SDK releases do not change the default official-main/latest rules for Vault source ZIP generation or stable releases.

`@flapsdk/vault-runtime@0.1.40-next.0` is published on npm `next`, with `gitHead` `0d21863aa19bde5ad6712d760d3badea6a28e3a4`; stable `latest` remains `0.1.37` (checked 2026-10-23). That identity applies only to matching source inputs. The integration now contains newer dependency/build changes and E2E tooling updates and cannot reuse it for new ZIPs. See [main integration status](main-migration.md). Publish a matching runtime only when authorized, then align command/CI source references, the main host and Workbench. Documentation-only changes do not remove an existing unpublished-runtime blocker.

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

Use `yarn app:scaffold <slug>` and the shared `useFlapSdk({ chainId })` for reviewed wallet/contract operations. `useMiniAppSdk()` remains compatible for host identity/session access. See `docs/mini-app-wallet.md`; declare walletChains and exact walletContracts instead of broadening Vault bindings. Never add fake token addresses or zero-address runtime bindings. Source-package format 7 and E2E schema 3 require current source hashes and successful guest/connected checks on PC, iPad and H5. Existing provenance, import, endpoint, media and review boundaries still apply. The preview's session fixture is development-only; production sessions must come from the Flap host. See `docs/standalone-mini-apps.md`.

## Main integration and Mini App v2 releases

Vault UI and Mini App v2 share one SDK and will be maintained on `main` after the v2 merge. `feat/mini-app-v2` is the transition branch. Read [the current migration and release status](main-migration.md) before selecting a source checkout or generating a ZIP. The planned shared stable release is **`0.1.38` on latest, not yet published**; historical next versions will be deprecated after that release, with downloads retained. Current App commands still use next-channel preview references and must migrate to main/latest before release; this documentation does not change those guards or publish a runtime. The integration source has changed dependency/build inputs and also updates E2E tooling since the last npm publication and needs a matching release before packaging. Use `vault:*` for Vault UI and `app:*` for v2, preserve separate manifests/identities/proofs, and retain existing v1 compatibility. Local E2E and private canaries do not replace exact published-source provenance.
