import { readCompatibleAlbum } from '../../src/utils/file-system/compatibleAlbum'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { computed, effectScope, ref } from 'vue'
import { flushPromises } from '@vue/test-utils'
import { usePhotoParams } from '../../src/composables/usePhotoParams'
import { photoParamsZh, photoParamsEn } from '../../src/i18n/messages/photoParams'
import {
  getSavedX6GameDirectoryHandle,
  getSavedCameraParamUids,
  addSavedCameraParamUid
} from '../../src/utils/file-system/directoryStorage'
import { decodePhoto, decodeCameraParams } from '../../src/utils/photo-params/wasmClient'
import { reportError } from '../../src/utils/errorReporting/errorReporter'
vi.mock('../../src/utils/errorReporting/errorReporter', () => ({ reportError: vi.fn() }))
vi.mock('../../src/utils/file-system/directoryStorage', () => ({
  getSavedX6GameDirectoryHandle: vi.fn(),
  getSavedCameraParamUids: vi.fn(),
  addSavedCameraParamUid: vi.fn()
}))
vi.mock('../../src/utils/file-system/directoryAccess', () => ({
  listGamePlayPhotoAccounts: vi.fn(async () => [])
}))
vi.mock('../../src/utils/photo-params/wasmClient', () => ({
  decodePhoto: vi.fn(),
  decodeCameraParams: vi.fn()
}))
let scope: ReturnType<typeof effectScope>
function setup() {
  scope = effectScope()
  return scope.run(() =>
    usePhotoParams({ language: ref('zh'), messages: computed(() => photoParamsZh) })
  )!
}
const file = () => ({ name: 'photo.jpg', arrayBuffer: async () => new ArrayBuffer(1) }) as File
beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(getSavedX6GameDirectoryHandle).mockResolvedValue(null)
  vi.mocked(getSavedCameraParamUids).mockResolvedValue([])
})
afterEach(() => scope.stop())
it('reuses the first read for UID retries when the mobile file becomes unreadable', async () => {
  const state = setup()
  const bytes = new Uint8Array([10, 20, 30])
  const read = vi
    .fn()
    .mockResolvedValueOnce(bytes.buffer)
    .mockRejectedValue(new DOMException('File no longer readable', 'NotReadableError'))
  await state.openForFile({ name: 'mobile.jpg', arrayBuffer: read } as unknown as File)
  expect(state.uidRequired.value).toBe(true)
  vi.mocked(decodePhoto).mockResolvedValue({ ok: false, errorCode: 'photo_structure_invalid' })
  await state.submitUid('123456')
  await state.submitUid('654321')
  expect(read).toHaveBeenCalledTimes(1)
  expect(decodePhoto).toHaveBeenLastCalledWith(bytes, '654321')
  const shareSource = await state.loadSourcePhoto()
  expect(new Uint8Array(await shareSource.arrayBuffer())).toEqual(bytes)
  expect(read).toHaveBeenCalledTimes(1)
  state.close()
  await state.openForFile(file())
  await state.submitUid('123456')
  expect(decodePhoto).toHaveBeenLastCalledWith(new Uint8Array(1), '123456')
})
it('retains structured codes while translating the same failure after a language switch', async () => {
  const language = ref<'zh' | 'en'>('zh')
  scope = effectScope()
  const state = scope.run(() =>
    usePhotoParams({
      language,
      messages: computed(() => (language.value === 'zh' ? photoParamsZh : photoParamsEn))
    })
  )!
  vi.mocked(getSavedCameraParamUids).mockResolvedValue(['123456'])
  vi.mocked(decodePhoto).mockResolvedValue({ ok: false, errorCode: 'base64_invalid' })
  await state.openForFile(file())
  expect(state.errorCodes.value).toEqual(['base64_invalid'])
  expect(state.error.value).toContain('错误码：base64_invalid')
  expect(reportError).not.toHaveBeenCalled()
  language.value = 'en'
  expect(state.error.value).toContain('Error code: base64_invalid')
  expect(state.errorCodes.value).toEqual(['base64_invalid'])
  state.close()
  expect(state.errorCodes.value).toEqual([])
  expect(state.error.value).toBeNull()
})
it('uses structured errors for manual UID retry and raw camera parsing', async () => {
  const state = setup()
  await state.openForFile(file())
  expect(state.errorCodes.value).toEqual(['photo_structure_invalid'])
  vi.mocked(decodePhoto).mockResolvedValue({
    ok: false,
    errorCode: 'jpeg_second_end_marker_missing'
  })
  await state.submitUid('123456')
  expect(state.errorCodes.value).toEqual(['jpeg_second_end_marker_missing'])
  state.openCameraParamsTool()
  vi.mocked(decodeCameraParams).mockResolvedValue({ ok: false, errorCode: 'camera_base64_invalid' })
  await state.parseRawCameraParams('invalid')
  expect(state.errorCodes.value).toEqual(['camera_base64_invalid'])
})
it('does not request UID or change progress after an old directory lookup completes', async () => {
  let finish!: (value: null) => void
  vi.mocked(getSavedX6GameDirectoryHandle).mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve
    })
  )
  const state = setup()
  const task = state.openForFile(file())
  await flushPromises()
  state.openCameraParamsTool()
  finish(null)
  await task
  expect(state.uidRequired.value).toBe(false)
  expect(state.error.value).toBeNull()
  expect(state.progress.value.stage).toBe('idle')
})
it.each(['switch', 'close', 'dispose'])(
  'drops decoded results when UID saving finishes after %s',
  async (action) => {
    const state = setup()
    await state.openForFile(file())
    let finish!: () => void
    vi.mocked(addSavedCameraParamUid).mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve
      })
    )
    vi.mocked(decodePhoto).mockResolvedValue({
      ok: true,
      value: { camera: {}, photo: {}, rawCameraParams: 'old' }
    })
    const task = state.submitUid('123456789')
    await flushPromises()
    expect(addSavedCameraParamUid).toHaveBeenCalled()
    if (action === 'switch') state.openCameraParamsTool()
    else if (action === 'close') state.close()
    else scope.stop()
    const progress = state.progress.value
    finish()
    await task
    expect(state.result.value).toBeNull()
    expect(state.progress.value).toEqual(progress)
  }
)

