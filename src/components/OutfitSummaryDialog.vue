<script setup lang="ts">
import {
  computed,
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
  normalizeLookbookCode,
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
import DialogChoiceMenu from './DialogChoiceMenu.vue'
import CatalogImage from './CatalogImage.vue'
import { outfitMessages } from '../i18n/messages/outfit'
import type { ParseItemView } from '../utils/outfit/parseItemView'

import ItemDetail from './OutfitParseDialog.vue'

const props = defineProps<{ outfits: OutfitItem[]; language: 'zh' | 'en' }>()
const emit = defineEmits<{ close: []; tag: [tag: string] }>()
const t = (zh: string, en: string) => (props.language === 'zh' ? zh : en)
const dialog = ref<HTMLDialogElement>()
const selectedItem = shallowRef<Pick<ParseItemView, 'id' | 'name' | 'clothType'> | null>(null)
let detailTrigger: HTMLButtonElement | null = null
let summaryScroll = 0
const content = ref<HTMLElement>()

function selectRow(row: { id: string | number; name: string }, event: MouseEvent) {
  if (typeof row.id === 'string') {
    emit('tag', row.name)
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
const tab = ref<'tags' | 'clothes' | 'makeup'>('tags')
const tabs = computed(() => ({
  tags: t('常用标签', 'Tags'),
  clothes: t('常穿部件', 'Clothing'),
  makeup: t('常用妆容', 'Makeup')
}))
const part = ref<number | null>(null)
const expanded = ref(false)
watch(tab, () => {
  part.value = null
  expanded.value = false
})
watch(part, () => {
  expanded.value = false
})
watch(
  [tab, part, expanded],
  () => {
    if (!expanded.value && content.value) content.value.scrollTop = 0
  },
  { flush: 'post' }
)
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
const library = computed(() => {
  const tags = new Map<string, number>(),
    codes = new Map<string, number>()
  let missing = 0,
    invalid = 0,
    untagged = 0
  for (const outfit of props.outfits) {
    const tag = outfit.tags[0]
    if (tag) tags.set(tag, (tags.get(tag) ?? 0) + 1)
    else untagged++
    const code = normalizeLookbookCode(outfit.code)
    if (code) codes.set(code, (codes.get(code) ?? 0) + 1)
    else if (outfit.code.trim()) invalid++
    else missing++
  }
  return { tags, codes, missing, invalid, untagged }
})
watch(
  () => Array.from(library.value.codes.keys()),
  async (codes) => {
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
const pending = computed(() =>
  Array.from(library.value.codes.keys()).filter((code) => !results.has(code))
)
const pendingCount = computed(() =>
  pending.value.reduce((sum, code) => sum + library.value.codes.get(code)!, 0)
)
const parsed = computed(
  () => props.outfits.length - library.value.missing - library.value.invalid - pendingCount.value
)
async function parseRemaining() {
  if (reading.value || running.value) return
  const { signal } = session
  running.value = true
  await runWithConcurrency(
    pending.value,
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
  const counts = new Map<number, number>()
  for (const [code, result] of results) {
    const weight = library.value.codes.get(code) ?? 0
    for (const id of new Set(result.wearingClothes.map((item) => item.itemId))) {
      counts.set(id, (counts.get(id) ?? 0) + weight)
    }
  }
  return Array.from(counts, ([id, count]) => {
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
const rows = computed(() => {
  const list =
    tab.value === 'tags'
      ? Array.from(library.value.tags, ([name, count]) => ({
          id: name,
          name,
          count,
          label: '',
          icon: ''
        }))
      : categoryItems.value.filter((x) =>
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
              <div class="summary-heading">
                <div>
                  <h2 id="summary-title">{{ t('搭配总结', 'Outfit summary') }}</h2>
                  <small class="coverage" aria-live="polite">
                    {{ t('已保存 ' + outfits.length + ' 套，', outfits.length + ' saved, ')
                    }}{{
                      reading
                        ? t('正在读取解析记录…', 'reading saved results…')
                        : t('已解析 ' + parsed + ' 套', parsed + ' parsed')
                    }}
                    <span v-if="library.missing"
                      >｜
                      {{
                        t(library.missing + ' 套待补码', library.missing + ' without a code')
                      }}</span
                    >
                    <span v-if="library.invalid"
                      >｜
                      {{
                        t(
                          library.invalid + ' 套码格式无效',
                          library.invalid + ' with invalid codes'
                        )
                      }}</span
                    >
                    <span v-if="failed.size"
                      >｜
                      {{ t(failed.size + ' 个码解析失败', failed.size + ' codes failed') }}</span
                    >
                  </small>
                </div>
                <button
                  v-if="pendingCount && !reading"
                  class="confirm-dialog-button ghost dialog-action-control parse-action"
                  :disabled="running"
                  @click="parseRemaining"
                >
                  {{
                    running
                      ? t(
                          '解析中，剩余 ' + pendingCount + ' 套',
                          'Parsing… ' + pendingCount + ' remaining'
                        )
                      : failed.size
                        ? t('重试解析', 'Retry parsing')
                        : t('解析 ' + pendingCount + ' 套', 'Parse ' + pendingCount + ' outfits')
                  }}
                </button>
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
            <main class="outfit-parse-content summary-content">
              <div
                class="summary-toolbar"
                :class="{ 'has-part-menu': tab !== 'tags' && types.length }"
              >
                <nav
                  class="resonance-choice-row ranking-tabs"
                  :aria-label="t('排行类别', 'Ranking category')"
                >
                  <button
                    v-for="(label, key) in tabs"
                    :key="key"
                    class="resonance-choice"
                    type="button"
                    :aria-pressed="tab === key"
                    @click="tab = key"
                  >
                    {{ label }}
                  </button>
                </nav>
                <div class="summary-part-slot">
                  <Transition name="summary-part">
                    <DialogChoiceMenu
                      v-if="tab !== 'tags' && types.length"
                      :key="tab"
                      v-model="part"
                      class="part-menu"
                      :label="t('筛选部位', 'Filter by type')"
                      :options="[
                        { value: null, label: t('全部部位', 'All types') },
                        ...types.map(([value, label]) => ({ value, label }))
                      ]"
                    />
                  </Transition>
                </div>
              </div>
              <section class="ranking-panel" :aria-label="tabs[tab]">
                <small v-if="tab === 'tags' && rows.length">{{
                  t('点标签查看搭配', 'Select a tag to view outfits')
                }}</small>
                <div
                  ref="content"
                  class="ranking-list"
                  :class="{ 'ranking-list-empty': !rows.length }"
                >
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
                      <span class="track">
                        <i :style="{ width: (100 * row.count) / rows[0].count + '%' }" />
                      </span>
                    </span>
                    <span>{{ row.count }} {{ t('套', 'outfits') }}</span>
                    <ChevronRight :size="14" aria-hidden="true" />
                  </button>
                  <p v-if="!rows.length" class="empty">
                    {{
                      !outfits.length
                        ? t(
                            '添加第一套搭配后，这里就会出现你的总结。',
                            'Save an outfit to start your summary.'
                          )
                        : tab === 'tags'
                          ? t('还没有使用标签的搭配。', 'No outfits have tags yet.')
                          : !parsed
                            ? t(
                                '解析搭配码后，这里会显示使用排行。',
                                'Parse outfit codes to see your ranking.'
                              )
                            : t('当前范围内没有对应部件。', 'No matching items in these outfits.')
                    }}
                  </p>
                  <button
                    v-if="rows.length > 5"
                    class="more confirm-dialog-button ghost"
                    @click="expanded = !expanded"
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
            <footer class="outfit-parse-footer">
              {{
                tab === 'tags'
                  ? t(
                      '另有 ' + library.untagged + ' 套未分类。',
                      library.untagged + ' uncategorized outfits.'
                    )
                  : t(
                      '按已解析的 ' + parsed + ' 套统计，同一单品每套只计一次。',
                      'Based on ' + parsed + ' parsed outfits. Each item counts once per outfit.'
                    )
              }}
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
  gap: 16px;
  overflow-y: auto;
}
.ranking-panel {
  display: flex;
  flex: 1 0 auto;
  flex-direction: column;
  gap: 12px;
  height: 0;
  min-height: 150px;
  --ranking-inset: clamp(10px, 2vw, 18px);
  padding: var(--ranking-inset) 0 0 var(--ranking-inset);
  background: var(--surface-soft);
  border-radius: 14px;
  overflow: hidden;
}
.ranking-list {
  padding-right: var(--ranking-inset);
  flex: 1 1 0;
  min-height: min(56px, 35%);
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
}
.summary-heading {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px 18px;
  min-width: 0;
}
.summary-heading .parse-action {
  flex: 0 0 auto;
}
.summary-dialog .outfit-parse-panel > header {
  padding-block: 16px;
}
@media (min-width: 900px) {
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
  color: var(--muted);
}

.summary-toolbar {
  --summary-part-width: 112px;
  flex-wrap: nowrap;
  gap: 0;
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
  transition:
    padding-inline 220ms ease,
    font-size 220ms ease,
    background-color var(--motion-fast) ease,
    color var(--motion-fast) ease,
    border-color var(--motion-fast) ease;
}
.summary-part-slot {
  position: relative;
  flex: none;
  width: 0;
  margin-inline-start: 0;
  transition:
    width 220ms cubic-bezier(0.22, 1, 0.36, 1),
    margin-inline-start 220ms cubic-bezier(0.22, 1, 0.36, 1);
}
.has-part-menu .summary-part-slot {
  width: var(--summary-part-width);
  margin-inline-start: 8px;
}
.summary-part-enter-active {
  transition:
    opacity 180ms ease 40ms,
    transform 180ms ease 40ms;
}
.summary-part-leave-active {
  position: absolute;
  top: 0;
  inset-inline-start: 0;
  transition:
    opacity 120ms ease,
    transform 120ms ease;
  pointer-events: none;
}
.summary-part-enter-from,
.summary-part-leave-to {
  opacity: 0;
  transform: translateX(4px);
}
@media (prefers-reduced-motion: reduce) {
  .summary-part-slot,
  .ranking-tabs .resonance-choice,
  .summary-part-enter-active,
  .summary-part-leave-active {
    transition: none;
  }
}
.coverage span {
  display: inline-block;
}
.part-menu {
  width: var(--summary-part-width);
  min-width: 0;
}
.part-menu :deep(.cleanup-account-select) {
  width: 100%;
}
.part-menu :deep(.cleanup-account-menu) {
  max-height: 400px;
}
.summary-row {
  width: 100%;
  column-gap: clamp(14px, 2vw, 22px);
  padding: 12px clamp(8px, 1.5vw, 16px);
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
  width: 48px;
  height: 48px;
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
  scrollbar-gutter: auto;
}
.empty {
  margin: 0;
  text-align: center;
}
@media (max-width: 899px) {
  .summary-toolbar {
    --summary-part-width: clamp(88px, 24vw, 112px);
  }
  .ranking-tabs .resonance-choice {
    padding-inline: 4px;
    font-size: clamp(10px, 3vw, 13px);
  }
  .has-part-menu .ranking-tabs .resonance-choice {
    padding-inline: 1px;
    font-size: clamp(10px, 2.8vw, 12px);
  }
  .part-menu :deep(.cleanup-account-select) {
    padding-inline: 8px;
    gap: 4px;
    font-size: clamp(10px, 2.8vw, 12px);
  }
  .ranking-tabs button {
    flex: 1;
    min-height: var(--mobile-control-size);
  }
  .part-menu :deep(.cleanup-account-select) {
    min-height: var(--mobile-control-size);
  }
}
@media (max-width: 640px) {
  .summary-dialog .outfit-parse-panel {
    height: calc(100dvh - 24px);
    max-height: calc(100dvh - 24px);
    border-radius: 20px;
  }
}
@media (min-width: 641px) and (max-width: 899px) {
  .ranking-tabs button {
    justify-content: center;
  }
}
</style>
