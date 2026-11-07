<script setup lang="ts">
import SkeletonSweep from './components/SkeletonSweep.vue'
import { globalSkeletonSweepKey } from './utils/imageSkeleton'
provide(globalSkeletonSweepKey, true)
import AlbumNoteNotice from './components/AlbumNoteNotice.vue'
import { archiveMotionDeadlineKey, archiveMotionLoadDelay } from './composables/useAfterArchiveMotion'
import {
  inspectAlbumNotes,
  recoverAlbumNotes,
  type AlbumNoteSnapshot
} from './utils/file-system/photoMetadata'
import { browserBaseline } from './utils/directory-backup/repository'
import { currentVersion } from './i18n/version'
import { lazyFeature } from './utils/lazyFeature'
import { isAlbumPhoto } from './utils/photoGrouping'
import { outfitBackupMessage } from './utils/outfit/outfitBackupMessage'
import { readCompatibleAlbum } from './utils/file-system/compatibleAlbum'
import { exportCompatiblePhotos } from './utils/file-system/compatiblePhotoExport'
import { requestBlobDownload } from './utils/backup/downloadFallback'
import { compatibleAlbumMessages, ALBUM_ACCESS_MODE_KEY } from './i18n/messages/compatibleAlbum'

import {
  reportError as captureDiagnosticError,
  setDiagnosticModule
} from './utils/errorReporting/errorReporter'
import { usePhotoFavorites } from './composables/usePhotoFavorites'
import { useAppPreferences } from './composables/useAppPreferences'
import { readLocalStorage, writeLocalStorage, removeLocalStorage } from './utils/localStorage'
import { useGameCleanup } from './composables/useGameCleanup'
import { usePhotoTrashActions } from './composables/usePhotoTrashActions'
import { useOutfitWorkspace } from './composables/useOutfitWorkspace'
import { useDirectoryRefresh } from './composables/useDirectoryRefresh'
import { useDirectorySession, type DirectoryState } from './composables/useDirectorySession'
import {
  createOperationCoordinator,
  operationCoordinatorKey
} from './composables/useOperationCoordinator'
const operations = createOperationCoordinator()
provide(operationCoordinatorKey, operations)
import { archiveCloudKey, useArchiveCloudSync } from './composables/useArchiveCloudSync'
import { cloudMessages } from './i18n/messages/cloud'
import { archiveCloudMessages } from './i18n/messages/archiveCloud'
import ArchiveCloudDialog from './components/ArchiveCloudDialog.vue'
const archiveCloud = useArchiveCloudSync((task) => operations.run('archive-cloud', task))
provide(archiveCloudKey, archiveCloud)
import { useDirectoryBackupLifecycle } from './composables/useDirectoryBackup'
useDirectoryBackupLifecycle()
import { invalidateCacheWrites } from './utils/cacheLifecycle'
import { clearAllBrowserData } from './utils/file-system/database'
import {
  pendingEnabledBackups,
  flushBackupsBeforeReset,
  pauseBackupsForBrowserReset
} from './utils/directory-backup/engine'

import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  provide,
  ref,
  shallowRef,
  watch
} from 'vue'
import {
  ChartNoAxesColumnIncreasing,
  CircleHelp,
  Download,
  Plus,
  Trash2,
  Upload
} from 'lucide-vue-next'
import DataStorageReminder from './components/DataStorageReminder.vue'
import UpdateLogDialog from './components/UpdateLogDialogContent.vue'
import HelpAboutDialog from './components/HelpAboutDialogContent.vue'
import AlbumViewSwitcher, { type AlbumView } from './components/AlbumViewSwitcher.vue'
import CleanupAccountPicker from './components/CleanupAccountPicker.vue'
import CleanupDialog from './components/CleanupDialog.vue'
import ConfirmDialog from './components/ConfirmDialog.vue'
import DateSidebar from './components/DateSidebar.vue'
import Lightbox from './components/Lightbox.vue'
import OperationNotice from './components/OperationNotice.vue'
import PageScrollbar from './components/PageScrollbar.vue'
import NoteDialog from './components/NoteDialog.vue'
import OutfitEditor from './components/OutfitEditor.vue'
import OutfitGrid from './components/OutfitGrid.vue'
const OutfitSummaryDialog = lazyFeature(
  () => import('./components/OutfitSummaryDialog.vue'),
  () => language.value
)
import OutfitGuideDialog from './components/OutfitGuideDialog.vue'
import OutfitParseDialog from './components/OutfitParseDialog.vue'
import ParseToolsDialog from './components/ParseToolsDialog.vue'
import FortuneTimeDialog from './components/FortuneTimeDialog.vue'
import OutfitSidebar, { type OutfitFilter } from './components/OutfitSidebar.vue'
import HomeSchemeWorkspace from './components/HomeSchemeWorkspace.vue'
import ResonanceRecords from './components/ResonanceRecords.vue'
import PersonalWardrobe from './components/PersonalWardrobe.vue'
import MakeupCatalog from './components/MakeupCatalog.vue'
import ResonanceSidebar from './components/ResonanceSidebar.vue'
import PhotoGrid from './components/PhotoGrid.vue'
import RecentlyDeletedGrid from './components/RecentlyDeletedGrid.vue'
import SelectionBar from './components/SelectionBar.vue'
import AdaptiveFilterPanel from './components/AdaptiveFilterPanel.vue'
import CollectionFilterBar from './components/CollectionFilterBar.vue'
import CollectionActions from './components/CollectionActions.vue'
import MobileNavigation from './components/MobileNavigation.vue'
import { useCompactLayout, useVisualViewport } from './composables/useCompactLayout'
import TopBar from './components/TopBar.vue'
import PhotoTransferProgressDialog from './components/PhotoTransferProgressDialog.vue'
const CardShareDialog = lazyFeature(
  () => import('./components/ShareImageDialog.vue'),
  () => language.value
)
const sharingOutfit = ref<OutfitItem | null>(null)
const autoSharePhoto = ref(false)
const loadCardSharePhoto = () => readPhotoBlob(sharingOutfit.value!)
import PhotoParamsDialog from './components/PhotoParamsDialog.vue'
import CameraFavorites from './components/CameraFavorites.vue'
import AllDataBackup from './components/AllDataBackup.vue'
import { loadResonanceRecords } from './utils/resonance/resonanceStorage'
import { normalizeCameraCode, readCameraFavorites } from './utils/photo-params/favorites'
import type { ThumbnailMode, ThumbnailSize } from './types/thumbnail'
import {
  type ActionSort,
  type PhotoDisplayItem,
  type PhotoItem,
  type RecentlyDeletedPhoto
} from './utils/photoGrouping'
import {
  clearSavedAlbumDirectoryHandle,
  refreshAlbumDirectory,
  saveAlbumDirectoryHandle,
  type AlbumDirectoryResult,
  type RefreshAlbumResult
} from './utils/file-system/albumFileSystem'
import {
  listRecentlyDeleted,
  movePhotosToRecentlyDeleted
} from './utils/file-system/trashFileSystem'
import {
  listGamePlayPhotoAccounts,
  isProtectedAlbumDirectory,
  pickStandaloneX6GameDirectory,
  supportsDirectoryAuthorization
} from './utils/file-system/directoryAccess'
import {
  clearSavedPhotoActionCache,
  getSavedCameraParamUids,
  getSavedX6GameDirectoryHandle
} from './utils/file-system/directoryStorage'
import {
  PhotoMetadataError,
  readAlbumMetadata,
  savePhotoNote
} from './utils/file-system/photoMetadata'
import { readPhotoBlob, releasePhotoUrl, releasePhotoUrls } from './utils/file-system/photoUrl'
import { preparePhotoTransfer, runPhotoTransfer } from './utils/file-system/photoTransfer'
import {
  readOutfitLibrary,
  type OutfitItem,
  type OutfitLibraryResult,
  type SharedOutfitSource,
  MAX_OUTFIT_CODE_LENGTH,
  normalizeOutfitCode
} from './utils/outfit/outfitFileSystem'
import { readOutfitCollection } from './utils/outfit/outfitStorage'
import { DuplicateOutfitCodeError } from './utils/outfit/outfitTypes'
import {
  useOperationNotice,
  type StatusState,
  type StatusTone
} from './composables/useOperationNotice'
import { copyTextToClipboard } from './utils/clipboard'
import { useConfirmDialog } from './composables/useConfirmDialog'
import { useAlbumViewModel } from './composables/useAlbumViewModel'
import { useSelectionState } from './composables/useSelectionState'
import { usePhotoParams } from './composables/usePhotoParams'
import { usePhotoActionParsing } from './composables/usePhotoActionParsing'
import { usePhotoTransfer } from './composables/usePhotoTransfer'

import {
  clearSavedHomeSchemeParseResults,
  clearSavedOutfitParseResults
} from './utils/file-system/directoryStorage'
import { countHomeSchemes } from './utils/homeBuild/homeSchemeStorage'

import type { ResonanceRecord } from './utils/resonance/resonanceTypes'
import type { ResonanceBannerOrder, ResonanceRarityFilter } from './utils/resonance/resonanceView'

const OUTFIT_GUIDE_DISMISSED_KEY = 'infinity-nikki-outfit-guide-dismissed'
const X6GAME_AUTO_PROMPT_DISMISSED_KEY = 'infinity-nikki-x6game-auto-prompt-dismissed'
const DATA_REMINDER_DISMISSED_KEY = 'infinity-nikki-data-reminder-dismissed'
const ABOUT_STATE_STORAGE_KEY = 'infinity-nikki-about-state'
const currentAboutVersion = currentVersion.replace(/^v/, '')

function readStoredAboutState(): { version: string; dismissed: boolean } | null {
  try {
    const parsed = JSON.parse(readLocalStorage(ABOUT_STATE_STORAGE_KEY) ?? 'null') as {
      version?: unknown
      dismissed?: unknown
    } | null
    if (parsed && typeof parsed.version === 'string')
      return { version: parsed.version, dismissed: parsed.dismissed === true }
  } catch {
    /* invalid storage is treated as empty */
  }
  return null
}

let suppressLocalPersistence = false
const storedAboutState = readStoredAboutState()

const photos = ref<PhotoItem[]>([])
const outfits = ref<OutfitItem[]>([])
const unreadableOutfitCount = ref(0)
const homeSchemesCount = ref(0)
const homeLibraryRevision = ref(0)
let homeCountGeneration = 0
const resonanceRecords = ref<ResonanceRecord[]>([])
const resonanceBannerOrder = ref<ResonanceBannerOrder>('newest')
const resonanceRarityFilter = ref<ResonanceRarityFilter>('all')
const outfitTags = ref<string[]>([])
const activeOutfitFilter = ref<OutfitFilter>('all')
const editingOutfit = ref<OutfitItem | null>(null)
const isOutfitEditorVisible = ref(false)
const parseCodeInput = ref('')
const cameraParamsInput = ref('')
const normalizedCameraParamsInput = computed(() => cameraParamsInput.value.trim())
const isParseToolsVisible = ref(false)
const isFortuneTimeVisible = ref(false)
const parsingOutfitCode = ref('')
const parsingOutfitImage = ref<(() => Promise<Blob>) | undefined>()
const isOutfitParseVisible = ref(false)
const reopenParseToolsAfterOutfitClose = ref(false)
const reopenParseToolsAfterPhotoClose = ref(false)
const isOutfitGuideVisible = ref(false)
const isOutfitSummaryVisible = ref(false)
const isOutfitGuideDismissed = ref(readLocalStorage(OUTFIT_GUIDE_DISMISSED_KEY) === 'true')
const isUpdateLogVisible = ref(false)
const isDataReminderVisible = ref(false)
const dataReminderOpenedFromMenu = ref(false)
const isDataReminderDismissed = ref(readLocalStorage(DATA_REMINDER_DISMISSED_KEY) === 'true')
let pendingDataReminder = false
const isHelpAboutVisible = ref(false)
// 标记使用帮助是否从更新记录窗口跳来，关闭帮助后返回更新记录窗口
const returnToUpdateLog = ref(false)
// 版本号变化时本地记录失效，“不再提示”勾选状态随之重置
const isAboutDialogDismissed = ref(
  storedAboutState?.version === currentAboutVersion && storedAboutState.dismissed === true
)
const isX6GameAutoPromptDismissed = ref(
  readLocalStorage(X6GAME_AUTO_PROMPT_DISMISSED_KEY) === 'true'
)
const didCancelX6GameAutoPrompt = ref(false)
const outfitSidebarRef = ref<InstanceType<typeof OutfitSidebar> | null>(null)
const outfitEditorRef = ref<InstanceType<typeof OutfitEditor> | null>(null)
const outfitImportInput = ref<HTMLInputElement | null>(null)
const photoImportInput = ref<HTMLInputElement | null>(null)
const recentlyDeleted = ref<RecentlyDeletedPhoto[]>([])
const selectedIds = ref<Set<string>>(new Set())
const selectedOutfitIds = ref<Set<string>>(new Set())
const trashSelectedIds = ref<Set<string>>(new Set())
const favoriteIds = usePhotoFavorites(() => !suppressLocalPersistence)
const searchQuery = ref('')
const noteDialogPhoto = ref<PhotoItem | null>(null)
const noteDialogBaseline = ref('')
const isNoteDialogVisible = ref(false)
// 首次打开后保留组件，使关闭监听、焦点恢复及退出动画继续按原流程执行。
const mountedDialogs = ref(new Set<string>())
function retainDialogAfterOpen(name: string, visible: import('vue').Ref<boolean>) {
  watch(
    visible,
    (open) => {
      if (open) mountedDialogs.value.add(name)
    },
    { immediate: true, flush: 'sync' }
  )
}
retainDialogAfterOpen('OutfitParseDialog', isOutfitParseVisible)
retainDialogAfterOpen('OutfitEditor', isOutfitEditorVisible)

retainDialogAfterOpen('HelpAboutDialog', isHelpAboutVisible)
retainDialogAfterOpen('UpdateLogDialog', isUpdateLogVisible)
retainDialogAfterOpen('OutfitGuideDialog', isOutfitGuideVisible)
retainDialogAfterOpen('FortuneTimeDialog', isFortuneTimeVisible)
const compactLayout = useCompactLayout()
useVisualViewport()
const {
  language,
  locale,
  themeMode,
  autoParseActionsEnabled,
  thumbnailMode,
  outfitThumbnailMode,
  homeThumbnailMode,
  thumbnailSizes,
  saveThumbnailSize,
  toggleLanguage,
  toggleTheme,
  saveThumbnailMode
} = useAppPreferences({
  compactLayout,
  canPersist: () => !suppressLocalPersistence,
  onStatus: (status) => {
    statusState.value = status
  }
})
const directorySupported = supportsDirectoryAuthorization()
const mobileFiltersOpen = ref(false)
const mobileCollectionPicker = computed(
  () =>
    activeView.value === 'outfits' ||
    activeView.value === 'home' ||
    activeView.value === 'resonance' ||
    isCameraFavoritesView.value
)
const topBarRef = ref<InstanceType<typeof TopBar> | null>(null)
// 筛选栏提供当前位置，顶栏保留唯一点赞实例。
provide('mobileLikeTarget', ref<HTMLElement | null>(null))
const activeView = ref<AlbumView>(compactLayout.value && !directorySupported ? 'outfits' : 'all')
const isArchiveView = computed(() => ['resonance', 'wardrobe', 'makeup'].includes(activeView.value))
const archiveToolbarClosing = ref(false)
const archiveToolbarMotionDeadline = ref(0)
provide(archiveMotionDeadlineKey, archiveToolbarMotionDeadline)
let archiveToolbarExitTimer: ReturnType<typeof setTimeout> | undefined
onBeforeUnmount(() => clearTimeout(archiveToolbarExitTimer))
const sidebarMode = ref<'date' | 'action'>('date')
const actionSort = ref<ActionSort>('id')
const currentPreview = ref<PhotoDisplayItem | null>(null)
const sharedOutfitSource = ref<SharedOutfitSource | null>(null)
const hasX6GameAuthorization = ref(false)
const directoryState = ref<DirectoryState>({ type: 'none' })
const {
  state: photoTransfer,
  begin: beginPhotoTransfer,
  showPrepared: showPreparedPhotoTransfer,
  updateProgress: updatePhotoTransferProgress,
  createController: createPhotoTransferController,
  markCompleted: markPhotoTransferCompleted,
  markExportResult: markPhotoTransferExportResult,
  cancel: cancelPhotoTransferRequest,
  takeMovePending: takePhotoTransferMovePending,
  clearController: clearPhotoTransferController
} = usePhotoTransfer()
const { confirmDialog, openConfirmDialog, closeConfirmDialog, runSecondaryAction } =
  useConfirmDialog()
