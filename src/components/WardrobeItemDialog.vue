<script setup lang="ts">
import CatalogImage from './CatalogImage.vue'
import { getCatalogImageSource } from '../utils/gongeo/catalogImage'
import WardrobeFormNav from './WardrobeFormNav.vue'
import { wardrobeFamilyKey } from '../utils/wardrobe/wardrobeFamilies'
import { computed, ref, watch } from 'vue'
import { ExternalLink, X } from 'lucide-vue-next'
import type { Language } from '../i18n/types'
import type { WardrobeSnapshot } from '../utils/wardrobe/wardrobeStorage'
import type { WardrobeCatalog, WardrobeEntry } from '../utils/wardrobe/wardrobeCatalog'
import { useBodyScrollLock } from '../utils/bodyScrollLock'
import { useModalFocus } from '../composables/useModalFocus'

const props = defineProps<{
  item: WardrobeEntry | null
  catalog?: WardrobeCatalog | null
  snapshot?: WardrobeSnapshot
  outfits: WardrobeEntry[]
  layer?: number
  language: Language
}>()
const hasForms = computed(
  () =>
    !!props.item &&
    (props.catalog?.entries ?? []).filter(
      (entry) => wardrobeFamilyKey(entry) === wardrobeFamilyKey(props.item!)
    ).length > 1
)
const emit = defineEmits<{
  close: []
  selectForm: [entry: WardrobeEntry]
  openOutfit: [outfit: WardrobeEntry]
}>()
const visible = computed(() => !!props.item)
const panel = ref<HTMLElement | null>(null)
const imageState = ref<'loading' | 'loaded' | 'failed'>('loading')
const imageUrl = computed(() => (props.item ? getCatalogImageSource('item', props.item.id) : ''))
const text = (zh: string, en: string) => (props.language === 'zh' ? zh : en)
const close = () => emit('close')
watch(
  () => props.item?.id,
  () => {
    imageState.value = 'loading'
  },
  { immediate: true }
)
useBodyScrollLock(visible)
useModalFocus(visible, panel, close)
</script>

<template>
  <Teleport to="body">
    <Transition name="confirm-dialog" appear>
      <div
        v-if="item"
        class="outfit-detail-overlay"
        :style="{ zIndex: layer ?? 220 }"
        @click.self="close"
      >
        <section
          ref="panel"
          class="outfit-editor-panel outfit-detail-panel is-single-column"
          :class="{ 'has-form-navigation': hasForms }"
          tabindex="-1"
          role="dialog"
          aria-modal="true"
          aria-labelledby="wardrobe-item-title"
        >
          <header>
            <h2 id="wardrobe-item-title">{{ text('部件详情', 'Item details') }}</h2>
            <button type="button" :aria-label="text('关闭', 'Close')" @click="close">
              <X :size="19" aria-hidden="true" />
            </button>
          </header>
          <div class="wardrobe-detail-scroll">
            <WardrobeFormNav
              ownership-icons
              v-if="hasForms"
              :entry="item"
              :catalog="catalog"
              :snapshot="snapshot"
              :language="language"
              @select="emit('selectForm', $event)"
            />
            <div class="outfit-detail-content is-single-column">
              <section class="outfit-detail-summary">
                <div
                  class="outfit-detail-image-frame"
                  :class="{ 'is-image-loading': imageState === 'loading' }"
                  :aria-busy="imageState === 'loading'"
                >
                  <CatalogImage
                    :language="language"
                    :key="item.id"
                    class="outfit-detail-image"
                    loading="eager"
                    fetchpriority="high"
                    :class="{ 'is-loading': imageState === 'loading' }"
                    referrerpolicy="strict-origin-when-cross-origin"
                    :src="imageUrl"
                    :alt="item.name[language]"
                    @load="imageState = 'loaded'"
                    @error="imageState = 'failed'"
                    @retry="imageState = 'loading'"
                  />
                  <div
                    v-if="imageState === 'loading'"
                    class="visually-hidden"
                    role="status"
                  >
                    <span>{{ text('正在加载图片…', 'Loading image…') }}</span>
                  </div>
                </div>
                <dl class="outfit-detail-info">
                  <div
                    ><dt>{{ text('所属套装', 'Outfit') }}</dt
                    ><dd>
                      <template v-if="outfits.length">
                        <span v-for="(outfit, index) in outfits" :key="outfit.id">
                          <span v-if="index"> / </span>{{ outfit.name[language] }}
                          <button
                            type="button"
                            class="wardrobe-outfit-link"
                            :aria-label="
                              text('查看套装：', 'View outfit: ') + outfit.name[language]
                            "
                            :title="text('查看套装', 'View outfit')"
                            @click="emit('openOutfit', outfit)"
                            ><ExternalLink :size="15" aria-hidden="true"
                          /></button>
                        </span>
                      </template>
                      <template v-else>{{ text('无所属套装', 'No associated outfit') }}</template>
                    </dd></div
                  >
                  <div
                    ><dt>{{ text('当前部件', 'Current item') }}</dt
                    ><dd>{{ item.name[language] }}</dd></div
                  >
                </dl>
              </section>
            </div>
          </div>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.wardrobe-outfit-link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  vertical-align: middle;
  margin-left: 4px;
  padding: 4px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--pink-deep);
  cursor: pointer;
}
.wardrobe-outfit-link:hover,
.wardrobe-outfit-link:focus-visible {
  background: var(--soft);
  outline: 1px solid var(--pink-deep);
}
</style>
