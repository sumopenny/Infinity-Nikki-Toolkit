<script setup lang="ts">
import { ref, toRef, watch } from 'vue'
import { ScanSearch, Sparkles, X } from 'lucide-vue-next'
import { useBodyScrollLock } from '../utils/bodyScrollLock'
import { useModalFocus } from '../composables/useModalFocus'
import type { OutfitMessages } from '../i18n'

const props = defineProps<{
  visible: boolean
  dismissed: boolean
  messages: OutfitMessages
}>()

const emit = defineEmits<{
  close: [dontShowAgain: boolean]
}>()

const dontShowAgain = ref(false)
const closeButtonRef = ref<HTMLButtonElement | null>(null)
const panelRef = ref<HTMLElement | null>(null)
const featuredIcon = Sparkles
const visible = toRef(props, 'visible')
useBodyScrollLock(visible)
useModalFocus(visible, panelRef, closeGuide, undefined, closeButtonRef)

/** 关闭搭配码引导。参数：无；同时提交当前“不再提示”选项。 */
function closeGuide() {
  emit('close', dontShowAgain.value)
}

watch(
  visible,
  (open) => {
    if (open) dontShowAgain.value = props.dismissed
  },
  { immediate: true }
)

watch(
  () => props.dismissed,
  (dismissed) => {
    if (props.visible) dontShowAgain.value = dismissed
  }
)
</script>

<template>
  <Teleport to="body">
    <Transition name="confirm-dialog" appear>
      <div
        v-if="visible"
        class="outfit-guide"
        role="dialog"
        aria-modal="true"
        :aria-label="messages.guideTitle"
        @click.self="closeGuide"
      >
        <section ref="panelRef" class="outfit-guide-panel">
          <header>
            <div>
              <h2>{{ messages.guideTitle }}</h2>
            </div>
            <button
              ref="closeButtonRef"
              type="button"
              :title="messages.guideClose"
              :aria-label="messages.guideClose"
              @click="closeGuide"
            >
              <X :size="19" aria-hidden="true" />
            </button>
          </header>

          <section class="outfit-guide-featured">
            <div class="outfit-guide-section-icon" aria-hidden="true">
              <component :is="featuredIcon" :size="18" />
            </div>
            <div>
              <h3>{{ messages.guideFeaturedSection.title }}</h3>
              <p v-for="item in messages.guideFeaturedSection.items" :key="item">{{ item }}</p>
            </div>
          </section>

          <div class="outfit-guide-sections">
            <section v-for="section in messages.guideSections" :key="section.title">
              <div class="outfit-guide-section-icon" aria-hidden="true">
                <ScanSearch :size="18" />
              </div>
              <div>
                <h3>{{ section.title }}</h3>
                <p v-for="item in section.items" :key="item">{{ item }}</p>
              </div>
            </section>
          </div>

          <footer>
            <label class="app-checkbox-label">
              <input
                v-model="dontShowAgain"
                class="app-checkbox"
                style="--checkbox-size: 18px"
                type="checkbox"
              />
              <span>{{ messages.guideDontShowAgain }}</span>
            </label>
            <button class="primary-button" type="button" @click="closeGuide">{{
              messages.guideConfirm
            }}</button>
          </footer>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>
