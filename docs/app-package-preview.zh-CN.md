# Mini App 打包校验测试通道

此通道用于验证官方 `chore/refine-package-text-validation` 分支的打包工具。请使用官方仓库的当前分支提交，并将独立 Mini App v2 的四个源码文件放在 `src/vaults/<目录名>`。注册本地预览后执行：

```sh
FLAP_TEMPLATE_CHANNEL=preview yarn app:check <目录名>
FLAP_TEMPLATE_CHANNEL=preview yarn app:e2e <目录名>
FLAP_TEMPLATE_CHANNEL=preview yarn app:package <目录名>
FLAP_TEMPLATE_CHANNEL=preview yarn app:verify-package dist/<目录名>-preview.zip
```

如果官方远端名为 `upstream`，四条命令同时设置 `FLAP_TEMPLATE_FRESHNESS_REF=upstream/chore/refine-package-text-validation`。工具检查官方分支当前 SHA、npm latest 的 Runtime 版本与发布提交、四个源文件的哈希和 E2E 报告。

生成的 ZIP 会标记为预览包。请上传到启用了同一模板提交 SHA 的测试 Workbench。测试包使用已发布的 Runtime，发布流程继续使用官方 `main`。
