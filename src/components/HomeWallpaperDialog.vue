<script setup lang="ts">
import { ref } from 'vue'
import { Check, ChevronDown, ImagePlus } from 'lucide-vue-next'
import { homeWallpapers, wallpaperUrl } from '../data/homeWallpapers'
import type { useHomeWallpaper } from '../composables/useHomeWallpaper'
import { vImageSkeleton } from '../utils/imageSkeleton'

const props = defineProps<{
  visible: boolean
  language: 'zh' | 'en'
  wallpaper: ReturnType<typeof useHomeWallpaper>
}>()
const emit = defineEmits<{ close: [] }>()
const {
  selected,
  lightness,
  blur,
  customUrl,
  pending,
  uploading,
  select,
  upload,
  setLightness,
  setBlur,
  persist,
  reset
} = props.wallpaper
const input = ref<HTMLInputElement | null>(null)
const t = (zh: string, en: string) => (props.language === 'zh' ? zh : en)

function accept(file?: File) {
  if (file && !uploading.value) void upload(file)
}
function chosen(event: Event) {
  const target = event.target as HTMLInputElement
  accept(target.files?.[0])
  target.value = ''
}
function paste(event: ClipboardEvent) {
  const file = Array.from(event.clipboardData?.files ?? []).find((item) =>
    item.type.startsWith('image/')
  )
  if (file) {
    event.preventDefault()
    accept(file)
  }
}
</script>

<template>
  <Teleport to="body">
    <Transition name="wallpaper-drawer">
      <section
        v-if="visible"
        id="home-wallpaper-drawer"
        class="home-wallpaper-drawer"
        :aria-label="t('主页壁纸', 'Home wallpaper')"
        @paste="paste"
      >
        <header class="wallpaper-header">
          <h2>{{ t('主页壁纸', 'Home wallpaper') }}</h2>
          <button type="button" class="wallpaper-reset" :disabled="uploading" @click="reset">{{
            t('恢复默认', 'Restore default')
          }}</button>
          <button
            type="button"
            class="home-wallpaper-close"
            :aria-label="t('收起', 'Collapse')"
            @click="emit('close')"
            ><ChevronDown :size="20"
          /></button>
        </header>
        <div class="wallpaper-content">
          <div
            class="wallpaper-list"
            :aria-label="t('壁纸列表', 'Wallpapers')"
            @dragover.prevent
            @drop.prevent="accept($event.dataTransfer?.files[0])"
          >
            <button
              v-for="item in homeWallpapers"
              :key="item.id"
              type="button"
              class="wallpaper-option"
              :class="{ active: selected === item.id }"
              :aria-pressed="selected === item.id"
              :aria-label="language === 'zh' ? item.label : item.en"
              :title="language === 'zh' ? item.label : item.en"
              :disabled="uploading"
              @click="select(item.id)"
            >
              <img v-image-skeleton :src="wallpaperUrl(item, true)" alt="" loading="lazy" />
              <Check v-if="selected === item.id" class="wallpaper-check" :size="18" />
              <span v-if="pending === item.id" class="wallpaper-loading">{{
                t('加载中…', 'Loading…')
              }}</span>
            </button>
            <p v-if="!homeWallpapers.length" class="wallpaper-muted">{{
              t('精选壁纸暂未添加', 'Featured wallpapers coming later')
            }}</p>
            <button
              v-if="customUrl"
              type="button"
              class="wallpaper-option"
              :class="{ active: selected === 'custom' }"
              :aria-pressed="selected === 'custom'"
              :aria-label="t('自定义壁纸', 'Custom wallpaper')"
              :disabled="uploading"
              @click="select('custom')"
            >
              <img :src="customUrl" alt="" />
              <Check v-if="selected === 'custom'" class="wallpaper-check" :size="18" />
            </button>
            <button
              class="wallpaper-upload"
              type="button"
              :disabled="uploading"
              :title="t('点击、拖拽或 Ctrl + V 粘贴图片', 'Choose, drop or paste an image')"
              @click="input?.click()"
            >
              <ImagePlus :size="23" />
              <span>{{
                uploading
                  ? t('处理中…', 'Processing…')
                  : customUrl
                    ? t('更换图片', 'Replace image')
                    : t('自定义', 'Custom')
              }}</span>
            </button>
            <input
              ref="input"
              type="file"
              hidden
              accept=".jpg,.jpeg,.png,.webp,.avif"
              @change="chosen"
            />
          </div>
          <div class="wallpaper-controls">
            <label class="wallpaper-lightness">
              <span
                >{{ t('文字明暗', 'Text lightness') }} <strong>{{ lightness }}%</strong></span
              >
              <input
                type="range"
                min="0"
                max="100"
                step="1"
                :value="lightness"
                @input="setLightness(Number(($event.target as HTMLInputElement).value))"
                @change="persist"
              />
              <span class="wallpaper-lightness-labels"
                ><small>{{ t('深色', 'Dark') }}</small
                ><small>{{ t('浅色', 'Light') }}</small></span
              >
            </label>
            <label class="wallpaper-lightness">
              <span
                >{{ t('背景模糊度', 'Background blur') }} <strong>{{ blur }}px</strong></span
              >
              <input
                type="range"
                min="0"
                max="20"
                step="1"
                :value="blur"
                @input="setBlur(Number(($event.target as HTMLInputElement).value))"
                @change="persist"
              />
              <span class="wallpaper-lightness-labels"
                ><small>{{ t('清晰', 'Clear') }}</small
                ><small>{{ t('模糊', 'Blurred') }}</small></span
              >
            </label>
          </div>
        </div>
      </section>
    </Transition>
  </Teleport>
