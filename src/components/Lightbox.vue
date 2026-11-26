<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import {
  ChevronLeft,
  ChevronRight,
  Copy,
  Edit3,
  Heart,
  GripVertical,
  Pencil,
  RotateCcw,
  RotateCw,
  ScanSearch,
  Trash2,
  X,
  ZoomIn,
  ZoomOut
} from 'lucide-vue-next'
import GlassSurfaceFilter from './GlassSurfaceFilter.vue'
import { useGlassSurface } from '../composables/useGlassSurface'
import { useCompactLayout } from '../composables/useCompactLayout'
import type { LocaleMessages } from '../i18n'
import type { OutfitMessages } from '../i18n'
import { isAlbumPhoto, type PhotoDisplayItem, type PhotoItem } from '../utils/photoGrouping'
import type { OutfitItem } from '../utils/outfit/outfitFileSystem'
import type { HomeSchemeItem } from '../utils/homeBuild/homeSchemeTypes'
import type { HomeSchemeMessages } from '../i18n/messages/homeScheme'
import { loadImageUrlWithSize, loadPhotoWithRetryAndSize } from '../utils/photoLoader'
import { useBodyScrollLock } from '../utils/bodyScrollLock'
import { reportError as captureDiagnosticError } from '../utils/errorReporting/errorReporter'

const isCompactLayout = useCompactLayout()
const { glassFilterId, refractsBackdrop } = useGlassSurface()
const glassSurfaceAttributes = {
  'data-refraction': refractsBackdrop || undefined,
  style: { '--nav-glass-filter': `url(#${glassFilterId})` }
}

type PreviewPhoto = PhotoDisplayItem

import { useImageZoom, MIN_ZOOM, LIGHTBOX_MAX_ZOOM, ZOOM_STEP } from '../composables/useImageZoom'

const props = defineProps<{
  photo: PhotoItem | PreviewPhoto | null
  hasPrevious: boolean
  hasNext: boolean
  readOnly?: boolean
  readOnlyHint?: string
  rotateSource?: () => Promise<void>
  isDeleting: boolean
  isFavorite: boolean
  keyboardEnabled: boolean
  mode: 'album' | 'trash' | 'outfit' | 'home' | 'camera'
  outfit?: OutfitItem | null
  outfitMessages?: OutfitMessages
  homeScheme?: HomeSchemeItem | null
  homeMessages?: HomeSchemeMessages
  messages: LocaleMessages['lightbox']
  dateMessages: LocaleMessages['date']
}>()
useBodyScrollLock(computed(() => Boolean(props.photo)))

const emit = defineEmits<{
  close: []
  previous: []
  next: []
  deleteCurrent: []
  toggleFavorite: []
  restoreCurrent: []
  permanentlyDeleteCurrent: []
  copyOutfit: []
  editOutfit: []
  copyHomeScheme: []
  editHomeScheme: []
  editPhotoNote: []
  parsePhoto: []
}>()

