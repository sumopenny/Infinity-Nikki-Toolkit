// 选择状态管理：处理照片、搭配和回收站项目的选择、全选及收藏联动。
import type { AlbumView } from '../components/AlbumViewSwitcher.vue'
import { computed, watch, type Ref } from 'vue'
import type { PhotoItem, RecentlyDeletedPhoto } from '../utils/photoGrouping'
import type { OutfitItem } from '../utils/outfit/outfitTypes'

function toggleId(ids: Set<string>, id: string) {
  const next = new Set(ids)
  next.has(id) ? next.delete(id) : next.add(id)
  return next
}
// 仅切换当前可见范围，保留筛选范围之外的选择。
function toggleVisible(ids: Set<string>, items: { id: string }[], selected: boolean) {
  const next = new Set(ids)
  for (const item of items) selected ? next.delete(item.id) : next.add(item.id)
  return next
}

export function useSelectionState(options: {
  recentlyDeleted: Ref<RecentlyDeletedPhoto[]>
  visiblePhotos: Ref<PhotoItem[]>
  visibleOutfits: Ref<OutfitItem[]>
  dateGroups: Ref<Array<{ dateKey: string; photos: PhotoItem[] }>>
  favoriteIds: Ref<Set<string>>
  selectedIds: Ref<Set<string>>
  selectedOutfitIds: Ref<Set<string>>
  trashSelectedIds: Ref<Set<string>>
  activeView: Ref<AlbumView>
}) {
  const {
    visiblePhotos,
    visibleOutfits,
    dateGroups,
    favoriteIds,
    selectedIds,
    selectedOutfitIds,
    trashSelectedIds,
    recentlyDeleted,
    activeView
  } = options
  // 筛选或刷新后剔除不可操作项目，避免列表无勾选却仍留在选择模式。
  for (const [items, selection] of [
    [visiblePhotos, selectedIds],
    [visibleOutfits, selectedOutfitIds],
    [recentlyDeleted, trashSelectedIds]
  ] as const) {
    watch(
      () => items.value.map((item) => item.id),
      (ids) => {
        const visible = new Set(ids)
        const next = new Set([...selection.value].filter((id) => visible.has(id)))
        if (next.size !== selection.value.size) selection.value = next
      }
    )
  }
  const scopedSelectedPhotos = computed(() =>
    visiblePhotos.value.filter((photo) => selectedIds.value.has(photo.id))
  )
  const selectedCount = computed(() => scopedSelectedPhotos.value.length)
  const selectedOutfitCount = computed(
    () => visibleOutfits.value.filter((outfit) => selectedOutfitIds.value.has(outfit.id)).length
  )
  const trashSelectedCount = computed(
    () => recentlyDeleted.value.filter((photo) => trashSelectedIds.value.has(photo.id)).length
  )
  const allSelected = computed(
    () =>
      visiblePhotos.value.length > 0 &&
      visiblePhotos.value.every((photo) => selectedIds.value.has(photo.id))
  )
  const allOutfitsSelected = computed(
    () =>
      visibleOutfits.value.length > 0 &&
      visibleOutfits.value.every((outfit) => selectedOutfitIds.value.has(outfit.id))
  )
  const allTrashSelected = computed(
    () =>
      recentlyDeleted.value.length > 0 &&
      recentlyDeleted.value.every((photo) => trashSelectedIds.value.has(photo.id))
  )
  const allSelectedFavorited = computed(
    () =>
      scopedSelectedPhotos.value.length > 0 &&
      scopedSelectedPhotos.value.every((photo) => favoriteIds.value.has(photo.id))
  )

  const toggleAll = () => {
    selectedIds.value = toggleVisible(selectedIds.value, visiblePhotos.value, allSelected.value)
  }
  const toggleAllOutfits = () => {
    selectedOutfitIds.value = toggleVisible(
      selectedOutfitIds.value,
      visibleOutfits.value,
      allOutfitsSelected.value
    )
  }
  const toggleOutfit = (id: string) => {
    selectedOutfitIds.value = toggleId(selectedOutfitIds.value, id)
  }
  const togglePhoto = (id: string) => {
    selectedIds.value = toggleId(selectedIds.value, id)
  }
  const toggleTrashPhoto = (id: string) => {
    trashSelectedIds.value = toggleId(trashSelectedIds.value, id)
  }

  const toggleAllTrash = () => {
    trashSelectedIds.value = allTrashSelected.value
      ? new Set()
      : new Set(recentlyDeleted.value.map((photo) => photo.id))
  }

  const toggleFavorite = (id: string) => {
    const next = toggleId(favoriteIds.value, id)
    favoriteIds.value = next
    if (activeView.value === 'favorites' && !next.has(id)) {
      selectedIds.value = new Set([...selectedIds.value].filter((selectedId) => selectedId !== id))
    }
  }

  const favoriteSelectedPhotos = () => {
    favoriteIds.value = new Set([
      ...favoriteIds.value,
      ...scopedSelectedPhotos.value.map((photo) => photo.id)
    ])
  }

  const unfavoriteSelectedPhotos = () => {
    const ids = new Set(scopedSelectedPhotos.value.map((photo) => photo.id))
    favoriteIds.value = new Set([...favoriteIds.value].filter((id) => !ids.has(id)))
    if (activeView.value === 'favorites') {
      selectedIds.value = new Set([...selectedIds.value].filter((id) => !ids.has(id)))
    }
  }

  const clearAlbumSelection = () => {
    selectedIds.value = new Set()
  }

  const clearOutfitSelection = () => {
    selectedOutfitIds.value = new Set()
  }

  const clearTrashSelection = () => {
    trashSelectedIds.value = new Set()
  }

  const toggleDate = (dateKey: string) => {
    const group = dateGroups.value.find((item) => item.dateKey === dateKey)
    if (!group) return

    const next = new Set(selectedIds.value)
    const selected = group.photos.every((photo) => next.has(photo.id))
    for (const photo of group.photos) {
      selected ? next.delete(photo.id) : next.add(photo.id)
    }
    selectedIds.value = next
  }

  return {
    scopedSelectedPhotos,
    selectedCount,
    selectedOutfitCount,
    trashSelectedCount,
    allSelected,
    allOutfitsSelected,
    allTrashSelected,
    allSelectedFavorited,
    toggleAll,
    toggleAllOutfits,
    toggleOutfit,
    togglePhoto,
    toggleTrashPhoto,
    toggleAllTrash,
    toggleFavorite,
    favoriteSelectedPhotos,
    unfavoriteSelectedPhotos,
    clearAlbumSelection,
    clearOutfitSelection,
    clearTrashSelection,
    toggleDate
  }
}
