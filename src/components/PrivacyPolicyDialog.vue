<script setup lang="ts">
import { computed, ref, toRef, useId } from 'vue'
import { ShieldCheck, X } from 'lucide-vue-next'
import type { Language } from '../i18n'
import { privacyPolicy } from '../i18n/messages/privacyPolicy'
import { useBodyScrollLock } from '../utils/bodyScrollLock'
import { useModalFocus } from '../composables/useModalFocus'

const props = defineProps<{ visible: boolean; compact: boolean; language: Language }>()
const emit = defineEmits<{ close: []; afterClose: [] }>()
const titleId = useId()
const panel = ref<HTMLElement | null>(null)
const closeButton = ref<HTMLButtonElement | null>(null)
const visible = toRef(props, 'visible')
const messages = computed(() => privacyPolicy[props.language])
const close = () => emit('close')
useBodyScrollLock(visible)
useModalFocus(visible, panel, close, undefined, closeButton)
</script>

<template>
  <Teleport to="body">
    <Transition name="confirm-dialog" appear @after-leave="emit('afterClose')">
      <div
        v-if="visible"
        class="dialog-overlay help-about-dialog"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="titleId"
        @click.self="close"
      >
        <section
          ref="panel"
          class="dialog-panel help-about-panel"
          :class="{ 'is-compact': compact }"
        >
          <header class="help-about-header">
            <h2 :id="titleId">
              <span class="help-about-mark"><ShieldCheck :size="20" aria-hidden="true" /></span>
              {{ messages.title }}
            </h2>
            <button
              ref="closeButton"
              type="button"
              :title="messages.close"
              :aria-label="messages.close"
              @click="close"
              ><X :size="19" aria-hidden="true"
            /></button>
          </header>
          <div class="help-about-body privacy-policy-body">
            <p class="privacy-policy-date">{{ messages.updated }}</p>
            <p>{{ messages.intro }}</p>
            <section v-for="([title, text], index) in messages.sections" :key="title">
              <h3>{{ index + 1 }}. {{ title }}</h3>
              <p>{{ text }}</p>
            </section>
            <nav :aria-label="messages.title">
              <a
                href="https://policies.google.com/technologies/partner-sites"
                target="_blank"
                rel="noopener noreferrer"
                >{{ messages.googleData }}</a
              >
              <a
                href="https://policies.google.com/privacy"
                target="_blank"
                rel="noopener noreferrer"
                >{{ messages.googlePrivacy }}</a
              >
              <a href="https://myadcenter.google.com/" target="_blank" rel="noopener noreferrer">{{
                messages.adSettings
              }}</a>
            </nav>
          </div>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.privacy-policy-body {
  line-height: 1.8;
}
.privacy-policy-body p {
  margin: 0 0 16px;
}
.privacy-policy-body section + section {
  margin-top: 20px;
}
.privacy-policy-date {
  color: var(--muted);
}
.privacy-policy-body nav {
  display: grid;
  gap: 8px;
}
.privacy-policy-body a {
  color: var(--heading);
  text-underline-offset: 3px;
}
</style>
