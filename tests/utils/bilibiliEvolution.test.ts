import { describe, expect, it } from 'vitest'
import { parseBilibiliEvolution, validateEvolutionParts } from '../../src/utils/bilibiliEvolution'
const part = {
  page: 1,
  cid: 123456,
  part: '【3.0限定共鸣】 于此重见繁星-满进动画',
  duration: 45,
  first_frame: 'http://i2.hdslb.com/frame.jpg'
}
const body = (pages: unknown[]) => ({ code: 0, data: { pages } })
describe('Bilibili evolution list', () => {
  it('reads a new version without an entry in the bundled catalog', () => {
    const [row] = parseBilibiliEvolution(
      body([{ ...part, part: '【3.12奇迹套装】 新套装-满进动画' }])
    )
    expect(row).toMatchObject({
      version: '3.12',
      name: '新套装',
      source: '奇迹套装',
      cid: '123456',
      thumbnail: 'https://i2.hdslb.com/frame.jpg'
    })
  })
  it('ignores unrelated parts and rejects unsafe thumbnails', () => {
    expect(
      parseBilibiliEvolution(
        body([
          { ...part, first_frame: 'javascript:alert(1)' },
          { ...part, part: '预告' }
        ])
      )
    ).toEqual([expect.objectContaining({ thumbnail: '' })])
  })
  it.each([
    { code: -412 },
    body([]),
    body([{ ...part, part: '预告' }]),
    body([part, part]),
    body([{ ...part, cid: null }]),
    body([{ ...part, duration: -1 }])
  ])('rejects invalid or empty upstream results', (value) => {
    expect(() => parseBilibiliEvolution(value)).toThrow()
  })
  it('rejects a malformed API response before replacing a working list', () => {
    expect(() => validateEvolutionParts([{ name: 'Broken' }])).toThrow()
  })
})
