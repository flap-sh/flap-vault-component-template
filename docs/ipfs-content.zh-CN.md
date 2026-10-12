# 动态 IPFS 文本和图片

使用 `sdk.readIpfsText(cid, path?)` 读取 UTF-8 文本或 JSON，返回值是字符串。
仅当业务格式确实为 JSON 时才调用 `JSON.parse`。CID 可以来自 FSI、合约状态，
或现有 `sdk.uploadText` / `sdk.uploadImage` 的上传结果，不需要写死在源码中。

`<IpfsText cid={textCid} fallback={i18n.t("loading")} />` 只显示转义后的纯文本，
保留换行，不执行 HTML，也不自动解释 Markdown。可通过
`data-flap-ipfs-text-state` 获取 `loading`、`ready`、`error` 状态。
自定义错误提示或解析 JSON 时使用 SDK 方法。图片使用
`<IpfsImage cid={imageCid} alt={i18n.t("imageAlt")} />`。
所有可见文案仍须覆盖 manifest 声明的语言；普通 Vault UI 的风险提示保持在内容之前。

运行时只接收裸 CID 和安全相对路径，网关固定由平台控制。文本请求不带 cookie
或 referrer，不跟随重定向，8 秒超时，UTF-8 内容不超过 256 KiB。
拒绝 HTML、非法 UTF-8、其他字符集和二进制控制字符。每个 provider 最多 6 个
并发、128 个待完成请求，并去重和缓存最多 64 份不可变内容。列表和图片墙需要分页。

动态图片 CID 和文本读取会输出 `manual-review/ipfs-content`，保留来源表达式供人工审查。
不增加 manifest 字段；FSI 请求仍需单独声明并审查其 endpoint。
裸远程 URL、调用方自选网关、`src` / `srcSet`、属性展开和 HTML 注入继续阻止。
静态图片目录 CID 下的动态路径仍需要静态 `validationPath`；动态 CID/路径组合
在运行时校验。`IpfsBackground` 仍只接受静态 CID；NFT 的 tokenURI 图片继续用
`NftMetadataImage`。

0.1.36 不包含此文本 API/组件。正式使用前须合并并发布新 SDK，再升级 Workbench
和主站。合并前只用受保护、不可发布的 canary 包验证。
完整示例和边界见 [英文说明](ipfs-content.md)。