const displayedPhoto = ref<PhotoItem | PreviewPhoto | null>(null)
const decodingPreview = ref(false)
const rotating = ref(false)
const rotationNotice = ref('')
async function rotateCurrent() {
  if (!props.rotateSource || props.readOnly || photoActionsDisabled.value) return
  rotating.value = true
  rotationNotice.value = ''
  showControls()
  try {
    await props.rotateSource()
    rotationNotice.value = props.messages.rotateSaved
  } catch (error) {
    captureDiagnosticError(error, { module: 'lightbox', action: 'rotate-source' })
    const code = error instanceof Error ? error.message : ''
    rotationNotice.value =
      code === 'rotation_unsupported'
        ? props.messages.rotateUnsupported
        : code === 'rotation_conflict'
          ? props.messages.rotateConflict
          : code === 'rotation_permission'
            ? props.messages.rotatePermission
            : code === 'rotation_refresh'
              ? props.messages.rotateRefreshFailed
              : props.messages.rotateFailed
  } finally {
    rotating.value = false
    showControls()
  }
}
const imageAspectRatio = ref<number | null>(null)
const viewportSize = ref({ width: 0, height: 0 })
const controlsVisible = ref(true)
let controlsTimer: ReturnType<typeof setTimeout> | undefined
let toolbarHovered = false
const toolbarFooter = ref<HTMLElement | null>(null)
const toolbarDock = ref<'top' | 'bottom'>('bottom')
const toolbarX = ref(0)
const toolbarBounds = ref({ x: 0, baseY: 0, top: 0, bottom: 12, height: 0 })
const toolbarDrag = ref<{
  id: number
  grabX: number
  grabY: number
  x: number
  y: number
  handle: HTMLElement
} | null>(null)
let toolbarObserver: ResizeObserver | undefined
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))
const toolbarStyle = computed(() => {
  const { x, baseY, top, bottom, height } = toolbarBounds.value
  return {
    '--toolbar-x': `${clamp(toolbarDrag.value?.x ?? toolbarX.value, -x, x)}px`,
    '--toolbar-offset': `${toolbarDrag.value?.y ?? (toolbarDock.value === 'top' ? top - baseY : 0)}px`,
    '--toolbar-hide': `${toolbarDock.value === 'top' ? -top - height * 0.75 : bottom + height * 0.75}px`
  }
})
function measureToolbar() {
  const footer = toolbarFooter.value
  if (!footer || isCompactLayout.value) return
  const bottom = parseFloat(getComputedStyle(footer).bottom) || 12
  const height = footer.offsetHeight
  const baseY = Math.max(0, viewportSize.value.height - bottom - height)
  toolbarBounds.value = {
    x: Math.max(0, (footer.clientWidth - (footer.querySelector<HTMLElement>('.lightbox-toolbar')?.offsetWidth ?? footer.clientWidth)) / 2),
    baseY,
    top: Math.min(baseY, bottom),
    bottom,
    height
  }
}
watch([toolbarFooter, isCompactLayout], () => {
  toolbarObserver?.disconnect()
  if (isCompactLayout.value) {
    finishToolbarDrag()
    return
  }
  if (typeof ResizeObserver !== 'undefined') {
    toolbarObserver = new ResizeObserver(measureToolbar)
    if (toolbarFooter.value) {
      toolbarObserver.observe(toolbarFooter.value)
      const toolbar = toolbarFooter.value.querySelector('.lightbox-toolbar')
      if (toolbar) toolbarObserver.observe(toolbar)
    }
  }
  measureToolbar()
}, { flush: 'post' })
function startToolbarDrag(event: PointerEvent) {
  if (isCompactLayout.value || event.button !== 0 || toolbarDrag.value || !toolbarFooter.value) return
  measureToolbar()
  const handle = event.currentTarget as HTMLElement
  // Start at the rendered position, including any ongoing reveal animation.
  const rect = toolbarFooter.value.getBoundingClientRect()
  const x = clamp(toolbarX.value, -toolbarBounds.value.x, toolbarBounds.value.x)
  const y = rect.top - toolbarBounds.value.baseY
  handle.setPointerCapture(event.pointerId)
  toolbarDrag.value = { id: event.pointerId, grabX: event.clientX - x, grabY: event.clientY - y, x, y, handle }
  showControls()
}
function moveToolbarDrag(event: PointerEvent) {
  const drag = toolbarDrag.value
  if (!drag || drag.id !== event.pointerId) return
  const { x, baseY, bottom } = toolbarBounds.value
  drag.x = clamp(event.clientX - drag.grabX, -x, x)
  drag.y = clamp(event.clientY - drag.grabY, -baseY, bottom)
}
function finishToolbarDrag(event?: PointerEvent) {
  const drag = toolbarDrag.value
  if (!drag || (event && drag.id !== event.pointerId)) return
  const dropped = event?.type === 'pointerup'
  if (dropped) {
    moveToolbarDrag(event)
    toolbarX.value = drag.x
    toolbarDock.value = toolbarBounds.value.baseY + drag.y + toolbarBounds.value.height / 2 < viewportSize.value.height / 2 ? 'top' : 'bottom'
  }
  toolbarDrag.value = null
  if (drag.handle.hasPointerCapture(drag.id)) drag.handle.releasePointerCapture(drag.id)
  if (dropped) {
    toolbarHovered = false
    clearControlsTimer()
    controlsVisible.value = false
  } else {
    showControls()
  }
}
function handleToolbarKeydown(event: KeyboardEvent) {
  if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
  event.preventDefault()
  measureToolbar()
  toolbarDock.value = event.key === 'ArrowUp' ? 'top' : 'bottom'
  showControls()
}
function clearControlsTimer() {
  clearTimeout(controlsTimer)
  controlsTimer = undefined
}
function showControls() {
  controlsVisible.value = true
  clearControlsTimer()
  if (!props.photo) return
  controlsTimer = setTimeout(
    () => {
      if (
        toolbarHovered ||
        toolbarDrag.value !== null ||
        rotating.value ||
        !props.keyboardEnabled ||
        (document.activeElement?.matches(':focus-visible') &&
          document.activeElement.closest('.lightbox-footer'))
      )
        return
      controlsVisible.value = false
    },
    rotationNotice.value ? 5000 : 680
  )
}
function enterToolbar() {
  toolbarHovered = true
  controlsVisible.value = true
  clearControlsTimer()
}
function leaveToolbar() {
  toolbarHovered = false
  showControls()
}
const { zoom, imageTransform, resetTransform, setZoom, handleWheel, startDrag, moveDrag, endDrag } =
  useImageZoom(
    () => true,
    (direction) => {
      if (rotating.value) return
      if (direction === 'next' && props.hasNext) emit('next')
      if (direction === 'previous' && props.hasPrevious) emit('previous')
    },
    LIGHTBOX_MAX_ZOOM
  )
