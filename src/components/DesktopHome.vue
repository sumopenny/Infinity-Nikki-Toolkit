<script setup lang="ts">
import { computed, ref, onMounted, onBeforeUnmount, nextTick } from 'vue'
import HomeWallpaperDialog from './HomeWallpaperDialog.vue'
import HomeWaterSurface from './HomeWaterSurface.vue'
import { useHomeWallpaper } from '../composables/useHomeWallpaper'
import { ArrowRight, Camera, House, Image, ImagePlus, ShieldAlert, Sparkles } from 'lucide-vue-next'
import type { AlbumView } from './AlbumViewSwitcher.vue'
import type { BackupButtonStatus } from '../utils/directory-backup/buttonStatus'

const props = defineProps<{
  language: 'zh' | 'en'
  nickname?: string | null
  disabled: boolean
  allCount: number
  outfitsCount: number
  homeSchemesCount: number
  favoriteCount: number
  backupStatus?: BackupButtonStatus
}>()
const emit = defineEmits<{
  navigate: [view: AlbumView]
  openHelp: []
  status: [message: string, tone: 'error']
}>()
const t = (zh: string, en: string) => (props.language === 'zh' ? zh : en)
const backupNotice = computed(() => {
  const status = props.backupStatus
  if (!status || status.state === 'syncing' || status.state === 'success') return null
  return status.reason === 'not-enabled' || status.reason === 'directory-missing'
    ? 'not-enabled'
    : 'warning'
})
const collections = computed(() => [
  { view: 'all' as const, icon: Image, label: t('照片', 'Photos'), count: props.allCount },
  {
    view: 'outfits' as const,
    icon: null,
    label: t('搭配码', 'Outfits'),
    count: props.outfitsCount
  },
  {
    view: 'home' as const,
    icon: House,
    label: t('家园方案', 'Home schemes'),
    count: props.homeSchemesCount
  },
  {
    view: 'favorites' as const,
    icon: Camera,
    label: t('相机参数', 'Camera parameters'),
    count: props.favoriteCount
  }
])
const wallpaperOpen = ref(false)
const wallpaper = useHomeWallpaper((failure) => {
  const messages = {
    load: t('壁纸加载失败，请重试。', 'Wallpaper failed to load. Please retry.'),
    upload: t(
      '图片处理失败，请检查格式、大小后重试。',
      'Image processing failed. Check the format and size.'
    ),
    storage: t(
      '壁纸保存失败，原壁纸已保留。',
      'Could not save wallpaper. The previous wallpaper is unchanged.'
    )
  }
  emit('status', messages[failure], 'error')
})
const { style: wallpaperStyle, source: wallpaperSource } = wallpaper
const wallpaperTrigger = ref<HTMLButtonElement | null>(null)
const heroTilt = ref<HTMLDivElement | null>(null)
let tiltFrame: number | undefined
let tiltPreference: MediaQueryList | undefined
let tiltX = 0
let tiltY = 0

function resetHeroTilt() {
  if (tiltFrame !== undefined) cancelAnimationFrame(tiltFrame)
  tiltFrame = undefined
  heroTilt.value?.classList.remove('is-tracking')
  heroTilt.value?.style.removeProperty('--hero-tilt-x')
  heroTilt.value?.style.removeProperty('--hero-tilt-y')
}

function moveHeroTilt(event: PointerEvent) {
  if (event.pointerType !== 'mouse' || !tiltPreference?.matches) return
  // Measure the stationary wrapper, never the transformed glass surface.
  const target = heroTilt.value
  if (!target) return
  const bounds = target.getBoundingClientRect()
  if (!bounds.width || !bounds.height) return
  const clamp = (value: number) => Math.max(-1, Math.min(1, value))
  tiltX = -5 * clamp(((event.clientY - bounds.top) / bounds.height - 0.5) * 2)
  tiltY = 5 * clamp(((event.clientX - bounds.left) / bounds.width - 0.5) * 2)
  if (tiltFrame !== undefined) return
  tiltFrame = requestAnimationFrame(() => {
    tiltFrame = undefined
    target.classList.add('is-tracking')
    target.style.setProperty('--hero-tilt-x', `${tiltX.toFixed(3)}deg`)
    target.style.setProperty('--hero-tilt-y', `${tiltY.toFixed(3)}deg`)
  })
}

