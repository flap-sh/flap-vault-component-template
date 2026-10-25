# GPS、运动感应与街道地图接入说明

设备权限、兼容检测、浏览器采集和地图引擎由共享 Runtime 处理；项目声明能力，调用 SDK，传入业务数据并实现降级。本文可交给 CATCH 开发者，完整可复制示例位于 [examples/street-map](../examples/street-map/Component.tsx)。

## 版本与接入范围

本文面向 **`@flapsdk/vault-runtime@0.1.40-next.4` 测试发布候选版**，包含 GPS／运动／方向、Mini App 子路由和本次 CATCH 地图展示增强：稀有度、冷却、城市聚合、文字、详情槽、独立活动点、呼吸定位和米制范围圈。**公开发布核验尚未完成，开始接入前须确认 [next.4 发布记录](releases/0.1.40-next.4.zh-CN.md)中的精确版本及来源。** 只使用 npm `next` 测试通道，不发布正式版本。

已发布的 next.3 仅提供基础地图与传感器，源码为 `4bf5f3bb111993cdb9167ba18e9ec225b351c79f`，并修正 next.2 的地图源码包元数据遗漏，见 [next.3 历史记录](releases/0.1.40-next.3.zh-CN.md)。不可用 next.3 测试本次增强；需让官方 next 模板、精确 next.4 Runtime、主站与 Workbench 配套就绪，再重新完成 E2E／打包／接收验证。npm 发布和分支推送不等于环境已部署或应用已发布。

| 功能 | 使用方式 | manifest 声明 |
| --- | --- | --- |
| GPS | `useGeolocation()` | `deviceCapabilities:["location"]` |
| 加速度／旋转速率 | `useDeviceMotion()` | `deviceCapabilities:["motion"]` |
| 方向角 | `useDeviceOrientation()` | `deviceCapabilities:["orientation"]` |
| 街道地图及本次展示增强 | `FlapStreetMap` | `mapCapabilities:["street-map-v1"]`，增强另需匹配 Runtime 能力 |
| 独立 Mini App 子页面 | `useMiniAppRouter()` | 无新增路由字段；由宿主提供 adapter |

只声明实际使用的能力。声明不等于授权，挂载 hook／地图不自动弹权限；旧组件不声明新字段时保持兼容。本次没有持久存储、设备号、领取记录或防刷服务，不能据此实现跨会话领取限制。

## 开发环境与声明

使用 Node.js 24 和 Yarn 1.22.22（最低 Node.js 22）。公开发布核验通过后，从官方 `next` 获取匹配 `0.1.40-next.4` 的模板，不要只修改版本号冒充来源：

```sh
git clone --branch next https://github.com/flap-sh/flap-vault-component-template.git
cd flap-vault-component-template
yarn install --frozen-lockfile
yarn app:scaffold store-map
yarn dev --port 3047
```

预览地址为 `http://localhost:3047/store-map`。模板已有 SDK 和 `@/src/sdk`、`@/src/ui` 别名，不要安装另一份 SDK／MapLibre 到组件目录。已有项目保留业务源码、身份和注册信息，按模板新鲜度提示更新。手机传感器测试使用 HTTPS；手机访问电脑局域网 HTTP 地址不满足安全环境要求。

维护主站／Workbench 的宿主工程在公开核验后安装精确测试版，并提交对应 Yarn lockfile：

```sh
yarn add --exact @flapsdk/vault-runtime@0.1.40-next.4 --registry https://registry.npmjs.org
```

这条安装命令仅用于消费 Runtime npm 包的宿主工程，组件作者在官方模板中继续使用已有别名；不要在组件目录再安装 SDK。宿主还须同步下面的能力校验、Worker 和 Workbench 来源验证输入，安装依赖不会自动部署环境。

把 [manifest 片段](../examples/street-map/manifest.fragment.json)合并到原有效 manifest，不替换整个文件：

```json
{
  "deviceCapabilities": ["location"],
  "mapCapabilities": ["street-map-v1"],
  "i18n": ["en", "zh", "ko"]
}
```

仅需要地图时可不声明 location；运动／方向另加 motion／orientation。不要把 OpenFreeMap 添加到 endpoints。独立 Mini App v2 保留 schemaVersion:2、mode:mini-app、appModel:standalone、slug 及空 match.bindings；已有 Vault UI 保留真实绑定和风险状态，不能伪装成 v2 绕过发布通道限制。

