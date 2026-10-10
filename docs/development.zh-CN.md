# Flap 开发指南：Vault UI 与 Mini App v2

[English](development.md) · [仓库首页](../README.zh-CN.md)

新开发仅支持 **Vault UI 和 Mini App v2**。两者共用一个模板仓库、一个 `@flapsdk/vault-runtime`、Flap UI 组件和宿主已连接的钱包。界面、ABI、格式化、翻译和业务逻辑可以复用；需要适配的是运行上下文、合约权限及提交包。

## 先选择要开发的类型

| | Vault UI | Mini App v2 |
| --- | --- | --- |
| 用途 | 单个 Token 的 Vault 业务面板 | 独立 Flap App，可覆盖多个 Token |
| 产品入口 | Token 的 Vault 面板；Vault 模板可收录在机制模板中 | 小程序 / Flap Apps 列表 |
| 主站路径 | Token 的 Vault / tax-info 页面 | `/apps/{slug}` |
| Manifest 区分 | 省略 `mode` | `schemaVersion: 2`、`mode: "mini-app"`、`appModel: "standalone"` 和合法 `slug` |
| 身份和绑定 | 经审核的 factory、Vault 或 Token binding | 稳定 artifact ID、不可随意改名的 slug；`match.bindings: []` |
| SDK 用法 | `useFlapSdk()` | 已发布的 `0.1.36-next.0` 使用 `useFlapSdk({ chainId: 56 })` |
| Token/Vault 数据 | 宿主传入 | App 自己选择 Token，没有默认的 `tokenAddress`、`vaultAddress` 或 `marketPhase` |
| 本地预览 | `/{folder-name}` | `/{slug}`，独立 App 壳 |
| 创建和校验 | `vault:scaffold`，再执行 `vault:*` | `app:scaffold`，再执行 `app:*` |
| 打包和 E2E | 格式 6 / 报告 v2，需要真实测试 Token | 格式 7 / 报告 v3，游客/已连接 × PC/iPad/H5 |
| 分支 / 通道 | `main` / npm `latest` | 预览期为 `feat/mini-app-v2` / npm `next` |

从 [Vault UI 入门](from-zero-vault-ui.md) 或 [Mini App v2 从零开发](from-zero-mini-app.zh-CN.md) 开始。一个项目可以同时提交 Vault UI 和独立 App，两者可以操作同一套合约、复用业务代码，但有各自的包和审核流程。Vault UI 上线不会自动让 Mini App 上线。

## Mini App v1：停止新开发，旧应用继续兼容

Mini App v1 已停止支持新开发，不再作为新项目的创建、接入或推荐选项。已有 v1 应用继续兼容，保留旧路由、宿主上下文、SDK 和维护校验流程；不会自动下线或强制转换成 v2。旧版命令仅供已有应用维护，脚手架会输出弃用提示。

v1 使用 `/{chain}/{tokenCA}/mini-app`，manifest 为 `mode: "mini-app"` 和 token-only bindings，并省略 `schemaVersion`、`appModel`、`slug`。新 App 使用完整 v2 标识、空 bindings 和 `/apps/{slug}`。维护和迁移见 [v1 兼容说明](mini-app-v1.zh-CN.md)。

## 不同“版本号”分别代表什么

2026-10-11 核对的发布状态：

| 项目 | 状态 |
| --- | --- |
| 官方 `main` / npm `latest` | 已发布 `0.1.35`，npm 来源提交为 `30784d445009f337516537ac17aaf836f1cdfba0` |
| 已发布 npm `next` | **`0.1.36-next.0`**，npm 来源提交为 `ff5d612d80e0fe387e612b60dca5275c2fd91a24`；包含 main 0.1.35 和独立 App 共用钱包能力 |

不要安装 `0.1.35` 后就认为它包含独立 App v2 钱包接口。这里带 `chainId` 的共用 Hook、`walletContracts` 等能力已包含在发布后的 `0.1.36-next.0` 中。使用官方模板的最新提交，runtime 输入保持与已发布版本一致；主站和测试 Workbench 也需使用同一精确 runtime 版本。文档和官方开发工具可以独立更新，无需为此重新发布 SDK。通过校验和 E2E 后即可生成源码 ZIP；SDK 已发布不代表 App 已获准上线。分支与更新步骤见[预览版快速开始](mini-app-v2-quickstart.md)。

Mini App **v1/v2** 区分产品和绑定模式；npm **0.1.35** 区分 SDK 发布；`runtimeContractVersion: 1` 区分宿主产物协议，E2E 报告也有自己的版本。v2 App 使用 runtime contract 1 是正常的。应根据 manifest 判断 App 类型，不能只看名字、SDK 版本或某个 CA。v2 标识不完整或不合法时应报错，不能悄悄当成 v1。

`latest` 与 `next` 是同一个 SDK 的发布通道，校验彼此独立。仅更新正式版 `latest`，无需为了追版本再发布一个 `next`。

