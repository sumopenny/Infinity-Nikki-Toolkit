import { useId } from 'vue'

/** 每个表面独立滤镜，避免顶栏与底栏的 SVG ID 冲突；非 Chromium 使用 CSS 材质。 */
export function useGlassSurface() {
  const glassFilterId = `surface-glass-${useId()}`
  const refractsBackdrop =
    /(?:Chrome|Chromium|Edg)\//.test(navigator.userAgent) &&
    !/iPhone|iPad|iPod/.test(navigator.userAgent)
  return { glassFilterId, refractsBackdrop }
}