let previewLoadToken = 0
let previewAbortController: AbortController | null = null

const isPreviewLoading = computed(() =>
  Boolean(props.photo && (decodingPreview.value || displayedPhoto.value?.id !== props.photo.id))
)
// 加载下一张时仍显示上一张，所有针对当前记录的操作必须等预览就绪。
const photoActionsDisabled = computed(
  () => props.isDeleting || rotating.value || isPreviewLoading.value
)
const imageOrientation = computed(() => {
  if (!imageAspectRatio.value) return 'pending'
  if (imageAspectRatio.value < 0.95) return 'portrait'
  if (imageAspectRatio.value > 1.05) return 'landscape'
  return 'square'
})
const lightboxPanelClass = computed(() => `lightbox-panel--${imageOrientation.value}`)

const lightboxLayout = computed(() => {
  if (!imageAspectRatio.value || !viewportSize.value.width || !viewportSize.value.height)
    return null
  const viewportWidth = viewportSize.value.width
  const viewportHeight = viewportSize.value.height
  // Controls float above the image instead of reserving header/footer space.
  const availableWidth = Math.max(1, viewportWidth - 16)
  const availableHeight = Math.max(1, viewportHeight - 16)
  const panelWidth = Math.min(availableWidth, availableHeight * imageAspectRatio.value)
  const stageHeight = panelWidth / imageAspectRatio.value
  return { panelWidth, stageHeight }
})

const lightboxPanelStyle = computed(() =>
  lightboxLayout.value && imageAspectRatio.value
    ? {
        '--lightbox-panel-width': `${lightboxLayout.value.panelWidth}px`,
        '--lightbox-stage-height': `${lightboxLayout.value.stageHeight}px`,
        '--lightbox-image-aspect-ratio': `${imageAspectRatio.value}`
      }
    : undefined
)

/** 鼠标切图不保留按钮焦点；键盘操作继续使用原生焦点提示。 */
function handleNavigationPointerDown(event: PointerEvent) {
  if (event.pointerType !== 'mouse') return
  event.preventDefault()
  ;(event.currentTarget as HTMLButtonElement).blur()
}

/** 同步当前可视窗口尺寸。参数：无。 */
function updateViewportSize() {
  viewportSize.value = {
    width: window.visualViewport?.width ?? window.innerWidth,
    height: window.visualViewport?.height ?? window.innerHeight
  }
  measureToolbar()
}

/** 优先读取并解码用户主动打开的原图；尺寸直接复用解码结果，不再二次探测。参数：nextPhoto 为待显示照片。 */
async function updateDisplayedPhoto(nextPhoto: PhotoItem | PreviewPhoto): Promise<void> {
  decodingPreview.value = true
  const opening = !displayedPhoto.value
  const currentToken = ++previewLoadToken
  previewAbortController?.abort()
  previewAbortController = new AbortController()

  try {
    const { width, height } =
      isAlbumPhoto(nextPhoto) || nextPhoto.loadImageBlob
        ? await loadPhotoWithRetryAndSize(nextPhoto, previewAbortController.signal)
        : await loadImageUrlWithSize(nextPhoto.url ?? '', previewAbortController.signal)
    if (currentToken !== previewLoadToken) return
    if (width && height) imageAspectRatio.value = width / height
    displayedPhoto.value = nextPhoto
    if (opening) showControls()
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return
    // 解码失败仍打开预览面板，由失败占位呈现
    if (currentToken === previewLoadToken) displayedPhoto.value = nextPhoto
  } finally {
    if (currentToken === previewLoadToken) decodingPreview.value = false
  }
}

