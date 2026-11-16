import { describe, expect, it } from 'vitest'
import { crc32, deflateSync } from 'node:zlib'
import { rotateImageBytes } from '../../src/utils/imageRotation'

// A minimal JPEG marker stream, including an application payload and bytes after EOI.
const jpeg = () =>
  new Uint8Array([255, 216, 255, 224, 0, 5, 1, 2, 3, 255, 218, 0, 2, 31, 32, 33, 255, 217, 77, 78])
function exifIn(bytes: Uint8Array) {
  const length = new DataView(bytes.buffer).getUint16(4)
  return bytes.slice(12, length + 4)
}
function orientation(exif: Uint8Array) {
  const v = new DataView(exif.buffer),
    little = exif[0] === 73
  const at = v.getUint32(4, little)
  for (let i = 0; i < v.getUint16(at, little); i++) {
    const entry = at + 2 + i * 12
    if (v.getUint16(entry, little) === 0x112) return v.getUint16(entry + 8, little)
  }
}
describe('lossless source rotation', () => {
  it('preserves PNG compressed pixels, custom metadata and trailing data over four turns', () => {
    const chunk = (type: string, data: Uint8Array) => {
      const b = Buffer.alloc(data.length + 12)
      b.writeUInt32BE(data.length)
      b.write(type, 4)
      b.set(data, 8)
      b.writeUInt32BE(crc32(b.subarray(4, -4)), b.length - 4)
      return b
    }
    const header = Buffer.alloc(13)
    header.writeUInt32BE(1)
    header.writeUInt32BE(1, 4)
    header[8] = 8
    header[9] = 6
    const originalChunks = [
      chunk('IHDR', header),
      chunk('tEXt', Buffer.from('game\0parameters')),
      chunk('IDAT', deflateSync(Buffer.from([0, 255, 0, 0, 255]))),
      chunk('IEND', new Uint8Array())
    ]
    const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      tail = Buffer.from('game-tail')
    let current = new Uint8Array(Buffer.concat([signature, ...originalChunks, tail]))
    for (const expected of [6, 3, 8, 1]) {
      current = rotateImageBytes(current).bytes
      const buffer = Buffer.from(current),
        other: Buffer[] = []
      let at = 8
      while (at + 12 <= buffer.length) {
        const size = buffer.readUInt32BE(at),
          next = at + size + 12,
          type = buffer.toString('ascii', at + 4, at + 8)
        expect(buffer.readUInt32BE(next - 4)).toBe(crc32(buffer.subarray(at + 4, next - 4)))
        if (type === 'eXIf')
          expect(orientation(new Uint8Array(buffer.subarray(at + 8, next - 4)))).toBe(expected)
        else other.push(buffer.subarray(at, next))
        at = next
        if (type === 'IEND') break
      }
      expect(Buffer.concat(other)).toEqual(Buffer.concat(originalChunks))
      expect(buffer.subarray(at)).toEqual(tail)
    }
    current[40] = current[40]! ^ 1
    expect(() => rotateImageBytes(current)).toThrow('rotation_unsupported')
  })
  it('cycles clockwise and preserves the entire existing JPEG payload including trailing game data', () => {
    const original = jpeg()
    let current = original
    for (const expected of [6, 3, 8, 1, 6]) {
      current = rotateImageBytes(current).bytes
      expect(orientation(exifIn(current))).toBe(expected)
      const length = new DataView(current.buffer).getUint16(4)
      expect(current.slice(length + 4)).toEqual(original.slice(2))
    }
  })
  it.each([
    [1, 6],
    [2, 7],
    [3, 8],
    [4, 5],
    [5, 2],
    [6, 3],
    [7, 4],
    [8, 1]
  ])('composes orientation %i including mirrors', (before, after) => {
    const bytes = rotateImageBytes(jpeg()).bytes
    const view = new DataView(bytes.buffer)
    const tiff = 12,
      ifd = view.getUint32(tiff + 4, true)
    view.setUint16(tiff + ifd + 10, before, true)
    expect(orientation(exifIn(rotateImageBytes(bytes).bytes))).toBe(after)
  })
  it('retains big-endian EXIF and its unrelated tags', () => {
    const tiff = new Uint8Array(38),
      v = new DataView(tiff.buffer)
    tiff.set([77, 77, 0, 42, 0, 0, 0, 8])
    v.setUint16(8, 2)
    v.setUint16(10, 0x112)
    v.setUint16(12, 3)
    v.setUint32(14, 1)
    v.setUint16(18, 8)
    v.setUint16(22, 0x131)
    v.setUint16(24, 2)
    v.setUint32(26, 4)
    tiff.set([65, 66, 67, 0], 30)
    const bytes = new Uint8Array(2 + 10 + tiff.length + jpeg().length - 2)
    bytes.set([255, 216, 255, 225, 0, tiff.length + 8, 69, 120, 105, 102, 0, 0])
    bytes.set(tiff, 12)
    bytes.set(jpeg().slice(2), 12 + tiff.length)
    const after = exifIn(rotateImageBytes(bytes).bytes)
    expect(orientation(after)).toBe(1)
    expect(after.slice(22)).toEqual(tiff.slice(22))
  })
  it.each([
    new Uint8Array(),
    new Uint8Array([255, 216, 255, 225, 255, 255]),
    new TextEncoder().encode('GIF89a')
  ])('rejects unsupported or damaged bytes', (bytes) => {
    expect(() => rotateImageBytes(bytes)).toThrow('rotation_unsupported')
  })
})
