import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  bindDirectory,
  inspectRoot,
  setModuleEnabled
} from '../../src/utils/directory-backup/engine'
import { loadConfig } from '../../src/utils/directory-backup/repository'
import * as repository from '../../src/utils/directory-backup/repository'
import {
  defaultManifest,
  moduleDirectory,
  jsonBytes,
  putBytes
} from '../../src/utils/directory-backup/disk'
import { locateRoot } from '../../src/utils/directory-backup/engine'
import { confirmEnable, estimateBackupDiff } from '../../src/utils/directory-backup/diff'
import {
  resetDatabase,
  setup,
  putOutfit,
  sync,
  reloadConfig,
  MemoryDirectory,
  asHandle,
  png
} from '../helpers/directoryBackupFs'

afterEach(() => vi.restoreAllMocks())
beforeEach(resetDatabase)
describe('重新绑定已有目录的预览防冲突', () => {
  it.each(['record', 'settings', 'disk'] as const)(
    '确认期间 %s 变化不允许继续按旧预览绑定',
    async (change) => {
      const { directory, config, disk } = await setup()
      await putOutfit('BIND01')
      await sync(config)
      const current = await reloadConfig(directory)
      const marker = await inspectRoot(asHandle(directory))
      const diff = await estimateBackupDiff(current, 'outfits')
      const preview = {
        binding: current.binding,
        backupId: marker?.backupId,
        enabled: { ...current.enabled },
        diffs: { outfits: diff }
      }
      if (change === 'record') await putOutfit('BIND02')
      if (change === 'settings') await setModuleEnabled('camera', true)
      if (change === 'disk') {
        const path = [...disk.files.keys()].find((name) => name.endsWith('/_系统/备份信息.json'))!
        const manifest = JSON.parse(new TextDecoder().decode(disk.files.get(path)))
        manifest.lastSuccess = '2026-11-01T00:00:00.000Z'
        disk.files.set(path, new TextEncoder().encode(JSON.stringify(manifest)))
      }
      disk.events = []
      await expect(bindDirectory(asHandle(directory), preview)).rejects.toThrow('重新预览')
      expect((await loadConfig()).binding).toBe(current.binding)
      expect(disk.events.filter((event) => ['write', 'delete'].includes(event.kind))).toEqual([])
    }
  )

  it('首次选择目录只建立根身份，保持三个开关关闭', async () => {
    const directory = new MemoryDirectory()
    const config = await bindDirectory(asHandle(directory))
    expect(config.enabled).toEqual({ outfits: false, home: false, camera: false })
    expect([...directory.disk.files.keys()]).toEqual([
      '搭配码/_系统/备份信息.json',
      '家园方案/_系统/备份信息.json',
      '相机参数收藏/_系统/备份信息.json'
    ])
    expect((await inspectRoot(asHandle(directory)))?.backupId).toBe(config.backupId)
  })
})

it('rejects enabling when a previously absent module appears after preview', async () => {
  const directory = new MemoryDirectory()
  const config = await bindDirectory(asHandle(directory))
  const diff = await estimateBackupDiff(config, 'outfits')
  expect(diff.fingerprint).toHaveLength(64)
  const root = (await locateRoot(asHandle(directory)))!
  const dir = await moduleDirectory(root, 'outfits', true)
  await putBytes(dir, '_系统/备份信息.json', jsonBytes(defaultManifest('outfits')))
  // fake-indexeddb cannot persist the methods of an in-memory directory handle.
  const readConfig = vi.spyOn(repository, 'loadConfig').mockResolvedValueOnce(config)
  try {
    directory.disk.events = []
    await expect(confirmEnable('outfits', diff)).rejects.toThrow('重新预览')
    expect((await loadConfig()).enabled.outfits).toBe(false)
    expect(directory.disk.events.filter((event) => event.kind === 'write')).toEqual([])
  } finally {
    readConfig.mockRestore()
  }
})

