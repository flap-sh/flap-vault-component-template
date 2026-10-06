# 普通 Vault UI：测试 CA、工厂绑定与主网配置

[English](./vault-ui-test-ca.md)

**没有自己的项目 token，也可以开始开发和测试 Vault UI。** 如果你已经有真实的测试网工厂，可以先使用 Flap 提供的同链公共测试 CA，完成界面预览和适用的 E2E 检查，不必先发行项目 token。

本文用于普通税币 Vault UI（manifest 不设置 `mode: "mini-app"`）。公共 CA 是已部署的测试 token，不是随意编造的占位地址；它不能代替项目自己的 Vault 或真实业务联调。若工厂和 Vault 都还没有部署，先打开模板内置 `/example` 熟悉界面，不要编造项目绑定。

## 1. 先分清三项配置

| 配置 | 填写位置 | 用途 |
| --- | --- | --- |
| 工厂地址 | `match.bindings[].chainId` + `factoryAddress` | 声明这个 UI 服务哪个链上的工厂。必须使用该链真实部署的工厂。 |
| 测试 CA | 同一 binding 的 `tokenAddresses` | 为预览、ERC20 校验和 E2E 提供 token 上下文；工厂模式下不等于正式 CA 限制。 |
| 正式 CA 限制 | Workbench/registry 的 `caRestrictionMode`，由平台确认 | 决定生产是否限定到指定 CA；不写成 manifest 的全局字段。 |

把公共测试 CA 写到自己的工厂 binding 下，**不会在链上绑定 token 与工厂，也不会创建 Vault**。这里声明的是 UI 的目标工厂及测试输入。若链上查到了 CA 已属于另一工厂或 Vault，真实关系仍优先，不能靠改 URL 覆盖。

上述「测试 CA 不限制生产」特指工厂模式。无工厂的 token-scoped 绑定会按 CA 匹配；不要为了省略工厂地址而随意更换绑定模式。

## 2. 没有项目测试 CA 时，使用哪个地址

如果开发者已提供适合该项目、该链的测试 CA，优先使用它；否则，普通税币 Vault UI 可显式填写以下标准 `7777` 公共测试 CA：

| 网络 | `chainId` | 公共测试 CA |
| --- | --- | --- |
| BNB 测试网 | `97` | `0xf8ac72e7adefbce6ff22d9a9238512933e247777` |
| BNB 主网 | `56` | `0x286184b2660a2822671a33f24c4517f593947777` |

地址来源为 [`src/shell/previewCoinDetail.ts`](../src/shell/previewCoinDetail.ts) 中的 `TESTNET_UI_TEST_TOKEN_ADDRESS` 和 `MAINNET_UI_TEST_TOKEN_ADDRESS`。2026-10-07 使用仓库现有 ERC20 校验器只读核验，两者均返回 `TEST`、18 位精度；这个结果不代表它们与项目工厂存在关系。后续仍须通过当次校验，不将历史核验当作豁免。

其他链使用[对应链的测试地址](./robinhood-testnet.md)，不要把 BNB 地址跨链复用。普通 Vault 脚手架当前仍要求显式传入 `--token`；预览壳有默认地址，不代表 manifest 会自动补齐。

## 3. 最短路径：只在 BNB 测试网做界面测试

准备一份当前官方模板、Node.js 22+、Yarn，以及**自己的真实 BNB 测试网工厂地址**。在下面命令中替换 `0xYourTestnetFactory`；公共测试 CA 可以保持原样。`0xYourTestnetFactory` 是说明文字，不是可直接提交的地址。

```bash
yarn
yarn vault:scaffold my-vault \
  --name "My Vault UI" \
  --chain 97 --factory 0xYourTestnetFactory \
  --token 0xf8ac72e7adefbce6ff22d9a9238512933e247777 \
  --locales en,zh
```

只测试 chain `97` 时，不需要先填主网工厂。脚手架会生成包的核心文件、稳定 `artifactId` 和本地路由；不要为了填写测试 CA 而替换整个 manifest。生成的 `match` 应具有以下结构（工厂地址同样必须替换）：

```json
{
  "match": {
    "bindings": [
      {
        "chainId": 97,
        "factoryAddress": "0xYourTestnetFactory",
        "tokenAddresses": ["0xf8ac72e7adefbce6ff22d9a9238512933e247777"]
      }
    ]
  }
}
```

完成 UI 实现后，启动预览：

```bash
yarn dev
```

打开下列地址，并替换工厂参数。如果本地使用了其他端口，相应替换 `3000`。

