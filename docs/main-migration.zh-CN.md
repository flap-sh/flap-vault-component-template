# main 分支整合与发布状态

[English](main-migration.md) · [开发指南](development.zh-CN.md) · [Mini App v2 快速开始](mini-app-v2-quickstart.md)

v2 合并完成后，Vault UI 与 Mini App v2 将统一在 `main` 维护。两者共用本仓库、一个 `@flapsdk/vault-runtime`、公共 UI 和宿主钱包。`feat/mini-app-v2` 是过渡期的整合分支，不是长期维护的第二套 SDK。Vault UI 使用 `vault:*`，独立 v2 App 使用 `app:*`；manifest、宿主上下文、身份、权限和打包证明仍各自独立。

## 当前状态（2026-10-23 核对）

| 项目 | 状态 |
| --- | --- |
| 源码整合 | 已将 `main` 合入 `feat/mini-app-v2`，正在准备将 v2 合回 `main` |
| 合并后的源码入口 | Vault UI 与 Mini App v2 都使用 `main` |
| npm `latest` | 已发布 `0.1.37`，来源 `ad40bab7dfc976d20dd82050aeec17fef18a39b3` |
| npm `next` | 已发布 `0.1.40-next.0`，来源 `0d21863aa19bde5ad6712d760d3badea6a28e3a4` |
| 计划 npm `latest` | **`0.1.38`**，尚未发布；Vault UI 与 Mini App v2 共用同一正式 runtime |
| 历史 `next` 版本 | `0.1.38` 发布后统一标记弃用，保留下载 |
| 整合源码的 ZIP 提交状态 | 等待 `0.1.38` 及 main/latest 命令、契约、CI 切换 |

Git 合并不会自动发布 npm、移动 dist-tag、升级 Workbench/主站、批准 App 上线或改变其生产路由。`main` 是源码分支，`latest`、`next` 是同一个包的发布通道，不能只根据分支名判断已发布 SDK 能力。

`0.1.40-next.0` 确已发布，包含共用 App 钱包、动态 IPFS/FSI 和长文本 CopyButton。当前整合源码还包含 Next.js `15.5.28`、预览/构建配置和 E2E 工具更新；其中依赖、构建输入已不再匹配该发布，也不属于仅更新开发工具的例外。根目录版本号没变，不代表新源码可以沿用 `0.1.40-next.0` 的 ZIP 来源证明；需另行发布匹配版本。本次文档更新不发布 SDK。

## 获取源码与本地开发

v2 合并宣布完成后，Vault UI 与 v2 新项目统一从以下入口开始：

```bash
git clone --branch main https://github.com/flap-sh/flap-vault-component-template.git
cd flap-vault-component-template
yarn install --frozen-lockfile
```

合并完成前，v2 源码开发与本地预览使用 `--branch feat/mini-app-v2`。当前整合 HEAD 不是可以直接提交源码包的发布版本。App 代码保留在 `src/vaults/{slug}`，保留 artifact ID、slug 和预览注册；切换分支前先保存工作，生成上传证明前按正式升级说明操作。

开发者直接从模板引入 `@/src/sdk`、`@/src/ui`，不要在 App 目录安装第二套 SDK 或钱包 provider。宿主才安装 npm runtime 的精确发布版本，见[代码复用说明](development.zh-CN.md#哪些代码能直接复用)。

## 过渡期命令行为

当前实现尚未切换发布引用：

| 流程 | 当前源码引用 / 通道 |
| --- | --- |
| `vault:*` | 官方 `origin/main` / npm `latest` |
| `app:*` | 官方 `origin/feat/mini-app-v2` / npm `next` |
| `runtime:package:next` | 官方 `origin/next` / npm `next` |

`app:*` 包装命令仍要求预发布模板版本，next 通道源码策略目前只接受 `feat/mini-app-v2` 或 `next`，不接受 `main`。只切换 Git 分支不能改变这些规则。使用 fork 的维护者按文档选择官方 `upstream` 引用，不使用 fork、本地引用或手改证明代替官方来源。

脚手架、本地预览、E2E 和私有 canary 可以验证整合工作，但不能把未发布 runtime 输入变成合法上传证明。源码引用和发布身份配套前，正常检查、构建或打包预检可能拦截整合版本。不要修改版本号、证明或校验规则来伪装成已发布版本。

宣布可以从 main 提交包之前，维护者需要：

1. 将 App 命令包装器、仅允许预发布版本的断言、源码引用策略、`agent-contract.json` 发布元数据及 App CI 切换为官方 `main` / npm `latest`。Vault UI 与 v2 都应接受正式 `0.1.38` 模板，保留各自的模型和证明流程，以及未来预览通道的独立校验。
2. 从干净的官方 main 源码准备、验证 `0.1.38`，发布到 `latest` 后记录实际 `gitHead` 和 integrity。这是计划版本，不表示已经发布。
3. 在 Workbench、主站精确固定并部署 `@flapsdk/vault-runtime@0.1.38` 和配套校验输入，再从宣布的模板来源重新执行检查、E2E、打包和验证。
4. 正式版可用后，将下方全部历史 `next` 预发布版本标记弃用，升级提示指向 `0.1.38`。保留旧包下载以兼容已有锁文件，不执行 unpublish。

在此之前，整合 HEAD 的打包仍待配套发布。已有发布版本的产物继续兼容；源码合并不会替换它们的 runtime，也不代表新的 App 版本已获准上线。

## 计划中的正式版升级与预览版弃用

`0.1.38` 发布且配套主站、Workbench 上线宣布完成后，两类开发统一使用 main/latest。本次迁移不计划再发布一个 next。主站和 Workbench 维护者精确更新依赖：

```bash
yarn add --exact @flapsdk/vault-runtime@0.1.38
```

App 开发者更新已宣布的官方 main 模板，保留 App 目录和预览注册，再重新生成检查、E2E、ZIP 证明，不需要在 App 目录安装 npm 包。按公告选精确正式版本，不要根据数字挑最大的预发布版：`0.1.40-next.0` 是历史预览版，本次正式目标是 `0.1.38`。

计划弃用当前全部八个 next 版本：`0.1.32-next.0`、`0.1.32-next.1`、`0.1.33-next.0`、`0.1.33-next.1`、`0.1.36-next.0`、`0.1.38-next.0`、`0.1.39-next.0` 和 `0.1.40-next.0`。弃用提示应引导升级至 `@flapsdk/vault-runtime@0.1.38` 与配套官方 main 模板。本次文档更新不执行 npm 弃用或删除包。已有构建产物继续兼容，新提交按宣布的正式版策略执行。

## 支持的开发类型不变

新开发仅支持 Vault UI 和 Mini App v2。Mini App v1 停止新项目开发，已有路由、绑定和维护兼容保留。主干整合不会自动转换 v1、给 v2 增加 Token 绑定，也不会合并项目的 Vault/App 身份；Vault UI 与独立 App 仍分别提交与审核。
