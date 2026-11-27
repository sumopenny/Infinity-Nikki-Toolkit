import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { clearAllBrowserData, openDb } from '../../src/utils/file-system/database'
import { loadWardrobeCatalog } from '../../src/utils/wardrobe/wardrobeCatalog'
import { parseWardrobePearpal } from '../../src/utils/wardrobe/wardrobeImport'
import {
  createWardrobeBackup,
  emptyWardrobe,
  loadWardrobe,
  readWardrobeSnapshot,
  parseWardrobeBackup,
  updateWardrobe,
  resolveUnknownWardrobeSuits
} from '../../src/utils/wardrobe/wardrobeStorage'

beforeEach(() => clearAllBrowserData())
describe('wardrobe catalog and notebook import', () => {
  it('loads 3.0 clothes with their evolution and imports the exact new suit members', async () => {
    const catalog = await loadWardrobeCatalog()
    const evolved = catalog.byId.get('1036501')!
    const hair = catalog.byId.get('2022100365')!
    expect(evolved.name.zh).toBe('栖蝶不知春·风雪变')
    expect(hair.variant).toBe(1)
    expect(catalog.byId.get('2023100365')!.variant).toBe(2)
    expect(catalog.byId.get('2024100365')!.variant).toBe(3)
    expect(catalog.byId.get('2025100365')!.variant).toBe(4)
    expect(evolved.parts).toContain(hair.id)
    const preview = parseWardrobePearpal({ info_from_self: { suit_list: ['1036501'] } }, catalog)
    expect(Object.keys(preview.snapshot.entries).sort()).toEqual([...evolved.parts].sort())
  })
  it('keeps variants separate and imports exact suit pieces without requiring gacha', async () => {
    const catalog = await loadWardrobeCatalog()
    const base = catalog.byId.get('10347')!,
      variant = catalog.byId.get('1034702')!
    expect(base.variant).toBe(0)
    expect(variant.variant).toBe(2)
    expect(variant.parts.length).toBeGreaterThan(0)
    const preview = parseWardrobePearpal(
      { info_from_self: { suit_list: ['1034702', '1034702'] } },
      catalog
    )
    expect(Object.keys(preview.snapshot.entries).sort()).toEqual([...variant.parts].sort())
    expect(base.parts.some((id) => preview.snapshot.entries[id])).toBe(false)
    expect(catalog.entries.every((entry) => entry.kind === 'item' || entry.kind === 'outfit')).toBe(
      true
    )
  })
  it('deduplicates suit and pull data, retains unknown clothes and excludes makeup', async () => {
    const catalog = await loadWardrobeCatalog(),
      outfit = catalog.byId.get('10347')!
    const preview = parseWardrobePearpal(
      {
        info_from_gm: { clothes: [{ item_id: '1020199999' }, { item_id: '1020810001' }] },
        info_from_self: {
          suit_list: ['10347', '99999'],
          gacha_list: [{ result: outfit.parts[0] }, { result: 'not-an-id' }]
        }
      },
      catalog
    )
    expect(Object.keys(preview.snapshot.entries)).toHaveLength(outfit.parts.length + 1)
    expect(preview.snapshot.entries['1020810001']).toBeUndefined()
    expect(preview.snapshot.unknownSuitIds).toEqual(['99999'])
    expect(preview.snapshot.entries['1020199999']?.owned).toBe(true)
    expect(() => parseWardrobePearpal({ records: [] }, catalog)).toThrow()
  })
})
describe('wardrobe persistence and backup', () => {
  it('commits manual edits atomically and survives reload', async () => {
    await Promise.all(
      ['1020100347', '1020100399'].map((id) =>
        updateWardrobe((latest) => {
          latest.entries[id] = { owned: true, source: 'manual' }
          return latest
        })
      )
    )
    expect(Object.keys((await loadWardrobe()).entries)).toHaveLength(2)
    const db = await openDb()
    expect(db.objectStoreNames.contains('resonance-records')).toBe(true)
    db.close()
  })
  it('replaces manual data, rejects stale preview and leaves committed data intact', async () => {
    const initial = await updateWardrobe((latest) => {
      latest.entries['1020100347'] = { owned: true, source: 'manual' }
      return latest
    })
    const base = JSON.stringify(initial)
    const imported = {
      ...emptyWardrobe(),
      entries: { '1020100399': { owned: true, source: 'pearpal' as const } }
    }
    await updateWardrobe(() => imported, base)
    expect((await loadWardrobe()).entries['1020100347']).toBeUndefined()
    await expect(updateWardrobe(() => emptyWardrobe(), base)).rejects.toThrow('WARDROBE_CHANGED')
    expect((await loadWardrobe()).entries['1020100399']?.owned).toBe(true)
  })
  it('round trips explicit unowned state and rejects unrelated or malformed JSON', () => {
    const data = {
      ...emptyWardrobe(),
      entries: { '1020100347': { owned: false, source: 'manual' as const } },
      unknownSuitIds: ['99999']
    }
    expect(parseWardrobeBackup(createWardrobeBackup(data))).toEqual(data)
    expect(() => parseWardrobeBackup('{"records":[]}')).toThrow()
    expect(() =>
      parseWardrobeBackup(
        JSON.stringify({
          format: 'nikki-personal-wardrobe',
          version: 1,
          data: { ...data, entries: { '1020100347': { owned: 'yes', source: 'manual' } } }
        })
      )
    ).toThrow()
    expect(createWardrobeBackup({ ...data, token: 'discard-me' } as typeof data)).not.toContain(
      'discard-me'
    )
  })
})

