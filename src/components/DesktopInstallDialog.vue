<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { Download, X } from 'lucide-vue-next'
import type { Language } from '../i18n/types'

interface InstallEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

defineProps<{ language: Language }>()
const dialog = ref<HTMLDialogElement | null>(null)
const guide = ref(false)
const nativePrompt = ref<InstallEvent | null>(null)
const pending = ref(false)
const installed = ref(false)
const isIos = /iPhone|iPad|iPod/i.test(navigator.userAgent)
const standalone = () => window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true
function available(event: Event) {
  // 不取消浏览器原生的自动安装提示，只保存事件供备用入口尝试调用。
  nativePrompt.value = event as InstallEvent
}
function close() { dialog.value?.close() }
function onInstalled() { installed.value = true; nativePrompt.value = null; close() }
async function open() {
  if (standalone() || installed.value) return
  guide.value = false
  await nextTick()
  if (!dialog.value?.open) dialog.value?.showModal()
}
async function add() {
  const event = nativePrompt.value
  if (!event) { guide.value = true; return }
  nativePrompt.value = null
  pending.value = true
  try {
    await event.prompt()
    if ((await event.userChoice).outcome === 'accepted') close()
    else guide.value = true
  } catch {
    guide.value = true
  }
  finally { pending.value = false }
}
onMounted(() => {
  window.addEventListener('beforeinstallprompt', available)
  window.addEventListener('appinstalled', onInstalled)
})
onBeforeUnmount(() => {
  window.removeEventListener('beforeinstallprompt', available)
  window.removeEventListener('appinstalled', onInstalled)
})
defineExpose({ open })
</script>

<template>
  <Teleport to="body">
    <dialog ref="dialog" class="desktop-install-dialog" :aria-label="language === 'zh' ? '将暖立方添加到桌面' : 'Add Nikki Toolkit to desktop'">
      <div class="desktop-install-body">
        <header>
          <img src="/pwa-192.png" width="52" height="52" alt="" />
          <div>
            <h2>{{ language === 'zh' ? '将暖立方添加到桌面' : 'Add Nikki Toolkit to desktop' }}</h2>
            <small>{{ language === 'zh' ? '无需下载安装包 · 打开更方便' : 'No app package needed · Easier access' }}</small>
          </div>
          <button type="button" class="desktop-install-close" :aria-label="language === 'zh' ? '关闭' : 'Close'" @click="close"><X :size="20" /></button>
        </header>
        <p>{{ language === 'zh'
          ? '将暖立方以轻量网页应用形式添加到手机或电脑桌面，点击图标即可快捷进入。支持的浏览器还能独立窗口打开，隐藏浏览器地址栏和工具栏。'
          : 'Add Nikki Toolkit to your phone or computer desktop as a lightweight web app. Supported browsers open it in a standalone window without browser toolbars.' }}</p>
        <p class="desktop-install-note">{{ language === 'zh'
          ? '这是网页应用，不需要下载 APK 或传统安装包。部分功能仍需联网；安装版与浏览器版的本地数据可能不共享，如有收藏数据请先进行数据备份或同步。'
          : 'This is a web app, not an APK. Some features need internet. Installed and browser storage can differ; back up or sync your data first.' }}</p>
        <p v-if="guide" class="desktop-install-guide" role="status">{{ isIos
          ? (language === 'zh' ? '在 Safari 中点击「分享」→「添加到主屏幕」，选择作为网页 App 打开。' : 'In Safari: Share → Add to Home Screen → Open as Web App.')
          : (language === 'zh' ? '打开浏览器菜单，选择「安装应用」或「添加到桌面」。若只创建普通快捷方式，可尝试 Chrome 或 Edge。' : 'Open the browser menu → Install app or Add to Home Screen. Try Chrome or Edge for standalone installation.') }}</p>
        <footer>
          <button type="button" class="desktop-install-secondary" @click="close">{{ language === 'zh' ? '稍后再说' : 'Later' }}</button>
          <button v-if="!guide" type="button" class="desktop-install-primary" :disabled="pending" @click="add"><Download :size="16" />{{ language === 'zh' ? '添加到桌面' : 'Add to desktop' }}</button>
        </footer>
      </div>
    </dialog>
  </Teleport>
</template>

<style scoped>
.desktop-install-dialog { position: fixed; inset: 0; width: min(440px, calc(100vw - 28px)); max-height: 85dvh; margin: auto; padding: 0; border: 1px solid var(--line); border-radius: var(--radius-lg); background: var(--surface-strong); color: var(--text); box-shadow: var(--dialog-shadow); }
.desktop-install-dialog::backdrop { background: var(--overlay-bg); }
.desktop-install-body { padding: 22px; font-size: 13px; line-height: 1.7; }
.desktop-install-body header { display: flex; align-items: center; gap: 12px; }
.desktop-install-body header img { border-radius: 12px; flex: none; }
.desktop-install-body h2 { margin: 0; font-size: 17px; color: var(--heading); }
.desktop-install-body small { color: var(--muted); }
.desktop-install-close { display: grid; flex: 0 0 32px; width: 32px; height: 32px; place-items: center; margin-left: auto; align-self: start; padding: 0; border: 0; border-radius: 50%; background: var(--icon-button-bg); color: var(--text); cursor: pointer; }
.desktop-install-close:hover { background: var(--icon-button-hover-bg); }
.desktop-install-body .desktop-install-close:focus-visible { outline: none; box-shadow: none; }
.desktop-install-body > p { margin: 16px 0; }
.desktop-install-note { border-top: 1px solid var(--line-soft); padding-top: 12px; color: var(--muted); }
.desktop-install-guide { padding: 10px; border-radius: var(--radius-sm); background: var(--surface-soft); }
.desktop-install-body footer { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 10px; margin-top: 18px; }
.desktop-install-body footer button { display: inline-flex; align-items: center; gap: 7px; padding: 10px 14px; border-radius: var(--radius-sm); cursor: pointer; font: inherit; }
.desktop-install-secondary { background: var(--surface); border: 1px solid var(--line); color: var(--heading); }
.desktop-install-primary { background: var(--primary-button-bg); border: 1px solid transparent; color: #fff; }
.desktop-install-primary:disabled { opacity: .6; cursor: wait; }
.desktop-install-body button:focus-visible { outline: 2px solid var(--pink-deep); outline-offset: 2px; }
</style>
