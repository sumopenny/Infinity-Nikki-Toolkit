<script setup lang="ts">
import { vImageSkeleton } from '../utils/imageSkeleton'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { PhotoDisplayItem } from '../utils/photoGrouping'

const props = defineProps<{
  photo: PhotoDisplayItem
  loadPhoto: (photo: PhotoDisplayItem, signal?: AbortSignal) => Promise<string>
  failureText: string
}>()

const rootRef = ref<HTMLElement | null>(null)
const displayedUrl = ref<string | null>(props.photo.url)
const loadState = ref<'idle' | 'loading' | 'loaded' | 'failed'>(props.photo.url ? 'loaded' : 'idle')
let abortController = new AbortController()
let observer: IntersectionObserver | null = null

/**
 * 请求加载当前照片，并在组件仍然有效时更新显示状态。
 * 参数：无。
 */
async function startLoading(): Promise<void> {
  if (loadState.value !== 'idle') return
  loadState.value = 'loading'
  const photo = props.photo,
    controller = abortController

  try {
    const url = await props.loadPhoto(photo, controller.signal)
    if (controller.signal.aborted || props.photo !== photo) return
    displayedUrl.value = url
    loadState.value = 'loaded'
  } catch (error) {
    if (
      controller.signal.aborted ||
      props.photo !== photo ||
      (error instanceof DOMException && error.name === 'AbortError')
    )
      return
    loadState.value = 'failed'
  }
}

watch(
  () => props.photo,
  (photo) => {
    abortController.abort()
    abortController = new AbortController()
    displayedUrl.value = photo.url
    loadState.value = photo.url ? 'loaded' : 'idle'
    if (!observer && !photo.url) void startLoading()
  }
)

onMounted(() => {
  if (!rootRef.value || !('IntersectionObserver' in window)) {
    void startLoading()
    return
  }

  // 提前约一屏开始读取，快速滚动时通常不会看到空白卡片。
  observer = new IntersectionObserver(
    (entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return
      observer?.disconnect()
      observer = null
      void startLoading()
    },
    { rootMargin: `${window.innerHeight}px 0px` }
  )
  observer.observe(rootRef.value)
})

onBeforeUnmount(() => {
  observer?.disconnect()
  abortController.abort()
})
</script>

<template>
  <div ref="rootRef" class="lazy-photo-image" :class="`is-${loadState}`">
    <div
      v-if="loadState === 'idle' || loadState === 'loading'"
      class="photo-skeleton"
      data-image-skeleton
      data-image-pending="true"
      aria-hidden="true"
    ></div>
    <div
      v-else-if="loadState === 'failed'"
      class="photo-load-failed"
      role="img"
      :aria-label="failureText"
      :title="failureText"
    >
      <span aria-hidden="true">×</span>
    </div>
    <img v-image-skeleton v-else-if="displayedUrl" :src="displayedUrl" :alt="photo.name" loading="lazy" />
  </div>
</template>
