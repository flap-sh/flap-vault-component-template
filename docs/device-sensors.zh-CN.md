# Runtime 定位与运动感应

Vault UI 和 Mini App 共用 Runtime 设备服务。组件只调用 SDK；浏览器权限和传感器访问由宿主负责。此增量功能要求 `runtime-contract.json` 中有 `sdkFeatures.deviceSensors=1`；此前发布的稳定版 `0.1.39` 不包含本功能。

测试版 `0.1.40-next.1` 已发布到 npm `next`；正式 `latest` 仍为 `0.1.39`。测试宿主请固定安装该预发布版本，并同步对应 schema／policy；见[测试版与发布校验记录](releases/0.1.40-next.1.md)。

在 `manifest.json` 中只声明实际需要的能力：

```json
{ "deviceCapabilities": ["location", "motion", "orientation"] }
```

这个字段独立于现有 `capabilities`，不会放宽文件、依赖或原生浏览器 API 限制。不声明或使用空数组时，旧 Vault UI 和已有 Mini App 保持兼容；挂载组件不会触发权限弹窗或采集。

组件从 `@/src/sdk` 使用 `useGeolocation()`、`useDeviceMotion()`、`useDeviceOrientation()`；在明确的用户点击中直接调用返回值的 `request()`。Vault 可使用 `useFlapSdk().device`，独立 App 可使用 `useMiniAppSdk().device`。每个 channel 提供 `getSnapshot()`、`subscribe(listener)`、`request(options?)` 和 `stop()`；hooks 负责订阅清理。快照包含 `status`、`permission`、`data` 和 `mode`，模拟数据明确标记为 `mock`。

权限与数据可用性分别判断：只有 `active` 且有有效数据才能启用传感器交互。分别处理拒绝、不支持、非安全环境、页面策略限制、超时、无数据、未声明，以及未启用、申请中、暂停和取消。浏览器不能查询权限时保持 `unknown`，不能假设已经授权。

手机真机使用 HTTPS；局域网 `http://电脑IP` 不满足安全环境要求。系统、浏览器、网站和钱包内嵌环境可能分别限制访问。有 `requestPermission()` 时必须保持用户点击调用链，不要先等待网络或异步确认弹窗；定位有独立的授权流程，统一封装不代表只有一次授权。

定位是系统估算结果，检查精度和时间戳，处理大致位置、超时和不可用。运动字段可能为空，只使用有效有限数值。切后台或锁屏可能暂停更新，返回页面后不要把旧值当成新读数。

Runtime 统一技术状态和生命周期；组件负责业务替代操作，例如允许时手动选择地区、用按钮代替摇一摇、用拖动代替倾斜。替代输入要与真实传感器数据区分，失败时不能伪造成功读数。用户文案继续放在组件 `i18n.json`。

宿主可向 `VaultRuntimeProvider`、`MiniAppRuntimeProvider` 注入 `deviceSensors`；真实／模拟工厂只从 `@flapsdk/vault-runtime/host` 导出。组件不能创建 provider 或 adapter。预览模拟必须明确标识，只证明失败状态及降级逻辑；iPhone Safari、Android Chrome 和目标钱包仍需真机验证。

Workbench 校验声明、输出人工审查信息并检查 Runtime 特性。原生定位、权限、`DeviceMotionEvent`、`DeviceOrientationEvent`、Generic Sensor 构造器和直接运动事件监听继续禁止。同页运行的组件并未因此获得独立浏览器安全沙箱。

先用同一份提交绑定的私有 canary 验证两个宿主，再发布和部署支持版本，最后接收依赖新接口的组件。旧组件无需重打包。宿主应在执行新组件之前检查特性，避免旧宿主加载未知 hook 时崩溃。
