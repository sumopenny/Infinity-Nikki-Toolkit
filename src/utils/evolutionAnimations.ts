import type { InjectionKey } from 'vue'
import catalog from '../data/evolutionAnimations.json'
import type { WardrobeEntry } from './wardrobe/wardrobeCatalog'

export const animationBvid = 'BV1p1sC6ZE6a'
export type EvolutionAnimation = (typeof catalog)[number]
export const animations = [...catalog].sort((a, b) => {
  const av = a.version.split('.').map(Number)
  const bv = b.version.split('.').map(Number)
  return bv[0] - av[0] || bv[1] - av[1] || a.page - b.page
})
export const openAnimationKey: InjectionKey<(page: number) => void> = Symbol('openAnimation')
export function animationForOutfit(entry: WardrobeEntry | null) {
  return entry
    ? animations.find((item) => item.outfitId === (entry.familyRootId ?? entry.id))
    : undefined
}
export function animationWatchUrl(item: EvolutionAnimation) {
  return `https://www.bilibili.com/video/${animationBvid}/?p=${item.page}`
}
export function animationPlayerUrl(item: EvolutionAnimation) {
  return `https://player.bilibili.com/player.html?bvid=${animationBvid}&cid=${item.cid}&p=${item.page}&autoplay=0`
}
