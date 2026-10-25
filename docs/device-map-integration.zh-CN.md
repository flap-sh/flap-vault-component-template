# GPS、运动感应与街道地图接入说明

本文面向接入 Flap Vault UI／Mini App 的开发者。设备权限、兼容检测、浏览器采集和地图引擎由共享 Runtime 处理；项目只需声明能力、调用 SDK、传入门店数据并实现业务降级。

## 测试版本与接入范围

`@flapsdk/vault-runtime@0.1.40-next.3` 已发布到 npm `next`，源码提交为 `4bf5f3bb111993cdb9167ba18e9ec225b351c79f`，用于本次三端联调。主站和 Workbench 的 `feat/device-sensors` 分支已固定同一版本及配套校验输入。**实际上传前仍须部署这两个测试分支，并确认测试环境运行相同版本；本次没有部署主站或 Workbench。** `next.2` 的地图源码包元数据遗漏已在本版修正，请使用 `next.3`。正式 `latest` 保持 `0.1.39`。见[发布记录](releases/0.1.40-next.3.zh-CN.md)。

| 功能 | 开发者使用方式 | 声明 |
| --- | --- | --- |
| 定位 | `useGeolocation()` | `deviceCapabilities: ["location"]` |
| 加速度／旋转速率 | `useDeviceMotion()` | `deviceCapabilities: ["motion"]` |
| 方向角 | `useDeviceOrientation()` | `deviceCapabilities: ["orientation"]` |
| 街道地图 | `FlapStreetMap` | `mapCapabilities: ["street-map-v1"]` |
| 独立 Mini App 子页面 | `useMiniAppRouter()` | 无新增路由 manifest 字段；宿主需提供 adapter |

仅声明实际使用的能力。声明与用户授权是两个步骤，挂载地图或 hook 不会自动申请权限。旧组件不声明新字段时保持兼容。本次没有新增本地存储、持久设备号或领取限制服务；领取记录、防刷及跨会话识别不能因此视为已解决。

## 开发环境

使用 Node.js 24 和 Yarn 1.22.22（模板最低要求 Node.js 22）。新建独立 Mini App 使用官方模板的测试分支；已有组件先保留业务源码，再按模板新鲜度提示同步，不要覆盖本地工作：

```sh
git clone --branch next https://github.com/flap-sh/flap-vault-component-template.git
cd flap-vault-component-template
yarn install --frozen-lockfile
yarn app:scaffold store-map
yarn dev --port 3047
```

本地预览地址为 `http://localhost:3047/store-map`。模板自带 SDK 源码与 `@/src/sdk`、`@/src/ui` 别名，不要在组件目录安装另一份 SDK 或 MapLibre。已有独立 App 可沿用自己的目录；`artifactId`、slug 和注册信息由 scaffold／register 维护，不要从其他项目复制身份。

预览可以先验证布局、门店选择和失败降级。手机真实传感器测试必须使用 HTTPS 测试站点；手机打开 `http://电脑局域网IP:3047` 不满足安全环境要求。实际上传使用的 Workbench 与实际运行的主站也必须部署本次测试分支，安装 npm 包不会自动完成部署。

宿主工程精确安装：

```sh
yarn add --exact @flapsdk/vault-runtime@0.1.40-next.3
```

## manifest 声明

把下面两个字段合并到现有有效 `manifest.json`。不要用此片段替换完整 manifest：

```json
{
  "deviceCapabilities": ["location", "motion"],
  "mapCapabilities": ["street-map-v1"]
}
```

只要 GPS＋地图时，删掉 `motion`，同时移除下面示例中的运动 hook 和按钮。需要方向角时才增加 `orientation`，使用 `useDeviceOrientation()`。不要添加地图服务到 `endpoints`；地图资源由 Runtime 的固定策略控制，这个声明不授予原始网络访问权限。

独立 Mini App v2 保留 scaffold 生成的 `schemaVersion:2`、`mode:"mini-app"`、`appModel:"standalone"`、slug 及空 `match.bindings`。现有 Vault UI 保留真实的原有绑定和风险状态展示，不要为迁移地图伪造地址或改变组件类型。

## 最小组件示例

下面可用作独立 Mini App 的 `Component.tsx`。给已有 Vault UI 接入时，把地图和控制区域合并到原组件内，保留宿主风险状态及原有业务操作。

