import { afterEach, expect, it, vi } from 'vitest'
import outfits from '../../src/data/gongeo/outfits.json'
import items from '../../src/data/gongeo/items.json'
import makeups from '../../src/data/gongeo/makeups.json'
import makeupItems from '../../src/data/gongeo/makeupItems.json'
import photo from '../../src/data/photo/photoResourceCatalog.json'
import { getCatalogImageSource, getCatalogRecordImage } from '../../src/utils/gongeo/catalogImage'
import { resourceImage } from '../../src/utils/photo-params/resourceManifest'
import { onRequestGet } from '../../functions/api/share-image'
const ids = (rows: unknown[][]) => [
  ...new Set(rows.flatMap((row) => (Array.isArray(row[0]) ? row[0] : [row[0]])).map(String))
]
afterEach(() => vi.unstubAllGlobals())
it.each([
  ['1020100121', 'T_Icon_clothes_S0121H.png'],
  ['1022300276', 'T_Icon_clothes_S0276T_LV1.png']
])('uses the restored atlas icon filename for catalog item %s', (id, filename) => {
  expect(getCatalogImageSource('icon', id)).toBe(
    `https://ik.imagekit.io/nikkicube/images/IconClothes/${filename}?tr=f-webp,q-70`
  )
})
it.each([
  ['10029', 'T_showpic_suit_S0029.png'],
  ['20057', 'T_showpic_suit_SL0057.png']
])('uses the suit-table image reference for outfit %s', (id, filename) => {
  expect(getCatalogImageSource('outfit', id)).toBe(
    `https://ik.imagekit.io/nikkicube/images/outfits/${filename}?tr=f-webp,q-70`
  )
})
it('configures a usable image path for every published outfit, item and makeup', () => {
  for (const id of ids(outfits))
    expect(getCatalogImageSource('outfit', id), id).toMatch(/^https:\/\//)
  for (const id of ids([
    ...items,
    ...makeups.filter((row) => Number(row[2]) >= 1 && Number(row[2]) <= 5)
  ])) {
    expect(getCatalogImageSource('item', id), id).toMatch(/^https:\/\//)
    expect(getCatalogImageSource('icon', id), id).toMatch(/^https:\/\//)
  }
  for (const id of ids(makeupItems))
    expect(getCatalogImageSource('makeup', id), id).toMatch(/^https:\/\//)
  expect(getCatalogRecordImage('outfit', '999999999999')).toBe('')
})
it('configures image fields and template URLs for every photo resource', () => {
  for (const kind of ['pose', 'light', 'filter'] as const)
    for (const entry of photo.resources[kind]) {
      expect(entry.image, entry.key).toBeTruthy()
      const url = resourceImage(kind, entry.key)!
      expect(url, entry.key).toMatch(/^https:\/\/ik.imagekit.io\//)
      expect(url).not.toMatch(/undefined|null|\{\}/)
      expect(url).toContain('tr=f-webp,q-70')
    }
})
it('allows planned images through the share API, including after an earlier unavailable response', async () => {
  const url = resourceImage('pose', '1340020002')!
  const request = () =>
    new Request('https://local/api/share-image?resource=' + encodeURIComponent(url))
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(new Response(null, { status: 404 }))
    .mockResolvedValueOnce(
      new Response(new Uint8Array([137, 80, 78, 71]), { headers: { 'content-type': 'image/png' } })
    )
  vi.stubGlobal('fetch', fetcher)
  const missing = await onRequestGet({ request: request() })
  expect(missing.status).toBe(502)
  expect(missing.headers.get('cache-control')).toBe('no-store')
  const ready = await onRequestGet({ request: request() })
  expect(ready.status).toBe(200)
  expect(fetcher).toHaveBeenCalledTimes(2)
  expect(fetcher.mock.calls[1]![0]).toBe(url)
})
