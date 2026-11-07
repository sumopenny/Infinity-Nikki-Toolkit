<script setup lang="ts">
import { computed, defineAsyncComponent, ref, toRef, watch } from 'vue'
import { optimizedImageKitUrl } from '../utils/imagekit'
import type { Language } from '../i18n'
import { outfitMessages } from '../i18n/messages/outfit'
const OutfitParseDialog = defineAsyncComponent(() => import('./OutfitParseDialog.vue'))
import { useCompactLayout } from '../composables/useCompactLayout'
import { useBodyScrollLock } from '../utils/bodyScrollLock'
import { useModalFocus } from '../composables/useModalFocus'
import { Share2, Bookmark, Columns2, Rows2, Copy, ScanSearch, X } from 'lucide-vue-next'
import { isAlbumPhoto, readPhotoFile } from '../utils/photoGrouping'
import type { PhotoItem } from '../utils/photoGrouping'
import type { PhotoParamsProgress, PhotoParamsResult } from '../utils/photo-params/types'
import type { PhotoParamsMessages } from '../i18n/messages/photoParams'
import { readLocalStorage, writeLocalStorage } from '../utils/localStorage'
import { usePhotoParseFailure } from '../composables/usePhotoParseFailure'
import PhotoParseFailure from './PhotoParseFailure.vue'

const props = defineProps<{
  language?: Language
  visible: boolean
  sourceFile?: File | null
  loadSourcePhoto?: () => Promise<Blob>
  saved?: boolean
  favoriteLabel?: string
  photo: PhotoItem | { name: string } | null
  progress: PhotoParamsProgress
  result: PhotoParamsResult | null
  error: string | null
  errorCodes?: readonly string[]
  uidRequired: boolean
  messages: PhotoParamsMessages
}>()

const emit = defineEmits<{ close: []; copy: []; favorite: []; submitUid: [uid: string] }>()
const ShareImageDialog = defineAsyncComponent(() => import('./ShareImageDialog.vue'))
const shareVisible = ref(false)
const canShare = computed(
  () => !!props.result && (!!props.sourceFile || (!!props.photo && isAlbumPhoto(props.photo)))
)
async function loadSharePhoto(): Promise<Blob> {
  if (props.loadSourcePhoto) return props.loadSourcePhoto()
  if (props.sourceFile) return props.sourceFile
  if (props.photo && isAlbumPhoto(props.photo)) return readPhotoFile(props.photo)
  throw new Error('Source photo unavailable')
}
watch(
  () => [props.visible, props.photo, props.result],
  () => {
    shareVisible.value = false
  }
)
const panel = ref<HTMLElement | null>(null)
const compact = useCompactLayout()
const layoutStorageKey = 'nikki-photo-params-layout'
const sideBySide = ref(readLocalStorage(layoutStorageKey) !== 'stack')
// 只记录用户选择，窄屏回退不覆盖桌面布局偏好。
watch(sideBySide, (split) => writeLocalStorage(layoutStorageKey, split ? 'split' : 'stack'))
const splitLayout = computed(() => sideBySide.value && !compact.value && !!props.result?.outfit)
const layoutLabel = computed(() =>
  props.language === 'en'
    ? splitLayout.value
      ? 'Switch to stacked view'
      : 'Switch to side-by-side view'
    : splitLayout.value
      ? '切换为上下布局'
      : '切换为左右布局'
)
// 参数窗口可从照片卡片独立打开，需自行管理滚动锁和焦点生命周期。
useBodyScrollLock(toRef(props, 'visible'))
useModalFocus(toRef(props, 'visible'), panel, () => emit('close'))
const failureState = usePhotoParseFailure(
  {
    get error() {
      return props.error
    },
    get errorCodes() {
      return props.errorCodes
    },
    get uidRequired() {
      return props.uidRequired
    },
    get progress() {
      return props.progress
    },
    get result() {
      return props.result
    },
    get messages() {
      return props.messages
    },
    get resetKey() {
      return props.visible ? props.photo : null
    }
  },
  (uid) => emit('submitUid', uid)
)
const { uidAttempt } = failureState
const failedImages = ref<Set<string>>(new Set())
watch(
  () => props.visible,
  () => {
    failedImages.value = new Set()
  }
)
function resourceKey(title: string, name: string) {
  return `${title}:${name}`
}
function markImageFailed(title: string, name: string) {
  failedImages.value = new Set(failedImages.value).add(resourceKey(title, name))
}
</script>

