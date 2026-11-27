<script setup lang="ts">
import { computed, ref, toRef } from 'vue'
import { X } from 'lucide-vue-next'
import { useBodyScrollLock } from '../utils/bodyScrollLock'
import { useModalFocus } from '../composables/useModalFocus'

const props = defineProps<{ visible: boolean; language: 'zh' | 'en' }>()
const emit = defineEmits<{ close: []; afterClose: [] }>()
const panel = ref<HTMLElement | null>(null)
const active = toRef(props, 'visible')
const zh = computed(() => props.language === 'zh')
useBodyScrollLock(active)
useModalFocus(active, panel, () => emit('close'))
</script>

<template>
  <Teleport to="body">
    <Transition name="confirm-dialog" appear @after-leave="emit('afterClose')">
      <div
        v-if="visible"
        class="dialog-overlay site-migration-notice"
        role="dialog"
        aria-modal="true"
        aria-labelledby="site-migration-title"
      >
        <section ref="panel" class="dialog-panel migration-panel" tabindex="-1">
          <header>
            <h2 id="site-migration-title">{{ zh ? '网站已迁移' : 'Our website has moved' }}</h2>
            <button
              type="button"
              :aria-label="zh ? '关闭迁移通知' : 'Close migration notice'"
              @click="emit('close')"
              ><X :size="20"
            /></button>
          </header>
          <div class="migration-body">
            <p
              >{{ zh ? '新网址：' : 'New address:'
              }}<strong class="migration-address">https://nikkicube.pages.dev/</strong></p
            >
            <p class="migration-warning">{{
              zh
                ? '本站（旧网站）日后将停止更新维护，请前往新网站并收藏新网址！'
                : 'This old website will stop receiving updates and maintenance in the future. Please visit the new website and bookmark its address!'
            }}</p>
            <p class="migration-warning">{{
              zh
                ? '请先迁移数据，再使用新网站。本站浏览器中的本地数据不会自动转移到新网址。'
                : 'Migrate your data before using the new website. Local data in this browser will not transfer automatically to the new address.'
            }}</p>
            <p>{{
              zh
                ? '请自行前往本站“更多 → 导出全部数据”保存备份，再到新网站对应的导入入口导入。备份包含搭配码、家园方案、相机参数收藏、共鸣记录和个人衣橱。'
                : 'Save a backup through More → Export all data on this site, then import it through the corresponding entry on the new site. The backup includes outfits, home schemes, camera parameter favorites, resonance records and personal wardrobe data.'
            }}</p>
            <p class="migration-warning">{{
              zh
                ? '电脑端自动备份注意：旧版自动备份分类目录与新版不兼容，请勿直接沿用旧目录。'
                : 'Desktop auto-backup: the old categorized backup folders are incompatible with the new version. Do not reuse the old backup folders directly.'
            }}</p>
            <p>{{
              zh
                ? '完成数据导入后，请到新网站对应模块选择新的空文件夹，重新设置自动备份。如果数据仅保存在旧自动备份目录中，请先在本站对应模块恢复，再导出备份。'
                : 'After importing your data, select a new empty folder in the corresponding module on the new site and set up auto-backup again. If your data exists only in an old backup folder, restore it in the corresponding module on this site first, then export a backup.'
            }}</p>
            <p>{{
              zh
                ? '相册、游戏及自动备份目录需要在新网站重新授权。'
                : 'Album, game and auto-backup folders must be authorized again on the new site.'
            }}</p>
            <p class="migration-warning">{{
              zh
                ? '确认新网站数据完整前，请保留旧站数据与旧备份文件。'
                : 'Keep your old site data and backup files until you have verified that your data on the new site is complete.'
            }}</p>
          </div>
          <footer class="update-log-footer"
            ><button type="button" class="primary-button" @click="emit('close')">{{
              zh ? '关闭' : 'Close'
            }}</button></footer
          >
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.site-migration-notice {
  z-index: 3000;
}
.migration-panel {
  width: min(640px, 100%);
  max-height: calc(100dvh - 40px);
  display: flex;
  flex-direction: column;
  padding: 0;
  overflow: hidden;
}
.migration-panel:focus {
  outline: none;
}
.migration-panel > header,
.migration-panel > footer {
  flex-shrink: 0;
}
.migration-body {
  overflow-y: auto;
  padding: 4px 24px 20px;
  color: var(--text);
  font-size: 14px;
  line-height: 1.8;
}
.migration-body p {
  margin: 16px 0 0;
}
.migration-address {
  display: block;
  color: var(--heading);
  font-size: 19px;
  overflow-wrap: anywhere;
  user-select: text;
}
.migration-warning {
  color: #c62828;
  font-weight: 700;
}
:global(:root[data-theme='dark']) .migration-warning {
  color: #ff8a80;
}
.migration-panel > footer {
  justify-content: flex-end;
}
@media (max-width: 480px) {
  .migration-panel > header {
    padding: 16px;
  }
  .migration-body {
    padding: 0 16px 16px;
  }
  .migration-panel > footer {
    padding: 14px 16px;
  }
}
</style>
