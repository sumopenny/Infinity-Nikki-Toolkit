// @vitest-environment node
import { expect, it } from 'vitest'
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import { setupOutfitDatabaseTests, webp, resetOutfitDatabase } from '../helpers/outfitDatabase'
import { saveOutfit, deleteOutfit, readOutfitSnapshot } from '../../src/utils/outfit/outfitStorage'
import {
  exportOutfitBackup,
  importOutfitBackup,
  prepareOutfitBackup
} from '../../src/utils/outfit/outfitBackup'
import { OUTFIT_BACKUP_LIMITS } from '../../src/utils/backup/zipBackup'
setupOutfitDatabaseTests()
const input = (code: string) => ({ imageFile: webp(), code, tag: null, note: '备注' })
function archive(records: unknown[], images: Record<string, Uint8Array>, version = 1) {
  return new File(
    [
      zipSync({
        'manifest.json': strToU8(
          JSON.stringify({
            format: 'infinity-nikki-outfit-backup',
            version,
            tags: ['甜美'],
            outfits: records,
            ...(version === 2 ? { ignoredCodes: ['DELETED'] } : {})
          })
        ),
        ...images
      })
    ],
    'backup.zip'
  )
}
const raw = (id = 'one', code = 'CODE1') => ({
  id,
  image: `images/${id}.webp`,
  code,
  tags: ['甜美'],
  note: '旧备注',
  createdAt: '2026-07-31T00:00:00.000Z'
})

it('imports existing version 1 backups into the global database and keeps code deduplication', async () => {
  const file = archive([raw()], { 'images/one.webp': new Uint8Array(await webp().arrayBuffer()) })
  expect(await importOutfitBackup(file)).toMatchObject({ addedCount: 1, failedCount: 0 })
  expect((await readOutfitSnapshot()).records[0]).toMatchObject({ note: '旧备注', tags: ['甜美'] })
  expect(await importOutfitBackup(file)).toMatchObject({
    addedCount: 0,
    duplicateCount: 1,
    failedCount: 0
  })
})
it('exports and restores version 2 records, pending records, images and persistent ignores', async () => {
  await saveOutfit(input('CODE1'))
  await saveOutfit(input(''))
  await deleteOutfit(await saveOutfit(input('DELETED')))
  let backup: File | undefined
  await exportOutfitBackup(async (name, blob) => {
    backup = new File([blob], name)
  })
  const manifest = JSON.parse(
    strFromU8(unzipSync(new Uint8Array(await backup!.arrayBuffer()))['manifest.json'])
  )
  expect(manifest.version).toBe(2)
  expect(manifest.ignoredCodes).toContain('DELETED')
  expect(
    manifest.outfits.every((record: Record<string, unknown>) => !('gameSourceId' in record))
  ).toBe(true)
  await resetOutfitDatabase()
  expect(await importOutfitBackup(backup!)).toMatchObject({ addedCount: 2, failedCount: 0 })
  const restored = await readOutfitSnapshot()
  expect(restored.records).toHaveLength(2)
  expect(restored.images.size).toBe(2)
  expect(restored.ignoredCodes).toContain('DELETED')
  expect(await importOutfitBackup(backup!)).toMatchObject({ addedCount: 0, duplicateCount: 2 })
})
it('rejects missing images, unsafe paths and invalid WebP data before saving any records', async () => {
  const valid = new Uint8Array(await webp().arrayBuffer())
  for (const file of [
    archive([raw()], {}),
    archive([raw()], { '../one.webp': valid }),
    archive([raw(), raw('two', 'CODE2')], {
      'images/one.webp': valid,
      'images/two.webp': strToU8('invalid')
    })
  ]) {
    await expect(importOutfitBackup(file)).rejects.toThrow()
    expect((await readOutfitSnapshot()).records).toHaveLength(0)
  }
})
it('explicit backup restoration lifts the restored code without clearing unrelated ignores', async () => {
  await deleteOutfit(await saveOutfit(input('CODE1')))
  await deleteOutfit(await saveOutfit(input('OTHER')))
  const file = archive([raw()], { 'images/one.webp': new Uint8Array(await webp().arrayBuffer()) })
  await importOutfitBackup(file)
  expect((await readOutfitSnapshot()).ignoredCodes).toEqual(['OTHER'])
})
it('restores code-only outfits without image files and allows adding the image later', async () => {
  const empty = { code: '  ', tag: null, note: '备注' }
  await expect(saveOutfit(empty)).rejects.toThrow()
  const original = await saveOutfit({ ...empty, code: 'CODE1' })
  await expect(saveOutfit({ ...empty, outfit: original })).rejects.toThrow()
  let backup!: File
  await exportOutfitBackup(async (name, blob) => {
    backup = new File([blob], name)
  })
  await resetOutfitDatabase()
  const result = await importOutfitBackup(backup)
  expect(result).toMatchObject({ addedCount: 1, failedCount: 0 })
  expect((await readOutfitSnapshot()).images.size).toBe(0)
  const outfit = result.library.outfits[0]
  expect(outfit).toMatchObject({ id: original.id, code: 'CODE1', image: '' })
  await saveOutfit({ ...input('CODE1'), outfit })
  expect((await readOutfitSnapshot()).images.get(original.id)?.size).toBeGreaterThan(0)
})

