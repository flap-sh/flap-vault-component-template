# Mini App v1：兼容与迁移（停止新开发）

**Mini App v1 已停止支持新开发，旧应用继续兼容。** 新项目请使用 [Mini App v2](from-zero-mini-app.zh-CN.md) 或 [Vault UI](from-zero-vault-ui.md)。本文仅供旧应用维护与迁移。

[English](mini-app-v1.md) · [选择 Vault UI / Mini App v2](development.zh-CN.md)

Mini App v1 是已有的 Token 专属全屏体验，主站入口为 `/{chain}/{tokenCA}/mini-app`。它与 Vault UI 共用 SDK、Token 宿主上下文和源码包流程，显示在 Mini App 壳中。独立 Mini App v2 的入口则是 `/apps/{slug}`。

## 如何识别 v1

- Manifest 声明 `mode: "mini-app"` 和中英文 `displayTitle`。
- 省略 v2 字段 `schemaVersion`、`appModel`、`slug`。v2 标识不完整或不合法时应该报错，不能当作 v1。
- `match.bindings` 是 token-only：含 `chainId` 和真实已部署 ERC20 `tokenAddresses`，此模式不允许 factory/Vault binding。
- 同一包内 CA 后缀全部为 `7777`（税 Token），或全部为 `8888`（零税 Token），不能混用。
- 当前源码包格式为 6，E2E 报告为 v2，需要证明绑定 Token/网络。历史包按已有兼容规则处理。

v1 可以通过 SDK/宿主上下文操作对应 Token 的 Vault；token-only 的 manifest 规则不代表禁止经允许的 Vault 操作。绑定 factory 的 Vault UI 是另外一种交付物，不是 v1 Mini App。

## 维护已有 v1 应用

保留已有源码目录、artifact 身份、Token binding 和中英文标题，继续使用兼容的官方 `main` / npm `latest` 维护流程。字段见 [Manifest 规则](manifest.md) 中的旧版 Mini App 章节。不要创建新的 v1 项目；旧脚手架仅为维护工具保留，并会输出弃用提示。

已有 7777 App 仍需真实已部署的测试 Token；已有 8888 App 保留文档约定的同链测试 Token 兼容规则。停止新开发不代表可以绕过 Token 校验、权限、审核或产物来源验证。

业务代码放在 `Component.tsx`，ABI 放在 `VaultABI.ts`，文案覆盖 `i18n.json` 中声明的全部语言。通过 `@/src/sdk` 的 `useFlapSdk()` 获取 SDK，`sdk.context` 提供当前 Token/Vault 数据；展示组件从 `@/src/ui` 引入。本地打开 `/{folder-name}` 并传入实际链和 Token 参数，根布局保持全高。

```bash
yarn vault:check my-token-app
yarn vault:e2e my-token-app
yarn vault:package my-token-app
yarn vault:verify-package dist/my-token-app.zip
```

以上命令用于已有 `my-token-app` 目录，并要求保留真实 Token 和 binding。将生成的 ZIP 提交到配套的 Vault/v1 Workbench 审核，不要为绕过 Token 校验而改用 `app:*`。

## 复用代码或迁移到 v2

界面、翻译、ABI、业务函数的复用方式见[统一开发指南](development.zh-CN.md#哪些代码能直接复用)。新增独立 v2 时，在 `feat/mini-app-v2` 分支创建新的 App，迁移可复用代码，适配目标选择和钱包权限，再生成独立的格式 7 游客/已连接测试证明。除非明确规划迁移，保留原有 v1 产物和绑定。

仅删除 Token binding 不会把 v1 自动变成 v2。不要把旧 v1 artifact 的身份改成无关的新 App，也不要伪造空/零地址的 Token/Vault 上下文。独立流程和钱包版本发布状态见 [v2 从零开发](from-zero-mini-app.zh-CN.md)。
