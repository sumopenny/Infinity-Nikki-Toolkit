<script setup lang="ts">
import { ref, toRef, watch } from 'vue'
import { CircleHelp, X } from 'lucide-vue-next'
import { useBodyScrollLock } from '../utils/bodyScrollLock'
import { useModalFocus } from '../composables/useModalFocus'
import type { FullLocaleMessages } from '../i18n'

const props = defineProps<{
  visible: boolean
  dismissed: boolean | 'forever'
  messages: FullLocaleMessages['updateLog']
}>()
const emit = defineEmits<{
  close: [dismissal: boolean | 'forever']
  openHelp: []
  afterClose: []
}>()
const dontShowAgain = ref(false)
const dontShowEverAgain = ref(false)
const panelRef = ref<HTMLElement | null>(null)
const visible = toRef(props, 'visible')
useBodyScrollLock(visible)
useModalFocus(visible, panelRef, closeDialog)

function closeDialog() {
  emit('close', dontShowEverAgain.value ? 'forever' : dontShowAgain.value)
}
function openHelp() {
  emit('openHelp')
}
watch(
  visible,
  (open) => {
    if (!open) return
    dontShowEverAgain.value = props.dismissed === 'forever'
    dontShowAgain.value = props.dismissed === true
  },
  { immediate: true }
)
</script>

<template>
  <Teleport to="body">
    <Transition name="confirm-dialog" appear @after-leave="emit('afterClose')">
      <div
        v-if="visible"
        class="dialog-overlay update-log-dialog"
        role="dialog"
        aria-modal="true"
        :aria-label="messages.title"
        @click.self="closeDialog"
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
              <h3 class="update-log-section-title">
                <span class="update-log-version is-current">{{ messages.currentVersion }}</span>
                <span>【{{ messages.currentDate }}】</span>
              </h3>
              <article class="update-log-entry is-current update-log-current">
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
            <section v-if="messages.history.length" class="update-log-history">
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
            <div class="update-log-options">
              <label class="app-checkbox-label"
                ><input
                  v-model="dontShowAgain"
                  class="app-checkbox"
                  style="--checkbox-size: 18px"
                  type="checkbox"
                  @change="dontShowEverAgain = false"
                /><span>{{ messages.dontShowAgain }}</span></label
              >
              <label class="app-checkbox-label">
                <input
                  v-model="dontShowEverAgain"
                  class="app-checkbox"
                  style="--checkbox-size: 18px"
                  type="checkbox"
                  @change="dontShowAgain = false"
                /><span>{{ messages.dontShowEverAgain }}</span>
              </label>
            </div>
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
