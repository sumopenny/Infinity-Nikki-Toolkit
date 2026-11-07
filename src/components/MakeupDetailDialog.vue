<script setup lang="ts">
import { computed } from 'vue'
import DetailDialogHost from './DetailDialogHost.vue'
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
  close: []
  selectForm: [entry: MakeupEntry]
  selectEntry: [entry: MakeupEntry]
}>()
const initial = computed(() =>
  props.detail
    ? {
        kind: 'makeup' as const,
        detail: props.detail,
        data: {
          entries: props.entries,
          parts: props.parts,
          relations: props.relations,
          relatedOutfits: props.outfits
        }
      }
    : null
)
</script>
<template>
  <DetailDialogHost
    :initial="initial"
    :language="language"
    :layer="layer"
    @close="emit('close')"
    @select-form="emit('selectForm', $event)"
    @select-entry="emit('selectEntry', $event)"
  />
</template>
