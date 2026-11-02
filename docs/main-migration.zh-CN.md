# main 分支整合与发布状态

[English](main-migration.md) · [开发指南](development.zh-CN.md) · [Mini App v2 快速开始](mini-app-v2-quickstart.md)

Vault UI 与 Mini App v2 已统一在官方 `main` 维护，共用一套模板、一个 `@flapsdk/vault-runtime`、公共 UI 和宿主钱包。Vault UI 使用 `vault:*`，独立 v2 App 使用 `app:*`；manifest、身份、权限、上下文和打包证明仍各自独立。

## 当前状态（2026-11-02 核对）

| 项目 | 状态 |
| --- | --- |
| 源码分支 | Vault UI 与 Mini App v2 共用官方 `main` |
| 模板策略 | [PR #36](https://github.com/flap-sh/flap-vault-component-template/pull/36) 已合并，支持受控 taxed.fun 子域名 query |
| 发布候选 | **`0.1.40` 发布准备中，尚未发布** |
| 已发布 npm `latest` | `0.1.39`，来源 `78c355f080a60770cfd64d71d94c525204d61583` |
| npm `next` | `0.1.40-next.4`，本次正式发布必须保持 |
| npm `routing` | `0.1.40-beta.routing.0`，本次正式发布必须保持 |
| SDK API / exports | 保持不变；npm 包不包含模板或 Workbench 源码校验器 |
| Workbench 配套策略 | [PR #43](https://github.com/flap-sh/flap-artifact-workbench/pull/43) 尚未合并或部署 |
| App ZIP 来源 | 仍要求精确匹配已发布 latest 身份；未发布的 `0.1.40` 不可作为发布证明 |

详见 [0.1.40 发布准备](releases/0.1.40.zh-CN.md)。源码合并、修改版本号或发布 npm 都不会自动升级已部署宿主或批准 artifact。taxed.fun 白名单必须由模板与 Workbench 的配套源码校验器分别生效；只升级 npm SDK 不会部署这些策略。真实接口响应与浏览器 CORS 尚未验证。

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
| `app:*` | 官方 `origin/main` / latest，接受正式 `0.1.39` |
| `runtime:package` | 干净且已提交的官方 main / latest，生成的 publishConfig 显式使用 latest |
| `runtime:package:next` | 仅在明确授权预览发布时使用官方 `origin/next` / next |

使用 fork 的维护者设置 `FLAP_TEMPLATE_FRESHNESS_REF=upstream/main`，upstream 必须指向官方 Flap 仓库。App 命令拒绝预览或本地引用及 fork 远端。主 CI 与 App 验证工作流使用 latest；App 工作流运行在官方 main。通道各自检查自己的 npm tag，`next=0.1.40-next.4` 不影响正式 `0.1.39`。

在官方 main 上，npm 发布前可以运行 App 检查、本地游客/已连接 E2E 和构建。App 源码 ZIP 与普通本地验证要求**精确匹配已发布 latest 版本、真实 gitHead 祖先关系及 runtime、依赖、构建、协议输入**。官方纯文档或开发工具提交可以更新并保留原身份；本地 SDK/工具改动、私有 canary 和伪造证明均不能替代发布。

`0.1.39` 已公开发布到 npm latest，来源 `78c355f080a60770cfd64d71d94c525204d61583`。归档核验与 FSI 上线要求见[0.1.39 历史发布记录](releases/0.1.39.zh-CN.md)。`0.1.38` 的真实 App 打包验证和未发布 runtime 拦截结果保留在[历史发布记录](releases/0.1.38.zh-CN.md)，不改写为 `0.1.39` 证明。新源码 ZIP 必须匹配当前已发布身份和当前源码绑定的 E2E 证明。

## 正式版升级与预览版弃用

**历史快照，核对于 2026-10-23。** 当前 dist-tag 与 0.1.40 发布准备状态以上方记录为准。

`0.1.39` 已发布，维护者仍需在 Workbench、主站精确固定并部署同一 runtime 与配套校验输入：

```bash
yarn add --exact @flapsdk/vault-runtime@0.1.39
```

App 开发者更新已宣布的 main 模板，保留 App 目录和注册，重新生成检查、E2E、打包、验证证明，不需要在 App 目录安装 npm 包。按公告选择正式目标，不要按数字挑最大的历史预发布版。本次迁移无需额外发布 next。

2026-10-23 记录的八个历史 next 已弃用：`0.1.32-next.0`、`0.1.32-next.1`、`0.1.33-next.0`、`0.1.33-next.1`、`0.1.36-next.0`、`0.1.38-next.0`、`0.1.39-next.0`、`0.1.40-next.0`。弃用提示引导升级至 `@flapsdk/vault-runtime@0.1.38` 与配套官方 main 模板。保留旧包下载以兼容现有锁文件。正式版和全部八个弃用标记已通过公开 registry 核实；这不等于消费项目已部署。

## 支持的开发类型不变

新开发支持 Vault UI 和 Mini App v2。Mini App v1 停止新项目开发，已有路由、绑定、runtime 和维护兼容保留。主干整合不自动转换 v1、给 v2 绑定 Token 或合并项目的 Vault/App 身份；Vault UI 与独立 App 仍分别提交和审核。
