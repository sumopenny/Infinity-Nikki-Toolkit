<script setup lang="ts">
import { vSegmentedIndicator } from '../utils/segmentedIndicator'
import {
  computed,
  defineAsyncComponent,
  nextTick,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  shallowRef,
  watch
} from 'vue'
import { ChevronRight, Shirt, X } from 'lucide-vue-next'
import { useBodyScrollLock } from '../utils/bodyScrollLock'
import { runWithConcurrency } from '../utils/concurrency'
import type { OutfitItem } from '../utils/outfit/outfitTypes'
import {
  parseOutfitCode,
  readCachedOutfitResult,
  type LookbookDecodeResult
} from '../utils/outfit/outfitCodeParser'
import {
  getCatalogEntryName,
  getCatalogImageUrl,
  loadItemCatalog,
  type ItemCatalogEntry
} from '../utils/outfit/itemCatalog'
import { getClothTypeLabel, inferClothTypeFromItemId } from '../utils/outfit/clothType'
import {
  indexOutfitSummary,
  outfitSummaryTrend,
  summarizeOutfitResults
} from '../utils/outfit/outfitSummary'
import DialogChoiceMenu from './DialogChoiceMenu.vue'
import CatalogImage from './CatalogImage.vue'
import { outfitMessages } from '../i18n/messages/outfit'
import type { ParseItemView } from '../utils/outfit/parseItemView'

import ItemDetail from './OutfitParseDialog.vue'

const props = defineProps<{ outfits: OutfitItem[]; language: 'zh' | 'en' }>()
const emit = defineEmits<{ close: []; tag: [tag: string] }>()
const t = (zh: string, en: string) => (props.language === 'zh' ? zh : en)
const TrendChart = defineAsyncComponent(() => import('./OutfitSummaryTrendChart.vue'))
const now = new Date()
const dialog = ref<HTMLDialogElement>()
const selectedItem = shallowRef<Pick<ParseItemView, 'id' | 'name' | 'clothType'> | null>(null)
let detailTrigger: HTMLButtonElement | null = null
let summaryScroll = 0
const content = ref<HTMLElement>()

function selectRow(row: { id: string | number; name: string }, event: MouseEvent) {
  if (typeof row.id === 'string') {
    emit('tag', row.id)
    return
  }
  detailTrigger = event.currentTarget as HTMLButtonElement
  summaryScroll = content.value?.scrollTop ?? 0
  dialog.value?.close()
  selectedItem.value = { id: row.id, name: row.name, clothType: inferClothTypeFromItemId(row.id) }
}

