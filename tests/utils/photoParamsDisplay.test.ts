import { readFile } from 'node:fs/promises'
import * as loader from '@assemblyscript/loader'
import { describe, it, expect } from 'vitest'
import { formatCameraParams } from '../../src/utils/photo-params/formatCameraParams'
import { weatherWithWind } from '../../src/utils/photo-params/weather'
import { photoParamsZh } from '../../src/i18n/messages/photoParams'

describe('new photo parameter display', () => {
  const render = (progress: number | null, photo: Record<string, unknown> = {}) =>
    formatCameraParams(
      { nikkiPoseInfo: { poseId: 123, playingPercent: progress } },
      '',
      'zh',
      photoParamsZh,
      { poseId: 123, focalLength: 55, ...photo }
    )
  it('places zoom immediately after focal length and keeps aperture', () => {
    const result = render(null, { zoom: 3.24 })
    expect(result.cameraFields.slice(0, 3).map((x) => [x.label, x.value])).toEqual([
      ['焦距', '55mm'],
      ['缩放', '3.2×'],
      ['光圈', '无']
    ])
    expect(render(null).cameraFields[1].value).toBe('无')
  })
  it.each([
    [0, '0%'],
    [0.75, '75%'],
    [null, undefined],
    [NaN, undefined]
  ] as const)('renders action progress %s', (progress, value) => {
    expect(render(progress).resourceGroups.find((x) => x.kind === 'pose')?.value).toBe(value)
  })
  it('does not attach progress to a different fallback action', () => {
    expect(
      render(0.75, { poseId: 456 }).resourceGroups.find((x) => x.kind === 'pose')?.value
    ).toBeUndefined()
  })
  it('displays the action and progress from a real standalone V3 parameter string', async () => {
    const raw =
      '8ASm5DmvOQ7TBFAgDS3WUAWOLgRf5NT+TwL63v1D21peoFUVKX7ER8aT0UYeFnML9C/y4wN8K53p6vTMBCmyojK9TlrVA1jXQMXpx/G50huXYStn+ABnWTsjpIT8sxszOEK7O22eKsh75Y+CRxlNazHTb2OCzybyU7BxaVz+TApVP6AXgGXlaD2o8loV/YGYYirISHiDl8Kgfsp5OLu1Hh/WGDblH5ek8VglYp/C/tPwLmtNGhnOkrM0v2XIl+61sHU63kbD6cxlKVaORgIi3Nm/ei/Y6iZuKLO6nIm0wg0='
    const module = await loader.instantiate(await readFile('src/assets/photo-params.wasm'), {})
    const wasm = module.exports as Record<string, any>
    const decoded = JSON.parse(wasm.__getString(wasm.decodeCameraParams(wasm.__newString(raw))))
    expect(decoded.ok).toBe(true)
    const result = formatCameraParams(decoded.value, raw, 'zh', photoParamsZh)
    const pose = result.resourceGroups.find((group) => group.kind === 'pose')
    expect(pose).toMatchObject({ id: '1090012182', name: '玫瑰的邀约', value: '62%' })
    expect(pose?.imageUrl).toBeTruthy()
    expect(result.rawCameraParams).toBe(raw)
  })
  it.each([
    [0, '0%'],
    [null, undefined],
    [undefined, undefined],
    [NaN, undefined]
  ] as const)('handles standalone action progress %s', (progress, value) => {
    const result = formatCameraParams(
      { nikkiPoseInfo: { poseId: 1090012182, playingPercent: progress } },
      '',
      'zh',
      photoParamsZh
    )
    expect(result.resourceGroups.find((group) => group.kind === 'pose')).toMatchObject({
      id: '1090012182',
      value
    })
  })
  it.each([undefined, null, {}, { poseId: 0 }, { poseId: -1 }, { poseId: NaN }])(
    'omits standalone actions without a valid pose: %j',
    (nikkiPoseInfo) => {
      const result = formatCameraParams({ nikkiPoseInfo }, '', 'zh', photoParamsZh)
      expect(result.resourceGroups.map((group) => group.kind)).toEqual(['light', 'filter'])
    }
  )
  it('appends mapped wind to the existing weather name', () => {
    expect(
      render(null, { weatherType: 0, windIntensity: 1, windDirection: 1 }).environmentFields
    ).toEqual([{ label: '天气', value: '晴天 小风 南风' }])
    expect(weatherWithWind({ weatherType: 0 }, 'zh')).toBe('晴天')
    expect(weatherWithWind({ windIntensity: 0, windDirection: 8 }, 'zh')).toBe('无风 无')
    expect(weatherWithWind({ windIntensity: null, windDirection: null }, 'zh')).toBe('')
    expect(weatherWithWind({ windIntensity: -1, windDirection: 99 }, 'zh')).toBe('未知 未知')
  })
  it('maps every upstream wind enum in order', () => {
    expect(
      [0, 1, 2, 3, 4].map((windIntensity) => weatherWithWind({ windIntensity }, 'zh'))
    ).toEqual(['无风', '小风', '中风', '大风', '特大风'])
    expect(
      [0, 1, 2, 3, 4, 5, 6, 7, 8].map((windDirection) => weatherWithWind({ windDirection }, 'zh'))
    ).toEqual(['东风', '南风', '西风', '北风', '东南风', '西南风', '东北风', '西北风', '无'])
    expect(weatherWithWind({ weatherType: 0, windIntensity: 1, windDirection: 1 }, 'en')).toBe(
      'Sunny, Light wind, South'
    )
  })
})
