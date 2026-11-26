import * as albumNotesApi from '../src/utils/file-system/photoMetadata'
import { useModuleOperation } from '../src/composables/useOperationCoordinator'
import { useArchiveCloud, type ArchiveCloudSync } from '../src/composables/useArchiveCloudSync'
import * as cameraStorage from '../src/utils/photo-params/favorites'
import { Blob as NodeBlob } from 'node:buffer'
import 'fake-indexeddb/auto'
import { runStoreRequest } from '../src/utils/file-system/database'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, nextTick } from 'vue'

enableAutoUnmount(afterEach)
import App from '../src/App.vue'
import { messages } from '../src/i18n'
import { gameAlbumMessages } from '../src/i18n/messages/gameAlbum'
import {
  getSavedAlbumDirectoryHandle,
  pickAlbumDirectory,
  readAlbumDirectory,
  refreshAlbumPhotos,
  saveAlbumDirectoryHandle
} from '../src/utils/file-system/albumFileSystem'
import {
  listRecentlyDeleted,
  movePhotosToRecentlyDeleted
} from '../src/utils/file-system/trashFileSystem'
import { readOutfitLibrary, type OutfitItem } from '../src/utils/outfit/outfitFileSystem'
import { importOutfitBackup } from '../src/utils/outfit/outfitBackup'
import { decodeCameraParams } from '../src/utils/photo-params/wasmClient'
import { readOutfitCollection } from '../src/utils/outfit/outfitStorage'
import {
  getSavedGameAlbumUid,
  getSavedX6GameDirectoryHandle,
  saveGameAlbumDirectory
} from '../src/utils/file-system/directoryStorage'
import { countHomeSchemes } from '../src/utils/homeBuild/homeSchemeStorage'

vi.mock('../src/utils/file-system/albumFileSystem', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/utils/file-system/albumFileSystem')>()
  return {
    ...actual,
    getSavedAlbumDirectoryHandle: vi.fn(),
    pickAlbumDirectory: vi.fn(actual.pickAlbumDirectory),
    readAlbumDirectory: vi.fn(),
    refreshAlbumPhotos: vi.fn(actual.refreshAlbumPhotos),
    saveAlbumDirectoryHandle: vi.fn()
  }
})

vi.mock('../src/utils/file-system/trashFileSystem', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/utils/file-system/trashFileSystem')>()
  return {
    ...actual,
    listRecentlyDeleted: vi.fn(),
    movePhotosToRecentlyDeleted: vi.fn(actual.movePhotosToRecentlyDeleted)
  }
})

vi.mock('../src/utils/outfit/outfitFileSystem', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/utils/outfit/outfitFileSystem')>()
  return { ...actual, readOutfitLibrary: vi.fn() }
})

vi.mock('../src/utils/outfit/outfitStorage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/utils/outfit/outfitStorage')>()
  return { ...actual, readOutfitCollection: vi.fn() }
})
vi.mock('../src/utils/file-system/directoryStorage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/utils/file-system/directoryStorage')>()
  return {
    ...actual,
    getSavedX6GameDirectoryHandle: vi.fn(),
    getSavedGameAlbumUid: vi.fn(),
    saveGameAlbumDirectory: vi.fn(),
    saveX6GameDirectoryHandle: vi.fn().mockResolvedValue(undefined)
  }
})

vi.mock('../src/composables/useGameAlbumProfiles', async () => {
  const { reactive } = await import('vue')
  return {
    useGameAlbumProfiles() {
      const profiles = reactive(new Map())
      return {
        profiles,
        loadProfile: async (uid: string) => {
          await Promise.resolve()
          if (uid === '100128456') {
            profiles.set(uid, {
              nickname: '相册昵称',
              avatarUrl: 'https://images.example.test/avatar.png',
              level: 99,
              createdAt: '2024-12-05T02:46:05Z',
              updatedAt: '2026-11-24T14:00:31Z'
            })
          }
        }
      }
    }
  }
})

// App integration tests mock ZIP import, so recognition is covered independently.
vi.mock('../src/utils/backup/backupDetector', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/utils/backup/backupDetector')>()),
  assertBackupKind: vi.fn(async () => undefined)
}))
vi.mock('../src/utils/outfit/outfitBackup', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/utils/outfit/outfitBackup')>()
  return { ...actual, importOutfitBackup: vi.fn() }
})

vi.mock('../src/utils/photo-params/wasmClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/utils/photo-params/wasmClient')>()
  return { ...actual, decodeCameraParams: vi.fn() }
})

vi.mock('../src/utils/homeBuild/homeSchemeStorage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/utils/homeBuild/homeSchemeStorage')>()
  return { ...actual, countHomeSchemes: vi.fn() }
})

const getSavedAlbumDirectoryHandleMock = vi.mocked(getSavedAlbumDirectoryHandle)
const listRecentlyDeletedMock = vi.mocked(listRecentlyDeleted)
const readAlbumDirectoryMock = vi.mocked(readAlbumDirectory)
const saveAlbumDirectoryHandleMock = vi.mocked(saveAlbumDirectoryHandle)
const readOutfitLibraryMock = vi.mocked(readOutfitLibrary)
const readOutfitCollectionMock = vi.mocked(readOutfitCollection)
const getSavedX6GameDirectoryHandleMock = vi.mocked(getSavedX6GameDirectoryHandle)
const importOutfitBackupMock = vi.mocked(importOutfitBackup)
const decodeCameraParamsMock = vi.mocked(decodeCameraParams)
const countHomeSchemesMock = vi.mocked(countHomeSchemes)

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

function gameAlbumFixture(...uids: string[]) {
  const name = 'NikkiPhotos_HighQuality'
  const albums = Object.fromEntries(
    uids.map((uid) => [uid, { kind: 'directory', name } as FileSystemDirectoryHandle])
  )
  const photos = {
    async *entries() {
      for (const uid of uids) {
        yield [uid, { kind: 'directory', getDirectoryHandle: async () => albums[uid] }]
      }
    }
  }
  const root = {
    name: 'X6Game',
    queryPermission: vi.fn().mockResolvedValue('granted'),
    requestPermission: vi.fn().mockResolvedValue('granted'),
    getDirectoryHandle: async () => ({ getDirectoryHandle: async () => photos }),
    resolve: async (album: FileSystemHandle) => {
      const uid = uids.find((candidate) => albums[candidate] === album)
      return uid ? ['Saved', 'GamePlayPhotos', uid, name] : null
    }
  } as unknown as FileSystemDirectoryHandle
  return { root, albums }
}

beforeEach(() => {
  // jsdom 不提供浏览器广播通道；不能混用 Node 通道与 jsdom MessageEvent。
  // 跨标签页协调由独立真实浏览器测试覆盖，挂载测试不连接其他测试的通道。
  vi.stubGlobal('BroadcastChannel', undefined)
  // jsdom 不提供布局观察器；应用挂载测试使用无布局副作用的替身。
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  )
})