async function returnToSummary() {
  selectedItem.value = null
  await nextTick()
  dialog.value?.showModal()
  if (content.value) content.value.scrollTop = summaryScroll
  detailTrigger?.focus({ preventScroll: true })
}
const tab = ref<'overview' | 'tags' | 'clothes' | 'makeup'>('overview')
async function showTab(next: typeof tab.value, focus = false) {
  if (tab.value !== next) {
    tab.value = next
    part.value = null
    collapseRanking()
  }
  if (focus) {
    await nextTick()
    content.value?.querySelector<HTMLButtonElement>(`[data-summary-tab="${next}"]`)?.focus()
  }
}
const tabs = computed(() => ({
  overview: t('概览', 'Overview'),
  tags: t('常用标签', 'Tags'),
  clothes: t('常穿部件', 'Clothing'),
  makeup: t('常用妆容', 'Makeup')
}))
const part = ref<number | null>(null)
const expanded = ref(false)
function collapseRanking() {
  expanded.value = false
  void nextTick(() => {
    if (!expanded.value && content.value) content.value.scrollTop = 0
  })
}
function changePart(next: typeof part.value) {
  if (part.value === next) return
  part.value = next
  collapseRanking()
}
const catalog = shallowRef<Map<number, ItemCatalogEntry>>()
const results = reactive(new Map<string, LookbookDecodeResult>())
const failed = reactive(new Set<string>())
const reading = ref(true)
const running = ref(false)
let session = new AbortController()
useBodyScrollLock(ref(true))
onMounted(() => {
  dialog.value?.showModal()
  void loadItemCatalog()
    .then((value) => {
      catalog.value = value
    })
    .catch(() => {})
})
onBeforeUnmount(() => {
  session.abort()
  dialog.value?.close()
})
const library = computed(() => indexOutfitSummary(props.outfits))
watch(
  // 标签编辑不会改变缓存查询的码集合。
  () => Array.from(library.value.codes.keys()).sort().join('\n'),
  async (keys) => {
    const codes = keys ? keys.split('\n') : []
    session.abort()
    session = new AbortController()
    const { signal } = session
    reading.value = true
    running.value = false
    results.clear()
    failed.clear()
    await runWithConcurrency(
      codes,
      async (code) => {
        const cached = await readCachedOutfitResult(code)
        if (!signal.aborted && cached) results.set(code, cached)
      },
      { concurrency: 12, signal }
    )
    if (!signal.aborted) reading.value = false
  },
  { immediate: true }
)
const stats = computed(() => summarizeOutfitResults(library.value.codes, results, failed))
const remaining = computed(() => stats.value.pending + stats.value.failed)
const coverage = computed(() =>
  [
    { key: 'parsed', label: t('已解析', 'Parsed'), count: stats.value.parsed },
    { key: 'pending', label: t('待解析', 'Awaiting parsing'), count: stats.value.pending },
    { key: 'failed', label: t('解析失败', 'Failed'), count: stats.value.failed },
    { key: 'invalid', label: t('格式无效', 'Invalid code'), count: library.value.invalid },
    { key: 'missing', label: t('无搭配码', 'No code'), count: library.value.missing }
  ].filter(({ count }) => count > 0)
)
const percentFormatter = computed(() => new Intl.NumberFormat(props.language, { style: 'percent' }))
function share(count: number, total: number) {
  return percentFormatter.value.format(total ? count / total : 0)
}
const periods = computed(() => outfitSummaryTrend(props.outfits, now))
const selectedPeriod = ref<number | null>(null)
watch(periods, (available) => {
  if (!available.some(({ start }) => start === selectedPeriod.value)) selectedPeriod.value = null
})
const monthFormatter = computed(() => {
  const first = periods.value[0]?.start ?? +now
  const last = periods.value.at(-1)?.start ?? first
  return new Intl.DateTimeFormat(props.language, {
    month: 'short',
    year: new Date(first).getFullYear() === new Date(last).getFullYear() ? undefined : '2-digit'
  })
})
const trendPoints = computed(() =>
  periods.value.map(({ start, end, count }) => {
    const axisLabel = monthFormatter.value.format(start)
    const lastMonth = monthFormatter.value.format(Number.isFinite(end) ? end - 1 : 8.64e15)
    const title = axisLabel === lastMonth ? axisLabel : `${axisLabel} – ${lastMonth}`
    return {
      start,
      count,
      axisLabel,
      description: t(`${title} · ${count} 套`, `${title} · ${count} outfits`)
    }
  })
)
const selectedPeriodDescription = computed(
  () => trendPoints.value.find(({ start }) => start === selectedPeriod.value)?.description ?? ''
)
async function parseRemaining() {
  if (reading.value || running.value || !remaining.value) return
  const { signal } = session
  running.value = true
  await runWithConcurrency(
    stats.value.unresolved,
    async (code) => {
      try {
        const result = await parseOutfitCode(code)
        if (!signal.aborted) {
          results.set(code, result)
          failed.delete(code)
        }
      } catch {
        if (!signal.aborted) failed.add(code)
      }
    },
    { concurrency: 2, signal }
  )
  if (!signal.aborted) running.value = false
}
const items = computed(() => {
  return Array.from(stats.value.counts, ([id, count]) => {
    const entry = catalog.value?.get(id),
      type = inferClothTypeFromItemId(id)
    return {
      id,
      count,
      type,
      makeup: (type !== null && type >= 80 && type <= 86) || !!entry?.makeup,
      name: entry ? getCatalogEntryName(entry, props.language) || String(id) : String(id),
      icon: entry ? getCatalogImageUrl(entry) : '',
      label: getClothTypeLabel(type, props.language) ?? t('未知部位', 'Unknown type')
    }
  })
})
const categoryItems = computed(() =>
  items.value.filter((x) => x.makeup === (tab.value === 'makeup'))
)
const types = computed(() =>
  Array.from(new Map(categoryItems.value.map((x) => [x.type ?? -1, x.label]))).sort(
    (a, b) => a[0] - b[0]
  )
)
const tagRows = computed(() =>
  Array.from(library.value.tags, ([id, count]) => ({
    id,
    name: id || t('未分类', 'Uncategorized'),
    count,
    label: '',
    icon: ''
  })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, props.language))
)
const overviewTags = computed(() => [
  ...tagRows.value.filter(({ id }) => id).slice(0, 4),
  ...tagRows.value.filter(({ id }) => !id)
])
const rankingTotal = computed(() =>
  tab.value === 'tags' ? props.outfits.length : stats.value.parsed
)
const rows = computed(() => {
  if (tab.value === 'tags') return tagRows.value
  const list = categoryItems.value.filter((x) =>
    part.value === null ? x.type !== 86 : (x.type ?? -1) === part.value
  )
  return list.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, props.language))
})
const ranked = computed(() => {
  let rank = 0
  return rows.value.slice(0, expanded.value ? undefined : 5).map((row, index) => {
    if (index === 0 || rows.value[index - 1].count !== row.count) rank = index + 1
    return { ...row, rank }
  })
})
</script>
<template>
  <Teleport to="body">
    <dialog
      ref="dialog"
      class="summary-dialog"
      aria-labelledby="summary-title"
      @cancel.prevent="emit('close')"
    >
      <Transition name="confirm-dialog" appear>
        <div class="outfit-editor" @click.self="emit('close')">
          <section class="outfit-editor-panel outfit-parse-panel">
            <header>
              <div>
                <h2 id="summary-title">{{ t('搭配总结', 'Outfit summary') }}</h2>
                <small>{{ t(`已保存 ${outfits.length} 套`, `${outfits.length} saved`) }}</small>
              </div>
              <button
                autofocus
                class="summary-close"
                :aria-label="t('关闭', 'Close')"
                @click="emit('close')"
              >
                <X :size="20" />
              </button>
            </header>
            <main ref="content" class="outfit-parse-content summary-content">
              <div class="summary-toolbar">
                <nav
                  v-segmented-indicator
                  class="resonance-choice-row ranking-tabs"
                  :aria-label="t('搭配总结视图', 'Outfit summary view')"
                >
                  <button
                    v-for="(label, key) in tabs"
                    :key="key"
                    class="resonance-choice"
                    type="button"
                    :data-summary-tab="key"
                    :aria-pressed="tab === key"
                    @click="showTab(key)"
                  >
                    {{ label }}
                  </button>
                </nav>
              </div>
              <template v-if="tab === 'overview'">
                <section
                  class="summary-card coverage-panel"
                  aria-labelledby="summary-coverage-title"
                >
                  <div class="summary-card-heading">
                    <div>
                      <h3 id="summary-coverage-title">{{ t('解析覆盖', 'Parsing coverage') }}</h3>
                      <small v-if="reading" role="status">{{
                        t('正在读取解析记录…', 'Reading saved results…')
                      }}</small>
                      <small v-else class="coverage" role="status">
                        {{
                          t(
                            `已解析 ${stats.parsed} / ${outfits.length} 套`,
                            `${stats.parsed} / ${outfits.length} outfits parsed`
                          )
                        }}
                        <template v-if="outfits.length">
                          · {{ share(stats.parsed, outfits.length) }}</template
                        >
                      </small>
                    </div>
                    <button
                      v-if="!reading && (remaining || running)"
                      type="button"
                      class="confirm-dialog-button ghost dialog-action-control parse-action"
                      :disabled="running"
                      @click="parseRemaining"
                    >
                      {{
                        running
                          ? t(`解析中，剩余 ${remaining} 套`, `Parsing… ${remaining} remaining`)
                          : stats.failed && !stats.pending
                            ? t(`重试 ${remaining} 套`, `Retry ${remaining} outfits`)
                            : t(`解析 ${remaining} 套`, `Parse ${remaining} outfits`)
                      }}
                    </button>
                  </div>
                  <template v-if="!reading && outfits.length">
                    <div class="coverage-track" aria-hidden="true">
                      <span
                        v-for="status in coverage"
                        :key="status.key"
                        :class="`coverage-${status.key}`"
                        :style="{ flexGrow: status.count }"
                      />
                    </div>
                    <ul class="coverage-key" aria-live="polite">
                      <li v-for="status in coverage" :key="status.key">
                        <i :class="`coverage-${status.key}`" aria-hidden="true" />
                        {{ status.label }} <strong>{{ status.count }}</strong>
                      </li>
                    </ul>
                  </template>
                </section>
                <p v-if="!outfits.length" class="summary-card empty">
                  {{
                    t(
                      '添加第一套搭配后，这里就会出现你的总结。',
                      'Save an outfit to start your summary.'
                    )
                  }}
                </p>
                <div v-else class="summary-overview-grid">
                  <section class="summary-card" aria-labelledby="summary-trend-title">
                    <div class="summary-card-heading">
                      <h3 id="summary-trend-title">{{ t('收藏趋势', 'Save history') }}</h3>
                      <small v-if="periods.length">{{ t('套', 'Outfits') }}</small>
                    </div>
                    <template v-if="periods.length">
                      <div class="summary-chart-slot">
                        <TrendChart
                          :points="trendPoints"
                          :selected="selectedPeriod"
                          @select="selectedPeriod = $event"
                        />
                      </div>
                      <div class="summary-trend-detail">
                        <small>{{
                          t(`${outfits.length} 套收藏`, `${outfits.length} saved outfits`)
                        }}</small>
                        <small class="summary-period-readout" aria-live="polite">
                          {{ selectedPeriodDescription }}
                        </small>
                      </div>
                    </template>
                  </section>
                  <section class="summary-card" aria-labelledby="summary-tags-title">
                    <div class="summary-card-heading">
                      <h3 id="summary-tags-title">{{ t('标签分布', 'Tag distribution') }}</h3>
                      <button
                        type="button"
                        class="confirm-dialog-button ghost"
                        @click="showTab('tags', true)"
                      >
                        {{ t('查看全部', 'View all') }}
                      </button>
                    </div>
                    <button
                      v-for="row in overviewTags"
                      :key="row.id"
                      type="button"
                      class="summary-tag-row"
                      @click="emit('tag', row.id)"
                    >
                      <span>{{ row.name }}</span>
                      <span class="track" aria-hidden="true"
                        ><i :style="{ width: (100 * row.count) / outfits.length + '%' }"
                      /></span>
                      <span class="summary-row-count"
                        >{{ t(`${row.count} 套`, `${row.count} outfits`) }} ·
                        {{ share(row.count, outfits.length) }}</span
                      >
                    </button>
                  </section>
                </div>
              </template>
              <section v-else class="summary-card ranking-panel" :aria-label="tabs[tab]">
                <div class="summary-card-heading">
                  <div>
                    <h3>{{ tabs[tab] }}</h3>
                    <small v-if="tab === 'tags'">{{
                      t(`按 ${rankingTotal} 套收藏统计`, `Based on ${rankingTotal} saved outfits`)
                    }}</small>
                    <small v-else-if="reading">{{
                      t('正在读取解析记录…', 'Reading saved results…')
                    }}</small>
                  </div>
                  <DialogChoiceMenu
                    v-if="tab !== 'tags' && types.length"
                    :model-value="part"
                    @update:model-value="changePart"
                    class="part-menu"
                    :label="t('筛选部位', 'Filter by type')"
                    :options="[
                      { value: null, label: t('全部部位', 'All types') },
                      ...types.map(([value, label]) => ({ value, label }))
                    ]"
                  />
                </div>
                <div class="ranking-list" :class="{ 'ranking-list-empty': !rows.length }">
                  <button
                    type="button"
                    v-for="row in ranked"
                    :key="row.id"
                    class="summary-row"
                    @click="selectRow(row, $event)"
                  >
                    <span class="rank">{{ String(row.rank).padStart(2, '0') }}</span>
                    <span v-if="tab !== 'tags'" class="summary-item-thumb">
                      <CatalogImage v-if="row.icon" :src="row.icon" :language="language" alt="" />
                      <Shirt v-else :size="24" />
                    </span>
                    <span class="measure">
                      {{ row.name }}
                      <small>{{ row.label }}</small>
                      <span class="track" aria-hidden="true">
                        <i :style="{ width: (100 * row.count) / rankingTotal + '%' }" />
                      </span>
                    </span>
                    <span class="summary-row-count">
                      {{ t(`${row.count} 套`, `${row.count} outfits`) }} ·
                      {{ share(row.count, rankingTotal) }}
                    </span>
                    <ChevronRight :size="14" aria-hidden="true" />
                  </button>
                  <p v-if="!rows.length" class="empty">
                    {{
                      !outfits.length
                        ? t(
                            '添加第一套搭配后，这里就会出现你的总结。',
                            'Save an outfit to start your summary.'
                          )
                        : reading
                          ? t('正在读取解析记录…', 'Reading saved results…')
                          : !stats.parsed
                            ? t(
                                '解析搭配码后，这里会显示使用排行。',
                                'Parse outfit codes to see your ranking.'
                              )
                            : t('当前范围内没有对应部件。', 'No matching items in these outfits.')
                    }}
                  </p>
                  <button
                    v-if="!reading && !rows.length && tab !== 'tags' && remaining"
                    type="button"
                    class="confirm-dialog-button ghost more"
                    @click="showTab('overview', true)"
                  >
                    {{ t('查看解析覆盖', 'View parsing coverage') }}
                  </button>
                  <button
                    v-if="rows.length > 5"
                    type="button"
                    class="more confirm-dialog-button ghost"
                    @click="expanded ? collapseRanking() : (expanded = true)"
                  >
                    {{
                      expanded
                        ? t('收起', 'Show less')
                        : t('展开全部 ' + rows.length + ' 项', 'Show all ' + rows.length)
                    }}
                  </button>
                </div>
              </section>
            </main>
            <footer v-if="tab === 'clothes' || tab === 'makeup'" class="outfit-parse-footer">
              {{ t('同一单品每套只计一次。', 'Each item counts once per outfit.') }}
            </footer>
          </section>
        </div>
      </Transition>
    </dialog>
  </Teleport>
  <ItemDetail
    v-if="selectedItem"
    visible
    code=""
    :direct-item="selectedItem"
    :language="language"
    :messages="outfitMessages[language]"
    @close="returnToSummary"
  />
