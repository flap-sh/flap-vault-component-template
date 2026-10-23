# main 分支整合与发布状态

[English](main-migration.md) · [开发指南](development.zh-CN.md) · [Mini App v2 快速开始](mini-app-v2-quickstart.md)

Vault UI 与 Mini App v2 已统一在官方 `main` 维护，共用一套模板、一个 `@flapsdk/vault-runtime`、公共 UI 和宿主钱包。Vault UI 使用 `vault:*`，独立 v2 App 使用 `app:*`；manifest、身份、权限、上下文和打包证明仍各自独立。

## 当前状态（2026-10-23 核对）

| 项目 | 状态 |
| --- | --- |
| 源码整合 | Mini App v2 已通过 `02e68e4` 合入 main |
| 源码分支 | Vault UI 与 Mini App v2 都使用 `main` |
| App 命令 / 发布元数据 / CI | 已实现 main/latest，接受包括 `0.1.38` 在内的正式版本 |
| 准备中的正式版 | **`0.1.38`**，尚未发布到 npm |
| 已发布 npm `latest` | `0.1.37`，来源 `ad40bab7dfc976d20dd82050aeec17fef18a39b3` |
| 已发布 npm `next` | `0.1.40-next.0`，来源 `0d21863aa19bde5ad6712d760d3badea6a28e3a4` |
| 新 App ZIP 提交 | 等待匹配的 `0.1.38` 发布与主站、Workbench 配套上线 |
| 历史 next 版本 | 正式版发布后标记弃用，保留下载 |

源码合并或修改版本号不会发布 npm、移动 dist-tag、升级已部署宿主或批准 App 上线。正式 `0.1.38` 源码包含共用 App 钱包、动态 IPFS/FSI、长文本 CopyButton 及合并后的构建、依赖更新；其 runtime 输入不同于旧发布版本，不能沿用旧正式版或 next 的 ZIP 证明。

## 获取源码与本地开发

使用 Node.js 24 与 Yarn 1.22：

```bash
git clone --branch main https://github.com/flap-sh/flap-vault-component-template.git
cd flap-vault-component-template
yarn install --frozen-lockfile
yarn app:scaffold my-app
yarn dev
```

开发者从模板引入 `@/src/sdk`、`@/src/ui`，不要在 App 目录安装另一套 runtime 或钱包 provider。更新时保留 `src/vaults/{slug}`、artifact ID、不可变 slug 与预览注册；从旧整合分支切换前先保存工作。见[代码复用说明](development.zh-CN.md#哪些代码能直接复用)。

## 过渡期命令行为

| 流程 | 源码 / npm 通道 |
| --- | --- |
| `vault:*` | 官方 `origin/main` / latest |
| `app:*` | 官方 `origin/main` / latest，接受正式 `0.1.38` |
| `runtime:package` | 干净且已提交的官方 main / latest，生成的 publishConfig 显式使用 latest |
| `runtime:package:next` | 仅在明确授权预览发布时使用官方 `origin/next` / next |

使用 fork 的维护者设置 `FLAP_TEMPLATE_FRESHNESS_REF=upstream/main`，upstream 必须指向官方 Flap 仓库。App 命令拒绝预览或本地引用及 fork 远端。主 CI 与 App 验证工作流使用 latest；App 工作流运行在官方 main。通道各自检查自己的 npm tag，`next=0.1.40-next.0` 不影响正式 `0.1.38`。

在官方 main 上，npm 发布前可以运行 App 检查、本地游客/已连接 E2E 和构建。App 源码 ZIP 与普通本地验证要求**精确匹配已发布 latest 版本、真实 gitHead 祖先关系及 runtime、依赖、构建、协议输入**。官方纯文档或开发工具提交可以更新并保留原身份；本地 SDK/工具改动、私有 canary 和伪造证明均不能替代发布。

npm latest 仍为 `0.1.37` 时，打包 `0.1.38` 会以 `package/runtime-unpublished` 拦截。等待发布，不要改写版本或包内 metadata。E2E 与私有 canary 仅验证联调，不代表 npm 已发布。见[发布检查单](releases/0.1.38.zh-CN.md)。

## 计划中的正式版升级与预览版弃用

`0.1.38` 发布后，维护者在 Workbench、主站精确固定并部署同一 runtime 与配套校验输入：

```bash
yarn add --exact @flapsdk/vault-runtime@0.1.38
```

App 开发者更新已宣布的 main 模板，保留 App 目录和注册，重新生成检查、E2E、打包、验证证明，不需要在 App 目录安装 npm 包。按公告选择正式目标，不要按数字挑最大的历史预发布版。本次迁移无需额外发布 next。

正式版发布后，弃用当前全部八个 next：`0.1.32-next.0`、`0.1.32-next.1`、`0.1.33-next.0`、`0.1.33-next.1`、`0.1.36-next.0`、`0.1.38-next.0`、`0.1.39-next.0`、`0.1.40-next.0`。提示引导升级至 `@flapsdk/vault-runtime@0.1.38` 与配套官方 main 模板。保留旧包下载以兼容现有锁文件。本次源码修改不执行 npm 发布或弃用。

## 支持的开发类型不变

新开发支持 Vault UI 和 Mini App v2。Mini App v1 停止新项目开发，已有路由、绑定、runtime 和维护兼容保留。主干整合不自动转换 v1、给 v2 绑定 Token 或合并项目的 Vault/App 身份；Vault UI 与独立 App 仍分别提交和审核。
