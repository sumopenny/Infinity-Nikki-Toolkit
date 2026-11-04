import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { resumeSource, previewRestore } from '../../src/utils/directory-backup/restore'
import { dirtyChanges } from '../../src/utils/directory-backup/repository'
import {
  digest,
  jsonBytes,
  stageAndApply,
  MAX_JSON_BYTES,
  defaultManifest,
  recordPath,
  keyHash
} from '../../src/utils/directory-backup/disk'
import { createUuid } from '../../src/utils/uuid'
import { setup, resetDatabase, putOutfit, sync, asHandle } from '../helpers/directoryBackupFs'

beforeEach(resetDatabase)
describe('目录恢复回归', () => {
  it('超出恢复格式上限的 JSON 在准备阶段即拒绝，不能标为完整备份', async () => {
    const { directory, disk } = await setup()
    await expect(
      stageAndApply(asHandle(directory), 'outfits', [
        { path: recordPath(await keyHash('TOO-LARGE')), data: new Uint8Array(MAX_JSON_BYTES + 1) },
        { path: '模块信息.json', data: jsonBytes(defaultManifest('outfits')) }
      ])
    ).rejects.toThrow('超过格式允许的大小')
    expect(disk.files.size).toBe(0)
  })

  it('原浏览器通过恢复窗口续写后正确确认队列和模块校验点', async () => {
    const { config, directory, disk } = await setup()
    await putOutfit('REC01')
    expect((await sync(config)).state).toBe('synced')
    await putOutfit('REC01', '更新')
    disk.failOnce((e) => e.kind === 'written' && e.path.endsWith('/ready.json'))
    expect((await sync(config)).state).toBe('error')
    await resumeSource(asHandle(directory), 'outfits')
    expect(await dirtyChanges('outfits')).toEqual([])
    expect((await previewRestore(asHandle(directory))).modules[0].ready).toBe(true)
    expect((await sync(config)).state).toBe('synced')
  })

  it('暂存批次身份不属于来源存档时拒绝续写，来源目录不发生写入', async () => {
    const { config, directory, disk } = await setup()
    await putOutfit('REC01')
    await sync(config)
    await putOutfit('REC01', '更新')
    disk.failOnce((e) => e.kind === 'written' && e.path.endsWith('/ready.json'))
    await sync(config)
    const path = [...disk.files.keys()].find(
      (name) => name.includes('/.写入中/') && name.endsWith('/manifest.json')
    )!
    const manifest = JSON.parse(new TextDecoder().decode(disk.files.get(path)))
    manifest.receipt.sourceId = createUuid()
    const bytes = jsonBytes(manifest)
    disk.files.set(path, bytes)
    disk.files.set(
      path.replace('manifest.json', 'ready.json'),
      jsonBytes({ sha256: await digest(bytes.buffer as ArrayBuffer) })
    )
    disk.events = []
    expect((await previewRestore(asHandle(directory))).modules[0].canResume).toBe(false)
    await expect(resumeSource(asHandle(directory), 'outfits')).rejects.toThrow('存档')
    expect(disk.events.filter((e) => ['write', 'delete'].includes(e.kind))).toEqual([])
  })
})
