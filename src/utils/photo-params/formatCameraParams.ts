import type { Language } from '../../i18n'
import type { PhotoParamsMessages } from '../../i18n/messages/photoParams'
import type { PhotoParamsResult } from './types'
import { resourceImage, resourceName } from './resourceManifest'
import {
  PHOTO_PARAM_RANGES,
  photoFocalLengthDisplay,
  rawFocalLengthDisplay,
  sliderPercent
} from './slider'
import { weatherWithWind } from './weather'

export function formatCameraParams(
  camera: Record<string, unknown>,
  rawCameraParams: string,
  language: Language,
  messages: PhotoParamsMessages,
  photoData?: Record<string, unknown>
): PhotoParamsResult {
  const formatNumber = (value: unknown, digits: number) => {
    const parsed = Number(value)
    if (!Number.isFinite(parsed)) return messages.noValue
    return parsed.toFixed(digits)
  }
  const formatPercent = (value: unknown) => {
    const parsed = Number(value)
    if (!Number.isFinite(parsed)) return messages.noValue
    return `${Math.round(parsed * 100)}%`
  }
  const preferred = (key: string) => String(photoData?.[key] ?? camera[key] ?? messages.noValue)
  const display = (key: string, source: Record<string, unknown> = camera) => {
    const value = source[key]
    if (value == null) return messages.noValue
    if (['bloomIntensity', 'brightness', 'contrast'].includes(key)) return formatPercent(value)
    return formatNumber(value, 1)
  }
  const number = (key: string, source: Record<string, unknown> = camera) => Number(source[key])
  const focal =
    photoData?.focalLength != null
      ? photoFocalLengthDisplay(photoData.focalLength)
      : rawFocalLengthDisplay(camera.focalLength)
  const weather = weatherWithWind(photoData, language)
  const zoom =
    typeof photoData?.zoom === 'number' && Number.isFinite(photoData.zoom) ? photoData.zoom : null
  const nikkiPose = camera.nikkiPoseInfo as
    { poseId?: number; playingPercent?: number | null } | null | undefined
  const captureTime = photoData?.captureTime as
    { hour?: number; minute?: number; second?: number } | undefined
  const pad = (value: unknown) =>
    String(Math.max(0, Math.floor(Number(value) || 0))).padStart(2, '0')
  const light = (photoData?.light ??
    camera.light ?? {
      id: photoData?.lightId ?? camera.lightId,
      strength: photoData?.lightStrength ?? camera.lightStrength
    }) as { id?: string; strength?: number } | undefined
  const filter = (photoData?.filter ??
    camera.filter ?? {
      id: photoData?.filterId ?? camera.filterId,
      strength: photoData?.filterStrength ?? camera.filterStrength
    }) as { id?: string; strength?: number } | undefined
  const resourceId = (resource: { id?: string } | undefined) => {
    const id = String(resource?.id ?? '').trim()
    return id && id !== 'None' ? id : undefined
  }
  const lightId = resourceId(light)
  const filterId = resourceId(filter)
  const poseId = photoData?.poseId as string | number | undefined
  // 2026-10-11：仅照片解析展示角色动作；纯相机参数不含动作，所有解析结果均不展示大喵动作。
  const resources: PhotoParamsResult['resourceGroups'] = []
  if (photoData) {
    resources.push({
      kind: 'pose',
      id:
        poseId == null || String(poseId) === '0' || String(poseId) === 'None'
          ? undefined
          : String(poseId),
      title: messages.action,
      name: poseId == null ? messages.noValue : resourceName('pose', poseId, language),
      value:
        nikkiPose?.playingPercent != null &&
        Number.isFinite(nikkiPose.playingPercent) &&
        String(nikkiPose.poseId) === String(poseId)
          ? formatPercent(nikkiPose.playingPercent)
          : undefined,
      imageUrl: poseId == null ? undefined : resourceImage('pose', poseId)
    })
  }
  resources.push(
    {
      kind: 'light',
      id: lightId,
      title: messages.light,
      name: lightId ? resourceName('light', lightId, language) : messages.noValue,
      value: lightId ? formatPercent(light?.strength) : undefined,
      imageUrl: lightId ? resourceImage('light', lightId) : undefined
    },
    {
      kind: 'filter',
      id: filterId,
      title: messages.filter,
      name: filterId ? resourceName('filter', filterId, language) : messages.noValue,
      value: filterId ? formatPercent(filter?.strength) : undefined,
      imageUrl: filterId ? resourceImage('filter', filterId) : undefined
    }
  )
  return {
    environmentFields:
      captureTime || weather
        ? [
            ...(captureTime
              ? [
                  {
                    label: messages.labels.gameTime,
                    value: `${pad(captureTime.hour)}:${pad(captureTime.minute)}:${pad(captureTime.second)}`
                  }
                ]
              : []),
            ...(weather
              ? [
                  {
                    label: messages.labels.weather,
                    value: weather
                  }
                ]
              : [])
          ]
        : [],
    cameraFields: [
      {
        label: messages.labels.focalLength,
        value: focal ? `${formatNumber(focal.millimeters, 0)}mm` : messages.noValue,
        position: focal?.position
      },
      {
        label: messages.labels.zoom,
        value: zoom == null ? messages.noValue : `${zoom.toFixed(1)}×`,
        static: true
      },
      {
        label: messages.labels.aperture,
        value: preferred('apertureValue'),
        position: sliderPercent(
          number('aperture', photoData ?? camera),
          PHOTO_PARAM_RANGES.aperture
        )
      },
      {
        label: messages.labels.vignette,
        value: formatPercent((photoData ?? camera).vignette),
        position: sliderPercent(number('vignette', photoData ?? camera), PHOTO_PARAM_RANGES.unit)
      }
    ],
    imageFields: [
      { key: 'bloomIntensity' as const, range: PHOTO_PARAM_RANGES.unit, format: 'percent' },
      { key: 'bloomRange' as const, range: PHOTO_PARAM_RANGES.signed, format: 'number' },
      { key: 'brightness' as const, range: PHOTO_PARAM_RANGES.unit, format: 'percent' },
      { key: 'exposure' as const, range: PHOTO_PARAM_RANGES.signed, format: 'number' },
      { key: 'contrast' as const, range: PHOTO_PARAM_RANGES.unit, format: 'percent' },
      { key: 'saturation' as const, range: PHOTO_PARAM_RANGES.signed, format: 'number' },
      { key: 'vibrance' as const, range: PHOTO_PARAM_RANGES.signed, format: 'number' },
      { key: 'highlights' as const, range: PHOTO_PARAM_RANGES.signed, format: 'number' },
      { key: 'shadows' as const, range: PHOTO_PARAM_RANGES.signed, format: 'number' }
    ].map(({ key, range, format }) => ({
      label: messages.labels.imageFields[key],
      value: format === 'percent' ? formatPercent(camera[key]) : display(key),
      position: sliderPercent(camera[key], range)
    })),
    resourceGroups: resources,
    rawCameraParams
  }
}
