<script setup lang="ts">
import { computed, onBeforeUnmount, ref, toRef, watch } from 'vue'
import { useBodyScrollLock } from '../utils/bodyScrollLock'
import { useModalFocus } from '../composables/useModalFocus'

const props = defineProps<{ visible: boolean; dismissed: boolean; language: 'zh' | 'en' }>()
const emit = defineEmits<{ confirm: [dontShowAgain: boolean] }>()
const panel = ref<HTMLElement | null>(null)
const dontShowAgain = ref(false)
const seconds = ref(10)
const active = toRef(props, 'visible')
const zh = computed(() => props.language === 'zh')
let deadline = 0
let timer: ReturnType<typeof setInterval> | undefined
useBodyScrollLock(active)
// Confirmation is required; Escape cannot dismiss this reminder.
useModalFocus(active, panel, () => {})
function stopTimer() {
  if (timer !== undefined) clearInterval(timer)
  timer = undefined
}
watch(
  active,
  (visible) => {
    stopTimer()
    if (!visible) return
    dontShowAgain.value = props.dismissed
    seconds.value = 10
    deadline = Date.now() + 10000
    timer = setInterval(() => {
      seconds.value = Math.max(0, Math.ceil((deadline - Date.now()) / 1000))
      if (!seconds.value) stopTimer()
    }, 250)
  },
  { immediate: true }
)
function confirm() {
  if (!props.visible || seconds.value > 0 || Date.now() < deadline) return
  emit('confirm', dontShowAgain.value)
}
onBeforeUnmount(stopTimer)
</script>

<template>
  <Teleport to="body">
    <Transition name="confirm-dialog" appear>
      <div
        v-if="visible"
        class="dialog-overlay data-storage-reminder"
        role="dialog"
        aria-modal="true"
        :aria-label="zh ? '数据保存提醒' : 'Data storage reminder'"
      >
        <section ref="panel" class="dialog-panel data-storage-reminder-panel" tabindex="-1">
          <header class="update-log-header">
            <h2>{{ zh ? '请注意保存你的数据' : 'Keep your data safe' }}</h2>
          </header>
          <div class="data-storage-reminder-body">
            <p>{{
              zh
                ? '暖立方的数据保存在你当前使用的浏览器中，包括搭配码、家园方案、相机参数收藏、共鸣记录、个人衣橱等。'
                : 'NikkiCube stores your data in the browser you are using, including outfits, home schemes, camera parameter favorites, resonance records and wardrobe data.'
            }}</p>
            <p class="data-storage-reminder-warning">{{
              zh
                ? '清除本站的浏览器数据（如“Cookie 和其他站点数据”）、使用清理工具、卸载浏览器，或点击网站内的“清除数据”，可能导致已保存内容丢失。'
                : 'Clearing this site’s browser data (such as cookies and other site data), using cleanup tools, uninstalling the browser, or selecting Clear data within this site may erase your saved content.'
            }}</p>

            <p class="data-storage-reminder-warning">{{
              zh
                ? '不同浏览器、浏览器用户配置和设备的数据独立保存，使用不同网址访问也可能显示不同的数据。切换前请先导出备份，再到新环境中导入。'
                : 'Data is stored separately for each browser, browser profile and device. Different website addresses may also show different data. Export a backup before switching, then import it in the new environment.'
            }}</p>
            <p>{{
              zh
                ? '请使用普通浏览窗口保存数据。无痕／隐私模式下的数据可能在关闭窗口后被清除；如开启了“退出浏览器时自动清除站点数据”，请将本站排除。'
                : 'Use a regular browser window to save data. Data in private browsing may be cleared when the window closes. If your browser clears site data on exit, exclude this site.'
            }}</p>
            <p
              ><strong>{{
                zh
                  ? '请定期通过“更多 → 导出全部数据”保存 ZIP 备份，并确认备份已下载到电脑或手机中。'
                  : 'Regularly save a ZIP backup through More → Export all data, and confirm it has downloaded to your computer or phone.'
              }}</strong
              >{{
                zh
                  ? ' 清理浏览器、重装系统或更换设备前，请将备份文件另存到安全位置。'
                  : ' Before clearing your browser, reinstalling your operating system or changing devices, keep a copy of the backup in a safe location.'
              }}</p
            >
          </div>
          <footer class="update-log-footer">
            <label class="app-checkbox-label"
              ><input
                v-model="dontShowAgain"
                class="app-checkbox"
                style="--checkbox-size: 18px"
                type="checkbox"
              />
              <span>{{ zh ? '不再提醒' : 'Do not show again' }}</span></label
            >
            <button type="button" class="primary-button" :disabled="seconds > 0" @click="confirm">
              {{
                seconds > 0
                  ? zh
                    ? `我已了解（${seconds} 秒）`
                    : `Understood (${seconds}s)`
                  : zh
                    ? '我已了解'
                    : 'Understood'
              }}
            </button>
          </footer>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.data-storage-reminder-panel {
  width: min(600px, 100%);
  max-height: calc(100dvh - 32px);
  display: flex;
  flex-direction: column;
  padding: 0;
  overflow: hidden;
}
.data-storage-reminder-panel:focus {
  outline: none;
}
.data-storage-reminder-panel h2 {
  font-size: 20px;
}
.data-storage-reminder-body {
  overflow-y: auto;
  padding: 4px 24px 16px;
  color: var(--text);
  font-size: 14px;
  line-height: 1.8;
}
.data-storage-reminder-body p {
  margin: 16px 0 0;
}
.data-storage-reminder-warning {
  color: #c62828;
  font-weight: 700;
}
:global(:root[data-theme='dark']) .data-storage-reminder-warning {
  color: #ff8a80;
}
.data-storage-reminder-body strong {
  color: var(--heading);
}
.data-storage-reminder-panel .primary-button:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
@media (max-width: 480px) {
  .data-storage-reminder-panel .update-log-header {
    padding: 16px;
  }
  .data-storage-reminder-body {
    padding: 0 16px 16px;
  }
  .data-storage-reminder-panel .update-log-footer {
    padding: 14px 16px;
    gap: 12px;
  }
}
</style>
