/** 维护同一个分 P 合集即可更新网站；不接受客户端传入任意上游地址。 */
export const animationBvid = 'BV1p1sC6ZE6a'

/** B 站提供的 JSONP 接口由浏览器直读，避免 Cloudflare 出口收到 412；不使用第三方代理。 */
export function readBilibiliEvolution(): Promise<EvolutionPart[]> {
  return new Promise((resolve, reject) => {
    const callback = `__nikkiEvolution_${crypto.randomUUID().replaceAll('-', '')}`
    const callbacks = window as unknown as Record<string, unknown>
    const script = document.createElement('script')
    let settled = false
    const finish = (error?: Error, parts?: EvolutionPart[], timedOut = false) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      script.remove()
      script.onerror = script.onload = null
      if (timedOut) {
        // 移除 script 不保证已在途脚本不会执行；短暂保留空回调，迟到结果不能覆盖重试。
        callbacks[callback] = () => undefined
        window.setTimeout(() => {
          delete callbacks[callback]
        }, 60000)
      } else delete callbacks[callback]
      if (error) reject(error)
      else resolve(parts!)
    }
    const timer = window.setTimeout(
      () => finish(new Error('Bilibili request timed out'), undefined, true),
      10000
    )
    callbacks[callback] = (value: unknown) => {
      try {
        finish(undefined, parseBilibiliEvolution(value))
      } catch {
        finish(new Error('Bilibili returned an invalid animation list'))
      }
    }
    script.async = true
    script.referrerPolicy = 'no-referrer'
    script.src = `https://api.bilibili.com/x/web-interface/view?bvid=${animationBvid}&jsonp=jsonp&callback=${callback}`
    script.onerror = () => finish(new Error('Bilibili request failed'))
    script.onload = () => {
      if (!settled) finish(new Error('Bilibili callback missing'))
    }
    try {
      document.head.append(script)
    } catch {
      finish(new Error('Bilibili script could not be loaded'))
    }
  })
}

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

/** 分 P 接口一次返回完整列表；非动画标题忽略，损坏/空结果不覆盖可用缓存。 */
export function parseBilibiliEvolution(value: unknown): EvolutionPart[] {
  const body = value as {
    code?: number
    data?: { pages?: Array<Record<string, unknown>>; pic?: string }
  } | null
  const pages = body?.data?.pages
  const cover = body?.data?.pic
  if (body?.code !== 0 || !Array.isArray(pages)) throw new Error('Bilibili unavailable')
  const parts: EvolutionPart[] = []
  for (const p of pages) {
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
      thumbnail: thumbnail(p.first_frame) || thumbnail(cover)
    })
  }
  return validateEvolutionParts(parts)
}