describe('App lifecycle coordination', () => {
  it.each([true, false, undefined])(
    'uses JSON favorite %s despite old browser storage and retains state on failure',
    async (favorite) => {
      const directory = { name: 'Album' } as FileSystemDirectoryHandle
      const photo = {
        id: 'old-photo',
        favorite,
        name: 'a.jpg',
        directoryHandle: directory,
        fileHandle: {} as FileSystemFileHandle,
        url: null,
        fileSizeText: '1 KB',
        dateKey: '2026-11-26',
        year: '2026',
        monthDay: '11月26日',
        displayDate: '2026年11月26日',
        timeText: '12:00',
        timestamp: 1
      }
      localStorage.setItem('infinity-nikki-favorite-photo-ids', JSON.stringify([photo.id]))
      localStorage.setItem('infinity-nikki-favorite-photo-ids:item:' + photo.id, '1')
      getSavedAlbumDirectoryHandleMock.mockResolvedValue(directory)
      readAlbumDirectoryMock.mockResolvedValue({
        directoryHandle: directory,
        directoryName: directory.name,
        photos: [photo]
      })
      const snapshot = await albumNotesApi.inspectAlbumNotes(async () => undefined)
      const inspect = vi.spyOn(albumNotesApi, 'inspectAlbumNotes').mockResolvedValue(snapshot)
      const save = vi.spyOn(albumNotesApi, 'savePhotoFavorites')
      const wrapper = mount(App, {
        attachTo: document.body,
        global: { stubs: { PhotoGrid: true } }
      })
      try {
        await flushPromises()
        expect(save).not.toHaveBeenCalled()
        const grid = wrapper.getComponent({ name: 'PhotoGrid' })
        expect(grid.props('favoriteIds').has(photo.id)).toBe(Boolean(favorite))
        save.mockRejectedValue(new Error('write denied'))
        grid.vm.$emit('toggleFavorite', photo.id)
        await flushPromises()
        expect(grid.props('favoriteIds').has(photo.id)).toBe(Boolean(favorite))
        expect(document.body.textContent).toContain('收藏未保存')
        save.mockResolvedValue({
          version: 1,
          photos: { 'a.jpg': { note: '', favorite: !favorite } }
        })
        grid.vm.$emit('toggleFavorite', photo.id)
        await flushPromises()
        expect(grid.props('favoriteIds').has(photo.id)).toBe(!favorite)
      } finally {
        wrapper.unmount()
        save.mockRestore()
        inspect.mockRestore()
      }
    }
  )

  it('reads JSON favorites in read-only mode without changing them or writing the folder', async () => {
    getSavedAlbumDirectoryHandleMock.mockResolvedValue(null)
    const save = vi.spyOn(albumNotesApi, 'savePhotoFavorites')
    const wrapper = mount(App, { attachTo: document.body, global: { stubs: { PhotoGrid: true } } })
    try {
      await flushPromises()
      const image = new File(['image'], '2026_11_26_12_00_00.png', { lastModified: 1 })
      const metadata = new File([], 'album-metadata.json')
      Object.defineProperty(metadata, 'text', {
        value: async () =>
          JSON.stringify({ version: 1, photos: { [image.name]: { note: '备注', favorite: true } } })
      })
      for (const file of [image, metadata])
        Object.defineProperty(file, 'webkitRelativePath', { value: `Album/${file.name}` })
      const input = wrapper.get<HTMLInputElement>('[data-testid="compatible-album-input"]')
      Object.defineProperty(input.element, 'files', { value: [image, metadata] })
      await input.trigger('change')
      await flushPromises()
      const grid = wrapper.getComponent({ name: 'PhotoGrid' })
      const id = [...grid.props('favoriteIds')][0]
      expect(id).toBeTruthy()
      grid.vm.$emit('toggleFavorite', id)
      await flushPromises()
      expect(grid.props('favoriteIds').has(id)).toBe(true)
      expect(save).not.toHaveBeenCalled()
    } finally {
      wrapper.unmount()
      save.mockRestore()
    }
  })

  beforeEach(() => {
    localStorage.clear()
    // Existing lifecycle cases exercise the album workspace explicitly.
    localStorage.setItem('infinity-nikki-active-view', 'all')
    vi.clearAllMocks()
    getSavedX6GameDirectoryHandleMock.mockResolvedValue(null)
    vi.mocked(getSavedGameAlbumUid).mockResolvedValue(undefined)
    readOutfitCollectionMock.mockResolvedValue({ outfits: [], tags: [], unreadableCount: 0 })
    listRecentlyDeletedMock.mockResolvedValue([])
    saveAlbumDirectoryHandleMock.mockResolvedValue(undefined)
    readOutfitLibraryMock.mockResolvedValue({
      outfits: [],
      tags: [],
      importedSharedCount: 0,
      failedCount: 0
    })
    countHomeSchemesMock.mockResolvedValue(0)
  })

  afterEach(() => {
    vi.useRealTimers()
    document.body.innerHTML = ''
  })

  it.each([
    ['zh', 'authorize'],
    ['zh', 'restore'],
    ['zh', 'reselect'],
    ['en', 'authorize']
  ] as const)('shows the %s empty-album guidance for %s', async (language, action) => {
    localStorage.setItem('infinity-nikki-language', language)
    getSavedAlbumDirectoryHandleMock.mockResolvedValue(null)
    if (action === 'restore') {
      getSavedAlbumDirectoryHandleMock.mockResolvedValue({
        name: 'NikkiPhotos_HighQuality',
        queryPermission: async () => 'prompt'
      } as FileSystemDirectoryHandle)
    }
    if (action === 'reselect') {
      getSavedX6GameDirectoryHandleMock.mockResolvedValue(gameAlbumFixture('100128456').root)
    }

    const wrapper = mount(App)
    await flushPromises()
    const page = wrapper.get('.empty-album-start')
    const labels = gameAlbumMessages[language]
    const button = page.get('.empty-album-actions .primary-button')
    expect(page.get('h2').text()).toBe(messages[language].grid.emptyTitle)
    expect(page.get('.album-entry-recommended h3').text()).toContain(
      messages[language].grid.gameDirectoryTitle
    )
    expect(button.text()).toBe(labels[action])
    expect(page.get('.empty-album-guidance > p').text()).toContain(button.text())
    expect(page.get('.album-entry-recommended .album-authorization-path').text()).toBe(
      labels.authorizationPath
    )
    expect(page.find('.album-entry-recommended .primary-button').exists()).toBe(true)
    const helpToggle = page.get('.album-entry-help .accordion-toggle')
    const answer = page.get('.album-entry-help .accordion-answer')
    expect(helpToggle.text()).toBe(messages[language].grid.albumOpeningHelp)
    expect(helpToggle.attributes('aria-expanded')).toBe('false')
    expect(answer.classes()).not.toContain('expanded')
    await helpToggle.trigger('click')
    expect(helpToggle.attributes('aria-expanded')).toBe('true')
    expect(answer.classes()).toContain('expanded')
    await helpToggle.trigger('click')
    expect(helpToggle.attributes('aria-expanded')).toBe('false')
    expect(answer.classes()).not.toContain('expanded')
    expect(page.findAll('.recommended-path').map((path) => path.text())).toEqual([
      labels.authorizationPath,
      `${messages[language].grid.separateAlbumHint}${messages[language].grid.manualAlbumRecommendation} ${messages[language].grid.manualAlbumPath}`
    ])
    expect(page.find('.recommended-path .separate-album-hint + br + strong').exists()).toBe(true)
    expect(page.get('.hidden-folder-tip').text()).toBe(messages[language].grid.hiddenFolderTip)
    expect(page.get('.empty-album-reload-hint').text()).toMatch(/只读|read-only/)
  })

  it('opens the first UID directly and switches from the photo heading without a dialog or another picker', async () => {
    const firstUid = '100128456'
    const secondUid = '100274913'
    const { root, albums } = gameAlbumFixture(secondUid, firstUid)
    const picker = vi
      .fn()
      .mockResolvedValueOnce({ name: 'Wrong', queryPermission: async () => 'granted' })
      .mockResolvedValueOnce(root)
    vi.stubGlobal('showDirectoryPicker', picker)
    getSavedAlbumDirectoryHandleMock.mockResolvedValue(null)
    readAlbumDirectoryMock.mockImplementation(async (directoryHandle) => ({
      directoryHandle,
      directoryName: directoryHandle.name,
      photos: []
    }))
    const wrapper = mount(App, { global: { stubs: { Teleport: true } } })
    const topBar = wrapper.getComponent({ name: 'TopBar' })
    const dialog = wrapper.getComponent({ name: 'ConfirmDialog' })
    try {
      await flushPromises()
      topBar.vm.$emit('chooseGameDirectory')
      expect(picker).toHaveBeenCalledTimes(1)
      await flushPromises()
      expect(saveGameAlbumDirectory).not.toHaveBeenCalled()
      topBar.vm.$emit('chooseGameDirectory')
      await flushPromises()
      expect(dialog.props('visible')).toBe(false)
      const titleRow = wrapper.get('.photo-title-row')
      expect(titleRow.get('h2').text()).toBe('我的相册')
      const accountPicker = titleRow.getComponent({ name: 'DialogChoiceMenu' })
      expect(accountPicker.props('options')).toEqual([
        { value: firstUid, label: `相册昵称 · UID ${firstUid}` },
        { value: secondUid, label: `UID ${secondUid}` }
      ])
      expect(topBar.props('gameAlbumUid')).toBe(firstUid)
      expect(topBar.props('gameAlbumProfile')?.nickname).toBe('相册昵称')
      expect(topBar.get('.album-name-button').text()).toBe('相册昵称')
      await topBar.get('.album-name-button').trigger('click')
      const profileCard = topBar.get('.album-profile')
      const avatar = profileCard.get('img')
      expect(avatar.attributes('src')).toBe('https://images.example.test/avatar.png')
      expect(profileCard.get('.album-profile-name .album-profile-level').text()).toBe('99级')
      expect(profileCard.findAll('.album-profile-times dt').map((item) => item.text())).toEqual([
        '角色创建时间',
        gameAlbumMessages.zh.profileUpdatedAt
      ])
      expect(profileCard.findAll('time').map((item) => item.text())).toEqual([
        '2024-12-05 10:46',
        '2026-11-24 22:00'
      ])
      await avatar.trigger('error')
      expect(profileCard.find('img').exists()).toBe(false)
      await topBar.get('.album-name-button').trigger('click')
      expect(saveGameAlbumDirectory).toHaveBeenLastCalledWith(root, albums[firstUid], firstUid)
      expect(listRecentlyDeletedMock).toHaveBeenLastCalledWith(albums[firstUid], undefined)

      const accountTrigger = accountPicker.get('button[aria-haspopup="menu"]')
      expect(accountTrigger.text()).toBe('相册昵称')
      await accountTrigger.trigger('click')
      expect(accountPicker.get('[role="menuitemradio"][aria-checked="true"]').text()).toContain(
        firstUid
      )
      await accountTrigger.trigger('keydown', { key: 'Escape' })
      expect(accountTrigger.attributes('aria-expanded')).toBe('false')
      expect(topBar.props('gameAlbumUid')).toBe(firstUid)
      expect(saveGameAlbumDirectory).toHaveBeenCalledTimes(1)

      await accountTrigger.trigger('click')
      expect(accountTrigger.attributes('aria-expanded')).toBe('true')
      const secondAccount = accountPicker.get('[role="menuitemradio"]:last-child')
      expect(secondAccount.text()).toBe(`UID ${secondUid}`)
      await secondAccount.trigger('click')
      expect(accountTrigger.attributes('aria-expanded')).toBe('false')
      await flushPromises()
      expect(dialog.props('visible')).toBe(false)
      expect(topBar.props('gameAlbumUid')).toBe(secondUid)
      expect(topBar.props('gameAlbumProfile')).toBeUndefined()
      expect(accountTrigger.text()).toBe(`UID ${secondUid}`)
      expect(topBar.get('.album-name-button').text()).toBe(`UID ${secondUid}`)
      await topBar.get('.album-name-button').trigger('click')
      expect(topBar.get('.album-profile-name > span').text()).toBe(`UID ${secondUid}`)
      expect(topBar.find('.album-profile-level').exists()).toBe(false)
      expect(topBar.get('.album-profile-times > div:last-child dd').text()).toBe('暂无数据')
      expect(saveGameAlbumDirectory).toHaveBeenLastCalledWith(root, albums[secondUid], secondUid)
      expect(listRecentlyDeletedMock).toHaveBeenLastCalledWith(albums[secondUid], undefined)
      expect(picker).toHaveBeenCalledTimes(2)
      expect(root.requestPermission).not.toHaveBeenCalled()
    } finally {
      wrapper.unmount()
      vi.unstubAllGlobals()
    }
  })

  it.each(['granted', 'prompt'] as const)(
    'restores the saved game account with %s root permission',
    async (permission) => {
      const uid = '100128456'
      const { root, albums } = gameAlbumFixture(uid)
      vi.mocked(root.queryPermission!).mockResolvedValue(permission)
      const picker = vi.fn()
      vi.stubGlobal('showDirectoryPicker', picker)
      getSavedAlbumDirectoryHandleMock.mockResolvedValue(albums[uid])
      getSavedX6GameDirectoryHandleMock.mockResolvedValue(root)
      vi.mocked(getSavedGameAlbumUid).mockResolvedValue(uid)
      readAlbumDirectoryMock.mockImplementation(async (directoryHandle) => ({
        directoryHandle,
        directoryName: directoryHandle.name,
        photos: []
      }))
      const wrapper = mount(App)
      const topBar = wrapper.getComponent({ name: 'TopBar' })
      try {
        await flushPromises()
        expect(root.requestPermission).not.toHaveBeenCalled()
        if (permission === 'prompt') {
          expect(topBar.props('canRestoreDirectory')).toBe(true)
          expect(readAlbumDirectoryMock).not.toHaveBeenCalled()
          vi.mocked(root.requestPermission!).mockResolvedValueOnce('denied')
          topBar.vm.$emit('restoreDirectoryAccess')
          expect(root.requestPermission).toHaveBeenCalledTimes(1)
          await flushPromises()
          expect(topBar.props('canRestoreDirectory')).toBe(true)
          expect(saveGameAlbumDirectory).not.toHaveBeenCalled()
          topBar.vm.$emit('restoreDirectoryAccess')
          await flushPromises()
          expect(root.requestPermission).toHaveBeenCalledTimes(2)
        }
        expect(topBar.props('gameAlbumUid')).toBe(uid)
        expect(topBar.props('canRestoreDirectory')).toBe(false)
        expect(picker).not.toHaveBeenCalled()
        if (permission === 'granted') expect(saveGameAlbumDirectory).not.toHaveBeenCalled()
      } finally {
        wrapper.unmount()
        vi.unstubAllGlobals()
      }
    }
  )

  it('discards stale album handles after a missing-directory refresh and permits reopening', async () => {
    const { DirectoryAccessError } = await import('../src/utils/file-system/directoryErrors')
    const directory = {
      kind: 'directory',
      name: 'NikkiPhotos_HighQuality'
    } as FileSystemDirectoryHandle
    getSavedAlbumDirectoryHandleMock.mockResolvedValue(directory)
    readAlbumDirectoryMock.mockResolvedValue({
      directoryHandle: directory,
      directoryName: directory.name,
      photos: []
    })
    vi.mocked(refreshAlbumPhotos).mockRejectedValueOnce(
      new DirectoryAccessError(
        'read-failed',
        messages.zh.fileSystem.readFailed,
        new DOMException('missing', 'NotFoundError')
      )
    )
    const wrapper = mount(App)
    try {
      await flushPromises()
      await vi.waitFor(() =>
        expect(wrapper.getComponent({ name: 'TopBar' }).props('directoryName')).toBe(directory.name)
      )
      window.dispatchEvent(new Event('focus'))
      await vi.waitFor(() =>
        expect(wrapper.getComponent({ name: 'TopBar' }).props('directoryName')).not.toBe(
          directory.name
        )
      )
      expect(document.body.textContent).toContain(messages.zh.app.restorePathFailedStatus)
      const calls = vi.mocked(refreshAlbumPhotos).mock.calls.length
      window.dispatchEvent(new Event('focus'))
      await new Promise((resolve) => setTimeout(resolve, 450))
      expect(refreshAlbumPhotos).toHaveBeenCalledTimes(calls)
      vi.mocked(pickAlbumDirectory).mockResolvedValueOnce({
        directoryHandle: directory,
        directoryName: directory.name,
        photos: []
      })
      wrapper.getComponent({ name: 'TopBar' }).vm.$emit('chooseDirectory')
      await flushPromises()
      await vi.waitFor(() =>
        expect(wrapper.getComponent({ name: 'TopBar' }).props('directoryName')).toBe(directory.name)
      )
    } finally {
      wrapper.unmount()
    }
  })

  it('invalidates the album when confirmed deletion cannot find the trash parent directory', async () => {
    const { annotateDiagnosticError } = await import('../src/utils/errorReporting/errorReporter')
    const directory = { kind: 'directory', name: 'Album' } as FileSystemDirectoryHandle
    const photo = {
      id: 'photo',
      name: 'photo.jpg',
      directoryHandle: directory,
      fileHandle: {} as FileSystemFileHandle,
      url: null,
      timestamp: 1,
      dateKey: '2026-11-19',
      year: '2026',
      monthDay: '11月19日',
      displayDate: '2026年11月19日',
      timeText: '12:00',
      fileSizeText: '1 KB'
    }
    getSavedAlbumDirectoryHandleMock.mockResolvedValue(directory)
    readAlbumDirectoryMock.mockResolvedValue({
      directoryHandle: directory,
      directoryName: directory.name,
      photos: [photo]
    })
    vi.mocked(movePhotosToRecentlyDeleted).mockRejectedValueOnce(
      annotateDiagnosticError(new DOMException('missing', 'NotFoundError'), {
        stage: 'create-trash-directory'
      })
    )
    const wrapper = mount(App, { global: { stubs: { PhotoGrid: true } } })
    try {
      await flushPromises()
      await vi.waitFor(() =>
        expect(wrapper.findComponent({ name: 'PhotoGrid' }).exists()).toBe(true)
      )
      wrapper.getComponent({ name: 'PhotoGrid' }).vm.$emit('togglePhoto', photo.id)
      await nextTick()
      wrapper.getComponent({ name: 'SelectionBar' }).vm.$emit('delete')
      await nextTick()
      wrapper.getComponent({ name: 'ConfirmDialog' }).vm.$emit('confirm')
      await flushPromises()
      expect(movePhotosToRecentlyDeleted).toHaveBeenCalled()
      expect(wrapper.getComponent({ name: 'TopBar' }).props('directoryName')).not.toBe(
        directory.name
      )
      expect(wrapper.findComponent({ name: 'PhotoGrid' }).exists()).toBe(false)
      expect(document.body.textContent).toContain(messages.zh.app.restorePathFailedStatus)
    } finally {
      wrapper.unmount()
    }
  })

  it('opens the desktop home without an album and reuses navigation counts and top bar tools', async () => {
    localStorage.removeItem('infinity-nikki-active-view')
    getSavedAlbumDirectoryHandleMock.mockResolvedValue(null)
    const wrapper = mount(App, { global: { stubs: { Teleport: true } } })
    await flushPromises()
    const home = wrapper.getComponent({ name: 'DesktopHome' })
    expect(wrapper.getComponent({ name: 'TopBar' }).props('activeView')).toBe('landing')
    expect(wrapper.find('.header-search').exists()).toBe(false)
    expect(home.find('img').exists()).toBe(false)
    expect(wrapper.get('.app-shell').classes()).toContain('is-homepage-shell')
    expect(wrapper.find('#home-wallpaper-layer').exists()).toBe(true)
    expect(wrapper.find('.sidebar-column > .home-sidebar-material.material-surface').exists()).toBe(
      true
    )
    expect(home.get('.home-wallpaper-button').attributes('disabled')).toBeUndefined()
    await home.get('.home-wallpaper-button').trigger('click')
    expect(home.find('.home-wallpaper-drawer').exists()).toBe(true)
    expect(home.find('.home-overview').classes()).toContain('is-hidden')
    expect(home.find('.home-wallpaper-drawer').attributes('aria-modal')).toBeUndefined()
    await home.get('.home-wallpaper-close').trigger('click')
    expect(home.find('.home-wallpaper-drawer').exists()).toBe(false)
    expect(home.find('.home-overview').classes()).not.toContain('is-hidden')
    await home.get('.home-wallpaper-button').trigger('click')
    await home.get('.home-wallpaper-drawer').trigger('click')
    expect(home.find('.home-wallpaper-drawer').exists()).toBe(true)
    await home.get('.desktop-home').trigger('click')
    expect(home.find('.home-wallpaper-drawer').exists()).toBe(false)
    expect(
      home.findAll('.home-overview button').map((button) => button.attributes('data-view'))
    ).toEqual(['all', 'outfits', 'home', 'favorites'])
    const nav = wrapper.getComponent({ name: 'AlbumViewSwitcher' })
    for (const prop of ['allCount', 'outfitsCount', 'homeSchemesCount', 'favoriteCount']) {
      expect(home.props(prop)).toBe(nav.props(prop))
    }
    expect(wrapper.find('.empty-album-start').exists()).toBe(false)
    expect(wrapper.findComponent({ name: 'DateSidebar' }).exists()).toBe(false)
    wrapper.getComponent({ name: 'TopBar' }).vm.$emit('openParseTools')
    await nextTick()
    expect(wrapper.getComponent({ name: 'ParseToolsDialog' }).props('visible')).toBe(true)
    wrapper.getComponent({ name: 'ParseToolsDialog' }).vm.$emit('close')
    await home.get('[data-view="all"]').trigger('click')
    expect(wrapper.getComponent({ name: 'TopBar' }).props('activeView')).toBe('all')
    expect(wrapper.findComponent({ name: 'DesktopHome' }).exists()).toBe(false)
    expect(wrapper.get('.app-shell').classes()).not.toContain('is-homepage-shell')
    expect(wrapper.find('#home-wallpaper-layer').exists()).toBe(false)
    expect(wrapper.find('.home-sidebar-material').exists()).toBe(false)
    wrapper.getComponent({ name: 'AlbumViewSwitcher' }).vm.$emit('changeView', 'landing')
    await nextTick()
    expect(wrapper.findComponent({ name: 'DesktopHome' }).exists()).toBe(true)
  })

  it.each([
    [null, 'outfits'],
    ['landing', 'outfits'],
    ['all', 'outfits'],
    ['trash', 'outfits'],
    ['home', 'home'],
    ['favorites', 'favorites'],
    ['wardrobe', 'wardrobe']
  ])('normalizes saved module %s to %s on compact startup', async (saved, expected) => {
    vi.stubGlobal('matchMedia', (media: string) => ({
      matches: media === '(max-width: 899px)',
      addEventListener() {},
      removeEventListener() {}
    }))
    getSavedAlbumDirectoryHandleMock.mockResolvedValue(null)
    if (saved) localStorage.setItem('infinity-nikki-active-view', saved)
    const wrapper = mount(App, { global: { stubs: { Teleport: true } } })
    try {
      expect(wrapper.getComponent({ name: 'TopBar' }).props('activeView')).toBe(expected)
      await flushPromises()
      expect(wrapper.getComponent({ name: 'TopBar' }).props('activeView')).toBe(expected)
      expect(localStorage.getItem('infinity-nikki-active-view')).toBe(expected)
    } finally {
      wrapper.unmount()
      vi.unstubAllGlobals()
    }
  })

  it.each([
    ['all', false],
    ['trash', false],
    ['all', true],
    ['home', false]
  ])('normalizes %s when compact, waiting for writes=%s', async (saved, busy) => {
    const listeners = new Set<() => void>()
    const query = {
      matches: false,
      addEventListener: (_: string, fn: () => void) => listeners.add(fn),
      removeEventListener: (_: string, fn: () => void) => listeners.delete(fn)
    }
    vi.stubGlobal('matchMedia', (media: string) =>
      media === '(max-width: 899px)' ? query : { matches: false }
    )
    getSavedAlbumDirectoryHandleMock.mockResolvedValue(null)
    localStorage.setItem('infinity-nikki-active-view', saved)
    const wrapper = mount(App, {
      global: {
        stubs: {
          Teleport: true,
          AllDataBackup: { name: 'AllDataBackup', template: '<div />' }
        }
      }
    })
    try {
      await flushPromises()
      const top = wrapper.getComponent({ name: 'TopBar' })
      if (busy) {
        wrapper.getComponent({ name: 'AllDataBackup' }).vm.$emit('busy', true)
        await nextTick()
      }
      query.matches = true
      listeners.forEach((fn) => fn())
      await flushPromises()
      if (busy) {
        expect(top.props('activeView')).toBe(saved)
        wrapper.getComponent({ name: 'AllDataBackup' }).vm.$emit('busy', false)
        await flushPromises()
      }
      const expected = saved === 'home' ? 'home' : 'outfits'
      expect(top.props('activeView')).toBe(expected)
      query.matches = false
      listeners.forEach((fn) => fn())
      await flushPromises()
      expect(top.props('activeView')).toBe(expected)
    } finally {
      wrapper.unmount()
      vi.unstubAllGlobals()
    }
  })

  it.each(['outfits', 'home', 'resonance', 'wardrobe', 'makeup', 'favorites'])(
    'restores the saved module %s after mounting',
    async (view) => {
      getSavedAlbumDirectoryHandleMock.mockResolvedValue(null)
      localStorage.setItem('infinity-nikki-active-view', view)
      const wrapper = mount(App, { global: { stubs: { Teleport: true } } })
      await flushPromises()
      expect(wrapper.getComponent({ name: 'TopBar' }).props('activeView')).toBe(view)
    }
  )

  it.each(['home', 'favorites'])('mounts the restored %s controls into the page', async (view) => {
    getSavedAlbumDirectoryHandleMock.mockResolvedValue(null)
    localStorage.setItem('infinity-nikki-active-view', view)
    const wrapper = mount(App, { attachTo: document.body })
    await flushPromises()
    expect(wrapper.find('#album-sidebar-column .outfit-sidebar').exists()).toBe(true)
    if (view === 'favorites') {
      expect(wrapper.find('.camera-header .collection-actions').exists()).toBe(true)
    }
  })

  it('persists navigation and restores it on a fresh app mount', async () => {
    getSavedAlbumDirectoryHandleMock.mockResolvedValue(null)
    const wrapper = mount(App, { global: { stubs: { Teleport: true } } })
    await flushPromises()
    wrapper.getComponent({ name: 'AlbumViewSwitcher' }).vm.$emit('changeView', 'home')
    await nextTick()
    expect(localStorage.getItem('infinity-nikki-active-view')).toBe('home')
    wrapper.unmount()
    const reloaded = mount(App, { global: { stubs: { Teleport: true } } })
    await flushPromises()
    expect(reloaded.getComponent({ name: 'TopBar' }).props('activeView')).toBe('home')
  })

  it('uses the default module when the saved module no longer exists', async () => {
    getSavedAlbumDirectoryHandleMock.mockResolvedValue(null)
    localStorage.setItem('infinity-nikki-active-view', 'removed-module')
    const wrapper = mount(App, { global: { stubs: { Teleport: true } } })
    await flushPromises()
    expect(wrapper.getComponent({ name: 'TopBar' }).props('activeView')).toBe('landing')
  })

  it.each(['wardrobe', null])(
    'ignores legacy view links with saved module %s',
    async (savedView) => {
      getSavedAlbumDirectoryHandleMock.mockResolvedValue(null)
      if (savedView) localStorage.setItem('infinity-nikki-active-view', savedView)
      else localStorage.removeItem('infinity-nikki-active-view')
      const previousUrl = window.location.href
      try {
        window.history.replaceState(null, '', '?view=home')
        const wrapper = mount(App, { global: { stubs: { Teleport: true } } })
        await flushPromises()
        expect(wrapper.getComponent({ name: 'TopBar' }).props('activeView')).toBe(
          savedView ?? 'landing'
        )
        wrapper.unmount()
      } finally {
        window.history.replaceState(null, '', previousUrl)
      }
    }
  )

  it('returns to the update log after closing help opened from it', async () => {
    getSavedAlbumDirectoryHandleMock.mockResolvedValue(null)
    const wrapper = mount(App, {
      global: {
        stubs: {
          Teleport: true,
          UpdateLogDialog: { name: 'UpdateLogDialog', props: ['visible'], template: '<div />' },
          HelpAboutDialog: { name: 'HelpAboutDialog', props: ['visible'], template: '<div />' }
        }
      }
    })
    await flushPromises()
    const updates = wrapper.getComponent({ name: 'UpdateLogDialog' })
    updates.vm.$emit('openHelp')
    await nextTick()
    const help = wrapper.getComponent({ name: 'HelpAboutDialog' })
    expect(help.props('visible')).toBe(true)
    expect(updates.props('visible')).toBe(false)
    help.vm.$emit('close')
    await nextTick()
    expect(updates.props('visible')).toBe(true)
    updates.vm.$emit('close', true)
    await nextTick()
    expect(updates.props('visible')).toBe(false)
  })

  it('keeps favorite counts without mounting the camera page and hands off saving after its first mount', async () => {
    getSavedAlbumDirectoryHandleMock.mockResolvedValue(null)
    const metadata = vi.spyOn(cameraStorage, 'readCameraFavorites').mockResolvedValue({
      records: [{ code: 'existing' } as cameraStorage.CameraFavorite],
      covers: new Map()
    })
    decodeCameraParamsMock.mockResolvedValue({ ok: true, value: {} } as Awaited<
      ReturnType<typeof decodeCameraParams>
    >)
    const save = vi.fn().mockResolvedValue(undefined)
    const wrapper = mount(App, {
      global: {
        stubs: {
          Teleport: true,
          CameraFavorites: defineComponent({
            name: 'CameraFavorites',
            setup(_, { expose }) {
              expose({ openFromResult: save, reload: vi.fn() })
              return () => null
            }
          }),
          PhotoParamsDialog: {
            name: 'PhotoParamsDialog',
            props: ['visible', 'result'],
            template:
              '<button v-if="visible" class="save-params-stub" @click="$emit(\'favorite\')">Save</button>'
          }
        }
      }
    })
    try {
      await vi.waitFor(() => expect(metadata).toHaveBeenCalledWith(false))
      await vi.waitFor(() =>
        expect(wrapper.getComponent({ name: 'AlbumViewSwitcher' }).props('favoriteCount')).toBe(1)
      )
      expect(wrapper.findComponent({ name: 'CameraFavorites' }).exists()).toBe(false)
      wrapper.getComponent({ name: 'TopBar' }).vm.$emit('openParseTools')
      await vi.waitFor(() =>
        expect(wrapper.findAll('.parse-tools-section input:not([type="file"])')).toHaveLength(2)
      )
      await wrapper
        .findAll('.parse-tools-section input:not([type="file"])')[0]
        .setValue('camera-raw')
      await wrapper.findAll('form.parse-tools-section')[0].trigger('submit')
      await vi.waitFor(() => expect(wrapper.find('.save-params-stub').exists()).toBe(true))
      expect(wrapper.findComponent({ name: 'CameraFavorites' }).exists()).toBe(false)
      await wrapper.get('.save-params-stub').trigger('click')
      await vi.waitFor(() => expect(save).toHaveBeenCalledOnce())
      expect(save).toHaveBeenCalledWith(
        expect.objectContaining({ rawCameraParams: 'camera-raw' }),
        null
      )
    } finally {
      wrapper.unmount()
      metadata.mockRestore()
    }
  })

  it('places photo favorites after auto-parse actions and filters the current album', async () => {
    getSavedAlbumDirectoryHandleMock.mockResolvedValue(null)
    const wrapper = mount(App, {
      global: { stubs: { PhotoGrid: true, CameraFavorites: true } }
    })
    await flushPromises()

    const input = wrapper.get<HTMLInputElement>('[data-testid="compatible-album-input"]')
    const files = ['21_05_24', '21_05_25'].map((time) => {
      const file = new File(['photo'], '2026_04_26_' + time + '.jpeg', { lastModified: 1000 })
      Object.defineProperty(file, 'webkitRelativePath', { value: '相册/' + file.name })
      return file
    })
    const metadata = new File([], 'album-metadata.json')
    Object.defineProperty(metadata, 'webkitRelativePath', { value: '相册/' + metadata.name })
    Object.defineProperty(metadata, 'text', {
      value: async () =>
        JSON.stringify({
          version: 1,
          photos: { [files[1].name]: { note: '', favorite: true } }
        })
    })
    Object.defineProperty(input.element, 'files', { value: [...files, metadata] })
    await input.trigger('change')
    await flushPromises()
    const favorites = wrapper.get('.photo-favorites-button')
    expect(wrapper.find('.photo-title-row .photo-trash-button').exists()).toBe(true)
    expect(wrapper.get('.photo-trash-button').element.nextElementSibling).toBe(favorites.element)
    expect(wrapper.get('.photo-header-actions').text()).not.toContain('搭配总结')
    const grid = wrapper.getComponent({ name: 'PhotoGrid' })
    const visiblePhotos = () =>
      (grid.props('dateGroups') as { photos: { id: string }[] }[]).flatMap((group) => group.photos)
    expect(visiblePhotos()).toHaveLength(2)
    const saved = visiblePhotos()[0]!
    await favorites.trigger('click')
    expect(favorites.attributes('aria-pressed')).toBe('true')
    expect(visiblePhotos().map((photo) => photo.id)).toEqual([saved.id])
    expect(wrapper.getComponent({ name: 'SelectionBar' }).props('mode')).toBe('favorites')
    expect(wrapper.getComponent({ name: 'AlbumViewSwitcher' }).props('favoriteCount')).toBe(0)
    await favorites.trigger('click')
    expect(visiblePhotos()).toHaveLength(2)

    await favorites.trigger('click')
    wrapper.getComponent({ name: 'AlbumViewSwitcher' }).vm.$emit('changeView', 'all')
    await nextTick()
    expect(favorites.attributes('aria-pressed')).toBe('false')
    wrapper.getComponent({ name: 'AlbumViewSwitcher' }).vm.$emit('changeView', 'outfits')
    await nextTick()
    expect(wrapper.find('.photo-favorites-button').exists()).toBe(false)
    const summary = wrapper
      .findAll('.is-outfit-header button')
      .find((button) => button.text() === '搭配总结')
    expect(summary).toBeDefined()
  })

  it('opens compatible files without migration or persisted handles, preserves state on cancel/error and supports switching back', async () => {
    getSavedAlbumDirectoryHandleMock.mockResolvedValue(null)
    const wrapper = mount(App, {
      attachTo: document.body,
      global: { stubs: { CameraFavorites: true, PhotoGrid: true, Lightbox: true } }
    })
    try {
      await flushPromises()
      vi.clearAllMocks()
      const input = wrapper.get<HTMLInputElement>('[data-testid="compatible-album-input"]')
      const file = new File(['photo'], '2026_04_26_21_05_24.jpeg', { lastModified: 1000 })
      Object.defineProperty(file, 'webkitRelativePath', { value: `相册/${file.name}` })
      Object.defineProperty(input.element, 'files', { configurable: true, value: [file] })
      await input.trigger('change')
      await flushPromises()
      expect(wrapper.find('.compatible-album-notice').exists()).toBe(true)
      expect(wrapper.find('.empty-album-start').exists()).toBe(false)
      expect(wrapper.getComponent({ name: 'PhotoGrid' }).props('readOnly')).toBe(true)
      expect((wrapper.get('.photo-trash-button').element as HTMLButtonElement).disabled).toBe(true)
      expect(saveAlbumDirectoryHandleMock).not.toHaveBeenCalled()
      expect(readOutfitLibraryMock).not.toHaveBeenCalled()
      expect(listRecentlyDeletedMock).not.toHaveBeenCalled()
      const originalGroups = wrapper.getComponent({ name: 'PhotoGrid' }).props('dateGroups')
      wrapper.getComponent({ name: 'AlbumViewSwitcher' }).vm.$emit('changeView', 'outfits')
      await flushPromises()
      expect(wrapper.find('.compatible-album-notice').exists()).toBe(false)
      wrapper.getComponent({ name: 'AlbumViewSwitcher' }).vm.$emit('changeView', 'all')
      await flushPromises()
      expect(wrapper.find('.compatible-album-notice').exists()).toBe(true)
      await input.trigger('cancel')
      const nested = new File(['nested'], 'hidden.jpg')
      Object.defineProperty(nested, 'webkitRelativePath', { value: '相册/trash/hidden.jpg' })
      Object.defineProperty(input.element, 'files', { configurable: true, value: [nested] })
      await input.trigger('change')
      await flushPromises()
      expect(wrapper.getComponent({ name: 'PhotoGrid' }).props('dateGroups')).toEqual(
        originalGroups
      )
      const badMetadata = new File(['invalid'], 'album-metadata.json')
      Object.defineProperties(badMetadata, {
        webkitRelativePath: { value: '相册/album-metadata.json' },
        text: { value: async () => '{invalid' }
      })
      Object.defineProperty(input.element, 'files', {
        configurable: true,
        value: [file, badMetadata]
      })
      await input.trigger('change')
      await flushPromises()
      expect(wrapper.find('.album-note-warning').text()).toContain('相册备注和收藏未能读取')
      expect(wrapper.getComponent({ name: 'PhotoGrid' }).props('dateGroups')).toEqual(
        originalGroups
      )
      const grid = wrapper.getComponent({ name: 'PhotoGrid' })
      const photos = grid.props('dateGroups')[0].photos
      grid.vm.$emit('togglePhoto', photos[0].id)
      await flushPromises()
      const selection = wrapper.getComponent({ name: 'SelectionBar' })
      expect(selection.props('readOnly')).toBe(true)
      selection.vm.$emit('delete')
      grid.vm.$emit('editNote', photos[0])
      await flushPromises()
      expect(wrapper.findComponent({ name: 'PhotoNoteDialog' }).exists()).toBe(false)
      const handle = {
        name: 'regular',
        getFileHandle: vi.fn().mockRejectedValue(new DOMException('missing', 'NotFoundError')),
        async *entries() {}
      } as unknown as FileSystemDirectoryHandle
      vi.stubGlobal('showDirectoryPicker', vi.fn().mockResolvedValue(handle))
      readAlbumDirectoryMock.mockResolvedValue({
        directoryName: 'regular',
        directoryHandle: handle,
        photos: []
      })
      wrapper.getComponent({ name: 'TopBar' }).vm.$emit('chooseDirectory')
      await flushPromises()
      expect(wrapper.find('.compatible-album-notice').exists()).toBe(false)
      expect(saveAlbumDirectoryHandleMock).toHaveBeenCalledWith(handle)
      expect(localStorage.getItem('infinity-nikki-album-access-mode')).toBe('directory')
    } finally {
      wrapper.unmount()
      vi.unstubAllGlobals()
    }
  })

  it('asks to reselect a compatible album after reload without accessing the retained directory', async () => {
    localStorage.setItem('infinity-nikki-album-access-mode', 'compatible')
    const wrapper = mount(App, {
      attachTo: document.body,
      global: { stubs: { CameraFavorites: true } }
    })
    try {
      await flushPromises()
      expect(getSavedAlbumDirectoryHandleMock).not.toHaveBeenCalled()
      expect(readAlbumDirectoryMock).not.toHaveBeenCalled()
      expect(document.body.textContent).toContain('重新选择文件夹')
    } finally {
      wrapper.unmount()
    }
  })

  it('migrates half thumbnails and connects independent sizes across mobile and desktop', async () => {
    const listeners = new Set<() => void>()
    const query = {
      matches: true,
      addEventListener: (_: string, fn: () => void) => listeners.add(fn),
      removeEventListener: (_: string, fn: () => void) => listeners.delete(fn)
    }
    vi.stubGlobal(
      'matchMedia',
      vi.fn((media: string) => (media === '(max-width: 899px)' ? query : { matches: false }))
    )
    getSavedAlbumDirectoryHandleMock.mockResolvedValue(null)
    const keys = [
      'infinity-nikki-thumbnail-mode',
      'infinity-nikki-outfit-thumbnail-mode',
      'infinity-nikki-home-thumbnail-mode'
    ]
    keys.forEach((key) => localStorage.setItem(key, 'half'))
    const wrapper = mount(App, {
      attachTo: document.body,
      global: { stubs: { CameraFavorites: true } }
    })
    try {
      await flushPromises()
      const topBar = wrapper.getComponent({ name: 'TopBar' })
      const navigation = wrapper.getComponent({ name: 'AlbumViewSwitcher' })
      for (const view of ['all', 'outfits', 'home']) {
        await vi.waitFor(() => expect(navigation.props('disabled')).toBe(false))
        navigation.vm.$emit('changeView', view)
        await flushPromises()
        expect(topBar.props('thumbnailMode')).toBe('default')
        expect(topBar.props('thumbnailSize')).toBe('medium')
        if (view === 'outfits')
          expect(wrapper.getComponent({ name: 'OutfitGrid' }).props('thumbnailMode')).toBe(
            'default'
          )
        topBar.vm.$emit('changeThumbnailMode', 'half')
        await flushPromises()
        expect(topBar.props('thumbnailMode')).toBe('default')
      }
      keys.forEach((key) => expect(localStorage.getItem(key)).toBe('default'))
      query.matches = false
      listeners.forEach((fn) => fn())
      await flushPromises()
      for (const view of ['all', 'outfits', 'home']) {
        await vi.waitFor(() => expect(navigation.props('disabled')).toBe(false))
        navigation.vm.$emit('changeView', view)
        await flushPromises()
        expect(topBar.props('thumbnailMode')).toBe('default')
        expect(topBar.props('activeView')).toBe(view)
        expect(topBar.props('thumbnailSize')).toBe('small')
        topBar.vm.$emit('changeThumbnailSize', 'large')
        await flushPromises()
        expect(topBar.props('thumbnailSize')).toBe('large')
        expect(
          localStorage.getItem(
            `infinity-nikki-${view === 'all' ? 'photo' : view === 'outfits' ? 'outfit' : 'home'}-thumbnail-size-desktop`
          )
        ).toBe('large')
      }
    } finally {
      wrapper.unmount()
      vi.unstubAllGlobals()
    }
  })

  it('waits for startup dialogs before reminding, remembers dismissal, and reopens from the menu', async () => {
    getSavedAlbumDirectoryHandleMock.mockResolvedValue(null)
    const wrapper = mount(App, { global: { stubs: { Teleport: true } } })
    try {
      await flushPromises()
      const reminder = wrapper.getComponent({ name: 'DataStorageReminder' })
      const updates = wrapper.getComponent({ name: 'UpdateLogDialog' })
      expect(reminder.props('visible')).toBe(false)
      updates.vm.$emit('openHelp')
      updates.vm.$emit('afterClose')
      await flushPromises()
      expect(reminder.props('visible')).toBe(false)
      wrapper.getComponent({ name: 'HelpAboutDialog' }).vm.$emit('close')
      await flushPromises()
      expect(updates.props('visible')).toBe(true)
      updates.vm.$emit('close', true)
      await flushPromises()
      expect(reminder.props('visible')).toBe(false)
      updates.vm.$emit('afterClose')
      await flushPromises()
      expect(reminder.props('visible')).toBe(true)
      reminder.vm.$emit('close', true)
      await flushPromises()
      expect(localStorage.getItem('infinity-nikki-data-reminder-dismissed')).toBe('true')
      wrapper.getComponent({ name: 'TopBar' }).vm.$emit('openDataReminder')
      await flushPromises()
      expect(reminder.props('visible')).toBe(true)
      reminder.vm.$emit('close', true)
      await flushPromises()
      expect(reminder.props('visible')).toBe(false)
    } finally {
      wrapper.unmount()
    }
  })

  it.each([false, true])(
    'finishes the archive exit before unmounting controls (reduced motion=%s)',
    async (reducedMotion) => {
      vi.stubGlobal('matchMedia', (query: string) => ({
        matches: query.includes('prefers-reduced-motion') ? reducedMotion : true,
        addEventListener() {},
        removeEventListener() {}
      }))
      getSavedAlbumDirectoryHandleMock.mockResolvedValue(null)
      const wrapper = mount(App, {
        attachTo: document.body,
        global: {
          stubs: {
            PersonalWardrobe: true,
            MakeupCatalog: true,
            ResonanceRecords: true,
            CameraFavorites: true
          }
        }
      })
      try {
        await flushPromises()
        const navigation = wrapper.getComponent({ name: 'AlbumViewSwitcher' })
        await vi.waitFor(() => expect(navigation.props('disabled')).toBe(false))
        navigation.vm.$emit('changeView', 'wardrobe')
        await flushPromises()
        vi.useFakeTimers()
        navigation.vm.$emit('changeView', 'resonance')
        await nextTick()
        if (!reducedMotion) {
          expect(navigation.props('activeView')).toBe('wardrobe')
          expect(wrapper.find('.archive-main-toolbar.is-category-closing').exists()).toBe(true)
          await vi.advanceTimersByTimeAsync(119)
          expect(navigation.props('activeView')).toBe('wardrobe')
          // A newer click cancels the pending return rather than running it later.
          navigation.vm.$emit('changeView', 'makeup')
          await nextTick()
          await vi.advanceTimersByTimeAsync(120)
          expect(navigation.props('activeView')).toBe('makeup')
          navigation.vm.$emit('changeView', 'resonance')
          await nextTick()
          await vi.advanceTimersByTimeAsync(120)
        }
        await nextTick()
        expect(navigation.props('activeView')).toBe('resonance')
        expect(wrapper.find('.archive-main-toolbar.has-category').exists()).toBe(false)
      } finally {
        wrapper.unmount()
        vi.useRealTimers()
        vi.unstubAllGlobals()
      }
    }
  )

  it.each([true, false])(
    'hides resonance ratio controls and rejects preference changes (compact=%s)',
    async (compact) => {
      vi.stubGlobal(
        'matchMedia',
        vi.fn(() => ({ matches: compact, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
      )
      getSavedAlbumDirectoryHandleMock.mockResolvedValue(null)
      localStorage.setItem('infinity-nikki-thumbnail-mode', 'wide')
      const wrapper = mount(App, {
        attachTo: document.body,
        global: { stubs: { ResonanceRecords: true, CameraFavorites: true } }
      })
      try {
        await flushPromises()
        const navigation = wrapper.getComponent({ name: 'AlbumViewSwitcher' })
        const topBar = wrapper.getComponent({ name: 'TopBar' })
        navigation.vm.$emit('changeView', 'resonance')
        await flushPromises()
        expect(topBar.props('thumbnailModeDisabled')).toBe(true)
        await topBar
          .get(
            compact ? '.mobile-header-row button[aria-label="打开视图菜单"]' : '.view-menu-button'
          )
          .trigger('click')
        await flushPromises()
        const options = [
          ...document.querySelectorAll<HTMLButtonElement>(
            '.thumbnail-options:not(.mobile-nav-style-options) button'
          )
        ]
        expect(options).toHaveLength(0)
        expect(topBar.props('thumbnailSizeDisabled')).toBe(true)
        topBar.vm.$emit('changeThumbnailSize', 'large')
        topBar.vm.$emit('changeThumbnailMode', 'portrait-standard')
        await flushPromises()
        expect(localStorage.getItem('infinity-nikki-thumbnail-mode')).toBe('wide')
        expect(
          localStorage.getItem(
            `infinity-nikki-photo-thumbnail-size-${compact ? 'mobile' : 'desktop'}`
          )
        ).toBeNull()
        navigation.vm.$emit('changeView', 'all')
        await flushPromises()
        expect(topBar.props('thumbnailModeDisabled')).toBe(false)
        expect(topBar.props('thumbnailMode')).toBe('wide')
      } finally {
        wrapper.unmount()
        vi.unstubAllGlobals()
      }
    }
  )

  it('keeps camera parameters independent across desktop and mobile layouts', async () => {
    const listeners = new Set<() => void>()
    const query = {
      matches: false,
      addEventListener: (_: string, fn: () => void) => listeners.add(fn),
      removeEventListener: (_: string, fn: () => void) => listeners.delete(fn)
    }
    vi.stubGlobal(
      'matchMedia',
      vi.fn((media: string) => (media === '(max-width: 899px)' ? query : { matches: false }))
    )
    getSavedAlbumDirectoryHandleMock.mockResolvedValue(null)
    const wrapper = mount(App, { attachTo: document.body })
    try {
      await flushPromises()
      await wrapper.findAll('.mobile-navigation button')[2]!.trigger('click')
      await vi.waitFor(() =>
        expect(wrapper.findComponent({ name: 'CameraFavorites' }).exists()).toBe(true)
      )
      const topBar = wrapper.getComponent({ name: 'TopBar' })
      expect(topBar.props('thumbnailModeDisabled')).toBe(true)
      expect(topBar.props('thumbnailSizeDisabled')).toBe(false)
      topBar.vm.$emit('changeThumbnailSize', 'large')
      await flushPromises()
      expect(wrapper.findComponent({ name: 'CameraFavorites' }).props('thumbnailSize')).toBe(
        'large'
      )
      expect(localStorage.getItem('infinity-nikki-camera-thumbnail-size-desktop')).toBe('large')
      topBar.vm.$emit('changeThumbnailMode', 'portrait-standard')
      expect(localStorage.getItem('infinity-nikki-thumbnail-mode')).toBeNull()
      query.matches = true
      listeners.forEach((fn) => fn())
      await flushPromises()
      expect(wrapper.findAll('.mobile-navigation button')[2]!.text()).toBe('相机参数')
      expect(wrapper.find('.photo-favorites-button').exists()).toBe(false)
      expect(wrapper.findComponent({ name: 'CameraFavorites' }).props('active')).toBe(true)
      expect(topBar.props('thumbnailSize')).toBe('medium')
      topBar.vm.$emit('changeThumbnailSize', 'small')
      await flushPromises()
      expect(wrapper.findComponent({ name: 'CameraFavorites' }).props('thumbnailSize')).toBe(
        'small'
      )
      expect(localStorage.getItem('infinity-nikki-camera-thumbnail-size-mobile')).toBe('small')
      expect(wrapper.find('.empty-album-start').exists()).toBe(false)
      expect(wrapper.get('.camera-header').isVisible()).toBe(false)
      query.matches = false
      listeners.forEach((fn) => fn())
      await flushPromises()
      expect(wrapper.findComponent({ name: 'CameraFavorites' }).props('thumbnailSize')).toBe(
        'large'
      )
      expect(wrapper.get('.camera-header').isVisible()).toBe(true)
      expect(wrapper.findComponent({ name: 'CameraFavorites' }).props('active')).toBe(true)
      await wrapper.getComponent({ name: 'TopBar' }).vm.$emit('toggleLanguage')
      await flushPromises()
      await vi.waitFor(() =>
        expect(wrapper.findAll('.mobile-navigation button')[2]!.text()).toBe('Camera parameters')
      )
    } finally {
      wrapper.unmount()
      vi.unstubAllGlobals()
    }
  })

  it('clears all website data and reloads only after the reset completes', async () => {
    getSavedAlbumDirectoryHandleMock.mockResolvedValue(null)
    const reload = vi.fn()
    vi.stubGlobal('location', { reload })
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(null, {
          status: 204,
          headers: { 'Clear-Site-Data': '"cache", "cookies", "storage"' }
        })
      )
    )
    sessionStorage.setItem('reset-session', 'saved')
    const favoriteKey = 'infinity-nikki-favorite-photo-ids'
    localStorage.setItem(favoriteKey, JSON.stringify(['original-album/photo.jpg']))
    localStorage.setItem('infinity-nikki-language', 'zh')
    const preserved = [
      ['resonance-records', 'current-profile', [{ id: 'kept-record' }]],
      ['camera-param-tags', 'order', ['保留分类']],
      ['camera-param-covers', 'kept', new NodeBlob(['kept-cover'])],
      [
        'camera-params',
        undefined,
        {
          id: 'kept',
          version: 1,
          name: '保留参数',
          tag: '保留分类',
          code: 'ABC',
          source: 'manual',
          createdAt: '2026-10-12T00:00:00Z',
          updatedAt: '2026-10-12T00:00:00Z',
          cover: null,
          result: {
            rawCameraParams: 'ABC',
            environmentFields: [],
            cameraFields: [],
            imageFields: [],
            resourceGroups: []
          }
        }
      ]
    ] as const
    for (const [storeName, key, value] of preserved)
      await runStoreRequest(storeName, 'readwrite', (store) =>
        key === undefined ? store.put(value) : store.put(value, key)
      )
    await runStoreRequest('local-state', 'readwrite', (store) =>
      store.put('cache', 'home-scheme-parse:one')
    )
    const wrapper = mount(App, {
      attachTo: document.body,
      global: { stubs: { CameraFavorites: true, ResonanceRecords: true } }
    })
    try {
      await flushPromises()
      wrapper.findComponent({ name: 'TopBar' }).vm.$emit('clearData')
      await nextTick()
      const dialog = wrapper.findComponent({ name: 'ConfirmDialog' })
      expect(dialog.props('message')).toContain('无法撤销')
      expect(dialog.props('message')).toContain('请先导出备份')
      dialog.vm.$emit('confirm')
      await vi.waitFor(() =>
        expect(document.body.textContent).toContain(messages.zh.app.clearDataStatus)
      )
      expect(localStorage.length).toBe(0)
      expect(sessionStorage.length).toBe(0)
      expect(reload).toHaveBeenCalledOnce()
      expect(await runStoreRequest('local-state', 'readonly', (store) => store.count())).toBe(
        0
      )
      for (const [storeName, key] of preserved)
        expect(
          await runStoreRequest(storeName, 'readonly', (store) => store.get(key ?? 'kept'))
        ).toBeUndefined()
    } finally {
      wrapper.unmount()
      for (const [storeName] of preserved)
        await runStoreRequest(storeName, 'readwrite', (store) => store.clear())
      vi.unstubAllGlobals()
    }
  })

  it('keeps data and does not reload when reset confirmation is cancelled', async () => {
    getSavedAlbumDirectoryHandleMock.mockResolvedValue(null)
    const reload = vi.fn()
    vi.stubGlobal('location', { reload })
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(null, {
          status: 204,
          headers: { 'Clear-Site-Data': '"cache", "cookies", "storage"' }
        })
      )
    )
    localStorage.setItem('reset-cancel', 'saved')
    await runStoreRequest('local-state', 'readwrite', (store) =>
      store.put('saved', 'reset-cancel')
    )
    const wrapper = mount(App, {
      attachTo: document.body,
      global: { stubs: { CameraFavorites: true } }
    })
    try {
      await flushPromises()
      wrapper.getComponent({ name: 'TopBar' }).vm.$emit('clearData')
      await nextTick()
      wrapper.getComponent({ name: 'ConfirmDialog' }).vm.$emit('cancel')
      await flushPromises()
      expect(localStorage.getItem('reset-cancel')).toBe('saved')
      expect(fetch).not.toHaveBeenCalledWith('/api/clear-site-data', expect.anything())
      expect(
        await runStoreRequest('local-state', 'readonly', (store) => store.get('reset-cancel'))
      ).toBe('saved')
      expect(reload).not.toHaveBeenCalled()
    } finally {
      wrapper.unmount()
      await runStoreRequest('local-state', 'readwrite', (store) =>
        store.delete('reset-cancel')
      )
      vi.unstubAllGlobals()
    }
  })

  it('reports storage reset failures without reloading or claiming success', async () => {
    getSavedAlbumDirectoryHandleMock.mockResolvedValue(null)
    const reload = vi.fn()
    vi.stubGlobal('location', { reload })
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(null, {
          status: 204,
          headers: { 'Clear-Site-Data': '"cache", "cookies", "storage"' }
        })
      )
    )
    const wrapper = mount(App, {
      attachTo: document.body,
      global: { stubs: { CameraFavorites: true } }
    })
    let clear: ReturnType<typeof vi.spyOn> | undefined
    try {
      await flushPromises()
      clear = vi.spyOn(Storage.prototype, 'clear').mockImplementation(() => {
        throw new Error('Storage unavailable')
      })
      wrapper.getComponent({ name: 'TopBar' }).vm.$emit('clearData')
      await nextTick()
      wrapper.getComponent({ name: 'ConfirmDialog' }).vm.$emit('confirm')
      await vi.waitFor(() =>
        expect(document.body.textContent).toContain(messages.zh.app.clearDataFailed)
      )
      expect(document.body.textContent).not.toContain(messages.zh.app.clearDataStatus)
      expect(reload).not.toHaveBeenCalled()
      clear.mockRestore()
      wrapper.getComponent({ name: 'TopBar' }).vm.$emit('clearData')
      await nextTick()
      wrapper.getComponent({ name: 'ConfirmDialog' }).vm.$emit('confirm')
      await vi.waitFor(() => expect(reload).toHaveBeenCalledOnce())
    } finally {
      clear?.mockRestore()
      wrapper.unmount()
      vi.unstubAllGlobals()
    }
  })

  it('locks directory selection while the saved directory lookup is pending', async () => {
    const savedDirectoryLookup = deferred<FileSystemDirectoryHandle | null>()
    getSavedAlbumDirectoryHandleMock.mockReturnValue(savedDirectoryLookup.promise)
    const wrapper = mount(App)

    await wrapper.get(`[aria-label="${messages.zh.topBar.albumMenuAria}"]`).trigger('click')
    await nextTick()
    const chooseDirectoryButton = [
      ...document.body.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')
    ].find((button) => button.textContent?.includes(gameAlbumMessages.zh.authorize))

    expect(chooseDirectoryButton?.disabled).toBe(true)

    savedDirectoryLookup.resolve(null)
    await flushPromises()
    expect(chooseDirectoryButton?.disabled).toBe(false)
    wrapper.unmount()
  })

  it('allows navigation without an album and opens resonance independently', async () => {
    getSavedAlbumDirectoryHandleMock.mockResolvedValue(null)
    const wrapper = mount(App, {
      attachTo: document.body,
      global: {
        stubs: { ResonanceRecords: { template: '<div class="resonance-workspace-stub" />' } }
      }
    })
    await flushPromises()
    await vi.waitFor(() =>
      expect(wrapper.findComponent({ name: 'AlbumViewSwitcher' }).props('disabled')).toBe(false)
    )

    for (const index of [1, 2, 4, 0]) {
      const button = wrapper.findAll('.album-view-button')[index === 4 ? 4 : index + 1]
      await vi.waitFor(() => expect((button.element as HTMLButtonElement).disabled).toBe(false))
      await button.trigger('click')
      await flushPromises()
      expect(button.attributes('aria-pressed')).toBe('true')
      expect(wrapper.find('.empty-album-start').exists()).toBe(index === 0 || index === 5)
      if (index === 1) {
        expect(wrapper.get('.outfit-grid-wrap .inline-empty h2').text()).toBe(
          messages.zh.outfit.emptyTitle
        )
        expect(
          wrapper
            .findAll('.outfit-header-actions button')
            .map((button) => (button.element as HTMLButtonElement).disabled)
        ).toEqual([false, false, true, false])
        const exportButton = wrapper
          .findAll('.outfit-header-actions button')
          .find((action) => action.text() === messages.zh.outfit.exportData)!
        await exportButton.trigger('click')
        await flushPromises()
        expect(wrapper.findComponent({ name: 'ConfirmDialog' }).props('visible')).toBe(false)
      }
      if (index === 2) {
        await vi.waitFor(() => expect(wrapper.find('.home-scheme-empty h2').exists()).toBe(true))
        expect(wrapper.get('.home-scheme-empty h2').text()).toBe(messages.zh.homeScheme.emptyTitle)
        await vi.waitFor(() =>
          expect(
            wrapper
              .findAll('.home-scheme-header-actions button')
              .map((button) => (button.element as HTMLButtonElement).disabled)
          ).toEqual([false, true, false])
        )
        await wrapper.findAll('.home-scheme-header-actions button')[1].trigger('click')
        await flushPromises()
        expect(wrapper.findComponent({ name: 'ConfirmDialog' }).props('visible')).toBe(false)
      }
      if (index === 4)
        await vi.waitFor(() =>
          expect(wrapper.findComponent({ name: 'CameraFavorites' }).props('active')).toBe(true)
        )
    }
    expect(readOutfitLibraryMock).toHaveBeenCalledWith(null)
    expect(wrapper.findComponent({ name: 'OutfitGuideDialog' }).props('visible')).toBe(false)

    await wrapper.findAll('.album-view-button')[5].trigger('click')
    expect(wrapper.find('.resonance-workspace-stub').exists()).toBe(false)
    await wrapper.get('.resonance-nav-menu [role=menuitem]').trigger('click')
    expect(wrapper.find('.resonance-workspace-stub').exists()).toBe(true)
    expect(wrapper.find('.empty-album-start').exists()).toBe(false)
    expect(wrapper.get('.album-layout').classes()).not.toContain('without-album')
    wrapper.unmount()
  })

  it('releases outfit object URLs when the application unmounts', async () => {
    const directoryHandle = {
      kind: 'directory',
      name: 'NikkiPhotos_HighQuality'
    } as FileSystemDirectoryHandle
    const outfit = { id: 'outfit-1', url: 'blob:outfit' } as OutfitItem
    const revokeObjectUrl = vi.fn()
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectUrl })
    getSavedAlbumDirectoryHandleMock.mockResolvedValue(directoryHandle)
    readAlbumDirectoryMock.mockResolvedValue({
      directoryName: directoryHandle.name,
      directoryHandle,
      photos: []
    })
    readOutfitCollectionMock.mockResolvedValue({ outfits: [outfit], tags: [], unreadableCount: 0 })

    const wrapper = mount(App)
    await flushPromises()
    await vi.waitFor(
      () =>
        expect(wrapper.findComponent({ name: 'AlbumViewSwitcher' }).props('outfitsCount')).toBe(1),
      { timeout: 3000 }
    )
    wrapper.unmount()

    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:outfit')
  })

  it('imports ZIP data without an album and applies the result without rescanning', async () => {
    const importedOutfit = { id: 'imported-outfit', url: null, timestamp: 1 } as OutfitItem
    getSavedAlbumDirectoryHandleMock.mockResolvedValue(null)
    importOutfitBackupMock.mockResolvedValue({
      addedCount: 1,
      duplicateCount: 0,
      failedCount: 0,
      rejectedTagCount: 0,
      library: {
        outfits: [importedOutfit],
        tags: ['甜美'],
        importedSharedCount: 0,
        failedCount: 0
      }
    })
    const wrapper = mount(App)
    await flushPromises()
    await vi.waitFor(() =>
      expect(wrapper.findComponent({ name: 'AlbumViewSwitcher' }).props('disabled')).toBe(false)
    )
    const scanCount = readOutfitLibraryMock.mock.calls.length
    const input = wrapper.get('#outfit-backup-input')
    const backup = new File(['zip'], 'backup.zip', { type: 'application/zip' })
    Object.defineProperty(input.element, 'files', { configurable: true, value: [backup] })

    await input.trigger('change')
    await flushPromises()

    expect(importOutfitBackupMock).toHaveBeenCalledWith(backup)
    expect(readOutfitLibraryMock).toHaveBeenCalledTimes(scanCount)
    wrapper.unmount()
  })

  it('keeps the global collection visible after cancelling album authorization', async () => {
    const directory = {
      kind: 'directory',
      name: 'NikkiPhotos_HighQuality'
    } as FileSystemDirectoryHandle
    const outfit: OutfitItem = {
      version: 1,
      id: 'global',
      image: 'global.webp',
      code: 'GLOBAL',
      tags: [],
      name: 'global.webp',
      note: '',
      url: null,
      createdAt: '2026-07-31T00:00:00.000Z',
      updatedAt: '2026-07-31T00:00:00.000Z',
      fileSizeText: '1 KB',
      dateKey: '2026-07-31',
      year: '2026',
      monthDay: '07月31日',
      displayDate: '2026年07月31日',
      timeText: '08:00',
      timestamp: 1
    }
    readOutfitCollectionMock.mockResolvedValue({ outfits: [outfit], tags: [], unreadableCount: 0 })
    readOutfitLibraryMock.mockResolvedValue({
      outfits: [outfit],
      tags: [],
      importedSharedCount: 0,
      failedCount: 0
    })
    getSavedAlbumDirectoryHandleMock.mockResolvedValue(directory)
    readAlbumDirectoryMock.mockResolvedValue({
      directoryName: directory.name,
      directoryHandle: directory,
      photos: []
    })
    const wrapper = mount(App, {
      global: {
        stubs: {
          CameraFavorites: true,
          OutfitGrid: {
            props: ['outfits'],
            template: '<div class="outfit-grid-stub">{{ outfits.length }}</div>'
          }
        }
      }
    })
    try {
      await flushPromises()
      wrapper.findComponent({ name: 'TopBar' }).vm.$emit('clearDirectory')
      await vi.waitFor(() =>
        expect(wrapper.findComponent({ name: 'TopBar' }).props('hasAlbumDirectory')).toBe(false)
      )
      await wrapper.findAll('.album-view-button')[2].trigger('click')
      await flushPromises()
      expect(wrapper.get('.outfit-grid-stub').text()).toBe('1')
      expect(
        wrapper
          .findAll('.outfit-header-actions button')
          .map((button) => (button.element as HTMLButtonElement).disabled)
      ).toEqual([false, false, false, false])
    } finally {
      wrapper.unmount()
    }
  })

  it.each([
    {
      name: 'Android',
      userAgent: 'Mozilla/5.0 (Linux; Android 14)',
      platform: 'Linux',
      touchPoints: 5,
      picker: true
    },
    {
      name: 'iPhone',
      userAgent: 'Mozilla/5.0 (iPhone)',
      platform: 'iPhone',
      touchPoints: 5,
      picker: false
    },
    {
      name: 'iPad desktop mode',
      userAgent: 'Mozilla/5.0 (Macintosh)',
      platform: 'MacIntel',
      touchPoints: 5,
      picker: true
    },
    {
      name: 'unsupported desktop',
      userAgent: 'Mozilla/5.0 (Windows NT 10.0)',
      platform: 'Win32',
      touchPoints: 0,
      picker: false
    }
  ])('opens outfits silently on $name without directory authorization', async (device) => {
    getSavedAlbumDirectoryHandleMock.mockResolvedValue(null)
    localStorage.setItem('infinity-nikki-outfit-guide-dismissed', 'true')
    const userAgent = vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(device.userAgent)
    const platform = vi.spyOn(navigator, 'platform', 'get').mockReturnValue(device.platform)
    const touchDescriptor = Object.getOwnPropertyDescriptor(navigator, 'maxTouchPoints')
    Object.defineProperty(navigator, 'maxTouchPoints', {
      configurable: true,
      value: device.touchPoints
    })
    const descriptor = Object.getOwnPropertyDescriptor(window, 'showDirectoryPicker')
    const picker = vi.fn()
    Object.defineProperty(window, 'showDirectoryPicker', {
      configurable: true,
      value: device.picker ? picker : undefined
    })
    const wrapper = mount(App, { global: { stubs: { CameraFavorites: true } } })
    try {
      await flushPromises()
      await wrapper.findAll('.album-view-button')[2].trigger('click')
      await flushPromises()
      expect(wrapper.find('.outfit-grid-wrap').exists()).toBe(true)
      expect(wrapper.findComponent({ name: 'ConfirmDialog' }).props('visible')).toBe(false)
      expect(wrapper.text()).not.toContain(messages.zh.fileSystem.mobileBrowserUnsupported)
      expect(wrapper.text()).not.toContain(messages.zh.fileSystem.unsupportedBrowser)
      expect(picker).not.toHaveBeenCalled()
      expect(readOutfitLibraryMock).toHaveBeenLastCalledWith(null)
    } finally {
      wrapper.unmount()
      userAgent.mockRestore()
      platform.mockRestore()
      if (touchDescriptor) Object.defineProperty(navigator, 'maxTouchPoints', touchDescriptor)
      else Reflect.deleteProperty(navigator, 'maxTouchPoints')
      if (descriptor) Object.defineProperty(window, 'showDirectoryPicker', descriptor)
      else delete window.showDirectoryPicker
    }
  })

  it('keeps a newly selected module when a slow saved album finishes restoring', async () => {
    const handle = { kind: 'directory', name: 'SavedAlbum' } as FileSystemDirectoryHandle
    getSavedAlbumDirectoryHandleMock.mockResolvedValue(handle)
    const reading = deferred<Awaited<ReturnType<typeof readAlbumDirectory>>>()
    readAlbumDirectoryMock.mockReturnValueOnce(reading.promise)
    const wrapper = mount(App, {
      global: { stubs: { CameraFavorites: true, HomeSchemeWorkspace: true } }
    })
    try {
      await flushPromises()
      const navigation = wrapper.findComponent({ name: 'AlbumViewSwitcher' })
      expect(navigation.props('disabled')).toBe(false)
      navigation.vm.$emit('changeView', 'home')
      await flushPromises()
      reading.resolve({ directoryName: 'SavedAlbum', directoryHandle: handle, photos: [] })
      await flushPromises()
      expect(navigation.props('activeView')).toBe('home')
    } finally {
      wrapper.unmount()
    }
  })

  it.each([false, true])(
    'offers X6Game authorization on initial outfits view unless dismissed (%s)',
    async (dismissed) => {
      getSavedAlbumDirectoryHandleMock.mockResolvedValue(null)
      localStorage.setItem('infinity-nikki-data-reminder-dismissed', 'true')
      localStorage.setItem('infinity-nikki-active-view', 'outfits')
      localStorage.setItem(
        'infinity-nikki-about-state',
        JSON.stringify({ version: '0.0.0', dismissedForever: true })
      )
      if (dismissed) localStorage.setItem('infinity-nikki-x6game-auto-prompt-dismissed', 'true')
      const originalPicker = window.showDirectoryPicker
      const picker = vi.fn()
      vi.stubGlobal('showDirectoryPicker', picker)
      const wrapper = mount(App, { global: { stubs: { Teleport: true } } })
      try {
        await flushPromises()
        const confirm = wrapper.getComponent({ name: 'ConfirmDialog' })
        expect(confirm.props('visible')).toBe(!dismissed)
        if (!dismissed)
          expect(confirm.props('title')).toBe(messages.zh.app.x6GameDirectoryDialogTitle)
        expect(picker).not.toHaveBeenCalled()
      } finally {
        wrapper.unmount()
        vi.stubGlobal('showDirectoryPicker', originalPicker)
      }
    }
  )

  it('keeps game directory authorization in the album menu instead of outfit actions', async () => {
    const album = { name: 'Independent' } as FileSystemDirectoryHandle
    const root = { kind: 'directory', name: 'X6Game' } as FileSystemDirectoryHandle
    vi.stubGlobal('showDirectoryPicker', vi.fn())
    localStorage.setItem('infinity-nikki-active-view', 'outfits')
    getSavedAlbumDirectoryHandleMock.mockResolvedValue(album)
    getSavedX6GameDirectoryHandleMock.mockResolvedValue(root)
    readAlbumDirectoryMock.mockResolvedValue({
      directoryHandle: album,
      directoryName: album.name,
      photos: []
    })
    const wrapper = mount(App, { global: { stubs: { Teleport: true } } })
    try {
      await flushPromises()
      const actions = wrapper.get('.outfit-header-actions')
      expect(actions.text()).not.toContain(gameAlbumMessages.zh.authorizeTools)
      expect(actions.text()).not.toContain(gameAlbumMessages.zh.reauthorizeTools)
      const topBar = wrapper.getComponent({ name: 'TopBar' })
      await topBar.get('.album-name-button').trigger('click')
      expect(topBar.text()).toContain(gameAlbumMessages.zh.reselect)
    } finally {
      wrapper.unmount()
      vi.unstubAllGlobals()
    }
  })

  it('checks an authorized game directory without an album and skips permission requests in background', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    getSavedAlbumDirectoryHandleMock.mockResolvedValue(null)
    const requestPermission = vi.fn(),
      queryPermission = vi.fn(async () => 'granted' as PermissionState)
    const game = {
      kind: 'directory',
      name: 'X6Game',
      queryPermission,
      requestPermission
    } as unknown as FileSystemDirectoryHandle
    getSavedX6GameDirectoryHandleMock.mockResolvedValue(game)
    const wrapper = mount(App, { global: { stubs: { CameraFavorites: true } } })
    try {
      await flushPromises()
      expect(readOutfitLibraryMock).not.toHaveBeenCalled()
      wrapper.findComponent({ name: 'AlbumViewSwitcher' }).vm.$emit('changeView', 'outfits')
      await flushPromises()
      expect(readOutfitLibraryMock).toHaveBeenCalledWith(
        expect.objectContaining({ x6GameDirectory: game })
      )
      queryPermission.mockResolvedValue('prompt')
      window.dispatchEvent(new Event('focus'))
      await vi.advanceTimersByTimeAsync(400)
      await flushPromises()
      expect(readOutfitLibraryMock).toHaveBeenLastCalledWith(null)
      expect(requestPermission).not.toHaveBeenCalled()
      expect(wrapper.findComponent({ name: 'ConfirmDialog' }).props('visible')).toBe(false)
    } finally {
      wrapper.unmount()
    }
  })

  it('opens the shared parse dialog from the outfit code input', async () => {
    const directoryHandle = {
      kind: 'directory',
      name: 'NikkiPhotos_HighQuality'
    } as FileSystemDirectoryHandle
    getSavedAlbumDirectoryHandleMock.mockResolvedValue(directoryHandle)
    readAlbumDirectoryMock.mockResolvedValue({
      directoryName: directoryHandle.name,
      directoryHandle,
      photos: []
    })
    const wrapper = mount(App, {
      global: {
        stubs: {
          Teleport: true,
          OutfitParseDialog: {
            props: ['visible', 'code'],
            template:
              '<div v-if="visible" class="parse-dialog-stub">{{ code }}<button class="parse-dialog-close" @click="$emit(\'close\')">Close</button></div>'
          }
        }
      }
    })
    await flushPromises()
    await vi.waitFor(() =>
      expect(wrapper.findComponent({ name: 'AlbumViewSwitcher' }).props('disabled')).toBe(false)
    )

    await wrapper.get('.tools-menu-button').trigger('click')
    await wrapper
      .get('.header-dropdown')
      .findAll('button')
      .find((button) => button.text() === messages.zh.topBar.parseTools)!
      .trigger('click')
    await vi.waitFor(() =>
      expect(wrapper.findAll('.parse-tools-section input:not([type="file"])')).toHaveLength(2)
    )
    const input = wrapper.findAll('.parse-tools-section input:not([type="file"])')[1]
    expect(input.attributes('placeholder')).toBe('填入搭配码进行解析')

    await input.setValue(' ABC 123 ')
    await flushPromises()
    await wrapper.findAll('form.parse-tools-section')[1].trigger('submit')
    await vi.waitFor(() => expect(wrapper.find('.parse-dialog-stub').exists()).toBe(true))

    expect(wrapper.get('.parse-dialog-stub').text()).toContain('ABC123')
    await wrapper.get('.parse-dialog-close').trigger('click')
    expect(wrapper.find('.parse-tools-dialog').exists()).toBe(true)
    expect(
      (
        wrapper.findAll('.parse-tools-section input:not([type="file"])')[1]
          .element as HTMLInputElement
      ).value
    ).toBe('')
    wrapper.unmount()
  })

  it('returns to the shared parse dialog after closing camera parameter results', async () => {
    const directoryHandle = {
      kind: 'directory',
      name: 'NikkiPhotos_HighQuality'
    } as FileSystemDirectoryHandle
    getSavedAlbumDirectoryHandleMock.mockResolvedValue(directoryHandle)
    readAlbumDirectoryMock.mockResolvedValue({
      directoryName: directoryHandle.name,
      directoryHandle,
      photos: []
    })
    decodeCameraParamsMock.mockResolvedValue({ ok: true, value: {} } as Awaited<
      ReturnType<typeof decodeCameraParams>
    >)
    const wrapper = mount(App, {
      global: {
        stubs: {
          Teleport: true,
          OutfitParseDialog: {
            props: ['visible', 'code'],
            template: '<div v-if="visible" class="parse-dialog-stub" />'
          },
          PhotoParamsDialog: {
            props: ['visible', 'messages'],
            template:
              '<div v-if="visible" class="photo-params-stub"><span>{{ messages.eyebrow }} {{ messages.labels.focalLength }} {{ messages.stages.ready }}</span><button class="photo-params-close" @click="$emit(\'close\')">Close</button></div>'
          }
        }
      }
    })
    await flushPromises()
    await vi.waitFor(() =>
      expect(wrapper.findComponent({ name: 'AlbumViewSwitcher' }).props('disabled')).toBe(false)
    )

    await wrapper.get('.tools-menu-button').trigger('click')
    await wrapper
      .get('.header-dropdown')
      .findAll('button')
      .find((button) => button.text() === messages.zh.topBar.parseTools)!
      .trigger('click')
    await vi.waitFor(() =>
      expect(wrapper.findAll('.parse-tools-section input:not([type="file"])')).toHaveLength(2)
    )
    const input = wrapper.findAll('.parse-tools-section input:not([type="file"])')[0]
    await input.setValue('camera-raw')
    await wrapper.findAll('form.parse-tools-section')[0].trigger('submit')
    await flushPromises()

    await vi.waitFor(() => expect(wrapper.find('.photo-params-stub').exists()).toBe(true))
    await wrapper.get('.photo-params-close').trigger('click')
    expect(wrapper.find('.parse-tools-dialog').exists()).toBe(true)
    expect(
      (
        wrapper.findAll('.parse-tools-section input:not([type="file"])')[0]
          .element as HTMLInputElement
      ).value
    ).toBe('')
    wrapper.unmount()
  })
})

