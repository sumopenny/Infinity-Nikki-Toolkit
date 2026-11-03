<script setup lang="ts">
import { vCardReveal } from '../utils/cardReveal'
import { computed, onBeforeUnmount } from 'vue'
import { Check, Edit3, Heart, ScanSearch, Share2 } from 'lucide-vue-next'
import type { LocaleMessages } from '../i18n'
import type { ThumbnailMode, ThumbnailSize } from '../types/thumbnail'
import type { ActionGroup, DateGroup, PhotoItem } from '../utils/photoGrouping'
import { createPhotoLoadQueue } from '../utils/photoLoader'
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

const photoLoadQueue = createPhotoLoadQueue(3)

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

function isGroupSelected(photos: PhotoItem[]): boolean {
  return photos.length > 0 && photos.every((photo) => props.selectedIds.has(photo.id))
}

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

onBeforeUnmount(() => photoLoadQueue.cancel())
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
      v-for="group in renderGroups"
      :id="`${group.isAction ? 'action' : 'date'}-${group.key}`"
      :key="group.key"
      class="date-block"
      :class="{ 'is-action-group': group.isAction }"
    >
      <div class="date-block-header">
        <h2
          ><img
            v-if="group.actionImageUrl"
            class="action-group-image"
            :src="group.actionImageUrl"
            :alt="group.title"
          />{{ group.title }} · {{ messages.photoCount(group.photos.length) }}</h2
        >
        <button
          class="date-select-button"
          type="button"
          :class="{ active: isGroupSelected(group.photos) }"
          :aria-pressed="isGroupSelected(group.photos)"
          :title="messages.selectDay"
          :aria-label="messages.selectDay"
          @click="toggleGroup(group)"
        >
          <Check :size="16" aria-hidden="true" />
        </button>
      </div>

      <WindowedPhotoBatch
        v-for="(batch, index) in batches(group.photos)"
        :key="index"
        :count="batch.length"
      >
        <article
          v-for="photo in batch"
          :key="photo.id"
          v-card-reveal="`album:${photo.id}`"
          class="photo-card"
          :class="{ selected: selectedIds.has(photo.id), favorited: favoriteIds.has(photo.id) }"
          tabindex="0"
          @click="$emit('togglePhoto', photo.id)"
          @dblclick.stop="$emit('openPreview', photo)"
          @keydown.enter="$emit('togglePhoto', photo.id)"
        >
          <div class="photo-frame">
            <LazyPhotoImage
              :photo="photo"
              :load-photo="photoLoadQueue.load"
              :failure-text="messages.imageLoadFailed"
            />
            <div class="photo-overlay">
              <span>{{ getPhotoMeta(photo) }}</span>
            </div>
            <span class="selected-badge"><Check :size="15" aria-hidden="true" /></span>
            <button
              class="card-share-button"
              type="button"
              :title="language === 'en' ? 'Export share image' : '导出分享图'"
              :aria-label="language === 'en' ? 'Export share image' : '导出分享图'"
              @click.stop="emit('sharePhoto', photo)"
              @dblclick.stop
              @keydown.stop
              ><Share2 :size="16" aria-hidden="true"
            /></button>
            <button
              class="photo-params-parse"
              type="button"
              :title="messages.parsePhoto"
              :aria-label="messages.parsePhoto"
              @click.stop="emit('parsePhoto', photo)"
            >
              <ScanSearch :size="16" aria-hidden="true" />
            </button>
            <button
              class="favorite-heart"
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
              class="photo-note-edit"
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
