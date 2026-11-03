<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'

const props = defineProps<{ digit: number; animateLeading: boolean }>()
const strip = ref<HTMLElement | null>(null)
// 两侧各留一圈，使 9→0 和回退 0→9 都只需移动一格。
const digits = Array.from({ length: 30 }, (_, index) => index % 10).join('\n')
const offset = (row: number) => `translateY(${-100 * row}%)`
let motion: Animation | undefined

function roll(previous: number, next: number) {
  const el = strip.value
  if (!el?.animate || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  let start = 10 + previous
  if (motion?.playState === 'running' && el.offsetHeight) {
    const matrix = new DOMMatrixReadOnly(getComputedStyle(el).transform)
    start = 10 + ((-matrix.m42 / el.getBoundingClientRect().height % 10 + 10) % 10)
  }
  motion?.cancel()
  // 选择离屏幕上当前位置最近的同一数字，连点时从当前帧接着滚动。
  let end = next + 10 * Math.round((start - next) / 10)
  if (next === (previous + 1) % 10 && end < start) end += 10
  motion = el.animate([{ transform: offset(start) }, { transform: offset(end) }], {
    duration: 320,
    easing: 'cubic-bezier(.22, 1.18, .36, 1)'
  })
}

onMounted(() => {
  if (props.animateLeading) roll(0, props.digit)
})
watch(() => props.digit, (next, previous) => roll(previous, next))
</script>

<template>
  <span class="like-digit">
    <span class="like-digit-value">{{ digit }}</span>
    <span ref="strip" class="like-digit-strip" :data-digits="digits"
      :style="{ transform: offset(10 + digit) }" />
  </span>
</template>

<style scoped>
.like-digit {
  display: inline-block;
  position: relative;
  overflow: hidden;
  width: 1ch;
}
.like-digit-value {
  visibility: hidden;
}
.like-digit-strip {
  position: absolute;
  inset: 0;
}
.like-digit-strip::before {
  content: attr(data-digits);
  display: block;
  white-space: pre;
}
</style>
