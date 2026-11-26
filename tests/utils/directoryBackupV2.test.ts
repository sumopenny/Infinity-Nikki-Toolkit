import { readFileSync } from 'node:fs'
import { runDatabaseTransaction } from '../../src/utils/file-system/transaction'
import { OUTFIT_IMAGES_STORE } from '../../src/utils/file-system/database'
import 'fake-indexeddb/auto'
import { beforeEach, expect, it } from 'vitest'
import {
  resetDatabase,
  setup,
  putOutfit,
  sync,
  moduleDir,
  asHandle,
  outfit,
  png
} from '../helpers/directoryBackupFs'
import { bindDirectory } from '../../src/utils/directory-backup/engine'
import { previewRestore } from '../../src/utils/directory-backup/restore'
import {
  digest,
  readJson,
  putBytes,
  jsonBytes,
  MAX_JSON_BYTES,
  stageAndApplyVerified,
  defaultManifest
} from '../../src/utils/directory-backup/disk'
import {
  runStoreRequest,
  OUTFITS_STORE,
  openDb,
  DB_NAME,
  DB_VERSION,
  BACKUP_SETTINGS_STORE
} from '../../src/utils/file-system/database'
import { loadConfig } from '../../src/utils/directory-backup/repository'
beforeEach(resetDatabase)
it('writes complete IDs and a single metadata index directly under the selected folder', async () => {
  const { config, directory, disk } = await setup()
  const id = '550e8400-e29b-41d4-a716-446655440000'
  const record = await putOutfit(id, '', png())
  await runStoreRequest(OUTFITS_STORE, 'readwrite', (store) =>
    store.put({ ...record, code: 'UUIDCODE', codeKey: 'UUIDCODE' })
  )
  expect(await sync(config)).toMatchObject({ state: 'synced' })
  expect(disk.files.has(`搭配码/记录/${id}.json`)).toBe(true)
  expect(disk.files.has(`搭配码/图片/${id}.png`)).toBe(true)
  const index = await readJson<Record<string, unknown>>(
    await moduleDir(directory),
    '_系统/校验索引.json'
  )
  expect(index?.[id]).toMatchObject({
    path: `记录/${id}.json`,
    size: expect.any(Number),
    sha256: expect.any(String),
    image: { path: `图片/${id}.png` }
  })
  expect(
    [...disk.files.keys()].every((path) => /^(搭配码|家园方案|相机参数)\//.test(path))
  ).toBe(true)
  expect([...disk.files.keys()].some((path) => path.includes('写入中/'))).toBe(false)
})
it.each(['../bad', 'CON', 'trailing.', 'bad:name', 'x'.repeat(181)])(
  'rejects incompatible full ID %s before formal record writes',
  async (id) => {
    const { config, disk } = await setup()
    await putOutfit(id)
    expect((await sync(config)).state).toBe('error')
    expect([...disk.files.keys()].some((path) => path.includes('/记录/'))).toBe(false)
  }
)
it('rejects case-equivalent IDs without replacing either record', async () => {
  const { config, disk } = await setup()
  await putOutfit('CaseA')
  await putOutfit('casea')
  expect((await sync(config)).state).toBe('error')
  expect([...disk.files.keys()].some((path) => path.includes('/记录/'))).toBe(false)
})
it('rejects unknown nonempty folders without modifying their files', async () => {
  const { directory, disk } = await setup()
  await putBytes(asHandle(directory), '私人资料.txt', jsonBytes({ keep: true }))
  const before = new Map(disk.files)
  await expect(bindDirectory(asHandle(directory))).rejects.toThrow('空文件夹')
  expect(disk.files).toEqual(before)
})
it('rejects an oversized single index before writing formal records', async () => {
  const { directory, disk } = await setup()
  const dir = await directory.getDirectoryHandle('搭配码', { create: true })
  await expect(
    stageAndApplyVerified(asHandle(dir), 'outfits', [
      { path: '记录/REC01.json', data: jsonBytes({ id: 'REC01' }) },
      { path: '_系统/校验索引.json', data: new Uint8Array(MAX_JSON_BYTES + 1) },
      { path: '_系统/备份信息.json', data: jsonBytes(defaultManifest('outfits')) }
    ])
  ).rejects.toThrow('超过格式允许的大小')
  expect(disk.files.has('搭配码/记录/REC01.json')).toBe(false)
})
it('creates backup stores during upgrade and preserves business records', async () => {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 11)
    request.onupgradeneeded = () => {
      const db = request.result
      db.createObjectStore(OUTFITS_STORE, { keyPath: 'id' }).put(outfit('UPGRADE'))
    }
    request.onsuccess = () => {
      request.result.close()
      resolve()
    }
    request.onerror = () => reject(request.error)
  })
  const db = await openDb()
  expect(db.version).toBe(DB_VERSION)
  expect(db.objectStoreNames.contains(BACKUP_SETTINGS_STORE)).toBe(true)
  db.close()
  expect(
    await runStoreRequest(OUTFITS_STORE, 'readonly', (store) => store.get('UPGRADE'))
  ).toMatchObject({ id: 'UPGRADE' })
  expect((await loadConfig()).enabled).toEqual({ outfits: false, home: false, camera: false })
})

it('resumes an image extension change and cleans the previous extension after committing', async () => {
  const { config, directory, disk } = await setup()
  await putOutfit('FORMAT01', '', png())
  await sync(config)
  const blob = new Blob([readFileSync('img/screenshots/data-backup.webp')], { type: 'image/webp' })
  const record = { ...outfit('FORMAT01'), image: 'FORMAT01.webp', imageSize: blob.size }
  const sha256 = await digest(await blob.arrayBuffer())
  await runDatabaseTransaction([OUTFITS_STORE, OUTFIT_IMAGES_STORE], 'readwrite', async (tx) => {
    await tx.objectStore(OUTFITS_STORE).put(record)
    await tx.objectStore(OUTFIT_IMAGES_STORE).put({
      id: record.id,
      blob,
      size: blob.size,
      sha256,
      extension: 'webp'
    })
  })
  disk.failOnce((e) => e.kind === 'written' && e.path === '搭配码/图片/FORMAT01.webp')
  expect((await sync(config)).state).toBe('error')
  expect((await sync(config)).state).toBe('synced')
  expect(disk.files.has('搭配码/图片/FORMAT01.webp')).toBe(true)
  expect(disk.files.has('搭配码/图片/FORMAT01.png')).toBe(false)
  expect((await previewRestore(asHandle(directory))).modules[0].ready).toBe(true)
})
