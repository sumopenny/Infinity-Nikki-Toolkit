<script setup lang="ts">
import displacementMap from '../assets/nav-glass-displacement.png'
defineProps<{ filterId: string }>()
</script>
<template>
  <svg class="nav-glass-definitions" aria-hidden="true" focusable="false" width="0" height="0">
    <defs>
      <filter
        :id="filterId"
        x="0"
        y="0"
        width="100%"
        height="100%"
        filterUnits="objectBoundingBox"
        primitiveUnits="userSpaceOnUse"
        color-interpolation-filters="sRGB"
      >
        <feImage
          :href="displacementMap"
          x="0"
          y="0"
          width="100%"
          height="100%"
          preserveAspectRatio="none"
          result="rim"
        />
        <feDisplacementMap
          in="SourceGraphic"
          in2="rim"
          scale="14"
          xChannelSelector="R"
          yChannelSelector="G"
        />
      </filter>
    </defs>
  </svg>
</template>
<style scoped>
.nav-glass-definitions {
  position: absolute;
  pointer-events: none;
  overflow: hidden;
}
</style>