## CATCH 数据如何接入

保留必填 `id/lat/lng/title`；新增可选 `symbol/rarity/place/city/amount/expiresAt/respawnAt/kind`。原数据没有 title 时，用 place 或本地化文案生成。可空时间改成 undefined；所有时间必须是 **epoch 毫秒**。后端确实返回秒时才显式乘 1000，不要根据数值大小猜单位：

```ts
import type { FlapStreetMapPoint } from "@/src/ui";

type CatchPoint = Omit<FlapStreetMapPoint, "title" | "expiresAt" | "respawnAt"> & {
  title?: string;
  expiresAt?: number | null;
  respawnAt?: number | null;
};
const points: FlapStreetMapPoint[] = catchPoints.map((point: CatchPoint) => ({
  ...point,
  title: point.title || point.place || t("map.unknown"),
  expiresAt: point.expiresAt ?? undefined,
  respawnAt: point.respawnAt ?? undefined,
  kind: point.kind ?? "store",
}));
// 若后端约定为秒：非空的 expiresAt/respawnAt 在这一适配层显式 * 1000。
```

`kind:"event"` 才是独立活动点；`rarity:"legendary"` 只表示传奇稀有度，仍可以是普通门店。把 CATCH 活动来源的数据明确标成 event，不要把所有传奇门店转成活动。amount 是纯展示文本，大数／高精度用字符串；不用于库存计算或领取资格。

[完整 Component](../examples/street-map/Component.tsx)和[英中韩 i18n](../examples/street-map/i18n.json)展示全部字段、四级稀有度、冷却／过期、传奇门店与活动、定位精度与时间、可用列表、受控选中及详情卡。复制到原业务组件内并合并翻译；它是演示数据，不是领取业务实现。原 CATCH 的领取资格、库存、合约读写继续保留，可在 renderPointDetails 闭包内读取已有业务状态。

| 需求 | 新接口和行为 |
| --- | --- |
| 稀有度／冷却 | 默认绿／蓝／紫／金；respawnAt > now 或 expiresAt ≤ now 时变灰、无光晕。过期优先保持失效。 |
| 城市聚合 | cityClusters 默认开启；zoom ≤7.2 显示同名城市和总门店数，点击飞到 zoom 12；>7.2 显示单店。无城市门店继续显示，活动不计入城市。 |
| 点下文字 | showPointLabels 默认开启；门店 zoom >10.5 显示 symbol · place，回退 place／symbol／title。 |
| 活动 | kind:event 使用独立图层；showEventCountdowns 默认开启，expiresAt 控制活动倒计时。 |
| 位置和范围 | userLocation 是呼吸点；claimRadiusMeters 使用米，0..100000，0／省略不画圈。位置更新不自动移动视口。 |
| 选中和详情 | selectedPointId 受控；onSelectionChange 接收原点位或 null；renderPointDetails 返回项目自己的 React 内容。关闭、删除选中点、切换页面时清理父状态。 |
| 控件和配色 | showNavigation／showScale 默认关闭，示例显式打开；controlLabels 提供翻译。rarityColors 只允许四个稀有度键及六位 #RRGGBB，不接受 CSS 色名／短 hex／URL。 |

详情槽 context 包含 `nowMs`、`coolingDown`、`expired`、`cooldownRemainingMs`、`eventRemainingMs`、`distanceMeters`、`claimRadiusMeters`、`withinDisplayRadius`、`close()`，完整示例逐项展示。没有 expiresAt 时 eventRemainingMs 为 null，没有位置／半径时范围估算为 null。**距离、范围和倒计时只是客户端显示；withinDisplayRadius=true 也不代表可以领取。** 完整资格、领取数量与写入须由现有合约／可信服务核验，不要把模拟位置或客户端时钟作为授权凭证。

最多 2,000 点、ID 唯一且非空，坐标为有限值（纬度 ±85.051129、经度 ±180），zoom 限制 3–18。字段长度、时间安全整数及颜色等完整限制见[地图 API](street-map.zh-CN.md)。非法输入直接降级，不加载引擎。客户端不得导入 maplibre-gl、Worker、原生定位／权限／运动 API，也不能传自定义地图 URL、style、HTML 弹窗或引擎实例。

