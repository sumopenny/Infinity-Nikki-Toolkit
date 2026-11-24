---
name: release-tag-release
description: 发布 Infinity Nikki Toolkit 的 Git tag 与 GitHub/Gitee Release。用于确定版本边界、创建 annotated tag、同步双远端、生成中文 Release、处理 Gitee 排序和执行发布后核验。
---

# 发布 Tag 与 Release

## 目标与边界

本技能只沉淀发布流程，不自动保存令牌，不默认上传附件，不修改代码。所有外部写操作前必须先完成只读核对；删除或重建云端 Release 必须得到用户明确确认。

## 1. 发布前核对

1. 确认工作区干净：`git status --short`。发现无关改动时停止并说明。
2. 确认远端：`origin` 为 GitHub，`gitee` 为 Gitee。
3. 从 `main`、`src/i18n.ts`、`log.md`、README 和提交记录确认版本号、用户可见更新内容及发布范围。
4. 发布 tag 默认指向发布时 `main` 的当前最新提交：创建前以 `git rev-parse main` 记录目标 commit，并以该 commit 创建 tag。只有用户明确指定其他 commit 时才例外。
5. 检查本地与远端是否已有同名 tag/Release；默认不覆盖。

## 2. Tag 规则

- 正式版本使用 annotated tag，说明使用中文；轻量 tag 只适合临时标记。
- `v1.x` 的 Release 标题可以是“tag + 核心功能”，例如 `v1.3 新增专项清理功能`。
- `v1.x.x` 的 Release 标题只使用 tag 名。
- `1.x.0` 版本形式使用 `v1.x`，例如 `v1.3.0` 应写为 `v1.3`。
- 当前项目历史映射（仅作校验基准，未来版本必须重新确认）：

  | Tag | Commit |
  | --- | --- |
  | `v1.2.1` | `6ea65d8` |
  | `v1.2.2` | `e55e242` |
  | `v1.2.3` | `c091c86` |
  | `v1.3` | `a642f8a` |
  | `v1.3.1` | `07e1e9b` |
  | `v1.3.2` | `c06704e` |

创建后用 `git cat-file -t <tag>` 确认类型，用 `git rev-list -1 <tag>` 确认 commit。

## 3. 双远端同步

1. 本地创建并校验所有 annotated tag。
2. 分别推送：`git push origin <tags...>`、`git push gitee <tags...>`。
3. 用 `git ls-remote --tags origin` 和 `git ls-remote --tags gitee` 对比 tag 对象及其 peeled commit。
4. 任一远端失败时停止，不重复创建；记录失败原因，修复凭据或权限后再继续。

## 4. Release 标题与正文

GitHub 与 Gitee 必须使用完全一致的标题和正文。正文固定先放版本更新，再放在线使用：

```markdown
## 更新内容

- 列出该 tag 对应的用户可见变更。

## 在线使用

本网站可直接访问：

[https://nikkicube.sumopenny.workers.dev/](https://nikkicube.sumopenny.workers.dev/)

本地部署教程可查看 README。

如果遇到问题，请及时通过网站反馈入口、GitHub/Gitee 的 Issues 或作者社交平台反馈。
```

默认全部为正式 Release、无附件；根据网站目前最新版本标记为最新。Release 必须绑定现有 tag，不重新指定其他 commit。

## 5. 平台与凭据

- GitHub 可用 API、GitHub CLI 或等效工具。创建前检查同名 Release，存在时停止，避免覆盖。
- Gitee 优先使用已配置的 `gitee-release-cli` 令牌/API。CLI 可用于令牌配置和基础发布；当需要为多个既有 tag 指定自定义标题和正文时，使用同一令牌调用 Gitee Release API。
- Gitee 令牌只在本机配置，不能写入项目、日志、命令脚本、聊天或提交记录。
- API 返回 401、403、访问受限或其他错误时，读取并报告错误后停止；不得猜测权限、重复提交或绕过限制。

## 6. 发布后验收

- GitHub/Gitee 各目标 Release 数量正确、tag 名正确。
- 标题符合 `v1.x` / `v1.x.x` 规则，正文第一节为 `## 在线使用`。
- `draft=false`、`prerelease=false`、附件为空；最新版本标记符合用户指定。
- Release 使用的 tag 与预期 commit 一致，双远端 tag 哈希一致。
- Gitee API 返回顺序符合预期；必要时检查页面展示顺序。
- 最后运行 `git status --short` 和 `git diff --check`，报告实际创建、删除、重建和任何未完成项。
