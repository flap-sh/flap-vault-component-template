# Main branch integration and release status

[简体中文](main-migration.zh-CN.md) · [Development guide](development.md) · [Mini App v2 quickstart](mini-app-v2-quickstart.md)

Vault UI and Mini App v2 are maintained together on official `main`. They share one template, one `@flapsdk/vault-runtime` package, public UI components and the host wallet. Use `vault:*` for Vault UI and `app:*` for standalone v2 Apps. Manifests, identities, permissions, contexts and package proofs remain distinct.

## Current status — checked 2026-10-29

| Item | Status |
| --- | --- |
| Source integration | Mini App v2 merged into main in `02e68e4` |
| Source branch | `main` for Vault UI and Mini App v2 |
| App commands / release metadata / CI | Implemented on main/latest, accepting stable versions including `0.1.39` |
| Stable version | **`0.1.39`**, published to npm latest |
| Upcoming stable candidate | **`0.1.40`**, Mini App routing only; not published, official main unchanged during preparation |
| Published npm `latest` | `0.1.39`, source `78c355f080a60770cfd64d71d94c525204d61583` |
| Routing testing candidate | `0.1.40-beta.routing.0`, runtime-only `routing` tag; not yet published |
| Current npm `next` | `0.1.40-next.4`, independent sensor/map testing release; unchanged by routing |
| Historical npm `next` | Eight versions through `0.1.40-next.0` are deprecated; downloads remain |
| App ZIP tooling | Use the published `0.1.39` identity and regenerate proofs; historical `0.1.38` check/package/verification remains recorded |
| Historical next versions | All eight are deprecated; downloads remain available |

A separate runtime-only `0.1.40-beta.routing.0` testing candidate is prepared on `feat/mini-app-routing`, without sensor/map APIs. It is not yet published; its independent `routing` tag does not move latest/next. Stable `0.1.40` and production changes remain deferred. The testing package cannot supply main/latest source-ZIP provenance. See [routing testing preparation](releases/0.1.40-beta.routing.0.md).

A source merge or version edit does not publish npm, move dist-tags, upgrade deployed hosts or approve an App. The stable `0.1.38` source includes the shared App wallet, dynamic IPFS/FSI, long-text CopyButton and the merged build/dependency updates. Its runtime inputs differ from previous publications, so an older stable/next package cannot supply its ZIP provenance.

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
| `app:*` | Official `origin/main` / latest; stable `0.1.39` is accepted |
| `runtime:package` | Clean committed official main / latest; generated publishConfig explicitly uses latest |
| `runtime:package:next` | Explicitly authorized preview release from official `origin/next` / next |

Fork maintainers select `FLAP_TEMPLATE_FRESHNESS_REF=upstream/main`, with upstream pointing to the official Flap repository. App commands reject preview/local refs and fork remotes. Main CI and the App validation workflow use latest; the App workflow runs on official main. Each release channel checks only its own npm tag, so `next=0.1.40-next.1` does not invalidate stable `0.1.39`.

App check, local guest/connected E2E and build can run before npm publication from the official main checkout. App source ZIPs and normal local verification require the **exact published latest version, real gitHead ancestry and matching runtime/dependency/build/protocol inputs**. Official documentation/authoring-only descendants can retain that identity. Local SDK/tool edits, private canaries and fabricated proof cannot.

`0.1.39` is public on npm latest, source `78c355f080a60770cfd64d71d94c525204d61583`. See [the current release record](releases/0.1.39.md) for archive verification and FSI rollout. The real App package/verification and unpublished-runtime gate results from `0.1.38` remain in [its historical release record](releases/0.1.38.md); they are not relabeled as `0.1.39` proof. New source ZIPs require the current published identity and current source-bound E2E proof.

## Stable upgrade and preview deprecation

With `0.1.39` published, maintainers must pin and deploy the same runtime and validation inputs in Workbench and the main host:

```bash
yarn add --exact @flapsdk/vault-runtime@0.1.39
```

App authors update the announced main template, preserve their App source/registration and regenerate check, E2E, package and verification proof. They do not install the npm package in their App folder. Choose the announced stable target rather than the numerically highest historical prerelease. No additional next release is needed for this migration.

All eight historical next versions are now deprecated: `0.1.32-next.0`, `0.1.32-next.1`, `0.1.33-next.0`, `0.1.33-next.1`, `0.1.36-next.0`, `0.1.38-next.0`, `0.1.39-next.0` and `0.1.40-next.0`. Their messages direct users to `@flapsdk/vault-runtime@0.1.38` and the matching official main template. Keep old packages downloadable for existing lockfiles. The stable release and all eight deprecation flags were verified against the public registry; this does not deploy consumer applications.

## Supported models stay the same

New development supports Vault UI and Mini App v2. Mini App v1 is deprecated for new projects; existing routes, bindings, runtime and maintenance compatibility remain. Main consolidation does not convert v1, bind v2 to a token, or merge a project's Vault/App identities. Vault UI and standalone App remain separate review/submission deliverables.
