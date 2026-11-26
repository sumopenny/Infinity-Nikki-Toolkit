import { IMAGEKIT_IMAGES, encodeImagePath } from '../utils/imagekit'

export interface HomeWallpaper {
  id: string
  file: string
  label: string
  en: string
}

export const homeWallpapers: readonly HomeWallpaper[] = Array.from({ length: 5 }, (_, index) => {
  const number = index + 1
  return {
    id: 'wallpaper-' + number,
    file: number + '.jpeg',
    label: '壁纸 ' + number,
    en: 'Wallpaper ' + number
  }
})
export const defaultHomeWallpaper = 'wallpaper-1'

export function wallpaperUrl(wallpaper: HomeWallpaper, thumbnail = false) {
  const path = encodeImagePath('wallpapers/' + wallpaper.file)
  return IMAGEKIT_IMAGES + path + '?tr=' + (thumbnail ? 'w-480,f-webp,q-40' : 'f-webp,q-60')
}

export function defaultWallpaperId(): string | null {
  return homeWallpapers.find((item) => item.id === defaultHomeWallpaper)?.id ??
    homeWallpapers[0]?.id ?? null
}
