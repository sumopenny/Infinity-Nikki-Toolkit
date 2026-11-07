<script setup lang="ts">
import CatalogImage from './CatalogImage.vue'
import WardrobeFormNav from './WardrobeFormNav.vue'
import { catalogResources } from '../utils/gongeo/catalogResources'
import { loadMakeupCatalog, type MakeupCatalogData } from '../utils/loadMakeupCatalog'
import type { MakeupEntry } from '../utils/makeupCatalog'
import { matchesWardrobeSource, wardrobeSourceOptions } from '../utils/wardrobe/wardrobeFilters'
import { wardrobeFamilyKey } from '../utils/wardrobe/wardrobeFamilies'
import { computed, ref, shallowRef, toRef, watch } from 'vue'
import {
  CalendarDays,
  ChevronRight,
  CircleCheck,
  CircleHelp,
  CircleMinus,
  Flower2,
  Quote,
  Shirt,
  Sparkles,
  Star,
  X
} from 'lucide-vue-next'
import WardrobeItemDialog from './WardrobeItemDialog.vue'
import type { Language } from '../i18n/types'
import {
  wardrobeStyleLabels,
  type WardrobeEntry,
  type WardrobeCatalog
} from '../utils/wardrobe/wardrobeCatalog'
import { getOwnershipSummary, hasWardrobeSnapshot } from '../utils/wardrobe/wardrobeOwnership'
import { wardrobeVariantLabels } from '../utils/wardrobe/wardrobePresentation'
import type { WardrobeSnapshot } from '../utils/wardrobe/wardrobeStorage'
import { useLatestRequest } from '../composables/useLatestRequest'
import { loadOutfitText } from '../utils/outfit/outfitText'
import { useModalFocus } from '../composables/useModalFocus'
import { useBodyScrollLock } from '../utils/bodyScrollLock'
const props = defineProps<{
  detail: WardrobeEntry | null
  catalog: WardrobeCatalog | null
  snapshot: WardrobeSnapshot
  language: Language
  layer?: number
}>()
const hasForms = computed(
  () =>
    !!props.detail &&
    (props.catalog?.entries ?? []).filter(
      (entry) => wardrobeFamilyKey(entry) === wardrobeFamilyKey(props.detail!)
    ).length > 1
)
const emit = defineEmits<{
  close: []
  openOutfit: [outfit: WardrobeEntry]
  openMakeup: [entry: MakeupEntry, data: MakeupCatalogData]
}>()
const itemPreview = ref<WardrobeEntry | null>(null)
const makeupData = shallowRef<MakeupCatalogData | null>(null)
const makeupIds = ref<string[]>([])
const makeupLoading = ref(false)
const makeupFailed = ref(false)
const makeupRequest = useLatestRequest()
watch(
  () => props.detail?.id,
  async (id, _, onCleanup) => {
    let current = true
    onCleanup(() => {
      current = false
    })
    makeupRequest.invalidate()
    makeupLoading.value = false
    makeupFailed.value = false
    makeupIds.value = []
    if (!id) return
    try {
      const rows = await catalogResources.makeupOutfits()
      if (current)
        makeupIds.value = [
          ...new Set(
            rows
              .filter((row) => String(row[0]) === id)
              .flatMap((row) => (Array.isArray(row[1]) ? row[1].map(String) : []))
          )
        ]
    } catch {
      // Optional association lookup must not block the outfit details.
    }
  },
  { immediate: true }
)
async function openMakeup() {
  const request = makeupRequest.begin()
  makeupLoading.value = true
  makeupFailed.value = false
  try {
    const data = makeupData.value ?? (await loadMakeupCatalog())
    if (!request.isCurrent()) return
    const entry = makeupIds.value.flatMap((id) =>
      data.entries.filter((entry) => entry.id === id)
    )[0]
    if (!entry) throw new Error('MAKEUP_NOT_FOUND')
    makeupData.value = data
    emit('openMakeup', entry, data)
  } catch {
    if (request.isCurrent()) makeupFailed.value = true
  } finally {
    if (request.isCurrent()) makeupLoading.value = false
  }
}
const itemOutfits = computed(() =>
  (props.catalog?.entries ?? []).filter(
    (entry) =>
      entry.kind === 'outfit' && !!itemPreview.value && entry.parts.includes(itemPreview.value.id)
  )
)
function openAssociatedOutfit(outfit: WardrobeEntry) {
  itemPreview.value = null
  emit('openOutfit', outfit)
}
watch(
  () => props.detail?.id,
  () => {
    itemPreview.value = null
  }
)
const detail = toRef(props, 'detail')
const catalog = toRef(props, 'catalog')
const snapshot = toRef(props, 'snapshot')
const dialogOpen = computed(() => !!detail.value)
const panel = ref<HTMLElement | null>(null)
const text = (zh: string, en: string) => (props.language === 'zh' ? zh : en)
const name = (entry: WardrobeEntry) => entry.name[props.language]
const variants = computed(() => wardrobeVariantLabels[props.language])
const detailDescription = ref('')
const detailDescriptionLoading = ref(false)
const detailRequest = useLatestRequest()
const ownershipKnown = computed(() => hasWardrobeSnapshot(snapshot.value))
const unknownLabel = computed(() => text('未知', 'Unknown'))
const detailParts = computed(() =>
  (detail.value?.parts ?? []).map((id) => ({
    id,
    entry: catalog.value?.byId.get(id),
    owned: !!snapshot.value.entries[id]?.owned,
    unknown:
      !!catalog.value?.byId.get(id) &&
      getOwnershipSummary(catalog.value!.byId.get(id)!, snapshot.value).unknown
  }))
)
const detailStyle = computed(() =>
  detail.value?.style ? wardrobeStyleLabels[detail.value.style][props.language] : ''
)
const detailSourceVersion = computed(() => detail.value?.version ?? '')
const detailSource = computed(() =>
  detail.value
    ? wardrobeSourceOptions(detail.value.kind, props.language)
        .filter((option) => matchesWardrobeSource(detail.value!, option.value))
        .map((option) => option.label)
        .join(' · ')
    : ''
)
const detailProgress = computed(() =>
  detail.value
    ? getOwnershipSummary(detail.value, snapshot.value)
    : { owned: 0, total: 0, complete: false }
)
const detailSummary = computed(() => {
  if (!ownershipKnown.value)
    return text(
      '未知，在暖暖档案模块的衣橱中导入个人数据才能查看部件拥有情况。',
      'Unknown. Import your personal data in Nikki Archives → Wardrobe to view piece ownership.'
    )
  const { owned, total, complete: isComplete } = detailProgress.value
  if (!total) return text('暂无部件资料', 'Piece information is not available yet')
  if (isComplete) return text('所有部件均已拥有', 'All pieces owned')
  if (owned)
    return text('还差 ' + (total - owned) + ' 件集齐', total - owned + ' pieces to complete')
  return text('当前记录中尚未拥有该套装部件', 'No owned pieces in the current records')
})
// 本地图鉴先展示；描述独立加载，切换形态、语言及关闭时立即废弃旧请求。
watch(
  [dialogOpen, () => detail.value?.id, () => props.language],
  async ([open, id, language]) => {
    detailDescription.value = ''
    detailDescriptionLoading.value = !!open && !!id
    if (!open || !id) {
      detailRequest.invalidate()
      return
    }
    const request = detailRequest.begin()
    try {
      const entity = await loadOutfitText(id, language, request.signal)
      if (request.isCurrent())
        detailDescription.value =
          typeof entity.description === 'string' ? entity.description.trim() : ''
    } catch {
      // 描述为辅助信息：失败不阻塞部件展示，也不把失败当作空结果永久缓存。
      if (request.isCurrent()) detailDescription.value = ''
    } finally {
      if (request.isCurrent()) detailDescriptionLoading.value = false
    }
  },
  { flush: 'sync', immediate: true }
)