it('parses compatibility photos without X6Game authorization and permits manual UID retry', async () => {
  const state = setup()
  const image = new File(['photo'], '2026_04_26_21_05_24.jpeg', { lastModified: 1000 })
  Object.defineProperties(image, {
    webkitRelativePath: { value: `album/${image.name}` },
    arrayBuffer: { value: async () => new Uint8Array([1, 2, 3]).buffer }
  })
  const photo = (await readCompatibleAlbum([image])).photos[0]
  vi.mocked(getSavedCameraParamUids).mockResolvedValue([])
  await state.openForPhoto(photo)
  expect(state.uidRequired.value).toBe(true)
  expect(state.photo.value).toEqual(photo)
  vi.mocked(decodePhoto).mockResolvedValue({ ok: false, errorCode: 'base64_invalid' })
  await state.submitUid('123456')
  expect(decodePhoto).toHaveBeenCalledWith(new Uint8Array([1, 2, 3]), '123456')
  expect(state.errorCodes.value).toEqual(['base64_invalid'])
})

it('keeps photo dressing on UID retry and clears it for standalone camera codes', async () => {
  const state = setup()
  await state.openForFile(file())
  const outfit = {
    code: '',
    wearingClothes: [{ itemId: 1020100001, clothType: 10, outfitId: null }],
    dyeItems: []
  }
  const rawOutfit = { nikkiClothes: [1020100001], nikkiDIY: {} }
  vi.mocked(decodePhoto).mockResolvedValue({
    ok: true,
    value: { camera: {}, photo: {}, rawCameraParams: 'photo', outfit, rawOutfit }
  })
  await state.submitUid('123456')
  expect(state.result.value?.outfit).toEqual(outfit)
  expect(state.result.value?.rawOutfit).toEqual(rawOutfit)
  state.openCameraParamsTool()
  vi.mocked(decodeCameraParams).mockResolvedValue({ ok: true, value: {} })
  await state.parseRawCameraParams('standalone')
  expect(state.result.value?.outfit).toBeUndefined()
})
