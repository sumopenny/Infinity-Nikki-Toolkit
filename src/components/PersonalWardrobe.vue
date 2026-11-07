<script setup lang="ts">
import { vCardReveal } from '../utils/cardReveal'
import { takeDownloadFiles } from '../utils/backup/downloadFallback'
import { downloadBackupBlob } from '../utils/backup/zipBackup'
import { reportError as captureDiagnosticError } from '../utils/errorReporting/errorReporter'
import DesktopMenuTransition from './DesktopMenuTransition.vue'
import CatalogImage from './LoadingCatalogImage.vue'
import ContentLoadingSurface from './ContentLoadingSurface.vue'
import { groupWardrobeEntries, wardrobeFamilyKey } from '../utils/wardrobe/wardrobeFamilies'
import { wardrobeCatalogForRegion, wardrobeRegionScope } from '../utils/wardrobe/wardrobeRegion'
import { useWardrobeFilters, type FilterKey } from '../composables/useWardrobeFilters'
import {
  wardrobeVariantLabels,
  wardrobeOwnershipNotice
} from '../utils/wardrobe/wardrobePresentation'
import { hasWardrobeSnapshot, getOwnershipSummary } from '../utils/wardrobe/wardrobeOwnership'
import { backupBaseName } from '../utils/backup/backupName'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, toRef, watch } from 'vue'
import { ArrowLeftRight, ChevronDown, RotateCcw, Shirt, Info, X } from 'lucide-vue-next'
import ResonanceDataActions from './ResonanceDataActions.vue'
import ArchiveCloudActions from './ArchiveCloudActions.vue'
import WardrobeEvolutionSwitch from './WardrobeEvolutionSwitch.vue'
import WardrobeFormPopover from './WardrobeFormPopover.vue'
import CollectionFilterBar from './CollectionFilterBar.vue'
import AdaptiveFilterPanel from './AdaptiveFilterPanel.vue'
import DataImportWindow from './DataImportWindow.vue'
import MobileEmptyScreenshot from './MobileEmptyScreenshot.vue'
import ConfirmDialog from './ConfirmDialog.vue'
import WardrobeItemDialog from './WardrobeItemDialog.vue'
import WardrobeOutfitDialog from './WardrobeOutfitDialog.vue'
import { messages } from '../i18n'
import { useSidebarMenu } from '../composables/useSidebarMenu'
import { useCompactLayout } from '../composables/useCompactLayout'
import { useAfterArchiveMotion } from '../composables/useAfterArchiveMotion'
import { useModuleOperation } from '../composables/useOperationCoordinator'
import type { Language } from '../i18n/types'
import {
  loadWardrobeCatalog,
  type WardrobeCatalog,
  type WardrobeEntry,
  type WardrobeKind
} from '../utils/wardrobe/wardrobeCatalog'
import {
  hasIncompleteWardrobeOwnership,
  matchesWardrobeGameVersion,
  matchesWardrobeSource
} from '../utils/wardrobe/wardrobeFilters'
import {
  createWardrobeBackup,
  emptyWardrobe,
  loadWardrobe,
  updateWardrobe,
  type WardrobeSnapshot
} from '../utils/wardrobe/wardrobeStorage'
const props = withDefaults(
  defineProps<{
    language?: Language
    disabled?: boolean
    searchQuery?: string
    sidebarTarget?: string
  }>(),
  {
    language: 'zh',
    searchQuery: ''
  }
)
const emit = defineEmits<{
  'update-search': [value: string]
  notice: [
    payload: {
      message: string
      tone: 'success' | 'warning' | 'error'
      source?: string
      downloadFiles?: File[]
    }
  ]
}>()
const compact = useCompactLayout()
// 顶栏搜索是唯一输入来源；桌面将同一组筛选节点移入现有侧栏。
const query = computed(() => props.searchQuery)
const text = (zh: string, en: string) => (props.language === 'zh' ? zh : en)

// Bump the version when the meaning of the ownership explanation changes.
const ownershipNoticeKey = 'nikki-wardrobe-ownership-notice-v1'
const ownershipNoticeVisible = ref(
  (() => {
    try {
      return localStorage.getItem(ownershipNoticeKey) !== 'dismissed'
    } catch {
      return true
    }
  })()
)
const ownershipNotice = ref<HTMLElement | null>(null)
const ownershipNoticeText = computed(() => wardrobeOwnershipNotice[props.language])
function dismissOwnershipNotice() {
  ownershipNoticeVisible.value = false
  try {
    localStorage.setItem(ownershipNoticeKey, 'dismissed')
  } catch {
    /* Keep this session usable. */
  }
}
async function showOwnershipNotice() {
  ownershipNoticeVisible.value = true
  try {
    localStorage.removeItem(ownershipNoticeKey)
  } catch {
    /* Keep this session usable. */
  }
  await nextTick()
  ownershipNotice.value?.focus({ preventScroll: true })
}

const track = useModuleOperation('wardrobe')
const fullCatalog = shallowRef<WardrobeCatalog | null>(null)
const snapshot = ref<WardrobeSnapshot>(emptyWardrobe())
const catalog = computed(() =>
  fullCatalog.value
    ? wardrobeCatalogForRegion(fullCatalog.value, wardrobeRegionScope(snapshot.value))
    : null
)
const loaded = ref(false),
  busy = ref(false)
