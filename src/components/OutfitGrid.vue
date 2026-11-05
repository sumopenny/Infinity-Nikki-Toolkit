<script setup lang="ts">
import { communityResourcesPaused } from '../communityResources'
import { vCardReveal } from '../utils/cardReveal'
import { onBeforeUnmount } from 'vue'
import { Check, Copy, Edit3, ImagePlus, ScanSearch, Shirt, Trash2, Share2 } from 'lucide-vue-next'
import type { OutfitMessages } from '../i18n'
import type { ThumbnailMode, ThumbnailSize } from '../types/thumbnail'
import type { OutfitItem } from '../utils/outfit/outfitFileSystem'
import { createPhotoLoadQueue } from '../utils/photoLoader'
import LazyPhotoImage from './LazyPhotoImage.vue'
import MobileEmptyScreenshot from './MobileEmptyScreenshot.vue'

const props = defineProps<{
  language?: 'zh' | 'en'
  outfits: OutfitItem[]
  /** 未筛选的总数，用于区分空库与搜索、标签筛选无结果。 */
  unreadableCount?: number
  totalCount?: number
  selectedIds: Set<string>
  thumbnailMode: ThumbnailMode
  thumbnailSize?: ThumbnailSize
  messages: OutfitMessages
  disabled: boolean
}>()

const emit = defineEmits<{
  copy: [outfit: OutfitItem]
  edit: [outfit: OutfitItem]
  delete: [outfit: OutfitItem]
  parse: [outfit: OutfitItem]
  share: [outfit: OutfitItem]
  openPreview: [outfit: OutfitItem]
  toggleOutfit: [outfitId: string]
}>()

const photoLoadQueue = createPhotoLoadQueue(3)
onBeforeUnmount(() => photoLoadQueue.cancel())

function toggleOutfit(outfitId: string) {
  if (!props.disabled) emit('toggleOutfit', outfitId)
}

function handleCardKeydown(event: KeyboardEvent, outfitId: string) {
  if (event.target !== event.currentTarget || event.key !== 'Enter') return
  event.preventDefault()
  toggleOutfit(outfitId)
}
</script>

<template>
  <div
    class="photo-grid-wrap outfit-grid-wrap"
    :class="[`mode-${thumbnailMode}`, `thumbnail-size-${thumbnailSize ?? 'medium'}`]"
  >
    <p v-if="unreadableCount" role="status">{{ messages.unreadableRecords(unreadableCount) }}</p>
    <div v-if="!outfits.length && (!unreadableCount || totalCount)" class="empty-album inline-empty">
      <Shirt :size="30" aria-hidden="true" />
      <h2>{{ messages.emptyTitle }}</h2>
      <p>{{ messages.emptyDescription }}</p>
      <MobileEmptyScreenshot
        v-if="(totalCount ?? outfits.length) === 0"
        page="outfits"
        :language="language"
      />
    </div>

    <div v-else-if="outfits.length" class="photo-grid outfit-grid">
      <article
        v-for="outfit in outfits"
        :key="outfit.id"
        v-card-reveal="`outfit:${outfit.id}`"
        class="photo-card outfit-card"
        :class="{ selected: selectedIds.has(outfit.id) }"
        :aria-label="outfit.code || messages.pending"
        :aria-checked="selectedIds.has(outfit.id)"
        role="checkbox"
        tabindex="0"
        @click="toggleOutfit(outfit.id)"
        @dblclick.stop="outfit.image && $emit('openPreview', outfit)"
        @keydown="handleCardKeydown($event, outfit.id)"
      >
        <div class="photo-frame">
          <LazyPhotoImage
            v-if="outfit.image"
            :photo="outfit"
            :load-photo="photoLoadQueue.load"
            :failure-text="messages.imageLoadFailed"
          />
          <div v-else class="scheme-card-no-image"><ImagePlus :size="22" aria-hidden="true" /></div>
          <!-- 无标签时仅隐藏手机浮层，电脑端保留未分类提示。 -->
          <div
            class="photo-overlay outfit-overlay"
            :class="{ 'outfit-overlay-untagged': !outfit.tags.length }"
          >
            <span class="outfit-card-tag" :title="outfit.tags.join('、')"
              ><span>{{ outfit.tags[0] || messages.uncategorized }}</span
              ><small v-if="outfit.tags.length > 1" class="mobile-only"
                >+{{ outfit.tags.length - 1 }}</small
              ></span
            >
          </div>
          <span class="selected-badge"><Check :size="15" aria-hidden="true" /></span>
          <button
            v-if="outfit.image && outfit.code"
            class="card-share-button"
            type="button"
            :disabled="disabled"
            :title="language === 'en' ? 'Export share image' : '导出分享图'"
            :aria-label="language === 'en' ? 'Export share image' : '导出分享图'"
            @click.stop="emit('share', outfit)"
            @dblclick.stop
            @keydown.stop
            ><Share2 :size="16" aria-hidden="true"
          /></button>
          <button
            class="outfit-card-delete desktop-only"
            type="button"
            :title="messages.delete"
            :aria-label="messages.delete"
            :disabled="disabled"
            @click.stop="$emit('delete', outfit)"
          >
            <Trash2 :size="16" aria-hidden="true" />
          </button>
          <button
            class="outfit-card-parse desktop-only"
            type="button"
            :title="messages.parse"
            :aria-label="messages.parse"
            :disabled="communityResourcesPaused || disabled || !outfit.code"
            @click.stop="$emit('parse', outfit)"
          >
            <ScanSearch :size="16" aria-hidden="true" />
          </button>
        </div>

        <div class="outfit-card-footer">
          <span v-if="!outfit.code" class="outfit-pending-code">{{ messages.pending }}</span>
          <span v-else class="outfit-code" :title="outfit.code">{{ outfit.code }}</span>
          <div class="outfit-card-actions" @click.stop @dblclick.stop>
            <button
              type="button"
              :title="messages.copy"
              :aria-label="messages.copy"
              :disabled="disabled || !outfit.code"
              @click.stop="$emit('copy', outfit)"
            >
              <Copy :size="15" aria-hidden="true" />
            </button>
            <button
              type="button"
              :title="messages.edit"
              :aria-label="messages.edit"
              :disabled="disabled"
              @click.stop="$emit('edit', outfit)"
            >
              <Edit3 :size="15" aria-hidden="true" />
            </button>
            <button
              class="mobile-only"
              type="button"
              :title="messages.delete"
              :aria-label="messages.delete"
              :disabled="disabled"
              @click.stop="$emit('delete', outfit)"
              ><Trash2 :size="18" aria-hidden="true"
            /></button>
            <button
              class="mobile-only"
              type="button"
              :title="messages.parse"
              :aria-label="messages.parse"
              :disabled="communityResourcesPaused || disabled || !outfit.code"
              @click.stop="$emit('parse', outfit)"
              ><ScanSearch :size="18" aria-hidden="true"
            /></button>
          </div>
        </div>
      </article>
    </div>
  </div>
</template>
