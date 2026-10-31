<script setup lang="ts">
import { ScanSearch } from 'lucide-vue-next'
import type { usePhotoParseFailure } from '../composables/usePhotoParseFailure'
import type { PhotoParamsMessages } from '../i18n/messages/photoParams'
const props = defineProps<{
  state: ReturnType<typeof usePhotoParseFailure>
  error: string | null
  uidRequired: boolean
  result?: unknown
  messages: PhotoParamsMessages
}>()
const {
  showNonOriginalPhotoHint,
  uidInput,
  uidField,
  uidAttempt,
  uidParsing,
  uidFeedback,
  submitUid
} = props.state
</script>
<template>
  <div v-if="error || (uidAttempt && !result)" class="photo-params-error">
    <p v-if="error">{{ error }}</p>
    <p v-if="showNonOriginalPhotoHint" class="photo-params-original-hint">{{
      messages.nonOriginalPhotoHint
    }}</p>
    <p class="photo-params-original-hint photo-params-folder-hint">{{
      messages.originalFolderHint
    }}</p>
    <!-- uid 表单收进报错模块内部，跟随整体垂直居中，避免与报错区堆叠导致窗口出现滚动条。 -->
    <form
      v-if="!result && (uidRequired || uidAttempt)"
      class="photo-params-uid-form"
      :aria-busy="uidParsing"
      @submit.prevent="submitUid"
    >
      <label for="photo-params-uid-input">{{ messages.uidPrompt }}</label>
      <div>
        <input
          id="photo-params-uid-input"
          ref="uidField"
          v-model="uidInput"
          :disabled="uidParsing"
          :aria-invalid="uidFeedback ? 'true' : undefined"
          :aria-describedby="uidFeedback ? 'photo-params-uid-feedback' : undefined"
          @input="uidFeedback = ''"
          :placeholder="messages.uidPlaceholder"
          autocomplete="off"
        />
        <button
          type="submit"
          class="confirm-dialog-button primary"
          :disabled="uidParsing || !uidInput.trim()"
          ><ScanSearch :size="15" />{{
            uidParsing ? messages.uidParsing : messages.uidParse
          }}</button
        >
      </div>
      <p v-if="uidParsing" role="status" aria-live="polite">{{ messages.uidParsing }}</p>
      <p
        v-if="uidFeedback"
        id="photo-params-uid-feedback"
        :key="uidAttempt"
        class="photo-params-uid-feedback"
        role="alert"
        >{{ messages.uidRetryFailed }} {{ uidFeedback }}</p
      >
    </form>
  </div>
</template>
<style scoped>
.photo-params-original-hint {
  margin-top: 8px;
  color: var(--muted);
}
.photo-params-folder-hint {
  max-width: 560px;
  width: 100%;
}
</style>
