# Crowd Launcher 与 Vault UI 开发指南

[English](README.md)

这份指南用于在 BSC Testnet（chain ID `97`）开发 Crowd 发行界面。一个工厂对提供三个界面。`LauncherConfig` 收集发行配置，`Launcher` 展示募资、代币领取和退款，`CrowdVault` 展示代币税收收益和收益领取。

| 测试网对象 | 地址 | 用途 |
| --- | --- | --- |
| LauncherFactory | `0xc574f30e2ee26fe638eece6d9876217015cd0a38` | 创建 Crowd Launcher 实例。 |
| VaultFactory | `0xb89113e16c78989b7bccf5d0e13e99bf2c58dc32` | 发行时创建配套收益 Vault。 |
| 示例代币 | `0x6d36b2959b88f5d9c3f83badd20405a4bcf37777` | 已部署的测试网 ERC20，用于 Vault 读取与验收。 |
| 示例 Vault | `0xcfa21bea1f9a3fef5907230ca30a3d37f404d321` | 上述代币的收益 Vault。 |

两个工厂是独立合约。宿主按链 ID、LauncherFactory 和 VaultFactory 识别这一对合约，并读取链上关系。Vault manifest 中的示例代币用于该工厂的预览和验收。以工厂匹配界面时，是否限制特定代币由平台的绑定设置决定。

## 在本地打开示例

示例按 Template `0.1.42` 基线验证，开发环境使用 Node.js 24 和 Yarn Classic。Launcher 由实现 `crowd-native-create/v1` 的 Flap Launcher 宿主加载，Vault 使用 `@flapsdk/vault-runtime@0.1.42` 的接口。

| 源码位置 | 文件 |
| --- | --- |
| `examples/launcher-runtime/crowd/` | `Component.tsx`、`manifest.json`、`i18n.json` |
| `src/vaults/crowd-vault/` | `Component.tsx`、`manifest.json`、`VaultABI.ts`、`i18n.json` |

在包含这两个示例目录的测试分支根目录运行以下命令。`vault:register` 为 `crowd-vault` 加入本地预览路由。若路由已注册，命令会保留现有配置。

```sh
git clone --branch test/crowd-launcher-v4 --single-branch \
  https://github.com/fsensen/flap-vault-component-template.git
cd flap-vault-component-template
yarn install --frozen-lockfile
yarn vault:register crowd-vault
yarn typecheck
yarn dev
```

