<script setup lang="ts">
import { Check } from 'lucide-vue-next'

defineProps<{ selected: boolean; disabled?: boolean; language?: string }>()
</script>

<template>
  <button
    class="selected-badge"
    type="button"
    :disabled="disabled"
    :aria-pressed="selected"
    :aria-label="
      language === 'en'
        ? selected
          ? 'Deselect photo'
          : 'Select photo'
        : selected
          ? '取消选择图片'
          : '选择图片'
    "
  >
    <Check :size="15" aria-hidden="true" />
  </button>
</template>
