<script setup lang="ts">
import { computed, ref, toRef } from 'vue'
import { X } from 'lucide-vue-next'
import { useModalFocus } from '../composables/useModalFocus'
import consoleScript from '../features/edge-directory-repair/console-script.txt?raw'
import { useBodyScrollLock } from '../utils/bodyScrollLock'
import { copyTextToClipboard } from '../utils/clipboard'

const props = defineProps<{ visible: boolean; language: 'zh' | 'en' }>()
const emit = defineEmits<{ close: []; afterClose: [] }>()
const visible = toRef(props, 'visible')
const panel = ref<HTMLElement | null>(null)
const codeField = ref<HTMLTextAreaElement | null>(null)
const copyState = ref<'ready' | 'copied' | 'failed'>('ready')
const script = consoleScript.replace(/\r\n/g, '\n').trimEnd()
const text = computed(() =>
  props.language === 'zh'
    ? {
        title: '目录加载修复教程',
        intro:
          '如果目录一直显示正在加载，或部分按钮无法点击，可以按下面的步骤重置目录状态。如果使用正常，可忽略并关闭本窗口。关闭后不再自动弹出，可从「更多 → 应用维护 → 目录加载修复教程」重新打开。',
        open: '在当前暖立方页面打开浏览器的「控制台（Console）」。不会打开的话，可搜索「你的浏览器名称 + 怎么打开控制台」。',
        paste: '点击「一键复制代码」，粘贴到控制台并按回车。',
        refresh: '看到「清理完成」后，刷新当前页面。',
        code: '目录修复代码',
        copy: '一键复制代码',
        copied: '已复制',
        failed: '未能自动复制，已选中代码，请手动复制。',
        close: '关闭'
      }
    : {
        title: 'Folder loading repair guide',
        intro:
          'If folder loading never finishes or buttons are disabled, follow these steps to reset saved folder state. If everything works, you can ignore and close this guide. It will not pop up again, but you can reopen it from More → App maintenance → Folder loading repair guide.',
        open: 'Open your browser’s Console on this Nikki Toolkit page. If you are unsure how, search for “how to open the Console” with your browser name.',
        paste: 'Click “Copy code”, paste it into the Console, and press Enter.',
        refresh: 'Refresh this page when the Console shows “清理完成” (cleanup complete).',
        code: 'Folder repair code',
        copy: 'Copy code',
        copied: 'Copied',
        failed: 'Automatic copy failed. The code is selected so you can copy it manually.',
        close: 'Close'
      }
)

const close = () => emit('close')
useBodyScrollLock(visible)
useModalFocus(visible, panel, close)

async function copyCode() {
  if (await copyTextToClipboard(script)) {
    copyState.value = 'copied'
  } else {
    copyState.value = 'failed'
    codeField.value?.focus()
    codeField.value?.select()
  }
}
</script>

<template>
  <Teleport to="body">
    <Transition name="confirm-dialog" appear @after-leave="emit('afterClose')">
      <div
        v-if="visible"
        class="dialog-overlay update-log-dialog"
        role="dialog"
        aria-modal="true"
        :aria-label="text.title"
        @click.self="close"
      >
        <section ref="panel" class="dialog-panel update-log-panel repair-panel" tabindex="-1">
          <header class="update-log-header">
            <h2>{{ text.title }}</h2>
            <button
              class="update-log-close-button"
              type="button"
              :title="text.close"
              :aria-label="text.close"
              @click="close"
              ><X :size="19" aria-hidden="true"
            /></button>
          </header>
          <div class="update-log-body repair-body">
            <p>{{ text.intro }}</p>
            <ol>
              <li>{{ text.open }}</li>
              <li>{{ text.paste }}</li>
              <li>{{ text.refresh }}</li>
            </ol>
            <textarea
              ref="codeField"
              class="repair-code"
              :aria-label="text.code"
              :value="script"
              tabindex="0"
              wrap="off"
              readonly
            ></textarea>
          </div>
          <footer class="update-log-footer">
            <span role="status">{{
              copyState === 'copied' ? text.copied : copyState === 'failed' ? text.failed : ''
            }}</span>
            <button class="primary-button" type="button" @click="copyCode">{{ text.copy }}</button>
          </footer>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.repair-panel {
  width: min(720px, 100%);
  height: auto;
}
.repair-body {
  display: grid;
  align-content: start;
  gap: 12px;
}
.repair-body p,
.repair-body ol {
  margin: 0;
}
.repair-body ol {
  padding-inline-start: 1.5em;
}
.repair-code {
  box-sizing: border-box;
  display: block;
  width: 100%;
  height: 200px;
  padding: 12px;
  overflow: auto;
  overscroll-behavior: contain;
  resize: none;
  border: 1px solid var(--line-soft);
  border-radius: 10px;
  background: var(--icon-button-bg);
  color: var(--text);
  font:
    13px/1.5 ui-monospace,
    Consolas,
    monospace;
  user-select: text;
}
</style>
