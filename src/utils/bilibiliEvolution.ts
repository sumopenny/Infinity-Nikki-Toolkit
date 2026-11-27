/** 维护同一个分 P 合集即可更新网站；不接受客户端传入任意上游地址。 */
export const animationBvid = 'BV1p1sC6ZE6a'

export interface EvolutionPart {
  version: string
  name: string
  source: string
  page: number
  cid: string
  duration: number
  thumbnail: string
}

function thumbnail(value: unknown): string {
  if (typeof value !== 'string') return ''
  try {
    const url = new URL(value)
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname.endsWith('.hdslb.com'))
      return ''
    url.protocol = 'https:'
    return url.href
  } catch {
    return ''
  }
}

export function isEvolutionPart(value: unknown): value is EvolutionPart {
  if (!value || typeof value !== 'object') return false
  const p = value as EvolutionPart
  return (
    typeof p.version === 'string' &&
    /^\d+\.\d+$/.test(p.version) &&
    typeof p.name === 'string' &&
    p.name.trim().length > 0 &&
    p.name.length <= 200 &&
    typeof p.source === 'string' &&
    p.source.length <= 40 &&
    Number.isSafeInteger(p.page) &&
    p.page > 0 &&
    typeof p.cid === 'string' &&
    /^\d+$/.test(p.cid) &&
    Number.isSafeInteger(Number(p.cid)) &&
    Number(p.cid) > 0 &&
    Number.isSafeInteger(p.duration) &&
    p.duration > 0 &&
    typeof p.thumbnail === 'string' &&
    (!p.thumbnail || thumbnail(p.thumbnail) === p.thumbnail)
  )
}

export function validateEvolutionParts(value: unknown): EvolutionPart[] {
  if (
    !Array.isArray(value) ||
    !value.length ||
    value.length > 2000 ||
    !value.every(isEvolutionPart) ||
    new Set(value.map((p) => p.cid)).size !== value.length ||
    new Set(value.map((p) => p.page)).size !== value.length
  )
    throw new Error('Invalid animation list')
  return value
}

/** 一次 view 请求包含全部分 P；非动画标题忽略，损坏/空结果不覆盖可用缓存。 */
export function parseBilibiliEvolution(value: unknown): EvolutionPart[] {
  const body = value as {
    code?: number
    data?: { pages?: Array<Record<string, unknown>>; pic?: string }
  } | null
  if (body?.code !== 0 || !Array.isArray(body.data?.pages)) throw new Error('Bilibili unavailable')
  const parts: EvolutionPart[] = []
  for (const p of body.data.pages) {
    if (!p || typeof p.part !== 'string') continue
    const title = p.part.trim().match(/^【(\d+\.\d+)([^】]+)】\s*(.+?)\s*[-－—]\s*满进动画\s*$/)
    if (!title) continue
    parts.push({
      version: title[1],
      source: title[2].trim(),
      name: title[3].trim(),
      page: p.page as number,
      cid: String(p.cid ?? ''),
      duration: p.duration as number,
      thumbnail: thumbnail(p.first_frame) || thumbnail(body.data.pic)
    })
  }
  return validateEvolutionParts(parts)
}