function closeDialog() {
  emit('close')
}
useBodyScrollLock(dialogOpen)
useModalFocus(dialogOpen, panel, closeDialog)
</script>
<template>
  <Teleport to="body">
    <Transition name="confirm-dialog" appear>
      <div
        v-if="dialogOpen && detail"
        class="dialog-overlay wardrobe-detail-overlay"
        :style="{ zIndex: layer ?? 221 }"
        @click.self="closeDialog"
      >
        <section
          ref="panel"
          class="dialog-panel wardrobe-dialog"
          :class="{ 'has-form-navigation': hasForms }"
          tabindex="-1"
          role="dialog"
          aria-modal="true"
          aria-labelledby="wardrobe-dialog-title"
        >
          <header class="wardrobe-detail-header">
            <div class="wardrobe-detail-heading">
              <h2 id="wardrobe-dialog-title">{{ name(detail) }}</h2>
              <div class="wardrobe-detail-meta">
                <span class="wardrobe-detail-variant">{{ variants[detail.variant] }}</span>
                <span v-if="detailSource" class="wardrobe-detail-source">{{ detailSource }}</span>
              </div>
            </div>
            <button type="button" :aria-label="text('关闭', 'Close')" @click="closeDialog">
              <X :size="20" />
            </button>
          </header>
          <div class="wardrobe-detail-scroll">
            <WardrobeFormNav
              ownership-icons
              v-if="hasForms"
              :entry="detail"
              :catalog="catalog"
              :snapshot="snapshot"
              :language="language"
              @select="emit('openOutfit', $event)"
            />
            <div class="wardrobe-dialog-body">
              <div class="wardrobe-overview has-description">
                <section
                  class="wardrobe-suit-summary"
                  :aria-label="text('套装总览', 'Outfit overview')"
                >
                  <div class="wardrobe-suit-preview">
                    <CatalogImage
                      :language="language"
                      :key="detail.id"
                      referrerpolicy="no-referrer"
                      :src="detail.image"
                      loading="eager"
                      fetchpriority="high"
                      :alt="name(detail)"
                    />
                  </div>
                  <div class="wardrobe-suit-copy">
                    <button
                      v-if="makeupIds.length"
                      type="button"
                      class="wardrobe-makeup-link"
                      :disabled="makeupLoading"
                      @click="openMakeup"
                    >
                      {{
                        makeupLoading
                          ? text('正在加载妆容…', 'Loading makeup…')
                          : makeupFailed
                            ? text('加载失败，点击重试', 'Load failed. Retry')
                            : text('查看对应妆容', 'View matching makeup')
                      }}
                      <ChevronRight :size="18" aria-hidden="true" />
                    </button>
                    <h3 v-else>{{ name(detail) }}</h3>
                    <p
                      class="wardrobe-suit-message"
                      :class="{ 'is-complete': detailProgress.complete }"
                    >
                      <CircleHelp v-if="!ownershipKnown" :size="17" aria-hidden="true" />
                      <CircleCheck
                        v-else-if="detailProgress.complete"
                        :size="17"
                        aria-hidden="true"
                      />
                      <CircleMinus v-else :size="17" aria-hidden="true" />
                      <span>{{ detailSummary }}</span>
                    </p>
                    <div
                      v-if="ownershipKnown && detailProgress.total"
                      class="wardrobe-suit-progress"
                    >
                      <span
                        >{{
                          detailProgress.complete
                            ? text('已集齐', 'Complete')
                            : text('已拥有', 'Owned')
                        }}
                        <strong>{{ detailProgress.owned }}/{{ detailProgress.total }}</strong>
                      </span>
                      <progress
                        :value="detailProgress.owned"
                        :max="detailProgress.total"
                        :aria-label="text('收集进度', 'Collection progress')"
                      ></progress>
                    </div>
                  </div>
                </section>
                <dl class="wardrobe-suit-facts">
                  <div>
                    <dt><Star :size="17" aria-hidden="true" />{{ text('星级', 'Rarity') }}</dt>
                    <dd
                      ><span class="wardrobe-rarity-tag">{{ detail.quality }} ★</span></dd
                    >
                  </div>
                  <div v-if="detailStyle">
                    <dt><Flower2 :size="17" aria-hidden="true" />{{ text('风格', 'Style') }}</dt>
                    <dd
                      ><span class="wardrobe-style-tag">{{ detailStyle }}</span></dd
                    >
                  </div>
                  <div v-if="detailSourceVersion">
                    <dt
                      ><CalendarDays :size="17" aria-hidden="true" />{{
                        text('来源版本', 'Release version')
                      }}</dt
                    >
                    <dd
                      ><span class="wardrobe-version-tag">{{ detailSourceVersion }}</span></dd
                    >
                  </div>
                </dl>
                <div
                  class="wardrobe-suit-description"
                  :aria-label="text('套装描述', 'Outfit description')"
                  :aria-busy="detailDescriptionLoading"
                >
                  <Quote :size="20" aria-hidden="true" />
                  <p v-if="detailDescription">{{ detailDescription }}</p>
                  <p v-else class="wardrobe-description-placeholder">{{
                    detailDescriptionLoading
                      ? text('正在加载套装描述…', 'Loading outfit description…')
                      : text('暂无套装描述', 'No outfit description available')
                  }}</p>
                  <Sparkles :size="17" aria-hidden="true" />
                </div>
              </div>
              <div
                v-if="detailParts.length"
                class="wardrobe-detail-parts"
                role="list"
                :aria-label="text('套装部件', 'Outfit pieces')"
              >
                <div
                  v-for="part in detailParts"
                  :key="part.id"
                  class="wardrobe-part"
                  :class="{ 'is-owned': part.owned }"
                  role="listitem"
                >
                  <button
                    type="button"
                    class="wardrobe-part-open"
                    :disabled="!part.entry"
                    :aria-label="part.entry ? name(part.entry) : part.id"
                    @click="itemPreview = part.entry ?? null"
                  >
                    <div class="wardrobe-part-image">
                      <CatalogImage
                        :language="language"
                        v-if="part.entry"
                        referrerpolicy="no-referrer"
                        :src="part.entry.image"
                        alt=""
                        loading="lazy"
                      />
                      <div v-else class="wardrobe-image-fallback">
                        <Shirt :size="28" /><span>{{ text('暂无图片', 'No image') }}</span>
                      </div>
                    </div>
                    <span
                      class="wardrobe-part-name"
                      :title="part.entry ? name(part.entry) : part.id"
                      >{{ part.entry ? name(part.entry) : part.id }}</span
                    >
                    <small class="wardrobe-part-state">
                      <CircleHelp
                        v-if="!ownershipKnown || part.unknown"
                        :size="14"
                        aria-hidden="true"
                      />
                      <CircleCheck v-else-if="part.owned" :size="14" aria-hidden="true" />
                      <CircleMinus v-else :size="14" aria-hidden="true" />
                      {{
                        !ownershipKnown || part.unknown
                          ? unknownLabel
                          : part.owned
                            ? text('已拥有', 'Owned')
                            : text('未拥有', 'Not owned')
                      }}
                    </small>
                  </button>
                </div>
              </div>
              <p v-else class="wardrobe-parts-empty">{{
                text('暂无部件资料', 'Piece information is not available yet')
              }}</p>
            </div>
          </div>
        </section>
      </div>
    </Transition>
  </Teleport>
  <WardrobeItemDialog
    :item="itemPreview"
    :catalog="catalog"
    :snapshot="snapshot"
    @select-form="itemPreview = $event"
    :outfits="itemOutfits"
    :language="language"
    :layer="(layer ?? 221) + 1"
    @close="itemPreview = null"
    @open-outfit="openAssociatedOutfit"
  />
