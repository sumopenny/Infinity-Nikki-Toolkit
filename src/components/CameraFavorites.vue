<script setup lang="ts">
import { backupDeleteWarning } from '../utils/directory-backup/engine'
import { vCardReveal } from '../utils/cardReveal'
import {
  readPhotoFile,
  isAlbumPhoto,
  datePartsFromTimestamp,
  type PhotoDisplayItem
} from '../utils/photoGrouping'
import { releasePhotoUrl } from '../utils/file-system/photoUrl'
import Lightbox from './Lightbox.vue'

import { takeDownloadFiles } from '../utils/backup/downloadFallback'
import { downloadBackupBlob } from '../utils/backup/zipBackup'
import { reportError as captureDiagnosticError } from '../utils/errorReporting/errorReporter'
import { validateSelectedImage } from '../utils/imageSelection'
import { createUuid } from '../utils/uuid'
import { useModuleOperation } from '../composables/useOperationCoordinator'
const trackOperation = useModuleOperation('camera')
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, toRef, watch } from 'vue'
import {
  Camera,
  Check,
  Copy,
  Download,
  Edit3,
  ImagePlus,
  Plus,
  ScanSearch,
  Trash2,
  Upload,
  X
} from 'lucide-vue-next'
import { messages as localeMessages, type Language } from '../i18n'
import CollectionFilterBar from './CollectionFilterBar.vue'
import CollectionActions from './CollectionActions.vue'
import StoredImage from './StoredImage.vue'
import MobileEmptyScreenshot from './MobileEmptyScreenshot.vue'
import SelectionBar from './SelectionBar.vue'
import OutfitSidebar, { type OutfitFilter } from './OutfitSidebar.vue'
import {
  deleteCameraFavoriteTag,
  isValidNewCameraFavoriteTag,
  MAX_CAMERA_FAVORITE_TAG_LENGTH,
  saveCameraFavoriteTags
} from '../utils/photo-params/favorites'
import { favoriteResources } from '../utils/photo-params/favoriteResources'
import type { PhotoParamsMessages } from '../i18n/messages/photoParams'
import type { PhotoParamsResult } from '../utils/photo-params/types'
import type { ThumbnailSize } from '../types/thumbnail'
import type { PhotoItem } from '../utils/photoGrouping'
import { usePhotoParams } from '../composables/usePhotoParams'
import { useBodyScrollLock } from '../utils/bodyScrollLock'
import { copyTextToClipboard } from '../utils/clipboard'
import { useCompactLayout } from '../composables/useCompactLayout'
import { snapshotImageFile } from '../utils/image'
import { convertImageForStorage } from '../utils/storedImage'
import {
  applyCameraImport,
  cloneFavorite,
  coverMetadata,
  deleteCameraFavorite,
  deleteCameraFavorites,
  DuplicateCameraCodeError,
  normalizeCameraCode,
  planCameraImport,
  readCameraFavorites,
  readCameraFavoriteCover,
  saveCameraFavorite,
  type CameraFavorite,
  type FavoriteLibrary,
  type FavoriteSource,
  type ImportPlan
} from '../utils/photo-params/favorites'

import PhotoParamsDialog from './PhotoParamsDialog.vue'
import CameraImportConflictDialog from './CameraImportConflictDialog.vue'

const props = defineProps<{
  active: boolean
  thumbnailSize?: ThumbnailSize
  disabled?: boolean
  sidebarTarget?: string
  actionsTarget?: string
  filtersOpen?: boolean
  language: Language
  messages: PhotoParamsMessages
  searchQuery: string
  confirmAction: (message: string, title?: string, confirmLabel?: string) => Promise<boolean>
}>()
const emit = defineEmits<{
  openFilters: []
  closeFilters: []
  codesChange: [codes: string[]]
  modalChange: [visible: boolean]
  status: [message: string, tone: 'success' | 'error' | 'warning' | 'info', downloadFiles?: File[]]
}>()
const t = (zh: string, en: string) => (props.language === 'zh' ? zh : en)
const library = shallowRef<FavoriteLibrary>({ records: [], covers: new Map() })
const localBusy = ref(false)
const busy = computed({
  get: () => Boolean(props.disabled) || localBusy.value,
  set: (value) => {
    localBusy.value = value
  }
})
const loadError = ref('')
const editor = ref(false)
const editing = shallowRef<CameraFavorite | null>(null)
const code = ref('')
const name = ref('')
const selectedTag = ref('')
const source = ref<FavoriteSource>('manual')
const parsed = shallowRef<PhotoParamsResult | null>(null)
const parsedCode = ref('')
const parsing = ref(false)
const error = ref('')
const cover = shallowRef<Blob | null>(null)
const coverName = ref('')
let originalCover: Blob | null = null
const previewUrl = ref('')
const compact = useCompactLayout()
const coverReading = ref(false)
const coverReadFailed = ref(false)
let coverReadGeneration = 0
const detail = shallowRef<CameraFavorite | null>(null)
const previewId = ref<string | null>(null)
const importPlan = shallowRef<ImportPlan | null>(null)
const choices = ref<Record<string, 'local' | 'incoming'>>({})
const coverInput = ref<HTMLInputElement | null>(null)
const backupInput = ref<HTMLInputElement | null>(null)
const backupDownloads = ref<Array<{ fileName: string; url: string }>>([])
function releaseBackupDownloads() {
  for (const download of backupDownloads.value) URL.revokeObjectURL(download.url)
  backupDownloads.value = []
}
const form = ref<HTMLElement | null>(null)
const tagFilter = ref<OutfitFilter>('all')
const tagOrder = ref<string[]>([])
const sidebar = ref<InstanceType<typeof OutfitSidebar> | null>(null)
const tagMessages = computed(() => localeMessages[props.language].outfit)
const isAddingTag = ref(false)
const newTag = ref('')
const tagToggle = ref<HTMLButtonElement | null>(null)
const tagInput = ref<HTMLInputElement | null>(null)
const tagPopover = ref<HTMLElement | null>(null)
const tagPosition = ref({ top: '0px', left: '0px' })
const editorTags = computed(() => [
  ...new Set([...allTags.value, selectedTag.value].filter(Boolean))
])
const sidebarRecords = computed(() =>
  library.value.records.map((record) => ({
    code: record.code,
    tags: record.tag ? [record.tag] : []
  }))
)
async function persistTags(next: string[]) {
  return trackOperation(async () => {
    busy.value = true
    try {
      tagOrder.value = await saveCameraFavoriteTags(next)
      channel?.postMessage('changed')
    } finally {
      busy.value = false
    }
  })
}
/** 新建相机标签与搭配、家园统一限制五字，已有标签的选择不受影响。 */
async function addTag(raw: string, select = false) {
  if (busy.value) return
  const tag = raw.trim()
  if (!isValidNewCameraFavoriteTag(tag)) {
    error.value = t('标签需为 1–5 字，不能包含逗号', 'Use 1–5 characters without commas')
    emit('status', error.value, 'warning')
    return
  }
  if (!allTags.value.includes(tag) && allTags.value.length >= 40) {
    emit('status', t('最多添加 40 个标签', 'Up to 40 tags'), 'warning')
    return
  }
  try {
    if (!allTags.value.includes(tag)) await persistTags([...allTags.value, tag])
    if (select) selectedTag.value = tag
    error.value = ''
    closeTagInput()
    sidebar.value?.closeTagInput()
  } catch (caught) {
    report(caught, 'addTag')
  }
}
function toggleTag(tag: string) {
  selectedTag.value = selectedTag.value === tag ? '' : tag
}
async function reorderTags(next: string[]) {
  return trackOperation(async () => {
    if (busy.value) return
    try {
      await persistTags([...new Set([...next, ...allTags.value])])
    } catch (caught) {
      report(caught, 'reorderTags')
    }
  })
}
async function removeTag(tag: string) {
  return trackOperation(async () => {
    if (busy.value) return
    const count = library.value.records.filter((record) => record.tag === tag).length
    if (
      count &&
      !(await props.confirmAction(
        t(
          '删除标签“' + tag + '”？将从 ' + count + ' 条收藏中移除此标签，收藏本身会保留。',
          'Remove tag “' + tag + '” from ' + count + ' favorites? The favorites will be kept.'
        ),
        t('删除标签', 'Delete tag')
      ))
    )
      return
    busy.value = true
    try {
      await deleteCameraFavoriteTag(tag)
      if (tagFilter.value === 'tag:' + tag) tagFilter.value = 'all'
      if (selectedTag.value === tag) selectedTag.value = ''
      await reload()
      channel?.postMessage('changed')
    } catch (caught) {
      report(caught, 'removeTag')
    } finally {
      busy.value = false
    }
  })
}
function updateTagPosition() {
  const rect = tagToggle.value?.getBoundingClientRect()
  if (!rect) return
  const width = Math.min(260, window.innerWidth - 24)
  tagPosition.value = {
    top: Math.max(12, Math.min(rect.top, window.innerHeight - 70)) + 'px',
    left: Math.max(12, Math.min(rect.right + 8, window.innerWidth - width - 12)) + 'px'
  }
}
function closeTagInput() {
  isAddingTag.value = false
  newTag.value = ''
}
async function openTagInput() {
  isAddingTag.value = true
  await nextTick()
  updateTagPosition()
  tagInput.value?.focus()
}
function tagOutsideClick(event: PointerEvent) {
  if (
    event.target instanceof Node &&
    !tagToggle.value?.contains(event.target) &&
    !tagPopover.value?.contains(event.target)
  )
    closeTagInput()
}

