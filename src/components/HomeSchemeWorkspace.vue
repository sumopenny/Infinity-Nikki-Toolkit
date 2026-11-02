<script setup lang="ts">
import { takeDownloadFiles } from '../utils/backup/downloadFallback'
import {
  reportError as captureDiagnosticError,
  reportPartialFailure
} from '../utils/errorReporting/errorReporter'
import { validateSelectedImage } from '../utils/imageSelection'
import { snapshotImageFile } from '../utils/image'
import { useCompactLayout } from '../composables/useCompactLayout'
const compact = useCompactLayout()
const imageReading = ref(false)
const imageSelectionError = ref('')
import { useModuleOperation } from '../composables/useOperationCoordinator'
const trackOperation = useModuleOperation('home')
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { Check, Copy, Download, Edit3, ImagePlus, Plus, Trash2, Upload, X } from 'lucide-vue-next'
import { messages as localeMessages, type LocaleMessages } from '../i18n'
import OutfitSidebar from './OutfitSidebar.vue'
import CollectionFilterBar from './CollectionFilterBar.vue'
import CollectionActions from './CollectionActions.vue'
import StoredImage from './StoredImage.vue'
import MobileEmptyScreenshot from './MobileEmptyScreenshot.vue'
import { releasePhotoUrl } from '../utils/file-system/photoUrl'

import { describeHomeSchemeError } from '../utils/homeBuild/homeSchemeErrors'
import type { HomeSchemeMessages } from '../i18n/messages/homeScheme'
import { copyTextToClipboard } from '../utils/clipboard'
import { importHomeSchemeBackup, exportHomeSchemeBackup } from '../utils/homeBuild/homeSchemeBackup'
import {
  deleteHomeScheme,
  deleteHomeSchemeTag,
  readHomeSchemeLibrary,
  readHomeSchemeImage,
  releaseHomeSchemeUrls,
  reorderHomeSchemeTags,
  saveHomeScheme,
  addHomeSchemeTag
} from '../utils/homeBuild/homeSchemeStorage'
import { parseHomeScheme, type HomeSchemeParseResult } from '../utils/homeBuild/homeSchemeParser'
import { describeHomeSchemeParseError } from '../utils/homeBuild/homeSchemeErrors'
import { useBodyScrollLock } from '../utils/bodyScrollLock'
import { datePartsFromTimestamp, type PhotoItem } from '../utils/photoGrouping'
import {
  MAX_HOME_SCHEME_CODE_LENGTH,
  MAX_HOME_SCHEME_NOTE_LENGTH,
  MAX_HOME_SCHEME_TAG_LENGTH,
  MAX_HOME_SCHEME_TAGS,
  normalizeHomeSchemeCode,
  normalizeHomeSchemeTag,
  type HomeSchemeItem,
  type HomeSchemeType
} from '../utils/homeBuild/homeSchemeTypes'
import Lightbox from './Lightbox.vue'
import SelectionBar from './SelectionBar.vue'
import type { ThumbnailMode, ThumbnailSize } from '../types/thumbnail'

const props = defineProps<{
  language?: 'zh' | 'en'
  libraryRevision: number
  messages: HomeSchemeMessages
  copyMessages?: { copySucceeded: string; copyFailed: (value: string) => string }
  disabled: boolean
  confirmAction: (message: string, title?: string, confirmLabel?: string) => Promise<boolean>
  searchQuery: string
  selectionMessages: LocaleMessages['selectionBar']
  lightboxMessages: LocaleMessages['lightbox']
  dateMessages: LocaleMessages['date']
  thumbnailMode: ThumbnailMode
  thumbnailSize?: ThumbnailSize
  filtersOpen?: boolean
}>()
const emit = defineEmits<{
  openFilters: []
  closeFilters: []
  status: [message: string, tone: 'success' | 'warning' | 'error' | 'info', downloadFiles?: File[]]
  countChange: [count: number]
}>()

const schemes = ref<HomeSchemeItem[]>([])
const tags = ref<string[]>([])
const filter = ref<'all' | 'home' | 'combo' | 'uncategorized' | `tag:${string}`>('all')
const busy = ref(false)
const editorVisible = ref(false)
const editing = ref<HomeSchemeItem | null>(null)
const code = ref('')
const name = ref('')
const schemeType = ref<HomeSchemeType | null>(null)
const version = ref<string | null>(null)
const furnitureCount = ref<number | null>(null)
const server = ref<number | null>(null)
const lastModifyTime = ref<number | null>(null)
const coverImageUrl = ref<string | null>(null)
const note = ref('')
const selectedTag = ref('')
const selectedSchemeIds = ref<Set<string>>(new Set())
const previewScheme = ref<HomeSchemeItem | null>(null)
const imageFile = ref<File | null>(null)
const localImageUrl = ref<string | null>(null)
let editorImageGeneration = 0
const removeLocalImage = ref(false)
const isDragging = ref(false)
const parsing = ref(false)
const parsedCode = ref('')
const tagInputVisible = ref(false)
const tagInput = ref('')
const homeSidebarRef = ref<InstanceType<typeof OutfitSidebar> | null>(null)
const tagInputRef = ref<HTMLInputElement | null>(null)
const editorTagToggleRef = ref<HTMLButtonElement | null>(null)
const tagInputOwner = ref<'editor' | null>(null)
const tagEditorRef = ref<HTMLFormElement | null>(null)
const tagEditorPosition = ref({ top: '0px', left: '0px' })
const fileInput = ref<HTMLInputElement | null>(null)
const backupInput = ref<HTMLInputElement | null>(null)
let parseTimer: number | undefined
let parseController: AbortController | null = null
let parseGeneration = 0
let loadGeneration = 0
let pendingLibraryReload = false
let previousActiveElement: HTMLElement | null = null

useBodyScrollLock(editorVisible)

const visibleSchemes = computed(() => {
  let result = schemes.value
  if (filter.value === 'home' || filter.value === 'combo')
    result = result.filter((item) => item.schemeType === filter.value)
  else if (filter.value === 'uncategorized')
    result = result.filter((item) => item.tags.length === 0)
  else if (filter.value.startsWith('tag:'))
    result = result.filter((item) => item.tags.includes(filter.value.slice(4)))
  const query = props.searchQuery.trim().toLocaleLowerCase()
  return query
    ? result.filter((item) =>
        `${item.name} ${item.code} ${item.note}`.toLocaleLowerCase().includes(query)
      )
    : result
})
const previewUrl = computed(
  () => localImageUrl.value ?? (removeLocalImage.value ? null : coverImageUrl.value)
)
const isBusy = computed(() => props.disabled || busy.value)

