# Pool Launch UI 开发指南

[测试网接入与交付](developer-testnet-onboarding.zh-CN.md) · [English](README.md)

## UI

建池发行（Pool Launch）使用 Launcher 配置发行和管理发行过程。Launcher 工厂可通过 `launcherDataSchema()` 提供配置字段。默认展示读取 Launcher 实例的 `description()` JSON。发行机制包含 Vault 时，可用 Vault 实例的 `vaultUISchema()` 描述操作和数据，并用 Vault 工厂的 `vaultDataSchema()` 描述创建参数。[Pool Launch 合约开发指南](https://docs.utter.cash/en/flap/v2/developers/pool-launch/build-on-pool-launch#2-ui)

| 界面 | 组件 | 职责 |
| --- | --- | --- |
| 发行配置 | `LauncherConfig` | 收集发行机制需要的参数，交给宿主核对和准备创建交易。 |
| Launcher 详情 | `Launcher` | 展示实例的链上状态，按发行机制向宿主请求用户操作。 |
| 配套 Vault | Vault `Component.tsx` | 从代币的税费信息页展示 Vault 数据，通过 Vault SDK 提供对应的操作。 |

Launcher 组件提交配置或操作请求。宿主负责校验、构造交易、确认弹窗和回执检查，用户在钱包确认。发行完成后，宿主按实际发行的代币地址提供交易页和适用的 Vault 入口。

## 开发自己的 Vault UI

用 `vault:scaffold` 创建 `src/vaults/<目录名>`，传入自己的链 ID、Vault 工厂和已部署的同链验收代币。组件从宿主上下文取得 Vault 实例地址，按该合约的接口实现 `VaultABI.ts` 与业务操作。`manifest.json` 的 `match.bindings` 声明 UI 所属的链和工厂等目标，正式入口根据平台绑定加载产物。[Vault UI 开发入门](../../docs/from-zero-vault-ui.md)

| 命令 | 用途 |
| --- | --- |
| `yarn vault:scaffold <目录名>` | 创建组件文件并加入本地预览路由。按项目填写链和合约参数。 |
| `yarn vault:register <目录名>` | 源码已存在时，加入本地预览路由。 |
| `yarn vault:check <目录名>` | 按模板规则检查指定目录的源码、manifest 和验收代币。 |

这些命令的目录参数由项目自行命名。发布并关联到链上工厂由平台绑定流程处理。[Vault 源包交付说明](../../docs/artifact-intake.md)

## 接入自定义 Launcher UI

Launcher 的配置字段、状态读取和交易操作取决于发行机制。开发自定义 UI 时，需要与宿主确认支持的配置协议和操作。当前可交互的测试网宿主已接入示例的工厂配对。接入其他发行机制时，需要为它实现相应的宿主处理并启用对应工厂。

### 从 Launcher 详情跳转到站内页面

支持此能力的宿主会向详情组件 `Launcher` 提供可选的 `host.redirect(path: string): boolean`。组件按当前 Launcher 实例解析目标后调用，宿主校验目标与当前站点同源，并替换 Launcher 的历史记录。返回 `true` 表示宿主接受了导航。接口缺失或返回 `false` 时，保留普通详情供用户使用。跳转与钱包连接无关，`host.available` 用于交易操作。

跳转 Demo 用 `/apps/<app-slug>/mint/<CA>` 演示如何通过预占 CA 在发射前定位项目。接入时填写自己的 Mini App slug、链 ID 和工厂地址，并使用目标 Mini App 支持的路径和查询参数。从 React 导入 `useEffect`，把这段代码加入 `Launcher` 组件。

```tsx
const appSlug = "<app-slug>";
const demoChainId = 97;
const demoFactory = "<factory-address>".toLowerCase();
const redirect = host?.redirect;
const ca = context?.snapshot?.expectedToken?.toLowerCase();
const launcher = context?.launcherAddress?.toLowerCase();
const factory = context?.identity?.factoryAddress?.toLowerCase();
const address = /^0x(?!0{40}$)[0-9a-f]{40}$/;
const path = context?.identity?.chainId === demoChainId
  && factory === demoFactory && address.test(factory)
  && ca && launcher && address.test(ca) && address.test(launcher)
  ? `/apps/${appSlug}/mint/${ca}?mint=${launcher}&factory=${factory}`
  : null;

useEffect(() => {
  if (path) redirect?.(path);
}, [path, redirect]);
```

宿主把 Launcher 链接里的 `ref` 和 `lang` 传到目标，并保留 `chain` 等目标自身的参数。入口没有 `ref` 时省略该参数，没有有效的 `lang` 时使用当前站点语言。宿主已接入的 Launcher 从 Launch Pages、创建结果、分享或机器人进入时，执行同一套详情逻辑。

浏览器返回会回到进入 Launcher 之前的页面。一次访问只自动跳转一次，跳到另一个 Launcher 时会直接展示它的详情。从目标页提供「查看 Launcher」入口时，在 Launcher 链接上带 `view=launcher` 即可直接显示详情。目标路由无需在 Workbench 登记。

本地 Demo 在同一个 `launcher-local` 产物中包含创建表单和跳转详情。 [跳转 Demo 源码](../launcher-local/) · [本地检查与交付说明](developer-testnet-onboarding.zh-CN.md#launcher-跳转-demo)

### 检查 Launcher 源码

将 `launcher_source_dir` 设为项目的 Launcher 源码目录，在 Template 根目录运行以下命令。

```sh
yarn launcher:check-source "$launcher_source_dir"
```

命令检查 `Component.tsx`、`manifest.json` 和 `i18n.json`，包括 manifest 结构、TSX 语法、`LauncherConfig` 和 `Launcher` 具名函数导出，以及 `en`、`zh`、`ko` 的文案键。检查通过后输出 manifest 声明的链、工厂地址和配置协议。宿主和 Workbench 各自核验工厂与协议的兼容性。

## 预览与发布

对于已接入的工厂，向 Flap 提供 Launcher 源码、配套 Vault 源码和测试网工厂地址。已有已验收的 Vault 源包时，可以一并提供。Flap 完成打包和 Workbench 构建后，回传指定产物版本的预览链接。常规入口通过授权的链上绑定加载 UI。

测试网示例提供一套众筹发行的具体实现，包含示例合约、配置字段、本地 Vault 预览和 Workbench 交付流程。[BSC 测试网示例](testnet-example.zh-CN.md)