```tsx
"use client";
import { useMemo, useState } from "react";
import { useDeviceMotion, useFlapI18n, useGeolocation } from "@/src/sdk";
import {
  Button, FlapStreetMap,
  type FlapStreetMapCoordinate, type FlapStreetMapPoint, type FlapStreetMapState,
} from "@/src/ui";

export default function Component() {
  const { t } = useFlapI18n();
  const location = useGeolocation();
  const motion = useDeviceMotion();
  const [center, setCenter] = useState<FlapStreetMapCoordinate>({ lat: 31.2304, lng: 121.4737 });
  const [selected, setSelected] = useState<string | null>(null);
  const [mapState, setMapState] = useState<FlapStreetMapState>({ status: "loading" });
  const points = useMemo<FlapStreetMapPoint[]>(() => [
    { id: "shop-1", lat: 31.2304, lng: 121.4737, title: t("shop") },
  ], [t]);
  const userLocation = location.status === "active" && location.data
    && Math.abs(location.data.latitude) <= 85.051129
    ? { lat: location.data.latitude, lng: location.data.longitude } : null;
  const locate = async () => {
    const result = await location.request({ enableHighAccuracy: true, maximumAge: 0, timeoutMs: 10000 });
    if (result.status === "active" && result.data && Math.abs(result.data.latitude) <= 85.051129) {
      setCenter({ lat: result.data.latitude, lng: result.data.longitude });
    }
  };
  const list = <ul>{points.map(point => <li key={point.id}>
    <Button onClick={() => setSelected(point.id)}>{point.title}</Button>
  </li>)}</ul>;

  return <section className="min-h-screen w-full space-y-4">
    <Button onClick={() => void locate()}>{t("locate")}</Button>
    <p>{t(location.status === "active" ? "locationActive" : "locationOptional")}</p>
    <Button onClick={() => void motion.request({ timeoutMs: 10000 })}>{t("enableMotion")}</Button>
    <p>{t(motion.status === "active" ? "motionActive" : "motionOptional")}</p>
    {mapState.status !== "ready" && <p role="status">{t("mapFallback")}</p>}
    <FlapStreetMap points={points} center={center} zoom={12} userLocation={userLocation}
      onSelectPoint={setSelected} onStateChange={setMapState} fallback={list} />
    {mapState.status === "ready" && list}
    {selected && <p>{points.find(point => point.id === selected)?.title}</p>}
  </section>;
}
```

示例中的定位函数在点击后首先调用 `location.request()`，随后才等待结果；运动权限也直接从自己的按钮触发。不要先等待网络请求、定位结果或异步弹窗，再申请运动权限，否则部分 iPhone 浏览器会失去本次用户手势。

GPS 数据字段为 `latitude`／`longitude`，传给地图时要转换成 `lat`／`lng`。`userLocation` 只更新位置点，不自动移动视野；示例在定位成功后显式更新 `center`。一次定位不会持续跟踪，持续定位需明确调用 `request({ watch:true })` 并提供停止控制。hooks 在最后一个订阅者离开时清理采集；`stop()` 会停止该能力的共享会话。

示例没有实施位置精度或领取资格判断。实际业务应检查 `location.data.accuracy` 和 `timestamp`，显示近似位置并在需要新位置时重新定位。`motion.data` 提供 `acceleration`、`accelerationIncludingGravity`、`rotationRate`；`useDeviceOrientation()` 的数据为 `alpha`／`beta`／`gamma`／`absolute`。字段可能为 null，只有 `status === "active"` 且对应读数有效时才能驱动交互；这些读数不自动证明防作弊或领取资格。

所有显示文案放入组件 `i18n.json`，并与 `manifest.i18n` 对齐。scaffold 默认有英、中、韩三种语言，示例所需新增键如下；已有项目应合并这些键：

```json
{
  "en": {
    "shop": "Shanghai demonstration shop", "locate": "Show my location",
    "locationActive": "Location is an estimate; check accuracy before travelling.",
    "locationOptional": "Location is optional. Choose a shop from the list.",
    "enableMotion": "Enable motion controls", "motionActive": "Motion data is available.",
    "motionOptional": "Motion is optional. Touch controls remain available.",
    "mapFallback": "The map is loading or unavailable. Choose a shop from the list."
  },
  "zh": {
    "shop": "上海演示门店", "locate": "显示我的位置",
    "locationActive": "定位是系统估算，出行前请确认精度。",
    "locationOptional": "定位为可选功能，也可以从列表选择门店。",
    "enableMotion": "启用运动控制", "motionActive": "已获得运动数据。",
    "motionOptional": "运动感应为可选功能，仍可使用触摸操作。",
    "mapFallback": "地图正在加载或暂不可用，请从列表选择门店。"
  },
  "ko": {
    "shop": "상하이 시연 매장", "locate": "내 위치 표시",
    "locationActive": "위치는 추정값입니다. 이동하기 전에 정확도를 확인하세요.",
    "locationOptional": "위치 정보는 선택 사항입니다. 목록에서 매장을 선택하세요.",
    "enableMotion": "동작 제어 켜기", "motionActive": "동작 데이터를 사용할 수 있습니다.",
    "motionOptional": "동작 감지는 선택 사항입니다. 터치 조작도 사용할 수 있습니다.",
    "mapFallback": "지도를 불러오는 중이거나 사용할 수 없습니다. 목록에서 매장을 선택하세요."
  }
}
```