const selectedSchemes = computed(() =>
  visibleSchemes.value.filter((item) => selectedSchemeIds.value.has(item.id))
)
const selectedSchemeCount = computed(() => selectedSchemes.value.length)
const allSchemesSelected = computed(
  () =>
    visibleSchemes.value.length > 0 &&
    visibleSchemes.value.every((item) => selectedSchemeIds.value.has(item.id))
)
const previewIndex = computed(() =>
  previewScheme.value
    ? visibleSchemes.value.findIndex((item) => item.id === previewScheme.value?.id)
    : -1
)
const hasPreviousPreview = computed(() => previewIndex.value > 0)
const hasNextPreview = computed(
  () => previewIndex.value >= 0 && previewIndex.value < visibleSchemes.value.length - 1
)
const previewPhoto = computed<Omit<PhotoItem, 'fileHandle' | 'directoryHandle'> | null>(() => {
  const item = previewScheme.value
  if (!item) return null
  const timestamp = Date.parse(item.updatedAt)
  const date = datePartsFromTimestamp(Number.isFinite(timestamp) ? timestamp : Date.now())
  if (!date) return null
  return {
    ...date,
    id: item.id,
    name: item.name || item.code,
    url: item.imageUrl,
    loadImageBlob: item.image ? () => readHomeSchemeImage(item.id) : undefined,
    fileSizeText: '--',
    note: item.note
  }
})

// 大图独立持有地址，翻页或关闭时释放，不与列表卡片共享生命周期。
watch(previewPhoto, (_next, previous) => {
  if (previous?.loadImageBlob) releasePhotoUrl(previous)
})
onBeforeUnmount(() => {
  editorImageGeneration++
  imageReading.value = false
  imageSelectionError.value = ''
  if (previewPhoto.value?.loadImageBlob) releasePhotoUrl(previewPhoto.value)
})

/** 统一映射操作错误并仅记录安全的诊断类别。 */
function operationError(error: unknown, operation: string): string {
  captureDiagnosticError(error, { module: 'home-schemes', action: operation })
  return describeHomeSchemeError(error, props.messages, operation)
}

async function loadLibrary() {
  return trackOperation(async () => {
    const generation = ++loadGeneration
    busy.value = true
    try {
      const result = await readHomeSchemeLibrary()
      if (generation !== loadGeneration) {
        releaseHomeSchemeUrls(result.schemes)
        return
      }
      releaseHomeSchemeUrls(schemes.value)
      schemes.value = result.schemes
      tags.value = result.tags
      selectedSchemeIds.value = new Set()
      closePreview()
      emit('countChange', result.schemes.length)
      if (filter.value.startsWith('tag:') && !tags.value.includes(filter.value.slice(4)))
        filter.value = 'all'
      return true
    } catch (error) {
      emit('status', operationError(error, 'loadLibrary'), 'error')
      return false
    } finally {
      if (generation === loadGeneration) busy.value = false
    }
  })
}

function clearParseTimer() {
  if (parseTimer !== undefined) window.clearTimeout(parseTimer)
  parseTimer = undefined
}

function cancelParse() {
  clearParseTimer()
  parseGeneration += 1
  parseController?.abort()
  parseController = null
  parsing.value = false
}

function applyParsed(result: HomeSchemeParseResult) {
  schemeType.value = result.templateType === 0 ? 'home' : 'combo'
  name.value = result.name
  version.value = result.version
  furnitureCount.value = result.furnitureCount
  server.value = result.server
  lastModifyTime.value = result.lastModifyTime
  coverImageUrl.value = result.coverImage
  parsedCode.value = result.code
}

function queueParse(rawCode: string) {
  cancelParse()
  const normalized = normalizeHomeSchemeCode(rawCode)
  if (normalized.length < 2 || normalized.length > MAX_HOME_SCHEME_CODE_LENGTH) return
  if (editing.value?.code === normalized) {
    schemeType.value = editing.value.schemeType
    version.value = editing.value.metadata.version
    furnitureCount.value = editing.value.metadata.furnitureCount
    server.value = editing.value.metadata.server
    lastModifyTime.value = editing.value.metadata.lastModifyTime
    coverImageUrl.value = editing.value.metadata.coverImageUrl
    parsedCode.value = normalized
    return
  }
  parseTimer = window.setTimeout(() => {
    void runParse(normalized)
  }, 450)
}

async function runParse(requestCode: string) {
  const generation = ++parseGeneration
  const controller = new AbortController()
  parseController = controller
  parsing.value = true
  try {
    const result = await parseHomeScheme(requestCode, controller.signal)
    if (generation !== parseGeneration || normalizeHomeSchemeCode(code.value) !== requestCode)
      return
    applyParsed(result)
    emit('status', props.messages.parseSucceeded, 'success')
  } catch (error) {
    if (controller.signal.aborted || generation !== parseGeneration) return
    captureDiagnosticError(error, { module: 'home-schemes', action: 'parse', stage: 'decode' })
    parsedCode.value = ''
    const message = describeHomeSchemeParseError(error, props.messages)
    emit('status', message, 'warning')
  } finally {
    if (generation === parseGeneration) parsing.value = false
  }
}

/** 初始化编辑器；本地封面单独读取，关闭或替换图片后丢弃晚到结果。 */
function resetEditor(item: HomeSchemeItem | null) {
  imageReading.value = false
  imageSelectionError.value = ''
  const imageRun = ++editorImageGeneration
  cancelParse()
  closeTagInput()
  editing.value = item
  code.value = item?.code ?? ''
  name.value = item?.name ?? ''
  schemeType.value = item?.schemeType ?? null
  version.value = item?.metadata.version ?? null
  furnitureCount.value = item?.metadata.furnitureCount ?? null
  server.value = item?.metadata.server ?? null
  lastModifyTime.value = item?.metadata.lastModifyTime ?? null
  coverImageUrl.value = item?.metadata.coverImageUrl ?? null
  note.value = item?.note ?? ''
  selectedTag.value = item?.tags[0] ?? ''
  imageFile.value = null
  localImageUrl.value = item?.image ? item.imageUrl : null
  removeLocalImage.value = false
  parsedCode.value = item?.code ?? ''
  previousActiveElement =
    document.activeElement instanceof HTMLElement ? document.activeElement : null
  editorVisible.value = true
  if (item?.image && !item.imageUrl) {
    void readHomeSchemeImage(item.id)
      .then((blob) => {
        if (
          imageRun === editorImageGeneration &&
          editorVisible.value &&
          editing.value === item &&
          !imageFile.value &&
          !removeLocalImage.value
        ) {
          localImageUrl.value = URL.createObjectURL(blob)
        }
      })
      .catch((error) => {
        if (imageRun === editorImageGeneration && editorVisible.value && editing.value === item)
          emit('status', operationError(error, 'loadEditorImage'), 'error')
      })
  }
  void nextTick(() => {
    // 打开时停留在面板，避免自动进入方案码输入框。
    if (editorVisible.value)
      document.querySelector<HTMLElement>('.home-scheme-editor')?.focus({ preventScroll: true })
  })
  if (!item) queueParse('')
}

