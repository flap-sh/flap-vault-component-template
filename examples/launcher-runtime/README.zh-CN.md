# Pool Launch UI 开发指南

[测试网接入与交付](developer-testnet-onboarding.zh-CN.md) · [English](README.md)

## UI

建池发行（Pool Launch）使用 Launcher 配置发行和管理发行过程。Launcher 工厂可通过 `launcherDataSchema()` 提供配置字段。默认展示读取 Launcher 实例的 `description()` JSON。发行机制包含 Vault 时，可用 Vault 实例的 `vaultUISchema()` 描述操作和数据，并用 Vault 工厂的 `vaultDataSchema()` 描述创建参数。[Pool Launch 合约开发指南](https://docs.utter.cash/en/flap/v2/developers/pool-launch/build-on-pool-launch#2-ui)

| 界面 | 组件 | 职责 |
| --- | --- | --- |
| 发行配置 | `LauncherConfig` | 收集发行机制需要的参数，交给宿主核对和准备创建交易。 |
| Launcher 详情 | `Launcher` | 展示实例的链上状态，按发行机制向宿主请求用户操作。 |
| 配套 Vault | Vault `Component.tsx` | 从代币的税费信息页展示 Vault 数据，通过 Vault SDK 提供对应的操作。 |

自定义 Launcher 可以同时提供发行配置和详情，也可以只提供详情。发行配置和交易操作需要对应的宿主适配器。宿主负责校验、构造交易、确认弹窗和回执检查，用户在钱包确认。发行完成后，宿主按实际发行的代币地址提供交易页和适用的 Vault 入口。

## 开发自己的 Vault UI

用 `vault:scaffold` 创建 `src/vaults/<目录名>`，传入自己的链 ID、Vault 工厂和已部署的同链验收代币。组件从宿主上下文取得 Vault 实例地址，按该合约的接口实现 `VaultABI.ts` 与业务操作。`manifest.json` 的 `match.bindings` 声明 UI 所属的链和工厂等目标，正式入口根据平台绑定加载产物。[Vault UI 开发入门](../../docs/from-zero-vault-ui.md)

| 命令 | 用途 |
| --- | --- |
| `yarn vault:scaffold <目录名>` | 创建组件文件并加入本地预览路由。按项目填写链和合约参数。 |
| `yarn vault:register <目录名>` | 源码已存在时，加入本地预览路由。 |
| `yarn vault:check <目录名>` | 按模板规则检查指定目录的源码、manifest 和验收代币。 |

这些命令的目录参数由项目自行命名。发布并关联到链上工厂由平台绑定流程处理。[Vault 源包交付说明](../../docs/artifact-intake.md)

## 接入自定义 Launcher UI

Launcher 的配置字段、状态读取和交易操作取决于发行机制。BSC 测试网预览支持 Demo 的 LauncherFactory 及 `crowd-native-create/v1`。其他工厂如需发行配置或交易操作，先与 Flap 确认宿主支持的协议和操作。 [发行配置与详情 Demo](testnet-example.zh-CN.md)

### 开发只读 Launcher 详情

使用 `launcher-detail/v1` 展示合约数据或跳转到站内 Mini App。把 `chainId` 设为 BSC 测试网 `97` 或 BNB Chain 主网 `56`，并填写对应链上已部署的 LauncherFactory 地址 `factoryAddress`。在 `manifest.json` 中使用 `schemaVersion: 2`、`kind: "launcher-ui"`、`entry: "Component.tsx"`、`configContract: "launcher-detail/v1"` 和 `surfaces: ["launcher-ui"]`。`Component.tsx` 只需具名导出 `Launcher({ context, messages, host })` 函数。`i18n.json` 中的 `en`、`zh`、`ko` 使用相同的文案键。 [详情 Demo 源码](launcher-detail-demo/)

manifest 可选的 `reads` 对象最多声明八个 Launcher 实例上的无参读取方法。例如 `"reads": { "expectedToken": { "functionName": "expectedToken", "returns": "address" } }` 在读取成功后通过 `context.snapshot.expectedToken` 提供预占代币地址。读取键以小写字母开头，其余字符为字母或数字。每个方法可返回一个 `address`、`bool` 或 `uint256`。宿主分别以小写地址字符串、布尔值和十进制字符串传入结果。读取失败或地址为零时，该字段为 `null`。

宿主先核验 Launcher 属于 manifest 声明的工厂，再读取实例。仅用产物预览时可以没有实例，组件应在 `context.launcherAddress` 或 `context.snapshot` 为 `null` 时显示提示。此模式提供 `host.available: false` 和可选的 `host.redirect`。需要发行配置或交易操作时，使用上文的发行配置与详情流程。

详情 Demo 展示 BSC 测试网 Launcher 的已募集金额、发行状态和实际发行的代币地址，并演示怎样点击按钮调用 `host.redirect` 打开 `/apps`。如果项目按预占代币地址自动跳转，请声明项目合约实际提供的读取方法，再参考下面的跳转代码。

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

只读 `launcher-local` Demo 默认打开宿主的 `/apps` 列表，接入时改成自己已部署的 Mini App 子路由。创建和募资可使用工厂配对 Demo。 [跳转 Demo 源码](../launcher-local/launcher-redirect-demo/) · [跳转动画](launcher-redirect-demo.svg) · [本地检查与交付说明](developer-testnet-onboarding.zh-CN.md#launcher-跳转-demo)

### 检查 Launcher 源码

将 `launcher_source_dir` 设为项目的 Launcher 源码目录，在 Template 根目录运行以下命令。

```sh
yarn launcher:check-source "$launcher_source_dir"
```

命令检查 `Component.tsx`、`manifest.json` 和 `i18n.json`，包括 manifest 结构、TSX 语法、具名函数导出，以及 `en`、`zh`、`ko` 的文案键。`launcher-detail/v1` 检查已声明的 `reads`，并要求仅导出 `Launcher`。同时提供配置和详情的版本需导出 `LauncherConfig` 和 `Launcher`。检查通过后输出 manifest 声明的链、工厂地址和配置协议。宿主和 Workbench 各自核验工厂与协议的兼容性。

## 预览与发布

Pool Launch UI 交付必须包含 Launcher，配套的自定义 Vault UI 可选。

| 交付方式 | 提交给 Flap 的材料 |
| --- | --- |
| 仅 Launcher | ZIP 根目录放 `Component.tsx`、`manifest.json` 和 `i18n.json`，附网络、LauncherFactory 地址和测试说明。 |
| Launcher 配置与详情及配套自定义 Vault UI | 两个源码目录放进同一份交接 ZIP，附两个测试网工厂地址和 Vault 验收代币。已有已验收的 Vault 源包时，可以一并提供。 |

在模板根目录运行 `yarn launcher:check-source examples/launcher-runtime/launcher-detail-demo` 可以检查详情 Demo。项目源码通过检查后，在它的源码目录用新文件名生成 ZIP，将三个文件直接放在 ZIP 根目录。

```sh
zip -X -j ../launcher-detail.zip Component.tsx manifest.json i18n.json
```

把 ZIP 交给 Flap 在 Workbench Preview 上传、构建并发布。主站详情预览通过 `artifactPath` 选择 Launcher 版本。如已有同一工厂下的 Launcher，可一并提供地址，便于核验实际读取和跳转。BSC 测试网在主站预览环境打开 `/launcher/<launcher-address>?chain=bnb-testnet&kind=launcher-detail&artifactPath=<encoded-artifact-path>`。主网使用 `chain=bnb`。

`launcher-detail/v1` 配套的 Vault UI 走普通 Vault UI 流程，单独提交源包。发行配置与详情流程若同时交付自定义 Vault UI，Flap 会生成组合源包并回传包含两种产物的预览链接。是否在链上部署 Vault 取决于工厂合约。

独立 Mini App 和普通 Vault UI 各自走对应的源包流程。 [测试网接入与交付](developer-testnet-onboarding.zh-CN.md) · [Mini App 开发指南](../../docs/from-zero-mini-app.zh-CN.md) · [Vault 源包交付说明](../../docs/artifact-intake.md)

测试网示例提供一套众筹发行的具体实现，包含示例合约、配置字段、本地 Vault 预览和 Workbench 交付流程。[BSC 测试网示例](testnet-example.zh-CN.md)
