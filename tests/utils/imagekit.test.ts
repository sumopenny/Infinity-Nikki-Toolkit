import { describe, expect, it } from 'vitest'
import { getCatalogImageSource } from '../../src/utils/gongeo/catalogImage'
import { resourceImage } from '../../src/utils/photo-params/resourceManifest'
import { optimizedImageKitUrl } from '../../src/utils/imagekit'
import { onRequestGet } from '../../functions/api/share-image'

describe('ImageKit resource migration', () => {
  it('uses game filenames, the correct accounts, and WebP q70', () => {
    expect(getCatalogImageSource('outfit', 10001)).toBe(
      'https://ik.imagekit.io/nikkicube/images/outfits/T_showpic_suit_S0001.png?tr=f-webp,q-70'
    )
    expect(getCatalogImageSource('icon', 1020100001)).toBe(
      'https://ik.imagekit.io/nikkicube/images/IconClothes/T_Icon_clothes_S0001H.png?tr=f-webp,q-70'
    )
    expect(getCatalogImageSource('item', 1020100001)).toContain(
      'https://ik.imagekit.io/nikkicubeassets/images/itemDetails/'
    )
    expect(getCatalogImageSource('makeup', 10001001)).toBe(
      'https://ik.imagekit.io/nikkicubeassets/images/itemDetails/T_showpic_clothes_S0001FU.png?tr=f-webp,q-70'
    )
    expect(getCatalogImageSource('item', '_excludedImages')).toBe('/catalog-placeholder.svg')
    expect(getCatalogImageSource('outfit', 999999999)).toBe('/catalog-placeholder.svg')
  })
  it('resolves duo roles and Momo paths without encoding slashes', () => {
    expect(resourceImage('pose', 13400200020)).toBe(
      'https://ik.imagekit.io/nikkicube/images/poses/T_Icon_Performance_002_Host.png?tr=f-webp,q-70'
    )
    expect(resourceImage('pose', 1090050002)).toBe(
      'https://ik.imagekit.io/nikkicube/images/momo-poses/T_Icon_Trends_damiao_002.png?tr=f-webp,q-70'
    )
    expect(resourceImage('pose', 1340020002)).toBe(
      'https://ik.imagekit.io/nikkicube/images/poses/T_Icon_Performance_002.png?tr=f-webp,q-70'
    )
  })
  it('normalizes ImageKit delivery quality', () => {
    expect(
      optimizedImageKitUrl('https://ik.imagekit.io/nikkicube/images/poses/test.png?tr=q-90')
    ).toContain('?tr=f-webp,q-70')
  })
  it('rejects unlisted proxy requests', async () => {
    for (const resource of [
      'https://ik.imagekit.io/other/images/a.png?tr=f-webp,q-70',
      'https://ik.imagekit.io/nikkicube/images/poses/unknown.png?tr=f-webp,q-70'
    ]) {
      expect(
        (
          await onRequestGet({
            request: new Request(
              'https://local/api/share-image?resource=' + encodeURIComponent(resource)
            )
          })
        ).status
      ).toBe(400)
    }
  })
})