```text
http://localhost:3000/my-vault?chainId=97&factoryAddress=0xYourTestnetFactory&tokenAddress=0xf8ac72e7adefbce6ff22d9a9238512933e247777
```

在页面的宿主读取结果中检查实际链、token、factory、Vault 和降级原因。公共 CA 未提供项目 Vault 数据时，组件应展示数据不可用和风险状态缺失提示，并让依赖这些数据的动作不可执行；不要伪造余额、收益或低风险状态。

然后按顺序运行，遇到阻塞先修复再继续：

```bash
yarn vault:check my-vault
yarn vault:e2e my-vault --chain 97
yarn vault:package my-vault
yarn vault:verify-package dist/my-vault.zip
```

成功标志是检查无阻塞、E2E 报告通过、官方打包生成 ZIP、验证器确认包有效。公共 CA 不是绕过这些检查的开关，也不保证任意业务组件都能直接通过 E2E。

E2E 覆盖 PC/iPad/H5 的渲染、布局、阶段和错误网络状态，**不代表项目合约业务已验收**。缺少 Chromium 时按提示运行 `yarn playwright install chromium`。`vault:e2e --token` 仅可作本地自测覆盖，不能替代 manifest 声明的测试 CA 和打包证明。

## 4. 什么时候换成项目自己的 CA

| 当前目标 | 使用什么 | 能确认什么 |
| --- | --- | --- |
| 先开发 UI、检查响应式布局与缺失数据状态 | 同链公共 CA + 真实目标工厂 | 界面及适用的 E2E 状态。不能证明项目 Vault 存在或读写成功。 |
| 验证余额、奖励、存入、领取等业务 | 项目 CA + 实际关联的 Vault/工厂 + 对应 ABI | 在真实部署关系和权限下进行业务联调。优先在测试网进行。 |
| 上线给项目用户 | 正式工厂/Vault、已验证的绑定关系和平台发布配置 | 按正式绑定加载 UI；是否限制 CA 由平台单独决定。 |

进入业务联调时，将项目 CA 写入正确链的 `tokenAddresses`，核对宿主实际读取到的 Vault/工厂，按业务需求测试 reads/writes。替换 CA 或修改 manifest 后重新执行 check → E2E → package → verify，旧的源文件哈希证明不能复用。

无工厂的单 Vault UI 仍必须提供真实 `vaultAddresses`。公共 CA 不能替你产生 Vault，也不表示它与任意单 Vault 具有业务关系；该路径详见 [manifest 绑定说明](./manifest.md)。

## 5. BNB 主网如何配置和测试

主网地址属于 chain `56`。若现在就只需要主网界面预览，可在**尚未创建 `my-vault` 目录时**使用以下替代起步命令，替换真实主网工厂：

```bash
yarn vault:scaffold my-vault \
  --name "My Vault UI" \
  --chain 56 --factory 0xYourMainnetFactory \
  --token 0x286184b2660a2822671a33f24c4517f593947777 \
  --locales en,zh
```

如果已经按测试网步骤创建了 `my-vault`，保留现有源码和 `artifactId`，在 `match.bindings` 增加主网 binding，而不是再次运行同名 scaffold：

```json
{
  "chainId": 56,
  "factoryAddress": "0xYourMainnetFactory",
  "tokenAddresses": ["0x286184b2660a2822671a33f24c4517f593947777"]
}
```

上述是一个 binding 条目，不是完整 manifest。测试网 binding 可以保留在前面；只有正式工厂准备好时才添加主网条目，不填猜测地址。也可以只声明主网工厂、保留测试网 token 做包证明，但这样不算已完成主网 E2E。

主网预览地址：

```text
http://localhost:3000/my-vault?chainId=56&factoryAddress=0xYourMainnetFactory&tokenAddress=0x286184b2660a2822671a33f24c4517f593947777
```

显式检查主网时运行 `yarn vault:e2e my-vault --chain 56`。不传 `--chain` 时，当前脚本选择 manifest 中第一个有可用测试 token 的受支持 binding，并不会自动验收所有链。每次运行写到同一个 `dist/e2e/my-vault/qa-report.json`；多链验收请分别保存报告，打包引用的是当前报告。主网的真实写操作不是模拟交易。

在正式网站验收时，由 Workbench 操作方按[交付流程](./artifact-intake.md)校验、构建并发布新 ZIP，提供**普通 Vault UI** 的完整预览链接。核对链接里的网络、测试 CA 和产物版本。不要把 Mini App 的 `/mini-app` 链接当作本流程，也不要认为在链接里换个 CA 就完成了正式绑定。

实际交接顺序：

