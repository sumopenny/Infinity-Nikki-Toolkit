<script setup lang="ts">
import { computed, shallowRef, watch } from 'vue'
import MakeupDetailView from './MakeupDetailView.vue'
import WardrobeOutfitView from './WardrobeOutfitView.vue'
import type { DetailPage } from '../utils/detailNavigation'
import type { Language } from '../i18n/types'
import type { MakeupEntry } from '../utils/makeupCatalog'
import type { MakeupCatalogData } from '../utils/loadMakeupCatalog'
import type { WardrobeCatalog, WardrobeEntry } from '../utils/wardrobe/wardrobeCatalog'
import type { WardrobeSnapshot } from '../utils/wardrobe/wardrobeStorage'
const props = defineProps<{ initial: DetailPage | null; language: Language; layer?: number }>()
const emit = defineEmits<{
  close: []
  selectForm: [entry: MakeupEntry]
  selectEntry: [entry: MakeupEntry]
  openOutfit: [entry: WardrobeEntry]
}>()
const history = shallowRef<DetailPage[]>([])
watch(
  () => props.initial?.detail,
  () => {
    history.value = []
  }
)
const page = computed(() => (props.initial ? (history.value.at(-1) ?? props.initial) : null))
function navigate(next: DetailPage) {
  const pages = history.value
  const existing = pages.findIndex((p) => p.kind === next.kind && p.detail.id === next.detail.id)
  history.value = existing >= 0 ? [...pages.slice(0, existing), next] : [...pages, next]
}
function openOutfit(detail: WardrobeEntry, catalog: WardrobeCatalog, snapshot: WardrobeSnapshot) {
  navigate({ kind: 'outfit', detail, catalog, snapshot })
}
function openMakeup(detail: MakeupEntry, data: MakeupCatalogData) {
  navigate({ kind: 'makeup', detail, data })
}
function selectMakeup(entry: MakeupEntry, form: boolean) {
  if (!history.value.length) {
    if (form) emit('selectForm', entry)
    else emit('selectEntry', entry)
    return
  }
  const current = page.value
  if (current?.kind === 'makeup')
    history.value = [...history.value.slice(0, -1), { ...current, detail: entry }]
}
function selectOutfit(entry: WardrobeEntry) {
  if (!history.value.length) {
    emit('openOutfit', entry)
    return
  }
  const current = page.value
  if (current?.kind === 'outfit')
    history.value = [...history.value.slice(0, -1), { ...current, detail: entry }]
}
function close() {
  if (history.value.length) history.value = history.value.slice(0, -1)
  else emit('close')
}
</script>
<template>
  <MakeupDetailView
    v-if="page?.kind === 'makeup'"
    :detail="page.detail"
    :entries="page.data.entries"
    :parts="page.data.parts"
    :relations="page.data.relations"
    :outfits="page.data.relatedOutfits"
    :language="language"
    :layer="layer"
    @close="close"
    @select-form="selectMakeup($event, true)"
    @select-entry="selectMakeup($event, false)"
    @open-outfit="openOutfit"
  />
  <WardrobeOutfitView
    v-else-if="page?.kind === 'outfit'"
    :detail="page.detail"
    :catalog="page.catalog"
    :snapshot="page.snapshot"
    :language="language"
    :layer="layer"
    @close="close"
    @open-outfit="selectOutfit"
    @open-makeup="openMakeup"
  />
</template>
