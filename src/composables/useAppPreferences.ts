import {
  isMobileNavStyle,
  type MobileNavStyle,
  isSurfaceStyle,
  type SurfaceStyle
} from '../types/mobileNavigation'
import { readLocalStorage, writeLocalStorage } from '../utils/localStorage'
import { computed, ref, watch, onBeforeUnmount, type Ref } from 'vue'
import { DEFAULT_LANGUAGE, messages, type Language } from '../i18n'
import {
  isThumbnailMode,
  isThumbnailSize,
  type ThumbnailMode,
  type ThumbnailSize,
  type ThumbnailRatioKind,
  type ThumbnailKind
} from '../types/thumbnail'
import { isThemeMode, type ThemeMode } from '../types/theme'
import type { StatusState } from './useOperationNotice'
const THUMBNAIL_STORAGE_KEY = 'infinity-nikki-thumbnail-mode'
const OUTFIT_THUMBNAIL_STORAGE_KEY = 'infinity-nikki-outfit-thumbnail-mode'
const HOME_THUMBNAIL_STORAGE_KEY = 'infinity-nikki-home-thumbnail-mode'
const SURFACE_STYLE_KEY = 'infinity-nikki-surface-style'
const MOBILE_NAV_STYLE_KEY = 'infinity-nikki-mobile-nav-style'
const THEME_STORAGE_KEY = 'infinity-nikki-theme-mode'
const LANGUAGE_STORAGE_KEY = 'infinity-nikki-language'
const AUTO_PARSE_ACTIONS_STORAGE_KEY = 'infinity-nikki-auto-parse-actions'

function isLanguage(value: string | null): value is Language {
  return value === 'zh' || value === 'en'
}

