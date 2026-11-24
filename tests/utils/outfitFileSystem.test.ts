// @vitest-environment node
import { expect, it, vi } from 'vitest'
import { setupOutfitDatabaseTests, webp, gameSource } from '../helpers/outfitDatabase'
import {
  readOutfitLibrary,
  importLatestSharedOutfit
} from '../../src/utils/outfit/outfitFileSystem'
import {
  deleteOutfit,
  readOutfitCollection,
  readOutfitSnapshot,
  saveOutfit
} from '../../src/utils/outfit/outfitStorage'
import { OUTFITS_STORE } from '../../src/utils/file-system/database'
setupOutfitDatabaseTests()

it('imports game outfits without selecting an album and never overwrites an existing code', async () => {
  const game = gameSource()
  game.publish('101', 'CODE1', 200)
  const first = await readOutfitLibrary(game.source)
  expect(first.importedSharedCount).toBe(1)
  const item = first.outfits[0]
  await saveOutfit({ outfit: item, code: item.code, tag: null, note: '人工备注' })
  const second = await importLatestSharedOutfit(game.source)
  expect(second.failureStage).toBe('duplicate')
  expect((await readOutfitSnapshot()).records[0].note).toBe('人工备注')
})
it('scopes image progress to the game source and player and preserves it after deleting the last outfit', async () => {
  const first = gameSource()
  first.publish('101', 'A', 500, 500)
  expect((await importLatestSharedOutfit(first.source)).importedCount).toBe(1)
  first.publish('102', 'B', 600, 100)
  expect((await importLatestSharedOutfit(first.source)).importedCount).toBe(1)
  const other = gameSource()
  other.publish('101', 'C', 200, 200)
  expect((await importLatestSharedOutfit(other.source)).importedCount).toBe(1)
  const a = (await readOutfitCollection()).outfits.find((item) => item.code === 'A')!
  await deleteOutfit(a)
  first.publish('101', 'D', 700, 500)
  expect((await importLatestSharedOutfit(first.source)).failureStage).toBe('image-not-updated')
  first.publish('101', 'D', 700, 701)
  expect((await importLatestSharedOutfit(first.source)).importedCount).toBe(1)
  first.publish('101', 'A', 800, 801)
  expect((await importLatestSharedOutfit(first.source)).importedCount).toBe(0)
  expect((await readOutfitSnapshot()).ignoredCodes).toContain('A')
})
it('does not advance game progress after transaction failure and retries the same source successfully', async () => {
  const game = gameSource()
  game.publish('101', 'CODE1', 200)
  const put = IDBObjectStore.prototype.put
  const spy = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
    this: IDBObjectStore,
    ...args: Parameters<IDBObjectStore['put']>
  ) {
    if (this.name === OUTFITS_STORE) throw new DOMException('Full', 'QuotaExceededError')
    return put.apply(this, args)
  })
  expect((await importLatestSharedOutfit(game.source)).failedCount).toBe(1)
  spy.mockRestore()
  expect((await importLatestSharedOutfit(game.source)).importedCount).toBe(1)
})
it('defers import if the game changes the source image during conversion', async () => {
  const game = gameSource(),
    player = game.publish('101', 'CODE1', 200)
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => {
      player.files.set('latest.webp', webp('latest.webp', 'changed', 201))
      return { width: 10, height: 10, close() {} }
    })
  )
  expect((await importLatestSharedOutfit(game.source)).failureStage).toBe('source-changed')
  expect((await readOutfitSnapshot()).records).toHaveLength(0)
})
it('falls back to the next readable share history when the newest file is corrupt', async () => {
  const game = gameSource()
  game.publish('101', 'OLDER', 100, 101)
  game.share.files.set(
    '101-new-sharecode.json',
    new File(['broken'], '101-new-sharecode.json', { lastModified: 200 })
  )
  expect((await importLatestSharedOutfit(game.source)).importedCount).toBe(1)
  expect((await readOutfitSnapshot()).records[0].code).toBe('OLDER')
})
