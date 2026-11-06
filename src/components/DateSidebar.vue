<script setup lang="ts">
import DesktopMenuTransition from './DesktopMenuTransition.vue'
import TreeCollapse from './TreeCollapse.vue'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useSidebarMenu } from '../composables/useSidebarMenu'
import { ChevronDown, ChevronRight } from 'lucide-vue-next'
import { useCompactLayout } from '../composables/useCompactLayout'
import type { Language, LocaleMessages } from '../i18n'
import type { ActionGroup, ActionSort, YearGroup } from '../utils/photoGrouping'

const props = defineProps<{
  yearGroups: YearGroup[]
  actionGroups: ActionGroup[]
  mode: 'date' | 'action'
  actionSort: ActionSort
  language: Language
  messages: LocaleMessages['sidebar']
}>()

const emit = defineEmits<{
  jumpToDate: [dateKey: string]
  jumpToAction: [actionKey: string]
  changeMode: [mode: 'date' | 'action']
  changeActionSort: [sort: ActionSort]
}>()

const expandedYears = ref(new Set<string>())
const expandedMonths = ref(new Set<string>())
const compact = useCompactLayout()
const sortMenuOpen = ref(false)
const sortMenuWrapRef = ref<HTMLDivElement | null>(null)
const sortButtonRef = ref<HTMLButtonElement | null>(null)
const sortMenuRef = ref<HTMLDivElement | null>(null)
const { menuStyle, positionMenu } = useSidebarMenu(
  () => {
    sortMenuOpen.value = false
  },
  () => sortMenuRef.value
)
watch(compact, () => {
  sortMenuOpen.value = false
})
let initialized = false

/** 在首次出现日期数据时只展开最新年份和最新月份，并保留当前会话的后续操作。参数：groups 为日期树。 */
function initializeExpandedGroups(groups: YearGroup[]) {
  if (initialized || !groups.length) return
  initialized = true
  expandedYears.value = new Set([groups[0].year])
  if (groups[0].months[0]) expandedMonths.value = new Set([groups[0].months[0].monthKey])
}

/** 切换年份展开状态。参数：year 为年份。 */
function toggleYear(year: string) {
  const next = new Set(expandedYears.value)
  next.has(year) ? next.delete(year) : next.add(year)
  expandedYears.value = next
}

/** 切换月份展开状态。参数：monthKey 为年-月键。 */
function toggleMonth(monthKey: string) {
  const next = new Set(expandedMonths.value)
  next.has(monthKey) ? next.delete(monthKey) : next.add(monthKey)
  expandedMonths.value = next
}

/** 去除月份前导零并按当前语言格式化。参数：month 为两位月份。 */
function formatMonth(month: string): string {
  if (props.language === 'zh') return `${Number(month)}月`
  return new Intl.DateTimeFormat('en-US', { month: 'long' }).format(
    new Date(2026, Number(month) - 1, 1)
  )
}

const sortLabels = {
  id: () => props.messages.sortId,
  name: () => props.messages.sortName,
  count: () => props.messages.sortCount,
  latest: () => props.messages.sortLatest
} satisfies Record<ActionSort, () => string>

function toggleSortMenu() {
  if (!sortMenuOpen.value && sortButtonRef.value) positionMenu(sortButtonRef.value)
  sortMenuOpen.value = !sortMenuOpen.value
}

function selectSort(sort: ActionSort) {
  sortMenuOpen.value = false
  sortButtonRef.value?.focus()
  if (sort !== props.actionSort) emit('changeActionSort', sort)
}

function handleSortKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape' || !sortMenuOpen.value) return
  event.stopPropagation()
  sortMenuOpen.value = false
  sortButtonRef.value?.focus()
}

function handleDocumentClick(event: MouseEvent) {
  if (
    sortMenuOpen.value &&
    !sortMenuWrapRef.value?.contains(event.target as Node) &&
    !sortMenuRef.value?.contains(event.target as Node)
  )
    sortMenuOpen.value = false
}

watch(() => props.yearGroups, initializeExpandedGroups, { immediate: true })
onMounted(() => document.addEventListener('click', handleDocumentClick))
onBeforeUnmount(() => document.removeEventListener('click', handleDocumentClick))
</script>