</template>
<style scoped src="../styles/wardrobe-detail-tokens.css"></style>
<style scoped>
/* 形态导航的左右分栏仅用于电脑端，手机端由 mobile.css 提供单列滚动布局。 */
@media (min-width: 900px) {
  .wardrobe-dialog.has-form-navigation {
    --dialog-width: min(1150px, 100%);
    display: grid;
    grid-template-columns: 150px minmax(0, 1fr);
    grid-template-rows: auto minmax(0, 1fr);
  }
  .has-form-navigation > .wardrobe-detail-header {
    grid-column: 1 / -1;
    grid-row: 1;
  }
  .has-form-navigation > .wardrobe-detail-scroll > .wardrobe-dialog-body {
    grid-column: 2;
    grid-row: 2;
    min-width: 0;
    border-left: 1px solid var(--line-soft);
  }
}

.wardrobe-part-open {
  display: block;
  width: 100%;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: inherit;
  cursor: pointer;
}
.wardrobe-part-open:disabled {
  cursor: default;
}
.wardrobe-part-open:focus-visible {
  outline: 2px solid var(--pink-deep);
  outline-offset: 3px;
  border-radius: 8px;
}
.wardrobe-part {
  box-shadow: var(--photo-shadow);
  transition:
    border-color var(--motion-fast) ease,
    box-shadow var(--motion-fast) ease;
}
.wardrobe-part:has(.wardrobe-part-open:hover:not(:disabled)),
.wardrobe-part:has(.wardrobe-part-open:focus-visible) {
  border-color: var(--interactive-hover-border);
  box-shadow: var(--photo-hover-shadow);
}

