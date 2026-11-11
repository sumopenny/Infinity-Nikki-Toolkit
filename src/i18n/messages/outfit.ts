// 搭配码文案：搭配方案、标签、导入导出、批量操作、状态提示和使用指南文字。
import type { Language } from '../types'

export interface OutfitMessages {
  viewName: string
  tagsTitle: string
  all: string
  pending: string
  uncategorized: string
  addTag: string
  tagPlaceholder: string
  confirmAddTag: string
  reorderTag: string
  deleteTag: string
  importData: string
  importing: string
  exportData: string
  exporting: string
  duplicateCode: string
  unreadableRecords: (count: number) => string
  storageFull: string
  recordChanged: string
  operationFailed: string
  migrationComplete: (added: number, replaced: number, skipped: number, failed: number) => string
  migrationFailedItems: (names: string) => string
  migrationTagLimit: string
  migrationSourceChanged: string
  migrationDirectoryRemoved: string
  migrationCleanupFailed: string
  updating: string
  upToDate: string
  scanComplete: (added: number, failed: number) => string
  sharedImportResult: Record<
    'duplicate' | 'missing-image' | 'image-not-updated' | 'source-changed' | 'image-write-failed',
    string
  >
  addOutfit: string
  editTitle: string
  imageLabel: string
  imageHint: string
  replaceImage: string
  codeLabel: string
  codePlaceholder: string
  sourceLabel: string
  sourcePlaceholder: string
  sourceMultiple: string
  sourceInvalid: string
  openSource: string
  noteLabel: string
  notePlaceholder: string
  tagLabel: string
  noTag: string
  cancel: string
  confirm: string
  saving: string
  copy: string
  edit: string
  delete: string
  parse: string
  parseInputPlaceholder: string
  parseTitle: string
  parseLoading: string
  parseEmpty: string
  parseInvalidCode: string
  parseUnavailable: string
  parseRetry: string
  parseClose: string
  parseOpenDetail: (name: string) => string
  detailTitle: string
  detailClose: string
  detailPending: string
  detailLoadFailed: string
  detailOutfit: string
  detailCurrentItem: string
  detailOutfitUnavailable: string
  detailEvolution: string
  detailDyeCondition: string
  detailDyes: string
  detailArea: string
  detailPalette: string
  detailSlot: string
  detailColor: string
  parseItemCount: (count: number) => string
  emptyTitle: string
  emptyDescription: string
  imageRequired: string
  imageReading: string
  imageLoadFailed: string
  operations: {
    copyCode: string
    albumOpenedWithFailures: (failed: number) => string
    saveSucceeded: (wasEditing: boolean) => string
    invalidTag: (maxLength: number) => string
    duplicateOrReservedTag: string
    tagLimitReached: (maxTags: number) => string
    tagAdded: string
    deleteTagTitle: string
    deleteTagMessage: (tag: string, usedCount: number) => string
    tagDeleted: string
    copySucceeded: string
    copyFailed: (code: string) => string
    deleteOutfitTitle: string
    deleteSelectedTitle: string
    confirmPermanentDelete: string
    permanentlyDelete: string
    outfitDeleted: string
    deleteIncomplete: string
    deletingSelected: string
    deletedSelected: (deletedCount: number, failedCount: number) => string
    exportSucceeded: (fileName: string, count: number) => string
    rejectedTags: (count: number) => string
    importCompleted: (added: number, duplicates: number, failed: number, tagNote: string) => string
  }
  guideTitle: string
  guideFeaturedSection: { title: string; items: string[] }
  guideSections: Array<{ title: string; items: string[] }>
  guideDontShowAgain: string
  guideConfirm: string
  guideClose: string
  guideOpen: string
  count: (count: number) => string
}

