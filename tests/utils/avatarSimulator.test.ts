import { describe, expect, it, vi } from 'vitest'
import {
  avatarCanvasSize,
  avatarPadding,
  avatarPhotoRadius,
  avatarSize,
  drawAvatar
} from '../../src/utils/avatarSimulator'

describe('avatar photo composition', () => {
  it.each([
    [1200, 1800, 1, 0, 0],
    [1800, 1200, 2, 0.2, -0.3],
    [1200, 1200, 4, -0.6, 0.5]
  ])('keeps the crop unchanged across frames for %s × %s photos', (width, height, zoom, x, y) => {
    const context = {
      clearRect: vi.fn(),
      save: vi.fn(),
      beginPath: vi.fn(),
      arc: vi.fn(),
      clip: vi.fn(),
      drawImage: vi.fn(),
      restore: vi.fn()
    }
    const canvas = { getContext: () => context } as unknown as HTMLCanvasElement
    const photo = { naturalWidth: width, naturalHeight: height } as HTMLImageElement
    const frames = [
      null,
      { naturalWidth: 256, naturalHeight: 256 },
      { naturalWidth: 1024, naturalHeight: 1024 },
      null
    ] as (HTMLImageElement | null)[]
    const diameter = avatarPhotoRadius * 2
    const scale = zoom / Math.min(width, height)
    const expectedPhoto = [
      photo,
      avatarCanvasSize / 2 + (x - (width * scale) / 2) * diameter,
      avatarCanvasSize / 2 + (y - (height * scale) / 2) * diameter,
      width * scale * diameter,
      height * scale * diameter
    ]

    for (const frame of frames) {
      context.drawImage.mockClear()
      drawAvatar(canvas, photo, frame, zoom, x, y)
      expect(context.drawImage.mock.calls[0]).toEqual(expectedPhoto)
      expect(context.arc).toHaveBeenLastCalledWith(
        avatarCanvasSize / 2,
        avatarCanvasSize / 2,
        avatarPhotoRadius,
        0,
        Math.PI * 2
      )
      expect(context.drawImage).toHaveBeenCalledTimes(frame ? 2 : 1)
      if (frame) {
        expect(context.drawImage.mock.calls[1]).toEqual([
          frame,
          avatarPadding,
          avatarPadding,
          avatarSize,
          avatarSize
        ])
      }
    }
  })
})

it('composites the current animation canvas above the photo for PNG export', () => {
  const context = { clearRect: vi.fn(), drawImage: vi.fn() }
  const canvas = { getContext: () => context } as unknown as HTMLCanvasElement
  const animation = { width: 512, height: 512 } as HTMLCanvasElement
  drawAvatar(canvas, null, animation, 1, 0, 0, true)
  expect(context.drawImage).toHaveBeenCalledWith(
    animation,
    0,
    0,
    avatarCanvasSize,
    avatarCanvasSize
  )
})

it('uses the source-calibrated photo center and radius without moving the animation canvas', () => {
  const context = {
    clearRect: vi.fn(),
    save: vi.fn(),
    beginPath: vi.fn(),
    arc: vi.fn(),
    clip: vi.fn(),
    drawImage: vi.fn(),
    restore: vi.fn()
  }
  const canvas = { getContext: () => context } as unknown as HTMLCanvasElement
  const photo = { naturalWidth: 1000, naturalHeight: 1000 } as HTMLImageElement
  const animation = { width: 512, height: 512 } as HTMLCanvasElement
  const crop = { centerX: 562.119, centerY: 562.471, radius: 399.355 }
  drawAvatar(canvas, photo, animation, 1, 0, 0, true, crop)
  expect(context.arc).toHaveBeenCalledWith(
    avatarPadding + crop.centerX,
    avatarPadding + crop.centerY,
    crop.radius,
    0,
    Math.PI * 2
  )
  expect(context.drawImage).toHaveBeenLastCalledWith(
    animation,
    0,
    0,
    avatarCanvasSize,
    avatarCanvasSize
  )
})