watch(
  () => props.photo,
  (nextPhoto, previousPhoto) => {
    if (nextPhoto?.id !== previousPhoto?.id) rotationNotice.value = ''
    updateViewportSize()
    resetTransform()
    if (!previousPhoto || !nextPhoto) {
      toolbarHovered = false
      showControls()
    }
    if (!nextPhoto) {
      finishToolbarDrag()
      previewLoadToken += 1
      previewAbortController?.abort()
      previewAbortController = null
      displayedPhoto.value = null
      decodingPreview.value = false
      imageAspectRatio.value = null
      return
    }
    void updateDisplayedPhoto(nextPhoto)
  },
  { immediate: true }
)

/** 处理预览快捷键；确认弹窗等上层弹窗打开时不响应。参数：event 为键盘事件。 */
function handleKeydown(event: KeyboardEvent) {
  if (event.defaultPrevented || !props.photo || !props.keyboardEnabled || rotating.value) return
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') showControls()
  if (event.key === 'Escape') emit('close')
  if (event.key === 'ArrowLeft' && props.hasPrevious) emit('previous')
  if (event.key === 'ArrowRight' && props.hasNext) emit('next')
  if (
    event.key === 'Delete' &&
    !props.readOnly &&
    (props.mode === 'album' || props.mode === 'trash') &&
    !props.isDeleting &&
    !isPreviewLoading.value
  ) {
    event.preventDefault()
    props.mode === 'trash' ? emit('permanentlyDeleteCurrent') : emit('deleteCurrent')
  }
}

/** 恢复当前回收照片，切图加载期间忽略点击。参数：无。 */
function handleRestoreClick() {
  if (!props.readOnly && !photoActionsDisabled.value) emit('restoreCurrent')
}

/** 删除当前预览照片，切图加载期间忽略点击。参数：无。 */
function handleDeleteClick() {
  if (props.readOnly || photoActionsDisabled.value) return
  if (props.mode === 'home') return
  props.mode === 'trash' ? emit('permanentlyDeleteCurrent') : emit('deleteCurrent')
}

onMounted(() => {
  updateViewportSize()
  window.addEventListener('keydown', handleKeydown)
  window.addEventListener('resize', updateViewportSize)
  window.visualViewport?.addEventListener('resize', updateViewportSize)
})

onUnmounted(() => {
  finishToolbarDrag()
  toolbarObserver?.disconnect()
  previewLoadToken++
  clearControlsTimer()
  previewAbortController?.abort()
  window.removeEventListener('keydown', handleKeydown)
  window.removeEventListener('resize', updateViewportSize)
  window.visualViewport?.removeEventListener('resize', updateViewportSize)
})
</script>