const loadFailed = ref(false)
let loadVersion = 0
let cancelLoad: (() => void) | undefined
onBeforeUnmount(() => {
  loadVersion++
  cancelLoad?.()
})
const blocked = computed(() => props.disabled || busy.value || !loaded.value)
const tab = ref<WardrobeKind>('outfit')
const {
  ownership,
  rarity,
  variant,
  version,
  style,
  source,
  tag,
  category,
  sort,
  filterValues,
  filterOptions,
  mobileFilterEntries,
  mobileFilterActive,
  select,
  reset
} = useWardrobeFilters(tab, toRef(props, 'language'))
const evolutionPreferenceKey = 'nikki-wardrobe-show-evolutions'
const showEvolutions = ref(
  (() => {
    try {
      return localStorage.getItem(evolutionPreferenceKey) !== 'false'
    } catch {
      return true
    }
  })()
)
const selectedForms = ref<Record<string, string>>({})
const formPreviewRevision = ref(0)
watch(showEvolutions, (value) => {
  formPreviewRevision.value++
  limit.value = 48
  try {
    localStorage.setItem(evolutionPreferenceKey, String(value))
  } catch {
    /* Session only. */
  }
})
const merged = computed(() => !showEvolutions.value)
const matchingFamilies = computed(() => groupWardrobeEntries(filtered.value))
// Filters determine visible families, not the available forms inside a preview.
const catalogFamilies = computed(() => groupWardrobeEntries(catalog.value?.entries ?? []))
const displayEntries = computed(() =>
  !merged.value
    ? filtered.value
    : [...matchingFamilies.value].map(
        ([key, entries]) =>
          entries.find((entry) => entry.id === selectedForms.value[key]) ?? entries[0]!
      )
)
const hasMultipleForms = (entry: WardrobeEntry) =>
  (catalogFamilies.value.get(wardrobeFamilyKey(entry))?.length ?? 0) > 1
const limit = ref(48)
const loadMoreTarget = ref<HTMLElement | null>(null)
let loadMoreObserver: IntersectionObserver | null = null
watch(
  [loadMoreTarget, limit],
  ([target]) => {
    loadMoreObserver?.disconnect()
    loadMoreObserver = null
    if (!target) return
    if (!('IntersectionObserver' in window)) {
      limit.value = displayEntries.value.length
      return
    }
    // 每次追加后重新观察，首屏不足一屏时也能继续补足。
    loadMoreObserver = new IntersectionObserver(
      (entries, observer) => {
        if (!entries.some((entry) => entry.isIntersecting)) return
        observer.disconnect()
        limit.value = Math.min(limit.value + 48, displayEntries.value.length)
      },
      { rootMargin: '600px 0px' }
    )
    loadMoreObserver.observe(target)
  },
  { flush: 'post' }
)
onBeforeUnmount(() => loadMoreObserver?.disconnect())

const variants = computed(() => wardrobeVariantLabels[props.language])
// 沿用共鸣侧栏的自定义下拉菜单与选中样式，避免浏览器原生弹层风格不一致。
const openFilter = ref('')
const { menuStyle: filterMenuStyle, positionMenu } = useSidebarMenu(
  () => {
    openFilter.value = ''
  },
  () => document.getElementById('wardrobe-menu-' + openFilter.value)
)
// 桌面菜单移出滚动侧栏，避免 overflow 裁切阴影；不改变侧栏自身滚动。
function toggleFilter(key: string, event: MouseEvent) {
  if (openFilter.value === key) {
    openFilter.value = ''
    return
  }
  const trigger = event.currentTarget as HTMLElement
  positionMenu(trigger)
  if (compact.value) {
    const triggerBox = trigger.getBoundingClientRect()
    const viewport = window.visualViewport
    const viewportTop = viewport?.offsetTop ?? 0
    const viewportBottom = viewportTop + (viewport?.height ?? window.innerHeight)
    const gap = 6
    const inset = 8
    const below = Math.max(0, viewportBottom - inset - triggerBox.bottom - gap)
    const above = Math.max(0, triggerBox.top - viewportTop - inset - gap)
    const upward = below < 180 && above > below
    filterMenuStyle.value = {
      ...filterMenuStyle.value,
      top: upward ? 'auto' : `${triggerBox.bottom + gap}px`,
      bottom: upward ? `${window.innerHeight - triggerBox.top + gap}px` : 'auto',
      maxHeight: `${Math.min(320, upward ? above : below)}px`,
      zIndex: 110
    }
  }
  if (!compact.value && (key === 'version' || key === 'source')) {
    const box = trigger.getBoundingClientRect()
    const width = Math.min(Math.max(box.width, 240), window.innerWidth - 24)
    filterMenuStyle.value = {
      ...filterMenuStyle.value,
      width: width + 'px',
      left: Math.max(12, Math.min(box.left, window.innerWidth - width - 12)) + 'px'
    }
  }
  openFilter.value = key
}
function leaveFilter(event: FocusEvent) {
  const next = event.relatedTarget as Node | null
  const trigger = document.getElementById('wardrobe-filter-' + openFilter.value)
  const menu = document.getElementById('wardrobe-menu-' + openFilter.value)
  if (!next || (!trigger?.contains(next) && !menu?.contains(next))) openFilter.value = ''
}
const mobileFiltersOpen = ref(false)
function closeFilter(event: Event) {
  if (
    !(event.target instanceof Element) ||
    !event.target.closest('.wardrobe-filter-field, .wardrobe-filter-menu')
  )
    openFilter.value = ''
}
function dismissFilter(key: FilterKey) {
  openFilter.value = ''
  document.getElementById('wardrobe-filter-' + key)?.focus()
}
function selectFilter(key: FilterKey, value: string) {
  select(key, value)
  dismissFilter(key)
}
watch([tab, compact], () => {
  openFilter.value = ''
  mobileFiltersOpen.value = false
})
onMounted(() => {
  document.addEventListener('click', closeFilter)
})
onBeforeUnmount(() => {
  document.removeEventListener('click', closeFilter)
})
const name = (entry: WardrobeEntry) => entry.name[props.language]
const ownedCount = (entry: WardrobeEntry) => getOwnershipSummary(entry, snapshot.value).owned
const complete = (entry: WardrobeEntry) => getOwnershipSummary(entry, snapshot.value).complete
const unknown = (entry: WardrobeEntry) => getOwnershipSummary(entry, snapshot.value).unknown
const showOwnershipNote = computed(
  () => tab.value === 'item' && hasIncompleteWardrobeOwnership(source.value)
)
const status = (entry: WardrobeEntry) =>
  complete(entry)
    ? text(entry.kind === 'outfit' ? '已集齐' : '已拥有', 'Owned')
    : ownedCount(entry)
      ? text('收集中', 'Partial')
      : unknown(entry)
        ? text('未知', 'Unknown')
        : text('未拥有', 'Not owned')
