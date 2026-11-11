// 网格内容文案：照片卡片、空状态、备注、日期分组和图片操作相关文字。
import type { LocaleMessages } from '../types'

export const gridZh: LocaleMessages['grid'] = {
  emptyTitle: '开始整理你的暖暖摄影作品',
  emptyDescription: '选择高画质相册文件夹后，照片会按拍摄日期自动整理。',
  emptyFavoritesTitle: '收藏夹还是空的',
  emptyFavoritesDescription: '点击照片右上角的爱心，即可加入收藏夹。',
  recommendedPath:
    '推荐文件路径：\\InfinityNikki Launcher\\InfinityNikki\\X6Game\\Saved\\GamePlayPhotos\\你的id\\NikkiPhotos_HighQuality',
  hiddenFolderTip: '如果找不到 GamePlayPhotos，在文件夹上方栏点击“查看”→显示→隐藏的项目→点击勾选',
  selectDay: '选择这一天',
  addFavorite: '加入收藏夹',
  removeFavorite: '取消收藏',
  imageLoadFailed: '图片读取失败',
  editNote: '编辑备注',
  notePrompt: '请输入照片备注（最多15个字符）',
  noteSaved: '照片备注已保存。',
  noteSaveErrors: {
    invalid: '相册备注文件损坏或格式不受支持，已停止写入。请先备份并修复 album-metadata.json。',
    changed:
      '这张照片的备注已被其他窗口修改。当前输入已保留，请复制需要的内容后关闭并重新打开编辑器。',
    lockUnavailable:
      '当前浏览器无法安全协调多个窗口的备注写入，请使用支持 Web Locks 的安全连接浏览器。',
    verificationFailed: '备注写入后的内容校验失败，请检查相册备注文件后重试。'
  },
  noteLabel: '备注',
  noteTitle: '编辑照片备注',
  notePlaceholder: '请输入备注',
  noteSave: '保存备注',
  noteCancel: '取消',
  noteClose: '关闭备注编辑',
  parsePhoto: '解析照片参数',
  autoParseActions: '自动解析动作',
  autoParseActionsHint:
    '使用按拍照动作分类的功能需打开此开关，关闭后重新开启可手动重试失败照片，注意照片多时解析网页会卡顿。',
  actionCount: (count) => `${count} 张照片`,
  photoCount: (count) => `${count} 张照片`
}
export const gridEn: LocaleMessages['grid'] = {
  emptyTitle: 'Start organizing your Infinity Nikki photography',
  emptyDescription:
    'Choose the high-quality album folder to organize photos automatically by capture date.',
  emptyFavoritesTitle: 'No favorites yet',
  emptyFavoritesDescription: 'Click the heart at the top right of a photo to add it to Favorites.',
  recommendedPath:
    'Recommended path: \\InfinityNikki Launcher\\InfinityNikki\\X6Game\\Saved\\GamePlayPhotos\\Your ID\\NikkiPhotos_HighQuality',
  hiddenFolderTip:
    'Can\'t find GamePlayPhotos? In the folder toolbar, click "View" → Show → Hidden items to check it.',
  selectDay: 'Select this day',
  addFavorite: 'Add to Favorites',
  removeFavorite: 'Remove from Favorites',
  imageLoadFailed: 'Failed to load image',
  editNote: 'Edit note',
  notePrompt: 'Enter a photo note (up to 15 characters)',
  noteSaved: 'Photo note saved.',
  noteSaveErrors: {
    invalid:
      'The album metadata file is damaged or unsupported. No write was made. Back up and repair album-metadata.json first.',
    changed:
      'Another window changed this photo note. Your input is preserved. Copy anything you need, then close and reopen the editor.',
    lockUnavailable:
      'This browser cannot safely coordinate note writes across windows. Use a browser supporting Web Locks in a secure context.',
    verificationFailed:
      'The saved note content could not be verified. Check the album metadata file before retrying.'
  },
  noteLabel: 'Note',
  noteTitle: 'Edit photo note',
  notePlaceholder: 'Enter a note',
  noteSave: 'Save note',
  noteCancel: 'Cancel',
  noteClose: 'Close note editor',
  parsePhoto: 'Parse photo parameters',
  autoParseActions: 'Auto-parse actions',
  autoParseActionsHint:
    'Enable this switch to classify photos by capture action. Turn it off and on again to retry failed photos. Note that parsing many photos may slow down the page.',
  actionCount: (count) => `${count} photos`,
  photoCount: (count) => `${count} photos`
}
