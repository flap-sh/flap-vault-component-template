# Vault 动态地址声明（v1）

GT 的通用方案使用 factory binding 下的 `resolvedContracts`：声明 Vault 的地址查询方法、目标允许调用的方法、金额上限及固定校验条件。完整格式和示例见 [英文说明](resolved-contracts.md)。NULL 提币仍用 `sdk.withdrawNftAccount` 专用入口，不通过通用规则放开 execute。

查询方法必须已经存在于 Vault，至少接收一个参数且只返回一个 address；返回 tuple 的 NULL `item(id)` 不符合这个格式。因此通用能力不需要修改平台合约，但每个接入项目必须有符合要求的查询入口。

组件先 `await sdk.resolveContract("声明id", [参数])`，再把返回的原始 handle 传给 simulateContract/writeContract 的 contract 字段。禁止克隆、伪造、跨 Provider 复用或同时传 address。SDK 在发送前重新查询地址、校验代码/权限/收款人/余额，模拟后再次校验，并核对当前钱包和网络。命中失败条件时不发送交易。

限制包括：固定方法 selector、禁止 execute/批量执行/approve/管理方法及动态 bytes 入参；默认不允许附带原生币，开启 payable 必须声明单笔 maxValueWei；校验只支持 owner、ownerOf、recipient、balance 四种固定结构，不接受任意表达式。可选代码哈希及 EIP-6551 代理/实现哈希约束。代理形状不等于可信来源，所有方法的实际语义仍要对照源码。

Workbench 完整展示声明并强制进入人工审核；声明本身不是批准。生产宿主必须核对 artifact 的内容哈希、factory 绑定和链上合约来源及升级权限。通用能力不会消除 Vault 升级/RPC 信任，也无法阻止签名窗口或上链前发生的变化；关键权限必须由目标合约执行。

生产默认严格限制原始地址写入。模板及 Workbench 预览用 warn 模式提示旧动态地址路径，检查器输出迁移警告；发布前需改为 handle。旧 SDK 会拒绝加载声明了通用能力的 UI。Provider 仅从 host 入口导出，组件不可导入。发版前用同一份私有 canary 验证两个宿主，正式 SDK 发布后再同步精确依赖版本。

自动测试覆盖规则、handle、状态变化、检查器及真实 React Provider 接线（链客户端为模拟）。真实项目还需针对实际部署补 fork 验证；当前不批准任何 NULL 部署，也不修改 NULL 合约。
