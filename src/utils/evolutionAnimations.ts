import { reactive, ref, type InjectionKey } from 'vue'
import type { WardrobeEntry } from './wardrobe/wardrobeCatalog'
import { animationBvid, validateEvolutionParts, type EvolutionPart } from './bilibiliEvolution'

export type EvolutionAnimation = EvolutionPart
function sortAnimations(a: EvolutionAnimation, b: EvolutionAnimation) {
  const av = a.version.split('.').map(Number)
  const bv = b.version.split('.').map(Number)
  return bv[0] - av[0] || bv[1] - av[1] || a.page - b.page
}
// 只保存本次会话从 B 站成功读取的列表，不读取本地目录或持久化快照。
export const animations = reactive<EvolutionAnimation[]>([])
export const animationSyncStatus = ref<'idle' | 'loading' | 'ready' | 'error'>('idle')
let pending: Promise<void> | undefined
let refreshedAt = 0

/** 按需读取一次；并发去重，成功五分钟内复用；失败保留原列表，下次进入或手动重试。 */
export function loadEvolutionAnimations(force = false): Promise<void> {
  if (pending) return pending
  if (!force && Date.now() - refreshedAt < 300000) return Promise.resolve()
  animationSyncStatus.value = 'loading'
  pending = (async () => {
    try {
      const response = await fetch('/api/evolution-animations', {
        signal: AbortSignal.timeout(10000),
        cache: force ? 'reload' : 'default'
      })
      if (!response.ok) throw new Error('Animation list unavailable')
      const next = validateEvolutionParts(await response.json()).sort(sortAnimations)
      animations.splice(0, animations.length, ...next)
      const stale = response.headers.get('x-animation-stale') === 'true'
      animationSyncStatus.value = stale ? 'error' : 'ready'
      // 沿用源数据抓取时间，避免浏览器与页面缓存逐层延长五分钟窗口。
      if (!stale)
        refreshedAt = Math.min(
          Date.now(),
          Number(response.headers.get('x-fetched-at')) || Date.now()
        )
    } catch {
      animationSyncStatus.value = 'error'
    } finally {
      pending = undefined
    }
  })()
  return pending
}
export const openAnimationKey: InjectionKey<(cid: string) => void> = Symbol('openAnimation')
export function animationForOutfit(entry: WardrobeEntry | null) {
  return entry ? animations.find((item) => item.name === entry.name?.zh?.split('·')[0]) : undefined
}
export function animationWatchUrl(item: EvolutionAnimation) {
  return `https://www.bilibili.com/video/${animationBvid}/?p=${item.page}`
}
export function animationPlayerUrl(item: EvolutionAnimation) {
  return `https://player.bilibili.com/player.html?bvid=${animationBvid}&cid=${item.cid}&p=${item.page}&autoplay=0`
}
