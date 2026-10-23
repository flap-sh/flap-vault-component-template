# Main branch integration and release status

[简体中文](main-migration.zh-CN.md) · [Development guide](development.md) · [Mini App v2 quickstart](mini-app-v2-quickstart.md)

Vault UI and Mini App v2 are maintained together on official `main`. They share one template, one `@flapsdk/vault-runtime` package, public UI components and the host wallet. Use `vault:*` for Vault UI and `app:*` for standalone v2 Apps. Manifests, identities, permissions, contexts and package proofs remain distinct.

## Current status — checked 2026-10-23

| Item | Status |
| --- | --- |
| Source integration | Mini App v2 merged into main in `02e68e4` |
| Source branch | `main` for Vault UI and Mini App v2 |
| App commands / release metadata / CI | Implemented on main/latest, accepting stable versions including `0.1.38` |
| Prepared stable version | **`0.1.38`**, not yet published to npm |
| Published npm `latest` | `0.1.37`, source `ad40bab7dfc976d20dd82050aeec17fef18a39b3` |
| Published npm `next` | `0.1.40-next.0`, source `0d21863aa19bde5ad6712d760d3badea6a28e3a4` |
| New App ZIP submission | Waiting for matching `0.1.38` publication and host/Workbench rollout |
| Historical next versions | To be deprecated after stable publication; downloads remain available |

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
| `app:*` | Official `origin/main` / latest; stable `0.1.38` is accepted |
| `runtime:package` | Clean committed official main / latest; generated publishConfig explicitly uses latest |
| `runtime:package:next` | Explicitly authorized preview release from official `origin/next` / next |

Fork maintainers select `FLAP_TEMPLATE_FRESHNESS_REF=upstream/main`, with upstream pointing to the official Flap repository. App commands reject preview/local refs and fork remotes. Main CI and the App validation workflow use latest; the App workflow runs on official main. Each release channel checks only its own npm tag, so `next=0.1.40-next.0` does not invalidate stable `0.1.38`.

App check, local guest/connected E2E and build can run before npm publication from the official main checkout. App source ZIPs and normal local verification require the **exact published latest version, real gitHead ancestry and matching runtime/dependency/build/protocol inputs**. Official documentation/authoring-only descendants can retain that identity. Local SDK/tool edits, private canaries and fabricated proof cannot.

While npm latest is `0.1.37`, packaging `0.1.38` stops with `package/runtime-unpublished`. Wait for publication; do not rewrite version strings or package metadata. E2E and a private canary verify integration, not npm publication. See [the release checklist](releases/0.1.38.md).

## Planned stable upgrade and preview deprecation

After `0.1.38` is published, maintainers pin and deploy the same runtime and validation inputs in Workbench and the main host:

```bash
yarn add --exact @flapsdk/vault-runtime@0.1.38
```

App authors update the announced main template, preserve their App source/registration and regenerate check, E2E, package and verification proof. They do not install the npm package in their App folder. Choose the announced stable target rather than the numerically highest historical prerelease. No additional next release is needed for this migration.

Deprecate all eight currently published next versions after the stable release: `0.1.32-next.0`, `0.1.32-next.1`, `0.1.33-next.0`, `0.1.33-next.1`, `0.1.36-next.0`, `0.1.38-next.0`, `0.1.39-next.0` and `0.1.40-next.0`. The message should direct users to `@flapsdk/vault-runtime@0.1.38` and the matching official main template. Keep old packages downloadable for existing lockfiles. This source update does not publish or deprecate registry packages.

## Supported models stay the same

New development supports Vault UI and Mini App v2. Mini App v1 is deprecated for new projects; existing routes, bindings, runtime and maintenance compatibility remain. Main consolidation does not convert v1, bind v2 to a token, or merge a project's Vault/App identities. Vault UI and standalone App remain separate review/submission deliverables.
