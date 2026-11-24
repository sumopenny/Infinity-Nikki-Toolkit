<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  Archive,
  Armchair,
  Camera,
  Clapperboard,
  HardDrive,
  Images,
  Notebook,
  ScanFace,
  ScanLine,
  Shirt,
  Sparkles,
  Download,
  Upload
} from 'lucide-vue-next'
import type { AlbumView } from './AlbumViewSwitcher.vue'

export type HomeTool = 'avatar' | 'fortune' | 'cleanup' | 'parse' | 'export' | 'import'
const props = defineProps<{ language: 'zh' | 'en'; disabled: boolean; hasBackupData: boolean }>()
const emit = defineEmits<{ navigate: [view: AlbumView]; tool: [tool: HomeTool] }>()
const backupOpen = ref(false)
const t = (zh: string, en: string) => (props.language === 'zh' ? zh : en)
const collections = computed(() => [
  { view: 'outfits' as const, icon: Shirt, label: t('搭配码', 'Outfits') },
  { view: 'home' as const, icon: Armchair, label: t('家园方案', 'Home schemes') },
  { view: 'favorites' as const, icon: Camera, label: t('相机参数', 'Camera parameters') },
  { view: 'resonance' as const, icon: Notebook, label: t('暖暖档案', 'Nikki archive') }
])
function navigate(view: AlbumView) {
  if (!props.disabled) emit('navigate', view)
}
function tool(action: HomeTool) {
  if (!props.disabled) emit('tool', action)
}
</script>