onMounted(() => {
  if (typeof window.matchMedia !== 'function') return
  tiltPreference = window.matchMedia(
    '(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)'
  )
  tiltPreference.addEventListener('change', resetHeroTilt)
  window.addEventListener('blur', resetHeroTilt)
})
onBeforeUnmount(() => {
  resetHeroTilt()
  tiltPreference?.removeEventListener('change', resetHeroTilt)
  window.removeEventListener('blur', resetHeroTilt)
})
function closeWallpaper(restoreFocus = false) {
  wallpaper.persist()
  wallpaperOpen.value = false
  if (restoreFocus) void nextTick(() => wallpaperTrigger.value?.focus({ preventScroll: true }))
}
function openWallpaper() {
  if (wallpaperOpen.value) {
    closeWallpaper()
    return
  }
  wallpaperOpen.value = true
  void wallpaper.prepareCustom()
}
function onWallpaperKey(event: KeyboardEvent) {
  if (
    wallpaperOpen.value &&
    event.key === 'Escape' &&
    !event.defaultPrevented &&
    !document.querySelector('[aria-modal="true"], dialog[open]')
  ) {
    event.preventDefault()
    closeWallpaper(true)
  }
}
onMounted(() => document.addEventListener('keydown', onWallpaperKey))
onBeforeUnmount(() => document.removeEventListener('keydown', onWallpaperKey))
const numberFormat = computed(() => new Intl.NumberFormat(props.language === 'zh' ? 'zh-CN' : 'en'))
</script>

<template>
  <div
    class="desktop-home"
    :class="{ 'has-wallpaper': wallpaperSource }"
    :style="wallpaperStyle"
    data-testid="desktop-home"
    @click.self="wallpaperOpen && closeWallpaper()"
  >
    <Teleport v-if="wallpaperSource" to="#home-wallpaper-layer">
      <div class="home-wallpaper-image" :style="wallpaperStyle" aria-hidden="true">
        <HomeWaterSurface :source="wallpaperSource" :paused="wallpaperOpen || disabled" />
      </div>
    </Teleport>
    <div class="home-hero-copy" @click.self="wallpaperOpen && closeWallpaper()">
      <div
        ref="heroTilt"
        class="home-hero-tilt"
        @pointermove="moveHeroTilt"
        @pointerleave="resetHeroTilt"
        @pointercancel="resetHeroTilt"
      >
        <div class="home-hero-text">
          <p class="home-eyebrow"
            >{{ t('你好，', 'Hello, ') }}{{ nickname || t('搭配师', 'Stylist') }}</p
          >
          <h1>{{ t('欢迎回到暖立方', 'Welcome back to NikkiCube') }}</h1>
          <p class="home-description">{{
            t(
              '相册管理 · 搭配收藏 · 家园方案 · 相机参数 · 暖暖档案',
              'Albums · Outfits · Home schemes · Camera parameters · Nikki archive'
            )
          }}</p>
        </div>
      </div>
      <div class="home-hero-actions" @click.self="wallpaperOpen && closeWallpaper()">
        <button class="home-guide-button" type="button" @click="emit('openHelp')">
          <Sparkles :size="16" aria-hidden="true" />
          {{ t('使用教程', 'User guide') }}
          <ArrowRight :size="16" aria-hidden="true" />
        </button>
        <button
          ref="wallpaperTrigger"
          class="home-wallpaper-button"
          type="button"
          :aria-expanded="wallpaperOpen"
          aria-controls="home-wallpaper-drawer"
          @click="openWallpaper"
        >
          {{ t('更换主页壁纸', 'Change home wallpaper')
          }}<ImagePlus :size="16" aria-hidden="true" />
        </button>
      </div>
      <section
        v-if="backupNotice"
        class="home-backup-notice"
        :class="{ 'is-warning': backupNotice === 'warning', 'is-hidden': wallpaperOpen }"
        :inert="wallpaperOpen || undefined"
        :aria-hidden="wallpaperOpen || undefined"
        aria-live="polite"
        :aria-label="t('自动备份提醒', 'Automatic backup reminder')"
      >
        <span class="home-backup-icon" aria-hidden="true">
          <ShieldAlert :size="32" :stroke-width="1.6" />
        </span>
        <div class="home-backup-copy">
          <strong>{{
            backupNotice === 'warning'
              ? t('备份出现异常', 'Backup needs attention')
              : t('当前未开启自动备份', 'Automatic backup is not enabled')
          }}</strong>
          <p>{{
            backupNotice === 'warning'
              ? t('最新修改尚未备份，请及时处理', 'Recent changes are not backed up. Please check.')
              : t(
                  '数据丢失后，若无其他备份将无法找回',
                  'Lost data cannot be recovered without another backup.'
                )
          }}</p>
        </div>
        <button type="button" :disabled="disabled" @click="emit('navigate', 'backup')">
          {{
            backupNotice === 'warning'
              ? t('查看原因', 'View details')
              : t('开启备份', 'Enable backup')
          }}
          <ArrowRight :size="16" aria-hidden="true" />
        </button>
      </section>
    </div>

    <nav
      class="home-overview"
      :class="{ 'is-hidden': wallpaperOpen }"
      :inert="wallpaperOpen || undefined"
      :aria-hidden="wallpaperOpen || undefined"
      :aria-label="t('收藏概览', 'Collection overview')"
    >
      <button
        v-for="item in collections"
        :key="item.view"
        :data-view="item.view"
        type="button"
        :disabled="disabled"
        @click="emit('navigate', item.view)"
      >
        <span class="home-overview-icon" aria-hidden="true">
          <component v-if="item.icon" :is="item.icon" :size="38" :stroke-width="1.65" />
          <svg
            v-else
            viewBox="0 0 24 24"
            width="38"
            height="38"
            fill="none"
            stroke="currentColor"
            stroke-width="1.65"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path
              d="M8 2c0 2 1.5 3 4 3s4-1 4-3l3 2-2.5 5.5 4.8 10.1c-5.7 3.2-12.9 3.2-18.6 0L7.5 9.5 5 4Z"
            />
            <path d="M7.5 9.5h9" />
          </svg>
        </span>
        <span class="home-overview-text">
          <strong>{{ numberFormat.format(item.count) }}</strong>
          <span>{{ item.label }}</span>
        </span>
      </button>
    </nav>
    <HomeWallpaperDialog
      :visible="wallpaperOpen"
      :language="language"
      :wallpaper="wallpaper"
      @close="closeWallpaper(true)"
    />
  </div>
