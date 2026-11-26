import 'fake-indexeddb/auto'
import { beforeEach, expect, it, vi } from 'vitest'
import { checkBackupDirectory, readModuleStatus } from '../../src/utils/directory-backup/engine'
import { MODULES } from '../../src/utils/directory-backup/disk'
import { setting } from '../../src/utils/directory-backup/repository'
import { putOutfit, reloadConfig, resetDatabase, setup, sync } from '../helpers/directoryBackupFs'

beforeEach(resetDatabase)

it('detects a deleted backup during a read-only refresh and recovers without persisting a sticky error', async () => {
  const { config, directory, disk } = await setup()
  await putOutfit('HEALTH01')
  await sync(config)
  const fresh = await reloadConfig(directory)
  const files = new Map(disk.files)
  disk.files.clear()
  disk.events = []
  expect(await readModuleStatus(fresh, 'outfits')).toMatchObject({ state: 'error' })
  expect(await setting('error:outfits')).toBeUndefined()
  expect(disk.events.some((event) => ['write', 'delete'].includes(event.kind))).toBe(false)
  disk.files = files
  const recovered = await readModuleStatus(fresh, 'outfits')
  expect(recovered.state).toBe('synced')
  expect(recovered.error).toBeUndefined()
})

it('shares one permission and identity check across all enabled modules', async () => {
  const { config, directory, disk } = await setup(undefined, [...MODULES])
  await putOutfit('HEALTH02')
  for (const module of MODULES) await sync(config, module)
  const fresh = await reloadConfig(directory)
  const permission = vi.spyOn(directory, 'queryPermission')
  disk.events = []
  const check = checkBackupDirectory(fresh)
  const statuses = await Promise.all(
    MODULES.map((module) => readModuleStatus(fresh, module, check))
  )
  expect(statuses.every((status) => status.state === 'synced')).toBe(true)
  expect(permission).toHaveBeenCalledTimes(1)
  expect(disk.events).toHaveLength(3)
  expect(
    disk.events.every(
      (event) => event.kind === 'read' && event.path.endsWith('/_系统/备份信息.json')
    )
  ).toBe(true)
})

it('allows a new empty directory without creating files and reports a deleted new directory', async () => {
  const { config, directory, disk } = await setup()
  expect(await checkBackupDirectory(config)).toBeNull()
  expect(disk.files.size).toBe(0)
  vi.spyOn(directory, 'entries').mockImplementation(async function* () {
    throw new DOMException('gone', 'NotFoundError')
  })
  expect(await checkBackupDirectory(config)).toMatchObject({
    state: 'error',
    error: expect.stringContaining('不可访问')
  })
})

it('reports lost permission and allows recovery without requesting permission in the background', async () => {
  const { config, directory, disk } = await setup()
  const request = vi.spyOn(directory, 'requestPermission')
  disk.granted = false
  expect(await readModuleStatus(config, 'outfits')).toMatchObject({ state: 'permission' })
  disk.granted = true
  expect(await readModuleStatus(config, 'outfits')).toMatchObject({ state: 'initializing' })
  expect(request).not.toHaveBeenCalled()
})

it('does not inspect or resume paused or disabled backups', async () => {
  const { config, directory } = await setup()
  const permission = vi.spyOn(directory, 'queryPermission')
  config.paused = true
  expect(await checkBackupDirectory(config)).toBeNull()
  expect((await readModuleStatus(config, 'outfits')).state).toBe('paused')
  config.paused = false
  config.enabled.outfits = false
  expect(await checkBackupDirectory(config)).toBeNull()
  expect(permission).not.toHaveBeenCalled()
})

it('does not clear persisted write failures after directory access recovers', async () => {
  const { config, directory, disk } = await setup()
  await putOutfit('HEALTH03')
  await sync(config)
  await putOutfit('HEALTH04')
  disk.failOnce((event) => event.kind === 'write', new Error('write failed'))
  expect((await sync(config)).state).toBe('error')
  const fresh = await reloadConfig(directory)
  expect(await checkBackupDirectory(fresh)).toBeNull()
  expect(await readModuleStatus(fresh, 'outfits')).toMatchObject({
    state: 'error',
    error: 'write failed'
  })
  expect((await sync(fresh)).state).toBe('synced')
  expect((await readModuleStatus(await reloadConfig(directory), 'outfits')).state).toBe('synced')
})
