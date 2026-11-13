<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef, watch, watchEffect } from 'vue'
import { Download, ImagePlus, Images, LoaderCircle, Quote, Sparkles, X } from 'lucide-vue-next'
import { useModalFocus } from '../composables/useModalFocus'
import { useBodyScrollLock } from '../utils/bodyScrollLock'
import { requestBlobDownload } from '../utils/backup/downloadFallback'
import { IMAGEKIT_IMAGES, encodeImagePath } from '../utils/imagekit'
import { avatarPhotoRadius, avatarSize, cropBounds, drawAvatar } from '../utils/avatarSimulator'
import { readPhotoBlob } from '../utils/file-system/photoUrl'
import { createPhotoThumbnailCache } from '../utils/photoThumbnail'
import type { PhotoDisplayItem } from '../utils/photoGrouping'
import type { Language } from '../i18n/types'
import frames from '../data/profile/headFrameImageMap.json'
import zh from '../data/profile/locales/zh/headFrames.json'
import en from '../data/profile/locales/en/headFrames.json'
import LazyPhotoImage from './LazyPhotoImage.vue'

const props = defineProps<{ photos: PhotoDisplayItem[]; language: Language }>()
const emit = defineEmits<{ close: [] }>()
const t = (cn: string, english: string) => (props.language === 'zh' ? cn : english)
const panel = ref<HTMLElement | null>(null)
const active = ref(true)
const close = () => {
  active.value = false
}
useModalFocus(active, panel, close)
useBodyScrollLock(active)

const catalog = computed(() =>
  Object.entries(frames).map(([id, file]) => ({
    id,
    name: (props.language === 'zh' ? zh : en)[id as keyof typeof zh].name,
    description: (props.language === 'zh' ? zh : en)[id as keyof typeof zh].description,
    url: IMAGEKIT_IMAGES + 'headframes/' + encodeImagePath(file)
  }))
)
const selected = ref('1070020004')
const current = computed(() => catalog.value.find((entry) => entry.id === selected.value)!)
const frame = shallowRef<HTMLImageElement | null>(null)
const photo = shallowRef<HTMLImageElement | null>(null)
const zoom = ref(1),
  x = ref(0),
  y = ref(0)
const canvas = ref<HTMLCanvasElement | null>(null)
const input = ref<HTMLInputElement | null>(null)
const album = ref(false)
const pageSize = 48
const shown = ref(pageSize)
const thumbs = createPhotoThumbnailCache()
const thumbnail = (item: PhotoDisplayItem, signal?: AbortSignal) => thumbs.load(item, signal!, 256)
const frameFailed = ref(false),
  photoFailed = ref(false),
  saveFailed = ref(false)
const saving = ref(false)
const retry = ref(0)
let photoRequest = 0
let disposed = false

watch(
  [() => current.value.url, retry],
  async ([url], _, cleanup) => {
    frame.value = null
    frameFailed.value = false
    let stale = false
    const img = new Image()
    cleanup(() => {
      stale = true
      img.removeAttribute('src')
    })
    img.crossOrigin = 'anonymous'
    img.referrerPolicy = 'strict-origin-when-cross-origin'
    img.src = url
    try {
      await img.decode()
      if (stale) return
      frame.value = img
    } catch {
      if (!stale) frameFailed.value = true
    }
  },
  { immediate: true, flush: 'sync' }
)

async function choosePhoto(source: Blob | PhotoDisplayItem) {
  const request = ++photoRequest
  photo.value = null
  photoFailed.value = saveFailed.value = false
  let url: string | undefined
  try {
    const blob = source instanceof Blob ? source : await readPhotoBlob(source)
    if (request !== photoRequest) return
    url = URL.createObjectURL(blob)
    const img = new Image()
    img.src = url
    await img.decode()
    if (request !== photoRequest) return
    zoom.value = 1
    x.value = y.value = 0
    photo.value = img
  } catch {
    if (request === photoRequest) photoFailed.value = true
  } finally {
    if (url) URL.revokeObjectURL(url)
  }
}
function upload(e: Event) {
  const el = e.target as HTMLInputElement
  const file = el.files?.[0]
  el.value = ''
  if (file) void choosePhoto(file)
}
function clampCrop() {
  if (!photo.value) return
  const { limitX, limitY } = cropBounds(photo.value, zoom.value)
  x.value = Math.min(limitX, Math.max(-limitX, x.value))
  y.value = Math.min(limitY, Math.max(-limitY, y.value))
}
watch(zoom, clampCrop, { flush: 'sync' })
function zoomWithWheel(event: WheelEvent) {
  if (!photo.value || !event.deltaY) return
  event.preventDefault()
  let delta = event.deltaY
  if (event.deltaMode === 1) delta *= 16
  if (event.deltaMode === 2) delta *= canvas.value?.clientHeight ?? avatarSize
  delta = Math.max(-100, Math.min(100, delta))
  zoom.value = Math.min(4, Math.max(1, zoom.value * Math.exp(-delta * 0.002)))
}
watchEffect(
  () => {
    if (canvas.value)
      drawAvatar(canvas.value, photo.value, frame.value, zoom.value, x.value, y.value)
  },
  { flush: 'post' }
)