const filtered = computed(() => {
  const search = query.value.trim().toLocaleLowerCase()
  const entries = (catalog.value?.entries ?? []).filter(
    (entry) =>
      entry.kind === tab.value &&
      (!search ||
        `${entry.name.zh} ${entry.name.en} ${entry.id}`.toLocaleLowerCase().includes(search)) &&
      (rarity.value === 'all' || entry.quality === Number(rarity.value)) &&
      (variant.value === 'all' || entry.variant === Number(variant.value)) &&
      matchesWardrobeGameVersion(entry, version.value) &&
      (style.value === 'all' || entry.style === style.value) &&
      matchesWardrobeSource(entry, source.value) &&
      (tag.value === 'all' || entry.labels.includes(Number(tag.value))) &&
      (tab.value !== 'item' ||
        category.value === 'all' ||
        entry.category === Number(category.value)) &&
      (ownership.value === 'all' ||
        (ownership.value === 'owned'
          ? ownedCount(entry) > 0
          : ownership.value === 'partial'
            ? ownedCount(entry) > 0 && !complete(entry)
            : ownership.value === 'unknown'
              ? unknown(entry)
              : ownedCount(entry) === 0 && !unknown(entry)))
  )
  if (sort.value === 'name') entries.sort((a, b) => name(a).localeCompare(name(b), props.language))
  if (sort.value === 'progress')
    entries.sort(
      (a, b) => ownedCount(b) / (b.parts.length || 1) - ownedCount(a) / (a.parts.length || 1)
    )
  return entries
})
const stats = computed(() => ({
  items: (catalog.value?.entries ?? []).filter((e) => e.kind === 'item' && complete(e)).length,
  outfits: (catalog.value?.entries ?? []).filter((e) => e.kind === 'outfit' && complete(e)).length
}))
watch([tab, query, ownership, rarity, variant, version, style, source, tag, category, sort], () => {
  limit.value = 48
  formPreviewRevision.value++
})
function resetFilters() {
  emit('update-search', '')
  reset()
  openFilter.value = ''
}
function reportError(cause: unknown) {
  captureDiagnosticError(cause, { module: 'wardrobe', action: 'storage' })
  const message =
    cause instanceof Error && cause.message === 'WARDROBE_CHANGED'
      ? text(
          '衣橱已在其他页面变更，请关闭预览后重新导入。',
          'Wardrobe changed in another tab. Close this preview and import again.'
        )
      : text(
          '操作失败，原有数据未被替换。请检查文件、登录信息或网络后重试。',
          'Operation failed. Existing data was not replaced. Check the file, credentials or network and retry.'
        )
  emit('notice', { message, tone: 'error' })
}
/** 刷新结果交给调用方汇总；过期请求也不视为本次刷新成功。 */
async function reload(): Promise<boolean> {
  const version = ++loadVersion
  cancelLoad?.()
  loaded.value = false
  loadFailed.value = false
  let timeout: ReturnType<typeof setTimeout> | undefined
  // 限制等待时间；重试或离开页面后，旧请求不得覆盖当前状态。
  const deadline = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => reject(new Error('WARDROBE_LOAD_TIMEOUT')), 15000)
    cancelLoad = () => {
      clearTimeout(timeout)
      reject(new Error('WARDROBE_LOAD_CANCELLED'))
    }
  })
  try {
    const [data, saved] = await Promise.race([
      Promise.all([loadWardrobeCatalog(), loadWardrobe()]),
      deadline
    ])
    if (version !== loadVersion) return false
    fullCatalog.value = data
    snapshot.value = saved
    loaded.value = true
    return true
  } catch (cause) {
    if (version !== loadVersion) return false
    captureDiagnosticError(cause, { module: 'wardrobe', action: 'load' })
    loadFailed.value = true
    return false
  } finally {
    clearTimeout(timeout)
    if (version === loadVersion) cancelLoad = undefined
  }
}
useAfterArchiveMotion(reload)
defineExpose({ reload })

const dialog = ref<'import' | 'detail' | null>(null)
const dialogOpen = computed(() => dialog.value === 'detail')
const importOpen = computed(() => dialog.value === 'import')
const anyDialogOpen = computed(() => dialog.value !== null)
const detail = shallowRef<WardrobeEntry | null>(null)
function closeDialog() {
  if (!busy.value) {
    dialog.value = null
  }
}
function openImport() {
  dialog.value = 'import'
}
const itemPreview = shallowRef<WardrobeEntry | null>(null)
const itemOutfits = computed(() => {
  const item = itemPreview.value
  if (!item) return []
  return (catalog.value?.entries ?? []).filter(
    (entry) => entry.kind === 'outfit' && entry.parts.includes(item.id)
  )
})
function openDetail(entry: WardrobeEntry) {
  selectedForms.value[wardrobeFamilyKey(entry)] = entry.id
  if (entry.kind === 'item') {
    itemPreview.value = entry
    return
  }
  detail.value = entry
  dialog.value = 'detail'
}
async function exportBackup() {
  if (blocked.value) return
  busy.value = true
  try {
    await track(async () => {
      const latest = await loadWardrobe()
      downloadBackupBlob(
        backupBaseName('个人衣橱') + '.json',
        new Blob([createWardrobeBackup(latest)], { type: 'application/json' }),
        'wardrobe'
      )
      snapshot.value = latest
    })
    emit('notice', {
      message: text('衣橱数据已导出。', 'Wardrobe data exported.'),
      source: 'wardrobe-export',
      downloadFiles: takeDownloadFiles('wardrobe'),
      tone: 'success'
    })
  } catch (cause) {
    takeDownloadFiles('wardrobe')
    reportError(cause)
  } finally {
    busy.value = false
  }
}
const importText = computed(() => ({
  ...messages[props.language].resonance,
  clearRecords: text('清空本地记录', 'Clear local records'),
  clearConfirm: text('清空本地记录', 'Clear local records'),
  clearTitle: text('清空本地衣橱记录', 'Clear local wardrobe records'),
  clearMessage: text(
    '将清空全部衣橱拥有记录，服装图鉴和共鸣记录不受影响。此操作无法撤销，请先导出数据备份。',
    'Clear all wardrobe ownership. The catalog and resonance records are unaffected. This cannot be undone; export a backup first.'
  )
}))
const showClearConfirm = ref(false),
  clearBase = ref('')