function closeEditor() {
  if (isBusy.value) return
  finishEditorClose()
}

/** 用户关闭通过忙碌检查后或保存成功后执行，避免保存任务自身阻止关闭。 */
function finishEditorClose() {
  editorImageGeneration++
  cancelParse()
  closeTagInput()
  isDragging.value = false
  if (localImageUrl.value && localImageUrl.value !== editing.value?.imageUrl)
    URL.revokeObjectURL(localImageUrl.value)
  localImageUrl.value = null
  editorVisible.value = false
  if (pendingLibraryReload) {
    pendingLibraryReload = false
    void loadLibrary()
  }
  previousActiveElement?.focus()
  previousActiveElement = null
}

function onCodeInput(event: Event) {
  const input = event.target as HTMLInputElement
  code.value = input.value.replace(/\s/g, '').slice(0, MAX_HOME_SCHEME_CODE_LENGTH)
  if (input.value !== code.value) input.value = code.value
  if (normalizeHomeSchemeCode(code.value) !== parsedCode.value) parsedCode.value = ''
  queueParse(code.value)
}

// 预览元素本身加载失败也必须反馈，涵盖已失效的文件引用。
function handleEditorPreviewError() {
  if (!editorVisible.value) return
  captureDiagnosticError(new Error('Image preview failed'), {
    module: 'home-schemes',
    action: 'preview-image',
    stage: 'preview-element',
    code: 'IMAGE_PREVIEW_FAILED',
    context: { mimeType: imageFile.value?.type ?? null, sizeBytes: imageFile.value?.size ?? null }
  })
  imageSelectionError.value =
    props.language === 'en'
      ? 'Image preview failed. Please select again; this format may be unsupported.'
      : '图片预览失败，请重新选择；浏览器可能不支持该格式。'
  emit('status', imageSelectionError.value, 'error')
}
function selectImage(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  void setImageFile(file)
  input.value = ''
}

// 验证完成才替换旧图；关闭、删除或重选后忽略过期结果。
async function setImageFile(file: File) {
  if (isBusy.value) {
    return
  }
  const run = ++editorImageGeneration
  imageReading.value = true
  imageSelectionError.value = ''
  try {
    const selected = compact.value ? await snapshotImageFile(file) : file

    await validateSelectedImage(selected)
    if (!editorVisible.value || run !== editorImageGeneration) {
      return
    }
    if (localImageUrl.value && localImageUrl.value !== editing.value?.imageUrl)
      URL.revokeObjectURL(localImageUrl.value)
    imageFile.value = selected
    localImageUrl.value = URL.createObjectURL(selected)
    removeLocalImage.value = false
  } catch (error) {
    if (!editorVisible.value || run !== editorImageGeneration) return
    captureDiagnosticError(error, {
      module: 'home-schemes',
      action: 'select-image',
      stage: 'preview'
    })
    imageSelectionError.value =
      (props.language === 'en'
        ? 'Unable to read or preview image: '
        : '图片读取或预览失败，可能是格式不支持或文件损坏：') + String(error)
    emit('status', imageSelectionError.value, 'error')
  } finally {
    if (run === editorImageGeneration) imageReading.value = false
  }
}

function handleImageDrop(event: DragEvent) {
  isDragging.value = false
  const file = event.dataTransfer?.files[0]
  if (file) setImageFile(file)
}

function handlePaste(event: ClipboardEvent) {
  if (!editorVisible.value) return
  const image = [...(event.clipboardData?.files ?? [])].find((file) =>
    file.type.startsWith('image/')
  )
  if (image) {
    event.preventDefault()
    setImageFile(image)
  }
}

function removeLocalImageFile() {
  editorImageGeneration++
  imageReading.value = false
  imageSelectionError.value = ''
  if (localImageUrl.value && localImageUrl.value !== editing.value?.imageUrl)
    URL.revokeObjectURL(localImageUrl.value)
  imageFile.value = null
  localImageUrl.value = null
  removeLocalImage.value = true
}

function handleKeydown(event: KeyboardEvent) {
  if (!editorVisible.value) return
  const panel = document.querySelector<HTMLElement>('.home-scheme-editor')
  if (!panel) return
  if (event.key === 'Escape' && !isBusy.value) {
    if (tagInputVisible.value) closeTagInput()
    else closeEditor()
    return
  }
  if (event.key !== 'Tab') return
  const focusable = [
    ...panel.querySelectorAll<HTMLElement>('button, input, [href], [tabindex]:not([tabindex="-1"])')
  ].filter((element) => !element.hasAttribute('disabled'))
  if (!focusable.length) return
  const first = focusable[0]
  const last = focusable[focusable.length - 1]
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}

function handleEditorBackdropClick() {
  if (tagInputVisible.value) closeTagInput()
  else closeEditor()
}

async function save() {
  return trackOperation(async () => {
    if (isBusy.value || parsing.value || imageReading.value) return
    const normalizedCode = normalizeHomeSchemeCode(code.value)
    if (normalizedCode.length < 2 || normalizedCode.length > MAX_HOME_SCHEME_CODE_LENGTH) {
      emit('status', props.messages.invalidCode, 'warning')
      return
    }
    if (
      schemes.value.some((item) => item.code === normalizedCode && item.id !== editing.value?.id)
    ) {
      emit('status', props.messages.duplicateCode, 'warning')
      return
    }
    if (!name.value.trim()) {
      emit('status', props.messages.nameRequired, 'warning')
      return
    }
    if (!schemeType.value || parsedCode.value !== normalizedCode) {
      emit('status', props.messages.parseFailed, 'warning')
      return
    }
    busy.value = true
    try {
      const metadata = {
        version: version.value,
        furnitureCount: furnitureCount.value,
        server: server.value,
        lastModifyTime: lastModifyTime.value,
        coverImageUrl: coverImageUrl.value
      }
      const saved = await saveHomeScheme({
        item: editing.value ?? undefined,
        code: normalizedCode,
        name: name.value,
        schemeType: schemeType.value,
        tags: selectedTag.value ? [selectedTag.value] : [],
        note: note.value,
        metadata,
        imageFile: imageFile.value,
        removeImage: removeLocalImage.value
      })
      const next = schemes.value.filter((item) => item.id !== saved.id)
      const previous = schemes.value.find((item) => item.id === saved.id)
      if (previous) releaseHomeSchemeUrls([previous])
      schemes.value = [saved, ...next].sort((left, right) =>
        right.createdAt.localeCompare(left.createdAt)
      )
      emit('countChange', schemes.value.length)
      finishEditorClose()
      emit('status', props.messages.saveSucceeded, 'success')
    } catch (error) {
      const duplicate = error instanceof Error && error.message === 'home_scheme_code_duplicate'
      const conflict =
        error instanceof Error &&
        ['home_scheme_record_changed', 'home_scheme_record_missing'].includes(error.message)
      // 保留当前输入，关闭编辑器后再刷新，避免冲突提示本身丢掉用户尚未保存的修改。
      if (conflict) pendingLibraryReload = true
      emit('status', operationError(error, 'save'), duplicate || conflict ? 'warning' : 'error')
    } finally {
      busy.value = false
    }
  })
}

