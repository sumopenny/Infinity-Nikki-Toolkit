<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import { ArrowLeftRight } from 'lucide-vue-next'
import CatalogImage from './CatalogImage.vue'
import MakeupFilters from './MakeupFilters.vue'
import MakeupDetailDialog from './MakeupDetailDialog.vue'
import type { MakeupEntry, MakeupRelations, MakeupRelatedOutfit } from '../utils/makeupCatalog'
import { useCompactLayout } from '../composables/useCompactLayout'
import {
  wardrobeGameVersionOptions,
  wardrobeSourceOptions,
  matchesWardrobeGameVersion,
  matchesWardrobeSource
} from '../utils/wardrobe/wardrobeFilters'
import { loadMakeupCatalog } from '../utils/loadMakeupCatalog'
import { catalogImagePlaceholder } from '../utils/gongeo/catalogImage'
import { vCardReveal } from '../utils/cardReveal'
import { wardrobeVariantLabels } from '../utils/wardrobe/wardrobePresentation'
import type { Language } from '../i18n/types'

const props = withDefaults(
  defineProps<{
    language?: Language
    searchQuery?: string
    sidebarTarget?: string
    mobileCategoryTarget?: string
  }>(),
  {
    language: 'zh',
    searchQuery: ''
  }
)
const compact = useCompactLayout()
type MakeupView = 'full' | 'part'
const tab = ref<MakeupView>('full')
const filtersByTab = ref({
  full: { version: 'all', source: 'all' },
  part: { version: 'all', source: 'all' }
})
const quality = ref('all')
const partCategory = ref('all')
const category = computed({
  get: () => (tab.value === 'full' ? 'all' : partCategory.value),
  set: (value: string) => {
    partCategory.value = value
    if (value !== 'all') tab.value = 'part'
  }
})
const version = computed({
  get: () => filtersByTab.value[tab.value].version,
  set: (value) => {
    filtersByTab.value[tab.value].version = value
  }
})
const source = computed({
  get: () => filtersByTab.value[tab.value].source,
  set: (value) => {
    filtersByTab.value[tab.value].source = value
  }
})
function resetFilters() {
  if (tab.value === 'part') {
    quality.value = 'all'
    category.value = 'all'
  }
  version.value = 'all'
  source.value = 'all'
}
const text = (zh: string, en: string) => (props.language === 'zh' ? zh : en)
const entries = shallowRef<MakeupEntry[]>([])
const parts = shallowRef<MakeupEntry[]>([])
const selectedMakeup = shallowRef<MakeupEntry | null>(null)
const relations = shallowRef(new Map<string, MakeupRelations>())
const relatedOutfits = shallowRef<MakeupRelatedOutfit[]>([])
// 版本按主版本、次版本比较，避免将 2.10 当作小数 2.1。
function versionOrder(value: string | null) {
  if (value === null) return -1
  const [major = 0, minor = 0] = value.split('.').map(Number)
  return major * 100 + minor
}
const currentEntries = computed(() =>
  [...(tab.value === 'full' ? entries.value : parts.value)].sort(
    (a, b) =>
      versionOrder(b.version) - versionOrder(a.version) || (b.quality ?? -1) - (a.quality ?? -1)
  )
)
const categoryLabels: Record<Language, readonly string[]> = {
  zh: ['全妆', '底妆', '眉毛', '睫毛', '美瞳', '唇妆'],
  en: ['Full makeup', 'Base makeup', 'Eyebrows', 'Eyelashes', 'Contact lenses', 'Lips']
}
const categoryOptions = computed(() => [
  { value: 'all', label: text('全部', 'All') },
  { value: '1', label: text('底妆', 'Base makeup') },
  { value: '2', label: text('眉妆', 'Eyebrows') },
  { value: '3', label: text('睫毛', 'Eyelashes') },
  { value: '4', label: text('美瞳', 'Contact lenses') },
  { value: '5', label: text('唇妆', 'Lips') }
])
const unit = computed(() => (tab.value === 'full' ? text('款', 'looks') : text('件', 'pieces')))
const loading = ref(true)
const failed = ref(false)
let disposed = false
onBeforeUnmount(() => {
  disposed = true
})
async function load() {
  loading.value = true
  failed.value = false
  try {
    const data = await loadMakeupCatalog()
    if (disposed) return
    entries.value = data.entries
    parts.value = data.parts
    relations.value = data.relations
    relatedOutfits.value = data.relatedOutfits
  } catch {
    if (!disposed) failed.value = true
  } finally {
    if (!disposed) loading.value = false
  }
}
onMounted(load)
const versionOptions = computed(() => [
  { value: 'all', label: text('全部', 'All') },
  ...wardrobeGameVersionOptions(props.language).filter((option) =>
    currentEntries.value.some((entry) => entry.version === option.value)
  )
])
const sourceOptions = computed(() => [
  { value: 'all', label: text('全部', 'All') },
  ...wardrobeSourceOptions('item', props.language).filter(
    (option) =>
      option.value !== 'limited-reward' &&
      currentEntries.value.some((entry) => matchesWardrobeSource(entry, option.value))
  )
])
const qualityOptions = computed(() => [
  { value: 'all', label: text('全部', 'All') },
  ...[
    ...new Set(parts.value.flatMap((entry) => (entry.quality === undefined ? [] : [entry.quality])))
  ]
    .sort((a, b) => b - a)
    .map((value) => ({ value: String(value), label: `${value} ★` }))
])
const filtered = computed(() => {
  const query = props.searchQuery.trim().toLocaleLowerCase()
  return currentEntries.value.filter(
    (entry) =>
      (tab.value !== 'part' ||
        category.value === 'all' ||
        entry.category === Number(category.value)) &&
      (tab.value !== 'part' ||
        quality.value === 'all' ||
        entry.quality === Number(quality.value)) &&
      matchesWardrobeGameVersion(entry, version.value) &&
      matchesWardrobeSource(entry, source.value) &&
      (!query ||
        `${entry.id} ${entry.name.zh} ${entry.name.en}`.toLocaleLowerCase().includes(query))
  )
})
</script>

