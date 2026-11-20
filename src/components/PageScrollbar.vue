<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { ArrowUp } from 'lucide-vue-next'
import { useCompactLayout } from '../composables/useCompactLayout'
import { useGlassSurface } from '../composables/useGlassSurface'
import GlassSurfaceFilter from './GlassSurfaceFilter.vue'

const compactLayout = useCompactLayout()
const { glassFilterId, refractsBackdrop } = useGlassSurface()

defineProps<{ label: string; backToTopLabel: string }>()

const track = ref<HTMLElement | null>(null)
const viewportHeight = ref(0)
const scrollHeight = ref(0)
const scrollTop = ref(0)
const locked = ref(false)
const dragging = ref(false)
const trackHeight = computed(() => Math.max(0, viewportHeight.value - 24))
const maxScroll = computed(() => Math.max(0, scrollHeight.value - viewportHeight.value))
const thumbHeight = computed(() =>
  Math.min(
    trackHeight.value,
    Math.max(32, (trackHeight.value * viewportHeight.value) / (scrollHeight.value || 1))
  )
)
const travel = computed(() => trackHeight.value - thumbHeight.value)
const thumbTop = computed(() =>
  maxScroll.value ? Math.min(1, scrollTop.value / maxScroll.value) * travel.value : 0
)
const visible = computed(
  () => !compactLayout.value && maxScroll.value > 0 && trackHeight.value > 0 && !locked.value
)
const showBackToTop = computed(
  () => !locked.value && maxScroll.value > 0 && scrollTop.value > Math.min(320, maxScroll.value / 2)
)
let frame = 0
let resizeObserver: ResizeObserver | undefined
let lockObserver: MutationObserver | undefined
let dragStartY = 0
let dragStartScroll = 0
let pointerId: number | null = null

function endDrag() {
  if (pointerId !== null && track.value?.hasPointerCapture(pointerId)) {
    track.value.releasePointerCapture(pointerId)
  }
  pointerId = null
  dragging.value = false
}

function measure() {
  const root = document.documentElement
  const scroller = document.scrollingElement ?? root
  viewportHeight.value = root.clientHeight
  scrollHeight.value = scroller.scrollHeight
  scrollTop.value = Math.max(0, scroller.scrollTop)
  locked.value = ['hidden', 'clip'].includes(getComputedStyle(root).overflowY)
  if (!visible.value) endDrag()
}

function scheduleMeasure() {
  if (!frame)
    frame = requestAnimationFrame(() => {
      frame = 0
      measure()
    })
}

function scrollTo(top: number) {
  if (locked.value) return
  window.scrollTo({ top: Math.max(0, Math.min(maxScroll.value, top)), behavior: 'instant' })
  scheduleMeasure()
}

function backToTop() {
  if (locked.value) return
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  window.scrollTo({ top: 0, behavior: reducedMotion ? 'instant' : 'smooth' })
}

function startDrag(event: PointerEvent) {
  if (!event.isPrimary || event.button !== 0) return
  measure()
  if (!visible.value || !track.value || travel.value <= 0) return
  event.preventDefault()
  track.value.focus({ preventScroll: true })
  const y = event.clientY - track.value.getBoundingClientRect().top
  if (y < thumbTop.value || y > thumbTop.value + thumbHeight.value) {
    scrollTo(((y - thumbHeight.value / 2) / travel.value) * maxScroll.value)
    measure()
  }
  dragStartY = event.clientY
  dragStartScroll = scrollTop.value
  pointerId = event.pointerId
  dragging.value = true
  track.value.setPointerCapture(event.pointerId)
}

function moveDrag(event: PointerEvent) {
  if (event.pointerId !== pointerId || !dragging.value || travel.value <= 0) return
  scrollTo(dragStartScroll + ((event.clientY - dragStartY) / travel.value) * maxScroll.value)
}

function onKeydown(event: KeyboardEvent) {
  measure()
  if (!visible.value || event.altKey || event.ctrlKey || event.metaKey) return
  let target: number
  switch (event.key) {
    case 'ArrowDown':
      target = scrollTop.value + 40
      break
    case 'ArrowUp':
      target = scrollTop.value - 40
      break
    case 'PageDown':
      target = scrollTop.value + viewportHeight.value * 0.9
      break
    case 'PageUp':
      target = scrollTop.value - viewportHeight.value * 0.9
      break
    case 'Home':
      target = 0
      break
    case 'End':
      target = maxScroll.value
      break
    case ' ':
      target = scrollTop.value + viewportHeight.value * 0.9 * (event.shiftKey ? -1 : 1)
      break
    default:
      return
  }
  event.preventDefault()
  scrollTo(target)
}