const selectedIds = ref<Set<string>>(new Set())
const selectionMessages = computed(() => localeMessages[props.language].selectionBar)
const parser = usePhotoParams({
  language: toRef(props, 'language'),
  messages: computed(() => props.messages)
})
const modal = computed(
  () => editor.value || !!detail.value || !!importPlan.value || !!previewId.value
)
useBodyScrollLock(modal)
let generation = 0
let parseTimer: ReturnType<typeof setTimeout> | undefined
function cancelAutoParse() {
  if (parseTimer !== undefined) clearTimeout(parseTimer)
  parseTimer = undefined
  generation++
  parsing.value = false
  parser.close()
}
let loadGeneration = 0
let previousFocus: HTMLElement | null = null
let channel: BroadcastChannel | null = null
let disposed = false

watch(modal, async (visible) => {
  emit('modalChange', visible)
  if (visible) {
    previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    await nextTick()
    // 打开编辑器只聚焦面板，输入框由用户主动选择。
    if (modal.value) form.value?.focus({ preventScroll: true })
  } else {
    previousFocus?.focus()
    previousFocus = null
  }
})
watch(
  () => normalizeCameraCode(code.value),
  (normalized) => {
    if (!editor.value || (parsed.value && normalized === parsedCode.value)) return
    cancelAutoParse()
    parsed.value = null
    parsedCode.value = ''
    error.value = ''
    if (!normalized) return
    parseTimer = setTimeout(() => {
      parseTimer = undefined
      void parse()
    }, 500)
  },
  { flush: 'sync' }
)
const allTags = computed(() => [
  ...new Set([...tagOrder.value, ...library.value.records.map((r) => r.tag).filter(Boolean)])
])
const visibleRecords = computed(() => {
  const query = props.searchQuery.trim().toLocaleLowerCase()
  return library.value.records.filter(
    (r) =>
      (tagFilter.value === 'all' ||
        (tagFilter.value === 'uncategorized' ? !r.tag : r.tag === tagFilter.value.slice(4))) &&
      (!query || [r.name, r.code, r.tag].join(' ').toLocaleLowerCase().includes(query))
  )
})
// Preview navigation follows the current filter and skips records without a cover.
const previewRecords = computed(() => visibleRecords.value.filter((item) => item.cover))
const previewIndex = computed(() =>
  previewRecords.value.findIndex((item) => item.id === previewId.value)
)
const previewRecord = computed(() => previewRecords.value[previewIndex.value] ?? null)
const previewPhoto = computed<PhotoDisplayItem | null>(() => {
  const item = previewRecord.value
  if (!item?.cover) return null
  const date = datePartsFromTimestamp(Date.parse(item.updatedAt))
  if (!date) return null
  return {
    ...date,
    id: item.id,
    name: item.name,
    url: null,
    fileSizeText: '',
    loadImageBlob: async () => {
      const blob = await readCameraFavoriteCover(item.id)
      if (!blob) throw new Error(t('封面图片不存在', 'Cover image is missing'))
      return blob
    }
  }
})
watch(previewPhoto, (_next, previous) => {
  if (previous) releasePhotoUrl(previous)
})
watch(previewRecord, (item) => {
  if (!item) previewId.value = null
})
onBeforeUnmount(() => {
  if (previewPhoto.value) releasePhotoUrl(previewPhoto.value)
})
function openPreview(item: CameraFavorite) {
  if (!busy.value && item.cover) previewId.value = item.id
}
function stepPreview(direction: number) {
  const index = previewIndex.value
  if (busy.value || index < 0) return
  const next = previewRecords.value[index + direction]
  if (next) previewId.value = next.id
}
async function editPreview() {
  const item = previewRecord.value
  if (!item || busy.value) return
  await openEditor(item)
  if (editor.value) {
    previewId.value = null
    await nextTick()
    form.value?.focus({ preventScroll: true })
  }
}
function showPreviewDetails() {
  if (!previewRecord.value || busy.value) return
  detail.value = previewRecord.value
  previewId.value = null
}
const resources = favoriteResources
const compactResourceCover = computed(() => compact.value && props.thumbnailSize === 'small')

