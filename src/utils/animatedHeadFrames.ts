import type { AvatarPhotoCrop } from './avatarSimulator'
import entries from '../data/profile/headFrames.json'
import { IMAGEKIT_IMAGES, encodeImagePath } from './imagekit'
import { avatarPadding, avatarSize } from './avatarSimulator'

export interface AnimatedHeadFrame {
  json: string
  atlas: string
  defaultAnimation: string
  textures: string[]
  artboardSize: number
  /** 原画板左下角；旧资源默认 (0, -artboardSize)，3.0 部分资源为 (0, 0)。 */
  artboardOrigin?: { x: number; y: number }
  photoCrop?: AvatarPhotoCrop
}

export interface HeadFrame {
  image: string
  animation?: AnimatedHeadFrame
}
export const headFrames: Readonly<Record<string, HeadFrame>> = entries
export function headFrameViewport(frame: AnimatedHeadFrame) {
  const padding = (frame.artboardSize * avatarPadding) / avatarSize
  return {
    x: (frame.artboardOrigin?.x ?? 0) - padding,
    y: (frame.artboardOrigin?.y ?? -frame.artboardSize) - padding,
    width: frame.artboardSize + 2 * padding,
    height: frame.artboardSize + 2 * padding,
    padLeft: 0,
    padRight: 0,
    padTop: 0,
    padBottom: 0,
    transitionTime: 0
  }
}
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
