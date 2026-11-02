<script setup lang="ts" generic="T extends string | number | null">
import DesktopMenuTransition from './DesktopMenuTransition.vue'
import { nextTick, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue'
import { ChevronDown } from 'lucide-vue-next'
const props = defineProps<{
  label: string
  options: { value: T; label: string; attrs?: Record<string, string> }[]
  disabled?: boolean
}>()
const model = defineModel<T>({ required: true })
const open = ref(false)
const root = ref<HTMLElement | null>(null)
const trigger = ref<HTMLButtonElement | null>(null)
const menu = ref<HTMLElement | null>(null)
const id = useId()

function choose(value: T) {
  model.value = value
  open.value = false
  trigger.value?.focus()
}
async function toggle() {
  if (props.disabled) return
  open.value = !open.value
  if (open.value) {
    await nextTick()
    menu.value?.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus()
  }
}
/** 菜单留在弹窗内；Esc 只收起菜单，方向键在选项之间移动。 */
async function keydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && open.value) {
    event.preventDefault()
    event.stopPropagation()
    open.value = false
    trigger.value?.focus()
  } else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
    event.preventDefault()
    if (!open.value) {
      await toggle()
      return
    }
    const buttons = [...(menu.value?.querySelectorAll<HTMLButtonElement>('button') ?? [])]
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? buttons.length - 1
          : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length
    buttons[next]?.focus()
  }
}
function outside(event: MouseEvent) {
  if (!root.value?.contains(event.target as Node)) open.value = false
}
watch(
  () => props.disabled,
  (disabled) => {
    if (disabled) open.value = false
  }
)
onMounted(() => document.addEventListener('click', outside))
onBeforeUnmount(() => document.removeEventListener('click', outside))
</script>

<template>
  <div
    ref="root"
    class="cleanup-account-select-wrap"
    @keydown="keydown"
    @focusout="
      $event.relatedTarget && !root?.contains($event.relatedTarget as Node) && (open = false)
    "
  >
    <button
      ref="trigger"
      type="button"
      class="cleanup-account-select"
      :class="{ open }"
      :disabled="disabled"
      :aria-label="label"
      aria-haspopup="menu"
      :aria-expanded="open"
      :aria-controls="`${id}-menu`"
      @click="toggle"
    >
      <span>{{ options.find((option) => option.value === model)?.label }}</span>
      <ChevronDown :size="14" aria-hidden="true" />
    </button>
    <DesktopMenuTransition>
      <div
        v-if="open"
        :id="`${id}-menu`"
        ref="menu"
        class="cleanup-account-menu"
        role="menu"
        :aria-label="label"
      >
        <button
          v-for="option in options"
          :key="option.value ?? ''"
          type="button"
          role="menuitemradio"
          v-bind="option.attrs"
          :aria-checked="model === option.value"
          :class="{ active: model === option.value }"
          @click="choose(option.value)"
          >{{ option.label }}</button
        >
      </div>
    </DesktopMenuTransition>
  </div>
</template>

<style scoped>
.cleanup-account-select > span {
  min-width: 0;
  overflow-wrap: anywhere;
}
</style>
