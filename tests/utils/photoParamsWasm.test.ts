import { createCipheriv, createHash } from 'node:crypto'
// WASM 协议边界测试：验证 CameraParams V1 编解码和展示字段换算，不包含真实照片或用户数据。
import { readFile } from 'node:fs/promises'
import * as loader from '@assemblyscript/loader'
import { beforeAll, describe, expect, it } from 'vitest'

let wasm: Record<string, any>

beforeAll(async () => {
  const module = await loader.instantiate(await readFile('src/assets/photo-params.wasm'), {})
  wasm = module.exports as Record<string, any>
})

function call(name: 'decodeCameraParams' | 'encodeCameraParams', value: string) {
  return JSON.parse(wasm.__getString(wasm[name](wasm.__newString(value))))
}

describe('photo parameter wasm', () => {
  it('encodes and decodes a 31-value camera parameter array', () => {
    const raw = [
      1,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      1,
      2,
      3,
      0,
      0,
      0,
      55,
      2,
      0,
      'DirectionLight_B',
      0.81,
      0.28,
      1.6,
      0.12,
      0.81,
      -0.07,
      1.21,
      -0.3,
      0.1,
      0.09,
      0,
      'Fresh_003',
      0.4
    ]
    const encoded = call('encodeCameraParams', JSON.stringify({ rawArray: raw }))
    expect(encoded.ok).toBe(true)

    const decoded = call('decodeCameraParams', encoded.value)
    expect(decoded.ok).toBe(true)
    expect(decoded.value).toMatchObject({
      version: 'v1',
      arrayLength: 31,
      focalLength: 55,
      aperture: 2,
      apertureValue: 'f/1.4',
      lightId: 'DirectionLight_B',
      lightStrength: 0.81,
      filterId: 'Fresh_003',
      filterStrength: 0.4,
      bloomIntensity: 0.2,
      vibrance: 0.2
    })
    expect(decoded.value.rawArray).toEqual(raw)
  })

  it('rejects non-base64 camera parameters', () => {
    expect(call('decodeCameraParams', 'not camera params')).toEqual({
      ok: false,
      errorCode: 'camera_base64_invalid'
    })
  })

  it('supports the 40-value Momo layout and reverse conversions', () => {
    const raw = [
      1,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      1,
      2,
      3,
      0,
      0,
      0,
      55,
      2,
      0,
      'None',
      0,
      0,
      0,
      0,
      0.3,
      0,
      0.55,
      0,
      0,
      0,
      0,
      'None',
      0,
      1,
      123,
      0.1,
      0.2,
      0.3,
      0.5,
      1,
      0,
      1
    ]
    const model = {
      rawArray: raw,
      brightness: 0.5,
      contrast: 0.25,
      vibrance: 0.4,
      momo: { poseId: 456, horizontal: 80, distance: 120, height: 40, rotation: 90 }
    }
    const encoded = call('encodeCameraParams', JSON.stringify(model))
    const decoded = call('decodeCameraParams', encoded.value)
    expect(decoded.value).toMatchObject({
      version: 'v2',
      arrayLength: 40,
      vibrance: 0.4,
      momo: { enabled: false, poseId: 456, horizontal: 80, distance: 120, height: 40, rotation: 90 }
    })
    expect(decoded.value.brightness).toBeCloseTo(0.5)
    expect(decoded.value.contrast).toBeCloseTo(0.25)
  })

  it('validates IdMap, AdaptiveArray and OptionMap shapes in AssemblyScript', () => {
    const valid = '{"idMap":[:1:{"value":2},"x":[1,2]],"adaptive":{"single":1},"option":{}}'
    expect(wasm.validateNuan5Json(wasm.__newString(valid))).toBe(1)
    expect(wasm.validateNuan5Json(wasm.__newString('{"broken":[:1]}'))).toBe(0)
  })
})

