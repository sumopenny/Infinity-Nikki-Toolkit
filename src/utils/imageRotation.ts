import { MAX_IMAGE_BYTES, validateImageBlob } from './image'

/** Rotate orientation metadata, keeping compressed pixels and unrelated metadata byte-for-byte. */
const clockwise = [0, 6, 7, 8, 5, 2, 3, 4, 1]
const invalid = () => new Error('rotation_unsupported')
const ascii = (bytes: Uint8Array, start: number, length: number) =>
  String.fromCharCode(...bytes.subarray(start, start + length))
function join(...parts: Uint8Array[]): Uint8Array {
  const result = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let offset = 0
  for (const part of parts) {
    result.set(part, offset)
    offset += part.length
  }
  return result
}

function rotateExif(input?: Uint8Array): Uint8Array {
  const bytes = input?.slice() ?? new Uint8Array([73, 73, 42, 0, 8, 0, 0, 0, 0, 0, 0, 0, 0, 0])
  const little = ascii(bytes, 0, 2) === 'II'
  if (bytes.length < 14 || (!little && ascii(bytes, 0, 2) !== 'MM')) throw invalid()
  const view = new DataView(bytes.buffer)
  if (view.getUint16(2, little) !== 42) throw invalid()
  const offset = view.getUint32(4, little)
  if (offset < 8 || offset + 2 > bytes.length) throw invalid()
  const count = view.getUint16(offset, little)
  const end = offset + 2 + count * 12
  if (end + 4 > bytes.length || count > 4096) throw invalid()
  const entries: Uint8Array[] = []
  let found = false
  for (let i = 0; i < count; i++) {
    const at = offset + 2 + i * 12
    if (view.getUint16(at, little) === 0x112) {
      if (found || view.getUint16(at + 2, little) !== 3 || view.getUint32(at + 4, little) !== 1)
        throw invalid()
      const orientation = view.getUint16(at + 8, little)
      if (orientation < 1 || orientation > 8) throw invalid()
      view.setUint16(at + 8, clockwise[orientation]!, little)
      found = true
    }
    entries.push(bytes.slice(at, at + 12))
  }
  if (found) return bytes
  // Append a replacement IFD without moving any existing offsets/data.
  const entry = new Uint8Array(12),
    ev = new DataView(entry.buffer)
  ev.setUint16(0, 0x112, little)
  ev.setUint16(2, 3, little)
  ev.setUint32(4, 1, little)
  ev.setUint16(8, 6, little)
  entries.push(entry)
  entries.sort(
    (a, b) =>
      new DataView(a.buffer).getUint16(0, little) - new DataView(b.buffer).getUint16(0, little)
  )
  const start = bytes.length + (bytes.length % 2)
  const result = new Uint8Array(start + 2 + entries.length * 12 + 4)
  result.set(bytes)
  const out = new DataView(result.buffer)
  out.setUint32(4, start, little)
  out.setUint16(start, entries.length, little)
  entries.forEach((e, i) => result.set(e, start + 2 + i * 12))
  result.set(bytes.subarray(end, end + 4), start + 2 + entries.length * 12)
  return result
}

