// 专项清理文案：清理项目、账号选择、授权提示、清理结果和失败原因文字。
import type { LocaleMessages } from '../types'
import { formatMessageFileSize } from '../formatters'
import type { RelatedCleanupFailureReason } from '../../utils/file-system/cleanupFileSystem'

export const cleanupZh: LocaleMessages['cleanup'] = {
  dialogTitle: '专项清理',
  dialogCloseAria: '关闭专项清理窗口',
  authHint: '使用清理功能需要先授权 X6Game 文件夹。清理会直接删除电脑中的文件，且不可恢复。',
  authorize: '授权文件夹',
  reauthorize: '重新授权',
  authorizedAs: (name) => `已授权：${name}`,
  clean: '清理',
  cleaning: '清理中...',
  items: {
    lowQuality: {
      title: '低画质图片和截图',
      path: '...\\X6Game\\ScreenShot 与 NikkiPhotos_LowQuality',
      description: '游戏拍照后产生的画质较低的图片'
    },
    crashes: {
      title: '游戏崩溃时的快照信息',
      path: '...\\X6Game\\Saved\\Crashes',
      description: '删除后将无法通过本地日志向官方反馈历史崩溃原因'
    },
    logs: {
      title: '游戏运行日志',
      path: '...\\X6Game\\Saved\\Logs',
      description: '删除后无影响'
    },
    webcache: {
      title: '游戏内置浏览器与登录器缓存',
      path: '...\\X6Game\\Saved\\webcache_4430',
      description: '清理过期网页数据，但初次打开活动页面或公告时会加载变慢'
    }
  },
  confirmDirectoryCleanupTitle: '确认清空文件夹',
  confirmDirectoryCleanup: (title, count, size) =>
    `确定清空「${title}」文件夹吗？共 ${count} 个文件，约 ${size}。文件夹本身会保留，删除后不可恢复。`,
  directoryCleanupStatus: (title, deletedCount, deletedBytes, failures, missingDirectories) => {
    const released = formatMessageFileSize(deletedBytes)
    const reasonText: Record<RelatedCleanupFailureReason, string> = {
      'unreadable-size': '无法读取文件大小，已跳过删除',
      'remove-failed': '文件可能被占用或目录权限已失效'
    }
    const failedText = failures.length
      ? `；${failures.length} 项未清理：${failures.map((failure) => `${failure.path}（${reasonText[failure.reason]}）`).join('、')}`
      : ''
    const missingText = missingDirectories.length
      ? `；未找到并已跳过：${missingDirectories.join('、')}`
      : ''
    return `已清理「${title}」${deletedCount} 个文件，释放 ${released}${failedText}${missingText}。`
  },
  noDirectoryFilesToClean: (title, missingDirectories) =>
    missingDirectories.length
      ? `没有找到可清理的文件；未找到并已跳过：${missingDirectories.join('、')}。`
      : `「${title}」文件夹中没有可清理的文件。`,
  accountDialogTitle: '选择要清理的账号',
  accountDialogMessage: '检测到多个账号文件夹，请选择要清理的账号 id，或勾选清理全部账号。',
  accountInputLabel: '账号 id',
  accountSelectPlaceholder: '请选择账号 id',
  allAccounts: '清理全部账号',
  rememberChoice: '记住我的选择',
  accountConfirm: '继续',
  accountCancel: '取消'
}
export const cleanupEn: LocaleMessages['cleanup'] = {
  dialogTitle: 'Targeted cleanup',
  dialogCloseAria: 'Close cleanup window',
  authHint:
    'Cleanup requires authorizing the X6Game folder first. Cleanup permanently deletes files from your computer and cannot be undone.',
  authorize: 'Authorize folder',
  reauthorize: 'Re-authorize',
  authorizedAs: (name) => `Authorized: ${name}`,
  clean: 'Clean',
  cleaning: 'Cleaning...',
  items: {
    lowQuality: {
      title: 'Low-quality photos & screenshots',
      path: '...\\X6Game\\ScreenShot and NikkiPhotos_LowQuality',
      description: 'Lower-quality images generated after taking photos in game'
    },
    crashes: {
      title: 'Crash snapshots',
      path: '...\\X6Game\\Saved\\Crashes',
      description:
        'After deletion, historical crashes can no longer be reported to the official team via local logs'
    },
    logs: {
      title: 'Game runtime logs',
      path: '...\\X6Game\\Saved\\Logs',
      description: 'No impact after deletion'
    },
    webcache: {
      title: 'Built-in browser & launcher cache',
      path: '...\\X6Game\\Saved\\webcache_4430',
      description:
        'Clears expired web data, but event pages and announcements will load slower the first time afterward'
    }
  },
  confirmDirectoryCleanupTitle: 'Confirm folder cleanup',
  confirmDirectoryCleanup: (title, count, size) =>
    `Clear the "${title}" folder? It contains ${count} files, about ${size}. The folder itself will be kept. This cannot be undone.`,
  directoryCleanupStatus: (title, deletedCount, deletedBytes, failures, missingDirectories) => {
    const reasonText: Record<RelatedCleanupFailureReason, string> = {
      'unreadable-size': 'Could not read the file size, so deletion was skipped',
      'remove-failed': 'The file may be in use or folder permission may have expired'
    }
    const failedText = failures.length
      ? `; ${failures.length} entries not cleaned: ${failures.map((failure) => `${failure.path} (${reasonText[failure.reason]})`).join(', ')}`
      : ''
    const missingText = missingDirectories.length
      ? `; not found and skipped: ${missingDirectories.join(', ')}`
      : ''
    return `Cleaned ${deletedCount} files from "${title}" and released ${formatMessageFileSize(deletedBytes)}${failedText}${missingText}.`
  },
  noDirectoryFilesToClean: (title, missingDirectories) =>
    missingDirectories.length
      ? `No files to clean; not found and skipped: ${missingDirectories.join(', ')}.`
      : `No files to clean in "${title}".`,
  accountDialogTitle: 'Choose accounts to clean',
  accountDialogMessage:
    'Multiple account folders were detected. Choose the account ID to clean, or check the option to clean all accounts.',
  accountInputLabel: 'Account ID',
  accountSelectPlaceholder: 'Choose an account ID',
  allAccounts: 'Clean all accounts',
  rememberChoice: 'Remember my choice',
  accountConfirm: 'Continue',
  accountCancel: 'Cancel'
}
