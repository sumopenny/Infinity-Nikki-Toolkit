import 'fake-indexeddb/auto'
import { beforeEach, expect, it } from 'vitest'
import {
  moduleDir,
  resetDatabase,
  setup,
  sync,
  putOutfit,
  asHandle,
  MemoryDirectory,
  date
} from '../helpers/directoryBackupFs'
import { browserBaseline } from '../../src/utils/directory-backup/repository'
import { pauseBackupsForBrowserReset } from '../../src/utils/directory-backup/engine'
import { rebuildBackupDirectory } from '../../src/utils/directory-backup/rebuild'
import { previewRestore } from '../../src/utils/directory-backup/restore'
import { putBytes, jsonBytes } from '../../src/utils/directory-backup/disk'
import {
  clearAllBrowserData,
  OUTFITS_STORE,
  runStoreRequest
} from '../../src/utils/file-system/database'
import { runDatabaseTransaction } from '../../src/utils/file-system/transaction'
import { markConfirmedDeletion } from '../../src/utils/directory-backup/changeJournal'
import { saveCameraFavorite, deleteCameraFavorite } from '../../src/utils/photo-params/favorites'
beforeEach(resetDatabase)
it('refuses reset when another tab saved after confirmation', async () => {
  const { config } = await setup()
  await putOutfit('REC01')
  await sync(config)
  const expected = await browserBaseline()
  await putOutfit('REC02')
  await expect(pauseBackupsForBrowserReset(clearAllBrowserData, expected)).rejects.toThrow(
    '重新确认'
  )
  expect(await runStoreRequest(OUTFITS_STORE, 'readonly', (s) => s.count())).toBe(2)
})
it('refuses rebuild when direct clear changed the confirmed count', async () => {
  const { config, directory } = await setup()
  await putOutfit('REC01')
  await sync(config)
  const expected = await browserBaseline()
  await runStoreRequest(OUTFITS_STORE, 'readwrite', (s) => s.clear())
  await expect(rebuildBackupDirectory(asHandle(directory), () => {}, expected)).rejects.toThrow(
    '重新确认'
  )
  expect((await previewRestore(asHandle(directory))).modules[0].backupCount).toBe(1)
})
it('refuses malformed rebuild paths without deleting formal records', async () => {
  const { config, directory, disk } = await setup()
  await putOutfit('REC01')
  await sync(config)
  const id = crypto.randomUUID()
  const dir = await moduleDir(directory)
  await putBytes(
    dir,
    `_系统/重建中/${id}/重建清单.json`,
    jsonBytes({
      id,
      sourceId: config.sourceId,
      phase: 'ready',
      files: [],
      old: ['../记录/REC01.json']
    })
  )
  const before = new Map(disk.files)
  await expect(rebuildBackupDirectory(asHandle(directory), () => {})).rejects.toThrow()
  expect(disk.files).toEqual(before)
})
it('resumes the final confirmed deletion after its index was removed and manifest write failed', async () => {
  const { config, disk } = await setup()
  await putOutfit('REC01')
  await sync(config)
  await runDatabaseTransaction([OUTFITS_STORE], 'readwrite', async (tx) => {
    markConfirmedDeletion(tx, 'outfits')
    await tx.objectStore(OUTFITS_STORE).delete('REC01')
  })
  disk.failOnce((e) => e.kind === 'write' && e.path.endsWith('/_系统/备份信息.json'))
  expect((await sync(config)).state).toBe('error')
  expect(await sync(config)).toMatchObject({ state: 'synced', count: 0 })
})
it('allows a confirmed single camera deletion to reach zero', async () => {
  const { config } = await setup(new MemoryDirectory(), ['camera'])
  const id = 'CAMERA1'
  await saveCameraFavorite(
    {
      version: 1,
      id,
      name: id,
      tag: '',
      code: id,
      source: 'manual',
      cover: null,
      createdAt: date,
      updatedAt: date,
      result: {
        rawCameraParams: id,
        environmentFields: [],
        cameraFields: [],
        imageFields: [],
        resourceGroups: []
      }
    },
    null
  )
  await sync(config, 'camera')
  await deleteCameraFavorite(id, true)
  expect(await sync(config, 'camera')).toMatchObject({ state: 'synced', count: 0 })
})
