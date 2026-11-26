import 'fake-indexeddb/auto'
import { beforeEach, expect, it } from 'vitest'
import { rebuildBackupDirectory } from '../../src/utils/directory-backup/rebuild'
import { previewRestore } from '../../src/utils/directory-backup/restore'
import {
  resetDatabase,
  setup,
  putOutfit,
  sync,
  asHandle,
  reloadConfig
} from '../helpers/directoryBackupFs'
import { useLegacyJsonClone } from '../helpers/legacyJsonClone'
beforeEach(() => {
  useLegacyJsonClone()
  return resetDatabase()
})
it('rebuilds to direct module paths and retains switches', async () => {
  const { config, directory, disk } = await setup()
  await putOutfit('REC01', 'old')
  await sync(config)
  await putOutfit('REC02', 'new')
  await rebuildBackupDirectory(asHandle(directory), () => {})
  expect((await previewRestore(asHandle(directory))).modules[0]).toMatchObject({
    ready: true,
    backupCount: 2
  })
  expect((await reloadConfig(directory)).enabled).toEqual({
    outfits: true,
    home: false,
    camera: false
  })
  expect([...disk.files.keys()].some((path) => path.includes('重建中/'))).toBe(false)
  expect([...disk.files.keys()].every((path) => /^(搭配码|家园方案|相机参数)\//.test(path))).toBe(
    true
  )
})
it.each(['preparing', 'applying', 'cleanup'])(
  'resumes an interruption during %s without losing the copy',
  async (point) => {
    const { config, directory, disk } = await setup()
    await putOutfit('REC01', 'old')
    await sync(config)
    await putOutfit('REC02', 'new')
    disk.failOnce((e) =>
      point === 'preparing'
        ? e.kind === 'written' && e.path.includes('/新副本/记录/')
        : point === 'applying'
          ? e.kind === 'written' && e.path === '搭配码/记录/REC02.json'
          : e.kind === 'delete' && /重建中\/[^/]+$/.test(e.path)
    )
    await expect(rebuildBackupDirectory(asHandle(directory), () => {})).rejects.toThrow()
    expect(
      [...disk.files.keys()].some((path) => path.endsWith('/旧副本/记录/REC01.json')) ||
        disk.files.has('搭配码/记录/REC01.json')
    ).toBe(true)
    disk.hook = undefined
    await rebuildBackupDirectory(asHandle(directory), () => {})
    expect((await previewRestore(asHandle(directory))).modules[0]).toMatchObject({
      ready: true,
      backupCount: 2
    })
  }
)

it('explicitly rebuilds a foreign archive with the current browser source', async () => {
  const { config, directory } = await setup()
  await putOutfit('OLD01')
  await sync(config)
  await resetDatabase()
  const { loadConfig, inspectRoot } = await import('../../src/utils/directory-backup/engine')
  const next = await loadConfig()
  await putOutfit('NEW01')
  await rebuildBackupDirectory(asHandle(directory), () => {})
  expect((await inspectRoot(asHandle(directory)))?.sourceId).toBe(next.sourceId)
  expect((await previewRestore(asHandle(directory))).modules[0]).toMatchObject({
    ready: true,
    backupCount: 1
  })
})

it('replays deletions after a stale formal record was already removed', async () => {
  const { config, directory, disk } = await setup()
  await putOutfit('OLD01')
  await putOutfit('OLD02')
  await sync(config)
  const { runStoreRequest, OUTFITS_STORE } = await import('../../src/utils/file-system/database')
  await runStoreRequest(OUTFITS_STORE, 'readwrite', (store) => store.clear())
  disk.failOnce((e) => e.kind === 'deleted' && e.path === '搭配码/记录/OLD01.json')
  await expect(rebuildBackupDirectory(asHandle(directory), () => {})).rejects.toThrow()
  await rebuildBackupDirectory(asHandle(directory), () => {})
  expect((await previewRestore(asHandle(directory))).modules[0]).toMatchObject({
    ready: true,
    backupCount: 0
  })
})

it('finishes an interrupted snapshot and keeps later browser edits pending for normal sync', async () => {
  const { config, directory, disk } = await setup()
  await putOutfit('REC01', 'old')
  await sync(config)
  await putOutfit('REC02', 'prepared')
  disk.failOnce((event) => event.kind === 'written' && event.path === '搭配码/记录/REC02.json')
  await expect(rebuildBackupDirectory(asHandle(directory), () => {})).rejects.toThrow()
  await putOutfit('REC01', 'later edit')
  await putOutfit('REC03', 'later new')
  await rebuildBackupDirectory(asHandle(directory), () => {})
  expect([...disk.files.keys()].some((path) => path.includes('重建中/'))).toBe(false)
  expect((await previewRestore(asHandle(directory))).modules[0]).toMatchObject({
    ready: true,
    backupCount: 2
  })
  const result = await sync(await reloadConfig(directory))
  expect(result, JSON.stringify(result)).not.toMatchObject({ state: 'error' })
  expect((await previewRestore(asHandle(directory))).modules[0]).toMatchObject({
    ready: true,
    backupCount: 3
  })
  const { readJson, moduleDirectory, recordPath } =
    await import('../../src/utils/directory-backup/disk')
  expect(
    await readJson(await moduleDirectory(asHandle(directory), 'outfits'), recordPath('REC01'))
  ).toMatchObject({ value: { note: 'later edit' } })
})

it('still rejects a browser edit made after the new recovery confirmation', async () => {
  const { config, directory } = await setup()
  await putOutfit('REC01')
  await sync(config)
  const { browserBaseline } = await import('../../src/utils/directory-backup/repository')
  const expected = await browserBaseline()
  await putOutfit('REC02')
  await expect(rebuildBackupDirectory(asHandle(directory), () => {}, expected)).rejects.toThrow(
    '浏览器数据在确认后已变化'
  )
})

it('distinguishes unused modules from incomplete modules containing files', async () => {
  const { config, directory } = await setup()
  await putOutfit('REC01')
  await sync(config)
  const preview = await previewRestore(asHandle(directory))
  expect(preview.modules.map(({ ready, reason }) => ({ ready, reason }))).toEqual([
    { ready: true, reason: undefined },
    { ready: false, reason: 'neverBackedUp' },
    { ready: false, reason: 'neverBackedUp' }
  ])
  const { directoryAt, putBytes } = await import('../../src/utils/directory-backup/disk')
  await putBytes(
    await directoryAt(asHandle(directory), '家园方案'),
    '记录/leftover.json',
    new TextEncoder().encode('{}')
  )
  expect((await previewRestore(asHandle(directory))).modules[1]).toMatchObject({
    ready: false,
    reason: 'incomplete'
  })
})
