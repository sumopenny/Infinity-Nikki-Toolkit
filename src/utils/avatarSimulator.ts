export const avatarSize = 1024

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
  frame: HTMLImageElement | null,
  zoom: number,
  x: number,
  y: number
) {
  const ctx = canvas.getContext('2d')!
  const center = avatarSize / 2
  ctx.clearRect(0, 0, avatarSize, avatarSize)
  if (photo) {
    const { width, height } = cropBounds(photo, zoom)
    const diameter = avatarPhotoRadius * 2
    ctx.save()
    ctx.beginPath()
    ctx.arc(center, center, avatarPhotoRadius, 0, Math.PI * 2)
    ctx.clip()
    ctx.drawImage(
      photo,
      center + (x - width / 2) * diameter,
      center + (y - height / 2) * diameter,
      width * diameter,
      height * diameter
    )
    ctx.restore()
  }
  if (frame) ctx.drawImage(frame, 0, 0, avatarSize, avatarSize)
}
