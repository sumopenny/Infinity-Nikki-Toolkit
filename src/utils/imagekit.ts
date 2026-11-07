import itemImages from '../data/wardrobe/itemImageMap.json'
import itemIcons from '../data/wardrobe/itemIconMap.json'
import outfitImages from '../data/wardrobe/outfitImageMap.json'
export const IMAGEKIT_IMAGES = 'https://ik.imagekit.io/nikkicube/images/'
export const IMAGEKIT_DETAILS = 'https://ik.imagekit.io/nikkicubeassets/images/itemDetails/'

/** Encode filenames without turning directory separators into %2F. */
export const encodeImagePath = (path: string) => path.split('/').map(encodeURIComponent).join('/')

export function optimizedImageKitUrl(url: string): string {
  url = migrateLegacyImageUrl(url)
  if (!isImageKitResource(url)) return url
  const parsed = new URL(url)
  parsed.searchParams.set('tr', 'f-webp,q-70')
  return parsed.toString().replace('f-webp%2Cq-70', 'f-webp,q-70')
}

export function isImageKitResource(url: string): boolean {
  return url.startsWith(IMAGEKIT_IMAGES) || url.startsWith(IMAGEKIT_DETAILS)
}

export function isLegacyImageUrl(url: string): boolean {
  try {
    return new URL(url).hostname === 'cdn.gongeo.us'
  } catch {
    return false
  }
}
export function migrateLegacyImageUrl(url: string): string {
  if (!isLegacyImageUrl(url)) return url
  const match = new URL(url).pathname.match(
    /^\/images\/(outfits|items\/icons|items\/makeups|items)\/(\d+)\.png$/
  )
  if (!match) return '/catalog-placeholder.svg'
  const [, kind, id] = match
  const map: Record<string, unknown> =
    kind === 'outfits' ? outfitImages : kind === 'items/icons' ? itemIcons : itemImages
  const file = map[id]
  if (typeof file !== 'string') return '/catalog-placeholder.svg'
  const base =
    kind === 'outfits'
      ? IMAGEKIT_IMAGES + 'outfits/'
      : kind === 'items/icons'
        ? IMAGEKIT_IMAGES + 'IconClothes/'
        : IMAGEKIT_DETAILS
  return base + encodeImagePath(file)
}
