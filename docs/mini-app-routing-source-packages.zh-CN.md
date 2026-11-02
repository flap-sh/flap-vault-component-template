# 路由测试宿主的 Mini App 源码打包

[English](mini-app-routing-source-packages.md) · [子路由接口](mini-app-routing.zh-CN.md)

仅当接收的 Workbench 明确锁定已发布的 npm `routing` Runtime 时，使用此流程。
只允许独立 Mini App v2（format 7、schemaVersion 2、appModel standalone、空 bindings）。
默认 `app:*` 仍走官方 main/npm latest；Vault UI 与旧版 Mini App 不开放此测试打包通道。

Runtime 保持 `0.1.40-beta.routing.0`，发布来源保持
`33d22c9475c3935f8066d4ed213f25e082ece167`。这次只补充作者工具，不重新发包，
不改变 SDK/UI、依赖、构建输入或受保护 ZIP/E2E 协议；后续官方提交只允许已审核的作者工具和文档变化。

使用 Node.js 24、Yarn 1.22 和官方 `flap-sh/flap-vault-component-template`
的 `feat/mini-app-routing` 分支。保留 App 的 slug、artifactId 与四个源码文件，
注册放在 `src/vaults` 中，不携带本地 SDK 或打包工具修改。

```bash
git checkout feat/mini-app-routing
git pull --ff-only
yarn install --frozen-lockfile
FLAP_TEMPLATE_CHANNEL=routing yarn app:check <slug>
FLAP_TEMPLATE_CHANNEL=routing yarn app:e2e <slug>
FLAP_TEMPLATE_CHANNEL=routing yarn app:package <slug>
FLAP_TEMPLATE_CHANNEL=routing yarn app:verify-package dist/<slug>.zip
```

默认官方引用为 `origin/feat/mini-app-routing`。如果 origin 是个人 fork，所有命令同时设置
`FLAP_TEMPLATE_FRESHNESS_REF=upstream/feat/mini-app-routing`，upstream 必须指向官方仓库。

每次校验、E2E、打包、验包均保持同一环境。脚本核验官方远程与最新分支、真实存在的 npm routing
标签及不可变版本记录、精确 version/gitHead、已发布源码的祖先关系、受保护输入不变，以及当前
源码哈希与 PC/iPad/H5 的 guest/connected E2E。不存在首次 Runtime 发布的缺失标签放行，也不
接受 canary、其他 npm 通道或仅修改版本号伪装来源；Runtime 发布流程仍独立保持严格门禁。

仅上传脚本生成的 format-7 ZIP，四个 App 源码、manifest schema、schema-3 E2E report、
包标记和中继资料必须来自同一次打包。不能手改 ZIP 中的 `flap-vault-package.json`、
`package-metadata.json`、`schemas/manifest.schema.json` 或 `qa/e2e-report.json`。

`0.1.39` 源包不能直接上传到锁定 routing beta 的 Workbench；请按上述流程重新生成，
不要修改旧包的版本标签。反向也一样：routing beta 源包不能用于锁定 main/latest 的生产
Workbench。上传和构建成功不代表批准发布 App 或部署宿主，本流程不发布 npm、不升级消费者。
