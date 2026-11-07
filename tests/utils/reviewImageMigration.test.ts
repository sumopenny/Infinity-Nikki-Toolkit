import { expect, it } from 'vitest'
import { optimizedImageKitUrl } from '../../src/utils/imagekit'
import { resolveResourceImage, resourceImage } from '../../src/utils/photo-params/resourceManifest'
import { loadResonanceCatalog } from '../../src/utils/resonance/resonanceCatalog'
import { validateCloudRecords } from '../../src/utils/resonance/cloudSchema'
it('resolves old saved catalog URLs without changing custom URLs', () => {
  const old = 'https://cdn.gongeo.us/images/outfits/10001.png'
  expect(optimizedImageKitUrl(old)).toContain('https://ik.imagekit.io/')
  expect(optimizedImageKitUrl(old)).not.toContain('gongeo')
  expect(optimizedImageKitUrl('https://cdn.gongeo.us/images/items/999999999999.png')).toBe(
    '/catalog-placeholder.svg'
  )
  expect(optimizedImageKitUrl('https://example.com/custom.png?x=1')).toBe(
    'https://example.com/custom.png?x=1'
  )
  expect(
    resolveResourceImage({ kind: 'pose', id: '1', imageUrl: 'https://cdn.gongeo.us/old.png' })
  ).toBe(resourceImage('pose', '1'))
  expect(
    resolveResourceImage({ kind: 'pose', id: '1', imageUrl: 'https://example.com/custom.png' })
  ).toBe('https://example.com/custom.png')
})
it.each([
  ['78', '1020100431'],
  ['79', '1020100455']
])('keeps missing image mappings cloud-syncable: %s', async (bannerId, itemId) => {
  const catalog = await loadResonanceCatalog()
  await catalog.loadResonanceBanners()
  const pulls = catalog.normalizeBannerPulls(bannerId, [['2026-11-07', itemId]])
  const records = catalog.buildResonanceRecords(bannerId, pulls)
  expect(records.length).toBeGreaterThan(0)
  expect(records[0]!.outfitImageUrl).toBe('')
  expect(() => validateCloudRecords(records)).not.toThrow()
})
