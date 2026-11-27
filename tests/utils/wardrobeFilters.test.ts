import { describe, expect, it } from 'vitest'
import { loadWardrobeCatalog, type WardrobeEntry } from '../../src/utils/wardrobe/wardrobeCatalog'
import {
  matchesWardrobeGameVersion,
  matchesWardrobeSource,
  wardrobeGameVersionOptions,
  wardrobeGameVersionFromSource,
  wardrobeSourceOptions,
  wardrobeTagOptions
} from '../../src/utils/wardrobe/wardrobeFilters'

const entry = (metadata: Partial<WardrobeEntry> = {}): WardrobeEntry => ({
  id: '1020100347',
  kind: 'item',
  name: { zh: '测试部件', en: 'Test piece' },
  quality: 5,
  variant: 0,
  category: 0,
  familyRootId: '1020100347',
  style: 'elegant',
  image: '',
  parts: ['1020100347'],
  labels: [116, 115],
  obtainType: 21001,
  version: '2.10',
  sourceDetails: [],
  ...metadata
})

describe('wardrobe filter metadata', () => {
  it('maps the internal 500 source prefix to release 3.0 across suits and parts', async () => {
    expect(wardrobeGameVersionFromSource(50012)).toBe('3.0')
    expect(wardrobeGameVersionFromSource(21001)).toBe('2.10')
    expect(wardrobeGameVersionFromSource(null)).toBeNull()
    const catalog = await loadWardrobeCatalog()
    const entries = catalog.entries.filter((entry) => String(entry.obtainType).startsWith('500'))
    expect(entries.length).toBeGreaterThan(0)
    expect(entries.every((entry) => entry.version === '3.0')).toBe(true)
    expect(catalog.byId.get('10529')!.version).toBe('3.0')
  })
  it('loads real compact metadata and preserves exact banner members across evolutions', async () => {
    const catalog = await loadWardrobeCatalog()
    const base = catalog.byId.get('10347')!
    const evolved = catalog.byId.get('1034702')!
    expect(base).toMatchObject({
      style: 'elegant',
      labels: [116, 115],
      obtainType: 21001,
      version: '2.10'
    })
    expect(evolved).toMatchObject({
      variant: 2,
      familyRootId: base.id,
      labels: [116, 115],
      version: '2.10'
    })

    const basePiece = catalog.byId.get('1020100347')!
    const evolvedPiece = catalog.byId.get('1023100347')!
    expect(base.parts).toContain(basePiece.id)
    expect(evolved.parts).toContain(evolvedPiece.id)
    expect(matchesWardrobeSource(evolvedPiece, 'limited')).toBe(true)

    const independent = catalog.byId.get('1020200170')!
    expect(independent).toMatchObject({ name: { zh: '守夜者' }, style: 'cool', version: '2.10' })
    expect(
      catalog.entries.some(
        (candidate) => candidate.kind === 'outfit' && candidate.parts.includes(independent.id)
      )
    ).toBe(false)
    expect(matchesWardrobeSource(independent, 'limited')).toBe(true)
    expect(matchesWardrobeSource(independent, 'limited-reward')).toBe(true)
  })

  it('matches exact game versions without confusing 2.1 with 2.10', () => {
    const current = entry()
    expect(matchesWardrobeGameVersion(current, '2.10')).toBe(true)
    expect(matchesWardrobeGameVersion(current, '2.1')).toBe(false)
    expect(matchesWardrobeGameVersion(entry({ version: null }), 'all')).toBe(true)

    const versions = wardrobeGameVersionOptions('zh').map((option) => option.value)
    expect(versions).toContain('2.10')
    expect(versions).toContain('2.9')
    expect(versions).not.toContain('2.x')
    expect(versions).not.toContain('1.x')
    expect(versions.indexOf('2.10')).toBeLessThan(versions.indexOf('2.9'))
  })

  it('matches source group IDs independently from their translation keys', () => {
    expect(matchesWardrobeSource(entry(), 'limited')).toBe(true)
    expect(matchesWardrobeSource(entry(), 'event')).toBe(false)
    expect(matchesWardrobeSource(entry({ obtainType: 21006 }), 'event')).toBe(true)
    expect(matchesWardrobeSource(entry({ obtainType: 21006 }), 'limited')).toBe(false)

    const quest = entry({ obtainType: 10018, sourceDetails: [] })
    expect(matchesWardrobeSource(quest, 'quest')).toBe(true)
    expect(matchesWardrobeSource(quest, 'world')).toBe(false)
    expect(matchesWardrobeSource(entry({ obtainType: 20305 }), 'world')).toBe(true)

    const unknown = entry({ obtainType: null, sourceDetails: [] })
    expect(matchesWardrobeSource(unknown, 'limited')).toBe(false)
    expect(matchesWardrobeSource(unknown, 'event')).toBe(false)
    expect(matchesWardrobeSource(unknown, 'all')).toBe(true)
  })

  it('offers translated tags and only source choices applicable to the current catalog tab', () => {
    expect(wardrobeTagOptions('zh')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ value: '116', label: '绮想' }),
        expect.objectContaining({ value: '115', label: '唯美' })
      ])
    )
    const outfits = wardrobeSourceOptions('outfit', 'zh').map((option) => option.value)
    const pieces = wardrobeSourceOptions('item', 'zh').map((option) => option.value)
    expect(outfits).toContain('limited')
    expect(outfits).not.toContain('merchant')
    expect(pieces).toContain('limited')
    expect(pieces).toContain('merchant')
    expect(pieces).toContain('limited-reward')
    expect(outfits).not.toContain('limited-reward')
    expect(wardrobeSourceOptions('item', 'zh')).toContainEqual({
      value: 'limited-reward',
      label: '限定四星奖励'
    })
    expect([...outfits, ...pieces].some((value) => value.startsWith('limited:'))).toBe(false)
    expect(wardrobeSourceOptions('outfit', 'zh')).toEqual(
      expect.arrayContaining([
        { value: 'heart', label: '无限之心' },
        { value: 'chest', label: '宝箱设计图' },
        { value: 'cadenceborn', label: '唱诗蓝龙' },
        { value: 'pear', label: '商城' }
      ])
    )
  })
})

it('limits unknown ownership to the five configured item sources', async () => {
  const { isWardrobeItemUnknown, hasIncompleteWardrobeOwnership } =
    await import('../../src/utils/wardrobe/wardrobeFilters')
  const { default: metadata } = await import('../../src/data/gongeo/filterMetadata.json')
  const sources = ['starlit', 'merchant', 'miracrown', 'surprise', 'world']
  for (const source of metadata.sources) {
    expect(hasIncompleteWardrobeOwnership(source.key)).toBe(sources.includes(source.key))
    for (const obtainType of source.ids) {
      expect(isWardrobeItemUnknown({ kind: 'item', obtainType }, false)).toBe(
        sources.includes(source.key)
      )
      expect(isWardrobeItemUnknown({ kind: 'item', obtainType }, true)).toBe(false)
      expect(isWardrobeItemUnknown({ kind: 'outfit', obtainType }, false)).toBe(false)
    }
  }
})
