<script setup lang="ts">
import { computed } from 'vue'
import DialogChoiceMenu from './DialogChoiceMenu.vue'
import { PEARPAL_REGIONS, type PearpalRegion } from '../utils/resonance/pearpalRegions'
import type { Language } from '../i18n/types'
const props = defineProps<{ language: Language; disabled?: boolean }>()
const model = defineModel<PearpalRegion>({ required: true })
const label = computed(() => (props.language === 'zh' ? '服务器' : 'Server'))
const options = computed(() =>
  (Object.keys(PEARPAL_REGIONS) as PearpalRegion[]).map((value) => ({
    value,
    label: PEARPAL_REGIONS[value].name[props.language],
    attrs: { 'data-region': value }
  }))
)
</script>
<template>
  <div class="data-import-region">
    <span>{{ label }}</span>
    <DialogChoiceMenu v-model="model" :label="label" :options="options" :disabled="disabled" />
  </div>
</template>
<style scoped>
.data-import-region {
  margin: 12px 0;
}
</style>
