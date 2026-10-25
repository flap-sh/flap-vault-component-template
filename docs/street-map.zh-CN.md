# 共享街道地图

`@/src/ui` 的 `FlapStreetMap` 将地图渲染统一交给共享 Runtime。已发布的 **`0.1.40-next.4` 测试版**在既有地图和传感器上新增下面的点位展示接口，公开注册表身份及归档字节已核验，见 [next.4 发布记录](releases/0.1.40-next.4.zh-CN.md)。接入时固定精确版本，提交新源码包前确认接收端已配套升级。 已发布的 next.3 仅有基础地图；正式 `0.1.39` 没有地图导出。参见[开发者接入说明](device-map-integration.zh-CN.md)。

在原 manifest 合并 `"mapCapabilities": ["street-map-v1"]`。声明名称及既有源码包格式不变；它独立于 `deviceCapabilities` 和 3D `capabilities`，不开放原始 MapLibre、地图 URL／样式／Worker、网络、HTML 弹窗、存储或权限 API。既有 Vault UI、旧小程序和基础地图产物保持兼容；原 Vault 绑定、风险状态及业务操作仍须保留。

[CATCH 完整示例](examples/street-map/Component.tsx)、[英中韩翻译](examples/street-map/i18n.json)和 [manifest 片段](examples/street-map/manifest.fragment.json)展示全部新增能力，合并到已有合规源码目录即可。定位按钮另需 `deviceCapabilities:["location"]`。示例只含演示数据，不执行领取写入。

## 点位字段与原数据适配

原 `{id, lat, lng, title}` 和 `onSelectPoint(id)` 继续有效；新增字段全部可选：

```ts
interface FlapStreetMapPoint {
  id: string;
  lat: number;
  lng: number;
  title: string;
  symbol?: string;
  rarity?: "common" | "rare" | "epic" | "legendary";
  place?: string;
  city?: string;
  amount?: string | number;
  expiresAt?: number;
  respawnAt?: number;
  kind?: "store" | "event";
}
```

CATCH 原数据没有 `title` 时，用 `place` 或本地化兜底文案补齐。后端可空的 `expiresAt`／`respawnAt` 统一转成 `undefined`，不能传 `null`。两者均为 **Unix epoch 毫秒时间戳**，不是秒或剩余时长；确认后端字段为秒时，显式乘 `1000`。省略 `expiresAt` 表示没有期限，`0` 表示已过期；`respawnAt > now` 表示冷却中。已过期的点即使冷却结束也保持失效样式。这些时间和客户端时钟仅参与展示。`amount` 只作文本展示，不参与计算或领取授权；大数／高精度数量建议传字符串。

最多 2,000 个点；ID 必须非空、唯一且不超过 128 字符，必填 title 最多 256 字符。坐标须为有限数字，经度 ±180、纬度 ±85.051129。可选 symbol／place／city 分别最多 32／160／80 字符；可选文本不接受 ASCII 控制字符。amount 字符串最多 128 字符，数字须为非负有限值且不超过 `Number.MAX_SAFE_INTEGER`。时间戳须为 `0..8640000000000000` 内的安全整数。非法输入在加载引擎前进入 `unavailable/invalid-input`。

## 展示属性

| 属性 | 行为 |
| --- | --- |
| `points`、`center`、`zoom`、`userLocation` | 点位与视口；zoom 限制为 3–18。更新 userLocation 仅更新位置点和范围圈，不强制移动视口。 |
| `rarityColors` | 可选的四级稀有度部分调色板；每项只接受六位十六进制颜色，如 `#22c55e`，不接受短 hex、CSS 色名、表达式或 URL。 |
| `cityClusters` | 默认 `true`。zoom **≤7.2** 时，按去除首尾空格的 city 聚合普通门店，显示城市名与总点数；点击飞到城市中心、zoom 12。zoom >7.2 后改为单点。无城市门店继续显示；活动不参与城市计数。 |
| `showPointLabels` | 默认 `true`。门店在 zoom **>10.5** 时显示 `symbol · place`；不足时依次回退 place、symbol、title。 |
| `showEventCountdowns` | 默认 `true`。`kind:"event"` 走独立活动图层和标签，设置 expiresAt 时追加倒计时。单有 `rarity:"legendary"` 仍是普通门店，不会变成活动。 |
| `claimRadiusMeters` | 以 userLocation 为圆心的展示范围，单位为**米**，有限数字 `0..100000`；省略或 0 不画圈，不能用作领取范围证明。 |
| `selectedPointId`、`onSelectionChange` | 受控选中和完整原点位回调，清理时回调 `null`。不传 selectedPointId 使用内部状态；显式传 null 清空受控选择。 |
| `renderPointDetails(point, context)` | 项目提供的本地化 React 详情内容，放入地图详情槽，不接受 HTML 字符串弹窗。 |
| `showNavigation`、`showScale` | 两者默认均为 `false`，显式开启缩放／朝北按钮和米制比例尺。 |
| `controlLabels` | 本地化 zoomIn、zoomOut、resetBearing、closeDetails，各为不超过 128 字符的非空文本；缺省为英文。 |
| `onSelectPoint`、`onStateChange`、`fallback`、`className` | 保留原回调和列表降级，外容器最低 400px，不得隐藏／遮住署名。 |