export const outfitMessages: Record<Language, OutfitMessages> = {
  zh: {
    viewName: '搭配码',
    tagsTitle: '标签',
    all: '全部',
    pending: '待填写',
    uncategorized: '未分类',
    addTag: '添加标签',
    tagPlaceholder: '最多5个字符',
    confirmAddTag: '添加',
    reorderTag: '调整标签顺序',
    deleteTag: '删除标签',
    importData: '导入数据',
    importing: '正在导入',
    exportData: '导出数据',
    exporting: '正在生成备份',
    duplicateCode: '该搭配码已存在，请编辑已有方案。',
    unreadableRecords: (count) => `有 ${count} 条搭配记录未能显示，原始记录已保留。`,
    storageFull: '浏览器存储空间不足，请释放空间后重试。源文件已保留。',
    recordChanged: '方案已被其他页面修改或删除，请刷新后重试。',
    operationFailed: '搭配数据读取或保存失败，请重试。',
    migrationComplete: (added, replaced, skipped, failed) =>
      `旧搭配迁移：新增 ${added} 个，替换 ${replaced} 个，跳过 ${skipped} 个，失败 ${failed} 个。`,
    migrationFailedItems: (names) => `未完成文件：${names}。源文件已保留。`,
    migrationDirectoryRemoved: '旧 clothe 文件夹已删除。',
    migrationCleanupFailed:
      'clothe 文件夹已保留：存在未迁移内容、源文件变化或删除权限不足。请检查后再次更新。',
    migrationTagLimit: '全局标签已达上限，请整理标签后再次更新。',
    migrationSourceChanged: '已迁移的源文件发生变化，未再次覆盖收藏；请通过编辑或备份导入更新。',
    updating: '搭配码更新中…',
    upToDate: '搭配码已是最新状态。',
    scanComplete: (added, failed) => `搭配码更新完成：新增 ${added} 个，失败 ${failed} 个。`,
    sharedImportResult: {
      duplicate: '最新搭配码已存在，已跳过。',
      'missing-image': '检测到新搭配码，但找不到游戏搭配图片。',
      'image-not-updated': '检测到新搭配码，但游戏搭配图片没有更新，已停止导入。',
      'source-changed': '游戏正在更新搭配码或图片，本次暂缓，下次更新会重试。',
      'image-write-failed': '游戏搭配图片转换或保存失败，请检查浏览器存储空间后重试。'
    },
    addOutfit: '添加方案',
    editTitle: '编辑方案',
    imageLabel: '搭配图片（可选）',
    imageHint: '点击选择、拖拽或粘贴图片（需浏览器支持预览）',
    replaceImage: '更换图片',
    codeLabel: '搭配码',
    codePlaceholder: '可以留空，稍后填写',
    sourceLabel: '来源链接（选填）',
    sourcePlaceholder: '粘贴原帖或分享链接',
    sourceMultiple: '检测到多个链接，请只保留一个来源链接',
    sourceInvalid: '请输入有效的网页链接',
    openSource: '打开来源链接',
    noteLabel: '备注',
    notePlaceholder: '最多15个字符',
    tagLabel: '标签（单选）',
    noTag: '不选择标签',
    cancel: '取消',
    confirm: '确定',
    saving: '正在保存',
    copy: '复制搭配码',
    edit: '编辑方案',
    delete: '删除方案',
    parse: '解析搭配码',
    parseInputPlaceholder: '填入搭配码进行解析',
    parseTitle: '搭配码解析',
    parseLoading: '正在解析搭配码…',
    parseEmpty: '未解析到搭配部件。',
    parseInvalidCode: '搭配码无效或不存在。',
    parseUnavailable: '搭配码解析服务暂不稳定，请稍后刷新网站重试。',
    parseRetry: '重试',
    parseClose: '关闭解析窗口',
    parseOpenDetail: (name) => `查看${name}的部件详情`,
    detailTitle: '部件详情',
    detailClose: '关闭部件详情',
    detailPending: '加载中…',
    detailLoadFailed: '图鉴详情加载失败，已保留搭配码中的部件信息。',
    detailOutfit: '套装',
    detailCurrentItem: '当前部件',
    detailOutfitUnavailable: '无所属套装',
    detailEvolution: '进化/焕新',
    detailDyeCondition: '染色条件',
    detailDyes: '染色信息',
    detailArea: '区域',
    detailPalette: '染色盘',
    detailSlot: '色号',
    detailColor: '颜色',
    parseItemCount: (count) => `${count} 个部件`,
    emptyTitle: '还没有搭配方案',
    emptyDescription: '添加搭配方案；授权游戏目录后，也可读取游戏中新增的搭配。',
    imageRequired: '请填写搭配码或选择一张搭配图片。',
    imageReading: '正在读取图片…',
    imageLoadFailed: '图片读取或预览失败，可能是格式不支持或文件损坏，请重新选择',
    operations: {
      copyCode: '复制搭配码',
      albumOpenedWithFailures: (failed) => `相册已打开，${failed} 个搭配方案读取或导入失败。`,
      saveSucceeded: (wasEditing) => (wasEditing ? '保存成功。' : '添加成功。'),
      invalidTag: (maxLength) => `标签不能为空，且最多为${maxLength}个字符。`,
      duplicateOrReservedTag: '标签名称已存在或属于系统筛选项。',
      tagLimitReached: (maxTags) => `最多只能创建${maxTags}个用户标签。`,
      tagAdded: '标签添加成功。',
      deleteTagTitle: '删除标签',
      deleteTagMessage: (tag, usedCount) =>
        `“${tag}”正用于 ${usedCount} 个方案。删除后这些方案会归入“未分类”，图片和方案不会删除。`,
      tagDeleted: '标签已删除。',
      copySucceeded: '复制成功。',
      copyFailed: (code) => `复制失败，请手动复制：${code}`,
      deleteOutfitTitle: '删除搭配方案',
      deleteSelectedTitle: '永久删除搭配方案',
      confirmPermanentDelete: '确定永久删除选中搭配码吗？删除后不可恢复。',
      permanentlyDelete: '永久删除',
      outfitDeleted: '删除成功。',
      deleteIncomplete: '方案删除失败，请刷新后重试。',
      deletingSelected: '正在永久删除搭配方案…',
      deletedSelected: (deletedCount, failedCount) =>
        `已永久删除 ${deletedCount} 个搭配方案${failedCount ? `，${failedCount} 个删除失败。` : '。'}`,
      exportSucceeded: (fileName, count) =>
        `已生成备份并发起下载：${fileName}（${count} 个方案）。`,
      rejectedTags: (count) => `另有 ${count} 个标签因超过限制未添加。`,
      importCompleted: (added, duplicates, failed, tagNote) =>
        `导入完成：新增 ${added} 个方案，跳过 ${duplicates} 个重复方案，${failed} 个方案导入失败。${tagNote}`
    },
    guideTitle: '搭配码使用指南',
    guideFeaturedSection: {
      title: '自动更新游戏搭配码',
      items: [
        '自动更新需要授权游戏的 X6Game 文件夹，可在右上角相册菜单中授权，无需先选择相册。',
        '在游戏内点击分享按钮，需要在搭配截图右下角点击框选按钮，框选完成后生成搭配码，再返回网页，网站会自动更新该条搭配码数据。'
      ]
    },
    guideSections: [
      {
        title: '搭配码解析',
        items: [
          '已填写搭配码的方案可点击卡片右上角的解析按钮，查看搭配部件与染色信息。',
          '在解析结果中点击部件图片，可打开部件详情，查看具体信息；有染色数据时，还可查看染色区域、染色盘、色号与颜色。',
          '也可在右上工具栏解析入口输入搭配码并点击“解析搭配码”，无需先创建搭配方案。'
        ]
      }
    ],
    guideDontShowAgain: '不再提示',
    guideConfirm: '知道了',
    guideClose: '关闭搭配码指南',
    guideOpen: '查看搭配码使用指南',
    count: (count) => `${count} 个方案`
  },
  en: {
    viewName: 'Outfit Codes',
    tagsTitle: 'Tags',
    all: 'All',
    pending: 'Pending',
    uncategorized: 'Uncategorized',
    addTag: 'Add tag',
    tagPlaceholder: 'Up to 5 characters',
    confirmAddTag: 'Add',
    reorderTag: 'Reorder tag',
    deleteTag: 'Delete tag',
    importData: 'Import',
    importing: 'Importing',
    exportData: 'Export',
    exporting: 'Creating backup',
    duplicateCode: 'This outfit code already exists. Edit the existing outfit.',
    unreadableRecords: (count) =>
      `Unable to display ${count} outfit record(s). The original records are preserved.`,
    storageFull: 'Browser storage is full. Free some space and retry. Source files were retained.',
    recordChanged: 'This outfit was changed or deleted in another page. Refresh and retry.',
    operationFailed: 'Unable to read or save outfit data. Please retry.',
    migrationComplete: (added, replaced, skipped, failed) =>
      `Outfit migration: ${added} added, ${replaced} replaced, ${skipped} skipped, ${failed} failed.`,
    migrationFailedItems: (names) => `Unfinished files: ${names}. Source files were retained.`,
    migrationDirectoryRemoved: 'The old clothe folder was removed.',
    migrationCleanupFailed:
      'The clothe folder was retained because of unmigrated content, changed files or insufficient deletion permission. Check it and update again.',
    migrationTagLimit: 'The global tag limit was reached. Organize your tags and update again.',
    migrationSourceChanged:
      'A migrated source file changed. Saved outfits were preserved. Use editing or backup import to update it.',
    updating: 'Updating outfit codes…',
    upToDate: 'Outfit codes are up to date.',
    scanComplete: (added, failed) =>
      `Outfit code update complete: ${added} added, ${failed} failed.`,
    sharedImportResult: {
      duplicate: 'The latest outfit code already exists and was skipped.',
      'missing-image': 'A new outfit code was found, but the game outfit image is missing.',
      'image-not-updated':
        'A new outfit code was found, but the game outfit image has not been updated.',
      'source-changed':
        'The game changed the code or image during import. The next update will retry.',
      'image-write-failed': 'The game outfit image could not be converted or written.'
    },
    addOutfit: 'Add outfit',
    editTitle: 'Edit Outfit',
    imageLabel: 'Outfit image (optional)',
    imageHint: 'Click, drop, or paste an image your browser can preview',
    replaceImage: 'Replace image',
    codeLabel: 'Outfit code',
    codePlaceholder: 'Optional; you can add it later',
    sourceLabel: 'Source link (optional)',
    sourcePlaceholder: 'Paste the original post or share link',
    sourceMultiple: 'Multiple links detected. Please keep only one source link.',
    sourceInvalid: 'Please enter a valid web link.',
    openSource: 'Open source link',
    noteLabel: 'Note',
    notePlaceholder: 'Up to 15 characters',
    tagLabel: 'Tag (single choice)',
    noTag: 'No tag',
    cancel: 'Cancel',
    confirm: 'Save',
    saving: 'Saving',
    copy: 'Copy outfit code',
    edit: 'Edit outfit',
    delete: 'Delete outfit',
    parse: 'Decode outfit code',
    parseInputPlaceholder: 'Enter an outfit code to decode',
    parseTitle: 'Outfit code items',
    parseLoading: 'Decoding outfit code…',
    parseEmpty: 'No outfit items were found.',
    parseInvalidCode: 'This outfit code is invalid or does not exist.',
    parseUnavailable:
      'The outfit code parsing service is currently unstable. Please refresh the website and try again later.',
    parseRetry: 'Retry',
    parseClose: 'Close item list',
    parseOpenDetail: (name) => `View details for ${name}`,
    detailTitle: 'Item details',
    detailClose: 'Close item details',
    detailPending: 'Loading…',
    detailLoadFailed:
      'Catalog details could not be loaded. The decoded item information is still available.',
    detailOutfit: 'Outfit',
    detailCurrentItem: 'Current item',
    detailOutfitUnavailable: 'None',
    detailEvolution: 'Evolution / Glow-up',
    detailDyeCondition: 'Dye condition',
    detailDyes: 'Dye details',
    detailArea: 'Area',
    detailPalette: 'Palette',
    detailSlot: 'Color slot',
    detailColor: 'Color',
    parseItemCount: (count) => `${count} item${count === 1 ? '' : 's'}`,
    emptyTitle: 'No outfit plans yet',
    emptyDescription:
      'Add an outfit, or authorize the game directory to read newly shared in-game outfits.',
    imageRequired: 'Enter an outfit code or choose an image.',
    imageReading: 'Reading image…',
    imageLoadFailed:
      'Unable to read or preview image. The format may be unsupported or the file damaged. Please select again',
    operations: {
      copyCode: 'Copy outfit code',
      albumOpenedWithFailures: (failed) =>
        `Album opened; ${failed} outfit item(s) could not be read or imported.`,
      saveSucceeded: (wasEditing) => (wasEditing ? 'Outfit saved.' : 'Outfit added.'),
      invalidTag: (maxLength) => `A tag must contain 1 to ${maxLength} characters.`,
      duplicateOrReservedTag: 'That name is already used or reserved.',
      tagLimitReached: (maxTags) => `You can create up to ${maxTags} user tags.`,
      tagAdded: 'Tag added.',
      deleteTagTitle: 'Delete tag',
      deleteTagMessage: (tag, usedCount) =>
        `“${tag}” is used by ${usedCount} outfit(s). They will become uncategorized; no outfits or images will be deleted.`,
      tagDeleted: 'Tag deleted.',
      copySucceeded: 'Outfit code copied.',
      copyFailed: (code) => `Copy failed. Copy manually: ${code}`,
      deleteOutfitTitle: 'Delete outfit',
      deleteSelectedTitle: 'Permanently delete outfits',
      confirmPermanentDelete: 'Permanently delete this outfit code? This cannot be undone.',
      permanentlyDelete: 'Delete permanently',
      outfitDeleted: 'Outfit deleted.',
      deleteIncomplete: 'Unable to delete outfits. Refresh and retry.',
      deletingSelected: 'Permanently deleting outfits…',
      deletedSelected: (deletedCount, failedCount) =>
        `Permanently deleted ${deletedCount} outfit(s)${failedCount ? `; ${failedCount} failed.` : '.'}`,
      exportSucceeded: (fileName, count) =>
        `Created backup and requested download: ${fileName} (${count} outfits).`,
      rejectedTags: (count) => ` ${count} tag(s) were rejected by the limits.`,
      importCompleted: (added, duplicates, failed, tagNote) =>
        `Import complete: ${added} added, ${duplicates} duplicate(s) skipped, ${failed} failed.${tagNote}`
    },
    guideTitle: 'Outfit Code Guide',
    guideFeaturedSection: {
      title: 'Auto update in-game codes',
      items: [
        'Authorize the game’s X6Game folder from the top-right album menu. Selecting an album is not required.',
        'In the game, tap Share, then tap the selection button at the lower-right of the outfit screenshot. After the selection generates an outfit code, return to the web page and the app will automatically update that outfit code data.'
      ]
    },
    guideSections: [
      {
        title: 'Decode outfit codes',
        items: [
          'For a plan with a code, click the decode button in the upper-right corner of its card to view outfit items and dye information.',
          'Click an item image in the decoded results to open its details. When dye data is available, you can also view dye regions, palettes, color codes, and colors.',
          'You can also open the decoder from the top-right toolbar, enter an outfit code, and click Decode outfit code without creating a plan first.'
        ]
      }
    ],
    guideDontShowAgain: "Don't show again",
    guideConfirm: 'Got it',
    guideClose: 'Close outfit code guide',
    guideOpen: 'Open outfit code guide',
    count: (count) => `${count} outfit${count === 1 ? '' : 's'}`
  }
}