## 权限、兼容性和降级

| 状态 | 组件应如何处理 |
| --- | --- |
| `idle`／`requesting` | 显示启用按钮／申请中状态，不当作已授权读数 |
| `active` | 同时检查非空有效数据；`permission:"granted"` 本身不能代替读数 |
| `denied` | 保留门店列表、点击或触摸操作，允许用户自行调整系统／浏览器设置 |
| `unsupported`／`insecure`／`policy-blocked` | 提示当前环境限制，保留替代操作 |
| `timeout`／`unavailable`／`not-declared` | 显示明确失败或未接入状态，修复原因后再从用户点击重试 |
| `paused`／`cancelled` | 不继续用旧读数；回前台等新数据或由用户重新启用 |

`mode:"mock"` 是显式模拟，不能当成真实采集结果。系统、浏览器、站点和钱包 WebView 可分别限制权限；统一 SDK 不意味着一个弹窗就能授予所有能力。iPhone Safari、Android Chrome 和目标钱包需要分别真机验证。拒绝传感器权限时地图仍可显示，地图失败时门店选择与业务操作仍须可用。

地图为固定 MapLibre 6.15.0＋OpenFreeMap 深色样式，最多 2,000 个点，ID 唯一，纬度范围 ±85.051129，经度 ±180，缩放 3–18。不开放自定义样式 URL、瓦片 URL、Worker、HTML 弹窗或原始 MapLibre 实例。开发者不能直接导入 `maplibre-gl`、创建 Worker 或调用原生定位／权限／运动 API。

`onStateChange` 返回 `loading`／`ready`／`unavailable`，原因可能是 `not-declared`、`invalid-input`、`unsupported`、`load-failed`、`timeout`、`context-lost`。WebGL2、Worker、资源失败或 15 秒启动超时会进入列表降级；故障排除后可通过有意重新挂载组件重试。地图资源直接来自固定 OpenFreeMap，服务方可看到客户端 IP 和请求的地图区域，保留固定署名链接；这不是独立浏览器沙箱，也没有地图服务可用性保证。

## 宿主需同步的内容

主站与 Workbench 都需要同一精确 Runtime 版本、对应 schema／checker／验证来源、真实 UI 导出和 feature 标记：`sdkFeatures.deviceSensors=1`、`sdkFeatures.miniAppRouting=1`、`uiFeatures.streetMap=1`。不能手工添加标记来冒充新包。Provider 默认提供懒加载真实设备服务；Workbench 的模拟仅用于明确标注的预览。路由由宿主注入，页面用 browser adapter，Workbench 内嵌预览用 memory adapter。

同时部署包内未经修改的 Worker 和许可证到宿主 `public/runtime-map/`。宿主工程可从安装的同版本包复制：

```sh
mkdir -p public/runtime-map
cp node_modules/@flapsdk/vault-runtime/runtime-map/maplibre-6.15.0-worker.mjs public/runtime-map/
cp node_modules/@flapsdk/vault-runtime/runtime-map/LICENSE.maplibre.txt public/runtime-map/maplibre-6.15.0-LICENSE.txt
```

Worker 必须在同源固定路径 `/runtime-map/maplibre-6.15.0-worker.mjs` 返回 JavaScript，不能返回 HTML、重定向或其他版本。Worker SHA-256 为：

```text
1c69066368331aae63967ed24a9affcf962cf55fcc6d8f532a8b040f736dbcfa
```

主站已有文档权限策略仅向同源开放 geolocation／accelerometer／gyroscope。部署方须检查实际 HTTPS 响应没有被代理或额外策略再次禁止；这不会代替浏览器与系统授权。若部署方另有强制 CSP，还须允许同源 Worker 及受审地图资源，不能为接入地图放开任意脚本或网络来源。

## 测试源码 ZIP 与交付

