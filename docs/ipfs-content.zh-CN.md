# 动态 IPFS 文本和图片

首个支持版本为 `0.1.37`；`0.1.36` 不包含此文本 API/组件。
发布顺序和宿主要求见 [发布及升级说明](releases/0.1.37.zh-CN.md)；源码版本号更新
不代表 npm 已发布。

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
或 referrer，不跟随重定向。获取并发槽位后，网络和响应体读取合计 8 秒超时；
排队时间另计。UTF-8 内容不超过 256 KiB。
拒绝 HTML、非法 UTF-8、其他字符集和二进制控制字符。每个 provider 最多 6 个
并发、128 个待完成请求，并去重和缓存最多 64 份不可变内容。列表和图片墙需要分页。

动态图片 CID 和文本读取会输出 `manual-review/ipfs-content`，保留来源表达式供人工审查。
不增加 manifest 字段；FSI 请求仍需单独声明并审查其 endpoint。
裸远程 URL、调用方自选网关、`src` / `srcSet`、属性展开和 HTML 注入继续阻止。
静态图片目录 CID 下的动态路径仍需要静态 `validationPath`；动态 CID/路径组合
在运行时校验。`IpfsBackground` 仍只接受静态 CID；NFT 的 tokenURI 图片继续用
`NftMetadataImage`。

正式使用前须发布 `0.1.37`，再升级 Workbench 和主站。Workbench 还须同步 IPFS
静态检查策略，不能只改 npm 依赖；其能力检查使用 `IPFS_CONTENT_VERSION === 1`
和 `runtime-contract.sdkFeatures.ipfsContent === 1`。旧运行时使用新文本或动态图片
来源时，受保护的 Workbench 检查器会报 `runtime-policy/ipfs-content-unavailable`。

读取通过浏览器访问固定平台网关，不新增宿主路由，也不需要 Pinata 凭据；网关仍须
能提供已 pin 的内容，并允许浏览器文本请求。上传继续使用已有宿主
`/api/runtime/upload` 服务及服务端配置。该服务配置好后，可以用 SDK 自行上传
测试文本/图片生成 CID，无须项目方提供业务数据。自动化浏览器测试使用模拟的
内容寻址上传服务，不代表已完成真实 Pinata 联调。
合并前只用受保护、不可发布的 canary 包验证。
完整示例和边界见 [英文说明](ipfs-content.md)。
