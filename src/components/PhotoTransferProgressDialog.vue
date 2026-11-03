<script setup lang="ts">
import { computed } from 'vue'
import { X } from 'lucide-vue-next'
import { useBodyScrollLock } from '../utils/bodyScrollLock'

const props = defineProps<{
  visible: boolean
  title: string
  completed: number
  total: number
  preparing: boolean
  failedNames: string[]
  isRunning: boolean
  isCancelled: boolean
  canCancel: boolean
  cancelLabel: string
  closeLabel: string
  failedLabel: string
  cancelledLabel: string
  closeActionLabel: string
}>()

const emit = defineEmits<{ cancel: []; close: [] }>()
useBodyScrollLock(computed(() => props.visible))

const percent = computed(() => {
  if (props.total === 0) return 0
  return Math.min(100, Math.round((props.completed / props.total) * 100))
})
</script>

<template>
  <Teleport to="body">
    <Transition name="confirm-dialog" appear @before-leave="el => el.setAttribute('inert', '')">
      <div
        v-if="visible"
        class="dialog-overlay photo-transfer-overlay"
        role="dialog"
        aria-modal="true"
        :aria-label="title"
      >
        <section class="dialog-panel photo-transfer-dialog">
          <header class="photo-transfer-header">
            <div>
              <h2>{{ title }}</h2>
            </div>
            <button
              v-if="!isRunning"
              type="button"
              class="confirm-dialog-close"
              :aria-label="closeLabel"
              @click="emit('close')"
              ><X :size="18"
            /></button>
          </header>
          <div
            v-if="!preparing"
            class="photo-transfer-progress"
            role="progressbar"
            :aria-valuemin="0"
            :aria-valuemax="100"
            :aria-valuenow="percent"
          >
            <div class="photo-transfer-progress-track progress-track"
              ><span class="progress-fill" :style="{ width: `${percent}%` }"></span
            ></div>
            <strong>{{ completed }} / {{ total }}</strong>
          </div>
          <p v-if="preparing" class="photo-transfer-summary">{{ title }}...</p>
          <p v-if="failedNames.length" class="photo-transfer-failures"
            >{{ failedLabel }}: {{ failedNames.slice(0, 4).join(', ')
            }}<template v-if="failedNames.length > 4"> (+{{ failedNames.length - 4 }})</template></p
          >
          <p v-if="isCancelled" class="photo-transfer-cancelled">{{ cancelledLabel }}</p>
          <footer class="photo-transfer-actions">
            <button
              v-if="isRunning && canCancel"
              type="button"
              class="confirm-dialog-button ghost"
              @click="emit('cancel')"
              >{{ cancelLabel }}</button
            >
            <button
              v-else-if="!isRunning"
              type="button"
              class="confirm-dialog-button primary"
              @click="emit('close')"
              >{{ closeActionLabel }}</button
            >
          </footer>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>
