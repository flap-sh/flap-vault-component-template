# Pool Launch UI 接入与交付指南

开发者用 Flap 模板编写 Launcher 和配套 Vault UI，把源码与验收资料交给 Flap。Flap 负责校验、打包、上传 Workbench，并回传指定版本的预览链接。

| 场景 | 验收环境 | 当前可用范围 |
| --- | --- | --- |
| 工厂配对 Demo | BSC 测试网 `97` | 使用测试网钱包和 tBNB 验证创建、出资、发行及领取。 |
| Launcher 跳转 Demo | Flap 本地宿主 | 演示从 Launcher 打开同站 Mini App。线上测试网预览需要宿主接入对应的工厂和目标页面。 |

## 1. 下载模板

使用 Node.js 22 或以上版本，以及 Yarn Classic 1.22.22。

```sh
git clone --branch test/pool-launch-developer-preview --single-branch \
  https://github.com/flap-sh/flap-vault-component-template.git
cd flap-vault-component-template
yarn install --frozen-lockfile
```

已克隆该测试分支的开发者，可以在模板目录运行 `git pull --ff-only` 获取最新文档、检查命令和示例源码。

模板附带一套已接入的测试网工厂配对，可以先用它跑本地示例。使用自己的测试网合约时，先提供 LauncherFactory 和配对 VaultFactory 的地址，以及配置字段、操作对应的合约 ABI 或源码链接。Flap 会核对测试网宿主是否支持该发行机制和工厂配对。 [BSC 测试网示例](testnet-example.zh-CN.md)

## 2. 本地开发

| 界面 | 需要实现的内容 |
| --- | --- |
| Launcher 发行配置与详情 | 在 `Component.tsx` 中具名导出 `LauncherConfig` 和 `Launcher`。配置页收集发行参数，详情页展示募资进度和发行状态，通过宿主发起出资、领取和退款。随附 `manifest.json` 和 `i18n.json`。 |
| 配套 Vault UI | 在 `Component.tsx` 中通过 Vault SDK 读取绑定的 Vault，展示风险、收益和领取状态。随附 `manifest.json`、`VaultABI.ts` 和 `i18n.json`。 |

按项目命名自己的源码目录。配套 Vault 可以用脚手架创建，在模板根目录填写项目已部署的测试网地址后运行。

```sh
yarn vault:scaffold my-project-vault --chain 97 \
  --factory '<VaultFactory 地址>' --token '<验收代币地址>'
```

