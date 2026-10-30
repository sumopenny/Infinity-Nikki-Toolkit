<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { Download, RefreshCw, X, ZoomIn, ZoomOut } from 'lucide-vue-next'
import type { PhotoParamsResult } from '../utils/photo-params/types'
import { loadItemCatalog } from '../utils/outfit/itemCatalog'
import { buildParseItems } from '../utils/outfit/parseItemView'
import { loadShareImage, renderShareImage } from '../utils/shareImage'
import { useImageZoom, MIN_ZOOM, MAX_ZOOM, ZOOM_STEP } from '../composables/useImageZoom'
import { useModalFocus } from '../composables/useModalFocus'
import { useBodyScrollLock } from '../utils/bodyScrollLock'
import { reportError } from '../utils/errorReporting/errorReporter'

const props = defineProps<{
  language: 'zh' | 'en'
  result?: PhotoParamsResult | null
  code?: string
  loadPhoto?: () => Promise<Blob>
  name?: string
  preparing?: boolean
  preparationError?: string | null
  preparationMessage?: string
  uidRequired?: boolean
}>()
const emit = defineEmits<{ close: []; submitUid: [uid: string]; retryPreparation: [] }>()
const en = computed(() => props.language === 'en')
const panel = ref<HTMLElement | null>(null)
const active = ref(true)
const shown = ref(true)
const close = () => {
  renderController?.abort()
  generation++
  shown.value = false
}
useModalFocus(active, panel, close)
useBodyScrollLock(active)
const parameters = ref(true),
  clothes = ref(!!props.result?.outfit?.wearingClothes.length),
  cameraCode = ref(!!props.result?.rawCameraParams)
const source = shallowRef<HTMLImageElement | null>(null)
const preview = ref(''),
  busy = ref(false),
  error = ref('')
const uidInput = ref('')
const loading = computed(() => (props.preparing ? !props.preparationError : busy.value))
const zoomDisabled = computed(
  () => props.preparing || busy.value || !!error.value || !preview.value
)
const { zoom, imageTransform, resetTransform, setZoom, handleWheel, startDrag, moveDrag, endDrag } =
  useImageZoom(() => !zoomDisabled.value)
watch(preview, resetTransform)
let sourceUrl = '',
  generation = 0,
  sourceGeneration = 0,
  alive = true
let renderedBlob: Blob | null = null
let renderController: AbortController | undefined
const label = (zh: string, english: string) => (en.value ? english : zh)

