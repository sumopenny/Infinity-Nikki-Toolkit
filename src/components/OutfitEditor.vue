<script setup lang="ts">
import { reportError as captureDiagnosticError } from '../utils/errorReporting/errorReporter'
import { validateSelectedImage } from '../utils/imageSelection'
import { parseSourceUrl } from '../utils/outfit/outfitSourceUrl'
import type { SaveOutfitInput } from '../utils/outfit/outfitTypes'
import { computed, nextTick, onBeforeUnmount, ref, toRef, watch } from 'vue'
import { ImagePlus, Plus, Upload, X } from 'lucide-vue-next'
import type { OutfitMessages } from '../i18n'
import {
  MAX_OUTFIT_CODE_LENGTH,
  MAX_OUTFIT_NOTE_LENGTH,
  MAX_OUTFIT_TAG_LENGTH,
  MAX_OUTFIT_TAGS,
  normalizeOutfitCode,
  type OutfitItem
} from '../utils/outfit/outfitFileSystem'
import { snapshotImageFile } from '../utils/image'
import { readPhotoBlob } from '../utils/file-system/photoUrl'
import { useCompactLayout } from '../composables/useCompactLayout'
import { useBodyScrollLock } from '../utils/bodyScrollLock'

const props = defineProps<{
  visible: boolean
  outfit: OutfitItem | null
  tags: string[]
  busy: boolean
  selectionBusy?: boolean
  messages: OutfitMessages
}>()

const emit = defineEmits<{
  close: []
  save: [input: Omit<SaveOutfitInput, 'outfit'>]
  addTag: [tag: string]
}>()

const fileInput = ref<HTMLInputElement | null>(null)
const panelRef = ref<HTMLElement | null>(null)
const imageFile = ref<File | undefined>()
const compact = useCompactLayout()
const imageReading = ref(false)
const imageReadFailed = ref(false)
// 图片选择只更改编辑器内存草稿；后台读库仍阻止提交，但不丢弃选择器返回的文件。
const isSelectionBlocked = computed(() => props.selectionBusy ?? props.busy)
const previewUrl = ref<string | null>(null)
const code = ref('')
const note = ref('')
const sourceUrl = ref('')
const sourceError = ref('')

function validateSourceUrl() {
  const result = parseSourceUrl(sourceUrl.value)
  sourceError.value =
    result.error === 'multiple'
      ? props.messages.sourceMultiple
      : result.error
        ? props.messages.sourceInvalid
        : ''
  if (result.error) return false
  sourceUrl.value = result.url
  return true
}

function pasteSourceUrl(event: ClipboardEvent) {
  const text = event.clipboardData?.getData('text/plain')
  if (!text) return
  event.preventDefault()
  sourceUrl.value = text
  validateSourceUrl()
}
const selectedTag = ref<string | null>(null)
const errorMessage = ref('')
const isDragging = ref(false)
const isAddingTag = ref(false)
const tagInput = ref('')
const addTagToggleRef = ref<HTMLButtonElement | null>(null)
const tagEditorRef = ref<HTMLFormElement | null>(null)
const tagInputRef = ref<HTMLInputElement | null>(null)
const tagEditorPosition = ref({ top: '0px', left: '0px' })
const editorOverlayRef = ref<HTMLElement | null>(null)
let previousActiveElement: HTMLElement | null = null
let previewRequestId = 0

const hasImage = computed(() => Boolean(imageFile.value || props.outfit?.image))
useBodyScrollLock(toRef(props, 'visible'))

function revokePreview() {
  previewRequestId += 1
  imageReading.value = false
  imageReadFailed.value = false
  imageFile.value = undefined
  if (previewUrl.value?.startsWith('blob:')) URL.revokeObjectURL(previewUrl.value)
  previewUrl.value = null
}