it('blocks desktop and mobile navigation until a child operation settles', async () => {
  getSavedAlbumDirectoryHandleMock.mockResolvedValue(null)
  readOutfitCollectionMock.mockResolvedValue({ outfits: [], tags: [], unreadableCount: 0 })
  let finish!: () => void
  const wrapper = mount(App, {
    global: {
      stubs: {
        CameraFavorites: {
          setup() {
            const run = useModuleOperation('camera')
            void run(
              () =>
                new Promise<void>((resolve) => {
                  finish = resolve
                })
            )
            return () => null
          }
        }
      }
    }
  })
  try {
    await flushPromises()
    const desktop = wrapper.findComponent({ name: 'AlbumViewSwitcher' })
    const mobile = wrapper.findComponent({ name: 'MobileNavigation' })
    await vi.waitFor(() => expect(desktop.props('disabled')).toBe(false))
    desktop.vm.$emit('changeView', 'favorites')
    await flushPromises()
    const previous = desktop.props('activeView')
    expect(desktop.props('disabled')).toBe(true)
    expect(mobile.props('disabled')).toBe(true)
    desktop.vm.$emit('changeView', 'resonance')
    await flushPromises()
    expect(desktop.props('activeView')).toBe(previous)
    finish()
    await flushPromises()
    expect(desktop.props('disabled')).toBe(false)
    expect(mobile.props('disabled')).toBe(false)
    desktop.vm.$emit('changeView', 'resonance')
    await flushPromises()
    expect(desktop.props('activeView')).toBe('resonance')
  } finally {
    wrapper.unmount()
  }
})

