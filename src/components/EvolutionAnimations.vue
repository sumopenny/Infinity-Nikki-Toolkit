<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import { Play, ExternalLink } from 'lucide-vue-next'
import type { Language } from '../i18n/types'
import {
  animations,
  animationPlayerUrl,
  animationWatchUrl,
  type EvolutionAnimation
} from '../utils/evolutionAnimations'

const props = defineProps<{ selectedPage: number; loadOnEntry: boolean; language: Language }>()
const emit = defineEmits<{ 'update:selectedPage': [page: number] }>()
const loaded = ref(props.loadOnEntry)
const player = ref<HTMLElement | null>(null)
const failedImages = ref(new Set<string>())
const selected = computed(
  () => animations.find((item) => item.page === props.selectedPage) ?? animations[0]
)
const groups = [...new Set(animations.map((item) => item.version))].map((version) => ({
  version,
  items: animations.filter((item) => item.version === version)
}))
const text = (zh: string, en: string) => (props.language === 'zh' ? zh : en)
const name = (item: EvolutionAnimation) =>
  props.language === 'zh' ? item.name : item.nameEn || item.name
const duration = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
async function scrollToPlayer() {
  await nextTick()
  player.value?.scrollIntoView?.({ block: 'start', behavior: 'auto' })
}
function select(item: EvolutionAnimation) {
  emit('update:selectedPage', item.page)
  loaded.value = true
  void scrollToPlayer()
}
onMounted(() => {
  // 详情入口可能异步加载页面，等播放器挂载后再定位。
  if (props.loadOnEntry) void scrollToPlayer()
})
</script>

<template>
  <section class="evolution-animations">
    <div ref="player" class="animation-player">
      <div class="animation-screen">
        <iframe
          v-if="loaded"
          :src="animationPlayerUrl(selected)"
          :title="name(selected)"
          allow="fullscreen; picture-in-picture"
          allowfullscreen
        />
        <button
          v-else
          type="button"
          class="animation-cover"
          @click="select(selected)"
          :aria-label="text('播放', 'Play') + ' ' + name(selected)"
        >
          <img
            v-if="!failedImages.has(selected.thumbnail)"
            :src="selected.thumbnail"
            alt=""
            referrerpolicy="no-referrer"
            @error="failedImages.add(selected.thumbnail)"
          />
          <span class="animation-play"><Play :size="28" />{{ text('播放', 'Play') }}</span>
        </button>
      </div>
      <div class="animation-caption">
        <div class="animation-title"
          ><h2>{{ name(selected) }}</h2
          ><span>{{ selected.version }} · {{ duration(selected.duration) }}</span></div
        >
        <a :href="animationWatchUrl(selected)" target="_blank" rel="noopener noreferrer">
          {{ text('在 B 站观看', 'Watch on Bilibili') }}<ExternalLink :size="14" />
        </a>
      </div>
    </div>
    <section v-for="group in groups" :key="group.version" class="animation-group">
      <h3>{{ text('版本', 'Version') }} {{ group.version }}</h3>
      <div class="animation-grid">
        <article
          v-for="item in group.items"
          :key="item.cid"
          class="animation-card"
          :class="{ selected: selected.page === item.page }"
        >
          <button type="button" :aria-pressed="selected.page === item.page" @click="select(item)">
            <span class="animation-thumbnail">
              <img
                v-if="!failedImages.has(item.thumbnail)"
                :src="item.thumbnail"
                alt=""
                loading="lazy"
                referrerpolicy="no-referrer"
                @error="failedImages.add(item.thumbnail)"
              />
              <Play v-else :size="24" aria-hidden="true" />
              <span class="animation-duration">{{ duration(item.duration) }}</span>
            </span>
            <span class="animation-name">{{ name(item) }}</span>
          </button>
          <a
            :href="animationWatchUrl(item)"
            target="_blank"
            rel="noopener noreferrer"
            :aria-label="text('在 B 站观看', 'Watch on Bilibili') + ' ' + name(item)"
          >
            {{ text('在 B 站观看', 'Watch on Bilibili') }}<ExternalLink :size="12" />
          </a>
        </article>
      </div>
    </section>
  </section>
