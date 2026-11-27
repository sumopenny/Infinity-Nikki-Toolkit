# Pages 部署与验收

`main` 部署到 Pages 项目 `nikkicube`：https://nikkicube.pages.dev 。`pages` 分支保留历史版本，不修改、不合并。独立官网 https://nikki3.pages.dev 不变。

## Cloudflare 控制台

连接本仓库，生产分支选 `main`，根目录留空，框架选 Vue 或无，构建命令 `npm run build:cloudflare`，输出目录 `dist`。构建只使用仓库现有资源 JSON，不拉取远程资源；需要更新时先运行 `start\Update-Resources.bat`，提交更新后的文件再部署。Pages 不填写 `wrangler deploy` 部署命令。Node 版本读取仓库 `.node-version`，无需重复设置。

`VITE_ERROR_REPORTING_ENABLED=true` 已写入 `wrangler.toml` 的 `[vars]`，由 Pages 在构建时读取，不需要在控制台重复配置普通变量。Pages 提供 `CF_PAGES_BRANCH` 和 `CF_PAGES_COMMIT_SHA`；运行时生产标记也由仓库统一维护。控制台只需配置下面的 Secret。前端资源保持同源 `/assets/`。

生产绑定和运行时普通变量以 `wrangler.toml` 为准：

| 绑定 | 现有数据库 | 用途 |
|---|---|---|
| `DB` | `wxnn-likes` | 点赞 |
| `RESONANCE_DB` | `wxnn-resonance` | 共鸣、衣橱、存档及共享账户 |
| `ERROR_DB` | `wxnn-errors` | 错误诊断 |

沿用原 database_id，不重建数据库、不在构建步骤执行远程迁移。新旧站共用云端数据。关闭非生产分支预览部署，避免预览环境使用这些生产绑定。

在 Pages Settings → Variables and Secrets 中添加 Secret `ERROR_RATE_LIMIT_SALT`，值为至少 32 字符的随机字符串，不使用 VITE_ 前缀。原 Worker 的 Secret 不会自动复制。修改 Secret 后重新部署。普通变量 `ERROR_REPORTING_ENABLED=true`、`ERROR_MAX_DAILY_EVENTS=1000`、`ERROR_DEPLOYMENT_ENV=production` 已写入 Wrangler。

服务端诊断使用 Pages 的 `CF_PAGES_COMMIT_SHA` 关联发布；可用 `ERROR_SERVER_BUILD_ID` / `ERROR_SERVER_COMMIT` 显式覆盖。前端 source map 不公开。

兼容日期统一为 `2026-11-27`，运行时测试直接读取 `wrangler.toml`，避免测试与部署行为不一致。构建 Node 版本仍由 `.node-version` 指定为 22（工具链最低要求 22.12）。Wrangler 更新为 4.168.0；其默认 workerd 只到 11 月 23 日，因此 package.json 暂以 overrides 固定 workerd 1.20261127.1，确保本地能验证目标日期。后续 Wrangler 自带运行时达到该日期后可移除覆盖。

兼容性验证覆盖隔离 D1、Pages 路由与现有取消/重试逻辑。真实客户端断线触发 `Request.signal` 的行为尚未确认：本地 Miniflare HTTP 探针未观察到信号，不能据此保证线上断线能立即取消上游请求；上线前应在预览部署单独验证。

## 路由与本地验证

构建自动生成 `dist/_routes.json`，实际存在的非 HTML 静态文件直接由 Pages 返回，不调用 Functions；API、页面和缺失资源继续进入 middleware。规则总数最多 100 条，超限或路径过长的文件继续走 middleware，不扩大通配符。无需手动维护资源清单。

Pages 直接按 `functions/` 文件路由，不再维护单独的 Workers 分发入口。根 middleware 和 `public/404.html` 保证真实文件正常返回、缺失资源返回 no-store 404、普通页面 GET/HEAD 回退首页。未知 API 返回 JSON 404，错误方法返回 405，不会返回静态文件或首页。原有超时、缓存失败降级、认证和云同步冲突处理保留。

- `npm ci` 安装依赖，`npm run build` 检查类型并构建。
- `npm run dev` 启动本地 Vite，默认通过 `https://nikkicube.pages.dev` API 使用远程 D1；不启动 Wrangler、不创建或迁移本地 D1。双击启动器使用同一入口。
- `npm run preview` 也使用相同远程 API 配置。需要覆盖目标时设置 `REMOTE_API_ORIGIN`；`npm run dev:remote` 仅保留为 `dev` 的兼容别名。
- `npx wrangler pages functions build --outdir .wrangler/pages-check` 离线编译实际 Pages 路由。
- `npm test` 包含实际 Pages 编译产物的 Miniflare 集成测试，测试创建临时静态文件和内存 D1，不访问生产 D1。
- 日常本地运行的点赞、登录和云同步会操作真实线上数据，不用于隔离测试。自动化测试继续使用临时内存 D1 或模拟 API，禁止连接生产 D1。浏览器本地存档和照片索引不受此调整影响。

部署后检查首页、深链、缺失 JS/JSON/WASM、PWA、用户脚本、图片和分享码代理，以及诊断配置。云端读写验收只在隔离环境使用专用账号。换域名不会自动迁移浏览器本地数据，旧站用户应先导出全部数据，再到新站导入；云端账号沿用但需重新登录。

## 诊断保留任务

Pages 没有 Workers scheduled 入口。`.github/workflows/error-retention.yml` 每天 UTC 19:25（北京时间次日 03:25）复用管理员脚本清理过期诊断，也支持手动运行。GitHub 定时任务可能延迟；仓库默认分支须为 main，Actions 须启用。

在仓库 Actions secrets 中配置 `ERROR_DIAGNOSTICS_CF_API_TOKEN`（对应账户的 D1 编辑权限）和 `CLOUDFLARE_ACCOUNT_ID`。在 Actions 的仓库 Variables 中设置 `ERROR_DIAGNOSTICS_MAINTENANCE=true` 才启用任务；删除该变量或设为 false 可暂停。工作流仅在 main 执行，只操作 `wxnn-errors`。保留事件 30 天、分组 180 天，批量上限和失败中断逻辑不变。未配置 secrets 或未成功运行时，不能认为自动清理已生效。

管理员可运行 `npm run errors:prune` 只读预览，明确需要删除过期诊断时运行 `npm run errors:prune -- --apply`。迁移验证不执行这些远程命令。

## 上线切换

本仓库不再部署独立 Worker。确认 Pages 正常后，在控制台停用旧 Worker 的 Git 自动构建、Cron 和旧域名路由，避免重复清理或旧构建失败；是否删除旧线上服务由维护者决定。代码变更不会自动删除已存在的 Cloudflare 服务。

保留 Pages 上一成功部署以便回滚。代码回滚不回滚共享 D1 数据。本地验证不能替代线上绑定、Secret、Git 自动部署和首次定时任务执行的确认。
