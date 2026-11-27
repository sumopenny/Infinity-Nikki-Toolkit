<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { observeVisibleMotion } from '../utils/visibleMotion'

const name = ref<HTMLElement | null>(null)
let stop: (() => void) | undefined
onMounted(() => {
  if (name.value) stop = observeVisibleMotion(name.value)
})
onBeforeUnmount(() => stop?.())
</script>

<template>
  <span ref="name" class="crown-outfit-name"
    ><slot /><span class="crown-name-shine" aria-hidden="true"><slot /></span
  ></span>
</template>

<style scoped>
.crown-outfit-name {
  --crown-name-colors: linear-gradient(110deg, #8d5c24 0%, #ac743d 32%, #885582 65%, #946025 100%);
  --crown-name-light: #fff1bd;
  max-width: 100%;
  overflow: hidden;
  text-overflow: inherit;
  white-space: inherit;
  vertical-align: bottom;
  color: #8d5c24;
}
:where(:root[data-theme='dark']) .crown-outfit-name {
  --crown-name-colors: linear-gradient(110deg, #f1d28c 0%, #e9bc72 32%, #d8b7ee 65%, #f1d28c 100%);
  --crown-name-light: #fff9e6;
  color: #f1d28c;
}
.crown-name-shine {
  display: none;
}
@supports ((background-clip: text) or (-webkit-background-clip: text)) {
  .crown-outfit-name {
    position: relative;
    display: inline-block;
    background-image: var(--crown-name-colors);
    background-size: 220% 100%;
    background-repeat: no-repeat;
    animation: crown-name-flow 4s ease-in-out infinite;
  }
  .crown-name-shine {
    display: block;
    position: absolute;
    inset: 0;
    overflow: hidden;
    text-overflow: inherit;
    white-space: inherit;
    pointer-events: none;
    background-image: linear-gradient(
      110deg,
      transparent 42%,
      var(--crown-name-light) 50%,
      transparent 58%
    );
    background-size: 250% 100%;
    background-repeat: no-repeat;
    animation: crown-name-shine 3.2s ease-in-out infinite;
  }
  .crown-outfit-name,
  .crown-name-shine {
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
    -webkit-text-fill-color: transparent;
    animation-play-state: var(--catalog-motion-state, paused);
  }
}
/* 渐变与扫光独立计时，调整渐变速度不会改变扫光频率。 */
@keyframes crown-name-flow {
  0%,
  100% {
    background-position: 0% 0;
  }
  50% {
    background-position: 100% 0;
  }
}
@keyframes crown-name-shine {
  0%,
  10% {
    background-position: 160% 0;
  }
  90%,
  100% {
    background-position: -160% 0;
  }
}
@media (prefers-reduced-motion: reduce) {
  .crown-outfit-name {
    animation: none;
    background-size: 100% 100%;
    background-position: 0 0;
  }
  .crown-name-shine {
    display: none;
    animation: none;
  }
}
</style>
