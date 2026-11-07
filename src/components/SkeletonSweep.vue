<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, useId, watch } from 'vue'
const props = defineProps<{ scope?: HTMLElement | null; global?: boolean }>()
const shapes = ref<Array<{ x: number; y: number; width: number; height: number; radius: number }>>(
  []
)
const width = ref(1),
  height = ref(1),
  bandWidth = ref(120)
const id = 'skeleton-sweep-' + useId().replace(/:/g, '')
let observer: MutationObserver | undefined
let resize: ResizeObserver | undefined
let frame: number | undefined
let disposed = false
let hasPending = false
const selector =
  '[data-image-skeleton][data-image-pending], [data-image-pending] [data-image-skeleton], [data-loading-surface="loading"] [data-skeleton-block]'

function measure() {
  frame = undefined
  const area = props.global ? document.body : props.scope
  if (disposed || !area) {
    shapes.value = []
    return
  }
  width.value = document.documentElement.clientWidth || window.innerWidth
  height.value = window.innerHeight
  bandWidth.value = Math.min(180, Math.max(80, width.value * 0.18))
  const dialogs = [
    ...document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]')
  ].filter(
    (el) => el.getBoundingClientRect().width > 0 && getComputedStyle(el).visibility !== 'hidden'
  )
  const dialog = dialogs[dialogs.length - 1]
  const candidates = [...area.querySelectorAll<HTMLElement>(selector)]
  hasPending = candidates.length > 0
  shapes.value = candidates.flatMap((element) => {
    if (dialog && !dialog.contains(element)) return []
    const box = element.getBoundingClientRect()
    if (
      box.width <= 0 ||
      box.height <= 0 ||
      box.bottom <= 0 ||
      box.top >= height.value ||
      box.right <= 0 ||
      box.left >= width.value
    )
      return []
    let left = Math.max(0, box.left),
      top = Math.max(0, box.top)
    let right = Math.min(width.value, box.right),
      bottom = Math.min(height.value, box.bottom)
    const radius = parseFloat(getComputedStyle(element).borderRadius) || 0
    // Clip to scrolling panels so the sweep never paints over headers or adjacent content.
    for (
      let parent = element.parentElement;
      parent && parent !== document.body;
      parent = parent.parentElement
    ) {
      const style = getComputedStyle(parent)
      if (
        style.visibility === 'hidden' ||
        style.display === 'none' ||
        Number(style.opacity || 1) === 0
      )
        return []
      const clipX = /hidden|auto|scroll|clip/.test(style.overflowX || style.overflow)
      const clipY = /hidden|auto|scroll|clip/.test(style.overflowY || style.overflow)
      if (clipX || clipY) {
        const bounds = parent.getBoundingClientRect()
        if (clipX) {
          left = Math.max(left, bounds.left)
          right = Math.min(right, bounds.right)
        }
        if (clipY) {
          top = Math.max(top, bounds.top)
          bottom = Math.min(bottom, bounds.bottom)
        }
      }
    }
    return right > left && bottom > top
      ? [{ x: left, y: top, width: right - left, height: bottom - top, radius }]
      : []
  })
}
function schedule() {
  if (disposed || frame !== undefined) return
  frame = requestAnimationFrame(measure)
}
function onScroll() {
  if (hasPending) schedule()
}
function bind() {
  observer?.disconnect()
  resize?.disconnect()
  const area = props.global ? document.body : props.scope
  if (area) {
    if (typeof MutationObserver !== 'undefined') {
      observer ??= new MutationObserver((records) => {
        const relevant = records.some((record) => {
          if (record.target instanceof Element && record.target.closest('[data-skeleton-sweep]'))
            return false
          if (record.type === 'attributes')
            return (
              hasPending ||
              record.attributeName === 'data-image-pending' ||
              record.attributeName === 'data-loading-surface'
            )
          return [...record.addedNodes, ...record.removedNodes].some(
            (node) =>
              node instanceof Element && (node.matches(selector) || node.querySelector(selector))
          )
        })
        if (relevant) schedule()
      })
      observer.observe(area, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ['data-image-pending', 'data-loading-surface', 'class', 'style', 'src']
      })
    }
    if (typeof ResizeObserver !== 'undefined') {
      resize ??= new ResizeObserver(schedule)
      resize.observe(area)
    }
  }
  schedule()
}
watch(() => props.scope, bind, { flush: 'post' })
onMounted(() => {
  bind()
  window.addEventListener('scroll', onScroll, { capture: true, passive: true })
  window.addEventListener('resize', schedule)
  window.addEventListener('nuan-skeleton-layout', schedule)
})
onBeforeUnmount(() => {
  disposed = true
  observer?.disconnect()
  resize?.disconnect()
  if (frame !== undefined) cancelAnimationFrame(frame)
  window.removeEventListener('scroll', onScroll, true)
  window.removeEventListener('resize', schedule)
  window.removeEventListener('nuan-skeleton-layout', schedule)
})
</script>
<template>
  <svg
    v-if="shapes.length"
    data-skeleton-sweep
    class="content-skeleton-light"
    :viewBox="'0 0 ' + width + ' ' + height"
    aria-hidden="true"
    focusable="false"
    :style="{
      width: width + 'px',
      height: height + 'px',
      '--sweep-distance': width + bandWidth + height * 0.325 + 'px'
    }"
  >
    <defs>
      <mask :id="id" maskUnits="userSpaceOnUse">
        <rect
          v-for="(shape, index) in shapes"
          :key="index"
          :x="shape.x"
          :y="shape.y"
          :width="shape.width"
          :height="shape.height"
          :rx="shape.radius"
          fill="white"
        />
      </mask>
      <linearGradient :id="id + '-light'">
        <stop offset="0" stop-color="white" stop-opacity="0" />
        <stop offset=".25" stop-color="white" stop-opacity=".12" />
        <stop offset=".5" stop-color="white" class="skeleton-gradient-peak" />
        <stop offset=".75" stop-color="white" stop-opacity=".12" />
        <stop offset="1" stop-color="white" stop-opacity="0" />
      </linearGradient>
    </defs>
    <g :mask="'url(#' + id + ')'">
      <g class="content-skeleton-band">
        <rect
          :x="-bandWidth"
          y="0"
          :width="bandWidth"
          :height="height"
          transform="skewX(-18)"
          :fill="'url(#' + id + '-light)'"
        />
      </g>
    </g>
  </svg>
</template>
<style scoped>
.content-skeleton-light {
  position: fixed;
  inset: 0;
  width: 100vw;
  height: 100vh;
  z-index: 2147483000;
  pointer-events: none;
  overflow: hidden;
}
.content-skeleton-band {
  animation: shared-skeleton-sweep 1.5s linear infinite;
}
.skeleton-gradient-peak {
  stop-opacity: 0.65;
}
:where(:root[data-theme='dark']) .skeleton-gradient-peak {
  stop-opacity: 0.3;
}
@keyframes shared-skeleton-sweep {
  from {
    transform: translateX(0);
  }
  to {
    transform: translateX(var(--sweep-distance));
  }
}
@media (prefers-reduced-motion: reduce) {
  .content-skeleton-light {
    display: none;
  }
}
</style>
<style>
.image-skeleton-block {
  position: absolute;
  display: grid;
  place-items: center;
  background: var(--line-soft, #e8dddd);
  color: var(--muted);
  pointer-events: none;
}
.image-skeleton-failed {
  background: var(--frame-bg);
  font-size: 20px;
}
</style>
