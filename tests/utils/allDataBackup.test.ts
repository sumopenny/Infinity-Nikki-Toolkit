// @vitest-environment node
import { expect, it, vi } from 'vitest'
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import { setupOutfitDatabaseTests, resetOutfitDatabase, webp } from '../helpers/outfitDatabase'
import { createEmptyHomeSchemeMetadata } from '../helpers/homeSchemeMetadata'
import {
  exportAllDataBackup,
  prepareAllDataBackup,
  applyAllDataBackup,
  hasAllBackupData
} from '../../src/utils/backup/allDataBackup'
import {
  saveOutfit,
  deleteOutfit,
  readOutfitSnapshot,
  hashOutfitBlob
} from '../../src/utils/outfit/outfitStorage'
import {
  saveHomeScheme,
  saveHomeSchemeTags,
  readHomeSchemeSnapshot,
  releaseHomeSchemeUrls
} from '../../src/utils/homeBuild/homeSchemeStorage'
import {
  saveCameraFavorite,
  coverMetadata,
  readCameraFavorites,
  type CameraFavorite
} from '../../src/utils/photo-params/favorites'
import { parseResonanceFile } from '../../src/utils/resonance/resonanceFile'
import {
  loadResonanceRecords,
  saveResonanceRecords,
  mergeResonanceRecords
} from '../../src/utils/resonance/resonanceStorage'
import { runStoreRequest } from '../../src/utils/file-system/database'
import { CAMERA_BACKUP_LIMITS, OUTFIT_BACKUP_LIMITS } from '../../src/utils/backup/zipBackup'
import * as homeBackup from '../../src/utils/homeBuild/homeSchemeBackup'
import {
  emptyWardrobe,
  updateWardrobe,
  loadWardrobe
} from '../../src/utils/wardrobe/wardrobeStorage'
setupOutfitDatabaseTests()