/** 手机小图的无封面卡片仅展示有图片的灯光和滤镜，详情仍保留完整资源信息。 */
function cardResources(result: PhotoParamsResult) {
  const groups = resources(result)
  return compactResourceCover.value
    ? groups.filter(
        (group) => (group.kind === 'light' || group.kind === 'filter') && group.imageUrl
      )
    : groups
}
const selectedRecords = computed(() =>
  visibleRecords.value.filter((item) => selectedIds.value.has(item.id))
)
const allSelected = computed(
  () =>
    visibleRecords.value.length > 0 && selectedRecords.value.length === visibleRecords.value.length
)
function toggleSelected(id: string) {
  if (busy.value) return
  const next = new Set(selectedIds.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  selectedIds.value = next
}
function cardKeydown(event: KeyboardEvent, id: string) {
  if (event.target !== event.currentTarget || ![' ', 'Enter'].includes(event.key)) return
  event.preventDefault()
  toggleSelected(id)
}
function toggleAll() {
  selectedIds.value = allSelected.value
    ? new Set()
    : new Set(visibleRecords.value.map((item) => item.id))
}
watch(
  () => props.active,
  () => {
    previewId.value = null
    selectedIds.value = new Set()
    sidebar.value?.closeTagInput()
    closeTagInput()
  }
)
watch(visibleRecords, (records) => {
  const visible = new Set(records.map((item) => item.id))
  selectedIds.value = new Set([...selectedIds.value].filter((id) => visible.has(id)))
})
async function removeSelected() {
  return trackOperation(async () => {
    const ids = selectedRecords.value.map((item) => item.id)
    if (busy.value || !ids.length) return
    if (
      !(await props.confirmAction(
        t(
          '删除选中的 ' + ids.length + ' 条参数收藏？原照片不会删除。',
          'Delete ' + ids.length + ' selected favorites? Original photos will be kept.'
        ) + (await backupDeleteWarning('camera', props.language)),
        t('删除参数收藏', 'Delete camera favorites')
      ))
    )
      return
    busy.value = true
    try {
      if (
        ids.length === library.value.records.length &&
        (await backupDeleteWarning('camera', props.language)) &&
        !(await props.confirmAction(
          t(
            '这次删除覆盖全部相机参数收藏。同步后电脑副本中的全部记录与封面也会删除，不能撤销。确定继续吗？',
            'This deletes every camera favorite and its cover from the computer copy too. Continue?'
          )
        ))
      )
        return
      await deleteCameraFavorites(ids, true)
      selectedIds.value = new Set()
      notifyChanged()
      emit('status', t('已删除选中的收藏', 'Selected favorites deleted'), 'success')
    } catch (caught) {
      report(caught, 'removeSelected')
    } finally {
      busy.value = false
    }
  })
}
function report(caught: unknown, action = 'operation') {
  if (!(caught instanceof DuplicateCameraCodeError))
    captureDiagnosticError(caught, { module: 'camera-favorites', action })
  const message =
    caught instanceof DuplicateCameraCodeError
      ? t('该参数已收藏', 'These parameters are already saved')
      : action === 'importBackup' &&
          caught instanceof Error &&
          caught.message === '无法读取 ZIP 备份'
        ? t(
            '无法解压相机收藏备份，请确认文件是完整的 ZIP。',
            'Could not unzip the camera favorites backup. Check that the ZIP is complete.'
          )
        : caught instanceof Error
          ? caught.message
          : String(caught)
  error.value = caught instanceof DuplicateCameraCodeError ? '' : message
  emit('status', message, 'error')
}
/** 列表只读取收藏元数据，封面由可见卡片按需读取。 */
async function reload() {
  return trackOperation(async () => {
    const run = ++loadGeneration
    try {
      const next = await readCameraFavorites(false)
      if (disposed || run !== loadGeneration) return
      tagOrder.value = next.tags ?? []
      library.value = next
      loadError.value = ''
      emit(
        'codesChange',
        next.records.map((r) => r.code)
      )
    } catch (caught) {
      if (!disposed && run === loadGeneration)
        captureDiagnosticError(caught, { module: 'camera-favorites', action: 'reload' })
      if (!disposed && run === loadGeneration)
        loadError.value = caught instanceof Error ? caught.message : String(caught)
    }
  })
}
function setCover(file: Blob | null, filename = '') {
  coverReadGeneration += 1
  coverReading.value = false
  coverReadFailed.value = false
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
  cover.value = file
  coverName.value = filename
  previewUrl.value = file ? URL.createObjectURL(file) : ''
}
function closeEditor() {
  if (busy.value) return
  cancelAutoParse()
  editor.value = false
  closeTagInput()
  setCover(null)
}
/** 编辑已有收藏时先读取单张封面，读取失败则保留原记录。 */
async function openEditor(
  item: CameraFavorite | null = null,
  result: PhotoParamsResult | null = null,
  entry: FavoriteSource = 'manual',
  file: File | null = null
) {
  if (busy.value) return
  // 编辑封面按需读取；失败时保留原记录，不能把缺图误保存为删除封面。
  let existingCover: Blob | null = null
  if (item?.cover) {
    busy.value = true
    try {
      existingCover = await trackOperation(() => readCameraFavoriteCover(item.id))
    } catch (caught) {
      report(caught, 'openEditor')
      return
    } finally {
      busy.value = false
    }
    if (disposed) return
  }
  cancelAutoParse()
  editing.value = item ? cloneFavorite(item) : null
  source.value = item?.source ?? entry
  parsed.value = cloneFavorite(item?.result ?? result)
  const initialCode = item?.result.rawCameraParams ?? result?.rawCameraParams ?? ''
  parsedCode.value = parsed.value ? normalizeCameraCode(initialCode) : ''
  code.value = initialCode
  name.value = item?.name ?? t('相机参数 ', 'Camera settings ') + new Date().toLocaleDateString()
  selectedTag.value = item?.tag ?? ''
  closeTagInput()
  sidebar.value?.closeTagInput()
  error.value = ''
  setCover(item ? existingCover : file, item?.cover?.name ?? file?.name ?? '')
  originalCover = existingCover
  editor.value = true
  await nextTick()
}
async function openFromResult(
  result: PhotoParamsResult,
  photo: PhotoItem | { name: string } | null
) {
  return trackOperation(async () => {
    if (busy.value) return
    busy.value = true
    try {
      await reload()
      if (loadError.value) throw new Error(loadError.value)
      if (library.value.records.some((r) => r.code === normalizeCameraCode(result.rawCameraParams)))
        throw new DuplicateCameraCodeError()
      const isAlbum = !!photo && isAlbumPhoto(photo)
      const file = isAlbum ? await readPhotoFile(photo as PhotoItem) : null
      busy.value = false
      await openEditor(null, result, isAlbum ? 'album' : photo ? 'tool' : 'manual', file)
    } catch (caught) {
      report(caught, 'openFromResult')
    } finally {
      busy.value = false
    }
  })
}
async function parse() {
  if (disposed || !editor.value || !normalizeCameraCode(code.value)) return
  if (parsed.value && normalizeCameraCode(code.value) === parsedCode.value) return
  const raw = code.value
  const run = ++generation
  parsing.value = true
  error.value = ''
  await parser.parseRawCameraParams(raw)
  if (run !== generation) return
  parsing.value = false
  if (!parser.result.value) {
    emit('status', parser.error.value ?? t('解析失败', 'Parsing failed'), 'error')
    return
  }
  parsed.value = cloneFavorite(parser.result.value)
  parsedCode.value = normalizeCameraCode(raw)
  source.value = 'manual'
  emit('status', t('参数已解析', 'Parameters parsed'), 'success')
}
// 捕获验证通过后仍可能出现的预览失效，避免无提示空白。
function handleCoverPreviewError() {
  if (!editor.value || disposed) return
  captureDiagnosticError(new Error('Image preview failed'), {
    module: 'camera-favorites',
    action: 'preview-cover',
    stage: 'preview-element',
    code: 'IMAGE_PREVIEW_FAILED',
    context: { mimeType: cover.value?.type ?? null, sizeBytes: cover.value?.size ?? null }
  })
  error.value = t(
    '图片预览失败，请重新选择；浏览器可能不支持该格式。',
    'Image preview failed. Please select again; this format may be unsupported.'
  )
  coverReadFailed.value = true
  emit('status', error.value, 'error')
}
async function selectCover(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file || busy.value) {
    return
  }
  error.value = ''
  // 失败时保留旧封面或空封面，封面可选，不因一次失败锁死保存。
  // 移动布局立即读取原始字节；重选、关闭和卸载后不得采用旧任务结果。
  const run = ++coverReadGeneration
  coverReading.value = true
  coverReadFailed.value = false
  emit('status', t('正在读取图片…', 'Reading image…'), 'info')
  try {
    const reading = compact.value ? snapshotImageFile(file) : Promise.resolve(file)
    input.value = ''
    const snapshot = await reading

    await validateSelectedImage(snapshot)
    if (disposed || !editor.value || run !== coverReadGeneration) {
      return
    }
    setCover(snapshot, snapshot.name)
    emit('status', t('图片读取完成', 'Image loaded'), 'success')
  } catch (caught) {
    if (disposed || !editor.value || run !== coverReadGeneration) return
    captureDiagnosticError(caught, {
      module: 'camera-favorites',
      action: 'select-cover',
      stage: 'preview'
    })
    coverReadFailed.value = true
    error.value =
      t(
        '图片读取或预览失败，可能是格式不支持或文件损坏：',
        'Unable to read or preview image; the format may be unsupported or the file damaged: '
      ) + (caught instanceof Error ? caught.message : String(caught))
    emit('status', error.value, 'error')
  } finally {
    if (run === coverReadGeneration) coverReading.value = false
  }
}
function notifyChanged() {
  channel?.postMessage('changed')
  void reload()
}
async function save() {
  return trackOperation(async () => {
    if (
      busy.value ||
      parsing.value ||
      coverReading.value ||
      !parsed.value ||
      normalizeCameraCode(code.value) !== parsedCode.value
    )
      return
    if (!name.value.trim() || selectedTag.value.length > 60) {
      error.value = t(
        '名称必填，最多选择 1 个标签，标签不超过 60 字',
        'A name is required; select at most one tag, up to 60 characters'
      )
      return
    }
    busy.value = true
    error.value = ''
    try {
      // 优先 WebP，编码失败则保存通过校验的原图；移动端已复制原始字节。
      if (
        cover.value &&
        cover.value !== originalCover &&
        (cover.value instanceof File ||
          cover.value.type !== 'image/webp' ||
          !/\.webp$/i.test(coverName.value))
      ) {
        try {
          const file = new File([cover.value], coverName.value, { type: cover.value.type })
          const image = await convertImageForStorage(file)
          const extension = image.type === 'image/jpeg' ? 'jpg' : image.type.slice('image/'.length)
          const filename = (coverName.value.replace(/\.[^.]+$/, '') || 'cover') + '.' + extension
          setCover(image, filename)
        } catch (caught) {
          captureDiagnosticError(caught, {
            module: 'camera-favorites',
            action: 'save',
            stage: 'cover-processing'
          })
          const reason = caught instanceof Error ? caught.message : String(caught)
          emit('status', t('封面处理失败：', 'Cover processing failed: ') + reason, 'error')
          return
        }
      }
      const now = new Date().toISOString()
      const record: CameraFavorite = {
        id: editing.value?.id ?? createUuid(),
        version: 1,
        name: name.value.trim(),
        tag: selectedTag.value,
        code: parsedCode.value,
        source: source.value,
        result: cloneFavorite(parsed.value),
        cover:
          cover.value === originalCover && editing.value
            ? editing.value.cover
            : cover.value
              ? await coverMetadata(cover.value, coverName.value)
              : null,
        createdAt: editing.value?.createdAt ?? now,
        updatedAt: now
      }
      await saveCameraFavorite(record, cover.value, editing.value ?? undefined)
      busy.value = false
      closeEditor()
      notifyChanged()
      emit('status', t('已保存相机参数', 'Camera parameters saved'), 'success')
    } catch (caught) {
      report(caught, 'save')
    } finally {
      busy.value = false
    }
  })
}
async function remove(item: CameraFavorite) {
  return trackOperation(async () => {
    if (
      busy.value ||
      !(await props.confirmAction(
        t(
          '删除这条参数收藏？原照片不会删除。',
          'Delete this favorite? The original photo will be kept.'
        ) + (await backupDeleteWarning('camera', props.language)),
        t('删除参数收藏', 'Delete camera favorite')
      ))
    )
      return
    busy.value = true
    try {
      await deleteCameraFavorite(item.id, true)
      notifyChanged()
      emit('status', t('已删除收藏', 'Favorite deleted'), 'success')
    } catch (caught) {
      report(caught, 'remove')
    } finally {
      busy.value = false
    }
  })
}
async function copy(raw: string) {
  const messages = localeMessages[props.language].app
  if (await copyTextToClipboard(raw)) emit('status', messages.copySucceeded, 'success')
  else emit('status', messages.copyFailed(raw), 'warning')
}
async function exportBackup() {
  return trackOperation(async () => {
    busy.value = true
    try {
      releaseBackupDownloads()
      const { exportCameraBackup } = await import('../utils/photo-params/favoritesBackup')
      for await (const part of exportCameraBackup(await readCameraFavorites())) {
        const url = URL.createObjectURL(part.blob)
        backupDownloads.value.push({ fileName: part.fileName, url })
        downloadBackupBlob(part.fileName, part.blob, 'camera')
      }
      emit(
        'status',
        t(
          '已生成 ' + backupDownloads.value.length + ' 个备份文件',
          'Created ' + backupDownloads.value.length + ' backup file(s)'
        ),
        'success',
        takeDownloadFiles('camera')
      )
    } catch (caught) {
      report(caught, 'exportBackup')
      takeDownloadFiles('camera')
    } finally {
      busy.value = false
    }
  })
}
async function importBackup(event: Event) {
  return trackOperation(async () => {
    const input = event.target as HTMLInputElement
    const file = input.files?.[0]
    input.value = ''
    if (!file || busy.value) return
    busy.value = true
    error.value = ''
    try {
      const { readCameraBackup } = await import('../utils/photo-params/favoritesBackup')
      const incoming = await readCameraBackup(file)
      const local = await readCameraFavorites()
      const plan = planCameraImport(local, incoming)
      choices.value = Object.fromEntries(plan.conflicts.map((r) => [r.id, 'local']))
      importPlan.value = plan
      if (!plan.conflicts.length) await finishImport()
    } catch (caught) {
      report(caught, 'importBackup')
    } finally {
      busy.value = false
    }
  })
}
async function finishImport() {
  return trackOperation(async () => {
    if (!importPlan.value) return
    busy.value = true
    try {
      const plan = importPlan.value
      const count = await applyCameraImport(plan, choices.value)
      importPlan.value = null
      await reload()
      channel?.postMessage('changed')
      emit(
        'status',
        t(
          '已导入 ' +
            count +
            ' 条，已合并标签及排序；重复或保留本地 ' +
            (plan.incoming.records.length + plan.skipped - count) +
            ' 条',
          'Imported ' +
            count +
            '; tags and order merged; skipped or kept local: ' +
            (plan.incoming.records.length + plan.skipped - count)
        ),
        'success'
      )
    } catch (caught) {
      report(caught, 'finishImport')
    } finally {
      busy.value = false
    }
  })
}
function modalKey(event: KeyboardEvent) {
  if (event.key === 'Escape' && !busy.value) {
    event.preventDefault()
    event.stopPropagation()
    if (isAddingTag.value) {
      closeTagInput()
      tagToggle.value?.focus()
    } else if (editor.value) closeEditor()
    else importPlan.value = null
  }
  if (event.key !== 'Tab' || !form.value) return
  const elements = [
    ...form.value.querySelectorAll<HTMLElement>(
      'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex="0"]'
    )
  ]
  const first = elements[0],
    last = elements[elements.length - 1]
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last?.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first?.focus()
  }
}
// 选择器返回也会触发 focus；隐藏模块或打开弹窗时不刷新，避免占用全局忙碌状态。
function focusRefresh() {
  if (disposed || !props.active || modal.value || busy.value) return
  void reload()
}
onMounted(() => {
  void reload()
  if (typeof BroadcastChannel !== 'undefined') {
    channel = new BroadcastChannel('nikki-camera-favorites')
    channel.onmessage = () => {
      void reload()
    }
  }
  document.addEventListener('pointerdown', tagOutsideClick)
  window.addEventListener('resize', updateTagPosition)
  window.addEventListener('scroll', updateTagPosition, true)
  window.addEventListener('focus', focusRefresh)
})
onBeforeUnmount(() => {
  disposed = true
  cancelAutoParse()
  loadGeneration++
  channel?.close()
  releaseBackupDownloads()
  document.removeEventListener('pointerdown', tagOutsideClick)
  window.removeEventListener('resize', updateTagPosition)
  window.removeEventListener('scroll', updateTagPosition, true)
  window.removeEventListener('focus', focusRefresh)
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
})
defineExpose({ openFromResult, reload })
/** 应用用户的冲突选择后继续导入。 */
function handleImportChoices(value: typeof choices.value) {
  choices.value = value
  void finishImport()
}
</script>

