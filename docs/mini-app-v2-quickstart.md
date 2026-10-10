# Mini App v2 developer preview

Start with [Vault UI / Mini App v2 and code reuse](development.md) ([中文](development.zh-CN.md)), then follow [the step-by-step v2 walkthrough](from-zero-mini-app.md) ([中文](from-zero-mini-app.zh-CN.md)). Token-bound v1 is deprecated for new development; [its main/latest workflow](mini-app-v1.md) remains for existing-App compatibility and maintenance only.

This branch is for independent Flap Apps. No CA, factory or Vault is required. The canonical production URL will be `https://flap.sh/apps/{slug}`. Local preview is available now; production publication follows the coordinated host/Workbench rollout.

| Item | Preview contract |
| --- | --- |
| Official repository | `https://github.com/flap-sh/flap-vault-component-template` |
| Developer branch | Current official `feat/mini-app-v2` head, including documentation updates |
| Stable main baseline | `@flapsdk/vault-runtime@0.1.35` / `30784d4` |
| Published preview (checked 2026-10-11) | **`@flapsdk/vault-runtime@0.1.36-next.0` — published** |
| Published source commit / npm `gitHead` | `ff5d612d80e0fe387e612b60dca5275c2fd91a24` |
| npm channel | `next`; never `latest` for this preview |
| Example | `src/vaults/standalone-example`, local `/standalone-example` |

**`0.1.36-next.0` is published on npm `next`.** It includes main 0.1.35 and shared App wallet operations through `useFlapSdk({ chainId })`. Developers can validate, run E2E and generate a source ZIP from the current official template head with matching runtime inputs. Older preview releases are deprecated; update the template source rather than editing only its version number. Stable `latest` remains `0.1.35`.

Documentation lives on `feat/mini-app-v2` with the template. The latest official template commit may be newer than the published SDK commit: docs and official authoring tools can update independently. Packaging checks that the published commit is an ancestor and that runtime source, dependencies, build inputs and ZIP/E2E protocol remain unchanged. The ZIP retains npm's published version and `runtimePackageGitHead`, not the newer docs commit. SDK publication does not by itself approve an App for production; submit it to the matching testing Workbench for review.

## Start developing

Use Node.js 24 and Yarn 1.22.

```bash
git clone --branch feat/mini-app-v2 https://github.com/flap-sh/flap-vault-component-template.git
cd flap-vault-component-template
yarn install --frozen-lockfile
yarn app:scaffold my-app
yarn dev
```

Open `http://localhost:3000/my-app`. Keep your App work in `src/vaults/my-app`. The template already contains the SDK source: import from `@/src/sdk` and shared primitives from `@/src/ui`. App authors do not install a second runtime inside their App folder. The npm runtime is consumed by Flap hosts and Workbench.

Start with `src/vaults/standalone-example/Component.tsx` and its locale file. Use the shared `useFlapSdk({ chainId: 56 })` for wallet/contract actions, locale and notifications. The compatibility `useMiniAppSdk()` hook provides `context.appId/slug` and authenticated `session` when needed; it is part of the same package. Keep `schemaVersion: 2`, `mode: "mini-app"`, `appModel: "standalone"`, a valid immutable `slug`, and `match.bindings: []`. Keep the generated artifact ID stable across updates. The new `app:scaffold` command creates these values and registers local preview automatically. Do not convert the older token-scoped `flap-streets` example by merely deleting its token binding; port its business UI into a new standalone scaffold instead.

## Session and development limits

- `session.isConnected` means a wallet is connected. `session.isAuthenticated` means the host verified Flap login for that wallet. They are different states.
- Call `session.connect()` or `session.signIn()` only after the corresponding user action. Do not implement a second login or expose credentials in the App.
- Local `?appSession=guest` / `?appSession=connected` states are development fixtures. They do not prove real wallet authorization. Real shared-login verification requires the matching Flap test host.
- This is a reviewed UI module, not an arbitrary website runtime. Existing import, endpoint, media and capability limits remain. Wallet actions are supported through shared `useFlapSdk({ chainId })` with reviewed `walletChains` and `walletContracts`; see [wallet SDK](mini-app-wallet.md). Bound Vault/Token context remains available to token-scoped UIs.
- Keep all user-visible strings in every declared `i18n.json` locale. Do not hardcode copy in `Component.tsx`.

## Validate and submit to testing

```bash
yarn app:check my-app
yarn app:e2e my-app
yarn app:package my-app
yarn app:verify-package dist/my-app.zip
```

The E2E runner covers PC, iPad and H5 in guest and connected fixture states (six checks), with source attestation and current hashes. It starts the matching local preview automatically. If Chromium is missing, run `yarn playwright install chromium` once. Optional `yarn app:build` checks the preview template's production compilation.

Upload only the generated `dist/my-app.zip` to the **designated App v2 testing Workbench**, after its runtime has been pinned to the same exact SDK version. Do not submit this prerelease ZIP to the older production Workbench. Source format 7, schema/E2E hashes, exact published runtime commit and operator review remain required. No CA or on-chain registration is added.

