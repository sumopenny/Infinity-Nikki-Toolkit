import type { Language } from '../i18n/types'

/** 品质值保留上游编码，8 为星冕，不表示八星。 */
export function catalogQualityLabel(quality: number | undefined, language: Language): string {
  if (quality === undefined) return language === 'zh' ? '未知' : 'Unknown'
  if (quality === 8) return language === 'zh' ? '星冕' : 'Crown'
  return `${quality} ★`
}
