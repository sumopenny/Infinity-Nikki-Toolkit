<script setup lang="ts">
import { reportError as captureDiagnosticError } from '../utils/errorReporting/errorReporter'
import { buildParseItems, type ParseItemView } from '../utils/outfit/parseItemView'
import CatalogImage from './CatalogImage.vue'
import WardrobeFormNav from './WardrobeFormNav.vue'
import { wardrobeFamilyKey } from '../utils/wardrobe/wardrobeFamilies'
// 搭配码与照片共用部件列表和详情；照片传入解码结果时不请求搭配码服务。
import {
  computed,
  defineAsyncComponent,
  nextTick,
  onBeforeUnmount,
  ref,
  shallowRef,
  watch
} from 'vue'
import { Share2, ExternalLink, RefreshCw, X } from 'lucide-vue-next'
import type { Language, OutfitMessages } from '../i18n'
import { loadItemCatalog, type ItemCatalogEntry } from '../utils/outfit/itemCatalog'
import {
  OutfitCodeParseError,
  parseOutfitCode,
  type LookbookDecodeResult
} from '../utils/outfit/outfitCodeParser'
import { getClothTypeLabel, inferClothTypeFromItemId } from '../utils/outfit/clothType'
import {
  createOutfitDetailPreview,
  loadLocalOutfitDetail,
  loadOutfitDetail,
  type OutfitDetail
} from '../utils/outfit/outfitDetails'
import { useLatestRequest } from '../composables/useLatestRequest'
import { useBodyScrollLock } from '../utils/bodyScrollLock'

import WardrobeOutfitDialog from './WardrobeOutfitDialog.vue'
import MakeupDetailDialog from './MakeupDetailDialog.vue'
import { loadMakeupCatalog, type MakeupCatalogData } from '../utils/loadMakeupCatalog'
import type { MakeupEntry } from '../utils/makeupCatalog'
import {
  loadWardrobeCatalog,
  type WardrobeCatalog,
  type WardrobeEntry
} from '../utils/wardrobe/wardrobeCatalog'
import { emptyWardrobe, loadWardrobe } from '../utils/wardrobe/wardrobeStorage'

const wardrobeCatalog = shallowRef<WardrobeCatalog | null>(null)
const wardrobeSnapshot = ref(emptyWardrobe())
const outfitPreview = shallowRef<WardrobeEntry | null>(null)
const associatedOutfit = computed(() => {
  const id = selectedDetail.value?.outfitId
  const entry = id ? wardrobeCatalog.value?.byId.get(String(id)) : null
  return entry?.kind === 'outfit' ? entry : null
})

const props = defineProps<{
  visible: boolean
  code: string
  embedded?: boolean
  directItem?: Pick<ParseItemView, 'id' | 'name' | 'clothType'>
  suppliedResult?: LookbookDecodeResult
  loadPhoto?: () => Promise<Blob>
  language: Language
  messages: OutfitMessages
}>()

const ShareImageDialog = defineAsyncComponent(() => import('./ShareImageDialog.vue'))
const shareVisible = ref(false)
watch(
  () => [props.visible, props.code],
  () => {
    shareVisible.value = false
  }
)
const emit = defineEmits<{ close: []; copy: [code: string] }>()