<template>
  <Teleport v-if="active" :to="sidebarTarget || 'body'" :disabled="!sidebarTarget">
    <OutfitSidebar
      :language="language"
      ref="sidebar"
      :outfits="sidebarRecords"
      :tags="allTags"
      :active-filter="tagFilter"
      :picker-open="filtersOpen"
      :disabled="busy"
      :messages="tagMessages"
      :show-pending="false"
      :max-tag-length="MAX_CAMERA_FAVORITE_TAG_LENGTH"
      @change-filter="tagFilter = $event"
      @filter-selected="$emit('closeFilters')"
      @add-tag="addTag($event)"
      @delete-tag="removeTag"
      @reorder-tags="reorderTags"
    />
  </Teleport>
  <section
    v-show="active"
    class="camera-favorites"
    :class="`thumbnail-size-${thumbnailSize ?? 'medium'}`"
  >
    <div v-if="backupDownloads.length > 1" class="camera-backup-downloads">
      <p>{{
        t(
          '备份已自动分包；如浏览器未下载全部文件，请逐个点击保存。每个 ZIP 均可独立导入。',
          'The backup was split. If your browser blocked downloads, save each file below. Each ZIP can be imported independently.'
        )
      }}</p>
      <a
        v-for="part in backupDownloads"
        :key="part.fileName"
        :href="part.url"
        :download="part.fileName"
        >{{ part.fileName }}</a
      >
      <button type="button" @click="releaseBackupDownloads">{{ t('关闭', 'Close') }}</button>
    </div>
    <!-- 操作按钮移至收藏夹标签行，保持组件内的原有事件和状态。 -->
    <Teleport v-if="active" :to="actionsTarget || 'body'" :disabled="!actionsTarget">
      <CollectionActions
        mobile-target="#camera-tag-actions"
        :label="t('收藏操作', 'Favorite actions')"
        ><button
          class="primary-button"
          type="button"
          :aria-label="t('添加收藏', 'Add favorite')"
          :title="t('添加收藏', 'Add favorite')"
          :disabled="busy"
          @click="openEditor()"
          ><Plus :size="15" aria-hidden="true" /><span class="collection-action-label">{{
            t('添加收藏', 'Add favorite')
          }}</span></button
        ><template #secondary>
          <input
            ref="backupInput"
            type="file"
            accept=".zip,application/zip"
            hidden
            @change="importBackup"
          />
          <button type="button" :disabled="busy" @click="backupInput?.click()"
            ><Download :size="15" />{{ t('导入', 'Import') }}</button
          >
          <button
            type="button"
            :disabled="busy || (!library.records.length && !allTags.length)"
            @click="exportBackup"
            ><Upload :size="15" />{{ t('导出', 'Export') }}</button
          >
        </template></CollectionActions
      >
    </Teleport>
    <CollectionFilterBar
      tag-picker
      :like-active="active"
      actions-id="camera-tag-actions"
      :entries="[
        { key: 'all', label: t('全部', 'All') },
        { key: 'uncategorized', label: t('未分类', 'Uncategorized') },
        ...allTags.map((tag) => ({ key: 'tag:' + tag, label: tag }))
      ]"
      :active="tagFilter"
      :count="visibleRecords.length"
      :language="language"
      :disabled="busy"
      @change="tagFilter = $event as OutfitFilter"
      @clear="tagFilter = 'all'"
      @open="$emit('openFilters')"
    />
    <p v-if="loadError" role="alert"
      >{{ loadError }} <button type="button" @click="reload">{{ t('重试', 'Retry') }}</button></p
    >
    <p v-if="!visibleRecords.length && !loadError" class="camera-empty"
      >{{
        t(
          '暂无相机参数。添加参数码，或从照片参数窗口收藏。',
          'No camera parameters yet. Add a code or save from photo parameters.'
        )
      }}<MobileEmptyScreenshot v-if="!library.records.length" page="camera" :language="language"
    /></p>
    <div class="camera-favorite-grid">
      <article
        v-for="item in visibleRecords"
        :key="item.id"
        v-card-reveal="`camera:${item.id}`"
        class="photo-card camera-favorite-card"
        :class="{ selected: selectedIds.has(item.id) }"
        role="checkbox"
        :aria-checked="selectedIds.has(item.id)"
        :aria-label="item.name"
        :aria-disabled="busy"
        tabindex="0"
        @click="toggleSelected(item.id)"
        @dblclick.stop="openPreview(item)"
        @keydown="cardKeydown($event, item.id)"
      >
        <div class="camera-cover">
          <StoredImage
            v-if="item.cover"
            :active="active"
            :source-key="`${item.id}:${item.updatedAt}`"
            :load="() => readCameraFavoriteCover(item.id)"
            :alt="item.name"
          />
          <div
            v-else-if="cardResources(item.result).length"
            class="camera-resources"
            :class="{ 'is-image-only': compactResourceCover }"
          >
            <div v-for="group in cardResources(item.result)" :key="group.kind">
              <img
                v-if="group.imageUrl"
                :src="group.imageUrl"
                :alt="group.name"
                loading="lazy"
                @error="($event.target as HTMLImageElement).style.visibility = 'hidden'"
              />
              <ScanSearch v-else :size="24" aria-hidden="true" />
              <template v-if="!compactResourceCover">
                <small>{{ group.title }}</small
                ><strong>{{ group.name }}</strong>
              </template>
            </div>
          </div>
          <Camera v-else :size="34" class="camera-placeholder" aria-hidden="true" />
          <!-- 标记常驻，通过公共选中样式切换，保留淡入与缩放动画。 -->
          <span class="selected-badge"><Check :size="15" aria-hidden="true" /></span>
          <button
            class="outfit-card-delete camera-card-delete desktop-only"
            type="button"
            :title="t('删除', 'Delete')"
            :aria-label="t('删除', 'Delete')"
            :disabled="busy"
            @click.stop="remove(item)"
            ><Trash2 :size="16" aria-hidden="true"
          /></button>
        </div>
        <div class="camera-card-content">
          <div class="camera-name-tags"
            ><h3 :title="item.name">{{ item.name }}</h3
            ><div class="desktop-only"
              ><span v-if="item.tag" :title="item.tag">{{ item.tag }}</span></div
            ></div
          >
          <code class="camera-code">{{ item.result.rawCameraParams }}</code>
        </div>
        <footer>
          <!-- 手机来源与标签同排，来源靠左、标签靠右；电脑标签仍位于标题旁。 -->
          <div class="camera-source-tag"
            ><span class="camera-source-label">{{
              item.source === 'manual' ? t('手动收藏', 'Manual') : t('照片解析', 'Photo parsing')
            }}</span
            ><span v-if="item.tag" class="camera-card-tag mobile-only" :title="item.tag"
              ><span>{{ item.tag }}</span></span
            ></div
          >
          <div class="outfit-card-actions" @click.stop @dblclick.stop>
            <button
              type="button"
              :title="t('复制', 'Copy')"
              :aria-label="t('复制', 'Copy')"
              :disabled="busy"
              @click.stop="copy(item.result.rawCameraParams)"
              ><Copy :size="15" aria-hidden="true"
            /></button>
            <button
              type="button"
              :title="t('编辑', 'Edit')"
              :aria-label="t('编辑', 'Edit')"
              :disabled="busy"
              @click.stop="openEditor(item)"
              ><Edit3 :size="15" aria-hidden="true"
            /></button>
            <button
              class="mobile-only"
              type="button"
              :title="t('删除', 'Delete')"
              :aria-label="t('删除', 'Delete')"
              :disabled="busy"
              @click.stop="remove(item)"
              ><Trash2 :size="18" aria-hidden="true"
            /></button>
            <button
              type="button"
              :title="t('详情', 'Details')"
              :aria-label="t('详情', 'Details')"
              :disabled="busy"
              @click.stop="detail = item"
              ><ScanSearch :size="15" aria-hidden="true"
            /></button> </div
        ></footer>
      </article>
    </div>
    <SelectionBar
      v-if="active && !modal"
      mode="outfit"
      :selected-count="selectedRecords.length"
      :all-selected="allSelected"
      :all-items-selected="allSelected"
      :all-selected-favorited="false"
      :is-busy="busy"
      :messages="selectionMessages"
      @toggle-all="toggleAll"
      @delete="removeSelected"
      @cancel="selectedIds = new Set()"
    />
  </section>

  <Teleport to="body">
    <Transition name="confirm-dialog">
      <div
        v-if="editor"
        class="outfit-editor camera-editor-overlay"
        @keydown="modalKey"
        @click.self="closeEditor"
      >
        <form
          ref="form"
          class="outfit-editor-panel camera-favorite-editor"
          tabindex="-1"
          role="dialog"
          aria-modal="true"
          aria-labelledby="camera-editor-title"
          @submit.prevent="save"
        >
          <header>
            <h2 id="camera-editor-title">{{
              editing
                ? t('编辑相机参数', 'Edit camera favorite')
                : t('收藏相机参数', 'Save camera parameters')
            }}</h2>
            <button
              type="button"
              :disabled="busy"
              :title="t('关闭', 'Close')"
              :aria-label="t('关闭', 'Close')"
              @click="closeEditor"
              ><X :size="19" aria-hidden="true"
            /></button>
          </header>
          <fieldset class="outfit-editor-content camera-favorite-editor-body" :disabled="busy">
            <div class="outfit-image-column">
              <label id="camera-cover-label">{{ t('封面（可选）', 'Cover (optional)') }}</label>
              <button
                class="outfit-image-dropzone camera-cover-dropzone"
                type="button"
                aria-labelledby="camera-cover-label"
                @click="coverInput?.click()"
              >
                <img
                  v-if="previewUrl"
                  class="camera-editor-preview"
                  :src="previewUrl"
                  :alt="t('封面预览', 'Cover preview')"
                  @error="handleCoverPreviewError"
                />
                <span v-else class="outfit-image-prompt"
                  ><ImagePlus :size="30" aria-hidden="true" />{{
                    t('点击选择封面图片', 'Click to choose a cover')
                  }}</span
                >
                <span v-if="previewUrl" class="outfit-replace-image"
                  ><Upload :size="15" aria-hidden="true" />{{
                    t('更换封面', 'Replace cover')
                  }}</span
                >
              </button>
              <p
                v-if="coverReading || coverReadFailed"
                class="outfit-editor-error"
                role="status"
                aria-live="polite"
              >
                {{
                  coverReading
                    ? t('正在读取图片…', 'Reading image…')
                    : t(
                        '图片读取失败，请重新选择；将保留原封面，没有封面时可直接保存。',
                        'Image reading failed. Select again; the previous cover is retained, or save without a cover.'
                      )
                }}
              </p>
              <input
                id="camera-favorite-cover"
                ref="coverInput"
                type="file"
                accept="image/*"
                hidden
                @change="selectCover"
              />
              <div v-if="cover" class="outfit-tag-choices camera-cover-tools"
                ><button type="button" @click="setCover(null)"
                  ><X :size="14" aria-hidden="true" />{{ t('移除封面', 'Remove cover') }}</button
                ></div
              >
              <p class="camera-cover-hint">{{
                t(
                  '封面优先保存为 WebP，不支持时保留原格式；不添加时展示动作、灯光和滤镜。',
                  'Covers use WebP when available, otherwise their original format. Without a cover, action, lighting and filter resources are shown.'
                )
              }}</p>
              <div v-if="parsed && resources(parsed).length" class="camera-parsed-summary"
                ><span v-for="group in resources(parsed)" :key="group.kind"
                  >{{ group.title }} · {{ group.name }}</span
                ></div
              >
            </div>
            <div class="outfit-fields">
              <label for="camera-favorite-code">{{
                t('相机参数码', 'Camera parameter code')
              }}</label>
              <textarea
                id="camera-favorite-code"
                v-model="code"
                maxlength="100000"
                rows="3"
                :placeholder="t('粘贴相机参数码', 'Paste a camera parameter code')"
                required
              />
              <div class="camera-parse-status" aria-live="polite"
                ><span>{{
                  parsing
                    ? t('解析中…', 'Parsing…')
                    : parsed
                      ? ''
                      : t('输入参数码后自动解析', 'Parameters are parsed automatically after input')
                }}</span></div
              >
              <label for="camera-favorite-name">{{ t('名称', 'Name') }}</label>
              <input id="camera-favorite-name" v-model="name" maxlength="200" required />
              <fieldset class="camera-editor-tags">
                <legend>{{ tagMessages.tagLabel }}</legend>
                <div class="outfit-tag-choices">
                  <button
                    v-for="tag in editorTags"
                    :key="tag"
                    type="button"
                    :class="{ active: selectedTag === tag }"
                    :aria-pressed="selectedTag === tag"
                    @click="toggleTag(tag)"
                    >{{ tag }}</button
                  >
                  <button
                    ref="tagToggle"
                    class="outfit-editor-add-tag"
                    type="button"
                    :title="tagMessages.addTag"
                    :aria-label="tagMessages.addTag"
                    :disabled="allTags.length >= 40"
                    @click="isAddingTag ? closeTagInput() : openTagInput()"
                    ><Plus
                      class="tag-toggle-icon"
                      :class="{ 'is-open': isAddingTag }"
                      :size="15"
                      aria-hidden="true"
                  /></button>
                </div>
                <p v-if="!editorTags.length">{{ tagMessages.noTag }}</p>
                <Transition name="outfit-tag-editor">
                  <div
                    v-if="isAddingTag"
                    ref="tagPopover"
                    class="outfit-tag-editor outfit-tag-editor-popover camera-tag-popover"
                    :style="tagPosition"
                    @keydown.enter.stop.prevent="addTag(newTag, true)"
                  >
                    <input
                      ref="tagInput"
                      v-model="newTag"
                      :maxlength="MAX_CAMERA_FAVORITE_TAG_LENGTH"
                      :placeholder="tagMessages.tagPlaceholder"
                      :aria-label="tagMessages.addTag"
                      autocomplete="off"
                    />
                    <button type="button" @click="addTag(newTag, true)">{{
                      tagMessages.confirmAddTag
                    }}</button>
                  </div>
                </Transition>
              </fieldset>
              <p v-if="error" class="outfit-editor-error" role="alert">{{ error }}</p>
            </div>
          </fieldset>
          <footer>
            <button
              class="confirm-dialog-button ghost"
              type="button"
              :disabled="busy"
              @click="closeEditor"
              >{{ t('取消', 'Cancel') }}</button
            >
            <button
              class="confirm-dialog-button primary"
              type="submit"
              :disabled="busy || coverReading || parsing || !parsed || !name.trim()"
              >{{ busy ? t('保存中…', 'Saving…') : t('保存收藏', 'Save favorite') }}</button
            >
          </footer>
        </form>
      </div>
    </Transition>
  </Teleport>
  <CameraImportConflictDialog
    :plan="importPlan"
    :language="language"
    :disabled="busy"
    :error="error"
    @confirm="handleImportChoices"
    @cancel="importPlan = null"
  />
  <Lightbox
    :photo="previewPhoto"
    :has-previous="previewIndex > 0"
    :has-next="previewIndex >= 0 && previewIndex < previewRecords.length - 1"
    :is-deleting="busy"
    :is-favorite="false"
    :keyboard-enabled="active && !editor && !detail && !importPlan && !busy"
    mode="camera"
    :messages="localeMessages[language].lightbox"
    :date-messages="localeMessages[language].date"
    @close="previewId = null"
    @previous="stepPreview(-1)"
    @next="stepPreview(1)"
  >
    <template #metadata>
      <div v-if="previewRecord" class="lightbox-outfit-meta">
        <span>{{ previewRecord.name }}</span>
        <span v-if="previewRecord.tag">{{ previewRecord.tag }}</span>
      </div>
    </template>
    <template #actions="{ disabled }">
      <button
        type="button"
        :title="t('复制参数', 'Copy parameters')"
        :aria-label="t('复制参数', 'Copy parameters')"
        :disabled="disabled"
        @click="previewRecord && copy(previewRecord.result.rawCameraParams)"
        ><Copy :size="18"
      /></button>
      <button
        type="button"
        :title="t('编辑', 'Edit')"
        :aria-label="t('编辑', 'Edit')"
        :disabled="disabled"
        @click="editPreview"
        ><Edit3 :size="18"
      /></button>
      <button
        type="button"
        :title="t('详情', 'Details')"
        :aria-label="t('详情', 'Details')"
        :disabled="disabled"
        @click="showPreviewDetails"
        ><ScanSearch :size="18"
      /></button>
    </template>
  </Lightbox>
  <PhotoParamsDialog
    v-if="detail"
    :visible="!!detail"
    :photo="detail ? { name: detail.name } : null"
    :progress="{ stage: 'ready', percent: 100, message: '' }"
    :result="detail?.result ?? null"
    :error="null"
    :uid-required="false"
    :messages="messages"
    :saved="true"
    :favorite-label="t('已收藏', 'Saved')"
    @close="detail = null"
    @copy="detail && copy(detail.result.rawCameraParams)"
  />