it('preserves a concurrent resonance import while restoring a full backup', async () => {
  await seed()
  const plan = await prepareAllDataBackup(await exported())
  await resetOutfitDatabase()
  const incoming = { ...plan.resonance[0]!, id: 'other-window:outfit', bannerId: 'other-window' }
  let concurrent: Promise<unknown> = Promise.resolve()
  const result = await applyAllDataBackup(
    plan,
    async () => ({}),
    (module) => {
      if (module === 'resonance') concurrent = mergeResonanceRecords([incoming])
    }
  )
  await concurrent
  expect(result?.find((item) => item.module === 'resonance')).toMatchObject({ saved: 1, failed: 0 })
  expect((await loadResonanceRecords()).map((record) => record.id).sort()).toEqual(
    [incoming.id, plan.resonance[0]!.id].sort()
  )
})
const camera = (id = 'camera-one', code = 'CAMERA'): CameraFavorite => ({
  id,
  code,
  version: 1,
  name: '参数',
  tag: '人像',
  source: 'manual',
  cover: null,
  createdAt: '2026-10-12T00:00:00.000Z',
  updatedAt: '2026-10-12T00:00:00.000Z',
  result: {
    rawCameraParams: code,
    environmentFields: [],
    cameraFields: [],
    imageFields: [],
    resourceGroups: []
  }
})
const outfit = (code: string, note = '备份备注') => ({ code, note, tag: null, imageFile: webp() })
async function seed() {
  await updateWardrobe(() => ({
    ...emptyWardrobe(),
    imported: true,
    entries: { '1020100347': { owned: true, source: 'pearpal' } }
  }))
  await saveOutfit(outfit('OUTFIT'))
  await deleteOutfit(await saveOutfit(outfit('IGNORED')))
  await saveHomeSchemeTags(['庭院'])
  const home = await saveHomeScheme({
    code: 'HOME',
    name: '家园',
    schemeType: 'home',
    tags: ['庭院'],
    note: '备注',
    metadata: createEmptyHomeSchemeMetadata(),
    imageFile: webp()
  })
  releaseHomeSchemeUrls([home])
  const cover = webp('cover.webp')
  await saveCameraFavorite({ ...camera(), cover: await coverMetadata(cover, 'cover.webp') }, cover)
  await saveResonanceRecords(
    (await parseResonanceFile({ pulls: {}, edits: { 77: [['2026-01-01', '1020100347']] } })).records
  )
}
async function exported() {
  let file!: File
  await exportAllDataBackup((name, blob) => {
    file = new File([blob], name)
  })
  return file
}
async function repack(
  file: File,
  mutate: (files: Record<string, Uint8Array>) => void,
  resign = false
) {
  const files = unzipSync(new Uint8Array(await file.arrayBuffer()))
  mutate(files)
  if (resign) {
    const manifest = JSON.parse(strFromU8(files['backup.json']))
    for (const entry of manifest.entries) {
      entry.size = files[entry.path].length
      entry.sha256 = await hashOutfitBlob(new Blob([files[entry.path]]))
    }
    files['backup.json'] = strToU8(JSON.stringify(manifest))
  }
  return new File([zipSync(files)], 'changed.zip')
}
it.each([false, true])(
  'round-trips all five modules, covers, tags and ignores without portable directory authorization (network HTTP: %s)',
  async (networkHttp) => {
    expect(await hasAllBackupData()).toBe(false)
    await seed()
    await runStoreRequest('album-handles', 'readwrite', (store) =>
      store.put({ secret: 'authorization' }, 'current')
    )
    expect(await hasAllBackupData()).toBe(true)
    const file = await exported()
    const names = Object.keys(unzipSync(new Uint8Array(await file.arrayBuffer())))
    expect(names.sort()).toEqual([
      'backup.json',
      'camera/1.zip',
      'home/1.zip',
      'outfits/1.zip',
      'resonance/1.json',
      'wardrobe/1.json'
    ])
    await resetOutfitDatabase()
    if (networkHttp)
      vi.stubGlobal('crypto', { getRandomValues: crypto.getRandomValues.bind(crypto) })
    const plan = await prepareAllDataBackup(file)
    expect(await runStoreRequest('outfits', 'readonly', (store) => store.count())).toBe(0)
    const result = await applyAllDataBackup(plan, async () => ({}))
    expect(result?.every((item) => item.saved === 1 && item.failed === 0 && !item.error)).toBe(true)
    const outfits = await readOutfitSnapshot()
    expect(outfits.images.size).toBe(1)
    expect(outfits.ignoredCodes).toEqual(['IGNORED'])
    expect((await readHomeSchemeSnapshot()).images.size).toBe(1)
    expect((await readHomeSchemeSnapshot()).tags).toEqual(['庭院'])
    expect(await (await readCameraFavorites()).covers.get('camera-one')!.text()).toBe(
      await webp('cover.webp').text()
    )
    expect((await loadResonanceRecords()).length).toBe(1)
    expect(await runStoreRequest('album-handles', 'readonly', (store) => store.count())).toBe(0)
    if (networkHttp)
      expect((await prepareAllDataBackup(await exported())).camera.records).toHaveLength(1)
  }
)
it('regenerates colliding outfit and home IDs on network HTTP', async () => {
  await seed()
  const file = await exported()
  const oldOutfit = (await readOutfitSnapshot()).records[0]
  const oldHome = (await readHomeSchemeSnapshot()).records[0]
  // 保留原 ID 并修改本地分享码，触发导入时的 ID 冲突重建。
  await runStoreRequest('outfits', 'readwrite', (store) =>
    store.put({ ...oldOutfit, code: 'LOCAL', codeKey: 'LOCAL' })
  )
  await runStoreRequest('home-schemes', 'readwrite', (store) =>
    store.put({ ...oldHome, code: 'LOCAL' })
  )
  vi.stubGlobal('crypto', { getRandomValues: crypto.getRandomValues.bind(crypto) })
  const results = await applyAllDataBackup(await prepareAllDataBackup(file), async () => ({}))
  expect(results?.find((item) => item.module === 'outfits')).toMatchObject({ saved: 1, failed: 0 })
  expect(results?.find((item) => item.module === 'home')).toMatchObject({ saved: 1, failed: 0 })
  const outfits = (await readOutfitSnapshot()).records
  const homes = (await readHomeSchemeSnapshot()).records
  expect(outfits).toHaveLength(2)
  expect(homes).toHaveLength(2)
  expect(outfits.find((record) => record.code === 'OUTFIT')!.id).not.toBe(oldOutfit.id)
  expect(homes.find((record) => record.code === 'HOME')!.id).not.toBe(oldHome.id)
})
it.each([false, true])(
  'validates checksums and every nested module before any restoration writes (network HTTP: %s)',
  async (networkHttp) => {
    await seed()
    const file = await exported()
    await resetOutfitDatabase()
    if (networkHttp)
      vi.stubGlobal('crypto', { getRandomValues: crypto.getRandomValues.bind(crypto) })
    const badChecksum = await repack(file, (files) => {
      files['resonance/1.json'] = strToU8('{}')
    })
    await expect(prepareAllDataBackup(badChecksum)).rejects.toThrow('校验失败')
    const badNested = await repack(
      file,
      (files) => {
        files['home/1.zip'] = zipSync({ 'manifest.json': strToU8('{}') })
      },
      true
    )
    await expect(prepareAllDataBackup(badNested)).rejects.toThrow()
    expect(await runStoreRequest('outfits', 'readonly', (store) => store.count())).toBe(0)
    expect((await readCameraFavorites()).records).toHaveLength(0)
    expect(await loadResonanceRecords()).toEqual([])
  }
)
it('cancels camera conflicts before writing any other module', async () => {
  await seed()
  const file = await exported()
  await resetOutfitDatabase()
  await saveCameraFavorite({ ...camera(), name: '本地' }, null)
  const choose = vi.fn(async () => null)
  expect(await applyAllDataBackup(await prepareAllDataBackup(file), choose)).toBeNull()
  expect(choose.mock.calls).toHaveLength(1)
  expect(await runStoreRequest('outfits', 'readonly', (store) => store.count())).toBe(0)
  expect(await runStoreRequest('home-schemes', 'readonly', (store) => store.count())).toBe(0)
  expect((await readCameraFavorites()).records[0].name).toBe('本地')
})
it('keeps duplicate outfit/home codes, uses camera conflict choices and overwrites matching resonance IDs', async () => {
  await seed()
  const file = await exported()
  await resetOutfitDatabase()
  await saveOutfit(outfit('OUTFIT', '本地备注'))
  await saveHomeScheme({
    code: 'HOME',
    name: '本地家园',
    schemeType: 'home',
    tags: [],
    note: '',
    metadata: createEmptyHomeSchemeMetadata()
  })
  await saveCameraFavorite({ ...camera(), name: '本地参数' }, null)
  const results = await applyAllDataBackup(await prepareAllDataBackup(file), async () => ({
    'camera-one': 'incoming'
  }))
  expect(results?.find((item) => item.module === 'outfits')).toMatchObject({ saved: 0, skipped: 1 })
  expect(results?.find((item) => item.module === 'home')).toMatchObject({ saved: 0, skipped: 1 })
  expect((await readOutfitSnapshot()).records[0].note).toBe('本地备注')
  expect((await readHomeSchemeSnapshot()).records[0].name).toBe('本地家园')
  expect((await readCameraFavorites()).records[0].name).toBe('参数')
  const local = await loadResonanceRecords()
  await saveResonanceRecords(
    local.map((record) => ({ ...record, outfitName: { zh: '本地', en: 'Local' } }))
  )
  await applyAllDataBackup(await prepareAllDataBackup(file), async () => ({}))
  expect((await loadResonanceRecords())[0].outfitName).toEqual(local[0].outfitName)
})
it('continues other modules and reports an incomplete module without rolling back successful imports', async () => {
  await seed()
  const file = await exported()
  await resetOutfitDatabase()
  vi.spyOn(homeBackup, 'importHomeSchemeBackup').mockRejectedValueOnce(new Error('QuotaExceeded'))
  const results = await applyAllDataBackup(await prepareAllDataBackup(file), async () => ({}))
  expect(results?.find((item) => item.module === 'home')?.error).toBe('QuotaExceeded')
  expect((await readOutfitSnapshot()).records).toHaveLength(1)
  expect((await readCameraFavorites()).records).toHaveLength(1)
  expect(await loadResonanceRecords()).toHaveLength(1)
})
it('collects module parts into one ZIP and merges empty modules without clearing existing data', async () => {
  await saveOutfit(outfit('ONE'))
  await saveOutfit(outfit('TWO'))
  await saveCameraFavorite(camera(), null)
  await saveCameraFavorite(camera('camera-two', 'CAMERA2'), null)
  const oldOutfit = OUTFIT_BACKUP_LIMITS.records,
    oldCamera = CAMERA_BACKUP_LIMITS.records
  OUTFIT_BACKUP_LIMITS.records = 1
  CAMERA_BACKUP_LIMITS.records = 1
  let file!: File
  try {
    file = await exported()
  } finally {
    OUTFIT_BACKUP_LIMITS.records = oldOutfit
    CAMERA_BACKUP_LIMITS.records = oldCamera
  }
  await resetOutfitDatabase()
  await saveHomeScheme({
    code: 'KEEP',
    name: '保留',
    schemeType: 'home',
    tags: [],
    note: '',
    metadata: createEmptyHomeSchemeMetadata()
  })
  const resonance = (await parseResonanceFile({ 77: [['2026-01-01', '1020100347']] })).records
  await saveResonanceRecords(resonance)
  const plan = await prepareAllDataBackup(file)
  expect(plan.files.get('outfits')).toHaveLength(2)
  expect(plan.files.get('camera')).toHaveLength(2)
  await applyAllDataBackup(plan, async () => ({}))
  expect((await readOutfitSnapshot()).records).toHaveLength(2)
  expect((await readCameraFavorites()).records).toHaveLength(2)
  expect((await readHomeSchemeSnapshot()).records[0].code).toBe('KEEP')
  expect(await loadResonanceRecords()).toEqual(resonance)
})

