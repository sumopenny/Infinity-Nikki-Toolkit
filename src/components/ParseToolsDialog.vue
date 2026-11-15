<script setup lang="ts">
import { warmLookbookParser } from '../utils/outfit/lookbookWasmClient'
import { computed, nextTick, ref, watch } from 'vue'
import { ScanSearch, Upload, X } from 'lucide-vue-next'
import { useBodyScrollLock } from '../utils/bodyScrollLock'

const props = defineProps<{
  visible: boolean
  cameraParams: string
  outfitCode: string
  outfitMaxLength: number
  busy: boolean
  messages: {
    title: string
    close: string
    cameraTitle: string
    outfitTitle: string
    cameraPlaceholder: string
    outfitPlaceholder: string
    cameraSubmit: string
    outfitSubmit: string
    busyHint: string
    upload: string
    uploadHint: string
  }
}>()

const emit = defineEmits<{
  close: []
  'update:cameraParams': [value: string]
  'update:outfitCode': [value: string]
  'parse-camera': [value: string]
  'parse-outfit': [value: string]
  upload: [file: File]
}>()

const panelRef = ref<HTMLElement | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)
let previousActiveElement: HTMLElement | null = null
useBodyScrollLock(computed(() => props.visible))

function closeDialog() {
  emit('close')
}

function chooseFile() {
  fileInput.value?.click()
}
function onFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (file) emit('upload', file)
}

function handleKeydown(event: KeyboardEvent) {
  if (!props.visible) return
  if (event.key === 'Escape') {
    event.preventDefault()
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
  const first = focusable[0]
  const last = focusable[focusable.length - 1]
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
      void warmLookbookParser().catch(() => undefined)
      previousActiveElement =
        document.activeElement instanceof HTMLElement ? document.activeElement : null
      // 打开时聚焦面板，避免自动进入输入状态或唤起手机键盘。
      void nextTick(() => {
        if (props.visible) panelRef.value?.focus({ preventScroll: true })
      })
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
        class="dialog-overlay parse-tools-dialog"
        role="dialog"
        aria-modal="true"
        :aria-label="messages.title"
        @click.self="closeDialog"
        @keydown="handleKeydown"
      >
        <section ref="panelRef" class="dialog-panel parse-tools-panel" tabindex="-1">
          <header>
            <h2>{{ messages.title }}</h2>
            <button
              type="button"
              :title="messages.close"
              :aria-label="messages.close"
              @click="closeDialog"
              ><X :size="19" aria-hidden="true"
            /></button>
          </header>
          <div class="parse-tools-body">
            <p v-if="busy" class="parse-tools-hint">{{ messages.busyHint }}</p>
            <section class="parse-tools-section parse-tools-upload">
              <h3>{{ messages.upload }}</h3>
              <p>{{ messages.uploadHint }}</p>
              <input
                ref="fileInput"
                class="visually-hidden"
                type="file"
                accept="image/*,.jpg,.jpeg,.png,.webp,.gif,.bmp,.avif"
                :disabled="busy"
                @change="onFileChange"
              />
              <button class="outfit-parse-submit" type="button" :disabled="busy" @click="chooseFile"
                ><Upload :size="16" aria-hidden="true" />{{ messages.upload }}</button
              >
            </section>
            <form
              class="parse-tools-section"
              @submit.prevent="emit('parse-camera', cameraParams.trim())"
            >
              <h3>{{ messages.cameraTitle }}</h3>
              <div class="outfit-parse-form parse-tools-form-row">
                <input
                  :value="cameraParams"
                  :placeholder="messages.cameraPlaceholder"
                  :aria-label="messages.cameraPlaceholder"
                  :disabled="busy"
                  autocomplete="off"
                  @input="emit('update:cameraParams', ($event.target as HTMLInputElement).value)"
                />
                <button
                  class="outfit-parse-submit"
                  type="submit"
                  :disabled="busy || !cameraParams.trim()"
                  ><ScanSearch :size="16" aria-hidden="true" />{{ messages.cameraSubmit }}</button
                >
              </div>
            </form>
            <form
              class="parse-tools-section"
              @submit.prevent="emit('parse-outfit', outfitCode.trim())"
            >
              <h3>{{ messages.outfitTitle }}</h3>
              <div class="outfit-parse-form parse-tools-form-row">
                <input
                  :value="outfitCode"
                  :maxlength="outfitMaxLength"
                  :placeholder="messages.outfitPlaceholder"
                  :aria-label="messages.outfitPlaceholder"
                  :disabled="busy"
                  autocomplete="off"
                  @input="emit('update:outfitCode', ($event.target as HTMLInputElement).value)"
                />
                <button
                  class="outfit-parse-submit"
                  type="submit"
                  :disabled="busy || !outfitCode.trim()"
                  ><ScanSearch :size="16" aria-hidden="true" />{{ messages.outfitSubmit }}</button
                >
              </div>
            </form>
          </div>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>
