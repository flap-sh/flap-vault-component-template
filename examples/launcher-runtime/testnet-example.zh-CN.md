# Pool Launch BSC 测试网 Demo

[测试网接入与交付](developer-testnet-onboarding.zh-CN.md) · [开发指南](README.zh-CN.md) · [English](testnet-example.md)

示例在 BSC Testnet（chain ID `97`）演示众筹发行。以下地址、源码目录和配置协议均对应这套示例合约。Vault 组件按示例合约的 ABI 读取收益和发起领取，Launcher 宿主按示例的发行机制处理创建、出资和退款。

| 测试网对象 | 地址 | 用途 |
| --- | --- | --- |
| LauncherFactory | `0xc574f30e2ee26fe638eece6d9876217015cd0a38` | 创建 Launcher 实例。 |
| VaultFactory | `0xb89113e16c78989b7bccf5d0e13e99bf2c58dc32` | 发行时创建配套收益 Vault。 |
| 示例代币 | `0x6d36b2959b88f5d9c3f83badd20405a4bcf37777` | 已部署的测试网 ERC20，用于 Vault 读取与验收。 |
| 示例 Vault | `0xcfa21bea1f9a3fef5907230ca30a3d37f404d321` | 上述代币的收益 Vault。 |

两个工厂是独立合约。宿主按链 ID、LauncherFactory 和 VaultFactory 识别这一对合约，并读取链上关系。Vault manifest 中的示例代币用于该工厂的预览和验收。以工厂匹配界面时，是否限制特定代币由平台的绑定设置决定。

## 在本地打开示例

示例按 Template `0.1.42` 基线验证，开发环境使用 Node.js 24 和 Yarn Classic。Launcher 由实现 `crowd-native-create/v1` 的 Flap Launcher 宿主加载，Vault 使用 `@flapsdk/vault-runtime@0.1.42` 的接口。

| 源码位置 | 文件 |
| --- | --- |
| `examples/launcher-runtime/launcher-demo/` | `Component.tsx`、`manifest.json`、`i18n.json` |
| `src/vaults/vault-demo/` | `Component.tsx`、`manifest.json`、`VaultABI.ts`、`i18n.json` |

克隆官方 `main` 并启动开发服务器。示例 Vault 已注册本地预览路由。

```sh
git clone --branch main \
  https://github.com/flap-sh/flap-vault-component-template.git
cd flap-vault-component-template
yarn install --frozen-lockfile
yarn typecheck
yarn dev
```

在 Template 根目录运行示例的 Launcher 源码检查。

```sh
yarn launcher:check-source examples/launcher-runtime/launcher-demo
```