it('detects wardrobe-only data and merges ownership without revoking local pieces', async () => {
  expect(await hasAllBackupData()).toBe(false)
  await updateWardrobe(() => ({
    ...emptyWardrobe(),
    imported: true,
    entries: {
      '1020100347': { owned: true, source: 'pearpal' },
      '1020100399': { owned: false, source: 'manual' }
    }
  }))
  expect(await hasAllBackupData()).toBe(true)
  const plan = await prepareAllDataBackup(await exported())
  await resetOutfitDatabase()
  await updateWardrobe(() => ({
    ...emptyWardrobe(),
    entries: {
      '1020100399': { owned: true, source: 'pearpal' },
      '1020100001': { owned: true, source: 'pearpal' }
    }
  }))
  const results = await applyAllDataBackup(plan, async () => ({}))
  const restored = await loadWardrobe()
  expect(Object.values(restored.entries).every((entry) => entry.owned)).toBe(true)
  expect(Object.keys(restored.entries)).toHaveLength(3)
  expect(results?.find((r) => r.module === 'wardrobe')).toMatchObject({
    saved: 1,
    skipped: 1,
    failed: 0
  })
})

it.each([
  ['cn', 'global', 'cn'],
  ['cn', 'global', 'global'],
  ['global', 'cn', 'cn'],
  ['global', 'cn', 'global']
] as const)(
  'restores %s wardrobe over %s with explicitly chosen %s display region',
  async (incoming, local, chosen) => {
    const id = (scope: string) => (scope === 'cn' ? '1021720039' : '1021720040')
    await updateWardrobe(() => ({
      ...emptyWardrobe(),
      imported: true,
      regionScope: incoming,
      entries: { [id(incoming)]: { owned: true, source: 'pearpal' } }
    }))
    const plan = await prepareAllDataBackup(await exported())
    await resetOutfitDatabase()
    await updateWardrobe(() => ({
      ...emptyWardrobe(),
      imported: true,
      regionScope: local,
      entries: { [id(local)]: { owned: true, source: 'pearpal' } }
    }))
    const choose = vi.fn(async () => chosen)
    const results = await applyAllDataBackup(plan, async () => ({}), undefined, choose)
    expect(choose).toHaveBeenCalledTimes(1)
    expect(choose).toHaveBeenCalledWith({ local, incoming })
    expect(results?.every((result) => !result.error && !result.failed)).toBe(true)
    const saved = await loadWardrobe()
    expect(saved.regionScope).toBe(chosen)
    expect(saved.entries[id(local)]?.owned).toBe(true)
    expect(saved.entries[id(incoming)]?.owned).toBe(true)
    // 最终展示和导出的备份元数据都使用用户确认的区服。
    const { wardrobeCatalogForRegion } = await import('../../src/utils/wardrobe/wardrobeRegion')
    const { loadWardrobeCatalog } = await import('../../src/utils/wardrobe/wardrobeCatalog')
    const view = wardrobeCatalogForRegion(await loadWardrobeCatalog(), saved.regionScope!)
    expect(view.byId.has(id(chosen))).toBe(true)
    expect(view.byId.has(id(chosen === 'cn' ? 'global' : 'cn'))).toBe(false)
    expect((await prepareAllDataBackup(await exported())).wardrobe?.regionScope).toBe(chosen)
  }
)

