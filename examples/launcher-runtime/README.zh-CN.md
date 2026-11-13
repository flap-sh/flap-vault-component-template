# Pool Launch UI 开发指南

[测试网接入与交付](developer-testnet-onboarding.zh-CN.md) · [English](README.md)

## 选择创建流程

先确定用户在哪个页面参与发行，以及谁负责创建 Launcher。

| 接入场景 | 需要开发什么 |
| --- | --- |
| **独立 Mini App v2** | 在 `/apps/<slug>` 或应用子路由实现项目的创建、认购、领取和退款等适用操作。需要从 Flap 的 Launch Pages、分享链接等入口进入项目时，另交一个轻量的 `Launcher` 详情组件。它可以展示发行状态，也可以在解析到目标项目后自动跳到 Mini App。用户在 Mini App 完成操作。 [Mini App 开发指南](../../docs/from-zero-mini-app.zh-CN.md) · [自动跳转](#从-launcher-详情跳转到站内页面) |
| **用户可复用的 Launcher 工厂** | 如果用户要在 Flap 输入工厂地址、配置并创建自己的 Launcher，实现 `LauncherConfig` 和 `Launcher`。创建页负责填写参数、核对和确认创建，详情页负责显示进度和发行结果，并提供合约支持的参与操作。需要发行后自定义收益、领取等 Vault 面板时，再交付配套 Vault UI。 [创建与详情](#预览创建表单和详情) · [Vault UI](#开发自己的-vault-ui) |
| **项目方一次性创建 Launcher** | 用项目授权钱包运行脚本，将工厂配置编码后通过 `Portal.newLauncher` 在测试网创建实例。用户入口只需要 `Launcher` 详情页。在详情内实现认购或 Mint、发行后领取、退款等合约支持的操作。如果项目已有 Mini App，也可由详情跳转过去，把操作集中在应用内。 [详情接入](#开发只读-launcher-详情) · [详情交易验收](#在测试网验证创建和参与交易) |

Vault UI 位于代币的税费信息页，展示 Vault 的业务数据和操作。只做该面板时，走 Vault UI 开发流程。Mini App 与用于导流的 Launcher 各自打包。Launcher 页内的真实交易需要在支持该能力的 BSC 测试网 Preview 上验收。

项目方通过脚本创建后，请把网络、LauncherFactory 地址和真实的测试网 Launcher 实例地址交给 Flap，便于验收详情、跳转和参与操作。

## UI

建池发行（Pool Launch）使用 Launcher 配置发行和管理发行过程。Launcher 工厂可通过 `launcherDataSchema()` 提供配置字段。默认展示读取 Launcher 实例的 `description()` JSON。发行机制包含 Vault 时，可用 Vault 实例的 `vaultUISchema()` 描述操作和数据，并用 Vault 工厂的 `vaultDataSchema()` 描述创建参数。[Pool Launch 合约开发指南](https://docs.utter.cash/en/flap/v2/developers/pool-launch/build-on-pool-launch#2-ui)

| 界面 | 组件 | 职责 |
| --- | --- | --- |
| 发行配置 | `LauncherConfig` | 在项目组件内填写并核对发行配置。 |
| Launcher 详情 | `Launcher` | 展示实例的链上状态，按发行机制向宿主请求用户操作。 |
| 配套 Vault | Vault `Component.tsx` | 从代币的税费信息页展示 Vault 数据，通过 Vault SDK 提供对应的操作。 |

自定义 Launcher 可以同时提供发行配置和详情，也可以只提供详情。项目可以从发行配置跳转到自己的 Mini App，由 Mini App 承接创建交易。发行完成后，详情可按实际发行的代币地址提供交易页和适用的 Vault 入口。

## 开发自己的 Vault UI

用 `vault:scaffold` 创建 `src/vaults/<目录名>`，传入自己的链 ID、Vault 工厂和已部署的同链验收代币。组件从宿主上下文取得 Vault 实例地址，按该合约的接口实现 `VaultABI.ts` 与业务操作。`manifest.json` 的 `match.bindings` 声明 UI 所属的链和工厂等目标，正式入口根据平台绑定加载产物。[Vault UI 开发入门](../../docs/from-zero-vault-ui.md)

| 命令 | 用途 |
| --- | --- |
| `yarn vault:scaffold <目录名>` | 创建组件文件并加入本地预览路由。按项目填写链和合约参数。 |
| `yarn vault:register <目录名>` | 源码已存在时，加入本地预览路由。 |
| `yarn vault:check <目录名>` | 按模板规则检查指定目录的源码、manifest 和验收代币。 |

这些命令的目录参数由项目自行命名。发布并关联到链上工厂由平台绑定流程处理。[Vault 源包交付说明](../../docs/artifact-intake.md)

## 接入自定义 Launcher UI

Launcher 的配置字段、状态读取和交易操作取决于发行机制。`configContract` 是 Flap 接入协议标识，其版本与工厂合约的链上接口版本独立。BSC 测试网的工厂配对 Demo 使用 `crowd-native-create/v1`，由该适配器处理元数据上传、交易准备及回执。 [工厂配对 Demo](testnet-example.zh-CN.md)

### 开发只读 Launcher 详情

使用 `launcher-detail/v1` 展示合约数据或跳转到站内 Mini App。把 `chainId` 设为 BSC 测试网 `97` 或 BNB Chain 主网 `56`，并填写对应链上已部署的 LauncherFactory 地址 `factoryAddress`。在 `manifest.json` 中使用 `schemaVersion: 2`、`kind: "launcher-ui"`、`entry: "Component.tsx"`、`configContract: "launcher-detail/v1"` 和 `surfaces: ["launcher-ui"]`。`Component.tsx` 只需具名导出 `Launcher({ context, messages, host })` 函数。`i18n.json` 中的 `en`、`zh`、`ko` 使用相同的文案键。 [详情 Demo 源码](launcher-detail-demo/)

manifest 可选的 `reads` 对象最多声明八个 Launcher 实例上的无参读取方法。例如 `"reads": { "expectedToken": { "functionName": "expectedToken", "returns": "address" } }` 在读取成功后通过 `context.snapshot.expectedToken` 提供预占代币地址。读取键以小写字母开头，其余字符为字母或数字。每个方法可返回一个 `address`、`bool` 或 `uint256`。宿主分别以小写地址字符串、布尔值和十进制字符串传入结果。读取失败或地址为零时，该字段为 `null`。

宿主先核验 Launcher 属于 manifest 声明的工厂，再读取实例。仅用产物预览时可以没有实例，组件应在 `context.launcherAddress` 或 `context.snapshot` 为 `null` 时显示提示。没有声明交易的详情提供 `host.available: false` 和可选的 `host.redirect`。

详情 Demo 展示 BSC 测试网 Launcher 的已募集金额、发行状态和实际发行的代币地址，并演示怎样点击按钮调用 `host.redirect` 打开 `/apps`。如果项目按预占代币地址自动跳转，请声明项目合约实际提供的读取方法，再参考下面的跳转代码。

### 预览创建表单和详情

使用 `launcher-config-preview/v1` 在同一个 ZIP 里交付创建表单和详情。沿用详情包的 manifest 结构，设置 `configContract: "launcher-config-preview/v1"` 和 `surfaces: ["launcher-config", "launcher-ui"]`。`configContract` 填 Flap 预览协议标识，填入链上接口版本会触发 `launcher-runtime/unsupported-config-contract`。`factoryAddress` 填项目在 `chainId` 对应网络已部署的工厂地址。详情可以声明 `reads`。

在 `Component.tsx` 中具名导出 `LauncherConfig({ context, messages, host })` 和 `Launcher({ context, messages, host })`。主站的 `/create/launcher` 渲染 `LauncherConfig`，并提供只读上下文。通过产物预览打开时，`context.previewOnly` 为 `true`。通过已绑定工厂打开时为 `false`。由开发者在组件内实现「核对创建」按钮和核对界面。宿主给已有组件提供空操作的 `onChange` 兼容回调。

项目已部署 Mini App 时，可在核对后的继续按钮调用可选的 `host?.redirect?.("/apps/<app-slug>/create")`，填写项目实际使用的站内路由。用户点击跳转后，浏览器返回键可以回到 Launcher 创建页。返回 `true` 表示宿主已接受跳转，回调缺失或返回 `false` 时由组件显示提示。在 Mini App 中实现工厂对应的参数校验、配置编码、交易核对和回执处理，使用 Mini App 钱包 SDK 连接钱包并提交交易。 [Mini App 开发指南](../../docs/from-zero-mini-app.zh-CN.md)

使用 React 具名导入和 JSX 内联样式。Workbench 会拦截 `<style>` 标签、`window.location`、`new URL()` 和 `new Intl.DateTimeFormat()`。创建表单和详情均可调用 `host.redirect()` 进行站内跳转。仅凭 `artifactPath` 可以查看界面，验收详情自动跳转时请提供同链、同工厂的真实 Launcher 实例，并让组件用已核验的数据解析目标。

把三个源码文件打包后交给 Flap。Workbench 构建并发布后提供「打开创建预览」和「打开详情预览」两个入口。 [源码检查和 ZIP 交付](#检查-launcher-源码)

### 在测试网验证创建和参与交易

通用钱包接口可在 Flap 的 BSC 测试网 Preview 用于已获准的产物。确认交易前连接钱包并切换到链 ID `97`。按钮、输入校验、核对界面和交易状态由项目组件实现。通过宿主钱包接口签名并提交，源码中不能直接访问浏览器钱包或 provider。

使用 `transactions` 或钱包地址读取项（`reads.*.account: true`）的源码包，需要由支持该声明的 Workbench Preview 构建，并在已启用钱包接口的主站 Preview 验收。旧版 Workbench 可能报 `launcher-runtime/manifest`。请在更新后的 Workbench Preview 重传同一份 ZIP，保留 manifest 中的交易声明。

在 manifest 中声明实际使用的合约操作。仅详情的 `launcher-detail/v1` 包只声明 `transactions.actions`，适用于脚本创建后由详情承接参与操作的场景。以下示例同时启用创建和详情交易。

```json
{
  "transactions": {
    "create": true,
    "actions": {
      "contribute": "payable",
      "claim": "nonpayable"
    }
  },
  "reads": {
    "shares": { "functionName": "shares", "returns": "uint256", "account": true }
  }
}
```

- `create: true` 为 `launcher-config-preview/v1` 启用创建接口。通过 `host.quote()` 读取工厂创建费。如果配置需要用于税币地址的 salt，可调用 `host.findSalt()`。用 `host.encode` 传入工厂实际使用的 ABI 参数定义和值，需要元组时声明其组成字段。用户点击确认时调用 `host.submit({ kind: "create", configuration, valueWei })`。宿主将编码后的配置传给 Portal，创建目标为 manifest 中的工厂。
- `actions` 最多声明八个已核验 Launcher 实例上的无参方法。方法名和 `payable` 或 `nonpayable` 必须与部署的合约一致。用户点击确认时，用 `host.submit({ kind: "action", action, valueWei })` 提交已声明的方法。金额使用 wei，无需发送原生币时可以省略 `valueWei`。
- `account: true` 声明一个接收单个 `address` 参数的读取方法。宿主传入已连接的钱包地址，结果通过 `context.snapshot` 提供。钱包未连接或读取失败时，该字段为 `null`。声明交易的 manifest 最多支持十六个读取方法。

提交结果包含交易哈希以及 `success`、`pending`、`reverted` 或 `unverified` 状态。保留哈希，对尚待确认或未能核验的交易调用 `host.checkReceipt(hash)` 重新核验。创建成功并返回已核验的 `launcherAddress` 后，用 `host.openLauncher(launcherAddress)` 打开新实例。测试参与操作时，通过同一工厂创建的真实测试网 Launcher 地址打开详情。 [测试网钱包示例源码](green-presale-launcher/)

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

打包前用默认命令检查 `Component.tsx`、`manifest.json` 和 `i18n.json`。按压缩前的字节数计算，单文件最多 256,000 字节，三个文件合计最多 512,000 字节。命令还会检查 manifest 结构、TSX 语法、具名函数导出，以及 `en`、`zh`、`ko` 的文案键。

manifest 必须使用 BNB Chain 主网（`56`）或 BSC 测试网（`97`），并填写对应链支持的适配器。原生适配器要求工厂地址与该链的适配器配置完全匹配。通用 `launcher-detail/v1` 支持填写自己已部署的非零 LauncherFactory 地址，检查已声明的 `reads`，并要求仅导出 `Launcher`。

`launcher-config-preview/v1` 同样支持这两条链上的项目工厂。检查要求 `launcher-config` 和 `launcher-ui` 两个 surface、对应的两个具名导出，以及有效的可选 `reads` 和 `transactions`。省略 `transactions` 的包保留只读行为。

`--local` 用于独立的 `launcher-local` 源码格式。Workbench 收包时仍会执行完整的源包和源码策略校验，宿主会核验已部署工厂及其兼容性。

## 预览与发布

Launcher UI 源包包含 Launcher 组件，配套的自定义 Vault UI 可选。独立 Mini App 使用自己的交付流程。

| 交付方式 | 提交给 Flap 的材料 |
| --- | --- |
| 仅 Launcher | ZIP 根目录放 `Component.tsx`、`manifest.json` 和 `i18n.json`，附网络、LauncherFactory 地址和测试说明。 |
| 工厂配对 Demo 的 Launcher 与 Vault UI | 两个源码目录放进同一份交接 ZIP，附两个测试网工厂地址和 Vault 验收代币。已有已验收的 Vault 源包时，可以一并提供。 |

在模板根目录运行 `yarn launcher:check-source examples/launcher-runtime/launcher-detail-demo` 可以检查详情 Demo。项目源码通过检查后，在它的源码目录用新文件名生成 ZIP，将三个文件直接放在 ZIP 根目录。

```sh
zip -X -j ../launcher-ui.zip Component.tsx manifest.json i18n.json
```

把 ZIP 交给 Flap 在 Workbench Preview 上传、构建并发布。主站详情预览通过 `artifactPath` 选择 Launcher 版本。如已有同一工厂下的 Launcher，可一并提供地址，便于核验实际读取和跳转。BSC 测试网在主站预览环境打开 `/launcher/<launcher-address>?chain=bnb-testnet&kind=launcher-detail&artifactPath=<encoded-artifact-path>`。主网使用 `chain=bnb`。

`launcher-detail/v1` 和 `launcher-config-preview/v1` 配套的 Vault UI 走普通 Vault UI 流程，单独提交源包。工厂配对 Demo 的两个 UI 由 Flap 生成组合源包。是否在链上部署 Vault 取决于工厂合约。

独立 Mini App 和普通 Vault UI 各自走对应的源包流程。 [测试网接入与交付](developer-testnet-onboarding.zh-CN.md) · [Mini App 开发指南](../../docs/from-zero-mini-app.zh-CN.md) · [Vault 源包交付说明](../../docs/artifact-intake.md)

测试网示例提供一套众筹发行的具体实现，包含示例合约、配置字段、本地 Vault 预览和 Workbench 交付流程。[BSC 测试网示例](testnet-example.zh-CN.md)