it('reuses a completed unchanged backup on re-enable without disk writes or image reads', async () => {
  const { config, directory, disk } = await setup()
  await putOutfit('REUSE01', '', png())
  await sync(config)
  const before = new Map(disk.files)
  await setModuleEnabled('outfits', false)
  const disabled = await reloadConfig(directory)
  const diff = await estimateBackupDiff(disabled, 'outfits')
  expect(diff).toMatchObject({ added: 0, updated: 0, removed: 0 })
  vi.spyOn(repository, 'loadConfig').mockResolvedValue(disabled)
  disk.events = []
  const enabled = await confirmEnable('outfits', diff)
  expect(enabled.initialized.outfits).toBe(true)
  enabled.handle = asHandle(directory)
  const { readModuleStatus } = await import('../../src/utils/directory-backup/engine')
  expect((await readModuleStatus(enabled, 'outfits')).state).toBe('synced')
  expect((await sync(enabled)).state).toBe('synced')
  expect(disk.files).toEqual(before)
  expect(
    disk.events.filter((event) => ['write', 'written', 'delete', 'deleted'].includes(event.kind))
  ).toEqual([])
  expect(disk.events.some((event) => event.path.includes('/图片/'))).toBe(false)
})
it('still synchronizes metadata changes while disabled when record counts are unchanged', async () => {
  const { config, directory } = await setup()
  await putOutfit('TAGS01')
  await sync(config)
  await setModuleEnabled('outfits', false)
  const { runStoreRequest, OUTFIT_TAGS_STORE } =
    await import('../../src/utils/file-system/database')
  await runStoreRequest(OUTFIT_TAGS_STORE, 'readwrite', (store) => store.put(['新标签'], 'default'))
  const disabled = await reloadConfig(directory)
  const diff = await estimateBackupDiff(disabled, 'outfits')
  expect(diff).toMatchObject({ added: 0, updated: 0, removed: 0 })
  expect(diff.changes).toContainEqual({ kind: 'tags', id: 'default' })
  vi.spyOn(repository, 'loadConfig').mockResolvedValue(disabled)
  const enabled = await confirmEnable('outfits', diff)
  expect(enabled.initialized.outfits).toBe(true)
  enabled.handle = asHandle(directory)
  expect((await sync(enabled)).state).toBe('synced')
})
it('does not treat an empty first backup as an already completed backup', async () => {
  const directory = new MemoryDirectory()
  const disabled = await bindDirectory(asHandle(directory))
  const diff = await estimateBackupDiff(disabled, 'outfits')
  expect(diff).toMatchObject({ added: 0, updated: 0, removed: 0 })
  vi.spyOn(repository, 'loadConfig').mockResolvedValue(disabled)
  expect((await confirmEnable('outfits', diff)).initialized.outfits).toBe(false)
})

it('persists the reviewed differences and syncs only changed IDs without a second scan', async () => {
  const { config, directory, disk } = await setup()
  for (const id of ['KEEP01', 'EDIT01', 'REMOVE01']) await putOutfit(id, '', png())
  await sync(config)
  await setModuleEnabled('outfits', false)
  await putOutfit('EDIT01', 'changed note', png())
  await putOutfit('NEW01')
  const { runStoreRequest, OUTFITS_STORE } = await import('../../src/utils/file-system/database')
  await runStoreRequest(OUTFITS_STORE, 'readwrite', (store) => store.delete('REMOVE01'))
  const disabled = await reloadConfig(directory)
  const diff = await estimateBackupDiff(disabled, 'outfits')
  expect(diff).toMatchObject({ added: 1, updated: 1, removed: 1 })
  expect(diff.changes).toEqual(
    expect.arrayContaining([
      { kind: 'record', id: 'EDIT01' },
      { kind: 'record', id: 'NEW01' },
      { kind: 'record', id: 'REMOVE01', deleted: true }
    ])
  )
  vi.spyOn(repository, 'loadConfig').mockResolvedValue(disabled)
  const enabled = await confirmEnable('outfits', diff)
  expect(enabled.initialized.outfits).toBe(true)
  vi.restoreAllMocks()
  const scan = vi.spyOn(repository, 'currentKeys')
  // Reload the persisted queue/config to model leaving and reopening the page.
  const resumed = await reloadConfig(directory)
  disk.events = []
  expect((await sync(resumed)).state).toBe('synced')
  expect(scan).not.toHaveBeenCalled()
  expect(
    disk.events
      .filter((e) => e.kind === 'written' && e.path.includes('/记录/'))
      .map((e) => e.path)
      .sort()
  ).toEqual(['搭配码/记录/EDIT01.json', '搭配码/记录/NEW01.json'])
  expect(disk.files.has('搭配码/记录/REMOVE01.json')).toBe(false)
  expect(
    disk.events.some((e) => ['read', 'write'].includes(e.kind) && e.path.includes('/图片/'))
  ).toBe(false)
})