const albumDirectoryHandle = ref<FileSystemDirectoryHandle | null>(null)
const albumNotes = shallowRef<AlbumNoteSnapshot>()
const notesBlocked = computed(() => Boolean(albumNotes.value?.blocked))
const noteLockedHint = computed(() =>
  language.value === 'zh'
    ? '请先处理相册备注文件，再修改照片或备注。'
    : 'Resolve the album notes file before changing photos or notes.'
)
const isCompatibleAlbum = ref(false)
const hasAlbum = computed(() => Boolean(albumDirectoryHandle.value) || isCompatibleAlbum.value)
const compatibleMessages = computed(() => compatibleAlbumMessages[language.value])
const compatibleAlbumInput = ref<HTMLInputElement | null>(null)

const appShellRef = ref<HTMLElement | null>(null)
let topBarResizeObserver: ResizeObserver | null = null
// 派生视图状态
const favoriteTab = ref<'photos' | 'camera'>('camera')
const cameraFavoritesRef = ref<InstanceType<typeof CameraFavorites> | null>(null)
const allDataBackupRef = ref<InstanceType<typeof AllDataBackup> | null>(null)
const wardrobeRef = ref<InstanceType<typeof PersonalWardrobe> | null>(null)
const resonanceRecordsRef = ref<InstanceType<typeof ResonanceRecords> | null>(null)
const hasBackupData = ref(false)
const allBackupDisabled = computed(() => operations.isBusy.value || archiveCloud.visible.value)
// 只读目录恢复允许切换独立模块；所有写任务仍沿用原操作协调器互斥。
const navigationBusy = computed(
  () =>
    archiveCloud.visible.value ||
    operations.hasPending.value ||
    (activeOperation.value !== null && activeOperation.value !== 'loading')
)

function handleAllBackupBusy(busy: boolean) {
  if (busy) activeOperation.value = 'all-data-backup'
  else if (activeOperation.value === 'all-data-backup') activeOperation.value = null
}
const homeWorkspaceRef = ref<InstanceType<typeof HomeSchemeWorkspace> | null>(null)
async function reloadResonanceState() {
  if (resonanceRecordsRef.value) return resonanceRecordsRef.value.reload()
  resonanceRecords.value = await loadResonanceRecords()
}
function refreshArchiveViews() {
  return Promise.allSettled([wardrobeRef.value?.reload(), reloadResonanceState()])
}
function hasRefreshFailure(updates: PromiseSettledResult<unknown>[]) {
  return updates.some((update) => update.status === 'rejected' || update.value === false)
}
async function refreshHomeAfterImport() {
  const result = await homeWorkspaceRef.value?.reload()
  // 未挂载或编辑中延迟刷新时，仅更新导航计数。
  if (result === undefined || result === 'deferred') await updateHomeSchemeCount()
  return result
}
/** 两份本地存档提交后统一刷新；共鸣也参与衣橱拥有状态的推导。 */
async function refreshAfterArchiveSync() {
  const updates = await refreshArchiveViews()
  if (hasRefreshFailure(updates))
    showStatus({
      message:
        language.value === 'zh'
          ? '档案已保存，部分界面刷新失败，请重新加载页面。'
          : 'Saves restored, but some views could not refresh. Reload the page.',
      tone: 'warning',
      source: 'archive-cloud'
    })
}
/** 目录恢复只刷新所选模块，保留其他模块的编辑状态。 */
async function refreshAfterDirectoryRestore(event: Event) {
  const modules = (event as CustomEvent<string[]>).detail ?? []
  const tasks: Promise<unknown>[] = []
  if (modules.includes('outfits')) {
    selectedOutfitIds.value = new Set()
    if (currentPreview.value && 'code' in currentPreview.value) currentPreview.value = null
    tasks.push(reloadOutfitCollection())
  }
  if (modules.includes('home')) tasks.push(refreshHomeAfterImport())
  if (modules.includes('camera'))
    tasks.push(
      cameraFavoritesRef.value ? cameraFavoritesRef.value.reload() : refreshCameraFavoriteCodes()
    )
  const results = await Promise.allSettled(tasks)
  if (hasRefreshFailure(results))
    showStatus({
      message:
        language.value === 'zh'
          ? '数据恢复成功，部分界面刷新失败，请重新加载页面查看。'
          : 'Data restored; some views could not refresh. Reload to view them.',
      tone: 'warning'
    })
}
async function refreshAfterAllImport() {
  selectedOutfitIds.value = new Set()
  if (currentPreview.value && 'code' in currentPreview.value) currentPreview.value = null
  const [moduleUpdates, archiveUpdates] = await Promise.all([
    Promise.allSettled([
      reloadOutfitCollection(),
      refreshHomeAfterImport(),
      cameraFavoritesRef.value ? cameraFavoritesRef.value.reload() : refreshCameraFavoriteCodes()
    ]),
    refreshArchiveViews()
  ])
  if (hasRefreshFailure([...moduleUpdates, ...archiveUpdates]))
    showStatus({
      message:
        language.value === 'zh'
          ? '部分模块界面刷新失败，请刷新页面核对导入结果。'
          : 'Some views could not refresh. Reload to check the import results.',
      tone: 'warning'
    })
}
const cameraFavoriteCodes = ref<string[]>([])
const cameraFavoriteModal = ref(false)
const cameraMounted = ref(false)
let cameraCodesGeneration = 0
let pendingCameraFavorite: (() => void) | null = null
function updateCameraFavoriteCodes(codes: string[]) {
  cameraCodesGeneration++
  cameraFavoriteCodes.value = codes
}
/** 首屏只读取记录元数据，维持收藏计数和“已收藏”标记，不加载封面或编辑器。 */
async function refreshCameraFavoriteCodes() {
  const generation = ++cameraCodesGeneration
  const library = await readCameraFavorites(false)
  if (!appDisposed && generation === cameraCodesGeneration)
    cameraFavoriteCodes.value = library.records.map((record) => record.code)
}
function refreshCameraFavoriteMetadata() {
  void refreshCameraFavoriteCodes().catch((error) => {
    if (!appDisposed) captureDiagnosticError(error, { module: 'camera', action: 'load-count' })
  })
}
function saveCameraFavoriteFromParams() {
  const result = photoParamsResult.value
  if (!result || pendingCameraFavorite) return
  const photo = photoParamsPhoto.value
  const open = () => {
    void cameraFavoritesRef.value?.openFromResult(result, photo)
  }
  if (cameraFavoritesRef.value) open()
  else {
    pendingCameraFavorite = open
    cameraMounted.value = true
  }
}
watch(cameraFavoritesRef, (view) => {
  if (!view || !pendingCameraFavorite) return
  const open = pendingCameraFavorite
  pendingCameraFavorite = null
  open()
})
// 手机布局只展示相机参数，保留电脑端原有的收藏标签状态。
const isCameraFavoritesView = computed(
  () => activeView.value === 'favorites' && (compactLayout.value || favoriteTab.value === 'camera')
)
watch(
  isCameraFavoritesView,
  (active) => {
    if (active) cameraMounted.value = true
  },
  { immediate: true, flush: 'sync' }
)
// 共鸣、衣橱及相机参数均禁用比例设置；相机参数另支持独立的大小设置。
const isThumbnailModeDisabled = computed(() => isCameraFavoritesView.value || isArchiveView.value)
const photoParamsSaved = computed(() =>
  cameraFavoriteCodes.value.includes(
    normalizeCameraCode(photoParamsResult.value?.rawCameraParams ?? '')
  )
)
function changeFavoriteTab(tab: 'photos' | 'camera') {
  if (operations.isBusy.value) return
  favoriteTab.value = tab
  selectedIds.value = new Set()
  currentPreview.value = null
}
const photoParamsMessages = computed(() => locale.value.photoParams)
const photoParams = usePhotoParams({ language, messages: photoParamsMessages })
const photoActionParsing = usePhotoActionParsing({
  language,
  onError: (error) => {
    statusState.value = createErrorStatus(error, { type: 'readFailed' })
  }
})
const { actionInfo, progress: actionParseProgress } = photoActionParsing
const {
  photo: photoParamsPhoto,
  isVisible: isPhotoParamsVisible,
  result: photoParamsResult,
  error: photoParamsError,
  errorCodes: photoParamsErrorCodes,
  uidRequired: photoParamsUidRequired,
  progress: photoParamsProgress
} = photoParams
retainDialogAfterOpen('PhotoParamsDialog', isPhotoParamsVisible)
const {
  statusState,
  notices: statusNotices,
  activeOperation,
  isLoading,
  isDeleting,
  isTrashBusy,
  isSavingOutfit,
  isImportingOutfits,
  isExportingOutfits,
  isImportingPhotos,
  isExportingPhotos,
  isAnyFileOperationBusy,
  showStatus,
  updateLoadingNotice,
  clearStatus: clearOperationStatus,
  closeNotice: closeStatusNotice,
  pauseNotice: pauseStatusNoticeTimer,
  resumeNotice: resumeStatusNoticeTimer,
  createErrorStatus,
  isUserCancelledFilePicker,
  dispose: disposeStatusNotice
} = useOperationNotice(locale, operations)
// 电脑原始数据备份复用全站顶部通知；同一来源只保留一条持续加载提示。
type BackupNoticeDetail = {
  source: string
  message: string | null
  tone?: 'success' | 'error' | 'info'
  loading?: boolean
}
function handleBackupNotice(event: Event) {
  const { source, message, tone, loading } = (event as CustomEvent<BackupNoticeDetail>).detail
  if (loading) {
    updateLoadingNotice(source, message)
  } else {
    updateLoadingNotice(source, null)
    if (message) showStatus({ message, tone: tone ?? 'success', source })
  }
}
onMounted(() => window.addEventListener('nuan-backup-notice', handleBackupNotice))
onBeforeUnmount(() => window.removeEventListener('nuan-backup-notice', handleBackupNotice))
// 云端进度复用一条顶部通知，结束、失败或关闭后立即撤下。
watch(
  [archiveCloud.visible, archiveCloud.phase, archiveCloud.action, language],
  ([visible, phase, action, lang]) => {
    const t = archiveCloudMessages[lang]
    const message =
      !visible || action === 'login' || action === 'register'
        ? null
        : phase === 'preparing'
          ? t.preparing
          : phase === 'submitting'
            ? action === 'upload'
              ? t.uploading
              : action === 'download'
                ? t.downloading
                : t.deleting
            : null
    updateLoadingNotice('archive-cloud', message)
  },
  { immediate: true, flush: 'sync' }
)
// 退出可直接从菜单触发，提示监听不能依赖云存档弹窗首次挂载。
watch(archiveCloud.logoutNotice, () =>
  showStatus({
    message: cloudMessages[language.value].success,
    tone: 'success',
    source: 'archive-cloud'
  })
)
// 自动解析进度固定占用一条顶部通知；关闭或结束后只撤下进度，不影响其他通知。
watch(
  [actionParseProgress, autoParseActionsEnabled],
  ([progress, enabled]) => {
    updateLoadingNotice(
      'photo-action-auto-parse',
      enabled && progress.running
        ? locale.value.sidebar.parseProgress(progress.completed, progress.total)
        : null
    )
  },
  { immediate: true, deep: true, flush: 'sync' }
)
const {
  outfitLocale,
  visiblePhotos,
  visibleOutfits,
  previewPhotos,
  currentPreviewOutfit,
  formattedDateGroups,
  dateGroups,
  yearGroups,
  visibleCount,
  favoriteCount,
  trashTotalSizeText,
  thumbnailModeOptions,
  displayedThumbnailMode,
  directoryName,
  viewTitle,
  actionGroups
} = useAlbumViewModel({
  photos,
  outfits,
  recentlyDeleted,
  favoriteIds,
  activeView,
  activeOutfitFilter,
  searchQuery,
  currentPreview,
  thumbnailMode,
  outfitThumbnailMode,
  homeThumbnailMode,
  directoryState,
  language,
  locale,
  actionInfo,
  actionSort
})
const mobileText = (zh: string, en: string) => (language.value === 'zh' ? zh : en)
const mobileFilterCount = computed(() =>
  activeView.value === 'outfits'
    ? visibleOutfits.value.length
    : activeView.value === 'resonance'
      ? resonanceRecords.value.filter(
          (record) =>
            resonanceRarityFilter.value === 'all' ||
            record.rarity === Number(resonanceRarityFilter.value)
        ).length
      : visibleCount.value
)
const mobileFilterEntries = computed(() =>
  activeView.value === 'outfits'
    ? [
        { key: 'all', label: outfitLocale.value.all },
        { key: 'pending', label: outfitLocale.value.pending },
        { key: 'uncategorized', label: outfitLocale.value.uncategorized },
        ...outfitTags.value.map((tag) => ({ key: `tag:${tag}`, label: tag }))
      ]
    : activeView.value === 'resonance'
      ? [
          { key: 'all', label: mobileText('全部', 'All') },
          { key: '5', label: mobileText('五星', '5-star') },
          { key: '4', label: mobileText('四星', '4-star') }
        ]
      : [
          { key: 'date', label: locale.value.sidebar.title },
          { key: 'action', label: locale.value.sidebar.actionsTitle }
        ]
)
const mobileActiveFilter = computed(() =>
  activeView.value === 'outfits'
    ? activeOutfitFilter.value
    : activeView.value === 'resonance'
      ? resonanceRarityFilter.value
      : sidebarMode.value
)
function changeMobileFilter(key: string) {
  if (activeView.value === 'outfits') changeOutfitFilter(key as OutfitFilter)
  else if (activeView.value === 'resonance')
    resonanceRarityFilter.value = key === 'all' ? 'all' : (Number(key) as ResonanceRarityFilter)
  else sidebarMode.value = key as 'date' | 'action'
}
watch(activeView, (view) => setDiagnosticModule(view), { immediate: true })
watch(activeView, () => {
  mobileFiltersOpen.value = false
  topBarRef.value?.closeMenus()
})
watch(compactLayout, (compact) => {
  mobileFiltersOpen.value = false
  if (compact) isOutfitGuideVisible.value = false
})

const currentPreviewIndex = computed(() =>
  currentPreview.value
    ? previewPhotos.value.findIndex((photo) => photo.id === currentPreview.value?.id)
    : -1
)
const hasPreviousPreview = computed(() => currentPreviewIndex.value > 0)
const hasNextPreview = computed(
  () => currentPreviewIndex.value >= 0 && currentPreviewIndex.value < previewPhotos.value.length - 1
)
function openPreview(photo: PhotoDisplayItem) {
  currentPreview.value = photo
}
function closePreview() {
  currentPreview.value = null
}
function showPreviousPreview() {
  if (hasPreviousPreview.value) {
    currentPreview.value = previewPhotos.value[currentPreviewIndex.value - 1]
  }
}

