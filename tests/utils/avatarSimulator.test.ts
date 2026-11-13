import { describe, expect, it, vi } from 'vitest'
import { avatarPhotoRadius, avatarSize, drawAvatar } from '../../src/utils/avatarSimulator'

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
      avatarSize / 2 + (x - (width * scale) / 2) * diameter,
      avatarSize / 2 + (y - (height * scale) / 2) * diameter,
      width * scale * diameter,
      height * scale * diameter
    ]

    for (const frame of frames) {
      context.drawImage.mockClear()
      drawAvatar(canvas, photo, frame, zoom, x, y)
      expect(context.drawImage.mock.calls[0]).toEqual(expectedPhoto)
      expect(context.arc).toHaveBeenLastCalledWith(
        avatarSize / 2,
        avatarSize / 2,
        avatarPhotoRadius,
        0,
        Math.PI * 2
      )
      expect(context.drawImage).toHaveBeenCalledTimes(frame ? 2 : 1)
      if (frame) {
        expect(context.drawImage.mock.calls[1]).toEqual([frame, 0, 0, avatarSize, avatarSize])
      }
    }
  })
})