下面是**已发布 next.3、官方 next 源码和匹配测试 Workbench 就绪后**的独立 Mini App v2 测试路径。沿用既有 next 通道，所有官方来源、版本／gitHead、E2E 和哈希校验都执行；`app:*` 仍固定为正式 main/latest，因此这里显式选择 next 并调用底层 `vault:*` 检查工具：

```sh
FLAP_TEMPLATE_CHANNEL=next FLAP_TEMPLATE_FRESHNESS_REF=origin/next yarn vault:check store-map
FLAP_TEMPLATE_CHANNEL=next FLAP_TEMPLATE_FRESHNESS_REF=origin/next yarn vault:e2e store-map
FLAP_TEMPLATE_CHANNEL=next FLAP_TEMPLATE_FRESHNESS_REF=origin/next yarn vault:package store-map
FLAP_TEMPLATE_CHANNEL=next FLAP_TEMPLATE_FRESHNESS_REF=origin/next yarn vault:verify-package dist/store-map.zip
```

首次缺少浏览器时运行 `yarn playwright install chromium`；在 Windows PowerShell 中用对应的 `$env:FLAP_TEMPLATE_CHANNEL="next"` 和 `$env:FLAP_TEMPLATE_FRESHNESS_REF="origin/next"` 设置相同环境变量。如果 `origin` 是 fork，`upstream` 必须指向官方 `flap-sh/flap-vault-component-template`，并将上述 ref 改成 `upstream/next`。不要把 ref 改成 HEAD／本地分支，修改版本号伪装来源，手工组装 ZIP 或跳过失败检查。

仅提交通过核验的 `dist/store-map.zip` 到对应 next 测试 Workbench，不提交私有 canary、npm tarball 或手工编译的 JS。保留生成的 E2E 报告和 package 输出的 SHA-256／`runtimePackageGitHead`。此路径不自动批准或发布应用。

当前 next 源码 ZIP 路径**仅支持独立 Mini App v2**；Vault UI 和绑定 token 的旧 Mini App 仍使用正式 main/latest，不能将它们改名或伪装成 v2 绕过限制。它们可以在本地 next 模板验证组件行为；若要正式上传，需要后续匹配的正式 SDK／模板和接收端发布。已存在的构建产物保持兼容。

## 验收与排障

交付前分别在桌面、iPhone Safari、Android Chrome 和实际目标钱包完成：允许／拒绝定位、允许／拒绝运动、部分或空数据、定位超时、切后台再回来、路由离开和重新进入；同时验证门店列表不依赖地图或传感器成功。模拟成功不能替代这些真机检查。

| 现象 | 优先检查 |
| --- | --- |
| `runtime/*-unsupported` | 两个接收端实际安装的版本、feature 及导出是否一致，是否已部署 |
| `not-declared` | manifest 声明是否包含所用能力；不要只改组件代码 |
| 手机没有弹权限 | HTTPS、用户点击调用链、系统／浏览器／钱包限制及响应 Permissions Policy |
| 授权成功但没有位置或运动 | `status` 与实际 `data`，超时、定位服务及硬件；保持可用替代操作 |
| 只有列表、地图不可用 | `onStateChange.reason`、WebGL2、Worker URL 的状态／内容、网络与地图服务 |
| 点位不显示或位置错误 | `latitude/longitude` 到 `lat/lng` 的映射、有效范围、唯一 ID、实际数据来源 |
| 地图 ZIP 被拒 | 使用修正后的 next.3，marker／metadata／manifest 的 mapCapabilities 一致，并重新生成 E2E 和 ZIP |
| freshness／runtime provenance 失败 | 按 JSON 的 code／fixHint 更新官方分支和精确版本，不编辑归档元数据 |

详细 API：[设备服务](device-sensors.zh-CN.md)、[街道地图](street-map.zh-CN.md)、[子路由](mini-app-routing.zh-CN.md)。

## 本说明的验证记录

2026-10-26，按上面的完整示例创建独立 `store-map-probe` 测试 App，检查无 blocking；PC／iPad／H5 × guest／connected 六项真实模板 E2E 全部通过，街道底图、点位、署名和门店列表可见。使用普通 next 通道命令生成并核验 format 7 源码 ZIP，再经 Workbench 原有 `createJobFromZip` → `buildArtifact` 本地流程通过，产物保留 `mapCapabilities:["street-map-v1"]`、真实 `requiredUiExports` 和 next.3 来源。设备与地图声明各产生一项预期人工审查提示，不会自动批准应用。

这份验证使用桌面浏览器模拟设备尺寸与测试 session，不代表已通过手机硬件、真实钱包或实际领取业务验证；也没有部署环境或发布应用。