App commands select npm `next` and the official `origin/feat/mini-app-v2` source ref. Forks and arbitrary refs cannot supply preview release provenance. Maintainers working with an official `upstream` remote can explicitly set `FLAP_TEMPLATE_FRESHNESS_REF=upstream/feat/mini-app-v2`; the repository origin is still verified. Do not bypass a failed check or edit npm provenance in the ZIP.

`latest` and `next` have independent freshness checks. App v2 commands read only npm `next`; stable Vault commands read only npm `latest`. Advancing `latest` alone does not invalidate an unchanged `next` release or require another preview publication. An outdated preview still fails against a newer `next` release, and official source/provenance checks remain mandatory. SDK API compatibility and coordinated host/Workbench upgrades must still be reviewed when adopting a new release.

The `0.1.36-next.0` version and source commit above have both been published. If `package/preview-runtime-unpublished` still appears, check that your version matches, the official template contains the published commit, and runtime inputs are unchanged. Restore local SDK/tool edits; keep App work in `src/vaults/{slug}`. Do not substitute `latest`, a private canary or manually edited ZIP proof. Future runtime/dependency/build/protocol changes require a matching new `next` publication; docs, official authoring tools and stable-only updates do not.

Before updating the template, save your App source separately or commit it on your own work branch. The normal check/package commands require the official template HEAD; a developer's extra commits cause an ahead/diverged diagnostic. Reapply only your App folder and its preview registration onto the updated official checkout. The package preflight fast-forwards only when local work does not conflict; it never discards that work.

## Stable migration

Before launch, Flap will publish the stable runtime and align the template, host and Workbench. Follow that release's migration note, update to its exact template/version, and regenerate check/E2E/ZIP proof. Your App UI, slug and artifact identity should remain reusable. Vault UI authors and maintainers of existing token-scoped v1 Apps continue using the stable `main/latest` workflow. New Apps use v2 only.

## 中文快速说明

1. 切换官方仓库的 `feat/mini-app-v2` 分支，使用 Node 24 和 Yarn 安装依赖。
2. 执行 `yarn app:scaffold my-app`，再运行 `yarn dev`，打开 `/my-app`。新 App 不需要 CA、工厂或 Vault。
3. 在 `src/vaults/my-app` 开发 UI，本次共用钱包版本使用 `useFlapSdk({ chainId: 56 })`；需要 App 身份/验证会话时可选用兼容 Hook `useMiniAppSdk()`。两者来自同一个 SDK；模板已包含源码，不要在 App 内另装一套。
4. `0.1.36-next.0` 已发布到 npm `next`，包含共用钱包能力；正式 `latest` 仍为 `0.1.35`。使用上面的 `app:check → app:e2e → app:package → app:verify-package` 流程。模板使用官方分支最新 HEAD，版本及 runtime 输入匹配已发布包；文档和官方开发工具提交可以更新。
5. ZIP 只提交到配套的 App v2 测试 Workbench。本地 connected 状态是预览夹具；真实登录互通需到配套测试主站验证。
6. 保存自己的 App 源码后再更新模板。个人分支的额外提交不能冒充官方模板来源；将 App 文件与预览注册迁移到官方分支后再打包。

新开发只支持 Vault UI 和 Mini App v2；v1 停止新开发，保留旧应用兼容维护流程。上线前按正式版迁移说明重新校验、E2E 和打包即可。

两个通道独立检查：App v2 只读取 npm `next`，正式 Vault 流程只读取 npm `latest`。正式版后续升级不会阻止现有预览版，也无需为了追平正式版而发布新的 `next`。预览版本过旧、源码来源不符、版本与已发布提交不一致仍会被拦截；采用新 SDK 时仍需核对 API 兼容性，并同步宿主与 Workbench。

`0.1.36-next.0` 及其来源提交均已发布，现在可以按上述流程生成源码 ZIP。如果仍提示 `package/preview-runtime-unpublished`，核对本地版本、官方模板是否包含发布提交，以及 runtime 输入是否保持一致；恢复本地 SDK/工具改动，App 源码放在 `src/vaults/{slug}`。不要替换为 `latest`、私有 canary 或手改 ZIP 证明。runtime、依赖、构建或打包协议更新需要对应的新 `next` 发布；文档、官方开发工具及仅更新 `latest` 无需再次更新 `next`。

文档与模板直接放在 `feat/mini-app-v2`。官方模板 HEAD 可以晚于 npm 发布提交，打包会验证发布提交的祖先关系，并核对 runtime 源码、依赖、构建及 ZIP/E2E 协议输入。ZIP 中仍记录 npm 的发布版本和 `runtimePackageGitHead`，不会把文档提交当作 SDK 发布提交。个人分支额外提交仍会被官方分支校验拦截。旧预览版已弃用，升级时迁移 App 源码，不要只改版本号。SDK 已发布不代表 App 已获准上线，仍需提交到配套测试 Workbench 审核。
