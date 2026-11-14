<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useCompactLayout } from '../composables/useCompactLayout'

const props = withDefaults(
  defineProps<{
    page: 'outfits' | 'home' | 'camera' | 'resonance' | 'wardrobe'
    language?: 'zh' | 'en'
  }>(),
  { language: 'zh' }
)
const compact = useCompactLayout()
const failed = ref(false)
// 构建时打包已提供的图片；素材尚未放入时仍可构建，运行时加载失败则隐藏。
const screenshots = import.meta.glob<string>('../../img/page/*.webp', {
  eager: true,
  query: '?url',
  import: 'default'
})
const source = computed(
  () =>
    screenshots[`../../img/page/${props.page}.webp`] ??
    `${import.meta.env.BASE_URL}img/page/${props.page}.webp`
)
const labels = {
  zh: {
    outfits: '搭配码',
    home: '家园方案',
    camera: '相机参数',
    resonance: '共鸣记录',
    wardrobe: '个人衣橱'
  },
  en: {
    outfits: 'Outfit codes',
    home: 'Home schemes',
    camera: 'Camera parameters',
    resonance: 'Resonance records',
    wardrobe: 'Personal wardrobe'
  }
}
const alt = computed(() =>
  props.language === 'zh'
    ? `${labels.zh[props.page]}使用截图`
    : `${labels.en[props.page]} usage screenshot`
)
watch(source, () => {
  failed.value = false
})
</script>

<template>
  <img
    v-if="compact && !failed"
    class="mobile-empty-screenshot"
    :src="source"
    :alt="alt"
    decoding="async"
    @error="failed = true"
  />
</template>

<style scoped>
.mobile-empty-screenshot {
  display: none;
}
@media (max-width: 899px) {
  .mobile-empty-screenshot {
    display: block;
    width: 85vw;
    max-width: min(100%, 600px);
    min-width: 0;
    height: auto;
    margin: 16px auto 0;
    border-radius: 14px;
    border: 1px solid var(--line);
  }
}
</style>