const crcTable = Uint32Array.from({ length: 256 }, (_, value) => {
  for (let i = 0; i < 8; i++) value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0)
  return value >>> 0
})
function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (const byte of bytes) crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 255]!
  return (crc ^ 0xffffffff) >>> 0
}
function pngExif(exif: Uint8Array): Uint8Array {
  const chunk = new Uint8Array(exif.length + 12),
    view = new DataView(chunk.buffer)
  view.setUint32(0, exif.length)
  chunk.set([101, 88, 73, 102], 4)
  chunk.set(exif, 8)
  view.setUint32(chunk.length - 4, crc32(chunk.subarray(4, chunk.length - 4)))
  return chunk
}
function rotatePng(bytes: Uint8Array): Uint8Array {
  const view = new DataView(bytes.buffer)
  let exif: Uint8Array | undefined,
    sawData = false,
    end = 0
  const chunks: Uint8Array[] = []
  for (let at = 8; at + 12 <= bytes.length;) {
    const size = view.getUint32(at),
      next = at + size + 12
    if (next > bytes.length) throw invalid()
    const type = ascii(bytes, at + 4, 4)
    if (crc32(bytes.subarray(at + 4, next - 4)) !== view.getUint32(next - 4)) throw invalid()
    if (type === 'acTL') throw invalid()
    if (type === 'eXIf') {
      if (exif || sawData) throw invalid()
      exif = bytes.slice(at + 8, next - 4)
    } else chunks.push(bytes.subarray(at, next))
    if (type === 'IDAT') sawData = true
    if (type === 'IEND') {
      end = next
      break
    }
    at = next
  }
  if (!end || !sawData || ascii(chunks[0] ?? new Uint8Array(), 4, 4) !== 'IHDR') throw invalid()
  return join(
    bytes.subarray(0, 8),
    chunks[0]!,
    pngExif(rotateExif(exif)),
    ...chunks.slice(1),
    bytes.subarray(end)
  )
}
function rotateJpeg(bytes: Uint8Array): Uint8Array {
  const view = new DataView(bytes.buffer)
  let existing: { start: number; end: number; exif: Uint8Array } | undefined
  let sawScan = false
  for (let at = 2; at + 4 <= bytes.length;) {
    const start = at
    if (bytes[at++] !== 255) throw invalid()
    while (bytes[at] === 255) at++
    const marker = bytes[at++]
    if (marker === 0xda) {
      sawScan = true
      break
    }
    if (!marker || marker === 0xd9) throw invalid()
    const size = view.getUint16(at),
      end = at + size
    if (size < 2 || end > bytes.length) throw invalid()
    if (marker === 0xe1 && ascii(bytes, at + 2, 6) === 'Exif\0\0') {
      if (existing) throw invalid()
      existing = { start, end, exif: bytes.slice(at + 8, end) }
    }
    at = end
  }
  if (!sawScan) throw invalid()
  const exif = rotateExif(existing?.exif)
  if (exif.length + 8 > 65535) throw invalid()
  const segment = new Uint8Array(exif.length + 10)
  segment.set([255, 225, 0, 0, 69, 120, 105, 102, 0, 0])
  segment.set(exif, 10)
  new DataView(segment.buffer).setUint16(2, exif.length + 8)
  return join(bytes.subarray(0, existing?.start ?? 2), segment, bytes.subarray(existing?.end ?? 2))
}
export function rotateImageBytes(bytes: Uint8Array): { bytes: Uint8Array; type: string } {
  if (bytes.length > MAX_IMAGE_BYTES) throw invalid()
  if (bytes.byteOffset) bytes = bytes.slice()
  if (ascii(bytes, 0, 8) === '\x89PNG\r\n\x1a\n')
    return { bytes: rotatePng(bytes), type: 'image/png' }
  if (bytes[0] === 255 && bytes[1] === 216) return { bytes: rotateJpeg(bytes), type: 'image/jpeg' }
  throw invalid()
}

export async function rotateImageBlob(source: Blob, allowWebpConversion = false): Promise<Blob> {
  if (source.size > MAX_IMAGE_BYTES) throw invalid()
  const bytes = new Uint8Array(await source.arrayBuffer())
  if (allowWebpConversion && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') {
    const view = new DataView(bytes.buffer)
    const end = view.getUint32(4, true) + 8
    if (end > bytes.length) throw invalid()
    let at = 12
    for (; at + 8 <= end;) {
      const type = ascii(bytes, at, 4),
        size = view.getUint32(at + 4, true)
      if (type === 'ANIM' || type === 'ANMF' || (type === 'VP8X' && bytes[at + 8]! & 2))
        throw invalid()
      at += 8 + size + (size % 2)
    }
    if (at !== end) throw invalid()
    await validateImageBlob(source)
    const url = URL.createObjectURL(source),
      image = new Image()
    const canvas = document.createElement('canvas')
    try {
      image.src = url
      await image.decode()
      canvas.width = image.naturalHeight
      canvas.height = image.naturalWidth
      const ctx = canvas.getContext('2d')
      if (!ctx) throw invalid()
      ctx.translate(canvas.width, 0)
      ctx.rotate(Math.PI / 2)
      ctx.drawImage(image, 0, 0)
      const result = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob((blob) => (blob ? resolve(blob) : reject(invalid())), 'image/png')
      )
      if (result.size > MAX_IMAGE_BYTES) throw invalid()
      await validateImageBlob(result)
      return result
    } finally {
      URL.revokeObjectURL(url)
      image.src = ''
      canvas.width = canvas.height = 0
    }
  }
  const rotated = rotateImageBytes(bytes)
  if (rotated.bytes.length > MAX_IMAGE_BYTES) throw invalid()
  const result = new Blob([rotated.bytes], { type: rotated.type })
  await validateImageBlob(result)
  return result
}
