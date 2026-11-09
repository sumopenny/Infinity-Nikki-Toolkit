type SourceUrlResult = { url: string; error?: 'multiple' | 'invalid' }

/** 只用 URL 校验，保存原字符串，避免分享参数被重新编码或排序。 */
export function isValidSourceUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return /^https?:\/\//i.test(value) && Boolean(url.hostname) && !/\s/.test(value)
  } catch {
    return false
  }
}

/** 从分享文案提取网址；仅移除明确的文案边界，保留网址内部标点。 */
export function parseSourceUrl(value: string): SourceUrlResult {
  const text = value.trim()
  if (!text) return { url: '' }
  if (isValidSourceUrl(text)) return { url: text }
  const candidates = [...text.matchAll(/https?:\/\/[^\s<>"“”‘’「」『』【】。，！？；]+/gi)]
  if (candidates.length > 1) return { url: '', error: 'multiple' }
  const match = candidates[0]
  if (!match) return { url: '', error: 'invalid' }
  let url = match[0]
  // 英文括号可属于路径，只去掉没有配对的尾部闭括号。
  for (const [open, close] of [
    ['(', ')'],
    ['[', ']'],
    ['{', '}']
  ]) {
    while (url.endsWith(close) && url.split(close).length > url.split(open).length) {
      url = url.slice(0, -1)
    }
  }
  if (text[(match.index ?? 0) - 1] === "'" && url.endsWith("'")) url = url.slice(0, -1)
  return isValidSourceUrl(url) ? { url } : { url: '', error: 'invalid' }
}
