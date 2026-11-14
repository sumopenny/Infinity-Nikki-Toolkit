<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { CalendarDays, ChevronRight, Layers, Shirt, Star, X } from 'lucide-vue-next'
import CatalogImage from './CatalogImage.vue'
import { useModalFocus } from '../composables/useModalFocus'
import { useLatestRequest } from '../composables/useLatestRequest'
import { useBodyScrollLock } from '../utils/bodyScrollLock'
import { getCatalogImageSource } from '../utils/gongeo/catalogImage'
import { wardrobeVariantLabels } from '../utils/wardrobe/wardrobePresentation'
import { makeupSourceLabel } from '../utils/makeupCatalog'
import {
  loadWardrobeCatalog,
  type WardrobeCatalog,
  type WardrobeEntry
} from '../utils/wardrobe/wardrobeCatalog'
import { readWardrobeSnapshot, emptyWardrobe } from '../utils/wardrobe/wardrobeStorage'
import type { MakeupEntry, MakeupRelations, MakeupRelatedOutfit } from '../utils/makeupCatalog'
import type { Language } from '../i18n/types'

const props = defineProps<{
  detail: MakeupEntry | null
  entries: MakeupEntry[]
  parts: MakeupEntry[]
  relations: Map<string, MakeupRelations>
  outfits: MakeupRelatedOutfit[]
  language: Language
  layer?: number
}>()
const emit = defineEmits<{
  openOutfit: [
    entry: WardrobeEntry,
    catalog: WardrobeCatalog,
    snapshot: ReturnType<typeof emptyWardrobe>
  ]
  close: []
  selectForm: [entry: MakeupEntry]
  selectEntry: [entry: MakeupEntry]
}>()
const text = (zh: string, en: string) => (props.language === 'zh' ? zh : en)
const panel = ref<HTMLElement | null>(null)
const previewElement = ref<HTMLElement | null>(null)
const copyElement = ref<HTMLElement | null>(null)
const formCardWidth = ref(135)
// Derive the rail width from half the content height, preserving the image ratio.
watch(
  [previewElement, copyElement],
  ([preview, copy], _, onCleanup) => {
    if (!preview || !copy || typeof ResizeObserver === 'undefined') return
    let frame = 0
    const update = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const height = Math.max(preview.offsetHeight, copy.offsetHeight)
        const width = (Math.max(0, (height - 14) / 2) * 520) / 724
        if (Math.abs(formCardWidth.value - width) > 0.5) formCardWidth.value = width
      })
    }
    const observer = new ResizeObserver(update)
    observer.observe(preview)
    observer.observe(copy)
    update()
    onCleanup(() => {
      observer.disconnect()
      cancelAnimationFrame(frame)
    })
  },
  { flush: 'post' }
)
const open = computed(() => !!props.detail)
const isPart = computed(() => (props.detail?.category ?? 0) !== 0)
const relation = computed(() => (props.detail ? props.relations.get(props.detail.id) : undefined))
const linkedMakeups = computed(() => {
  const id = props.detail?.id
  if (!isPart.value || !id) return []
  return props.entries.filter((entry) => props.relations.get(entry.id)?.partIds.includes(id))
})
const forms = computed(() => {
  const ids = new Set(relation.value?.formIds ?? [])
  return (isPart.value ? props.parts : props.entries)
    .filter((entry) => ids.has(entry.id) && entry.variant !== null)
    .sort((a, b) => a.variant! - b.variant!)
})
const partLabels = computed(() =>
  props.language === 'zh'
    ? ['全妆', '底妆', '眉妆', '睫毛', '美瞳', '唇妆']
    : ['Full makeup', 'Base makeup', 'Eyebrows', 'Eyelashes', 'Contact lenses', 'Lips']
)
const detailParts = computed(() => {
  const byId = new Map(props.parts.map((part) => [part.id, part]))
  const parent =
    linkedMakeups.value.find((entry) => entry.variant === props.detail?.variant) ??
    linkedMakeups.value[0]
  const ids = isPart.value
    ? parent
      ? (props.relations.get(parent.id)?.partIds ?? [])
      : []
    : (relation.value?.partIds ?? [])
  return [...new Set(ids)]
    .filter((id) => id !== props.detail?.id)
    .map((id) => ({ id, entry: byId.get(id) }))
    .sort((a, b) => (a.entry?.category ?? 99) - (b.entry?.category ?? 99))
})
const source = computed(() => makeupSourceLabel(props.detail, props.language))
const linkedOutfits = computed(() => {
  const ids = new Set(
    isPart.value
      ? linkedMakeups.value.flatMap((entry) => props.relations.get(entry.id)?.outfitIds ?? [])
      : (relation.value?.outfitIds ?? [])
  )
  const families = new Map<string, MakeupRelatedOutfit>()
  for (const outfit of props.outfits) {
    if (!ids.has(outfit.id)) continue
    const root = outfit.id.length === 7 ? outfit.id.slice(0, -2) : outfit.id
    const current = families.get(root)
    if (!current || outfit.variant < current.variant) families.set(root, outfit)
  }
  return [...families.values()]
})
const loadingOutfitId = ref('')
const outfitError = ref(false)
const requestState = useLatestRequest()
watch(
  () => props.detail?.id,
  () => {
    requestState.invalidate()
    loadingOutfitId.value = ''
    outfitError.value = false
  }
)
onBeforeUnmount(() => requestState.invalidate())
async function openOutfit(id: string) {
  const request = requestState.begin()
  loadingOutfitId.value = id
  outfitError.value = false
  try {
    const [catalog, stored] = await Promise.all([
      loadWardrobeCatalog(),
      readWardrobeSnapshot().catch(() => emptyWardrobe())
    ])
    if (!request.isCurrent()) return
    const entry = catalog.byId.get(id)
    if (!entry || entry.kind !== 'outfit') throw new Error('OUTFIT_NOT_FOUND')
    emit('openOutfit', entry, catalog, stored)
  } catch {
    if (request.isCurrent()) outfitError.value = true
  } finally {
    if (request.isCurrent()) loadingOutfitId.value = ''
  }
}
function close() {
  emit('close')
}
useBodyScrollLock(open)
useModalFocus(open, panel, close)
</script>

