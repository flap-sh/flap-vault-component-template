# Mini App v2 developer preview

This branch is for independent Flap Apps. No CA, factory or Vault is required. The canonical production URL will be `https://flap.sh/apps/{slug}`. Local preview is available now; production publication follows the coordinated host/Workbench rollout.

| Item | Preview contract |
| --- | --- |
| Official repository | `https://github.com/flap-sh/flap-vault-component-template` |
| Developer branch | `feat/mini-app-v2` |
| First SDK release | `@flapsdk/vault-runtime@0.1.33-next.0` |
| npm channel | `next`; never `latest` for this preview |
| Fixed source snapshot | `mini-app-v2-preview.1` |
| Example | `src/vaults/standalone-example`, local `/standalone-example` |

The version above is the prepared release target. **A source ZIP can only be generated after the exact version and source commit are published to npm `next`.** The package command checks this and gives `package/preview-runtime-unpublished` while that release is pending. Developers can start UI work and local preview before publication. Check npm release metadata or the maintainer's release note before treating the version as published.

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

Start with `src/vaults/standalone-example/Component.tsx` and its locale file. Use `useMiniAppSdk()` for `context.appId/slug`, locale, notifications and `session`. Keep `schemaVersion: 2`, `mode: "mini-app"`, `appModel: "standalone"`, a valid immutable `slug`, and `match.bindings: []`. Keep the generated artifact ID stable across updates. The new `app:scaffold` command creates these values and registers local preview automatically. Do not convert the older token-scoped `flap-streets` example by merely deleting its token binding; port its business UI into a new standalone scaffold instead.

## Session and development limits

- `session.isConnected` means a wallet is connected. `session.isAuthenticated` means the host verified Flap login for that wallet. They are different states.
- Call `session.connect()` or `session.signIn()` only after the corresponding user action. Do not implement a second login or expose credentials in the App.
- Local `?appSession=guest` / `?appSession=connected` states are development fixtures. They do not prove real wallet authorization. Real shared-login verification requires the matching Flap test host.
- This is a reviewed UI module, not an arbitrary website runtime. Existing import, endpoint, media and capability limits remain. Token-specific hooks and contract actions are not part of `useMiniAppSdk()`.
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

Before updating the template, save your App source separately or commit it on your own work branch. The normal check/package commands require the official template HEAD; a developer's extra commits cause an ahead/diverged diagnostic. Reapply only your App folder and its preview registration onto the updated official checkout. The package preflight fast-forwards only when local work does not conflict; it never discards that work.

## Stable migration

Before launch, Flap will publish the stable runtime and align the template, host and Workbench. Follow that release's migration note, update to its exact template/version, and regenerate check/E2E/ZIP proof. Your App UI, slug and artifact identity should remain reusable. Existing Vault UI and token-scoped Mini App authors continue using the stable `main/latest` workflow.

## 中文快速说明

1. 切换官方仓库的 `feat/mini-app-v2` 分支，使用 Node 24 和 Yarn 安装依赖。
2. 执行 `yarn app:scaffold my-app`，再运行 `yarn dev`，打开 `/my-app`。新 App 不需要 CA、工厂或 Vault。
3. 在 `src/vaults/my-app` 开发 UI，使用 `useMiniAppSdk()` 获取 Flap 的会话、语言和通知。模板已包含 SDK 源码，不要在 App 内另装一套 SDK。
4. 使用上面的 `app:check → app:e2e → app:package → app:verify-package` 流程。打包要求对应的 `0.1.33-next.0` 测试 SDK 已发布，且版本与源码提交完全匹配。
5. ZIP 只提交到配套的 App v2 测试 Workbench。本地 connected 状态是预览夹具；真实登录互通需到配套测试主站验证。
6. 保存自己的 App 源码后再更新模板。个人分支的额外提交不能冒充官方模板来源；将 App 文件与预览注册迁移到官方分支后再打包。

本预览保留旧 Vault UI / 绑定 Token 的 Mini App 的正式流程。上线前按正式版迁移说明重新校验、E2E 和打包即可。