在本地 Vault 预览检查布局、三种语言、已连接与未连接状态，以及读取失败时的提示。普通 Template 预览可使用下面的测试网地址提示。本分支验收时，通用 Template 宿主对 Crowd 风险与阶段的读取显示 `chain-read-unavailable`。界面展示对应风险提示，并按钱包、阶段和账户数据判断操作可用性。完整交易流程使用平台操作员提供的 Crowd 兼容测试网宿主。 [打开本地 Crowd Vault 预览](http://localhost:3000/crowd-vault?chainId=97&factoryAddress=0xb89113e16c78989b7bccf5d0e13e99bf2c58dc32&tokenAddress=0x6d36b2959b88f5d9c3f83badd20405a4bcf37777&vaultAddress=0xcfa21bea1f9a3fef5907230ca30a3d37f404d321)

开发独立 Vault 组件时，可用现有 `vault:scaffold` 生成新的目录与 artifact ID。下例使用这对工厂的同一个真实验收代币。若开发自己的工厂，请提供与该工厂实际关联的同链代币，再实现对应的 ABI 和业务界面。 [Vault UI 开发入门](../../docs/from-zero-vault-ui.md)

```sh
yarn vault:scaffold my-crowd-vault \
  --chain 97 \
  --factory 0xb89113e16c78989b7bccf5d0e13e99bf2c58dc32 \
  --token 0x6d36b2959b88f5d9c3f83badd20405a4bcf37777 \
  --locales en,zh,ko
```

## 编写 Launcher 配置与详情

Launcher manifest 使用 `schemaVersion: 2`、`kind: "launcher-ui"` 和 `configContract: "crowd-native-create/v1"`。`Component.tsx` 具名导出 `LauncherConfig` 与 `Launcher`，仅导入 React。将可见文字放在 `i18n.json`，让 `en`、`zh`、`ko` 保持同一组键。

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
  "name": "Crowd Demo",
  "symbol": "CROWDDEMO",
  "description": "Crowd 测试网发行示例",
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
| 由 Launcher 宿主发起 Vault 收益核对 | `host.requestAction("vault-claim")` |

回调打开宿主交易检查。宿主在用户确认后请求钱包签名，并以链上结果更新状态。代码将账户、金额和操作交给这一组受控能力，钱包、网络调用、ABI 和 calldata 由宿主管理。交易与 Vault 导航由宿主根据已发行代币生成。需要在详情中链接 Vault 时，使用宿主传入的 `context.tokenTaxInfoHref`。

## 编写 Vault 组件与交付源码

Vault 四件套遵循普通 Vault UI 的 manifest 与 SDK 接口。示例用 `useFlapSdk()` 读取宿主绑定的 Vault 与代币。`VaultABI.ts` 声明读取累计收入、已支付收入和账户分配、已领、可领金额所需的接口，以及 `claim()`。合约风险取自宿主的链上上下文。领取按钮只在正确网络、已连接、满足交易阶段且有可领取收益时启用。提交后等待成功回执，再刷新账户数据。

对普通 Vault 子包，现有公开 Template 提供以下正式校验命令。在当前官方 `main` 对应的本地 checkout 中放入同一份 Vault 源码并注册后运行。正式 check 和 package 会核对官方分支及已发布 SDK 的来源。测试分支的提交可能触发 freshness 拒绝，此时在符合版本要求的本地官方 checkout 验收。 [Vault 源包交付说明](../../docs/artifact-intake.md)

```sh
yarn vault:register crowd-vault
yarn vault:check crowd-vault
yarn vault:e2e crowd-vault --chain 97 \
  --factory 0xb89113e16c78989b7bccf5d0e13e99bf2c58dc32 \
  --token 0x6d36b2959b88f5d9c3f83badd20405a4bcf37777 \
  --vault 0xcfa21bea1f9a3fef5907230ca30a3d37f404d321
yarn vault:package crowd-vault
yarn vault:verify-package dist/crowd-vault.zip
```

首次运行 E2E 时，如果提示缺少 Chromium，运行 `yarn playwright install chromium`。验收需使用与当前源码一致的预览页面和真实测试代币。合约配对或交易阶段读取有误时，交由操作员在 Crowd 兼容宿主复核。正式 Vault 包携带与源码哈希匹配的验收报告。

这组公开命令覆盖 Vault 子包。交付整套 Crowd 界面时，把 Launcher 三件套、Vault 四件套、工厂地址和验收代币交给有权限的操作员。操作员通过配对构建与校验生成一个 `flap-factory-pair-source-v2` 源码 ZIP，按 Workbench 流程上传、构建并提供测试网预览。需要将发布版本用于对应工厂的正常入口时，再由授权操作员完成 LauncherFactory 与 VaultFactory 的各自绑定。保留同一套配对的两个产物版本，便于复核。

## 验收创建、募资、发行与领取

1. **创建。** 打开操作员提供的 Launcher 配置预览。把钱包切到 BSC Testnet，准备足够的 `tBNB` 支付本次操作及手续费。填写名称、符号和募资配置，选择图片并上传元数据。核对宿主确认页的工厂、目标、截止设置和费用，再确认创建。收到成功回执后进入新 Launcher 的详情。
2. **出资。** 核对链、实例地址、募资目标、截止时间和剩余金额。输入出资额，在钱包确认。等回执成功后检查总出资与自己的出资是否更新。最后一笔填满目标的出资可能在同一交易触发发行，确认前检查宿主提示与手续费预算。
3. **发行。** 等待宿主确认链上已发行状态和实际代币地址。检查募资结果，打开宿主提供的代币交易页，核对页面地址与已发行代币一致。
4. **领取代币。** 用参与出资的账户回到 Launcher 详情。有正额可领取时发起领取，等成功回执后检查可领取和已领取两项金额。用未参与的账户和未连接钱包的状态复查页面提示。
5. **查看 Vault。** 从同一代币的 Vault 入口打开收益页面。核对代币、VaultFactory、风险状态、累计收入和账户收益。达到可操作阶段且账户有正额收益时，可以另行测试收益领取。没有收入时检查零收益状态即可。
6. **验证退款。** 用一笔独立的测试网发行覆盖未达目标的路径。在截止后用有可退款额的出资账户打开详情，确认退款并检查成功回执与状态更新。
