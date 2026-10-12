# Vault 动态地址声明（v1）

GT 的通用方案使用 factory binding 下的 `resolvedContracts`：声明 Vault 的地址查询方法、目标允许调用的方法、金额上限及固定校验条件。完整格式和示例见 [英文说明](resolved-contracts.md)。`sdk.withdrawNftAccount` 专用入口继续提供 NULL 提币的部署锁定和资金转出结果验证；通用路径现允许经过人工审核、明确声明的 `execute`。

查询方法必须已经存在于 Vault，至少接收一个参数且只返回一个 address；返回 tuple 的 NULL `item(id)` 不符合这个格式。因此通用能力不需要修改平台合约，但每个接入项目必须有符合要求的查询入口。

组件先 `await sdk.resolveContract("声明id", [参数])`，再把返回的原始 handle 传给 simulateContract/writeContract 的 contract 字段。禁止克隆、伪造、跨 Provider 复用或同时传 address。SDK 在发送前重新查询地址、校验代码/权限/收款人/余额，模拟后再次校验，并核对当前钱包和网络。命中失败条件时不发送交易。

限制包括：固定方法 selector；仅 factory binding 的 `resolvedContracts[].allow` 中明确声明、经人工审核的字面方法名 `execute` 可以携带动态 bytes（包括 tuple/array），且必须通过真实 handle 调用。其他写方法仍禁止动态 bytes，executeCall、executeBatch、multicall、delegatecall、approve 和管理方法仍被禁止；默认不允许附带原生币，开启 payable 必须声明单笔 maxValueWei；校验只支持 owner、ownerOf、recipient、balance 四种固定结构，不接受任意表达式。可选代码哈希及 EIP-6551 代理/实现哈希约束。代理形状不等于可信来源，所有方法的实际语义仍要对照源码。

`execute` 的审核必须覆盖内部目标地址、calldata/selector、operation、金额/value 及合约自身权限。SDK 只校验外层 ABI 和声明的固定条件，不解析或限制内部 calldata；`maxValueWei` 只限制交易外层 value。原始地址请求仍保留 NULL 四参数 execute 拦截和 EIP-6551 目标限制。未声明的重载、伪造/过期 handle 或同时传 address 仍会失败。

Workbench 完整展示声明并强制进入人工审核；声明本身不是批准。生产宿主必须核对 artifact 的内容哈希、factory 绑定和链上合约来源及升级权限。通用能力不会消除 Vault 升级/RPC 信任，也无法阻止签名窗口或上链前发生的变化；关键权限必须由目标合约执行。

生产默认严格限制原始地址写入。模板及 Workbench 预览用 warn 模式提示旧动态地址路径，检查器输出迁移警告；发布前需改为 handle。旧 SDK 会拒绝加载声明了通用能力的 UI。Provider 仅从 host 入口导出，组件不可导入。`0.1.36` 已引入这个经审核的 execute 例外，`0.1.35` 不支持；接收此类 UI 前须同步两个宿主的兼容正式依赖版本。`0.1.37` IPFS 发版保持这一范围。后续运行时修改仍先用同一份私有 canary 验证两个宿主。无需新增 manifest 字段，schema、源包格式及 runtime contract 版本不变。

自动测试覆盖规则、handle、状态变化、检查器及真实 React Provider 接线（链客户端为模拟）。真实项目还需针对实际部署补 fork 验证；当前不批准任何 NULL 部署，也不修改 NULL 合约。