<template>
  <Teleport to="body">
    <Transition name="lightbox">
      <div
        v-if="displayedPhoto"
        class="lightbox"
        role="dialog"
        aria-modal="true"
        @click.self="!rotating && emit('close')"
      >
        <GlassSurfaceFilter v-if="refractsBackdrop" :filter-id="glassFilterId" />
        <div class="lightbox-header">
          <div
            class="lightbox-caption material-surface preview-material"
            v-bind="glassSurfaceAttributes"
          >
            <strong
              >{{ dateMessages.displayDate(displayedPhoto.dateKey) }}
              {{ displayedPhoto.timeText }}</strong
            >
            <span v-if="mode !== 'home'">{{ displayedPhoto.fileSizeText }}</span>
            <span v-if="mode === 'album' && displayedPhoto.note">{{ displayedPhoto.note }}</span>
          </div>
          <button
            class="lightbox-close material-surface preview-material"
            v-bind="glassSurfaceAttributes"
            type="button"
            :title="messages.closeAria"
            :aria-label="messages.closeAria"
            :disabled="rotating"
            @click="emit('close')"
          >
            <X :size="19" />
          </button>
        </div>
        <div class="lightbox-panel" :class="lightboxPanelClass" :style="lightboxPanelStyle">
          <div
            class="lightbox-stage"
            @wheel="handleWheel"
            @pointerdown="startDrag"
            @pointermove="moveDrag"
            @pointerup="endDrag"
            @pointercancel="endDrag"
          >
            <Transition name="lightbox-photo">
              <img
                :key="displayedPhoto.id"
                :src="displayedPhoto.url ?? undefined"
                :alt="displayedPhoto.name"
                :style="imageTransform"
                draggable="false"
              />
            </Transition>
          </div>
        </div>
        <div class="lightbox-nav-zone lightbox-nav-zone--prev">
          <button
            v-if="hasPrevious"
            class="lightbox-nav-button material-surface preview-material"
            v-bind="glassSurfaceAttributes"
            type="button"
            :title="messages.previousAria"
            :aria-label="messages.previousAria"
            :disabled="rotating"
            @pointerdown="handleNavigationPointerDown"
            @click="emit('previous')"
          >
            <ChevronLeft :size="22" />
          </button>
        </div>
        <div class="lightbox-nav-zone lightbox-nav-zone--next">
          <button
            v-if="hasNext"
            class="lightbox-nav-button material-surface preview-material"
            v-bind="glassSurfaceAttributes"
            type="button"
            :title="messages.nextAria"
            :aria-label="messages.nextAria"
            :disabled="rotating"
            @pointerdown="handleNavigationPointerDown"
            @click="emit('next')"
          >
            <ChevronRight :size="22" />
          </button>
        </div>
        <div
          ref="toolbarFooter"
          class="lightbox-footer"
          :class="{ 'is-idle': !controlsVisible && toolbarDrag === null, 'is-top': !isCompactLayout && toolbarDock === 'top', 'is-dragging': toolbarDrag !== null }"
          :style="isCompactLayout ? undefined : toolbarStyle"
          @pointerenter="enterToolbar"
          @pointerleave="leaveToolbar"
          @pointerdown="showControls"
          @focusin="showControls"
          @focusout="showControls"
        >
          <span v-if="rotating || rotationNotice" role="status" class="lightbox-rotation-notice">{{
            rotating ? messages.rotating : rotationNotice
          }}</span>
          <div
            class="lightbox-toolbar material-surface preview-material"
            v-bind="glassSurfaceAttributes"
          >
            <button
              v-if="!isCompactLayout"
              type="button"
              class="lightbox-drag-handle"
              :title="messages.dragToolbar"
              :aria-label="messages.dragToolbar"
              @pointerdown.stop.prevent="startToolbarDrag"
              @pointermove.stop="moveToolbarDrag"
              @pointerup.stop="finishToolbarDrag"
              @pointercancel.stop="finishToolbarDrag"
              @lostpointercapture="finishToolbarDrag"
              @keydown="handleToolbarKeydown"
              @click.stop
            >
              <GripVertical :size="18" />
            </button>
            <div v-if="mode === 'outfit' && outfit && outfitMessages" class="lightbox-outfit-meta">
              <span
                ><strong>{{ outfitMessages.tagsTitle }}：</strong
                >{{ outfit.tags[0] || outfitMessages.uncategorized }}</span
              >
              <span
                ><strong>{{ outfitMessages.codeLabel }}：</strong
                >{{ outfit.code || outfitMessages.pending }}</span
              >
              <span v-if="outfit.note"
                ><strong>{{ outfitMessages.noteLabel }}：</strong>{{ outfit.note }}</span
              >
            </div>
            <div
              v-else-if="mode === 'home' && homeScheme && homeMessages"
              class="lightbox-outfit-meta"
            >
              <span
                ><strong>{{ homeMessages.tagsTitle }}：</strong
                >{{ homeScheme.tags[0] || homeMessages.uncategorized }}</span
              >
              <span
                ><strong>{{ homeMessages.code }}：</strong>{{ homeScheme.code }}</span
              >
              <span v-if="homeScheme.note"
                ><strong>{{ homeMessages.note }}：</strong>{{ homeScheme.note }}</span
              >
            </div>
            <slot name="metadata" />
            <div
              v-if="mode === 'outfit' || mode === 'home' || mode === 'camera'"
              class="lightbox-toolbar-divider"
              aria-hidden="true"
            ></div>
            <div class="lightbox-zoom-controls">
              <button
                type="button"
                :title="messages.zoomOut"
                :aria-label="messages.zoomOut"
                :disabled="zoom <= MIN_ZOOM"
                @click="setZoom(zoom - ZOOM_STEP)"
              >
                <ZoomOut :size="17" />
              </button>
              <button
                type="button"
                :title="messages.resetZoom"
                :aria-label="messages.resetZoom"
                @click="resetTransform"
                >{{ zoom }}%</button
              >
              <button
                type="button"
                :title="messages.zoomIn"
                :aria-label="messages.zoomIn"
                :disabled="zoom >= LIGHTBOX_MAX_ZOOM"
                @click="setZoom(zoom + ZOOM_STEP)"
              >
                <ZoomIn :size="17" />
              </button>
            </div>
            <button
              v-if="rotateSource"
              type="button"
              :title="readOnly ? readOnlyHint : messages.rotateSource"
              :aria-label="messages.rotateSource"
              :aria-busy="rotating"
              :disabled="readOnly || photoActionsDisabled"
              @click="rotateCurrent"
            >
              <RotateCw :size="17" />
            </button>
            <slot name="actions" :disabled="photoActionsDisabled" />
            <template v-if="mode === 'outfit' && outfitMessages">
              <button
                type="button"
                :title="outfitMessages.copy"
                :aria-label="outfitMessages.copy"
                :disabled="photoActionsDisabled || !outfit?.code"
                @click="!photoActionsDisabled && emit('copyOutfit')"
              >
                <Copy :size="18" />
              </button>
              <button
                type="button"
                :title="outfitMessages.edit"
                :aria-label="outfitMessages.edit"
                :disabled="photoActionsDisabled"
                @click="!photoActionsDisabled && emit('editOutfit')"
              >
                <Edit3 :size="18" />
              </button>
            </template>
            <template v-else-if="mode === 'home' && homeScheme && homeMessages">
              <button
                type="button"
                :title="homeMessages.copy"
                :aria-label="homeMessages.copy"
                :disabled="photoActionsDisabled"
                @click="!photoActionsDisabled && emit('copyHomeScheme')"
                ><Copy :size="18"
              /></button>
              <button
                type="button"
                :title="homeMessages.edit"
                :aria-label="homeMessages.edit"
                :disabled="photoActionsDisabled"
                @click="!photoActionsDisabled && emit('editHomeScheme')"
                ><Edit3 :size="18"
              /></button>
            </template>
            <button
              v-if="mode === 'album'"
              type="button"
              :title="messages.parsePhoto"
              :aria-label="messages.parsePhoto"
              :disabled="photoActionsDisabled"
              @click="!photoActionsDisabled && emit('parsePhoto')"
              ><ScanSearch :size="18"
            /></button>
            <button
              v-if="mode === 'album'"
              type="button"
              :title="readOnly ? readOnlyHint : messages.editNote"
              :aria-label="messages.editNote"
              :disabled="photoActionsDisabled || readOnly"
              @click="!readOnly && !photoActionsDisabled && emit('editPhotoNote')"
              ><Pencil :size="18"
            /></button>
            <button
              v-if="mode === 'album'"
              type="button"
              :class="{ active: isFavorite }"
              :title="
                readOnly ? readOnlyHint : isFavorite ? messages.removeFavorite : messages.favorite
              "
              :aria-label="isFavorite ? messages.removeFavorite : messages.favorite"
              :disabled="photoActionsDisabled || readOnly"
              @click="!readOnly && !photoActionsDisabled && emit('toggleFavorite')"
            >
              <Heart :size="18" :fill="isFavorite ? 'currentColor' : 'none'" />
            </button>
            <button
              v-else-if="mode === 'trash'"
              type="button"
              :class="{ 'is-preview-loading': isPreviewLoading }"
              :disabled="isDeleting || rotating || readOnly"
              :aria-disabled="isPreviewLoading || undefined"
              :title="messages.restoreCurrent"
              @click="handleRestoreClick"
            >
              <RotateCcw :size="18" />
            </button>
            <button
              v-if="mode === 'album' || mode === 'trash'"
              class="lightbox-delete"
              type="button"
              :class="{ 'is-preview-loading': isPreviewLoading }"
              :disabled="isDeleting || rotating || readOnly"
              :aria-disabled="isPreviewLoading || undefined"
              :title="
                readOnly
                  ? readOnlyHint
                  : mode === 'trash'
                    ? messages.permanentlyDeleteCurrent
                    : messages.deleteCurrent
              "
              @click="handleDeleteClick"
            >
              <Trash2 :size="18" />
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
