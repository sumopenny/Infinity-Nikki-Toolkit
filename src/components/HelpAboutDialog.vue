<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import {
  Archive,
  Images,
  Camera,
  Shirt,
  Paintbrush,
  SlidersHorizontal,
  Search,
  BookOpen,
  Hand,
  House,
  Info,
  Keyboard,
  MousePointer2,
  ShieldCheck,
  Sparkles,
  X
} from 'lucide-vue-next'
import { useBodyScrollLock } from '../utils/bodyScrollLock'
import type { FullLocaleMessages } from '../i18n'

const props = defineProps<{
  visible: boolean
  compact: boolean
  messages: FullLocaleMessages['helpAbout']
}>()
const emit = defineEmits<{ close: [] }>()
const panelRef = ref<HTMLElement | null>(null)
const featureIcons = {
  images: Images,
  outfit: Shirt,
  home: House,
  camera: Camera,
  resonance: Sparkles,
  backup: Archive,
  cleanup: ShieldCheck,
  wardrobe: Shirt,
  makeup: Paintbrush,
  search: Search,
  tools: SlidersHorizontal
}
const operationIcons = { mouse: MousePointer2, keyboard: Keyboard, touch: Hand }
// 跟随 App 的统一布局状态，不另行判断设备；窗口打开期间也可切换两端教程。
const content = computed(() => (props.compact ? props.messages.mobile : props.messages.desktop))
let previousActiveElement: HTMLElement | null = null
useBodyScrollLock(computed(() => props.visible))

function closeDialog() {
  emit('close')
}
function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    closeDialog()
    return
  }
  if (event.key !== 'Tab' || !panelRef.value) return
  const focusable = [
    ...panelRef.value.querySelectorAll<HTMLElement>(
      'button, input, [href], [tabindex]:not([tabindex="-1"])'
    )
  ]
  if (!focusable.length) return
  const first = focusable[0],
    last = focusable[focusable.length - 1]
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}
watch(
  () => props.visible,
  (visible) => {
    if (visible) {
      previousActiveElement =
        document.activeElement instanceof HTMLElement ? document.activeElement : null
      void nextTick(() => panelRef.value?.querySelector<HTMLElement>('button')?.focus())
    } else {
      previousActiveElement?.focus()
      previousActiveElement = null
    }
  },
  { immediate: true }
)
</script>

<template>
  <Teleport to="body">
    <Transition name="confirm-dialog" appear>
      <div
        v-if="visible"
        class="dialog-overlay help-about-dialog"
        role="dialog"
        aria-modal="true"
        :aria-label="messages.title"
        @click.self="closeDialog"
        @keydown="handleKeydown"
      >
        <section ref="panelRef" class="dialog-panel help-about-panel">
          <header class="help-about-header">
            <h2>{{ messages.title }}</h2>
            <button
              type="button"
              :title="messages.closeAria"
              :aria-label="messages.closeAria"
              @click="closeDialog"
              ><X :size="19" aria-hidden="true"
            /></button>
          </header>
          <div class="help-about-body">
            <section class="help-about-intro"
              ><h3>{{ messages.introTitle }}</h3
              ><p>{{ messages.intro }}</p
              ><p class="help-about-privacy"
                ><ShieldCheck :size="18" aria-hidden="true" />{{ messages.privacyNote }}</p
              ></section
            >
            <section
              ><h3>{{ messages.featuresTitle }}</h3
              ><div class="help-about-feature-grid"
                ><article
                  v-for="feature in content.features"
                  :key="feature.title"
                  class="help-about-feature"
                  ><span
                    ><component
                      :is="featureIcons[feature.icon as keyof typeof featureIcons] ?? Info"
                      :size="18"
                      aria-hidden="true" /></span
                  ><div
                    ><h4>{{ feature.title }}</h4
                    ><p>{{ feature.text }}</p></div
                  ></article
                ></div
              ></section
            >
            <section
              ><h3><BookOpen :size="17" aria-hidden="true" />{{ messages.tutorialTitle }}</h3
              ><div class="help-about-tutorial-grid"
                ><article v-for="section in content.tutorialSections" :key="section.title"
                  ><h4>{{ section.title }}</h4
                  ><ul
                    ><li v-for="item in section.items" :key="item">{{ item }}</li></ul
                  ></article
                ></div
              ></section
            >
            <section
              ><h3><ShieldCheck :size="17" aria-hidden="true" />{{ messages.notesTitle }}</h3
              ><ul class="help-about-notes"
                ><li v-for="item in content.notes" :key="item">{{ item }}</li></ul
              ></section
            >
            <div class="help-about-shortcuts" :class="{ 'is-touch': compact }"
              ><section v-for="section in content.operationSections" :key="section.icon"
                ><h3
                  ><component :is="operationIcons[section.icon]" :size="17" aria-hidden="true" />{{
                    section.title
                  }}</h3
                ><ul
                  ><li v-for="item in section.items" :key="item">{{ item }}</li></ul
                ></section
              ></div
            >
          </div>
          <footer class="help-about-footer"
            ><button class="primary-button" type="button" @click="closeDialog">{{
              messages.confirm
            }}</button></footer
          >
        </section>
      </div>
    </Transition>
  </Teleport>
</template>
