<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { getInstanceByDom, init, use } from 'echarts/core'
import { BarChart } from 'echarts/charts'
import { GridComponent } from 'echarts/components'
import { SVGRenderer } from 'echarts/renderers'

const props = defineProps<{
  points: { start: number; count: number; axisLabel: string; description: string }[]
  selected: number | null
}>()
const emit = defineEmits<{ select: [start: number | null] }>()
use([BarChart, GridComponent, SVGRenderer])
const grid = { left: 38, right: 8, top: 12, bottom: 28 }
const target = ref<HTMLElement>()
let resizeObserver: ResizeObserver | undefined
let themeObserver: MutationObserver | undefined

function draw() {
  const element = target.value
  if (!element?.clientWidth || !element.clientHeight) return
  const chart = getInstanceByDom(element) ?? init(element, undefined, { renderer: 'svg' })
  const css = getComputedStyle(element)
  const color = (name: string) => css.getPropertyValue(name).trim()
  chart.resize()
  chart.setOption({
    animation: false,
    grid,
    xAxis: {
      type: 'category',
      data: props.points.map(({ axisLabel }) => axisLabel),
      axisTick: { show: false },
      axisLine: { lineStyle: { color: color('--line') } },
      axisLabel: { color: color('--text'), hideOverlap: true, fontSize: 11 }
    },
    yAxis: {
      type: 'value',
      minInterval: 1,
      splitNumber: 3,
      axisLabel: { color: color('--text'), fontSize: 11 },
      splitLine: { lineStyle: { color: color('--line') } }
    },
    series: [
      {
        type: 'bar',
        barMaxWidth: 32,
        data: props.points.map(({ count, start }) => ({
          value: count,
          itemStyle: {
            color: start === props.selected ? color('--notice-warning') : color('--pink-deep'),
            borderRadius: [4, 4, 0, 0]
          }
        }))
      }
    ]
  })
}

onMounted(() => {
  const element = target.value
  if (!element) return
  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(draw)
    resizeObserver.observe(element)
  }
  themeObserver = new MutationObserver(draw)
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme']
  })
  draw()
})
watch(() => [props.points, props.selected], draw, { flush: 'post' })
onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  themeObserver?.disconnect()
  if (target.value) getInstanceByDom(target.value)?.dispose()
})
</script>

<template>
  <div ref="target" class="outfit-summary-trend-chart" aria-hidden="true"></div>
  <div
    class="trend-period-targets"
    :style="{ inset: `${grid.top}px ${grid.right}px ${grid.bottom}px ${grid.left}px` }"
    @pointerleave="$event.pointerType === 'mouse' && emit('select', null)"
  >
    <button
      v-for="period in points"
      :key="period.start"
      type="button"
      class="trend-period-target"
      :aria-label="period.description"
      @pointerenter="$event.pointerType === 'mouse' && emit('select', period.start)"
      @click="emit('select', period.start)"
    ></button>
  </div>
</template>

<style scoped>
.outfit-summary-trend-chart {
  position: absolute;
  inset: 0;
}
.trend-period-targets {
  position: absolute;
  display: flex;
}
.trend-period-target {
  flex: 1 1 0;
  min-width: 0;
  padding: 0;
  border: 0;
  background: transparent;
}
</style>
