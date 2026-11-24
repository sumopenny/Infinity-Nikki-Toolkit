<script setup lang="ts">
import { ref, useId } from 'vue'
import { ChevronDown } from 'lucide-vue-next'

defineProps<{ title: string }>()
const expanded = ref(false)
const contentId = useId()
</script>

<template>
  <div class="album-entry-help">
    <button
      type="button"
      class="accordion-toggle"
      :aria-expanded="expanded"
      :aria-controls="contentId"
      @click="expanded = !expanded"
    >
      <span>{{ title }}</span>
      <ChevronDown :size="17" aria-hidden="true" />
    </button>
    <div :id="contentId" class="accordion-answer" :class="{ expanded }" :inert="!expanded">
      <div
        ><div class="album-entry-help-content"><slot /></div
      ></div>
    </div>
  </div>
</template>
