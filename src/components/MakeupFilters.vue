<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ChevronDown, RotateCcw } from 'lucide-vue-next'
import AdaptiveFilterPanel from './AdaptiveFilterPanel.vue'
import CollectionFilterBar from './CollectionFilterBar.vue'
import DesktopMenuTransition from './DesktopMenuTransition.vue'
import { useCompactLayout } from '../composables/useCompactLayout'
import { useSidebarMenu } from '../composables/useSidebarMenu'
import type { Language } from '../i18n/types'
import type { WardrobeFilterOption } from '../utils/wardrobe/wardrobeFilters'

const props = defineProps<{
  language: Language
  sidebarTarget?: string
  count: number
  unit?: string
  disabled: boolean
  version: string
  source: string
  category: string
  categories?: WardrobeFilterOption[]
  quality: string
  qualities?: WardrobeFilterOption[]
  versions: WardrobeFilterOption[]
  sources: WardrobeFilterOption[]
}>()
const emit = defineEmits<{
  'update:version': [value: string]
  'update:source': [value: string]
  'update:category': [value: string]
  'update:quality': [value: string]
  reset: []
}>()
type FilterKey = 'version' | 'source' | 'quality' | 'category'
const compact = useCompactLayout()
const mobileOpen = ref(false)
const openFilter = ref<FilterKey | ''>('')
const text = (zh: string, en: string) => (props.language === 'zh' ? zh : en)
const filters = computed(() => [
  ...(compact.value && props.categories
    ? [{ key: 'category' as const, label: text('部位', 'Category'), options: props.categories }]
    : []),
  ...(props.qualities
    ? [{ key: 'quality' as const, label: text('星级', 'Rarity'), options: props.qualities }]
    : []),
  { key: 'version' as const, label: text('版本', 'Version'), options: props.versions },
  { key: 'source' as const, label: text('获取来源', 'Source'), options: props.sources }
])
const active = computed(() => filters.value.some((filter) => props[filter.key] !== 'all'))
const selectedLabel = computed(() =>
  filters.value
    .filter((f) => props[f.key] !== 'all')
    .map((f) => f.options.find((o) => o.value === props[f.key])?.label)
    .filter(Boolean)
    .join(' · ')
)
const { menuStyle, positionMenu } = useSidebarMenu(
  () => {
    openFilter.value = ''
  },
  () => document.getElementById('makeup-menu-' + openFilter.value),
  computed(() => openFilter.value !== '')
)
function dismiss(focus = false) {
  const key = openFilter.value
  openFilter.value = ''
  if (focus && key) document.getElementById('makeup-filter-' + key)?.focus()
}
function toggle(key: FilterKey, event: MouseEvent) {
  if (openFilter.value === key) {
    dismiss()
    return
  }
  const trigger = event.currentTarget as HTMLElement
  positionMenu(trigger)
  const box = trigger.getBoundingClientRect()
  const viewport = window.visualViewport
  const top = viewport?.offsetTop ?? 0
  const bottom = top + (viewport?.height ?? window.innerHeight)
  const below = Math.max(0, bottom - box.bottom - 14)
  const above = Math.max(0, box.top - top - 14)
  const upward = below < 180 && above > below
  const width = Math.min(Math.max(box.width, compact.value ? 180 : 240), window.innerWidth - 24)
  menuStyle.value = {
    ...menuStyle.value,
    left: Math.max(12, Math.min(box.left, window.innerWidth - width - 12)) + 'px',
    width: width + 'px',
    top: upward ? 'auto' : box.bottom + 6 + 'px',
    bottom: upward ? window.innerHeight - box.top + 6 + 'px' : 'auto',
    maxHeight: Math.min(320, upward ? above : below) + 'px',
    zIndex: 110
  }
  openFilter.value = key
}
function select(key: FilterKey, value: string) {
  if (!filters.value.find((f) => f.key === key)?.options.some((o) => o.value === value)) return
  if (key === 'version') emit('update:version', value)
  else if (key === 'category') emit('update:category', value)
  else if (key === 'quality') emit('update:quality', value)
  else emit('update:source', value)
  dismiss(true)
}
function reset() {
  dismiss()
  emit('reset')
}
function closeMobile() {
  dismiss()
  mobileOpen.value = false
}
function leave(event: FocusEvent) {
  const next = event.relatedTarget as Node | null
  if (
    !next ||
    (!document.getElementById('makeup-filter-' + openFilter.value)?.contains(next) &&
      !document.getElementById('makeup-menu-' + openFilter.value)?.contains(next))
  )
    dismiss()
}
function outside(event: MouseEvent) {
  if (
    !(event.target instanceof Element) ||
    !event.target.closest('.makeup-filter-field, .makeup-filter-menu')
  )
    dismiss()
}
watch(compact, closeMobile)
onMounted(() => document.addEventListener('click', outside))
onBeforeUnmount(() => document.removeEventListener('click', outside))
</script>