async function resetForm() {
  revokePreview()
  const requestId = previewRequestId
  const outfit = props.outfit
  imageFile.value = undefined
  code.value = outfit?.code ?? ''
  note.value = outfit?.note ?? ''
  sourceUrl.value = outfit?.sourceUrl ?? ''
  sourceError.value = ''
  selectedTag.value = outfit?.tags[0] ?? null
  errorMessage.value = ''
  isDragging.value = false
  if (outfit?.image) {
    try {
      const file = await readPhotoBlob(outfit)
      if (requestId !== previewRequestId || !props.visible || props.outfit !== outfit) return
      previewUrl.value = URL.createObjectURL(file)
    } catch (error) {
      if (requestId !== previewRequestId || !props.visible || props.outfit !== outfit) return
      captureDiagnosticError(error, {
        module: 'outfits',
        action: 'load-editor-image',
        stage: 'preview'
      })
      errorMessage.value = props.messages.imageLoadFailed
    }
  }
}

// 移动布局立即复制字节以避开原文件引用失效；桌面保留原文件；两端均先验证预览再替换。
async function selectFile(file: File | undefined) {
  if (!file || isSelectionBlocked.value) {
    return
  }
  // 保留上一张可用图片，只有新图片读取成功后才替换。
  previewRequestId += 1
  imageReadFailed.value = false
  imageReading.value = false
  const requestId = previewRequestId
  imageReading.value = true
  errorMessage.value = ''
  try {
    const snapshot = compact.value ? await snapshotImageFile(file) : file

    await validateSelectedImage(snapshot)
    if (requestId !== previewRequestId || !props.visible) {
      return
    }
    if (previewUrl.value?.startsWith('blob:')) URL.revokeObjectURL(previewUrl.value)
    imageFile.value = snapshot
    previewUrl.value = URL.createObjectURL(snapshot)
  } catch (error) {
    if (requestId !== previewRequestId || !props.visible) return
    captureDiagnosticError(error, {
      module: 'outfits',
      action: 'select-image',
      stage: 'preview',
      context: { mimeType: file.type, sizeBytes: file.size }
    })
    imageReadFailed.value = true
    errorMessage.value = `${props.messages.imageLoadFailed}. ${error instanceof Error ? error.message : String(error)}`
  } finally {
    if (requestId === previewRequestId) imageReading.value = false
  }
}

// 清空 input 值，使失败后重新选择同一个文件也能触发 change。
function handleImageSelection(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  void selectFile(file)
  input.value = ''
}

// 预览失败显示普通错误提示，保留当前草稿供用户重新选择。
function handlePreviewError() {
  if (!props.visible) return
  captureDiagnosticError(new Error('Image preview failed'), {
    module: 'outfits',
    action: 'preview-image',
    stage: 'preview-element',
    code: 'IMAGE_PREVIEW_FAILED',
    context: { mimeType: imageFile.value?.type ?? null, sizeBytes: imageFile.value?.size ?? null }
  })
  errorMessage.value = props.messages.imageLoadFailed
}

function handleDrop(event: DragEvent) {
  isDragging.value = false
  selectFile(event.dataTransfer?.files[0])
}

function handlePaste(event: ClipboardEvent) {
  if (!props.visible) return
  const file = [...(event.clipboardData?.files ?? [])].find((item) =>
    item.type.startsWith('image/')
  )
  if (file) selectFile(file)
}

