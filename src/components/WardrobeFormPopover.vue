<script setup lang="ts">
import { computed, nextTick, ref, useId, watch } from 'vue'
import { ChevronDown } from 'lucide-vue-next'
import WardrobeFormNav from './WardrobeFormNav.vue'
import { useCompactLayout } from '../composables/useCompactLayout'
import { useSidebarMenu } from '../composables/useSidebarMenu'
import { wardrobeEvolutionMessages } from '../utils/wardrobe/wardrobePresentation'
import { wardrobeFamilyKey } from '../utils/wardrobe/wardrobeFamilies'
import type { Language } from '../i18n/types'
import type { WardrobeCatalog, WardrobeEntry } from '../utils/wardrobe/wardrobeCatalog'
import type { WardrobeSnapshot } from '../utils/wardrobe/wardrobeStorage'

const props = defineProps<{
  entry: WardrobeEntry
  catalog: WardrobeCatalog | null
  snapshot: WardrobeSnapshot
  language: Language
  disabled?: boolean
  resetKey?: number
  anchor?: () => HTMLElement | null
  desktopBottomOffset?: number
}>()
const emit = defineEmits<{ select: [entry: WardrobeEntry] }>()
const compact = useCompactLayout()
const open = defineModel<boolean>('open', { default: false })
const opensUpward = ref(true)
const trigger = ref<HTMLButtonElement | null>(null)
const panel = ref<HTMLElement | null>(null)
const panelId = useId()
const t = computed(() => wardrobeEvolutionMessages[props.language])
const close = () => {
  open.value = false
}
const { menuStyle, positionMenu } = useSidebarMenu(close, () => panel.value, open)
watch(() => [props.entry.id, props.disabled, props.resetKey, compact.value], close)

/** 浮层优先向上展开；上方不足时选择空间更大的一侧，并限制在可视区域内。 */
async function toggle() {
  if (open.value) {
    close()
    return
  }
  const button = trigger.value
  if (!button || props.disabled) return
  positionMenu(button)
  const viewport = window.visualViewport
  const left = viewport?.offsetLeft ?? 0
  const maxWidth = Math.min(380, (viewport?.width ?? window.innerWidth) - 24)
  const count = (props.catalog?.entries ?? []).filter(
    (entry) => wardrobeFamilyKey(entry) === wardrobeFamilyKey(props.entry)
  ).length
  // 五形态确定统一缩略图尺寸，再按实际数量加上间距、内边距及边框收缩背景。
  const thumbnailWidth = (maxWidth - 26 - 4 * 6) / 5
  const width = Math.min(
    maxWidth,
    Math.max(1, count) * thumbnailWidth + Math.max(0, count - 1) * 6 + 26
  )
  const box =
    props.anchor?.()?.getBoundingClientRect() ??
    button.closest('.wardrobe-card')?.getBoundingClientRect() ??
    button.getBoundingClientRect()
  menuStyle.value = {
    ...menuStyle.value,
    width: `${width}px`,
    left: `${Math.max(left + 12, Math.min(box.left + (box.width - width) / 2, left + (viewport?.width ?? window.innerWidth) - width - 12))}px`,
    zIndex: 110
  }
  open.value = true
  await nextTick()
  if (!open.value || !panel.value) return
  if (!compact.value) {
    const media =
      props.anchor?.()?.getBoundingClientRect() ??
      button
        .closest('.wardrobe-card')
        ?.querySelector('.wardrobe-card-media')
        ?.getBoundingClientRect() ??
      box
    const panelBottom =
      props.desktopBottomOffset === undefined
        ? button.getBoundingClientRect().top - 6
        : media.bottom - props.desktopBottomOffset
    opensUpward.value = true
    menuStyle.value = {
      ...menuStyle.value,
      top: 'auto',
      bottom: `${window.innerHeight - panelBottom}px`,
      maxHeight: `${Math.max(40, panelBottom - (viewport?.offsetTop ?? 0) - 16)}px`
    }
    return
  }
  const top = viewport?.offsetTop ?? 0
  const bottom = top + (viewport?.height ?? window.innerHeight)
  const below = Math.max(0, bottom - box.bottom - 18)
  const above = Math.max(0, box.top - top - 18)
  const upward = panel.value.scrollHeight <= above || above >= below
  opensUpward.value = upward
  menuStyle.value = {
    ...menuStyle.value,
    top: upward ? 'auto' : `${box.bottom + 6}px`,
    bottom: upward ? `${window.innerHeight - box.top + 6}px` : 'auto',
    maxHeight: `${upward ? above : below}px`
  }
}
function select(entry: WardrobeEntry) {
  close()
  emit('select', entry)
}
/** 退场节点保留至动画结束，期间不可点击或通过键盘进入。 */
function setPanelInteractive(element: Element, interactive: boolean) {
  element.toggleAttribute('inert', !interactive)
  element.setAttribute('aria-hidden', String(!interactive))
}
function outside(event: PointerEvent) {
  if (
    event.target instanceof Node &&
    !panel.value?.contains(event.target) &&
    !trigger.value?.contains(event.target)
  )
    close()
}
function escape(event: KeyboardEvent) {
  if (open.value && event.key === 'Escape') {
    event.stopPropagation()
    close()
    trigger.value?.focus()
  }
}
/** 只有打开的浮层参与全局交互，关闭和卸载由 watcher 一并清理。 */
watch(
  open,
  (active, _, onCleanup) => {
    if (!active) return
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', escape, true)
    onCleanup(() => {
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('keydown', escape, true)
    })
  },
  { flush: 'sync' }
)
</script>

<template>
  <button
    ref="trigger"
    type="button"
    class="wardrobe-mobile-form-toggle"
    :disabled="disabled"
    :aria-label="open ? t.collapse : t.expand"
    :aria-expanded="open"
    :aria-controls="open ? panelId : undefined"
    @click.stop="toggle"
  >
    <ChevronDown :size="16" :class="{ rotated: open }" aria-hidden="true" />
  </button>
  <Teleport to="body">
    <Transition
      name="wardrobe-forms"
      @before-enter="(element) => setPanelInteractive(element, true)"
      @before-leave="(element) => setPanelInteractive(element, false)"
    >
      <div
        v-if="open"
        :id="panelId"
        ref="panel"
        class="wardrobe-form-popover"
        :class="{ 'is-upward': opensUpward }"
        :style="menuStyle"
        :inert="open ? undefined : true"
        :aria-hidden="!open"
      >
        <WardrobeFormNav
          horizontal
          ownership-icons
          :entry="entry"
          :catalog="catalog"
          :snapshot="snapshot"
          :language="language"
          @select="select"
        />
      </div>
    </Transition>
  </Teleport>
</template>
