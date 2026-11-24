<script setup lang="ts">
import GlassSurfaceFilter from './GlassSurfaceFilter.vue'
import { useGlassSurface } from '../composables/useGlassSurface'
const { glassFilterId, refractsBackdrop } = useGlassSurface()
import {
  MOBILE_NAV_STYLES,
  type MobileNavStyle,
  SURFACE_STYLES,
  type SurfaceStyle
} from '../types/mobileNavigation'
import { vSegmentedIndicator } from '../utils/segmentedIndicator'
import { computed, inject, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  ArrowDown,
  CircleUserRound,
  BookHeart,
  Download,
  Upload,
  Bug,
  ChevronLeft,
  Eraser,
  FolderOpen,
  Github,
  Globe,
  Grid2X2,
  Heart,
  History,
  BookOpen,
  Music2,
  TvMinimal,
  Moon,
  Monitor,
  MoreHorizontal,
  Smartphone,
  Wrench,
  RotateCcw,
  ScanSearch,
  Search,
  Sun,
  Trash2,
  X
} from 'lucide-vue-next'
import { useCompactLayout } from '../composables/useCompactLayout'
import { useModalFocus } from '../composables/useModalFocus'
import { useModalPresence } from '../composables/useModalPresence'
import type { AlbumView } from './AlbumViewSwitcher.vue'
import { archiveBackgrounds, useArchiveBackground } from '../composables/useArchiveBackground'
import LikeCounter from './LikeCounter.vue'
import DesktopInstallDialog from './DesktopInstallDialog.vue'
// 收款码图片，通过 Vite 打包以保证构建后路径正确
import wxQrCode from '../../img/wx.jpg'
import zfbQrCode from '../../img/zfb.jpg'
import type { Language, LocaleMessages } from '../i18n'
import { gameAlbumMessages } from '../i18n/messages/gameAlbum'
import { useBodyScrollLock } from '../utils/bodyScrollLock'
import { THUMBNAIL_SIZES, type ThumbnailMode, type ThumbnailSize } from '../types/thumbnail'
import type { ThemeMode } from '../types/theme'
import brandIcon from '../../img/brand-mark.png'

type OpenMenu = 'album' | 'view' | 'tools' | 'more' | null

const props = defineProps<{
  directorySupported?: boolean
  albumReadOnly?: boolean
  readOnlyHint?: string
  compatibleLabel?: string
  directoryName: string
  isLoading: boolean
  backupDisabled?: boolean
  hasBackupData?: boolean
  isDeleting: boolean
  hasAlbumDirectory: boolean
  gameAlbumUid?: string
  gameAlbumNickname?: string
  canRestoreDirectory?: boolean
  gameDirectoryActionLabel?: string
  thumbnailMode: ThumbnailMode
  thumbnailModeDisabled?: boolean
  thumbnailSize?: ThumbnailSize
  thumbnailSizeDisabled?: boolean
  thumbnailModeOptions: Array<{ value: ThumbnailMode; label: string }>
  surfaceStyle?: SurfaceStyle
  mobileNavStyle?: MobileNavStyle
  themeMode: ThemeMode
  language: Language
  messages: LocaleMessages['topBar']
  searchQuery?: string
  activeView?: AlbumView
}>()

const emit = defineEmits<{
  chooseDirectory: []
  chooseGameDirectory: []
  restoreDirectoryAccess: []
  chooseCompatible: []
  clearDirectory: []
  openCleanup: []
  openAvatarSimulator: []
  openFortuneTime: []
  openParseTools: []
  clearCache: []
  clearData: []
  exportAllData: []
  importAllData: []
  refreshBackupAvailability: []
  toggleLanguage: []
  toggleTheme: [mode: ThemeMode]
  changeSurfaceStyle: [style: SurfaceStyle]
  changeMobileNavStyle: [style: MobileNavStyle]
  changeThumbnailMode: [mode: ThumbnailMode]
  changeThumbnailSize: [size: ThumbnailSize]
  openUpdateLog: []
  openHelpAbout: []
  updateSearch: [value: string]
}>()

// 问题反馈问卷地址：发布问卷星/腾讯问卷后，把链接替换到这里即可
const FEEDBACK_URL = 'https://v.wjx.cn/vm/tUM7gga.aspx'

const compact = useCompactLayout()
const isArchiveView = computed(() =>
  ['resonance', 'wardrobe', 'makeup', 'animations'].includes(props.activeView ?? '')
)
const { selectedBackground, selectBackground } = useArchiveBackground()
const mobileLikeTarget = inject('mobileLikeTarget', ref<HTMLElement | null>(null))
const mobileSearchOpen = ref(false)
const mobileSearchInput = ref<HTMLInputElement | null>(null)
const mobileSearchTrigger = ref<HTMLButtonElement | null>(null)
const mobileSearchStyle = ref({ top: '72px' })
let restoreMobileSearchFocus = false
let headerResizeObserver: ResizeObserver | null = null
const openMenu = ref<OpenMenu>(null)
const menuMotion = useModalPresence(
  computed(() => compact.value && openMenu.value !== null),
  compact
)
/** 桌面退场也立即屏蔽交互；手机仍交由原模态生命周期管理滚动锁。 */
function beforeMenuLeave(element: Element) {
  element.setAttribute('inert', '')
  menuMotion.beforeLeave(element)
}

const menuStyle = computed(() =>
  compact.value ? {} : { top: `${menuPosition.value.top}px`, left: `${menuPosition.value.left}px` }
)
watch(compact, () => closeMenus())
watch(
  () => props.activeView,
  () => closeMenus()
)
defineExpose({ closeMenus })
const desktopInstallDialog = ref<InstanceType<typeof DesktopInstallDialog> | null>(null)
function openDesktopInstall() {
  void desktopInstallDialog.value?.open()
}
const showDonate = ref(false)
const showFeedback = ref(false)
useBodyScrollLock(
  computed(() => showDonate.value || showFeedback.value || menuMotion.present.value)
)
const feedbackLoadFailed = ref(false)
const headerRef = ref<HTMLElement | null>(null)
const dropdownRef = ref<HTMLElement | null>(null)
const scrollableMenuContent = ref<HTMLElement | null>(null)
const menuScrollButton = ref<HTMLButtonElement | null>(null)
const canScrollMenuDown = ref(false)
const menuTrigger = ref<HTMLElement | null>(null)
useModalFocus(menuMotion.present, dropdownRef, closeMenus, menuTrigger)