<template>
  <div class="desktop-home" data-testid="desktop-home">
    <div class="home-index">
      <div class="home-index-copy">
        <h1>{{ t('灵感，', 'Inspiration,') }}<br />{{ t('妥善收藏。', 'kept close.') }}</h1>
        <button
          class="home-album-button"
          type="button"
          :disabled="disabled"
          @click="navigate('all')"
        >
          <Images :size="19" aria-hidden="true" />{{ t('打开相册', 'Open album') }}
        </button>
        <nav class="home-collections" :aria-label="t('我的收藏', 'My collections')">
          <button
            v-for="item in collections"
            :key="item.view"
            type="button"
            :disabled="disabled"
            @click="navigate(item.view)"
          >
            <component :is="item.icon" :size="21" aria-hidden="true" /><span>{{ item.label }}</span>
          </button>
        </nav>
      </div>
      <figure class="home-artwork">
        <div
          class="home-photo-placeholder"
          role="img"
          :aria-label="t('照片占位，比例 16 比 10', 'Photo placeholder, 16 by 10')"
        >
          <Images :size="28" aria-hidden="true" />
          <span>{{ t('照片展示位', 'Photo placeholder') }}</span>
          <small>16 : 10</small>
        </div>
      </figure>
    </div>
    <section class="home-tools" :aria-label="t('创意与实用工具', 'Creative and practical tools')">
      <h2>{{ t('小工具', 'Tools') }}</h2>
      <div class="home-tool-links">
        <button type="button" :disabled="disabled" @click="tool('avatar')"
          ><ScanFace :size="18" aria-hidden="true" />{{
            t('头像模拟器', 'Avatar simulator')
          }}</button
        >
        <button type="button" :disabled="disabled" @click="tool('fortune')"
          ><Sparkles :size="18" aria-hidden="true" />{{ t('抽卡时间', 'Lucky time') }}</button
        >
        <button type="button" :disabled="disabled" @click="navigate('animations')"
          ><Clapperboard :size="18" aria-hidden="true" />{{
            t('满进动画', 'Evolution animations')
          }}</button
        >
        <button type="button" :disabled="disabled" @click="tool('parse')"
          ><ScanLine :size="18" aria-hidden="true" />{{ t('照片解析', 'Photo parsing') }}</button
        >
        <button type="button" :disabled="disabled" @click="tool('cleanup')"
          ><HardDrive :size="18" aria-hidden="true" />{{
            t('电脑清理', 'Game file cleanup')
          }}</button
        >
        <button
          type="button"
          :disabled="disabled"
          :aria-expanded="backupOpen"
          aria-controls="home-backup-actions"
          @click="backupOpen = !backupOpen"
          ><Archive :size="18" aria-hidden="true" />{{ t('备份迁移', 'Backup & transfer') }}</button
        >
        <div
          v-if="backupOpen"
          id="home-backup-actions"
          class="home-backup-actions"
          role="group"
          :aria-label="t('备份迁移操作', 'Backup actions')"
        >
          <button type="button" :disabled="disabled || !hasBackupData" @click="tool('export')"
            ><Download :size="17" aria-hidden="true" />{{
              t('导出全部数据', 'Export all data')
            }}</button
          >
          <button type="button" :disabled="disabled" @click="tool('import')"
            ><Upload :size="17" aria-hidden="true" />{{ t('导入备份', 'Import backup') }}</button
          >
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.desktop-home {
  padding: clamp(24px, 4vw, 64px);
  width: 100%;
  max-width: 1200px;
  margin: 0 auto;
}
.home-index {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 0.9fr);
  gap: clamp(28px, 5vw, 80px);
  align-items: center;
}
.home-index h1 {
  color: var(--heading);
  font-size: clamp(32px, 3.7vw, 52px);
  font-weight: 500;
  line-height: 1.45;
  letter-spacing: -0.025em;
  margin: 0 0 30px;
}
.desktop-home button {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  min-height: 44px;
  font: inherit;
  color: var(--text);
  cursor: pointer;
}
.desktop-home button svg {
  flex-shrink: 0;
  color: var(--menu-hover-text);
}
.desktop-home button:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}
.desktop-home button:focus-visible {
  outline: 2px solid var(--pink-deep);
  outline-offset: 4px;
}
.home-album-button {
  background: var(--soft-accent);
  border: 1px solid var(--interactive-hover-border);
  border-radius: 10px;
  padding: 12px 19px;
}
.home-album-button:not(:disabled):hover {
  background: var(--interactive-hover-bg);
}
.home-collections {
  display: flex;
  flex-direction: column;
  margin-top: 30px;
}
.home-collections button {
  width: 100%;
  border: 0;
  border-bottom: 1px solid var(--line);
  background: transparent;
  text-align: left;
  padding: 16px 10px;
  font-size: clamp(17px, 1.8vw, 23px);
}
.home-collections button:not(:disabled):hover {
  background: var(--interactive-hover-bg);
  color: var(--menu-hover-text);
  border-radius: 8px;
}
.home-artwork {
  margin: 0;
  min-width: 0;
}
.home-photo-placeholder {
  aspect-ratio: 16 / 10;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  border-radius: 14px;
  background: var(--surface-soft);
  color: var(--text);
  border: 1px dashed var(--interactive-hover-border);
}
.home-tools {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: baseline;
  gap: 20px;
  border-top: 1px solid var(--line);
  margin-top: 40px;
  padding-top: 20px;
}
.home-tools h2 {
  font-size: 13px;
  font-weight: 400;
  color: var(--text);
  margin: 0;
}
.home-tool-links {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 16px;
}
.home-tool-links button {
  border: 0;
  padding: 9px 8px;
  background: transparent;
  font-size: 13px;
  border-radius: 8px;
}
.home-tool-links button:not(:disabled):hover {
  background: var(--interactive-hover-bg);
  color: var(--menu-hover-text);
}
.home-backup-actions {
  flex-basis: 100%;
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  padding: 8px;
  border-radius: 10px;
  background: var(--surface-soft);
}
@media (max-width: 1100px) {
  .desktop-home {
    padding: 28px;
  }
  .home-index {
    gap: 30px;
  }
  .home-tools {
    gap: 12px;
  }
}
@media (max-width: 650px) {
  .home-index {
    grid-template-columns: 1fr;
  }
  .home-tools {
    grid-template-columns: 1fr;
  }
}
</style>