// 构造游戏尾部加密格式，直接验证实际 WASM，而不是模拟解码返回值。
function decodeSyntheticPhoto(
  info: Record<string, unknown>,
  uid = '123456',
  decodeUid = uid,
  cameraRaw?: Array<string | number>,
  extra: Record<string, unknown> = {}
) {
  const raw = [
    1,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    1,
    2,
    3,
    0,
    0,
    0,
    55,
    2,
    0,
    'None',
    0,
    0,
    0,
    0,
    0.3,
    0,
    0.55,
    0,
    0,
    0,
    0,
    'None',
    0
  ]
  const camera = call('encodeCameraParams', JSON.stringify({ rawArray: cameraRaw ?? raw })).value
  const text = JSON.stringify({
    decoy: { nikkiClothes: [999], nikkiDIY: [] },
    ...extra,
    SocialPhoto: { CameraParams: camera, PhotoInfo: info }
  })
  const bytes = Buffer.from(text)
  const padded = Buffer.alloc(Math.ceil((bytes.length + 1) / 16) * 16)
  bytes.copy(padded)
  const key = Buffer.concat([
    createHash('sha1').update(Buffer.from(uid, 'utf16le')).digest(),
    Buffer.from('_PAPER_GAMES')
  ])
  const cipher = createCipheriv('aes-256-ecb', key, null)
  cipher.setAutoPadding(false)
  const encoded = Buffer.concat([cipher.update(padded), cipher.final()]).toString('base64')
  const photo = Buffer.concat([
    Buffer.from([255, 216, 255, 217]),
    Buffer.from(encoded),
    Buffer.from([255, 217])
  ])
  const pointer = wasm.__newArray(Number(wasm.Uint8Array_ID.value), photo)
  return JSON.parse(wasm.__getString(wasm.decodePhoto(pointer, wasm.__newString(decodeUid))))
}

describe('photo dressing in encrypted originals', () => {
  it('associates colors with worn IDs and preserves complete DIY data', () => {
    const diy = [
      {
        TargetClothID: 1020100001,
        TargetGroupID: 2,
        FeatureTag: 6,
        CoreData: {
          TargetColor0: { R: 1, G: 0, B: 0, A: 1 },
          ColorGridID0: 8,
          TargetColor1: { R: 0, G: 0.5, B: 1, A: 1 },
          ColorGridID1: 9,
          RoughnessOffset: 0.4,
          HairColorMode: 2
        }
      },
      {
        TargetClothID: 1020100001,
        TargetGroupID: 3,
        FeatureTag: 10,
        CoreData: { ReplaceTextureID: 42, TilingData: 0.5 }
      }
    ]
    const result = decodeSyntheticPhoto({ nikkiClothes: [1020100001], nikkiDIY: diy, poseId: 55 })
    expect(result.ok).toBe(true)
    expect(result.value.photo.poseId).toBe(55)
    expect(result.value.camera.focalLength).toBe(55)
    expect(result.value.outfit.wearingClothes.map((item: any) => item.itemId)).toEqual([1020100001])
    expect(result.value.outfit.dyeItems[0].dyes).toMatchObject([
      { targetGroupId: 2, color: '#ff0000', paletteId: 1, slot: 8 },
      { targetGroupId: 2, color: '#00bcff', paletteId: 2, slot: 1 }
    ])
    expect(result.value.rawOutfit.nikkiDIY).toEqual(diy)
  })

  it('supports singleton DIY and leaves undyed worn parts available', () => {
    const dye = {
      TargetClothID: 1020200001,
      TargetGroupID: 1,
      FeatureTag: 1,
      CoreData: { R: 0.5, G: 0.5, B: 0.5, A: 1, ColorGridID: -1 }
    }
    const result = decodeSyntheticPhoto({ nikkiClothes: [1020200001, 1020300001], nikkiDIY: dye })
    expect(result.value.outfit.wearingClothes).toHaveLength(2)
    expect(result.value.outfit.dyeItems[0].dyes[0].color).toBe('#bcbcbc')
    expect(result.value.rawOutfit.nikkiDIY).toEqual(dye)
  })

  it('keeps camera parsing valid without dressing and rejects a wrong UID', () => {
    const result = decodeSyntheticPhoto({ poseId: 1 })
    expect(result.ok).toBe(true)
    expect(result.value.outfit).toBeNull()
    expect(result.value.rawOutfit).toBeNull()
    expect(decodeSyntheticPhoto({}, '123456', '654321')).toMatchObject({
      ok: false,
      errorCode: 'photo_structure_invalid'
    })
    expect(
      decodeSyntheticPhoto({ nikkiClothes: [], nikkiDIY: {} }).value.outfit.wearingClothes
    ).toEqual([])
  })
})