it('shows logout notices before and after opening the cloud dialog', async () => {
  let cloud!: ArchiveCloudSync
  localStorage.clear()
  getSavedAlbumDirectoryHandleMock.mockResolvedValue(null)
  const wrapper = mount(App, {
    global: {
      stubs: {
        Teleport: true,
        CloudDialog: true,
        PersonalWardrobe: defineComponent({
          setup() {
            cloud = useArchiveCloud()
            return () => null
          }
        })
      }
    }
  })
  await flushPromises()
  const navigation = wrapper.getComponent({ name: 'AlbumViewSwitcher' })
  await vi.waitFor(() => expect(navigation.props('disabled')).toBe(false))
  navigation.vm.$emit('changeView', 'wardrobe')
  await flushPromises()
  expect(wrapper.findComponent({ name: 'ArchiveCloudDialog' }).exists()).toBe(true)
  vi.spyOn(cloud.session, 'logout').mockResolvedValue(undefined)
  await cloud.logout()
  await flushPromises()
  const notices = () => wrapper.getComponent({ name: 'OperationNotice' }).props('notices')
  expect(notices()).toEqual([
    expect.objectContaining({ message: '操作成功。', tone: 'success', source: 'archive-cloud' })
  ])

  wrapper.getComponent({ name: 'OperationNotice' }).vm.$emit('close', notices()[0].id)
  await nextTick()
  expect(notices()).toHaveLength(0)
  await cloud.open('login')
  await flushPromises()
  await vi.waitFor(() =>
    expect(wrapper.findComponent({ name: 'ArchiveCloudDialog' }).exists()).toBe(true)
  )
  cloud.close()
  await cloud.logout()
  await flushPromises()
  expect(notices()).toHaveLength(1)
})

