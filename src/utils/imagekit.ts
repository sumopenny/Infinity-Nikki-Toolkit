export const IMAGEKIT_IMAGES = 'https://ik.imagekit.io/nikkicube/images/'
export const IMAGEKIT_DETAILS = 'https://ik.imagekit.io/nikkicubeassets/images/itemDetails/'

/** Encode filenames without turning directory separators into %2F. */
export const encodeImagePath = (path: string) => path.split('/').map(encodeURIComponent).join('/')

export function optimizedImageKitUrl(url: string): string {
  if (!isImageKitResource(url)) return url
  const parsed = new URL(url)
  parsed.searchParams.set('tr', 'f-webp,q-70')
  return parsed.toString().replace('f-webp%2Cq-70', 'f-webp,q-70')
}

export function isImageKitResource(url: string): boolean {
  return url.startsWith(IMAGEKIT_IMAGES) || url.startsWith(IMAGEKIT_DETAILS)
}