</template>

<style scoped>
.desktop-home {
  --home-motion-ease: cubic-bezier(0.16, 1, 0.3, 1);
  position: relative;
  display: grid;
  flex: 1;
  grid-template-rows: 1fr auto;
  gap: clamp(24px, 5vh, 56px);
  min-width: 0;
  min-height: 440px;
  padding: clamp(28px, 6vh, 72px) clamp(24px, 6vw, 88px) clamp(32px, 13vh, 112px);
  overflow: hidden;
  border-radius: 0;
  color: white;
  color: color-mix(in srgb, var(--share-ink), white var(--home-text-lightness, 100%));
}
.home-wallpaper-image {
  position: absolute;
  inset: calc(-2 * var(--home-background-blur, 0px));
  background-image: var(--home-wallpaper, none);
  background-size: cover;
  background-position: center;
  filter: blur(var(--home-background-blur, 0px));
  pointer-events: none;
}
.home-hero-copy {
  align-self: center;
  max-width: 100%;
  text-shadow: 0 2px 12px rgba(46, 36, 52, 0.25);
}
.home-hero-text,
.home-overview {
  border: 2px solid rgba(255, 255, 255, 0.86);
  border-radius: 26px;
}
.home-hero-text {
  width: fit-content;
  max-width: 100%;
  padding: 16px 22px;
  background: rgba(255, 255, 255, 0.3);
  background: color-mix(in srgb, var(--surface) 30%, transparent);
  backdrop-filter: blur(8px);
}
.home-hero-tilt {
  width: fit-content;
  max-width: 100%;
}
@media (hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference) {
  .home-hero-tilt .home-hero-text {
    transform: perspective(1000px) rotateX(var(--hero-tilt-x, 0deg))
      rotateY(var(--hero-tilt-y, 0deg));
    transition: transform 500ms var(--home-motion-ease);
  }
  .home-hero-tilt.is-tracking .home-hero-text {
    transition-duration: 180ms;
  }
}
.home-eyebrow {
  margin: 0 0 8px;
  font-size: clamp(14px, 1.3vw, 20px);
  letter-spacing: 0.08em;
}
.home-hero-copy h1 {
  margin: 0;
  color: inherit;
  font-family: Georgia, 'Songti SC', SimSun, serif;
  font-size: clamp(32px, 3.9vw, 64px);
  font-weight: 500;
  line-height: 1.2;
  letter-spacing: -0.02em;
}
.home-description {
  margin: 12px 0 0;
  font-size: clamp(12px, 1.05vw, 16px);
  line-height: 1.7;
}
.home-hero-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 22px;
}
.home-guide-button,
.home-wallpaper-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 9px;
  min-height: 38px;
  padding: 7px 22px;
  border: 1.5px solid rgba(255, 248, 239, 0.82);
  border-radius: 999px;
  background: rgba(255, 248, 239, 0.12);
  color: inherit;
  font-size: clamp(13px, 1.1vw, 16px);
  backdrop-filter: blur(6px);
}
.home-guide-button {
  border-color: var(--surface-strong);
  background: var(--surface);
  background: color-mix(in srgb, var(--surface-strong) 70%, transparent);
  color: var(--pink-deep);
  backdrop-filter: blur(8px);
  font-weight: 600;
  box-shadow: 0 4px 14px rgba(104, 49, 79, 0.16);
  transition:
    background var(--motion-base),
    border-color var(--motion-base);
}
.home-guide-button:hover {
  background: var(--interactive-hover-bg);
  border-color: var(--interactive-hover-bg);
}
.home-wallpaper-button {
  border-color: currentColor;
}
.home-wallpaper-button:hover {
  background: rgba(255, 248, 239, 0.24);
}
.home-backup-notice {
  --backup-accent: #cb6486;
  --backup-tint: #fbe7ee;
  display: flex;
  align-items: center;
  gap: 16px;
  width: fit-content;
  max-width: 100%;
  box-sizing: border-box;
  margin-top: 20px;
  padding: 16px 20px;
  border: 1.5px solid rgba(255, 255, 255, 0.9);
  border-radius: 24px;
  background: color-mix(in srgb, var(--backup-tint) 86%, transparent);
  box-shadow: 0 6px 20px rgba(104, 49, 79, 0.14);
  backdrop-filter: blur(12px);
  color: #542f3c;
  text-shadow: none;
}
.home-backup-notice.is-warning {
  --backup-accent: #bd7a19;
  --backup-tint: #fff0dd;
  color: #5c3425;
}
.home-backup-icon {
  display: grid;
  place-items: center;
  flex: 0 0 44px;
  height: 44px;
  border-radius: 50%;
  background: color-mix(in srgb, var(--backup-accent) 10%, transparent);
  color: var(--backup-accent);
}
.home-backup-copy {
  min-width: 0;
  padding-left: 14px;
  border-left: 1px solid color-mix(in srgb, var(--backup-accent) 24%, transparent);
}
.home-backup-copy strong {
  font-size: 17px;
  line-height: 1.4;
}
.home-backup-copy p {
  margin: 4px 0 0;
  font-size: 12px;
  line-height: 1.5;
}
.home-backup-notice button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  gap: 8px;
  min-height: 36px;
  margin-left: 8px;
  padding: 8px 18px;
  border: 0;
  border-radius: 999px;
  background: var(--backup-accent);
  color: white;
  font-size: 13px;
  font-weight: 600;
}
.home-backup-notice button:hover:not(:disabled) {
  filter: brightness(0.92);
}
@media (max-width: 600px) {
  .home-backup-notice {
    flex-wrap: wrap;
    gap: 10px;
    padding: 14px;
  }
  .home-backup-copy {
    flex: 1;
  }
  .home-backup-notice button {
    margin-left: auto;
  }
}
.desktop-home:not(.has-wallpaper) {
  color: var(--text);
}
.desktop-home:not(.has-wallpaper) .home-hero-copy {
  text-shadow: none;
}
.desktop-home:not(.has-wallpaper) .home-wallpaper-button {
  border-color: var(--line);
  background: var(--surface);
}
.home-overview {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  align-items: center;
  padding: clamp(10px, 1.3vw, 16px) 0;

  background: var(--surface);
  background: color-mix(in srgb, var(--surface-strong) 70%, transparent);
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.1);
  backdrop-filter: blur(8px);
  color: var(--text);
}
.home-overview,
.home-backup-notice {
  transition: opacity 180ms ease;
}
.home-overview.is-hidden,
.home-backup-notice.is-hidden {
  opacity: 0;
  pointer-events: none;
}
@media (prefers-reduced-motion: reduce) {
  .home-overview,
  .home-backup-notice {
    transition: none;
  }
}
.home-overview button {
  --overview-icon: #9b62b1;
  --overview-icon-bg: #eadcf0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: clamp(6px, 0.9vw, 14px);
  min-width: 0;
  min-height: 48px;
  padding: 6px clamp(6px, 1vw, 14px);
  border: 0;
  background: transparent;
  color: inherit;
  text-align: left;
}
.home-overview button + button {
  border-left: 1px solid rgba(174, 128, 132, 0.25);
}
.home-overview button[data-view='outfits'] {
  --overview-icon: #bf5576;
  --overview-icon-bg: #f8dce4;
}
.home-overview button[data-view='home'] {
  --overview-icon: #b18b43;
  --overview-icon-bg: #f3e8d6;
}
.home-overview button[data-view='favorites'] {
  --overview-icon: #779b5b;
  --overview-icon-bg: #e6ebd8;
}
.home-overview-icon {
  display: grid;
  flex: 0 0 auto;
  place-items: center;
  width: clamp(28px, 3vw, 44px);
  aspect-ratio: 1;
  border-radius: 50%;
  color: var(--overview-icon);
  background: var(--overview-icon-bg);
  transition:
    transform 220ms var(--home-motion-ease),
    background-color 200ms ease-out;
}
@media (hover: hover) and (pointer: fine) {
  .home-overview button:hover:not(:disabled) .home-overview-icon {
    transform: translateY(-2px) scale(1.04);
    background: var(--overview-icon-bg);
    background: color-mix(in srgb, var(--overview-icon-bg) 88%, var(--overview-icon));
  }
}
@media (prefers-reduced-motion: reduce) {
  .home-overview-icon {
    transition: none;
  }
  .home-overview button:hover:not(:disabled) .home-overview-icon {
    transform: none;
  }
}
.home-overview-icon svg {
  width: 72%;
  height: 72%;
}
.home-overview-text {
  display: grid;
  min-width: 0;
  gap: 4px;
  line-height: 1.2;
}
.home-overview-text strong {
  color: #4d2938;
  font-size: clamp(18px, 1.6vw, 26px);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  overflow-wrap: anywhere;
}
.home-overview-text > span {
  font-size: clamp(12px, 1.05vw, 16px);
  overflow-wrap: anywhere;
}
:global(:root[data-theme='dark']) .home-hero-text,
:global(:root[data-theme='dark']) .home-overview {
  border-color: rgba(255, 248, 244, 0.25);
}

