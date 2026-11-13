<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, shallowRef, watch, watchEffect } from 'vue'
import { Download, ImagePlus, Images, RotateCcw, X } from 'lucide-vue-next'
import { useModalFocus } from '../composables/useModalFocus'
import { useBodyScrollLock } from '../utils/bodyScrollLock'
import { requestBlobDownload } from '../utils/backup/downloadFallback'
import { IMAGEKIT_IMAGES, encodeImagePath } from '../utils/imagekit'
import { avatarSize, cropBounds, drawAvatar, frameRadius } from '../utils/avatarSimulator'
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
const close = async () => {
  active.value = false
  await nextTick()
  emit('close')
}
useModalFocus(active, panel, close)
useBodyScrollLock(active)

const catalog = computed(() =>
  Object.entries(frames).map(([id, file]) => ({
    id,
    name: (props.language === 'zh' ? zh : en)[id as keyof typeof zh].name,
    url: IMAGEKIT_IMAGES + 'headframes/' + encodeImagePath(file)
  }))
)
const selected = ref('1070020004')
const current = computed(() => catalog.value.find((entry) => entry.id === selected.value)!)
const frame = shallowRef<HTMLImageElement | null>(null)
const photo = shallowRef<HTMLImageElement | null>(null)
const radius = ref(376)
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
const loadingPhoto = ref(false),
  saving = ref(false)
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
      radius.value = frameRadius(img)
      frame.value = img
    } catch {
      if (!stale) frameFailed.value = true
    }
  },
  { immediate: true, flush: 'sync' }
)

