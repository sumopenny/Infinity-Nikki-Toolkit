<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, nextTick, watch } from 'vue'
const props = defineProps<{ count: number; aspectRatio?: number; layoutKey?: string }>()
const root = ref<HTMLElement | null>(null)
const active = ref(false)
const height = ref(0)
let observer: IntersectionObserver | undefined
let resize: ResizeObserver | undefined
let frame = 0
function estimate() {
  const element = root.value
  if (!element || active.value) return
  const style = getComputedStyle(element)
  const columns = Math.max(1, style.gridTemplateColumns.split(' ').length)
  const gap = parseFloat(style.rowGap) || 0
  const columnGap = parseFloat(style.columnGap) || 0
  const width = (element.clientWidth - columnGap * (columns - 1)) / columns
  const rows = Math.ceil(props.count / columns)
  // Card padding and border occupy 18px; mobile small cards also have an action row.
  const extra = parseFloat(style.getPropertyValue('--photo-batch-extra-height')) || 0
  const rowHeight = Math.max(0, width - 18) / (props.aspectRatio ?? 1) + 18 + extra
  height.value = rows * rowHeight + Math.max(0, rows - 1) * gap
}
function scheduleEstimate() {
  cancelAnimationFrame(frame)
  frame = requestAnimationFrame(estimate)
}
watch(() => [props.count, props.aspectRatio, props.layoutKey], scheduleEstimate, { flush: 'post' })
onMounted(() => {
  estimate()
  if (!('IntersectionObserver' in window)) {
    active.value = true
    return
  }
  observer = new IntersectionObserver(
    async ([entry]) => {
      if (!entry) return
      if (!entry.isIntersecting && root.value?.contains(document.activeElement)) return
      if (!entry.isIntersecting && root.value && active.value)
        height.value = root.value.getBoundingClientRect().height
      active.value = entry.isIntersecting
      if (active.value) {
        await nextTick()
        if (root.value) height.value = root.value.getBoundingClientRect().height
      }
    },
    { rootMargin: '1000px 0px' }
  )
  observer.observe(root.value!)
  if (typeof ResizeObserver !== 'undefined') {
    resize = new ResizeObserver(scheduleEstimate)
    resize.observe(root.value!)
  }
})
onBeforeUnmount(() => {
  observer?.disconnect()
  resize?.disconnect()
  cancelAnimationFrame(frame)
})
</script>
<template>
  <div
    ref="root"
    class="photo-grid"
    :style="active ? undefined : { height: `${height}px`, minHeight: '1px' }"
  >
    <slot v-if="active" />
  </div>
</template>

<style scoped>
.photo-grid + .photo-grid {
  margin-top: 14px;
}
</style>
