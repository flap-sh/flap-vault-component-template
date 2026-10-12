# 共用 CopyButton

Vault UI 与 Mini App v2 使用同一个由宿主管理的复制组件，不需要连接钱包或选择链。

```tsx
import { CopyButton } from "@/src/ui";

<CopyButton value={tokenAddress} />
<CopyButton value={tokenAddress} label={i18n.t("copyAddress")} />
```

`value` 按原样复制；空白值、包含 NUL 的文本及超过 4096 字符的值会禁用按钮。`label` 是可选的本地化可见文案，省略时显示图标按钮；另外支持 `disabled`、`className`。不提供自定义事件、ref、children 或可编程剪贴板方法。请在按钮旁显示清晰可读的完整地址。

鼠标、触摸、键盘产生的真实点击才会复制，程序模拟点击无效。运行时负责剪贴板写入、失败时的文本选区回退、焦点与选区恢复；全屏时回退元素放在全屏容器内。复制成功后才提示成功，等待期间不会重复执行，失败时提示手动选中文本复制。不会开放读取剪贴板。

内置中英韩文案及无障碍反馈跟随宿主语言，可通过 i18n.json 中的 `flap.copy.copy`、`flap.copy.copying`、`flap.copy.copied`、`flap.copy.failed` 覆盖。组件复用现有 Vault/App provider，无需增加登录、链上下文或额外 provider。原始 `navigator.clipboard`、`ClipboardItem`、`document.execCommand("copy")` 仍禁止在开发者组件中调用，也无需声明 endpoints 或额外权限。

## 发布与接入

`@flapsdk/vault-runtime@0.1.38-next.0` 已发布到 npm `next`（2026-10-12），npm `gitHead` 为 `7cc5b3c462a889574186d4320da0618519c1c8c9`，包含 Vault UI 与 Mini App v2 共用的 CopyButton。主站和测试 Workbench 的依赖与锁文件固定为这个精确版本，Workbench 校验契约也记录同一来源提交。接收开发者重新打包的应用前，仍需部署这两个更新后的消费项目。旧的已构建应用继续兼容。Workbench 会在新产物 metadata 中记录 `requiredUiExports`，旧宿主缺少组件时会在渲染前报告版本问题。正式 `latest` 保持 `0.1.37`，此次没有更改正式通道。

模板执行 `yarn test:copy-button`、`yarn test:copy-button-policy`、校验回归及运行时包验证；两个消费项目也提供 `yarn test:copy-button` 检查所装 SDK 的实际导出和 provider。私有 canary 仅供本地联调，不能用作上传源码包的 npm 来源证明。发布后，开发者更新官方模板和 SDK，再重新执行检查、E2E 与打包。
