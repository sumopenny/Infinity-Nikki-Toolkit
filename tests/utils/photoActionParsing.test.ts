import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { usePhotoActionParsing } from '../../src/composables/usePhotoActionParsing'
import {
  getSavedPhotoActionCaches,
  savePhotoActionCache
} from '../../src/utils/file-system/directoryStorage'
import {
  parsePhotoAction,
  photoActionFingerprint,
  PHOTO_ACTION_PARSER_VERSION
} from '../../src/utils/photo-params/photoActionParser'
import { PHOTO_ACTION_CATALOG_VERSION } from '../../src/utils/photo-params/resourceManifest'
import type { PhotoItem } from '../../src/utils/photoGrouping'

vi.mock('../../src/utils/file-system/directoryStorage', () => ({
  getSavedPhotoActionCaches: vi.fn(),
  savePhotoActionCache: vi.fn().mockResolvedValue(undefined)
}))
vi.mock('../../src/utils/photo-params/photoActionParser', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/utils/photo-params/photoActionParser')>()),
  parsePhotoAction: vi.fn()
}))

const photo = (name: string) => ({ id: name, name, fileSize: 100, lastModified: 1 }) as PhotoItem
const cached = photo('cached.jpg')
const missing = photo('missing.jpg')
const cache = (album: string, status: 'action' | 'none' = 'action') => ({
  fingerprint: photoActionFingerprint(album, cached),
  parserVersion: PHOTO_ACTION_PARSER_VERSION,
  catalogVersion: PHOTO_ACTION_CATALOG_VERSION,
  status,
  actionId: status === 'action' ? '123' : undefined,
  parsedAt: 1
})

describe('photo action cache with automatic parsing disabled', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it.each(['action', 'none'] as const)(
    'loads a saved %s result without resolving UID or decoding',
    async (status) => {
      vi.mocked(getSavedPhotoActionCaches).mockResolvedValue(
        new Map([[cached.name, cache('album', status)]])
      )
      const resolveUid = vi.fn()
      const parser = usePhotoActionParsing({ language: ref('zh') })
      await parser.start([cached, missing], 'album', resolveUid, false)
      expect(parser.actionInfo.value.get(cached.id)?.status).toBe(status)
      expect(parser.actionInfo.value.get(missing.id)?.status).toBe('unparsed')
      expect(parser.progress.value.running).toBe(false)
      expect(resolveUid).not.toHaveBeenCalled()
      expect(parsePhotoAction).not.toHaveBeenCalled()
      expect(savePhotoActionCache).not.toHaveBeenCalled()
    }
  )

  it('does not use stale cache and parses it only after enabling', async () => {
    vi.mocked(getSavedPhotoActionCaches).mockResolvedValue(
      new Map([[cached.name, cache('old-album')]])
    )
    vi.mocked(parsePhotoAction).mockResolvedValue({ status: 'none', parsedAt: 2 })
    const resolveUid = vi.fn().mockResolvedValue(['123'])
    const parser = usePhotoActionParsing({ language: ref('zh') })
    await parser.start([cached], 'new-album', resolveUid, false)
    expect(parser.actionInfo.value.get(cached.id)?.status).toBe('unparsed')
    expect(resolveUid).not.toHaveBeenCalled()
    expect(parsePhotoAction).not.toHaveBeenCalled()
    await parser.start([cached], 'new-album', resolveUid, true)
    expect(parsePhotoAction).toHaveBeenCalledTimes(1)
    expect(parser.actionInfo.value.get(cached.id)?.status).toBe('none')
  })

  it('discards an old album cache read when the album changes', async () => {
    let finishOld!: (value: Map<string, ReturnType<typeof cache>>) => void
    vi.mocked(getSavedPhotoActionCaches).mockImplementation((album) =>
      album === 'old'
        ? new Promise((resolve) => {
            finishOld = resolve
          })
        : Promise.resolve(new Map())
    )
    const parser = usePhotoActionParsing({ language: ref('zh') })
    const oldRun = parser.start([cached], 'old', vi.fn(), false)
    await parser.start([missing], 'new', vi.fn(), false)
    finishOld(new Map([[cached.name, cache('old')]]))
    await oldRun
    expect([...parser.actionInfo.value.keys()]).toEqual([missing.id])
  })
})