it('maps outfit family/style separately from item categories without persisting catalog metadata', async () => {
  const catalog = await loadWardrobeCatalog()
  const variant = catalog.byId.get('1029402')!
  expect(variant.familyRootId).toBe('10294')
  expect(catalog.byId.get(variant.familyRootId!)!.name.zh).toBe('花影心期')
  expect(variant.style).toBe('sweet')
  expect(variant.name.zh).toBe('花影心期·炽心')
  expect(variant.variant).toBe(2)
  expect(variant.parts).toHaveLength(10)
  const hair = catalog.byId.get(variant.parts[0])!
  expect(hair.kind).toBe('item')
  expect(hair.category).toBe(0)
  expect(hair.style).toBe('sweet')
  const imported = parseWardrobePearpal(
    { info_from_self: { suit_list: ['1029402'] } },
    catalog
  ).snapshot
  expect(Object.keys(imported.entries[variant.parts[0]])).toEqual(['owned', 'source'])
})

it('preserves valid empty imports through backup and distinguishes a clear', async () => {
  const catalog = await loadWardrobeCatalog()
  const parsed = parseWardrobePearpal({ info_from_self: { suit_list: [] } }, catalog).snapshot
  await updateWardrobe(() => parsed)
  expect((await loadWardrobe()).imported).toBe(true)
  expect(parseWardrobeBackup(createWardrobeBackup(await loadWardrobe())).imported).toBe(true)
  await updateWardrobe(() => emptyWardrobe())
  expect((await loadWardrobe()).imported).toBe(false)
})

it('resolves newly catalogued suits on load, persists them, and retains unresolved IDs', async () => {
  const catalog = await loadWardrobeCatalog()
  await updateWardrobe(() => ({
    ...emptyWardrobe(),
    imported: true,
    unknownSuitIds: ['10347', '99999']
  }))
  const loaded = await loadWardrobe()
  expect(loaded.unknownSuitIds).toEqual(['99999'])
  for (const part of catalog.byId.get('10347')!.parts)
    expect(loaded.entries[part]?.owned).toBe(true)
  expect(await loadWardrobe()).toEqual(loaded)
  const incomplete = { ...catalog.byId.get('10347')!, parts: ['9999999999'] }
  const snapshot = { ...emptyWardrobe(), unknownSuitIds: ['10347'] }
  expect(
    resolveUnknownWardrobeSuits(snapshot, {
      entries: [incomplete],
      byId: new Map([['10347', incomplete]])
    })
  ).toBe(snapshot)
})

it('reports catalog resolution and storage writes at their actual boundaries', async () => {
  await updateWardrobe((snapshot) => ({ ...snapshot, unknownSuitIds: ['10347'] }))
  const stages: string[] = []
  const result = await loadWardrobe((stage) => stages.push(stage))
  expect(stages).toEqual(['read-storage', 'load-catalog', 'resolve-suits', 'write-storage'])
  expect(result.unknownSuitIds).toEqual([])
  expect(Object.keys(result.entries).length).toBeGreaterThan(0)
  expect((await readWardrobeSnapshot()).entries).toEqual(result.entries)
})

it('does not write resolved suits when the caller invalidates the load after catalog loading', async () => {
  await updateWardrobe((snapshot) => ({ ...snapshot, unknownSuitIds: ['10347'] }))
  const before = await readWardrobeSnapshot()
  await expect(
    loadWardrobe((stage) => {
      if (stage === 'resolve-suits') throw new Error('WARDROBE_LOAD_CANCELLED')
    })
  ).rejects.toThrow('WARDROBE_LOAD_CANCELLED')
  expect(await readWardrobeSnapshot()).toEqual(before)
})
