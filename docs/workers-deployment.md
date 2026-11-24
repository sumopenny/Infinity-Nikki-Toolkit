# Workers 部署与验收

`main` 用于日常更新及 Workers；`pages` 保留 Pages，不合并 main 的部署改动。
正式工具集：https://nikkicube.sumopenny.workers.dev 。独立官网 https://nikki3.pages.dev 不变。

## Cloudflare 控制台

1. 新建/选择 Worker **nikkicube**，连接本仓库，生产分支选 **main**，项目根目录为仓库根目录。
2. 构建命令 `npm run build:cloudflare`；部署命令 `npx wrangler deploy`。仓库根目录的 `.node-version` 指定 Node 22，随迁移提交推送。
3. 关闭非生产分支构建/预览。`preview_urls=false` 只关闭版本预览 URL，不能代替控制台的分支构建开关。
4. Pages 项目生产分支改为 **pages**，预览分支排除 main；保留旧部署，不删除、不跳转。
5. 确认账号的 workers.dev 子域名是 **sumopenny**，Worker 名是 **nikkicube**。

### 构建环境变量（Settings → Build）

| 名称 | 生产值 |
|---|---|
| `VITE_ERROR_REPORTING_ENABLED` | `true` |

控制台只需手动添加这一项构建变量。Workers Builds 读取 `.node-version`，并自动提供 `WORKERS_CI_COMMIT_SHA` 和 `WORKERS_CI_BRANCH`。项目根据 `WORKERS_CI_BRANCH=main` 标记正式构建并检查前端诊断开关，因此构建面板可省略 `NODE_VERSION` 和 `ERROR_DEPLOYMENT_ENV`。`wrangler.toml` 里的运行时 `ERROR_DEPLOYMENT_ENV` 保留，用于标记 Worker 自身的诊断记录。前端资源始终同源，不把构建预览 URL 用作资源 base。

### 运行时绑定和 Secret

Wrangler 配置是普通变量和绑定的来源，部署时会同步：

| 绑定 | 现有数据库 | 用途 |
|---|---|---|
| `DB` | `wxnn-likes` | 点赞 |
| `RESONANCE_DB` | `wxnn-resonance` | 共鸣、衣橱、存档及共享账户 |
| `ERROR_DB` | `wxnn-errors` | 诊断 |

保持现有 database_id，**不要重建数据库或在构建命令中添加远程 migration**。两站共享数据库，任一站的写入会在另一站生效。

普通变量：`ERROR_REPORTING_ENABLED=true`、`ERROR_MAX_DAILY_EVENTS=1000`、`ERROR_DEPLOYMENT_ENV=production`。
在 Worker Settings → Variables and Secrets 中添加 **Secret** `ERROR_RATE_LIMIT_SALT`，使用至少 32 字符的随机值。不要使用 `VITE_` 前缀或写入仓库。旧 Pages 的 Secret 不会自动复制。

`VERSION_METADATA` 自动提供 Worker 版本编号，服务端诊断用它关联部署；`ERROR_SERVER_BUILD_ID` 和 `ERROR_SERVER_COMMIT` 可作为显式覆盖。Workers 日志及服务端 Source Maps 已启用；前端 Source Maps 不公开。紧急关闭诊断应将 Wrangler 中 `ERROR_REPORTING_ENABLED` 改为 `false` 后重新发布，以免下次部署覆盖控制台临时值。

## 本地与发布验证

- 安装：`npm ci`；测试：`npm test`；普通构建：`npm run build`。
- 本地 Worker：`npm run dev:worker`，使用本地 D1；不执行生产测试。需要诊断时在已忽略的 `.dev.vars` 配置测试 Secret，并使用独立本地数据库。
- 本地 Vite 远程模式仍访问真实线上服务。启动批处理默认使用新 Worker 地址，也支持第一个参数覆盖地址。首次 Worker 上线前可显式传入旧 Pages 地址。
- 本地模拟正式构建时使用 Node 22，并设置 `ERROR_DEPLOYMENT_ENV=production` 和 `VITE_ERROR_REPORTING_ENABLED=true`，再执行 `npm run build:cloudflare` 和 `npx wrangler deploy --dry-run`。本地没有 Workers Builds 注入的分支变量。资源更新沿用现有校验和网络失败处理。
- 核验首页/深链、缺失资源 404、脚本/CSS/JSON/WASM、PWA、用户脚本，以及全部 `/api/*`。未知 API 和错误方法不能返回首页。
- 用专用测试账号验证注册、登录、三类同步、冲突、退出和账户隔离；不要用真实用户存档做覆盖测试。
- 确认前端诊断和服务端错误均能关联发布，且日志中没有 Cookie、密码或存档正文。

## 诊断保留任务

Worker Cron 为 `25 19 * * *`（UTC），北京时间每天 **03:25**。事件保留 30 天、分组保留 180 天；每次最多删除 20 批、每批 500 个事件，关联轨迹级联删除。仅访问 ERROR_DB。清理失败会使 scheduled 执行失败并记录固定错误标识。

main 已移除 GitHub Actions 定时工作流。GitHub 定时任务以默认分支为准：确认仓库默认分支为 main，检查是否还有正在运行的旧任务或外部 workflow_dispatch。pages 历史文件不修改，旧维护变量 `ERROR_DIAGNOSTICS_MAINTENANCE` 应关闭，防止手工触发旧流程。

管理员命令仍可使用：`npm run errors:prune` 仅预览；`npm run errors:prune -- --apply` 执行远程清理。首次 Cron 真实执行前，只能记为“配置完成、逻辑已验证”；执行后在 Workers 日志检查 `diagnostic-retention-complete`。

## 回退与验收记录

Workers 发布失败可回滚 Worker 版本，或暂时恢复旧入口。保留 pages 分支和旧 Pages 部署；代码回滚不回滚共享 D1 数据。暂不启用灰度、Smart Placement 或读副本。

仓库测试不代表控制台已连接或 Secret 已配置。上线时记录部署版本、时间、路由检查、专用账户验收、诊断和首轮 Cron 结果；未完成项明确保留，不能标记整站已经通过线上验收。

本次迁移的实际检查结果、既有测试失败和待上线事项见 [迁移验收记录](workers-validation.md)。
