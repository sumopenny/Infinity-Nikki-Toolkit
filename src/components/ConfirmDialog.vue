<script setup lang="ts">
import { computed, ref, toRef } from 'vue'
import { useBodyScrollLock } from '../utils/bodyScrollLock'
import { useModalFocus } from '../composables/useModalFocus'

export interface ConfirmDialogSection {
  title: string
  items?: string[]
  text?: string
}

export type ConfirmDialogTone = 'info' | 'warning' | 'danger'

const props = defineProps<{
  visible: boolean
  title: string
  message: string
  sections?: ConfirmDialogSection[]
  consequence?: string
  secondaryLabel?: string
  tone: ConfirmDialogTone
  confirmLabel: string
  cancelLabel?: string
  closeLabel: string
}>()

const emit = defineEmits<{
  confirm: []
  cancel: []
  secondary: []
}>()

const confirmButtonRef = ref<HTMLButtonElement | null>(null)
const cancelButtonRef = ref<HTMLButtonElement | null>(null)
const closeButtonRef = ref<HTMLButtonElement | null>(null)
const panelRef = ref<HTMLElement | null>(null)
const visible = toRef(props, 'visible')
// 危险操作优先聚焦取消；没有取消按钮时，仍以关闭按钮作为安全入口。
const initialFocus = computed(() =>
  props.tone === 'danger' ? (cancelButtonRef.value ?? closeButtonRef.value) : confirmButtonRef.value
)
useBodyScrollLock(visible)
useModalFocus(visible, panelRef, () => emit('cancel'), undefined, initialFocus)
</script>

<template>
  <Teleport to="body">
    <Transition name="confirm-dialog">
      <div
        v-if="visible"
        class="confirm-dialog"
        role="dialog"
        aria-modal="true"
        :aria-label="title"
        @click.self="emit('cancel')"
      >
        <section ref="panelRef" class="confirm-dialog-panel" :class="`is-${tone}`" tabindex="-1">
          <header class="confirm-dialog-heading">
            <div class="confirm-dialog-icon" aria-hidden="true">
              <svg v-if="tone === 'danger'" viewBox="0 0 24 24">
                <path d="M7 7h10" />
                <path d="M10 11v6" />
                <path d="M14 11v6" />
                <path d="M9 7l.8-2h4.4L15 7" />
                <path d="M6 7l1 13h10l1-13" />
              </svg>
              <svg v-else-if="tone === 'warning'" viewBox="0 0 24 24">
                <path d="M12 8v5" />
                <path d="M12 17.25h.01" />
                <path
                  d="M10.1 4.6 3.2 17a2 2 0 0 0 1.75 3h14.1a2 2 0 0 0 1.75-3L13.9 4.6a2.17 2.17 0 0 0-3.8 0Z"
                />
              </svg>
              <svg v-else viewBox="0 0 24 24">
                <path d="M12 10.75V17" />
                <path d="M12 7h.01" />
                <circle cx="12" cy="12" r="9" />
              </svg>
            </div>

            <h2>{{ title }}</h2>

            <button
              ref="closeButtonRef"
              class="confirm-dialog-close"
              type="button"
              :aria-label="closeLabel"
              @click="emit('cancel')"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="m7 7 10 10M17 7 7 17" />
              </svg>
            </button>
          </header>
          <div class="confirm-dialog-content">
            <p :class="{ 'confirm-dialog-risk': sections?.length && tone === 'danger' }">{{
              message
            }}</p>
            <section
              v-for="section in sections"
              :key="section.title"
              class="confirm-dialog-section"
            >
              <h3>{{ section.title }}</h3>
              <ul v-if="section.items?.length"
                ><li v-for="item in section.items" :key="item">{{ item }}</li></ul
              >
              <p v-if="section.text">{{ section.text }}</p>
            </section>
            <p v-if="consequence" class="confirm-dialog-consequence">{{ consequence }}</p>
          </div>

          <div class="confirm-dialog-actions">
            <button
              v-if="secondaryLabel"
              type="button"
              class="confirm-dialog-button secondary"
              @click="emit('secondary')"
              >{{ secondaryLabel }}</button
            >
            <button
              v-if="cancelLabel"
              ref="cancelButtonRef"
              class="confirm-dialog-button ghost"
              type="button"
              @click="emit('cancel')"
            >
              {{ cancelLabel }}
            </button>
            <button
              ref="confirmButtonRef"
              class="confirm-dialog-button primary"
              type="button"
              @click="emit('confirm')"
            >
              {{ confirmLabel }}
            </button>
          </div>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>