## 设备权限与兼容性

完整示例在按钮点击后立即调用 `location.request({enableHighAccuracy:true,maximumAge:0,timeoutMs:10000})`，再等待结果并显式更新 center。GPS 输出 latitude／longitude，地图输入 lat／lng。检查 active 与真实非空数据、accuracy 和 timestamp，标明 mode:mock；一次定位不会持续跟踪。持续定位需显式 request({watch:true}) 和停止控制；stop 会停止该能力的共享会话。

运动权限也须从自己的点击直接发起，不能先等待定位、网络或异步弹窗，否则部分 iPhone 会丢失用户手势。组件内的最小用法如下，文案放入已有 i18n.json 并同步英中韩：

```tsx
const motion = useDeviceMotion(); // 从 @/src/sdk 导入，声明 motion
<Button onClick={() => void motion.request({ timeoutMs: 10000 })}>{t("enableMotion")}</Button>;
// 仅 active 且对应字段非 null 时消费 acceleration/rotationRate；保留触摸替代。
```

方向角使用 useDeviceOrientation，读取 alpha／beta／gamma／absolute；运动读取 acceleration／accelerationIncludingGravity／rotationRate，字段可能为 null，不能仅凭 permission:granted 驱动交互。这些读数不证明防作弊或领取资格。

| 状态 | 业务处理 |
| --- | --- |
| idle／requesting | 显示启用／申请中，不当作已获得读数 |
| active | 检查对应有效 data、精度、时间和模拟标记 |
| denied | 保留门店列表、点击／触摸；用户自行调整系统／浏览器设置 |
| unsupported／insecure／policy-blocked | 提示环境限制并提供替代操作 |
| timeout／unavailable／not-declared | 显示失败或未接入状态，修复后由点击重试 |
| paused／cancelled | 不继续使用旧读数，回前台等新数据或重新启用 |

系统、浏览器、站点、钱包 WebView 可分别限制权限；统一 SDK 不表示一个弹窗能授权所有能力。地图 onStateChange 返回 loading／ready／unavailable，具体原因见地图 API。WebGL2／Worker 不兼容、资源错误、上下文丢失或 15 秒超时进入列表降级，修复后可有意重新挂载。拒绝定位时地图仍可用；地图失败时门店选择和业务操作仍须可用。

## 宿主同步与发布边界

主站和 Workbench 必须安装同一精确 Runtime，并同步 schema／checker／来源验证和真实导出。基础能力为 sdkFeatures.deviceSensors=1、sdkFeatures.miniAppRouting=1、uiFeatures.streetMap=1；本次增强另需 **uiFeatures.streetMapPresentation=1 和不可变 UI 导出 STREET_MAP_PRESENTATION_V1=1**。示例实际引用 sentinel，Workbench 记录 requiredUiExports，旧宿主在导入前拒绝不支持的增强产物。不要手改 feature、marker 或 metadata 假装升级；旧基础产物不因此被强制迁移，street-map-v1 和源码包格式维持原值。

Provider 默认提供懒加载真实设备服务；Workbench 模拟要明确标注。路由由宿主注入，页面为 browser adapter，内嵌预览为 memory adapter。将同版本包内未经修改的 Worker 和许可证复制到 public/runtime-map：

```sh
mkdir -p public/runtime-map
cp node_modules/@flapsdk/vault-runtime/runtime-map/maplibre-6.15.0-worker.mjs public/runtime-map/
cp node_modules/@flapsdk/vault-runtime/runtime-map/LICENSE.maplibre.txt public/runtime-map/maplibre-6.15.0-LICENSE.txt
```

固定同源路径 `/runtime-map/maplibre-6.15.0-worker.mjs` 须返回 JavaScript，不是 HTML、跳转或其他版本；SHA-256 为 `1c69066368331aae63967ed24a9affcf962cf55fcc6d8f532a8b040f736dbcfa`。保留固定 OpenFreeMap／OpenMapTiles／OpenStreetMap 署名。地图仍直接请求原受审 OpenFreeMap 资源，服务方可见 IP 与视口；不承诺服务可用性或浏览器网络隔离，本次没有扩大资源来源。

