export interface HomeSchemeMessages {
  viewName: string
  title: string
  add: string
  importData: string
  exportData: string
  importing: string
  exporting: string
  all: string
  homeType: string
  comboType: string
  tagsTitle: string
  addTag: string
  tagPlaceholder: string
  addTagConfirm: string
  deleteTag: string
  deleteTagTitle: string
  deleteTagMessage: (tag: string, usedCount: number) => string
  tagDeleted: string
  reorderTag: string
  emptyTitle: string
  emptyDescription: string
  untitled: string
  uncategorized: string
  code: string
  codePlaceholder: string
  name: string
  namePlaceholder: string
  type: string
  pendingType: string
  version: string
  metadataAria: string
  furnitureCount: string
  note: string
  notePlaceholder: string
  image: string
  imageHint: string
  chooseImage: string
  removeImage: string
  save: string
  confirm: string
  saving: string
  cancel: string
  edit: string
  delete: string
  copy: string
  copySucceeded: string
  copyFailed: (code: string) => string
  parsePending: string
  parseFailed: string
  parseNotFound: string
  parseUnavailable: string
  parseTimeout: string
  parseSucceeded: string
  parseUnsupportedServer: string
  saveSucceeded: string
  deleteConfirm: string
  deleteSelectedConfirm: (count: number) => string
  recordChanged: string
  deleteSucceeded: string
  importSucceeded: (added: number, duplicates: number, failed: number) => string
  exportSucceeded: (count: number, fileName: string) => string
  invalidCode: string
  duplicateCode: string
  nameRequired: string
  invalidBackup: string
  storageFull: string

  permissionDenied: string
  imageInvalid: string
  dataInvalid: string
  tagsChanged: string
  operationFailed: string
}

