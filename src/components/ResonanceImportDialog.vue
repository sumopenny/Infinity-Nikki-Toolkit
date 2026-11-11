<script setup lang="ts">
import { vSegmentedIndicator } from '../utils/segmentedIndicator'
import { ref, watch } from 'vue'
import { useCompactLayout } from '../composables/useCompactLayout'
const compact = useCompactLayout()
import { PEARPAL_USERSCRIPT_PATH } from '../utils/resonance/resonanceScripts'
const userscriptUrl = `${import.meta.env.BASE_URL.replace(/\/$/, '')}${PEARPAL_USERSCRIPT_PATH}`
import { Bookmark, Copy, ExternalLink, FileUp, Info, Terminal, X } from 'lucide-vue-next'
import type { ResonanceMessages } from '../i18n/messages/resonance'
// 共享共鸣现有窗口的呈现；解析、预览数据与持久化仍由所属模块负责。
defineProps<{
  visible: boolean
  t: ResonanceMessages
  titleId: string
  importMethod: 'pearpal' | 'file'
  cookieMethod: 'bookmark' | 'console' | 'userscript'
  showMobileCredentialTip?: boolean
  fileName?: string
  bookmarkScript: string
  pearpalUrl: string
  importing: boolean
  confirming: boolean
  hasPreview: boolean
  progressText?: string
  disabled?: boolean
  confirmDisabled?: boolean
}>()
const cookieInput = defineModel<string>('cookieInput', { required: true })
const roleid = defineModel<string>('roleid', { required: true })
const token = defineModel<string>('token', { required: true })
const openid = defineModel<string>('openid', { required: true })
const emit = defineEmits<{
  close: []
  keydown: [event: KeyboardEvent]
  panel: [value: HTMLElement | null]
  fileInput: [value: HTMLInputElement | null]
  selectMethod: [value: 'pearpal' | 'file']
  selectCookieMethod: [value: 'bookmark' | 'console' | 'userscript']
  selectFile: [event: Event]
  copyScript: [kind: 'bookmark' | 'console']
  preview: []
  confirm: []
}>()
const panel = ref<HTMLElement | null>(null),
  fileInput = ref<HTMLInputElement | null>(null)