const hasRecords = computed(() => hasWardrobeSnapshot(snapshot.value))
watch([loaded, hasRecords], ([ready, hasData]) => {
  if (!ready || !hasData) mobileFiltersOpen.value = false
})
async function requestClear() {
  if (blocked.value || !hasRecords.value) return
  busy.value = true
  try {
    clearBase.value = JSON.stringify(await track(loadWardrobe))
    showClearConfirm.value = true
  } catch (cause) {
    reportError(cause)
  } finally {
    busy.value = false
  }
}
async function clearRecords() {
  if (blocked.value) return
  busy.value = true
  try {
    snapshot.value = await track(() => updateWardrobe(() => emptyWardrobe(), clearBase.value))
    showClearConfirm.value = false
    emit('notice', {
      message: text('已清空衣橱记录。', 'Wardrobe records cleared.'),
      tone: 'success'
    })
  } catch (cause) {
    showClearConfirm.value = false
    reportError(cause)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <section class="wardrobe-page" aria-labelledby="wardrobe-title">
    <header class="gallery-header wardrobe-header" :class="{ 'is-empty': !hasRecords }">
      <div class="wardrobe-heading">
        <div class="wardrobe-title-row">
          <h2 id="wardrobe-title">{{ text('个人衣橱', 'Personal wardrobe') }}</h2>
          <div v-if="loaded && hasRecords" class="wardrobe-summary">
            <span>
              {{ text('已拥有', 'Owned') }}
              <strong>{{ stats.items.toLocaleString(language) }}</strong>
              {{ text('件', 'pieces') }}
            </span>
            <span>
              {{ text('已集齐', 'Complete') }}
              <strong>{{ stats.outfits.toLocaleString(language) }}</strong>
              {{ text('套', 'outfits') }}
            </span>
          </div>
        </div>
      </div>
      <ResonanceDataActions
        :key="compact && loaded ? 'toolbar' : 'header'"
        :t="importText"
        :label="text('衣橱操作', 'Wardrobe actions')"
        :cloud-label="text('云端', 'Cloud')"
        :mobile-target="compact && loaded ? '#wardrobe-filter-actions' : undefined"
        :add-disabled="blocked || showClearConfirm"
        :clear-disabled="blocked || !hasRecords || anyDialogOpen"
        :export-disabled="blocked || !hasRecords"
        @add="openImport"
        @clear="requestClear"
        @export="exportBackup"
      >
        <template #before-cloud>
          <label v-if="!compact && loaded && hasRecords" class="wardrobe-evolution-switch">
            <span>{{ text('显示进化形态', 'Show evolution forms') }}</span>
            <input v-model="showEvolutions" type="checkbox" role="switch" />
          </label>
          <button v-if="loaded && hasRecords" type="button" @click="showOwnershipNotice"
            ><Info :size="16" aria-hidden="true" />{{ ownershipNoticeText.title }}</button
          >
        </template>
        <template #cloud
          ><ArchiveCloudActions
            :language="language"
            :disabled="blocked || showClearConfirm || dialog !== null"
        /></template>
      </ResonanceDataActions>
    </header>
    <CollectionFilterBar
      v-if="compact"
      class="wardrobe-mobile-filter-bar"
      tag-picker
      actions-id="wardrobe-filter-actions"
      :entries="mobileFilterEntries"
      :active="mobileFilterActive"
      :count="hasRecords ? filtered.length : 0"
      :language="language"
      :disabled="blocked || !hasRecords"
      :all-label="text('全部筛选', 'All filters')"
      :select-label="text('筛选衣橱：', 'Filter wardrobe: ')"
      @open="mobileFiltersOpen = true"
      @clear="resetFilters"
    />
    <WardrobeEvolutionSwitch
      v-if="compact"
      v-model="showEvolutions"
      :language="language"
      :disabled="blocked"
    />
    <Teleport v-if="compact" to="#wardrobe-mobile-category-target" defer>
      <button
        type="button"
        class="wardrobe-mobile-category-switch"
        :disabled="blocked"
        :aria-label="
          tab === 'outfit'
            ? text('切换到部件', 'Switch to pieces')
            : text('切换到套装', 'Switch to outfits')
        "
        @click="tab = tab === 'outfit' ? 'item' : 'outfit'"
        ><ArrowLeftRight :size="14" aria-hidden="true" />{{
          tab === 'outfit' ? text('部件', 'Pieces') : text('套装', 'Outfits')
        }}</button
      >
      <p class="wardrobe-mobile-summary">
        {{ tab === 'outfit' ? text('已集齐', 'Complete') : text('已拥有', 'Owned') }}
        <strong>{{
          loaded ? (tab === 'outfit' ? stats.outfits : stats.items).toLocaleString(language) : '—'
        }}</strong>
        {{ tab === 'outfit' ? text('套', 'outfits') : text('件', 'pieces') }}
      </p>
    </Teleport>
    <AdaptiveFilterPanel
      v-if="compact && loaded && hasRecords"
      :compact="compact"
      top-aligned
      :open="mobileFiltersOpen"
      :title="text('衣橱筛选', 'Wardrobe filters')"
      :close-label="text('关闭筛选', 'Close filters')"
      :apply-label="text('完成', 'Done')"
      @close="mobileFiltersOpen = false"
    >
      <div id="wardrobe-mobile-filter-target"></div>
    </AdaptiveFilterPanel>
    <ContentLoadingSurface :loading="!loaded && !loadFailed" :label="text('正在加载衣橱…', 'Loading wardrobe…')">
      <template #skeleton>
        <div class="wardrobe-grid" :class="{ 'is-pieces': tab === 'item' }">
          <article v-for="index in 6" :key="index" class="wardrobe-card" data-skeleton-card>
            <div class="wardrobe-cover" data-skeleton-block></div>
            <div class="wardrobe-card-body">
              <h3 class="skeleton-title" data-skeleton-block>&nbsp;</h3>
              <div class="wardrobe-card-status" data-skeleton-block>&nbsp;</div>
              <div v-if="tab === 'outfit'" class="skeleton-progress" data-skeleton-block></div>
            </div>
          </article>
        </div>
      </template>
    <div v-if="!loaded" class="wardrobe-empty" role="status">
      <p>{{
        loadFailed
          ? text(
              '衣橱加载失败或超时，请重试；若仍无法加载，请刷新页面。',
              'Wardrobe loading failed or timed out. Retry, or refresh the page if it still fails.'
            )
          : text('正在加载衣橱…', 'Loading wardrobe…')
      }}</p>
      <button v-if="loadFailed" class="primary-button" type="button" @click="reload">
        {{ text('重新加载', 'Retry') }}
      </button>
    </div>
    <div v-if="loaded && !hasRecords" class="wardrobe-initial">
      <h3>{{ text('还没有衣橱数据', 'No wardrobe data yet') }}</h3>
      <p>{{
        text(
          '点击右上角“导入数据”，查看你的套装与部件的收集情况。',
          'Use Import data in the upper right to import your notebook and view your outfit and item collection.'
        )
      }}</p>
      <MobileEmptyScreenshot page="wardrobe" :language="language" />
    </div>
    <template v-if="loaded && hasRecords">
      <Teleport
        :to="compact ? '#wardrobe-mobile-filter-target' : sidebarTarget || 'body'"
        :disabled="!compact && !sidebarTarget"
        defer
      >
        <div :class="{ 'wardrobe-sidebar-controls': !compact && sidebarTarget }">
          <div v-if="!compact" class="wardrobe-toolbar">
            <nav class="sidebar-mode-switch" :aria-label="text('衣橱分类', 'Wardrobe category')">
              <button
                type="button"
                :aria-pressed="tab === 'outfit'"
                :class="{ active: tab === 'outfit' }"
                @click="tab = 'outfit'"
                >{{ text('套装', 'Outfits') }}</button
              >
              <button
                type="button"
                :aria-pressed="tab === 'item'"
                :class="{ active: tab === 'item' }"
                @click="tab = 'item'"
                >{{ text('部件', 'Pieces') }}</button
              >
            </nav>
          </div>
          <p v-if="!compact" class="wardrobe-filter-results" role="status">
            <span>{{ text('筛选结果', 'Results') }}</span>
            <span>
              <strong>{{ filtered.length.toLocaleString(language) }}</strong>
              {{ tab === 'outfit' ? text('套', 'outfits') : text('件', 'pieces') }}
            </span>
          </p>
          <div class="wardrobe-filters">
            <div v-for="filter in filterOptions" :key="filter.key" class="wardrobe-filter-field">
              <span>{{ filter.label }}</span>
              <div
                class="action-sort-select-wrap wardrobe-filter-select"
                @keydown.esc.stop.prevent="
                  openFilter = ''
                  ;($event.currentTarget as HTMLElement).querySelector('button')?.focus()
                "
                @focusout="leaveFilter"
              >
                <button
                  :id="'wardrobe-filter-' + filter.key"
                  type="button"
                  class="cleanup-account-select action-sort-select"
                  :class="{ open: openFilter === filter.key }"
                  :aria-label="
                    filter.label +
                    ': ' +
                    filter.options.find((option) => option.value === filterValues[filter.key].value)
                      ?.label
                  "
                  :title="
                    filter.options.find((option) => option.value === filterValues[filter.key].value)
                      ?.label
                  "
                  aria-haspopup="menu"
                  :aria-expanded="openFilter === filter.key"
                  @click="toggleFilter(filter.key, $event)"
                >
                  <span>{{
                    filter.options.find((option) => option.value === filterValues[filter.key].value)
                      ?.label
                  }}</span
                  ><ChevronDown :size="14" aria-hidden="true" />
                </button>
                <Teleport to="body">
                  <DesktopMenuTransition>
                    <div
                      v-if="openFilter === filter.key"
                      class="cleanup-account-menu wardrobe-filter-menu"
                      :id="'wardrobe-menu-' + filter.key"
                      :style="filterMenuStyle"
                      @focusout="leaveFilter"
                      @keydown.esc.stop.prevent="dismissFilter(filter.key)"
                      role="menu"
                      :aria-label="filter.label"
                    >
                      <div class="wardrobe-filter-menu-scroll">
                        <button
                          v-for="option in filter.options"
                          :key="option.value"
                          type="button"
                          role="menuitemradio"
                          :aria-checked="filterValues[filter.key].value === option.value"
                          :class="{
                            active: filterValues[filter.key].value === option.value,
                            'has-group-separator': option.separatorBefore
                          }"
                          @click="selectFilter(filter.key, option.value)"
                          >{{ option.label }}</button
                        >
                      </div>
                    </div>
                  </DesktopMenuTransition>
                </Teleport>
              </div>
            </div>
            <button class="wardrobe-reset-button" type="button" @click="resetFilters">
              <RotateCcw :size="14" aria-hidden="true" />
              {{ text('重置筛选', 'Reset filters') }}
            </button>
          </div>
        </div>
      </Teleport>
      <aside
        v-if="ownershipNoticeVisible"
        ref="ownershipNotice"
        class="wardrobe-collection-notice"
        role="note"
        tabindex="-1"
        :aria-label="ownershipNoticeText.title"
      >
        <Info :size="18" aria-hidden="true" />
        <p
          ><strong>{{ ownershipNoticeText.title }}：</strong>{{ ownershipNoticeText.body }}</p
        >
        <button
          type="button"
          class="wardrobe-collection-notice-close"
          :aria-label="ownershipNoticeText.close"
          :title="ownershipNoticeText.close"
          @click="dismissOwnershipNotice"
          ><X :size="16" aria-hidden="true"
        /></button>
      </aside>
      <p v-if="showOwnershipNote" class="wardrobe-ownership-note" role="note">{{
        text(
          '此来源的拥有信息可能未包含在导入数据中，未识别到的部件显示为未知。',
          'Ownership information for this source may be missing from the imported data. Unidentified pieces are shown as Unknown.'
        )
      }}</p>

      <div v-if="filtered.length" class="wardrobe-grid" :class="{ 'is-pieces': tab === 'item' }">
        <article
          v-for="(entry, imageIndex) in displayEntries.slice(0, limit)"
          :key="merged ? wardrobeFamilyKey(entry) : entry.id"
          v-card-reveal="`wardrobe:${merged ? wardrobeFamilyKey(entry) : entry.id}`"
          class="wardrobe-card"
          :class="{ 'has-forms': merged && hasMultipleForms(entry) }"
        >
          <div class="wardrobe-card-media">
            <button
              class="wardrobe-card-open"
              type="button"
              :disabled="blocked"
              :aria-label="name(entry) + ' · ' + variants[entry.variant] + ' · ' + status(entry)"
              @click="openDetail(entry)"
            >
              <div class="wardrobe-cover" data-load-block>
                <CatalogImage
                  fit="contain"
                  :language="language"
                  referrerpolicy="no-referrer"
                  :src="entry.image"
                  alt=""
                  :index="imageIndex"
                />
                <span class="wardrobe-variant">{{ variants[entry.variant] }}</span>
              </div>
            </button>
            <WardrobeFormPopover
              v-if="compact && merged && hasMultipleForms(entry)"
              :entry="entry"
              :catalog="catalog"
              :snapshot="snapshot"
              :language="language"
              :disabled="blocked"
              :reset-key="formPreviewRevision"
              @select="openDetail"
            />
          </div>
          <div class="wardrobe-card-body" @click="!blocked && openDetail(entry)">
            <div class="wardrobe-card-heading" data-load-block>
              <button
                class="wardrobe-card-name"
                type="button"
                :disabled="blocked"
                :title="name(entry)"
                @click.stop="openDetail(entry)"
              >
                <h3>{{ name(entry) }}</h3>
              </button>
              <WardrobeFormPopover
                v-if="!compact && merged && hasMultipleForms(entry)"
                :entry="entry"
                :catalog="catalog"
                :snapshot="snapshot"
                :language="language"
                :disabled="blocked"
                :reset-key="formPreviewRevision"
                @select="openDetail"
              />
            </div>
            <div class="wardrobe-card-status" data-load-block>
              <span :class="complete(entry) ? 'wardrobe-owned' : ''">
                {{ status(entry) }}
                <small v-if="entry.kind === 'outfit'"
                  >{{ ownedCount(entry) }}/{{ entry.parts.length }}</small
                >
              </span>
              <small class="wardrobe-card-rarity">{{ entry.quality }} ★</small>
            </div>
            <progress data-load-block
              v-if="entry.kind === 'outfit'"
              :value="ownedCount(entry)"
              :max="entry.parts.length || 1"
              :aria-label="text('收集进度', 'Collection progress')"
            ></progress>
          </div>
        </article>
      </div>
      <div v-if="filtered.length === 0" class="wardrobe-empty">
        <Shirt :size="32" />
        <p>{{ text('没有符合条件的服装', 'No matching clothes') }}</p>
        <button class="primary-button" type="button" @click="resetFilters">
          {{ text('重置筛选', 'Reset filters') }}
        </button>
      </div>
      <div
        v-if="displayEntries.length > limit"
        ref="loadMoreTarget"
        class="wardrobe-load-more-target"
        aria-hidden="true"
      ></div>
    </template>

    </ContentLoadingSurface>
    <WardrobeItemDialog
      :item="itemPreview"
      :catalog="catalog"
      :snapshot="snapshot"
      @select-form="openDetail"
      :outfits="itemOutfits"
      @open-outfit="openDetail"
      :language="language"
      @close="itemPreview = null"
    />
    <DataImportWindow
      :visible="importOpen"
      :language="language"
      :disabled="disabled || !loaded"
      @close="dialog = null"
      @imported="reload"
      @notice="(message, tone) => emit('notice', { message, tone })"
    />
    <ConfirmDialog
      :visible="showClearConfirm"
      :title="importText.clearTitle"
      :message="importText.clearMessage"
      tone="danger"
      :confirm-label="busy ? importText.clearing : importText.clearConfirm"
      :cancel-label="importText.clearCancel"
      :close-label="importText.close"
      @confirm="clearRecords"
      @cancel="!busy && (showClearConfirm = false)"
    />
    <WardrobeOutfitDialog
      :detail="dialogOpen ? detail : null"
      @open-outfit="openDetail"
      :catalog="catalog"
      :snapshot="snapshot"
      :language="language"
      @close="closeDialog"
    />
  </section>
</template>

<style scoped>
.wardrobe-evolution-switch {
  display: flex;
  align-items: center;
  gap: 10px;
  width: fit-content;
  margin: 0;
  white-space: nowrap;
  font-size: 13px;
  cursor: pointer;
}
.wardrobe-evolution-switch input {
  appearance: none;
  width: 38px;
  height: 22px;
  border-radius: 20px;
  background: var(--muted);
  position: relative;
  cursor: pointer;
}
.wardrobe-evolution-switch input:checked {
  background: var(--pink-deep);
}
.wardrobe-evolution-switch input::after {
  content: '';
  position: absolute;
  width: 16px;
  height: 16px;
  top: 3px;
  left: 3px;
  border-radius: 50%;
  background: white;
  transition: transform 0.15s;
}
.wardrobe-evolution-switch input:checked::after {
  transform: translateX(16px);
}
.wardrobe-card {
  position: relative;
}
.wardrobe-card-media {
  position: relative;
}
.wardrobe-card-heading {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  align-items: center;
}
.has-forms .wardrobe-card-heading {
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 6px;
}
.wardrobe-card-name {
  min-width: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.wardrobe-ownership-note {
  margin: 0 0 12px;
  color: var(--muted);
  font-size: 13px;
  line-height: 1.6;
}

/* 衣橱只补充内容布局，按钮、操作菜单、弹窗和颜色沿用公共样式。 */
.wardrobe-page {
  min-width: 0;
}
.wardrobe-header {
  flex-wrap: wrap;
  margin-bottom: 16px;
}
.wardrobe-heading {
  flex: 0 1 auto;
  width: max-content;
  max-width: 100%;
  min-width: 0;
}
.wardrobe-title-row {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 6px 20px;
}
.wardrobe-title-row h2 {
  flex-shrink: 0;
}
.wardrobe-header :deep(.resonance-actions) {
  flex: 0 1 auto;
  width: max-content;
  max-width: 100%;
  min-width: 0;
  margin-left: auto;
  justify-content: flex-end;
  overflow: visible;
}
.wardrobe-toolbar,
.wardrobe-filters {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
}
.wardrobe-summary {
  display: flex;
  align-items: baseline;
  flex-wrap: nowrap;
  gap: 4px 12px;
  color: var(--text);
  font-size: 13px;
  line-height: 1.7;
}
.wardrobe-summary > span {
  white-space: nowrap;
}
.wardrobe-summary > span + span::before {
  content: '·';
  margin-right: 12px;
  color: var(--muted);
}
.wardrobe-summary strong,
.wardrobe-filter-results strong {
  color: var(--heading);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.wardrobe-filter-results {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  margin: 0 0 12px;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.7;
}
.wardrobe-filter-results > span:last-child {
  flex-shrink: 0;
  white-space: nowrap;
}
.wardrobe-toolbar {
  justify-content: space-between;
  margin: 18px 0 12px;
}
.wardrobe-filter-field {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
}
/* 衣橱专用重置按钮：与筛选框统一的白底浅灰描边，不影响公共按钮。 */
.wardrobe-reset-button {
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
.wardrobe-reset-button svg {
  flex-shrink: 0;
}
.wardrobe-reset-button:hover:not(:disabled) {
  border-color: var(--pink-deep);
  background: var(--surface-strong);
}
.wardrobe-reset-button:focus-visible {
  outline: 2px solid var(--pink-deep);
  outline-offset: 2px;
}
.wardrobe-filter-select {
  min-width: 0;
  grid-template-columns: minmax(0, 1fr);
}
.wardrobe-filter-select .action-sort-select {
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  height: 32px;
  min-height: 32px;
  padding: 4px 8px;
  gap: 4px;
}
.wardrobe-filter-select .action-sort-select > span {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.wardrobe-filter-field > span {
  flex-shrink: 0;
  white-space: nowrap;
}
.wardrobe-filter-menu {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-sizing: border-box;
  padding: 6px;
}
.wardrobe-filter-menu-scroll {
  min-height: 0;
  margin-right: -3px;
  padding-right: 3px;
  overflow-y: auto;
  overscroll-behavior: contain;
}
.wardrobe-filter-menu button {
  white-space: normal;
  overflow-wrap: anywhere;
  line-height: 1.5;
}
.wardrobe-filter-menu button.has-group-separator {
  margin-top: 11px;
  position: relative;
}
.wardrobe-filter-menu button.has-group-separator::before {
  content: '';
  position: absolute;
  top: -6px;
  left: 3px;
  right: 3px;
  height: 1px;
  background: var(--line);
  pointer-events: none;
}
.wardrobe-header.is-empty {
  margin-bottom: 18px;
}
.wardrobe-initial {
  display: grid;
  min-height: 280px;
  place-items: center;
  align-content: center;
  gap: 10px;
  padding: 32px;
  border: 1px dashed var(--line);
  border-radius: var(--ui-radius);
  color: var(--muted);
  text-align: center;
}
.wardrobe-initial h3,
.wardrobe-initial p {
  margin: 0;
}
.wardrobe-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
  gap: 16px;
}
.wardrobe-grid.is-pieces {
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
}
.wardrobe-card {
  min-width: 0;
  overflow: hidden;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--ui-radius);
  box-shadow: var(--photo-shadow);
  transition:
    border-color var(--motion-fast) ease,
    box-shadow var(--motion-fast) ease;
}
.wardrobe-grid:not(.is-pieces) .wardrobe-card {
  --photo-hover-shadow: 0 1px 5px rgba(201, 132, 134, 0.202);
}
:where(:root[data-theme='dark']) .wardrobe-grid:not(.is-pieces) .wardrobe-card {
  --photo-hover-shadow: 0 2px 8px rgba(185, 126, 126, 0.524);
}
:root.is-theme-switching .wardrobe-card {
  transition: none;
}
.wardrobe-card:hover,
.wardrobe-card:has(button:focus-visible) {
  border-color: var(--pink-deep);
  box-shadow: var(--photo-hover-shadow);
}
.wardrobe-grid.is-pieces .wardrobe-card:hover,
.wardrobe-grid.is-pieces .wardrobe-card:has(button:focus-visible) {
  border-color: color-mix(in srgb, var(--pink-deep) 85%, var(--line));
}
@supports not (color: color-mix(in srgb, black, white)) {
  .wardrobe-grid.is-pieces .wardrobe-card:hover,
  .wardrobe-grid.is-pieces .wardrobe-card:has(button:focus-visible) {
    border-color: rgba(205.05, 144.15, 144.8, 1);
  }
  :where(:root[data-theme='dark']) .wardrobe-grid.is-pieces .wardrobe-card:hover,
  :where(:root[data-theme='dark'])
    .wardrobe-grid.is-pieces
    .wardrobe-card:has(button:focus-visible) {
    border-color: rgba(218, 162.65, 165.1, 1);
  }
}
.wardrobe-card-open {
  display: block;
  width: 100%;
  padding: 0;
  border: 0;
  color: var(--text);
  background: transparent;
  text-align: left;
}
.wardrobe-cover {
  position: relative;
  /* 套装素材为 448 × 656，按原图比例预留空间，避免 contain 产生侧边留白。 */
  aspect-ratio: 448 / 656;
}
.wardrobe-cover {
  background: var(--archive-background-image, url('../../img/云绸.webp')) center / cover no-repeat;
  background-color: var(--frame-bg);
}
.is-pieces .wardrobe-cover {
  aspect-ratio: 1;
}
.is-pieces .wardrobe-cover {
  background-image: var(--archive-pink-card-background);
}
.wardrobe-cover img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.wardrobe-grid:not(.is-pieces) .wardrobe-cover img {
  /* 套装图使用块级布局，消除行内图片的底部基线空隙。 */
  display: block;
}
.wardrobe-variant {
  position: absolute;
  top: 10px;
  left: 10px;
  padding: 4px 8px;
  border: 1px solid var(--form-control-border);
  border-radius: var(--radius-sm);
  background: var(--form-control-bg);
  -webkit-backdrop-filter: blur(8px);
  backdrop-filter: blur(2px);
  font-size: 12px;
}
@supports not (color: color-mix(in srgb, black, white)) {
  .wardrobe-variant {
    border-radius: var(--radius-sm);
  }
  :where(:root[data-theme='dark']) .wardrobe-variant {
    border-radius: var(--radius-sm);
  }
}
.wardrobe-card-body {
  display: grid;
  gap: 6px;
  padding: 12px;
}
.wardrobe-card-body h3 {
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px;
  color: var(--heading);
}
.wardrobe-card-body small {
  font-size: 11px;
  color: var(--muted);
}
.wardrobe-card-status {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 12px;
}
.wardrobe-card-body .wardrobe-card-rarity {
  flex-shrink: 0;
  white-space: nowrap;
  color: #b78343;
}
.wardrobe-owned {
  color: var(--notice-success);
}
progress {
  width: 100%;
  height: 5px;
  accent-color: var(--notice-success);
  border: 0;
  border-radius: 999px;
  overflow: hidden;
}
progress::-webkit-progress-bar {
  background: var(--line-soft);
}
progress::-webkit-progress-value {
  background: var(--notice-success);
}
.wardrobe-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--muted);
  padding: 60px 20px;
}
.wardrobe-empty p {
  margin: 0;
}
.wardrobe-load-more-target {
  height: 1px;
}
/* 方案 A：只作用于衣橱部件弹窗，不改变其他模块的弹窗和主列表卡片。 */
.wardrobe-sidebar-controls .wardrobe-toolbar {
  margin: 0 0 10px;
}
.wardrobe-sidebar-controls .sidebar-mode-switch {
  width: 100%;
}
.wardrobe-sidebar-controls .wardrobe-filters {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 12px;
  align-items: stretch;
}
.wardrobe-sidebar-controls .wardrobe-filter-field {
  min-width: 0;
  justify-content: space-between;
}
.wardrobe-sidebar-controls .wardrobe-filter-select {
  flex: 1 1 0;
  width: auto;
  min-width: 0;
}
@media (max-width: 899px) {
  /* 复用其他模块的手机筛选栏及操作按钮；桌面标题和侧栏保持原样。 */
  .wardrobe-header,
  .wardrobe-header.is-empty {
    display: none;
  }
  /* 白底切换按钮与主标签内的选中项等高、同圆角。 */
  .wardrobe-mobile-category-switch {
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
  :root[data-theme='dark'] .wardrobe-mobile-category-switch {
    border-color: var(--line);
    color: var(--pink-deep);
  }
  .wardrobe-mobile-category-switch:focus-visible {
    outline: 2px solid var(--pink-deep);
    outline-offset: 2px;
  }
  .wardrobe-mobile-summary {
    flex-shrink: 0;
    margin: 0;
    color: var(--muted);
    font-size: 12px;
    white-space: nowrap;
  }
  .wardrobe-mobile-summary strong {
    color: var(--pink-deep);
    font-variant-numeric: tabular-nums;
  }

  /* 操作筛选栏与下方衣橱卡片保留呼吸间距。 */
  .wardrobe-mobile-filter-bar {
    margin-bottom: 12px;
  }
  .wardrobe-grid,
  .wardrobe-grid.is-pieces {
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 10px;
  }
  .wardrobe-toolbar {
    align-items: stretch;
  }
  /* 筛选行与重置按钮等间距；弹窗内容区已提供底部留白。 */
  .wardrobe-filters {
    gap: 12px;
    margin-bottom: 0;
  }
  .wardrobe-reset-button {
    height: 36px;
  }
  .wardrobe-reset-button svg {
    width: 16px;
    height: 16px;
  }
  .wardrobe-filter-field {
    flex: 1 1 calc(50% - 10px);
    min-width: 0;
  }
  .wardrobe-filter-select {
    flex: 1;
    min-width: 0;
    width: 0;
  }
  /* 手机三列卡片紧凑排版：名称依然只显示一行。 */
  .wardrobe-card-body {
    gap: 4px;
    padding: 6px;
  }
  .wardrobe-card-body h3 {
    font-size: 12px;
    line-height: 1.35;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .wardrobe-card-status {
    gap: 3px;
    font-size: 10px;
  }
  .wardrobe-card-body small {
    font-size: 10px;
  }
  .wardrobe-variant {
    top: 6px;
    left: 6px;
    padding: 3px 6px;
    font-size: 10px;
  }
}
@media (min-width: 641px) and (max-width: 799px) {
  .wardrobe-grid,
  .wardrobe-grid.is-pieces {
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 8px;
  }
}
@media (max-width: 640px) {
  .wardrobe-grid,
  .wardrobe-grid.is-pieces {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 6px;
  }
}
@media (max-width: 350px) {
  .wardrobe-grid,
  .wardrobe-grid.is-pieces {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

.wardrobe-collection-notice {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin: 0 0 16px;
  padding: 12px 14px;
  border: 1px solid var(--line);
  border-radius: var(--ui-radius);
  background: var(--surface);
  color: var(--muted);
  font-size: 13px;
  line-height: 1.65;
}
.wardrobe-collection-notice > svg {
  flex: none;
  margin-top: 2px;
  color: var(--pink-deep);
}
.wardrobe-collection-notice p {
  flex: 1;
  min-width: 0;
  margin: 0;
  overflow-wrap: anywhere;
}
.wardrobe-collection-notice strong {
  color: var(--heading);
  font-weight: 600;
}
.wardrobe-collection-notice:focus-visible {
  outline: 2px solid var(--pink-deep);
  outline-offset: 2px;
}
.wardrobe-collection-notice-close {
  display: grid;
  place-items: center;
  flex: none;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: var(--icon-button-bg);
  color: var(--text);
  cursor: pointer;
  transition: background 0.18s ease;
}
.wardrobe-collection-notice-close:hover {
  background: var(--icon-button-hover-bg);
}
@media (max-width: 899px) {
  .wardrobe-collection-notice {
    gap: 8px;
    padding: 10px;
    font-size: 12px;
  }
  .wardrobe-collection-notice-close {
    width: 32px;
    height: 32px;
  }
}

@media (hover: hover) and (pointer: fine) {
  .wardrobe-reset-button:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: var(--accent-shadow-sm);
  }
}
.wardrobe-reset-button:active:not(:disabled) {
  transform: scale(0.98);
  box-shadow: none;
}
@media (prefers-reduced-motion: reduce) {
  .wardrobe-reset-button {
    transition: none;
  }
  .wardrobe-reset-button:hover:not(:disabled),
  .wardrobe-reset-button:active:not(:disabled) {
    transform: none;
  }
}
</style>
