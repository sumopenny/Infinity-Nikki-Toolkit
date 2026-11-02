<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { X } from 'lucide-vue-next'
import type { WardrobeRegionConflict } from '../utils/backup/allDataBackup'
import type { WardrobeRegionScope } from '../utils/wardrobe/wardrobeRegion'
import { useBodyScrollLock } from '../utils/bodyScrollLock'
import { useModalFocus } from '../composables/useModalFocus'

const props = defineProps<{ conflict: WardrobeRegionConflict | null; language: 'zh' | 'en' }>()
const emit = defineEmits<{ confirm: [region: WardrobeRegionScope]; cancel: [] }>()
const selected = ref<WardrobeRegionScope | null>(null)
const panel = ref<HTMLElement | null>(null)
const visible = computed(() => props.conflict !== null)
const t = (zh: string, en: string) => (props.language === 'zh' ? zh : en)
const label = (scope: WardrobeRegionScope) =>
  scope === 'cn' ? t('国服', 'China') : t('国际服', 'Global')
watch(
  () => props.conflict,
  () => {
    selected.value = null
  }
)
useBodyScrollLock(visible)
useModalFocus(visible, panel, () => emit('cancel'))
</script>

<template>
  <Teleport to="body">
    <Transition name="confirm-dialog" appear @before-leave="el => el.setAttribute('inert', '')">
      <div
        v-if="conflict"
        class="dialog-overlay wardrobe-restore-region"
        role="dialog"
        aria-modal="true"
        aria-labelledby="wardrobe-restore-region-title"
        @click.self="emit('cancel')"
      >
        <section ref="panel" class="dialog-panel wardrobe-restore-region-panel" tabindex="-1">
          <header class="resonance-import-header">
            <h2 id="wardrobe-restore-region-title">{{
              t('确认衣橱展示区服', 'Choose wardrobe display region')
            }}</h2>
            <button type="button" :aria-label="t('关闭', 'Close')" @click="emit('cancel')"
              ><X :size="19"
            /></button>
          </header>
          <div class="wardrobe-restore-region-body">
            <p>{{
              t(
                '本地衣橱与备份的区服不同，请选择恢复后的展示区服。',
                'The local wardrobe and backup use different regions. Choose the display region after restoring.'
              )
            }}</p>
            <p
              >{{ t('本地：', 'Local: ') + label(conflict.local) }} ·
              {{ t('备份：', 'Backup: ') + label(conflict.incoming) }}</p
            >
            <div
              class="resonance-choice-row"
              role="group"
              :aria-label="t('最终展示区服', 'Final display region')"
            >
              <button
                v-for="scope in ['cn', 'global'] as const"
                :key="scope"
                type="button"
                class="resonance-choice"
                :aria-pressed="selected === scope"
                @click="selected = scope"
                >{{ label(scope) }}</button
              >
            </div>
            <p class="wardrobe-restore-region-hint">{{
              t(
                '合并后只展示所选区服的专属部件，其他区服部件记录仍会保留。取消将停止本次全部数据恢复。',
                'After merging, only exclusive items for the chosen region are shown. Records for other regions are kept. Cancel stops the entire restore.'
              )
            }}</p>
          </div>
          <footer class="resonance-import-footer">
            <button type="button" class="confirm-dialog-button ghost" @click="emit('cancel')">{{
              t('取消', 'Cancel')
            }}</button>
            <button
              type="button"
              class="primary-button"
              :disabled="selected === null"
              @click="selected && emit('confirm', selected)"
              >{{ t('确认区服并恢复', 'Confirm and restore') }}</button
            >
          </footer>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.wardrobe-restore-region {
  z-index: 1600;
}
.wardrobe-restore-region-panel {
  width: min(560px, calc(100vw - 28px));
  max-height: 90dvh;
  overflow-y: auto;
}
.wardrobe-restore-region-body {
  display: grid;
  gap: 16px;
  padding: 20px 26px;
  color: var(--text);
  font-size: 13px;
  line-height: 1.7;
}
.wardrobe-restore-region-body p {
  margin: 0;
}
.wardrobe-restore-region-hint {
  color: var(--muted);
  font-size: 12px;
}
.resonance-choice-row {
  width: 100%;
}
.resonance-choice {
  flex: 1;
  justify-content: center;
}
.resonance-import-footer {
  flex-wrap: wrap;
}
</style>
