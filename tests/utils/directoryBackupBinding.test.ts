import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
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
  asHandle
} from '../helpers/directoryBackupFs'

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
        const path = [...disk.files.keys()].find((name) => name.endsWith('/模块信息.json'))!
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
    expect([...directory.disk.files.keys()]).toEqual(['暖立方备份/存档信息.json'])
    expect((await inspectRoot(asHandle(directory)))?.backupId).toBe(config.backupId)
  })
})

it('rejects enabling when a previously absent module appears after preview', async () => {
  const directory = new MemoryDirectory()
  const config = await bindDirectory(asHandle(directory))
  const diff = await estimateBackupDiff(config, 'outfits')
  expect(diff.fingerprint).toBe('')
  const root = (await locateRoot(asHandle(directory)))!
  const dir = await moduleDirectory(root, 'outfits', true)
  await putBytes(dir, '模块信息.json', jsonBytes(defaultManifest('outfits')))
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
