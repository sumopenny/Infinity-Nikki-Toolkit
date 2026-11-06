import type { PhotoParamsResult } from './types'
import { optimizedImageKitUrl } from '../imagekit'

type Resource = PhotoParamsResult['resourceGroups'][number]
const missing = new Set(['', '无', 'none', 'null', 'undefined', '--', '—', '0'])

/** 仅保留有效的动作、灯光和滤镜资源。 */
export function favoriteResources(result: PhotoParamsResult): Resource[] {
  const groups = Array.isArray(result?.resourceGroups) ? result.resourceGroups : []
  return groups
    .flatMap((group) => {
      if (!group || typeof group.title !== 'string' || typeof group.name !== 'string') return []
      const kind = group.kind
      if (!kind || !['pose', 'light', 'filter'].includes(kind)) return []
      const hasId = group.id != null && !missing.has(String(group.id).trim().toLowerCase())
      const hasName = !missing.has(group.name.trim().toLowerCase())
      if (!hasId && !hasName && !group.imageUrl) return []
      return [
        { ...group, kind, imageUrl: group.imageUrl ? optimizedImageKitUrl(group.imageUrl) : undefined }
      ]
    })
    .sort(
      (a, b) =>
        ['pose', 'light', 'filter'].indexOf(a.kind) - ['pose', 'light', 'filter'].indexOf(b.kind)
    )
}