</template>

<style scoped>
.camera-source-tag {
  display: contents;
}
.camera-backup-downloads {
  display: grid;
  gap: 8px;
  margin: 12px 0;
  padding: 12px;
  border: 1px solid var(--line);
  border-radius: var(--ui-radius);
}
.camera-favorites {
  min-width: 0;
}
.camera-favorites h2 small {
  font-size: 13px;
  color: var(--muted);
  margin-left: 8px;
}
.camera-empty {
  padding: 60px 20px;
  text-align: center;
  color: var(--muted);
}
/* 相机参数独立控制列宽；中图保留原布局，两端分别读取大小偏好。 */
.camera-favorites.thumbnail-size-small {
  --camera-thumbnail-width: 200px;
  --camera-mobile-columns: repeat(auto-fill, minmax(min(110px, 100%), 1fr));
}
.camera-favorites.thumbnail-size-large {
  --camera-thumbnail-width: 360px;
  --camera-mobile-columns: repeat(auto-fill, minmax(min(300px, 100%), 1fr));
}
.camera-favorite-grid {
  display: grid;
  grid-template-columns: repeat(
    auto-fill,
    minmax(min(var(--camera-thumbnail-width, 260px), 100%), 1fr)
  );
  gap: var(--mobile-collection-gap, 16px);
  padding: 10px 0 100px;
}