</template>

<style scoped>
.evolution-animations {
  width: 100%;
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
  box-sizing: border-box;
}
.animation-player {
  scroll-margin-top: 100px;
}
.animation-screen {
  aspect-ratio: 22 / 9;
  background: #25232b;
  border-radius: 16px;
  overflow: hidden;
}
.animation-screen iframe,
.animation-cover {
  width: 100%;
  height: 100%;
  border: 0;
  display: block;
}
.animation-cover {
  position: relative;
  padding: 0;
  cursor: pointer;
  background: #25232b;
}
.animation-cover img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.animation-play {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: white;
  background: #0003;
  font-size: 18px;
}
.animation-caption {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 0;
}
.animation-title {
  display: flex;
  align-items: baseline;
  gap: 12px;
  min-width: 0;
  max-width: 100%;
}
.animation-caption h2 {
  min-width: 0;
  overflow-wrap: anywhere;
  font-size: 20px;
  margin: 0;
}
.animation-caption span {
  flex-shrink: 0;
  white-space: nowrap;
  font-size: 13px;
  opacity: 0.7;
}
a {
  color: inherit;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  text-underline-offset: 3px;
}
.animation-group h3 {
  font-size: 16px;
  margin: 24px 0 12px;
}
.animation-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
  gap: 16px;
}
.animation-card {
  --photo-hover-shadow: 0 1px 5px rgba(201, 132, 134, 0.202);
  min-width: 0;
  border: 1px solid var(--line);
  border-radius: var(--ui-radius);
  overflow: hidden;
  background: var(--surface);
  box-shadow: var(--photo-shadow);
  transition:
    border-color var(--motion-fast) ease,
    box-shadow var(--motion-fast) ease;
}
:where(:root[data-theme='dark']) .animation-card {
  --photo-hover-shadow: 0 2px 8px rgba(185, 126, 126, 0.524);
}
:root.is-theme-switching .animation-card {
  transition: none;
}
.animation-card:hover,
.animation-card:has(:focus-visible) {
  border-color: var(--pink-deep);
  box-shadow: var(--photo-hover-shadow);
}
.animation-card.selected {
  border-color: var(--pink-deep);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--pink-deep) 20%, transparent);
}
@supports not (color: color-mix(in srgb, black, white)) {
  .animation-card.selected {
    box-shadow: 0 0 0 2px rgba(201, 132, 134, 0.2);
  }
  :where(:root[data-theme='dark']) .animation-card.selected {
    box-shadow: 0 0 0 2px rgba(239, 176, 178, 0.2);
  }
}
.animation-card button {
  display: block;
  width: 100%;
  border: 0;
  padding: 0;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
  font: inherit;
}
.animation-thumbnail {
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  aspect-ratio: 22 / 9;
  background: var(--frame-bg);
}
.animation-thumbnail img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.animation-duration {
  position: absolute;
  right: 6px;
  bottom: 6px;
  border-radius: 4px;
  padding: 2px 5px;
  background: #0009;
  color: white;
  font-size: 11px;
}
.animation-name {
  display: block;
  padding: 12px 12px 6px;
  font-size: 14px;
}
.animation-card > a {
  margin: 0 12px 12px;
  opacity: 0.75;
}
button:focus-visible,
a:focus-visible {
  outline: 2px solid var(--pink-deep);
  outline-offset: -3px;
}
@media (max-width: 700px) {
  .evolution-animations {
    padding: 12px;
  }
  .animation-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }
  .animation-caption {
    align-items: flex-start;
  }
  .animation-caption h2 {
    font-size: 17px;
  }
  .animation-caption > a {
    flex-shrink: 0;
  }
  .animation-screen {
    aspect-ratio: 16 / 9;
    border-radius: 10px;
  }
}
</style>