1. 开发者交付验证通过的 ZIP，并说明目标 chain `56`、真实主网工厂和本次使用的测试 CA。
2. Workbench 操作方发布该版本，复制普通 Vault UI（TaxInfo）预览链接。BNB 主网使用 `utter.cash/bnb`；BNB 测试网使用 `test.utter.cash/bnb-testnet`。
3. 用新链接验收，检查实际 CA、工厂、产物版本及风险/缺失数据状态。源码更新后重新打包发布，并复制新版本链接；不要沿用旧版本的 `artifactPath`。

主网公共 CA 链接应具有下面的结构。`<URL_ENCODED_ARTIFACT_PATH>` 是占位说明，须使用 Workbench 生成的已发布 `artifactId/版本` 路径并进行 URL 编码；最稳妥的方式是直接复制完整链接。

```text
https://utter.cash/bnb/0x286184b2660a2822671a33f24c4517f593947777/taxinfo?artifactPath=<URL_ENCODED_ARTIFACT_PATH>
```

正式生产策略由开发者说明意图、平台在 Workbench/registry 中确认：

| `caRestrictionMode` | 含义 |
| --- | --- |
| `none` | 工厂/Vault 模式下不额外限定 CA；测试 CA 仍用于包证明。 |
| `reserved` | 未来 CA 处于预留/审核状态，尚不能作为已验证绑定正式发布或路由。 |
| `verified` | ERC20 及工厂/Vault/token 关系验证通过后，平台才可应用正式 CA 限制。 |

不要把 `caRestrictionMode`、`productionRestrictedTokenAddresses`、`restrictTokenAddresses`、`caPolicy` 或全局 `tokenAddresses` 写进公开 manifest。测试包发布、带版本的预览链接、正式入口绑定是不同步骤。

## 6. 常见问题

| 现象 | 检查和处理 |
| --- | --- |
| AI 要求先发一个项目 token | 说明当前只做普通 Vault UI 界面测试，提供同链公共 CA；仍提供自己的真实工厂。业务联调另行准备项目部署。 |
| `manifest-binding/missing-test-token` | 将 CA 写入 `match.bindings[].tokenAddresses`，或创建时传 `--token`。仅改 URL 不够。 |
| `manifest-binding/invalid-test-token-suffix` | 当前包证明要求 `7777`/`8888` 后缀；普通税币 Vault UI 用本页 `7777` 地址。不要改写地址尾号凑后缀。 |
| `manifest-binding/invalid-erc20-token` | 查看 `tokenContract.detail`：确认 chainId、真实部署及 ERC20 可读性。若是 RPC 超时，修复连接再重跑；不是所有此类错误都说明 CA 无效。 |
| “代币不可用” / `manifest-binding-mismatch` | 查看宿主读取的实际 factory/Vault。若 CA 属于其他工厂，使用符合目标关系的项目 CA，或重新选择合适公共 CA；不要关闭匹配校验。 |
| 公共 CA 能展示页面，但读取/领取失败 | 它不等于项目 Vault。核对真实 Vault、ABI、token 关系、权限及测试资金；保留界面的不可用状态。 |
| 配了两条链，却只测了一条 | 使用 `--chain 97` / `--chain 56` 分别执行；区分本次报告覆盖的网络。 |
| CA 校验通过，但页面还不可用 | ERC20 校验只证明 token 合约可读，不保证 Portal 状态、绑定匹配或业务数据完整。查看宿主降级原因。 |
| `template-freshness/ahead` / `diverged` / `npm-outdated` | 这是模板来源/版本检查，不是 CA 错误。按[版本说明](./versioning.md)使用最新官方模板，保留项目源码；不要修改版本号或关闭校验来绕过。 |

## 给 AI 的最小需求描述

```text
我要开发普通税币 Vault UI，这一阶段只做 BNB 测试网界面预览与 E2E。
chainId: 97
factoryAddress: <我的真实 BNB 测试网工厂地址>
testTokenAddress: 0xf8ac72e7adefbce6ff22d9a9238512933e247777
测试 CA 来源：公共测试 token，不是我项目的生产 CA，也不证明项目 Vault 已部署。
当前不需要主网 binding；真实业务联调时再提供项目 CA、Vault 和 ABI。
请阅读 docs/vault-ui-test-ca.md，保留正常 ERC20/绑定/E2E 校验。
```

再补充 folder name、显示名称、ABI、读写动作、语言和阶段要求，按[入门指南](./from-zero-vault-ui.md)实施。需要正式发布时另外确认 `caRestrictionMode`，不要默认把公共 CA 加入生产限制。