it.each(['cn', 'global'] as const)(
  'does not prompt for same-region %s restore or empty-store restore',
  async (scope) => {
    await updateWardrobe(() => ({ ...emptyWardrobe(), imported: true, regionScope: scope }))
    const plan = await prepareAllDataBackup(await exported())
    const choose = vi.fn(async () => null)
    await applyAllDataBackup(plan, async () => ({}), undefined, choose)
    expect(choose).not.toHaveBeenCalled()
    await resetOutfitDatabase()
    await applyAllDataBackup(plan, async () => ({}), undefined, choose)
    expect(choose).not.toHaveBeenCalled()
    expect((await loadWardrobe()).regionScope).toBe(scope)
  }
)

it('cancels a region conflict before writing any module, and rejects conflict without a resolver', async () => {
  await seed()
  await updateWardrobe((latest) => ({ ...latest, regionScope: 'global' }))
  const plan = await prepareAllDataBackup(await exported())
  await resetOutfitDatabase()
  await updateWardrobe(() => ({ ...emptyWardrobe(), imported: true, regionScope: 'cn' }))
  const before = await loadWardrobe()
  const put = vi.spyOn(IDBObjectStore.prototype, 'put')
  const onModule = vi.fn()
  try {
    expect(
      await applyAllDataBackup(
        plan,
        async () => ({}),
        onModule,
        async () => null
      )
    ).toBeNull()
    await expect(applyAllDataBackup(plan, async () => ({}), onModule)).rejects.toThrow(
      'WARDROBE_REGION_CONFIRMATION_REQUIRED'
    )
    expect(onModule).not.toHaveBeenCalled()
    expect(put).not.toHaveBeenCalled()
    expect(await loadWardrobe()).toEqual(before)
    expect((await readOutfitSnapshot()).records).toHaveLength(0)
    expect((await readCameraFavorites()).records).toHaveLength(0)
    expect(await loadResonanceRecords()).toEqual([])
  } finally {
    put.mockRestore()
  }
})

