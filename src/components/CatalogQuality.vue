<script setup lang="ts">
import { ref, useId, watchEffect } from 'vue'
import { observeVisibleMotion } from '../utils/visibleMotion'
import type { Language } from '../i18n/types'
import { catalogQualityLabel } from '../utils/catalogQuality'

const props = withDefaults(defineProps<{ quality?: number; language?: Language }>(), {
  language: 'zh'
})
const id = useId()
const crown = 'M3 7 7.5 11 12 3 16.5 11 21 7 18.5 18H5.5Z'
const badge = ref<HTMLElement | null>(null)
// 复用共享可见性观察，离屏或切到后台时暂停，恢复时延续原进度。
watchEffect(
  (onCleanup) => {
    const element = badge.value
    if (props.quality !== 8 || !element) return
    onCleanup(observeVisibleMotion(element, '--crown-play-state'))
  },
  { flush: 'post' }
)
</script>

<template>
  <span
    ref="badge"
    class="catalog-quality"
    :class="{ 'is-crown': quality === 8 }"
    :role="quality === 8 ? 'img' : undefined"
    :aria-label="quality === 8 ? catalogQualityLabel(quality, language) : undefined"
    :title="quality === 8 ? catalogQualityLabel(quality, language) : undefined"
  >
    <svg v-if="quality === 8" viewBox="0 0 24 24" aria-hidden="true" class="quality-crown">
      <defs>
        <linearGradient :id="`${id}-gold`" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#b78343" />
          <stop offset="0.45" stop-color="#ebc975" />
          <stop offset="0.7" stop-color="#d9a74b" />
          <stop offset="1" stop-color="#b78343" />
        </linearGradient>
        <linearGradient :id="`${id}-sheen`">
          <stop offset="0" stop-color="#fff9df" stop-opacity="0" />
          <stop offset="0.5" stop-color="#fff9df" />
          <stop offset="1" stop-color="#fff9df" stop-opacity="0" />
        </linearGradient>
        <clipPath :id="`${id}-clip`"><path :d="crown" /></clipPath>
      </defs>
      <path :d="crown" :fill="`url(#${id}-gold)`" />
      <g :clip-path="`url(#${id}-clip)`">
        <path class="crown-sheen" d="M-15 0H-6L4 24H-5Z" :fill="`url(#${id}-sheen)`" />
      </g>
      <path d="M6 21H18" :stroke="`url(#${id}-gold)`" stroke-width="1.6" stroke-linecap="round" />
    </svg>
    <template v-else>{{ catalogQualityLabel(quality, language) }}</template>
  </span>
</template>

<style scoped>
.catalog-quality {
  display: inline-flex;
  align-items: center;
  vertical-align: middle;
}
.quality-crown {
  display: block;
  width: 1.15em;
  height: 1em;
  flex: none;
  /* 只放大绘制结果，保留行内占位与相邻内容的位置。 */
  transform: scale(1.35);
  transform-origin: center;
}
.crown-sheen {
  opacity: 0;
  animation: crown-sheen 1.6s ease-in-out infinite;
  animation-play-state: var(--crown-play-state, paused);
}
@keyframes crown-sheen {
  0% {
    opacity: 0;
    transform: translateX(0);
  }
  12%,
  48% {
    opacity: 1;
  }
  65%,
  100% {
    opacity: 0;
    transform: translateX(42px);
  }
}
@media (prefers-reduced-motion: reduce) {
  .crown-sheen {
    animation: none;
  }
}
</style>
