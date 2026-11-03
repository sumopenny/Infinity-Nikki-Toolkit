<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Heart } from 'lucide-vue-next'

const props = defineProps<{
  messages: { like: string; likeTooltip: string }
  compact?: boolean
  language?: 'zh' | 'en'
}>()

const count = ref<number | null>(null)
const available = ref(true)
const clickId = ref(0)
const colors = ['#ff648a', '#ff9855', '#e8bd38', '#70c764', '#37bbb3', '#609cf3', '#9e79ef', '#e770cb']
let likeQueue: Promise<void> = Promise.resolve()
let pendingLikes = 0

const formattedCount = computed(() => (count.value === null ? '…' : count.value.toLocaleString()))
const displayCount = computed(() => {
  if (count.value === null || !props.compact) return formattedCount.value
  return new Intl.NumberFormat(props.language === 'en' ? 'en' : 'zh-CN', {
    notation: 'compact',
    maximumFractionDigits: 1
  }).format(count.value)
})

/** 拉取当前点赞总数；接口不可用时（如纯静态环境）隐藏计数器。参数：无。 */
async function loadCount() {
  try {
    const response = await fetch('/api/like', { headers: { accept: 'application/json' } })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const data = (await response.json()) as { count?: unknown }
    if (typeof data.count !== 'number') throw new Error('bad payload')
    count.value = data.count
  } catch {
    available.value = false
  }
}

/** 点赞请求串行发送，避免服务端响应乱序覆盖较新的计数。 */
async function like() {
  if (count.value === null) return
  const currentCount = count.value
  pendingLikes += 1
  clickId.value += 1
  count.value = currentCount + 1

  likeQueue = likeQueue
    .catch(() => undefined)
    .then(async () => {
      const confirmedCount = count.value ?? currentCount
      try {
        const response = await fetch('/api/like', {
          method: 'POST',
          headers: { accept: 'application/json' }
        })
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const data = (await response.json()) as { count?: unknown }
        if (typeof data.count === 'number') count.value = data.count + pendingLikes - 1
        else count.value = Math.max(0, (count.value ?? confirmedCount) - 1)
      } catch {
        count.value = Math.max(0, (count.value ?? confirmedCount) - 1)
      } finally {
        pendingLikes -= 1
      }
    })
  await likeQueue
}

onMounted(loadCount)
</script>

<template>
  <button
    v-if="available"
    class="like-counter"
    :class="{ liked: clickId > 0 }"
    type="button"
    :title="props.messages.likeTooltip"
    :aria-label="`${props.messages.like} ${formattedCount}`"
    @click="like"
  >
    <span :key="`heart-${clickId}`" class="like-heart" aria-hidden="true">
      <Heart :size="16" />
      <i v-for="(color, index) in clickId ? colors : []" :key="color" class="like-dot"
        :style="{ background: color, rotate: `${index * 45}deg` }" />
    </span>
    <span class="like-counter-number" aria-hidden="true">{{ displayCount }}</span>
  </button>
</template>