function showNextPreview() {
  if (hasNextPreview.value) {
    currentPreview.value = previewPhotos.value[currentPreviewIndex.value + 1]
  }
}
const {
  scopedSelectedPhotos,
  selectedCount,
  selectedOutfitCount,
  trashSelectedCount,
  allSelected,
  allOutfitsSelected,
  allTrashSelected,
  allSelectedFavorited,
  toggleAll,
  toggleAllOutfits,
  toggleOutfit,
  togglePhoto,
  toggleTrashPhoto,
  toggleAllTrash,
  toggleFavorite,
  favoriteSelectedPhotos,
  unfavoriteSelectedPhotos,
  clearAlbumSelection,
  clearOutfitSelection,
  clearTrashSelection,
  toggleDate
} = useSelectionState({
  recentlyDeleted,
  visiblePhotos,
  visibleOutfits,
  dateGroups,
  favoriteIds,
  selectedIds,
  selectedOutfitIds,
  trashSelectedIds,
  activeView
})
const {
  mergeRecentlyDeleted,
  applyMovedPhotosResult,
  movePhotosToTrash,
  restoreTrashPhotos,
  permanentlyDeleteTrashPhotos,
  deleteAllTrash
} = usePhotoTrashActions({
  albumDirectoryHandle,
  photos,
  recentlyDeleted,
  selectedIds,
  trashSelectedIds,
  favoriteIds,
  currentPreview,
  currentPreviewIndex,
  visiblePhotos,
  locale,
  activeOperation,
  isAnyFileOperationBusy: computed(() => isAnyFileOperationBusy.value || notesBlocked.value),
  statusState,
  createErrorStatus,
  openConfirmDialog
})

const {
  showCleanupDialog,
  cleanupX6GameHandle,
  cleaningItem,
  showCleanupAccountDialog,
  cleanupAccounts,
  cleanupRememberedChoice,
  openCleanupDialog: openWritableCleanupDialog,
  authorizeCleanupFolder,
  resolveCleanupAccounts,
  cleanSpecialItem: cleanWritableSpecialItem,
  deleteMatchingLowQualityPhotos: cleanMatchingPhotos
} = useGameCleanup({
  albumDirectoryHandle,
  hasX6GameAuthorization,
  language,
  locale,
  activeOperation,
  isAnyFileOperationBusy,
  statusState,
  createErrorStatus,
  openConfirmDialog
})

function openCleanupDialog() {
  if (isCompatibleAlbum.value) {
    showStatus({ message: compatibleMessages.value.writeDisabled, tone: 'info' })
    return
  }
  return openWritableCleanupDialog()
}
function cleanSpecialItem(...args: Parameters<typeof cleanWritableSpecialItem>) {
  if (isCompatibleAlbum.value) return
  return cleanWritableSpecialItem(...args)
}

function deleteMatchingLowQualityPhotos() {
  if (isCompatibleAlbum.value || activeView.value === 'trash' || activeView.value === 'outfits')
    return
  return cleanMatchingPhotos(scopedSelectedPhotos.value)
}
// 通用通知、偏好与持久化
async function resolveActionCandidateUids(): Promise<string[]> {
  if (isCompatibleAlbum.value) return getSavedCameraParamUids()
  const source = sharedOutfitSource.value ?? (await ensureSharedOutfitSource(true, false))
  if (!source) return getSavedCameraParamUids()
  const [directoryUids, savedUids] = await Promise.all([
    listGamePlayPhotoAccounts(source.x6GameDirectory),
    getSavedCameraParamUids()
  ])
  return [...new Set([...directoryUids, ...savedUids])]
}

watch(
  [autoParseActionsEnabled, photos, albumDirectoryHandle, isCompatibleAlbum],
  ([enabled, currentPhotos, directory, compatible], previous) => {
    if ((!directory && !compatible) || !currentPhotos.length) {
      photoActionParsing.cancel()
      return
    }
    void photoActionParsing.start(
      currentPhotos,
      compatible
        ? `compat:${directoryState.value.type !== 'none' ? directoryState.value.name : ''}`
        : directory!.name,
      resolveActionCandidateUids,
      enabled,
      enabled && previous?.[0] === false
    )
  },
  { immediate: true }
)

async function updateHomeSchemeCount() {
  const generation = ++homeCountGeneration
  const count = await countHomeSchemes()
  if (generation === homeCountGeneration) homeSchemesCount.value = count
}

async function migrateHomeSchemes(
  directory: FileSystemDirectoryHandle
): Promise<StatusState | null> {
  try {
    const result = await (
      await import('./utils/homeBuild/homeSchemeMigration')
    ).migrateHomeSchemeLibrary(directory)
    await updateHomeSchemeCount()
    if (result.addedCount || result.replacedCount || result.tagsChanged) homeLibraryRevision.value++
    if (
      !result.addedCount &&
      !result.replacedCount &&
      !result.skippedCount &&
      !result.failedCount &&
      !result.tagsChanged &&
      !result.homeDirectoryRemoved
    )
      return null
    let message = locale.value.homeScheme.migrationSucceeded(
      result.addedCount,
      result.replacedCount,
      result.skippedCount,
      result.failedCount
    )
    if (result.homeDirectoryRemoved)
      message += ' ' + locale.value.homeScheme.migrationDirectoryRemoved
    if (result.failures.length) {
      message +=
        ' ' +
        locale.value.homeScheme.migrationFailedItems(
          [...new Set(result.failures.map((item) => item.fileName))].slice(0, 5).join('、')
        )
      if (result.failures.some((item) => item.message.startsWith('home_scheme_tag_limit')))
        message += ' ' + locale.value.homeScheme.migrationTagLimit
      if (result.failures.some((item) => item.fileName === 'home'))
        message += ' ' + locale.value.homeScheme.migrationCleanupFailed
      if (result.failures.some((item) => item.errorName === 'QuotaExceededError'))
        message += ' ' + locale.value.homeScheme.storageFull
    }
    return { type: 'custom', message, tone: result.failedCount ? 'warning' : 'success' }
  } catch (error) {
    captureDiagnosticError(error, { module: 'home-schemes', action: 'migration' })
    return {
      type: 'custom',
      message:
        error instanceof DOMException && error.name === 'QuotaExceededError'
          ? locale.value.homeScheme.storageFull
          : locale.value.homeScheme.operationFailed,
      tone: 'error'
    }
  }
}

function handleHomeSchemeCount(count: number) {
  homeCountGeneration++
  homeSchemesCount.value = count
}

// 相册加载、恢复与刷新
/**
 * 替换当前相册并同步其最近删除目录。
 * 参数：result 为新相册结果，nextStatus 为完成后的状态提示。
 */
async function replaceAlbum(
  result: AlbumDirectoryResult,
  nextStatus: StatusState,
  options: { preserveView?: boolean } = {}
) {
  await operations.waitForPending()
  if (appDisposed) {
    releasePhotoUrls(result.photos)
    return
  }
  const restoring = activeOperation.value === 'loading'
  // 读取目录后可能迁移搭配和家园文件；该阶段恢复全局写互斥。
  if (restoring) activeOperation.value = 'updating-outfits'
  try {
    invalidatePendingRefreshes()
    const [outfitResult, nextRecentlyDeleted] = await Promise.all([
      readOutfitLibrary(result.directoryHandle),
      listRecentlyDeleted(result.directoryHandle, result.notes?.metadata.photos)
    ])
    if (appDisposed) {
      releasePhotoUrls(result.photos)
      releasePhotoUrls(outfitResult.outfits)
      releasePhotoUrls(nextRecentlyDeleted)
      return
    }
    await saveAlbumDirectoryHandle(result.directoryHandle)
    isCompatibleAlbum.value = false
    writeLocalStorage(ALBUM_ACCESS_MODE_KEY, 'directory')

    releasePhotoUrls(photos.value)
    releasePhotoUrls(outfits.value)
    releasePhotoUrls(recentlyDeleted.value)
    sharedOutfitSource.value = null
    selectedIds.value = new Set()
    selectedOutfitIds.value = new Set()
    trashSelectedIds.value = new Set()
    currentPreview.value = null
    editingOutfit.value = null
    isOutfitEditorVisible.value = false
    isOutfitGuideVisible.value = false
    photos.value = result.photos
    unreadableOutfitCount.value = outfitResult.unreadableCount ?? 0
    outfits.value = outfitResult.outfits
    outfitTags.value = outfitResult.tags
    recentlyDeleted.value = nextRecentlyDeleted
    // 收藏记录跨相册保留，切换相册时不再按当前照片裁剪，避免切回后丢失
    if (!options.preserveView) activeView.value = 'all'
    albumNotes.value = result.notes
    albumDirectoryHandle.value = result.directoryHandle
    directoryState.value = { type: 'selected', name: result.directoryName }
    statusState.value = outfitResult.failedCount
      ? {
          type: 'custom',
          message: outfitLocale.value.operations.albumOpenedWithFailures(outfitResult.failedCount),
          tone: 'warning'
        }
      : nextStatus
    if (
      outfitResult.migration &&
      (outfitResult.migration.addedCount ||
        outfitResult.migration.replacedCount ||
        outfitResult.migration.tagsChanged ||
        outfitResult.migration.clotheDirectoryRemoved ||
        outfitResult.failedCount)
    )
      showOutfitRefreshResult(outfitResult, false)
    const migrationStatus = await migrateHomeSchemes(result.directoryHandle)
    if (migrationStatus) statusState.value = migrationStatus
  } finally {
    if (restoring && activeOperation.value === 'updating-outfits') activeOperation.value = 'loading'
  }
}

const { refreshAlbum, scheduleFocusRefresh, invalidatePendingRefreshes, suppressNextFocusRefresh } =
  useDirectoryRefresh({
    directory: () => albumDirectoryHandle.value,
    photos: () => photos.value,
    blocked: () =>
      isAnyFileOperationBusy.value || confirmDialog.value.visible || isOutfitEditorVisible.value,
    editorOpen: () => isOutfitEditorVisible.value,
    refreshingMessage: () =>
      activeView.value === 'outfits' ? outfitLocale.value.updating : locale.value.topBar.refreshing,
    locale,
    activeOperation,
    statusState,
    createErrorStatus,
    apply: applyRefreshResult,
    migrate: migrateHomeSchemes,
    refreshCollections: async () => {
      await updateOutfitLibrary(false, false)
      if (!cameraMounted.value) refreshCameraFavoriteMetadata()
    }
  })

const { restoreSavedDirectory, restoreSavedX6GameAuthorization, chooseDirectory } =
  useDirectorySession({
    language,
    activeOperation,
    isAnyFileOperationBusy,
    statusState,
    locale,
    directoryState,
    photos,
    hasX6GameAuthorization,
    replaceAlbum,
    createErrorStatus
  })

/** 用户点击时同步打开选择器，避免选择过程触发焦点刷新。 */
function chooseCompatibleAlbum() {
  if (isAnyFileOperationBusy.value) return
  suppressNextFocusRefresh.value = true
  if (compatibleAlbumInput.value) {
    compatibleAlbumInput.value.value = ''
    compatibleAlbumInput.value.click()
  }
}
async function recoverNotes(choice: string | null) {
  const directory = albumDirectoryHandle.value,
    snapshot = albumNotes.value
  if (!directory || !snapshot || isCompatibleAlbum.value || isAnyFileOperationBusy.value) return
  const zh = language.value === 'zh'
  if (
    !(await openConfirmDialog({
      title: zh ? '确认处理相册备注' : 'Confirm album notes recovery',
      message: choice
        ? zh
          ? '将先备份现有正式文件，再从所选副本恢复备注。'
          : 'Back up the current file and restore notes from the selected copy.'
        : zh
          ? '保留当前正式版本，备份有差异的待提交文件。'
          : 'Keep the current version and back up the differing pending copy.',
      confirmLabel: zh ? '确认' : 'Confirm',
      tone: 'warning'
    }))
  )
    return
  if (directory !== albumDirectoryHandle.value || isAnyFileOperationBusy.value) return
  activeOperation.value = 'loading'
  let failed = false,
    cleanupPending = false
  try {
    ;({ cleanupPending } = await recoverAlbumNotes(directory, snapshot, choice))
  } catch {
    failed = true
  } finally {
    activeOperation.value = null
  }
  await refreshAlbum(false)
  if (cleanupPending)
    showStatus({
      message: zh
        ? '正式备注文件已验证，待提交副本暂未清理。'
        : 'Notes verified. The pending copy could not be removed.',
      tone: 'warning'
    })
  if (failed)
    showStatus({
      message: zh
        ? '备注处理未完成。请检查文件和权限，再重新读取相册。'
        : 'Notes recovery did not finish. Check the files and permissions and reopen the album.',
      tone: 'warning'
    })
}

function cancelCompatibleAlbum() {
  suppressNextFocusRefresh.value = false
}
async function loadCompatibleAlbum(event: Event) {
  suppressNextFocusRefresh.value = false
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files ?? [])
  input.value = ''
  if (!files.length || isAnyFileOperationBusy.value) return
  activeOperation.value = 'loading'
  try {
    const result = await readCompatibleAlbum(files)
    if (!result.photos.length) {
      showStatus({ message: compatibleMessages.value.empty, tone: 'warning' })
      return
    }
    await operations.waitForPending()
    if (appDisposed) return
    resetLoadedAlbumState()
    albumDirectoryHandle.value = null
    isCompatibleAlbum.value = true
    directoryState.value = { type: 'selected', name: result.directoryName }
    photos.value = result.photos
    albumNotes.value = result.notes
    activeView.value = 'all'
    isNoteDialogVisible.value = false
    noteDialogPhoto.value = null
    writeLocalStorage(ALBUM_ACCESS_MODE_KEY, 'compatible')
    showStatus({ message: compatibleMessages.value.hint, tone: 'success' })
  } catch (error) {
    statusState.value = createErrorStatus(error, { type: 'readFailed' })
  } finally {
    if (activeOperation.value === 'loading') activeOperation.value = null
  }
}

async function downloadCompatiblePhotos(source: PhotoItem[]) {
  activeOperation.value = 'exporting-photos'
  beginPhotoTransfer('export', locale.value.selectionBar.exportPhotos)
  showPreparedPhotoTransfer(source.length)
  const controller = createPhotoTransferController()
  const downloads: File[] = []
  try {
    await exportCompatiblePhotos(
      source,
      controller.signal,
      (file) => {
        downloads.push(file)
        requestBlobDownload(file.name, file)
      },
      (completed) => {
        updatePhotoTransferProgress({
          completed,
          total: source.length,
          succeeded: completed,
          failedNames: [],
          cancelled: false
        })
      }
    )
    markPhotoTransferCompleted()
    showStatus({
      message: compatibleMessages.value.exported,
      tone: 'success',
      downloadFiles: downloads
    })
  } catch (error) {
    if (controller.signal.aborted) {
      updatePhotoTransferProgress({
        completed: photoTransfer.completed,
        total: source.length,
        succeeded: photoTransfer.succeeded,
        failedNames: [],
        cancelled: true
      })
    } else {
      markPhotoTransferCompleted()
      statusState.value = createErrorStatus(error, { type: 'readFailed' })
    }
    if (downloads.length)
      showStatus({
        message: compatibleMessages.value.exported,
        tone: 'info',
        downloadFiles: downloads
      })
  } finally {
    if (activeOperation.value === 'exporting-photos') activeOperation.value = null
    clearPhotoTransferController()
  }
}

/** 清除页面内已加载的相册和选择状态。参数：无。 */
function resetLoadedAlbumState(options: { clearSharedOutfit?: boolean } = {}) {
  albumNotes.value = undefined
  invalidatePendingRefreshes()
  photoActionParsing.cancel()
  actionInfo.value = new Map()
  releasePhotoUrls(photos.value)
  releasePhotoUrls(recentlyDeleted.value)
  photos.value = []
  recentlyDeleted.value = []
  selectedIds.value = new Set()
  selectedOutfitIds.value = new Set()
  trashSelectedIds.value = new Set()
  currentPreview.value = null
  editingOutfit.value = null
  isOutfitEditorVisible.value = false
  isOutfitGuideVisible.value = false
  if (options.clearSharedOutfit !== false) sharedOutfitSource.value = null
}

/** 清除保存的目录授权和当前页面状态。参数：无。 */
async function clearDirectory() {
  if (isAnyFileOperationBusy.value) return
  try {
    await clearSavedAlbumDirectoryHandle()
  } catch (error) {
    statusState.value = createErrorStatus(error, { type: 'readFailed' })
    return
  }
  resetLoadedAlbumState({ clearSharedOutfit: false })
  albumDirectoryHandle.value = null
  isCompatibleAlbum.value = false
  removeLocalStorage(ALBUM_ACCESS_MODE_KEY)
  activeView.value = 'all'
  directoryState.value = { type: 'none' }
  statusState.value = { type: 'cleared' }
}