在本地 Vault 预览检查布局、语言、钱包连接状态和读取失败提示。通用 Template 宿主在验收时对示例的风险与交易阶段读取返回 `chain-read-unavailable`。界面保留风险提示，并按钱包、阶段和账户数据判断操作可用性。完整交易流程需要支持这对工厂的测试网宿主。[打开本地 Vault 预览](http://localhost:3000/vault-demo?chainId=97&factoryAddress=0xb89113e16c78989b7bccf5d0e13e99bf2c58dc32&tokenAddress=0x6d36b2959b88f5d9c3f83badd20405a4bcf37777&vaultAddress=0xcfa21bea1f9a3fef5907230ca30a3d37f404d321)

## 编写 Launcher 配置与详情

Launcher manifest 使用 `schemaVersion: 2`、`kind: "launcher-ui"` 和 `configContract: "crowd-native-create/v1"`。宿主用配置协议标识选择该工厂的适配器。在 `surfaces` 声明 `launcher-config` 和 `launcher-ui`。`Component.tsx` 具名导出 `LauncherConfig` 与 `Launcher`，仅导入 React。将可见文字放在 `i18n.json`，让 `en`、`zh`、`ko` 保持同一组键。

`LauncherConfig({ context, messages, resources, onChange })` 接收当前语言、工厂身份、初始草稿和宿主读到的约束。调用 `onChange(draft)` 提交七个字符串字段。以下是上传图片和代币元数据前的草稿。

| prop | 宿主提供的内容 |
| --- | --- |
| `context.locale`、`messages` | 语言代码和该语言的文案字典。 |
| `context.identity` | 当前 `chainId` 和 LauncherFactory 的 `factoryAddress`。 |
| `context.initialValues` | 七个字符串字段的配置草稿。 |
| `context.constraints` | `minimumTargetWei`、`maximumTargetWei`、`launchMinimumTargetWei`、`launchFloorAvailable`、`maxSaleDurationSeconds`、`minContributorBps`、`maxContributorBps`。 |
| `context.previewOnly` | 宿主提供的能力限制。交互式测试网产物预览可以传入 `false`。 |
| `resources.available`、`resources.uploadTokenMetadata` | 元数据上传的可用状态和受控上传方法。 |
| `onChange` | 接收完整草稿的回调。输入尚未填完时也可提交，宿主按当前草稿重新校验。 |

```json
{
  "name": "Pool Launch Demo",
  "symbol": "POOLDEMO",
  "description": "建池发行测试网示例",
  "metadataCid": "",
  "targetRaiseWei": "3000000000000000000",
  "saleDurationSeconds": "3600",
  "contributorBps": "5000"
}
```

`targetRaiseWei` 用 Wei，`saleDurationSeconds` 用秒，`contributorBps` 用基点。上述草稿的目标为 `3 tBNB`、募资时长为一小时、出资者收益分成为 `50%`。提交前按宿主当前显示的最低发行目标、目标上限、时间和分成范围调整。分成字段描述 Vault 的原生币收益分配。

用户点击上传时，调用 `resources.uploadTokenMetadata({ name, symbol, description, image })`。宿主完成上传并返回 `{ cid }`，组件把这个 CID 写回草稿。修改名称、符号、描述或图片时清空 CID，由用户再次上传。宿主复核元数据、金额和工厂配对，生成合约调用、费用和交易确认信息。组件只提交草稿字段。

`Launcher({ context, messages, host })` 使用 `context.snapshot` 展示链上募资进度、截止时间、发行状态和当前账户的可领取或可退金额。快照为空时显示等待状态。用 `host.refresh()` 更新数据，用 `host.available` 和 `context.previewOnly` 控制操作按钮。时间以快照区块时间为准，金额用整数基础单位计算。

`context.launcherAddress` 指向当前实例。`snapshot.account` 对应读取用户仓位的账户，`launcherClaimableWei`、`launcherClaimedWei` 和退款数据随账户更新。宿主切换账户、网络或实例时应撤销旧检查，并让界面使用新快照。`requestAction` 的可用状态会随连接、网络和进行中的操作变化，界面可以显示相应的等待或连接提示。

| 用户操作 | Launcher 回调 |
| --- | --- |
| 确认出资金额 | `host.requestAction("contribute", amountWei)` |
| 领取已分配的代币 | `host.requestAction("launcher-claim")` |
| 募资结束后领取可退款项 | `host.requestAction("refund")` |

回调请求宿主准备交易并打开确认弹窗。宿主在用户确认后请求钱包签名，并以链上回执更新状态。`snapshot.expectedToken` 是预占地址。发行完成后，以 `snapshot.launched` 和 `snapshot.tokenAddress` 为准。详情页使用宿主传入的 `context.tokenTaxInfoHref` 链接已发行代币的 Vault，收益领取在 Vault 页完成。

## 打包 Launcher 源码

只验收 Launcher 时，在模板根目录运行以下命令，提交生成的 ZIP、网络及 LauncherFactory 地址。

```bash
yarn launcher:package examples/launcher-runtime/launcher-demo
```

命令检查源码，通过后生成 `dist/launcher-demo-testnet-v1-launcher.zip`。Workbench 在构建和发布前执行最终校验。 [Launcher 源码检查](README.zh-CN.md#检查-launcher-源码)

## 编写和交付配套 Vault 组件（可选）

Vault 四件套遵循普通 Vault UI 的 manifest 与 SDK 接口。示例用 `useFlapSdk()` 读取宿主绑定的 Vault 与代币。`VaultABI.ts` 声明读取累计收入、已支付收入和账户分配、已领、可领金额所需的接口，以及 `claim()`。合约风险取自宿主的链上上下文。领取按钮只在正确网络、已连接、满足交易阶段且有可领取收益时启用。提交后等待成功回执，再刷新账户数据。

在满足版本和 SDK 来源校验的官方 Template `main` checkout 中放入同一份 Vault 源码，再按下面的示例参数验收。`vault-demo` 是示例源码目录名。[Vault 源包交付说明](../../docs/artifact-intake.md)

```sh
yarn vault:register vault-demo
yarn vault:check vault-demo
yarn vault:e2e vault-demo --chain 97 \
  --factory 0xb89113e16c78989b7bccf5d0e13e99bf2c58dc32 \
  --token 0x6d36b2959b88f5d9c3f83badd20405a4bcf37777 \
  --vault 0xcfa21bea1f9a3fef5907230ca30a3d37f404d321
yarn vault:package vault-demo
yarn vault:verify-package dist/vault-demo.zip
```

首次运行 E2E 时，如果提示缺少 Chromium，运行 `yarn playwright install chromium`。E2E 默认启动本地预览。复用其他预览时，使用提供 Template E2E 验收接口且渲染同一份源码的宿主。正式 Vault 包携带与源码哈希匹配的验收报告。

同时验收两个 UI 时，交付两个源码目录、两个工厂地址及 Vault 验收代币。已有通过验收的 Vault 源包时，可以一并提供。Flap 生成一个 `flap-factory-pair-source-v2` 源码 ZIP，按 Workbench 流程上传、构建并发布。两个组件各有独立的产物版本。

## 预览与常规入口

- **预览。** Workbench 生成的链接使用 `artifactPath` 选择已发布的 Launcher。交付了自定义 Vault UI 时，链接还带有 `vaultArtifactPath`，进入税费信息页时，宿主将其作为该页的 `artifactPath`。可在链上绑定前通过链接预览。
- **常规入口。** 由具备 `AUDITOR_ROLE` 的账户绑定 LauncherFactory（scope `5`）。交付了自定义 Vault UI 时，还需要绑定 VaultFactory（scope `3`）。用户从 Pool Launch 输入 Launcher 工厂进入创建页。发行后，代币的税费信息页按 Vault 工厂解析对应的 UI。

## 验收创建、募资、发行与领取

1. **创建。** 打开操作员提供的 Launcher 配置预览。把钱包切到 BSC Testnet，填写名称、符号和募资配置，选择图片并上传元数据。核对宿主确认页的工厂、募资目标、期限和费用。创建交易支付 CA 预占费及 Gas。收到成功回执后进入新 Launcher 的详情。
2. **出资。** 核对链、实例地址、募资目标、截止时间和剩余金额。输入出资额，在钱包确认。等回执成功后检查总出资与自己的出资是否更新。最后一笔填满目标的出资可能在同一交易触发发行，确认前检查宿主提示与手续费预算。
3. **发行。** 等待宿主确认链上已发行状态和实际代币地址。检查募资结果，打开宿主提供的代币交易页，核对页面地址与已发行代币一致。
4. **领取代币。** 用参与出资的账户回到 Launcher 详情。有正额可领取时发起领取，等成功回执后检查可领取和已领取两项金额。用未参与的账户和未连接钱包的状态复查页面提示。
5. **查看 Vault（如有）。** 如果交付了配套 Vault UI，从同一代币的 Vault 入口打开收益页面。核对代币、VaultFactory、风险状态、累计收入和账户收益。达到可操作阶段且账户有正额收益时，可以另行测试收益领取。没有收入时检查零收益状态即可。
6. **验证退款。** 用一笔独立的测试网发行覆盖未达目标的路径。在截止后用有可退款额的出资账户打开详情，确认退款并检查成功回执与状态更新。