async function removeScheme(item: HomeSchemeItem) {
  return trackOperation(async () => {
    if (isBusy.value || !(await props.confirmAction(props.messages.deleteConfirm))) return
    busy.value = true
    try {
      await deleteHomeScheme(item)
      releaseHomeSchemeUrls([item])
      schemes.value = schemes.value.filter((entry) => entry.id !== item.id)
      selectedSchemeIds.value = new Set([...selectedSchemeIds.value].filter((id) => id !== item.id))
      if (previewScheme.value?.id === item.id) closePreview()
      emit('countChange', schemes.value.length)
      emit('status', props.messages.deleteSucceeded, 'success')
    } catch (error) {
      emit('status', operationError(error, 'removeScheme'), 'error')
    } finally {
      busy.value = false
    }
  })
}

async function copyCode(item: HomeSchemeItem) {
  if (await copyTextToClipboard(item.code))
    emit('status', props.copyMessages?.copySucceeded ?? props.messages.copySucceeded, 'success')
  else
    emit(
      'status',
      props.copyMessages?.copyFailed(item.code) ?? props.messages.copyFailed(item.code),
      'warning'
    )
}

function toggleScheme(id: string) {
  if (isBusy.value) return
  const next = new Set(selectedSchemeIds.value)
  next.has(id) ? next.delete(id) : next.add(id)
  selectedSchemeIds.value = next
}

function handleSchemeKeydown(event: KeyboardEvent, id: string) {
  if (event.target !== event.currentTarget || event.key !== 'Enter') return
  event.preventDefault()
  toggleScheme(id)
}

function toggleAllSchemes() {
  const ids = visibleSchemes.value.map((item) => item.id)
  selectedSchemeIds.value = allSchemesSelected.value
    ? new Set([...selectedSchemeIds.value].filter((id) => !ids.includes(id)))
    : new Set([...selectedSchemeIds.value, ...ids])
}

function clearSchemeSelection() {
  selectedSchemeIds.value = new Set()
}

function changeSchemeFilter(nextFilter: typeof filter.value) {
  clearSchemeSelection()
  filter.value = nextFilter
}

/** 本地图片即使尚未读取，也允许进入按需加载的大图预览。 */
function openPreview(item: HomeSchemeItem) {
  if (isBusy.value || (!item.image && !item.imageUrl)) return
  previewScheme.value = item
}

function closePreview() {
  previewScheme.value = null
}

function showPreviousPreview() {
  if (hasPreviousPreview.value) previewScheme.value = visibleSchemes.value[previewIndex.value - 1]
}

function showNextPreview() {
  if (hasNextPreview.value) previewScheme.value = visibleSchemes.value[previewIndex.value + 1]
}

function editPreviewScheme() {
  const item = previewScheme.value
  closePreview()
  if (item) resetEditor(item)
}

/** 固定当前可见的已选记录，确认期间筛选变化不能扩大删除范围。 */
async function deleteSelectedSchemes() {
  return trackOperation(async () => {
    if (isBusy.value || !selectedSchemeCount.value) return
    const selected = [...selectedSchemes.value]
    busy.value = true
    const deletedIds = new Set<string>()
    try {
      if (!(await props.confirmAction(props.messages.deleteSelectedConfirm(selected.length))))
        return
      for (const item of selected) {
        await deleteHomeScheme(item)
        releaseHomeSchemeUrls([item])
        deletedIds.add(item.id)
      }
      emit('status', props.messages.deleteSucceeded, 'success')
    } catch (error) {
      emit('status', operationError(error, 'deleteSelectedSchemes'), 'error')
    } finally {
      // 部分删除失败时也同步已成功的记录，避免页面继续展示已不存在的数据。
      if (deletedIds.size) {
        schemes.value = schemes.value.filter((item) => !deletedIds.has(item.id))
        selectedSchemeIds.value = new Set(
          [...selectedSchemeIds.value].filter((id) => !deletedIds.has(id))
        )
        if (previewScheme.value && deletedIds.has(previewScheme.value.id)) closePreview()
        emit('countChange', schemes.value.length)
      }
      busy.value = false
    }
  })
}

async function addTag() {
  return trackOperation(async () => {
    const tag = normalizeHomeSchemeTag(tagInput.value)
    if (
      !tag ||
      [...tag].length > MAX_HOME_SCHEME_TAG_LENGTH ||
      tags.value.includes(tag) ||
      tags.value.length >= MAX_HOME_SCHEME_TAGS
    )
      return
    const owner = tagInputOwner.value
    busy.value = true
    try {
      tags.value = await addHomeSchemeTag(tag)
      homeSidebarRef.value?.closeTagInput()
      if (owner === 'editor') selectedTag.value = tag
      closeTagInput()
    } catch (error) {
      emit('status', operationError(error, 'addTag'), 'error')
    } finally {
      busy.value = false
    }
  })
}

function updateTagEditorPosition() {
  const toggle = editorTagToggleRef.value
  if (!toggle) return
  const rect = toggle.getBoundingClientRect()
  const width = Math.min(520, window.innerWidth - 24)
  tagEditorPosition.value = {
    top: `${Math.max((window.visualViewport?.offsetTop ?? 0) + 12, Math.min(rect.top - 3, (window.visualViewport?.offsetTop ?? 0) + (window.visualViewport?.height ?? window.innerHeight) - 70))}px`,
    left: `${Math.max(12, Math.min(rect.right + 8, window.innerWidth - width - 12))}px`
  }
}
const handleTagEditorViewportChange = () => updateTagEditorPosition()

function toggleEditorTagInput() {
  tagInputOwner.value = 'editor'
  tagInputVisible.value = !tagInputVisible.value
  if (tagInputVisible.value)
    void nextTick(() => {
      updateTagEditorPosition()
      tagInputRef.value?.focus()
    })
}

