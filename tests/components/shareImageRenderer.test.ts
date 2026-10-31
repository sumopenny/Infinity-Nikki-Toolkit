import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  loadShareImage,
  renderShareImage,
  wrapShareText,
  type ShareInput
} from '../../src/utils/shareImage'
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
describe('share image renderer', () => {
  it('cancels a pending image load', async () => {
    let source = ''
    vi.stubGlobal(
      'Image',
      class {
        set src(value: string) {
          source = value
        }
      }
    )
    const controller = new AbortController()
    const pending = loadShareImage('/test.png', controller.signal)
    controller.abort()
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    expect(source).toBe('')
  })
  it('preserves every character of wrapped parameter codes', () => {
    const code = 'Ab+/0123456789'.repeat(60) + '=='
    const lines = wrapShareText(code, 31, (text) => text.length)
    expect(lines.join('')).toBe(code)
    expect(lines.every((line) => line.length <= 31)).toBe(true)
  })
  it('draws full code and item dye colors, and produces exact outfit dimensions', async () => {
    vi.stubGlobal(
      'Image',
      class {
        naturalWidth = 100
        naturalHeight = 100
        onload?: () => void
        set src(_value: string) {
          queueMicrotask(() => this.onload?.())
        }
      }
    )
    const text = vi.fn(),
      arcs = vi.fn()
    const ctx = {
      measureText: (s: string) => ({
        width: s.length * 15,
        actualBoundingBoxLeft: 2,
        actualBoundingBoxRight: s.length * 15 - 3,
        actualBoundingBoxAscent: 32,
        actualBoundingBoxDescent: 4
      }),
      fillText: text,
      drawImage: vi.fn(),
      fillRect: vi.fn(),
      beginPath: vi.fn(),
      roundRect: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      clip: vi.fn(),
      arc: arcs
    }
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      ctx as unknown as CanvasRenderingContext2D
    )
    const sizes: number[][] = []
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (
      this: HTMLCanvasElement,
      callback
    ) {
      sizes.push([this.width, this.height])
      callback(new Blob(['png']))
    })
    const code = 'aB+/1234567890'.repeat(40) + '='
    const base: ShareInput = {
      image: { naturalWidth: 800, naturalHeight: 1200 } as HTMLImageElement,
      modules: { parameters: true, clothes: true, code: true },
      english: false,
      items: [
        {
          id: 1,
          name: '部件',
          imageUrl: null,
          resolved: false,
          outfitId: null,
          clothType: null,
          dyes: [],
          hasSpecialEffect: false,
          dyeColors: ['#f5d5a3', '#bd9490']
        }
      ],
      result: {
        environmentFields: [],
        cameraFields: [{ label: '焦距', value: '55mm' }],
        imageFields: [],
        resourceGroups: [],
        rawCameraParams: code
      }
    }
    await renderShareImage(base)
    const originalTextCalls = [...text.mock.calls]
    await renderShareImage({
      ...base,
      image: { naturalWidth: 12000, naturalHeight: 10000 } as HTMLImageElement,
      modules: { parameters: false, clothes: false, code: false }
    })
    const [largeWidth, largeHeight] = sizes.at(-1)!
    expect(Math.max(largeWidth, largeHeight)).toBeLessThanOrEqual(4096)
    expect(largeWidth * largeHeight).toBeLessThanOrEqual(8_000_000)
    expect(arcs).toHaveBeenCalledTimes(2)
    expect(text.mock.calls.some((call) => call[0] === '暖立方')).toBe(true)
    expect(text.mock.calls.some((call) => call[0] === '无限暖暖工具集')).toBe(true)
    const codeLines = originalTextCalls
      .slice(originalTextCalls.findIndex((call) => call[0] === '相机参数码') + 1)
      .map((call) => call[0] as string)
      .filter((s) => /^[a-zA-Z0-9+/=]+$/.test(s) && !s.includes('mm'))
    expect(codeLines.join('')).toBe(code)
    for (const portrait of [false, true]) {
      for (let mask = 0; mask < 8; mask++) {
        text.mockClear()
        const modules = { parameters: !!(mask & 1), clothes: !!(mask & 2), code: !!(mask & 4) }
        await renderShareImage({
          ...base,
          image: {
            naturalWidth: portrait ? 800 : 1200,
            naturalHeight: portrait ? 1200 : 800
          } as HTMLImageElement,
          modules
        })
        expect(ctx.drawImage.mock.calls.some((call) => Math.abs(call[3] - 60.8) < 0.0001 && Math.abs(call[4] - 60.8) < 0.0001)).toBe(true)
        const labels = text.mock.calls.map((call) => call[0])
        expect(labels.includes('图片参数')).toBe(modules.parameters)
        expect(labels.includes('穿搭部件')).toBe(modules.clothes)
        expect(labels.includes('相机参数码')).toBe(modules.code)
      }
    }
    const portraitPhotoWidths: number[] = []
    for (const parameters of [true, false]) {
      ctx.drawImage.mockClear()
      await renderShareImage({ ...base, modules: { parameters, clothes: true, code: false } })
      portraitPhotoWidths.push(ctx.drawImage.mock.calls[0]![3])
    }
    expect(portraitPhotoWidths[0]).toBeCloseTo(portraitPhotoWidths[1]!, 6)
    text.mockClear()
    ctx.roundRect.mockClear()
    ctx.drawImage.mockClear()
    await renderShareImage({ ...base, outfitCode: '13dub3nPiPu#' })
    expect(ctx.drawImage.mock.calls.some((call) => Math.abs(call[3] - 106.4) < 0.0001 && Math.abs(call[4] - 106.4) < 0.0001)).toBe(true)
    expect(sizes.at(-1)).toEqual([1440, 2560])
    const badge = ctx.roundRect.mock.calls.at(-1)!
    const title = text.mock.calls.find((call) => call[0] === '搭配分享')!
    expect((title[1] - 2 + title[1] + 57) / 2).toBeCloseTo(badge[0] + badge[2] / 2)
    expect((title[2] - 32 + title[2] + 4) / 2).toBeCloseTo(badge[1] + badge[3] / 2)
    await renderShareImage({ ...base, modules: { parameters: false, clothes: false, code: false } })
    expect(sizes.at(-1)).toEqual([800, 1200])
  })
})
