# Flap Vault UI Template

[English](./README.md)

## 目录

- [从零到已验证 Zip](#从零到已验证-zip)
- [快速开始](#快速开始)
- [AI Agent 入口](#ai-agent-入口)
- [添加一个 Vault UI](#添加一个-vault-ui)
- [必需文件](#必需文件)
- [安全规则](#安全规则)
- [产物模型](#产物模型)
- [常用命令](#常用命令)
- [许可证](#许可证)

这个仓库是一个公开模板，用于构建受控的 Flap Vault UI 组件。

它不是自由网站容器。Vault UI 组件必须运行在 Flap 控制的运行时边界内：

- Flap SDK 负责链、钱包、合约读写、oracle、i18n、通知、格式化和交易错误处理。
- Flap 拥有的 taxinfo / feeinfo host context 负责 token 状态、tax 信息、VaultPortal 信息、部署绑定、fee mode 和渲染表面。
- Flap preview shell 提供真实 RainbowKit / wagmi 钱包连接、切链和 Flap 语言偏好行为。
- 打包后的 Vault artifact 只包含 host shell / frame 之下的 Vault 专属业务 UI；preview shell / header UI 不进入包内。
- manifest 只声明部署绑定意图、i18n 和不可避免的非 oracle endpoint。必要时，单个 binding 内可以携带 `tokenAddresses` 作为参考 CA allowlist。
- 默认避免外部 endpoint 和外部资源。如果必须使用非 oracle endpoint，需要在 manifest 中预声明为无用户名密码的 HTTPS URL 字符串或字符串数组，供 `vault:check` 快速校验；声明不代表一定通过审核。
- 提交前需要本地预览。
- 打包前需要运行 `vault:check`。
- 支持 AI agent 的契约、scaffold / register 命令和机器可读检查输出。
- 源包 zip 私下交给 Flap Artifact Workbench。
- 生产环境由 Flap 构建远端 artifact，并由 runtime deployment binding 决定是否加载。

## 从零到已验证 Zip

这是开发者在借助 AI 的同时仍然自己掌握 Vault 事实和本地测试的最短安全路径。

1. 准备真实输入：folder name、display name、`chainId`、factory 地址或单个 Vault 地址、可选 token 地址、最小 Vault ABI、reads、writes、approval spender、action stage、risk posture 和 preview 地址。
2. 将这些输入和本仓库上下文一起交给 AI Agent。如果 AI 不能直接读取仓库，可先生成可粘贴上下文包：

```bash
yarn --silent vault:ai-context action-gallery-example > vault-ai-context.md
```

3. Scaffold Vault 包。Factory-scoped 示例：

```bash
yarn vault:scaffold my-vault --name "My Vault UI" --chain 56 --factory 0x1000000000000000000000000000000000000001 --locales en,zh
```

单 Vault、无 factory 示例：

```bash
yarn vault:scaffold my-vault --name "My Vault UI" --chain 56 --vault 0x3000000000000000000000000000000000000003 --token 0x2000000000000000000000000000000000000002 --locales en,zh
```

4. 只编辑 `src/vaults/my-vault` 下的四个包文件：`Component.tsx`、`manifest.json`、`VaultABI.ts`、`i18n.json`。除非 Vault 需要不同组织方式，否则保留 scaffold 默认业务卡片结构。内置 example route 是行为参考，不是默认视觉风格。
5. 预览路由并测试真实 workflow：

```plain text
http://localhost:3000/my-vault?chainId=56&factoryAddress=0x...&tokenAddress=0x...&vaultAddress=0x...
```

6. 只有验证通过后再打包：

```bash
yarn vault:check my-vault
yarn vault:package my-vault
yarn vault:verify-package dist/my-vault.zip
```

最终交付物是 `yarn vault:package <folder-name>` 生成的 zip，以及命令输出中的 `sourcePackagePath`、`sha256` 等字段。只有 prompt、手工 zip 或未经测试的 AI 输出都不能进入 Flap Artifact Workbench。

更慢但更完整的分步指南见 [docs/from-zero-vault-ui.md](./docs/from-zero-vault-ui.md)。

## 快速开始

```bash
yarn
yarn dev
```

模板无需本地 env 文件即可运行。默认已包含：

- 钱包预览 Project ID
- BNB mainnet / testnet RPC fallback 列表
- Host presentation proxy target
- Chain explorer base URL

快速预览使用的共享 Reown / WalletConnect Project ID：

```plain text
0f5b4547ebf94f1fe8e524147e630fd9
```

如果钱包连接失败或限流，可在 `https://dashboard.reown.com` 创建自己的测试 Project ID，并通过 `.env.local` 覆盖：

```bash
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=your_reown_project_id_here
```

如果本地网络仍然需要自定义 RPC，可在 `.env.local` 中覆盖：

```bash
NEXT_PUBLIC_BSC_RPC_URL=https://your-bsc-rpc.example,https://your-bsc-rpc-backup.example
NEXT_PUBLIC_BSC_TESTNET_RPC_URL=https://your-bsc-testnet-rpc.example,https://your-bsc-testnet-rpc-backup.example
```

`.env.local` 只是可选覆盖配置，不要提交。

打开：

```plain text
http://localhost:3000/example
http://localhost:3000/dex-listed-example
http://localhost:3000/action-gallery-example
http://localhost:3000/community-buyback-example
http://localhost:3000/flapixel-example
```

内置示例：

- `example`：reward / oracle 模式，包含 approve、simulate、write、claim 和 refetch。
- `dex-listed-example`：使用 `context.host.marketPhase` 的 listed-only stage gate；DEX listing 前 action 可见但禁用，然后走 approve -> write。
- `action-gallery-example`：展示 internal-market、DEX-listed、both-stage 和 read-only action 状态的按钮画廊。
- `community-buyback-example`：绑定真实 BNB Community Approved Buyback token / factory 的 live CA Store 示例。
- `flapixel-example`：绑定真实 BNB FLAPixel NFT vault token / factory 的 live CA Store 示例。

注册新 Vault folder name 后，可通过以下路由预览：

```plain text
http://localhost:3000/{folder-name}
```

使用 header 语言选择器测试英文和中文。preview 会使用与 `flap.sh` 相同的偏好 key：localStorage 中的 `flap:language` 和 cookie 中的 `flap_language`。选中的语言会传入 Vault SDK，因此 `sdk.i18n.t(...)` 应当立即更新组件文案。

预检：

```bash
yarn vault:check example
yarn vault:check dex-listed-example
yarn vault:check action-gallery-example
yarn vault:check community-buyback-example
yarn vault:check flapixel-example
```

打包：

```bash
yarn vault:package example
yarn vault:verify-package dist/example.zip
yarn vault:package dex-listed-example
yarn vault:verify-package dist/dex-listed-example.zip
yarn vault:package action-gallery-example
yarn vault:verify-package dist/action-gallery-example.zip
yarn vault:package community-buyback-example
yarn vault:verify-package dist/community-buyback-example.zip
yarn vault:package flapixel-example
yarn vault:verify-package dist/flapixel-example.zip
```

`vault:package` 会先运行 `vault:check`，并在写 zip 前执行官方 git freshness 检查。只有 blocking issue 全部通过后，zip 才会写入 `dist/`。
命令输出会包含 `sourcePackagePath` 和 `sourcePackageAbsolutePath`，用于明确生成 zip 的位置。
只提交 `yarn vault:package <folder-name>` 生成的 zip。该脚本会写入 format-version `3` 的 `flap-vault-package.json` marker、npm latest `@flapsdk/vault-runtime` 的 `gitHead` provenance 和文件 hash；Flap Artifact Workbench 应拒绝没有 marker 或 hash 不匹配的手工 zip。
`dist/` 被 git 忽略。请在本地或 CI 生成 source zip，不要把生成包提交到模板仓库。
`yarn vault:verify-package <zip>` 从 Workbench 侧验证 marker、文件列表、metadata 和 SHA-256 hash。

## AI Agent 入口

Agent 应读取：

```plain text
agent-contract.json
AGENTS.md
docs/ai-agent.md
docs/agent-entrypoints.md
docs/ui-pattern-snippets.md
skills/flap-vault-ui-generator/SKILL.md
```

如果使用不能直接读取本仓库的网页 AI 工具，请使用 copy-pack 指南：

```plain text
docs/ai-copy-pack.md
```

快速路径：

```bash
yarn --silent vault:ai-context action-gallery-example > vault-ai-context.md
```

在让 ChatGPT、Claude 或其他 AI assistant 创建 Vault UI 之前，将生成的 Markdown 粘贴进去。如果不确定用哪个示例，先用 `action-gallery-example`；它在一个包里展示 internal-market、DEX-listed、both-stage 和 read-only action 状态。

常见 coding agent 的工具入口：

- Codex 和支持 AGENTS 的 agent：`AGENTS.md`
- Claude Code：`CLAUDE.md`
- Gemini CLI：`GEMINI.md`
- Windsurf：`.windsurfrules`
- GitHub Copilot：`.github/copilot-instructions.md`
- Cursor：`.cursor/rules/flap-vault-ui.mdc`
- Legacy Cursor fallback：`.cursorrules`

这些文件都是兼容性 wrapper。规范工作流仍以 `agent-contract.json`、`AGENTS.md`、`docs/ai-agent.md`、`docs/agent-entrypoints.md`、`docs/ui-pattern-snippets.md` 和 `skills/flap-vault-ui-generator/SKILL.md` 为准。

新 Vault 开始前，Agent 应使用结构化 intake 指南收集所有必需输入：

```plain text
docs/agent-intake-template.md
```

完整输入 schema 也以机器可读形式记录在 `agent-contract.json` 的 `requiredInputs` 中。

对于新 Vault UI，优先使用 scaffold 命令：

```bash
yarn vault:scaffold my-vault --name "My Vault UI" --chain 56 --factory 0x1000000000000000000000000000000000000001 --locales en,zh
```

无 factory 的 UI 可从一个 Vault 地址和可选 token 地址 scaffold：

```bash
yarn vault:scaffold my-vault --name "My Vault UI" --chain 56 --vault 0x3000000000000000000000000000000000000003 --token 0x2000000000000000000000000000000000000002 --locales en,zh
```

这会创建严格的四文件 Vault 包，生成稳定的 `artifactId`，并在 `src/vaults/index.ts` 注册 folder name。如果四个 Vault 文件已经由 manifest 先生成，则只注册本地 preview mapping：

```bash
yarn vault:register my-vault
```

Folder name 和 `artifactId` 的职责不同：

- Folder name 是源目录和 preview route，例如 `src/vaults/flap-nft-vault` 和 `/flap-nft-vault`。
- `artifactId` 是唯一 artifact identity，格式为 `vaultui_<folder-name>_<ULID>`。
- `match` 保留在 `manifest.json` 中作为预期部署绑定输入。它不是本地 route，也不会让 package 自动发布。

Folder name 必须是严格 lowercase kebab-case：3-64 个字符，字母和数字由单个 hyphen 分隔。不要使用空格、下划线、大写字母、开头/结尾 hyphen 或嵌套目录。

`yarn vault:check <folder-name>` 会输出包含 `ok`、`summary`、`agent.verdict`、`agent.nextActions` 和 `issues` 的 JSON。任何 blocking issue 都表示工作未完成。
所有 Vault CLI 失败也都是 JSON。读取 `code`、`fixHint` 和 `agent.nextActions`，修复后再重跑命令。
为保持 UI 风格一致，请使用 `docs/ui-pattern-snippets.md` 作为公开安全的 layout、action panel、read/write flow 和 empty/error state 参考。它只包含脱敏模式，不包含 Flap 私有源码。
带 action 的每个 custom Vault UI 都必须决定 action 在 internal-market、DEX-listed、both 或 read-only 阶段是否可用。用 `context.host?.marketPhase` 和 `isActionAvailableForPhase(...)` 做 runtime gating，并在不可用时显示清晰 disabled state，而不是静默隐藏 action。
错误网络 gating 与 market phase gating 是两件事。使用 `sdk.wallet.isWrongNetwork` 检测，保持 action 可见，并在写入前提示 `sdk.wallet.switchChain()` 或显示清晰的切链状态。
Token media 使用 host context：`context.tokenImageUrl`、`context.tokenName` 和 `context.tokenSymbol`。Vault component 不应直接调用私有 token metadata API。
同样的 shell boundary 也适用于布局：token breadcrumb / header、close control、page frame 和标准 shared summary / header 属于 host surface，不属于打包的 Vault component。

如果修改 checker 或 Agent contract，请运行 `yarn vault:check:selftest` 作为重要 blocking rule 的回归保护。
完整 code-base 验证使用 `yarn ci`。CI 包含 lint、typecheck、checker selftest、内置示例 check/package/verify、Next build、shared runtime pack/verify、neutral preview smoke test 和 live real-example smoke test。

## 添加一个 Vault UI

推荐方式（单链）：

```bash
yarn vault:scaffold my-vault --name "My Vault UI" --chain 56 --factory 0x1000000000000000000000000000000000000001
```

Mainnet + testnet 可为每个目标重复 `--chain` / `--factory`：

```bash
yarn vault:scaffold my-vault --name "My Vault UI" \
  --chain 56 --factory 0xMainnetFactory \
  --chain 97 --factory 0xTestnetFactory
```

No-factory 模式可为每个目标重复 `--chain` / `--vault`。`--token` 可选，但提供时必须一一配对：

```bash
yarn vault:scaffold my-vault --name "My Vault UI" \
  --chain 56 --vault 0xMainnetVault --token 0xMainnetToken \
  --chain 97 --vault 0xTestnetVault --token 0xTestnetToken
```

手工包形状：

```plain text
src/vaults/{folder-name}/
  Component.tsx
  manifest.json
  VaultABI.ts
  i18n.json
```

如果 package 不是由 `vault:scaffold` 创建的，请运行：

```bash
yarn vault:register <folder-name>
```

register 命令会更新 `src/vaults/index.ts`，使 `/{folder-name}` 能在本地 preview 中加载组件。

本地 preview 使用真实钱包 / runtime path 和安全默认 preview 地址。必要时可通过 preview URL 传入真实地址，例如 `?chainId=56&factoryAddress=0x...&tokenAddress=0x...&vaultAddress=0x...`，或 no-factory 的 `?chainId=56&vaultAddress=0x...&tokenAddress=0x...`。
Binding resolution 是保守的：factory 模式优先精确匹配 `chainId + factoryAddress`；no-factory 模式优先精确匹配 `chainId + vaultAddress` 和可选 `tokenAddress`。只有在不歧义时才会使用 partial hint；没有 runtime hint 时才使用第一个 manifest binding。

不要向模板添加辅助文件。当前文件集固定。不要在 `src/vaults/{folder-name}` 下添加 `helpers`、嵌套组件、目录、assets、docs 或其他文件。

参考示例：

- `example`：reward / oracle 参考。
- `dex-listed-example`：DEX-listed stage gate 和 approve / write 参考。
- `action-gallery-example`：多按钮 action-state 参考。
- `community-buyback-example`：live governance / buyback 参考。
- `flapixel-example`：live NFT vault 参考。

当前产品需求和实现状态记录在 [docs/prd.md](./docs/prd.md)。
Agent contract、manifest schema 和 source package format 的版本规则记录在 [docs/versioning.md](./docs/versioning.md)。

## 必需文件

Vault folder 是严格 source package 边界，只能包含：

- `Component.tsx`：受控 React Vault UI component。
- `manifest.json`：必需 `artifactId`；必需 `match.bindings`，即显式 factory-scoped `{chainId, factoryAddress}` 或 no-factory `{chainId, vaultAddresses: [vaultAddress]}` target；可选 per-binding `tokenAddresses`；可选非 oracle `endpoints`；可选 reviewed `externalFrames`；以及 `i18n`。
- `VaultABI.ts`：只包含最小 Vault ABI fragment。标准 ERC20 ABI 由 `@/src/sdk` 导出；只有自定义非标准 token 方法才放到这里。
- `i18n.json`：manifest `i18n` 声明的 locale dictionary；manifest locale string 至少两个字符。

`src/vaults/{folder-name}` 下的任何其他文件或子目录都会触发 blocking check issue。

## 安全规则

默认 blocking：

- `window.ethereum.request`
- `eval` / `new Function`
- raw iframe UI 或 iframe `srcDoc`；单个 reviewed display-only chart frame 必须使用 `manifest.externalFrames` 加一个 `ReviewedFrame`
- script injection，包括 `document.write` 和 `document.writeln`
- runtime remote imports
- dynamic imports 和 CommonJS `require(...)`
- 未声明的外部 URL、endpoint、external frame 或外部资源
- dynamic、relative、HTTP、credentialed、aliased、destructured 或 computed browser-global `fetch(...)` target
- browser storage、navigation、worker、cross-context messaging（包括 postMessage listener）和 permission API
- `XMLHttpRequest`、`WebSocket`、`EventSource`、`navigator.sendBeacon`、`new Image()` 等直接 browser network / media API
- 任意站外导航或 phishing-sensitive 外部跳转
- 隐藏交易 target
- 未批准 dependency
- shared runtime surface 之外的额外 SDK package 或 SDK-like wrapper
- manifest 声明但缺失的 locale
- 任一 manifest locale 缺失 i18n key
- Vault source 中的远端图片
- 合约 read / write、event watch、log / filter call 或 gas estimate 指向 Vault / token / NFT / factory / declaration 边界之外的 router、bridge、aggregator 或无关合约
- 用 type field 绑定，而不是 registry 控制的 chain / factory 或 chain / Vault target
- Vault package 内的额外文件、目录或 symlink
- 除 `./VaultABI` 之外的相对 import

如果可通过 Flap SDK 或链上读取实现，就应避免外部 endpoint、oracle usage、第三方图片、额外固定合约 target 和其他外部资源。非 oracle endpoint 声明在 `manifest.json`；固定的非 token / 非 Vault / 非 factory 合约 target 声明在 `match.bindings[].externalContracts`；oracle config、media policy、actions、fallback、artifact id 和 version 属于 Flap Artifact Workbench / runtime。

Component-owned navigation 应只停留在当前链 explorer。如果必须直接 fetch NFT metadata base URL 或另一个 reviewed non-oracle host，请在 `manifest.endpoints` 中声明该 base URL；不要把 endpoint declaration 当作站外用户导航的后门。Internal Oracle endpoint 通常应留在 `sdk.readOracle(...)` 和 host / runtime provisioning 后面，而不是把 raw URL literal 放入 Vault source。

## 产物模型

这个模板生成的 zip 不会被 `flap.sh` 直接加载。

生产流程：

```plain text
private zip
  -> Flap Artifact Workbench validation
  -> Flap build
  -> component.mjs + manifest + i18n + metadata
  -> Flap static artifact storage
  -> Flap deployment binding
  -> flap.sh runtime loader
```

Registry 决定可用性。文件存在于 Blob / R2 / S3 并不代表 UI 可以渲染。

Package zip 是给 Flap Artifact Workbench 的 source package。上传到 Blob / R2 / S3 的 runtime artifact 是 Flap 构建出来、浏览器可执行的 `component.mjs`。MVP runtime artifact 默认应保持可读；除非 Flap 启用带 source map 和 source backup 的 release optimization，否则不要默认 minify。

Source zip 必须由 `yarn vault:package <folder-name>` 生成。该脚本运行 `vault:check`，写入 `flap-vault-package.json`，并记录 package kind、format version、source file hash、schema hash 和 check summary。Workbench validation 应要求这个 marker，并拒绝无 marker 或 hash 不匹配的手工 zip。
使用 `yarn vault:verify-package <zip>` 在本地执行同一套 package acceptance shape，再交给 Flap Artifact Workbench。

Flap Artifact Workbench 使用 `artifactId` 作为稳定 source-package artifact identity。Folder name 仍然只是本地 source folder 和 preview route。Runtime build version 和 storage path 属于 Workbench 关心的范围；开发者仍然不在 `manifest.json` 中声明 runtime version。

一个 shared artifact 可以声明一个或多个 factory-scoped `chainId + factoryAddress` binding，一个或多个 no-factory `chainId + vaultAddress` binding，或一个或多个 no-factory `chainId + tokenAddress` binding。No-factory 模式下，一个 binding 可以是 Vault-scoped（恰好一个 Vault 地址）、token-scoped（一个或多个 token 地址），或 Vault + token scoped（一个 Vault 地址加多个 token 地址）。Token CA list 只能声明为 `match.bindings[].tokenAddresses`。

Vault source 应通过公开 alias 导入 shared runtime surface：

```ts
import { erc20Abi, useFlapSdk } from "@/src/sdk";
import { Button } from "@/src/ui";
```

普通 ERC20 `balanceOf`、`allowance`、`approve`、`decimals`、`symbol`、`transfer` 和 `transferFrom` flow 使用 `@/src/sdk` 导出的 `erc20Abi` 或 `standardErc20Abi`。不要把标准 ERC20 ABI 复制进 Vault package。
ABI 方法如果有多个返回值，`sdk.readContract` 要按 tuple array 类型读取，再把下标映射成 UI state 对象。例如 `returns (uint256 currentPool, uint256 totalReceived)` 应使用 `readonly [currentPool: bigint, totalReceived: bigint]`，不要写成 object interface。只有 ABI 把 Solidity `tuple` / struct 声明为一个带 `components` 的单独 output 时，才可以按对象读取。
除 shared `@/src/sdk` 和 `@/src/ui` surface 外，不要引入任何额外 SDK package 或 SDK-like wrapper。

Host 会在 custom Vault component 加载前解析 taxinfo / feeinfo preflight data。使用 `context.host` 或 SDK helper `readTaxVaultHostContext(context.host)` 获取 token info、parsed tax info、VaultPortal info、fee mode、render surface、market phase 和 registry-selected vault type。Custom Vault UI 在这个模板中面向 tax-token path，因此真正重要的 live runtime state 是 token lifecycle（`marketPhase` / `isListed`）和 token metadata。使用 public SDK / host，不要添加 ad hoc props。

合约交互应停留在 `context.vaultAddress`、`context.tokenAddress`、`context.factoryAddress`、runtime payment / quote / dividend token 地址、从 Vault reads 派生的 token / NFT 地址，或 `match.bindings[].externalContracts` 声明的固定 target 上。不要让 Vault package 调用无关 router、bridge、aggregator 或其他 app contract。

本地相对 import surface 固定：`Component.tsx` 只能 import `./VaultABI`。不要 import `./helpers`、`../VaultABI`、嵌套组件、本地 assets 或其他本地文件。使用 `@/src/sdk` 和 `@/src/ui` 等公开 alias 访问 shared runtime surface。

Shared runtime package 可通过以下命令在 `dist/vault-runtime` 下构建：

```bash
yarn runtime:package
yarn runtime:verify-package
```

Vault source 仍应按 `@/src/sdk` 和 `@/src/ui` 编写；runtime package 用于让 Workbench 和 `flap.sh` 在底层收敛到同一个 shared runtime surface。

Oracle provisioning 也属于 shared runtime surface：Vault source 只调用 `sdk.readOracle(...)`，reviewed oracle id 由 host/runtime 注入。模板本地同源 proxy 可通过 `FLAP_RUNTIME_ORACLE_REGISTRY` 配置，每个 id 只能声明无密钥 `endpoint`、`allowedParams` 和 `fixedParams`；`fixedParams` 用于把 `feed` 这类服务端固定 query 绑定到 oracle id，UI 传参不能覆盖。Flap runtime 不持有或转发上游 `Authorization` token；如果上游服务需要鉴权，项目方应先提供自己的无密钥 HTTPS 中转服务。

## 常用命令

```bash
yarn dev
yarn build
yarn lint
yarn typecheck
yarn vault:scaffold example-copy --name "Example Copy UI" --chain 56 --factory 0x1000000000000000000000000000000000000001 --dry-run
yarn vault:check example
yarn vault:check action-gallery-example
yarn vault:check:selftest
yarn vault:package example
yarn vault:verify-package dist/example.zip
yarn runtime:package
yarn runtime:verify-package
yarn preview:smoke
yarn preview:smoke:real
yarn ci
```

`yarn vault:package <folder-name>` 会输出生成的 source zip 路径 `sourcePackagePath` / `sourcePackageAbsolutePath`、package marker `packageMarkerFile` 和 npm runtime provenance `runtimePackageGitHead`。

## 许可证

本模板使用 MIT License。见 [LICENSE](./LICENSE)。