function closeTagInput() {
  tagInputVisible.value = false
  tagInput.value = ''
  tagInputOwner.value = null
}

function handleTagPointerDown(event: PointerEvent) {
  if (!tagInputVisible.value || !(event.target instanceof Node)) return
  if (
    editorTagToggleRef.value?.contains(event.target) ||
    tagEditorRef.value?.contains(event.target)
  )
    return
  closeTagInput()
}

async function removeTag(tag: string) {
  return trackOperation(async () => {
    if (isBusy.value) return
    const usedCount = schemes.value.filter((scheme) => scheme.tags.includes(tag)).length
    if (usedCount) {
      const confirmed = await props.confirmAction(
        props.messages.deleteTagMessage(tag, usedCount),
        props.messages.deleteTagTitle,
        props.messages.deleteTagTitle
      )
      if (!confirmed) return
    }
    busy.value = true
    try {
      const result = await deleteHomeSchemeTag(tag)
      tags.value = result.tags
      // 同步事务写入的完整记录，后续保存使用最新的冲突检测基线。
      const updated = new Map(result.updatedRecords.map((record) => [record.id, record]))
      schemes.value = schemes.value.map((item) => ({ ...item, ...updated.get(item.id) }))
      if (filter.value === `tag:${tag}`) filter.value = 'all'
      emit('status', props.messages.tagDeleted, 'success')
    } catch (error) {
      emit('status', operationError(error, 'removeTag'), 'error')
    } finally {
      busy.value = false
    }
  })
}

/** 家园与搭配、相机收藏共用触摸排序组件，只在存储层应用新顺序。 */
async function reorderTags(next: string[]) {
  return trackOperation(async () => {
    if (isBusy.value) return
    try {
      tags.value = await reorderHomeSchemeTags(tags.value, next)
    } catch (error) {
      emit('status', operationError(error, 'reorderTags'), 'error')
    }
  })
}

async function importBackup(event: Event) {
  return trackOperation(async () => {
    const input = event.target as HTMLInputElement
    const file = input.files?.[0]
    input.value = ''
    if (!file || isBusy.value) return
    busy.value = true
    try {
      const result = await importHomeSchemeBackup(file)
      reportPartialFailure('home-schemes', 'import-backup', result.failedCount, {
        savedCount: result.addedCount
      })
      releaseHomeSchemeUrls(schemes.value)
      schemes.value = result.schemes
      tags.value = result.tags
      emit('countChange', result.schemes.length)
      emit(
        'status',
        props.messages.importSucceeded(
          result.addedCount,
          result.duplicateCount,
          result.failedCount
        ),
        result.failedCount ? 'warning' : 'success'
      )
    } catch (error) {
      emit('status', operationError(error, 'importBackup'), 'error')
    } finally {
      busy.value = false
    }
  })
}

async function exportBackup() {
  return trackOperation(async () => {
    if (isBusy.value || (!schemes.value.length && !tags.value.length)) return
    busy.value = true
    try {
      const result = await exportHomeSchemeBackup()
      emit(
        'status',
        props.messages.exportSucceeded(result.count, result.fileNames.join('、')),
        'success',
        takeDownloadFiles('home')
      )
    } catch (error) {
      emit('status', operationError(error, 'exportBackup'), 'error')
      takeDownloadFiles('home')
    } finally {
      busy.value = false
    }
  })
}

// 编辑期间保留草稿；关闭编辑器后沿用 pendingLibraryReload 执行重载。
function reload() {
  if (editorVisible.value) {
    pendingLibraryReload = true
    return 'deferred' as const
  }
  return loadLibrary()
}
defineExpose({ reload })
watch(
  () => props.libraryRevision,
  () => {
    void reload()
  },
  { immediate: true }
)
window.addEventListener('paste', handlePaste)
window.addEventListener('keydown', handleKeydown)
document.addEventListener('pointerdown', handleTagPointerDown)
window.addEventListener('resize', handleTagEditorViewportChange)
window.addEventListener('scroll', handleTagEditorViewportChange, true)
onBeforeUnmount(() => {
  editorImageGeneration++
  loadGeneration += 1
  cancelParse()
  releaseHomeSchemeUrls(schemes.value)
  if (localImageUrl.value && localImageUrl.value !== editing.value?.imageUrl)
    URL.revokeObjectURL(localImageUrl.value)
  window.removeEventListener('paste', handlePaste)
  window.removeEventListener('keydown', handleKeydown)
  document.removeEventListener('pointerdown', handleTagPointerDown)
  window.removeEventListener('resize', handleTagEditorViewportChange)
  window.visualViewport?.removeEventListener('resize', handleTagEditorViewportChange)
  window.removeEventListener('scroll', handleTagEditorViewportChange, true)
})
/** 接收标签输入后沿用标签创建流程，避免模板内多语句歧义。 */
function handleAddTag(value: string) {
  tagInput.value = value
  void addTag()
}
</script>