let drag: { id: number; x: number; y: number } | null = null
function startDrag(e: PointerEvent) {
  if (!photo.value || !canvas.value || drag || e.button !== 0) return
  canvas.value.setPointerCapture(e.pointerId)
  drag = { id: e.pointerId, x: e.clientX, y: e.clientY }
}
function move(e: PointerEvent) {
  if (!drag || e.pointerId !== drag.id || !canvas.value) return
  const factor = avatarSize / (canvas.value.getBoundingClientRect().width * avatarPhotoRadius * 2)
  x.value += (e.clientX - drag.x) * factor
  y.value += (e.clientY - drag.y) * factor
  drag.x = e.clientX
  drag.y = e.clientY
  clampCrop()
}
function endDrag(event: PointerEvent) {
  if (drag?.id === event.pointerId) drag = null
}
async function save() {
  if (!canvas.value || !photo.value || !frame.value || saving.value) return
  const name = current.value.name
  saving.value = true
  saveFailed.value = false
  try {
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.value!.toBlob(resolve, 'image/png')
    )
    if (!blob) throw new Error('PNG encoding failed')
    if (!disposed) requestBlobDownload(name + '.png', blob)
  } catch {
    saveFailed.value = true
  } finally {
    saving.value = false
  }
}
onBeforeUnmount(() => {
  disposed = true
  photoRequest++
  thumbs.dispose()
})
</script>

