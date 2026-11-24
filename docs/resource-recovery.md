# 资源发布与错误恢复

构建资源使用同源 `/assets/` 路径。部署预览域名可能启用 Cloudflare Access，将公开首页的脚本和样式指向它可能返回登录页并导致白屏。

新版本发布后，旧页面请求已不存在的哈希资源时，通过现有资源错误提示和确认刷新恢复；不保证旧版本资源永久可用。

Workers 使用 assets-first 和显式 Worker 回退：真实文件由 Static Assets 返回；/api 与 /api/* 始终进入 Worker；缺失资源返回 no-store 的 404；普通页面 GET/HEAD 回退 /index.html。不再使用 Pages 的 _routes.json 或嵌套 404 页面。CORS、nosniff 和用户脚本类型由 public/_headers 设置。详见 [Workers 部署](workers-deployment.md)。

目录资源使用带哈希的 JSON 文件和可取消的 fetch。每次请求覆盖响应及正文的 12 秒期限；失败任务释放，重试新建请求，成功结果共享。衣橱保留 15 秒整体期限，并在实际执行位置记录 read-storage、wait-animation、load-catalog、resolve-suits、write-storage 的累计耗时。超时后旧调用失效，晚到结果不能覆盖当前视图；不会清空用户存档。

错误事件沿用统一的 buildId/gitCommit，额外记录资源路径、HTTP 状态、Content-Type、耗时和超时标志。不会上传 JSON 正文、照片名称、目录路径或凭据。导入资源错误沿用“导入失败，请重试。”。

普通删除与导出后移动共用同一执行流程和状态清理。照片导出后移动原文件失败时，显示“照片已导出，但原照片移到最近删除失败”，结束加载并释放操作状态。准备阶段记录 read-metadata/create-trash-directory；逐文件阶段记录 read-source/create-trash-file/copy-to-trash/transfer-note/remove-source。日志用于定位具体失败操作，不能单凭 NoModificationAllowedError 判断操作系统原因。
