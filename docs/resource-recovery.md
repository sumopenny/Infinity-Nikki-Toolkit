# 资源发布与错误恢复

Cloudflare Pages 自动构建提供 `CF_PAGES_URL`（当前部署 URL）。构建只接受带 8–64 位十六进制部署前缀的 pages.dev 地址，把 assets 地址绑定到该部署，避免旧页面随主域名切换到新版本后请求丢失的哈希资源。参考：https://developers.cloudflare.com/pages/configuration/build-configuration/

旧部署仍须保留且允许公开读取静态资源；删除历史部署或对部署地址启用访问验证，会使旧页面无法继续获取资源。没有部署 URL 的本地构建保持相对地址；手动上传需在构建前提供实际可访问的不可变部署地址，否则只能依赖刷新恢复。此变更不能追溯修复已经打开的旧版本页面。

`public/assets/404.html` 利用 Pages 最近一级 404 页面规则，让缺失资源返回不可缓存的 404，避免回退为应用首页；其他路径仍保持 SPA 回退。`public/_routes.json` 仅让 `/api/*` 进入 Functions，静态资源不消耗 Functions 调用。CORS 和 nosniff 由 `public/_headers` 设置。构建会把这三份静态配置一并复制到 dist。规则已通过本地 Wrangler 静态资源处理器验证；其他静态托管需要配置等效的 404 行为。参考：https://developers.cloudflare.com/pages/configuration/serving-pages/

目录资源使用带哈希的 JSON 文件和可取消的 fetch。每次请求覆盖响应及正文的 12 秒期限；失败任务释放，重试新建请求，成功结果共享。衣橱保留 15 秒整体期限，并在实际执行位置记录 read-storage、wait-animation、load-catalog、resolve-suits、write-storage 的累计耗时。超时后旧调用失效，晚到结果不能覆盖当前视图；不会清空用户存档。

错误事件沿用统一的 buildId/gitCommit，额外记录资源路径、HTTP 状态、Content-Type、耗时和超时标志。不会上传 JSON 正文、照片名称、目录路径或凭据。导入资源错误沿用“导入失败，请重试。”。

普通删除与导出后移动共用同一执行流程和状态清理。照片导出后移动原文件失败时，显示“照片已导出，但原照片移到最近删除失败”，结束加载并释放操作状态。准备阶段记录 read-metadata/create-trash-directory；逐文件阶段记录 read-source/create-trash-file/copy-to-trash/transfer-note/remove-source。日志用于定位具体失败操作，不能单凭 NoModificationAllowedError 判断操作系统原因。