watch(panel, (value) => emit('panel', value), { flush: 'sync' })
watch(fileInput, (value) => emit('fileInput', value), { flush: 'sync' })
const VIDEO_TUTORIALS = [
  {
    label: 'desktopVideoTutorial',
    href: 'https://www.xiaohongshu.com/discovery/item/6ad60e630000000028038cdd?source=webshare&xhsshare=pc_web&xsec_token=ABJuRIb-ZNqYvm2g_gBWAoQP0dJboBOS7spp4mVFCuR74=&xsec_source=pc_share'
  },
  {
    label: 'androidVideoTutorial',
    href: 'https://www.xiaohongshu.com/discovery/item/6ad6077d00000000260149a3?source=webshare&xhsshare=pc_web&xsec_token=ABJuRIb-ZNqYvm2g_gBWAoQC8dkrKs7M4dQJFDWPm_ZMc=&xsec_source=pc_share'
  },
  {
    label: 'iosVideoTutorial',
    href: 'https://www.xiaohongshu.com/discovery/item/6ad606ad00000000260146cb?source=webshare&xhsshare=pc_web&xsec_token=ABJuRIb-ZNqYvm2g_gBWAoQHWbKjYcP5DBvJKo6uiqKpc=&xsec_source=pc_share'
  }
] as const
</script>
<template>
  <Teleport to="body">
    <Transition name="confirm-dialog">
      <div
        v-if="visible"
        class="dialog-overlay resonance-import-dialog"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="titleId"
        @click.self="emit('close')"
        @keydown="emit('keydown', $event)"
      >
        <section ref="panel" class="dialog-panel resonance-import-panel" tabindex="-1">
          <header class="resonance-import-header">
            <h2 :id="titleId">{{ t.addTitle }}</h2>
            <button
              type="button"
              :aria-label="t.close"
              :title="t.close"
              :disabled="confirming || disabled"
              @click="emit('close')"
            >
              <X :size="19" aria-hidden="true" />
            </button>
          </header>

          <div class="resonance-import-body">
            <div
              v-segmented-indicator
              class="resonance-choice-row resonance-import-methods"
              role="group"
              :aria-label="t.importMethod"
            >
              <button
                type="button"
                class="resonance-choice"
                :aria-pressed="importMethod === 'pearpal'"
                @click="emit('selectMethod', 'pearpal')"
                >{{ t.fromPearpal }}</button
              >
              <button
                type="button"
                class="resonance-choice"
                :aria-pressed="importMethod === 'file'"
                @click="emit('selectMethod', 'file')"
                >{{ t.fromFile }}</button
              >
            </div>
            <div><slot name="import-options" /></div>
            <section
              v-if="importMethod === 'file'"
              class="parse-tools-section resonance-info-card resonance-file-card"
            >
              <p>{{ t.fileDescription }}</p>
              <div class="resonance-file-picker">
                <input
                  ref="fileInput"
                  class="visually-hidden"
                  type="file"
                  accept=".json,application/json"
                  :aria-label="t.chooseFile"
                  @change="emit('selectFile', $event)"
                />
                <button type="button" class="resonance-file-button" @click="fileInput?.click()">
                  <FileUp :size="16" aria-hidden="true" />{{ t.chooseFile }}
                </button>
                <span
                  class="resonance-file-name"
                  :class="{ 'has-file': fileName }"
                  role="status"
                  :title="fileName"
                >
                  {{ fileName || t.noFileSelected }}
                </span>
              </div>
            </section>
            <section v-if="importMethod === 'pearpal'">
              <h3>{{ t.loginPearpal }}</h3>
              <div class="parse-tools-section resonance-info-card">
                <p
                  >{{ t.loginPearpalDesc }}
                  <a :href="pearpalUrl" target="_blank" rel="noreferrer noopener"
                    >{{ t.pearpalSite }}<ExternalLink :size="12" aria-hidden="true" /></a
                ></p>
              </div>
            </section>

            <section v-if="importMethod === 'pearpal'">
              <h3>{{ t.getCookie }}</h3>
              <div class="parse-tools-section resonance-info-card resonance-video-tutorials">
                <h4>{{ t.videoTutorials }}</h4>
                <div class="resonance-video-links">
                  <a
                    v-for="video in VIDEO_TUTORIALS"
                    :key="video.label"
                    :href="video.href"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {{ t[video.label] }}
                    <ExternalLink :size="14" aria-hidden="true" />
                  </a>
                </div>
              </div>
              <div v-if="showMobileCredentialTip" class="resonance-mobile-browsers resonance-hint">
                <p>{{ t.mobileAndroidBrowsers }}</p>
                <p>{{ t.mobileIosBrowsers }}</p>
              </div>
              <p v-if="showMobileCredentialTip" class="resonance-mobile-credential-tip">
                <Info :size="16" aria-hidden="true" />
                <span>{{ t.mobileCredentialTip }}</span>
              </p>
              <p class="resonance-source-attribution"
                ><strong>{{ t.sourceAttributionLabel }}</strong
                ><span>{{ t.sourceAttribution }}</span></p
              >
              <div
                v-segmented-indicator
                class="resonance-choice-row"
                :class="{ 'resonance-mobile-cookie-methods': showMobileCredentialTip }"
                role="group"
                :aria-label="t.cookieMethods"
              >
                <button
                  type="button"
                  class="resonance-choice"
                  :aria-pressed="cookieMethod === 'bookmark'"
                  @click="emit('selectCookieMethod', 'bookmark')"
                  ><Bookmark :size="14" aria-hidden="true" />{{
                    compact ? t.mobileBookmarkMethod : t.bookmarkMethod
                  }}</button
                >
                <button
                  type="button"
                  class="resonance-choice resonance-userscript-choice"
                  :aria-pressed="cookieMethod === 'userscript'"
                  @click="emit('selectCookieMethod', 'userscript')"
                  ><FileUp :size="14" aria-hidden="true" />{{
                    compact ? t.mobileUserscriptMethod : t.userscriptMethod
                  }}</button
                >
                <button
                  type="button"
                  class="resonance-choice"
                  :class="{ 'resonance-desktop-console-method': showMobileCredentialTip }"
                  :aria-pressed="cookieMethod === 'console'"
                  @click="emit('selectCookieMethod', 'console')"
                  ><Terminal :size="14" aria-hidden="true" />{{ t.consoleMethod }}</button
                >
              </div>

              <div class="parse-tools-section resonance-cookie-guide">
                <h4>{{ t.cookieStepsTitle }}</h4>
                <div v-if="cookieMethod === 'userscript'" class="resonance-via-script">
                  <p v-if="!compact" class="resonance-script-install-tip">
                    <Info :size="18" aria-hidden="true" />
                    <strong>{{ t.userscriptTroubleshooting[0] }}</strong>
                  </p>
                  <p class="resonance-script-intro">
                    {{ compact ? t.userscriptMobileIntro : t.userscriptDesktopIntro }}
                    <a
                      class="resonance-inline-action resonance-script-install"
                      :href="userscriptUrl"
                      rel="noopener noreferrer"
                    >
                      <FileUp :size="14" aria-hidden="true" />{{ t.userscriptInstall }}
                      <ExternalLink :size="14" aria-hidden="true" />
                    </a>
                  </p>
                  <ol class="resonance-steps">
                    <li
                      v-for="step in compact ? t.userscriptMobileSteps : t.userscriptDesktopSteps"
                      :key="step"
                      >{{ step }}</li
                    >
                  </ol>
                  <ul class="resonance-steps resonance-hint">
                    <li v-for="tip in t.userscriptTroubleshooting.slice(1)" :key="tip">{{
                      tip
                    }}</li>
                  </ul>
                </div>

                <ol
                  v-if="showMobileCredentialTip && cookieMethod === 'bookmark'"
                  class="resonance-steps resonance-mobile-bookmark-steps"
                >
                  <li
                    >{{ t.mobileBookmarkStep1 }}
                    <button
                      class="resonance-inline-action"
                      type="button"
                      @click="emit('copyScript', 'bookmark')"
                      ><Copy :size="14" aria-hidden="true" />{{ t.copyCode }}</button
                    >
                  </li>
                  <li>{{ t.mobileBookmarkStep2 }}</li>
                  <li>{{ t.mobileBookmarkStep3 }}</li>
                  <li>{{ t.bookmarkStep2 }}</li>
                  <li>{{ t.mobileBookmarkStep5 }}</li>
                  <li>{{ t.bookmarkStep4 }}</li>
                  <li>{{ t.bookmarkStep5 }}</li>
                </ol>
                <ol
                  v-if="cookieMethod === 'bookmark'"
                  class="resonance-steps"
                  :class="{ 'resonance-desktop-bookmark-steps': showMobileCredentialTip }"
                >
                  <li>
                    {{ t.bookmarkStep1 }}
                    <a
                      class="resonance-inline-action"
                      :href="bookmarkScript"
                      @click.prevent="emit('copyScript', 'bookmark')"
                      ><Bookmark :size="14" aria-hidden="true" />{{ t.pearpalSite }} Cookie</a
                    >
                  </li>
                  <li>{{ t.bookmarkStep2 }}</li>
                  <li>
                    {{ t.bookmarkStep3.text
                    }}<strong class="resonance-bookmark-emphasis">{{
                      t.bookmarkStep3.emphasis
                    }}</strong>
                  </li>
                  <li>{{ t.bookmarkStep4 }}</li>
                  <li>{{ t.bookmarkStep5 }}</li>
                </ol>
                <template v-if="cookieMethod === 'console'">
                  <ol
                    class="resonance-steps"
                    :class="{ 'resonance-desktop-console-method': showMobileCredentialTip }"
                  >
                    <li>{{ t.consoleStep2 }}</li>
                    <li>{{ t.consoleStep3 }}</li>
                    <li>
                      {{ t.consoleStep4 }}
                      <button
                        class="resonance-inline-action"
                        type="button"
                        @click="emit('copyScript', 'console')"
                        ><Copy :size="14" aria-hidden="true" />{{ t.copyCode }}</button
                      >
                    </li>
                    <li>{{ t.consoleStep5 }}</li>
                    <li>{{ t.consoleStep6 }}</li>
                  </ol>
                </template>
                <p v-if="cookieMethod === 'bookmark'" class="resonance-hint resonance-bookmark-tip">
                  {{ t.bookmarkTip.text
                  }}<strong class="resonance-bookmark-emphasis">{{
                    t.bookmarkTip.emphasis
                  }}</strong>
                </p>

                <p class="resonance-json-guide">{{ t.cookieJsonGuide }}</p>
                <label class="photo-params-paste resonance-paste">
                  <span>{{ t.pasteHere }}</span>
                  <textarea
                    v-model="cookieInput"
                    rows="3"
                    spellcheck="false"
                    placeholder='{"roleid":"123456789","token":"…","id":"987654321"}'
                  ></textarea>
                </label>

                <div class="resonance-form">
                  <label
                    ><span>{{ t.roleId }}</span
                    ><input v-model="roleid" autocomplete="off" inputmode="numeric"
                  /></label>
                  <label
                    ><span>{{ t.token }}</span
                    ><input v-model="token" type="password" autocomplete="off"
                  /></label>
                  <label
                    ><span>{{ t.openId }}</span
                    ><input v-model="openid" autocomplete="off"
                  /></label>
                </div>
              </div>
            </section>

            <p v-if="progressText" class="resonance-status-line is-progress" role="status">{{
              progressText
            }}</p>
            <slot />
          </div>

          <footer class="resonance-import-footer">
            <button
              v-if="!hasPreview"
              class="primary-button"
              type="button"
              :disabled="importing || disabled"
              @click="emit('preview')"
              >{{ importing ? t.importing : t.import }}</button
            >
            <button
              v-else
              class="primary-button"
              type="button"
              :disabled="confirming || disabled || confirmDisabled"
              @click="emit('confirm')"
              >{{ confirming ? t.saving : t.confirmImport }}</button
            >
          </footer>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>
