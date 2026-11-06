import 'fake-indexeddb/auto'
import { defineComponent, provide, ref } from 'vue'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ArchiveCloudDialog from '../../src/components/ArchiveCloudDialog.vue'
import ArchiveCloudActions from '../../src/components/ArchiveCloudActions.vue'
import {
  archiveCloudKey,
  useArchiveCloudSync,
  type ArchiveCloudSync
} from '../../src/composables/useArchiveCloudSync'
import { cloudRequest } from '../../src/utils/resonance/cloudClient'
import {
  getArchiveHead,
  getArchiveSnapshot,
  writeArchive
} from '../../src/utils/cloud/archiveClient'
import { clearAllBrowserData, runStoreRequest } from '../../src/utils/file-system/database'
import { saveResonanceRecords } from '../../src/utils/resonance/resonanceStorage'
import { updateWardrobe } from '../../src/utils/wardrobe/wardrobeStorage'
import { readArchiveLocal } from '../../src/utils/cloud/archiveStorage'
import { CloudRequestError } from '../../src/utils/cloud/cloudClient'
import {
  archiveHead,
  archiveSnapshot,
  resonanceFixture,
  wardrobeFixture
} from '../fixtures/archiveCloud'
import type { ArchiveDialogAction } from '../../src/composables/useArchiveCloudSync'
vi.mock('../../src/utils/resonance/cloudClient', () => ({ cloudRequest: vi.fn() }))
vi.mock('../../src/utils/cloud/archiveClient', () => ({
  getArchiveHead: vi.fn(),
  getArchiveSnapshot: vi.fn(),
  writeArchive: vi.fn()
}))
vi.mock('../../src/utils/errorReporting/errorReporter', async (original) => ({
  ...(await original<typeof import('../../src/utils/errorReporting/errorReporter')>()),
  reportError: vi.fn()
}))
const user = { id: 'user-a', username: 'nikki' }
let sync: ArchiveCloudSync, wrapper: VueWrapper
const panel = () => document.body.querySelector('dialog')!
const settle = async () => {
  await flushPromises()
  await vi.waitFor(() => expect(sync.busy.value).toBe(false))
  await flushPromises()
}
const open = async (action: ArchiveDialogAction) => {
  await sync.open(action)
  await settle()
}
const submit = async () => {
  panel()
    .querySelector('form')!
    .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  await settle()
}
beforeEach(async () => {
  vi.resetAllMocks()
  vi.mocked(cloudRequest).mockResolvedValue({ user })
  vi.mocked(getArchiveHead).mockResolvedValue(archiveHead())
  vi.mocked(getArchiveSnapshot).mockResolvedValue(archiveSnapshot())
  vi.mocked(writeArchive).mockResolvedValue({
    revisions: { resonance: 2, wardrobe: 2 },
    replayed: false
  })
  await clearAllBrowserData()
  await saveResonanceRecords([resonanceFixture('local')])
  await updateWardrobe(() => ({ ...wardrobeFixture(), regionScope: 'cn' }))
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '')
  }
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open')
  }
  wrapper = mount(
    defineComponent({
      components: { ArchiveCloudDialog, ArchiveCloudActions },
      setup() {
        sync = useArchiveCloudSync()
        provide(archiveCloudKey, sync)
        return { showEntry: ref(true) }
      },
      template:
        '<div><ArchiveCloudActions v-if="showEntry" language="zh"/><ArchiveCloudActions v-else language="zh"/><ArchiveCloudDialog language="zh"/></div>'
    })
  )
  await settle()
})
afterEach(() => {
  wrapper.unmount()
  vi.restoreAllMocks()
})
describe('shared archive cloud window', () => {
  it.each(['upload', 'download'] as const)(
    'keeps comparison roles visible after deselecting a module for %s',
    async (action) => {
      await open(action)
      const module = panel().querySelector('.archive-cloud-module')!
      const checkbox = module.querySelector<HTMLInputElement>('input[type=checkbox]')!
      checkbox.click()
      await flushPromises()
      expect(sync.selected.value).toEqual(['wardrobe'])
      expect(module.classList.contains('is-selected')).toBe(false)
      expect(module.querySelector('.archive-cloud-module-label .archive-cloud-badge')).toBeNull()
      const headings = module.querySelectorAll('.archive-cloud-save-heading')
      expect(headings[0].textContent).toContain('来源')
      expect(headings[1].textContent).toContain('将被替换')
      expect(headings[0].textContent).toContain(action === 'upload' ? '本机存档' : '云端存档')
      expect(module.querySelector('.archive-cloud-date br')).toBeNull()
      expect(module.querySelector('time')?.getAttribute('datetime')).toBeTruthy()
      checkbox.click()
      await flushPromises()
      expect(sync.selected.value).toContain('resonance')
    }
  )
  it('shares the same window across page entry components and does not sync on session restoration', async () => {
    expect(getArchiveHead).not.toHaveBeenCalled()
    await wrapper
      .findComponent(ArchiveCloudActions)
      .findAll('button')
      .find((b) => b.text() === '上传云端')!
      .trigger('click')
    await settle()
    expect(sync.selected.value).toEqual(['resonance', 'wardrobe'])
    await wrapper.setData({ showEntry: false })
    expect(panel().hasAttribute('open')).toBe(true)
    expect(document.body.querySelectorAll('dialog')).toHaveLength(1)
  })
  it('defaults both modules and submits them in one request with unchanged action labels', async () => {
    await open('upload')
    expect(panel().querySelector('h2')?.textContent).toBe('上传云端')
    expect(panel().querySelector('button[type=submit]')?.textContent?.trim()).toBe('确认')
    expect(panel().querySelectorAll('input:checked')).toHaveLength(2)
    expect(panel().textContent).toContain('国服')
    await submit()
    expect(writeArchive).toHaveBeenCalledTimes(1)
    expect(writeArchive).toHaveBeenCalledWith(
      'upload',
      user,
      expect.objectContaining({
        modules: {
          resonance: { revision: 1, records: [resonanceFixture('local')] },
          wardrobe: { revision: 1, data: expect.objectContaining({ regionScope: 'cn' }) }
        }
      })
    )
    expect(wrapper.findComponent(ArchiveCloudDialog).emitted('notice')?.at(-1)?.[0]).toMatchObject({
      tone: 'success',
      message: expect.stringContaining('共鸣记录 1 条')
    })
  })
  it('downloads both modules atomically and signals the shared page refresh', async () => {
    await open('download')
    expect(panel().querySelector('h2')?.textContent).toBe('从云端同步')
    await submit()
    expect(getArchiveSnapshot).toHaveBeenCalledWith(user, ['resonance', 'wardrobe'])
    expect(await readArchiveLocal()).toMatchObject({
      resonance: [{ outfitId: 'cloud' }],
      wardrobe: { regionScope: 'global' }
    })
    expect(wrapper.findComponent(ArchiveCloudDialog).emitted('restored')).toEqual([
      [['resonance', 'wardrobe']]
    ])
  })
  it('can deselect a module and keeps its latest local data', async () => {
    await open('download')
    sync.selected.value = ['resonance']
    await updateWardrobe((latest) => ({ ...latest, unknownSuitIds: ['999'] }))
    await submit()
    expect(getArchiveSnapshot).toHaveBeenCalledWith(user, ['resonance'])
    expect(await readArchiveLocal()).toMatchObject({
      wardrobe: { regionScope: 'cn', unknownSuitIds: ['999'] }
    })
  })
  it('excludes a missing cloud module without blocking the available module', async () => {
    vi.mocked(getArchiveHead).mockResolvedValueOnce({
      ...archiveHead(),
      wardrobe: { revision: 0, updated_at: 0, active_snapshot: null, summary: null }
    })
    await open('download')
    expect(sync.selected.value).toEqual(['resonance'])
    expect(panel().querySelector('.archive-cloud-unavailable')).toBeNull()
    expect(panel().querySelectorAll<HTMLInputElement>('input[type=checkbox]')[1].disabled).toBe(true)
    expect(sync.canSubmit.value).toBe(true)
  })
  it('distinguishes cleared local data from a valid imported zero-piece wardrobe', async () => {
    await saveResonanceRecords([])
    await updateWardrobe(() => ({
      entries: {},
      unknownSuitIds: [],
      updatedAt: '',
      imported: true,
      regionScope: 'cn'
    }))
    await open('upload')
    expect(sync.selected.value).toEqual(['wardrobe'])
    expect(panel().textContent).toContain('上传后云端已拥有记录将变为 0 件')
    await submit()
    expect(writeArchive).toHaveBeenCalledWith(
      'upload',
      user,
      expect.objectContaining({
        modules: {
          wardrobe: expect.objectContaining({
            data: expect.objectContaining({ imported: true, entries: {} })
          })
        }
      })
    )
  })
  it('requires explicit module selection for deletion and preserves local data', async () => {
    const original = await readArchiveLocal()
    await open('delete')
    expect(sync.selected.value).toEqual([])
    expect(sync.canSubmit.value).toBe(false)
    sync.selected.value = ['resonance', 'wardrobe']
    await submit()
    expect(writeArchive).toHaveBeenCalledWith(
      'delete',
      user,
      expect.objectContaining({
        modules: { resonance: { revision: 1 }, wardrobe: { revision: 1 } }
      })
    )
    expect(await readArchiveLocal()).toEqual(original)
  })
  it.each(['NETWORK', 'SERVER_ERROR'])(
    'retries the same joint request after %s even when local data changes',
    async (code) => {
      await open('upload')
      vi.mocked(writeArchive).mockRejectedValueOnce(new CloudRequestError(code, 'joint-trace'))
      await submit()
      const pending = JSON.stringify(vi.mocked(writeArchive).mock.calls[0][2])
      expect(panel().textContent).toContain('joint-trace')
      expect(sync.phase.value).toBe('uncertain')
      expect(panel().querySelector('fieldset')?.hasAttribute('disabled')).toBe(true)
      await saveResonanceRecords([resonanceFixture('changed')])
      await submit()
      expect(JSON.stringify(vi.mocked(writeArchive).mock.calls[1][2])).toBe(pending)
    }
  )
  it('stops the whole upload if local records change after preview', async () => {
    await open('upload')
    await updateWardrobe((latest) => ({ ...latest, unknownSuitIds: ['999'] }))
    await submit()
    expect(writeArchive).not.toHaveBeenCalled()
    expect(sync.phase.value).toBe('conflict')
    expect(panel().textContent).toContain('本次未覆盖目标')
  })
  it('does not replace either local module if a cloud version changes', async () => {
    const original = await readArchiveLocal()
    await open('download')
    vi.mocked(getArchiveSnapshot).mockResolvedValueOnce({
      ...archiveSnapshot(),
      wardrobe: { ...archiveSnapshot().wardrobe!, revision: 2 }
    })
    await submit()
    expect(await readArchiveLocal()).toEqual(original)
    expect(sync.phase.value).toBe('conflict')
  })
  it('requires refreshed preview and a second confirmation after a write conflict', async () => {
    await open('upload')
    vi.mocked(writeArchive).mockRejectedValueOnce(new Error('CONFLICT'))
    await submit()
    expect(sync.canSubmit.value).toBe(false)
    await sync.prepare()
    expect(writeArchive).toHaveBeenCalledTimes(1)
    expect(sync.pending.value).toBeNull()
    await submit()
    expect(writeArchive).toHaveBeenCalledTimes(2)
  })
  it('blocks writes under a changed account', async () => {
    await open('upload')
    sync.session.invalidate()
    await submit()
    expect(writeArchive).not.toHaveBeenCalled()
    expect(sync.error.value).toBe('ACCOUNT_CHANGED')
  })
  it('does not submit when neither module has a usable source', async () => {
    await saveResonanceRecords([])
    await updateWardrobe(() => ({
      entries: {},
      unknownSuitIds: [],
      updatedAt: '',
      imported: false
    }))
    await open('upload')
    expect(sync.selected.value).toEqual([])
    expect(sync.canSubmit.value).toBe(false)
    await submit()
    expect(writeArchive).not.toHaveBeenCalled()
  })
  it('uses the same login form and clears passwords without automatically synchronizing', async () => {
    await open('login')
    const fields = panel().querySelectorAll('input')
    fields[0].value = 'nikki'
    fields[0].dispatchEvent(new Event('input', { bubbles: true }))
    fields[1].value = 'abcdef'
    fields[1].dispatchEvent(new Event('input', { bubbles: true }))
    await submit()
    expect(cloudRequest).toHaveBeenCalledWith('login', null, {
      username: 'nikki',
      password: 'abcdef'
    })
    expect(getArchiveHead).not.toHaveBeenCalled()
    expect(writeArchive).not.toHaveBeenCalled()
    await open('login')
    expect((panel().querySelector('input[type=password]') as HTMLInputElement).value).toBe('')
  })
  it.each(['upload', 'download'] as const)(
    'keeps resonance %s available when local wardrobe data is corrupt',
    async (action) => {
      await runStoreRequest('wardrobe', 'readwrite', (store) => store.put('corrupt', 'current'))
      await open(action)
      expect(sync.phase.value).toBe('ready')
      expect(sync.selected.value).toEqual(['resonance'])
      expect(sync.moduleErrors.value).toEqual({ wardrobe: 'INVALID_DATA' })
      await submit()
      if (action === 'upload')
        expect(writeArchive).toHaveBeenCalledWith(
          'upload',
          user,
          expect.objectContaining({ modules: { resonance: expect.any(Object) } })
        )
      else expect(getArchiveSnapshot).toHaveBeenCalledWith(user, ['resonance'])
      expect(await runStoreRequest('wardrobe', 'readonly', (store) => store.get('current'))).toBe(
        'corrupt'
      )
    }
  )
  it('deletes cloud saves without accessing local IndexedDB', async () => {
    const read = vi.spyOn(IDBDatabase.prototype, 'transaction').mockImplementation(() => {
      throw new DOMException('storage unavailable', 'InvalidStateError')
    })
    try {
      await open('delete')
      expect(sync.phase.value).toBe('ready')
      sync.selected.value = ['resonance', 'wardrobe']
      await submit()
      expect(writeArchive).toHaveBeenCalledWith(
        'delete',
        user,
        expect.objectContaining({
          modules: { resonance: { revision: 1 }, wardrobe: { revision: 1 } }
        })
      )
      expect(read).not.toHaveBeenCalled()
    } finally {
      read.mockRestore()
    }
  })
  it('blocks a local operation when the database itself is unavailable', async () => {
    const read = vi.spyOn(IDBDatabase.prototype, 'transaction').mockImplementationOnce(() => {
      throw new DOMException('storage unavailable', 'InvalidStateError')
    })
    try {
      await open('upload')
      expect(sync.error.value).toBe('LOCAL_READ_FAILED')
      expect(sync.canSubmit.value).toBe(false)
      expect(writeArchive).not.toHaveBeenCalled()
    } finally {
      read.mockRestore()
    }
  })
})