const status = ref<'loading' | 'success' | 'error'>('loading')
const errorKind = ref<'invalid' | 'unavailable'>('unavailable')
const decoded = ref<LookbookDecodeResult | null>(null)
const catalog = shallowRef<Map<number, ItemCatalogEntry> | null>(null)
const panelRef = ref<HTMLElement | null>(null)
const detailPanelRef = ref<HTMLElement | null>(null)
const detailVisible = ref(false)
const detailLoading = ref(false)
const detailRequest = useLatestRequest()
const selectedDetail = ref<OutfitDetail | null>(null)
const makeupData = shallowRef<MakeupCatalogData | null>(null)
const makeupPreview = shallowRef<MakeupEntry | null>(null)
const associatedMakeups = computed(() => {
  const detail = selectedDetail.value
  const data = makeupData.value
  if (!detail || !data) return []
  return data.entries.filter((entry) =>
    data.relations.get(entry.id)?.partIds.includes(String(detail.itemId))
  )
})
const selectedWardrobeItem = computed(() => {
  const entry = wardrobeCatalog.value?.byId.get(String(selectedDetail.value?.itemId))
  return entry?.kind === 'item' ? entry : null
})
const hasDetailForms = computed(() => {
  const entry = selectedWardrobeItem.value
  return (
    !!entry &&
    (wardrobeCatalog.value?.entries ?? []).filter(
      (candidate) => wardrobeFamilyKey(candidate) === wardrobeFamilyKey(entry)
    ).length > 1
  )
})

/** 穿戴部件保留搭配码染色，其他形态使用各自的原始详情。 */
function selectDetailForm(entry: WardrobeEntry) {
  const worn = items.value.find((item) => String(item.id) === entry.id)
  const clothType = inferClothTypeFromItemId(Number(entry.id))
  const typeLabel = getClothTypeLabel(clothType, props.language)
  const name = entry.name[props.language]
  void openItemDetail(
    worn ?? {
      id: Number(entry.id),
      name: typeLabel ? `${name}(${typeLabel})` : name,
      outfitId: null,
      clothType,
      dyes: [],
      hasSpecialEffect: false
    }
  )
}
const loadedItemImages = ref(new Set<number>())
const failedItemImages = ref(new Set<number>())
const detailImageState = ref<'idle' | 'loaded' | 'failed'>('idle')
type DetailItem = Pick<
  ParseItemView,
  'id' | 'name' | 'clothType' | 'outfitId' | 'dyes' | 'hasSpecialEffect'
>
let detailItem: DetailItem | null = null
let detailTrigger: HTMLButtonElement | null = null
let detailTriggerItemId: number | null = null
let requestId = 0
let previousActiveElement: HTMLElement | null = null

useBodyScrollLock(computed(() => props.visible && !props.embedded))

const requestCode = computed(() => decoded.value?.code || props.code)

const items = computed(() =>
  decoded.value ? buildParseItems(decoded.value, catalog.value, props.language) : []
)

async function openItemDetail(item: DetailItem, event?: Event) {
  const request = detailRequest.begin()
  makeupPreview.value = null
  if (!makeupData.value) {
    void loadMakeupCatalog()
      .then((data) => {
        if (request.isCurrent()) makeupData.value = data
      })
      .catch((error) => {
        if (request.isCurrent())
          captureDiagnosticError(error, { module: 'outfits', action: 'load-makeup-catalog' })
      })
  }
  detailItem = item
  if (event) {
    detailTrigger = event.currentTarget instanceof HTMLButtonElement ? event.currentTarget : null
    detailTriggerItemId = item.id
  }
  detailVisible.value = true
  detailLoading.value = true
  const preview = createOutfitDetailPreview(item.id, props.language, item.name)
  // 图鉴重试不重新下载相同图片；仅在图片地址变化时重置加载状态。
  if (selectedDetail.value?.detailImageUrl !== preview.detailImageUrl)
    detailImageState.value = 'idle'
  selectedDetail.value = preview
  void nextTick(() => detailPanelRef.value?.querySelector('button')?.focus())
  void loadWardrobeCatalog()
    .then((value) => {
      if (request.isCurrent()) wardrobeCatalog.value = value
    })
    .catch((error) => {
      if (request.isCurrent())
        captureDiagnosticError(error, { module: 'outfits', action: 'load-wardrobe-catalog' })
      if (request.isCurrent() && selectedDetail.value) selectedDetail.value.loadError = true
    })
  void loadWardrobe()
    .then((value) => {
      if (request.isCurrent()) wardrobeSnapshot.value = value
    })
    .catch((error) => {
      if (request.isCurrent())
        captureDiagnosticError(error, { module: 'outfits', action: 'load-wardrobe-ownership' })
    })
  try {
    try {
      const local = await loadLocalOutfitDetail(
        item.id,
        item.outfitId,
        props.language,
        item.name,
        item.dyes,
        item.clothType,
        item.hasSpecialEffect
      )
      if (!request.isCurrent()) return
      selectedDetail.value = local
    } catch {
      // 本地图鉴失败仍保留即时预览，后续读取可重试。
    }
    const result = await loadOutfitDetail(
      item.id,
      item.outfitId,
      props.language,
      item.name,
      item.dyes,
      item.clothType,
      item.hasSpecialEffect
    )
    if (!request.isCurrent()) return
    selectedDetail.value = result
    void nextTick(() => {
      if (request.isCurrent()) detailPanelRef.value?.querySelector('button')?.focus()
    })
  } catch (error) {
    if (request.isCurrent())
      captureDiagnosticError(error, { module: 'outfits', action: 'load-item-detail' })
    if (request.isCurrent() && selectedDetail.value) selectedDetail.value.loadError = true
  } finally {
    if (request.isCurrent()) detailLoading.value = false
  }
}

