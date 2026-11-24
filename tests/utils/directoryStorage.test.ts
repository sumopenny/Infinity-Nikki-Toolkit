import 'fake-indexeddb/auto'
import { clearAllBrowserData, DB_VERSION } from '../../src/utils/file-system/database'
import { afterEach, describe, expect, it } from 'vitest'
import {
  clearSavedAlbumDirectoryHandle,
  clearSavedOutfitParseResults,
  getSavedAlbumDirectoryHandle,
  getSavedGameAlbumUid,
  getSavedHomeSchemeParseResult,
  getSavedOutfitParseResult,
  getSavedX6GameDirectoryHandle,
  saveAlbumDirectoryHandle,
  saveGameAlbumDirectory,
  saveHomeSchemeParseResult,
  saveOutfitParseResult,
  saveX6GameDirectoryHandle
} from '../../src/utils/file-system/directoryStorage'

afterEach(clearAllBrowserData)
const handle = (name: string) => ({ name }) as unknown as FileSystemDirectoryHandle

describe('directoryStorage', () => {
  it('stores album and X6Game handles independently', async () => {
    const album = handle('album')
    const game = handle('X6Game')
    await saveAlbumDirectoryHandle(album)
    await saveX6GameDirectoryHandle(game)
    expect((await getSavedAlbumDirectoryHandle())?.name).toBe('album')
    expect((await getSavedX6GameDirectoryHandle())?.name).toBe('X6Game')
  })
  it('clears only the requested handle', async () => {
    const album = handle('album')
    const game = handle('X6Game')
    await saveAlbumDirectoryHandle(album)
    await saveX6GameDirectoryHandle(game)
    await clearSavedAlbumDirectoryHandle()
    expect(await getSavedAlbumDirectoryHandle()).toBeUndefined()
    expect((await getSavedX6GameDirectoryHandle())?.name).toBe('X6Game')
  })

  it('saves the selected game account and detaches it when opening or clearing a separate album', async () => {
    const highQuality = handle('NikkiPhotos_HighQuality')
    const game = handle('X6Game')
    await saveGameAlbumDirectory(game, highQuality, '100128456')
    expect(await getSavedGameAlbumUid()).toBe('100128456')
    expect(await getSavedX6GameDirectoryHandle()).toEqual(game)
    expect(await getSavedAlbumDirectoryHandle()).toEqual(highQuality)

    const independent = handle('separate')
    await saveAlbumDirectoryHandle(independent)
    expect(await getSavedGameAlbumUid()).toBeUndefined()
    expect(await getSavedAlbumDirectoryHandle()).toEqual(independent)
    expect(await getSavedX6GameDirectoryHandle()).toEqual(game)

    await saveGameAlbumDirectory(game, highQuality, '100274913')
    await clearSavedAlbumDirectoryHandle()
    expect(await getSavedGameAlbumUid()).toBeUndefined()
    expect(await getSavedX6GameDirectoryHandle()).toEqual(game)
  })

  it('stores and clears outfit-code parse results independently', async () => {
    const result = { code: 'a1B2c3D4e5F#', wearingClothes: [], dyeItems: [] }
    await saveOutfitParseResult(result.code, result)
    expect(await getSavedOutfitParseResult(result.code)).toEqual(result)

    await clearSavedOutfitParseResults()
    expect(await getSavedOutfitParseResult(result.code)).toBeUndefined()
  })

  it('ignores legacy outfit parse results after the parser cache version changes', async () => {
    const code = 'legacy1A2B3C#'
    await new Promise<void>((resolve) => {
      const request = indexedDB.deleteDatabase('infinity-nikki-album-manager')
      request.onsuccess = request.onerror = request.onblocked = () => resolve()
    })
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('infinity-nikki-album-manager', 3)
      request.onupgradeneeded = () => request.result.createObjectStore('album-handles')
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('album-handles', 'readwrite')
      tx.objectStore('album-handles').put({ code, dyeItems: [] }, `outfit-code-parse:${code}`)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    db.close()

    expect(await getSavedOutfitParseResult(code)).toBeUndefined()
    await clearSavedOutfitParseResults()

    const checkDb = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('infinity-nikki-album-manager', DB_VERSION)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    const remainingKeys = await new Promise<IDBValidKey[]>((resolve, reject) => {
      const tx = checkDb.transaction('album-handles', 'readonly')
      const request = tx.objectStore('album-handles').getAllKeys()
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    checkDb.close()
    expect(remainingKeys).not.toContain(`outfit-code-parse:${code}`)
  })

  it('stores home-scheme parse results independently of other browser data', async () => {
    const homeResult = { code: 'home123', parserVersion: 'wire-v1' }
    const outfitResult = { code: 'outfit123' }
    await saveAlbumDirectoryHandle(handle('album'))
    await saveHomeSchemeParseResult(homeResult.code, homeResult)
    await saveOutfitParseResult(outfitResult.code, outfitResult)
    expect(await getSavedHomeSchemeParseResult(homeResult.code)).toEqual(homeResult)

    expect(await getSavedOutfitParseResult(outfitResult.code)).toEqual(outfitResult)
    expect((await getSavedAlbumDirectoryHandle())?.name).toBe('album')
  })
})
