import type { AvatarPhotoCrop } from './avatarSimulator'
import entries from '../data/profile/headFrames.json'
import { IMAGEKIT_IMAGES, encodeImagePath } from './imagekit'

export interface AnimatedHeadFrame {
  json: string
  atlas: string
  defaultAnimation: string
  textures: string[]
  artboardSize: number
  photoCrop?: AvatarPhotoCrop
}

export interface HeadFrame {
  image: string
  animation?: AnimatedHeadFrame
}
export const headFrames: Readonly<Record<string, HeadFrame>> = entries
/** 保持 atlas 中的纹理名称，以 URL 映射强制加载 WebP，兼容多纹理图集。 */
export function headFramePlayerAssets(frame: AnimatedHeadFrame) {
  const url = (file: string) => IMAGEKIT_IMAGES + 'headframes/' + encodeImagePath(file)
  return {
    jsonUrl: url(frame.json),
    atlasUrl: url(frame.atlas),
    rawDataURIs: Object.fromEntries(
      frame.textures.map((file) => [url(file), url(file) + '?tr=f-webp'])
    )
  }
}