<template>
  <CollectionFilterBar
    v-if="compact"
    tag-picker
    :entries="[
      { key: 'all', label: text('全部筛选', 'All filters') },
      { key: 'active', label: selectedLabel }
    ]"
    :active="active ? 'active' : 'all'"
    :count="count"
    :language="language"
    :disabled="disabled"
    :all-label="text('全部筛选', 'All filters')"
    :select-label="text('筛选妆容：', 'Filter makeup: ')"
    @open="mobileOpen = true"
    @clear="reset"
  />
  <Teleport :to="sidebarTarget || 'body'" :disabled="compact || !sidebarTarget" defer>
    <AdaptiveFilterPanel
      :compact="compact"
      :open="mobileOpen"
      top-aligned
      :title="text('妆容筛选', 'Makeup filters')"
      :close-label="text('关闭筛选', 'Close filters')"
      :apply-label="text('完成', 'Done')"
      @close="closeMobile"
    >
      <div class="makeup-sidebar-controls" :class="{ 'is-compact': compact }">
        <slot v-if="!compact" name="category" />
        <p v-if="!compact" class="makeup-filter-results" role="status">
          <span>{{ text('筛选结果', 'Results') }}</span
          ><span
            ><strong>{{ count }}</strong> {{ unit ?? text('款', 'looks') }}</span
          >
        </p>
        <div class="makeup-filters">
          <div v-for="filter in filters" :key="filter.key" class="makeup-filter-field">
            <span>{{ filter.label }}</span>
            <div
              class="action-sort-select-wrap makeup-filter-select"
              @focusout="leave"
              @keydown.esc.stop.prevent="dismiss(true)"
            >
              <button
                :id="'makeup-filter-' + filter.key"
                type="button"
                class="cleanup-account-select action-sort-select"
                :disabled="disabled"
                :class="{ open: openFilter === filter.key }"
                :aria-label="
                  filter.label +
                  ': ' +
                  filter.options.find((o) => o.value === props[filter.key])?.label
                "
                :title="filter.options.find((o) => o.value === props[filter.key])?.label"
                aria-haspopup="menu"
                :aria-expanded="openFilter === filter.key"
                @click="toggle(filter.key, $event)"
              >
                <span>{{ filter.options.find((o) => o.value === props[filter.key])?.label }}</span
                ><ChevronDown :size="14" aria-hidden="true" />
              </button>
              <Teleport to="body">
                <DesktopMenuTransition>
                  <div
                    v-if="openFilter === filter.key"
                    :id="'makeup-menu-' + filter.key"
                    class="cleanup-account-menu makeup-filter-menu"
                    :style="menuStyle"
                    role="menu"
                    :aria-label="filter.label"
                    @focusout="leave"
                    @keydown.esc.stop.prevent="dismiss(true)"
                  >
                    <div class="makeup-filter-menu-scroll">
                      <button
                        v-for="option in filter.options"
                        :key="option.value"
                        type="button"
                        role="menuitemradio"
                        :aria-checked="props[filter.key] === option.value"
                        :class="{
                          active: props[filter.key] === option.value,
                          'has-group-separator': option.separatorBefore
                        }"
                        @click="select(filter.key, option.value)"
                        >{{ option.label }}</button
                      >
                    </div>
                  </div>
                </DesktopMenuTransition>
              </Teleport>
            </div>
          </div>
          <button class="makeup-reset-button" type="button" :disabled="disabled" @click="reset">
            <RotateCcw :size="14" aria-hidden="true" />{{ text('重置筛选', 'Reset filters') }}
          </button>
        </div>
      </div>
    </AdaptiveFilterPanel>
  </Teleport>
</template>

<style scoped>
.makeup-sidebar-controls {
  padding-top: 0;
}
.makeup-filter-results {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  margin: 0 0 12px;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.7;
}
.makeup-filter-results strong {
  color: var(--heading);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.makeup-filters {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.makeup-filter-field {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 6px;
  font-size: 12px;
}
.makeup-filter-field > span {
  flex-shrink: 0;
  white-space: nowrap;
}
.makeup-filter-select {
  flex: 1 1 0;
  width: auto;
  min-width: 0;
  grid-template-columns: minmax(0, 1fr);
}
.makeup-filter-select .action-sort-select {
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
  height: 32px;
  min-height: 32px;
  padding: 4px 8px;
  gap: 4px;
}
.makeup-filter-select .action-sort-select > span {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.makeup-filter-menu {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-sizing: border-box;
  padding: 6px;
}
.makeup-filter-menu-scroll {
  min-height: 0;
  margin-right: -3px;
  padding-right: 3px;
  overflow-y: auto;
  overscroll-behavior: contain;
}
.makeup-filter-menu button {
  white-space: normal;
  overflow-wrap: anywhere;
  line-height: 1.5;
}
.makeup-filter-menu button.has-group-separator {
  margin-top: 11px;
  position: relative;
}
.makeup-filter-menu button.has-group-separator::before {
  content: '';
  position: absolute;
  top: -6px;
  left: 3px;
  right: 3px;
  height: 1px;
  background: var(--line);
  pointer-events: none;
}
.makeup-reset-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  box-sizing: border-box;
  width: 100%;
  height: 34px;
  min-height: 0;
  padding: 0 12px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--surface);
  color: var(--text);
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
  cursor: pointer;
  transition:
    border-color var(--motion-fast) ease,
    background-color var(--motion-fast) ease,
    box-shadow var(--motion-fast) ease,
    transform var(--motion-fast) ease;
}
.makeup-reset-button:hover:not(:disabled) {
  border-color: var(--pink-deep);
  background: var(--surface-strong);
}
.makeup-reset-button:focus-visible {
  outline: 2px solid var(--pink-deep);
  outline-offset: 2px;
}
.is-compact .makeup-reset-button {
  height: 36px;
}

@media (hover: hover) and (pointer: fine) {
  .makeup-reset-button:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: var(--accent-shadow-sm);
  }
}
.makeup-reset-button:active:not(:disabled) {
  transform: scale(0.98);
  box-shadow: none;
}
@media (prefers-reduced-motion: reduce) {
  .makeup-reset-button {
    transition: none;
  }
  .makeup-reset-button:hover:not(:disabled),
  .makeup-reset-button:active:not(:disabled) {
    transform: none;
  }
}
</style>
