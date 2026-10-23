# Mini App v2: development and release status

Start with [Vault UI / Mini App v2 and code reuse](development.md) ([中文](development.zh-CN.md)), then [the v2 walkthrough](from-zero-mini-app.md) ([中文](from-zero-mini-app.zh-CN.md)). New development supports Vault UI and Mini App v2. Existing token-bound v1 Apps retain [maintenance compatibility](mini-app-v1.md); do not create new v1 projects.

## Source branch and published runtime

**Main is now the shared source branch for Vault UI and Mini App v2.** App commands use main/latest and accept stable `0.1.38`; there is one SDK. Read [main integration and release status](main-migration.md) ([中文](main-migration.zh-CN.md)) before choosing a checkout or submitting a package.

| Item | Current status (checked 2026-10-23) |
| --- | --- |
| Official repository | `https://github.com/flap-sh/flap-vault-component-template` |
| Source branch | `main` for Vault UI and Mini App v2 |
| Planned stable `latest` | **`0.1.38`**, not yet published; shared by Vault UI and Mini App v2 after migration |
| Historical next versions | Deprecated after the stable release, with downloads retained |
| Published npm `latest` | `0.1.37` |
| Published npm `next` | `0.1.40-next.0` |
| Published next source / npm `gitHead` | `0d21863aa19bde5ad6712d760d3badea6a28e3a4` |
| App command / CI routing | Official main / npm latest, stable `0.1.38` |
| Current App ZIP readiness | Pending matching npm `0.1.38` publication and host/Workbench rollout |
| Example | `src/vaults/standalone-example`, local `/standalone-example` |

`0.1.40-next.0` includes shared App wallet operations through `useFlapSdk({ chainId })`, dynamic IPFS/FSI and the shared [CopyButton](copy-button.md), including long-text copying up to 1,048,576 UTF-16 code units. It is published, but it does not describe every newer source commit. The current main template has advanced to stable `0.1.38`, including dependency/build and E2E tooling updates. **Do not use an older published package as this template’s runtime identity.**

A source merge does not publish npm or upgrade hosts. `latest` and `next` remain channels for one package; their freshness checks are independent. Do not assume stable `latest` already has the v2 APIs because main now contains the v2 source.

## Start developing

Use Node.js 24 and Yarn 1.22 from official main:

```bash
git clone --branch main https://github.com/flap-sh/flap-vault-component-template.git
cd flap-vault-component-template
yarn install --frozen-lockfile
yarn app:scaffold my-app
yarn dev
```

The shared source checkout is distinct from the npm package-submission release described below.

Open `http://localhost:3000/my-app`. Keep App work in `src/vaults/my-app`, preserving the generated artifact ID and immutable slug. The template already includes SDK source: import `@/src/sdk` and `@/src/ui`; App authors do not install a second runtime or wallet provider inside the App folder. Hosts install the npm runtime.

Start with `src/vaults/standalone-example/Component.tsx`. Use `useFlapSdk({ chainId: 56 })` for reviewed wallet/contract operations. `useMiniAppSdk()` remains a compatible App identity/authenticated-session hook in the same SDK. Keep `schemaVersion: 2`, `mode: "mini-app"`, `appModel: "standalone"`, a valid `slug` and `match.bindings: []`. No CA, factory or Vault is required. The main-host URL is `/apps/{slug}`; local preview is `/{slug}`. Vault UI instead uses `useFlapSdk()` with host-bound context and `vault:*` commands.

## Session and development limits

- `session.isConnected` is a connected wallet; `session.isAuthenticated` is verified Flap login. Wallet signing does not require a second wallet connection or another SDK.
- Call `session.connect()` or `session.signIn()` from the corresponding user action. Do not expose credentials or implement a second login.
- Local `?appSession=guest` / `?appSession=connected` states are read-only development fixtures, not proof of real wallet authorization. Shared-login and project transactions require the matching Flap test host.
- Existing import, endpoint, media and capability limits remain. Declare reviewed `walletChains`, `walletContracts` and genuine resolver handles as described in the [wallet guide](mini-app-wallet.md).
- Keep all visible copy in each declared `i18n.json` locale.