/** 标记搭配码界面不再自动弹出 X6Game 授权窗口。参数：无。 */
function dismissX6GameAutoPrompt() {
  isX6GameAutoPromptDismissed.value = true
  didCancelX6GameAutoPrompt.value = true
  if (!suppressLocalPersistence) writeLocalStorage(X6GAME_AUTO_PROMPT_DISMISSED_KEY, 'true')
  statusState.value = {
    type: 'custom',
    message: locale.value.app.x6GameAuthorizationCancelledStatus,
    tone: 'info'
  }
}

/** 清除浏览器中的解析缓存。参数：无。 */
async function clearCache() {
  if (isAnyFileOperationBusy.value) return
  const confirmed = await openConfirmDialog({
    title: locale.value.app.clearCacheDialogTitle,
    message: locale.value.app.clearCacheConfirmMessage,
    tone: 'warning',
    confirmLabel: locale.value.topBar.clearCache,
    cancelLabel: locale.value.app.dialogCancel
  })
  if (!confirmed) return

  try {
    photoActionParsing.reset()
    await invalidateCacheWrites()
    await Promise.all([
      clearSavedOutfitParseResults(),
      clearSavedHomeSchemeParseResults(),
      clearSavedPhotoActionCache()
    ])
    statusState.value = {
      type: 'custom',
      message: locale.value.app.clearCacheStatus,
      tone: 'success'
    }
  } catch (error) {
    statusState.value = createErrorStatus(error, { type: 'readFailed' })
  }
}

/** 完整重置本站数据；提交后重新加载，统一释放模块状态并恢复各端默认入口。 */
async function clearData() {
  if (isAnyFileOperationBusy.value) return
  const confirmed = await openConfirmDialog({
    title: locale.value.app.clearDataDialogTitle,
    message: locale.value.app.clearDataFirstConfirmMessage,
    sections: locale.value.app.clearDataSections,
    consequence: locale.value.app.clearDataConsequence,
    secondaryLabel: locale.value.app.clearDataBackup,
    onSecondary: async () => {
      await allDataBackupRef.value?.exportData()
    },
    tone: 'danger',
    confirmLabel: locale.value.app.clearDataConfirm,
    cancelLabel: locale.value.app.dialogCancel
  })
  // 清浏览器数据不等于业务主动清空：必须保留授权目录下的备份。
  if (!confirmed || isAnyFileOperationBusy.value) return
  let resetBaseline: Awaited<ReturnType<typeof browserBaseline>>
  try {
    resetBaseline = await browserBaseline()
  } catch (error) {
    statusState.value = createErrorStatus(error, { type: 'readFailed' })
    return
  }
  const stillClear = () =>
    openConfirmDialog({
      title: language.value === 'zh' ? '仍然清除本站数据？' : 'Clear browser data anyway?',
      message:
        language.value === 'zh'
          ? '未备份的最新修改可能丢失。电脑上已保存的副本会保留，但不保证包含最新修改。'
          : 'Unbacked-up edits may be lost. Existing computer copies are preserved, but may not include the latest edits.',
      tone: 'danger',
      confirmLabel: language.value === 'zh' ? '仍然清除' : 'Clear anyway',
      cancelLabel: locale.value.app.dialogCancel
    })
  try {
    if (await pendingEnabledBackups()) {
      const first = await openConfirmDialog({
        title: language.value === 'zh' ? '还有待备份修改' : 'Backup changes are pending',
        tone: 'warning',
        message:
          language.value === 'zh'
            ? '是否先尝试完成电脑备份？未完成的最新修改在清除浏览器后无法找回。'
            : 'Try completing the computer backup first? Pending edits cannot be recovered after clearing the browser.',
        confirmLabel: language.value === 'zh' ? '先尝试备份' : 'Try backup first',
        cancelLabel: language.value === 'zh' ? '暂不备份' : 'Not now'
      })
      const backedUp = first && (await flushBackupsBeforeReset())
      if (!backedUp) {
        resetBaseline = await browserBaseline()
        if (!(await stillClear())) return
      }
    }
  } catch {
    resetBaseline = await browserBaseline()
    if (!(await stillClear())) return
  }

  await operations.run('website-reset', async () => {
    suppressLocalPersistence = true
    try {
      photoActionParsing.reset()
      photoParams.close()
      await invalidateCacheWrites()
      await pauseBackupsForBrowserReset(() => clearAllBrowserData(), resetBaseline)
      localStorage.clear()
      sessionStorage.clear()
      statusState.value = {
        type: 'custom',
        message: locale.value.app.clearDataStatus,
        tone: 'success'
      }
      // 整页重新初始化，避免收藏、筛选、目录句柄和解析器继续使用旧的内存状态。
      location.reload()
    } catch (error) {
      statusState.value = createErrorStatus(error, { type: 'readFailed' })
    } finally {
      suppressLocalPersistence = false
    }
  })
}

/**
 * 应用增量刷新结果并清理失效状态。
 * 参数：result 为文件系统扫描结果。
 */
function applyRefreshResult(result: RefreshAlbumResult) {
  albumNotes.value = result.notes
  for (const photo of result.removedPhotos) releasePhotoUrl(photo)
  for (const photo of result.replacedPhotos) releasePhotoUrl(photo)
  photos.value = result.photos
  mergeRecentlyDeleted(result.recentlyDeleted)
  const validPhotoIds = new Set(photos.value.map((photo) => photo.id))
  selectedIds.value = new Set([...selectedIds.value].filter((id) => validPhotoIds.has(id)))
  // 收藏记录不随刷新裁剪：其他相册的收藏必须保留，本相册临时缺失的文件重新出现后收藏仍生效
  if (currentPreview.value) {
    const refreshedPreview = previewPhotos.value.find(
      (photo) => photo.id === currentPreview.value?.id
    )
    currentPreview.value = refreshedPreview ?? null
  }
}

const thumbnailKind = computed(() =>
  activeView.value === 'outfits' ? 'outfit' : activeView.value === 'home' ? 'home' : 'photo'
)
const thumbnailSizeKind = computed(() =>
  isCameraFavoritesView.value ? 'camera' : thumbnailKind.value
)
const isThumbnailSizeDisabled = computed(() => isArchiveView.value)
const displayedThumbnailSize = computed(() => thumbnailSizes.value[thumbnailSizeKind.value])

/** 比例与大小独立保存；固定卡片页面拒绝修改。 */
function changeThumbnailSize(size: ThumbnailSize) {
  if (!isThumbnailSizeDisabled.value) saveThumbnailSize(thumbnailSizeKind.value, size)
}

function changeThumbnailMode(mode: ThumbnailMode) {
  if (!isThumbnailModeDisabled.value) saveThumbnailMode(thumbnailKind.value, mode)
}

// X6Game 授权与搭配码流程
/** 获取或恢复当前相册对应的 X6Game 授权，用于自动读取游戏最新搭配码。参数：prompt 表示是否允许弹出授权说明（false 时也不弹系统目录选择器，未授权则静默跳过共享导入），autoPrompt 表示是否为搭配码界面自动触发。 */
async function ensureSharedOutfitSource(
  prompt: boolean,
  autoPrompt = prompt,
  forcePick = false
): Promise<SharedOutfitSource | null> {
  if (autoPrompt && isX6GameAutoPromptDismissed.value && !forcePick) return null
  let cancelledPrompt = false
  const confirmAuthorization = async (message: string) => {
    const confirmed = await openConfirmDialog({
      title: locale.value.app.x6GameDirectoryDialogTitle,
      message,
      tone: 'info',
      confirmLabel: locale.value.app.dialogContinueAuthorization,
      cancelLabel: locale.value.app.dialogCancel
    })
    cancelledPrompt = !confirmed
    return confirmed
  }
  try {
    const saved =
      sharedOutfitSource.value?.x6GameDirectory ?? (await getSavedX6GameDirectoryHandle())
    if (!forcePick && saved && saved.name === 'X6Game') {
      const permission = saved.queryPermission
        ? await saved.queryPermission({ mode: 'readwrite' })
        : 'granted'
      if (permission === 'granted') {
        sharedOutfitSource.value = { x6GameDirectory: saved }
        hasX6GameAuthorization.value = true
        return sharedOutfitSource.value
      }
    }
    hasX6GameAuthorization.value = false
    sharedOutfitSource.value = null
    // 后台不请求授权；进入模块时，不支持目录授权的设备静默跳过。
    if (!prompt || (autoPrompt && !supportsDirectoryAuthorization())) return null
    const directoryHandle = await pickStandaloneX6GameDirectory(locale.value.fileSystem, {
      forcePick,
      beforeRequestX6GamePermission: () =>
        confirmAuthorization(locale.value.fileSystem.restoreX6GamePermissionPrompt),
      beforePickX6GameDirectory: () =>
        forcePick || confirmAuthorization(locale.value.fileSystem.selectX6GameDirectoryPrompt)
    })
    sharedOutfitSource.value = { x6GameDirectory: directoryHandle }
    hasX6GameAuthorization.value = true
    isX6GameAutoPromptDismissed.value = false
    didCancelX6GameAutoPrompt.value = false
    if (!suppressLocalPersistence) removeLocalStorage(X6GAME_AUTO_PROMPT_DISMISSED_KEY)
    return sharedOutfitSource.value
  } catch (error) {
    if (autoPrompt && (cancelledPrompt || isUserCancelledFilePicker(error)))
      dismissX6GameAutoPrompt()
    else if (prompt && !cancelledPrompt && !isUserCancelledFilePicker(error))
      showOutfitStorageError(error)
    return null
  }
}

/** 独立授权 X6Game 文件夹并检查游戏搭配，无需选择相册。 */
async function authorizeX6GameDirectory() {
  if (isAnyFileOperationBusy.value) return
  const source = await ensureSharedOutfitSource(true, false, hasX6GameAuthorization.value)
  if (!source) return
  statusState.value = {
    type: 'custom',
    message: locale.value.app.authorizeX6GameStatus,
    tone: 'success'
  }
  await updateOutfitLibrary(false, false)
}

/** 重新扫描搭配方案并应用结果；提示由上层流程统一决定。 */
function applyOutfitLibraryResult(result: OutfitLibraryResult) {
  const previousPreviewId = activeView.value === 'outfits' ? currentPreview.value?.id : null
  releasePhotoUrls(outfits.value)
  unreadableOutfitCount.value = result.unreadableCount ?? 0
  outfits.value = result.outfits
  outfitTags.value = result.tags
  const validOutfitIds = new Set(result.outfits.map((outfit) => outfit.id))
  selectedOutfitIds.value = new Set(
    [...selectedOutfitIds.value].filter((id) => validOutfitIds.has(id))
  )
  if (
    activeOutfitFilter.value.startsWith('tag:') &&
    !result.tags.includes(activeOutfitFilter.value.slice(4))
  ) {
    activeOutfitFilter.value = 'all'
  }
  if (previousPreviewId)
    currentPreview.value = result.outfits.find((outfit) => outfit.id === previousPreviewId) ?? null
}

/** 扫描搭配方案并返回结果，不直接修改页面状态。 */
async function scanOutfitLibrary(promptSharedAccess = false): Promise<OutfitLibraryResult> {
  const directoryHandle = albumDirectoryHandle.value
  const sharedSource = await ensureSharedOutfitSource(promptSharedAccess)
  return readOutfitLibrary(directoryHandle, { sharedSource })
}

/** 扫描搭配方案并在当前任务仍有效时应用结果。 */
let outfitLoadGeneration = 0
let appDisposed = false
async function reloadOutfitCollection() {
  const generation = ++outfitLoadGeneration
  const library = await readOutfitCollection()
  if (appDisposed || generation !== outfitLoadGeneration) return
  applyOutfitLibraryResult({ ...library, importedSharedCount: 0, failedCount: 0 })
}
async function refreshOutfitLibrary(promptSharedAccess = false): Promise<OutfitLibraryResult> {
  const generation = ++outfitLoadGeneration
  const result = await scanOutfitLibrary(promptSharedAccess)
  if (!appDisposed && generation === outfitLoadGeneration) applyOutfitLibraryResult(result)
  else releasePhotoUrls(result.outfits)
  return result
}
function showOutfitStorageError(error: unknown, source?: string) {
  captureDiagnosticError(error, { module: 'outfits', action: activeOperation.value ?? 'storage' })
  const message =
    error instanceof DuplicateOutfitCodeError
      ? outfitLocale.value.duplicateCode
      : activeOperation.value === 'importing-outfits'
        ? (outfitBackupMessage(error, language.value) ??
          (language.value === 'zh'
            ? '搭配码备份导入失败，请确认文件是完整的搭配码 ZIP 备份后重试。'
            : 'The outfit backup could not be imported. Check the ZIP file and try again.'))
        : error instanceof DOMException && error.name === 'QuotaExceededError'
          ? outfitLocale.value.storageFull
          : error instanceof Error && error.message === 'outfit_record_changed'
            ? outfitLocale.value.recordChanged
            : error instanceof Error && error.message.startsWith('outfit_')
              ? outfitLocale.value.operationFailed
              : null
  if (message) showOutfitStatus(message, 'warning', false, source)
  else {
    const status = createErrorStatus(error, { type: 'readFailed' })
    statusState.value = source
      ? {
          type: 'custom',
          message: status.type === 'custom' ? status.message : locale.value.app.readFailedStatus,
          tone: status.type === 'custom' ? status.tone : 'error',
          source
        }
      : status
  }
}

/** 显示搭配码更新结果。重复的共享搭配码保持静默，其它结果按状态提示。 */
let lastOutfitWarning = ''
function showOutfitRefreshResult(result: OutfitLibraryResult, announce = true) {
  const added = result.importedSharedCount
  const migration = result.migration
  const migrated =
    migration &&
    (migration.addedCount ||
      migration.replacedCount ||
      migration.skippedCount ||
      migration.tagsChanged ||
      migration.clotheDirectoryRemoved)
  let message =
    migrated || migration?.failedCount
      ? outfitLocale.value.migrationComplete(
          migration!.addedCount,
          migration!.replacedCount,
          migration!.skippedCount,
          migration!.failedCount
        )
      : ''
  if (migration?.clotheDirectoryRemoved)
    message += ' ' + outfitLocale.value.migrationDirectoryRemoved
  if (migration?.failures.length) {
    message +=
      ' ' +
      outfitLocale.value.migrationFailedItems(
        [...new Set(migration.failures.map((item) => item.fileName))].slice(0, 5).join('、')
      )
    if (migration.failures.some((item) => item.message.startsWith('outfit_tag_limit')))
      message += ' ' + outfitLocale.value.migrationTagLimit
    if (migration.failures.some((item) => item.fileName === 'clothe'))
      message += ' ' + outfitLocale.value.migrationCleanupFailed
    if (migration.failures.some((item) => item.message === 'outfit_migration_source_changed'))
      message += ' ' + outfitLocale.value.migrationSourceChanged
    if (migration.failures.some((item) => item.errorName === 'QuotaExceededError'))
      message += ' ' + outfitLocale.value.storageFull
  }
  if (added || result.failedCount > (migration?.failedCount ?? 0))
    message +=
      ' ' +
      outfitLocale.value.scanComplete(added, result.failedCount - (migration?.failedCount ?? 0))
  if (result.sharedFailureStage && result.sharedFailureStage !== 'duplicate')
    message += ' ' + outfitLocale.value.sharedImportResult[result.sharedFailureStage]
  if (!message.trim())
    message =
      result.sharedFailureStage === 'duplicate'
        ? outfitLocale.value.sharedImportResult.duplicate
        : outfitLocale.value.upToDate
  const signature = result.failedCount ? message.trim() : ''
  if (!announce && !added && !migrated && (!result.failedCount || signature === lastOutfitWarning))
    return
  lastOutfitWarning = signature
  showOutfitStatus(message.trim(), result.failedCount ? 'warning' : 'success')
}

