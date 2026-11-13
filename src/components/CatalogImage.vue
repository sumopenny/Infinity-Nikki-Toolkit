<script setup lang="ts">
import { vImageSkeleton } from '../utils/imageSkeleton'
import { computed, ref, watch } from 'vue'
import {
  catalogImageLoading,
  catalogImagePriority,
  catalogImagePlaceholder
} from '../utils/gongeo/catalogImage'
import { optimizedImageKitUrl } from '../utils/imagekit'

defineOptions({ inheritAttrs: false })
const props = withDefaults(
  defineProps<{
    src: string
    skeleton?: boolean
    managed?: boolean
    alt?: string
    language?: 'zh' | 'en'
    index?: number
    loading?: 'eager' | 'lazy'
    fetchpriority?: 'high' | 'low' | 'auto'
  }>(),
  { alt: '', language: 'zh', index: 6, skeleton: true }
)
const emit = defineEmits<{ load: [event: Event]; error: [event: Event]; retry: [] }>()
const failed = ref(false)
const attempt = ref(0)
const retryLabel = computed(() =>
  props.language === 'zh' ? '图片加载失败，点击重试' : 'Image failed. Retry'
)
const placeholder =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160"><rect width="160" height="160" rx="8" fill="#f3edf4"/><text x="80" y="90" text-anchor="middle" font-size="38" fill="#986c88">↻</text></svg>'
  )
watch(
  () => props.src,
  () => {
    failed.value = false
    attempt.value++
  }
)
function onError(event: Event) {
  if (props.managed) {
    emit('error', event)
    return
  }
  if (failed.value) return
  failed.value = true
  emit('error', event)
}
/** 失败图保留原布局并支持独立重试；重试点击不触发外层卡片动作。 */
function retry(event: Event) {
  if (!failed.value) return
  event.preventDefault()
  event.stopPropagation()
  failed.value = false
  attempt.value++
  emit('retry')
}
</script>

<template>
  <img
    v-image-skeleton="skeleton"
    :key="`${src}:${attempt}`"
    v-bind="$attrs"
    referrerpolicy="strict-origin-when-cross-origin"
    :loading="loading ?? catalogImageLoading(index)"
    :fetchpriority="fetchpriority ?? catalogImagePriority(index)"
    decoding="async"
    :alt="failed ? retryLabel : alt"
    :title="failed ? retryLabel : undefined"
    :tabindex="failed ? 0 : undefined"
    :role="failed ? 'button' : undefined"
    :data-image-failed="failed || undefined"
    :src="failed ? placeholder : optimizedImageKitUrl(src || catalogImagePlaceholder)"
    @load="!failed && emit('load', $event)"
    @error="onError"
    @click="retry"
    @keydown.enter="retry"
    @keydown.space="retry"
  />
</template>

<style scoped>
img[data-image-failed] {
  opacity: 1 !important;
  visibility: visible !important;
  object-fit: contain;
  cursor: pointer;
}
</style>