it('rejects a stale region decision before restoring any module', async () => {
  await updateWardrobe(() => ({ ...emptyWardrobe(), imported: true, regionScope: 'global' }))
  const plan = await prepareAllDataBackup(await exported())
  await updateWardrobe((latest) => ({ ...latest, regionScope: 'cn' }))
  const onModule = vi.fn()
  await expect(
    applyAllDataBackup(
      plan,
      async () => ({}),
      onModule,
      async () => {
        await updateWardrobe((latest) => ({ ...latest, regionScope: 'global' }))
        return 'cn'
      }
    )
  ).rejects.toThrow('WARDROBE_CHANGED')
  expect(onModule).not.toHaveBeenCalled()
  expect((await loadWardrobe()).regionScope).toBe('global')
})

it('keeps the local scope when the backup has no wardrobe data', async () => {
  const plan = await prepareAllDataBackup(await exported())
  await updateWardrobe(() => ({ ...emptyWardrobe(), imported: true, regionScope: 'global' }))
  const choose = vi.fn(async () => null)
  await applyAllDataBackup(plan, async () => ({}), undefined, choose)
  expect(choose).not.toHaveBeenCalled()
  expect((await loadWardrobe()).regionScope).toBe('global')
})

it('does not write accepted camera choices if the later wardrobe confirmation is cancelled', async () => {
  await seed()
  await updateWardrobe((latest) => ({ ...latest, regionScope: 'global' }))
  const plan = await prepareAllDataBackup(await exported())
  await resetOutfitDatabase()
  await updateWardrobe(() => ({ ...emptyWardrobe(), imported: true, regionScope: 'cn' }))
  await saveCameraFavorite({ ...camera(), name: 'LOCAL' }, null)
  const before = await readCameraFavorites()
  const chooseCamera = vi.fn(async () => ({ 'camera-one': 'incoming' as const }))
  const onModule = vi.fn()
  expect(await applyAllDataBackup(plan, chooseCamera, onModule, async () => null)).toBeNull()
  expect(chooseCamera).toHaveBeenCalledTimes(1)
  expect(onModule).not.toHaveBeenCalled()
  expect(await readCameraFavorites()).toEqual(before)
  expect((await loadWardrobe()).regionScope).toBe('cn')
})

