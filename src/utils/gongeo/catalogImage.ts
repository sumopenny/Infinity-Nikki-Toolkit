import itemImages from '../../data/wardrobe/itemImageMap.json'
import itemIcons from '../../data/wardrobe/itemIconMap.json'
import outfitImages from '../../data/wardrobe/outfitImageMap.json'
import {
  IMAGEKIT_IMAGES,
  IMAGEKIT_DETAILS,
  encodeImagePath,
  optimizedImageKitUrl
} from '../imagekit'

export const catalogImagePlaceholder = '/catalog-placeholder.svg'

/** Only numeric IDs with a known resource filename may produce a remote request. */
export function getCatalogImageSource(
  kind: 'outfit' | 'item' | 'icon' | 'makeup',
  id: string | number
) {
  const key = String(id)
  if (!/^\d+$/.test(key)) return catalogImagePlaceholder
  const map: Record<string, unknown> =
    kind === 'outfit' ? outfitImages : kind === 'icon' ? itemIcons : itemImages
  const filename = Object.hasOwn(map, key) ? map[key] : undefined
  if (typeof filename !== 'string') return catalogImagePlaceholder
  const base =
    kind === 'outfit'
      ? IMAGEKIT_IMAGES + 'outfits/'
      : kind === 'icon'
        ? IMAGEKIT_IMAGES + 'IconClothes/'
        : IMAGEKIT_DETAILS
  return optimizedImageKitUrl(base + encodeImagePath(filename))
}

export const catalogImageLoading = (index: number) => (index < 6 ? 'eager' : 'lazy')
export const catalogImagePriority = (index: number) => (index === 0 ? 'high' : 'auto')

/** Keep presentation placeholders out of persistent records. */
export function getCatalogRecordImage(
  kind: Parameters<typeof getCatalogImageSource>[0],
  id: string | number
) {
  const source = getCatalogImageSource(kind, id)
  return source === catalogImagePlaceholder ? '' : source
}
