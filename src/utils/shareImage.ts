import brandMarkUrl from '../../img/brand-mark.png'
import poseBackgroundUrl from '../../img/dreamy.webp'
import type { PhotoParamsResult } from './photo-params/types'
import type { ParseItemView } from './outfit/parseItemView'

export interface ShareModules {
  parameters: boolean
  clothes: boolean
  code: boolean
}
export interface ShareInput {
  signal?: AbortSignal
  image: HTMLImageElement
  result?: PhotoParamsResult | null
  items: ParseItemView[]
  modules: ShareModules
  outfitCode?: string
  english: boolean
}
const OUTFIT_WIDTH = 1440
const OUTFIT_HEIGHT = 2560

/** Character wrapping preserves every code character, including punctuation. */
export function wrapShareText(
  text: string,
  width: number,
  measure: (text: string) => number
): string[] {
  const lines: string[] = []
  let line = ''
  for (const character of text) {
    if (character === '\n') {
      lines.push(line)
      line = ''
      continue
    }
    if (line && measure(line + character) > width) {
      lines.push(line)
      line = ''
    }
    line += character
  }
  lines.push(line)
  return lines
}

export function loadShareImage(url: string, signal?: AbortSignal): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    signal?.throwIfAborted()
    const image = new Image()
    const cleanup = () => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', abort)
      image.onload = image.onerror = null
    }
    const abort = () => {
      cleanup()
      image.src = ''
      reject(signal?.reason ?? new DOMException('Cancelled', 'AbortError'))
    }
    image.crossOrigin = 'anonymous'
    image.referrerPolicy = 'no-referrer'
    const timer = setTimeout(() => {
      cleanup()
      image.src = ''
      reject(new Error('Image timeout'))
    }, 20000)
    image.onload = () => {
      cleanup()
      resolve(image)
    }
    image.onerror = () => {
      cleanup()
      reject(new Error('Image unavailable'))
    }
    signal?.addEventListener('abort', abort, { once: true })
    image.src = url.startsWith('https://cdn.gongeo.us/images/')
      ? '/api/share-image?path=' +
        encodeURIComponent(url.slice('https://cdn.gongeo.us/images/'.length))
      : url
  })
}

/** Resolve shared light-theme tokens once, so the saved artwork is independent of site dark mode. */
function sharePalette() {
  const styles = getComputedStyle(document.documentElement)
  const token = (name: string, fallback: string) =>
    styles.getPropertyValue(`--share-${name}`).trim() || fallback
  return {
    paper: token('paper', '#fbf8f4'),
    surface: token('surface', '#ffffff'),
    ink: token('ink', '#5f5552'),
    heading: token('heading', '#4c4240'),
    muted: token('muted', '#9b8f8b'),
    line: token('line', '#e4d5ce'),
    accent: token('accent', '#c98486'),
    pink: token('pink', '#f6ccca'),
    soft: token('soft', '#fcf8f8'),
    frame: token('frame', '#f5efe9')
  }
}

