import { describe, expect, it } from 'vitest'
import { resourceImage, resourceName } from '../../src/utils/photo-params/resourceManifest'

describe('Nuan5 resource manifest', () => {
  it('resolves a light string ID to the database key and image template', () => {
    expect(resourceName('light', 'DirectionLight_L', 'zh')).toBe('侧光-左')
    expect(resourceImage('light', 'DirectionLight_L')).toBe(
      'https://ik.imagekit.io/nikkicube/images/lights/T_Icon_DirectionLight_L.png?tr=f-webp,q-70'
    )
    expect(resourceImage('light', 1090030005)).toBe(
      'https://ik.imagekit.io/nikkicube/images/lights/T_Icon_DirectionLight_L.png?tr=f-webp,q-70'
    )
  })

  it('resolves a filter string ID to the database key', () => {
    expect(resourceName('filter', 'Fresh_002', 'en')).toBe('Blossoming Pink')
    expect(resourceImage('filter', 'Fresh_002')).toBe(
      'https://ik.imagekit.io/nikkicube/images/filters/T_Icon_Fresh_002.png?tr=f-webp,q-70'
    )
  })

  it('resolves a normal pose name and NikkiGallery image', () => {
    expect(resourceName('pose', 1090012163, 'zh')).toBe('锋芒入定')
    expect(resourceName('pose', '1090012163', 'en')).toBe("Heroine's Poise")
    expect(resourceImage('pose', 1090012163)).toBe(
      'https://ik.imagekit.io/nikkicube/images/poses/T_Icon_S0304_Suit_01.png?tr=f-webp,q-70'
    )
  })

  it('falls back safely for disabled and unknown resources', () => {
    expect(resourceName('light', 'None', 'zh')).toBe('无')
    expect(resourceName('filter', 'new_filter_999', 'en')).toBe('new_filter_999')
    expect(resourceImage('light', 'new_light_999')).toBeUndefined()
    expect(resourceImage('pose', 'new_pose_999')).toBeUndefined()
  })
})