<template>
  <section class="makeup-page" aria-labelledby="makeup-title" :aria-busy="loading">
    <header class="gallery-header makeup-header">
      <h2 id="makeup-title">{{ text('妆容图鉴', 'Makeup catalog') }}</h2>
      <p v-if="!compact && !loading && !failed" role="status">
        {{
          searchQuery.trim() ||
          version !== 'all' ||
          source !== 'all' ||
          (tab === 'part' && (quality !== 'all' || category !== 'all'))
            ? text(
                `找到 ${filtered.length} ${unit} / 共 ${currentEntries.length} ${unit}`,
                `${filtered.length} of ${currentEntries.length} ${unit}`
              )
            : text(`共 ${currentEntries.length} ${unit}`, `${currentEntries.length} ${unit}`)
        }}
      </p>
      <nav
        v-if="!compact"
        class="makeup-type-filters"
        :aria-label="text('部件分类筛选', 'Filter piece category')"
      >
        <button
          v-for="option in categoryOptions"
          :key="option.value"
          type="button"
          :class="{ active: category === option.value }"
          :aria-pressed="category === option.value"
          :disabled="loading || failed"
          @click="category = option.value"
          >{{ option.label }}</button
        >
      </nav>
    </header>
    <Teleport
      v-if="compact"
      :to="mobileCategoryTarget || 'body'"
      :disabled="!mobileCategoryTarget"
      defer
    >
      <button
        class="makeup-mobile-category-switch"
        type="button"
        :disabled="loading || failed"
        :aria-label="
          tab === 'full'
            ? text('切换到部件', 'Switch to pieces')
            : text('切换到全妆', 'Switch to full makeup')
        "
        @click="tab = tab === 'full' ? 'part' : 'full'"
      >
        <ArrowLeftRight :size="14" aria-hidden="true" />{{
          tab === 'full' ? text('部件', 'Pieces') : text('全妆', 'Full makeup')
        }}
      </button>
      <p class="makeup-mobile-summary"
        >{{ tab === 'full' ? text('全妆', 'Full makeup') : text('部件', 'Pieces') }}
        <strong>{{ currentEntries.length }}</strong> {{ unit }}</p
      >
    </Teleport>
    <MakeupFilters
      :key="tab"
      :unit="unit"
      v-model:version="version"
      v-model:source="source"
      v-model:quality="quality"
      v-model:category="category"
      :categories="categoryOptions"
      :qualities="tab === 'part' ? qualityOptions : undefined"
      :language="language"
      :sidebar-target="sidebarTarget"
      :count="filtered.length"
      :disabled="loading || failed"
      :versions="versionOptions"
      :sources="sourceOptions"
      @reset="resetFilters"
    >
      <template #category>
        <nav
          class="sidebar-mode-switch makeup-category-tabs"
          :aria-label="text('妆容分类', 'Makeup category')"
        >
          <button
            type="button"
            :disabled="loading || failed"
            :aria-pressed="tab === 'full'"
            :class="{ active: tab === 'full' }"
            @click="tab = 'full'"
            >{{ text('全妆', 'Full makeup') }}</button
          >
          <button
            type="button"
            :disabled="loading || failed"
            :aria-pressed="tab === 'part'"
            :class="{ active: tab === 'part' }"
            @click="tab = 'part'"
            >{{ text('部件', 'Pieces') }}</button
          >
        </nav>
      </template>
    </MakeupFilters>
    <p v-if="loading" class="makeup-empty" role="status">{{
      text('正在加载妆容图鉴…', 'Loading makeup catalog…')
    }}</p>
    <div v-else-if="failed" class="makeup-empty" role="alert">
      <p>{{
        text('妆容图鉴加载失败，请重试。', 'Could not load the makeup catalog. Please retry.')
      }}</p>
      <button type="button" @click="load">{{ text('重新加载', 'Retry') }}</button>
    </div>
    <div v-else-if="filtered.length" class="makeup-grid" :class="{ 'is-pieces': tab === 'part' }">
      <article
        v-for="(entry, index) in filtered"
        :key="entry.id"
        v-card-reveal="`makeup:${entry.id}`"
        class="makeup-card is-openable"
        role="button"
        tabindex="0"
        :aria-label="
          (tab === 'full'
            ? text('查看全妆详情：', 'View makeup details: ')
            : text('查看部件详情：', 'View piece details: ')) + entry.name[language]
        "
        @click="selectedMakeup = entry"
        @keydown.enter.self.prevent="selectedMakeup = entry"
        @keydown.space.self.prevent="selectedMakeup = entry"
      >
        <div class="makeup-cover">
          <span v-if="entry.image === catalogImagePlaceholder" class="makeup-missing">{{
            text('暂无图片', 'Image unavailable')
          }}</span>
          <CatalogImage
            v-else
            :src="entry.image"
            width="520"
            height="724"
            :alt="entry.name[language]"
            :language="language"
            :index="index"
          />
          <span class="makeup-variant">{{
            tab === 'part'
              ? categoryLabels[language][entry.category]
              : entry.variant === null
                ? text('全妆', 'Full makeup')
                : wardrobeVariantLabels[language][entry.variant]
          }}</span>
        </div>
        <div class="makeup-card-body">
          <h3 :title="entry.name[language]">{{ entry.name[language] }}</h3>
          <small v-if="entry.quality !== undefined" class="makeup-card-rarity"
            >{{ entry.quality }} ★</small
          >
        </div>
      </article>
    </div>
    <p v-else class="makeup-empty" role="status">{{
      tab === 'full'
        ? text('没有符合条件的妆容', 'No matching makeup')
        : text('没有符合条件的妆容部件', 'No matching makeup pieces')
    }}</p>
  </section>
  <MakeupDetailDialog
    :detail="selectedMakeup"
    :entries="entries"
    :parts="parts"
    :relations="relations"
    :outfits="relatedOutfits"
    :language="language"
    @close="selectedMakeup = null"
    @select-form="selectedMakeup = $event"
    @select-entry="selectedMakeup = $event"
  />
