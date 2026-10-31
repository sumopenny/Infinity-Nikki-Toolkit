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
