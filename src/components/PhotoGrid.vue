<script setup lang="ts">
import { vSelectableCard } from '../utils/selectableCard'
import PhotoSelectionBadge from './PhotoSelectionBadge.vue'
import { vImageSkeleton } from '../utils/imageSkeleton'
import { optimizedImageKitUrl } from '../utils/imagekit'
import { vCardReveal } from '../utils/cardReveal'
import { computed, onBeforeUnmount, watch } from 'vue'
import { Check, Edit3, Heart, ScanSearch, Share2 } from 'lucide-vue-next'
import type { LocaleMessages } from '../i18n'
import type { ThumbnailMode, ThumbnailSize } from '../types/thumbnail'
import type { ActionGroup, DateGroup, PhotoItem, PhotoDisplayItem } from '../utils/photoGrouping'
import { createPhotoThumbnailCache } from '../utils/photoThumbnail'
import LazyPhotoImage from './LazyPhotoImage.vue'
import WindowedPhotoBatch from './WindowedPhotoBatch.vue'
const batches = (photos: PhotoItem[]) =>
  Array.from({ length: Math.ceil(photos.length / 36) }, (_, i) =>
    photos.slice(i * 36, (i + 1) * 36)
  )

const props = defineProps<{
  language?: 'zh' | 'en'
  readOnly?: boolean
  readOnlyHint?: string
  dateGroups: DateGroup[]
  actionGroups?: ActionGroup[]
  groupingMode?: 'date' | 'action'
  selectedIds: Set<string>
  favoriteIds: Set<string>
  thumbnailMode: ThumbnailMode
  thumbnailSize?: ThumbnailSize
  isFavoritesView: boolean
  messages: LocaleMessages['grid']
}>()

const emit = defineEmits<{
  togglePhoto: [photoId: string]
  toggleFavorite: [photoId: string]
  toggleDate: [dateKey: string]
  toggleGroup: [photoIds: string[]]
  openPreview: [photo: PhotoItem]
  editNote: [photo: PhotoItem]
  parsePhoto: [photo: PhotoItem]
  sharePhoto: [photo: PhotoItem]
}>()

const thumbnailCache = createPhotoThumbnailCache()
const loadThumbnail = computed(() => {
  const size = props.thumbnailSize === 'small' ? 512 : props.thumbnailSize === 'large' ? 1024 : 768
  return (photo: PhotoDisplayItem, signal?: AbortSignal) =>
    thumbnailCache.load(photo, signal!, size)
})

const renderGroups = computed(() =>
  (props.groupingMode ?? 'date') === 'action'
    ? (props.actionGroups ?? []).map((group) => ({
        key: group.actionKey,
        title: group.actionName,
        photos: group.photos,
        actionImageUrl: group.actionImageUrl,
        isAction: true
      }))
    : props.dateGroups.map((group) => ({
        key: group.dateKey,
        title: group.displayDate,
        photos: group.photos,
        actionImageUrl: undefined,
        isAction: false
      }))
)

const batchedGroups = computed(() =>
  renderGroups.value.map((group) => ({ ...group, batches: batches(group.photos) }))
)
const selectedGroups = computed(
  () =>
    new Set(
      renderGroups.value
        .filter(
          (group) =>
            group.photos.length > 0 &&
            group.photos.every((photo) => props.selectedIds.has(photo.id))
        )
        .map((group) => group.key)
    )
)
watch(
  renderGroups,
  (groups) => thumbnailCache.retainPhotos(new Set(groups.flatMap((group) => group.photos))),
  { flush: 'post' }
)

function toggleGroup(group: { key: string; photos: PhotoItem[]; isAction: boolean }) {
  if (group.isAction)
    emit(
      'toggleGroup',
      group.photos.map((photo) => photo.id)
    )
  else emit('toggleDate', group.key)
}

/** 返回卡片悬浮信息；小图模式和未知元数据只显示时间。参数：photo 为照片。 */
function getPhotoMeta(photo: PhotoItem): string {
  return props.thumbnailSize !== 'small' && photo.fileSizeText && photo.fileSizeText !== '--'
    ? `${photo.timeText} · ${photo.fileSizeText}`
    : photo.timeText
}

/** 切换收藏后释放按钮焦点，避免取消收藏后因焦点状态持续显示。参数：photoId 为照片 ID，event 为点击事件。 */
function handleFavoriteClick(photoId: string, event: MouseEvent) {
  emit('toggleFavorite', photoId)
  ;(event.currentTarget as HTMLButtonElement).blur()
}

onBeforeUnmount(() => thumbnailCache.dispose())
</script>