async function setSource(blob: Blob) {
  renderController?.abort()
  const request = ++sourceGeneration
  generation++
  renderedBlob = null
  source.value = null
  error.value = ''
  busy.value = true
  const url = URL.createObjectURL(blob)
  try {
    const image = await loadShareImage(url)
    if (!alive || request !== sourceGeneration) {
      URL.revokeObjectURL(url)
      return
    }
    if (sourceUrl) URL.revokeObjectURL(sourceUrl)
    sourceUrl = url
    source.value = image
  } catch (cause) {
    reportError(cause, { module: 'share-image', action: 'load', stage: 'decode-source' })
    URL.revokeObjectURL(url)
    if (alive && request === sourceGeneration) {
      error.value = label(
        '无法读取对应图片，请重试。',
        'Unable to read the matching image. Please retry.'
      )
      busy.value = false
    }
  }
}
async function loadOriginal() {
  if (!props.loadPhoto) {
    error.value = label(
      '搭配库中没有该码对应的图片，暂时无法导出分享图。',
      'No image is available for this code in your outfit library. Share export is unavailable.'
    )
    return
  }
  busy.value = true
  error.value = ''
  try {
    const blob = await props.loadPhoto()
    if (alive) await setSource(blob)
  } catch (cause) {
    reportError(cause, { module: 'share-image', action: 'load', stage: 'read-source' })
    if (alive) {
      busy.value = false
      error.value = label('无法读取源照片，请重试。', 'Unable to read original photo. Retry.')
    }
  }
}
async function generate() {
  renderController?.abort()
  const controller = new AbortController()
  renderController = controller
  const run = ++generation
  renderedBlob = null
  if (props.preparing || !source.value) return
  busy.value = true
  error.value = ''
  try {
    const items =
      clothes.value && props.result?.outfit
        ? buildParseItems(props.result.outfit, await loadItemCatalog(), props.language)
        : []
    if (!alive || run !== generation) return
    const blob = await renderShareImage({
      signal: controller.signal,
      image: source.value,
      result: props.result,
      items,
      modules: { parameters: parameters.value, clothes: clothes.value, code: cameraCode.value },
      outfitCode: props.code,
      english: en.value
    })
    if (!alive || run !== generation) return
    if (preview.value) URL.revokeObjectURL(preview.value)
    preview.value = URL.createObjectURL(blob)
    renderedBlob = blob
  } catch (cause) {
    if (controller.signal.aborted) return
    controller.abort()
    const message = cause instanceof Error ? cause.message : ''
    const stage = /Image/.test(message)
      ? 'load-assets'
      : /limit/.test(message)
        ? 'content-limit'
        : 'render-encode'
    reportError(cause, { module: 'share-image', action: 'generate', stage })
    if (alive && run === generation) {
      error.value =
        stage === 'load-assets'
          ? label(
              '素材加载失败，请检查网络后重试。',
              'Image loading failed. Check your connection and retry.'
            )
          : stage === 'content-limit'
            ? label('内容过多，请减少导出模块。', 'Too much content. Select fewer export modules.')
            : label(
                '图片绘制或编码失败，请减少导出模块后重试。',
                'Image rendering or encoding failed. Select fewer modules and retry.'
              )
    }
  } finally {
    if (alive && run === generation) busy.value = false
  }
}
function download() {
  if (props.preparing || !renderedBlob || busy.value || error.value) return
  const url = URL.createObjectURL(renderedBlob),
    anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `${(props.name || props.code || 'nikki').replace(/[\\/:*?"<>|#]/g, '-').replace(/\.[^.]+$/, '')}-share${props.code ? '-9x16' : ''}.jpg`
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60000)
}
watch([source, parameters, clothes, cameraCode, () => props.language], generate)
watch(
  () => props.preparing,
  (preparing) => {
    if (preparing) return
    clothes.value = !!props.result?.outfit?.wearingClothes.length
    cameraCode.value = !!props.result?.rawCameraParams
    void loadOriginal()
  },
  { immediate: true }
)
onBeforeUnmount(() => {
  renderController?.abort()
  alive = false
  generation++
  sourceGeneration++
  if (sourceUrl) URL.revokeObjectURL(sourceUrl)
  if (preview.value) URL.revokeObjectURL(preview.value)
})
</script>

