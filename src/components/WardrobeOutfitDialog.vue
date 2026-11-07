<script setup lang="ts">
import { computed } from 'vue'
import DetailDialogHost from './DetailDialogHost.vue'
import type { WardrobeEntry, WardrobeCatalog } from '../utils/wardrobe/wardrobeCatalog'
import type { WardrobeSnapshot } from '../utils/wardrobe/wardrobeStorage'
import type { Language } from '../i18n/types'
const props = defineProps<{
  detail: WardrobeEntry | null
  catalog: WardrobeCatalog | null
  snapshot: WardrobeSnapshot
  language: Language
  layer?: number
}>()
const emit = defineEmits<{ close: []; openOutfit: [entry: WardrobeEntry] }>()
const initial = computed(() =>
  props.detail
    ? {
        kind: 'outfit' as const,
        detail: props.detail,
        catalog: props.catalog,
        snapshot: props.snapshot
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
    @open-outfit="emit('openOutfit', $event)"
  />
</template>
