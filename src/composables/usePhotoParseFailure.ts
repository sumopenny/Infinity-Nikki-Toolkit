import { computed, nextTick, ref, watch } from 'vue'
import { needsOriginalPhotoHint } from '../utils/photo-params/parseError'
import type { PhotoParamsProgress, PhotoParamsResult } from '../utils/photo-params/types'
import type { PhotoParamsMessages } from '../i18n/messages/photoParams'
export function usePhotoParseFailure(
  props: {
    error: string | null
    errorCodes?: readonly string[]
    uidRequired: boolean
    progress: PhotoParamsProgress
    result?: PhotoParamsResult | null
    messages: PhotoParamsMessages
    resetKey?: unknown
  },
  onSubmit: (uid: string) => void
) {
  const emit = (_: 'submitUid', uid: string) => onSubmit(uid)
  const showNonOriginalPhotoHint = computed(() => needsOriginalPhotoHint(props.errorCodes ?? []))
  const uidInput = ref('')
  const uidField = ref<HTMLInputElement | null>(null)
  const uidAttempt = ref(0)
  const uidParsing = ref(false)
  const uidFeedback = ref('')
  function resetUidAttempt() {
    uidInput.value = ''
    uidAttempt.value = 0
    uidParsing.value = false
    uidFeedback.value = ''
  }
  watch(() => props.resetKey, resetUidAttempt)
  function submitUid() {
    if (uidParsing.value || !uidInput.value.trim()) return
    uidFeedback.value = ''
    uidAttempt.value += 1
    uidParsing.value = true
    emit('submitUid', uidInput.value.trim())
  }
  watch(
    () => [props.progress.stage, props.error] as const,
    async ([stage, error]) => {
      if (!uidParsing.value) return
      if (stage === 'ready') uidParsing.value = false
      if (stage !== 'error' || !error) return
      uidParsing.value = false
      uidFeedback.value = props.uidRequired ? props.messages.uidMismatch : error
      await nextTick()
      uidField.value?.focus()
    },
    { flush: 'post' }
  )

  return {
    showNonOriginalPhotoHint,
    uidInput,
    uidField,
    uidAttempt,
    uidParsing,
    uidFeedback,
    submitUid
  }
}
