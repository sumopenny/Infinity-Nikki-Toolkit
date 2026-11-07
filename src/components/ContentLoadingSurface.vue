<script setup lang="ts">
import { computed, inject, nextTick, onBeforeUnmount, ref, watch } from 'vue'

import SkeletonSweep from './SkeletonSweep.vue'
import { globalSkeletonSweepKey } from '../utils/imageSkeleton'
const globalSweep = inject(globalSkeletonSweepKey, false)
const props = defineProps<{ loading: boolean; label: string }>()
const root = ref<HTMLElement | null>(null)
const skeleton = ref<HTMLElement | null>(null)
const content = ref<HTMLElement | null>(null)
const skeletonVisible = ref(props.loading)
const finished = ref(!props.loading)
const reservedHeight = ref(0)
const state = computed(() => (props.loading ? 'loading' : finished.value ? 'ready' : 'revealing'))
let revision = 0
let disposed = false
const animations = new Set<Animation>()
let hideTimer: ReturnType<typeof setTimeout> | undefined

function finishReveal() {
  reservedHeight.value = 0
  skeletonVisible.value = false
  finished.value = true
  stopMotion()
  window.dispatchEvent(new Event('nuan-skeleton-layout'))
  void nextTick(() =>
    content.value?.dispatchEvent(new Event('nuan-content-ready', { bubbles: true }))
  )
}
function stopMotion() {
  animations.forEach((animation) => animation.cancel())
  animations.clear()
  clearTimeout(hideTimer)
}

function animate(element: HTMLElement, frames: Keyframe[], delay: number) {
  if (!element.animate) return
  const animation = element.animate(frames, {
    duration: 260,
    delay,
    easing: 'ease-out',
    fill: 'both'
  })
  animations.add(animation)
}
/** Elements sharing a visual row start together; tolerate fractional layout rounding. */
function rowDelays(elements: HTMLElement[]) {
  let rowTop = -Infinity
  let row = -1
  return elements
    .map((element, index) => ({ element, index, rect: element.getBoundingClientRect() }))
    .filter(
      ({ rect }) =>
        rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < window.innerHeight
    )
    .sort((a, b) => a.rect.top - b.rect.top || a.rect.left - b.rect.left || a.index - b.index)
    .map(({ element, rect }) => {
      if (rect.top - rowTop > 2) {
        rowTop = rect.top
        row++
      }
      element.setAttribute('data-load-revealed', '')
      return { element, delay: row * 60 }
    })
}
async function reveal() {
  const run = ++revision
  stopMotion()
  // Preserve the loading footprint when a short result replaces a larger placeholder.
  if (skeleton.value) reservedHeight.value = skeleton.value.getBoundingClientRect().height
  await nextTick()
  if (disposed || run !== revision || props.loading) return
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  const blocks = rowDelays([
    ...(content.value?.querySelectorAll<HTMLElement>('[data-load-block]') ?? [])
  ])
  const bones = rowDelays([
    ...(skeleton.value?.querySelectorAll<HTMLElement>('[data-skeleton-block]') ?? [])
  ])
  if (reduced || !blocks.length || !blocks[0].element.animate) {
    finishReveal()
    return
  }
  const lastDelay = blocks[blocks.length - 1]!.delay
  blocks.forEach(({ element, delay }) => {
    animate(
      element,
      [
        { opacity: 0, transform: 'translateY(8px)' },
        { opacity: 1, transform: 'translateY(0)' }
      ],
      delay
    )
  })
  bones.forEach(({ element, delay }) => {
    animate(element, [{ opacity: 1 }, { opacity: 0 }], Math.min(delay, lastDelay))
  })
  hideTimer = setTimeout(() => {
    if (disposed || run !== revision) return
    finishReveal()
  }, lastDelay + 280)
}
watch(
  () => props.loading,
  (loading) => {
    if (!loading) return reveal()
    revision++
    stopMotion()
    reservedHeight.value = 0
    finished.value = false
    skeletonVisible.value = true
  }
)
onBeforeUnmount(() => {
  disposed = true
  revision++
  stopMotion()
})
</script>

<template>
  <div
    ref="root"
    class="content-loading-surface"
    :data-loading-surface="state"
    :aria-busy="loading"
    :style="reservedHeight ? { minHeight: reservedHeight + 'px' } : undefined"
  >
    <div
      v-if="skeletonVisible"
      ref="skeleton"
      class="content-skeleton-layer"
      :class="{ 'is-overlay': !loading }"
      aria-hidden="true"
      inert
    >
      <slot name="skeleton" />
    </div>
    <SkeletonSweep v-if="!globalSweep" :scope="root" />
    <span v-if="loading" class="content-loading-status" role="status">{{ label }}</span>
    <div v-if="!loading" ref="content" class="content-loaded-layer"><slot /></div>
  </div>
</template>

<style scoped>
.content-loading-surface {
  position: relative;
  min-width: 0;
}
.content-skeleton-layer.is-overlay {
  position: absolute;
  inset: 0;
  z-index: 2;
  pointer-events: none;
}
.content-skeleton-layer.is-overlay :deep([data-skeleton-card]) {
  background: transparent;
  border-color: transparent;
  box-shadow: none;
}
:global([data-skeleton-block]) {
  background: var(--line-soft) !important;
  color: transparent !important;
  border-radius: 6px;
  border-color: transparent !important;
  box-shadow: none !important;
}
:global([data-skeleton-block].makeup-cover),
:global([data-skeleton-block].wardrobe-cover),
:global([data-skeleton-block].resonance-outfit-image) {
  border-radius: var(--ui-radius);
}
:global(.skeleton-title) {
  width: 65%;
  min-height: 1.4em;
}
:global(.skeleton-summary) {
  width: 55%;
}
:global(.skeleton-progress) {
  height: 5px;
  border-radius: 999px;
}
.content-loaded-layer {
  position: relative;
}
.content-loading-status {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
</style>