主站 Permissions Policy 仅向同源开放 geolocation／accelerometer／gyroscope；检查 HTTPS 响应没有被代理或额外策略再次禁止，仍需系统／浏览器授权。强制 CSP 需支持同源 Worker 与受审地图资源，不能开放任意脚本或网络来源。

## 测试源码 ZIP 与交付

下面是**官方 next、公开核验的 `0.1.40-next.4` 和匹配测试 Workbench 全部就绪后**的独立 Mini App v2 测试路径。新增强必须使用 next.4 的精确公开来源，不能用 next.3 来源封装新 SDK 代码。沿用现有 next 通道和全部官方来源／版本／gitHead／E2E／哈希检查；`app:*` 仍固定 main/latest，因此本测试通道使用显式 `vault:*` 命令：

```sh
FLAP_TEMPLATE_CHANNEL=next FLAP_TEMPLATE_FRESHNESS_REF=origin/next yarn vault:check store-map
FLAP_TEMPLATE_CHANNEL=next FLAP_TEMPLATE_FRESHNESS_REF=origin/next yarn vault:e2e store-map
FLAP_TEMPLATE_CHANNEL=next FLAP_TEMPLATE_FRESHNESS_REF=origin/next yarn vault:package store-map
FLAP_TEMPLATE_CHANNEL=next FLAP_TEMPLATE_FRESHNESS_REF=origin/next yarn vault:verify-package dist/store-map.zip
```

首次缺浏览器运行 yarn playwright install chromium。PowerShell 用对应的 `$env:FLAP_TEMPLATE_CHANNEL="next"`／`$env:FLAP_TEMPLATE_FRESHNESS_REF="origin/next"`。origin 若为 fork，upstream 必须指向官方 flap-sh/flap-vault-component-template，ref 改为 upstream/next。不得改成 HEAD／本地分支、修改版本伪装来源、跳过检查或手组 ZIP；只向对应测试 Workbench 提交核验后的 dist/store-map.zip，并保留 E2E、SHA-256 和 runtimePackageGitHead。私有 canary／npm tarball 不能替代源码 ZIP，此路径不自动批准或发布应用。

next 源码 ZIP 当前**仅支持独立 Mini App v2**；已有 Vault UI／绑定 token 的旧 Mini App 可在本地 next 模板验证行为，上传仍走 main/latest，等待后续匹配正式 SDK／模板／接收端。不要将其伪装成 v2。既有构建产物继续兼容。

## 验收与排障

交付前在桌面、iPhone Safari、Android Chrome 和目标钱包分别测试允许／拒绝传感器权限、部分／空读数、定位超时、后台恢复、路由离开／返回。地图另测 7.2／10.5 边界、四级颜色、冷却到期／已过期、同名城市计数、活动倒计时、选中点删除、范围圈、控件与列表降级。模拟成功不能代替真机及真实领取业务验证。

| 现象 | 优先检查 |
| --- | --- |
| runtime/*-unsupported | 已部署版本、feature、FlapStreetMap 和展示 sentinel 是否一致 |
| 手机不弹权限 | HTTPS、点击链、系统／浏览器／钱包限制和 Permissions Policy |
| 授权但无读数 | status 与实际 data、定位服务和硬件；保留替代操作 |
| 只有列表 | onStateChange.reason、WebGL2、Worker 内容与状态、地图服务 |
| 点位／详情不对 | 经纬度转换、唯一 ID、字段限制、毫秒单位、selected 的 null 回调 |
| 地图 ZIP 被拒 | 已发布匹配官方来源、capability／requiredUiExports、重新生成 E2E／ZIP |
| freshness／provenance 失败 | 按 code／fixHint 更新官方源码和精确版本，不编辑归档元数据 |

2026-10-26 的 next.3 历史验证针对**此前的基础定位／地图示例**：六项模板 E2E（PC／iPad／H5 × guest／connected）和普通 next format-7 ZIP 经本地 Workbench 构建通过。它不覆盖本次新增展示能力，不证明手机硬件、钱包或领取业务已验证，也没有部署环境或发布应用。详细 API：[设备](device-sensors.zh-CN.md)、[地图](street-map.zh-CN.md)、[子路由](mini-app-routing.zh-CN.md)。