</template>

<style scoped>
.makeup-category-tabs {
  margin: 0 0 10px;
  width: 100%;
}
.makeup-mobile-category-switch {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  gap: 5px;
  box-sizing: border-box;
  height: calc(var(--mobile-control-size, 44px) - 10px);
  min-height: 0;
  padding: 0 9px;
  border: 1px solid #dec9c7;
  border-radius: 9px;
  background: var(--surface-strong);
  color: #b98287;
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
}
:root[data-theme='dark'] .makeup-mobile-category-switch {
  border-color: var(--line);
  color: var(--pink-deep);
}
.makeup-mobile-category-switch:focus-visible {
  outline: 2px solid var(--pink-deep);
  outline-offset: 2px;
}
.makeup-mobile-summary {
  flex-shrink: 0;
  margin: 0;
  color: var(--muted);
  font-size: 12px;
  white-space: nowrap;
}
.makeup-mobile-summary strong {
  color: var(--pink-deep);
  font-variant-numeric: tabular-nums;
}
@media (min-width: 900px) {
  .makeup-grid.is-pieces {
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  }
}
.makeup-page {
  min-width: 0;
}
.makeup-header {
  justify-content: flex-start;
  align-items: baseline;
  gap: 6px 20px;
  flex-wrap: wrap;
  margin-bottom: 16px;
}
.makeup-type-filters {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-left: auto;
}
.makeup-type-filters button {
  min-height: 32px;
  padding: 5px 14px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--surface);
  color: var(--text);
  font-size: 13px;
  line-height: 1.4;
  white-space: nowrap;
  cursor: pointer;
  transition:
    transform var(--motion-fast) ease,
    border-color var(--motion-fast) ease,
    background var(--motion-fast) ease,
    color var(--motion-fast) ease;
}
.makeup-type-filters button:hover:not(:disabled) {
  transform: translateY(-1px);
  border-color: var(--pink-deep);
}
.makeup-type-filters button:active:not(:disabled) {
  transform: translateY(0);
}
.makeup-type-filters button:disabled {
  cursor: not-allowed;
}
.makeup-type-filters button.active {
  background: var(--pink-deep);
  border-color: var(--pink-deep);
  color: #fff;
}
.makeup-type-filters button:focus-visible {
  outline: 2px solid var(--pink-deep);
  outline-offset: 2px;
}
.makeup-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
  gap: 16px;
  align-items: start;
}
.makeup-card {
  min-width: 0;
  overflow: hidden;
  background: var(--surface);
  border: 1px solid var(--line-soft);
  border-radius: var(--ui-radius);
  box-shadow: var(--photo-shadow);
  transition:
    border-color var(--motion-fast) ease,
    box-shadow var(--motion-fast) ease;
}
:root.is-theme-switching .makeup-card {
  transition: none;
}
.makeup-card:hover,
.makeup-card:focus-visible,
.makeup-card:has(button:focus-visible) {
  border-color: var(--pink-deep);
  box-shadow: var(--photo-hover-shadow);
}
.makeup-card.is-openable {
  --photo-hover-shadow: 0 1px 5px rgba(201, 132, 134, 0.202);
  cursor: pointer;
}
:where(:root[data-theme='dark']) .makeup-card.is-openable {
  --photo-hover-shadow: 0 2px 8px rgba(185, 126, 126, 0.524);
}
.makeup-card.is-openable:focus-visible {
  outline: 2px solid var(--pink-deep);
  outline-offset: 3px;
}
.makeup-cover {
  aspect-ratio: 520 / 724;
  position: relative;
  overflow: hidden;
}
.makeup-variant {
  position: absolute;
  top: 10px;
  left: 10px;
  padding: 4px 8px;
  border: 1px solid var(--form-control-border);
  border-radius: var(--radius-sm);
  background: var(--form-control-bg);
  -webkit-backdrop-filter: blur(8px);
  backdrop-filter: blur(2px);
  color: var(--text);
  font-size: 12px;
  pointer-events: none;
}
.makeup-cover img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.makeup-missing {
  display: flex;
  align-items: center;
  justify-content: center;
  aspect-ratio: 520 / 724;
  color: var(--muted);
}
.makeup-card-body {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 12px;
}
.makeup-card-rarity {
  flex-shrink: 0;
  margin-left: auto;
  color: #b78343;
  font-size: 12px;
  white-space: nowrap;
}
.makeup-card h3 {
  min-width: 0;
  margin: 0;
  color: var(--text);
  font-size: 14px;
  line-height: 1.4;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.makeup-empty {
  padding: 32px 12px;
  text-align: center;
  color: var(--muted);
}
@media (max-width: 899px) {
  .makeup-variant {
    top: 6px;
    left: 6px;
    padding: 3px 6px;
    font-size: 10px;
  }
  .makeup-grid {
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 10px;
  }
  .makeup-card-body {
    gap: 4px;
    padding: 6px;
  }
  .makeup-card-rarity {
    font-size: 10px;
  }
  .makeup-card h3 {
    font-size: 12px;
    line-height: 1.35;
  }
}
@media (min-width: 641px) and (max-width: 799px) {
  .makeup-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 8px;
  }
}
@media (max-width: 640px) {
  .makeup-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 6px;
  }
}
@media (max-width: 350px) {
  .makeup-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
