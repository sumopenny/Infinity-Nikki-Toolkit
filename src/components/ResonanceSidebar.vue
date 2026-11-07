<script setup lang="ts">
import { vImageSkeleton } from '../utils/imageSkeleton'
import DesktopMenuTransition from './DesktopMenuTransition.vue'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useSidebarMenu } from '../composables/useSidebarMenu'
import { ChevronDown } from 'lucide-vue-next'
import type { Language } from '../i18n/types'
import { messages } from '../i18n'
import { useCompactLayout } from '../composables/useCompactLayout'
import {
  sortResonanceRecords,
  type ResonanceBannerOrder,
  type ResonanceRarityFilter
} from '../utils/resonance/resonanceView'
import type { ResonanceLocalizedName, ResonanceRecord } from '../utils/resonance/resonanceTypes'

const props = withDefaults(
  defineProps<{
    records: ResonanceRecord[]
    language: Language
    bannerOrder?: ResonanceBannerOrder
    rarityFilter?: ResonanceRarityFilter
  }>(),
  { bannerOrder: 'newest', rarityFilter: 'all' }
)

const emit = defineEmits<{
  jumpToRecord: [recordId: string]
  changeBannerOrder: [order: ResonanceBannerOrder]
  changeRarityFilter: [rarity: ResonanceRarityFilter]
  filterSelected: []
}>()

const sortMenuOpen = ref(false)
const compact = useCompactLayout()
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
const sortedRecords = computed(() =>
  sortResonanceRecords(props.records, props.bannerOrder, props.rarityFilter)
)
const t = computed(() => messages[props.language].resonance)
const selectedOptionLabel = computed(() => {
  const order = props.bannerOrder === 'newest' ? t.value.newestFirst : t.value.oldestFirst
  return props.rarityFilter === 'all' ? order : `${t.value.rarity(props.rarityFilter)} · ${order}`
})

/** 手机选择直接作用于记录并返回列表；桌面保留原排序菜单行为。 */
function toggleSortMenu() {
  if (!sortMenuOpen.value && sortButtonRef.value) positionMenu(sortButtonRef.value)
  sortMenuOpen.value = !sortMenuOpen.value
}
function selectBannerOrder(order: ResonanceBannerOrder) {
  sortMenuOpen.value = false
  sortButtonRef.value?.focus()
  if (order !== props.bannerOrder) emit('changeBannerOrder', order)
  if (compact.value) emit('filterSelected')
}

function selectRarityFilter(rarity: ResonanceRarityFilter) {
  sortMenuOpen.value = false
  sortButtonRef.value?.focus()
  if (rarity !== props.rarityFilter) emit('changeRarityFilter', rarity)
  if (compact.value) emit('filterSelected')
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

onMounted(() => document.addEventListener('click', handleDocumentClick))
onBeforeUnmount(() => document.removeEventListener('click', handleDocumentClick))

function displayName(value: ResonanceLocalizedName): string {
  return value[props.language] || value.zh || value.en
}

function hideBrokenImage(event: Event) {
  ;(event.target as HTMLImageElement).hidden = true
}
</script>

<template>
  <aside
    v-if="records.length || compact"
    class="date-sidebar resonance-sidebar"
    :aria-label="t.title"
  >
    <div v-if="compact" class="resonance-picker-controls">
      <div role="group" :aria-label="t.bannerOrder"
        ><p>{{ t.bannerOrder }}</p
        ><div class="resonance-picker-options"
          ><button
            v-for="order in ['newest', 'oldest'] as ResonanceBannerOrder[]"
            :key="order"
            type="button"
            :aria-pressed="bannerOrder === order"
            @click="selectBannerOrder(order)"
            >{{ order === 'newest' ? t.newestFirst : t.oldestFirst }}</button
          ></div
        ></div
      >
      <div role="group" :aria-label="t.rarityFilter"
        ><p>{{ t.rarityFilter }}</p
        ><div class="resonance-picker-options"
          ><button
            v-for="rarity in ['all', 5, 4] as ResonanceRarityFilter[]"
            :key="rarity"
            type="button"
            :aria-pressed="rarityFilter === rarity"
            @click="selectRarityFilter(rarity)"
            >{{
              rarity === 'all' ? t.allRarities : rarity === 5 ? t.onlyFiveStar : t.onlyFourStar
            }}</button
          ></div
        ></div
      >
    </div>
    <div v-if="!compact" class="sidebar-section-title">{{ t.title }}</div>
    <div
      v-if="!compact"
      ref="sortMenuWrapRef"
      class="action-sort-select-wrap resonance-sort-control"
      @keydown="handleSortKeydown"
    >
      <button
        ref="sortButtonRef"
        type="button"
        class="cleanup-account-select action-sort-select"
        :class="{ open: sortMenuOpen }"
        aria-haspopup="menu"
        :aria-label="`${t.displayOptions}: ${selectedOptionLabel}`"
        :aria-expanded="sortMenuOpen"
        @click="toggleSortMenu"
      >
        <span>{{ selectedOptionLabel }}</span>
        <ChevronDown :size="14" aria-hidden="true" />
      </button>
      <Teleport to="body" :disabled="compact">
        <DesktopMenuTransition>
          <div
            v-if="sortMenuOpen"
            ref="sortMenuRef"
            :style="compact ? undefined : menuStyle"
            @keydown="handleSortKeydown"
            class="cleanup-account-menu action-sort-menu resonance-options-menu"
            role="menu"
            :aria-label="t.displayOptions"
          >
            <div role="group" :aria-label="t.bannerOrder">
              <div class="resonance-options-label">{{ t.bannerOrder }}</div>
              <button
                v-for="order in ['newest', 'oldest'] as ResonanceBannerOrder[]"
                :key="order"
                type="button"
                role="menuitemradio"
                :aria-checked="bannerOrder === order"
                :class="{ active: bannerOrder === order }"
                @click="selectBannerOrder(order)"
                >{{ order === 'newest' ? t.newestFirst : t.oldestFirst }}</button
              >
            </div>
            <div class="resonance-options-divider" role="separator"></div>
            <div role="group" :aria-label="t.rarityFilter">
              <div class="resonance-options-label">{{ t.rarityFilter }}</div>
              <button
                v-for="rarity in ['all', 5, 4] as ResonanceRarityFilter[]"
                :key="rarity"
                type="button"
                role="menuitemradio"
                :aria-checked="rarityFilter === rarity"
                :class="{ active: rarityFilter === rarity }"
                @click="selectRarityFilter(rarity)"
                >{{
                  rarity === 'all' ? t.allRarities : rarity === 5 ? t.onlyFiveStar : t.onlyFourStar
                }}</button
              >
            </div>
          </div>
        </DesktopMenuTransition>
      </Teleport>
    </div>
    <p v-if="!sortedRecords.length" class="resonance-filter-empty">{{
      records.length ? t.noMatchingRarity : t.emptyTitle
    }}</p>
    <button
      v-for="record in sortedRecords"
      :key="record.id"
      class="resonance-sidebar-link"
      type="button"
      @click="emit('jumpToRecord', record.id)"
    >
      <span class="resonance-sidebar-thumbnail">
        <img v-image-skeleton
          referrerpolicy="no-referrer"
          :src="record.outfitImageUrl"
          alt=""
          @error="hideBrokenImage"
        />
      </span>
      <span class="resonance-sidebar-name">
        <span class="resonance-sidebar-outfit-name" :title="displayName(record.outfitName)">{{
          displayName(record.outfitName)
        }}</span>
        <span class="resonance-sidebar-rarity">{{ t.rarity(record.rarity) }}</span>
      </span>
    </button>
  </aside>
</template>
