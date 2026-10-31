<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { CircleHelp, X } from 'lucide-vue-next'
import { useBodyScrollLock } from '../utils/bodyScrollLock'
import type { FullLocaleMessages } from '../i18n'

const props = defineProps<{
  visible: boolean
  dismissed: boolean
  messages: FullLocaleMessages['updateLog']
}>()
const emit = defineEmits<{ close: [dontShowAgain: boolean]; openHelp: [] }>()
const dontShowAgain = ref(false)
const panelRef = ref<HTMLElement | null>(null)
let previousActiveElement: HTMLElement | null = null
useBodyScrollLock(computed(() => props.visible))

function closeDialog() {
  emit('close', dontShowAgain.value)
}
function openHelp() {
  emit('openHelp')
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
  ].filter((element) => !element.hasAttribute('disabled'))
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
      dontShowAgain.value = props.dismissed
      previousActiveElement =
        document.activeElement instanceof HTMLElement ? document.activeElement : null
      void nextTick(() => panelRef.value?.focus())
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
        class="dialog-overlay update-log-dialog"
        role="dialog"
        aria-modal="true"
        :aria-label="messages.title"
        @click.self="closeDialog"
        @keydown="handleKeydown"
      >
        <section ref="panelRef" class="dialog-panel update-log-panel" tabindex="-1">
          <header class="update-log-header">
            <div class="update-log-title-row"
              ><h2>{{ messages.title }}</h2
              ><button
                class="update-log-help-button"
                type="button"
                :title="messages.helpAbout"
                :aria-label="messages.helpAbout"
                @click="openHelp"
                ><CircleHelp :size="14" aria-hidden="true" /><span>{{
                  messages.helpAbout
                }}</span></button
              ></div
            >
            <button
              class="update-log-close-button"
              type="button"
              :title="messages.closeAria"
              :aria-label="messages.closeAria"
              @click="closeDialog"
              ><X :size="19" aria-hidden="true"
            /></button>
          </header>
          <div class="update-log-body">
            <section>
              <h3 class="update-log-section-title"
                >{{ messages.currentTitle }}【{{ messages.currentDate }}】</h3
              >
              <article class="update-log-entry is-current update-log-current">
                <span class="update-log-version">{{ messages.currentVersion }}</span>
                <ul
                  ><li v-for="(item, index) in messages.currentItems" :key="index"
                    ><template v-if="typeof item === 'string'">{{ item }}</template
                    ><template v-else
                      ><strong class="update-log-item-title">{{ item.title }}</strong
                      >{{ item.text
                      }}<a
                        v-if="item.link"
                        class="update-log-item-link"
                        :href="item.link.href"
                        target="_blank"
                        rel="noopener noreferrer"
                        >{{ item.link.label }}</a
                      ></template
                    ></li
                  ></ul
                >
              </article>
            </section>
            <section class="update-log-history">
              <h3 class="update-log-section-title">{{ messages.historyTitle }}</h3>
              <article
                v-for="entry in messages.history"
                :key="entry.version"
                class="update-log-history-entry"
              >
                <span class="update-log-version">{{ entry.version }}</span>
                <ul
                  ><li v-for="(item, index) in entry.items" :key="index"
                    ><template v-if="typeof item === 'string'">{{ item }}</template
                    ><template v-else
                      ><strong class="update-log-item-title">{{ item.title }}</strong
                      >{{ item.text
                      }}<a
                        v-if="item.link"
                        class="update-log-item-link"
                        :href="item.link.href"
                        target="_blank"
                        rel="noopener noreferrer"
                        >{{ item.link.label }}</a
                      ></template
                    ></li
                  ></ul
                >
              </article>
            </section>
          </div>
          <footer class="update-log-footer">
            <label class="app-checkbox-label"
              ><input
                v-model="dontShowAgain"
                class="app-checkbox"
                style="--checkbox-size: 18px"
                type="checkbox"
              /><span>{{ messages.dontShowAgain }}</span></label
            >
            <button class="primary-button" type="button" @click="closeDialog">{{
              messages.confirm
            }}</button>
          </footer>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.update-log-item-link {
  margin-left: 0.35em;
  color: var(--pink-deep);
  text-decoration: underline;
  text-underline-offset: 3px;
}
</style>
