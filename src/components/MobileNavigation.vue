<script setup lang="ts">
import { Camera, House, Shirt, Sparkles } from 'lucide-vue-next'
import { onBeforeUnmount, ref, watch } from 'vue'
import type { AlbumView } from './AlbumViewSwitcher.vue'
import type { LocaleMessages } from '../i18n'
const props = defineProps<{
  activeView: AlbumView
  disabled: boolean
  messages: LocaleMessages['viewNav']
  outfitLabel: string
  cameraLabel: string
}>()
const emit = defineEmits<{ changeView: [view: AlbumView] }>()
const pressedView = ref<AlbumView | null>(null)
let pressedAt = 0
let releaseTimer: ReturnType<typeof setTimeout> | undefined

function cancelPress() {
  clearTimeout(releaseTimer)
  releaseTimer = undefined
  pressedView.value = null
}
function press(view: AlbumView) {
  if (props.disabled) return
  cancelPress()
  pressedAt = Date.now()
  pressedView.value = view
}
/** 轻点至少反馈 120ms；长按松手即恢复，不延迟页面切换。 */
function releasePress() {
  if (!pressedView.value) return
  clearTimeout(releaseTimer)
  const remaining = Math.max(0, 120 - (Date.now() - pressedAt))
  if (remaining) releaseTimer = setTimeout(cancelPress, remaining)
  else cancelPress()
}
function selectView(view: AlbumView, event: MouseEvent) {
  if (props.disabled) return
  // 键盘或辅助技术直接触发 click 时也保留一次反馈。
  if (event.detail === 0 && pressedView.value !== view) press(view)
  releasePress()
  emit('changeView', view)
}
watch(
  () => props.disabled,
  (disabled) => {
    if (disabled) cancelPress()
  }
)
onBeforeUnmount(cancelPress)
</script>

<template>
  <nav class="mobile-navigation mobile-only" :aria-label="messages.aria">
    <button
      v-for="entry in [
        { view: 'outfits' as const, label: outfitLabel, icon: Shirt },
        { view: 'home' as const, label: messages.homeSchemes, icon: House },
        { view: 'favorites' as const, label: cameraLabel, icon: Camera },
        { view: 'resonance' as const, label: messages.resonance, icon: Sparkles }
      ]"
      :key="entry.view"
      type="button"
      :disabled="disabled"
      :class="{ 'is-pressed': pressedView === entry.view }"
      :aria-current="
        activeView === entry.view ||
        (entry.view === 'resonance' && (activeView === 'wardrobe' || activeView === 'makeup'))
          ? 'page'
          : undefined
      "
      @pointerdown="$event.button === 0 && press(entry.view)"
      @pointerup="releasePress"
      @pointerleave="cancelPress"
      @pointercancel="cancelPress"
      @keydown="
        ($event.key === ' ' || $event.key === 'Enter') && !$event.repeat && press(entry.view)
      "
      @keyup="($event.key === ' ' || $event.key === 'Enter') && releasePress()"
      @blur="cancelPress"
      @click="selectView(entry.view, $event)"
    >
      <span class="mobile-navigation-content">
        <component :is="entry.icon" :size="20" aria-hidden="true" />
        <span>{{ entry.label }}</span>
      </span>
    </button>
  </nav>
</template>

<style scoped>
.mobile-navigation button .mobile-navigation-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  overflow: visible;
  pointer-events: none;
  transform-origin: center 65%;
  transition: transform 250ms cubic-bezier(0.34, 1.56, 0.64, 1);
}
/* 只压缩内容，保持触摸范围和滑块测量稳定。 */
.mobile-navigation button:is(:active, .is-pressed):not(:disabled) {
  scale: 1;
  background: var(--soft-accent);
  background: color-mix(in srgb, var(--soft-accent) 78%, var(--pink-deep) 22%);
}
.mobile-navigation button:is(:active, .is-pressed):not(:disabled) .mobile-navigation-content {
  transform: translateY(1px) scale(0.9);
  transition: transform 80ms ease-out;
}
@media (prefers-reduced-motion: reduce) {
  .mobile-navigation button .mobile-navigation-content {
    transition: none;
  }
  .mobile-navigation button:is(:active, .is-pressed):not(:disabled) .mobile-navigation-content {
    transform: none;
  }
}
</style>