/**
 * 更新搭配码库。
 * 参数：announce 表示是否为用户明确触发，用户触发时立即显示“更新中”和完整结果；
 * 后台扫描无新增且无失败时保持静默。
 */
async function updateOutfitLibrary(announce = true, promptSharedAccess = announce) {
  if (
    appDisposed ||
    isAnyFileOperationBusy.value ||
    isOutfitEditorVisible.value ||
    confirmDialog.value.visible
  )
    return
  activeOperation.value = 'updating-outfits'
  if (announce) showOutfitStatus(outfitLocale.value.updating, 'info', true)
  try {
    didCancelX6GameAutoPrompt.value = false
    const result = await refreshOutfitLibrary(promptSharedAccess)
    if (didCancelX6GameAutoPrompt.value) return
    showOutfitRefreshResult(result, announce)
  } catch (error) {
    statusState.value = createErrorStatus(error, { type: 'readFailed' })
  } finally {
    if (activeOperation.value === 'updating-outfits') activeOperation.value = null
  }
}

/** 切换相册视图并清空上个视图的选中状态（重复点击当前视图不清空）。参数：view 为目标视图；电脑端进入搭配码时按用户偏好显示操作指南。 */
function changeAlbumView(view: AlbumView, afterArchiveExit = false) {
  if (navigationBusy.value) return
  clearTimeout(archiveToolbarExitTimer)
  archiveToolbarExitTimer = undefined
  archiveToolbarClosing.value = false
  if (!afterArchiveExit) {
    const animateArchive = compactLayout.value && view !== activeView.value &&
      ['resonance', 'wardrobe', 'makeup'].includes(view) &&
      !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    archiveToolbarMotionDeadline.value = animateArchive ? Date.now() + archiveMotionLoadDelay : 0
  }
  // Keep the source module mounted until its teleported controls have faded out.
  if (
    !afterArchiveExit && compactLayout.value && view === 'resonance' &&
    (activeView.value === 'wardrobe' || activeView.value === 'makeup') &&
    !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  ) {
    archiveToolbarClosing.value = true
    archiveToolbarExitTimer = setTimeout(() => changeAlbumView(view, true), 120)
    return
  }
  if (view === 'trash' && isCompatibleAlbum.value) {
    showStatus({ message: compatibleMessages.value.trash, tone: 'info' })
    return
  }
  const isViewChanged = view !== activeView.value
  const isEnteringOutfits = view === 'outfits' && isViewChanged
  // 点击收藏夹入口时默认显示相机参数。
  if (view === 'favorites' && favoriteTab.value !== 'camera') changeFavoriteTab('camera')
  activeView.value = view
  currentPreview.value = null
  // 视图真正变化时清空所有选中状态，避免上个视图的选中残留；重复点击当前视图不受影响
  if (isViewChanged) {
    selectedIds.value = new Set()
    selectedOutfitIds.value = new Set()
    trashSelectedIds.value = new Set()
  }
  activeOutfitFilter.value = 'all'
  if (view === 'trash') void refreshAlbum(false)
  if (view === 'outfits') void updateOutfitLibrary(false, true)
  isOutfitGuideVisible.value =
    isEnteringOutfits && !compactLayout.value && !isOutfitGuideDismissed.value
}

/** 关闭搭配码操作指南。参数：dontShowAgain 表示后续进入模块时是否不再显示；同时同步本地偏好。 */
function closeOutfitGuide(dontShowAgain: boolean) {
  isOutfitGuideDismissed.value = dontShowAgain
  if (!suppressLocalPersistence) {
    if (dontShowAgain) writeLocalStorage(OUTFIT_GUIDE_DISMISSED_KEY, 'true')
    else removeLocalStorage(OUTFIT_GUIDE_DISMISSED_KEY)
  }
  isOutfitGuideVisible.value = false
}

/** 从更多菜单打开更新记录窗口。参数：无。 */
function openUpdateLog() {
  isUpdateLogVisible.value = true
}

/** 关闭更新记录窗口。参数：dontShowAgain 表示当前版本是否不再自动弹出；同时把版本号和勾选状态保存到本地。 */
function closeUpdateLog(dontShowAgain: boolean) {
  isAboutDialogDismissed.value = dontShowAgain
  if (!suppressLocalPersistence) {
    writeLocalStorage(
      ABOUT_STATE_STORAGE_KEY,
      JSON.stringify({ version: currentAboutVersion, dismissed: dontShowAgain })
    )
  }
  isUpdateLogVisible.value = false
}

// Wait for the update dialog's exit animation before handing over focus.
function showPendingDataReminder() {
  if (
    !pendingDataReminder ||
    appDisposed ||
    isUpdateLogVisible.value ||
    isHelpAboutVisible.value ||
    returnToUpdateLog.value
  )
    return
  pendingDataReminder = false
  dataReminderOpenedFromMenu.value = false
  isDataReminderVisible.value = true
}
function openDataReminder() {
  dataReminderOpenedFromMenu.value = true
  isDataReminderVisible.value = true
}
function closeDataReminder(dontShowAgain: boolean) {
  isDataReminderDismissed.value = dontShowAgain
  if (!suppressLocalPersistence) {
    if (dontShowAgain) writeLocalStorage(DATA_REMINDER_DISMISSED_KEY, 'true')
    else removeLocalStorage(DATA_REMINDER_DISMISSED_KEY)
  }
  isDataReminderVisible.value = false
}
function openHelpAbout() {
  isHelpAboutVisible.value = true
}
function closeHelpAbout() {
  isHelpAboutVisible.value = false
  // 从更新记录窗口跳来时，关闭帮助窗口后仍返回更新记录窗口。
  if (returnToUpdateLog.value) {
    returnToUpdateLog.value = false
    isUpdateLogVisible.value = true
  }
}

/** 从更新记录窗口跳转使用帮助：暂不结算更新记录的关闭状态，帮助关闭后返回。 */
function openHelpFromUpdateLog() {
  returnToUpdateLog.value = true
  isUpdateLogVisible.value = false
  isHelpAboutVisible.value = true
}

function showOutfitStatus(
  message: string,
  tone: StatusTone = 'success',
  loading = false,
  source?: string
) {
  statusState.value = { type: 'custom', message, tone, loading, ...(source ? { source } : {}) }
}

function handleHomeSchemeStatus(
  message: string,
  tone: StatusTone,
  downloadFiles?: File[],
  source = 'home-export'
) {
  showStatus({ message, tone, downloadFiles, ...(downloadFiles?.length ? { source } : {}) })
}

function confirmHomeSchemeAction(
  message: string,
  title = locale.value.homeScheme.title,
  confirmLabel = locale.value.app.dialogConfirm
): Promise<boolean> {
  return openConfirmDialog({
    title,
    message,
    tone: 'warning',
    confirmLabel,
    cancelLabel: locale.value.app.dialogCancel
  })
}

function changeOutfitFilter(filter: OutfitFilter) {
  selectedOutfitIds.value = new Set()
  activeOutfitFilter.value = filter
}

function showSummaryTag(tag: string) {
  searchQuery.value = ''
  changeOutfitFilter(`tag:${tag}`)
  isOutfitSummaryVisible.value = false
}

function openOutfitEditor(outfit: OutfitItem | null = null) {
  editingOutfit.value = outfit
  isOutfitEditorVisible.value = true
}

