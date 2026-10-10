# Mini App v2 从零开发

[English](from-zero-mini-app.md) · [Vault UI / Mini App v2 与代码复用](development.zh-CN.md)

本文开发的是 `/apps/{slug}` 的独立 App。Mini App v1 已停止支持新开发，Token 专属的 `/{chain}/{tokenCA}/mini-app` 路由仅保留[旧应用兼容维护](mini-app-v1.zh-CN.md)。新 App 使用 v2；Token 的 Vault 面板请看 [Vault UI 入门](from-zero-vault-ui.md)。

## 1. 获取配套模板

使用 Node.js 24 和 Yarn 1.22，从官方预览分支开始：

```bash
git clone --branch feat/mini-app-v2 https://github.com/flap-sh/flap-vault-component-template.git
cd flap-vault-component-template
yarn install --frozen-lockfile
```

模板已经包含 SDK 源码，不需要在 App 目录执行 `npm install @flapsdk/vault-runtime`。npm runtime 由 Workbench 和主站安装；提交前，模板发布版本与两个宿主必须配套。

`@flapsdk/vault-runtime@0.1.36-next.0` **已发布**到 npm `next`（2026-10-11 核对），基于 main 0.1.35，下文共用钱包 API 已包含在此版本中。使用官方 `feat/mini-app-v2` 的已发布提交 `ff5d612d80e0fe387e612b60dca5275c2fd91a24`，即可按下文完成校验、E2E 和打包。正式 `latest` 仍为 `0.1.35`，见[发布状态与更新说明](mini-app-v2-quickstart.md)。

## 2. 创建 App

```bash
yarn app:scaffold my-app
yarn dev
```

打开 `http://localhost:3000/my-app`。脚手架会自动注册预览并生成：

```text
src/vaults/my-app/
  Component.tsx   # React 业务 UI
  VaultABI.ts     # 业务 ABI，沿用共用工具的文件名
  manifest.json  # 独立身份和经审核能力
  i18n.json      # en / zh / ko 文案
```

目录叫 `src/vaults`、ABI 文件叫 `VaultABI.ts`，只是为了复用工具，并不代表 App 绑定了 Vault。本地入口是 `/my-app`，发布后的主站入口是 `/apps/my-app`；本地模板不是主站。

保留生成的 artifact ID，修改内部 `name`、中英文 `displayTitle` 和对应语言文案。保留以下模式标识和空 binding：

```json
{
  "schemaVersion": 2,
  "mode": "mini-app",
  "appModel": "standalone",
  "slug": "my-app",
  "match": { "bindings": [] }
}
```

上面仅展示部分字段，生成的 `artifactId`、名称/标题、`i18n` 都要保留。首次发布后 slug 是固定公开身份；不要复制其他项目的 artifact ID，也不要在更新时随意改 slug。

## 3. 用共用 SDK 开发业务 UI

生成示例使用 `useFlapSdk({ chainId: 56 })`。区块链业务使用其他宿主支持的网络时，修改 `chainId`。选择 SDK 网络不等于绑定 Token 或工厂。

```tsx
"use client";
import { useFlapSdk } from "@/src/sdk";

export default function Component() {
  const { wallet, i18n } = useFlapSdk({ chainId: 56 });
  return <div className="min-h-screen w-full p-6">
    <h1>{i18n.t("title")}</h1>
    <p>{i18n.t("description")}</p>
    <p>{wallet.isConnected ? wallet.address : i18n.t("guest")}</p>
  </div>;
}
```

未连接时提供 `wallet.connect()`。交易需要切换网络时，提供用户主动触发的 `wallet.switchChain()`，在网络正确前禁用操作。主站已经连接的钱包会直接传给 App；不要再做一套钱包登录、访问 `window.ethereum` 或自己添加 Wagmi/RainbowKit Provider。

仅需要语言/通知的 App 可以用共用的 `useFlapI18n()` / `useFlapNotify()`，无需选择网络。兼容 Hook `useMiniAppSdk()` 用于读取 App 身份和验证过的会话；`session.isAuthenticated` 表示登录验证，不是签交易的权限。Provider 由宿主提供。

