# Main branch integration and release status

[简体中文](main-migration.zh-CN.md) · [Development guide](development.md) · [Mini App v2 quickstart](mini-app-v2-quickstart.md)

Vault UI and Mini App v2 are maintained together on official `main`. They share one template, one `@flapsdk/vault-runtime` package, public UI components and the host wallet. Use `vault:*` for Vault UI and `app:*` for standalone v2 Apps. Manifests, identities, permissions, contexts and package proofs remain distinct.

## Current status — checked 2026-11-10 (Asia/Shanghai)

| Item | Status |
| --- | --- |
| Source branch | Official `main` for Vault UI and Mini App v2 |
| BSC Testnet FSI | [PR #49](https://github.com/flap-sh/flap-vault-component-template/pull/49) merged; exact testnet prefix published in `0.1.42` |
| Published npm `latest` | `0.1.42`, source `686934578ec40aec418484e7c1dac1f6782d598e` |
| Publication time | 2026-11-10 15:18:28.268, Asia/Shanghai |
| Archive verification | 544,455 bytes; public archive matches the verified release archive byte for byte |
| npm `next` | `0.1.40-next.4`, unchanged |
| npm `routing` | `0.1.40-beta.routing.0`, unchanged |
| SDK API / contract | Compatible signatures and runtime contract version 1 |
| Main CI | [Run 42772645556](https://github.com/flap-sh/flap-vault-component-template/actions/runs/42772645556) passed |
| Mini App v2 workflow | [Run 42772645609](https://github.com/flap-sh/flap-vault-component-template/actions/runs/42772645609) failed during Playwright installation on Ubuntu 26.04; App tests were skipped |
| Consumer rollout | Pending exact runtime pins, Workbench checker/provenance synchronization and deployment |
| App ZIP provenance | Exact published latest identity and fresh source-bound E2E proof |

See the [0.1.42 publication record](releases/0.1.42.md) for archive identity and the separate CI outcomes. npm publication does not upgrade deployed consumers or verify real service responses/browser CORS. Testnet artifacts require the matching host runtime and receiving checker.

The previous `0.1.41` receipt-polling release was published from `0cbe42b98441937692a3194db23d7c1059c43c71` on 2026-11-08; its [publication record](releases/0.1.41.md) remains historical evidence.

## Historical status — checked 2026-11-02

| Item | Status |
| --- | --- |
| Source branch | Official `main` for Vault UI and Mini App v2 |
| Template policy | [PR #36](https://github.com/flap-sh/flap-vault-component-template/pull/36) merged, allowing controlled taxed.fun subdomain queries |
| Release candidate | **`0.1.40`: Mini App routing plus taxed.fun query policy; published** |
| Published npm `latest` | `0.1.40`, source `79dab6d8e908310fbc5a56492569623e4ee79e2e` |
| npm `next` | `0.1.40-next.4`; preserve during this stable publication |
| npm `routing` | `0.1.40-beta.routing.0`; preserve during this stable publication |
| SDK API / exports | Compatible `useMiniAppRouter` and host adapters added; npm does not include source checkers |
| Workbench policy | [PR #43](https://github.com/flap-sh/flap-artifact-workbench/pull/43) is not merged or deployed |
| App ZIP provenance | Must match the exact published latest identity; `0.1.40` must use its exact published source |

See [0.1.40 verified release](releases/0.1.40.md). A source merge, version edit or npm publication does not upgrade deployed hosts or approve an artifact. The taxed.fun allowlist requires the matching template and Workbench source checkers; an npm SDK upgrade does not deploy those policies. Real API responses and browser CORS remain unverified.

## Source checkout and local development

Use Node.js 24 and Yarn 1.22:

```bash
git clone --branch main https://github.com/flap-sh/flap-vault-component-template.git
cd flap-vault-component-template
yarn install --frozen-lockfile
yarn app:scaffold my-app
yarn dev
```

App authors import `@/src/sdk` and `@/src/ui` from the template. Do not install another runtime or wallet provider inside the App folder. Keep `src/vaults/{slug}`, artifact ID, immutable slug and preview registration when updating. Save local work before switching from the retired integration branch. See [code reuse](development.md#what-code-can-be-reused).

## Command behavior during the transition

| Workflow | Source / npm channel |
| --- | --- |
| `vault:*` | Official `origin/main` / latest |
| `app:*` | Official `origin/main` / latest; stable `0.1.42` is accepted |
| `runtime:package` | Clean committed official main / latest; generated publishConfig explicitly uses latest |
| `runtime:package:next` | Explicitly authorized preview release from official `origin/next` / next |

Fork maintainers select `FLAP_TEMPLATE_FRESHNESS_REF=upstream/main`, with upstream pointing to the official Flap repository. App commands reject preview/local refs and fork remotes. Main CI and the App validation workflow use latest; the App workflow runs on official main. Each release channel checks only its own npm tag, so `next=0.1.40-next.4` does not invalidate stable `0.1.42`.

App check, local guest/connected E2E and build can run before npm publication from the official main checkout. App source ZIPs and normal local verification require the **exact published latest version, real gitHead ancestry and matching runtime/dependency/build/protocol inputs**. Official documentation/authoring-only descendants can retain that identity. Local SDK/tool edits, private canaries and fabricated proof cannot.

Historical `0.1.39` was published on npm latest, source `78c355f080a60770cfd64d71d94c525204d61583`. See [the historical 0.1.39 release record](releases/0.1.39.md) for archive verification and FSI rollout. The real App package/verification and unpublished-runtime gate results from `0.1.38` remain in [its historical release record](releases/0.1.38.md); they are not relabeled as `0.1.39` proof. New source ZIPs require the current published identity and current source-bound E2E proof.

## Stable upgrade and preview deprecation

**Historical snapshot, checked 2026-10-23.** The current release and dist-tags are recorded at the top of this page.

With `0.1.39` published, maintainers must pin and deploy the same runtime and validation inputs in Workbench and the main host:

```bash
yarn add --exact @flapsdk/vault-runtime@0.1.39
```

App authors update the announced main template, preserve their App source/registration and regenerate check, E2E, package and verification proof. They do not install the npm package in their App folder. Choose the announced stable target rather than the numerically highest historical prerelease. No additional next release is needed for this migration.

The eight historical next versions recorded on 2026-10-23 were deprecated: `0.1.32-next.0`, `0.1.32-next.1`, `0.1.33-next.0`, `0.1.33-next.1`, `0.1.36-next.0`, `0.1.38-next.0`, `0.1.39-next.0` and `0.1.40-next.0`. Their messages direct users to `@flapsdk/vault-runtime@0.1.38` and the matching official main template. Keep old packages downloadable for existing lockfiles. The stable release and all eight deprecation flags were verified against the public registry; this does not deploy consumer applications.

## Supported models stay the same

New development supports Vault UI and Mini App v2. Mini App v1 is deprecated for new projects; existing routes, bindings, runtime and maintenance compatibility remain. Main consolidation does not convert v1, bind v2 to a token, or merge a project's Vault/App identities. Vault UI and standalone App remain separate review/submission deliverables.


Explicit routing test Workbenches now have a [matching standalone source-package workflow](mini-app-routing-source-packages.md). It uses the existing published routing identity without another Runtime release. Default main/latest and production gates remain unchanged.
