<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, onUpdated, ref, watch } from 'vue'
import CatalogImage from './CatalogImage.vue'

defineOptions({ inheritAttrs: false })
const props = withDefaults(
  defineProps<{
    src: string
    language?: 'zh' | 'en'
    fit?: 'cover' | 'contain'
  }>(),
  { language: 'zh', fit: 'cover' }
)
const emit = defineEmits<{ load: [event: Event]; error: [event: Event]; retry: [] }>()
const root = ref<HTMLElement | null>(null)
const ready = ref(false)
const failed = ref(false)
const attempt = ref(0)
let generation = 0
let disposed = false
let decoding: HTMLImageElement | null = null

function reset() {
  generation++
  decoding = null
  ready.value = false
  failed.value = false
}
watch(() => props.src, reset, { flush: 'sync' })

function onError(event: Event) {
  if (disposed || failed.value) return
  generation++
  decoding = null
  failed.value = true
  ready.value = false
  emit('error', event)
}
async function onLoad(event: Event, image = event.target as HTMLImageElement) {
  if (disposed || ready.value || failed.value || decoding === image || !root.value?.contains(image))
    return
  const run = generation
  decoding = image
  try {
    if (typeof image.decode === 'function') await image.decode()
  } catch {
    if (disposed || run !== generation || !root.value?.contains(image)) return
    if (!image.complete || image.naturalWidth === 0) {
      onError(event)
      return
    }
  }
  if (disposed || run !== generation || !root.value?.contains(image)) return
  decoding = null
  ready.value = true
  emit('load', event)
}
// Cache hits may be complete before Vue attaches the load listener.
function checkCached() {
  const image = root.value?.querySelector('img')
  if (image?.complete && image.naturalWidth > 0) void onLoad(new Event('load'), image)
}
onMounted(checkCached)
onUpdated(checkCached)
function retry(event: Event) {
  event.preventDefault()
  event.stopPropagation()
  reset()
  attempt.value++
  emit('retry')
  void nextTick(checkCached)
}
onBeforeUnmount(() => {
  disposed = true
  generation++
})
</script>

<template>
  <span
    ref="root"
    class="loading-catalog-image"
    :class="{ 'is-ready': ready, 'is-failed': failed }"
    :style="{ objectFit: fit }"
    :data-image-pending="(!ready && !failed) || undefined"
    :aria-busy="!ready && !failed"
  >
    <CatalogImage
      :key="src + ':' + attempt"
      v-bind="$attrs"
      :skeleton="false"
      :src="src"
      :language="language"
      :aria-hidden="failed || undefined"
      @load="onLoad"
      @error="onError"
    />
    <Transition name="catalog-placeholder">
      <span
        v-if="!ready && !failed"
        class="catalog-image-skeleton"
        data-image-skeleton
        aria-hidden="true"
      ></span>
    </Transition>
    <span
      v-if="failed"
      class="catalog-image-retry"
      role="button"
      tabindex="0"
      :aria-label="language === 'zh' ? '图片加载失败，点击重试' : 'Image failed. Retry'"
      @click="retry"
      @keydown.enter="retry"
      @keydown.space="retry"
    >
      {{ language === 'zh' ? '图片加载失败，点击重试' : 'Image failed. Retry' }}
    </span>
  </span>
</template>

<style scoped>
.loading-catalog-image {
  position: absolute;
  inset: 0;
  display: block;
  overflow: hidden;
  border-radius: inherit;
}
.loading-catalog-image :deep(img) {
  position: absolute;
  inset: 0;
  display: block;
  width: 100%;
  height: 100%;
  object-fit: inherit;
  border-radius: inherit;
  opacity: 0;
  transition: opacity 220ms ease-out;
}
.loading-catalog-image.is-ready :deep(img) {
  opacity: 1;
}
.loading-catalog-image.is-failed :deep(img) {
  visibility: hidden !important;
}
.catalog-image-skeleton {
  position: absolute;
  inset: 0;
  background: var(--line-soft);
  border-radius: inherit;
  pointer-events: none;
}
.catalog-placeholder-leave-active {
  transition: opacity 220ms ease-out;
}
.catalog-placeholder-leave-to {
  opacity: 0;
}
.catalog-image-retry {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 6px;
  background: var(--frame-bg);
  color: var(--muted);
  font-size: 11px;
  text-align: center;
  cursor: pointer;
}
@media (prefers-reduced-motion: reduce) {
  .loading-catalog-image :deep(img),
  .catalog-placeholder-leave-active {
    transition: none;
  }
}
</style>