function v3Raw(visible = false): Array<string | number> {
  const raw: Array<string | number> = [
    1,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    55,
    2,
    0,
    'None',
    0,
    0,
    0,
    0,
    0.3,
    0,
    0.55,
    0,
    0,
    0,
    0,
    'None',
    0
  ]
  return [
    ...raw,
    ...(visible
      ? [1, 123, 0.1, 0.2, 0.3, 0.5, 1, 0, 1, 456, 0.75, 0, 0.4]
      : [0, '', '', '', '', '', '', '', '', '', '', '', ''])
  ]
}

// Independent encryption fixture prevents encode/decode bugs from masking one another.
function cameraCipher(raw: unknown[]) {
  const key = Buffer.from([
    181, 177, 91, 47, 227, 157, 144, 240, 111, 98, 69, 198, 173, 140, 44, 155, 236, 227, 183, 244,
    95, 80, 65, 80, 69, 82, 95, 71, 65, 77, 69, 83
  ])
  const bytes = Buffer.from(JSON.stringify(raw))
  const padded = Buffer.alloc(Math.ceil(bytes.length / 16) * 16)
  bytes.copy(padded)
  const cipher = createCipheriv('aes-256-ecb', key, null)
  cipher.setAutoPadding(false)
  return Buffer.concat([cipher.update(padded), cipher.final()]).toString('base64')
}