<template>
  <Teleport to="body">
    <Transition name="confirm-dialog" appear>
      <div
        v-if="detail"
        class="dialog-overlay makeup-detail-overlay"
        :style="{ zIndex: layer ?? 220 }"
        @click.self="close"
      >
        <section
          ref="panel"
          class="dialog-panel makeup-detail-dialog"
          :style="{ '--form-card-width': `${formCardWidth}px` }"
          :class="{ 'has-forms': forms.length > 1 }"
          tabindex="-1"
          role="dialog"
          aria-modal="true"
          aria-labelledby="makeup-detail-title"
        >
          <header class="makeup-detail-header">
            <div class="wardrobe-detail-meta makeup-detail-heading">
              <h2 id="makeup-detail-title">{{ detail.name[language] }}</h2>
              <span class="wardrobe-detail-variant">{{
                isPart
                  ? partLabels[detail.category]
                  : detail.variant === null
                    ? text('全妆', 'Full makeup')
                    : wardrobeVariantLabels[language][detail.variant]
              }}</span>
              <span v-if="source" class="wardrobe-detail-source" :title="source">{{ source }}</span>
            </div>
            <button type="button" :aria-label="text('关闭', 'Close')" @click="close"
              ><X :size="20"
            /></button>
          </header>
          <div class="makeup-detail-scroll">
            <div class="makeup-detail-layout" :class="{ 'has-forms': forms.length > 1 }">
              <nav
                v-if="forms.length > 1"
                class="makeup-detail-forms"
                :aria-label="text('妆容形态', 'Makeup forms')"
              >
                <div
                  v-for="form in forms"
                  :key="form.id"
                  class="makeup-form-stage"
                  :class="{
                    active: form.id === detail.id,
                    'is-past': form.variant! < detail.variant!
                  }"
                >
                  <button
                    type="button"
                    :aria-pressed="form.id === detail.id"
                    :aria-label="wardrobeVariantLabels[language][form.variant!]"
                    @click="emit('selectForm', form)"
                  >
                    <CatalogImage
                      :src="form.image"
                      :language="language"
                      alt=""
                      width="520"
                      height="724"
                    />
                    <span>{{ wardrobeVariantLabels[language][form.variant!] }}</span>
                  </button>
                </div>
              </nav>
              <div ref="previewElement" class="makeup-detail-preview">
                <CatalogImage
                  :key="detail.id"
                  :src="detail.image"
                  :language="language"
                  :alt="detail.name[language]"
                  width="520"
                  height="724"
                  loading="eager"
                  fetchpriority="high"
                />
              </div>
              <div ref="copyElement" class="makeup-detail-copy">
                <dl class="wardrobe-suit-facts makeup-detail-facts">
                  <div>
                    <dt><Star :size="17" aria-hidden="true" />{{ text('星级', 'Rarity') }}</dt>
                    <dd
                      ><span class="wardrobe-rarity-tag">{{
                        detail.quality === undefined
                          ? text('未知', 'Unknown')
                          : detail.quality + ' ★'
                      }}</span></dd
                    >
                  </div>
                  <div>
                    <dt
                      ><CalendarDays :size="17" aria-hidden="true" />{{
                        text('所属版本', 'Release version')
                      }}</dt
                    >
                    <dd
                      ><span class="wardrobe-version-tag">{{
                        detail.version ?? text('未知', 'Unknown')
                      }}</span></dd
                    >
                  </div>
                </dl>
                <section v-if="!isPart || detailParts.length" class="makeup-detail-section">
                  <h4
                    ><Layers :size="17" aria-hidden="true" />{{
                      isPart ? text('其他部件', 'Other pieces') : text('组成部件', 'Makeup pieces')
                    }}
                    <span>({{ detailParts.length }})</span></h4
                  >
                  <div
                    v-if="detailParts.length"
                    class="makeup-detail-parts"
                    :class="{ 'is-related-pieces': isPart }"
                  >
                    <button
                      v-for="part in detailParts"
                      :key="part.id"
                      type="button"
                      class="makeup-detail-piece"
                      :title="part.entry?.name[language] ?? part.id"
                      :disabled="!part.entry"
                      :aria-label="
                        text('查看部件详情：', 'View piece details: ') +
                        (part.entry?.name[language] ?? part.id)
                      "
                      @click="part.entry && emit('selectEntry', part.entry)"
                    >
                      <CatalogImage
                        :src="getCatalogImageSource('icon', part.id)"
                        :language="language"
                        :alt="part.entry?.name[language] ?? part.id"
                        width="100"
                        height="100"
                      />
                      <span>{{
                        part.entry ? partLabels[part.entry.category] : text('部件', 'Piece')
                      }}</span>
                      <small>{{ part.entry?.name[language] ?? part.id }}</small>
                    </button>
                  </div>
                  <p v-else class="makeup-detail-empty">{{
                    text('暂无部件资料', 'No piece information available')
                  }}</p>
                </section>
                <div
                  v-if="linkedMakeups.length || linkedOutfits.length"
                  class="makeup-related-grid"
                  :class="{ 'is-piece-detail': isPart }"
                >
                  <section
                    v-if="linkedMakeups.length"
                    class="makeup-detail-section makeup-related-makeups"
                  >
                    <h4
                      ><Layers :size="17" aria-hidden="true" />{{
                        text('相关全妆', 'Related makeup')
                      }}</h4
                    >
                    <button
                      v-for="makeup in linkedMakeups"
                      :key="makeup.id"
                      type="button"
                      class="makeup-related-outfit"
                      @click="emit('selectEntry', makeup)"
                    >
                      <CatalogImage
                        :src="makeup.image"
                        :language="language"
                        alt=""
                        width="520"
                        height="724"
                      />
                      <span>
                        <strong>{{ makeup.name[language] }}</strong>
                        <small>{{ text('查看全妆详情', 'View makeup details') }}</small>
                      </span>
                      <ChevronRight :size="18" aria-hidden="true" />
                    </button>
                  </section>
                  <section
                    v-if="linkedOutfits.length"
                    class="makeup-detail-section makeup-related-section"
                  >
                    <h4
                      ><Shirt :size="17" aria-hidden="true" />{{
                        text('相关套装', 'Related outfits')
                      }}</h4
                    >
                    <button
                      v-for="outfit in linkedOutfits"
                      :key="outfit.id"
                      type="button"
                      class="makeup-related-outfit"
                      :disabled="!!loadingOutfitId"
                      @click="openOutfit(outfit.id)"
                    >
                      <CatalogImage
                        :src="outfit.image"
                        :language="language"
                        alt=""
                        width="64"
                        height="80"
                      />
                      <span
                        ><strong>{{ outfit.name[language] }}</strong>
                        <small>{{
                          loadingOutfitId === outfit.id
                            ? text('正在加载…', 'Loading…')
                            : text('查看套装详情', 'View outfit details')
                        }}</small>
                      </span>
                      <ChevronRight :size="18" aria-hidden="true" />
                    </button>
                    <p v-if="outfitError" role="alert" class="makeup-detail-empty">{{
                      text('套装加载失败，请点击重试。', 'Could not load outfit. Click to retry.')
                    }}</p>
                  </section>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped src="../styles/wardrobe-detail-tokens.css"></style>