function dismissItemDetail() {
  closeItemDetail()
  if (props.directItem) emit('close')
}

function openCurrentView() {
  if (!props.directItem) {
    void startParse()
    if (!props.embedded) void nextTick(() => panelRef.value?.querySelector('button')?.focus())
    return
  }
  const { id, name, clothType } = props.directItem
  // 排行跨越多套搭配，详情展示该部件自身的形态，不带入某套搭配的染色。
  void openItemDetail({ id, name, clothType, outfitId: null, dyes: [], hasSpecialEffect: false })
}

async function openAssociatedOutfit() {
  const entry = associatedOutfit.value
  if (!entry) return
  const currentDetail = selectedDetail.value
  try {
    const snapshot = await loadWardrobe()
    if (!detailVisible.value || selectedDetail.value !== currentDetail) return
    wardrobeSnapshot.value = snapshot
    outfitPreview.value = entry
  } catch (error) {
    if (selectedDetail.value === currentDetail && currentDetail) {
      captureDiagnosticError(error, { module: 'outfits', action: 'load-associated-outfit' })
      currentDetail.loadError = true
    }
  }
}

function markItemImageLoaded(itemId: number) {
  loadedItemImages.value.add(itemId)
  failedItemImages.value.delete(itemId)
}

function markItemImageFailed(itemId: number) {
  failedItemImages.value.add(itemId)
}

function markDetailImageLoaded() {
  detailImageState.value = 'loaded'
}

function markDetailImageFailed() {
  detailImageState.value = 'failed'
}

function closeItemDetail() {
  makeupPreview.value = null
  outfitPreview.value = null
  detailRequest.invalidate()
  const trigger = detailTrigger
  const triggerItemId = detailTriggerItemId
  detailVisible.value = false
  detailLoading.value = false
  selectedDetail.value = null
  // 图鉴补齐或切换形态可能重建原按钮，按部件 ID 找回当前节点。
  const restoreFocus = () => {
    if (detailVisible.value) return
    const current = trigger?.isConnected
      ? trigger
      : panelRef.value?.querySelector<HTMLButtonElement>(`button[data-item-id="${triggerItemId}"]`)
    current?.focus({ preventScroll: true })
  }
  restoreFocus()
  void nextTick(restoreFocus)
  detailTrigger = null
  detailTriggerItemId = null
}

