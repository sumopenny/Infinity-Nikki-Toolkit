// @vitest-environment node
import { expect, it } from 'vitest'
import { strToU8, zipSync } from 'fflate'
import {
  assertBackupKind,
  backupInputMessage,
  BackupInputError,
  detectBackupKind
} from '../../src/utils/backup/backupDetector'

const zip = (files: Record<string, Uint8Array>) =>
  new File([zipSync(files)], 'backup.zip', { type: 'application/zip' })
const manifest = (format: string, version: number) => strToU8(JSON.stringify({ format, version }))

it.each([
  ['all', 'backup.json', 'infinity-nikki-all-data-backup', 2],
  ['outfits', 'manifest.json', 'infinity-nikki-outfit-backup', 4],
  ['home', 'manifest.json', 'infinity-nikki-home-scheme-backup', 2],
  ['camera', 'favorites.json', 'nikki-camera-favorites', 2]
] as const)(
  'detects %s by its internal manifest, not its filename',
  async (kind, name, format, version) => {
    const file = zip({ [name]: manifest(format, version), 'images/': new Uint8Array() })
    expect(await detectBackupKind(file)).toEqual({ kind, version })
    await expect(assertBackupKind(file, kind)).resolves.toBeUndefined()
  }
)

it('identifies a wrong module before any write and gives actionable Chinese and English warnings', async () => {
  const file = zip({ 'manifest.json': manifest('infinity-nikki-outfit-backup', 2) })
  const error = await assertBackupKind(file, 'all').catch((caught) => caught)
  expect(error).toBeInstanceOf(BackupInputError)
  expect(error).toMatchObject({ reason: 'type_mismatch', actual: 'outfits' })
  expect(backupInputMessage(error, 'zh', 'all')).toContain('搭配码')
  expect(backupInputMessage(error, 'en', 'all')).toContain('outfit')
})

it('rejects missing, unsupported and corrupted manifests without importing data', async () => {
  await expect(detectBackupKind(zip({ 'notes.txt': strToU8('hello') }))).rejects.toMatchObject({
    reason: 'missing_manifest'
  })
  await expect(detectBackupKind(zip({ 'backup.json': strToU8('{') }))).rejects.toMatchObject({
    reason: 'invalid_manifest'
  })
  await expect(
    detectBackupKind(zip({ 'backup.json': manifest('unknown', 1) }))
  ).rejects.toMatchObject({
    reason: 'unsupported_format'
  })
  await expect(
    detectBackupKind(zip({ 'backup.json': manifest('infinity-nikki-all-data-backup', 99) }))
  ).rejects.toMatchObject({ reason: 'unsupported_version', actual: 'all' })
  await expect(detectBackupKind(new File(['not a zip'], 'fake.zip'))).rejects.toMatchObject({
    reason: 'not_zip'
  })
})

it('distinguishes a nested manifest and never exposes user folder names', async () => {
  const error = await detectBackupKind(
    zip({
      'private-user-folder/backup.json': manifest('infinity-nikki-all-data-backup', 2)
    })
  ).catch((error) => error)
  expect(error).toMatchObject({
    reason: 'nested_manifest',
    diagnostics: { entryPath: '<entry>/backup.json', pathDepth: 2 }
  })
  expect(JSON.stringify(error)).not.toContain('private-user-folder')
  expect(backupInputMessage(error, 'zh', 'all')).toContain('额外')
})

it.each(['../backup.json', '/backup.json', 'C:/backup.json', 'private/../backup.json'])(
  'rejects unsafe path %s before manifest detection',
  async (path) => {
    await expect(
      detectBackupKind(zip({ [path]: manifest('infinity-nikki-all-data-backup', 2) }))
    ).rejects.toMatchObject({ reason: 'unsafe_path' })
  }
)

it('does not mistake normal nested module manifests for a repackaged full backup', async () => {
  expect(
    await detectBackupKind(
      zip({
        'backup.json': manifest('infinity-nikki-all-data-backup', 2),
        'home/manifest.json': manifest('infinity-nikki-home-scheme-backup', 2)
      })
    )
  ).toEqual({ kind: 'all', version: 2 })
})

it('rejects duplicate ZIP entries with redacted diagnostics', async () => {
  const { Zip, ZipPassThrough } = await import('fflate')
  const chunks: Uint8Array[] = []
  const archive = new Zip((error, chunk) => { if (error) throw error; chunks.push(chunk) })
  for (let i = 0; i < 2; i++) {
    const entry = new ZipPassThrough('backup.json')
    archive.add(entry)
    entry.push(manifest('infinity-nikki-all-data-backup', 2), true)
  }
  archive.end()
  await expect(detectBackupKind(new File(chunks, 'duplicates.zip'))).rejects.toMatchObject({
    reason: 'duplicate_entry',
    diagnostics: { entryPath: 'backup.json', entryType: 'file', rule: 'duplicate_entry' }
  })
})