.wardrobe-image-fallback {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--muted);
}

.wardrobe-image-fallback {
  height: 100%;
  font-size: 12px;
}
.wardrobe-dialog {
  --dialog-width: min(1000px, 100%);
  --dialog-max-height: calc(100dvh - 40px);
  --notice-success: #5d9873;
  --wardrobe-success-bg: #e9f1e2;
  --wardrobe-success-border: #a9c59a;
  --wardrobe-gold: color-mix(in srgb, var(--notice-warning) 75%, var(--heading));
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: linear-gradient(145deg, var(--surface-strong), var(--white));
}
@supports not (color: color-mix(in srgb, black, white)) {
  .wardrobe-dialog {
    --wardrobe-gold: rgba(166, 127.5, 67.75, 1);
  }
  :where(:root[data-theme='dark']) .wardrobe-dialog {
    --wardrobe-gold: rgba(233.25, 203.75, 146.5, 1);
  }
}
:root[data-theme='dark'] .wardrobe-dialog {
  --notice-success: #85c99d;
  --wardrobe-success-bg: #243d2b;
  --wardrobe-success-border: #628d6a;
}
.wardrobe-detail-overlay {
  z-index: 221;
}
.wardrobe-dialog > .wardrobe-detail-header {
  flex-shrink: 0;
  gap: 18px;
  padding: 15px 26px;
  background: radial-gradient(
    ellipse at top right,
    color-mix(in srgb, var(--pink-deep) 8%, transparent),
    transparent 48%
  );
}
@supports not (color: color-mix(in srgb, black, white)) {
  .wardrobe-dialog > .wardrobe-detail-header {
    background: radial-gradient(ellipse at top right, rgba(201, 132, 134, 0.08), transparent 48%);
  }
  :where(:root[data-theme='dark']) .wardrobe-dialog > .wardrobe-detail-header {
    background: radial-gradient(ellipse at top right, rgba(239, 176, 178, 0.08), transparent 48%);
  }
}
.wardrobe-detail-heading {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  min-width: 0;
  gap: 10px 22px;
}
.wardrobe-detail-header h2 {
  min-width: 0;
  color: var(--heading);
  font-size: 24px;
  font-weight: 700;
  font-family: 'Songti SC', 'SimSun', serif;
  overflow-wrap: anywhere;
}
.wardrobe-detail-header > button {
  flex-shrink: 0;
  align-self: flex-start;
}
.wardrobe-dialog-body {
  min-height: 0;
  overflow: auto;
  overscroll-behavior: contain;
  padding: 12px 20px 18px;
  display: grid;
  gap: 18px;
  line-height: 1.65;
  background:
    radial-gradient(
      ellipse at bottom right,
      color-mix(in srgb, var(--pink-deep) 10%, transparent) 0%,
      transparent 80%
    ),
    linear-gradient(180deg, var(--surface-strong) 0%, var(--white) 100%);
}
@supports not (color: color-mix(in srgb, black, white)) {
  .wardrobe-dialog-body {
    background:
      radial-gradient(ellipse at bottom right, rgba(201, 132, 134, 0.12) 0%, transparent 58%),
      linear-gradient(180deg, var(--surface-strong) 0%, var(--white) 100%);
  }
  :where(:root[data-theme='dark']) .wardrobe-dialog-body {
    background:
      radial-gradient(ellipse at bottom right, rgba(239, 176, 178, 0.12) 0%, transparent 58%),
      linear-gradient(180deg, var(--surface-strong) 0%, var(--white) 100%);
  }
}
.wardrobe-overview {
  display: grid;
  grid-template-columns: minmax(0, 1.8fr) minmax(0, 1fr);
  gap: 22px;
  align-items: center;
}
.wardrobe-overview.has-description {
  grid-template-columns: minmax(0, 1.85fr) minmax(160px, 0.85fr) minmax(0, 1.4fr);
}
.wardrobe-suit-summary {
  display: grid;
  grid-template-columns: minmax(96px, 38%) minmax(0, 1fr);
  align-self: stretch;
  min-height: 152px;
  border: 1px solid color-mix(in srgb, var(--pink-deep) 18%, var(--line-soft));
  border-radius: var(--radius-md);
  overflow: hidden;
  /* 整张摘要卡共用一张背景图，人物和说明都叠放在同一背景上。 */
  background: url('../../img/longBg.jpg') center / 100% 100% no-repeat;
}
@supports not (color: color-mix(in srgb, black, white)) {
  .wardrobe-suit-summary {
    border: 1px solid rgba(227.2897, 204.4957, 200.9191, 0.8852);
    border-radius: var(--radius-md);
  }
  :where(:root[data-theme='dark']) .wardrobe-suit-summary {
    border: 1px solid rgba(101.1785, 84.3845, 89.5712, 0.8852);
    border-radius: var(--radius-md);
  }
}
:root[data-theme='dark'] .wardrobe-suit-summary {
  background-image: url('../../img/longBgdark.jpg');
}
.wardrobe-suit-preview {
  position: relative;
  min-width: 0;
  min-height: 152px;
  overflow: hidden;
}
.wardrobe-suit-preview img {
  position: absolute;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center 18%;
  /* 仅让人物图片右缘渐隐，透出贯穿整个摘要卡的 longBg 背景。 */
  -webkit-mask-image: linear-gradient(to right, #000 0%, #000 68%, transparent 100%);
  mask-image: linear-gradient(to right, #000 0%, #000 68%, transparent 100%);
}
.wardrobe-suit-copy {
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-width: 0;
  gap: 10px;
  padding: 18px 16px 18px 10px;
  overflow: hidden;
}
.wardrobe-makeup-link {
  display: inline-flex;
  align-items: center;
  justify-content: flex-start;
  gap: 8px;
  align-self: flex-start;
  max-width: 100%;
  padding: 9px 4px;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--pink-deep);
  font: inherit;
  font-size: 16px;
  font-weight: 600;
  text-align: left;
  text-decoration: underline;
  text-decoration-color: currentColor;
  text-decoration-color: color-mix(in srgb, currentColor 50%, transparent);
  text-underline-offset: 4px;
  cursor: pointer;
  transition:
    color var(--motion-fast) ease,
    transform var(--motion-fast) ease;
}
.wardrobe-makeup-link > svg {
  flex-shrink: 0;
  transition: transform var(--motion-fast) ease;
}
.wardrobe-makeup-link:hover:not(:disabled) {
  color: var(--menu-hover-text);
}
:global(:root[data-theme='dark'] .wardrobe-makeup-link:hover:not(:disabled)) {
  color: var(--heading);
}
.wardrobe-makeup-link:hover:not(:disabled) > svg {
  transform: translateX(2px);
}
.wardrobe-makeup-link:active:not(:disabled) {
  transform: scale(0.97);
}
.wardrobe-makeup-link:focus-visible {
  outline: 2px solid var(--pink-deep);
  outline-offset: 2px;
}
.wardrobe-makeup-link:disabled {
  cursor: wait;
}
.wardrobe-suit-copy h3 {
  color: var(--heading);
  font-size: 18px;
  font-family: 'Songti SC', 'SimSun', serif;
  line-height: 1.45;
  overflow-wrap: anywhere;
}
.wardrobe-suit-message {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  font-size: 12px;
}
.wardrobe-suit-message svg {
  flex-shrink: 0;
  margin-top: 2px;
}
.wardrobe-suit-message.is-complete {
  color: var(--wardrobe-success-text);
}
.wardrobe-suit-progress {
  display: grid;
  gap: 5px;
  font-size: 13px;
}
.wardrobe-suit-progress strong {
  font-weight: 500;
  font-variant-numeric: tabular-nums;
}
.wardrobe-suit-progress progress {
  display: block;
  width: 100%;
  height: 6px;
  border: 0;
  border-radius: 999px;
  overflow: hidden;
  appearance: none;
  -webkit-appearance: none;
  accent-color: var(--notice-success);
  background: var(--line-soft);
}
.wardrobe-suit-progress progress::-webkit-progress-bar {
  border-radius: 999px;
  background: var(--line-soft);
}
.wardrobe-suit-progress progress::-webkit-progress-value {
  border-radius: 999px;
  background: var(--notice-success);
}
.wardrobe-suit-progress progress::-moz-progress-bar {
  border-radius: 999px;
  background: var(--notice-success);
}
.wardrobe-suit-description {
  min-width: 0;
  padding-left: 18px;
  border-left: 1px solid var(--line-soft);
  font-size: 12px;
  line-height: 1.9;
}
.wardrobe-suit-description > svg {
  display: block;
  color: var(--wardrobe-gold);
  opacity: 0.65;
}
.wardrobe-suit-description > svg:last-child {
  margin-left: auto;
}
.wardrobe-suit-description p {
  margin: 5px 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.wardrobe-description-placeholder {
  color: var(--muted);
}
.wardrobe-detail-parts {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 12px;
}
.wardrobe-part {
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 0;
  padding: 10px;
  border: 1px solid var(--frame-bg);
  border-radius: var(--radius-md);
  color: var(--text);
  background: linear-gradient(160deg, var(--white), var(--surface-strong));
}
.wardrobe-part.is-owned {
  border-color: var(--wardrobe-success-border);
}
.wardrobe-part-image {
  position: relative;
  display: grid;
  place-items: center;
  width: 100%;
  aspect-ratio: 1;
  max-height: 140px;
  min-height: 0;
  background: radial-gradient(
    ellipse at center,
    color-mix(in srgb, var(--notice-warning) 6%, transparent),
    transparent 70%
  );
}
@supports not (color: color-mix(in srgb, black, white)) {
  .wardrobe-part-image {
    background: radial-gradient(ellipse at center, rgba(196, 148, 69, 0.06), transparent 70%);
  }
  :where(:root[data-theme='dark']) .wardrobe-part-image {
    background: radial-gradient(ellipse at center, rgba(226, 189, 114, 0.06), transparent 70%);
  }
}
/* 两条弧线均由正圆裁出上半部：直径始终相等，底部逐渐淡出。 */
.wardrobe-part-image::before,
.wardrobe-part-image::after {
  position: absolute;
  left: 50%;
  width: auto;
  max-width: calc(100% - 14px);
  aspect-ratio: 1;
  transform: translateX(-50%);
  border: 1px solid;
  border-radius: 50%;
  pointer-events: none;
  content: '';
  -webkit-mask-image: linear-gradient(to bottom, #000 0%, #000 30%, transparent 65%);
  mask-image: linear-gradient(to bottom, #000 0%, #000 30%, transparent 65%);
}
.wardrobe-part-image::before {
  top: 3px;
  height: calc(100% - 6px);
  border-color: color-mix(in srgb, var(--notice-warning) 23%, transparent);
}
@supports not (color: color-mix(in srgb, black, white)) {
  .wardrobe-part-image::before {
    border-color: rgba(196, 148, 69, 0.23);
  }
  :where(:root[data-theme='dark']) .wardrobe-part-image::before {
    border-color: rgba(226, 189, 114, 0.23);
  }
}
.wardrobe-part-image::after {
  top: 12px;
  height: calc(100% - 24px);
  border-color: color-mix(in srgb, var(--notice-warning) 13%, transparent);
}
@supports not (color: color-mix(in srgb, black, white)) {
  .wardrobe-part-image::after {
    border-color: rgba(196, 148, 69, 0.13);
  }
  :where(:root[data-theme='dark']) .wardrobe-part-image::after {
    border-color: rgba(226, 189, 114, 0.13);
  }
}
.wardrobe-part-image img {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 0;
  padding: 6px;
  object-fit: contain;
  transform: translateY(-5px);
}
.wardrobe-part-name {
  display: -webkit-box;
  min-height: 28px;
  margin-top: -10px;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  text-align: center;
  overflow-wrap: anywhere;
  font-size: 14px;
  line-height: 20px;
  color: var(--heading);
}
.wardrobe-part-state {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  margin-top: auto;
  min-height: 25px;
  padding: 3px 6px;
  border-radius: 8px;
  background: var(--frame-bg);
  font-size: 12px;
  line-height: 1.4;
}
.wardrobe-part-state svg {
  flex-shrink: 0;
}
.wardrobe-part.is-owned .wardrobe-part-state {
  color: var(--wardrobe-success-text);
  background: var(--wardrobe-success-bg);
}
.wardrobe-parts-empty {
  padding: 28px 16px;
  text-align: center;
}
@media (max-width: 900px) {
  .wardrobe-overview.has-description {
    grid-template-columns: minmax(0, 1.5fr) minmax(0, 1fr);
  }
  .wardrobe-suit-description {
    grid-column: 1 / -1;
  }
  .wardrobe-detail-parts {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}
@media (max-width: 640px) {
  .wardrobe-detail-overlay {
    padding: 12px;
  }
  .wardrobe-dialog {
    --dialog-max-height: calc(100dvh - 24px);
    border-radius: 24px;
  }
  .wardrobe-dialog > .wardrobe-detail-header {
    padding: 14px;
    gap: 10px;
  }
  .wardrobe-detail-heading {
    gap: 8px 10px;
  }
  .wardrobe-detail-header h2 {
    font-size: 16px;
  }
  .wardrobe-detail-header > button {
    width: 30px;
    height: 30px;
  }
  .wardrobe-overview,
  .wardrobe-overview.has-description {
    grid-template-columns: minmax(0, 1fr);
    gap: 14px;
  }
  .wardrobe-suit-facts {
    padding-left: 0;
    border-left: 0;
  }
  .wardrobe-suit-facts > div {
    padding: 6px 0;
  }
  .wardrobe-suit-preview,
  .wardrobe-suit-summary {
    min-height: 140px;
  }
  .wardrobe-makeup-link {
    font-size: 14px;
  }
  .wardrobe-suit-copy h3 {
    font-size: 16px;
  }
  .wardrobe-suit-message {
    font-size: 11px;
  }
  .wardrobe-detail-parts {
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 10px;
  }
  .wardrobe-part-name {
    font-size: 12px;
    line-height: 17px;
    min-height: 24px;
  }
}
@media (max-width: 520px) {
  .wardrobe-detail-parts {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
  .wardrobe-part {
    padding: 8px;
  }
}

@media (max-width: 360px) {
  .wardrobe-detail-parts {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .wardrobe-part-name {
    font-size: 13px;
    line-height: 18px;
    min-height: 26px;
  }
}

@media (max-width: 899px) {
  .wardrobe-dialog-body {
    padding: 16px;
  }
}
</style>
