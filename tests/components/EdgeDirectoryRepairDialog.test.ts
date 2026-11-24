import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { IDBFactory } from 'fake-indexeddb'
import { afterEach, expect, it, vi } from 'vitest'
import Dialog from '../../src/components/EdgeDirectoryRepairDialog.vue'
import script from '../../src/features/edge-directory-repair/console-script.txt?raw'
import { copyTextToClipboard } from '../../src/utils/clipboard'

vi.mock('../../src/utils/clipboard', () => ({ copyTextToClipboard: vi.fn() }))
enableAutoUnmount(afterEach)
afterEach(() => localStorage.clear())

it('displays a read-only script and copies the complete apply command on click', async () => {
  vi.mocked(copyTextToClipboard).mockResolvedValue(true)
  const wrapper = mount(Dialog, {
    props: { visible: true, language: 'zh' },
    global: { stubs: { Teleport: true } }
  })
  const field = wrapper.get('textarea').element
  expect(field.readOnly).toBe(true)
  expect(field.value).toBe(script.replace(/\r\n/g, '\n').trimEnd())
  expect(copyTextToClipboard).not.toHaveBeenCalled()
  await wrapper.get('footer button').trigger('click')
  await flushPromises()
  expect(copyTextToClipboard).toHaveBeenCalledWith(field.value)
  expect(field.value.endsWith('await window.nikkiCleanDirectoryState(true);')).toBe(true)
  expect(wrapper.get('[role="status"]').text()).toBe('已复制')
  await wrapper.get('header button').trigger('click')
  expect(wrapper.emitted('close')).toEqual([[]])
})

const name = 'infinity-nikki-album-manager'
const store = 'album-handles'
const targeted = [
  'current-album-directory',
  'current-x6game-directory',
  'outfit-code-parse:test',
  'home-scheme-parse:test',
  'photo-action-parse:v1:test'
]
const unrelated = ['current-album-directory-other', 'photo-action-parse:v2:test', 123]

function readRequest<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function createDb(idb: IDBFactory, version: number) {
  const request = idb.open(name, version)
  request.onupgradeneeded = () => {
    const handles = request.result.createObjectStore(store)
    for (const key of [...targeted, ...unrelated]) handles.put('saved', key)
    request.result.createObjectStore('outfits').put('outfit', 'test')
  }
  return readRequest(request)
}

async function runScript(idb: IDBFactory) {
  const execute = new Function(
    'window',
    'indexedDB',
    'localStorage',
    'location',
    'console',
    'return (async () => {\n' + script + '\n})()'
  )
  await execute({}, idb, localStorage, location, { log: vi.fn(), table: vi.fn() })
}

const accessMode = 'infinity-nikki-album-access-mode'
const dismissed = 'infinity-nikki-x6game-auto-prompt-dismissed'

it.each([10, 11])('leaves unrelated keys and records intact in version %i', async (version) => {
  const idb = new IDBFactory()
  const db = await createDb(idb, version)
  try {
    localStorage.setItem(accessMode, 'directory')
    localStorage.setItem(dismissed, 'true')
    localStorage.setItem('unrelated', 'keep')
    await runScript(idb)
    expect(await readRequest(db.transaction(store).objectStore(store).getAllKeys())).toEqual([
      123,
      'current-album-directory-other',
      'photo-action-parse:v2:test'
    ])
    expect(await readRequest(db.transaction('outfits').objectStore('outfits').get('test'))).toBe(
      'outfit'
    )
    expect(localStorage.getItem(accessMode)).toBeNull()
    expect(localStorage.getItem(dismissed)).toBeNull()
    expect(localStorage.getItem('unrelated')).toBe('keep')
  } finally {
    db.close()
  }
})

it('refuses to clear an unexpected database version', async () => {
  const idb = new IDBFactory()
  const db = await createDb(idb, 12)
  try {
    localStorage.setItem(accessMode, 'directory')
    await expect(runScript(idb)).rejects.toThrow('未清理')
    expect(await readRequest(db.transaction(store).objectStore(store).count())).toBe(
      targeted.length + unrelated.length
    )
    expect(localStorage.getItem(accessMode)).toBe('directory')
  } finally {
    db.close()
  }
})
