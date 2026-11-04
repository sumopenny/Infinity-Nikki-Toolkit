import 'fake-indexeddb/auto'
import { beforeEach, expect, it } from 'vitest'
import {
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
import {
  DIRECTORY_NAME,
  digest,
  readBytes,
  readJson,
  putBytes,
  jsonBytes
} from '../../src/utils/directory-backup/disk'
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
it('never deletes the generation referenced by the current root even with a malformed journal', async () => {
  const { config, directory, disk } = await setup()
  await putOutfit('REC01')
  await sync(config)
  const handle = asHandle(directory)
  await rebuildBackupDirectory(handle, () => {})
  const root = asHandle(await directory.getDirectoryHandle(DIRECTORY_NAME))
  const info = await readJson<any>(root, '存档信息.json')
  const generation = info.modulePaths.outfits.split('/')[1]
  await putBytes(
    root,
    '重建任务.json',
    jsonBytes({
      format: info.format,
      version: 1,
      sourceId: info.sourceId,
      generation,
      nextBackupId: crypto.randomUUID(),
      baseDigest: await digest((await readBytes(root, '存档信息.json'))!),
      previous: info
    })
  )
  const before = new Map(disk.files)
  await expect(rebuildBackupDirectory(handle, () => {})).rejects.toThrow('拒绝删除')
  expect(disk.files).toEqual(before)
})
it('resumes the final confirmed deletion after its index was removed and manifest write failed', async () => {
  const { config, disk } = await setup()
  await putOutfit('REC01')
  await sync(config)
  await runDatabaseTransaction([OUTFITS_STORE], 'readwrite', async (tx) => {
    markConfirmedDeletion(tx, 'outfits')
    tx.objectStore(OUTFITS_STORE).delete('REC01')
  })
  disk.failOnce((e) => e.kind === 'write' && e.path.endsWith('/模块信息.json'))
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