interface AppPreferencesOptions {
  compactLayout: Readonly<Ref<boolean>>
  canPersist: () => boolean
  onStatus: (status: StatusState) => void
}
/** 管理显示偏好及其持久化；比例独立于大小，两端分别记忆大小。 */
export function useAppPreferences({ compactLayout, canPersist, onStatus }: AppPreferencesOptions) {
  const storedThumbnailMode = readLocalStorage(THUMBNAIL_STORAGE_KEY)
  const storedOutfitThumbnailMode = readLocalStorage(OUTFIT_THUMBNAIL_STORAGE_KEY)
  const storedHomeThumbnailMode = readLocalStorage(HOME_THUMBNAIL_STORAGE_KEY)
  const storedSurface = readLocalStorage(SURFACE_STYLE_KEY)
  const surfaceStyle = ref<SurfaceStyle>(isSurfaceStyle(storedSurface) ? storedSurface : 'frosted')
  watch(
    surfaceStyle,
    (value) => {
      document.documentElement.dataset.surfaceStyle = value
      if (canPersist()) writeLocalStorage(SURFACE_STYLE_KEY, value)
    },
    { immediate: true }
  )
  const storedNavStyle = readLocalStorage(MOBILE_NAV_STYLE_KEY)
  const mobileNavStyle = ref<MobileNavStyle>(
    isMobileNavStyle(storedNavStyle) ? storedNavStyle : 'docked'
  )
  watch(
    mobileNavStyle,
    (value) => {
      document.documentElement.dataset.mobileNavStyle = value
      if (canPersist()) writeLocalStorage(MOBILE_NAV_STYLE_KEY, value)
    },
    { immediate: true }
  )
  const storedThemeMode = readLocalStorage(THEME_STORAGE_KEY)
  const storedLanguage = readLocalStorage(LANGUAGE_STORAGE_KEY)
  const storedAutoParseActions = readLocalStorage(AUTO_PARSE_ACTIONS_STORAGE_KEY)

  const language = ref<Language>(isLanguage(storedLanguage) ? storedLanguage : DEFAULT_LANGUAGE)
  const locale = computed(() => messages[language.value])
  const autoParseActionsEnabled = ref(storedAutoParseActions === 'true')
  let themeSwitchFrame: number | undefined
  const thumbnailMode = ref<ThumbnailMode>(
    isThumbnailMode(storedThumbnailMode) ? storedThumbnailMode : 'default'
  )
  const outfitThumbnailMode = ref<ThumbnailMode>(
    isThumbnailMode(storedOutfitThumbnailMode) ? storedOutfitThumbnailMode : 'portrait-standard'
  )
  const homeThumbnailMode = ref<ThumbnailMode>(
    isThumbnailMode(storedHomeThumbnailMode) ? storedHomeThumbnailMode : 'wide'
  )
  const legacyModes = {
    photo: storedThumbnailMode,
    outfit: storedOutfitThumbnailMode,
    home: storedHomeThumbnailMode
  }
  const modeStates = { photo: thumbnailMode, outfit: outfitThumbnailMode, home: homeThumbnailMode }
  const modeKeys = {
    photo: THUMBNAIL_STORAGE_KEY,
    outfit: OUTFIT_THUMBNAIL_STORAGE_KEY,
    home: HOME_THUMBNAIL_STORAGE_KEY
  }

  function sizeKey(kind: ThumbnailKind, compact: boolean) {
    return `infinity-nikki-${kind}-thumbnail-size-${compact ? 'mobile' : 'desktop'}`
  }

  // 旧 half 只影响桌面大小；优先保留已保存的新设置，迁移后比例统一为 1:1。
  function readSizes(compact: boolean): Record<ThumbnailKind, ThumbnailSize> {
    return Object.fromEntries(
      (['photo', 'outfit', 'home', 'camera'] as const).map((kind) => {
        const stored = readLocalStorage(sizeKey(kind, compact))
        const size = isThumbnailSize(stored)
          ? stored
          : !compact && kind !== 'camera' && legacyModes[kind] === 'half'
            ? 'small'
            : 'medium'
        return [kind, size]
      })
    ) as Record<ThumbnailKind, ThumbnailSize>
  }
  const desktopSizes = ref(readSizes(false))
  const mobileSizes = ref(readSizes(true))
  for (const kind of ['photo', 'outfit', 'home'] as const) {
    if (legacyModes[kind] !== 'half') continue
    modeStates[kind].value = 'default'
    if (canPersist()) {
      writeLocalStorage(sizeKey(kind, false), desktopSizes.value[kind])
      writeLocalStorage(modeKeys[kind], 'default')
    }
  }
  const thumbnailSizes = computed(() =>
    compactLayout.value ? mobileSizes.value : desktopSizes.value
  )

  function saveThumbnailSize(kind: ThumbnailKind, size: ThumbnailSize) {
    if (!isThumbnailSize(size)) return
    const compact = compactLayout.value
    const sizes = compact ? mobileSizes : desktopSizes
    sizes.value[kind] = size
    if (canPersist()) writeLocalStorage(sizeKey(kind, compact), size)
  }
  const themeMode = ref<ThemeMode>(isThemeMode(storedThemeMode) ? storedThemeMode : 'light')

  watch(
    language,
    (value) => {
      document.documentElement.lang = value === 'zh' ? 'zh-CN' : 'en'
      if (canPersist()) writeLocalStorage(LANGUAGE_STORAGE_KEY, value)
    },
    { immediate: true }
  )
  watch(
    themeMode,
    (value) => {
      const root = document.documentElement
      const isThemeChange = Boolean(root.dataset.theme && root.dataset.theme !== value)

      if (themeSwitchFrame !== undefined) window.cancelAnimationFrame(themeSwitchFrame)
      if (isThemeChange) root.classList.add('is-theme-switching')
      root.dataset.theme = value

      if (isThemeChange) {
        themeSwitchFrame = window.requestAnimationFrame(() => {
          themeSwitchFrame = window.requestAnimationFrame(() => {
            root.classList.remove('is-theme-switching')
            themeSwitchFrame = undefined
          })
        })
      }
    },
    { immediate: true }
  )
  watch(autoParseActionsEnabled, (value) => {
    if (canPersist()) writeLocalStorage(AUTO_PARSE_ACTIONS_STORAGE_KEY, String(value))
  })

  /** 立即应用偏好，并使用更新后的语言显示完成提示。 */
  function applyPreference(preference: 'language' | 'theme') {
    if (preference === 'language') {
      language.value = language.value === 'zh' ? 'en' : 'zh'
    } else {
      themeMode.value = themeMode.value === 'light' ? 'dark' : 'light'
      if (canPersist()) writeLocalStorage(THEME_STORAGE_KEY, themeMode.value)
    }

    onStatus({
      type: 'custom',
      message:
        preference === 'language'
          ? locale.value.app.languageUpdated
          : locale.value.app.themeUpdated,
      tone: 'success'
    })
  }

  /** 切换中英文。参数：无。 */
  function toggleLanguage() {
    return applyPreference('language')
  }

  /** 切换亮暗主题。参数：无。 */
  function toggleTheme() {
    return applyPreference('theme')
  }

  function setSurfaceStyle(style: SurfaceStyle) {
    if (isSurfaceStyle(style)) surfaceStyle.value = style
  }

  function setMobileNavStyle(style: MobileNavStyle) {
    if (isMobileNavStyle(style)) mobileNavStyle.value = style
  }

  function saveThumbnailMode(kind: ThumbnailRatioKind, mode: ThumbnailMode) {
    if (!isThumbnailMode(mode)) return
    modeStates[kind].value = mode
    if (canPersist()) writeLocalStorage(modeKeys[kind], mode)
  }
  onBeforeUnmount(() => {
    if (themeSwitchFrame !== undefined) window.cancelAnimationFrame(themeSwitchFrame)
    document.documentElement.classList.remove('is-theme-switching')
  })
  return {
    surfaceStyle,
    setSurfaceStyle,
    mobileNavStyle,
    setMobileNavStyle,
    language,
    locale,
    themeMode,
    autoParseActionsEnabled,
    thumbnailMode,
    outfitThumbnailMode,
    homeThumbnailMode,
    thumbnailSizes,
    saveThumbnailSize,
    toggleLanguage,
    toggleTheme,
    saveThumbnailMode
  }
}