<template>
  <Teleport to="body">
    <Transition name="confirm-dialog" appear @after-leave="emit('close')">
      <div
        v-if="active"
        class="dialog-overlay avatar-overlay"
        role="dialog"
        aria-modal="true"
        aria-labelledby="avatar-title"
        @click.self="close"
      >
        <section ref="panel" class="dialog-panel avatar-panel" tabindex="-1">
          <header
            ><h2 id="avatar-title">{{ t('头像模拟器', 'Avatar simulator') }}</h2
            ><button :aria-label="t('关闭', 'Close')" @click="close"><X :size="19" /></button
          ></header>
          <div class="avatar-body">
            <div class="editor">
              <div class="preview-summary">
                <div class="stage" @wheel="zoomWithWheel">
                  <canvas
                    ref="canvas"
                    :width="avatarSize"
                    :height="avatarSize"
                    :aria-label="t('头像预览', 'Avatar preview')"
                    @pointerdown="startDrag"
                    @pointermove="move"
                    @lostpointercapture="endDrag"
                  />
                </div>
                <div
                  class="frame-description"
                  :aria-label="t('头像框描述', 'Avatar frame description')"
                  aria-live="polite"
                >
                  <Quote :size="20" aria-hidden="true" />
                  <p tabindex="0">{{ current.description }}</p>
                  <Sparkles :size="17" aria-hidden="true" />
                </div>
              </div>
              <div class="editor-controls">
                <div class="actions">
                  <button
                    class="confirm-dialog-button ghost dialog-action-control album-toggle"
                    :disabled="!photos.length"
                    :title="!photos.length ? t('请先打开相册', 'Open an album first') : undefined"
                    :aria-pressed="album"
                    @click="album = !album"
                    ><Images :size="16" />{{
                      album
                        ? t('返回头像框', 'Back to frames')
                        : t('从相册选择', 'Choose from album')
                    }}</button
                  >
                  <button
                    class="confirm-dialog-button ghost dialog-action-control upload-photo"
                    @click="input?.click()"
                    ><ImagePlus :size="16" />{{ t('上传照片', 'Upload photo') }}</button
                  >
                  <input ref="input" type="file" hidden accept="image/*" @change="upload" />
                </div>
                <button
                  class="primary-button save-avatar"
                  :disabled="!photo || !frame || saving"
                  :aria-busy="saving"
                  @click="save"
                  ><LoaderCircle
                    v-if="saving"
                    class="saving-spinner"
                    :size="16"
                    aria-hidden="true"
                  />
                  <Download v-else :size="16" aria-hidden="true" />{{
                    saving ? t('正在保存…', 'Saving…') : t('保存', 'Save')
                  }}</button
                >
                <div class="crop-controls">
                  <label
                    ><span class="zoom-label">{{ t('缩放', 'Zoom') }}</span>
                    <span class="zoom-slider" :class="{ 'is-disabled': !photo }">
                      <span
                        class="photo-params-slider"
                        :style="{ '--photo-params-slider-ratio': (zoom - 1) / 3 }"
                        aria-hidden="true"
                        ><i></i
                      ></span>
                      <input
                        v-model.number="zoom"
                        :aria-label="t('缩放', 'Zoom')"
                        type="range"
                        min="1"
                        max="4"
                        step="0.01"
                        :disabled="!photo"
                      /> </span
                  ></label>
                </div>
                <p role="status" v-if="photoFailed">{{
                  t(
                    '照片读取失败，请重新选择。',
                    'Could not read this photo. Choose another image.'
                  )
                }}</p>
                <p role="status" v-if="frameFailed"
                  >{{ t('头像框加载失败。', 'Could not load this frame.') }}
                  <button @click="retry++">{{ t('重试', 'Retry') }}</button></p
                >
                <p role="status" v-if="saveFailed">{{
                  t('保存失败，请重试。', 'Could not save the avatar. Try again.')
                }}</p>
              </div>
            </div>
            <section
              class="library"
              :aria-label="album ? t('选择照片', 'Choose a photo') : t('头像框', 'Avatar frames')"
            >
              <div class="library-list">
                <Transition name="avatar-library" mode="out-in">
                  <div v-if="album" class="items" key="photos">
                    <div v-for="item in photos.slice(0, shown)" :key="item.id" class="photo-choice">
                      <LazyPhotoImage
                        :photo="item"
                        :load-photo="thumbnail"
                        :use-source-url="false"
                        :failure-text="t('加载失败', 'Image unavailable')"
                      />
                      <button
                        class="photo-select"
                        :title="item.name"
                        :aria-label="item.name"
                        @click="choosePhoto(item)"
                      ></button>
                    </div>
                    <button v-if="photos.length > shown" @click="shown += pageSize">{{
                      t('更多照片', 'More photos')
                    }}</button>
                  </div>
                  <div v-else class="items frame-items" key="frames">
                    <button
                      v-for="f in catalog"
                      :key="f.id"
                      class="frame-choice"
                      :aria-pressed="selected === f.id"
                      @click="selected = f.id"
                    >
                      <span class="frame-preview"
                        ><img
                          :src="f.url"
                          alt=""
                          loading="lazy"
                          decoding="async"
                          referrerpolicy="strict-origin-when-cross-origin" /></span
                      ><span class="frame-name">{{ f.name }}</span>
                    </button>
                  </div>
                </Transition>
              </div>
            </section>
          </div>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.avatar-overlay {
  z-index: 160;
}
.avatar-panel {
  color: var(--text);
  height: min(720px, calc(100dvh - 48px));
}
.avatar-panel > header {
  flex-shrink: 0;
}
.avatar-panel:focus {
  outline: none;
}
.avatar-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  display: grid;
  grid-template-columns: minmax(280px, 26%) minmax(0, 1fr);
}
.editor,
.library {
  min-width: 0;
  padding: 20px 24px 24px;
}
.stage {
  display: grid;
  place-items: center;
  aspect-ratio: 1;
  background: var(--icon-button-bg);
  border-radius: var(--radius-lg);
}
.stage canvas {
  display: block;
  width: 100%;
  max-height: min(36dvh, 224px);
  max-width: min(36dvh, 224px);
  aspect-ratio: 1;
  touch-action: none;
  cursor: grab;
}
.stage canvas:active {
  cursor: grabbing;
}
.frame-description {
  display: grid;
  grid-template-rows: 20px minmax(0, 1fr) 17px;
  gap: 5px;
  height: 144px;
  margin: 12px 0 0;
  padding: 12px;
  border-radius: var(--radius-md);
  background: var(--surface-accent-subtle);
}
.frame-description > svg {
  color: var(--notice-warning);
  color: color-mix(in srgb, var(--notice-warning) 75%, var(--heading));
  opacity: 0.65;
}
.frame-description > svg:last-child {
  justify-self: end;
}
.frame-description p {
  margin: 0;
  min-height: 0;
  overflow: auto;
  color: var(--text);
  font-size: 12px;
  line-height: 1.9;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
  scrollbar-width: thin;
  scrollbar-color: var(--scrollbar-thumb) transparent;
}
.frame-description p:focus-visible {
  outline: 2px solid var(--focus-ring-color);
  outline-offset: 2px;
}
.actions,
.crop-controls {
  display: flex;
  align-items: center;
  gap: 8px;
}
.editor-controls {
  display: flex;
  flex-direction: column;
}
.editor-controls > p {
  order: 1;
}
.editor-controls .save-avatar {
  order: 2;
}
.actions,
.crop-controls {
  margin-top: 12px;
}
.actions {
  flex-wrap: wrap;
}
.actions .confirm-dialog-button {
  flex: 1;
  padding: 10px 8px;
  white-space: nowrap;
}
.avatar-body
  button:not(.primary-button):not(.confirm-dialog-button):not(.photo-select):not(.frame-choice) {
  color: inherit;
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  background: var(--surface-strong);
  padding: 7px 9px;
}
.actions button,
.save-avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}
.avatar-body button:disabled {
  opacity: 0.55;
  transform: none;
  box-shadow: none;
  cursor: not-allowed;
}
.crop-controls label {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
}
.zoom-slider {
  position: relative;
  min-width: 0;
  flex: 1;
  padding-block: 12px;
}
.zoom-slider:has(input:focus-visible) {
  outline: 2px solid var(--focus-ring-color);
  outline-offset: 3px;
  border-radius: var(--radius-sm);
}
.zoom-slider.is-disabled {
  opacity: 0.55;
}
.zoom-slider input {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  margin: 0;
  opacity: 0;
  cursor: pointer;
}
.zoom-slider input:disabled {
  cursor: not-allowed;
}
.avatar-body .save-avatar {
  margin-top: 12px;
  width: 100%;
  min-height: 46px;
  border-radius: var(--ui-radius);
  font-size: 14px;
}
.library {
  display: flex;
  flex-direction: column;
  border-left: 1px solid var(--line);
  padding: 0;
}
.library-list {
  flex: 1 1 0;
  min-height: 0;
  overflow: hidden;
}
.items {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(78px, 1fr));
  grid-auto-rows: max-content;
  align-content: start;
  gap: 8px;
  overflow: auto;
  min-height: 0;
  overscroll-behavior: contain;
  scrollbar-width: thin;
  scrollbar-color: var(--scrollbar-thumb) transparent;
  height: 100%;
  padding: 20px 24px 0;
}
.frame-items {
  grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
}
.frame-choice {
  display: grid;
  justify-items: center;
  align-content: start;
  gap: 6px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--text);
  text-align: center;
}
.frame-preview {
  display: grid;
  place-items: center;
  width: min(100%, 96px);
  aspect-ratio: 1;
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  background: var(--surface-strong);
}
.frame-name {
  overflow-wrap: anywhere;
  line-height: 1.4;
}
.frame-items button img {
  width: 76px;
}
.items button {
  min-width: 0;
}
.frame-choice[aria-pressed='true'] .frame-preview {
  border-color: var(--pink-deep);
  box-shadow: 0 0 6px 1px var(--share-pink);
  background: var(--menu-selected-bg);
}
.frame-choice:focus-visible {
  outline: none;
}
.frame-choice:focus-visible .frame-preview {
  outline: 2px solid var(--focus-ring-color);
  outline-offset: 2px;
}
.avatar-panel button:hover:not(:active) {
  transform: none;
}
@media (hover: hover) {
  .avatar-body
    button:not(.primary-button):not(.confirm-dialog-button):not(.photo-select):not(
      .frame-choice
    ):hover:not(:disabled) {
    border-color: var(--interactive-hover-border);
    background: var(--interactive-hover-bg);
  }
  .frame-choice:hover .frame-preview {
    border-color: var(--interactive-hover-border);
    background: var(--interactive-hover-bg);
    box-shadow: var(--photo-hover-shadow);
  }
}
@media (prefers-reduced-motion: no-preference) {
  .frame-preview {
    transition:
      background var(--motion-fast) ease,
      border-color var(--motion-fast) ease,
      box-shadow var(--motion-fast) ease;
  }
  .avatar-body button:not(.primary-button):not(.confirm-dialog-button) {
    transition:
      background var(--motion-fast) ease,
      border-color var(--motion-fast) ease,
      box-shadow var(--motion-fast) ease,
      transform var(--motion-base) var(--ease-spring);
  }
  .avatar-body button:not(.primary-button):active:not(:disabled) {
    transform: scale(0.97);
  }
  .avatar-library-enter-active,
  .avatar-library-leave-active {
    transition:
      opacity var(--motion-fast) ease,
      transform var(--motion-fast) ease;
  }
  .avatar-library-enter-from {
    opacity: 0;
    transform: translateY(4px);
  }
  .avatar-library-leave-to {
    opacity: 0;
    transform: translateY(-4px);
  }
  .saving-spinner {
    animation: operation-notice-spin 1s linear infinite;
  }
}
@media (prefers-reduced-motion: reduce) {
  .avatar-panel button,
  .avatar-panel > header button {
    transition: none;
  }
  .avatar-panel button:hover,
  .avatar-panel button:active:not(:disabled) {
    transform: none;
  }
}
.items img {
  width: 100%;
  aspect-ratio: 1;
  object-fit: contain;
  display: block;
}
.items span {
  font-size: 12px;
}
.photo-choice {
  position: relative;
  align-self: start;
  aspect-ratio: 1;
  overflow: hidden;
  border-radius: 8px;
}
.photo-choice :deep(.lazy-photo-image) {
  position: absolute;
  inset: 0;
}
.photo-choice :deep(img) {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.photo-choice > button {
  position: absolute;
  inset: 0;
  background: transparent;
  width: 100%;
  height: 100%;
  border: 0;
  padding: 0;
}
.photo-choice > button:focus-visible {
  outline-offset: -3px;
}
.actions button[aria-pressed='true'] {
  border-color: var(--pink-deep);
  background: var(--menu-selected-bg);
}
@media (max-width: 899px) {
  .avatar-panel {
    height: var(--mobile-dialog-space);
  }
}
@media (max-width: 640px) {
  .avatar-panel {
    border-radius: 20px;
  }
  .avatar-body {
    grid-template-columns: 1fr;
    grid-template-rows: auto minmax(0, 1fr);
  }
  .editor,
  .library {
    min-height: 0;
    padding: 14px;
  }
  .library {
    border-left: 0;
    border-top: 1px solid var(--line);
    padding: 0;
  }
  .items {
    padding-top: 14px;
    padding-inline: 14px;
  }
  .frame-items {
    grid-template-columns: repeat(auto-fill, minmax(76px, 1fr));
  }
  .frame-preview {
    width: min(100%, 76px);
  }
  .frame-items button img {
    width: 60px;
  }
  .preview-summary {
    display: grid;
    grid-template-columns: min(42%, 144px) minmax(0, 1fr);
    align-items: stretch;
    gap: 12px;
  }
  .frame-description {
    min-width: 0;
    height: auto;
    min-height: 0;
    margin-top: 0;
    contain: size;
  }
  .editor-controls {
    display: grid;
    grid-template-columns: auto auto minmax(0, 1fr);
    align-items: center;
    gap: 8px;
    margin-top: 12px;
  }
  .editor-controls .actions {
    display: contents;
  }
  .actions .album-toggle,
  .zoom-label {
    display: none;
  }
  .editor-controls .upload-photo,
  .editor-controls .save-avatar {
    height: 36px;
    min-height: 36px;
    padding-block: 0;
    font-size: 10px;
    line-height: 1.4;
  }
  .actions .upload-photo {
    grid-row: 1;
    grid-column: 1;
    gap: 4px;
    padding-inline: 10px;
  }
  .editor-controls .save-avatar {
    grid-row: 1;
    grid-column: 2;
    width: auto;
    margin-top: 0;
    padding-inline: 10px;
    gap: 4px;
    white-space: nowrap;
  }
  .editor-controls .crop-controls {
    grid-row: 1;
    grid-column: 3;
    min-width: 0;
    margin-top: 0;
  }
  .editor-controls > p {
    grid-column: 1 / -1;
  }
  .stage canvas {
    max-width: 100%;
    max-height: none;
  }
}
</style>
