<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import { ChevronDown, Download, X } from 'lucide-vue-next'
import type { Language } from '../i18n/types'

interface InstallEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

defineProps<{ language: Language }>()
const dialog = ref<HTMLDialogElement | null>(null)
const nativePrompt = shallowRef<InstallEvent | null>(null)
const pending = ref(false)
const installed = ref(window.matchMedia?.('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true)
const mobileDevice = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
const expandedMobile = ref<boolean | null>(mobileDevice)
const guides = [
  { mobile: true, zh: 'iPhone / iPad · Safari', en: 'iPhone / iPad · Safari',
    steps: '在 Safari 工具栏找到「分享」，选择「添加到主屏幕」。如果看到「作为网页 App 打开」，保持开启，再点「添加」。',
    english: 'Open Share in the Safari toolbar and choose Add to Home Screen. If Open as Web App appears, leave it on, then tap Add.' },
  { mobile: true, zh: '安卓 · Chrome、Edge 等 Chromium 浏览器', en: 'Android · Chromium browsers such as Chrome and Edge',
    steps: '打开浏览器工具栏里的菜单，找「安装应用」或「添加到主屏幕」。如果浏览器已弹出安装提示，直接确认即可。',
    english: 'Open the browser toolbar menu and look for Install app or Add to Home screen. If an install prompt is already showing, confirm it.' },
  { mobile: true, zh: '安卓 · 其他浏览器', en: 'Android · Other browsers',
    steps: '在浏览器菜单里找「安装应用」或「添加到桌面」。有些浏览器只能创建快捷方式，打开后仍会显示地址栏。想用独立窗口，可以试试 Chrome、Edge 等采用 Chromium 内核的浏览器。',
    english: 'Look for Install app or Add to Home screen in the browser menu. Some browsers only create a shortcut that keeps the address bar. For a separate window, try a Chromium browser such as Chrome or Edge.' },
  { mobile: false, zh: '电脑 · Chrome', en: 'Desktop · Chrome',
    steps: '点击地址栏右侧的安装图标，也可以打开「⋮ → 投放、保存和分享 → 将网页安装为应用」。',
    english: 'Click the install icon in the address bar, or open the three-dot menu and choose Cast, save, and share → Install page as app.' },
  { mobile: false, zh: '电脑 · Edge', en: 'Desktop · Edge',
    steps: '点击地址栏右侧的「应用可用」图标，在弹出的窗口中选择「安装」。',
    english: 'Click the App available icon in the address bar, then choose Install.' },
  { mobile: false, zh: 'Mac · Safari', en: 'Mac · Safari',
    steps: '在 macOS 14 或更高版本中，打开「文件 → 添加到程序坞」。以后点击程序坞里的暖立方图标即可打开。',
    english: 'On macOS 14 or later, choose File → Add to Dock. Open Nikki Toolkit from the Dock next time.' },
  { mobile: false, zh: 'Windows · Firefox', en: 'Windows · Firefox',
    steps: '如果地址栏显示「网页应用」按钮，点击即可安装。之后可以从开始菜单打开，也可以固定到任务栏。',
    english: 'If the web apps button appears in the address bar, click it to install. Open the app from Start or pin it to the taskbar.' },
  { mobile: false, zh: 'Windows · 其他浏览器', en: 'Windows · Other browsers',
    steps: '先看地址栏右侧有没有安装图标，再到浏览器右上角菜单找「安装应用」或「将此网站安装为应用」。如果只有「创建快捷方式」，打开后可能仍是普通标签页。想用独立窗口，可以用 Chrome 或 Edge 打开暖立方，再点地址栏的安装图标。',
    english: 'Look for an install icon in the address bar or Install app in the browser menu. A shortcut may still open in a regular tab. For a separate window, open Nikki Toolkit in Chrome or Edge and use the address bar install icon.' }
]
function available(event: Event) {
  // 不取消浏览器原生的自动安装提示，只保存事件供备用入口尝试调用。
  nativePrompt.value = event as InstallEvent
}
let closeTimer: ReturnType<typeof setTimeout> | undefined
function finishClose() {
  clearTimeout(closeTimer)
  closeTimer = undefined
  if (dialog.value?.open) dialog.value.close()
  dialog.value?.classList.remove('is-closing')
}
/** 保留原生模态层，待退场动画结束后再关闭，避免遮罩和面板突然消失。 */
function close() {
  if (!dialog.value?.open || closeTimer !== undefined) return
  if (!window.matchMedia?.('(prefers-reduced-motion: no-preference)').matches) {
    finishClose()
    return
  }
  dialog.value.classList.add('is-closing')
  closeTimer = setTimeout(finishClose, 200)
}
function onInstalled() { installed.value = true; nativePrompt.value = null; close() }
async function open() {
  if (installed.value) return
  await nextTick()
  clearTimeout(closeTimer)
  closeTimer = undefined
  dialog.value?.classList.remove('is-closing')
  if (!dialog.value?.open) dialog.value?.showModal()
}
async function add() {
  const event = nativePrompt.value
  if (!event || pending.value) return
  nativePrompt.value = null
  pending.value = true
  try {
    await event.prompt()
    await event.userChoice
    close()
  } catch {
    // A consumed or unavailable prompt falls back to the manual instructions.
  }
  finally { pending.value = false }
}
onMounted(() => {
  window.addEventListener('beforeinstallprompt', available)
  window.addEventListener('appinstalled', onInstalled)
})
onBeforeUnmount(() => {
  finishClose()
  window.removeEventListener('beforeinstallprompt', available)
  window.removeEventListener('appinstalled', onInstalled)
})
defineExpose({ open, installed })
</script>

<template>
  <Teleport to="body">
    <dialog ref="dialog" class="desktop-install-dialog" aria-labelledby="desktop-install-title" @cancel.prevent="close">
      <div class="desktop-install-body">
        <header>
          <img src="/pwa-192.png" width="52" height="52" alt="" />
          <div>
            <h2 id="desktop-install-title">{{ language === 'zh' ? '安装暖立方' : 'Install Nikki Toolkit' }}</h2>
            <small>{{ language === 'zh' ? '无需下载安装包 · 打开更方便' : 'No app package needed · Easier access' }}</small>
          </div>
          <button type="button" class="desktop-install-close" :aria-label="language === 'zh' ? '关闭' : 'Close'" @click="close"><X :size="20" /></button>
        </header>
        <div class="desktop-install-content">
          <p v-if="language === 'zh'">把暖立方作为轻量网页应用添加到手机或电脑桌面，点图标就能进入。在支持的浏览器中，它会<strong>像独立应用一样打开，隐藏浏览器的地址栏和工具栏</strong>。你使用的仍然是暖立方网页。</p>
          <p v-else>Add Nikki Toolkit to your home screen or desktop as a lightweight web app. Tap its icon to open the same website <strong>in its own window, without the browser address bar or toolbars</strong>, in supported browsers.</p>
          <section class="desktop-install-guide">
            <div v-for="mobile in [true, false]" :key="String(mobile)" class="install-group">
              <button
                type="button"
                class="install-guide-toggle"
                :aria-expanded="expandedMobile === mobile"
                :aria-controls="mobile ? 'install-mobile-steps' : 'install-desktop-steps'"
                @click="expandedMobile = expandedMobile === mobile ? null : mobile"
              >
                {{ mobile ? (language === 'zh' ? '手机和平板安装步骤' : 'Phone and tablet instructions') : (language === 'zh' ? '电脑安装步骤' : 'Computer instructions') }}
                <ChevronDown :size="18" aria-hidden="true" />
              </button>
              <div
                :id="mobile ? 'install-mobile-steps' : 'install-desktop-steps'"
                class="install-guide-answer"
                :class="{ expanded: expandedMobile === mobile }"
                :inert="expandedMobile !== mobile"
              >
                <div>
                  <p v-if="mobile" class="install-file-warning">{{ language === 'zh' ? '部分手机浏览器安装后可能无法选择、读取或保存文件。如果遇到这种情况，请返回网页版使用' : 'Some mobile browsers may be unable to select, read, or save files after installation. If this happens, return to the web version.' }}</p>
                  <dl>
                  <template v-for="guide in guides.filter(item => item.mobile === mobile)" :key="guide.en">
                    <dt>{{ language === 'zh' ? guide.zh : guide.en }}</dt>
                    <dd>{{ language === 'zh' ? guide.steps : guide.english }}</dd>
                  </template>
                </dl>
                </div>
              </div>
            </div>
          </section>
          <p class="desktop-install-note">{{ language === 'zh'
            ? '从桌面打开暖立方时请保持联网，离线时可能无法进入首页。安装版与浏览器版的本地数据可能不共享，已有数据请先备份或同步。'
            : 'Go online when opening the app from your home screen or desktop. The home page may be unavailable offline. Installed and browser storage can differ, so back up or sync your data first.' }}</p>
        </div>
        <footer class="confirm-dialog-actions">
          <button type="button" class="confirm-dialog-button ghost dialog-action-control" @click="close">{{ language === 'zh' ? '稍后再说' : 'Later' }}</button>
          <button v-if="nativePrompt || pending" type="button" class="confirm-dialog-button primary" :disabled="pending" @click="add"><Download :size="16" />{{ language === 'zh' ? '安装应用' : 'Install app' }}</button>
        </footer>
      </div>
    </dialog>
  </Teleport>
</template>

<style scoped>
.desktop-install-content .install-file-warning { color: #bc2531; color: light-dark(#a51d27, #ff929a); font-weight: 700; }
.desktop-install-dialog { position: fixed; inset: 0; width: min(720px, calc(100vw - 28px)); max-height: 85vh; max-height: 85dvh; overflow: hidden; margin: auto; padding: 0; border: 1px solid var(--line); border-radius: var(--radius-lg); background: var(--surface-strong); color: var(--text); box-shadow: var(--dialog-shadow); }
/* 与通用弹窗保持相同的缩放回弹、退场节奏及遮罩模糊。 */
.desktop-install-dialog::backdrop {
  background: rgb(0 0 0 / 48%);
  backdrop-filter: blur(8px);
}
@media (prefers-reduced-motion: no-preference) {
  .desktop-install-dialog[open] {
    animation: install-dialog-enter 260ms cubic-bezier(.34, 1.56, .64, 1) both;
  }
  .desktop-install-dialog[open]::backdrop {
    animation: install-backdrop-enter 260ms ease both;
  }
  .desktop-install-dialog[open].is-closing {
    animation: install-dialog-leave 200ms ease-in both;
  }
  .desktop-install-dialog[open].is-closing::backdrop {
    animation: install-backdrop-enter 200ms ease reverse both;
  }
}
@keyframes install-dialog-enter {
  from { transform: scale(.8); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}
@keyframes install-dialog-leave {
  from { transform: scale(1); opacity: 1; }
  to { transform: scale(.9); opacity: 0; }
}
@keyframes install-backdrop-enter {
  from { background-color: transparent; backdrop-filter: blur(0); }
  to { background-color: rgb(0 0 0 / 48%); backdrop-filter: blur(8px); }
}

.desktop-install-body { display: grid; grid-template-rows: auto minmax(0, 1fr) auto; max-height: inherit; font-size: 13px; line-height: 1.7; }
.desktop-install-body header { padding: 16px 22px; border-bottom: 1px solid var(--line-soft); display: flex; align-items: center; gap: 12px; }
.desktop-install-body header img { border-radius: 12px; flex: none; }
.desktop-install-body h2 { margin: 0; font-size: 17px; color: var(--heading); }
.desktop-install-body small { color: var(--muted); }
.desktop-install-close { display: grid; flex: 0 0 32px; width: 32px; height: 32px; place-items: center; margin-left: auto; align-self: start; padding: 0; border: 0; border-radius: 50%; background: var(--icon-button-bg); color: var(--text); cursor: pointer; }
.desktop-install-close:hover { background: var(--icon-button-hover-bg); }
.desktop-install-content { min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: 16px 22px; }
.desktop-install-content > p { margin: 0; }
.desktop-install-guide { margin: 16px 0; }
.desktop-install-note { border-top: 1px solid var(--line-soft); padding-top: 12px; color: var(--muted); }
.desktop-install-guide { padding: 10px; border-radius: var(--radius-sm); background: var(--surface-soft); }
.install-group + .install-group { margin-top: 8px; }
.install-guide-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  padding: 6px 4px;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  font-weight: 600;
  text-align: start;
  cursor: pointer;
}
.install-guide-toggle svg { flex: none; }
.install-guide-toggle[aria-expanded='true'] svg { transform: rotate(180deg); }
.install-guide-answer { display: grid; grid-template-rows: 0fr; }
.install-guide-answer.expanded { grid-template-rows: 1fr; }
.install-guide-answer > div { min-height: 0; overflow: hidden; }
.install-guide-answer dl { min-height: 0; overflow: hidden; margin: 0; }
@media (prefers-reduced-motion: no-preference) {
  .install-guide-answer { transition: grid-template-rows 240ms ease-in-out; }
  .install-guide-toggle svg { transition: transform 240ms ease-in-out; }
}
.desktop-install-guide dt { margin-top: 10px; font-weight: 600; }
.desktop-install-guide dd { margin: 2px 0 0; }
.desktop-install-body footer {
  --dialog-accent: var(--primary-button-bg);
  --dialog-primary-dark-text: #fff;
  padding: 12px 22px;
}
.desktop-install-body .primary { display: inline-flex; align-items: center; justify-content: center; gap: 7px; }
.desktop-install-body .primary:disabled { opacity: .6; cursor: wait; }
.desktop-install-close:focus-visible { outline: 2px solid var(--pink-deep); outline-offset: 2px; }
</style>
