// 国际化公共类型：定义语言键、状态文案参数、完整界面文案结构和各模块字段类型。
import type {
  RelatedCleanupFailureReason,
  SpecialCleanupItem
} from '../utils/file-system/cleanupFileSystem'
import type { OutfitMessages } from './messages/outfit'
import type { PhotoParamsMessages } from './messages/photoParams'
import type { HomeSchemeMessages } from './messages/homeScheme'
import type { ResonanceMessages } from './messages/resonance'
export type Language = 'zh' | 'en'
export type StatusPrefix = 'read' | 'restored'
export type StatusSuffix = 'continued' | 'remembered'

/** 按当前布局提供的帮助内容；操作分组分别承载电脑鼠标/键盘或手机触摸说明。 */
export interface HelpAboutDeviceContent {
  features: Array<{ icon: string; title: string; text: string }>
  tutorialSections: Array<{ title: string; items: string[] }>
  notes: string[]
  operationSections: Array<{ icon: 'mouse' | 'keyboard' | 'touch'; title: string; items: string[] }>
}

export type LocaleMessages = Omit<FullLocaleMessages, 'helpAbout' | 'updateLog'>
export interface FullLocaleMessages {
  outfit: OutfitMessages
  photoParams: PhotoParamsMessages
  homeScheme: HomeSchemeMessages
  resonance: ResonanceMessages
  app: {
    noDirectory: string
    initialStatus: string
    readingStatus: string
    restoringStatus: string
    restoreFailedStatus: string
    restorePathFailedStatus: string
    readFailedStatus: string
    databaseDisconnected: string
    databaseVersionMismatch: string
    clearedStatus: string
    operationNoticeTitle: string
    copySucceeded: string
    copyFailed: (value: string) => string
    operationNoticeCloseAria: string
    preferencesUpdating: string
    clearCacheDialogTitle: string
    clearCacheConfirmMessage: string
    clearCacheStatus: string
    authorizeX6GameStatus: string
    x6GameAuthorizationCancelledStatus: string
    clearDataDialogTitle: string
    clearDataFirstConfirmMessage: string
    clearDataSections: Array<{ title: string; items?: string[]; text?: string }>
    clearDataConsequence: string
    clearDataBackup: string
    clearDataConfirm: string
    clearDataStatus: string
    languageUpdated: string
    themeUpdated: string
    movingPhotosToTrash: string
    restoringPhotos: string
    permanentlyDeletingPhotos: string
    importingPhotos: string
    exportingPhotos: string
    importCompleted: (succeeded: number, failed: number) => string
    exportCompleted: (succeeded: number, failed: number) => string
    exportCancelled: (completed: number) => string
    exportMoveSourceTitle: string
    exportMoveSourceConfirm: (count: number) => string
    exportTargetInvalid: string
    transferClose: string
    transferCancel: string
    transferFailed: string
    transferCancelled: string
    dialogCloseAria: string
    dialogCancel: string
    dialogConfirm: string
    relatedPhotoDeleteDialogTitle: string
    confirmRelatedPhotoDelete: (count: number, skippedDirectories: string[]) => string
    relatedPhotoDeleteCancelledStatus: string
    relatedPhotoDeleteStatus: (
      deletedCount: number,
      failures: Array<{ path: string; reason: RelatedCleanupFailureReason }>
    ) => string
    noMatchingRelatedPhotos: (missingDirectories: string[], skippedDirectories: string[]) => string
    dialogContinueAuthorization: string
    dialogOk: string
    relatedCleanupDialogTitle: string
    x6GameDirectoryDialogTitle: string
    albumContentAria: string
    rememberedDirectory: (name: string) => string
    successStatus: (count: number, prefix: StatusPrefix) => string
    successSuffix: (suffix: StatusSuffix) => string
    relatedCleanupCancelledStatus: string
    confirmRelatedCleanup: (
      count: number,
      missingDirectories: string[],
      cleanupScope?: { skippedAlbumName: string; remainingTargetNames: string[] }
    ) => string
    relatedCleanupStatus: (
      deletedCount: number,
      deletedBytes: number,
      failures: Array<{ path: string; reason: RelatedCleanupFailureReason }>,
      missingDirectories: string[]
    ) => string
    noRelatedPhotos: (missingDirectories: string[]) => string
  }
  topBar: {
    title: string
    logo: string
    brandName: string
    subtitle: string
    starHint: string
    searchPlaceholder: string
    clearSearch: string
    like: string
    likeTooltip: string
    officialSite: string
    officialSiteHint: string
    githubText: string
    giteeText: string
    githubRepo: string
    giteeRepo: string
    languageZh: string
    languageEn: string
    languageToggleAria: string
    themeLight: string
    themeDark: string
    themeToggleAria: string
    chooseDirectory: string
    loading: string
    clearDirectory: string
    authorizeX6Game: string
    reauthorizeX6Game: string
    refreshAlbum: string
    refreshing: string
    thumbnailRatio: string
    thumbnailSize: string
    thumbnailSizes: Record<'small' | 'medium' | 'large', string>
    specialCleanup: string
    tools: string
    toolsMenuAria: string
    parseTools: string
    cameraParamsTitle: string
    outfitCodeTitle: string
    parseToolsBusy: string
    currentAlbum: string
    view: string
    more: string
    albumMenuAria: string
    viewMenuAria: string
    moreMenuAria: string
    dataStorageReminder: string
    exportAllData: string
    importAllData: string
    clearCache: string
    clearData: string
    author: string
    xiaohongshu: string
    xiaohongshuAuthor: string
    douyin: string
    douyinAuthor: string
    bilibili: string
    bilibiliAuthor: string
    donate: string
    donateTitle: string
    donateDescription: string
    donateWechat: string
    donateAlipay: string
    closeDonate: string
    feedback: string
    feedbackTitle: string
    feedbackOpenExternal: string
    feedbackClose: string
    updateLog: string
    helpAbout: string
    avatarSimulator: string
    fortuneTime: string
    importPhotos: string
    exportAllPhotos: string
    importingPhotos: string
    exportingPhotos: string
    cameraParamsPlaceholder: string
    cameraParamsParse: string
  }
  fortuneTime: {
    title: string
    close: string
    intro: string
    disclaimer: string
    tableTitle: string
    date: string
    time: string
    direction: string
    zodiac: string
    rating: string
    rows: Array<{
      date: string
      time: string
      direction: string
      zodiac: string
      rating: string
      highlighted?: boolean
    }>
    recommendedTitle: string
    recommendations: Array<{ title: string; details: string[] }>
    avoidTitle: string
    avoidDates: string
    avoidItems: string[]
    summaryTitle: string
    summary: string
    footnote: string
  }
  updateLog: {
    title: string
    helpAbout: string
    currentTitle: string
    currentVersion: string
    currentDate: string
    currentItems: Array<
      string | { title: string; text: string; link?: { label: string; href: string } }
    >
    historyTitle: string
    history: Array<{
      version: string
      date?: string
      items: Array<string | { title: string; text: string; link?: { label: string; href: string } }>
    }>
    dontShowAgain: string
    confirm: string
    closeAria: string
  }
  helpAbout: {
    title: string
    eyebrow: string
    introTitle: string
    intro: string
    privacyNote: string
    featuresTitle: string
    tutorialTitle: string
    notesTitle: string
    desktop: HelpAboutDeviceContent
    mobile: HelpAboutDeviceContent
    confirm: string
    closeAria: string
  }
  selectionBar: {
    selected: (count: number) => string
    selectAll: string
    deselectAll: string
    favorite: string
    unfavorite: string
    deleteRelated: string
    delete: string
    restore: string
    permanentlyDelete: string
    clearAll: string
    exportPhotos: string
    cancel: string
  }
  cleanup: {
    dialogTitle: string
    dialogCloseAria: string
    authHint: string
    referenceHint: string
    authorize: string
    reauthorize: string
    authorizedAs: (name: string) => string
    clean: string
    cleaning: string
    items: Record<SpecialCleanupItem, { title: string; path: string; description: string }>
    confirmDirectoryCleanupTitle: string
    confirmDirectoryCleanup: (title: string, count: number, size: string) => string
    directoryCleanupStatus: (
      title: string,
      deletedCount: number,
      deletedBytes: number,
      failures: Array<{ path: string; reason: RelatedCleanupFailureReason }>,
      missingDirectories: string[]
    ) => string
    noDirectoryFilesToClean: (title: string, missingDirectories: string[]) => string
    accountDialogTitle: string
    accountDialogMessage: string
    accountInputLabel: string
    accountSelectPlaceholder: string
    allAccounts: string
    rememberChoice: string
    accountConfirm: string
    accountCancel: string
  }
  viewNav: {
    aria: string
    title: string
    allPhotos: string
    homeSchemes: string
    resonance: string
    resonanceRecords: string
    wardrobe: string
    makeup: string
    comingSoon: string
    favorites: string
    recentlyDeleted: string
    count: (count: number) => string
    homeSchemesCount: (count: number) => string
  }
  sidebar: {
    aria: string
    title: string
    empty: string
    actionsTitle: string
    noAction: string
    unparsed: string
    parseProgress: (completed: number, total: number) => string
    sort: string
    sortId: string
    sortName: string
    sortCount: string
    sortLatest: string
  }
  grid: {
    emptyTitle: string
    emptyDescription: string
    emptyFavoritesTitle: string
    emptyFavoritesDescription: string
    recommendedPath: string
    hiddenFolderTip: string
    selectDay: string
    addFavorite: string
    removeFavorite: string
    imageLoadFailed: string
    editNote: string
    notePrompt: string
    noteSaved: string
    noteSaveErrors: Record<'invalid' | 'changed' | 'lockUnavailable' | 'verificationFailed', string>
    noteLabel: string
    noteTitle: string
    notePlaceholder: string
    noteSave: string
    noteCancel: string
    noteClose: string
    photoCount: (count: number) => string
    parsePhoto: string
    autoParseActions: string
    autoParseActionsHint: string
    actionCount: (count: number) => string
  }
  lightbox: {
    previousAria: string
    nextAria: string
    closeAria: string
    deleteCurrent: string
    restoreCurrent: string
    permanentlyDeleteCurrent: string
    favorite: string
    removeFavorite: string
    zoomIn: string
    zoomOut: string
    resetZoom: string
    editNote: string
    noteLabel: string
    parsePhoto: string
  }
  trash: {
    emptyTitle: string
    emptyDescription: string
    totalSummary: (count: number, size: string) => string
    deletedAt: (value: string) => string
    moveDialogTitle: string
    permanentDeleteDialogTitle: string
    confirmMove: (count: number) => string
    confirmPermanentDelete: (count: number) => string
    movedStatus: (count: number, failedNames: string[]) => string
    restoredStatus: (count: number, failedNames: string[]) => string
    permanentlyDeletedStatus: (count: number, failedNames: string[]) => string
    deleteAllTitle: string
    confirmDeleteAll: (count: number) => string
    refreshStatus: (addedCount: number, removedCount: number) => string
    upToDate: string
    imageLoadFailed: string
  }
  date: {
    displayDate: (dateKey: string) => string
    monthDay: (dateKey: string) => string
  }
  fileSystem: {
    readFailed: string
    systemDirectory: string
    abortSelection: string
    permissionRequired: string
    unsupportedBrowser: string
    mobileBrowserUnsupported: string
    invalidX6GameDirectory: string
    restoreX6GamePermissionPrompt: string
    selectX6GameDirectoryPrompt: string
  }
}
