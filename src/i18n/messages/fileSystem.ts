// 文件系统文案：目录选择、浏览器权限、授权失败、目录校验和兼容性提示文字。
import type { LocaleMessages } from '../types'

export const fileSystemZh: LocaleMessages['fileSystem'] = {
  permissionQueryTimeout:
    '已保存的目录授权查询超时，请重新选择目录：相册请点击“选择/恢复相册路径”重新选择原文件夹；游戏目录请重新授权 X6Game。',
  readFailed: '读取相册失败，请重试。',
  systemDirectory:
    '浏览器可能将所选文件夹识别为敏感或受保护目录，因此拒绝网页访问，比如文件夹放在 C 盘 Program Files 文件夹中。即使选择了正确的游戏相册文件夹，也可能出现此问题。\n相册可尝试菜单中的“兼容打开（只读）”；需要管理原文件时，可将文件夹复制到普通目录再选择。',
  abortSelection: '未完成文件夹选择。如果选择被浏览器拒绝，可尝试相册菜单中的“兼容打开（只读）”。',
  permissionRequired:
    '已记住上次相册路径，但浏览器需要重新授权。请点击“选择/恢复相册路径”完成授权。',
  unsupportedBrowser:
    '当前浏览器不支持选择文件夹。请使用电脑上的最新版 Chrome、Edge 或其他兼容的 Chromium 浏览器，并在 localhost/HTTPS 环境运行。',
  mobileBrowserUnsupported:
    '手机浏览器不支持目录授权。请使用电脑上的 Chrome、Edge 或其他兼容的 Chromium 浏览器打开网站并选择相册文件夹。',
  invalidX6GameDirectory:
    '所选目录不是当前相册对应的 X6Game 文件夹，请选择路径中的 X6Game 文件夹后重试。',
  restoreX6GamePermissionPrompt:
    '已保存的 X6Game 文件夹授权已经失效。点击“继续授权”后，请在浏览器权限窗口中允许本站点编辑该文件夹；如果浏览器无法恢复授权，页面会再提示你重新选择 X6Game 文件夹，用于专项清理和自动读取最新搭配码。',
  selectX6GameDirectoryPrompt:
    '授权后可使用专项清理、自动读取游戏最新搭配码的功能。请在接下来的窗口中选择路径里的 X6Game 文件夹（...\\InfinityNikki Launcher\\InfinityNikki\\X6Game）。授权会被保存，后续可直接使用。'
}
export const fileSystemEn: LocaleMessages['fileSystem'] = {
  permissionQueryTimeout:
    'Checking saved folder access timed out. Use “Choose / restore album folder” to select the original album folder again, or reauthorize X6Game for the game folder.',
  readFailed: 'Failed to read the album. Please try again.',
  systemDirectory:
    'The browser may identify the selected folder as sensitive or protected and deny access, for example if it is inside C:\\Program Files. This can happen even when you select the correct game album folder.\nFor albums, try “Compatibility open (read-only)” in the album menu. To manage files, copy the folder to a regular directory and select the copy.',
  abortSelection:
    'Folder selection was not completed. If the browser rejected it, try “Compatibility open (read-only)” in the album menu.',
  permissionRequired:
    'The last album folder is remembered, but the browser needs permission again. Click “Choose / restore album folder” to authorize it.',
  unsupportedBrowser:
    'This browser does not support folder selection. Please use the latest desktop version of Chrome, Edge, or another compatible Chromium browser and run on localhost/HTTPS.',
  mobileBrowserUnsupported:
    'Mobile browsers do not support folder authorization. Open this site in Chrome, Edge, or another compatible Chromium browser on a computer to select an album folder.',
  invalidX6GameDirectory:
    'The selected folder is not the X6Game folder that contains the current album. Select that X6Game folder and try again.',
  restoreX6GamePermissionPrompt:
    'The saved X6Game folder permission has expired. Click “Continue authorization”, then allow this site to edit the folder in the browser permission prompt. If the browser cannot restore access, the page will ask you to select X6Game again.',
  selectX6GameDirectoryPrompt:
    'Authorize the X6Game folder for the current game installation to use targeted cleanup and automatically read the latest in-game outfit code. Select the X6Game folder in the next folder picker (...\\InfinityNikki Launcher\\InfinityNikki\\X6Game). The authorization will be remembered for future use.'
}
