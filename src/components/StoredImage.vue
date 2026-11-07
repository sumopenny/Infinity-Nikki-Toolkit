<script setup lang="ts">
import { vImageSkeleton } from '../utils/imageSkeleton'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { observeStoredImageVisibility } from '../utils/storedImageVisibility'

const props = withDefaults(
  defineProps<{ sourceKey: string; load: () => Promise<Blob>; alt: string; active?: boolean }>(),
  { active: true }
)
const root = ref<HTMLElement | null>(null)
const url = ref('')
const failed = ref(false)
let stopObserving: (() => void) | undefined
let visible = false
let generation = 0

function activate() {
  if (props.active && root.value && !stopObserving)
    stopObserving = observeStoredImageVisibility(root.value, setVisible)
}

function deactivate() {
  stopObserving?.()
  stopObserving = undefined
  setVisible(false)
}

function setVisible(next: boolean) {
  if (next === visible) return
  visible = next
  if (visible) void load()
  else release()
}

/** 离开预加载区域或数据变化时释放地址，并使尚未完成的读取失效。 */
function release() {
  generation++
  if (url.value) URL.revokeObjectURL(url.value)
  url.value = ''
  failed.value = false
}

/** 只为可见记录取图，晚到结果不创建地址，不影响替换后的记录。 */
async function load() {
  const run = ++generation
  try {
    const blob = await props.load()
    if (run !== generation || !visible) return
    url.value = URL.createObjectURL(blob)
  } catch {
    if (run === generation && visible) {
      failed.value = true
    }
  }
}

watch(
  () => props.sourceKey,
  () => {
    release()
    if (visible) void load()
  }
)
watch(
  () => props.active,
  (active) => (active ? activate() : deactivate())
)
onMounted(activate)
onBeforeUnmount(deactivate)
</script>

<template>
  <div ref="root" class="stored-image">
    <img v-image-skeleton v-if="url && !failed" :src="url" :alt="alt" @error="failed = true" />
    <span v-else-if="!failed" class="image-skeleton-block" style="inset: 0; width: 100%; height: 100%" data-image-skeleton data-image-pending="true" aria-hidden="true"></span>
    <span v-else-if="failed" role="img" :aria-label="alt">×</span>
  </div>
</template>

<style scoped>
.stored-image {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  overflow: hidden;
  border-radius: inherit;
  background: var(--surface-soft);
  color: var(--muted);
}
.stored-image img {
  /* 图片直接铺满封面框，避免固有尺寸参与 Grid 轨道计算后被居中偏移、裁切。 */
  position: absolute;
  inset: 0;
  display: block;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  object-fit: cover;
  object-position: center;
}
</style>