export const homeSchemeMessages = {
  zh: {
    permissionDenied: '没有访问权限，请重新授权后重试。',
    imageInvalid: '方案图片缺失、损坏或超出限制，请检查图片后重试。',
    dataInvalid: '家园数据无效或无法读取，请保留备份并重新加载。',
    tagsChanged: '标签仍在使用或已被修改，请刷新列表后重试。',
    deleteSelectedConfirm: (count) =>
      `确定删除当前列表中选中的 ${count} 个家园方案吗？此操作无法撤销。`,
    recordChanged:
      '该方案已被其他窗口修改或删除。当前输入已保留，请复制需要的内容后关闭并重新打开编辑器。',
    viewName: '家园方案',
    title: '家园方案',
    add: '添加方案',
    importData: '导入数据',
    exportData: '导出数据',
    importing: '正在导入…',
    exporting: '正在导出…',
    all: '全部',
    homeType: '家园码',
    comboType: '组合码',
    tagsTitle: '标签',
    addTag: '新增标签',
    tagPlaceholder: '最多5个字符',
    addTagConfirm: '添加',
    deleteTag: '删除标签',
    deleteTagTitle: '删除标签',
    deleteTagMessage: (tag, usedCount) =>
      `“${tag}”正用于 ${usedCount} 个方案。删除后这些方案会归入“未分类”，图片和方案不会删除。`,
    tagDeleted: '标签已删除。',
    reorderTag: '拖动排序',
    emptyTitle: '还没有家园方案',
    emptyDescription: '添加家园方案，网站自动解析。',
    untitled: '未命名方案',
    uncategorized: '未分类',
    code: '方案码',
    codePlaceholder: '输入家园码或组合码',
    name: '名称',
    namePlaceholder: '方案名称',
    type: '类型',
    pendingType: '等待解析',
    version: '版本',
    metadataAria: '方案信息',
    furnitureCount: '家具数量',
    note: '备注',
    notePlaceholder: '最多 15 个字符',
    image: '方案图片',
    imageHint: '点击选择、拖拽或粘贴图片（需浏览器支持预览）',
    chooseImage: '更换图片',
    removeImage: '移除本地照片',
    save: '保存',
    confirm: '确定',
    saving: '正在保存',
    cancel: '取消',
    edit: '编辑方案',
    delete: '删除',
    copy: '复制方案码',
    copySucceeded: '复制成功。',
    copyFailed: (code) => `复制失败，请手动复制：${code}`,
    parsePending: '正在获取并解析方案…',
    parseFailed: '方案码解析失败',
    parseNotFound: '未找到该方案，可能已失效，请确认方案码。',
    parseUnavailable: '暂时无法获取方案，请稍后重试。',
    parseTimeout: '获取方案超时，请稍后重试。',
    parseSucceeded: '方案码解析成功',
    parseUnsupportedServer: '暂不支持此服务器的方案码',
    saveSucceeded: '方案已保存',
    deleteConfirm: '确定删除这个家园方案吗？',
    deleteSucceeded: '方案已删除',
    importSucceeded: (added, duplicates, failed) =>
      '导入完成：新增 ' + added + ' 个，重复跳过 ' + duplicates + ' 个，失败 ' + failed + ' 个。',
    exportSucceeded: (count, fileName) => '已导出 ' + count + ' 个方案到 ' + fileName + '。',
    invalidCode: '方案码长度需为 2 到 30 个字符。',
    duplicateCode: '这个方案码已存在。',
    nameRequired: '请填写方案名称。',
    invalidBackup: '备份文件无效或不受支持。',
    storageFull: '浏览器存储空间不足，请释放空间后重试。',

    operationFailed: '操作失败，数据未能完整读取或保存，请重试。'
  },
  en: {
    permissionDenied: 'Access was denied. Grant permission again and retry.',
    imageInvalid:
      'The scheme image is missing, damaged, or exceeds the limits. Check the image and retry.',
    dataInvalid: 'Home scheme data is invalid or unreadable. Keep a backup and reload.',
    tagsChanged: 'Tags are still in use or have changed. Refresh the list and retry.',
    deleteSelectedConfirm: (count) =>
      `Delete the ${count} selected home schemes in the current list? This cannot be undone.`,
    recordChanged:
      'Another window changed or deleted this scheme. Your input is preserved. Copy anything you need, then close and reopen the editor.',
    viewName: 'Home schemes',
    title: 'Home schemes',
    add: 'Add scheme',
    importData: 'Import data',
    exportData: 'Export data',
    importing: 'Importing…',
    exporting: 'Exporting…',
    all: 'All',
    homeType: 'Home',
    comboType: 'Combo',
    tagsTitle: 'Tags',
    addTag: 'Add tag',
    tagPlaceholder: 'Up to 5 characters',
    addTagConfirm: 'Add',
    deleteTag: 'Delete tag',
    deleteTagTitle: 'Delete tag',
    deleteTagMessage: (tag, usedCount) =>
      `“${tag}” is used by ${usedCount} scheme(s). They will become uncategorized; no schemes or images will be deleted.`,
    tagDeleted: 'Tag deleted.',
    reorderTag: 'Drag to reorder',
    emptyTitle: 'No home schemes yet',
    emptyDescription: 'Add a home scheme and the site will parse it automatically.',
    untitled: 'Untitled scheme',
    uncategorized: 'Uncategorized',
    code: 'Scheme code',
    codePlaceholder: 'Enter a home or combo code',
    name: 'Name',
    namePlaceholder: 'Scheme name',
    type: 'Type',
    pendingType: 'Waiting for parsing',
    version: 'Version',
    metadataAria: 'Scheme information',
    furnitureCount: 'Furniture',
    note: 'Note',
    notePlaceholder: 'Up to 15 characters',
    image: 'Scheme image',
    imageHint: 'Click, drop, or paste an image your browser can preview',
    chooseImage: 'Replace image',
    removeImage: 'Remove local photo',
    save: 'Save',
    confirm: 'Save',
    saving: 'Saving',
    cancel: 'Cancel',
    edit: 'Edit scheme',
    delete: 'Delete',
    copy: 'Copy scheme code',
    copySucceeded: 'Copied successfully.',
    copyFailed: (code) => `Copy failed. Copy manually: ${code}`,
    parsePending: 'Fetching and parsing scheme…',
    parseFailed: 'Unable to parse this code',
    parseNotFound: 'This scheme was not found or may have expired. Please check the code.',
    parseUnavailable: 'Unable to fetch the scheme right now. Please try again later.',
    parseTimeout: 'Fetching the scheme timed out. Please try again later.',
    parseSucceeded: 'Scheme code parsed successfully',
    parseUnsupportedServer: 'This server is not supported yet',
    saveSucceeded: 'Scheme saved',
    deleteConfirm: 'Delete this home scheme?',
    deleteSucceeded: 'Scheme deleted',
    importSucceeded: (added, duplicates, failed) =>
      'Import complete: ' +
      added +
      ' added, ' +
      duplicates +
      ' duplicates skipped, ' +
      failed +
      ' failed.',
    exportSucceeded: (count, fileName) => 'Exported ' + count + ' schemes to ' + fileName + '.',
    invalidCode: 'Scheme codes must contain 2 to 30 characters.',
    duplicateCode: 'This scheme code already exists.',
    nameRequired: 'Enter a scheme name.',
    invalidBackup: 'The backup file is invalid or unsupported.',
    storageFull: 'Browser storage is full. Free up space and try again.',

    operationFailed: 'Unable to read or save all data. Please try again.'
  }
} satisfies Record<'zh' | 'en', HomeSchemeMessages>
