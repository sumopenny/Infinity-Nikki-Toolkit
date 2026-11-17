export const avatarSize = 1024
export const avatarPadding = 128
export const avatarCanvasSize = avatarSize + avatarPadding * 2

export interface AvatarPhotoCrop {
  centerX: number
  centerY: number
  radius: number
}

// Keep the photo crop independent of each frame's decorative transparent margins.
export const avatarPhotoRadius = 376

export function cropBounds(photo: HTMLImageElement, zoom: number) {
  const scale = zoom / Math.min(photo.naturalWidth, photo.naturalHeight)
  const width = photo.naturalWidth * scale
  const height = photo.naturalHeight * scale
  return { width, height, limitX: (width - 1) / 2, limitY: (height - 1) / 2 }
}

export function drawAvatar(
  canvas: HTMLCanvasElement,
  photo: HTMLImageElement | null,
  frame: HTMLImageElement | HTMLCanvasElement | null,
  zoom: number,
  x: number,
  y: number,
  expandedAnimation = false,
  photoCrop?: AvatarPhotoCrop
) {
  const ctx = canvas.getContext('2d')!
  const centerX = avatarPadding + (photoCrop?.centerX ?? avatarSize / 2)
  const centerY = avatarPadding + (photoCrop?.centerY ?? avatarSize / 2)
  const radius = photoCrop?.radius ?? avatarPhotoRadius
  ctx.clearRect(0, 0, avatarCanvasSize, avatarCanvasSize)
  if (photo) {
    const { width, height } = cropBounds(photo, zoom)
    const diameter = radius * 2
    ctx.save()
    ctx.beginPath()
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2)
    ctx.clip()
    ctx.drawImage(
      photo,
      centerX + (x - width / 2) * diameter,
      centerY + (y - height / 2) * diameter,
      width * diameter,
      height * diameter
    )
    ctx.restore()
  }
  if (frame) {
    const offset = expandedAnimation ? 0 : avatarPadding
    const size = expandedAnimation ? avatarCanvasSize : avatarSize
    ctx.drawImage(frame, offset, offset, size, size)
  }
}