it('exports complete independently importable parts', async () => {
  for (let i = 0; i < 5; i++) await saveOutfit(input('CODE' + i))
  const old = OUTFIT_BACKUP_LIMITS.records,
    files: File[] = []
  OUTFIT_BACKUP_LIMITS.records = 2
  try {
    const result = await exportOutfitBackup(async (name, blob) => {
      files.push(new File([blob], name))
    })
    expect(result.fileNames).toHaveLength(3)
    await resetOutfitDatabase()
    let added = 0
    for (const file of files) {
      const result = await importOutfitBackup(file)
      expect(result.failedCount).toBe(0)
      added += result.addedCount
    }
    expect(added).toBe(5)
    expect((await readOutfitSnapshot()).records).toHaveLength(5)
  } finally {
    OUTFIT_BACKUP_LIMITS.records = old
  }
})

// 多格式往返必须保留字节、类型、扩展名及备注编辑后的图片。
it.each([
  ['png', false],
  ['jpg', false],
  ['png', true],
  ['jpg', true]
] as const)(
  'round-trips original %s after encoding fallback (prepared=%s)',
  async (extension, prepared) => {
    const { vi } = await import('vitest')
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.stubGlobal('document', {
      createElement: () => ({
        getContext: () => ({ drawImage() {} }),
        toBlob: (cb: BlobCallback) => cb(null)
      })
    })
    const bytes = new Uint8Array(
      extension === 'png' ? [137, 80, 78, 71, 13, 10, 26, 10, 1] : [255, 216, 255, 224, 1]
    )
    const original = new File([bytes], 'wrong.webp', { type: 'image/png' })
    // 原始名称不能伪装成 WebP；直接使用实际格式名称触发编码。
    const file = new File([original], 'photo.' + extension, {
      type: extension === 'jpg' ? 'image/jpeg' : 'image/png'
    })
    const saved = await saveOutfit({ ...input(''), imageFile: file })
    const edited = await saveOutfit({ outfit: saved, code: '', tag: null, note: 'edited' })
    expect(edited.image).toBe(saved.id + '.' + extension)
    let backup!: File
    await exportOutfitBackup(async (name, blob) => {
      backup = new File([blob], name)
    })
    const entries = unzipSync(new Uint8Array(await backup.arrayBuffer()))
    expect(JSON.parse(strFromU8(entries['manifest.json'])).version).toBe(3)
    expect(entries['images/' + edited.image]).toEqual(bytes)
    await resetOutfitDatabase()
    const result = prepared
      ? await (await prepareOutfitBackup(backup)).apply()
      : await importOutfitBackup(backup)
    expect(result).toMatchObject({ addedCount: 1, failedCount: 0 })
    const snapshot = await readOutfitSnapshot(),
      record = snapshot.records[0],
      image = snapshot.images.get(record.id)!
    expect(record.image).toBe(edited.image)
    expect(image.blob.type).toBe(file.type)
    expect(new Uint8Array(await image.blob.arrayBuffer())).toEqual(bytes)
  }
)
it('rejects image extension and content mismatch before writing', async () => {
  const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])
  await expect(importOutfitBackup(archive([raw()], { 'images/one.webp': png }))).rejects.toThrow(
    'format_mismatch'
  )
  expect((await readOutfitSnapshot()).records).toHaveLength(0)
})

it('round trips source URLs including repeated and encoded parameters', async () => {
  const sourceUrl = 'https://example.com/a%2fb?x=1&x=2&q=a+b#part%20one'
  await saveOutfit({ code: 'SOURCE', tag: null, sourceUrl })
  let backup!: File
  await exportOutfitBackup(async (name, blob) => {
    backup = new File([blob], name)
  })
  await resetOutfitDatabase()
  await importOutfitBackup(backup)
  expect((await readOutfitSnapshot()).records[0].sourceUrl).toBe(sourceUrl)
})
