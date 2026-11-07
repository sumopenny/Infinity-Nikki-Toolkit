import { onMounted, ref } from 'vue'
import gauze from '../../img/绯纱.webp'
import prism1 from '../../img/幻彩1.webp'
import prism2 from '../../img/幻彩2.webp'
import gold from '../../img/鎏金.webp'
import sparkle from '../../img/闪点.webp'
import dream from '../../img/星梦.webp'
import silk from '../../img/云绸.webp'
import sakura from '../../img/樱格.webp'

export const archiveBackgrounds = [
  { id: 'silk', label: '云绸', en: 'Cloud silk', url: silk },
  { id: 'gauze', label: '绯纱', en: 'Rose gauze', url: gauze },
  { id: 'sparkle', label: '闪点', en: 'Shimmer', url: sparkle },
  { id: 'prism1', label: '幻彩1', en: 'Iridescence 1', url: prism1 },
  { id: 'prism2', label: '幻彩2', en: 'Iridescence 2', url: prism2 },
  { id: 'gold', label: '鎏金', en: 'Gilded', url: gold },
  { id: 'dream', label: '星梦', en: 'Star dream', url: dream },
  { id: 'sakura', label: '樱格', en: 'Sakura plaid', url: sakura }
] as const

type BackgroundId = (typeof archiveBackgrounds)[number]['id']
const storageKey = 'archive-background'
const selectedBackground = ref<BackgroundId>('silk')

function applyBackground() {
  const option = archiveBackgrounds.find((item) => item.id === selectedBackground.value)!
  document.documentElement.style.setProperty('--archive-background-source', `url("${option.url}")`)
}

export function useArchiveBackground() {
  onMounted(() => {
    try {
      const saved = localStorage.getItem(storageKey)
      const option = archiveBackgrounds.find((item) => item.id === saved)
      if (option) selectedBackground.value = option.id
    } catch { /* Storage may be unavailable; the default remains usable. */ }
    applyBackground()
  })

  function selectBackground(id: BackgroundId) {
    selectedBackground.value = id
    applyBackground()
    try {
      localStorage.setItem(storageKey, id)
    } catch { /* Keep the selection for this session when storage is unavailable. */ }
  }

  return { selectedBackground, selectBackground }
}