/** 解析当前搭配码；重复解析会作废旧请求结果，避免慢响应覆盖新状态。 */
async function startParse() {
  closeItemDetail()
  const currentRequest = (requestId += 1)
  const code = props.code
  decoded.value = null
  status.value = 'loading'

  if (!code && !props.suppliedResult) {
    errorKind.value = 'invalid'
    status.value = 'error'
    return
  }

  try {
    // 图鉴仅补充名称与图片，不阻塞部件和染色；失败或旧请求完成均不覆盖当前解析状态。
    void loadItemCatalog()
      .then((catalogIndex) => {
        if (currentRequest === requestId) catalog.value = catalogIndex
      })
      .catch(() => {
        // 保留部件 ID 和染色结果，再次解析时图鉴加载器会重试。
      })
    const result = props.suppliedResult ?? (await parseOutfitCode(code))
    if (currentRequest !== requestId) return
    decoded.value = result
    status.value = 'success'
  } catch (error) {
    if (currentRequest !== requestId) return
    if (!(error instanceof OutfitCodeParseError && error.kind === 'invalid'))
      captureDiagnosticError(error, { module: 'outfits', action: 'parse', stage: 'decode' })
    errorKind.value = error instanceof OutfitCodeParseError ? error.kind : 'unavailable'
    status.value = 'error'
  }
}

function handleKeydown(event: KeyboardEvent) {
  if (
    !props.visible ||
    event.defaultPrevented ||
    outfitPreview.value ||
    makeupPreview.value ||
    shareVisible.value
  )
    return
  if (props.embedded && !detailVisible.value) return
  if (event.key === 'Escape') {
    event.preventDefault()
    if (detailVisible.value) {
      dismissItemDetail()
      return
    }
    emit('close')
    return
  }
  if (event.key !== 'Tab') return
  const activePanel = detailVisible.value ? detailPanelRef.value : panelRef.value
  if (!activePanel) return
  const focusable = [
    ...activePanel.querySelectorAll<HTMLElement>('button, [href], [tabindex]:not([tabindex="-1"])')
  ].filter((element) => !element.hasAttribute('disabled'))
  if (!focusable.length) return
  const first = focusable[0]
  const last = focusable[focusable.length - 1]
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}

// 打开窗口时开始解析并把焦点移入面板，关闭后把焦点还给来源按钮。
watch(
  () => props.visible,
  (visible) => {
    if (visible) {
      previousActiveElement =
        document.activeElement instanceof HTMLElement ? document.activeElement : null
      openCurrentView()
    } else {
      requestId += 1
      closeItemDetail()
      if (!props.embedded) previousActiveElement?.focus()
      previousActiveElement = null
    }
  },
  { immediate: true }
)

