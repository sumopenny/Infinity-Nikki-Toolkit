import { backupDeleteWarning } from '../utils/directory-backup/engine'
import { reportPartialFailure } from '../utils/errorReporting/errorReporter'
import { takeDownloadFiles } from '../utils/backup/downloadFallback'
import {
  assertBackupKind,
  backupInputMessage,
  isBackupInputError
} from '../utils/backup/backupDetector'
import type { Ref, ComputedRef } from 'vue'
import type { LocaleMessages, OutfitMessages } from '../i18n'
import type { PhotoDisplayItem } from '../utils/photoGrouping'
import type OutfitSidebar from '../components/OutfitSidebar.vue'
import type OutfitEditor from '../components/OutfitEditor.vue'
import type { ActiveOperation, StatusState, StatusTone } from './useOperationNotice'
import type { useConfirmDialog } from './useConfirmDialog'
import {
  deleteOutfit,
  deleteOutfits,
  deleteOutfitTag,
  saveOutfit,
  saveOutfitTags,
  type OutfitItem,
  type OutfitLibraryResult,
  type SaveOutfitInput
} from '../utils/outfit/outfitFileSystem'

import {
  isValidOutfitTag,
  MAX_OUTFIT_TAG_LENGTH,
  MAX_OUTFIT_TAGS,
  normalizeOutfitTag
} from '../utils/outfit/outfitTypes'
import { releasePhotoUrl } from '../utils/file-system/photoUrl'
import { copyTextToClipboard } from '../utils/clipboard'
interface OutfitWorkspaceOptions {
  language?: Ref<'zh' | 'en'>
  activeOperation: Ref<ActiveOperation | null>
  isAnyFileOperationBusy: ComputedRef<boolean>
  outfitLocale: ComputedRef<OutfitMessages>
  locale: ComputedRef<LocaleMessages>
  editingOutfit: Ref<OutfitItem | null>
  isOutfitEditorVisible: Ref<boolean>
  outfits: Ref<OutfitItem[]>
  outfitTags: Ref<string[]>
  selectedOutfitIds: Ref<Set<string>>
  currentPreview: Ref<PhotoDisplayItem | null>
  visibleOutfits: ComputedRef<OutfitItem[]>
  outfitSidebarRef: Ref<InstanceType<typeof OutfitSidebar> | null>
  outfitEditorRef: Ref<InstanceType<typeof OutfitEditor> | null>
  statusState: Ref<StatusState>
  reloadOutfitCollection: () => Promise<void>
  applyOutfitLibraryResult: (result: OutfitLibraryResult) => void
  showOutfitStatus: (message: string, tone?: StatusTone, loading?: boolean, source?: string) => void
  showOutfitStorageError: (error: unknown, source?: string) => void
  openConfirmDialog: ReturnType<typeof useConfirmDialog>['openConfirmDialog']
  onImportPicked: () => void
}
/** 搭配操作控制器：集中编辑、标签、删除和备份命令，复用统一忙碌状态与业务存储校验。 */
export function useOutfitWorkspace(options: OutfitWorkspaceOptions) {
  const {
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
    onImportPicked
  } = options
  /** 保存全局搭配并重新读取收藏库，成功后关闭编辑窗口。 */
  async function handleSaveOutfit(input: Omit<SaveOutfitInput, 'outfit'>) {
    if (isAnyFileOperationBusy.value) return
    activeOperation.value = 'saving-outfit'
    showOutfitStatus(outfitLocale.value.saving, 'info', true)
    try {
      await saveOutfit({ ...input, outfit: editingOutfit.value ?? undefined })
      const wasEditing = Boolean(editingOutfit.value)
      await reloadOutfitCollection()
      isOutfitEditorVisible.value = false
      editingOutfit.value = null
      showOutfitStatus(outfitLocale.value.operations.saveSucceeded(wasEditing), 'success')
    } catch (error) {
      showOutfitStorageError(error)
    } finally {
      if (activeOperation.value === 'saving-outfit') activeOperation.value = null
    }
  }

  /** 新增搭配标签。参数：用户输入的原始标签文本。 */
  async function addOutfitTag(rawTag: string, selectInEditor = false) {
    if (isAnyFileOperationBusy.value) return
    const tag = normalizeOutfitTag(rawTag)
    const reserved = new Set(['全部', '待填写', '未分类', 'all', 'pending', 'uncategorized'])
    if (!isValidOutfitTag(tag)) {
      showOutfitStatus(outfitLocale.value.operations.invalidTag(MAX_OUTFIT_TAG_LENGTH), 'warning')
      return
    }
    if (reserved.has(tag.toLowerCase()) || outfitTags.value.includes(tag)) {
      showOutfitStatus(outfitLocale.value.operations.duplicateOrReservedTag, 'warning')
      return
    }
    if (outfitTags.value.length >= MAX_OUTFIT_TAGS) {
      showOutfitStatus(outfitLocale.value.operations.tagLimitReached(MAX_OUTFIT_TAGS), 'warning')
      return
    }
    activeOperation.value = 'mutating-outfits'
    try {
      outfitTags.value = await saveOutfitTags([tag, ...outfitTags.value], outfitTags.value)
      outfitSidebarRef.value?.closeTagInput()
      if (selectInEditor) outfitEditorRef.value?.selectCreatedTag(tag)
      showOutfitStatus(outfitLocale.value.operations.tagAdded)
    } catch (error) {
      showOutfitStorageError(error)
    } finally {
      if (activeOperation.value === 'mutating-outfits') activeOperation.value = null
    }
  }

  /** 保存用户在左侧栏调整后的标签顺序。参数：tags 为拖拽完成后的完整标签数组。 */
  async function reorderOutfitTags(tags: string[]) {
    if (isAnyFileOperationBusy.value) return
    const previousTags = [...outfitTags.value]
    outfitTags.value = [...tags]
    activeOperation.value = 'mutating-outfits'
    try {
      outfitTags.value = await saveOutfitTags(tags, previousTags)
    } catch (error) {
      outfitTags.value = previousTags
      showOutfitStorageError(error)
    } finally {
      if (activeOperation.value === 'mutating-outfits') activeOperation.value = null
    }
  }

  async function removeOutfitTag(tag: string) {
    if (isAnyFileOperationBusy.value) return
    const usedCount = outfits.value.filter((outfit) => outfit.tags[0] === tag).length
    if (usedCount) {
      const confirmed = await openConfirmDialog({
        title: outfitLocale.value.operations.deleteTagTitle,
        message: outfitLocale.value.operations.deleteTagMessage(tag, usedCount),
        tone: 'warning',
        confirmLabel: outfitLocale.value.operations.deleteTagTitle,
        cancelLabel: locale.value.app.dialogCancel
      })
      if (!confirmed) return
    }
    try {
      activeOperation.value = 'mutating-outfits'
      const result = await deleteOutfitTag(tag)
      outfitTags.value = result.tags
      await reloadOutfitCollection()
      showOutfitStatus(outfitLocale.value.operations.tagDeleted)
    } catch (error) {
      showOutfitStorageError(error)
    } finally {
      if (activeOperation.value === 'mutating-outfits') activeOperation.value = null
    }
  }

  async function copyOutfitCode(outfit: OutfitItem) {
    if (!outfit.code) return
    await copyOutfitCodeValue(outfit.code)
  }

  /** 统一复制搭配码并通过顶部操作通知反馈结果。 */
  async function copyOutfitCodeValue(code: string) {
    if (!code) return
    if (await copyTextToClipboard(code)) {
      showOutfitStatus(locale.value.app.copySucceeded)
    } else showOutfitStatus(locale.value.app.copyFailed(code), 'warning')
  }

  /** 删除单个搭配方案，先弹确认框再执行删除。参数：outfit 为待删除的搭配方案。 */
  async function removeOutfit(outfit: OutfitItem) {
    if (isAnyFileOperationBusy.value) return
    const confirmed = await openConfirmDialog({
      title: outfitLocale.value.operations.deleteOutfitTitle,
      message:
        outfitLocale.value.operations.confirmPermanentDelete +
        (await backupDeleteWarning('outfits', options.language?.value ?? 'zh')),
      tone: 'danger',
      confirmLabel: outfitLocale.value.operations.permanentlyDelete,
      cancelLabel: locale.value.app.dialogCancel
    })
    if (!confirmed) return
    activeOperation.value = 'mutating-outfits'
    try {
      await deleteOutfit(outfit, true)
      releasePhotoUrl(outfit)
      if (currentPreview.value?.id === outfit.id) currentPreview.value = null
      selectedOutfitIds.value = new Set(
        [...selectedOutfitIds.value].filter((id) => id !== outfit.id)
      )
      outfits.value = outfits.value.filter((item) => item.id !== outfit.id)
      showOutfitStatus(outfitLocale.value.operations.outfitDeleted)
    } catch (error) {
      await reloadOutfitCollection().catch(() => undefined)
      showOutfitStorageError(error)
    } finally {
      if (activeOperation.value === 'mutating-outfits') activeOperation.value = null
    }
  }

  /** 永久删除当前选中的搭配方案。参数：无；删除结果不会进入最近删除。 */
  async function deleteSelectedOutfits() {
    const targets = visibleOutfits.value.filter((outfit) => selectedOutfitIds.value.has(outfit.id))
    if (!targets.length || isAnyFileOperationBusy.value) return
    const confirmed = await openConfirmDialog({
      title: outfitLocale.value.operations.deleteSelectedTitle,
      message: outfitLocale.value.operations.confirmPermanentDelete,
      tone: 'danger',
      confirmLabel: outfitLocale.value.operations.permanentlyDelete,
      cancelLabel: locale.value.app.dialogCancel
    })
    if (!confirmed) return
    if (
      targets.length === outfits.value.length &&
      (await backupDeleteWarning('outfits', options.language?.value ?? 'zh'))
    ) {
      const cleared = await openConfirmDialog({
        title:
          options.language?.value === 'en' ? 'Clear the computer copy too?' : '同时清空电脑副本？',
        message:
          options.language?.value === 'en'
            ? 'All outfit records and their images will also be removed from the latest computer backup.'
            : '这次删除覆盖全部搭配记录。同步后，电脑最新副本中的全部搭配记录和图片也会删除，不能撤销。',
        tone: 'danger',
        confirmLabel: outfitLocale.value.operations.permanentlyDelete,
        cancelLabel: locale.value.app.dialogCancel
      })
      if (!cleared) return
    }
    activeOperation.value = 'mutating-outfits'
    showOutfitStatus(outfitLocale.value.operations.deletingSelected, 'info', true)
    try {
      const result = await deleteOutfits(targets, true)
      const deletedIds = new Set(result.deleted.map((item) => item.id))
      result.deleted.forEach(releasePhotoUrl)
      if (currentPreview.value && deletedIds.has(currentPreview.value.id))
        currentPreview.value = null
      selectedOutfitIds.value = new Set(
        [...selectedOutfitIds.value].filter((id) => !deletedIds.has(id))
      )
      reportPartialFailure('outfits', 'delete-selected', result.failedNames.length, {
        succeededCount: deletedIds.size
      })
      outfits.value = outfits.value.filter((item) => !deletedIds.has(item.id))
      showOutfitStatus(
        outfitLocale.value.operations.deletedSelected(deletedIds.size, result.failedNames.length),
        result.failedNames.length ? 'warning' : 'success'
      )
    } catch (error) {
      await reloadOutfitCollection().catch(() => undefined)
      showOutfitStorageError(error)
    } finally {
      if (activeOperation.value === 'mutating-outfits') activeOperation.value = null
    }
  }

  /** 通过浏览器直接下载搭配码 ZIP。 */
  async function exportOutfits() {
    if (isAnyFileOperationBusy.value || (!outfits.value.length && !outfitTags.value.length)) return
    activeOperation.value = 'exporting-outfits'
    showOutfitStatus(outfitLocale.value.exporting, 'info', true, 'outfits-export')
    try {
      const { exportOutfitBackup } = await import('../utils/outfit/outfitBackup')
      const result = await exportOutfitBackup()
      statusState.value = {
        type: 'custom',
        source: 'outfits-export',
        downloadFiles: takeDownloadFiles('outfits'),
        message: outfitLocale.value.operations.exportSucceeded(
          result.fileNames.join('、'),
          result.count
        ),
        tone: 'success'
      }
    } catch (error) {
      showOutfitStorageError(error, 'outfits-export')
    } finally {
      if (activeOperation.value === 'exporting-outfits') activeOperation.value = null
      takeDownloadFiles('outfits')
    }
  }

  async function importOutfits(event: Event) {
    const input = event.target as HTMLInputElement
    onImportPicked()
    const file = input.files?.[0]
    input.value = ''
    if (!file || isAnyFileOperationBusy.value) return
    activeOperation.value = 'importing-outfits'
    showOutfitStatus(outfitLocale.value.importing, 'info', true)
    try {
      await assertBackupKind(file, 'outfits')
      const { importOutfitBackup } = await import('../utils/outfit/outfitBackup')
      const result = await importOutfitBackup(file)
      applyOutfitLibraryResult(result.library)
      const tagNote = result.rejectedTagCount
        ? outfitLocale.value.operations.rejectedTags(result.rejectedTagCount)
        : ''
      showOutfitStatus(
        outfitLocale.value.operations.importCompleted(
          result.addedCount,
          result.duplicateCount,
          result.failedCount,
          tagNote
        ),
        result.failedCount || result.rejectedTagCount ? 'warning' : 'success'
      )
      reportPartialFailure('outfits', 'import-backup', result.failedCount, {
        savedCount: result.addedCount
      })
    } catch (error) {
      if (isBackupInputError(error))
        showOutfitStatus(backupInputMessage(error, options.language?.value ?? 'zh', 'outfits')!, 'warning')
      else showOutfitStorageError(error)
    } finally {
      if (activeOperation.value === 'importing-outfits') activeOperation.value = null
    }
  }

  return {
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
  }
}
