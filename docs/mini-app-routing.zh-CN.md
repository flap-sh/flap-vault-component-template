# Mini App 子路由

此增量能力已包含在已发布的 `0.1.40-next.3` 测试 Runtime 中，该版也修正地图源码包
元数据及核验；正式 `latest=0.1.39` 尚不包含。须与接收宿主匹配后使用，正式发布、
模板新鲜度和源码 ZIP 来源校验继续保留。
测试步骤见[开发者接入说明](device-map-integration.zh-CN.md)。

独立 Mini App v2 从 `@/src/sdk` 导入 `useMiniAppRouter()`，获得相对应用根目录的
`pathname`、只解码一次的不可变 `segments`、保留重复参数的 `search`，以及
`push(path)`、`replace(path)`、`back()`。例如 `/apps/demo/bnb/{ca}` 对应
`pathname=/bnb/{ca}`，`push('/orders/42?tab=history')` 仍留在同一应用内。
应用自行匹配路径、验证 chain/CA 等业务参数并提供未知页面状态；无需 manifest
路由 DSL，也不改变源码包格式。

导航目标必须以 `/` 开头并相对当前应用根目录。完整 URL、协议相对 URL、路径穿越、
编码分隔符、重复斜线、反斜杠、控制字符、无效路径转义和 hash 都会被拒绝。
返回操作只回退当前适配器拥有的应用历史；直接进入深链时回到应用首页，首页返回无操作。
URL 中的 CA 不会授予任意合约读写权限，原有钱包链、固定合约及 resolver 审核规则继续生效。

宿主将可选 `router` 传给 `MiniAppRuntimeProvider`。未使用新 hook 的旧应用继续兼容；
新 hook 在未启用路由的宿主中明确报错。能力标记为 `MINI_APP_ROUTING_VERSION=1`
以及 `runtime-contract.sdkFeatures.miniAppRouting=1`。

`@flapsdk/vault-runtime/host` 提供 `parseMiniAppPath`、
`createMiniAppMemoryRouter(initialPath='/')` 和
`createMiniAppBrowserRouter({basePath,window})`。浏览器适配器监听原生前进后退，
保留其他 history state，处理 Next 私有写入标记及宿主添加的语言参数；宿主另行导航后调用
`sync()`，卸载时调用 `dispose()`。离开应用后旧回调不能恢复此前应用。
Workbench 内嵌预览应使用 memory history，避免改变管理页面 URL。

artifact 加载器、Provider 和应用组件必须放在变化子路由上方的持久 layout 中；
不可按 pathname 设置 key 或重新加载产物。本地 `/{folderName}` 预览已采用此结构，
仅独立 Mini App 支持深路径；现有 Vault UI 和绑定 token 的旧 Mini App 保留原预览入口。
`routing-example` 展示首页、详情、未知页面、query 和跨导航保留的本地计数，文案含英中韩。

运行 `yarn test:mini-app-routing` 验证路径、内存历史、源码能力识别、浏览器直达/刷新、
push/replace、前进后退、状态保持、Next history 标记、语言参数及陈旧回调。
Workbench 根据有效 SDK import 检查已安装 Runtime 是否支持路由；运行时在调用
`useMiniAppRouter()` 时通过兼容层核对 SDK 路由版本和 export，hook 还要求宿主提供适配器。
先部署两端匹配的宿主，再接受依赖路由的应用。显式 next 源码包测试仅适用于独立 Mini App v2，
并保留官方 next 新鲜度、精确已发布 npm 版本/gitHead、E2E 和 ZIP 核验。
普通 `app:*` 继续使用 main/latest，测试时按[接入说明](device-map-integration.zh-CN.md)
使用显式 next 命令。私有 canary 只用于消费者测试，不能充当来源。完整 API 与接入细节见[英文文档](mini-app-routing.md)。