describe('CameraParams V3 compatibility', () => {
  it.each([false, true])('decodes independent 44-value fixture, Momo visible=%s', (visible) => {
    const raw = v3Raw(visible)
    const result = call('decodeCameraParams', cameraCipher(raw))
    expect(result.ok).toBe(true)
    expect(result.value).toMatchObject({ version: 'v3', arrayLength: 44, rawArray: raw })
    expect(result.value.momo.enabled).toBe(!visible)
    expect(result.value.nikkiPoseInfo).toEqual(
      visible ? { poseId: 456, playingPercent: 0.75, inIdle: 0 } : null
    )
    if (visible)
      expect(result.value.momo).toMatchObject({ poseId: 123, poseTime: 0.4, horizontal: 40 })
    const encoded = call('encodeCameraParams', JSON.stringify(result.value))
    expect(encoded.ok).toBe(true)
    expect(call('decodeCameraParams', encoded.value).value.rawArray).toEqual(raw)
  })
  it('preserves an absent animation progress and separates Nikki and Momo edits', () => {
    const raw = v3Raw(true)
    raw[41] = ''
    const result = call('decodeCameraParams', cameraCipher(raw))
    expect(result.value.nikkiPoseInfo.playingPercent).toBeNull()
    const model = {
      ...result.value,
      nikkiPoseInfo: { poseId: 789, playingPercent: null, inIdle: 1 },
      momo: { ...result.value.momo, poseId: 321, poseTime: 0.9, autoGroundSnap: false }
    }
    const encoded = call('encodeCameraParams', JSON.stringify(model))
    const decoded = call('decodeCameraParams', encoded.value).value
    expect(decoded.nikkiPoseInfo).toEqual({ poseId: 789, playingPercent: null, inIdle: 1 })
    expect(decoded.momo).toMatchObject({ poseId: 321, poseTime: 0.9, autoGroundSnap: false })
    expect(decoded.rawArray[41]).toBe('')
  })
  it('still accepts the 32-value hidden Momo layout', () => {
    const raw = v3Raw(false).slice(0, 32)
    expect(call('decodeCameraParams', cameraCipher(raw)).value).toMatchObject({
      version: 'v2',
      arrayLength: 32,
      momo: { enabled: true }
    })
  })
  it('rejects unsupported lengths and malformed visible Momo values', () => {
    expect(call('decodeCameraParams', cameraCipher(v3Raw(false).slice(0, 43))).ok).toBe(false)
    const raw = v3Raw(true)
    raw[33] = ''
    expect(call('decodeCameraParams', cameraCipher(raw)).ok).toBe(false)
    expect(call('encodeCameraParams', JSON.stringify({ rawArray: raw })).ok).toBe(false)
  })
  it('prefers a valid V3 Nikki pose and scopes duplicated fields to SocialPhoto', () => {
    const result = decodeSyntheticPhoto(
      { poseId: 55, cameraFocalLength: 55, nikkiClothes: [1020100001], nikkiDIY: [] },
      '123456',
      '123456',
      v3Raw(true),
      {
        decoy: { poseId: 999, cameraFocalLength: 999, CameraParams: 'wrong' },
        NormalPhotoInfo: {
          PhotoMode: 0,
          WindIntensity: 1,
          WindDirection: 2,
          Time: { hour: 9, min: 8, sec: 7 }
        },
        MultiPlayerHandler: { RoleID: 123, PoseID: '', PosePlayingPercent: '' }
      }
    )
    expect(result.ok).toBe(true)
    expect(result.value.photo).toMatchObject({
      poseId: 456,
      focalLength: 55,
      photoMode: 0,
      windIntensity: 1,
      windDirection: 2,
      captureTime: { hour: 9, minute: 8, second: 7 },
      multiPlayer: { roleId: 123, poseId: null, playingPercent: null }
    })
    expect(result.value.outfit.wearingClothes[0].itemId).toBe(1020100001)
  })
  it('falls back to PhotoInfo pose when V3 has no pose', () => {
    expect(
      decodeSyntheticPhoto({ poseId: 55 }, '123456', '123456', v3Raw(false)).value.photo.poseId
    ).toBe(55)
    expect(
      decodeSyntheticPhoto({ poseId: 0 }, '123456', '123456', v3Raw(false)).value.photo.poseId
    ).toBe(0)
  })
})

it('supports V3 Momo visibility changes and explicitly cleared optional pose data', () => {
  const decoded = call('decodeCameraParams', cameraCipher(v3Raw(true))).value
  const hidden = call(
    'encodeCameraParams',
    JSON.stringify({ ...decoded, momo: { enabled: true }, nikkiPoseInfo: null })
  )
  expect(call('decodeCameraParams', hidden.value).value.rawArray.slice(31)).toEqual([
    0,
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    ''
  ])
  const cleared = call(
    'encodeCameraParams',
    JSON.stringify({
      ...decoded,
      nikkiPoseInfo: { ...decoded.nikkiPoseInfo, playingPercent: null }
    })
  )
  expect(call('decodeCameraParams', cleared.value).value.rawArray[41]).toBe('')
  const shown = call(
    'encodeCameraParams',
    JSON.stringify({ rawArray: v3Raw(false), momo: { enabled: false, poseId: 123, poseTime: 0.5 } })
  )
  expect(call('decodeCameraParams', shown.value).value.momo).toMatchObject({
    enabled: false,
    poseId: 123,
    poseTime: 0.5
  })
})

it('calculates zoom from all three photo position coordinates and preserves missing data', () => {
  const photo = {
    nikkiLocX: 300,
    nikkiLocY: 400,
    nikkiLocZ: 0,
    cameraActorLocX: 0,
    cameraActorLocY: 0,
    cameraActorLocZ: 0
  }
  expect(decodeSyntheticPhoto(photo).value.photo.zoom).toBeCloseTo(4.7)
  expect(
    decodeSyntheticPhoto({ ...photo, nikkiLocX: 0, nikkiLocY: 0 }).value.photo.zoom
  ).toBeCloseTo(6.45)
  expect(decodeSyntheticPhoto({ nikkiLocX: 300 }).value.photo.zoom).toBeNull()
})