默认颜色：普通绿 `#22c55e`、稀有蓝 `#3b82f6`、史诗紫 `#a855f7`、传奇金 `#fbbf24`。冷却或过期点变灰并去掉光晕，选中点有描边。城市数量包括冷却／过期门店；业务需要排除时，先过滤传入数据。用户位置为呼吸点，遵守减少动态效果设置；地图自身不申请 GPS。

## 选中与业务详情

```tsx
import { FlapStreetMap, STREET_MAP_PRESENTATION_V1 } from "@/src/ui";

// selected 是 string | null；points 和 renderDetails 来自项目业务。
<FlapStreetMap
  points={points}
  selectedPointId={selected}
  onSelectionChange={point => setSelected(point?.id ?? null)}
  renderPointDetails={renderDetails}
  claimRadiusMeters={200}
  showNavigation
  showScale
/>;
```

增强产物使用不可变的 `STREET_MAP_PRESENTATION_V1` UI 导出作为能力 sentinel，完整示例展示了实际引用。受控模式必须接收点位及 `null` 回调并更新父状态；当前点从 points 删除时地图会请求清空，切换业务视图或离开页面时也应清理选中。详情槽接收原始点位（包括 amount），以及：

| context 字段 | 含义 |
| --- | --- |
| `nowMs` | 当前展示时钟，epoch 毫秒。 |
| `coolingDown`、`expired` | 冷却和过期状态；可能同时为 true。 |
| `cooldownRemainingMs` | 距 respawnAt 的非负毫秒；省略或已结束为 0。 |
| `eventRemainingMs` | 距 expiresAt 的非负毫秒；省略为 null，普通门店也可使用。 |
| `distanceMeters` | 用户位置到点位的大圆距离估算，缺少位置时为 null。 |
| `claimRadiusMeters` | 传入的展示半径，省略为 null。 |
| `withinDisplayRadius` | 只比较几何距离与半径；没有位置／半径时为 null。 |
| `close()` | 清除内部选中，或调用受控的 onSelectionChange(null)。 |

完整示例展示代币、稀有度、数量、地点、城市、坐标、距离、范围估算、冷却、过期、活动倒计时和时钟。CATCH 的完整领取资格、库存等业务状态可从 `renderPointDetails` 的项目闭包读取。**客户端定位、距离、范围及时间不能授予领取资格或执行领取次数限制。** 真实资格、数量和写入继续走现有合约／可信服务；地图不提供持久领取记录或设备身份。

## 权限与降级

定位使用 `useGeolocation()`，在明确的用户点击中直接调用 request。仅在 active 且有数据时传坐标，同时检查精度／采样时间，并标明 `mode:"mock"`。拒绝权限时保留列表；用户要求定位到当前位置时再显式更新 center。持续跟踪需要显式 watch 请求与停止控制，详见[设备服务](device-sensors.zh-CN.md)。

地图状态为 `{status:"loading"|"ready"|"unavailable", reason?}`；原因包括 not-declared、invalid-input、unsupported、load-failed、timeout、context-lost。应提供本地化的门店列表／手动操作降级；默认是按 title 选择点位的按钮列表，自定义列表可更新受控选择，地图失败后仍能使用同一详情槽。WebGL2／Worker 不兼容、资源失败、上下文丢失或 15 秒启动超时会释放地图并降级，需要重试时有意重新挂载。点位、定位及回调使用最新 props；倒计时在后台暂停，卸载时清理。

## 宿主资源与能力校验

基础地图需要两个接收宿主均提供 `uiFeatures.streetMap=1` 和 FlapStreetMap 导出；增强产物另需 **`uiFeatures.streetMapPresentation=1` 与 `STREET_MAP_PRESENTATION_V1=1`**。Workbench 记录真实 required UI export，旧宿主会在导入前拒绝不支持的增强产物。不要手改 marker 或 metadata；接收端须先部署匹配 Runtime／checker，npm 发布不等于宿主已升级。`street-map-v1` 声明和既有源码包格式不变。

Runtime 按需打包精确的 `maplibre-gl@6.15.0`，不用 CDN 引擎。将包内官方未修改的 Worker 和许可证复制到宿主 `public/runtime-map/`；固定同源路径 `/runtime-map/maplibre-6.15.0-worker.mjs` 必须返回 JavaScript，不能跳转到 HTML 或其他版本。SHA256：

```text
1c69066368331aae63967ed24a9affcf962cf55fcc6d8f532a8b040f736dbcfa
```

构建与验证检查 contract、字节、UI 导出及 tarball 资源；Node 导入 UI 时不执行浏览器地图引擎。卸载会清理 map 的 canvas、订阅、ResizeObserver 和时钟；MapLibre 仍保留页面级共享池用于后续地图，这里上限两个 Worker，不承诺 CPU／GPU 硬隔离。

仅接受固定 OpenFreeMap 深色样式、TileJSON、瓦片、字体与 sprite；在引擎相应加载路径支持的范围内使用 `credentials:"omit"`／`referrerPolicy:"no-referrer"`。保留固定署名。服务方可看到客户端 IP 与地图区域；重定向和服务变化仍受浏览器／提供方控制，没有可用性保证，非预期资源路径关闭地图并降级。本次增强不扩大资源策略。仍须在目标手机和钱包 WebView 实测，桌面检查不能证明硬件兼容。
