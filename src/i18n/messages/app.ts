// 应用级文案：相册初始化、状态提示、授权、清理确认和数据管理相关文字。
import type { LocaleMessages } from '../types'
import { formatMessageFileSize } from '../formatters'
import type { RelatedCleanupFailureReason } from '../../utils/file-system/cleanupFileSystem'

export const appZh: LocaleMessages['app'] = {
  noDirectory: '尚未选择相册路径',
  initialStatus:
    '请选择包含无限暖暖截图的文件夹，推荐直接选择 NikkiPhotos_HighQuality 图片文件夹。',
  readingStatus: '正在读取相册，请稍候...',
  restoringStatus: '正在恢复上次选择的相册路径...',
  restoreFailedStatus: '恢复上次相册路径失败，请重新选择文件夹。',
  restorePathFailedStatus: '上次记住的路径无法恢复，请重新选择相册文件夹。',
  readFailedStatus: '读取相册失败，请重试。',
  databaseDisconnected:
    '浏览器本地数据库连接已中断，本次操作未能完成。请先保存其他未完成的编辑，再刷新页面重试。',
  clearedStatus: '已清除记住的相册路径。需要继续管理相册时，请重新选择文件夹。',
  operationNoticeTitle: '操作提示',
  copySucceeded: '复制成功。',
  copyFailed: (value) => `复制失败，请手动复制：${value}`,
  operationNoticeCloseAria: '关闭操作提示',
  preferencesUpdating: '正在应用设置...',
  clearCacheDialogTitle: '清除缓存',
  clearCacheConfirmMessage:
    '只清除保存在当前浏览器中的搭配码、家园方案码和照片动作解析缓存，不会影响其他授权、设置或电脑里的文件。',
  clearCacheStatus: '搭配码、家园方案码和照片动作解析缓存已清除。',
  authorizeX6GameStatus: 'X6Game 文件夹授权已完成。',
  x6GameAuthorizationCancelledStatus:
    '已取消 X6Game 文件夹授权。后续进入搭配码界面将不再自动弹出授权窗口，可在当前相册下拉框中点击“授权 X6Game”手动授权。',
  clearDataDialogTitle: '清除浏览器中的全部数据？',
  clearDataFirstConfirmMessage: '此操作无法撤销，请先导出备份。',
  clearDataSections: [
    {
      title: '将清除',
      items: [
        '搭配、家园方案、共鸣记录、个人衣橱与照片收藏标记',
        '相机参数收藏，以及已保存的图片、封面和标签',
        '解析缓存、UID、目录授权、迁移记录及设置'
      ]
    },
    {
      title: '会保留',
      text: '云端账号与存档，电脑原始照片、游戏文件和已导出的备份。不会主动退出云端登录。'
    }
  ],
  clearDataConsequence: '清除完成后，页面将自动刷新并恢复初始状态。',
  clearDataBackup: '先导出备份',
  clearDataConfirm: '清除全部数据',
  clearDataStatus: '当前浏览器的网站数据已清除，云端存档保留；正在重新加载并恢复初始状态。',
  languageUpdated: '语言切换成功。',
  themeUpdated: '主题切换成功。',
  movingPhotosToTrash: '正在移入最近删除...',
  restoringPhotos: '正在恢复照片...',
  permanentlyDeletingPhotos: '正在永久删除照片...',
  importingPhotos: '正在导入照片...',
  exportingPhotos: '正在导出照片...',
  importCompleted: (succeeded, failed) =>
    `已导入 ${succeeded} 张照片${failed ? `，${failed} 张失败` : ''}。`,
  exportCompleted: (succeeded, failed) =>
    `已导出 ${succeeded} 张照片${failed ? `，${failed} 张失败` : ''}。`,
  exportCancelled: (completed) =>
    `导出已取消，已保留 ${completed} 个已完成的目标文件，源照片未修改。`,
  exportMoveSourceTitle: '移动源照片',
  exportMoveSourceConfirm: (count) => `导出成功。是否将 ${count} 张成功导出的源照片移入最近删除？`,
  exportTargetInvalid: '不能选择当前相册目录或其 trash 目录作为导出目标。',
  transferClose: '关闭',
  transferCancel: '取消导出',
  transferFailed: '失败',
  transferCancelled: '导出已取消，已完成文件和全部源照片均已保留。',
  dialogCloseAria: '关闭弹窗',
  dialogCancel: '取消',
  dialogConfirm: '确认删除',
  relatedPhotoDeleteDialogTitle: '永久删除对应低画质图片',
  confirmRelatedPhotoDelete: (count, skippedDirectories) =>
    `将永久删除 ScreenShot 与 NikkiPhotos_LowQuality 中匹配选中照片名称的 ${count} 张图片。此操作无法恢复，且不会删除当前相册中的选中照片本体。${skippedDirectories.length ? `\n因当前相册位于目标目录，已跳过：${skippedDirectories.join('、')}。` : ''}确定继续吗？`,
  relatedPhotoDeleteCancelledStatus: '已取消删除，没有删除图片。',
  relatedPhotoDeleteStatus: (deletedCount, failures) =>
    `已永久删除 ${deletedCount} 张对应低画质图片${failures.length ? `；${failures.length} 张删除失败：${failures.map((failure) => failure.path).join('、')}` : '。'}`,
  noMatchingRelatedPhotos: (missingDirectories, skippedDirectories) => {
    const details = [
      ...(missingDirectories.length ? [`目录不存在：${missingDirectories.join('、')}`] : []),
      ...(skippedDirectories.length
        ? [`为保护当前相册已跳过：${skippedDirectories.join('、')}`]
        : [])
    ]
    return details.length
      ? `没有找到匹配的低画质图片（${details.join('；')}）。`
      : '未找到与选中照片同名的低画质图片。'
  },
  dialogContinueAuthorization: '继续授权',
  dialogOk: '我知道了',
  relatedCleanupDialogTitle: '确认清理低画质图片和截图',
  x6GameDirectoryDialogTitle: '授权 X6Game 文件夹',
  albumContentAria: '图片展示区',
  rememberedDirectory: (name) => `已记住：${name}`,
  successStatus: (count, prefix) => {
    const prefixText = prefix === 'restored' ? '已恢复' : '已读取'
    return count ? `${prefixText} ${count} 张照片，` : '这个文件夹里没有找到符合命名格式的图片。'
  },
  successSuffix: (suffix) =>
    suffix === 'continued' ? '已继续使用上次记住的相册文件夹。' : '已记住本次选择的相册文件夹。',
  relatedCleanupCancelledStatus: '已取消清理，没有删除任何图片。',
  confirmRelatedCleanup: (count, missingDirectories, cleanupScope) => {
    const missingText = missingDirectories.length
      ? `\n未找到并将跳过：${missingDirectories.join('、')}。`
      : ''
    if (cleanupScope) {
      const remainingText = cleanupScope.remainingTargetNames.join(' 和 ')
      const scopeText = `当前相册为 ${cleanupScope.skippedAlbumName}，包含在低画质图片和截图里，本次清理只会清理 ${remainingText}，建议管理 NikkiPhotos_HighQuality 相册。`
      return `${scopeText}\n确定删除 ${remainingText} 文件夹中的 ${count} 张图片吗？${missingText}`
    }
    return `确定删除 NikkiPhotos_LowQuality 和 ScreenShot 文件夹中的 ${count} 张图片吗？${missingText}`
  },
  relatedCleanupStatus: (deletedCount, deletedBytes, failures, missingDirectories) => {
    const released = formatMessageFileSize(deletedBytes)
    const reasonText: Record<RelatedCleanupFailureReason, string> = {
      'unreadable-size': '无法读取文件大小，但仍尝试删除；释放容量可能少计',
      'remove-failed': '文件可能被占用或目录权限已失效'
    }
    const failedText = failures.length
      ? `；${failures.length} 张未清理：${failures.map((failure) => `${failure.path}（${reasonText[failure.reason]}）`).join('、')}`
      : ''
    const missingText = missingDirectories.length
      ? `；未找到并已跳过：${missingDirectories.join('、')}`
      : ''
    return `已清理 ${deletedCount} 张图片，释放 ${released}${failedText}${missingText}。`
  },
  noRelatedPhotos: (missingDirectories) =>
    missingDirectories.length
      ? `没有找到可清理的图片；未找到并已跳过：${missingDirectories.join('、')}。`
      : 'NikkiPhotos_LowQuality 和 ScreenShot 文件夹中没有可清理的图片。'
}
export const appEn: LocaleMessages['app'] = {
  noDirectory: 'No album folder selected',
  initialStatus:
    'Choose the folder that contains your Infinity Nikki screenshots. NikkiPhotos_HighQuality is recommended.',
  readingStatus: 'Reading album, please wait...',
  restoringStatus: 'Restoring the last selected album folder...',
  restoreFailedStatus: 'Failed to restore the last album folder. Please choose the folder again.',
  restorePathFailedStatus:
    'The remembered folder cannot be restored. Please choose the album folder again.',
  readFailedStatus: 'Failed to read the album. Please try again.',
  databaseDisconnected:
    'The connection to local browser storage was lost and this operation could not finish. Save any other unsaved edits, then reload the page and retry.',
  clearedStatus:
    'The remembered album folder has been cleared. Choose a folder again to continue managing your album.',
  operationNoticeTitle: 'Operation update',
  copySucceeded: 'Copied successfully.',
  copyFailed: (value) => `Copy failed. Copy manually: ${value}`,
  operationNoticeCloseAria: 'Close operation update',
  preferencesUpdating: 'Applying settings...',
  clearCacheDialogTitle: 'Clear cache',
  clearCacheConfirmMessage:
    'This only clears the outfit-code, home-scheme-code, and photo-action parse caches stored in this browser. Other authorizations, settings, and files on your computer are not affected.',
  clearCacheStatus: 'Outfit-code, home-scheme-code, and photo-action parse caches cleared.',
  authorizeX6GameStatus: 'X6Game folder authorization completed.',
  x6GameAuthorizationCancelledStatus:
    'X6Game folder authorization was canceled. The authorization window will no longer open automatically when entering Outfit Codes; use Authorize X6Game from the Current album menu when needed.',
  clearDataDialogTitle: 'Clear all data in this browser?',
  clearDataFirstConfirmMessage: 'This cannot be undone. Export a backup first.',
  clearDataSections: [
    {
      title: 'Will be cleared',
      items: [
        'Outfits, home schemes, resonance records, personal wardrobe and photo favorites',
        'Camera parameter favorites and saved images, covers and tags',
        'Parsing caches, UIDs, folder permissions, migration records and settings'
      ]
    },
    {
      title: 'Will be kept',
      text: 'Your cloud account and saves, original photos and game files on your computer, and exported backups. You will not be actively signed out of the cloud.'
    }
  ],
  clearDataConsequence: 'The page will reload and return to its initial state after clearing.',
  clearDataBackup: 'Export a backup first',
  clearDataConfirm: 'Clear all data',
  clearDataStatus:
    'Website data in this browser cleared; cloud saves remain. Reloading to restore the initial state.',
  languageUpdated: 'Language updated successfully.',
  themeUpdated: 'Theme updated successfully.',
  movingPhotosToTrash: 'Moving photos to Recently Deleted...',
  restoringPhotos: 'Restoring photos...',
  permanentlyDeletingPhotos: 'Permanently deleting photos...',
  importingPhotos: 'Importing photos...',
  exportingPhotos: 'Exporting photos...',
  importCompleted: (succeeded, failed) =>
    `Imported ${succeeded} photos${failed ? `; ${failed} failed` : ''}.`,
  exportCompleted: (succeeded, failed) =>
    `Exported ${succeeded} photos${failed ? `; ${failed} failed` : ''}.`,
  exportCancelled: (completed) =>
    `Export cancelled. ${completed} completed target files were kept and source photos were unchanged.`,
  exportMoveSourceTitle: 'Move source photos',
  exportMoveSourceConfirm: (count) =>
    `Export completed. Move ${count} successfully exported source photos to Recently Deleted?`,
  exportTargetInvalid:
    'The current album folder and its trash folder cannot be used as export targets.',
  transferClose: 'Close',
  transferCancel: 'Cancel export',
  transferFailed: 'Failed',
  transferCancelled: 'Export cancelled. Completed files and all source photos were kept.',
  dialogCloseAria: 'Close dialog',
  dialogCancel: 'Cancel',
  dialogConfirm: 'Confirm delete',
  relatedPhotoDeleteDialogTitle: 'Permanently delete matching low-quality photos',
  confirmRelatedPhotoDelete: (count, skippedDirectories) =>
    `Permanently delete ${count} image(s) matching the selected photo names in ScreenShot and NikkiPhotos_LowQuality? This cannot be undone. The selected source photos in the current album will not be deleted.${skippedDirectories.length ? `\nSkipped to protect the current album: ${skippedDirectories.join(', ')}.` : ''}`,
  relatedPhotoDeleteCancelledStatus: 'Deletion cancelled. No images were deleted.',
  relatedPhotoDeleteStatus: (deletedCount, failures) =>
    `Permanently deleted ${deletedCount} matching low-quality photo(s)${failures.length ? `; ${failures.length} failed: ${failures.map((failure) => failure.path).join(', ')}` : '.'}`,
  noMatchingRelatedPhotos: (missingDirectories, skippedDirectories) => {
    const details = [
      ...(missingDirectories.length
        ? [`directories not found: ${missingDirectories.join(', ')}`]
        : []),
      ...(skippedDirectories.length
        ? [`skipped to protect the current album: ${skippedDirectories.join(', ')}`]
        : [])
    ]
    return details.length
      ? `No matching low-quality photos found (${details.join('; ')}).`
      : 'No low-quality photos matching the selected photo names were found.'
  },
  dialogContinueAuthorization: 'Continue authorization',
  dialogOk: 'Got it',
  relatedCleanupDialogTitle: 'Clean low-quality photos & screenshots?',
  x6GameDirectoryDialogTitle: 'X6Game folder authorization required',
  albumContentAria: 'Photo gallery',
  rememberedDirectory: (name) => `Remembered: ${name}`,
  successStatus: (count, prefix) => {
    const prefixText = prefix === 'restored' ? 'Restored' : 'Loaded'
    return count
      ? `${prefixText} ${count} photos. `
      : 'No images matching the filename pattern were found in this folder.'
  },
  successSuffix: (suffix) =>
    suffix === 'continued'
      ? 'Continued using the remembered album folder.'
      : 'Remembered this album folder.',
  relatedCleanupCancelledStatus: 'Cleanup cancelled. No images were deleted.',
  confirmRelatedCleanup: (count, missingDirectories, cleanupScope) => {
    const missingText = missingDirectories.length
      ? `\nNot found and skipped: ${missingDirectories.join(', ')}.`
      : ''
    if (cleanupScope) {
      const remainingText = cleanupScope.remainingTargetNames.join(' and ')
      const scopeText = `The current album is ${cleanupScope.skippedAlbumName}, which is included in low-quality photos & screenshots. This cleanup will only clean ${remainingText}. We recommend managing the NikkiPhotos_HighQuality album instead.`
      return `${scopeText}\nDelete ${count} images from ${remainingText}?${missingText}`
    }
    return `Delete ${count} images from NikkiPhotos_LowQuality and ScreenShot?${missingText}`
  },
  relatedCleanupStatus: (deletedCount, deletedBytes, failures, missingDirectories) => {
    const reasonText: Record<RelatedCleanupFailureReason, string> = {
      'unreadable-size':
        'Could not read the file size; deletion was still attempted and released space may be understated',
      'remove-failed': 'The file may be in use or folder permission may have expired'
    }
    const failedText = failures.length
      ? `; ${failures.length} skipped: ${failures.map((failure) => `${failure.path} (${reasonText[failure.reason]})`).join(', ')}`
      : ''
    const missingText = missingDirectories.length
      ? `; not found and skipped: ${missingDirectories.join(', ')}`
      : ''
    return `Cleaned ${deletedCount} images and released ${formatMessageFileSize(deletedBytes)}${failedText}${missingText}.`
  },
  noRelatedPhotos: (missingDirectories) =>
    missingDirectories.length
      ? `No images were available to clean; not found and skipped: ${missingDirectories.join(', ')}.`
      : 'No images were found in NikkiPhotos_LowQuality or ScreenShot.'
}