<template>
  <section class="home-scheme-workspace">
    <Teleport to="#album-sidebar-column">
      <OutfitSidebar
        ref="homeSidebarRef"
        :language="language"
        :outfits="schemes"
        :tags="tags"
        :active-filter="filter"
        :picker-open="filtersOpen"
        :disabled="isBusy"
        :messages="localeMessages[language ?? 'zh'].outfit"
        :show-pending="false"
        @change-filter="changeSchemeFilter($event as typeof filter)"
        @filter-selected="$emit('closeFilters')"
        @add-tag="handleAddTag"
        @delete-tag="removeTag"
        @reorder-tags="reorderTags"
      >
        <template #filters="{ selectFilter }"
          ><button
            v-for="item in [
              { key: 'all', label: messages.all, count: schemes.length },
              {
                key: 'home',
                label: messages.homeType,
                count: schemes.filter((s) => s.schemeType === 'home').length
              },
              {
                key: 'combo',
                label: messages.comboType,
                count: schemes.filter((s) => s.schemeType === 'combo').length
              },
              {
                key: 'uncategorized',
                label: messages.uncategorized,
                count: schemes.filter((s) => !s.tags.length).length
              }
            ]"
            :key="item.key"
            type="button"
            class="outfit-filter-button"
            :class="{ active: filter === item.key }"
            :disabled="isBusy"
            @click="selectFilter(item.key)"
            ><span>{{ item.label }}</span
            ><small>{{ item.count }}</small></button
          ></template
        >
      </OutfitSidebar>
    </Teleport>

    <Teleport to="body"
      ><Transition name="outfit-tag-editor"
        ><form
          v-if="tagInputVisible"
          ref="tagEditorRef"
          class="outfit-tag-editor outfit-tag-editor-popover"
          :style="tagEditorPosition"
          @submit.prevent="addTag"
          ><input
            ref="tagInputRef"
            v-model="tagInput"
            :maxlength="MAX_HOME_SCHEME_TAG_LENGTH"
            :placeholder="messages.tagPlaceholder"
            :disabled="isBusy"
            autocomplete="off"
          /><button type="submit" :disabled="isBusy">{{ messages.addTagConfirm }}</button></form
        ></Transition
      ></Teleport
    >
    <div class="home-scheme-main">
      <header class="gallery-header is-outfit-header home-scheme-header"
        ><div class="home-scheme-heading"
          ><div class="home-scheme-title-row"
            ><h2>{{ messages.title }}</h2
            ><strong class="home-scheme-count"
              >{{ visibleSchemes.length }} / {{ schemes.length }}</strong
            ></div
          ></div
        ><CollectionActions
          mobile-target="#home-tag-actions"
          class="home-scheme-header-actions"
          :label="(language ?? 'zh') === 'zh' ? '家园操作' : 'Home actions'"
          ><button
            class="primary-button"
            type="button"
            :aria-label="messages.add"
            :title="messages.add"
            :disabled="isBusy"
            @click="resetEditor(null)"
            ><Plus :size="15" aria-hidden="true" /><span class="collection-action-label">{{
              messages.add
            }}</span></button
          ><template #secondary
            ><input
              ref="backupInput"
              class="visually-hidden"
              type="file"
              accept=".zip,application/zip"
              @change="importBackup"
            /><button type="button" :disabled="isBusy" @click="backupInput?.click()"
              ><Download :size="15" aria-hidden="true" />{{
                busy ? messages.importing : messages.importData
              }}</button
            ><button
              type="button"
              :disabled="isBusy || (!schemes.length && !tags.length)"
              @click="exportBackup"
              ><Upload :size="15" aria-hidden="true" />{{
                busy ? messages.exporting : messages.exportData
              }}</button
            ></template
          ></CollectionActions
        ></header
      >
      <CollectionFilterBar
        tag-picker
        actions-id="home-tag-actions"
        :entries="[
          { key: 'all', label: messages.all },
          { key: 'home', label: messages.homeType },
          { key: 'combo', label: messages.comboType },
          { key: 'uncategorized', label: messages.uncategorized },
          ...tags.map((tag) => ({ key: 'tag:' + tag, label: tag }))
        ]"
        :active="filter"
        :count="visibleSchemes.length"
        :language="language ?? 'zh'"
        :disabled="isBusy"
        @change="changeSchemeFilter($event as typeof filter)"
        @clear="changeSchemeFilter('all')"
        @open="$emit('openFilters')"
      />
      <div v-if="!visibleSchemes.length" class="empty-album inline-empty home-scheme-empty"
        ><ImagePlus :size="30" aria-hidden="true" /><h2>{{ messages.emptyTitle }}</h2
        ><p>{{ messages.emptyDescription }}</p
        ><MobileEmptyScreenshot v-if="!schemes.length" page="home" :language="language"
      /></div>
      <div
        v-else
        class="photo-grid-wrap outfit-grid-wrap home-scheme-grid-wrap"
        :class="[`mode-${thumbnailMode}`, `thumbnail-size-${thumbnailSize ?? 'medium'}`]"
      >
        <div class="photo-grid outfit-grid">
          <article
            v-for="item in visibleSchemes"
            :key="item.id"
            class="photo-card outfit-card home-scheme-card"
            :class="{ selected: selectedSchemeIds.has(item.id) }"
            :aria-label="item.name || item.code"
            :aria-checked="selectedSchemeIds.has(item.id)"
            role="checkbox"
            tabindex="0"
            @click="toggleScheme(item.id)"
            @dblclick.stop="openPreview(item)"
            @keydown="handleSchemeKeydown($event, item.id)"
          >
            <div class="photo-frame home-scheme-card-image">
              <StoredImage
                v-if="item.image"
                :source-key="`${item.id}:${item.updatedAt}`"
                :load="() => readHomeSchemeImage(item.id)"
                :alt="item.name || item.code"
              />
              <img v-else-if="item.imageUrl" :src="item.imageUrl" alt="" loading="lazy" />
              <div v-else class="scheme-card-no-image"
                ><ImagePlus :size="22" aria-hidden="true"
              /></div>
              <span class="selected-badge"><Check :size="15" aria-hidden="true" /></span>
              <button
                class="outfit-card-delete home-scheme-card-delete desktop-only"
                type="button"
                :title="messages.delete"
                :aria-label="messages.delete"
                :disabled="isBusy"
                @click.stop="removeScheme(item)"
                ><Trash2 :size="16" aria-hidden="true"
              /></button>
            </div>
            <div class="home-scheme-card-details">
              <div class="home-scheme-name-tag">
                <h3
                  :title="
                    (item.schemeType === 'home' ? messages.homeType : messages.comboType) +
                    '-' +
                    (item.name || messages.untitled)
                  "
                  >{{ item.schemeType === 'home' ? messages.homeType : messages.comboType }}-{{
                    item.name || messages.untitled
                  }}</h3
                >
                <span
                  v-if="item.tags[0]"
                  class="home-scheme-card-tag desktop-only"
                  :title="item.tags.join('、')"
                  ><span>{{ item.tags[0] }}</span
                  ><small v-if="item.tags.length > 1" class="mobile-only"
                    >+{{ item.tags.length - 1 }}</small
                  ></span
                >
              </div>
              <div v-if="item.metadata.furnitureCount !== null" class="home-scheme-card-meta">
                <span>{{ item.metadata.furnitureCount }} {{ messages.furnitureCount }}</span>
              </div>
            </div>
            <div class="outfit-card-footer home-scheme-card-footer">
              <!-- 手机标签放在方案码右侧；电脑端仍在标题旁显示标签。 -->
              <div class="home-scheme-code-tag">
                <span class="outfit-code" :title="item.code">{{ item.code }}</span>
                <span
                  v-if="item.tags[0]"
                  class="home-scheme-card-tag mobile-only"
                  :title="item.tags.join('、')"
                  ><span>{{ item.tags[0] }}</span
                  ><small v-if="item.tags.length > 1">+{{ item.tags.length - 1 }}</small></span
                >
              </div>
              <div class="outfit-card-actions" @click.stop @dblclick.stop>
                <button
                  type="button"
                  :title="messages.copy"
                  :aria-label="messages.copy"
                  :disabled="isBusy"
                  @click.stop="copyCode(item)"
                  ><Copy :size="15" aria-hidden="true"
                /></button>
                <button
                  type="button"
                  :title="messages.edit"
                  :aria-label="messages.edit"
                  :disabled="isBusy"
                  @click.stop="resetEditor(item)"
                  ><Edit3 :size="15" aria-hidden="true"
                /></button>
                <button
                  class="mobile-only"
                  type="button"
                  :title="messages.delete"
                  :aria-label="messages.delete"
                  :disabled="isBusy"
                  @click.stop="removeScheme(item)"
                  ><Trash2 :size="18" aria-hidden="true"
                /></button>
              </div>
            </div>
          </article>
        </div>
      </div>
    </div>

    <SelectionBar
      mode="outfit"
      :selected-count="selectedSchemeCount"
      :all-selected="allSchemesSelected"
      :all-items-selected="allSchemesSelected"
      :all-selected-favorited="false"
      :is-busy="isBusy"
      :messages="selectionMessages"
      @toggle-all="toggleAllSchemes"
      @delete="deleteSelectedSchemes"
      @cancel="clearSchemeSelection"
    />

    <Lightbox
      :photo="previewPhoto"
      :has-previous="hasPreviousPreview"
      :has-next="hasNextPreview"
      :is-deleting="isBusy"
      :is-favorite="false"
      :keyboard-enabled="!editorVisible && !tagInputVisible"
      mode="home"
      :home-scheme="previewScheme"
      :home-messages="messages"
      :messages="lightboxMessages"
      :date-messages="dateMessages"
      @close="closePreview"
      @previous="showPreviousPreview"
      @next="showNextPreview"
      @copy-home-scheme="previewScheme && copyCode(previewScheme)"
      @edit-home-scheme="editPreviewScheme"
    />

    <Teleport to="body">
      <Transition name="confirm-dialog">
        <div
          v-if="editorVisible"
          class="outfit-editor home-scheme-editor-overlay"
          role="dialog"
          aria-modal="true"
          :aria-label="editing ? messages.edit : messages.add"
          @click.self="handleEditorBackdropClick"
        >
          <section class="outfit-editor-panel home-scheme-editor" tabindex="-1">
            <header>
              <h2>{{ editing ? messages.edit : messages.add }}</h2>
              <button
                type="button"
                :title="messages.cancel"
                :aria-label="messages.cancel"
                :disabled="isBusy"
                @click="closeEditor"
                ><X :size="19" aria-hidden="true"
              /></button>
            </header>

            <div class="outfit-editor-content home-scheme-editor-body">
              <div class="outfit-image-column">
                <label>{{ messages.image }}</label>
                <button
                  class="outfit-image-dropzone home-scheme-image-dropzone"
                  :class="{ 'is-dragging': isDragging, 'has-preview': previewUrl }"
                  type="button"
                  :disabled="isBusy"
                  @click="fileInput?.click()"
                  @dragenter.prevent="isDragging = true"
                  @dragover.prevent="isDragging = true"
                  @dragleave.prevent="isDragging = false"
                  @drop.prevent="handleImageDrop"
                >
                  <img
                    v-if="previewUrl"
                    :src="previewUrl"
                    alt=""
                    @error="handleEditorPreviewError"
                  />
                  <span v-else class="outfit-image-prompt"
                    ><ImagePlus :size="30" aria-hidden="true" />{{ messages.imageHint }}</span
                  >
                  <span v-if="previewUrl" class="outfit-replace-image"
                    ><Upload :size="15" aria-hidden="true" />{{ messages.chooseImage }}</span
                  >
                </button>
                <input
                  ref="fileInput"
                  class="visually-hidden"
                  type="file"
                  accept="image/*"
                  @change="selectImage"
                />
                <button
                  v-if="previewUrl && localImageUrl"
                  class="home-scheme-remove-image"
                  type="button"
                  :disabled="isBusy"
                  @click="removeLocalImageFile"
                  ><X :size="14" aria-hidden="true" />{{ messages.removeImage }}</button
                >
                <table class="home-scheme-metadata" :aria-label="messages.metadataAria">
                  <tbody>
                    <tr>
                      <td
                        ><span>{{ messages.type }}</span
                        ><strong>{{
                          schemeType === 'home'
                            ? messages.homeType
                            : schemeType === 'combo'
                              ? messages.comboType
                              : messages.pendingType
                        }}</strong></td
                      >
                      <td
                        ><span>{{ messages.version }}</span
                        ><strong>{{ version || '—' }}</strong></td
                      >
                      <td
                        ><span>{{ messages.furnitureCount }}</span
                        ><strong>{{ furnitureCount ?? '—' }}</strong></td
                      >
                    </tr>
                  </tbody>
                </table>
              </div>

              <div class="outfit-fields home-scheme-fields">
                <label for="home-scheme-code">{{ messages.code }}</label>
                <input
                  id="home-scheme-code"
                  :value="code"
                  :maxlength="MAX_HOME_SCHEME_CODE_LENGTH"
                  :placeholder="messages.codePlaceholder"
                  autocomplete="off"
                  :disabled="isBusy"
                  @input="onCodeInput"
                />
                <small v-if="parsing" class="home-scheme-parse-state">{{
                  messages.parsePending
                }}</small>
                <label for="home-scheme-name">{{ messages.name }}</label>
                <input
                  id="home-scheme-name"
                  v-model="name"
                  :placeholder="messages.namePlaceholder"
                  :disabled="isBusy"
                />
                <label for="home-scheme-note">{{ messages.note }}</label>
                <input
                  id="home-scheme-note"
                  v-model="note"
                  :maxlength="MAX_HOME_SCHEME_NOTE_LENGTH"
                  :placeholder="messages.notePlaceholder"
                  :disabled="isBusy"
                />
                <fieldset>
                  <legend>{{ messages.tagsTitle }}</legend>
                  <div class="outfit-tag-choices">
                    <button
                      v-for="tag in tags"
                      :key="tag"
                      type="button"
                      :class="{ active: selectedTag === tag }"
                      :aria-pressed="selectedTag === tag"
                      :disabled="isBusy"
                      @click="selectedTag = selectedTag === tag ? '' : tag"
                      >{{ tag }}</button
                    >
                    <button
                      ref="editorTagToggleRef"
                      class="outfit-editor-add-tag"
                      type="button"
                      :title="messages.addTag"
                      :aria-label="messages.addTag"
                      :disabled="isBusy || tags.length >= MAX_HOME_SCHEME_TAGS"
                      @click="tagInputVisible ? closeTagInput() : toggleEditorTagInput()"
                    >
                      <Transition name="tag-toggle-icon" mode="out-in"
                        ><X v-if="tagInputVisible" key="close" :size="15" aria-hidden="true" /><Plus
                          v-else
                          key="open"
                          :size="15"
                          aria-hidden="true"
                      /></Transition>
                    </button>
                    <p v-if="!tags.length">{{ messages.uncategorized }}</p>
                  </div>
                </fieldset>
              </div>
            </div>

            <p v-if="imageReading" role="status">{{
              language === 'en' ? 'Reading image…' : '正在读取图片…'
            }}</p>
            <p
              v-if="imageSelectionError"
              role="alert"
              style="white-space: pre-wrap; overflow-wrap: anywhere; user-select: text"
              >{{ imageSelectionError }}</p
            >
            <footer>
              <button
                class="confirm-dialog-button ghost"
                type="button"
                :disabled="isBusy"
                @click="closeEditor"
                >{{ messages.cancel }}</button
              >
              <button
                class="confirm-dialog-button primary"
                type="button"
                :disabled="isBusy || imageReading || parsing"
                @click="save"
                >{{ busy ? messages.saving : messages.confirm }}</button
              >
            </footer>
          </section>
        </div>
      </Transition>
    </Teleport>
  </section>
