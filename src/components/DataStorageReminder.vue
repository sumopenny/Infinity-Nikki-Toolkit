<script setup lang="ts">
import { computed, ref, toRef, watch } from 'vue'
import { useBodyScrollLock } from '../utils/bodyScrollLock'
import { useModalFocus } from '../composables/useModalFocus'

const props = defineProps<{
  visible: boolean
  dismissed: boolean
  language: 'zh' | 'en'
  canAutoBackup: boolean
}>()
const emit = defineEmits<{ close: [dismissed: boolean] }>()
const panel = ref<HTMLElement | null>(null)
const dismissed = ref(false)
const visible = toRef(props, 'visible')
const t = (zh: string, en: string) => (props.language === 'zh' ? zh : en)
const title = computed(() => t('数据保存提醒', 'Data storage reminder'))
function close() {
  emit('close', dismissed.value)
}
useBodyScrollLock(visible)
useModalFocus(visible, panel, close)
watch(
  visible,
  (open) => {
    if (open) dismissed.value = props.dismissed
  },
  { immediate: true }
)
</script>

<template>
  <Teleport to="body">
    <Transition name="confirm-dialog" appear>
      <div
        v-if="visible"
        class="confirm-dialog"
        role="dialog"
        aria-modal="true"
        :aria-label="title"
      >
        <section ref="panel" class="confirm-dialog-panel data-storage-reminder-panel" tabindex="-1">
          <header class="update-log-header"
            ><h2>{{ title }}</h2></header
          >
          <div class="confirm-dialog-content">
            <p>
              {{ t('数据保存在当前浏览器，', 'Data is saved in this browser. ') }}
              <strong class="data-storage-reminder-warning">{{
                t(
                  '清除浏览器数据，或使用清理工具，可能导致已保存的网站数据丢失。',
                  'Clearing browser data or using cleanup tools may erase your saved site data.'
                )
              }}</strong>
            </p>
            <template v-if="canAutoBackup">
              <p>
                <strong class="data-storage-reminder-warning">{{
                  t(
                    '建议在左侧「数据备份」开启自动备份',
                    'Enable automatic backups in Data backup in the sidebar'
                  )
                }}</strong
                >{{
                  t(
                    '，支持搭配码、家园方案和相机收藏。',
                    ' for outfits, home schemes, and camera favorites.'
                  )
                }}
              </p>
              <p>{{
                t(
                  '换设备或重要修改前，请通过「更多 → 导出全部数据」另存备份。自动备份会同步删除操作。',
                  'Before switching devices or making important changes, save a separate backup via More → Export all data. Automatic backups also sync deletions.'
                )
              }}</p>
            </template>
            <p v-else>
              <strong class="data-storage-reminder-warning">{{
                t(
                  '请定期通过「更多 → 导出全部数据」保存备份',
                  'Regularly save a backup via More → Export all data'
                )
              }}</strong
              >{{
                t(
                  '，换浏览器或设备后可重新导入。',
                  '. Import it when switching browsers or devices.'
                )
              }}
            </p>
            <p>{{ t('请勿使用无痕模式保存数据。', 'Avoid saving data in private browsing.') }}</p>
          </div>
          <footer class="update-log-footer">
            <label class="app-checkbox-label"
              ><input v-model="dismissed" type="checkbox" class="app-checkbox" /><span>{{
                t('不再提醒', 'Do not show again')
              }}</span></label
            >
            <button type="button" class="primary-button" @click="close">{{
              t('我已了解', 'Understood')
            }}</button>
          </footer>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.data-storage-reminder-panel {
  width: min(600px, 100%);
  padding: 0;
}
.data-storage-reminder-panel h2 {
  font-size: 20px;
}
.data-storage-reminder-panel .confirm-dialog-content {
  padding: 20px 24px;
}
.data-storage-reminder-panel p + p {
  margin-top: 12px;
}
.data-storage-reminder-panel .data-storage-reminder-warning {
  color: #c62828;
  font-weight: 700;
}
:global(:root[data-theme='dark']) .data-storage-reminder-panel .data-storage-reminder-warning {
  color: #ff8a80;
}
.data-storage-reminder-panel .update-log-footer {
  flex-wrap: wrap;
  gap: 16px;
}
</style>