Launcher 源码中，`manifest.json` 声明链、工厂和宿主支持的配置协议。`i18n.json` 提供键一致的 `en`、`zh`、`ko` 文案。Flap 宿主处理代币元数据上传、交易核对及回执。测试网 Demo 提供完整源码位置、配置协议、组件 props、金额基础单位和交易请求示例。 [BSC 测试网 Demo](testnet-example.zh-CN.md#在本地打开示例) · [Pool Launch UI 开发指南](README.zh-CN.md)

将 `launcher_source_dir` 设为 Launcher 源码目录，在模板根目录运行。

```sh
yarn launcher:check-source "$launcher_source_dir"
yarn typecheck
yarn dev
```

`launcher:check-source` 检查源码结构和声明。本地服务可以检查 Vault 布局、语言和账户状态，Launcher 创建、出资、发行等真实交易在 Flap 回传的测试网预览里验证。

## 3. 在 Launcher 详情中接入站内跳转

支持跳转的宿主会向 `Launcher` 详情组件提供可选的 `host.redirect(path: string): boolean`。组件从宿主传入的链和已验证实例数据解析目标，在地址齐全后发起跳转。目标与 Flap 当前页面同源即可，无需在 Workbench 登记。方法返回 `true` 表示接受导航，方法缺失或返回 `false` 时，组件继续显示详情或说明。跳转无需连接钱包，`host.available` 只用于判断交易能力。 [跳转 API 与代码示例](README.zh-CN.md#从-launcher-详情跳转到站内页面) · [English](README.md#redirect-from-launcher-details)

宿主将 Launcher 入口里的 `ref` 和 `lang` 带到目标，并保留目标自身的业务参数。入口没有 `ref` 时省略该参数，没有有效的 `lang` 时使用当前站点语言。宿主替换当前 Launcher 的浏览器历史记录，所以返回键会直接回到打开 Launcher 之前的页面。一次访问最多自动跳转一次。若用户要查看 Launcher 详情，可在 Launcher 链接上加 `view=launcher`。

### Launcher 跳转 Demo

本地 Demo 在同一个 `launcher-local` 产物中提供创建表单和跳转详情。详情从宿主读取已验证的链、工厂、Launcher 地址和预占 CA，跳转到 Mini App 的项目页。示例路径可以是 `/apps/<app-slug>/mint/<CA>`，实际路径和业务参数由 Mini App 定义。预占 CA 在发射前也可用于定位项目。 [跳转 Demo 源码](../launcher-local/)

将 `launcher_source_dir` 设为本地 Demo 的源码目录，在模板根目录检查。

```sh
yarn launcher:check-source --local "$launcher_source_dir"
```

Flap 已在本地宿主使用链上数据验证跳转、参数传递和浏览器返回。要在测试网验收自定义跳转，请随源码提供站内目标路径及触发条件。

## 4. 把测试网材料交给 Flap

将项目的 Launcher 和 Vault 两个源码目录放入同一份 ZIP，连同以下测试资料交给 Flap。ZIP 内保留两个目录及各自的 manifest。

| 材料 | 请提供 |
| --- | --- |
| Launcher 源码 | `Component.tsx`、`manifest.json`、`i18n.json`。 |
| Vault 源码 | `Component.tsx`、`manifest.json`、`VaultABI.ts`、`i18n.json`。已有同源码的 Vault 验收报告或已验证 Vault 源包时，可以一并提供。 |
| 网络和工厂 | `chainId: 97`、LauncherFactory 地址、配套 VaultFactory 地址。 |
| Vault 验收样例 | 提供配套工厂已创建 Vault 的测试网代币地址，使用 `7777` 结尾的已部署 ERC20。已知 Vault 地址时也请附上。 |
| 测试说明 | 已有的 Launcher 实例地址（如有）、要测试的操作、预期结果，以及 `launcher:check-source` 和 `typecheck` 的结果。若实现了跳转，附目标站内路径及触发条件。 |

交接 ZIP 用于传递源码。Flap 会根据源码和测试资料生成 Workbench 所需的正式配对源包，在 Workbench 上传、构建并发布预览用产物，再把链接回传给开发者。开发者使用自己的测试网钱包和 tBNB 签名测试交易。

如果 Workbench 报 `source-package/missing-vaults-dir`，先确认选中了正式源包，并检查包内的 `src/vaults/<slug>`。需要重打 Vault 或 Mini App 源包时，从官方模板 `main` 和匹配的稳定 runtime 按 manifest 运行对应的 `vault:*` 或 `app:*` 流程。源文件、manifest schema、E2E 报告和元数据都由该流程重新生成。 [Workbench 源包说明](../../docs/artifact-intake.md)

## 5. 收到预览后验收

Flap 在 Workbench 构建并发布测试用产物后，会回传指定版本的 Launcher 创建预览和 Vault 预览链接。版本预览可以在链上 UI 绑定前打开，适合先确认界面和流程。

1. 打开创建链接，连接 BSC Testnet 钱包，填写发行配置并确认创建。成功后进入新 Launcher 的详情。
2. 在详情页出资，核对募资进度。达到目标后检查发行状态及实际部署的代币地址，再打开代币交易页。
3. 用有可领取余额的出资账户验证代币领取。有配套 Vault 时，从同一个代币的税费信息页进入 Vault，核对收益和领取状态。
4. 若本次要验收退款，用另一笔未达目标的 Launcher，在截止后用有可退款金额的出资账户验证。
5. 若启用了跳转，使用带 `ref`、`lang` 的 Launcher 入口，核对目标项目、参数和返回键。再给 Launcher 链接加 `view=launcher`，确认可停在详情页。
6. 如发现问题，把预览链接、操作步骤、预期结果和实际结果反馈给 Flap。有链上交易时附上测试网交易哈希。

Launcher 列表显示**募资目标**和**代币入池比例**，分别来自 `display.targetRaise` 与 `display.poolTokenRatioBps`。测试网原生报价币单位为 tBNB，`5000` 基点代表代币总量的 50%。工厂配对 Demo 在募满后把筹到的 tBNB 全部作为初始报价币入池，其他工厂可有不同规则。当前列表接入未取得实际入池金额，详情可按对应工厂的链上状态提供进度。