window.addEventListener('keydown', handleKeydown)
watch(
  () => [props.code, props.language, props.suppliedResult, props.directItem],
  () => {
    if (props.visible) openCurrentView()
  }
)
onBeforeUnmount(() => {
  detailRequest.invalidate()
  requestId++
  window.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <Teleport to="body" :disabled="embedded">
    <Transition name="confirm-dialog" appear>
      <div
        v-if="visible && !directItem"
        :class="embedded ? 'photo-outfit-content' : 'outfit-editor'"
        :role="embedded ? undefined : 'dialog'"
        :aria-modal="embedded ? undefined : true"
        :aria-label="messages.parseTitle"
        @click.self="!embedded && $emit('close')"
      >
        <section
          ref="panelRef"
          :class="embedded ? 'photo-outfit-panel' : 'outfit-editor-panel outfit-parse-panel'"
        >
          <header v-if="!embedded">
            <div class="outfit-parse-heading">
              <h2>{{ messages.parseTitle }}</h2>
              <p
                v-if="requestCode"
                class="outfit-parse-code"
                :title="messages.operations.copyCode"
                :aria-label="messages.operations.copyCode"
                role="button"
                tabindex="0"
                @click="emit('copy', requestCode)"
                @keydown.enter.prevent="emit('copy', requestCode)"
                @keydown.space.prevent="emit('copy', requestCode)"
              >
                {{ requestCode }}
              </p>
            </div>
            <button
              v-if="status === 'success' && requestCode"
              class="outfit-share-button"
              type="button"
              :title="language === 'en' ? 'Export share image' : '导出分享图'"
              :aria-label="language === 'en' ? 'Export share image' : '导出分享图'"
              @click="shareVisible = true"
              ><Share2 :size="18"
            /></button>
            <button
              type="button"
              :title="messages.parseClose"
              :aria-label="messages.parseClose"
              @click="$emit('close')"
            >
              <X :size="19" aria-hidden="true" />
            </button>
          </header>

          <div class="outfit-parse-content">
            <template v-if="status === 'loading'">
              <div class="outfit-parse-status" role="status" aria-live="polite">
                <span class="outfit-parse-spinner" aria-hidden="true"></span>
                <p>{{ messages.parseLoading }}</p>
              </div>
              <div class="outfit-parse-grid" aria-hidden="true">
                <span v-for="index in 10" :key="index" class="outfit-parse-skeleton"></span>
              </div>
            </template>

            <div v-else-if="status === 'error'" class="outfit-parse-status" role="alert">
              <p>{{
                errorKind === 'invalid' ? messages.parseInvalidCode : messages.parseUnavailable
              }}</p>
              <button class="primary-button outfit-parse-retry" type="button" @click="startParse">
                <RefreshCw :size="15" aria-hidden="true" />
                <span>{{ messages.parseRetry }}</span>
              </button>
            </div>

            <div v-else-if="items.length" class="outfit-parse-grid">
              <article
                v-for="(item, imageIndex) in items"
                :key="item.id"
                class="outfit-parse-item"
                :title="item.name"
              >
                <button
                  v-if="item.imageUrl"
                  class="outfit-parse-item-button"
                  :data-item-id="item.id"
                  type="button"
                  :aria-label="messages.parseOpenDetail(item.name)"
                  @click="openItemDetail(item, $event)"
                >
                  <CatalogImage
                    :language="language"
                    class="outfit-parse-item-icon"
                    :class="{
                      'is-loading':
                        !loadedItemImages.has(item.id) && !failedItemImages.has(item.id),
                      'is-failed': failedItemImages.has(item.id)
                    }"
                    referrerpolicy="no-referrer"
                    :src="item.imageUrl"
                    :alt="item.name"
                    :index="imageIndex"
                    @load="markItemImageLoaded(item.id)"
                    @error="markItemImageFailed(item.id)"
                    @retry="failedItemImages.delete(item.id)"
                  />
                  <span
                    v-if="!loadedItemImages.has(item.id) && !failedItemImages.has(item.id)"
                    class="outfit-image-spinner"
                    aria-hidden="true"
                  ></span>
                </button>
                <span v-else class="outfit-parse-item-icon is-missing" aria-hidden="true">?</span>
                <p class="outfit-parse-item-name">{{ item.name }}</p>
                <div v-if="item.dyeColors.length" class="outfit-parse-dyes">
                  <span
                    v-for="(color, index) in item.dyeColors"
                    :key="`${item.id}-${index}`"
                    class="outfit-parse-dye-dot"
                    :style="{ backgroundColor: color }"
                    :title="color"
                  ></span>
                </div>
              </article>
            </div>

            <p v-else class="outfit-parse-empty">{{ messages.parseEmpty }}</p>
          </div>

          <footer
            v-if="!embedded && status === 'success' && items.length"
            class="outfit-parse-footer"
          >
            <span>{{ messages.parseItemCount(items.length) }}</span>
          </footer>
        </section>
      </div>
    </Transition>
  </Teleport>
  <Teleport to="body">
    <Transition name="confirm-dialog" appear>
      <div
        v-if="visible && detailVisible"
        class="outfit-detail-overlay"
        role="dialog"
        aria-modal="true"
        :aria-label="messages.detailTitle"
        @click.self="dismissItemDetail"
      >
        <section
          ref="detailPanelRef"
          class="outfit-editor-panel outfit-detail-panel"
          :class="{
            'is-single-column': !selectedDetail?.dyes.length,
            'has-form-navigation': hasDetailForms
          }"
        >
          <header>
            <h2>{{ messages.detailTitle }}</h2>
            <button
              type="button"
              :title="messages.detailClose"
              :aria-label="messages.detailClose"
              @click="dismissItemDetail"
            >
              <X :size="19" aria-hidden="true" />
            </button>
          </header>
          <div class="wardrobe-detail-scroll">
            <WardrobeFormNav
              v-if="hasDetailForms && selectedWardrobeItem"
              ownership-icons
              :entry="selectedWardrobeItem"
              :catalog="wardrobeCatalog"
              :snapshot="wardrobeSnapshot"
              :language="language"
              @select="selectDetailForm"
            />
            <div
              v-if="selectedDetail"
              class="outfit-detail-content"
              :class="{ 'is-single-column': !selectedDetail.dyes.length }"
            >
              <section class="outfit-detail-summary">
                <div
                  class="outfit-detail-image-frame"
                  :class="{
                    'is-image-loading': selectedDetail.detailImageUrl && detailImageState === 'idle'
                  }"
                  :aria-busy="!!selectedDetail.detailImageUrl && detailImageState === 'idle'"
                >
                  <CatalogImage
                    :language="language"
                    v-if="selectedDetail.detailImageUrl"
                    class="outfit-detail-image"
                    loading="eager"
                    fetchpriority="high"
                    :class="{ 'is-loading': detailImageState === 'idle' }"
                    referrerpolicy="no-referrer"
                    :src="selectedDetail.detailImageUrl"
                    :alt="selectedDetail.itemName"
                    @load="markDetailImageLoaded"
                    @error="markDetailImageFailed"
                    @retry="detailImageState = 'idle'"
                  />
                  <div
                    v-if="selectedDetail.detailImageUrl && detailImageState === 'idle'"
                    class="outfit-detail-image-placeholder"
                    role="status"
                  >
                    <span class="outfit-image-spinner" aria-hidden="true"></span>
                    <span>{{ language === 'zh' ? '正在加载图片…' : 'Loading image…' }}</span>
                  </div>
                  <div
                    v-else-if="!selectedDetail.detailImageUrl"
                    class="outfit-detail-image is-missing"
                    >{{ language === 'zh' ? '暂无图片' : 'No image' }}</div
                  >
                </div>
                <dl class="outfit-detail-info">
                  <div>
                    <dt>{{
                      !selectedDetail.outfitId && associatedMakeups.length
                        ? language === 'zh'
                          ? '全妆'
                          : 'Full makeup'
                        : messages.detailOutfit
                    }}</dt>
                    <dd class="outfit-detail-associations">
                      <span v-if="selectedDetail.outfitId || !associatedMakeups.length">
                        {{ selectedDetail.outfitName || messages.detailOutfitUnavailable }}
                        <button
                          v-if="associatedOutfit"
                          type="button"
                          class="wardrobe-outfit-link"
                          :aria-label="messages.detailOutfit + ': ' + selectedDetail.outfitName"
                          :title="messages.detailOutfit"
                          @click="openAssociatedOutfit"
                        >
                          <ExternalLink :size="15" aria-hidden="true" />
                        </button>
                      </span>
                      <span v-for="makeup in associatedMakeups" :key="makeup.id">
                        <span class="makeup-name">{{ makeup.name[language] }}</span>
                        <button
                          type="button"
                          class="wardrobe-outfit-link makeup-name-link"
                          :aria-label="
                            (language === 'zh' ? '全妆：' : 'Full makeup: ') + makeup.name[language]
                          "
                          :title="language === 'zh' ? '查看全妆详情' : 'View makeup details'"
                          @click="makeupPreview = makeup"
                        >
                          <ExternalLink :size="15" aria-hidden="true" />
                        </button>
                      </span>
                    </dd>
                  </div>
                  <div
                    ><dt>{{ messages.detailCurrentItem }}</dt
                    ><dd>{{ selectedDetail.itemName }}</dd></div
                  >
                  <div
                    ><dt>{{ messages.detailEvolution }}</dt
                    ><dd>{{ selectedDetail.evolution }}</dd></div
                  >
                  <div
                    ><dt>{{ messages.detailDyeCondition }}</dt
                    ><dd>{{ selectedDetail.dyeCondition }}</dd></div
                  >
                </dl>
                <p v-if="selectedDetail.loadError" class="outfit-detail-error" role="alert">
                  {{ messages.detailLoadFailed }}
                  <button
                    type="button"
                    :disabled="detailLoading"
                    @click="detailItem && openItemDetail(detailItem)"
                    >{{ messages.parseRetry }}</button
                  >
                </p>
              </section>
              <section v-if="selectedDetail.dyes.length" class="outfit-detail-dyes">
                <h3>{{ messages.detailDyes }}</h3>
                <div class="outfit-detail-table-wrap">
                  <table>
                    <thead
                      ><tr
                        ><th>{{ messages.detailArea }}</th
                        ><th>{{ messages.detailPalette }}</th
                        ><th>{{ messages.detailSlot }}</th
                        ><th>{{ messages.detailColor }}</th></tr
                      ></thead
                    >
                    <tbody>
                      <tr v-for="(dye, index) in selectedDetail.dyes" :key="`${dye.area}-${index}`">
                        <td>{{ dye.area }}</td
                        ><td>{{
                          dye.paletteId < 0
                            ? dye.paletteName
                            : `${dye.paletteId} ${dye.paletteName}`
                        }}</td
                        ><td>{{ dye.slot ?? '—' }}</td>
                        <td
                          ><span class="outfit-detail-color"
                            ><i :style="{ backgroundColor: dye.color }"></i
                            ><code>{{ dye.color }}</code></span
                          ></td
                        >
                      </tr>
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          </div>
        </section>
      </div>
    </Transition>
  </Teleport>
  <ShareImageDialog
    v-if="visible && !embedded && shareVisible"
    :language="language"
    :code="requestCode"
    :load-photo="loadPhoto"
    @close="shareVisible = false"
  />
  <WardrobeOutfitDialog
    :detail="outfitPreview"
    @open-outfit="outfitPreview = $event"
    :catalog="wardrobeCatalog"
    :snapshot="wardrobeSnapshot"
    :language="language"
    @close="outfitPreview = null"
  />
  <MakeupDetailDialog
    v-if="makeupData"
    :detail="makeupPreview"
    :entries="makeupData.entries"
    :parts="makeupData.parts"
    :relations="makeupData.relations"
    :outfits="makeupData.relatedOutfits"
    :language="language"
    :layer="222"
    @close="makeupPreview = null"
    @select-form="makeupPreview = $event"
    @select-entry="makeupPreview = $event"
  />
</template>

<style scoped>
.outfit-parse-panel > header {
  gap: 10px;
}
.outfit-parse-panel > header > button {
  flex-shrink: 0;
}
.outfit-parse-heading {
  flex: 1;
}
.outfit-share-button {
  margin-left: auto;
}
/* 内嵌列表跟随参数窗口滚动，避免内部滚动容器裁掉悬停上移和焦点描边。 */
.photo-outfit-panel .outfit-parse-content {
  overflow: visible;
  padding: 0;
}

.outfit-detail-associations {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 12px;
}
.wardrobe-outfit-link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  vertical-align: middle;
  margin-left: 4px;
  padding: 4px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--pink-deep);
  cursor: pointer;
}
.wardrobe-outfit-link:hover,
.wardrobe-outfit-link:focus-visible {
  background: var(--soft);
  outline: 1px solid var(--pink-deep);
}
</style>