<template>
  <aside class="date-sidebar" :aria-label="messages.aria">
    <div class="sidebar-heading-row">
      <div class="sidebar-mode-switch" role="group" :aria-label="messages.title">
        <button
          type="button"
          :class="{ active: mode === 'date' }"
          :aria-pressed="mode === 'date'"
          @click="$emit('changeMode', 'date')"
          >{{ messages.title }}</button
        >
        <button
          type="button"
          :class="{ active: mode === 'action' }"
          :aria-pressed="mode === 'action'"
          @click="$emit('changeMode', 'action')"
          >{{ messages.actionsTitle }}</button
        >
      </div>
    </div>

    <template v-if="mode === 'date'">
      <div v-if="!yearGroups.length" class="empty-sidebar">{{ messages.empty }}</div>

      <section v-for="yearGroup in yearGroups" :key="yearGroup.year" class="timeline-year">
        <button
          class="timeline-toggle year-toggle"
          type="button"
          :aria-expanded="expandedYears.has(yearGroup.year)"
          @click="toggleYear(yearGroup.year)"
        >
          <ChevronRight :size="15" :class="{ expanded: expandedYears.has(yearGroup.year) }" />
          <strong>{{ yearGroup.year }}</strong>
          <span>{{ yearGroup.photoCount }}</span>
        </button>
        <TreeCollapse :open="expandedYears.has(yearGroup.year)">
          <div class="timeline-months">
            <section v-for="month in yearGroup.months" :key="month.monthKey">
              <button
                class="timeline-toggle month-toggle"
                type="button"
                :aria-expanded="expandedMonths.has(month.monthKey)"
                @click="toggleMonth(month.monthKey)"
              >
                <ChevronRight
                  :size="14"
                  :class="{ expanded: expandedMonths.has(month.monthKey) }"
                />
                <span>{{ formatMonth(month.month) }}</span>
                <small>{{ month.photoCount }}</small>
              </button>
              <TreeCollapse :open="expandedMonths.has(month.monthKey)">
                <div class="timeline-dates">
                  <button
                    v-for="date in month.dates"
                    :key="date.dateKey"
                    class="date-link"
                    type="button"
                    @click="$emit('jumpToDate', date.dateKey)"
                  >
                    <span>{{ date.monthDay }}</span>
                    <small>{{ date.photos.length }}</small>
                  </button>
                </div>
              </TreeCollapse>
            </section>
          </div>
        </TreeCollapse>
      </section>
    </template>

    <template v-else>
      <div class="action-sidebar-toolbar">
        <div ref="sortMenuWrapRef" class="action-sort-select-wrap" @keydown="handleSortKeydown">
          <button
            ref="sortButtonRef"
            type="button"
            class="cleanup-account-select action-sort-select"
            :class="{ open: sortMenuOpen }"
            aria-haspopup="listbox"
            :aria-expanded="sortMenuOpen"
            @click="toggleSortMenu"
          >
            <span>{{ sortLabels[actionSort]() }}</span>
            <ChevronDown :size="14" aria-hidden="true" />
          </button>
          <Teleport to="body" :disabled="compact">
            <DesktopMenuTransition>
              <div
                v-if="sortMenuOpen"
                ref="sortMenuRef"
                :style="compact ? undefined : menuStyle"
                @keydown="handleSortKeydown"
                class="cleanup-account-menu action-sort-menu"
                role="listbox"
                :aria-label="messages.sort"
              >
                <button
                  v-for="sort in ['id', 'name', 'count', 'latest'] as ActionSort[]"
                  :key="sort"
                  type="button"
                  role="option"
                  :aria-selected="actionSort === sort"
                  :class="{ active: actionSort === sort }"
                  @click="selectSort(sort)"
                >
                  <span>{{ sortLabels[sort]() }}</span>
                </button>
              </div>
            </DesktopMenuTransition>
          </Teleport>
        </div>
      </div>
      <div v-if="!actionGroups.length" class="empty-sidebar">{{ messages.empty }}</div>
      <button
        v-for="group in actionGroups"
        :key="group.actionKey"
        class="action-link"
        type="button"
        @click="$emit('jumpToAction', group.actionKey)"
      >
        <img v-if="group.actionImageUrl" :src="group.actionImageUrl" :alt="group.actionName" />
        <span v-else class="action-link-placeholder" aria-hidden="true">?</span>
        <span class="action-link-name">{{ group.actionName }}</span>
        <small>{{ group.photos.length }}</small>
      </button>
    </template>
  </aside>
</template>
