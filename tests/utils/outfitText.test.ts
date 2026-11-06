import { describe, expect, it, vi, afterEach } from 'vitest'
import { loadOutfitText } from '../../src/utils/outfit/outfitText'
import zhDescriptions from '../../src/data/outfits/locales/zh/outfitDescriptions.json'
import enDescriptions from '../../src/data/outfits/locales/en/outfitDescriptions.json'
afterEach(() => vi.unstubAllGlobals())
describe('local outfit text', () => {
  it('uses GitHub names and extracted bilingual descriptions without any fetch', async () => {
    const fetcher = vi.fn(() => {
      throw new Error('Unexpected network')
    })
    vi.stubGlobal('fetch', fetcher)
    expect(await loadOutfitText('10001', 'zh')).toMatchObject({
      id: 10001,
      name: '绽响黎明前',
      description: zhDescriptions['10001'].description
    })
    expect(await loadOutfitText('10001', 'en')).toMatchObject({
      description: enDescriptions['10001'].description
    })
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('keeps missing descriptions empty without substituting another suit', async () => {
    expect(await loadOutfitText('10347', 'zh')).toMatchObject({
      name: '如果爱上一朵花',
      description: ''
    })
    expect(await loadOutfitText('99999999', 'zh')).toEqual({
      id: 99999999,
      name: undefined,
      description: ''
    })
  })
  it('rejects invalid IDs and supports independently cancelled readers', async () => {
    await expect(loadOutfitText('/items/1', 'zh')).rejects.toThrow()
    const controller = new AbortController()
    const pending = loadOutfitText('10001', 'zh', controller.signal)
    controller.abort()
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    expect((await loadOutfitText('10001', 'zh')).id).toBe(10001)
  })
})
