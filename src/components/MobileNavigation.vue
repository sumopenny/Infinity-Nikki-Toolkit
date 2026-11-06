<script setup lang="ts">
import { Camera, House, Shirt, Sparkles } from 'lucide-vue-next'
import type { AlbumView } from './AlbumViewSwitcher.vue'
import type { LocaleMessages } from '../i18n'
defineProps<{
  activeView: AlbumView
  disabled: boolean
  messages: LocaleMessages['viewNav']
  outfitLabel: string
  cameraLabel: string
}>()
defineEmits<{ changeView: [view: AlbumView] }>()
</script>

<template>
  <nav class="mobile-navigation mobile-only" :aria-label="messages.aria">
    <button
      v-for="entry in [
        { view: 'outfits' as const, label: outfitLabel, icon: Shirt },
        { view: 'home' as const, label: messages.homeSchemes, icon: House },
        { view: 'favorites' as const, label: cameraLabel, icon: Camera },
        { view: 'resonance' as const, label: messages.resonance, icon: Sparkles }
      ]"
      :key="entry.view"
      type="button"
      :disabled="disabled"
      :aria-current="
        activeView === entry.view || (entry.view === 'resonance' && activeView === 'wardrobe')
          ? 'page'
          : undefined
      "
      @click="$emit('changeView', entry.view)"
    >
      <component :is="entry.icon" :size="20" /><span>{{ entry.label }}</span>
    </button>
  </nav>
</template>