it('cancels queued tasks and discards all late results without saving cache', async () => {
  vi.clearAllMocks()
  vi.mocked(getSavedPhotoActionCaches).mockResolvedValue(new Map())
  let finish!: () => void
  const gate = new Promise<void>((resolve) => {
    finish = resolve
  })
  vi.mocked(parsePhotoAction).mockImplementation(async () => {
    await gate
    return { status: 'none' }
  })
  const parser = usePhotoActionParsing({ language: ref('zh') })
  const run = parser.start(
    Array.from({ length: 40 }, (_, i) => photo(i + '.jpg')),
    'album',
    async () => ['123']
  )
  await vi.waitFor(() => expect(parsePhotoAction).toHaveBeenCalledTimes(15))
  parser.cancel()
  finish()
  await run
  expect(parsePhotoAction).toHaveBeenCalledTimes(15)
  expect(savePhotoActionCache).not.toHaveBeenCalled()
  expect(parser.progress.value.running).toBe(false)
  parser.reset()
  expect(parser.actionInfo.value.size).toBe(0)
  await parser.start([missing], 'album', async () => ['123'])
  expect(parser.actionInfo.value.get(missing.id)?.status).toBe('none')
})

it.each(['cache', 'uids', 'parse'])(
  'settles progress after %s failure and supports retry',
  async (stage) => {
    vi.mocked(getSavedPhotoActionCaches).mockReset().mockResolvedValue(new Map())
    vi.mocked(parsePhotoAction).mockReset().mockResolvedValue({ status: 'none' })
    const uid = vi.fn().mockResolvedValue(['123'])
    if (stage === 'cache')
      vi.mocked(getSavedPhotoActionCaches).mockRejectedValueOnce(new Error('cache failed'))
    if (stage === 'uids') uid.mockRejectedValueOnce(new Error('permission denied'))
    if (stage === 'parse')
      vi.mocked(parsePhotoAction).mockRejectedValueOnce(new Error('decoder failed'))
    const onError = vi.fn()
    const parser = usePhotoActionParsing({ language: ref('zh'), onError })
    await expect(parser.start([missing], 'album', uid)).resolves.toBeUndefined()
    expect(parser.progress.value).toMatchObject({ running: false, completed: 1, failed: 1 })
    expect(parser.actionInfo.value.get(missing.id)?.status).toBe('unparsed')
    expect(onError).toHaveBeenCalledTimes(1)
    await parser.start([missing], 'album', uid)
    expect(parser.progress.value).toMatchObject({ running: false, failed: 0 })
  }
)

it('does not let an old preparation rejection end a newer task', async () => {
  vi.mocked(getSavedPhotoActionCaches).mockResolvedValue(new Map())
  let fail!: (reason: Error) => void
  let finish!: (value: string[]) => void
  const onError = vi.fn()
  const parser = usePhotoActionParsing({ language: ref('zh'), onError })
  const old = parser.start(
    [cached],
    'old',
    () =>
      new Promise((_, reject) => {
        fail = reject
      })
  )
  await vi.waitFor(() => expect(fail).toBeTypeOf('function'))
  const next = parser.start(
    [missing],
    'new',
    () =>
      new Promise((resolve) => {
        finish = resolve
      })
  )
  await vi.waitFor(() => expect(finish).toBeTypeOf('function'))
  fail(new Error('old failed'))
  await old
  expect(parser.progress.value.running).toBe(true)
  expect(onError).not.toHaveBeenCalled()
  finish([])
  await next
  expect(parser.progress.value.running).toBe(false)
})

it('ignores another worker finishing after the current parse batch fails', async () => {
  vi.mocked(getSavedPhotoActionCaches).mockResolvedValue(new Map())
  vi.mocked(savePhotoActionCache).mockClear()
  let late!: (value: { status: 'none' }) => void
  vi.mocked(parsePhotoAction)
    .mockReset()
    .mockRejectedValueOnce(new Error('failed'))
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          late = resolve
        })
    )
  const parser = usePhotoActionParsing({ language: ref('zh') })
  await parser.start([cached, missing], 'album', async () => ['123'])
  expect(parser.progress.value).toMatchObject({ running: false, completed: 2, failed: 2 })
  late({ status: 'none' })
  await Promise.resolve()
  await Promise.resolve()
  expect(parser.progress.value).toMatchObject({ running: false, completed: 2, failed: 2 })
  expect(savePhotoActionCache).not.toHaveBeenCalled()
})