<style scoped>
.makeup-detail-overlay {
  z-index: 220;
  --photo-hover-shadow: 0 1px 5px rgba(201, 132, 134, 0.202);
}
:where(:root[data-theme='dark']) .makeup-detail-overlay {
  --photo-hover-shadow: 0 2px 8px rgba(185, 126, 126, 0.524);
}
.makeup-detail-dialog {
  --dialog-width: min(864px, 100%);
  box-sizing: border-box;
  --dialog-max-height: calc(100dvh - 40px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: linear-gradient(145deg, var(--surface-strong), var(--white));
}
.makeup-detail-dialog.has-forms {
  --dialog-width: min(calc(933px + var(--form-card-width)), 100%);
}
.makeup-detail-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 22px;
  border-bottom: 1px solid var(--line-soft);
  flex-shrink: 0;
}
.makeup-detail-heading {
  flex: 1;
}
.makeup-detail-header > button {
  flex-shrink: 0;
}
.makeup-detail-header h2 {
  min-width: 0;
  margin: 0;
  color: var(--heading);
  font-size: 20px;
  font-family: 'Songti SC', 'SimSun', serif;
  overflow-wrap: anywhere;
}
.makeup-detail-scroll {
  min-height: 0;
  overflow: auto;
  overscroll-behavior: contain;
  padding: 20px;
}
.makeup-detail-layout {
  display: grid;
  grid-template-columns: minmax(0, 280px) minmax(0, 520px);
  align-items: start;
  gap: 22px;
}
.makeup-detail-layout:not(.has-forms) {
  grid-template-columns: minmax(0, 280px) minmax(0, 520px);
}
.makeup-detail-layout:not(.has-forms) .makeup-detail-preview {
  grid-column: 1;
}
.makeup-detail-layout:not(.has-forms) .makeup-detail-copy {
  grid-column: 2;
}
.makeup-detail-layout.has-forms {
  grid-template-columns: calc(var(--form-card-width) + 47px) minmax(0, 280px) minmax(0, 520px);
}
.makeup-detail-preview {
  grid-column: 2;
  width: 100%;
  aspect-ratio: 520 / 724;
  overflow: hidden;
  border-radius: var(--radius-md);
  background: var(--surface);
}
.makeup-detail-preview img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.makeup-detail-copy {
  grid-column: 3;
  min-width: 0;
}
.makeup-detail-facts {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-items: center;
  padding-left: 0;
  border-left: 0;
  margin-top: 0;
}
.makeup-detail-facts > div {
  justify-content: flex-start;
  flex-wrap: nowrap;
  gap: 8px;
  min-width: 0;
}
.makeup-detail-facts > div + div {
  padding-left: 20px;
  border-top: 0;
  border-left: 1px solid var(--line);
}
.makeup-detail-facts dt,
.makeup-detail-facts dd {
  white-space: nowrap;
}
@media (max-width: 700px) {
  .makeup-detail-facts > div + div {
    padding-left: 10px;
  }
  .makeup-detail-facts > div,
  .makeup-detail-facts dt {
    gap: 5px;
  }
}
.makeup-detail-section {
  border-top: 1px solid var(--line-soft);
  margin-top: 14px;
  padding-top: 14px;
}
.makeup-detail-section h4 {
  display: flex;
  align-items: center;
  gap: 7px;
  margin: 0 0 12px;
  color: var(--heading);
  font-size: 14px;
}
.makeup-detail-section h4 svg {
  color: var(--pink-deep);
}
.makeup-detail-section h4 span {
  color: var(--muted);
  font-size: 12px;
  font-weight: 400;
}
.makeup-detail-parts {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 7px;
}
.makeup-related-grid.is-piece-detail {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}
.makeup-related-grid > section {
  min-width: 0;
}
.makeup-related-grid.is-piece-detail > section:only-child {
  grid-column: 1 / -1;
}
.makeup-related-grid.is-piece-detail .makeup-related-outfit {
  gap: 8px;
}
@media (max-width: 700px) {
  .makeup-related-grid.is-piece-detail {
    gap: 10px;
  }
  .makeup-related-grid.is-piece-detail .makeup-related-outfit {
    gap: 6px;
    padding: 6px;
  }
  .makeup-related-grid.is-piece-detail .makeup-related-outfit > img {
    height: 48px;
  }
  .makeup-related-grid.is-piece-detail .makeup-related-outfit > svg {
    display: none;
  }
  .makeup-related-grid.is-piece-detail .makeup-related-outfit strong,
  .makeup-related-grid.is-piece-detail .makeup-related-outfit small {
    white-space: normal;
    overflow-wrap: anywhere;
  }
}
.makeup-detail-piece {
  min-width: 0;
  padding: 0;
  border: 0;
  border-radius: var(--radius-md);
  background: transparent;
  font: inherit;
  text-align: center;
  cursor: pointer;
}
.makeup-detail-piece:disabled {
  cursor: default;
}
.makeup-detail-piece:not(:disabled):hover img,
.makeup-detail-piece:focus-visible img {
  transform: translateY(-1px);
  border-color: var(--pink-deep);
  box-shadow: var(--photo-hover-shadow);
}
.makeup-detail-piece:focus-visible {
  outline: 2px solid var(--pink-deep);
  outline-offset: 3px;
}
.makeup-detail-piece img {
  display: block;
  width: 100%;
  height: auto;
  aspect-ratio: 1;
  object-fit: contain;
  border: 1px solid var(--line-soft);
  border-radius: var(--radius-md);
  box-sizing: border-box;
  background: var(--frame-bg);
  transition:
    border-color var(--motion-fast) ease,
    box-shadow var(--motion-fast) ease,
    transform var(--motion-fast) ease;
}
.makeup-detail-piece span,
.makeup-detail-piece small {
  display: block;
  margin-top: 5px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.makeup-detail-piece span {
  font-size: 12px;
  color: var(--text);
}
.makeup-detail-piece small {
  font-size: 10px;
  color: var(--muted);
}
.makeup-detail-empty {
  margin: 0;
  color: var(--muted);
  font-size: 12px;
}
.makeup-related-outfit {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  min-width: 0;
  padding: 8px;
  margin-top: 8px;
  border: 1px solid var(--line-soft);
  border-radius: var(--radius-md);
  background: var(--surface);
  color: var(--text);
  text-align: left;
  cursor: pointer;
  transition:
    border-color var(--motion-fast) ease,
    box-shadow var(--motion-fast) ease;
}
.makeup-related-outfit:hover:not(:disabled),
.makeup-related-outfit:focus-visible {
  border-color: var(--pink-deep);
  box-shadow: var(--photo-hover-shadow);
}
.makeup-related-outfit > img {
  flex-shrink: 0;
  width: auto;
  height: 72px;
  object-fit: contain;
  border-radius: var(--radius-sm);
  background: var(--archive-background-image, url('../../img/云绸.webp')) center / cover no-repeat;
  background-color: var(--surface);
}
:where(:root[data-theme='dark']) .makeup-related-outfit > img {
  background-image: var(--archive-background-image, url('../../img/longBgdark.jpg'));
}
.makeup-related-outfit > span {
  flex: 1;
  min-width: 0;
}
.makeup-related-outfit strong,
.makeup-related-outfit small {
  display: block;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.makeup-related-outfit strong {
  font-size: 13px;
}
.makeup-related-outfit small {
  font-size: 11px;
  margin-top: 6px;
  color: var(--muted);
}
.makeup-related-outfit > svg {
  flex-shrink: 0;
  color: var(--muted);
}
.makeup-detail-forms {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 12px 16px 24px 30px;
  min-width: 0;
  align-self: stretch;
  border-right: 1px solid var(--line);
  background: var(--surface-soft);
}
@media (min-width: 701px) {
  .makeup-detail-forms {
    margin: -20px 0 -20px -20px;
    padding-left: 50px;
    padding-top: 20px;
    padding-bottom: 20px;
    display: grid;
    grid-template-rows: repeat(2, minmax(0, 1fr));
    contain: size;
  }
  .makeup-form-stage {
    min-height: 0;
    display: grid;
    align-items: stretch;
  }
  .makeup-detail-forms .makeup-form-stage button {
    height: 100%;
    width: var(--form-card-width);
    min-width: 0;
    justify-self: start;
  }
}
.makeup-form-stage {
  position: relative;
}
.makeup-form-stage::before {
  content: '';
  position: absolute;
  top: 50%;
  left: -16px;
  width: 12px;
  height: 12px;
  transform: translate(-50%, -50%);
  box-sizing: border-box;
  border: 2px solid var(--muted);
  border-radius: 50%;
  background: var(--surface);
  z-index: 1;
}
.makeup-form-stage:not(:last-child)::after {
  content: '';
  position: absolute;
  top: 50%;
  left: -17px;
  width: 2px;
  height: calc(100% + 14px);
  background: var(--line);
}
.makeup-form-stage.active::before {
  width: 14px;
  height: 14px;
  border-width: 3px;
  border-color: var(--primary-button-bg);
  box-shadow: 0 0 0 4px var(--line-soft);
  box-shadow:
    0 0 0 4px color-mix(in srgb, var(--primary-button-bg) 12%, transparent),
    0 0 9px 2px color-mix(in srgb, var(--primary-button-bg) 28%, transparent);
}
.makeup-form-stage.is-past:not(:last-child)::after {
  background: var(--primary-button-bg);
}
.makeup-form-stage.active:not(:last-child)::after {
  background: linear-gradient(to bottom, var(--primary-button-bg), var(--line) 88%);
}
.makeup-form-stage button {
  display: block;
  position: relative;
  padding: 0;
  width: 100%;
  aspect-ratio: 520 / 724;
  box-sizing: border-box;
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--archive-background-image, url('../../img/云绸.webp')) center / cover no-repeat;
  background-color: var(--surface);
  box-shadow: var(--photo-shadow);
  color: var(--text);
  cursor: pointer;
  transition:
    border-color var(--motion-fast) ease,
    box-shadow var(--motion-fast) ease;
}
:where(:root[data-theme='dark']) .makeup-form-stage button {
  background-image: var(--archive-background-image, url('../../img/longBgdark.jpg'));
}
.makeup-form-stage.active button,
.makeup-form-stage button:hover,
.makeup-form-stage button:focus-visible {
  border-color: var(--primary-button-bg);
  box-shadow: 0 0 0 1px var(--pink-deep);
  box-shadow: 0 1px 5px color-mix(in srgb, var(--primary-button-bg) 20.2%, transparent);
}
:where(:root[data-theme='dark']) .makeup-form-stage.active button,
:where(:root[data-theme='dark']) .makeup-form-stage button:hover,
:where(:root[data-theme='dark']) .makeup-form-stage button:focus-visible {
  box-shadow: 0 0 0 1px var(--pink-deep);
  box-shadow: 0 2px 8px color-mix(in srgb, var(--primary-button-bg) 52.4%, transparent);
}
.makeup-form-stage img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.makeup-form-stage span {
  position: absolute;
  inset: auto 0 0;
  display: block;
  padding: 4px 2px;
  font-size: 11px;
  background: linear-gradient(to bottom, transparent, var(--surface));
}
.makeup-form-stage button:focus-visible,
.makeup-related-outfit:focus-visible {
  outline: 2px solid var(--pink-deep);
  outline-offset: 2px;
}
@media (max-width: 700px) {
  .makeup-detail-dialog {
    --dialog-max-height: calc(100dvh - 24px);
  }
  .makeup-detail-header {
    padding: 12px 16px;
  }
  .makeup-detail-header h2 {
    font-size: 18px;
  }
  .makeup-detail-scroll {
    padding: 14px;
  }
  .makeup-detail-layout,
  .makeup-detail-layout:not(.has-forms),
  .makeup-detail-layout.has-forms {
    grid-template-columns: minmax(0, 1fr);
    gap: 16px;
  }
  .makeup-detail-layout.has-forms {
    grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
    column-gap: 12px;
  }
  .makeup-detail-preview {
    grid-column: 1;
    grid-row: 1;
    width: min(100%, 240px);
    justify-self: center;
  }
  .makeup-detail-copy,
  .makeup-detail-layout:not(.has-forms) .makeup-detail-copy {
    grid-column: 1 / -1;
    grid-row: 2;
    border-top: 1px solid var(--line-soft);
    padding-top: 16px;
  }
  .makeup-detail-forms {
    grid-column: 2;
    grid-row: 1;
    display: grid;
    grid-template-rows: repeat(2, minmax(0, 1fr));
    gap: 14px;
    margin-top: -14px;
    margin-bottom: -16px;
    padding: 14px 4px 16px 26px;
    border-right: 0;
    border-left: 1px solid var(--line);
    contain: size;
  }
  .makeup-form-stage {
    min-width: 0;
    min-height: 0;
    display: grid;
    align-items: center;
  }
  .makeup-form-stage button {
    width: min(100%, 110px);
    justify-self: start;
  }
  .makeup-form-stage::before {
    left: -13px;
  }
  .makeup-form-stage:not(:last-child)::after {
    left: -14px;
  }
}
</style>