</template>

<style scoped>
.home-scheme-workspace {
  min-width: 0;
  min-height: 100%;
}
.home-scheme-main {
  min-width: 0;
  padding: 0 0 28px;
}
.home-scheme-heading {
  min-width: 0;
}
.home-scheme-title-row {
  display: flex;
  min-height: 28px;
  align-items: center;
  gap: 14px;
  min-width: 0;
}
.home-scheme-count {
  color: var(--muted);
  font-size: 16px;
  line-height: 1;
  white-space: nowrap;
}
.home-scheme-empty {
  margin-top: 14px;
}
.home-scheme-card-image {
  border-radius: 12px;
}
.home-scheme-card-image > img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.home-scheme-card-delete {
  right: 8px;
}
.home-scheme-card-details {
  min-width: 0;
  padding: 8px 1px 0;
}
.home-scheme-name-tag {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 10px;
  min-width: 0;
}
.home-scheme-card-details h3 {
  flex: 1 1 auto;
  min-width: 0;
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--heading);
  font-size: 13px;
  line-height: 1.4;
}
.home-scheme-card-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 8px;
  min-height: 20px;
  margin-top: 4px;
  color: var(--muted);
  font-size: 11px;
  overflow-wrap: anywhere;
}
.home-scheme-code-tag {
  display: contents;
}
.home-scheme-card-footer {
  min-height: 38px;
  padding-top: 5px;
}
.home-scheme-card-tag {
  flex-shrink: 0;
  min-width: 0;
  box-sizing: border-box;
  max-width: 50%;
  padding: 3px 7px;
  border-radius: 7px;
  background: color-mix(in srgb, var(--pink-deep) 10%, var(--surface-strong));
  color: var(--pink-deep);
  font-size: 10px;
  white-space: nowrap;
}
@supports not (color: color-mix(in srgb, black, white)) {
  .home-scheme-card-tag {
    background: rgba(249.6, 242.7, 242.9, 1);
  }
  :where(:root[data-theme='dark']) .home-scheme-card-tag {
    background: rgba(48.2, 41.9, 45.7, 1);
  }
}
/* 标签在双端都限制一行，桌面也允许内部文本收缩并显示省略号。 */
.home-scheme-card-tag > span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.home-scheme-editor {
  width: min(820px, 100%);
}
.home-scheme-image-dropzone {
  aspect-ratio: 16/9;
}

