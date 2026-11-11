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

将 `launcher_source_dir` 设为项目的 Launcher 源码目录，在 Template 根目录运行以下命令。

```sh
yarn launcher:check-source "$launcher_source_dir"
```

命令检查 `Component.tsx`、`manifest.json` 和 `i18n.json`，包括 manifest 结构、TSX 语法、`LauncherConfig` 和 `Launcher` 具名函数导出，以及 `en`、`zh`、`ko` 的文案键。检查通过后输出 manifest 声明的链、工厂地址和配置协议。宿主和 Workbench 各自核验工厂与协议的兼容性。

## 预览与发布

对于已接入的工厂，向 Flap 提供 Launcher 源码、配套 Vault 源码和测试网工厂地址。已有已验收的 Vault 源包时，可以一并提供。Flap 完成打包和 Workbench 构建后，回传指定产物版本的预览链接。常规入口通过授权的链上绑定加载 UI。

测试网示例提供一套众筹发行的具体实现，包含示例合约、配置字段、本地 Vault 预览和 Workbench 交付流程。[BSC 测试网示例](testnet-example.zh-CN.md)