</template>
<style scoped>
.summary-dialog {
  position: fixed;
  inset: 0;
  width: 100%;
  height: 100%;
  max-width: none;
  max-height: none;
  margin: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--text);
}
.summary-dialog::backdrop {
  background: transparent;
}
.summary-dialog .outfit-parse-panel {
  width: min(1120px, 100%);
  height: min(720px, calc(100dvh - 48px));
  max-height: calc(100dvh - 48px);
  background: var(--surface-strong);
}
.summary-dialog .summary-content {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow-y: auto;
  overscroll-behavior: contain;
}
.summary-card {
  min-width: 0;
  padding: clamp(12px, 2vw, 18px);
  background: var(--surface-soft);
  border-radius: 14px;
}
.summary-overview-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.12fr) minmax(0, 1fr);
  gap: 12px;
}
.summary-card h3 {
  margin: 0;
  color: var(--heading);
  font-size: 0.95rem;
}
.summary-card-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 6px 12px;
}
.summary-card-heading > div:first-child {
  min-width: 0;
}
.coverage-panel .parse-action {
  flex: 0 0 auto;
  max-width: 100%;
}
.coverage-track {
  display: flex;
  gap: 2px;
  height: 9px;
  margin-block: 10px;
  overflow: hidden;
  border-radius: 6px;
  background: var(--line);
}
.coverage-track span {
  flex-basis: 0;
}
.coverage-key {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 16px;
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: 0.78rem;
}
.coverage-key li {
  display: flex;
  gap: 5px;
  align-items: center;
}
.coverage-key i {
  width: 8px;
  height: 8px;
  border-radius: 2px;
}
.coverage-parsed {
  background: var(--pink-deep);
}
.coverage-pending {
  background: var(--primary-bg);
}
.coverage-failed {
  background: var(--notice-error);
}
.coverage-invalid {
  background: var(--notice-warning);
}
.coverage-missing {
  background: var(--line);
}
.summary-chart-slot {
  position: relative;
  min-height: 152px;
  margin-block-start: 6px;
}
.summary-trend-detail {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 6px 10px;
  min-height: 36px;
}
.summary-period-readout {
  flex: 1 0 auto;
  max-width: 100%;
  text-align: end;
  font-variant-numeric: tabular-nums;
}
.summary-tag-row {
  display: grid;
  grid-template-columns: minmax(0, 24%) minmax(0, 1fr) minmax(0, 23%);
  column-gap: 8px;
  align-items: center;
  width: 100%;
  min-height: 38px;
  padding: 5px 0;
  border: 0;
  border-bottom: 1px solid var(--line);
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: start;
  overflow-wrap: anywhere;
}
.summary-row-count {
  font-size: 0.8rem;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.summary-tag-row .track {
  margin: 0;
}
.summary-tag-row .summary-row-count {
  text-align: end;
  white-space: normal;
}
.summary-tag-row:hover {
  background: var(--interactive-hover-bg);
}
@media (min-width: 641px) {
  .summary-overview-grid {
    flex: 1 1 auto;
  }
  .summary-overview-grid > .summary-card {
    display: flex;
    flex-direction: column;
  }
  .summary-chart-slot,
  .summary-tag-row {
    flex: 1 0 auto;
  }
  .summary-tag-row {
    max-block-size: 64px;
  }
}
.summary-dialog .outfit-parse-panel > header {
  padding-block: 16px;
}
@media (min-width: 900px) {
  .summary-dialog .outfit-parse-panel {
    width: min(960px, 100%);
  }
  .summary-dialog .outfit-parse-panel > header {
    padding-block: 24px;
  }
  .summary-dialog .outfit-editor {
    padding-block: 24px;
  }
  .summary-dialog .outfit-parse-panel > :is(header, main, footer) {
    padding-inline: 32px;
  }
}
.summary-toolbar,
.summary-row {
  display: flex;
  align-items: center;
  gap: 10px;
}
small,
footer,
.empty {
  color: var(--text);
}

.summary-toolbar {
  flex-wrap: wrap;
  justify-content: flex-end;
  min-width: 0;
}
.summary-toolbar .ranking-tabs {
  flex: 1 1 0;
  min-width: 0;
  width: auto;
  flex-wrap: nowrap;
}
.ranking-tabs .resonance-choice {
  flex: 1 1 0;
  min-width: 0;
  justify-content: center;
  white-space: nowrap;
}
.ranking-tabs .resonance-choice[aria-pressed='true'] {
  color: var(--menu-hover-text);
}
.part-menu :deep(.cleanup-account-select) {
  min-width: 108px;
}
.part-menu :deep(.cleanup-account-menu) {
  max-height: 260px;
}
.summary-row {
  width: 100%;
  column-gap: clamp(6px, 1.6vw, 16px);
  padding: 10px 0;
  border: 0;
  border-bottom: 1px solid var(--line);
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
}
button.summary-row:hover {
  background: var(--surface-strong);
}
.rank {
  min-width: 23px;
  color: var(--pink-deep);
  font-variant-numeric: tabular-nums;
}
.summary-item-thumb {
  display: grid;
  flex: none;
  place-items: center;
  width: clamp(32px, 6vw, 48px);
  height: clamp(32px, 6vw, 48px);
  overflow: hidden;
  border-radius: 6px;
  background: var(--frame-bg);
}
.summary-item-thumb img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.measure {
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
}
.track {
  display: block;
  background: var(--line);
  height: 4px;
  margin-top: 6px;
  border-radius: 4px;
}
.summary-row .track {
  max-inline-size: 700px;
}
.summary-row .summary-row-count {
  flex: 0 0 11%;
  min-inline-size: 0;
  text-align: end;
  white-space: normal;
}
.track i {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--pink-deep);
}
.more {
  margin-top: 14px;
}

.ranking-list-empty {
  display: grid;
  place-items: center;
}
.empty {
  margin: 12px 0;
  text-align: center;
}
@media (max-width: 899px) {
  .ranking-tabs .resonance-choice {
    padding-inline: 4px;
    font-size: clamp(11px, 3vw, 13px);
  }
  .ranking-tabs button,
  .part-menu :deep(.cleanup-account-select),
  .summary-tag-row {
    min-height: var(--mobile-control-size);
  }
}
@media (max-width: 640px) {
  .summary-dialog .outfit-parse-panel {
    height: calc(100dvh - 24px);
    max-height: calc(100dvh - 24px);
    border-radius: 20px;
  }
  .summary-overview-grid {
    grid-template-columns: minmax(0, 1fr);
  }
  .summary-toolbar .ranking-tabs {
    flex-basis: 100%;
  }
}
</style>