<template>
  <Teleport to="body">
    <Transition name="confirm-dialog" appear @after-leave="emit('close')">
      <div
        v-if="shown"
        class="share-image-overlay"
        role="dialog"
        aria-modal="true"
        :aria-label="label('导出分享图', 'Export share image')"
        @click.self="close"
      >
        <section ref="panel" class="share-image-panel" tabindex="-1">
          <header>
            <h2>{{ label('导出分享图', 'Export share image') }}</h2>
            <div v-if="!code && !preparing" class="share-image-controls">
              <label
                ><input v-model="parameters" type="checkbox" />{{
                  label('图片参数', 'Photo parameters')
                }}</label
              >
              <label
                ><input
                  v-model="clothes"
                  type="checkbox"
                  :disabled="!result?.outfit?.wearingClothes.length"
                />{{ label('穿搭部件', 'Outfit and dyes') }}</label
              >
              <label
                ><input
                  v-model="cameraCode"
                  type="checkbox"
                  :disabled="!result?.rawCameraParams"
                />{{ label('相机参数码', 'Camera code') }}</label
              >
            </div>
            <button
              class="update-log-close-button"
              type="button"
              :aria-label="label('关闭', 'Close')"
              :title="label('关闭', 'Close')"
              @click="close"
              ><X :size="19" aria-hidden="true"
            /></button>
          </header>
          <div class="share-image-preview" :aria-busy="loading">
            <div
              v-if="loading"
              class="photo-params-loading share-image-loading"
              role="status"
              aria-live="polite"
            >
              <span class="photo-params-spinner" aria-hidden="true"></span>
              <p>{{
                preparing
                  ? preparationMessage || label('正在解析照片…', 'Parsing photo…')
                  : label('正在生成预览…', 'Generating preview…')
              }}</p>
            </div>
            <div v-if="preparing && preparationError" class="share-image-preparation">
              <p role="alert">{{ preparationError }}</p>
              <form
                v-if="uidRequired"
                @submit.prevent="uidInput.trim() && emit('submitUid', uidInput.trim())"
              >
                <label for="share-photo-uid">{{
                  label('请输入拍摄此照片所用账号的 UID', 'Enter the UID used to take this photo')
                }}</label>
                <div class="share-image-uid-row">
                  <input
                    id="share-photo-uid"
                    v-model="uidInput"
                    inputmode="numeric"
                    autocomplete="off"
                    :placeholder="label('账号 UID', 'Account UID')"
                  />
                  <button type="submit" :disabled="!uidInput.trim()">{{
                    label('解析', 'Parse')
                  }}</button>
                </div>
              </form>
              <button v-else type="button" @click="emit('retryPreparation')"
                ><RefreshCw :size="16" />{{ label('重试', 'Retry') }}</button
              >
            </div>
            <div v-if="error" role="alert"
              ><p>{{ error }}</p
              ><button type="button" @click="source ? generate() : loadOriginal()"
                ><RefreshCw :size="16" />{{ label('重试', 'Retry') }}</button
              ></div
            >
            <div
              class="share-image-stage"
              @wheel="handleWheel"
              @pointerdown="startDrag"
              @pointermove="moveDrag"
              @pointerup="endDrag"
              @pointercancel="endDrag"
            >
              <img
                v-if="preview"
                :style="imageTransform"
                draggable="false"
                :src="preview"
                :alt="label('分享图预览', 'Share image preview')"
                :class="{ stale: busy || !!error }"
              />
            </div>
            <div class="share-image-zoom" @wheel.stop>
              <button
                type="button"
                :disabled="zoomDisabled || zoom >= MAX_ZOOM"
                :aria-label="label('放大', 'Zoom in')"
                :title="label('放大', 'Zoom in')"
                @click="setZoom(zoom + ZOOM_STEP)"
                ><ZoomIn :size="17"
              /></button>
              <button
                type="button"
                :disabled="zoomDisabled"
                :aria-label="label('重置缩放', 'Reset zoom')"
                :title="label('重置缩放', 'Reset zoom')"
                @click="resetTransform"
                >{{ zoom }}%</button
              >
              <button
                type="button"
                :disabled="zoomDisabled || zoom <= MIN_ZOOM"
                :aria-label="label('缩小', 'Zoom out')"
                :title="label('缩小', 'Zoom out')"
                @click="setZoom(zoom - ZOOM_STEP)"
                ><ZoomOut :size="17"
              /></button>
            </div>
            <button
              type="button"
              class="share-image-save"
              :title="label('保存 JPEG', 'Save JPEG')"
              :aria-label="label('保存 JPEG', 'Save JPEG')"
              :disabled="zoomDisabled || !source"
              @click="download"
              ><Download :size="16" aria-hidden="true"
            /></button>
          </div>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.share-image-overlay {
  position: fixed;
  inset: 0;
  z-index: 10000;
  display: grid;
  place-items: center;
  padding: 16px;
  background: var(--overlay-bg);
}
.share-image-panel {
  width: min(1060px, 100%);
  height: 94dvh;
  max-height: 94dvh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  background: var(--surface-strong);
  color: var(--text);
  box-shadow: var(--dialog-shadow);
}
header,
.share-image-controls {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px 24px;
  flex-wrap: wrap;
  flex-shrink: 0;
}
.share-image-controls {
  padding: 0;
  margin-left: 0;
}
header {
  justify-content: flex-start;
  border-bottom: 1px solid var(--line);
}
header .update-log-close-button {
  margin-left: auto;
}
h2 {
  margin: 0;
  font-size: 20px;
}
button:not(.update-log-close-button) {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 10px 14px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--surface);
  color: var(--text);
  cursor: pointer;
}
button:disabled {
  opacity: 0.5;
  cursor: default;
}
label {
  display: inline-flex;
  gap: 8px;
  align-items: center;
  font-size: 14px;
}
label:has(input[type='checkbox']) {
  cursor: pointer;
}
label:has(input:disabled) {
  opacity: 0.5;
  cursor: not-allowed;
}
input[type='checkbox'] {
  appearance: none;
  display: grid;
  place-content: center;
  width: 20px;
  height: 20px;
  flex-shrink: 0;
  margin: 0;
  border: 1.5px solid var(--surface-accent-border);
  border-radius: 6px;
  background: var(--surface-strong);
  cursor: inherit;
  transition:
    border-color var(--motion-fast),
    background var(--motion-fast);
}
input[type='checkbox']:checked {
  border-color: var(--pink-deep);
  background: var(--pink-deep);
}
input[type='checkbox']::before {
  content: '';
  width: 11px;
  height: 11px;
  background: #fff;
  clip-path: polygon(14% 44%, 38% 68%, 86% 16%, 100% 29%, 39% 94%, 0 58%);
  visibility: hidden;
}
input[type='checkbox']:checked::before {
  visibility: visible;
}
label:hover input[type='checkbox']:not(:disabled) {
  border-color: var(--pink-deep);
}
input[type='checkbox']:focus-visible {
  outline: 2px solid var(--pink-deep);
  outline-offset: 3px;
}
.share-image-preview {
  position: relative;
  overflow: hidden;
  min-height: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  flex: 1;
  background: transparent;
  text-align: center;
}
.share-image-preparation {
  position: absolute;
  inset: 0;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 24px;
  overflow: auto;
  background: var(--surface-strong);
}
.share-image-preparation p {
  max-width: 560px;
  overflow-wrap: anywhere;
}
.share-image-preparation form {
  width: min(100%, 440px);
}
.share-image-uid-row {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}
.share-image-uid-row input {
  flex: 1;
  min-width: 0;
  padding: 10px 14px;
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  background: var(--surface);
  color: var(--text);
  font: inherit;
}
.share-image-stage {
  width: 100%;
  flex: 1;
  min-height: 0;
  overflow: hidden;
  touch-action: none;
  user-select: none;
}
.share-image-zoom {
  display: flex;
  position: absolute;
  right: 24px;
  bottom: 68px;
  z-index: 2;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 0;
  margin: 0;
  border: 0;
}
.share-image-zoom button {
  font-size: 10px;
  font-weight: 600;
}
.share-image-preview img {
  display: block;
  max-width: 100%;
  width: 100%;
  height: 100%;
  min-height: 0;
  object-fit: contain;
  margin: auto;
  box-shadow: none;
}
.share-image-loading {
  position: absolute;
  inset: 0;
  z-index: 1;
  min-height: 0;
  background: var(--surface-strong);
}
.share-image-preview .stale {
  opacity: 0.35;
}
button.share-image-save {
  position: absolute;
  right: 24px;
  bottom: 24px;
  z-index: 1;
}
button.share-image-save,
.share-image-zoom button {
  min-width: 36px;
  width: 36px;
  height: 36px;
  padding: 0;
  border-radius: 50%;
  background: var(--surface-strong);
  color: var(--pink-deep);
  box-shadow: var(--accent-shadow-sm);
  transition:
    background var(--motion-fast) ease,
    border-color var(--motion-fast) ease,
    box-shadow var(--motion-fast) ease,
    transform var(--motion-fast) ease;
}
button.share-image-save:hover:not(:disabled),
.share-image-zoom button:hover:not(:disabled) {
  background: var(--interactive-hover-bg);
  border-color: var(--interactive-hover-border);
  box-shadow:
    var(--accent-shadow-sm),
    0 4px 12px color-mix(in srgb, var(--pink-deep) 16%, transparent);
  transform: translateY(-1px);
}
button.share-image-save:active:not(:disabled),
.share-image-zoom button:active:not(:disabled) {
  transform: translateY(0);
  box-shadow: none;
}
button.share-image-save:focus-visible,
.share-image-zoom button:focus-visible {
  outline: 2px solid var(--pink-deep);
  outline-offset: 3px;
}
@media (prefers-reduced-motion: reduce) {
  button.share-image-save,
  .share-image-zoom button {
    transition: none;
  }
  button.share-image-save:hover:not(:disabled),
  .share-image-zoom button:hover:not(:disabled) {
    transform: none;
  }
}
@media (max-width: 600px) {
  .share-image-zoom {
    right: 12px;
    bottom: 56px;
  }
  .share-image-overlay {
    padding: 8px;
  }
  header {
    padding: 12px;
    gap: 12px;
  }
  button.share-image-save {
    right: 12px;
    bottom: 12px;
  }
}
</style>