<template>
  <Teleport to="body">
    <Transition name="confirm-dialog" appear @before-leave="(el) => el.setAttribute('inert', '')">
      <div
        v-if="visible"
        class="dialog-overlay fortune-time-dialog photo-params-overlay"
        role="dialog"
        aria-modal="true"
        :aria-label="messages.title"
      >
        <section
          ref="panel"
          tabindex="-1"
          class="dialog-panel fortune-time-panel photo-params-dialog"
          :class="{ 'is-split-layout': splitLayout }"
        >
          <header class="fortune-time-header photo-params-header">
            <div class="photo-params-header-content">
              <div class="photo-params-title-row">
                <h2>{{ messages.title }}</h2>
                <p v-if="photo" class="photo-params-file-name">{{ photo.name }}</p>
              </div>
            </div>
            <button
              v-if="canShare"
              type="button"
              :aria-label="language === 'en' ? 'Export share image' : '导出分享图'"
              :title="language === 'en' ? 'Export share image' : '导出分享图'"
              @click="shareVisible = true"
              ><Share2 :size="18"
            /></button>
            <button
              v-if="result?.outfit && !compact"
              type="button"
              class="photo-params-layout-button"
              :aria-label="layoutLabel"
              :title="layoutLabel"
              :aria-pressed="splitLayout"
              @click="sideBySide = !sideBySide"
            >
              <Rows2 v-if="splitLayout" :size="18" aria-hidden="true" />
              <Columns2 v-else :size="18" aria-hidden="true" />
            </button>
            <button
              v-if="result?.rawCameraParams && favoriteLabel"
              type="button"
              class="photo-params-favorite-button"
              :disabled="saved"
              @click="emit('favorite')"
              ><Bookmark :size="16" />{{ favoriteLabel }}</button
            >
            <button
              type="button"
              :aria-label="messages.close"
              :title="messages.close"
              @click="emit('close')"
              ><X :size="19" aria-hidden="true"
            /></button>
          </header>

          <div
            class="fortune-time-body photo-params-body"
            :class="{ 'is-loading': progress.stage !== 'ready' && !error && !uidAttempt }"
          >
            <div
              v-if="progress.stage !== 'ready' && !error && !uidAttempt"
              class="photo-params-loading"
              role="status"
              aria-live="polite"
            >
              <span class="photo-params-spinner" aria-hidden="true"></span>
              <p>{{ progress.message }}</p>
            </div>

            <PhotoParseFailure
              :state="failureState"
              :error="error"
              :uid-required="uidRequired"
              :result="result"
              :messages="messages"
            />
            <div v-if="result" class="photo-params-content">
              <div class="photo-params-columns">
                <div class="photo-params-main">
                  <section v-if="result.environmentFields.length" class="photo-params-section">
                    <h3>{{ messages.capture }}</h3>
                    <div class="photo-params-grid">
                      <div
                        v-for="item in result.environmentFields"
                        :key="item.label"
                        class="photo-params-value photo-params-value--static"
                      >
                        <span>{{ item.label }}</span>
                        <strong>{{ item.value }}</strong>
                      </div>
                    </div>
                  </section>
                  <section class="photo-params-section">
                    <h3>{{ messages.camera }}</h3>
                    <div class="photo-params-grid">
                      <div
                        v-for="item in result.cameraFields"
                        :key="item.label"
                        class="photo-params-value"
                        :class="{ 'photo-params-value--static': item.static }"
                      >
                        <span>{{ item.label }}</span>
                        <span
                          v-if="!item.static"
                          class="photo-params-slider"
                          :style="{ '--photo-params-slider-ratio': (item.position ?? 50) / 100 }"
                          aria-hidden="true"
                          ><i></i
                        ></span>
                        <strong>{{ item.value }}</strong>
                      </div>
                    </div>
                  </section>
                  <section class="photo-params-section">
                    <h3>{{ messages.image }}</h3>
                    <div class="photo-params-grid">
                      <div
                        v-for="item in result.imageFields"
                        :key="item.label"
                        class="photo-params-value"
                      >
                        <span>{{ item.label }}</span>
                        <span
                          class="photo-params-slider"
                          :style="{ '--photo-params-slider-ratio': (item.position ?? 50) / 100 }"
                          aria-hidden="true"
                          ><i></i
                        ></span>
                        <strong>{{ item.value }}</strong>
                      </div>
                    </div>
                  </section>
                  <div class="photo-params-resource-grid">
                    <section
                      v-for="group in result.resourceGroups"
                      :key="group.title"
                      class="photo-params-section"
                    >
                      <h3>{{ group.title }}</h3>
                      <div
                        class="photo-params-resource-row"
                        :class="{ 'photo-params-resource-row--pose': group.kind === 'pose' }"
                      >
                        <img
                          v-if="
                            group.imageUrl &&
                            !failedImages.has(resourceKey(group.title, group.name))
                          "
                          :src="group.imageUrl ? optimizedImageKitUrl(group.imageUrl) : undefined"
                          :alt="group.name"
                          @error="markImageFailed(group.title, group.name)"
                        />
                        <span
                          v-else
                          class="photo-params-resource-image-placeholder"
                          aria-hidden="true"
                          ><ScanSearch :size="19"
                        /></span>
                        <span class="photo-params-resource-placeholder">{{ group.name }}</span>
                        <strong v-if="group.value">{{ group.value }}</strong>
                      </div>
                    </section>
                  </div>
                </div>
                <section v-if="result.outfit" class="photo-params-section photo-params-outfit">
                  <div class="photo-params-outfit-heading">
                    <h3>{{ language === 'en' ? 'Outfit and dyes' : '穿搭与染色' }}</h3>
                    <span class="photo-params-outfit-count">{{
                      outfitMessages[language ?? 'zh'].parseItemCount(
                        result.outfit.wearingClothes.length
                      )
                    }}</span>
                  </div>
                  <OutfitParseDialog
                    :visible="visible"
                    embedded
                    code=""
                    :supplied-result="result.outfit"
                    :language="language ?? 'zh'"
                    :messages="outfitMessages[language ?? 'zh']"
                  />
                </section>
              </div>
              <section v-if="result.rawCameraParams" class="photo-params-section photo-params-raw">
                <div class="photo-params-raw-heading">
                  <h3>{{ messages.raw }}</h3>
                  <button type="button" class="photo-params-copy-button" @click="emit('copy')"
                    ><Copy :size="15" aria-hidden="true" />{{ messages.copy }}</button
                  >
                </div>
                <code>{{ result.rawCameraParams }}</code>
              </section>
            </div>
          </div>
        </section>
      </div>
    </Transition>
  </Teleport>
  <ShareImageDialog
    v-if="visible && shareVisible"
    :language="language ?? 'zh'"
    :result="result"
    :load-photo="loadSharePhoto"
    :name="photo?.name"
    @close="shareVisible = false"
  />