/** Four reference layouts; variable content grows vertically without truncating data. */
export async function renderShareImage(input: ShareInput): Promise<Blob> {
  const { signal } = input
  signal?.throwIfAborted()
  const load = (url: string) => loadShareImage(url, signal)
  const { image, result, modules, english } = input
  await document.fonts?.ready
  signal?.throwIfAborted()
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas unavailable')
  const colors = sharePalette()
  const brandMark = await load(brandMarkUrl)
  signal?.throwIfAborted()
  const outfit = !!input.outfitCode
  const bare = !outfit && !modules.parameters && !modules.clothes && !modules.code
  const width = bare ? image.naturalWidth : outfit ? OUTFIT_WIDTH : 1400
  const scale = width / 1024
  const portrait = image.naturalHeight > image.naturalWidth
  const margin = 36 * scale,
    gap = 24 * scale
  // Removing the portrait parameter column must not enlarge the source photograph.
  const baseWidth =
    !outfit && !bare && portrait && !modules.parameters
      ? (width - margin * 2) * 0.7 + margin * 2
      : width
  const inner = baseWidth - margin * 2
  const sideClothes =
    !outfit && (portrait || modules.parameters) && modules.clothes && input.items.length > 0
  let sideWidth = 0
  const actions: Array<() => void> = []
  const font = (size: number, bold = false, mono = false) => {
    ctx.font = `${bold ? '600 ' : ''}${size * scale}px ${mono ? 'monospace' : '"Microsoft YaHei", "PingFang SC", sans-serif'}`
  }
  const text = (
    value: string,
    x: number,
    y: number,
    size = 28,
    bold = false,
    color = colors.ink
  ) => {
    font(size, bold)
    ctx.fillStyle = color
    ctx.fillText(value, x, y)
  }
  const wrap = (value: string, w: number, size: number, mono = false) => {
    font(size, false, mono)
    return wrapShareText(value, w, (s) => ctx.measureText(s).width)
  }
  const rule = (x: number, y: number, w: number, vertical = false) => {
    ctx.fillStyle = colors.line
    ctx.fillRect(x, y, vertical ? scale : w, vertical ? w : scale)
  }
  const box = (x: number, y: number, w: number, h: number, fill = colors.surface, radius = 22) => {
    ctx.fillStyle = fill
    ctx.strokeStyle = colors.line
    ctx.lineWidth = scale
    ctx.beginPath()
    ctx.roundRect(x, y, w, h, radius * scale)
    ctx.fill()
    ctx.stroke()
  }
  const contain = (
    img: HTMLImageElement,
    x: number,
    y: number,
    w: number,
    h: number,
    rounded = false,
    radius = 22
  ) => {
    const ratio = Math.min(w / img.naturalWidth, h / img.naturalHeight)
    if (rounded) {
      ctx.save()
      ctx.beginPath()
      ctx.roundRect(
        x + (w - img.naturalWidth * ratio) / 2,
        y + (h - img.naturalHeight * ratio) / 2,
        img.naturalWidth * ratio,
        img.naturalHeight * ratio,
        radius * scale
      )
      ctx.clip()
    }
    ctx.drawImage(
      img,
      x + (w - img.naturalWidth * ratio) / 2,
      y + (h - img.naturalHeight * ratio) / 2,
      img.naturalWidth * ratio,
      img.naturalHeight * ratio
    )
    if (rounded) ctx.restore()
  }
  const heading = (value: string, top: number, left = margin, availableWidth = inner) => {
    ctx.fillStyle = colors.accent
    ctx.beginPath()
    ctx.roundRect(left + 8 * scale, top + 7 * scale, 8 * scale, 38 * scale, 4 * scale)
    ctx.fill()
    let size = 34
    font(size, true)
    while (ctx.measureText(value).width > availableWidth - 44 * scale && size > 18)
      font(--size, true)
    text(value, left + 36 * scale, top + 42 * scale, size, true, colors.accent)
  }
  const startSection = (
    value: string,
    top: number,
    height: number,
    sectionWidth = inner,
    left = margin
  ) => {
    box(left, top, sectionWidth, height, colors.surface, 16)
    heading(value, top + 20 * scale, left + 24 * scale, sectionWidth - 48 * scale)
  }
  const finishSection = (top: number, height: number) => {
    if (!portrait) rule(margin, top + height + 32 * scale, inner)
  }
  const watermark = (x: number, y: number, photoW: number, photoH: number) => {
    const baseUnit = Math.min(photoW / 736, photoH / 240)
    const unit = baseUnit * (outfit ? 1.6 : 1.35)
    const inset = 22 * baseUnit,
      size = 38 * unit
    const left = x + inset,
      top = y + inset
    ctx.save()
    ctx.globalAlpha = 0.92
    ctx.shadowColor = 'rgba(87, 21, 26, 0.5)'
    ctx.shadowBlur = 4 * unit
    ctx.shadowOffsetY = 0
    ctx.fillStyle = '#fffdf9'
    ctx.beginPath()
    ctx.roundRect(left, top, size, size, 10 * unit)
    ctx.fill()
    ctx.save()
    ctx.shadowColor = 'transparent'
    ctx.beginPath()
    ctx.roundRect(left, top, size, size, 10 * unit)
    ctx.clip()
    ctx.drawImage(brandMark, left, top, size, size)
    ctx.restore()
    ctx.fillStyle = '#ffffff'
    ctx.textBaseline = 'top'
    ctx.font = `700 ${19.5 * unit}px "Microsoft YaHei", "PingFang SC", sans-serif`
    ctx.fillText('暖立方', left + size + 9 * unit, top + unit)
    ctx.font = `600 ${12 * unit}px "Microsoft YaHei", "PingFang SC", sans-serif`
    ctx.fillText('无限暖暖工具集', left + size + 9 * unit, top + 27 * unit)
    ctx.font = `700 ${10.8 * unit}px "Microsoft YaHei", "PingFang SC", sans-serif`
    const websiteLetterSpacing = 0.8 * unit
    let websiteX = left
    for (const character of 'nikki3.pages.dev') {
      ctx.fillText(character, websiteX, top + size + 10 * unit)
      websiteX += ctx.measureText(character).width + websiteLetterSpacing
    }
    ctx.restore()
  }
  if (bare) {
    const ratio = Math.min(
      1,
      4096 / width,
      4096 / image.naturalHeight,
      Math.sqrt(8_000_000 / (width * image.naturalHeight))
    )
    canvas.width = Math.max(1, Math.floor(width * ratio))
    canvas.height = Math.max(1, Math.floor(image.naturalHeight * ratio))
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
    watermark(0, 0, canvas.width, canvas.height)
  } else if (outfit) {
    canvas.width = width
    canvas.height = OUTFIT_HEIGHT
    ctx.fillStyle = colors.paper
    ctx.fillRect(0, 0, width, canvas.height)
    const m = 30 * scale,
      contentWidth = width - 2 * m
    const footerHeight = 196 * scale
    const imageHeight = canvas.height - m * 2 - 20 * scale - footerHeight
    // Outfit exports fill the entire rounded frame with an undistorted, centered crop.
    const imageScale = Math.max(
      contentWidth / image.naturalWidth,
      imageHeight / image.naturalHeight
    )
    const cropWidth = contentWidth / imageScale
    const cropHeight = imageHeight / imageScale
    ctx.save()
    ctx.beginPath()
    ctx.roundRect(m, m, contentWidth, imageHeight, 46 * scale)
    ctx.clip()
    ctx.drawImage(
      image,
      (image.naturalWidth - cropWidth) / 2,
      (image.naturalHeight - cropHeight) / 2,
      cropWidth,
      cropHeight,
      m,
      m,
      contentWidth,
      imageHeight
    )
    ctx.restore()
    watermark(m, m, contentWidth, imageHeight)
    const top = m + imageHeight + 20 * scale
    box(m, top, contentWidth, footerHeight, colors.surface, 40)
    const left = m + 52 * scale,
      labelWidth = (english ? 350 : 376) * scale
    const centerY = top + footerHeight / 2
    ctx.fillStyle = colors.accent
    ctx.beginPath()
    ctx.roundRect(left, centerY - 66 * scale, labelWidth, 132 * scale, 40 * scale)
    ctx.fill()
    ctx.save()
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
    let size = english ? 38 : 58
    const labelText = english ? 'Outfit share' : '搭配分享'
    font(size, true)
    const labelBounds = ctx.measureText(labelText)
    // Center the visible glyph bounds rather than the font's em box.
    text(
      labelText,
      left +
        labelWidth / 2 +
        (labelBounds.actualBoundingBoxLeft - labelBounds.actualBoundingBoxRight) / 2,
      centerY + (labelBounds.actualBoundingBoxAscent - labelBounds.actualBoundingBoxDescent) / 2,
      size,
      true,
      colors.surface
    )
    ctx.restore()
    const dividerX = left + labelWidth + 40 * scale
    rule(dividerX, centerY - 50 * scale, 100 * scale, true)
    const codeX = dividerX + 38 * scale
    size = 52
    font(size, true)
    while (ctx.measureText(input.outfitCode!).width > width - m - codeX - 30 * scale && size > 20)
      font(--size, true)
    ctx.save()
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
    const codeBounds = ctx.measureText(input.outfitCode!)
    text(
      input.outfitCode!,
      codeX,
      centerY + (codeBounds.actualBoundingBoxAscent - codeBounds.actualBoundingBoxDescent) / 2,
      size,
      true
    )
    ctx.restore()
  } else {
    const fields =
      result && modules.parameters
        ? [
            ...result.environmentFields,
            ...result.cameraFields,
            ...result.imageFields,
            ...result.resourceGroups.map((group) => ({
              label: group.title,
              imageUrl: group.imageUrl,
              kind: group.kind,
              value: `${group.name}${group.value ? ' · ' + group.value : ''}`
            }))
          ]
        : []
    const resourcePictures = new Map<string, HTMLImageElement>()
    if (modules.parameters && result)
      await Promise.all(
        result.resourceGroups.map(async (group) => {
          if (group.imageUrl)
            resourcePictures.set(
              group.imageUrl,
              await load('/api/share-image?resource=' + encodeURIComponent(group.imageUrl))
            )
        })
      )
    const poseBackground =
      modules.parameters &&
      result?.resourceGroups.some((group) => group.kind === 'pose' && group.imageUrl)
        ? await load(poseBackgroundUrl)
        : null
    const split = portrait && fields.length > 0
    const photoWidth = split ? inner * 0.7 : inner
    const parameterWidth = split ? inner - photoWidth - gap : inner
    const groups = split
      ? fields.map((field) => [field])
      : [
          fields.slice(0, result?.environmentFields.length ?? 0),
          ...Array.from(
            {
              length: Math.ceil(
                ((result?.cameraFields.length ?? 0) + (result?.imageFields.length ?? 0)) / 6
              )
            },
            (_, i) =>
              fields
                .slice(
                  (result?.environmentFields.length ?? 0) + i * 6,
                  (result?.environmentFields.length ?? 0) + (i + 1) * 6
                )
                .slice(
                  0,
                  Math.min(
                    6,
                    (result?.cameraFields.length ?? 0) + (result?.imageFields.length ?? 0) - i * 6
                  )
                )
          ),
          fields.slice(
            (result?.environmentFields.length ?? 0) +
              (result?.cameraFields.length ?? 0) +
              (result?.imageFields.length ?? 0)
          )
        ].filter((group) => group.length)
    const rows = groups.flatMap((group, rowIndex) =>
      group.map((field, column) => {
        const cellWidth = (parameterWidth - 48 * scale) / group.length
        const picture =
          'imageUrl' in field && typeof field.imageUrl === 'string'
            ? resourcePictures.get(field.imageUrl)
            : undefined
        const textWidth = cellWidth - (picture ? 120 : 40) * scale
        const label = wrap(
          field.label,
          split && !picture ? cellWidth * 0.47 : textWidth,
          split ? 25 : 23
        )
        const value = wrap(
          field.value,
          split && !picture ? cellWidth * 0.49 : textWidth,
          split ? 27 : 29
        )
        const h =
          split && !picture
            ? Math.max(label.length, value.length) * 34 + 38
            : label.length * 32 + value.length * 40 + 36
        return {
          label,
          value,
          picture,
          isPose: 'kind' in field && field.kind === 'pose',
          rawLabel: field.label,
          rawValue: field.value,
          h: h * scale,
          cellWidth,
          column,
          rowIndex,
          last: column === group.length - 1
        }
      })
    )
    const rowHeights = groups.map((_, index) =>
      Math.max(...rows.filter((row) => row.rowIndex === index).map((row) => row.h))
    )
    // Landscape rows already include their bottom spacing; avoid adding it twice.
    let parameterHeight = (split ? 104 : 92) * scale + rowHeights.reduce((a, b) => a + b, 0)
    const photoHeight = (photoWidth * image.naturalHeight) / image.naturalWidth
    let splitRowScale = split
      ? Math.max(
          0.55,
          Math.min(1, (photoHeight - 104 * scale) / Math.max(1, parameterHeight - 104 * scale))
        )
      : 1
    if (split) {
      // Measure the actual rendered fonts, then update both text and row heights.
      for (let pass = 0; pass < 6; pass++) {
        for (const row of rows) {
          if (row.picture) {
            const available = parameterWidth - 66 * scale - 76 * scale * splitRowScale
            row.label = wrap(row.rawLabel, available, 23 * splitRowScale)
            row.value = wrap(row.rawValue, available, 29 * splitRowScale)
            row.h = (row.label.length * 32 + row.value.length * 40 + 36) * scale
          } else {
            const available = parameterWidth - 66 * scale
            row.label = wrap(row.rawLabel, available * 0.48, 25 * splitRowScale)
            row.value = wrap(row.rawValue, available * 0.48, 27 * splitRowScale)
            row.h = (Math.max(row.label.length, row.value.length) * 34 + 38) * scale
          }
          rowHeights[row.rowIndex] = row.h
        }
        parameterHeight = 104 * scale + rowHeights.reduce((a, b) => a + b, 0)
        const nextScale = Math.max(
          0.55,
          Math.min(1, (photoHeight - 104 * scale) / (parameterHeight - 104 * scale))
        )
        if (Math.abs(nextScale - splitRowScale) < 0.001) break
        if (pass < 5) splitRowScale = nextScale
      }
    }
    let topHeight = split
      ? Math.max(photoHeight, 104 * scale + (parameterHeight - 104 * scale) * splitRowScale)
      : photoHeight
    const photoTop = margin
    actions.push(() => {
      contain(image, margin, photoTop, photoWidth, topHeight, true)
      const fit = Math.min(photoWidth / image.naturalWidth, topHeight / image.naturalHeight)
      const fittedW = image.naturalWidth * fit,
        fittedH = image.naturalHeight * fit
      watermark(
        margin + (photoWidth - fittedW) / 2,
        photoTop + (topHeight - fittedH) / 2,
        fittedW,
        fittedH
      )
    })
    let y = photoTop + topHeight + (portrait ? gap : 34 * scale)
    if (fields.length) {
      const top = split ? margin : y,
        px = split ? margin + photoWidth + gap : margin
      actions.push(() => {
        if (split)
          startSection(
            english ? 'Photo parameters' : '图片参数',
            top,
            topHeight,
            parameterWidth,
            px
          )
        else startSection(english ? 'Photo parameters' : '图片参数', top, parameterHeight)
        let fy = top + (split ? 102 : 94) * scale
        rows.forEach((field, index) => {
          const { cellWidth, column, rowIndex, last } = field
          const x = px + 24 * scale + column * cellWidth
          if (field.picture) {
            const size = 64 * scale * splitRowScale
            const imageX = split
              ? px + parameterWidth - 32 * scale - size
              : x + cellWidth - 84 * scale
            const imageY = fy + 4 * scale * splitRowScale
            if (field.isPose && poseBackground) {
              ctx.save()
              ctx.beginPath()
              ctx.roundRect(imageX, imageY, size, size, 8 * scale * splitRowScale)
              ctx.clip()
              const ratio = Math.max(
                size / poseBackground.naturalWidth,
                size / poseBackground.naturalHeight
              )
              ctx.drawImage(
                poseBackground,
                imageX + (size - poseBackground.naturalWidth * ratio) / 2,
                imageY + (size - poseBackground.naturalHeight * ratio) / 2,
                poseBackground.naturalWidth * ratio,
                poseBackground.naturalHeight * ratio
              )
              ctx.restore()
            }
            contain(field.picture, imageX, imageY, size, size, true, 8 * splitRowScale)
          }
          if (split && !field.picture) {
            field.label.forEach((line, i) =>
              text(
                line,
                x + 10 * scale,
                fy + (i * 34 + 28) * scale * splitRowScale,
                25 * splitRowScale
              )
            )
            field.value.forEach((line, i) => {
              font(27 * splitRowScale)
              text(
                line,
                px + parameterWidth - 32 * scale - ctx.measureText(line).width,
                fy + (i * 34 + 28) * scale * splitRowScale,
                27 * splitRowScale
              )
            })
            if (index < rows.length - 1)
              rule(
                px + 32 * scale,
                fy + field.h * splitRowScale - 12 * scale * splitRowScale,
                parameterWidth - 64 * scale
              )
          } else {
            field.label.forEach((line, i) =>
              text(
                line,
                x + (split ? 10 : 20) * scale,
                fy + (i * 32 + 28) * scale * splitRowScale,
                23 * splitRowScale
              )
            )
            field.value.forEach((line, i) =>
              text(
                line,
                x + (split ? 10 : 20) * scale,
                fy + (field.label.length * 32 + i * 40 + 32) * scale * splitRowScale,
                29 * splitRowScale,
                true
              )
            )
            if (!last) rule(x + cellWidth, fy + 8 * scale, rowHeights[rowIndex]! - 32 * scale, true)
            if (split && index < rows.length - 1)
              rule(
                px + 32 * scale,
                fy + (field.h - 12 * scale) * splitRowScale,
                parameterWidth - 64 * scale
              )
          }
          if (last) {
            fy += rowHeights[rowIndex]! * splitRowScale
            if (!split && index < rows.length - 1)
              rule(px + 24 * scale, fy - 8 * scale, parameterWidth - 48 * scale)
          }
        })
        if (!split && !sideClothes && modules.clothes && input.items.length)
          finishSection(top, parameterHeight)
      })
      if (!split) y += parameterHeight + gap
    }
    if (modules.clothes && input.items.length) {
      const pictures = new Map<string, HTMLImageElement>()
      const urls = [
        ...new Set(input.items.map((item) => item.imageUrl).filter((url): url is string => !!url))
      ]
      for (let i = 0; i < urls.length; i += 6)
        await Promise.all(
          urls.slice(i, i + 6).map(async (url) => pictures.set(url, await load(url)))
        )
      const padding = 28 * scale,
        itemGap = 16 * scale
      let sectionWidth = inner
      const sectionLeft = sideClothes ? baseWidth - margin + gap : margin
      const offset = (portrait ? 105 : 92) * scale
      const top = sideClothes ? margin : y
      const leftBottom = fields.length ? y - gap : photoTop + topHeight
      const availableHeight = leftBottom - top - offset - 12 * scale
      const layout = (columns: number, cw: number) => {
        const itemRows = input.items.map((item) => ({
          item,
          lines: wrap(item.name, cw - 16 * scale, 18),
          dyeRows: Math.ceil(item.dyeColors.length / 6)
        }))
        const heights: number[] = []
        for (let i = 0; i < itemRows.length; i += columns)
          heights.push(
            Math.max(
              ...itemRows
                .slice(i, i + columns)
                .map((row) => cw + (row.lines.length * 26 + row.dyeRows * 24 + 32) * scale)
            )
          )
        return { columns, cw, itemRows, heights, total: heights.reduce((a, b) => a + b, 0) }
      }
      const widthFor = (columns: number) =>
        (sectionWidth - padding * 2 - itemGap * (columns - 1)) / columns
      // Use the same preferred size and spacing in side and bottom layouts.
      const preferredSize = 166 * scale
      const minimumSize = 144 * scale
      let selected = layout(1, preferredSize)
      let bestScore = Infinity
      for (let columns = 1; columns <= Math.min(6, input.items.length); columns++) {
        const maxSize = sideClothes ? preferredSize : Math.min(preferredSize, widthFor(columns))
        if (maxSize < minimumSize) continue
        let size = maxSize
        if (
          sideClothes &&
          layout(columns, size).total > availableHeight &&
          layout(columns, minimumSize).total <= availableHeight
        ) {
          let low = minimumSize,
            high = size
          for (let step = 0; step < 20; step++) {
            const mid = (low + high) / 2
            if (layout(columns, mid).total <= availableHeight) low = mid
            else high = mid
          }
          size = low
        }
        const candidate = layout(columns, size)
        const sizePenalty = Math.abs(size - preferredSize) / scale
        const overflow = sideClothes ? Math.max(0, candidate.total - availableHeight) / scale : 0
        const spacePenalty = sideClothes
          ? (Math.max(0, availableHeight - candidate.total) / scale) * 0.01
          : candidate.heights.length * 2
        const score = sizePenalty + overflow * 10 + spacePenalty
        if (score < bestScore) {
          bestScore = score
          selected = candidate
        }
      }
      const { columns, cw, itemRows, heights } = selected
      if (sideClothes) {
        font(portrait ? 32 : 34, true)
        const titleWidth =
          ctx.measureText(english ? 'Outfit parts' : '穿搭部件').width +
          (portrait ? 118 : 72) * scale
        sectionWidth = Math.max(titleWidth, padding * 2 + columns * cw + (columns - 1) * itemGap)
        sideWidth = sectionWidth + gap
      }
      const contentHeight = offset + selected.total + 12 * scale
      const height = sideClothes ? Math.max(contentHeight, leftBottom - top) : contentHeight
      const rowGap = 0
      const columnGap = itemGap
      const gridLeft = (sectionWidth - columns * cw - (columns - 1) * columnGap) / 2
      if (sideClothes && fields.length && top + height > leftBottom) {
        if (split) topHeight += top + height - leftBottom
        else parameterHeight += top + height - leftBottom
        y += top + height - leftBottom
      }
      actions.push(() => {
        startSection(english ? 'Outfit parts' : '穿搭部件', top, height, sectionWidth, sectionLeft)
        let iy = top + offset
        itemRows.forEach(({ item, lines }, index) => {
          const x = sectionLeft + gridLeft + (index % columns) * (cw + columnGap)
          box(x, iy, cw, cw, colors.soft, 16)
          const picture = item.imageUrl ? pictures.get(item.imageUrl) : undefined
          if (picture)
            contain(picture, x + 8 * scale, iy + 8 * scale, cw - 16 * scale, cw - 16 * scale)
          else text(english ? 'No image' : '暂无图片', x + 12 * scale, iy + cw / 2, 18)
          lines.forEach((line, i) => {
            font(18)
            text(
              line,
              x + (cw - ctx.measureText(line).width) / 2,
              iy + cw + (i * 26 + 26) * scale,
              18
            )
          })
          item.dyeColors.forEach((color, i) => {
            const count = Math.min(6, item.dyeColors.length - Math.floor(i / 6) * 6)
            ctx.beginPath()
            ctx.arc(
              x + (cw - count * 22 * scale) / 2 + ((i % 6) * 22 + 11) * scale,
              iy + cw + (lines.length * 26 + 19 + Math.floor(i / 6) * 24) * scale,
              7 * scale,
              0,
              Math.PI * 2
            )
            ctx.fillStyle = color
            ctx.fill()
            ctx.strokeStyle = colors.line
            ctx.stroke()
          })
          if (index % columns === columns - 1) iy += heights[Math.floor(index / columns)]! + rowGap
        })
      })
      y = sideClothes ? Math.max(y, top + height + gap) : y + height + gap
    }
    if (modules.code && result?.rawCameraParams) {
      const padding = portrait ? 28 : 24
      const lines = wrap(
        result.rawCameraParams,
        inner + sideWidth - (portrait ? padding * 2 + 40 : 56) * scale,
        22,
        true
      )
      const offset = (portrait ? 104 : 66) * scale
      const codeHeight = (lines.length * 34 + 40) * scale
      const height = offset + codeHeight + (portrait ? 24 * scale : 0),
        top = y
      actions.push(() => {
        startSection(
          english ? 'Camera parameter code' : '相机参数码',
          top,
          height,
          inner + sideWidth
        )
        if (portrait)
          box(
            margin + padding * scale,
            top + offset,
            inner + sideWidth - padding * 2 * scale,
            codeHeight,
            colors.soft,
            12
          )
        ctx.save()
        font(22, false, true)
        ctx.textBaseline = 'middle'
        ctx.fillStyle = colors.ink
        lines.forEach((line, i) =>
          ctx.fillText(
            line,
            margin + (portrait ? padding + 20 : 28) * scale,
            top + offset + (20 + i * 34 + 17) * scale
          )
        )
        ctx.restore()
      })
      y += height + gap
    }
    if (y > 16000) throw new Error('Share content limit exceeded')
    signal?.throwIfAborted()
    const outputWidth = baseWidth + sideWidth
    canvas.width = outputWidth
    canvas.height = Math.ceil(y + 12 * scale)
    ctx.fillStyle = colors.paper
    ctx.fillRect(0, 0, outputWidth, canvas.height)
    actions.forEach((draw) => draw())
  }
  signal?.throwIfAborted()
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => {
        canvas.width = canvas.height = 0
        if (signal?.aborted) reject(signal.reason)
        else if (blob) resolve(blob)
        else reject(new Error('JPEG export failed'))
      },
      'image/jpeg',
      1
    )
  )
}