/** 打开搭配码解析窗口。参数：目标搭配方案或直接输入的搭配码；空值时忽略。 */
function openOutfitParse(target: OutfitItem | string) {
  const code = normalizeOutfitCode(typeof target === 'string' ? target : target.code)
  if (!code) return
  parsingOutfitCode.value = code
  const source =
    typeof target === 'string'
      ? outfits.value.find(
          (item) => normalizeOutfitCode(item.code).replace(/#$/, '') === code.replace(/#$/, '')
        )
      : target
  parsingOutfitImage.value = source?.image ? () => readPhotoBlob(source) : undefined
  isOutfitParseVisible.value = true
}

function closeOutfitParse() {
  const shouldReopenParseTools = reopenParseToolsAfterOutfitClose.value
  reopenParseToolsAfterOutfitClose.value = false
  isOutfitParseVisible.value = false
  parsingOutfitCode.value = ''
  parsingOutfitImage.value = undefined
  parseCodeInput.value = ''
  if (shouldReopenParseTools) isParseToolsVisible.value = true
}

function openParseTools() {
  isParseToolsVisible.value = true
}

function closeParseTools() {
  isParseToolsVisible.value = false
}

function parseToolsOutfitCode(code: string) {
  const normalizedCode = normalizeOutfitCode(code)
  if (!normalizedCode) return
  reopenParseToolsAfterOutfitClose.value = true
  closeParseTools()
  openOutfitParse(normalizedCode)
}

async function editPhotoNote(photo: PhotoDisplayItem | null) {
  const directory = albumDirectoryHandle.value
  if (
    notesBlocked.value ||
    !directory ||
    !photo ||
    !('fileHandle' in photo) ||
    isAnyFileOperationBusy.value
  )
    return
  try {
    // 每次打开都读取最新备注作为编辑基线；冲突后重开即可看到其他窗口的保存结果。
    const metadata = await readAlbumMetadata(directory)
    if (albumDirectoryHandle.value !== directory) return
    photo.note = metadata.photos[photo.name]?.note ?? ''
    // 相册刷新会更新照片对象，编辑基线需独立保存以维持跨窗口冲突检查。
    noteDialogBaseline.value = photo.note
    noteDialogPhoto.value = photo as PhotoItem
    isNoteDialogVisible.value = true
  } catch (error) {
    if (error instanceof PhotoMetadataError)
      captureDiagnosticError(error, { module: 'album', action: 'photo-note', stage: 'metadata' })
    if (error instanceof PhotoMetadataError)
      showStatus({ message: locale.value.grid.noteSaveErrors[error.code], tone: 'error' })
    else statusState.value = createErrorStatus(error, { type: 'readFailed' })
  }
}

function openPhotoParams(photo: PhotoDisplayItem, share = false) {
  autoSharePhoto.value = share
  if (!isAlbumPhoto(photo)) return
  reopenParseToolsAfterPhotoClose.value = false
  return photoParams.openForPhoto(photo as PhotoItem)
}
async function parseHeaderCameraParams(input?: string) {
  const raw = (input ?? normalizedCameraParamsInput.value).trim()
  if (!raw) return
  reopenParseToolsAfterPhotoClose.value = true
  cameraParamsInput.value = ''
  closeParseTools()
  autoSharePhoto.value = false
  photoParams.openCameraParamsTool()
  await photoParams.parseRawCameraParams(raw)
}
function closePhotoParams() {
  const shouldReopenParseTools = reopenParseToolsAfterPhotoClose.value
  reopenParseToolsAfterPhotoClose.value = false
  photoParams.close()
  if (shouldReopenParseTools) isParseToolsVisible.value = true
}
async function copyRawCameraParams() {
  const raw = photoParamsResult.value?.rawCameraParams
  if (!raw) return
  if (await copyTextToClipboard(raw)) {
    showStatus({ message: locale.value.app.copySucceeded, tone: 'success' })
  } else showStatus({ message: locale.value.app.copyFailed(raw), tone: 'error' })
}

function closeNoteDialog() {
  if (isAnyFileOperationBusy.value) return
  isNoteDialogVisible.value = false
  noteDialogPhoto.value = null
}

async function saveNoteDialog(value: string) {
  const directory = albumDirectoryHandle.value
  const photo = noteDialogPhoto.value
  if (!directory || !photo || isAnyFileOperationBusy.value) return
  try {
    // 保存时核对打开编辑器时的备注；冲突不关闭窗口，保留用户输入。
    photo.note = await savePhotoNote(directory, photo.name, value, noteDialogBaseline.value)
    isNoteDialogVisible.value = false
    noteDialogPhoto.value = null
    showOutfitStatus(locale.value.grid.noteSaved)
  } catch (error) {
    if (error instanceof PhotoMetadataError)
      captureDiagnosticError(error, { module: 'album', action: 'photo-note', stage: 'metadata' })
    if (error instanceof PhotoMetadataError)
      showStatus({ message: locale.value.grid.noteSaveErrors[error.code], tone: 'error' })
    else statusState.value = createErrorStatus(error, { type: 'readFailed' })
  } finally {
    const state = await inspectAlbumNotes(directory)
    if (directory === albumDirectoryHandle.value) albumNotes.value = state
  }
}

/** 关闭搭配码编辑窗口。参数：scan 表示关闭后是否自动重扫搭配码库；自动重扫属于后台行为，无变化时保持静默。 */
async function closeOutfitEditor(scan = true) {
  if (isSavingOutfit.value) return
  isOutfitEditorVisible.value = false
  editingOutfit.value = null
  if (!scan) return
  await updateOutfitLibrary(false)
}

const {
  handleSaveOutfit,
  addOutfitTag,
  reorderOutfitTags,
  removeOutfitTag,
  copyOutfitCode,
  copyOutfitCodeValue,
  removeOutfit,
  deleteSelectedOutfits,
  exportOutfits,
  importOutfits
} = useOutfitWorkspace({
  language,
  activeOperation,
  isAnyFileOperationBusy,
  outfitLocale,
  locale,
  editingOutfit,
  isOutfitEditorVisible,
  outfits,
  outfitTags,
  selectedOutfitIds,
  currentPreview,
  visibleOutfits,
  outfitSidebarRef,
  outfitEditorRef,
  statusState,
  reloadOutfitCollection,
  applyOutfitLibraryResult,
  showOutfitStatus,
  showOutfitStorageError,
  openConfirmDialog,
  onImportPicked: () => {
    suppressNextFocusRefresh.value = false
  }
})

function chooseOutfitBackup() {
  if (isAnyFileOperationBusy.value) return
  suppressNextFocusRefresh.value = true
  outfitImportInput.value?.click()
}

function openPhotoImportPicker() {
  if (!albumDirectoryHandle.value || isAnyFileOperationBusy.value) return
  suppressNextFocusRefresh.value = true
  photoImportInput.value?.click()
}

async function importAlbumPhotos(event: Event) {
  const input = event.target as HTMLInputElement
  suppressNextFocusRefresh.value = false
  const files = Array.from(input.files ?? [])
  input.value = ''
  const directory = albumDirectoryHandle.value
  if (!directory || !files.length || isAnyFileOperationBusy.value) return
  activeOperation.value = 'importing-photos'
  beginPhotoTransfer('import', locale.value.topBar.importPhotos)
  const controller = createPhotoTransferController()
  closeStatusNotice()
  try {
    const prepared = await preparePhotoTransfer(directory, { kind: 'import', files })
    showPreparedPhotoTransfer(prepared.jobs.length)
    await runPhotoTransfer(directory, prepared, {
      signal: controller.signal,
      onProgress: updatePhotoTransferProgress
    })
    markPhotoTransferCompleted()
    const refreshed = await refreshAlbumDirectory(directory, photos.value, {
      requestPermission: false,
      messages: locale.value.fileSystem
    })
    applyRefreshResult(refreshed)
  } catch (error) {
    markPhotoTransferCompleted()
    statusState.value = createErrorStatus(error, { type: 'readFailed' })
  } finally {
    if (activeOperation.value === 'importing-photos') activeOperation.value = null
    clearPhotoTransferController()
  }
}

async function pickPhotoExportDirectory(): Promise<FileSystemDirectoryHandle | null> {
  if (!window.showDirectoryPicker || !albumDirectoryHandle.value)
    throw new Error(locale.value.fileSystem.unsupportedBrowser)
  const directory = await window.showDirectoryPicker({
    id: 'infinity-nikki-photo-export',
    mode: 'readwrite',
    startIn: 'downloads'
  })
  const album = albumDirectoryHandle.value
  if (await isProtectedAlbumDirectory(album, directory))
    throw new Error(locale.value.app.exportTargetInvalid)
  return directory
}

async function exportAlbumPhotos(targets: PhotoItem[], allPhotos = false) {
  const source = allPhotos ? photos.value : targets
  if (!source.length || isAnyFileOperationBusy.value) return
  if (isCompatibleAlbum.value) return downloadCompatiblePhotos(source)
  let directory: FileSystemDirectoryHandle
  try {
    const picked = await pickPhotoExportDirectory()
    if (!picked) return
    directory = picked
  } catch (error) {
    statusState.value = createErrorStatus(error, { type: 'readFailed' })
    return
  }

  activeOperation.value = 'exporting-photos'
  beginPhotoTransfer(
    'export',
    allPhotos ? locale.value.topBar.exportAllPhotos : locale.value.selectionBar.exportPhotos
  )
  const controller = createPhotoTransferController()
  closeStatusNotice()
  try {
    const prepared = await preparePhotoTransfer(directory, { kind: 'export', photos: source })
    showPreparedPhotoTransfer(prepared.jobs.length)
    const result = await runPhotoTransfer(directory, prepared, {
      signal: controller.signal,
      onProgress: updatePhotoTransferProgress
    })
    markPhotoTransferExportResult(result.succeededPhotos, result.cancelled)
    if (result.cancelled) {
      return
    }
  } catch (error) {
    markPhotoTransferCompleted()
    statusState.value = createErrorStatus(error, { type: 'readFailed' })
  } finally {
    if (activeOperation.value === 'exporting-photos') activeOperation.value = null
    clearPhotoTransferController()
  }
}

function cancelPhotoTransfer() {
  cancelPhotoTransferRequest()
}

async function closePhotoTransfer() {
  if (photoTransfer.phase === 'running' || photoTransfer.phase === 'preparing') return
  const succeededPhotos = takePhotoTransferMovePending()
  if (isCompatibleAlbum.value || !succeededPhotos?.length) return
  const confirmed = await openConfirmDialog({
    title: locale.value.app.exportMoveSourceTitle,
    message: locale.value.app.exportMoveSourceConfirm(succeededPhotos.length),
    tone: 'warning',
    confirmLabel: locale.value.app.dialogConfirm,
    cancelLabel: locale.value.app.dialogCancel
  })
  if (!confirmed) return
  activeOperation.value = 'deleting'
  try {
    statusState.value = {
      type: 'custom',
      message: locale.value.app.movingPhotosToTrash,
      tone: 'info',
      loading: true
    }
    const moved = await movePhotosToRecentlyDeleted(succeededPhotos, favoriteIds.value)
    applyMovedPhotosResult(moved)
    statusState.value = {
      type: 'custom',
      message: locale.value.trash.movedStatus(moved.succeeded.length, moved.failedNames),
      tone: moved.failedNames.length ? 'warning' : 'success'
    }
  } finally {
    if (activeOperation.value === 'deleting') activeOperation.value = null
  }
}

/** 将当前普通视图的选中照片移到最近删除。参数：无。 */
async function deleteSelectedPhotos() {
  await movePhotosToTrash(scopedSelectedPhotos.value)
}

/** 将当前预览照片移到最近删除。参数：无。 */
async function deleteCurrentPreview() {
  if (
    !currentPreview.value ||
    !('fileHandle' in currentPreview.value) ||
    activeView.value === 'trash'
  )
    return
  await movePhotosToTrash([currentPreview.value as PhotoItem], true)
}

/** 恢复当前选中的最近删除照片。参数：无。 */
async function restoreSelectedTrash() {
  await restoreTrashPhotos(
    recentlyDeleted.value.filter((photo) => trashSelectedIds.value.has(photo.id))
  )
}

/** 永久删除当前选中的最近删除照片。参数：无。 */
async function permanentlyDeleteSelectedTrash() {
  await permanentlyDeleteTrashPhotos(
    recentlyDeleted.value.filter((photo) => trashSelectedIds.value.has(photo.id))
  )
}

/** 恢复当前最近删除预览照片。参数：无。 */
async function restoreCurrentTrashPreview() {
  if (!currentPreview.value || activeView.value !== 'trash') return
  await restoreTrashPhotos([currentPreview.value as RecentlyDeletedPhoto], true)
}

/** 永久删除当前最近删除预览照片。参数：无。 */
async function permanentlyDeleteCurrentTrashPreview() {
  if (!currentPreview.value || activeView.value !== 'trash') return
  await permanentlyDeleteTrashPhotos([currentPreview.value as RecentlyDeletedPhoto], {
    keepPreviewOpen: true
  })
}

/** 跳转到指定日期。参数：dateKey 为日期键。 */
function scrollToDate(dateKey: string) {
  mobileFiltersOpen.value = false
  document.getElementById(`date-${dateKey}`)?.scrollIntoView({ block: 'start' })
}

function scrollToAction(actionKey: string) {
  mobileFiltersOpen.value = false
  document.getElementById(`action-${actionKey}`)?.scrollIntoView({ block: 'start' })
}

/** 将侧栏中选中的套装定位到对应共鸣记录卡片。 */
function scrollToResonanceRecord(recordId: string) {
  mobileFiltersOpen.value = false
  document.getElementById(`resonance-record-${recordId}`)?.scrollIntoView({ block: 'start' })
}

function togglePhotoGroup(photoIds: string[]) {
  const next = new Set(selectedIds.value)
  const selected = photoIds.length > 0 && photoIds.every((id) => next.has(id))
  for (const id of photoIds) selected ? next.delete(id) : next.add(id)
  selectedIds.value = next
}

/** 更新左侧栏顶部偏移。参数：无。 */
function updateSidebarStickyOffset() {
  const topBarElement = document.querySelector<HTMLElement>('.app-header')
  if (!appShellRef.value || !topBarElement) return
  appShellRef.value.style.setProperty(
    '--sidebar-sticky-top',
    `${Math.ceil(topBarElement.getBoundingClientRect().height) + 10}px`
  )
}

// 生命周期
let startupReady: Promise<unknown> = Promise.resolve()
let initialOutfitScanStarted = false
async function ensureInitialOutfitScan() {
  await startupReady
  if (
    appDisposed ||
    activeView.value !== 'outfits' ||
    initialOutfitScanStarted ||
    isAnyFileOperationBusy.value
  )
    return
  initialOutfitScanStarted = true
  await updateOutfitLibrary(false, false)
}
watch(activeView, (view) => {
  if (view === 'outfits') void ensureInitialOutfitScan()
})
onMounted(() => {
  refreshCameraFavoriteMetadata()
  activeOperation.value = 'loading'
  // 计数独立读取；本地集合与目录迁移仍保持顺序，防止较旧读取覆盖迁移结果。
  void updateHomeSchemeCount().catch((error) => {
    if (!appDisposed)
      captureDiagnosticError(error, { module: 'home-schemes', action: 'load-count' })
    if (!appDisposed)
      statusState.value = {
        type: 'custom',
        message: locale.value.homeScheme.operationFailed,
        tone: 'error'
      }
  })
  const collectionReady = reloadOutfitCollection().catch((error) => {
    if (!appDisposed) showOutfitStorageError(error)
  })
  const directoryReady = (async () => {
    await collectionReady
    if (appDisposed) return
    await restoreSavedDirectory()
    if (appDisposed) return
    await restoreSavedX6GameAuthorization()
  })()
  startupReady = Promise.allSettled([collectionReady, directoryReady])
  // 重型游戏目录扫描推迟到首次进入搭配码，避免打开其他模块时争用 I/O。
  void ensureInitialOutfitScan()
  pendingDataReminder = !isDataReminderDismissed.value
  // 没有记录、版本号变化或未勾选“不再提示”时，打开网站自动显示更新记录
  if (
    !storedAboutState ||
    storedAboutState.version !== currentAboutVersion ||
    !storedAboutState.dismissed
  ) {
    isUpdateLogVisible.value = true
  } else {
    showPendingDataReminder()
  }
  nextTick(() => {
    updateSidebarStickyOffset()
    const topBarElement = document.querySelector<HTMLElement>('.app-header')
    if (!topBarElement || typeof ResizeObserver === 'undefined') return
    topBarResizeObserver = new ResizeObserver(updateSidebarStickyOffset)
    topBarResizeObserver.observe(topBarElement)
  })
  window.addEventListener('resize', updateSidebarStickyOffset)
  window.addEventListener('nuan-directory-restored', refreshAfterDirectoryRestore)
  window.addEventListener('focus', scheduleFocusRefresh)
  document.addEventListener('visibilitychange', scheduleFocusRefresh)
})

onBeforeUnmount(() => {
  appDisposed = true
  outfitLoadGeneration++
  invalidatePendingRefreshes()
  disposeStatusNotice()
  topBarResizeObserver?.disconnect()
  window.removeEventListener('resize', updateSidebarStickyOffset)
  window.removeEventListener('nuan-directory-restored', refreshAfterDirectoryRestore)
  window.removeEventListener('focus', scheduleFocusRefresh)
  document.removeEventListener('visibilitychange', scheduleFocusRefresh)
  releasePhotoUrls(photos.value)
  releasePhotoUrls(outfits.value)
  releasePhotoUrls(recentlyDeleted.value)
})
/** 关闭顶部菜单后打开全部数据导入，保持两个操作的执行顺序。 */
function importAllDataFromMenu() {
  topBarRef.value?.closeMenus()
  allDataBackupRef.value?.chooseImport()
}
</script>

<template>
  <div ref="appShellRef" class="app-shell">
    <SkeletonSweep global />
    <PageScrollbar :label="language === 'zh' ? '页面滚动' : 'Page scroll'" />
    <TopBar
      ref="topBarRef"
      :active-view="activeView"
      :view-messages="locale.viewNav"
      :directory-supported="directorySupported"
      @change-view="changeAlbumView"
      :directory-name="
        isCompatibleAlbum ? `${directoryName} · ${compatibleMessages.readOnly}` : directoryName
      "
      :is-loading="isLoading || activeOperation === 'all-data-backup'"
      :backup-disabled="allBackupDisabled"
      :has-backup-data="hasBackupData"
      :is-deleting="isDeleting || isTrashBusy"
      :has-album-directory="hasAlbum"
      :has-x6-game-authorization="hasX6GameAuthorization"
      :thumbnail-mode="displayedThumbnailMode"
      :thumbnail-mode-disabled="isThumbnailModeDisabled"
      :thumbnail-size="displayedThumbnailSize"
      :thumbnail-size-disabled="isThumbnailSizeDisabled"
      :thumbnail-mode-options="thumbnailModeOptions"
      :theme-mode="themeMode"
      :language="language"
      :messages="
        activeView === 'wardrobe'
          ? {
              ...locale.topBar,
              searchPlaceholder: mobileText('搜索服装名称或 ID', 'Search clothes by name or ID')
            }
          : activeView === 'makeup'
            ? {
                ...locale.topBar,
                searchPlaceholder: mobileText('搜索妆容名称或 ID', 'Search makeup by name or ID')
              }
            : locale.topBar
      "
      :search-query="searchQuery"
      @choose-directory="chooseDirectory"
      @choose-compatible="chooseCompatibleAlbum"
      :compatible-label="compatibleMessages.open"
      :album-read-only="isCompatibleAlbum"
      :read-only-hint="compatibleMessages.writeDisabled"
      @clear-directory="clearDirectory"
      @authorize-x6-game="authorizeX6GameDirectory"
      @open-cleanup="openCleanupDialog"
      @open-fortune-time="isFortuneTimeVisible = true"
      @open-parse-tools="openParseTools"
      @clear-cache="clearCache"
      @clear-data="clearData"
      @export-all-data="allDataBackupRef?.exportData()"
      @import-all-data="allDataBackupRef?.chooseImport()"
      @refresh-backup-availability="allDataBackupRef?.refreshAvailability()"
      @change-thumbnail-mode="changeThumbnailMode"
      @change-thumbnail-size="changeThumbnailSize"
      @toggle-language="toggleLanguage"
      @toggle-theme="toggleTheme"
      @open-update-log="openUpdateLog"
      @open-help-about="openHelpAbout"
      @open-data-reminder="openDataReminder"
      @update-search="searchQuery = $event"
    />

    <div
      v-if="compactLayout && !directorySupported && activeView === 'outfits' && !outfits.length"
      class="mobile-import-start"
      ><p>{{
        mobileText(
          '从电脑迁移数据，或直接添加你的第一套搭配。',
          'Import your desktop collection or add your first outfit.'
        )
      }}</p
      ><button type="button" :disabled="allBackupDisabled" @click="importAllDataFromMenu">{{
        locale.topBar.importAllData
      }}</button></div
    >
    <AllDataBackup
      ref="allDataBackupRef"
      :language="language"
      :disabled="allBackupDisabled"
      @availability="hasBackupData = $event"
      @busy="handleAllBackupBusy"
      @changed="refreshAfterAllImport"
      @status="
        (message, tone, loading, downloadFiles) =>
          showStatus({ message, tone, loading, downloadFiles, source: 'all-data-export' })
      "
    />
    <ArchiveCloudDialog
      :language="language"
      @notice="showStatus"
      @restored="refreshAfterArchiveSync"
    />

    <input
      ref="compatibleAlbumInput"
      data-testid="compatible-album-input"
      type="file"
      webkitdirectory
      multiple
      hidden
      @change="loadCompatibleAlbum"
      @cancel="cancelCompatibleAlbum"
    />
    <main
      class="album-layout"
      :class="{
        'without-album':
          !hasAlbum &&
          activeView !== 'outfits' &&
          activeView !== 'home' &&
          activeView !== 'resonance' &&
          activeView !== 'wardrobe' &&
          activeView !== 'makeup' &&
          !isCameraFavoritesView
      }"
    >
      <div class="sidebar-column">
        <AlbumViewSwitcher
          class="desktop-navigation"
          :active-view="activeView"
          :all-count="photos.length"
          :outfits-count="outfits.length"
          :home-schemes-count="homeSchemesCount"
          :resonance-label="locale.viewNav.resonance"
          :favorite-count="favoriteCount + cameraFavoriteCodes.length"
          :favorite-count-text="`${favoriteCount + cameraFavoriteCodes.length} ${language === 'zh' ? '项' : 'items'}`"
          :trash-count="recentlyDeleted.length"
          :trash-disabled="isCompatibleAlbum"
          :trash-disabled-hint="compatibleMessages.trash"
          :outfit-label="outfitLocale.viewName"
          :disabled="navigationBusy"
          :messages="locale.viewNav"
          @change-view="changeAlbumView"
        />

        <aside
          v-if="activeView === 'wardrobe'"
          v-show="!compactLayout"
          id="wardrobe-sidebar"
          class="date-sidebar"
          :aria-label="mobileText('衣橱分类与筛选', 'Wardrobe categories and filters')"
        ></aside>
        <aside
          v-if="activeView === 'makeup'"
          v-show="!compactLayout"
          id="makeup-sidebar"
          class="date-sidebar"
          :aria-label="mobileText('妆容筛选', 'Makeup filters')"
        ></aside>
        <AdaptiveFilterPanel
          v-if="activeView !== 'wardrobe' && activeView !== 'makeup'"
          :compact="compactLayout"
          :open="mobileFiltersOpen"
          :tag-picker="mobileCollectionPicker"
          :title="
            activeView === 'resonance'
              ? mobileText('共鸣筛选', 'Resonance filters')
              : mobileCollectionPicker
                ? mobileText('选择标签', 'Select tag')
                : mobileText('筛选与分类管理', 'Filters and categories')
          "
          :close-label="mobileText('关闭筛选', 'Close filters')"
          :apply-label="
            mobileText(`查看 ${mobileFilterCount} 项结果`, `Show ${mobileFilterCount} items`)
          "
          @close="mobileFiltersOpen = false"
        >
          <div id="album-sidebar-column">
            <OutfitSidebar
              :language="language"
              v-if="activeView === 'outfits'"
              ref="outfitSidebarRef"
              :outfits="outfits"
              :tags="outfitTags"
              :active-filter="activeOutfitFilter"
              :picker-open="mobileFiltersOpen"
              :disabled="isAnyFileOperationBusy"
              :messages="outfitLocale"
              @change-filter="changeOutfitFilter"
              @filter-selected="mobileFiltersOpen = false"
              @add-tag="addOutfitTag"
              @delete-tag="removeOutfitTag"
              @reorder-tags="reorderOutfitTags"
            />
            <ResonanceSidebar
              v-else-if="activeView === 'resonance'"
              :records="resonanceRecords"
              :language="language"
              :banner-order="resonanceBannerOrder"
              :rarity-filter="resonanceRarityFilter"
              @change-banner-order="resonanceBannerOrder = $event"
              @change-rarity-filter="resonanceRarityFilter = $event"
              @filter-selected="mobileFiltersOpen = false"
              @jump-to-record="scrollToResonanceRecord"
            />
            <DateSidebar
              v-else-if="activeView !== 'trash' && activeView !== 'home' && !isCameraFavoritesView"
              :year-groups="yearGroups"
              :action-groups="actionGroups"
              :mode="sidebarMode"
              :action-sort="actionSort"
              :language="language"
              :messages="locale.sidebar"
              @jump-to-date="scrollToDate"
              @jump-to-action="scrollToAction"
              @change-mode="sidebarMode = $event"
              @change-action-sort="actionSort = $event"
            />
          </div>
        </AdaptiveFilterPanel>
      </div>

      <section class="album-content" :aria-label="locale.app.albumContentAria">
        <AlbumNoteNotice
          v-if="albumNotes?.blocked && ['all', 'favorites', 'trash'].includes(activeView)"
          :snapshot="albumNotes"
          :language="language"
          :compatible="isCompatibleAlbum"
          :busy="isAnyFileOperationBusy"
          @recover="recoverNotes"
        />
        <div
          v-if="isCompatibleAlbum && activeView === 'all'"
          class="compatible-album-notice"
          role="status"
        >
          <span>{{ compatibleMessages.readOnly }} · {{ compatibleMessages.hint }}</span>
          <button type="button" :disabled="isAnyFileOperationBusy" @click="chooseCompatibleAlbum">{{
            compatibleMessages.reselect
          }}</button>
        </div>
        <div
          v-if="compactLayout && isArchiveView"
          class="archive-main-toolbar"
          :class="{ 'is-wardrobe': activeView === 'wardrobe', 'is-category-closing': archiveToolbarClosing, 'has-category': !archiveToolbarClosing && (activeView === 'wardrobe' || activeView === 'makeup') }"
        >
          <nav
            class="resonance-choice-row archive-main-tabs"
            :aria-label="locale.viewNav.resonance"
          >
            <button
              type="button"
              :disabled="operations.isBusy.value"
              class="resonance-choice"
              :aria-pressed="activeView === 'resonance'"
              @click="changeAlbumView('resonance')"
              >{{ locale.viewNav.resonanceRecords }}</button
            >
            <button
              type="button"
              :disabled="operations.isBusy.value"
              class="resonance-choice"
              :aria-pressed="activeView === 'wardrobe'"
              @click="changeAlbumView('wardrobe')"
              >{{ locale.viewNav.wardrobe }}</button
            >
            <button
              type="button"
              :disabled="operations.isBusy.value"
              class="resonance-choice"
              :aria-pressed="activeView === 'makeup'"
              @click="changeAlbumView('makeup')"
              >{{ locale.viewNav.makeup }}</button
            >
          </nav>
          <div
            class="archive-category-slot"
            :aria-hidden="archiveToolbarClosing || activeView === 'resonance'"
            :inert="archiveToolbarClosing || activeView === 'resonance'"
          >
            <div class="archive-category-content" :key="activeView">
              <div
                v-if="activeView === 'wardrobe'"
                id="wardrobe-mobile-category-target"
                class="archive-wardrobe-extra"
              ></div>
              <div
                v-if="activeView === 'makeup'"
                id="makeup-mobile-category-target"
                class="archive-wardrobe-extra"
              ></div>
            </div>
          </div>
        </div>
        <CollectionFilterBar
          v-if="
            activeView !== 'outfits' &&
            activeView !== 'home' &&
            activeView !== 'resonance' &&
            activeView !== 'wardrobe' &&
            activeView !== 'makeup' &&
            activeView !== 'trash' &&
            !isCameraFavoritesView
          "
          :entries="mobileFilterEntries"
          :active="String(mobileActiveFilter)"
          :count="mobileFilterCount"
          :language="language"
          :disabled="isAnyFileOperationBusy"
          @change="changeMobileFilter"
          @clear="changeMobileFilter(mobileFilterEntries[0]?.key ?? 'all')"
          @open="mobileFiltersOpen = true"
        />
        <!-- 收藏夹：标签页与当前页操作按钮共用一行，移除重复标题。 -->
        <div v-if="activeView === 'favorites'" v-show="!compactLayout" class="favorites-toolbar">
          <nav
            v-if="!compactLayout"
            class="resonance-choice-row favorites-view-switch"
            :aria-label="locale.viewNav.favorites"
          >
            <button
              type="button"
              class="resonance-choice"
              :aria-pressed="favoriteTab === 'camera'"
              @click="changeFavoriteTab('camera')"
              >{{ language === 'zh' ? '相机参数' : 'Camera parameters' }}
              <small>{{ cameraFavoriteCodes.length }}</small></button
            >
            <button
              type="button"
              class="resonance-choice"
              :aria-pressed="favoriteTab === 'photos'"
              @click="changeFavoriteTab('photos')"
              >{{ language === 'zh' ? '照片收藏' : 'Photo favorites' }}
              <small>{{ favoriteCount }}</small></button
            >
          </nav>
          <CollectionActions
            v-if="favoriteTab === 'photos' && hasAlbum"
            class="outfit-header-actions photo-header-actions"
            :label="mobileText('页面操作', 'Page actions')"
            ><button
              type="button"
              :disabled="isAnyFileOperationBusy || isCompatibleAlbum"
              :title="isCompatibleAlbum ? compatibleMessages.writeDisabled : undefined"
              @click="openPhotoImportPicker"
            >
              <Download :size="16" aria-hidden="true" />{{
                isImportingPhotos ? locale.topBar.importingPhotos : locale.topBar.importPhotos
              }} </button
            ><template #secondary>
              <label
                class="auto-parse-actions-toggle app-checkbox-label"
                :data-tooltip="locale.grid.autoParseActionsHint"
              >
                <input
                  v-model="autoParseActionsEnabled"
                  class="app-checkbox"
                  style="--checkbox-size: 17px"
                  type="checkbox"
                  :aria-label="locale.grid.autoParseActions"
                />
                <span>{{ locale.grid.autoParseActions }}</span>
                <span class="auto-parse-actions-help" aria-hidden="true">?</span>
              </label>

              <button
                type="button"
                :disabled="isAnyFileOperationBusy || !photos.length"
                @click="exportAlbumPhotos([], true)"
              >
                <Upload :size="16" aria-hidden="true" />{{
                  isExportingPhotos ? locale.topBar.exportingPhotos : locale.topBar.exportAllPhotos
                }}
              </button>
            </template></CollectionActions
          >
          <div
            id="favorites-camera-actions"
            v-show="isCameraFavoritesView"
            class="favorites-toolbar-actions"
          ></div>
        </div>
        <CameraFavorites
          v-if="cameraMounted"
          @open-filters="mobileFiltersOpen = true"
          @close-filters="mobileFiltersOpen = false"
          :filters-open="mobileFiltersOpen"
          :disabled="activeOperation === 'all-data-backup'"
          ref="cameraFavoritesRef"
          sidebar-target="#album-sidebar-column"
          actions-target="#favorites-camera-actions"
          :active="isCameraFavoritesView"
          :thumbnail-size="thumbnailSizes.camera"
          :language="language"
          :messages="photoParamsMessages"
          :search-query="searchQuery"
          :confirm-action="confirmHomeSchemeAction"
          @codes-change="updateCameraFavoriteCodes"
          @modal-change="cameraFavoriteModal = $event"
          @status="
            (message, tone, files) => handleHomeSchemeStatus(message, tone, files, 'camera-export')
          "
        />
        <div
          v-if="
            !hasAlbum &&
            activeView !== 'outfits' &&
            activeView !== 'home' &&
            activeView !== 'resonance' &&
            activeView !== 'wardrobe' &&
            activeView !== 'makeup' &&
            !isCameraFavoritesView
          "
          class="empty-album-start"
        >
          <div class="empty-start-mark" aria-hidden="true"></div>
          <h2>{{ locale.grid.emptyTitle }}</h2>
          <p>{{ locale.grid.emptyDescription }}</p>
          <div class="empty-album-actions">
            <button
              class="primary-button"
              type="button"
              :disabled="isLoading"
              @click="chooseDirectory"
            >
              {{ isLoading ? locale.topBar.loading : locale.topBar.chooseDirectory }}
            </button>
            <button
              v-if="!compactLayout"
              type="button"
              class="album-compatible-button"
              :disabled="isAnyFileOperationBusy"
              @click="chooseCompatibleAlbum"
              >{{ compatibleMessages.open }}</button
            >
          </div>
          <div v-if="!compactLayout" class="empty-album-guidance">
            <p>{{ compatibleMessages.openingHint }}</p>
            <p class="empty-album-reload-hint">{{ compatibleMessages.reloadHint }}</p>
          </div>
          <p class="recommended-path">{{ locale.grid.recommendedPath }}</p>
          <p class="hidden-folder-tip">{{ locale.grid.hiddenFolderTip }}</p>
        </div>

        <header
          v-else-if="
            activeView !== 'home' &&
            activeView !== 'resonance' &&
            activeView !== 'wardrobe' &&
            activeView !== 'makeup' &&
            activeView !== 'favorites'
          "
          class="gallery-header"
          :class="{ 'is-outfit-header': activeView === 'outfits' }"
        >
          <div>
            <div v-if="activeView === 'outfits'" class="outfit-title-row">
              <h2>{{ viewTitle }}</h2>
              <button
                v-if="!compactLayout"
                class="outfit-guide-open"
                type="button"
                :title="outfitLocale.guideOpen"
                :aria-label="outfitLocale.guideOpen"
                @click="isOutfitGuideVisible = true"
              >
                <CircleHelp :size="17" aria-hidden="true" />
              </button>
            </div>
            <h2 v-else class="trash-header-title"
              >{{ viewTitle }}
              <button
                v-if="activeView === 'trash' && recentlyDeleted.length"
                type="button"
                class="trash-clear-all-btn"
                :title="locale.trash.deleteAllTitle"
                :aria-label="locale.trash.deleteAllTitle"
                :disabled="isAnyFileOperationBusy || notesBlocked"
                @click="deleteAllTrash"
              >
                <Trash2 :size="18" aria-hidden="true" />
              </button>
            </h2>
          </div>
          <CollectionActions
            v-if="activeView === 'outfits'"
            mobile-target="#outfit-tag-actions"
            class="outfit-header-actions"
            :label="mobileText('页面操作', 'Page actions')"
            ><button
              class="primary-button"
              type="button"
              :aria-label="outfitLocale.addOutfit"
              :title="outfitLocale.addOutfit"
              :disabled="isAnyFileOperationBusy"
              @click="openOutfitEditor()"
            >
              <Plus :size="16" aria-hidden="true" /><span class="collection-action-label">{{
                outfitLocale.addOutfit
              }}</span> </button
            ><template #secondary>
              <button
                type="button"
                :disabled="isAnyFileOperationBusy"
                @click="isOutfitSummaryVisible = true"
              >
                <ChartNoAxesColumnIncreasing :size="16" aria-hidden="true" />{{
                  mobileText('搭配总结', 'Outfit summary')
                }}
              </button>
              <button type="button" :disabled="isAnyFileOperationBusy" @click="chooseOutfitBackup">
                <Download :size="16" aria-hidden="true" />{{
                  isImportingOutfits ? outfitLocale.importing : outfitLocale.importData
                }}
              </button>
              <button
                type="button"
                :disabled="isAnyFileOperationBusy || (!outfits.length && !outfitTags.length)"
                @click="exportOutfits"
              >
                <Upload :size="16" aria-hidden="true" />{{
                  isExportingOutfits ? outfitLocale.exporting : outfitLocale.exportData
                }}
              </button>
            </template></CollectionActions
          >
          <CollectionActions
            v-else-if="activeView !== 'trash'"
            class="outfit-header-actions photo-header-actions"
            :label="mobileText('页面操作', 'Page actions')"
            ><button
              type="button"
              :disabled="isAnyFileOperationBusy || isCompatibleAlbum"
              :title="isCompatibleAlbum ? compatibleMessages.writeDisabled : undefined"
              @click="openPhotoImportPicker"
            >
              <Download :size="16" aria-hidden="true" />{{
                isImportingPhotos ? locale.topBar.importingPhotos : locale.topBar.importPhotos
              }} </button
            ><template #secondary>
              <label
                class="auto-parse-actions-toggle app-checkbox-label"
                :data-tooltip="locale.grid.autoParseActionsHint"
              >
                <input
                  v-model="autoParseActionsEnabled"
                  class="app-checkbox"
                  style="--checkbox-size: 17px"
                  type="checkbox"
                  :aria-label="locale.grid.autoParseActions"
                />
                <span>{{ locale.grid.autoParseActions }}</span>
                <span class="auto-parse-actions-help" aria-hidden="true">?</span>
              </label>

              <button
                type="button"
                :disabled="isAnyFileOperationBusy || !photos.length"
                @click="exportAlbumPhotos([], true)"
              >
                <Upload :size="16" aria-hidden="true" />{{
                  isExportingPhotos ? locale.topBar.exportingPhotos : locale.topBar.exportAllPhotos
                }}
              </button>
            </template></CollectionActions
          >
          <p v-if="activeView === 'trash'">{{
            locale.trash.totalSummary(recentlyDeleted.length, trashTotalSizeText)
          }}</p>
        </header>

        <CollectionFilterBar
          v-if="activeView === 'outfits' || activeView === 'resonance'"
          tag-picker
          :actions-id="
            activeView === 'resonance' ? 'resonance-filter-actions' : 'outfit-tag-actions'
          "
          :all-label="
            activeView === 'resonance' ? mobileText('全部星级', 'All rarities') : undefined
          "
          :select-label="
            activeView === 'resonance' ? mobileText('筛选共鸣：', 'Filter resonance: ') : undefined
          "
          :entries="mobileFilterEntries"
          :active="String(mobileActiveFilter)"
          :count="mobileFilterCount"
          :language="language"
          :disabled="isAnyFileOperationBusy"
          @clear="changeMobileFilter('all')"
          @open="mobileFiltersOpen = true"
        />

        <HomeSchemeWorkspace
          ref="homeWorkspaceRef"
          :language="language"
          @open-filters="mobileFiltersOpen = true"
          @close-filters="mobileFiltersOpen = false"
          :filters-open="mobileFiltersOpen"
          v-if="activeView === 'home'"
          :library-revision="homeLibraryRevision"
          :messages="locale.homeScheme"
          :copy-messages="locale.app"
          :disabled="navigationBusy"
          :confirm-action="confirmHomeSchemeAction"
          :search-query="searchQuery"
          :selection-messages="locale.selectionBar"
          :lightbox-messages="locale.lightbox"
          :date-messages="locale.date"
          :thumbnail-mode="displayedThumbnailMode"
          :thumbnail-size="thumbnailSizes.home"
          @status="handleHomeSchemeStatus"
          @count-change="handleHomeSchemeCount"
        />
        <MakeupCatalog
          v-else-if="activeView === 'makeup'"
          sidebar-target="#makeup-sidebar"
          mobile-category-target="#makeup-mobile-category-target"
          :language="language"
          :search-query="searchQuery"
        />
        <PersonalWardrobe
          ref="wardrobeRef"
          v-else-if="activeView === 'wardrobe'"
          sidebar-target="#wardrobe-sidebar"
          :search-query="searchQuery"
          @update-search="searchQuery = $event"
          @notice="showStatus"
          :language="language"
          :disabled="navigationBusy"
        />
        <ResonanceRecords
          ref="resonanceRecordsRef"
          mobile-actions-target="#resonance-filter-actions"
          :disabled="navigationBusy"
          v-else-if="activeView === 'resonance'"
          :language="language"
          :banner-order="resonanceBannerOrder"
          :rarity-filter="resonanceRarityFilter"
          @records-change="resonanceRecords = $event"
          @notice="showStatus"
          @clear-notice="clearOperationStatus('resonance')"
        />
        <RecentlyDeletedGrid
          v-else-if="albumDirectoryHandle && activeView === 'trash'"
          :photos="recentlyDeleted"
          :selected-ids="trashSelectedIds"
          :thumbnail-mode="thumbnailMode"
          :thumbnail-size="thumbnailSizes.photo"
          :language="language"
          :messages="locale.trash"
          @toggle-photo="toggleTrashPhoto"
          @open-preview="openPreview"
        />
        <OutfitGrid
          :language="language"
          v-else-if="activeView === 'outfits'"
          :outfits="visibleOutfits"
          :unreadable-count="unreadableOutfitCount"
          :total-count="outfits.length"
          :selected-ids="selectedOutfitIds"
          :thumbnail-mode="outfitThumbnailMode"
          :thumbnail-size="thumbnailSizes.outfit"
          :messages="outfitLocale"
          :disabled="isAnyFileOperationBusy"
          @copy="copyOutfitCode"
          @edit="openOutfitEditor"
          @delete="removeOutfit"
          @parse="openOutfitParse"
          @share="sharingOutfit = $event"
          @open-preview="openPreview"
          @toggle-outfit="toggleOutfit"
        />
        <PhotoGrid
          :language="language"
          v-else-if="hasAlbum && !isCameraFavoritesView"
          :read-only="isCompatibleAlbum || notesBlocked"
          :read-only-hint="notesBlocked ? noteLockedHint : compatibleMessages.writeDisabled"
          :date-groups="formattedDateGroups"
          :action-groups="actionGroups"
          :grouping-mode="sidebarMode"
          :selected-ids="selectedIds"
          :favorite-ids="favoriteIds"
          :thumbnail-mode="thumbnailMode"
          :thumbnail-size="thumbnailSizes.photo"
          :is-favorites-view="activeView === 'favorites'"
          :messages="locale.grid"
          @toggle-photo="togglePhoto"
          @toggle-favorite="toggleFavorite"
          @toggle-date="toggleDate"
          @toggle-group="togglePhotoGroup"
          @open-preview="openPreview"
          @edit-note="editPhotoNote"
          @parse-photo="openPhotoParams($event)"
          @share-photo="openPhotoParams($event, true)"
        />
      </section>
    </main>
    <MobileNavigation
      :active-view="activeView"
      :disabled="allBackupDisabled"
      :messages="locale.viewNav"
      :outfit-label="outfitLocale.viewName"
      :camera-label="mobileText('相机参数', 'Camera parameters')"
      @change-view="changeAlbumView"
    />

    <SelectionBar
      :read-only="(isCompatibleAlbum || notesBlocked) && activeView !== 'outfits'"
      :read-only-hint="notesBlocked ? noteLockedHint : compatibleMessages.writeDisabled"
      v-if="
        activeView !== 'home' &&
        activeView !== 'resonance' &&
        activeView !== 'wardrobe' &&
        activeView !== 'makeup' &&
        !isCameraFavoritesView
      "
      :mode="
        activeView === 'trash'
          ? 'trash'
          : activeView === 'outfits'
            ? 'outfit'
            : activeView === 'favorites'
              ? 'favorites'
              : 'album'
      "
      :selected-count="
        activeView === 'trash'
          ? trashSelectedCount
          : activeView === 'outfits'
            ? selectedOutfitCount
            : selectedCount
      "
      :all-selected="
        activeView === 'trash'
          ? allTrashSelected
          : activeView === 'outfits'
            ? allOutfitsSelected
            : allSelected
      "
      :all-selected-favorited="allSelectedFavorited"
      :all-items-selected="activeView === 'trash' && allTrashSelected"
      :is-busy="isAnyFileOperationBusy"
      :messages="locale.selectionBar"
      @toggle-all="
        activeView === 'trash'
          ? toggleAllTrash()
          : activeView === 'outfits'
            ? toggleAllOutfits()
            : toggleAll()
      "
      @favorite="favoriteSelectedPhotos"
      @unfavorite="unfavoriteSelectedPhotos"
      @delete-related="deleteMatchingLowQualityPhotos"
      @delete="
        activeView === 'trash'
          ? permanentlyDeleteSelectedTrash()
          : activeView === 'outfits'
            ? deleteSelectedOutfits()
            : deleteSelectedPhotos()
      "
      @export="exportAlbumPhotos(scopedSelectedPhotos)"
      @restore="restoreSelectedTrash"
      @cancel="
        activeView === 'trash'
          ? clearTrashSelection()
          : activeView === 'outfits'
            ? clearOutfitSelection()
            : clearAlbumSelection()
      "
    />

    <Lightbox
      :read-only="(isCompatibleAlbum || notesBlocked) && activeView !== 'outfits'"
      :read-only-hint="notesBlocked ? noteLockedHint : compatibleMessages.writeDisabled"
      :photo="currentPreview"
      :has-previous="hasPreviousPreview"
      :has-next="hasNextPreview"
      :is-deleting="isDeleting || isTrashBusy"
      :keyboard-enabled="
        !confirmDialog.visible &&
        !isOutfitEditorVisible &&
        !isOutfitParseVisible &&
        !isPhotoParamsVisible &&
        !isNoteDialogVisible &&
        !cameraFavoriteModal
      "
      :mode="activeView === 'trash' ? 'trash' : activeView === 'outfits' ? 'outfit' : 'album'"
      :outfit="currentPreviewOutfit"
      :outfit-messages="outfitLocale"
      :is-favorite="Boolean(currentPreview && favoriteIds.has(currentPreview.id))"
      :messages="locale.lightbox"
      :date-messages="locale.date"
      @close="closePreview"
      @previous="showPreviousPreview"
      @next="showNextPreview"
      @delete-current="deleteCurrentPreview"
      @toggle-favorite="currentPreview && toggleFavorite(currentPreview.id)"
      @restore-current="restoreCurrentTrashPreview"
      @permanently-delete-current="permanentlyDeleteCurrentTrashPreview"
      @copy-outfit="currentPreviewOutfit && copyOutfitCode(currentPreviewOutfit)"
      @edit-outfit="currentPreviewOutfit && openOutfitEditor(currentPreviewOutfit)"
      @edit-photo-note="editPhotoNote(currentPreview)"
      @parse-photo="currentPreview && openPhotoParams(currentPreview)"
    />

    <CardShareDialog
      v-if="sharingOutfit"
      :language="language"
      :code="sharingOutfit.code"
      :load-photo="loadCardSharePhoto"
      @close="sharingOutfit = null"
    />
    <CardShareDialog
      v-if="autoSharePhoto && isPhotoParamsVisible"
      :language="language"
      :result="photoParamsResult"
      :load-photo="photoParams.loadSourcePhoto"
      :name="photoParamsPhoto?.name"
      :preparing="!photoParamsResult"
      :preparation-error="photoParamsError"
      :preparation-error-codes="photoParamsErrorCodes"
      :preparation-progress="photoParamsProgress"
      :preparation-message="photoParamsProgress.message"
      :uid-required="photoParamsUidRequired"
      @submit-uid="photoParams.submitUid"
      @close="closePhotoParams"
    />
    <PhotoParamsDialog
      :language="language"
      v-if="mountedDialogs.has('PhotoParamsDialog')"
      :visible="isPhotoParamsVisible && !cameraFavoriteModal && !autoSharePhoto"
      :saved="photoParamsSaved"
      :favorite-label="
        photoParamsSaved
          ? language === 'zh'
            ? '已收藏'
            : 'Saved'
          : language === 'zh'
            ? '收藏参数'
            : 'Save parameters'
      "
      @favorite="saveCameraFavoriteFromParams"
      :photo="photoParamsPhoto"
      :source-file="photoParams.uploadFile.value"
      :load-source-photo="photoParams.loadSourcePhoto"
      :progress="photoParamsProgress"
      :result="photoParamsResult"
      :error="photoParamsError"
      :error-codes="photoParamsErrorCodes"
      :uid-required="photoParamsUidRequired"
      :messages="photoParamsMessages"
      @close="closePhotoParams"
      @copy="copyRawCameraParams"
      @submit-uid="photoParams.submitUid"
    />

    <ParseToolsDialog
      :visible="isParseToolsVisible"
      :camera-params="cameraParamsInput"
      :outfit-code="parseCodeInput"
      :outfit-max-length="MAX_OUTFIT_CODE_LENGTH"
      :busy="isAnyFileOperationBusy"
      :messages="{
        title: locale.topBar.parseTools,
        close: locale.app.dialogCloseAria,
        cameraTitle: locale.topBar.cameraParamsTitle,
        outfitTitle: locale.topBar.outfitCodeTitle,
        cameraPlaceholder: locale.topBar.cameraParamsPlaceholder,
        outfitPlaceholder: outfitLocale.parseInputPlaceholder,
        cameraSubmit: locale.topBar.cameraParamsParse,
        outfitSubmit: outfitLocale.parse,
        busyHint: locale.topBar.parseToolsBusy,
        upload: photoParamsMessages.upload,
        uploadHint: photoParamsMessages.uploadHint
      }"
      @close="closeParseTools"
      @update:camera-params="cameraParamsInput = $event"
      @update:outfit-code="parseCodeInput = $event"
      @parse-camera="parseHeaderCameraParams"
      @parse-outfit="parseToolsOutfitCode"
      @upload="photoParams.openForFile"
    />

    <FortuneTimeDialog
      v-if="mountedDialogs.has('FortuneTimeDialog')"
      :visible="isFortuneTimeVisible"
      :messages="locale.fortuneTime"
      @close="isFortuneTimeVisible = false"
    />

    <OutfitEditor
      v-if="mountedDialogs.has('OutfitEditor')"
      ref="outfitEditorRef"
      :visible="isOutfitEditorVisible"
      :selection-busy="isSavingOutfit"
      :outfit="editingOutfit"
      :tags="outfitTags"
      :busy="isAnyFileOperationBusy"
      :messages="outfitLocale"
      @close="closeOutfitEditor()"
      @save="handleSaveOutfit"
      @add-tag="addOutfitTag($event, true)"
    />

    <OutfitSummaryDialog
      v-if="isOutfitSummaryVisible && activeView === 'outfits'"
      :outfits="outfits"
      :language="language"
      @close="isOutfitSummaryVisible = false"
      @tag="showSummaryTag"
    />
    <OutfitParseDialog
      v-if="mountedDialogs.has('OutfitParseDialog')"
      :visible="isOutfitParseVisible"
      :code="parsingOutfitCode"
      :load-photo="parsingOutfitImage"
      :language="language"
      :messages="outfitLocale"
      @close="closeOutfitParse"
      @copy="copyOutfitCodeValue"
    />

    <NoteDialog
      :visible="isNoteDialogVisible"
      :title="locale.grid.noteTitle"
      :label="locale.grid.noteLabel"
      :placeholder="locale.grid.notePlaceholder"
      :initial-value="noteDialogPhoto?.note ?? ''"
      :save-label="locale.grid.noteSave"
      :cancel-label="locale.grid.noteCancel"
      :close-label="locale.grid.noteClose"
      :max-length="15"
      :busy="isAnyFileOperationBusy"
      @save="saveNoteDialog"
      @cancel="closeNoteDialog"
    />

    <OutfitGuideDialog
      v-if="mountedDialogs.has('OutfitGuideDialog')"
      :visible="isOutfitGuideVisible"
      :dismissed="isOutfitGuideDismissed"
      :messages="outfitLocale"
      @close="closeOutfitGuide"
    />

    <UpdateLogDialog
      v-if="mountedDialogs.has('UpdateLogDialog')"
      :visible="isUpdateLogVisible"
      :dismissed="isAboutDialogDismissed"
      :language="language"
      @close="closeUpdateLog"
      @after-close="showPendingDataReminder"
      @open-help="openHelpFromUpdateLog"
    />

    <DataStorageReminder
      :visible="isDataReminderVisible"
      :skip-countdown="dataReminderOpenedFromMenu"
      :dismissed="isDataReminderDismissed"
      :language="language"
      @confirm="closeDataReminder"
    />

    <HelpAboutDialog
      v-if="mountedDialogs.has('HelpAboutDialog')"
      :visible="isHelpAboutVisible"
      :compact="compactLayout"
      :language="language"
      @close="closeHelpAbout"
    />

    <CleanupDialog
      :visible="showCleanupDialog"
      :authorized-name="cleanupX6GameHandle?.name ?? null"
      :busy-item="cleaningItem"
      :disabled="isAnyFileOperationBusy"
      :messages="locale.cleanup"
      @close="showCleanupDialog = false"
      @authorize="authorizeCleanupFolder"
      @clean="cleanSpecialItem"
    />

    <CleanupAccountPicker
      :visible="showCleanupAccountDialog"
      :accounts="cleanupAccounts"
      :remembered-choice="cleanupRememberedChoice"
      :messages="locale.cleanup"
      @confirm="resolveCleanupAccounts"
      @cancel="resolveCleanupAccounts(null)"
    />

    <input
      id="outfit-backup-input"
      ref="outfitImportInput"
      class="visually-hidden"
      type="file"
      accept=".zip,application/zip"
      @change="importOutfits"
    />
    <input
      ref="photoImportInput"
      class="visually-hidden"
      type="file"
      accept="image/*,.jpg,.jpeg,.png,.webp,.gif,.bmp,.avif"
      multiple
      @change="importAlbumPhotos"
    />

    <PhotoTransferProgressDialog
      :visible="photoTransfer.phase !== 'idle'"
      :title="photoTransfer.title"
      :completed="photoTransfer.completed"
      :total="photoTransfer.total"
      :preparing="photoTransfer.phase === 'preparing'"
      :failed-names="photoTransfer.failedNames"
      :is-running="photoTransfer.phase === 'running' || photoTransfer.phase === 'preparing'"
      :is-cancelled="photoTransfer.phase === 'cancelled'"
      :can-cancel="photoTransfer.kind === 'export'"
      :cancel-label="locale.app.transferCancel"
      :close-label="locale.app.dialogCloseAria"
      :failed-label="locale.app.transferFailed"
      :cancelled-label="locale.app.transferCancelled"
      :close-action-label="locale.app.transferClose"
      @cancel="cancelPhotoTransfer"
      @close="closePhotoTransfer"
    />

    <ConfirmDialog
      :visible="confirmDialog.visible"
      :title="confirmDialog.title"
      :message="confirmDialog.message"
      :sections="confirmDialog.sections"
      :consequence="confirmDialog.consequence"
      :secondary-label="confirmDialog.secondaryLabel"
      @secondary="runSecondaryAction"
      :tone="confirmDialog.tone"
      :confirm-label="confirmDialog.confirmLabel"
      :cancel-label="confirmDialog.cancelLabel"
      :close-label="locale.app.dialogCloseAria"
      @confirm="closeConfirmDialog(true)"
      @cancel="closeConfirmDialog(false)"
    />

    <OperationNotice
      :language="language"
      :notices="statusNotices"
      :title="locale.app.operationNoticeTitle"
      :close-label="locale.app.operationNoticeCloseAria"
      @close="closeStatusNotice"
      @pause="pauseStatusNoticeTimer"
      @resume="resumeStatusNoticeTimer"
    />
  </div>
</template>

<style scoped>
.favorites-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px 16px;
  border-bottom: 1px solid var(--line);
  margin-bottom: 22px;
  padding-bottom: 10px;
}
.favorites-toolbar-actions {
  margin-left: auto;
  min-width: 0;
  max-width: 100%;
}
.favorites-toolbar :deep(.outfit-header-actions) {
  width: auto;
  flex-wrap: wrap;
  justify-content: flex-end;
  overflow: visible;
}
.favorites-toolbar :deep(.outfit-header-actions > button) {
  white-space: nowrap;
}
</style>
