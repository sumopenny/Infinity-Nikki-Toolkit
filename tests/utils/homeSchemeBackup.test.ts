// @vitest-environment node
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import { DB_NAME, HOME_IMAGES_STORE, runStoreRequest } from '../../src/utils/file-system/database'
import { HOME_BACKUP_LIMITS } from '../../src/utils/backup/zipBackup'
import {
  exportHomeSchemeBackup,
  importHomeSchemeBackup,
  prepareHomeSchemeBackup
} from '../../src/utils/homeBuild/homeSchemeBackup'
import {
  deleteHomeScheme,
  readHomeSchemeSnapshot,
  saveHomeScheme,
  saveHomeSchemeTags
} from '../../src/utils/homeBuild/homeSchemeStorage'
import { createEmptyHomeSchemeMetadata } from '../helpers/homeSchemeMetadata'

const input = (code = 'CODE1') => ({
  code,
  name: '花园',
  schemeType: 'home' as const,
  tags: ['庭院'],
  note: '春日',
  metadata: {
    ...createEmptyHomeSchemeMetadata(),
    version: '2.10',
    furnitureCount: 7,
    server: 49,
    lastModifyTime: 123,
    coverImageUrl: 'https://example.test/cover.webp'
  }
})
const archive = (entries: Record<string, Uint8Array>) => new File([zipSync(entries)], 'backup.zip')
const reset = () =>
  new Promise<void>((resolve, reject) => {
    const r = indexedDB.deleteDatabase(DB_NAME)
    r.onsuccess = () => resolve()
    r.onerror = () => reject(r.error)
  })
beforeEach(() => {
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => ({ width: 1, height: 1, close() {} }))
  )
})
afterEach(async () => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  await reset()
})

describe('home scheme ZIP backup', () => {
  it('rejects traversal and unsupported manifest formats before database writes', async () => {
    await expect(
      importHomeSchemeBackup(archive({ '../manifest.json': strToU8('{}') }))
    ).rejects.toThrow('home_scheme_backup_path_invalid')
    await expect(
      importHomeSchemeBackup(
        archive({
          'manifest.json': strToU8(
            JSON.stringify({
              format: 'infinity-nikki-outfit-backup',
              version: 1,
              tags: [],
              homeSchemes: []
            })
          )
        })
      )
    ).rejects.toThrow('home_scheme_backup_format_unsupported')
  })

  it.each([false, true])(
    'round-trips version-1 metadata and image bytes (prepared=%s)',
    async (prepared) => {
      await saveHomeSchemeTags(['庭院'])
      const saved = await saveHomeScheme({
        ...input(),
        imageFile: new File(['RIFF0000WEBPcontent'], 'cover.webp', { type: 'image/webp' })
      })
      const parts: Blob[] = []
      expect(
        await exportHomeSchemeBackup(async (_name, blob) => {
          parts.push(blob)
        })
      ).toMatchObject({ count: 1 })
      const bytes = new Uint8Array(await parts[0].arrayBuffer())
      const entries = unzipSync(bytes)
      const manifest = JSON.parse(strFromU8(entries['manifest.json']))
      expect(manifest).toMatchObject({
        format: 'infinity-nikki-home-scheme-backup',
        version: 1,
        tags: ['庭院']
      })
      expect(manifest.homeSchemes[0]).toMatchObject({
        id: saved.id,
        image: `images/${saved.id}.webp`,
        metadata: saved.metadata,
        createdAt: saved.createdAt,
        updatedAt: saved.updatedAt
      })
      await reset()
      const file = new File([bytes], 'old.zip')
      const restored = prepared
        ? await (await prepareHomeSchemeBackup(file)).apply()
        : await importHomeSchemeBackup(file)
      expect(restored).toMatchObject({ addedCount: 1, duplicateCount: 0, failedCount: 0 })
      expect(restored.schemes[0]).toMatchObject({
        id: saved.id,
        code: saved.code,
        tags: saved.tags,
        metadata: saved.metadata,
        createdAt: saved.createdAt,
        updatedAt: saved.updatedAt
      })
      const snapshot = await readHomeSchemeSnapshot()
      expect(await snapshot.images.get(saved.id)!.blob.text()).toBe('RIFF0000WEBPcontent')
    }
  )

  it('keeps same-code records during manual import and allocates new IDs for other codes', async () => {
    const existing = await saveHomeScheme({ ...input(), tags: [], id: 'same' })
    const base = { ...existing, image: null, tags: [] }
    const manifest = {
      format: 'infinity-nikki-home-scheme-backup',
      version: 1,
      tags: [],
      homeSchemes: [
        { ...base, name: '不会覆盖' },
        { ...base, code: 'CODE2', name: '新方案' }
      ]
    }
    const result = await importHomeSchemeBackup(
      archive({ 'manifest.json': strToU8(JSON.stringify(manifest)) })
    )
    expect(result).toMatchObject({ addedCount: 1, duplicateCount: 1, failedCount: 0 })
    expect(result.schemes.find((s) => s.code === 'CODE1')).toMatchObject({
      id: 'same',
      name: '花园'
    })
    expect(result.schemes.find((s) => s.code === 'CODE2')!.id).not.toBe('same')
  })

  it('exports split ZIPs that can all be imported into the same global library', async () => {
    for (let i = 0; i < 5; i++) await saveHomeScheme({ ...input(`CODE${i}`), tags: [] })
    const originalLimit = HOME_BACKUP_LIMITS.records
    HOME_BACKUP_LIMITS.records = 2
    try {
      const parts: Blob[] = []
      const result = await exportHomeSchemeBackup(async (_name, blob) => {
        parts.push(blob)
      })
      expect(result.fileNames).toHaveLength(3)
      await reset()
      for (const part of parts) {
        const imported = await importHomeSchemeBackup(new File([part], 'part.zip'))
        expect(imported.failedCount).toBe(0)
        expect(imported.addedCount).toBeLessThanOrEqual(2)
      }
      expect((await readHomeSchemeSnapshot()).records).toHaveLength(5)
    } finally {
      HOME_BACKUP_LIMITS.records = originalLimit
    }
  })

  it('refuses export when an expected cover is missing', async () => {
    const saved = await saveHomeScheme({
      ...input(),
      tags: [],
      imageFile: new File(['RIFF0000WEBPcontent'], 'cover.webp')
    })
    await runStoreRequest(HOME_IMAGES_STORE, 'readwrite', (store) => store.delete(saved.id))
    await expect(exportHomeSchemeBackup()).rejects.toThrow('home_scheme_image_missing')
    await deleteHomeScheme(saved)
  })
})

it('round-trips a PNG fallback with its actual extension', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.stubGlobal('document', {
    createElement: () => ({
      getContext: () => ({ drawImage() {} }),
      toBlob: (cb: BlobCallback) => cb(null)
    })
  })
  const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1])
  const saved = await saveHomeScheme({
    ...input(),
    tags: [],
    imageFile: new File([bytes], 'a.png', { type: 'image/png' })
  })
  expect(saved.image).toBe(saved.id + '.png')
  let backup!: File
  await exportHomeSchemeBackup(async (name, blob) => {
    backup = new File([blob], name)
  })
  await reset()
  expect(await importHomeSchemeBackup(backup)).toMatchObject({ addedCount: 1, failedCount: 0 })
  const snapshot = await readHomeSchemeSnapshot(),
    record = snapshot.records[0]
  expect(record.image).toBe(saved.image)
  const image = snapshot.images.get(record.id)!
  expect(image.blob.type).toBe('image/png')
  expect(new Uint8Array(await image.blob.arrayBuffer())).toEqual(bytes)
})