<template>
  <div
    class="photo-grid-wrap"
    :class="[`mode-${thumbnailMode}`, `thumbnail-size-${thumbnailSize ?? 'medium'}`]"
  >
    <div v-if="!renderGroups.length" class="empty-album inline-empty">
      <Heart :size="30" aria-hidden="true" />
      <h2>{{ isFavoritesView ? messages.emptyFavoritesTitle : messages.emptyTitle }}</h2>
      <p>{{ isFavoritesView ? messages.emptyFavoritesDescription : messages.emptyDescription }}</p>
    </div>

    <section
      v-for="group in batchedGroups"
      :id="`${group.isAction ? 'action' : 'date'}-${group.key}`"
      :key="group.key"
      class="date-block"
      :class="{ 'is-action-group': group.isAction }"
    >
      <div class="date-block-header">
        <h2
          ><img
            v-image-skeleton
            v-if="group.actionImageUrl"
            referrerpolicy="strict-origin-when-cross-origin"
            class="action-group-image"
            :src="optimizedImageKitUrl(group.actionImageUrl)"
            :alt="group.title"
          />{{ group.title }} · {{ messages.photoCount(group.photos.length) }}</h2
        >
        <button
          class="date-select-button"
          type="button"
          :class="{ active: selectedGroups.has(group.key) }"
          :aria-pressed="selectedGroups.has(group.key)"
          :title="messages.selectDay"
          :aria-label="messages.selectDay"
          @click="toggleGroup(group)"
        >
          <Check :size="16" aria-hidden="true" />
        </button>
      </div>

      <WindowedPhotoBatch
        v-for="(batch, index) in group.batches"
        :key="index"
        :count="batch.length"
        :layout-key="`${thumbnailMode}:${thumbnailSize}`"
        :aspect-ratio="
          {
            default: 1,
            wide: 16 / 9,
            standard: 4 / 3,
            'portrait-wide': 9 / 16,
            'portrait-standard': 3 / 4
          }[thumbnailMode]
        "
      >
        <article
          v-for="photo in batch"
          :key="photo.id"
          v-card-reveal="`album:${photo.id}`"
          class="photo-card selectable-card"
          v-selectable-card="{
            selected: selectedIds.has(photo.id),
            selectionMode: selectedIds.size > 0,
            toggle: () => emit('togglePhoto', photo.id),
            preview: () => emit('openPreview', photo)
          }"
          :class="{ selected: selectedIds.has(photo.id), favorited: favoriteIds.has(photo.id) }"
          tabindex="0"
        >
          <div class="photo-frame">
            <LazyPhotoImage
              :photo="photo"
              :load-photo="loadThumbnail"
              :use-source-url="false"
              :failure-text="messages.imageLoadFailed"
            />
            <div class="photo-overlay">
              <span>{{ getPhotoMeta(photo) }}</span>
            </div>
            <PhotoSelectionBadge :selected="selectedIds.has(photo.id)" :language="language" />
            <button
              class="card-action card-share-button"
              type="button"
              :title="language === 'en' ? 'Export share image' : '导出分享图'"
              :aria-label="language === 'en' ? 'Export share image' : '导出分享图'"
              @click.stop="emit('sharePhoto', photo)"
              @dblclick.stop
              @keydown.stop
              ><Share2 :size="16" aria-hidden="true"
            /></button>
            <button
              class="card-action card-action-inspect photo-params-parse"
              type="button"
              :title="messages.parsePhoto"
              :aria-label="messages.parsePhoto"
              @click.stop="emit('parsePhoto', photo)"
            >
              <ScanSearch :size="16" aria-hidden="true" />
            </button>
            <button
              class="card-action favorite-heart"
              type="button"
              :class="{ active: favoriteIds.has(photo.id) }"
              :aria-label="
                favoriteIds.has(photo.id) ? messages.removeFavorite : messages.addFavorite
              "
              :title="favoriteIds.has(photo.id) ? messages.removeFavorite : messages.addFavorite"
              @click.stop="handleFavoriteClick(photo.id, $event)"
            >
              <Heart
                :size="17"
                :fill="favoriteIds.has(photo.id) ? 'currentColor' : 'none'"
                aria-hidden="true"
              />
            </button>
            <button
              class="card-action card-action-edit photo-note-edit"
              type="button"
              :disabled="readOnly"
              :title="readOnly ? readOnlyHint : messages.editNote"
              :aria-label="messages.editNote"
              @click.stop="!readOnly && emit('editNote', photo)"
              ><Edit3 :size="16"
            /></button>
          </div>
        </article>
      </WindowedPhotoBatch>
    </section>
  </div>
</template>