onMounted(() => {
  // Hide only the native page scrollbar; document scrolling and sticky positioning stay native.
  document.documentElement.classList.add('has-page-scrollbar')
  resizeObserver = new ResizeObserver(scheduleMeasure)
  for (const element of [document.documentElement, document.body, document.getElementById('app')]) {
    if (element) resizeObserver.observe(element)
  }
  lockObserver = new MutationObserver(scheduleMeasure)
  lockObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['style', 'class']
  })
  window.addEventListener('scroll', scheduleMeasure, { passive: true })
  window.addEventListener('resize', scheduleMeasure)
  measure()
})

onBeforeUnmount(() => {
  endDrag()
  resizeObserver?.disconnect()
  lockObserver?.disconnect()
  window.removeEventListener('scroll', scheduleMeasure)
  window.removeEventListener('resize', scheduleMeasure)
  if (frame) cancelAnimationFrame(frame)
  document.documentElement.classList.remove('has-page-scrollbar')
})
</script>

<template>
  <Teleport to="body">
    <div
      v-show="visible"
      ref="track"
      class="page-scrollbar"
      :class="{ 'is-dragging': dragging }"
      role="scrollbar"
      tabindex="0"
      aria-controls="app"
      aria-orientation="vertical"
      :aria-label="label"
      :aria-valuemin="0"
      :aria-valuemax="Math.round(maxScroll)"
      :aria-valuenow="Math.round(Math.min(scrollTop, maxScroll))"
      @pointerdown="startDrag"
      @pointermove="moveDrag"
      @pointerup="endDrag"
      @pointercancel="endDrag"
      @lostpointercapture="endDrag"
      @keydown="onKeydown"
    >
      <div
        class="page-scrollbar-thumb"
        :style="{ height: thumbHeight + 'px', transform: 'translateY(' + thumbTop + 'px)' }"
      />
    </div>
    <GlassSurfaceFilter v-if="refractsBackdrop && showBackToTop" :filter-id="glassFilterId" />
    <button
      v-show="showBackToTop"
      type="button"
      class="page-back-to-top material-surface preview-material"
      :data-refraction="refractsBackdrop || undefined"
      :style="{ '--nav-glass-filter': `url(#${glassFilterId})` }"
      :aria-label="backToTopLabel"
      :title="backToTopLabel"
      @click="backToTop"
    >
      <ArrowUp :size="20" aria-hidden="true" />
    </button>
  </Teleport>
</template>

<style scoped>
.page-back-to-top {
  position: fixed;
  z-index: 49;
  right: max(20px, env(safe-area-inset-right, 0px));
  bottom: 20px;
  display: grid;
  width: 44px;
  height: 44px;
  place-items: center;
  padding: 0;
  border: 1px solid var(--line);
  border-radius: 50%;
  background: var(--surface-strong);
  color: var(--text);
  box-shadow: var(--shadow);
}
@media (max-width: 899px) {
  .page-back-to-top {
    right: max(12px, env(safe-area-inset-right, 0px));
    bottom: calc(var(--mobile-nav-height, 64px) + 12px);
  }
}
.page-scrollbar {
  position: fixed;
  z-index: 70;
  top: 12px;
  right: 0;
  bottom: 12px;
  width: 12px;
  touch-action: none;
  user-select: none;
}
.page-scrollbar-thumb {
  width: 6px;
  margin-inline: 3px;
  border-radius: 999px;
  background: var(--scrollbar-thumb);
}
.page-scrollbar:hover .page-scrollbar-thumb,
.page-scrollbar:focus-visible .page-scrollbar-thumb,
.page-scrollbar.is-dragging .page-scrollbar-thumb {
  background: var(--scrollbar-thumb-hover);
}
.page-scrollbar:focus-visible {
  outline: 2px solid var(--scrollbar-thumb-hover);
  outline-offset: -2px;
  border-radius: 999px;
}
</style>