## Validate and submit to testing

The submission sequence remains:

```bash
yarn app:check my-app
yarn app:e2e my-app
yarn app:package my-app
yarn app:verify-package dist/my-app.zip
```

App check, local E2E and build use official main/latest. **ZIP packaging requires the exact matching npm release: `0.1.38` is not yet published.** Until it is, packaging stops with `package/runtime-unpublished`; do not edit proof metadata or reuse `0.1.37` / an old next runtime. The [release status](main-migration.md#command-behavior-during-the-transition) records the implemented main/latest policy and pending publication/host rollout.

E2E covers PC, iPad and H5 in guest and connected states (six checks), current source/asset hashes and preview-source identity. Install Chromium with `yarn playwright install chromium` once if necessary. `yarn app:build` also runs freshness preflight; a local compilation or private canary cannot replace a successful source-package preflight.

Once the coordinated release is announced, use its official checkout and exact published runtime identity, then upload only generated `dist/my-app.zip` to the designated App v2 testing Workbench. Workbench and the main host must pin the matching runtime and validation inputs. Source format 7, E2E schema 3 and human review remain required; a successful upload is not approval to launch.

A published runtime commit must be in the template history and its runtime, dependency, build and ZIP/E2E protocol inputs must match. Docs and official authoring-only commits may be newer without another SDK publication; the current integration also changes pinned inputs, so that exception does not apply. Do not substitute current `latest=0.1.37`, a historical next package, private canary, fork/local ref or edited ZIP metadata as provenance. Use the exact `0.1.38` main/latest identity after publication. Maintainers using a fork select the documented official `upstream` reference, not the fork's branch.

Before switching/updating source, save or commit App work separately. Reapply the App folder and preview registration onto the announced source, preserving identity and regenerating E2E/ZIP evidence. Personal extra commits can trigger ahead/diverged checks; automatic fast-forward never discards conflicting local work.

## Stable migration

Main consolidates source maintenance; it does not itself promote `next` to `latest`. The planned stable release is **`0.1.38` under latest**, not yet published. App commands, release metadata and CI now accept main/latest; the main host and Workbench must pin and deploy the matching runtime after its publication. Both Vault UI and v2 use that stable release; no additional next release is planned for this migration. After publication, all historical next versions will be marked deprecated with an upgrade message, while downloads remain available. See [the migration plan](main-migration.md#planned-stable-upgrade-and-preview-deprecation). Vault UI and App remain distinct delivery/review models using the shared SDK. Existing v1 Apps remain compatible.

## 中文快速说明

1. Vault UI 和 Mini App v2 都从官方 `main` 获取源码，使用 Node 24、Yarn 1.22。
2. `app:scaffold my-app`、`yarn dev` 用于创建和预览独立 App。目录仍叫 `src/vaults`，但 v2 不绑定 CA、工厂或 Vault；主站入口为 `/apps/{slug}`。
3. Vault UI 使用 `useFlapSdk()` 与 `vault:*`；v2 使用 `useFlapSdk({ chainId })` 与 `app:*`，共用 SDK、UI、钱包和业务代码，身份、权限与证明各自独立。
4. 计划正式版为 **`0.1.38`（尚未发布）**，发布后两类开发统一使用 main/latest；全部历史 next 将标记弃用并保留下载。当前 npm 仍为 `latest=0.1.37`、`next=0.1.40-next.0`。整合源码已改变依赖、构建输入，不能沿用旧身份提交 ZIP。
5. `app:*` 和 CI 已使用 main/latest，接受正式 `0.1.38`；检查、本地 E2E、构建可执行，ZIP 打包等待匹配 npm 发布。发布后重新生成检查、E2E、打包和验证证明。
6. 本地 E2E、私有 canary 不代替正式来源证明；Workbench 与主站需配套，App 上线仍需审核。Mini App v1 停止新开发，旧应用兼容保留。

详细状态见 [main 分支整合与发布说明](main-migration.zh-CN.md)，操作流程见 [v2 从零开发](from-zero-mini-app.zh-CN.md)。