it('uses legacy backup scope inference in the conflict dialog', async () => {
  await updateWardrobe(() => ({
    ...emptyWardrobe(),
    imported: true,
    entries: { '1021720039': { owned: true, source: 'pearpal' } }
  }))
  const plan = await prepareAllDataBackup(await exported())
  expect(plan.wardrobe?.regionScope).toBeUndefined()
  await updateWardrobe((latest) => ({ ...latest, regionScope: 'global' }))
  const choose = vi.fn(async () => 'cn' as const)
  await applyAllDataBackup(plan, async () => ({}), undefined, choose)
  expect(choose).toHaveBeenCalledWith({ local: 'global', incoming: 'cn' })
  expect((await loadWardrobe()).regionScope).toBe('cn')
})

it('accepts legacy full backups without wardrobe and rejects invalid wardrobe before restoring', async () => {
  await seed()
  const file = await exported()
  const legacy = await repack(file, (files) => {
    delete files['wardrobe/1.json']
    const manifest = JSON.parse(strFromU8(files['backup.json']))
    manifest.version = 1
    manifest.entries = manifest.entries.filter(
      (entry: { module: string }) => entry.module !== 'wardrobe'
    )
    files['backup.json'] = strToU8(JSON.stringify(manifest))
  })
  expect((await prepareAllDataBackup(legacy)).wardrobe).toBeNull()
  const invalid = await repack(
    file,
    (files) => {
      files['wardrobe/1.json'] = strToU8('{}')
    },
    true
  )
  const before = await loadWardrobe()
  await expect(prepareAllDataBackup(invalid)).rejects.toThrow('INVALID_WARDROBE')
  expect(await loadWardrobe()).toEqual(before)
})

it.each([
  ['photo.jpg', 'image/jpeg', [255, 216, 255, 224]],
  ['renamed.zip', 'application/zip', [77, 90, 0, 0]],
  ['short.zip', '', [80, 75]]
])('rejects non-ZIP content before inspecting modules (%s)', async (name, type, bytes) => {
  const file = new File([new Uint8Array(bytes as number[])], name as string, {
    type: type as string
  })
  await expect(prepareAllDataBackup(file)).rejects.toThrow('backup_file_not_zip')
})
it('recognizes backup content despite an incorrect extension and MIME type', async () => {
  const zip = await exported()
  const file = new File([zip], 'renamed.jpg', { type: 'image/jpeg' })
  expect((await prepareAllDataBackup(file)).files.get('outfits')).toHaveLength(1)
})
