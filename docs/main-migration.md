# Main branch integration and release status

[简体中文](main-migration.zh-CN.md) · [Development guide](development.md) · [Mini App v2 quickstart](mini-app-v2-quickstart.md)

Vault UI and Mini App v2 will be maintained together on `main` after the v2 merge. They share this repository, one `@flapsdk/vault-runtime` package, UI components and the host wallet. `feat/mini-app-v2` is the integration branch during this transition, not a permanent second SDK. Use `vault:*` for Vault UI and `app:*` for independent v2 Apps; their manifests, host contexts, identities, permissions and package proofs remain distinct.

## Current status — checked 2026-10-23

| Item | Status |
| --- | --- |
| Source integration | `main` has been merged into `feat/mini-app-v2`; merging v2 back into `main` is being prepared |
| Source branch after that merge | `main`, for both Vault UI and Mini App v2 |
| npm `latest` | `0.1.37`, published source `ad40bab7dfc976d20dd82050aeec17fef18a39b3` |
| npm `next` | `0.1.40-next.0`, published source `0d21863aa19bde5ad6712d760d3badea6a28e3a4` |
| Planned npm `latest` | **`0.1.38`**, not yet published; one stable runtime for Vault UI and Mini App v2 |
| Historical `next` versions | To be deprecated after `0.1.38` is published; downloads remain available |
| Merged source ZIP readiness | Pending `0.1.38` and the main/latest command, contract and CI transition |

A Git merge does not publish npm, move a dist-tag, upgrade Workbench or the main host, approve an App, or change its production route. `main` is a source branch; `latest` and `next` are channels for the same package. Do not infer SDK capabilities from the branch name alone.

`0.1.40-next.0` is a real published package and supports shared App wallet operations, dynamic IPFS/FSI and long-text CopyButton. The integration source now additionally contains Next.js `15.5.28`, preview/build changes and E2E tooling updates. The changed dependency/build inputs do not match that publication and are outside the authoring-only exception. The unchanged root version does not make the newer source eligible for `0.1.40-next.0` ZIP provenance. A matching new release is required; no new SDK is published as part of this documentation update.

## Source checkout and local development

After the v2 merge is announced, new Vault UI and v2 projects use:

```bash
git clone --branch main https://github.com/flap-sh/flap-vault-component-template.git
cd flap-vault-component-template
yarn install --frozen-lockfile
```

Before that merge, use `--branch feat/mini-app-v2` for v2 source development and local preview. The current integration head is not a ready-to-submit source-package release. Keep App work in `src/vaults/{slug}`, preserve its artifact ID/slug and preview registration, and save local work before switching branches. Follow the release note before generating new upload proof.

App authors import `@/src/sdk` and `@/src/ui` from the template; do not install a second SDK or wallet provider in the App folder. Hosts install the exact published npm runtime. See [code reuse](development.md#what-code-can-be-reused).

## Command behavior during the transition

The current implementation has not yet migrated its release references:

| Workflow | Current source reference / channel |
| --- | --- |
| `vault:*` | Official `origin/main` / npm `latest` |
| `app:*` | Official `origin/feat/mini-app-v2` / npm `next` |
| `runtime:package:next` | Official `origin/next` / npm `next` |

The `app:*` wrapper still requires a prerelease template version, and the next-channel reference policy currently accepts only `feat/mini-app-v2` or `next`, not `main`. Checkout of `main` alone cannot migrate these rules. Fork maintainers select the documented official `upstream` reference instead of a fork, not a local ref or manually edited proof.

The scaffold/local preview, E2E results and a private canary can validate integration work. They do not authorize an upload from unpublished runtime inputs. The normal check/build/package preflights can reject the integration checkout until source references and published identity agree. Do not change version strings, proof metadata or guards to make that checkout look published.

Before announcing main-based package submission, maintainers need to:

1. Migrate the App command wrapper, prerelease-only assertion, source-reference policy, `agent-contract.json` release metadata and App CI to official `main` / npm `latest`. Both Vault UI and v2 should accept the stable `0.1.38` template, while keeping their model/proof workflows distinct and any future preview-channel checks independent.
2. Prepare and verify `0.1.38` from clean official-main source, publish it under `latest`, then record its actual `gitHead` and integrity. This is the planned release, not a statement that it is already published.
3. Pin and deploy `@flapsdk/vault-runtime@0.1.38` and matching validation inputs in Workbench and the main host, then rerun check, E2E, package and verification from the announced template source.
4. After the stable release is available, mark every historical `next` prerelease listed below deprecated with an upgrade message pointing to `0.1.38`. Keep those packages downloadable for existing lockfiles; do not unpublish them.

Until then, packaging from the merged integration head is pending. Existing published-runtime artifacts remain compatible; this source merge does not replace their runtime or approve a new App version.

## Planned stable upgrade and preview deprecation

After `0.1.38` is published and the matching host/Workbench rollout is announced, both products use main/latest. No additional next release is planned for this migration. Host and Workbench maintainers update their exact dependency with:

```bash
yarn add --exact @flapsdk/vault-runtime@0.1.38
```

App authors instead update the announced official main template, preserve their App folder and preview registration, then regenerate check/E2E/ZIP proof. They do not install the npm package inside their App folder. Select the announced exact stable version rather than the numerically highest prerelease: `0.1.40-next.0` is a historical preview, not the planned stable target.

The deprecation plan covers all eight next versions currently published: `0.1.32-next.0`, `0.1.32-next.1`, `0.1.33-next.0`, `0.1.33-next.1`, `0.1.36-next.0`, `0.1.38-next.0`, `0.1.39-next.0` and `0.1.40-next.0`. The deprecation message should say: “This preview is deprecated. Upgrade to @flapsdk/vault-runtime@0.1.38 and the matching official main template.” This documentation update does not perform npm deprecation or remove packages. Existing built Apps retain compatibility; new submissions must follow the announced stable release policy.

## Supported models stay the same

New development supports Vault UI and Mini App v2. Mini App v1 remains deprecated for new projects, with existing routes, bindings and maintenance compatibility retained. Main-branch integration does not convert v1, bind v2 to a token, or merge a project's Vault and App identities. Vault UI and Mini App v2 remain separate review/submission deliverables.
