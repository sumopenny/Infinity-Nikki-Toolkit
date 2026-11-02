<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import type { ImportPlan } from '../utils/photo-params/favorites'
import type { CameraChoices } from '../utils/backup/allDataBackup'
import { useBodyScrollLock } from '../utils/bodyScrollLock'
const props = defineProps<{
  plan: ImportPlan | null
  language: 'zh' | 'en'
  disabled?: boolean
  error?: string
}>()
const emit = defineEmits<{ confirm: [choices: CameraChoices]; cancel: [] }>()
const panel = ref<HTMLElement | null>(null),
  choices = ref<CameraChoices>({})
const visible = computed(() => Boolean(props.plan?.conflicts.length))
useBodyScrollLock(visible)
const t = (zh: string, en: string) => (props.language === 'zh' ? zh : en)
let previousFocus: HTMLElement | null = null
watch(
  () => props.plan,
  async (plan) => {
    if (!plan) {
      previousFocus?.focus()
      previousFocus = null
      return
    }
    previousFocus = document.activeElement as HTMLElement | null
    choices.value = Object.fromEntries(plan.conflicts.map((record) => [record.id, 'local']))
    await nextTick()
    panel.value?.querySelector<HTMLElement>('button')?.focus()
  },
  { immediate: true }
)
onBeforeUnmount(() => previousFocus?.focus())
function chooseAll(value: 'local' | 'incoming') {
  choices.value = Object.fromEntries(props.plan!.conflicts.map((record) => [record.id, value]))
}
function keydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && !props.disabled) {
    event.preventDefault()
    event.stopPropagation()
    emit('cancel')
  }
  if (event.key !== 'Tab' || !panel.value) return
  const controls = [
    ...panel.value.querySelectorAll<HTMLElement>('button:not(:disabled), select:not(:disabled)')
  ]
  const first = controls[0],
    last = controls[controls.length - 1]
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last?.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first?.focus()
  }
}
</script>
<template>
  <Teleport to="body">
    <Transition name="confirm-dialog" appear @before-leave="el => el.setAttribute('inert', '')">
      <div v-if="visible && plan" class="dialog-overlay camera-conflict-overlay" @keydown="keydown">
        <section
          ref="panel"
          class="dialog-panel camera-conflict-panel"
          role="dialog"
          aria-modal="true"
          aria-labelledby="camera-import-title"
        >
          <header
            ><h2 id="camera-import-title">{{
              t('处理导入冲突', 'Resolve import conflicts')
            }}</h2></header
          >
          <p>{{
            t(
              '以下相机参数记录 ID 相同但内容不同。请选择保留哪份；参数码重复的其他记录将跳过。',
              'These camera records have matching IDs but different content. Choose a version; other duplicate codes are skipped.'
            )
          }}</p>
          <div class="camera-conflict-tools"
            ><button type="button" :disabled="disabled" @click="chooseAll('local')">{{
              t('全部保留本地', 'Keep all local')
            }}</button
            ><button type="button" :disabled="disabled" @click="chooseAll('incoming')">{{
              t('全部使用导入', 'Use all imported')
            }}</button></div
          >
          <label v-for="item in plan.conflicts" :key="item.id" class="camera-conflict-row">
            <span
              >{{ item.name
              }}<small
                >{{ t('本地', 'Local') }}:
                {{ plan.base.find((record) => record.id === item.id)?.name }} ·
                {{ plan.base.find((record) => record.id === item.id)?.updatedAt }}<br />{{
                  t('导入', 'Imported')
                }}: {{ item.updatedAt }}</small
              ></span
            >
            <select v-model="choices[item.id]" :disabled="disabled"
              ><option value="local">{{ t('保留本地', 'Keep local') }}</option
              ><option value="incoming">{{ t('使用导入', 'Use imported') }}</option></select
            >
          </label>
          <p v-if="error" role="alert">{{ error }}</p>
          <footer
            ><button type="button" :disabled="disabled" @click="emit('cancel')">{{
              t('取消', 'Cancel')
            }}</button
            ><button
              type="button"
              class="primary-button"
              :disabled="disabled"
              @click="emit('confirm', { ...choices })"
              >{{ t('确认导入', 'Import') }}</button
            ></footer
          >
        </section>
      </div>
    </Transition>
  </Teleport>
</template>
<style scoped>
.camera-conflict-overlay {
  z-index: 1600;
}
.camera-conflict-panel {
  width: min(740px, calc(100vw - 28px));
  max-height: 90dvh;
  overflow: auto;
  padding: 24px;
  box-sizing: border-box;
  border-radius: 20px;
  background: var(--surface-strong);
  color: var(--text);
}
h2 {
  font-size: 21px;
  margin: 0;
}
p {
  font-size: 13px;
  line-height: 1.6;
}
button,
select {
  border: 1px solid var(--line);
  border-radius: 9px;
  padding: 9px 13px;
  background: var(--surface-strong);
  color: var(--text);
  font: inherit;
}
button {
  cursor: pointer;
}
button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
button.primary-button {
  background: var(--pink-deep);
  color: white;
  border-color: var(--pink-deep);
}
.camera-conflict-tools {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin: 16px 0;
}
.camera-conflict-row {
  display: flex;
  gap: 16px;
  justify-content: space-between;
  padding: 12px 0;
  border-bottom: 1px solid var(--line);
  font-size: 12px;
}
.camera-conflict-row > span {
  min-width: 0;
  overflow-wrap: anywhere;
}
small {
  display: block;
  color: var(--muted);
  font-size: 10px;
  margin-top: 6px;
}
select {
  max-width: 150px;
}
footer {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  border-top: 1px solid var(--line);
  margin-top: 24px;
  padding-top: 18px;
}
@media (max-width: 560px) {
  .camera-conflict-panel {
    padding: 18px;
  }
  .camera-conflict-row {
    flex-wrap: wrap;
  }
}
</style>
