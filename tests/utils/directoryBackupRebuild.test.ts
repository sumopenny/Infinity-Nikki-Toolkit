import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { rebuildBackupDirectory } from '../../src/utils/directory-backup/rebuild'
import { previewRestore } from '../../src/utils/directory-backup/restore'
import { loadConfig } from '../../src/utils/directory-backup/engine'
import {
  DIRECTORY_NAME,
  MODULE_NAMES,
  type RootManifest,
  readJson
} from '../../src/utils/directory-backup/disk'
import {
  resetDatabase,
  setup,
  putOutfit,
  sync,
  asHandle,
  reloadConfig,
  png
} from '../helpers/directoryBackupFs'

beforeEach(resetDatabase)
describe('显式完整重建', () => {
  it('在新代次校验后切换，旧副本清理，关闭的模块不会被自动开启', async () => {
    const { config, directory, disk } = await setup()
    await putOutfit('REC01', 'old', png())
    await sync(config)
    const root = asHandle(await directory.getDirectoryHandle(DIRECTORY_NAME))
    const previous = await readJson<RootManifest>(root, '存档信息.json')
    await putOutfit('REC02', 'new')
    await rebuildBackupDirectory(asHandle(directory), () => undefined)
    const current = await readJson<RootManifest>(root, '存档信息.json')
    expect(current!.backupId).not.toBe(previous!.backupId)
    expect(current!.modulePaths!.outfits).toMatch(/^模块数据\//)
    expect(
      [...disk.files.keys()].some((path) =>
        path.startsWith(`${DIRECTORY_NAME}/${MODULE_NAMES.outfits}/`)
      )
    ).toBe(false)
    expect([...disk.files.keys()].some((path) => path.endsWith('/重建任务.json'))).toBe(false)
    const preview = await previewRestore(asHandle(directory))
    expect(preview.modules.every((module) => module.ready)).toBe(true)
    expect(preview.modules[0].backupCount).toBe(2)
    const latest = await loadConfig()
    expect(latest.enabled).toEqual({ outfits: true, home: false, camera: false })
    await putOutfit('REC02', 'edited')
    expect((await sync(await reloadConfig(directory))).state).toBe('synced')
  })
  it('暂存空间不足时不切换根指针，原有副本保持完整', async () => {
    const { config, directory, disk } = await setup()
    await putOutfit('REC01', 'old', png())
    await sync(config)
    const marker = `${DIRECTORY_NAME}/存档信息.json`,
      before = disk.files.get(marker)!.slice()
    await putOutfit('REC02', 'new')
    disk.failOnce(
      (event) =>
        event.kind === 'write' &&
        event.path.includes('/模块数据/') &&
        event.path.includes('/payload-'),
      new DOMException('Disk full', 'QuotaExceededError')
    )
    await expect(rebuildBackupDirectory(asHandle(directory), () => undefined)).rejects.toThrow(
      '原有副本未被替换'
    )
    expect(disk.files.get(marker)).toEqual(before)
    const preview = await previewRestore(asHandle(directory))
    expect(preview.modules[0].ready).toBe(true)
    expect(preview.modules[0].backupCount).toBe(1)
  })
  it('切换成功、浏览器绑定前中断，下次重建只完成收尾，不销毁新副本', async () => {
    const { config, directory, disk } = await setup()
    await putOutfit('REC01')
    await sync(config)
    await putOutfit('REC02')
    disk.failOnce(
      (event) => event.kind === 'written' && event.path === `${DIRECTORY_NAME}/存档信息.json`
    )
    await expect(rebuildBackupDirectory(asHandle(directory), () => undefined)).rejects.toThrow(
      '新副本已发布'
    )
    expect(disk.files.has(`${DIRECTORY_NAME}/重建任务.json`)).toBe(true)
    expect((await previewRestore(asHandle(directory))).modules[0].backupCount).toBe(2)
    await rebuildBackupDirectory(asHandle(directory), () => undefined)
    expect(disk.files.has(`${DIRECTORY_NAME}/重建任务.json`)).toBe(false)
    expect((await previewRestore(asHandle(directory))).modules[0].backupCount).toBe(2)
  })
  it('重建期间发生编辑则不发布半新半旧数据，并保留新的浏览器编辑', async () => {
    const { config, directory, disk } = await setup()
    await putOutfit('REC01')
    await sync(config)
    const before = disk.files.get(`${DIRECTORY_NAME}/存档信息.json`)!.slice()
    disk.hook = async (event) => {
      if (
        event.kind === 'written' &&
        event.path.includes('/模块数据/') &&
        event.path.includes('/当前记录/')
      ) {
        disk.hook = undefined
        await putOutfit('REC02', 'concurrent')
      }
    }
    await expect(rebuildBackupDirectory(asHandle(directory), () => undefined)).rejects.toThrow(
      '原有副本未被替换'
    )
    expect(disk.files.get(`${DIRECTORY_NAME}/存档信息.json`)).toEqual(before)
    expect((await previewRestore(asHandle(directory))).modules[0].browserCount).toBe(2)
  })
})