it('warns after cloud restore if wardrobe refresh reports a failure', async () => {
  let cloud!: ArchiveCloudSync
  localStorage.clear()
  countHomeSchemesMock.mockResolvedValue(0)
  readOutfitLibraryMock.mockResolvedValue({
    outfits: [],
    tags: [],
    importedSharedCount: 0,
    failedCount: 0
  })
  getSavedAlbumDirectoryHandleMock.mockResolvedValue(null)
  readOutfitCollectionMock.mockResolvedValue({ outfits: [], tags: [], unreadableCount: 0 })
  const reload = vi.fn().mockResolvedValue(false)
  const wrapper = mount(App, {
    global: {
      stubs: {
        ArchiveCloudDialog: true,
        PersonalWardrobe: defineComponent({
          setup(_, { expose }) {
            cloud = useArchiveCloud()
            expose({ reload })
            return () => null
          }
        })
      }
    }
  })
  await flushPromises()
  const navigation = wrapper.getComponent({ name: 'AlbumViewSwitcher' })
  await vi.waitFor(() => expect(navigation.props('disabled')).toBe(false))
  navigation.vm.$emit('changeView', 'wardrobe')
  await flushPromises()
  cloud.visible.value = true
  await flushPromises()
  wrapper.getComponent({ name: 'ArchiveCloudDialog' }).vm.$emit('restored', ['wardrobe'])
  await flushPromises()
  expect(reload).toHaveBeenCalledOnce()
  await vi.waitFor(() =>
    expect(wrapper.getComponent({ name: 'OperationNotice' }).props('notices')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining('部分界面刷新失败'),
          tone: 'warning'
        })
      ])
    )
  )
})