.home-scheme-metadata {
  width: 100%;
  table-layout: fixed;
  border-collapse: separate;
  border-spacing: 7px 0;
  margin: 14px -7px 0;
  color: var(--muted);
  font-size: 12px;
}
.home-scheme-metadata td {
  width: 33.333%;
  padding: 10px 11px;
  border: 1px solid var(--surface-accent-border);
  border-radius: 11px;
  background: var(--surface-accent-subtle);
  vertical-align: top;
}
@supports not (color: color-mix(in srgb, black, white)) {
  .home-scheme-metadata td {
    border-radius: 11px;
  }
  :where(:root[data-theme='dark']) .home-scheme-metadata td {
    border-radius: 11px;
  }
}
.home-scheme-metadata span {
  display: block;
  margin-bottom: 5px;
  color: var(--muted);
  font-size: 11px;
  font-weight: 800;
  line-height: 1.2;
}
.home-scheme-metadata strong {
  display: block;
  overflow: hidden;
  color: var(--heading);
  font-size: 15px;
  line-height: 1.25;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.home-scheme-fields > small {
  display: block;
  margin: -15px 0 14px;
  color: var(--muted);
  font-size: 11px;
}
.home-scheme-fields fieldset {
  min-width: 0;
  margin: 0;
  padding: 0;
  border: 0;
}
.home-scheme-fields legend {
  display: block;
  margin-bottom: 7px;
  color: var(--heading);
  font-size: 12px;
  font-weight: 800;
}
.home-scheme-fields fieldset p {
  color: var(--muted);
  font-size: 12px;
}
.home-scheme-remove-image {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 34px;
  margin-top: 8px;
  padding: 6px 11px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--surface-strong);
  color: var(--muted);
  font-size: 12px;
  font-weight: 700;
  transition:
    color var(--motion-fast) ease,
    border-color var(--motion-fast) ease,
    background var(--motion-fast) ease,
    transform var(--motion-fast) ease;
}
.home-scheme-remove-image:hover:not(:disabled) {
  border-color: var(--pink-deep);
  background: var(--interactive-hover-bg);
  color: var(--pink-deep);
  transform: translateY(-1px);
}

/* 手机家具数量不预留额外行高，方案码紧随信息区显示。 */
@media (max-width: 899px) {
  .home-scheme-card-meta {
    min-height: 0;
    line-height: 1.4;
  }
  .home-scheme-card-footer {
    padding-top: 2px;
  }
}
@media (max-width: 850px) {
  .home-scheme-workspace {
    min-height: 0;
  }
  .home-scheme-editor-body {
    grid-template-columns: 1fr;
  }
  .home-scheme-image-dropzone {
    max-width: 560px;
  }
}
@media (max-width: 520px) {
  .home-scheme-card-details h3 {
    font-size: 12px;
  }
  .home-scheme-header-actions > button {
    justify-content: center;
    white-space: normal;
  }
  .home-scheme-metadata {
    border-spacing: 5px 0;
    margin-right: -5px;
    margin-left: -5px;
  }
  .home-scheme-metadata td {
    padding: 9px 8px;
  }
  .home-scheme-metadata strong {
    font-size: 13px;
  }
}
</style>
