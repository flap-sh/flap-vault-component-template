# 共享街道地图

现有 Vault UI 和独立小程序可从 `@/src/ui` 导入薄组件 `FlapStreetMap`。已发布的 `0.1.40-next.2` 测试 Runtime 包含该能力，当前固定的正式 Runtime `0.1.39` 没有此导出；安装前请查看[发布状态](releases/0.1.40-next.2.zh-CN.md)。两个接收宿主都必须先具备 `uiFeatures.streetMap=1` 和 `FlapStreetMap` 导出，才能接收依赖地图的新包。旧包保持兼容。

在原 manifest 中合并可选声明：

```json
{ "mapCapabilities": ["street-map-v1"] }
```

它独立于 3D 的 `capabilities` 和传感器的 `deviceCapabilities`，不会开放开发者直接导入 MapLibre、请求网络、创建 Worker、指定地图 URL 或使用浏览器权限 API。继续使用现有审核和 `component.mjs` 流程；没有新增沙箱、代理、服务、部署或存储能力。

把[完整示例](../examples/street-map/Component.tsx)复制到已有组件目录，合并[中英翻译](../examples/street-map/i18n.json)和 [manifest 片段](../examples/street-map/manifest.fragment.json)。可选的定位按钮另需 `deviceCapabilities:["location"]`。业务文案仍放入组件自己的 `i18n.json`，原 Runtime provider 提供声明和翻译。

```tsx
import { FlapStreetMap, type FlapStreetMapPoint } from "@/src/ui";

const points: FlapStreetMapPoint[] = [
  { id: "shop-1", lat: 31.2304, lng: 121.4737, title: t("map.shop") },
];
<FlapStreetMap
  points={points}
  center={{ lat: 31.2304, lng: 121.4737 }}
  zoom={12}
  userLocation={userLocation}
  onSelectPoint={selectShop}
  onStateChange={setMapState}
  fallback={shopList}
/>;
```

`points` 最多 2,000 条，ID 非空、唯一且不超过 128 字符，标题最多 256 字符；可选稀有度为 `common|rare|epic|legendary`。经度必须是 ±180 内的有限数字，纬度为 ±85.051129。非法输入直接进入 `unavailable/invalid-input`，不加载地图引擎。缩放限制为 3–18。传入 `center` 可控制视口；更新 `userLocation` 只更新定位点，不强制移动视口。默认列表将标题作为 React 文本渲染，没有 HTML 弹窗接口。`className` 可调整外容器，不能隐藏或覆盖地图署名。

状态为 `{status:"loading"|"ready"|"unavailable", reason?}`；不可用原因包括 `not-declared`、`invalid-input`、`unsupported`、`load-failed`、`timeout`、`context-lost`。请提供本地化的门店列表或手动选择降级，保证没有地图时仍可操作业务。默认降级是点位标题按钮列表。WebGL2/Worker 不兼容、资源错误、上下文丢失或启动超过 15 秒都会释放地图并显示降级。需要重试时有意重新挂载。卸载及 React StrictMode 重播会清理资源；点位、定位点和回调更新使用最新 props。MapLibre 6.15 会在页面内保留共享 Worker 池用于后续地图，这里上限为两个 Worker，可能保留到页面关闭；地图卸载会释放 canvas、地图订阅和 ResizeObserver，不强拆其缓存的全局 dispatcher，也不修改官方内部实现。`map.remove()` 清理地图实例，不承诺 CPU/GPU 硬隔离。地图挂载不会自动申请定位或采集位置。

定位继续使用原 `useGeolocation()`，在明确的用户点击中直接调用 `request()`。仅在 `status === "active"` 且有真实数据时传坐标，检查精度和时间，并区分估算位置、模拟数据。拒绝权限或定位失败时仍可使用列表；地图自身不会申请或推断定位。

## 宿主静态资源与包校验

Runtime 按需打包精确的 `maplibre-gl@6.15.0`，不从 CDN 加载脚本。包内提供官方未经修改的 `runtime-map/maplibre-6.15.0-worker.mjs` 和 `runtime-map/LICENSE.maplibre.txt`。宿主复制到 `public/runtime-map/`，以同源固定路径 `/runtime-map/maplibre-6.15.0-worker.mjs` 提供 Worker，不能重定向到 HTML 或其他版本。Worker SHA256：

```
1c69066368331aae63967ed24a9affcf962cf55fcc6d8f532a8b040f736dbcfa
```

`runtime-contract.json` 记录能力与 Worker 身份；构建和包验证检查字节、UI 导出及包内资源。Node 导入 UI 时不执行浏览器地图引擎。组件仅注入最小作用域 CSS；禁用远端署名 HTML，改为固定的 OpenFreeMap/OpenMapTiles/OpenStreetMap 安全链接。

地图直接请求固定 OpenFreeMap HTTPS 服务，逐一检查样式、TileJSON、矢量/栅格瓦片、字体与 sprite；在 MapLibre 相应加载路径支持的范围内传 `credentials:"omit"` 和 `referrerPolicy:"no-referrer"`。开发者不能传入 URL。这是受限地图适配器，不是浏览器网络隔离：重定向和第三方服务变化仍受浏览器及提供方控制。对方可以看到客户端 IP 与地图视口，没有可用性保证。提供方路径改变会关闭地图并降级，可能需要审核后的 Runtime 更新。请在实际支持的手机与钱包 WebView 上验证；桌面浏览器通过不等于真机兼容。