:global(:root[data-theme='dark']) .home-overview-text strong {
  color: var(--heading);
}

/* Entrance uses translate independently of the controls' hover/press transforms. */
@keyframes home-content-enter {
  from {
    opacity: 0.12;
    translate: 0 15px;
  }
  to {
    opacity: 1;
    translate: 0 0;
  }
}
.home-hero-text,
.home-hero-actions,
.home-backup-notice > *,
.home-overview button > span {
  animation: home-content-enter 1s var(--home-motion-ease) backwards;
}
.home-hero-actions {
  animation-delay: 40ms;
}
.home-backup-notice > *,
.home-overview button > span {
  animation-delay: 80ms;
}
.home-overview-text,
.home-guide-button svg,
.home-backup-notice button svg,
.home-wallpaper-button svg {
  transition: transform 220ms var(--home-motion-ease);
}
.home-wallpaper-button {
  transition: background 220ms ease;
}
@media (hover: hover) and (pointer: fine) {
  .home-overview button:hover:not(:disabled) .home-overview-text {
    transform: translateY(-2px);
  }
  .home-guide-button:hover svg:last-child,
  .home-backup-notice button:hover:not(:disabled) svg {
    transform: translateX(3px);
  }
  .home-wallpaper-button:hover svg {
    transform: translateY(-2px);
  }
}
.home-overview button:focus-visible:not(:disabled) .home-overview-text {
  transform: translateY(-2px);
}
.home-overview button:active:not(:disabled) > span {
  transform: scale(0.98);
  transition-duration: 90ms;
}
.home-guide-button:active svg,
.home-backup-notice button:active:not(:disabled) svg,
.home-wallpaper-button:active svg {
  transform: scale(0.98);
  transition-duration: 90ms;
}
@media (prefers-reduced-motion: reduce) {
  .home-hero-text,
  .home-hero-actions,
  .home-backup-notice > *,
  .home-overview button > span {
    animation: none;
  }
  .home-overview button > span,
  .home-guide-button svg,
  .home-backup-notice button svg,
  .home-wallpaper-button svg {
    transition: none;
    transform: none !important;
  }
}
</style>
