import { readPhotoFile } from '../photoGrouping'
import type { PhotoItem, PhotoActionInfo } from '../photoGrouping'
import { decodePhoto } from './wasmClient'
import { PHOTO_ACTION_CATALOG_VERSION, resourceImage, resourceName } from './resourceManifest'

export const PHOTO_ACTION_PARSER_VERSION = 'v2'

type DecodedPhoto = { photo?: Record<string, unknown> }

export function photoActionFingerprint(albumKey: string, photo: PhotoItem): string {
  return `${albumKey}|${photo.name}|${photo.fileSize ?? ''}|${photo.lastModified ?? ''}|${PHOTO_ACTION_PARSER_VERSION}|${PHOTO_ACTION_CATALOG_VERSION}`
}

export async function parsePhotoAction(
  photo: PhotoItem,
  candidateUids: string[],
  language: 'zh' | 'en'
): Promise<PhotoActionInfo> {
  try {
    const bytes = new Uint8Array(await (await readPhotoFile(photo)).arrayBuffer())
    const errors: string[] = []
    for (const uid of candidateUids) {
      const decoded = await decodePhoto<
        DecodedPhoto & { rawCameraParams?: string; camera?: Record<string, unknown> }
      >(bytes, uid)
      if (!decoded.ok || !decoded.value) {
        if (decoded.errorCode && !errors.includes(decoded.errorCode)) errors.push(decoded.errorCode)
        continue
      }
      const poseId = decoded.value.photo?.poseId
      if (
        poseId == null ||
        String(poseId).trim() === '' ||
        String(poseId) === '0' ||
        String(poseId) === 'None'
      ) {
        return { status: 'none', errorCode: undefined, parsedAt: Date.now() }
      }
      const actionId = String(poseId)
      return {
        status: 'action',
        actionId,
        actionName: resourceName('pose', actionId, language),
        actionImageUrl: resourceImage('pose', actionId),
        parsedAt: Date.now()
      }
    }
    return { status: 'unparsed', errorCode: errors[0], parsedAt: Date.now() }
  } catch (error) {
    return {
      status: 'unparsed',
      errorCode: error instanceof Error ? error.name : 'parse_failed',
      parsedAt: Date.now()
    }
  }
}