已有 Vault UI/v1 的展示组件、ABI 和计算可以保留，按[复用指南](development.zh-CN.md#哪些代码能直接复用)适配业务目标。默认提交包仍有目录限制：共用的本地函数放在 `Component.tsx`，ABI 放在 `VaultABI.ts`，不要跨包引用另一个 App/Vault 或任意 helpers 目录。

## 4. 按需增加链上功能

只读 App 可以不声明 `walletChains` 和 `walletContracts`。使用显式选链 API 调用合约时，要声明经审核的目标及读取签名；写操作还需要声明允许的网络/方法以及转账、授权金额上限。完整示例见[共用钱包 SDK](mini-app-wallet.md)。

发币、领奖、交易的接入步骤：

1. 使用真实部署的 Portal、factory、Vault ABI 和业务规则，不要把钱包文档中说明用途的 ABI 当作真实 Portal ABI。
2. 在 `walletContracts` 声明固定目标和准确方法，并声明 `walletChains`。这是钱包权限，不是 App 身份或 `match.bindings`。
3. 不同 Token 的动态 Vault/Token 地址，通过声明的链上解析方法和真实 `sdk.resolveContract(...)` 句柄使用。公开接口返回一个地址，并不代表获得调用授权。
4. 模拟后通过 `sdk.writeContract` 发送，等待回执，检查 `status === "success"` 才刷新。新选链 API 的 `waitForTx` 返回 logs，可解码发币事件。
5. 展示 Token、网络、金额、收款人、最小输出/滑点及 allowance，并处理未连接、错链、等待、拒签、回滚和空数据。

SDK 提供受控的钱包通道；项目仍需实现发币表单、收益计算、买卖界面。依赖绑定 NFT/Vault 上下文的专用能力，不会自动变成独立 App 的默认上下文。

公开 HTTPS 数据接口必须是静态 URL，并在 `manifest.endpoints` 声明。接口需要审核且服务端要允许宿主跨域；声明不能绕过鉴权/CORS，也不授权任意图片或远程资源。接口失败时保留降级界面。

## 5. 预览游客和已连接状态

默认本地预览使用真实已连接的测试钱包。确定性渲染测试可以打开：

```text
http://localhost:3000/my-app?appSession=guest&lang=en
http://localhost:3000/my-app?appSession=connected&lang=zh
```

显式会话夹具不能授权交易，只用于渲染，不证明真实登录或链上业务。真实合约操作需在适合的测试环境单独联调，真实登录互通需到配套 Flap 测试主站验证。

## 6. 校验、打包和提交

不再使用手动启动的预览时将其停止。首次缺少 E2E 浏览器可先安装：

```bash
yarn playwright install chromium
yarn app:check my-app
yarn app:e2e my-app
yarn app:package my-app
yarn app:verify-package dist/my-app.zip
```

E2E 检查 PC/iPad/H5 的游客和已连接状态，共六项，同时验证当前源码/资源 hash 和预览源码身份。可额外执行 `yarn app:build` 检查模板构建。打包要求精确匹配官方预览提交与已发布 npm `next`；`0.1.36-next.0` 已发布，可按此流程打包。其他版本或源码提交仍会因来源不匹配而被拦截，不要修改证明信息绕过检查。

将生成的 ZIP 提交到指定 App v2 测试 Workbench，并提供 slug、展示标题、功能概述、接口声明、钱包合约权限及升级权限说明。不要包含密钥。Workbench 负责构建 runtime artifact；人工审核和主站发布决定上线。上传/构建通过不等于已批准上线。

## 7. 更新已有 App

更新前保存或提交工作，不要丢弃本地改动。按[快速开始](mini-app-v2-quickstart.md)把 App 目录和预览注册迁回更新后的官方模板，保留 artifact ID 和 slug，重新生成 E2E 和 ZIP，并确认接收端 Workbench 版本。自己的额外提交或 fork 不能替代官方模板来源证明。

| 现象 | 处理 |
| --- | --- |
| `useFlapSdk` 提示必须选择链 | v2 使用 `useFlapSdk({ chainId })`，无参数写法属于绑定上下文的 Vault/v1 |
| 缺少 `context.tokenAddress` / `vaultAddress` | v2 自己选 Token 和目标，不要伪造宿主上下文 |
| `app:*` 拒绝 manifest | 检查完整 v2 标识和 `match.bindings: []`；v1 使用 `vault:*` |
| `package/preview-runtime-unpublished` | 对照快速开始中的 npm `next` 发布身份，核对本地版本和 HEAD，使用匹配的官方模板；若是未来待发布版本则等待，不要改用 latest 或私有 canary |
| 本地正常，Workbench 拒绝 | 核对 runtime/gitHead、当前 E2E hash、包格式和审核声明 |
| 公开接口仅在 Flap 内失败 | 核对服务端实际响应的 CORS/跨站策略是否允许宿主 origin |
