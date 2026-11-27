# Workers 迁移验收记录（历史）

当前 main 已改用 Pages；本文仅记录过去的 Workers 验收，不代表当前部署状态。现行配置见 [Pages 部署](pages-deployment.md)。

日期：2026-11-24。代码修改位于 main 工作区，未提交、未推送、未发布。远端 main/pages 均确认位于 `4dd47fe875467ff82a8ecf19ed44a845cf417b7c`；pages 未修改。

## 已完成

- 使用 Node 22.23.5；`.node-version` 固定主版本 22。
- TypeScript 检查通过；生产 `build:cloudflare` 通过，包含真实远程资源更新。自动更新产生的目录日期改动已撤回，不纳入迁移。
- Wrangler deploy dry-run 通过：Worker gzip 约 152.37 KiB，三个 D1、ASSETS、VERSION_METADATA 绑定齐全。
- 静态产物检查：69 个文件，最大约 2.19 MB；没有公开 Source Maps、Worker 源码、Wrangler 配置、旧工具集网址或诊断 Secret 配置项。
- 实际 Worker 入口的 8 项集成测试通过：文件/页面路由、API 拦截、缺失资源、认证 Cookie、三类同步上传和冲突、账户隔离、诊断写入/中间件/waitUntil，以及实际 scheduled 导出。
- 2 项真实 workerd 代理测试通过：搭配码缓存和分享图片，包含上游重定向拒绝。
- 3 项清理测试通过：保留边界、每批上限、失败传播和 ERROR_DB 范围。
- 31 项 Node 测试通过：启动依赖、资源网络和生产诊断构建策略。
- 本次修改的 TypeScript/JavaScript/JSON 格式检查通过；`git diff --check` 通过。
- 本地 Wrangler 页面在浏览器成功加载，首页及个人衣橱导航可用。

## 全量测试的既有问题

完整 Vitest 执行结果为 1728 通过、12 失败、1 跳过（当时共 1741 项；随后又增加并通过 2 项 Worker 集成用例）。失败文件串行复测后有 7 项仍失败，其余并行超时未复现。

使用迁移前 `4dd47fe` 的独立源码副本、同一 Node 22 和锁定依赖复测，以下失败同样存在：

| 测试 | 失败情况 |
|---|---|
| CameraFavorites | 激活页面后保存封面的图片节点未出现 |
| PersonalWardrobe | 加载期间移动端汇总占位文本未出现 |
| DataImportWindow | 国服原始文件导入用例超时 |
| ResonanceRecords | UID 不匹配提示、预览替换、取消预览三个用例失败 |
| outfitText | 测试禁用了 fetch，但当前目录资源加载依赖 fetch |

这些文件和对应业务实现未在本次迁移中修改。没有通过降低断言或跳过失败用例来掩盖问题。完整格式检查另报告 527 个未改动文件的既有格式问题；本次修改文件单独检查通过。

机器默认 Node 26 的首轮执行还出现 localStorage 环境兼容失败，不作为 Node 22 的正式结果。

## 尚未完成的线上验收

- 新域名首页和 `/api/like` 当前均返回 `Hello world`，仍是占位 Worker；本次未执行生产部署。
- Cloudflare 控制台的仓库连接、生产分支、预览分支、构建变量、D1 实际绑定与运行时 Secret 尚未读取核验。
- 未在生产创建测试账户或写入 D1；新站实际功能和诊断入库尚待部署后验收。
- Cron 代码和本地执行已通过，线上 Cron 注册和首次实际运行尚待验证。

按 [部署说明](pages-deployment.md) 配置并发布后，再完成上述检查。当前记录不代表线上已迁移成功，也不代表全量测试全绿。
