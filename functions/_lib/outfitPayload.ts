import { parseNativeOutfitPayload } from '../../src/utils/outfit/nativePayload'

export const MAX_OUTFIT_BODY_BYTES = 1024 * 1024

/** 校验完整原始正文；仅在字符串外转换原生数字映射，返回时仍保留原始字节。 */
export function isValidOutfitPayload(body: Uint8Array): boolean {
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(body)
    const data = parseNativeOutfitPayload(text)
    const clothes = data?.clothes
    if (Array.isArray(clothes))
      return clothes.every(
        (entry: { cloth?: { id?: unknown } } | null) =>
          Number.isSafeInteger(entry?.cloth?.id) && Number(entry?.cloth?.id) > 0
      )
    const native = data?.Content?.Content?.wearingClothes
    return (
      Array.isArray(native) &&
      native.every((id: unknown) => Number.isSafeInteger(id) && Number(id) > 0)
    )
  } catch {
    return false
  }
}

/** 按流累计大小，避免错误正文或缺少 Content-Length 的响应无限占用内存。 */
export async function readOutfitBody(response: Response): Promise<Uint8Array> {
  if (Number(response.headers.get('content-length')) > MAX_OUTFIT_BODY_BYTES) {
    await response.body?.cancel()
    throw new Error('upstream_body_too_large')
  }
  if (!response.body) throw new Error('upstream_invalid_payload')
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > MAX_OUTFIT_BODY_BYTES) {
        await reader.cancel()
        throw new Error('upstream_body_too_large')
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return bytes
}