</template>

<style scoped>
.photo-params-columns,
.photo-params-main {
  display: grid;
  gap: 12px;
  min-width: 0;
}
.photo-params-main > .photo-params-section:first-child {
  padding-top: 0;
  border-top: 0;
}
.photo-params-layout-button[aria-pressed='true'] {
  color: var(--pink-deep);
  background: var(--soft-accent);
}
/* 窄屏继续上下排列，共用外层滚动；参数码始终位于两栏下方。 */
@media (min-width: 900px) {
  .is-split-layout .photo-params-columns {
    grid-template-columns: minmax(0, 2fr) minmax(0, 1.2fr);
    gap: 24px;
    align-items: stretch;
  }
  .is-split-layout .photo-params-main {
    align-content: start;
    padding-right: 24px;
    border-right: 1px solid var(--line);
  }
  .is-split-layout .photo-params-outfit {
    min-width: 0;
    padding-top: 0;
    border-top: 0;
  }
  .is-split-layout .photo-params-outfit :deep(.outfit-parse-grid) {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
  .is-split-layout .photo-params-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}

.photo-params-outfit-heading {
  margin-bottom: 20px;
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}
.photo-params-outfit-heading h3 {
  margin-bottom: 0;
}
.photo-params-outfit-count {
  flex-shrink: 0;
  color: var(--muted);
  font-size: 12px;
}

/* 仅动作图片使用梦幻背景，加载失败时保留默认占位背景。 */
.photo-params-resource-row--pose img {
  background: var(--archive-pose-card-background) center / cover no-repeat;
  background-color: var(--surface-soft);
}
.photo-params-header-content {
  flex: 1;
  min-width: 0;
}
.photo-params-header {
  gap: 12px;
}
.photo-params-header .photo-params-favorite-button {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  flex-shrink: 0;
  width: auto;
  height: auto;
  padding: 9px 12px;
  border: 1px solid var(--favorite-button-border);
  border-radius: var(--radius-sm);
  background: var(--favorite-button-bg);
  color: var(--favorite-button-text);
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
  transition:
    background var(--motion-fast) ease,
    border-color var(--motion-fast) ease;
}
.photo-params-header .photo-params-favorite-button:hover:not(:disabled) {
  background: var(--soft-accent);
  border-color: var(--pink-deep);
}
.photo-params-header .photo-params-favorite-button:focus-visible {
  outline: 2px solid var(--pink-deep);
  outline-offset: 2px;
}
.photo-params-header .photo-params-favorite-button:disabled {
  background: var(--favorite-button-active-bg);
  opacity: 0.75;
  cursor: default;
}
/* 手机标题栏统一在组件内定义，避免 scoped 的换行规则覆盖全局样式。 */
@media (max-width: 899px) {
  .photo-params-header {
    flex-wrap: nowrap;
    gap: 8px;
  }
  .photo-params-header-content {
    flex: 1 1 0;
    overflow: hidden;
  }
  .photo-params-title-row h2 {
    min-width: 0;
    flex-shrink: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .photo-params-header .photo-params-file-name {
    display: none;
  }
  .photo-params-header > button {
    flex-shrink: 0;
  }
}
</style>