</template>

<style scoped>
.home-wallpaper-drawer {
  position: fixed;
  z-index: 90;
  inset: auto 0 0;
  max-height: 100dvh;
  overflow: auto;
  padding: 16px clamp(18px, 3vw, 44px) 22px;
  border-top: 1px solid var(--line);
  border-radius: 36px 36px 0 0;
  background: var(--surface-strong);
  box-shadow: var(--dialog-shadow);
  color: var(--text);
}
.wallpaper-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}
.wallpaper-header h2 {
  flex: 1;
  margin: 0;
  font-size: 15px;
  font-weight: 600;
}
.wallpaper-reset,
.home-wallpaper-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 30px;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text);
  font-size: 12px;
}
.wallpaper-reset {
  padding: 4px 10px;
  color: var(--pink-deep);
}
.home-wallpaper-close {
  width: 32px;
}
.wallpaper-reset:hover:not(:disabled),
.home-wallpaper-close:hover {
  background: var(--interactive-hover-bg);
}
.wallpaper-content {
  display: grid;
  grid-template-columns: minmax(0, 1fr) clamp(150px, 22.5vw, 310px);
  gap: 20px;
  align-items: center;
}
.wallpaper-list {
  display: flex;
  align-items: center;
  min-width: 0;
  gap: 10px;
  overflow-x: auto;
  padding: 3px 3px 8px;
  scrollbar-width: thin;
}
.wallpaper-muted {
  margin: 0;
  color: var(--muted);
  font-size: 12px;
  flex-shrink: 0;
}
.wallpaper-option,
.wallpaper-upload {
  position: relative;
  flex: 0 0 clamp(112px, 11vw, 176px);
  aspect-ratio: 16/9;
  min-width: 0;
  border: 2px solid var(--line);
  border-radius: var(--radius-sm);
  overflow: hidden;
  background: var(--surface-soft);
}
.wallpaper-option {
  padding: 0;
}
.wallpaper-option:hover:not(:disabled),
.wallpaper-option.active {
  border-color: var(--pink-deep);
}
.wallpaper-option img {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
}
.wallpaper-check,
.wallpaper-loading {
  position: absolute;
  right: 5px;
  bottom: 5px;
  background: var(--pink-deep);
  color: white;
  border-radius: 999px;
  padding: 2px;
}
.wallpaper-loading {
  left: 5px;
  right: auto;
  font-size: 11px;
  padding: 3px 7px;
}
.wallpaper-upload {
  display: grid;
  place-content: center;
  justify-items: center;
  gap: 4px;
  border: 1px dashed var(--line);
  color: var(--pink-deep);
  font-size: 12px;
}
.wallpaper-upload:hover:not(:disabled) {
  border-color: var(--pink-deep);
  background: var(--interactive-hover-bg);
}
.wallpaper-controls {
  display: grid;
  gap: 14px;
  min-width: 0;
  padding-left: 20px;
  border-left: 1px solid var(--line-soft);
}
.wallpaper-lightness {
  display: grid;
  gap: 8px;
  min-width: 0;
  font-size: 12px;
}
.wallpaper-lightness span {
  display: flex;
  justify-content: space-between;
  gap: 6px;
}
.wallpaper-lightness input {
  appearance: none;
  width: 100%;
  min-width: 0;
  height: 16px;
  margin: 0;
  background: transparent;
  cursor: pointer;
}
.wallpaper-lightness input::-webkit-slider-runnable-track {
  height: 8px;
  border-radius: 99px;
  background: var(--param-slider-track);
}
.wallpaper-lightness input::-moz-range-track {
  height: 8px;
  border-radius: 99px;
  background: var(--param-slider-track);
}
.wallpaper-lightness input::-webkit-slider-thumb {
  appearance: none;
  box-sizing: border-box;
  width: 16px;
  height: 16px;
  margin-top: -4px;
  border: 2px solid var(--surface);
  border-radius: 50%;
  background: var(--pink-deep);
  box-shadow: var(--param-slider-thumb-shadow);
}
.wallpaper-lightness input::-moz-range-thumb {
  box-sizing: border-box;
  width: 16px;
  height: 16px;
  border: 2px solid var(--surface);
  border-radius: 50%;
  background: var(--pink-deep);
  box-shadow: var(--param-slider-thumb-shadow);
}
.wallpaper-lightness-labels {
  color: var(--muted);
}
.wallpaper-drawer-enter-active {
  transition: transform 260ms ease-out;
}
.wallpaper-drawer-leave-active {
  transition: transform 200ms ease-in;
  pointer-events: none;
}
.wallpaper-drawer-enter-from,
.wallpaper-drawer-leave-to {
  transform: translateY(100%);
}
@media (prefers-reduced-motion: reduce) {
  .wallpaper-drawer-enter-active,
  .wallpaper-drawer-leave-active {
    transition: none;
  }
}
</style>
