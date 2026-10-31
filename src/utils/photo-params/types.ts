import type { LookbookDecodeResult } from '../outfit/outfitCodeParser'

export type PhotoParamsStage =
  | 'idle'
  | 'resolvingUid'
  | 'readingPhoto'
  | 'loadingWasm'
  | 'decryptingPhoto'
  | 'parsingCamera'
  | 'ready'
  | 'error'

export interface PhotoParamsProgress {
  stage: PhotoParamsStage
  percent: number
  message: string
}

export interface PhotoParamsResult {
  outfit?: LookbookDecodeResult | null
  rawOutfit?: { nikkiClothes: number[]; nikkiDIY: unknown } | null
  environmentFields: Array<{ label: string; value: string }>
  cameraFields: Array<{ label: string; value: string; position?: number; static?: boolean }>
  imageFields: Array<{ label: string; value: string; position?: number }>
  resourceGroups: Array<{
    title: string
    name: string
    value?: string
    imageUrl?: string
    kind: 'pose' | 'light' | 'filter'
    id?: string
  }>
  rawCameraParams: string
}
