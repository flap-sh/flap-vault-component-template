# NULL 钱包受限提币

使用 `sdk.withdrawNftAccount({policyId,tokenId,amount})`，只能把已审核 NULL 钱包的主币 ERC20 转回当前持有人。不能填写收款人、目标、calldata、原生币 value 或 operation。NFT 编号从 1 开始。

manifest 声明仅是审核申请，宿主独立配置部署及字节码锁定信息；默认没有授权。VaultRuntimeProvider 仅从宿主入口导出，组件的命名空间导入保持兼容。

通用入口的旧 selector 检查只覆盖 NULL 的四参数 execute；其他调用的边界由运行时目标校验负责，不能把函数名检查当作安全保证。通用请求参数须为可复制的 ABI 数据。

提币结果分别是 withdrawn、withdrawn-sync-required、reverted、effect-unconfirmed。同步失败时不要再次提币；保留交易哈希，提供 Vault.sync。未确认资金转出时不得提示成功。

上线前必须核对真实部署并完成 fork 测试。完整规则见 [英文说明](./nft-account-withdrawal.md)。