.camera-favorite-card {
  display: flex;
  flex-direction: column;
  min-width: 0;
  padding: 10px;
  border-radius: 18px;
}
.camera-cover {
  position: relative;
  aspect-ratio: 16/9;
  border-radius: 12px;
  background: color-mix(in srgb, var(--pink-deep) 7%, var(--surface-strong));
  display: grid;
  place-items: center;
}
@supports not (color: color-mix(in srgb, black, white)) {
  .camera-cover {
    background: rgba(251.22, 246.39, 246.53, 1);
  }
  :where(:root[data-theme='dark']) .camera-cover {
    background: rgba(41.84, 37.43, 41.29, 1);
  }
}
.camera-cover > img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 12px;
  position: absolute;
}
.camera-placeholder {
  color: var(--muted);
  opacity: 0.5;
}
.camera-resources {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  padding: 10px;
  box-sizing: border-box;
}
.camera-resources > div {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  flex-direction: column;
  gap: 7px;
  text-align: center;
}
.camera-resources img {
  width: 100%;
  max-width: 84px;
  height: 58px;
  object-fit: contain;
}
/* 图标封面填满固定比例区域，避免资源文字的最小高度撑高小图。 */
.camera-resources.is-image-only {
  position: absolute;
  inset: 0;
  gap: 6px;
  padding: 6px;
}
.camera-resources.is-image-only > div {
  height: 100%;
}
.camera-resources.is-image-only img {
  height: 100%;
  max-height: 100%;
}
.camera-resources small {
  font-size: 10px;
  color: var(--muted);
}
.camera-resources strong {
  font-size: 12px;
  overflow-wrap: anywhere;
  color: var(--heading);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.camera-card-delete {
  right: 8px;
}
.camera-card-content {
  padding: 12px 2px;
}
.camera-name-tags {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  align-items: flex-start;
  min-height: 28px;
}
.camera-name-tags h3 {
  flex: 1 1 auto;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin: 0;
  font-size: 14px;
  color: var(--heading);
  min-width: 0;
}
.camera-name-tags > div {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  justify-content: flex-end;
  max-width: 50%;
  flex-shrink: 0;
}
.camera-name-tags span,
.camera-card-tag {
  padding: 3px 7px;
  border-radius: 7px;
  background: var(--tag-bg);
  color: var(--pink-deep);
  font-size: 10px;
  overflow-wrap: anywhere;
  max-width: 100%;
}
.camera-code {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  overflow-wrap: anywhere;
  line-height: 1.6;
  height: 3.2em;
  font-size: 11px;
  margin-top: 9px;
  color: var(--muted);
}
.camera-favorite-card footer {
  margin-top: auto;
  border-top: 1px solid var(--line);
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 6px;
  padding: 10px 2px 0;
  font-size: 11px;
  color: var(--muted);
}
.camera-editor-overlay {
  z-index: 1600;
}
.camera-parse-status {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  color: var(--muted);
  margin-top: 8px;
}
.camera-editor-preview {
  width: 100%;
  max-height: 150px;
  object-fit: contain;
  border-radius: 10px;
}
.camera-parsed-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  font-size: 12px;
  color: var(--muted);
  margin-top: 10px;
}
button,
summary {
  cursor: pointer;
}
/* 手机取消标题保留高度，缩小名称与参数码的空白。 */
@media (max-width: 899px) {
  .camera-name-tags {
    min-height: 0;
  }
  .camera-name-tags h3 {
    width: 100%;
  }
  .camera-code {
    margin-top: 4px;
  }
}

