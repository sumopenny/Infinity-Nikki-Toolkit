<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { createHomeWaterRenderer, HomeWaterField } from '../utils/homeWaterRipple'

const props = defineProps<{ source: string; paused: boolean }>()
const canvas = ref<HTMLCanvasElement | null>(null)
const ready = ref(false)
let renderer: ReturnType<typeof createHomeWaterRenderer> = null
let field = new HomeWaterField(2, 2)
let preference: MediaQueryList | undefined
let observer: ResizeObserver | undefined
let image: HTMLImageElement | undefined
let timeout: ReturnType<typeof setTimeout> | undefined
let generation = 0
let frame = 0
let lastTime = 0
let accumulator = 0
let lastInput = 0
let peak = 0
let width = 0
let height = 0
let pointer: { x: number; y: number } | null = null
let pending: { x: number; y: number; click: boolean } | null = null
let mounted = false

function stop() {
  cancelAnimationFrame(frame)
  frame = 0
  lastTime = 0
  accumulator = 0
  pointer = null
  pending = null
  field.clear()
  ready.value = false
}

function release() {
  generation++
  stop()
  clearTimeout(timeout)
  if (image) {
    image.onload = image.onerror = null
    image.removeAttribute('src')
    image = undefined
  }
  renderer?.dispose()
  renderer = null
}

function resize() {
  const bounds = canvas.value?.getBoundingClientRect()
  if (!bounds?.width || !bounds.height) return
  width = bounds.width
  height = bounds.height
  const gridWidth = Math.max(64, Math.min(280, Math.round(width / 4)))
  const gridHeight = Math.max(32, Math.min(200, Math.round((gridWidth * height) / width)))
  field = new HomeWaterField(gridWidth, gridHeight)
  stop()
}

function refresh() {
  release()
  if (!mounted || !preference?.matches || !props.source || !canvas.value) return
  const current = generation
  const candidate = new Image()
  image = candidate
  candidate.crossOrigin = 'anonymous'
  const fail = () => {
    if (current === generation) release()
  }
  candidate.onerror = fail
  timeout = setTimeout(fail, 15000)
  candidate.onload = () => {
    if (current !== generation || !canvas.value) return
    clearTimeout(timeout)
    candidate.onload = candidate.onerror = null
    renderer = createHomeWaterRenderer(canvas.value, candidate)
    resize()
  }
  candidate.src = props.source
}

function animate(now: number) {
  frame = 0
  if (!renderer || props.paused || document.hidden || !preference?.matches || !width || !height) {
    stop()
    return
  }
  if (pending) {
    const point = pending
    pending = null
    if (point.click) field.disturb(point.x, point.y, 2.8)
    else if (pointer) {
      const distance = Math.hypot(
        (point.x - pointer.x) * field.width,
        (point.y - pointer.y) * field.height
      )
      const count = Math.min(18, Math.max(1, Math.ceil(distance / 2.4)))
      for (let i = 1; i <= count; i++) {
        field.disturb(
          pointer.x + ((point.x - pointer.x) * i) / count,
          pointer.y + ((point.y - pointer.y) * i) / count,
          Math.min(0.85, 0.28 + distance * 0.025)
        )
      }
    } else field.disturb(point.x, point.y, 0.45)
    pointer = point
    lastInput = now
  }
  accumulator += Math.min(50, lastTime ? now - lastTime : 1000 / 60)
  lastTime = now
  while (accumulator >= 1000 / 60) {
    peak = field.step()
    accumulator -= 1000 / 60
  }
  renderer.draw(field, width, height)
  ready.value = true
  if ((peak < 0.003 && now - lastInput > 500) || now - lastInput > 20000) stop()
  else frame = requestAnimationFrame(animate)
}

function move(event: PointerEvent) {
  if (
    event.pointerType !== 'mouse' ||
    !renderer ||
    props.paused ||
    !preference?.matches ||
    document.hidden
  )
    return
  const target = event.target
  if (
    target instanceof Element &&
    target.closest('[role="dialog"], [aria-modal="true"], .home-wallpaper-drawer')
  ) {
    pointer = null
    return
  }
  const bounds = canvas.value?.getBoundingClientRect()
  if (!bounds?.width || !bounds.height) return
  const x = (event.clientX - bounds.left) / bounds.width
  const y = (event.clientY - bounds.top) / bounds.height
  if (x < 0 || y < 0 || x > 1 || y > 1) {
    pointer = null
    return
  }
  if (
    pointer &&
    Math.hypot((x - pointer.x) * field.width, (y - pointer.y) * field.height) < 0.7 &&
    event.type !== 'pointerdown'
  )
    return
  pending = { x, y, click: event.type === 'pointerdown' }
  if (!frame) frame = requestAnimationFrame(animate)
}

function leave() {
  pointer = null
  pending = null
}
function hidden() {
  if (document.hidden) stop()
}
function contextLost(event: Event) {
  event.preventDefault()
  release()
}

watch(() => props.source, refresh)
watch(
  () => props.paused,
  (paused) => {
    if (paused) stop()
  }
)
onMounted(() => {
  mounted = true
  if (typeof window.matchMedia !== 'function' || typeof ResizeObserver === 'undefined') return
  preference = window.matchMedia(
    '(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)'
  )
  preference.addEventListener('change', refresh)
  observer = new ResizeObserver(resize)
  if (canvas.value) observer.observe(canvas.value)
  window.addEventListener('pointermove', move, { passive: true })
  window.addEventListener('pointerdown', move, { passive: true })
  document.documentElement.addEventListener('pointerleave', leave)
  window.addEventListener('blur', stop)
  document.addEventListener('visibilitychange', hidden)
  refresh()
})
onBeforeUnmount(() => {
  mounted = false
  release()
  observer?.disconnect()
  preference?.removeEventListener('change', refresh)
  window.removeEventListener('pointermove', move)
  window.removeEventListener('pointerdown', move)
  document.documentElement.removeEventListener('pointerleave', leave)
  window.removeEventListener('blur', stop)
  document.removeEventListener('visibilitychange', hidden)
})
</script>

<template>
  <canvas
    ref="canvas"
    class="home-water-surface"
    :class="{ 'is-ready': ready }"
    aria-hidden="true"
    @webglcontextlost="contextLost"
  />
</template>

<style scoped>
.home-water-surface {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  opacity: 0;
  pointer-events: none;
}
.home-water-surface.is-ready {
  opacity: 1;
}
@media (prefers-reduced-motion: reduce), (hover: none), (pointer: coarse) {
  .home-water-surface {
    display: none;
  }
}
</style>