describe('persistent failed action results and explicit retry', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    const entries = new Map<string, any>()
    vi.mocked(getSavedPhotoActionCaches).mockImplementation(async () => new Map(entries))
    vi.mocked(savePhotoActionCache).mockImplementation(async (_album, name, entry) => {
      entries.set(name, entry)
    })
  })

  it('reuses deterministic failure on focus and retries when explicitly toggled', async () => {
    vi.mocked(parsePhotoAction).mockResolvedValue({
      status: 'unparsed',
      errorCode: 'base64_invalid'
    })
    const parser = usePhotoActionParsing({ language: ref('zh') })
    const uid = vi.fn().mockResolvedValue(['123'])
    await parser.start([missing], 'album', uid)
    await vi.waitFor(() => expect(savePhotoActionCache).toHaveBeenCalled())
    await parser.start([missing], 'album', uid)
    expect(parsePhotoAction).toHaveBeenCalledTimes(1)
    await parser.start([missing], 'album', uid, false)
    expect(parsePhotoAction).toHaveBeenCalledTimes(1)
    await parser.start([missing], 'album', uid, true, true)
    expect(parsePhotoAction).toHaveBeenCalledTimes(2)
  })

  it('invalidates failure cache when photo fingerprint changes', async () => {
    vi.mocked(parsePhotoAction).mockResolvedValue({
      status: 'unparsed',
      errorCode: 'jpeg_second_end_marker_missing'
    })
    const parser = usePhotoActionParsing({ language: ref('zh') })
    await parser.start([missing], 'album', async () => ['123'])
    await vi.waitFor(() => expect(savePhotoActionCache).toHaveBeenCalled())
    await parser.start([{ ...missing, fileSize: 101 }], 'album', async () => ['123'])
    expect(parsePhotoAction).toHaveBeenCalledTimes(2)
  })

  it('retries UID-dependent cached failures when candidate UID set changes', async () => {
    vi.mocked(parsePhotoAction).mockResolvedValue({
      status: 'unparsed',
      errorCode: 'photo_structure_invalid'
    })
    const parser = usePhotoActionParsing({ language: ref('zh') })
    await parser.start([missing], 'album', async () => ['123'])
    await vi.waitFor(() => expect(savePhotoActionCache).toHaveBeenCalled())
    await parser.start([missing], 'album', async () => ['123'])
    expect(parsePhotoAction).toHaveBeenCalledTimes(1)
    await parser.start([missing], 'album', async () => ['456'])
    expect(parsePhotoAction).toHaveBeenCalledTimes(2)
  })

  it('does not cache transient parser failures', async () => {
    vi.mocked(parsePhotoAction).mockResolvedValue({
      status: 'unparsed',
      errorCode: 'NotReadableError'
    })
    const parser = usePhotoActionParsing({ language: ref('zh') })
    await parser.start([missing], 'album', async () => ['123'])
    await parser.start([missing], 'album', async () => ['123'])
    expect(parsePhotoAction).toHaveBeenCalledTimes(2)
    expect(savePhotoActionCache).not.toHaveBeenCalled()
  })
})

it('retries failed photos cached by the previous parser version', async () => {
  vi.clearAllMocks()
  const old = {
    ...cache('album'),
    status: 'unparsed' as const,
    errorCode: 'camera_params_invalid_length',
    parserVersion: 'v1',
    fingerprint: photoActionFingerprint('album', cached).replace('|v2|', '|v1|')
  }
  vi.mocked(getSavedPhotoActionCaches).mockResolvedValue(new Map([[cached.name, old]]))
  vi.mocked(parsePhotoAction).mockResolvedValue({ status: 'none', parsedAt: 2 })
  const parser = usePhotoActionParsing({ language: ref('zh') })
  await parser.start([cached], 'album', async () => ['123'], true)
  expect(parsePhotoAction).toHaveBeenCalledTimes(1)
  expect(parser.actionInfo.value.get(cached.id)?.status).toBe('none')
  expect(savePhotoActionCache).toHaveBeenCalled()
})