function handleKeydown(event: KeyboardEvent) {
  if (props.visible && !props.busy && event.key === 'Escape') {
    if (isAddingTag.value) closeTagInput()
    else emit('close')
  }
  if (!props.visible || event.key !== 'Tab' || !panelRef.value) return
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

function updateCode(event: Event) {
  code.value = normalizeOutfitCode((event.target as HTMLInputElement).value)
}

function updateTagEditorPosition() {
  const toggle = addTagToggleRef.value
  if (!toggle) return
  const rect = toggle.getBoundingClientRect()
  const width = Math.min(260, window.innerWidth - 24)
  tagEditorPosition.value = {
    top: `${Math.max(12, Math.min(rect.top, window.innerHeight - 64))}px`,
    left: `${Math.max(12, Math.min(rect.right + 8, window.innerWidth - width - 12))}px`
  }
}

function openTagInput() {
  isAddingTag.value = true
  void nextTick(() => {
    updateTagEditorPosition()
    tagInputRef.value?.focus()
  })
}

function closeTagInput() {
  isAddingTag.value = false
  tagInput.value = ''
}

function submitTag() {
  emit('addTag', tagInput.value)
}

function selectCreatedTag(tag: string) {
  selectedTag.value = tag
  closeTagInput()
}

function handleDocumentPointerDown(event: PointerEvent) {
  if (!isAddingTag.value || !(event.target instanceof Node)) return
  if (event.target === editorOverlayRef.value) return
  if (addTagToggleRef.value?.contains(event.target) || tagEditorRef.value?.contains(event.target))
    return
  closeTagInput()
}

function handleEditorBackdropClick() {
  if (isAddingTag.value) closeTagInput()
  else emit('close')
}

defineExpose({ selectCreatedTag })

function submit() {
  if (props.busy || imageReading.value || (imageReadFailed.value && !hasImage.value)) return
  if (!hasImage.value && !normalizeOutfitCode(code.value)) {
    errorMessage.value = props.messages.imageRequired
    return
  }
  if (!validateSourceUrl()) return
  emit('save', {
    imageFile: imageFile.value,
    code: code.value,
    tag: selectedTag.value,
    note: note.value,
    sourceUrl: sourceUrl.value
  })
}

// 打开编辑器时锁定背景滚动，关闭后恢复进入前状态，兼容从大图预览叠加打开。
watch(
  () => props.visible,
  (visible) => {
    if (visible) {
      previousActiveElement =
        document.activeElement instanceof HTMLElement ? document.activeElement : null
      void resetForm()
      // 初始焦点放在面板上，避免自动进入搭配码输入框或唤起手机键盘。
      void nextTick(() => {
        if (props.visible) panelRef.value?.focus({ preventScroll: true })
      })
    } else {
      closeTagInput()
      revokePreview()
      previousActiveElement?.focus()
      previousActiveElement = null
    }
  },
  { immediate: true }
)

// 同一弹窗切换记录时重置表单，使旧读取任务失效。
watch(
  () => props.outfit,
  () => {
    if (props.visible) void resetForm()
  }
)

window.addEventListener('paste', handlePaste)
window.addEventListener('keydown', handleKeydown)
document.addEventListener('pointerdown', handleDocumentPointerDown)
window.addEventListener('resize', updateTagEditorPosition)
window.addEventListener('scroll', updateTagEditorPosition, true)
onBeforeUnmount(() => {
  window.removeEventListener('paste', handlePaste)
  window.removeEventListener('keydown', handleKeydown)
  document.removeEventListener('pointerdown', handleDocumentPointerDown)
  window.removeEventListener('resize', updateTagEditorPosition)
  window.removeEventListener('scroll', updateTagEditorPosition, true)
  revokePreview()
})
</script>

<template>
  <Teleport to="body">
    <Transition name="confirm-dialog" appear>
      <div
        ref="editorOverlayRef"
        v-if="visible"
        class="outfit-editor"
        role="dialog"
        aria-modal="true"
        :aria-label="messages.editTitle"
        @click.self="handleEditorBackdropClick"
      >
        <section ref="panelRef" class="outfit-editor-panel" tabindex="-1">
          <header>
            <h2>{{ messages.editTitle }}</h2>
            <button
              type="button"
              :title="messages.cancel"
              :aria-label="messages.cancel"
              :disabled="busy"
              @click="$emit('close')"
            >
              <X :size="19" aria-hidden="true" />
            </button>
          </header>

          <div class="outfit-editor-content">
            <div class="outfit-image-column">
              <label>{{ messages.imageLabel }}</label>
              <button
                class="outfit-image-dropzone"
                :class="{ 'is-dragging': isDragging, 'has-preview': previewUrl }"
                type="button"
                :disabled="isSelectionBlocked"
                @click="fileInput?.click()"
                @dragenter.prevent="isDragging = true"
                @dragover.prevent="isDragging = true"
                @dragleave.prevent="isDragging = false"
                @drop.prevent="handleDrop"
              >
                <img v-if="previewUrl" :src="previewUrl" alt="" @error="handlePreviewError" />
                <span v-else class="outfit-image-prompt"
                  ><ImagePlus :size="30" aria-hidden="true" />{{ messages.imageHint }}</span
                >
                <span v-if="previewUrl" class="outfit-replace-image"
                  ><Upload :size="15" aria-hidden="true" />{{ messages.replaceImage }}</span
                >
              </button>
              <p
                v-if="imageReading || imageReadFailed"
                class="outfit-editor-error"
                role="status"
                aria-live="polite"
              >
                {{ imageReading ? messages.imageReading : messages.imageLoadFailed }}
              </p>
              <input
                ref="fileInput"
                class="visually-hidden"
                type="file"
                accept="image/*"
                @change="handleImageSelection"
              />
            </div>

            <div class="outfit-fields">
              <label for="outfit-code">{{ messages.codeLabel }}</label>
              <input
                id="outfit-code"
                :value="code"
                :maxlength="MAX_OUTFIT_CODE_LENGTH"
                :placeholder="messages.codePlaceholder"
                :disabled="busy"
                autocomplete="off"
                @input="updateCode"
              />

              <label for="outfit-source-url">{{ messages.sourceLabel }}</label>
              <input
                id="outfit-source-url"
                v-model="sourceUrl"
                :placeholder="messages.sourcePlaceholder"
                :disabled="busy"
                :aria-invalid="Boolean(sourceError)"
                :aria-describedby="sourceError ? 'outfit-source-error' : undefined"
                autocomplete="off"
                inputmode="url"
                @input="sourceError = ''"
                @paste="pasteSourceUrl"
                @blur="validateSourceUrl"
              />
              <p
                v-if="sourceError"
                id="outfit-source-error"
                class="outfit-editor-error"
                role="alert"
                >{{ sourceError }}</p
              >

              <label for="outfit-note">{{ messages.noteLabel }}</label>
              <input
                id="outfit-note"
                v-model="note"
                :maxlength="MAX_OUTFIT_NOTE_LENGTH"
                :placeholder="messages.notePlaceholder"
                :disabled="busy"
                autocomplete="off"
              />

              <fieldset>
                <legend>{{ messages.tagLabel }}</legend>
                <div class="outfit-tag-choices">
                  <button
                    v-for="tag in tags"
                    :key="tag"
                    type="button"
                    :class="{ active: selectedTag === tag }"
                    :aria-pressed="selectedTag === tag"
                    :disabled="busy"
                    @click="selectedTag = selectedTag === tag ? null : tag"
                  >
                    {{ tag }}
                  </button>
                  <button
                    ref="addTagToggleRef"
                    class="outfit-editor-add-tag"
                    type="button"
                    :title="messages.addTag"
                    :aria-label="messages.addTag"
                    :disabled="busy || tags.length >= MAX_OUTFIT_TAGS"
                    @click="isAddingTag ? closeTagInput() : openTagInput()"
                  >
                    <Plus
                      class="tag-toggle-icon"
                      :class="{ 'is-open': isAddingTag }"
                      :size="15"
                      aria-hidden="true"
                    />
                  </button>
                </div>
                <p v-if="!tags.length">{{ messages.noTag }}</p>
                <Teleport to="body">
                  <Transition name="outfit-tag-editor">
                    <form
                      v-if="isAddingTag"
                      ref="tagEditorRef"
                      class="outfit-tag-editor outfit-tag-editor-popover"
                      :style="tagEditorPosition"
                      @submit.prevent="submitTag"
                    >
                      <input
                        ref="tagInputRef"
                        v-model="tagInput"
                        :maxlength="MAX_OUTFIT_TAG_LENGTH"
                        :placeholder="messages.tagPlaceholder"
                        :disabled="busy"
                        autocomplete="off"
                      />
                      <button type="submit" :disabled="busy">{{ messages.confirmAddTag }}</button>
                    </form>
                  </Transition>
                </Teleport>
              </fieldset>
              <p v-if="errorMessage" class="outfit-editor-error" role="alert">{{ errorMessage }}</p>
            </div>
          </div>

          <footer>
            <button
              class="confirm-dialog-button ghost"
              type="button"
              :disabled="busy"
              @click="$emit('close')"
              >{{ messages.cancel }}</button
            >
            <button
              class="confirm-dialog-button primary"
              type="button"
              :disabled="busy || imageReading || (imageReadFailed && !hasImage)"
              @click="submit"
            >
              {{ imageReading ? messages.imageReading : busy ? messages.saving : messages.confirm }}
            </button>
          </footer>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>