<style scoped>
.resonance-choice-row.resonance-import-methods {
  margin: 0;
}
.resonance-via-script {
  display: grid;
  gap: 12px;
  min-width: 0;
}
.resonance-script-install-tip {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: 0;
  padding: 12px;
  border: 1px solid var(--pink-deep);
  border-radius: 16px;
  background: var(--surface-soft);
  font-size: 14px;
  line-height: 1.7;
  overflow-wrap: anywhere;
}
.resonance-script-install-tip svg {
  flex-shrink: 0;
  margin-top: 3px;
  color: var(--pink-deep);
}
.resonance-via-script .resonance-script-install {
  max-width: 100%;
  margin-left: 8px;
  vertical-align: middle;
  box-sizing: border-box;
  white-space: normal;
  overflow-wrap: anywhere;
}
.resonance-script-install svg {
  flex-shrink: 0;
}
.resonance-video-tutorials {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}
.resonance-video-tutorials h4 {
  flex-shrink: 0;
  margin: 0;
}
.resonance-video-tutorials .resonance-video-links {
  flex-wrap: nowrap;
  min-width: 0;
}
.resonance-video-tutorials .resonance-video-links a {
  white-space: nowrap;
}
.resonance-video-links {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.resonance-video-tutorials .resonance-video-links a {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 32px;
  padding: 4px 10px;
  border: 1px solid var(--accent-border-subtle);
  border-radius: 10px;
  color: var(--pink-deep);
  background: var(--surface-strong);
  box-shadow: var(--accent-shadow-sm);
  font-size: 13px;
  font-weight: 800;
  text-decoration: none;
}
@supports not (color: color-mix(in srgb, black, white)) {
  .resonance-video-tutorials .resonance-video-links a {
    border-radius: 10px;
  }
  :where(:root[data-theme='dark']) .resonance-video-tutorials .resonance-video-links a {
    border-radius: 10px;
  }
}
.resonance-video-links a:hover {
  border-color: var(--pink-deep);
}
.resonance-video-links a:focus-visible {
  outline: 2px solid var(--pink-deep);
  outline-offset: 2px;
}
.resonance-choice-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 12px 0;
}
.resonance-choice {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
/* 仅在手机布局显示提示，其他复用此窗口的入口默认关闭。 */
.resonance-mobile-browsers,
.resonance-mobile-credential-tip,
.resonance-mobile-bookmark-steps {
  display: none;
}
@media (max-width: 899px) {
  .resonance-video-tutorials {
    gap: 8px;
  }
  .resonance-video-tutorials h4 {
    flex-shrink: 1;
    min-width: 0;
    font-size: 12px;
  }
  .resonance-video-tutorials .resonance-video-links {
    gap: 4px;
    flex-shrink: 0;
  }
  .resonance-video-tutorials .resonance-video-links a {
    gap: 3px;
    padding: 3px 6px;
    font-size: 11px;
  }
  .resonance-video-tutorials .resonance-video-links svg {
    width: 12px;
    height: 12px;
  }
  .resonance-mobile-cookie-methods {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    width: 100%;
    box-sizing: border-box;
  }
  .resonance-mobile-cookie-methods > .resonance-choice {
    min-width: 0;
    width: 100%;
    justify-content: center;
    padding: 8px 6px;
    white-space: normal;
    overflow-wrap: anywhere;
    line-height: 1.5;
  }
  .resonance-userscript-choice {
    order: -1;
  }
  .resonance-mobile-browsers {
    display: block;
    margin: 8px 0;
  }
  .resonance-mobile-browsers p {
    margin: 4px 0;
  }
  .resonance-desktop-console-method {
    display: none;
  }
  .resonance-mobile-bookmark-steps {
    display: block;
  }
  .resonance-desktop-bookmark-steps {
    display: none;
  }
  .resonance-mobile-credential-tip {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    margin: 8px 0;
    padding: 10px 12px;
    border: 1px solid var(--line-soft);
    border-radius: 10px;
    background: var(--surface-soft);
    color: var(--muted);
    font-size: 13px;
    line-height: 1.5;
  }
  .resonance-mobile-credential-tip svg {
    flex: 0 0 16px;
    margin-top: 2px;
  }
}
.resonance-cookie-guide {
  display: grid;
  gap: 10px;
  margin-top: 12px;
}
.resonance-cookie-guide h4,
.resonance-cookie-guide p {
  margin: 0;
}
.resonance-steps {
  margin: 0;
  padding-left: 22px;
}
.resonance-steps li + li {
  margin-top: 6px;
}
.resonance-inline-action {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}
.resonance-bookmark-emphasis {
  color: var(--pink-deep);
  font-weight: 800;
}
.resonance-bookmark-tip {
  padding: 10px 12px;
  border: 1px solid var(--line-soft);
  border-radius: 10px;
  background: var(--surface-soft);
}
.resonance-security-note {
  color: var(--muted);
  font-size: 13px;
}
.resonance-paste {
  display: grid;
  gap: 6px;
}
.resonance-paste textarea {
  width: 100%;
  resize: vertical;
  border-radius: var(--radius-md);
  font-family: 'Cascadia Code', Consolas, 'SFMono-Regular', monospace;
  font-weight: 400;
  line-height: 1.65;
  letter-spacing: normal;
}
.resonance-paste textarea::placeholder {
  color: var(--muted);
  opacity: 1;
}
@media (min-width: 900px) {
  .resonance-paste textarea {
    font-size: 14px;
  }
}
.resonance-form {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}
.resonance-form label {
  display: grid;
  min-width: 0;
  gap: 5px;
}
.resonance-form input {
  width: 100%;
  min-width: 0;
}

.resonance-import-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding-top: 12px;
}
@media (max-width: 600px) {
  .resonance-form {
    grid-template-columns: 1fr;
  }
}
</style>
