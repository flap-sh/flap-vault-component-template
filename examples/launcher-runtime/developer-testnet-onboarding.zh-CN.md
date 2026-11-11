# Pool Launch UI 测试网接入指南

本轮接入使用 **BNB Smart Chain 测试网（BSC Testnet，chain ID `97`）**。开发者在本地用 Flap 模板编写界面，完成后把源码和测试资料交给 Flap。Flap 负责打包、上传 Workbench 并回传测试网预览链接。

## 1. 下载模板

使用 Node.js 22 或以上版本，以及 Yarn Classic 1.22.22。

```sh
git clone --branch test/pool-launch-developer-preview --single-branch \
  https://github.com/flap-sh/flap-vault-component-template.git
cd flap-vault-component-template
yarn install --frozen-lockfile
```

模板附带一套已接入的测试网工厂配对，可以先用它跑本地示例。使用自己的测试网合约时，先提供 LauncherFactory 和配对 VaultFactory 的地址，以及配置字段、操作对应的合约 ABI 或源码链接。Flap 会核对测试网宿主是否支持该发行机制和工厂配对。[BSC 测试网示例](https://github.com/flap-sh/flap-vault-component-template/blob/test/pool-launch-developer-preview/examples/launcher-runtime/testnet-example.zh-CN.md)

## 2. 本地开发

| 界面 | 需要实现的内容 | 示例源码 |
| --- | --- | --- |
| Launcher 发行配置与详情 | 在 `Component.tsx` 中具名导出 `LauncherConfig` 和 `Launcher`。配置页收集发行参数，详情页展示募资进度和发行状态，通过宿主发起出资、领取和退款。随附 `manifest.json` 和 `i18n.json`。 | `examples/launcher-runtime/crowd/` |
| 配套 Vault UI | 在 `Component.tsx` 中通过 Vault SDK 读取绑定的 Vault，展示风险、收益和领取状态。随附 `manifest.json`、`VaultABI.ts` 和 `i18n.json`。 | `src/vaults/crowd-vault/` |

按项目命名自己的源码目录。配套 Vault 可以用脚手架创建，在模板根目录填写项目已部署的测试网地址后运行。

```sh
yarn vault:scaffold my-project-vault --chain 97 \
  --factory '<VaultFactory 地址>' --token '<验收代币地址>'
```

Launcher 源码中，`manifest.json` 声明链、工厂和宿主支持的配置协议，`i18n.json` 提供键一致的 `en`、`zh`、`ko` 文案。由 Flap 宿主处理代币元数据上传、交易核对及回执。测试网示例说明了组件 props、金额基础单位、交易请求和 Vault 接入方式。[Pool Launch UI 开发指南](https://github.com/flap-sh/flap-vault-component-template/blob/test/pool-launch-developer-preview/examples/launcher-runtime/README.zh-CN.md)

```sh
yarn launcher:check-source examples/launcher-runtime/crowd
yarn typecheck
yarn dev
```

开发自己的 Launcher 时，把第一条命令的目录换成项目源码目录。该命令检查源码结构和声明。本地服务可以检查 Vault 布局、语言和账户状态，Launcher 创建、出资、发行等真实交易在 Flap 回传的测试网预览里验证。

## 3. 把材料交给 Flap

将项目的 Launcher 和 Vault 两个源码目录放入同一份 ZIP，连同以下测试资料交给 Flap。ZIP 内保留两个目录及各自的 manifest。

| 材料 | 请提供 |
| --- | --- |
| 源码 | Launcher 三件套和 Vault 四件套。已有同源码的 Vault 验收报告或已验证 Vault 源包时，可以一并提供。 |
| 网络和工厂 | `chainId: 97`、LauncherFactory 地址、配套 VaultFactory 地址。 |
| Vault 验收样例 | 提供配套工厂已创建 Vault 的测试网代币地址，使用 `7777` 结尾的已部署 ERC20。已知 Vault 地址时也请附上。 |
| 测试说明 | 已有的 Launcher 实例地址（如有）、要测试的操作、预期结果，以及 `launcher:check-source` 和 `typecheck` 的结果。 |

交接 ZIP 用于传递源码。Flap 会根据源码和测试资料完成验收，生成 Workbench 所需的正式源包。配套 Launcher 和 Vault 由 Flap 使用同一个包上传。开发者使用自己的测试网钱包和 tBNB 签名测试交易。

## 4. 收到预览后验收

Flap 在 Workbench 构建并发布测试用产物后，会回传指定版本的 Launcher 创建预览和 Vault 预览链接。版本预览可以在链上 UI 绑定前打开，适合先确认界面和流程。

1. 打开创建链接，连接 BSC Testnet 钱包，填写发行配置并确认创建。成功后进入新 Launcher 的详情。
2. 在详情页出资，核对募资进度。达到目标后检查发行状态及实际部署的代币地址，再打开代币交易页。
3. 用有可领取余额的出资账户验证代币领取。有配套 Vault 时，从同一个代币的税费信息页进入 Vault，核对收益和领取状态。
4. 若本次要验收退款，用另一笔未达目标的 Launcher，在截止后用有可退款金额的出资账户验证。
5. 如发现问题，把预览链接、操作步骤、预期结果和实际结果反馈给 Flap。有链上交易时附上测试网交易哈希。
