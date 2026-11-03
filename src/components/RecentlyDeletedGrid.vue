<script setup lang="ts">
import { vCardReveal } from '../utils/cardReveal'
import { computed, onBeforeUnmount } from 'vue'
import { Check, Trash2 } from 'lucide-vue-next'
import type { Language, LocaleMessages } from '../i18n'
import type { ThumbnailMode, ThumbnailSize } from '../types/thumbnail'
import type { RecentlyDeletedPhoto } from '../utils/photoGrouping'
import { createPhotoLoadQueue } from '../utils/photoLoader'
import LazyPhotoImage from './LazyPhotoImage.vue'
import WindowedPhotoBatch from './WindowedPhotoBatch.vue'

const props = defineProps<{
  photos: RecentlyDeletedPhoto[]
  selectedIds: Set<string>
  thumbnailMode: ThumbnailMode
  thumbnailSize?: ThumbnailSize
  language: Language
  messages: LocaleMessages['trash']
}>()

defineEmits<{
  togglePhoto: [photoId: string]
  openPreview: [photo: RecentlyDeletedPhoto]
}>()

const batches = computed(() => Array.from({ length: Math.ceil(props.photos.length / 36) }, (_, i) => props.photos.slice(i * 36, (i + 1) * 36)))
const photoLoadQueue = createPhotoLoadQueue(3)

/** 按当前语言格式化删除时间。参数：deletedAt 为删除时间戳。 */
function formatDeletedAt(deletedAt: number): string {
  return new Intl.DateTimeFormat(props.language === 'zh' ? 'zh-CN' : 'en-US', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(deletedAt))
}

onBeforeUnmount(() => photoLoadQueue.cancel())
</script>

<template>
  <div
    class="trash-grid-wrap"
    :class="[`mode-${thumbnailMode}`, `thumbnail-size-${thumbnailSize ?? 'medium'}`]"
  >
    <div v-if="!photos.length" class="empty-album inline-empty">
      <Trash2 :size="30" aria-hidden="true" />
      <h2>{{ messages.emptyTitle }}</h2>
      <p>{{ messages.emptyDescription }}</p>
    </div>
    <div v-else>
      <WindowedPhotoBatch v-for="(batch, index) in batches" :key="index" :count="batch.length" class="trash-photo-grid">
      <article
        v-for="photo in batch"
        :key="photo.id"
        v-card-reveal="`trash:${photo.id}`"
        class="photo-card trash-photo-card"
        :class="{ selected: selectedIds.has(photo.id) }"
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
          <div class="photo-overlay"
            ><span>{{ messages.deletedAt(formatDeletedAt(photo.deletedAt)) }}</span></div
          >
          <span class="selected-badge"><Check :size="15" aria-hidden="true" /></span>
        </div>
      </article>
      </WindowedPhotoBatch>
    </div>
  </div>
</template>
