export const compatibleAlbumMessages = {
  zh: {
    open: '兼容打开（只读）',
    reselect: '重新选择文件夹',
    readOnly: '只读',
    openingHint: '若浏览器拒绝访问 X6Game，可用「兼容打开（只读）」直接选择高画质相册。',
    reloadHint: '只读模式刷新网页后需重新选择文件夹，无法自动恢复读取。',
    hint: '无法修改原文件；查看新照片或刷新网页后，需重新选择文件夹。照片仅在本地读取。',
    writeDisabled: '兼容只读模式无法修改原文件',
    empty: '所选文件夹根目录没有可读取的图片，请选择直接存放照片的文件夹。',
    restore: '上次使用兼容只读模式，请重新选择文件夹。普通模式的目录授权仍保留。',
    cancelled: '已取消选择文件夹。',
    exporting: '正在准备照片下载…',
    exported: '照片已准备好，请保存下载文件。',
    trash: '兼容只读模式不加载最近删除，无法删除或恢复原文件。'
  },
  en: {
    open: 'Compatibility open (read-only)',
    reselect: 'Select folder again',
    readOnly: 'Read-only',
    openingHint:
      'If the browser denies access to X6Game, use “Compatibility open (read-only)” to select the high-quality album directly.',
    reloadHint:
      'In read-only mode, reloading the page requires selecting the folder again. Access cannot be restored automatically.',
    hint: 'Original files cannot be changed. Select the folder again for new photos or after reloading the page. Photos are read locally.',
    writeDisabled: 'Original files cannot be changed in compatibility mode',
    empty:
      'No readable images in the selected folder root. Select the folder containing your photos directly.',
    restore:
      'Select your folder again to resume compatibility mode. Your normal directory authorization is retained.',
    cancelled: 'Folder selection canceled.',
    exporting: 'Preparing photo downloads…',
    exported: 'Photos are ready. Save the download files.',
    trash:
      'Recently deleted items are unavailable in compatibility mode. Original files cannot be deleted or restored.'
  }
}

export const ALBUM_ACCESS_MODE_KEY = 'infinity-nikki-album-access-mode'
