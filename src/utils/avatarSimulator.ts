export const avatarSize = 1024

/** Find the centered circular rim inside the decorative transparent margins. */
export function frameRadius(image: HTMLImageElement) {
  const sample = document.createElement('canvas')
  sample.width = sample.height = 256
  const ctx = sample.getContext('2d')!
  ctx.drawImage(image, 0, 0, 256, 256)
  const pixels = ctx.getImageData(0, 0, 256, 256).data
  let best = 94
  let bestScore = -1
  // The catalog uses a common icon layout, including higher-resolution exports.
  for (let radius = 75; radius <= 103; radius++) {
    let score = 0
    for (let degree = 0; degree < 360; degree += 2) {
      const angle = (degree * Math.PI) / 180
      const x = Math.round(127.5 + radius * Math.cos(angle))
      const y = Math.round(127.5 + radius * Math.sin(angle))
      score += pixels[(y * 256 + x) * 4 + 3]
    }
    if (score > bestScore) {
      bestScore = score
      best = radius
    }
  }
  return (best * avatarSize) / 256
}

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
  radius: number,
  zoom: number,
  x: number,
  y: number
) {
  const ctx = canvas.getContext('2d')!
  const center = avatarSize / 2
  ctx.clearRect(0, 0, avatarSize, avatarSize)
  if (photo) {
    const { width, height } = cropBounds(photo, zoom)
    const diameter = radius * 2
    ctx.save()
    ctx.beginPath()
    ctx.arc(center, center, radius, 0, Math.PI * 2)
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
