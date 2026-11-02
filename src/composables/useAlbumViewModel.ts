// 相册视图模型：集中计算筛选结果、日期分组、预览数据和界面展示文案。
import { computed, type ComputedRef, type Ref } from 'vue'
import { getThumbnailModeOptions, type LocaleMessages } from '../i18n'
import {
  groupDatesByYear,
  groupPhotosByAction,
  groupPhotosByDate,
  type ActionGroup,
  type ActionSort,
  type PhotoActionInfo,
  type PhotoDisplayItem,
  type PhotoItem,
  type RecentlyDeletedPhoto
} from '../utils/photoGrouping'
import { formatFileSize } from '../utils/file-system/photoUrl'
import type { OutfitItem } from '../utils/outfit/outfitTypes'
import type { OutfitFilter } from '../components/OutfitSidebar.vue'
import type { ThumbnailMode } from '../types/thumbnail'
import { resourceName } from '../utils/photo-params/resourceManifest'

export function useAlbumViewModel(options: {
  photos: Ref<PhotoItem[]>
  outfits: Ref<OutfitItem[]>
  recentlyDeleted: Ref<RecentlyDeletedPhoto[]>
  favoriteIds: Ref<Set<string>>
  activeView: Ref<'all' | 'favorites' | 'trash' | 'outfits' | 'home' | 'resonance' | 'wardrobe'>
  activeOutfitFilter: Ref<OutfitFilter>
  searchQuery: Ref<string>
  currentPreview: Ref<PhotoDisplayItem | null>
  thumbnailMode: Ref<ThumbnailMode>
  outfitThumbnailMode: Ref<ThumbnailMode>
  homeThumbnailMode: Ref<ThumbnailMode>
  directoryState: Ref<
    { type: 'none' } | { type: 'remembered'; name: string } | { type: 'selected'; name: string }
  >
  language: Ref<'zh' | 'en'>
  locale: ComputedRef<LocaleMessages>
  actionInfo: Ref<Map<string, PhotoActionInfo>>
  actionSort: Ref<ActionSort>
}) {
  const {
    photos,
    outfits,
    recentlyDeleted,
    favoriteIds,
    activeView,
    activeOutfitFilter,
    searchQuery,
    currentPreview,
    thumbnailMode,
    outfitThumbnailMode,
    homeThumbnailMode,
    directoryState,
    language,
    locale,
    actionInfo,
    actionSort
  } = options
  const outfitLocale = computed(() => locale.value.outfit)
  const normalizedSearch = computed(() => searchQuery.value.trim().toLocaleLowerCase())

  function matchesSearch(value: string): boolean {
    return !normalizedSearch.value || value.toLocaleLowerCase().includes(normalizedSearch.value)
  }

  const favoritePhotos = computed(() =>
    photos.value.filter((photo) => favoriteIds.value.has(photo.id))
  )
  const visiblePhotos = computed(() => {
    const source = activeView.value === 'favorites' ? favoritePhotos.value : photos.value
    return source.filter((photo) => matchesSearch(`${photo.name} ${photo.note}`))
  })
  const visibleOutfits = computed(() => {
    let result = outfits.value
    if (activeOutfitFilter.value === 'pending')
      result = result.filter((outfit) => !outfit.code.trim())
    else if (activeOutfitFilter.value === 'uncategorized')
      result = result.filter((outfit) => !outfit.tags.length)
    if (activeOutfitFilter.value.startsWith('tag:')) {
      const tag = activeOutfitFilter.value.slice(4)
      result = result.filter((outfit) => outfit.tags[0] === tag)
    }
    return result.filter((outfit) => matchesSearch(`${outfit.name} ${outfit.note} ${outfit.code}`))
  })
  const previewPhotos = computed<(PhotoItem | OutfitItem)[]>(() => {
    if (activeView.value === 'trash') return recentlyDeleted.value
    if (activeView.value === 'outfits') return visibleOutfits.value.filter((outfit) => outfit.image)
    return visiblePhotos.value
  })
  const currentPreviewOutfit = computed(() => {
    if (activeView.value !== 'outfits' || !currentPreview.value) return null
    return outfits.value.find((outfit) => outfit.id === currentPreview.value?.id) ?? null
  })
  const dateGroups = computed(() => groupPhotosByDate(visiblePhotos.value))
  const formattedDateGroups = computed(() =>
    dateGroups.value.map((group) => ({
      ...group,
      displayDate: locale.value.date.displayDate(group.dateKey),
      monthDay: locale.value.date.monthDay(group.dateKey)
    }))
  )
  const yearGroups = computed(() => groupDatesByYear(formattedDateGroups.value))
  const actionGroups = computed<ActionGroup[]>(() =>
    groupPhotosByAction(visiblePhotos.value, actionInfo.value, actionSort.value, {
      none: locale.value.sidebar.noAction,
      unparsed: locale.value.sidebar.unparsed
    }).map((group) =>
      group.actionId
        ? { ...group, actionName: resourceName('pose', group.actionId, language.value) }
        : group
    )
  )
  const visibleCount = computed(() => visiblePhotos.value.length)
  const favoriteCount = computed(() => favoritePhotos.value.length)
  const trashTotalSize = computed(() =>
    recentlyDeleted.value.reduce((total, photo) => total + (photo.size ?? 0), 0)
  )
  const trashTotalSizeText = computed(() => formatFileSize(trashTotalSize.value))
  const thumbnailModeOptions = computed(() => getThumbnailModeOptions(language.value))
  // 相册、搭配与家园分别记忆比例，切换模块时恢复对应设置。
  const displayedThumbnailMode = computed(() => {
    if (activeView.value === 'home') return homeThumbnailMode.value
    return activeView.value === 'outfits' ? outfitThumbnailMode.value : thumbnailMode.value
  })
  const directoryName = computed(() => {
    if (directoryState.value.type === 'remembered')
      return locale.value.app.rememberedDirectory(directoryState.value.name)
    if (directoryState.value.type === 'selected') return directoryState.value.name
    return locale.value.app.noDirectory
  })
  const viewTitle = computed(() => {
    if (activeView.value === 'outfits') return outfitLocale.value.viewName
    if (activeView.value === 'home') return locale.value.homeScheme.viewName
    if (activeView.value === 'favorites') return locale.value.viewNav.favorites
    if (activeView.value === 'trash') return locale.value.viewNav.recentlyDeleted
    return locale.value.viewNav.allPhotos
  })
  return {
    outfitLocale,
    visiblePhotos,
    visibleOutfits,
    previewPhotos,
    currentPreviewOutfit,
    dateGroups,
    formattedDateGroups,
    yearGroups,
    actionGroups,
    visibleCount,
    favoriteCount,
    trashTotalSize,
    trashTotalSizeText,
    thumbnailModeOptions,
    displayedThumbnailMode,
    directoryName,
    viewTitle
  }
}
