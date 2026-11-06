<script setup lang="ts">
import DesktopMenuTransition from './DesktopMenuTransition.vue'
import { ChevronLeft } from 'lucide-vue-next'
import { onBeforeUnmount, ref } from 'vue'
import { useCompactLayout } from '../composables/useCompactLayout'
import type { LocaleMessages } from '../i18n'

export type AlbumView =
  'all' | 'outfits' | 'home' | 'resonance' | 'wardrobe' | 'favorites' | 'trash'

defineProps<{
  activeView: AlbumView
  allCount: number
  outfitsCount: number
  homeSchemesCount: number
  resonanceLabel?: string
  favoriteCount: number
  favoriteCountText?: string
  trashDisabled?: boolean
  trashDisabledHint?: string
  trashCount: number
  outfitLabel: string
  disabled: boolean
  messages: LocaleMessages['viewNav']
}>()

const resonanceMenuOpen = ref(false)
const compact = useCompactLayout()
let closeTimer: ReturnType<typeof setTimeout> | null = null

function openResonanceMenu() {
  if (closeTimer) clearTimeout(closeTimer)
  resonanceMenuOpen.value = true
}

function closeResonanceMenu() {
  closeTimer = setTimeout(() => {
    resonanceMenuOpen.value = false
  }, 120)
}

// 触屏的兼容鼠标事件不能参与悬停；点击和键盘仍可展开档案菜单。
function handlePointerEnter(event: PointerEvent) {
  if (event.pointerType === 'mouse' && !compact.value) openResonanceMenu()
}
onBeforeUnmount(() => {
  if (closeTimer) clearTimeout(closeTimer)
})

const emit = defineEmits<{
  changeView: [view: AlbumView]
}>()
/** 切换导航前关闭共鸣子菜单，避免保留旧展开状态。 */
function selectView(view: AlbumView) {
  if (closeTimer) clearTimeout(closeTimer)
  resonanceMenuOpen.value = false
  emit('changeView', view)
}
</script>

<template>
  <nav class="album-view-nav" :aria-label="messages.aria">
    <div
      v-for="item in [
        { view: 'all' as const, label: messages.allPhotos, count: allCount },
        { view: 'outfits' as const, label: outfitLabel, count: outfitsCount },
        {
          view: 'home' as const,
          label: messages.homeSchemes,
          count: homeSchemesCount,
          countText: messages.homeSchemesCount(homeSchemesCount)
        },
        {
          view: 'resonance' as const,
          label: resonanceLabel ?? 'Resonance',
          count: 0,
          countText: ''
        },
        {
          view: 'favorites' as const,
          label: messages.favorites,
          count: favoriteCount,
          countText: favoriteCountText
        },
        { view: 'trash' as const, label: messages.recentlyDeleted, count: trashCount }
      ]"
      :key="item.view"
      class="album-view-item"
      @pointerenter="item.view === 'resonance' ? handlePointerEnter($event) : undefined"
      @pointerleave="
        item.view === 'resonance' && $event.pointerType === 'mouse'
          ? closeResonanceMenu()
          : undefined
      "
    >
      <button
        class="album-view-button"
        :class="{
          active:
            activeView === item.view || (item.view === 'resonance' && activeView === 'wardrobe')
        }"
        type="button"
        :disabled="disabled || (item.view === 'trash' && trashDisabled)"
        :title="item.view === 'trash' && trashDisabled ? trashDisabledHint : undefined"
        :aria-pressed="
          activeView === item.view || (item.view === 'resonance' && activeView === 'wardrobe')
        "
        :aria-haspopup="item.view === 'resonance' ? 'menu' : undefined"
        :aria-expanded="item.view === 'resonance' ? resonanceMenuOpen : undefined"
        @click="item.view === 'resonance' ? openResonanceMenu() : selectView(item.view)"
        @keydown.down.prevent="item.view === 'resonance' && openResonanceMenu()"
      >
        <span>{{ item.label }}</span>
        <small v-if="item.view !== 'resonance'">{{
          item.countText ?? messages.count(item.count)
        }}</small>
        <ChevronLeft
          v-else
          class="resonance-nav-arrow"
          :class="{ 'is-open': resonanceMenuOpen }"
          :size="14"
          aria-hidden="true"
        />
      </button>
      <DesktopMenuTransition>
        <div
          v-if="item.view === 'resonance' && resonanceMenuOpen && !disabled"
          class="resonance-nav-menu"
          role="menu"
          @keydown.esc.stop="resonanceMenuOpen = false"
          @pointerenter="handlePointerEnter"
          @pointerleave="$event.pointerType === 'mouse' && closeResonanceMenu()"
        >
          <button
            type="button"
            role="menuitem"
            :class="{ active: activeView === 'resonance' }"
            @click.stop="selectView('resonance')"
            >{{ messages.resonanceRecords }}</button
          >
          <button
            type="button"
            role="menuitem"
            :class="{ active: activeView === 'wardrobe' }"
            @click.stop="selectView('wardrobe')"
            >{{ messages.wardrobe }}</button
          >
        </div>
      </DesktopMenuTransition>
    </div>
  </nav>
</template>
