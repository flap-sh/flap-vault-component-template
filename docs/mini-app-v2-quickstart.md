# Mini App v2: development and release status

Start with [Vault UI / Mini App v2 and code reuse](development.md) ([中文](development.zh-CN.md)), then [the v2 walkthrough](from-zero-mini-app.md) ([中文](from-zero-mini-app.zh-CN.md)). New development supports Vault UI and Mini App v2. Existing token-bound v1 Apps retain [maintenance compatibility](mini-app-v1.md); do not create new v1 projects.

## Source branch and published runtime

After the v2 merge, **main is the shared source branch for Vault UI and Mini App v2**. The integration branch is transitional, not a second SDK. Read [main integration and release status](main-migration.md) ([中文](main-migration.zh-CN.md)) before choosing a checkout or submitting a package.

| Item | Current status (checked 2026-10-23) |
| --- | --- |
| Official repository | `https://github.com/flap-sh/flap-vault-component-template` |
| Source branch after the v2 merge | `main` |
| Source before the merge | `feat/mini-app-v2` for local v2 integration work |
| Planned stable `latest` | **`0.1.38`**, not yet published; shared by Vault UI and Mini App v2 after migration |
| Historical next versions | Deprecated after the stable release, with downloads retained |
| Published npm `latest` | `0.1.37` |
| Published npm `next` | `0.1.40-next.0` |
| Published next source / npm `gitHead` | `0d21863aa19bde5ad6712d760d3badea6a28e3a4` |
| Current integration ZIP readiness | Pending a matching runtime release and App command/CI migration to main |
| Example | `src/vaults/standalone-example`, local `/standalone-example` |

`0.1.40-next.0` includes shared App wallet operations through `useFlapSdk({ chainId })`, dynamic IPFS/FSI and the shared [CopyButton](copy-button.md), including long-text copying up to 1,048,576 UTF-16 code units. It is published, but it does not describe every newer source commit. The current integration contains additional dependency/build changes and E2E tooling updates. **Do not use its unchanged version number to claim that the integration HEAD matches the published runtime.**

A source merge does not publish npm or upgrade hosts. `latest` and `next` remain channels for one package; their freshness checks are independent. Do not assume stable `latest` already has the v2 APIs because the source is being merged to main.

## Start developing

Use Node.js 24 and Yarn 1.22. After the v2 merge is announced:

```bash
git clone --branch main https://github.com/flap-sh/flap-vault-component-template.git
cd flap-vault-component-template
yarn install --frozen-lockfile
yarn app:scaffold my-app
yarn dev
```

Before that merge, use `--branch feat/mini-app-v2` for local v2 development. The shared source checkout is distinct from the package-submission release described below.

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

**These commands require an announced, matching source/runtime release. The current integration HEAD is not yet ready for ZIP submission.** The `app:*` wrapper currently selects npm `next` and the official `origin/feat/mini-app-v2` reference; it still requires a prerelease template version and does not accept main as its next-channel source reference. Checkout of main does not change those rules. The [migration guide](main-migration.md#command-behavior-during-the-transition) records the command/CI work and matching publication required before main-based submission can be announced. This documentation update does not change those guards or publish a runtime.

E2E covers PC, iPad and H5 in guest and connected states (six checks), current source/asset hashes and preview-source identity. Install Chromium with `yarn playwright install chromium` once if necessary. `yarn app:build` also runs freshness preflight; a local compilation or private canary cannot replace a successful source-package preflight.

Once the coordinated release is announced, use its official checkout and exact published runtime identity, then upload only generated `dist/my-app.zip` to the designated App v2 testing Workbench. Workbench and the main host must pin the matching runtime and validation inputs. Source format 7, E2E schema 3 and human review remain required; a successful upload is not approval to launch.

A published runtime commit must be in the template history and its runtime, dependency, build and ZIP/E2E protocol inputs must match. Docs and official authoring-only commits may be newer without another SDK publication; the current integration also changes pinned inputs, so that exception does not apply. Until the stable migration is complete, do not substitute the current `latest=0.1.37`, a private canary, fork/local ref or edited ZIP metadata as provenance. After migration, use the announced `0.1.38` main/latest identity. Maintainers using a fork select the documented official `upstream` reference, not the fork's branch.

Before switching/updating source, save or commit App work separately. Reapply the App folder and preview registration onto the announced source, preserving identity and regenerating E2E/ZIP evidence. Personal extra commits can trigger ahead/diverged checks; automatic fast-forward never discards conflicting local work.

## Stable migration

Main consolidates source maintenance; it does not itself promote `next` to `latest`. The planned stable release is **`0.1.38` under latest**, not yet published. Before its release, App commands, release metadata and CI must accept main/latest; the main host and Workbench must then pin and deploy the matching runtime. Both Vault UI and v2 use that stable release; no additional next release is planned for this migration. After publication, all historical next versions will be marked deprecated with an upgrade message, while downloads remain available. See [the migration plan](main-migration.md#planned-stable-upgrade-and-preview-deprecation). Vault UI and App remain distinct delivery/review models using the shared SDK. Existing v1 Apps remain compatible.

## 中文快速说明

1. v2 合并宣布完成后，Vault UI 和 Mini App v2 都从 `main` 获取源码；合并前，v2 本地开发使用 `feat/mini-app-v2`。使用 Node 24、Yarn 1.22。
2. `app:scaffold my-app`、`yarn dev` 用于创建和预览独立 App。目录仍叫 `src/vaults`，但 v2 不绑定 CA、工厂或 Vault；主站入口为 `/apps/{slug}`。
3. Vault UI 使用 `useFlapSdk()` 与 `vault:*`；v2 使用 `useFlapSdk({ chainId })` 与 `app:*`，共用 SDK、UI、钱包和业务代码，身份、权限与证明各自独立。
4. 计划正式版为 **`0.1.38`（尚未发布）**，发布后两类开发统一使用 main/latest；全部历史 next 将标记弃用并保留下载。当前 npm 仍为 `latest=0.1.37`、`next=0.1.40-next.0`。整合源码已改变依赖、构建输入，不能沿用旧身份提交 ZIP。
5. 当前 `app:*` 仍校验预览分支引用，并要求预发布版本；切换 main 不会自动切换工具。等待配套发布及命令/CI 迁移完成后，再从宣布的官方来源执行检查、E2E、打包和验证。
6. 本地 E2E、私有 canary 不代替正式来源证明；Workbench 与主站需配套，App 上线仍需审核。Mini App v1 停止新开发，旧应用兼容保留。

详细状态见 [main 分支整合与发布说明](main-migration.zh-CN.md)，操作流程见 [v2 从零开发](from-zero-mini-app.zh-CN.md)。