function updateMenuScroll() {
  const content = scrollableMenuContent.value
  const maxScroll = content ? content.scrollHeight - content.clientHeight : 0
  const canScroll =
    compact.value && content !== null && maxScroll > 1 && maxScroll - content.scrollTop > 1
  const button = menuScrollButton.value
  if (!canScroll && button && button === document.activeElement)
    button.parentElement
      ?.querySelector<HTMLButtonElement>('button:not(.menu-scroll-bottom)')
      ?.focus({ preventScroll: true })
  canScrollMenuDown.value = canScroll
}

watch(
  scrollableMenuContent,
  (content, _, onCleanup) => {
    updateMenuScroll()
    if (!content || !compact.value || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(updateMenuScroll)
    observer.observe(content)
    for (const group of content.children) observer.observe(group)
    onCleanup(() => observer.disconnect())
  },
  { flush: 'post' }
)

function scrollMenuToBottom() {
  const content = scrollableMenuContent.value
  if (!content) return
  content.scrollTo({
    top: content.scrollHeight,
    behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'
  })
}
const menuPosition = ref({ top: 0, left: 0 })
const isBusy = computed(() => props.isLoading || props.isDeleting)
let menuCloseTimer: ReturnType<typeof setTimeout> | null = null
let menuOpenedByHover = false
function cancelMenuClose() {
  if (menuCloseTimer !== null) clearTimeout(menuCloseTimer)
  menuCloseTimer = null
}
/** 桌面鼠标悬停展开；触屏继续使用点击，跨过菜单间隙时保留 120ms。 */
function enterMenu(menu: Exclude<OpenMenu, null>, event: PointerEvent) {
  if (compact.value || event.pointerType !== 'mouse') return
  cancelMenuClose()
  if (openMenu.value !== menu) void toggleMenu(menu, event, true)
}
function leaveMenu(event: PointerEvent) {
  if (compact.value || event.pointerType !== 'mouse') return
  cancelMenuClose()
  menuCloseTimer = setTimeout(closeMenus, 120)
}

/** 切换顶部菜单，并保证同一时间只展开一个菜单。参数：menu 为目标菜单。 */
async function toggleMenu(menu: Exclude<OpenMenu, null>, event: MouseEvent, fromHover = false) {
  cancelMenuClose()
  closeMobileSearch(false)
  if (openMenu.value === menu) {
    // 悬停展开后点击同一入口仍保持展开，与左侧档案菜单一致。
    if (!compact.value && menuOpenedByHover) return
    closeMenus()
    return
  }

  menuTrigger.value = event.currentTarget as HTMLElement
  menuOpenedByHover = fromHover
  openMenu.value = menu
  if (menu === 'more') emit('refreshBackupAvailability')
  await nextTick()
  await alignOpenMenu()
  // 手机菜单获取焦点时保持背景滚动位置，避免浏览器自动将窗口滚入视野。
  if (compact.value || (menu === 'more' && !fromHover && event.detail === 0))
    dropdownRef.value?.focus({ preventScroll: true })
}

/** 让菜单优先在触发项下方居中，并在临近屏幕边缘时保持完整可见。参数：无。 */
async function alignOpenMenu() {
  updateMobileSearchPosition()
  if (compact.value && typeof ResizeObserver === 'undefined') updateMenuScroll()
  const dropdown = dropdownRef.value
  const trigger = menuTrigger.value
  if (!dropdown || !trigger || compact.value) return

  const triggerRect = trigger.getBoundingClientRect()
  menuPosition.value = {
    top: triggerRect.bottom + 7,
    left: triggerRect.left + triggerRect.width / 2
  }
  await nextTick()
  dropdown.style.setProperty('--menu-shift', '0px')
  const rect = dropdown.getBoundingClientRect()
  const safeInset = 12
  const viewportWidth = document.documentElement.clientWidth || window.innerWidth
  const shift =
    rect.left < safeInset
      ? safeInset - rect.left
      : rect.right > viewportWidth - safeInset
        ? viewportWidth - safeInset - rect.right
        : 0
  dropdown.style.setProperty('--menu-shift', `${shift}px`)
  // 横向对齐之外也约束可视高度，短窗口下菜单内部滚动。
  const viewportBottom =
    (window.visualViewport?.offsetTop ?? 0) + (window.visualViewport?.height ?? window.innerHeight)
  const availableBelow = viewportBottom - triggerRect.bottom - 19
  const availableAbove = triggerRect.top - 19
  if (availableBelow < Math.min(dropdown.scrollHeight, 240) && availableAbove > availableBelow) {
    dropdown.style.maxHeight = `${Math.max(48, availableAbove)}px`
    menuPosition.value.top = Math.max(
      12,
      triggerRect.top - Math.min(dropdown.scrollHeight, availableAbove) - 7
    )
  } else dropdown.style.maxHeight = `${Math.max(48, availableBelow)}px`
}

/** 关闭手机搜索浮层；显式关闭后等待淡出结束再还原焦点，保留关键词。 */
function closeMobileSearch(restoreFocus = true) {
  // 菜单或外部操作可在淡出期间取消焦点恢复，避免抢走新窗口的焦点。
  if (!restoreFocus) restoreMobileSearchFocus = false
  if (!mobileSearchOpen.value) return
  restoreMobileSearchFocus = restoreFocus
  mobileSearchOpen.value = false
}

/** 淡出完成后恢复显式关闭的焦点；重新打开或切换菜单时不恢复。 */
function finishMobileSearchClose() {
  const shouldRestore = restoreMobileSearchFocus
  restoreMobileSearchFocus = false
  if (shouldRestore && compact.value && !mobileSearchOpen.value && !openMenu.value)
    mobileSearchTrigger.value?.focus()
}

/** 搜索独立浮于顶栏下方，与菜单互斥；挂载后聚焦输入框。 */
async function toggleMobileSearch() {
  if (mobileSearchOpen.value) {
    closeMobileSearch()
    return
  }
  closeMenus()
  mobileSearchOpen.value = true
  updateMobileSearchPosition()
  await nextTick()
  if (mobileSearchOpen.value) {
    mobileSearchInput.value?.focus()
    updateMobileSearchPosition()
  }
}

/** 独立搜索层跟随顶栏实际底边，避开父级背景模糊的采样限制。 */
function updateMobileSearchPosition() {
  if (!mobileSearchOpen.value || !headerRef.value) return
  mobileSearchStyle.value = {
    top: `${Math.round(headerRef.value.getBoundingClientRect().bottom + 8)}px`
  }
}

/** 清除关键词但保留搜索浮层及输入焦点。 */
function clearMobileSearch() {
  emit('updateSearch', '')
  mobileSearchInput.value?.focus()
}

/** 关闭全部顶部菜单及搜索浮层，不抢占下一项操作的焦点。 */
function closeMenus() {
  cancelMenuClose()
  menuOpenedByHover = false
  closeMobileSearch(false)
  openMenu.value = null
}

/** 收起菜单后从稳定入口交接焦点，后续确认框关闭时才能返回原菜单按钮。 */
function runMenuAction(action: () => void) {
  if (dropdownRef.value?.contains(document.activeElement))
    menuTrigger.value?.focus({ preventScroll: true })
  closeMenus()
  action()
}

/** 选择浅色、深色或跟随系统偏好，重复选择当前项时保持原状态。 */
function selectTheme(mode: ThemeMode) {
  if (mode !== props.themeMode) emit('toggleTheme', mode)
}

/** 视图菜单里的语言胶囊：只有点到与当前不同的那半边才触发切换。参数：language 为目标语言。 */
function selectLanguage(language: Language) {
  if (language !== props.language) emit('toggleLanguage')
}

/** 打开问题反馈弹窗并加载问卷。 */
function openFeedback() {
  feedbackLoadFailed.value = false
  showFeedback.value = true
}

function handleFeedbackError() {
  feedbackLoadFailed.value = true
}

/** 处理页面外点击和 Esc，关闭当前菜单或打赏/反馈弹窗。参数：event 为鼠标或键盘事件。 */
function handleDocumentInteraction(event: MouseEvent | KeyboardEvent) {
  if (event instanceof KeyboardEvent) {
    if (event.key !== 'Escape') return
    if (mobileSearchOpen.value) {
      closeMobileSearch()
      return
    }
    if (showDonate.value) showDonate.value = false
    else if (showFeedback.value) showFeedback.value = false
    else {
      if (
        !compact.value &&
        openMenu.value === 'more' &&
        dropdownRef.value?.contains(document.activeElement)
      )
        menuTrigger.value?.focus({ preventScroll: true })
      closeMenus()
    }
    return
  }
  const target = event.target as Node
  // 关闭后元素引用会被清空，按原始路径识别浮层，避免取消尚未完成的焦点恢复。
  const insideSearch = event
    .composedPath()
    .some((node) => node instanceof HTMLElement && node.id === 'mobile-search-popover')
  if (mobileSearchOpen.value && !insideSearch && !mobileSearchTrigger.value?.contains(target))
    closeMobileSearch(false)
  if (
    !headerRef.value?.contains(target) &&
    !insideSearch &&
    !dropdownRef.value?.contains(target) &&
    !menuTrigger.value?.contains(target)
  )
    closeMenus()
}

onMounted(() => {
  document.addEventListener('click', handleDocumentInteraction)
  document.addEventListener('keydown', handleDocumentInteraction)
  window.addEventListener('resize', alignOpenMenu)
  window.addEventListener('scroll', alignOpenMenu, true)
  window.visualViewport?.addEventListener('resize', updateMobileSearchPosition)
  window.visualViewport?.addEventListener('scroll', updateMobileSearchPosition)
  if (typeof ResizeObserver !== 'undefined' && headerRef.value) {
    headerResizeObserver = new ResizeObserver(updateMobileSearchPosition)
    headerResizeObserver.observe(headerRef.value)
  }
})

onBeforeUnmount(() => {
  cancelMenuClose()
  document.removeEventListener('click', handleDocumentInteraction)
  document.removeEventListener('keydown', handleDocumentInteraction)
  window.removeEventListener('resize', alignOpenMenu)
  window.removeEventListener('scroll', alignOpenMenu, true)
  window.visualViewport?.removeEventListener('resize', updateMobileSearchPosition)
  window.visualViewport?.removeEventListener('scroll', updateMobileSearchPosition)
  headerResizeObserver?.disconnect()
})
function openDonate() {
  showDonate.value = true
}
</script>

<template>
  <header
    ref="headerRef"
    class="app-header material-surface"
    :data-refraction="refractsBackdrop || undefined"
    :style="{ '--nav-glass-filter': `url(#${glassFilterId})` }"
  >
    <GlassSurfaceFilter v-if="refractsBackdrop" :filter-id="glassFilterId" />
    <div class="brand-lockup">
      <img class="brand-icon" :src="brandIcon" :alt="messages.brandName" />
      <div class="brand-copy">
        <p class="brand-subtitle">{{ messages.subtitle }}</p>
        <div class="brand-title-row">
          <h1>{{ messages.brandName }}</h1>
          <span class="brand-logo">{{ messages.logo }}</span>
        </div>
      </div>
    </div>

    <div v-show="compact" class="mobile-header-row">
      <button
        v-if="activeView !== 'animations'"
        ref="mobileSearchTrigger"
        type="button"
        :class="{ 'has-search': searchQuery?.trim() }"
        :aria-label="language === 'zh' ? '搜索当前页面' : 'Search this page'"
        aria-controls="mobile-search-popover"
        :aria-expanded="mobileSearchOpen"
        @click="toggleMobileSearch"
        ><Search :size="20" aria-hidden="true"
      /></button>
      <button
        type="button"
        :title="messages.view"
        :aria-label="messages.viewMenuAria"
        aria-haspopup="menu"
        :aria-expanded="openMenu === 'view'"
        @click.stop="toggleMenu('view', $event)"
        @pointerenter="enterMenu('view', $event)"
        @pointerleave="leaveMenu"
        ><Grid2X2 :size="20" aria-hidden="true"
      /></button>
      <button
        type="button"
        :title="messages.tools"
        :aria-label="messages.toolsMenuAria"
        aria-haspopup="menu"
        :aria-expanded="openMenu === 'tools'"
        @click.stop="toggleMenu('tools', $event)"
        @pointerenter="enterMenu('tools', $event)"
        @pointerleave="leaveMenu"
        ><Wrench :size="18" aria-hidden="true"
      /></button>
      <button
        type="button"
        :aria-label="messages.moreMenuAria"
        aria-haspopup="dialog"
        :aria-expanded="openMenu === 'more'"
        @click.stop="toggleMenu('more', $event)"
        @pointerenter="enterMenu('more', $event)"
        @pointerleave="leaveMenu"
        ><MoreHorizontal :size="22"
      /></button>
    </div>
    <Teleport to="body"
      ><Transition name="mobile-search-popover" @after-leave="finishMobileSearchClose">
        <div
          v-if="compact && mobileSearchOpen"
          id="mobile-search-popover"
          class="mobile-header-search"
          :style="mobileSearchStyle"
          role="search"
          :aria-label="messages.searchPlaceholder"
        >
          <Search :size="18" aria-hidden="true" />
          <input
            ref="mobileSearchInput"
            type="search"
            :value="searchQuery"
            :placeholder="messages.searchPlaceholder"
            :aria-label="messages.searchPlaceholder"
            @input="emit('updateSearch', ($event.target as HTMLInputElement).value)"
          />
          <button
            v-if="searchQuery"
            type="button"
            :aria-label="language === 'zh' ? '清除搜索' : 'Clear search'"
            @click="clearMobileSearch"
            ><Eraser :size="18"
          /></button>
          <button
            type="button"
            :aria-label="language === 'zh' ? '关闭搜索' : 'Close search'"
            @click="closeMobileSearch()"
            ><X :size="18"
          /></button>
        </div> </Transition
    ></Teleport>
    <div v-show="!compact" class="header-actions">
      <span class="header-star-hint" :title="messages.starHint">{{ messages.starHint }}</span>
      <a
        class="official-site-link"
        href="https://nikki3.pages.dev/"
        target="_blank"
        rel="noopener noreferrer"
        :title="messages.officialSiteHint"
        :aria-label="messages.officialSiteHint"
      >
        <span class="official-site-glow" aria-hidden="true"></span>
        <Globe :size="16" aria-hidden="true" class="official-site-icon" />
        <span class="official-site-text">{{ messages.officialSite }}</span>
        <span class="official-site-spark" aria-hidden="true">✦</span>
      </a>
      <!-- 移动同一个点赞实例，切换布局时保留计数和未完成请求。 -->
      <Teleport :to="mobileLikeTarget || 'body'" :disabled="!compact || !mobileLikeTarget">
        <LikeCounter
          :language="language"
          :messages="{ like: messages.like, likeTooltip: messages.likeTooltip }"
        />
      </Teleport>
      <div v-if="activeView !== 'animations' && activeView !== 'landing'" class="header-search">
        <input
          :value="searchQuery ?? ''"
          type="search"
          :placeholder="messages.searchPlaceholder"
          :aria-label="messages.searchPlaceholder"
          @input="emit('updateSearch', ($event.target as HTMLInputElement).value)"
        />
        <button
          v-if="searchQuery"
          type="button"
          :title="messages.clearSearch"
          :aria-label="messages.clearSearch"
          @click="emit('updateSearch', '')"
          ><X :size="15"
        /></button>
      </div>

      <div v-if="!compact" class="header-menu-wrap">
        <button
          class="header-menu-button album-name-button"
          type="button"
          :aria-label="messages.albumMenuAria"
          aria-haspopup="menu"
          :aria-expanded="openMenu === 'album'"
          @click.stop="toggleMenu('album', $event)"
          @pointerenter="enterMenu('album', $event)"
          @pointerleave="leaveMenu"
        >
          <FolderOpen :size="16" aria-hidden="true" />
          <span>{{
            gameAlbumUid
              ? gameAlbumNickname || `UID ${gameAlbumUid}`
              : hasAlbumDirectory
                ? directoryName
                : messages.currentAlbum
          }}</span>
          <ChevronLeft
            class="header-menu-chevron"
            :class="{ 'is-open': openMenu === 'album' }"
            :size="14"
            aria-hidden="true"
          />
        </button>
        <Teleport to="body">
          <Transition
            name="desktop-menu"
            @before-enter="menuMotion.beforeEnter"
            @before-leave="beforeMenuLeave"
            @after-leave="menuMotion.afterLeave"
          >
            <div
              v-if="openMenu === 'album'"
              ref="dropdownRef"
              @pointerenter="cancelMenuClose"
              @pointerleave="leaveMenu"
              tabindex="-1"
              :aria-label="messages.more"
              class="header-dropdown"
              :style="menuStyle"
              role="menu"
            >
              <button
                v-if="canRestoreDirectory"
                type="button"
                role="menuitem"
                :disabled="isBusy"
                @click="runMenuAction(() => emit('restoreDirectoryAccess'))"
              >
                <RotateCcw :size="16" />
                <span>{{ gameAlbumMessages[language].restore }}</span>
              </button>
              <button
                type="button"
                role="menuitem"
                :disabled="isBusy"
                @click="runMenuAction(() => emit('chooseGameDirectory'))"
              >
                <FolderOpen :size="16" />
                <span>{{ gameDirectoryActionLabel ?? gameAlbumMessages[language].authorize }}</span>
              </button>
              <button
                type="button"
                role="menuitem"
                :disabled="isBusy"
                @click="runMenuAction(() => emit('chooseDirectory'))"
              >
                <FolderOpen :size="16" />
                <span>{{ messages.chooseDirectory }}</span>
              </button>
              <button
                v-if="compatibleLabel"
                type="button"
                role="menuitem"
                :disabled="isBusy"
                @click="runMenuAction(() => emit('chooseCompatible'))"
              >
                <FolderOpen :size="16" /><span>{{ compatibleLabel }}</span>
              </button>
              <button
                type="button"
                role="menuitem"
                :disabled="(!hasAlbumDirectory && !canRestoreDirectory) || isBusy"
                @click="runMenuAction(() => emit('clearDirectory'))"
              >
                <Trash2 :size="16" />
                <span>{{ messages.clearDirectory }}</span>
              </button>
            </div>
          </Transition>
        </Teleport>
      </div>

      <div class="header-menu-wrap">
        <button
          class="header-menu-button view-menu-button"
          type="button"
          :aria-label="messages.viewMenuAria"
          aria-haspopup="menu"
          :aria-expanded="openMenu === 'view'"
          @click.stop="toggleMenu('view', $event)"
          @pointerenter="enterMenu('view', $event)"
          @pointerleave="leaveMenu"
        >
          <Grid2X2 :size="16" aria-hidden="true" />
          <span>{{ messages.view }}</span>
          <ChevronLeft
            class="header-menu-chevron"
            :class="{ 'is-open': openMenu === 'view' }"
            :size="14"
            aria-hidden="true"
          />
        </button>
        <Teleport to="body">
          <Transition
            :name="compact ? 'mobile-menu' : 'desktop-menu'"
            @before-enter="menuMotion.beforeEnter"
            @before-leave="beforeMenuLeave"
            @after-leave="menuMotion.afterLeave"
          >
            <div
              v-if="openMenu === 'view'"
              ref="dropdownRef"
              @pointerenter="cancelMenuClose"
              @pointerleave="leaveMenu"
              tabindex="-1"
              :aria-label="messages.view"
              class="header-dropdown view-dropdown"
              :class="{ 'mobile-menu-sheet': compact }"
              :style="menuStyle"
              role="menu"
            >
              <header v-if="compact" class="mobile-menu-heading"
                ><h2>{{ messages.view }}</h2
                ><button
                  type="button"
                  :aria-label="language === 'zh' ? '关闭菜单' : 'Close menu'"
                  @click="closeMenus"
                  ><X :size="20" /></button
              ></header>
              <div
                ref="scrollableMenuContent"
                class="view-menu-content"
                @scroll.passive="updateMenuScroll"
              >
                <div class="view-toggle-row">
                  <div
                    v-segmented-indicator
                    class="view-toggle-pill"
                    role="group"
                    :aria-label="messages.themeToggleAria"
                  >
                    <button
                      type="button"
                      class="view-toggle-option"
                      :class="{ active: themeMode === 'light' }"
                      :aria-pressed="themeMode === 'light'"
                      :title="messages.themeLight"
                      :aria-label="messages.themeLight"
                      @click="selectTheme('light')"
                    >
                      <Sun :size="15" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      class="view-toggle-option"
                      :class="{ active: themeMode === 'dark' }"
                      :aria-pressed="themeMode === 'dark'"
                      :title="messages.themeDark"
                      :aria-label="messages.themeDark"
                      @click="selectTheme('dark')"
                    >
                      <Moon :size="15" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      class="view-toggle-option"
                      :class="{ active: themeMode === 'system' }"
                      :aria-pressed="themeMode === 'system'"
                      :title="messages.themeSystem"
                      :aria-label="messages.themeSystem"
                      @click="selectTheme('system')"
                    >
                      <Monitor :size="15" aria-hidden="true" />
                    </button>
                  </div>
                  <div
                    v-segmented-indicator
                    class="view-toggle-pill"
                    role="group"
                    :aria-label="messages.languageToggleAria"
                  >
                    <button
                      type="button"
                      class="view-toggle-option"
                      :class="{ active: language === 'zh' }"
                      :aria-pressed="language === 'zh'"
                      @click="selectLanguage('zh')"
                    >
                      <span>{{ messages.languageZh }}</span>
                    </button>
                    <button
                      type="button"
                      class="view-toggle-option"
                      :class="{ active: language === 'en' }"
                      :aria-pressed="language === 'en'"
                      @click="selectLanguage('en')"
                    >
                      <span>{{ messages.languageEn }}</span>
                    </button>
                  </div>
                </div>
                <div class="menu-section-label">{{
                  language === 'zh' ? '风格' : 'Material style'
                }}</div>
                <div
                  class="thumbnail-size-options surface-style-options"
                  role="group"
                  :aria-label="language === 'zh' ? '风格' : 'Material style'"
                >
                  <button
                    v-for="style in SURFACE_STYLES"
                    :key="style"
                    type="button"
                    class="menu-radio"
                    role="menuitemradio"
                    :aria-checked="(surfaceStyle ?? 'frosted') === style"
                    :class="{ active: (surfaceStyle ?? 'frosted') === style }"
                    @click="runMenuAction(() => emit('changeSurfaceStyle', style))"
                  >
                    <span class="radio-mark"></span>
                    <span>{{
                      language === 'zh'
                        ? { opaque: '实色', frosted: '磨砂', glass: '液态玻璃' }[style]
                        : { opaque: 'Opaque', frosted: 'Frosted', glass: 'Liquid glass' }[style]
                    }}</span>
                  </button>
                </div>
                <template v-if="compact">
                  <div class="menu-section-label">{{
                    language === 'zh' ? '导航栏样式' : 'Navigation style'
                  }}</div>
                  <div
                    class="thumbnail-options mobile-nav-style-options"
                    role="group"
                    :aria-label="language === 'zh' ? '导航栏样式' : 'Navigation style'"
                  >
                    <button
                      v-for="style in MOBILE_NAV_STYLES"
                      :key="style"
                      type="button"
                      class="menu-radio"
                      role="menuitemradio"
                      :aria-checked="(mobileNavStyle ?? 'docked') === style"
                      :class="{ active: (mobileNavStyle ?? 'docked') === style }"
                      @click="runMenuAction(() => emit('changeMobileNavStyle', style))"
                    >
                      <span class="radio-mark"></span>
                      <span>{{
                        language === 'zh'
                          ? { docked: '贴底', capsule: '悬浮胶囊' }[style]
                          : { docked: 'Docked', capsule: 'Floating capsule' }[style]
                      }}</span>
                    </button>
                  </div>
                </template>
                <template
                  v-if="isArchiveView && activeView !== 'makeup' && activeView !== 'animations'"
                >
                  <div class="menu-section-label">{{
                    language === 'zh' ? '背景图风格' : 'Background style'
                  }}</div>
                  <div class="archive-background-options">
                    <button
                      v-for="background in archiveBackgrounds"
                      :key="background.id"
                      type="button"
                      class="archive-background-option"
                      :class="{ active: selectedBackground === background.id }"
                      role="menuitemradio"
                      :aria-checked="selectedBackground === background.id"
                      @click="selectBackground(background.id)"
                    >
                      <span
                        class="archive-background-preview"
                        :style="{ '--archive-preview-source': `url('${background.url}')` }"
                      >
                        <span
                          v-if="selectedBackground === background.id"
                          class="archive-background-check"
                          aria-hidden="true"
                          >✓</span
                        >
                      </span>
                      <span>{{ language === 'zh' ? background.label : background.en }}</span>
                    </button>
                  </div>
                </template>
                <template v-else-if="!isArchiveView">
                  <div class="menu-section-label">{{ messages.thumbnailSize }}</div>
                  <div class="thumbnail-size-options">
                    <button
                      v-for="size in THUMBNAIL_SIZES"
                      :key="size"
                      class="menu-radio"
                      :class="{ active: size === (thumbnailSize ?? 'medium') }"
                      type="button"
                      role="menuitemradio"
                      :disabled="thumbnailSizeDisabled"
                      :aria-checked="size === (thumbnailSize ?? 'medium')"
                      @click="runMenuAction(() => emit('changeThumbnailSize', size))"
                    >
                      <span class="radio-mark"></span>
                      <span>{{ messages.thumbnailSizes[size] }}</span>
                    </button>
                  </div>
                  <template v-if="!thumbnailModeDisabled">
                    <div class="menu-section-label">{{ messages.thumbnailRatio }}</div>
                    <div class="thumbnail-options">
                      <button
                        v-for="option in thumbnailModeOptions"
                        :key="option.value"
                        class="menu-radio"
                        :class="{ active: option.value === thumbnailMode }"
                        type="button"
                        role="menuitemradio"
                        :disabled="thumbnailModeDisabled"
                        :aria-checked="option.value === thumbnailMode"
                        @click="runMenuAction(() => emit('changeThumbnailMode', option.value))"
                      >
                        <span class="radio-mark"></span>
                        <span>{{ option.label }}</span>
                      </button>
                    </div>
                  </template>
                </template>
              </div>
              <button
                v-if="compact && canScrollMenuDown"
                ref="menuScrollButton"
                class="menu-scroll-bottom"
                type="button"
                :aria-label="language === 'zh' ? '滚动到底部' : 'Scroll to bottom'"
                @click="scrollMenuToBottom"
              >
                <ArrowDown :size="18" aria-hidden="true" />
              </button>
            </div>
          </Transition>
        </Teleport>
      </div>

      <div class="header-menu-wrap">
        <button
          class="header-icon-button tools-menu-button"
          type="button"
          :title="messages.tools"
          :aria-label="messages.toolsMenuAria"
          aria-haspopup="menu"
          :aria-expanded="openMenu === 'tools'"
          @click.stop="toggleMenu('tools', $event)"
          @pointerenter="enterMenu('tools', $event)"
          @pointerleave="leaveMenu"
        >
          <Wrench :size="17" aria-hidden="true" />
          <span>{{ messages.tools }}</span>
          <ChevronLeft
            class="header-menu-chevron"
            :class="{ 'is-open': openMenu === 'tools' }"
            :size="14"
            aria-hidden="true"
          />
        </button>
        <Teleport to="body">
          <Transition
            :name="compact ? 'mobile-menu' : 'desktop-menu'"
            @before-enter="menuMotion.beforeEnter"
            @before-leave="beforeMenuLeave"
            @after-leave="menuMotion.afterLeave"
          >
            <div
              v-if="openMenu === 'tools'"
              ref="dropdownRef"
              @pointerenter="cancelMenuClose"
              @pointerleave="leaveMenu"
              tabindex="-1"
              :aria-label="messages.tools"
              class="header-dropdown tools-dropdown"
              :class="{ 'mobile-menu-sheet': compact }"
              :style="menuStyle"
              role="menu"
            >
              <header v-if="compact" class="mobile-menu-heading"
                ><h2>{{ messages.tools }}</h2
                ><button
                  type="button"
                  :aria-label="language === 'zh' ? '关闭菜单' : 'Close menu'"
                  @click="closeMenus"
                  ><X :size="20" /></button
              ></header>
              <button
                v-if="compact"
                type="button"
                role="menuitem"
                @click="runMenuAction(() => emit('openParseTools'))"
                ><ScanSearch :size="18" /><span>{{ messages.parseTools }}</span></button
              >
              <button
                v-if="!compact"
                type="button"
                role="menuitem"
                :disabled="isBusy || albumReadOnly"
                :title="albumReadOnly ? readOnlyHint : undefined"
                @click="runMenuAction(() => emit('openCleanup'))"
                ><Eraser :size="16" /><span>{{ messages.specialCleanup }}</span></button
              >
              <button
                type="button"
                role="menuitem"
                @click="runMenuAction(() => emit('openAvatarSimulator'))"
              >
                <CircleUserRound :size="17" /><span>{{ messages.avatarSimulator }}</span>
              </button>
              <button
                type="button"
                role="menuitem"
                @click="runMenuAction(() => emit('openFortuneTime'))"
                ><span class="menu-symbol" aria-hidden="true">✦</span
                ><span>{{ messages.fortuneTime }}</span></button
              >
              <button
                type="button"
                role="menuitem"
                :disabled="isBusy"
                @click="runMenuAction(() => emit('openParseTools'))"
                v-if="!compact"
                ><ScanSearch :size="16" /><span>{{ messages.parseTools }}</span></button
              >
              <button
                v-if="compact && directorySupported !== false"
                type="button"
                role="menuitem"
                :disabled="isBusy || albumReadOnly"
                :title="albumReadOnly ? readOnlyHint : undefined"
                @click="runMenuAction(() => emit('openCleanup'))"
                ><Eraser :size="18" /><span>{{ messages.specialCleanup }}</span></button
              >
              <p v-if="compact && directorySupported === false" class="mobile-capability-note">{{
                language === 'zh'
                  ? '专项清理需在支持目录授权的电脑浏览器使用。'
                  : 'Cleanup requires a supported desktop browser with folder access.'
              }}</p>
            </div>
          </Transition>
        </Teleport>
      </div>

      <div class="header-menu-wrap">
        <button
          class="header-icon-button more-menu-button"
          type="button"
          :title="messages.more"
          :aria-label="messages.moreMenuAria"
          aria-haspopup="dialog"
          :aria-expanded="openMenu === 'more'"
          @click.stop="toggleMenu('more', $event)"
          @pointerenter="enterMenu('more', $event)"
          @pointerleave="leaveMenu"
        >
          <MoreHorizontal :size="19" aria-hidden="true" />
          <span>{{ messages.more }}</span>
          <ChevronLeft
            class="header-menu-chevron"
            :class="{ 'is-open': openMenu === 'more' }"
            :size="14"
            aria-hidden="true"
          />
        </button>
        <Teleport to="body">
          <Transition
            :name="compact ? 'mobile-menu' : 'desktop-menu'"
            @before-enter="menuMotion.beforeEnter"
            @before-leave="beforeMenuLeave"
            @after-leave="menuMotion.afterLeave"
          >
            <div
              v-if="openMenu === 'more'"
              ref="dropdownRef"
              @pointerenter="cancelMenuClose"
              @pointerleave="leaveMenu"
              tabindex="-1"
              :aria-label="messages.more"
              class="header-dropdown header-dropdown-right more-menu-panel"
              :class="{ 'mobile-menu-sheet': compact }"
              :style="menuStyle"
              role="dialog"
              :aria-modal="compact || undefined"
            >
              <header v-if="compact" class="mobile-menu-heading"
                ><h2>{{ messages.more }}</h2
                ><button
                  type="button"
                  :aria-label="language === 'zh' ? '关闭菜单' : 'Close menu'"
                  @click="closeMenus"
                  ><X :size="20" /></button
              ></header>
              <div
                ref="scrollableMenuContent"
                class="more-menu-content"
                @scroll.passive="updateMenuScroll"
              >
                <section class="more-menu-group" aria-labelledby="more-backup-heading">
                  <h3 id="more-backup-heading">{{ messages.dataBackup }}</h3>
                  <div class="more-backup-actions">
                    <button
                      type="button"
                      :disabled="isBusy || backupDisabled || !hasBackupData"
                      @click="runMenuAction(() => emit('exportAllData'))"
                      ><Upload :size="16" aria-hidden="true" /><span>{{
                        messages.exportAllData
                      }}</span></button
                    >
                    <button
                      type="button"
                      :disabled="isBusy || backupDisabled"
                      @click="runMenuAction(() => emit('importAllData'))"
                      ><Download :size="16" aria-hidden="true" /><span>{{
                        messages.importAllData
                      }}</span></button
                    >
                  </div>
                </section>
                <section class="more-menu-group" aria-labelledby="more-maintenance-heading">
                  <h3 id="more-maintenance-heading">{{ messages.appMaintenance }}</h3>
                  <button
                    v-if="!desktopInstallDialog?.installed"
                    type="button"
                    @click="runMenuAction(openDesktopInstall)"
                  >
                    <Smartphone :size="16" aria-hidden="true" />
                    <span>{{ language === 'zh' ? '安装应用' : 'Install app' }}</span>
                  </button>
                  <button
                    type="button"
                    :disabled="isBusy"
                    @click="runMenuAction(() => emit('clearCache'))"
                  >
                    <RotateCcw :size="16" aria-hidden="true" />
                    <span>{{ messages.clearCache }}</span>
                  </button>
                  <button
                    type="button"
                    class="more-danger-action"
                    :disabled="isBusy"
                    @click="runMenuAction(() => emit('clearData'))"
                  >
                    <Trash2 :size="16" aria-hidden="true" />
                    <span>{{ messages.clearData }}</span>
                  </button>
                </section>
                <section class="more-menu-group" aria-labelledby="more-about-heading">
                  <h3 id="more-about-heading">{{ messages.aboutToolkit }}</h3>
                  <a
                    v-if="compact"
                    href="https://nikki3.pages.dev/"
                    target="_blank"
                    rel="noopener noreferrer"
                    @click="closeMenus"
                    ><Globe :size="16" aria-hidden="true" /><span>{{
                      messages.officialSite
                    }}</span></a
                  >
                  <button type="button" @click="runMenuAction(openFeedback)">
                    <Bug :size="16" aria-hidden="true" /><span>{{ messages.feedback }}</span>
                  </button>
                  <button type="button" @click="runMenuAction(openDonate)">
                    <Heart :size="16" aria-hidden="true" />
                    <span>{{ messages.donate }}</span>
                  </button>
                  <div class="menu-author">{{ messages.author }}</div>
                  <div class="author-social-links">
                    <a
                      class="author-social-link xiaohongshu-link"
                      href="https://xhslink.com/m/3IEU0XhZ6e"
                      target="_blank"
                      rel="noopener noreferrer"
                      :title="messages.xiaohongshuAuthor"
                      :aria-label="messages.xiaohongshuAuthor"
                      @click="closeMenus"
                    >
                      <BookHeart :size="17" aria-hidden="true" />
                      <span>{{ messages.xiaohongshu }}</span>
                    </a>
                    <a
                      class="author-social-link douyin-link"
                      href="https://v.douyin.com/20n3l83uJ40/"
                      target="_blank"
                      rel="noopener noreferrer"
                      :title="messages.douyinAuthor"
                      :aria-label="messages.douyinAuthor"
                      @click="closeMenus"
                    >
                      <Music2 :size="17" aria-hidden="true" />
                      <span>{{ messages.douyin }}</span>
                    </a>
                    <a
                      class="author-social-link bilibili-link"
                      href="https://space.bilibili.com/3747574722858304"
                      target="_blank"
                      rel="noopener noreferrer"
                      :title="messages.bilibiliAuthor"
                      :aria-label="messages.bilibiliAuthor"
                      @click="closeMenus"
                    >
                      <TvMinimal :size="17" aria-hidden="true" />
                      <span>{{ messages.bilibili }}</span>
                    </a>
                    <a
                      class="author-social-link repository-link"
                      href="https://github.com/sumopenny/Infinity-Nikki-Toolkit"
                      target="_blank"
                      rel="noopener noreferrer"
                      :title="messages.githubRepo"
                      :aria-label="messages.githubRepo"
                      @click="closeMenus"
                    >
                      <Github :size="17" aria-hidden="true" />
                      <span>{{ messages.githubText }}</span>
                    </a>
                    <a
                      class="author-social-link repository-link"
                      href="https://gitee.com/sumopenny/Infinity-Nikki-Toolkit"
                      target="_blank"
                      rel="noopener noreferrer"
                      :title="messages.giteeRepo"
                      :aria-label="messages.giteeRepo"
                      @click="closeMenus"
                    >
                      <span class="text-icon" aria-hidden="true">G</span>
                      <span>{{ messages.giteeText }}</span>
                    </a>
                  </div>
                </section>
              </div>
              <footer class="more-menu-footer">
                <button type="button" @click="runMenuAction(() => emit('openHelpAbout'))">
                  <BookOpen :size="16" aria-hidden="true" /><span>{{ messages.helpAbout }}</span>
                </button>
                <button type="button" @click="runMenuAction(() => emit('openUpdateLog'))">
                  <History :size="16" aria-hidden="true" /><span>{{ messages.updateLog }}</span>
                </button>
                <button
                  v-if="compact && canScrollMenuDown"
                  ref="menuScrollButton"
                  class="menu-scroll-bottom"
                  type="button"
                  :aria-label="language === 'zh' ? '滚动到底部' : 'Scroll to bottom'"
                  @click="scrollMenuToBottom"
                >
                  <ArrowDown :size="18" aria-hidden="true" />
                </button>
              </footer>
            </div>
          </Transition>
        </Teleport>
      </div>
    </div>
    <Teleport to="body"
      ><Transition name="mobile-backdrop"
        ><div
          v-if="compact && openMenu"
          class="mobile-menu-backdrop"
          @click="closeMenus"
        ></div></Transition
    ></Teleport>
  </header>

  <DesktopInstallDialog ref="desktopInstallDialog" :language="language" />

  <Teleport to="body">
    <Transition name="confirm-dialog">
      <div
        v-if="showDonate"
        class="dialog-overlay"
        role="dialog"
        aria-modal="true"
        :aria-label="messages.donateTitle"
        @click.self="showDonate = false"
      >
        <section class="dialog-panel donate-dialog-panel">
          <header>
            <h2>{{ messages.donateTitle }}</h2>
            <button
              type="button"
              :aria-label="messages.closeDonate"
              :title="messages.closeDonate"
              @click="showDonate = false"
            >
              <X :size="19" />
            </button>
          </header>
          <div class="donate-dialog-body">
            <p class="donate-description">{{ messages.donateDescription }}</p>
            <div class="donate-qrcodes">
              <figure>
                <img :src="wxQrCode" :alt="messages.donateWechat" />
                <figcaption>{{ messages.donateWechat }}</figcaption>
              </figure>
              <figure>
                <img :src="zfbQrCode" :alt="messages.donateAlipay" />
                <figcaption>{{ messages.donateAlipay }}</figcaption>
              </figure>
            </div>
          </div>
        </section>
      </div>
    </Transition>
  </Teleport>

  <Teleport to="body">
    <Transition name="confirm-dialog">
      <div
        v-if="showFeedback"
        class="dialog-overlay"
        role="dialog"
        aria-modal="true"
        :aria-label="messages.feedbackTitle"
        @click.self="showFeedback = false"
      >
        <section class="dialog-panel feedback-dialog-panel">
          <header>
            <h2>{{ messages.feedbackTitle }}</h2>
            <button
              type="button"
              :aria-label="messages.feedbackClose"
              :title="messages.feedbackClose"
              @click="showFeedback = false"
            >
              <X :size="19" />
            </button>
          </header>
          <div class="feedback-dialog-body">
            <iframe
              class="feedback-iframe"
              :src="FEEDBACK_URL"
              :title="messages.feedbackTitle"
              referrerpolicy="strict-origin-when-cross-origin"
              @error="handleFeedbackError"
            ></iframe>
            <p v-if="feedbackLoadFailed" class="feedback-load-failed">{{
              messages.feedbackOpenExternal
            }}</p>
            <a
              class="feedback-external-link"
              :href="FEEDBACK_URL"
              target="_blank"
              rel="noreferrer"
              >{{ messages.feedbackOpenExternal }}</a
            >
          </div>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>