it('includes ignored-code changes and updates metadata without scanning records', async () => {
  const { config, directory, disk } = await setup()
  await putOutfit('KEEP01', '', png())
  await sync(config)
  await setModuleEnabled('outfits', false)
  const { runStoreRequest, OUTFIT_IGNORED_CODES_STORE } =
    await import('../../src/utils/file-system/database')
  await runStoreRequest(OUTFIT_IGNORED_CODES_STORE, 'readwrite', (store) =>
    store.put({ code: 'IGNORE01', deletedAt: '2026-11-25T01:00:00Z' })
  )
  const disabled = await reloadConfig(directory)
  const diff = await estimateBackupDiff(disabled, 'outfits')
  expect(diff.changes).toContainEqual({ kind: 'ignored', id: 'IGNORE01' })
  vi.spyOn(repository, 'loadConfig').mockResolvedValue(disabled)
  const enabled = await confirmEnable('outfits', diff)
  enabled.handle = asHandle(directory)
  const scan = vi.spyOn(repository, 'currentKeys')
  disk.events = []
  expect((await sync(enabled)).state).toBe('synced')
  expect(scan).not.toHaveBeenCalled()
  expect(disk.events.some((e) => e.path.includes('/记录/') || e.path.includes('/图片/'))).toBe(
    false
  )
  const { readJson } = await import('../../src/utils/directory-backup/disk')
  expect(
    await readJson(await moduleDirectory(asHandle(directory), 'outfits'), '忽略搭配码.json')
  ).toMatchObject({ IGNORE01: { code: 'IGNORE01' } })
})

it('keeps edits made after confirmation instead of applying the reviewed old value', async () => {
  const { config, directory } = await setup()
  await putOutfit('EDIT01')
  await sync(config)
  await setModuleEnabled('outfits', false)
  await putOutfit('EDIT01', 'reviewed')
  const disabled = await reloadConfig(directory)
  const diff = await estimateBackupDiff(disabled, 'outfits')
  vi.spyOn(repository, 'loadConfig').mockResolvedValue(disabled)
  const enabled = await confirmEnable('outfits', diff)
  await putOutfit('EDIT01', 'latest')
  enabled.handle = asHandle(directory)
  expect((await sync(enabled)).state).toBe('synced')
  const { readJson } = await import('../../src/utils/directory-backup/disk')
  expect(
    await readJson(await moduleDirectory(asHandle(directory), 'outfits'), '记录/EDIT01.json')
  ).toMatchObject({ value: { note: 'latest' } })
})

it.each(['browser', 'disk'] as const)(
  'rejects a stale change plan after %s changes',
  async (change) => {
    const { config, directory, disk } = await setup()
    await putOutfit('EDIT01')
    await sync(config)
    await setModuleEnabled('outfits', false)
    await putOutfit('EDIT01', 'reviewed')
    const disabled = await reloadConfig(directory)
    const diff = await estimateBackupDiff(disabled, 'outfits')
    if (change === 'browser') await putOutfit('EDIT01', 'latest')
    else {
      const path = '搭配码/_系统/备份信息.json'
      const manifest = JSON.parse(new TextDecoder().decode(disk.files.get(path)))
      disk.files.set(path, jsonBytes({ ...manifest, lastSuccess: '2026-11-24T00:00:00Z' }))
    }
    vi.spyOn(repository, 'loadConfig').mockResolvedValue(disabled)
    disk.events = []
    await expect(confirmEnable('outfits', diff)).rejects.toThrow('重新预览')
    expect((await repository.setting<repository.BackupConfig>('config'))?.enabled.outfits).toBe(
      false
    )
    expect(disk.events.some((event) => ['write', 'delete'].includes(event.kind))).toBe(false)
  }
)

it('binds an existing archive from another browser without restoring data and continues backup', async () => {
  const { config, directory, disk } = await setup()
  await putOutfit('OLD01')
  await sync(config)
  const marker = (await inspectRoot(asHandle(directory)))!
  const before = new Map(disk.files)
  await resetDatabase()
  await putOutfit('NEW01')
  const current = await loadConfig()
  expect(current.sourceId).not.toBe(marker.sourceId)
  disk.events = []
  const chosen = await bindDirectory(asHandle(directory), {
    binding: current.binding,
    backupId: marker.backupId,
    sourceId: marker.sourceId,
    enabled: { ...current.enabled },
    diffs: {}
  })
  expect(chosen.sourceId).toBe(current.sourceId)
  expect(chosen.directorySourceId).toBe(marker.sourceId)
  expect(chosen.paused).toBe(false)
  expect(disk.files).toEqual(before)
  expect(await repository.countBrowserRecords('outfits')).toBe(1)
  const diff = await estimateBackupDiff(chosen, 'outfits')
  expect(diff).toMatchObject({ added: 1, removed: 1 })
  vi.spyOn(repository, 'loadConfig').mockResolvedValue(chosen)
  await confirmEnable('outfits', diff)
  vi.restoreAllMocks()
  expect((await sync(await reloadConfig(directory))).state).toBe('synced')
  const { previewRestore } = await import('../../src/utils/directory-backup/restore')
  expect((await previewRestore(asHandle(directory))).modules[0]).toMatchObject({
    ready: true,
    backupCount: 1
  })
  expect(disk.files.has('搭配码/记录/NEW01.json')).toBe(true)
  expect(disk.files.has('搭配码/记录/OLD01.json')).toBe(false)
})