function reset() {
  zoom.value = 1
  x.value = y.value = 0
}
async function choosePhoto(source: Blob | PhotoDisplayItem) {
  const request = ++photoRequest
  photo.value = null
  loadingPhoto.value = true
  album.value = photoFailed.value = saveFailed.value = false
  let url: string | undefined
  try {
    const blob = source instanceof Blob ? source : await readPhotoBlob(source)
    if (request !== photoRequest) return
    url = URL.createObjectURL(blob)
    const img = new Image()
    img.src = url
    await img.decode()
    if (request !== photoRequest) return
    reset()
    photo.value = img
  } catch {
    if (request === photoRequest) photoFailed.value = true
  } finally {
    if (url) URL.revokeObjectURL(url)
    if (request === photoRequest) loadingPhoto.value = false
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
watchEffect(
  () => {
    if (canvas.value)
      drawAvatar(canvas.value, photo.value, frame.value, radius.value, zoom.value, x.value, y.value)
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
  const factor = avatarSize / (canvas.value.getBoundingClientRect().width * radius.value * 2)
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
    <div
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
            <div class="stage">
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
            <div class="actions">
              <button
                :disabled="!photos.length"
                :title="!photos.length ? t('请先打开相册', 'Open an album first') : undefined"
                :aria-pressed="album"
                @click="album = !album"
                ><Images :size="16" />{{ t('从相册选择', 'Choose from album') }}</button
              >
              <button @click="input?.click()"
                ><ImagePlus :size="16" />{{ t('上传照片', 'Upload photo') }}</button
              >
              <input ref="input" type="file" hidden accept="image/*" @change="upload" />
            </div>
            <div class="crop-controls">
              <label
                >{{ t('缩放', 'Zoom') }}
                <input
                  v-model.number="zoom"
                  type="range"
                  min="1"
                  max="4"
                  step="0.01"
                  :disabled="!photo"
              /></label>
              <button
                :disabled="!photo"
                :title="t('重置取景', 'Reset crop')"
                :aria-label="t('重置取景', 'Reset crop')"
                @click="reset"
                ><RotateCcw :size="16"
              /></button>
            </div>
            <small v-if="photo">{{
              t('拖动照片调整位置', 'Drag the photo to reposition it')
            }}</small>
            <p role="status" v-if="photoFailed">{{
              t('照片读取失败，请重新选择。', 'Could not read this photo. Choose another image.')
            }}</p>
            <p role="status" v-if="loadingPhoto">{{ t('正在读取照片…', 'Loading photo…') }}</p>
            <p role="status" v-if="frameFailed"
              >{{ t('头像框加载失败。', 'Could not load this frame.') }}
              <button @click="retry++">{{ t('重试', 'Retry') }}</button></p
            >
            <p role="status" v-if="saveFailed">{{
              t('保存失败，请重试。', 'Could not save the avatar. Try again.')
            }}</p>
            <button
              class="primary-button save-avatar"
              :disabled="!photo || !frame || saving"
              @click="save"
              ><Download :size="16" />{{ t('保存头像', 'Save avatar') }} · PNG</button
            >
          </div>
          <section class="library">
            <div class="library-heading"
              ><h3>{{ album ? t('选择照片', 'Choose a photo') : t('头像框', 'Avatar frames') }}</h3>
              <button v-if="album" @click="album = false">{{
                t('返回头像框', 'Back to frames')
              }}</button>
            </div>
            <div v-if="album" class="items" key="photos">
              <div v-for="item in photos.slice(0, shown)" :key="item.id" class="photo-choice">
                <LazyPhotoImage
                  :photo="item"
                  :load-photo="thumbnail"
                  :use-source-url="false"
                  :failure-text="t('加载失败', 'Image unavailable')"
                />
                <button
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
                :aria-pressed="selected === f.id"
                @click="selected = f.id"
              >
                <img
                  :src="f.url"
                  alt=""
                  loading="lazy"
                  decoding="async"
                  referrerpolicy="strict-origin-when-cross-origin"
                /><span>{{ f.name }}</span>
              </button>
            </div>
          </section>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.avatar-overlay {
  z-index: 160;
}
.avatar-panel {
  color: var(--text);
  height: auto;
}
.avatar-panel > header {
  flex-shrink: 0;
}
.avatar-body {
  flex: 0 1 auto;
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
  border-radius: 20px;
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
.actions,
.crop-controls,
.library-heading {
  display: flex;
  align-items: center;
  gap: 8px;
}
.actions,
.crop-controls {
  margin-top: 12px;
}
.actions {
  flex-wrap: wrap;
}
.avatar-body button {
  color: inherit;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--surface-strong);
  padding: 7px 9px;
}
.actions button,
.save-avatar,
.crop-controls button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}
.avatar-body button:disabled {
  opacity: 0.5;
}
.crop-controls label {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
}
.crop-controls input {
  min-width: 0;
  flex: 1;
}
.editor small {
  display: block;
  margin: 6px 0;
  color: var(--muted);
}
.avatar-body .save-avatar {
  margin-top: 12px;
  width: 100%;
  background: var(--text);
  color: var(--surface-strong);
}
.library {
  display: flex;
  flex-direction: column;
  border-left: 1px solid var(--line);
}
.library-heading {
  justify-content: space-between;
  margin-bottom: 10px;
}
.items {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(78px, 1fr));
  align-content: start;
  gap: 8px;
  overflow: auto;
  min-height: 0;
  max-height: min(600px, calc(100dvh - 190px));
  padding: 2px;
}
.frame-items {
  grid-template-columns: repeat(auto-fill, minmax(112px, 1fr));
  max-height: min(510px, calc(100dvh - 190px));
}
.frame-items button {
  display: grid;
  justify-items: center;
  align-content: center;
  gap: 6px;
  min-height: 108px;
}
.frame-items button img {
  width: 64px;
}
.items button {
  min-width: 0;
}
.items button[aria-pressed='true'] {
  border-color: var(--text);
  box-shadow: inset 0 0 0 1px var(--text);
  background: var(--icon-button-bg);
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
  aspect-ratio: 1;
  overflow: hidden;
  border-radius: 8px;
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
}
@media (max-width: 640px) {
  .avatar-panel {
    border-radius: 20px;
  }
  .avatar-body {
    grid-template-columns: 1fr;
  }
  .editor,
  .library {
    padding: 14px;
  }
  .library {
    border-left: 0;
    border-top: 1px solid var(--line);
  }
  .stage canvas {
    max-width: min(22dvh, 176px);
    max-height: min(22dvh, 176px);
  }
  .items {
    max-height: 30dvh;
  }
}
</style>