it('locks note editing and duplicate saves until the pending write settles', async () => {
  localStorage.clear()
  vi.clearAllMocks()
  getSavedX6GameDirectoryHandleMock.mockResolvedValue(null)
  readOutfitCollectionMock.mockResolvedValue({ outfits: [], tags: [], unreadableCount: 0 })
  listRecentlyDeletedMock.mockResolvedValue([])
  countHomeSchemesMock.mockResolvedValue(0)
  readOutfitLibraryMock.mockResolvedValue({
    outfits: [],
    tags: [],
    importedSharedCount: 0,
    failedCount: 0
  })
  const directory = { kind: 'directory', name: 'Album' } as FileSystemDirectoryHandle
  const photo = {
    id: 'note-photo',
    name: '2026_11_19_12_00_00.jpg',
    note: '',
    url: null,
    timestamp: 1,
    dateKey: '2026-11-19',
    year: '2026',
    monthDay: '11月19日',
    displayDate: '2026年11月19日',
    timeText: '12:00',
    fileHandle: {},
    directoryHandle: directory
  }
  getSavedAlbumDirectoryHandleMock.mockResolvedValue(directory)
  readAlbumDirectoryMock.mockResolvedValue({
    directoryName: 'Album',
    directoryHandle: directory,
    photos: [photo]
  } as never)
  const read = vi
    .spyOn(albumNotesApi, 'readAlbumMetadata')
    .mockResolvedValue({ version: 1, photos: {} } as never)
  const pending = deferred<string>()
  const save = vi.spyOn(albumNotesApi, 'savePhotoNote').mockReturnValue(pending.promise)
  const wrapper = mount(App, { global: { stubs: { CameraFavorites: true, PhotoGrid: true } } })
  try {
    await flushPromises()
    const nav = wrapper.getComponent({ name: 'AlbumViewSwitcher' })
    await vi.waitFor(() => expect(nav.props('disabled')).toBe(false))
    nav.vm.$emit('changeView', 'all')
    await flushPromises()
    wrapper.getComponent({ name: 'PhotoGrid' }).vm.$emit('editNote', photo)
    await flushPromises()
    const dialog = wrapper.getComponent({ name: 'NoteDialog' })
    expect(dialog.props('visible')).toBe(true)
    dialog.vm.$emit('save', 'saved note')
    await nextTick()
    expect(dialog.props('busy')).toBe(true)
    dialog.vm.$emit('cancel')
    dialog.vm.$emit('save', 'duplicate')
    await nextTick()
    expect(dialog.props('visible')).toBe(true)
    expect(save).toHaveBeenCalledOnce()
    pending.resolve('saved note')
    await flushPromises()
    expect(dialog.props('visible')).toBe(false)
    expect(dialog.props('busy')).toBe(false)
  } finally {
    wrapper.unmount()
    read.mockRestore()
    save.mockRestore()
  }
})