## 哪些代码能直接复用

| 代码 | 是否复用 | 需要适配什么 |
| --- | --- | --- |
| React 界面、状态工具、计算、格式化 | 可以 | 通过参数传入选中的 Token、钱包和业务数据 |
| ABI 和合约业务规则 | 同一合约方法可以 | 使用真实部署 ABI，核对网络、金额、报价和滑点规则 |
| 翻译和 Flap UI 组件 | 可以 | 所有声明语言的 key 对齐，从 `@/src/ui` 引入组件 |
| 读取 → 模拟 → 发送 → 等待回执 | 可以 | 适配目标和权限，仅在回执成功后刷新 |
| Token/Vault 上下文 | 需要适配 | v2 没有默认当前 Token/Vault，要自行选择并解析目标 |
| Manifest、artifact ID、路由和测试报告 | 每个交付物独立 | 分别 scaffold，后续更新保留原有身份和 slug |

例如下面的展示函数可在 Vault UI 和 v2 中复用，也可复用已有 v1 的实现：

```tsx
type RewardSummaryProps = { title: string; formattedAmount: string };

function RewardSummary({ title, formattedAmount }: RewardSummaryProps) {
  return <section><h2>{title}</h2><output>{formattedAmount}</output></section>;
}
```

通过参数传入本地化标题和算好的金额。Vault UI/v1 从 `useFlapSdk().context` 获取当前 Token/Vault；v2 自己选择 Token，从 `useFlapSdk({ chainId: 56 }).wallet` 获取宿主钱包，并读取经审核的目标合约。展示组件、ABI 和收益计算可以保留，改的是目标从哪里来。

交易步骤也共用：

```ts
const prepared = await sdk.simulateContract(request);
const hash = await sdk.writeContract(prepared.request);
const receipt = await sdk.waitForTx(hash);
if (receipt.status === "success") await reloadData();
```

还需处理等待状态、拒签和回滚。这只是通用调用顺序，不是现成的发币/领奖/交易业务实现。Vault UI/v1 使用已有的宿主绑定和 Vault 权限；v2 通过 `walletChains`、`walletContracts` 声明经审核的目标及方法，动态地址使用真实的 `resolveContract` 句柄，具体见[钱包 API](mini-app-wallet.md)。

“共用代码”不代表可以在提交包里跨目录引用。默认目录仍是 `Component.tsx`、`VaultABI.ts`、`manifest.json`、`i18n.json`，以及文档明确支持的可选文件和资源。可复用的展示函数、业务函数放在 `Component.tsx`，ABI 放在 `VaultABI.ts`；也可以在自己的开发工程维护共享代码，再生成/整理到这些文件。不要提交对另一个 Vault/App 目录、任意 helpers 目录、另一套 SDK 或主站私有源码的引用。额外嵌套文件必须符合明确支持的 capability 档案。

## 共用 SDK，适配两个上下文

```tsx
import { useFlapSdk } from "@/src/sdk";

// Vault UI 或绑定 Token 的 Mini App v1 组件：
const boundSdk = useFlapSdk();
// 当前 Token / Vault 由宿主上下文提供。

// 独立 Mini App v2 组件，本次共用钱包版本：
const appSdk = useFlapSdk({ chainId: 56 });
// appSdk.wallet.address 就是宿主已连接钱包，业务目标由 App 选择。
```

这两种写法属于不同组件，不要在一个 v2 组件里同时调用。`useMiniAppSdk()` 继续兼容读取 App 身份与已验证会话，它也来自同一个 SDK，不是第二套钱包。使用宿主钱包签交易不需要再登录一次；钱包连接与验证过的登录会话是两个状态。

模板已经带有 SDK 源码。业务组件只从 `@/src/sdk`、`@/src/ui` 导入，不需要在 App 目录另装 npm runtime，也不应自行加 Wagmi/RainbowKit Provider。预览壳、Workbench 和主站负责 Provider 与钱包连接；宿主侧使用发布后的 npm 包，并同步到支持该能力的版本。

## 文档入口

- [Vault UI 入门](from-zero-vault-ui.md)和[测试 CA 配置](vault-ui-test-ca.zh-CN.md)。
- [Mini App v1 兼容说明](mini-app-v1.zh-CN.md)：仅供旧应用维护与迁移，停止新开发。
- [Mini App v2 从零开发](from-zero-mini-app.zh-CN.md)：创建、文件、预览、提交。
- [预览版快速开始](mini-app-v2-quickstart.md)：分支、发布通道和更新。
- [共用钱包 SDK](mini-app-wallet.md)：合约声明、地址解析和金额上限。
- [SDK 参考](sdk.md)、[Manifest 参考](manifest.md)、[UI 示例](ui-pattern-snippets.md)、[3D 能力](mini-app-3d.md)。
- [AI Agent 指南](ai-agent.md)：新开发只选择 Vault UI/v2；v1 仅维护已有应用。