@media (max-width: 560px) {
  .camera-favorite-card {
    max-width: 100%;
  }
}

.camera-favorite-editor-body {
  margin: 0;
  min-width: 0;
  border: 0;
}
.camera-cover-dropzone {
  aspect-ratio: 16/9;
}
.camera-cover-dropzone .camera-editor-preview {
  max-height: none;
  border-radius: 0;
}
.camera-cover-tools {
  margin-top: 8px;
}
.camera-cover-tools button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.camera-cover-hint {
  color: var(--muted);
  font-size: 12px;
  line-height: 1.6;
  margin: 12px 0;
}
/* 参数码保留桌面紧凑字号；移动字号由共享布局变量提供，不依赖选择器权重覆盖。 */
.camera-favorite-editor .outfit-fields > textarea {
  box-sizing: border-box;
  height: 124px;
  min-height: 124px;
  max-height: 124px;
  padding: 10px;
  resize: none;
  overflow-y: auto;
  overflow-wrap: anywhere;
  font: inherit;
  font-size: var(--mobile-input-font-size, 12px);
}
.camera-favorite-editor .camera-parse-status {
  gap: 8px;
  margin: 0px 0 12px;
}
@media (max-width: 850px) {
  .camera-favorite-editor-body {
    grid-template-columns: 1fr;
  }
}
.camera-tag-popover {
  z-index: 1601;
}
.camera-editor-tags .outfit-tag-choices button {
  max-width: 100%;
  overflow-wrap: anywhere;
}

@media (max-width: 899px) {
  .camera-favorite-grid {
    grid-template-columns: var(--camera-mobile-columns, var(--mobile-collection-columns));
  }
}

@media (max-width: 560px) {
  .camera-favorite-card {
    padding: 6px;
    border-radius: 12px;
  }
  .camera-card-content {
    padding: 8px 0;
  }
  .camera-name-tags {
    gap: 6px;
  }
  .camera-name-tags h3 {
    font-size: 12px;
  }
  .camera-name-tags span {
    padding: 3px 4px;
  }
  .camera-favorite-card footer {
    flex-direction: column;
    align-items: stretch;
    padding: 8px 0 0;
    overflow-wrap: anywhere;
  }
  .camera-favorite-card footer .outfit-card-actions {
    justify-content: flex-end;
  }
  .camera-resources {
    gap: 4px;
    padding: 6px;
  }
  .camera-resources > div {
    gap: 4px;
  }
  .camera-resources img {
    height: 36px;
  }
  .camera-resources strong {
    font-size: 10px;
  }
}
</style>
