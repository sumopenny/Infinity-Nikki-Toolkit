import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'

beforeEach(() => vi.stubEnv('NO_PROXY', '*'))
afterEach(() => vi.unstubAllEnvs())
// @ts-expect-error Native ESM build scripts are outside the frontend TypeScript compilation.
// prettier-ignore
import { compareGameVersions, formatGongeoResult, parseGongeoBanners, updateGongeoCatalog } from '../../scripts/update-gongeo-catalog.mjs'

const baseUrl = 'https://raw.example.test/gongeo/master'
const indexUrl = baseUrl + '/public/catalog/index.json'
const directories: string[] = []
const generatedAt = '2026-09-23T22:44:13.188Z'
type Asset = { path: string; hash: string; bytes: number }
type Fixture = {
  index: { gameVersion: string; generatedAt: string; files: Record<string, Asset> }
  responses: Map<string, string>
}

async function temporaryDir() {
  const dir = await mkdtemp(join(tmpdir(), 'gongeo-catalog-test-'))
  directories.push(dir)
  return dir
}
async function snapshot(dir: string, prefix = ''): Promise<Record<string, string>> {
  const files: Record<string, string> = {}
  for (const entry of await readdir(join(dir, prefix), { withFileTypes: true })) {
    const path = join(prefix, entry.name)
    if (entry.isDirectory()) Object.assign(files, await snapshot(dir, path))
    else files[path] = await readFile(join(dir, path), 'utf8')
  }
  return files
}
function setAsset(fixture: Fixture, name: string, value: unknown) {
  const text = JSON.stringify(value)
  const hash = createHash('sha256').update(text).digest('hex').slice(0, 12)
  const path = '/catalog/' + name + '.' + hash + '.json'
  fixture.index.files[name] = { path, hash, bytes: Buffer.byteLength(text) }
  fixture.responses.set(baseUrl + '/public' + path, text)
  fixture.responses.set(indexUrl, JSON.stringify(fixture.index))
}
function fixtures(published = false): Fixture {
  const fixture: Fixture = {
    index: { gameVersion: '2.10.1', generatedAt, files: {} },
    responses: new Map()
  }
  setAsset(
    fixture,
    'items',
    Array.from({ length: 100 }, (_, i) => [
      i % 2 ? [1000 + i] : 1000 + i,
      5,
      0,
      4,
      [1],
      21001,
      1000 + i
    ])
  )
  setAsset(
    fixture,
    'outfits',
    Array.from({ length: 100 }, (_, i) => [i % 2 ? [2000 + i] : 2000 + i, 5, 4, [1], 21001])
  )
  setAsset(
    fixture,
    'outfitItems',
    Array.from({ length: 100 }, (_, i) => [2000 + i, [1000 + i]])
  )
  setAsset(
    fixture,
    'makeupItems',
    Array.from({ length: 100 }, (_, i) => [3000 + i, [1000 + i]])
  )
  setAsset(
    fixture,
    'makeupOutfits',
    Array.from({ length: 100 }, (_, i) => [2000 + i, [3000 + i]])
  )
  setAsset(fixture, 'palettes', {
    items: Array.from({ length: 100 }, (_, i) => [i % 2 ? [1000 + i] : 1000 + i, [1], [2]]),
    palettes: { '1': [1, 2, 3] }
  })
  const banners = Array.from({ length: 70 }, (_, i) => ({
    bannerId: i + 1,
    bannerType: i === 0 ? 3 : i === 1 ? 1 : 2,
    name: '卡池' + (i + 1),
    outfit4StarId: ['2000'],
    outfit5StarId: ['2001'],
    runs: [{ version: '2.11.0', start: '2026-01-01', end: '2026-01-20' }],
    rewardIds: i === 0 ? ['1000', '9999'] : i === 1 ? ['1001'] : ['1002']
  }))
  if (published) setAsset(fixture, 'banners', banners)
  else {
    const source =
      'export const BANNER_DATA = {\n' +
      banners
        .map(
          (banner) =>
            '  ' +
            banner.bannerId +
            ': {\n' +
            '    bannerId: ' +
            banner.bannerId +
            ',\n' +
            '    bannerType: ' +
            banner.bannerType +
            ',\n' +
            "    outfit4StarId: ['2000'],\n" +
            "    outfit5StarId: ['2001'],\n" +
            "    runs: [ { version: '2.11.0', start: '2026-01-01', end: '2026-01-20' } ],\n" +
            '    rewardIds: ' +
            JSON.stringify(banner.rewardIds) +
            ',\n' +
            '  },'
        )
        .join('\n') +
      '\n}'
    fixture.responses.set(baseUrl + '/data/banners.ts', source)
  }
  fixture.responses.set(
    baseUrl + '/data/source.json',
    JSON.stringify([
      { key: 'limited', labelKey: 'import.banner_groups.limited_banners', ids: [21001] },
      {
        key: 'merchant',
        labelKey: 'compendium.source.merchant',
        ids: [21002],
        outfit: false
      },
      { key: 'quest', labelKey: 'compendium.source.quest', ids: [10018] }
    ])
  )
  for (const language of ['zh', 'en']) {
    for (const name of ['item', 'outfit', 'banner', 'makeup']) {
      const count = name === 'banner' ? 70 : 100
      const first = name === 'item' ? 1000 : name === 'outfit' ? 2000 : 1
      const locale = Object.fromEntries(
        Array.from({ length: count }, (_, i) => [
          name + '.' + (first + i) + '.name',
          name === 'banner' ? '卡池' + (i + 1) : language + '-' + (first + i)
        ])
      )
      fixture.responses.set(
        baseUrl + '/app/locales/' + language + '/' + name + '.json',
        JSON.stringify(locale)
      )
    }
    const zh = language === 'zh'
    fixture.responses.set(
      baseUrl + '/app/locales/' + language + '/misc.json',
      JSON.stringify({
        'label.1.name': zh ? '保暖' : 'Warm',
        'label.116.name': zh ? '绮想' : 'Whimsical',
        'version.2.9': zh ? '夏末歌声' : 'Late Summer',
        'version.2.10': zh ? '金羽的裁决' : 'Verdict of Gold',
        'version.2.x': zh ? '伊赞之土' : 'Itzaland'
      })
    )
    fixture.responses.set(
      baseUrl + '/app/locales/' + language + '/common.json',
      JSON.stringify({
        import: { banner_groups: { limited_banners: zh ? '限定卡池' : 'Limited banners' } },
        compendium: {
          source: {
            merchant: zh ? '服装商店' : 'Clothing stores',
            quest: zh ? '任务' : 'Quests'
          }
        },
        global: {
          charts: {
            five_star_banners: zh ? '5★卡池' : '5★ banners',
            four_star_banners: zh ? '4★卡池' : '4★ banners'
          }
        },
        tracker: { banner: { settings: { show_4star: zh ? '陪跑套装' : 'Accompanying outfits' } } },
        banner: { deep_echoes: zh ? '深海回响' : 'Deep Echoes' }
      })
    )
  }
  return fixture
}
function mockRemote(fixture: Fixture) {
  const mock = vi.fn(async (input: RequestInfo | URL) => {
    const text = fixture.responses.get(String(input))
    return new Response(text ?? 'not found', { status: text === undefined ? 404 : 200 })
  })
  vi.stubGlobal('fetch', mock)
  return mock
}
async function initialize(published = false) {
  const outputDir = await temporaryDir()
  const fixture = fixtures(published)
  mockRemote(fixture)
  await updateGongeoCatalog({ baseUrl, outputDir })
  return { fixture, outputDir }
}

afterEach(async () => {
  vi.unstubAllGlobals()
  await Promise.all(directories.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe('Gongeo catalog updater', () => {
  it('rejects missing makeup IDs, mismatched languages and failed downloads before writing', async () => {
    const { fixture, outputDir } = await initialize()
    const before = await snapshot(outputDir)
    const zhUrl = baseUrl + '/app/locales/zh/makeup.json'
    const enUrl = baseUrl + '/app/locales/en/makeup.json'
    const zh = fixture.responses.get(zhUrl)!
    const en = fixture.responses.get(enUrl)!
    fixture.responses.delete(enUrl)
    await expect(updateGongeoCatalog({ baseUrl, outputDir })).rejects.toThrow()
    expect(await snapshot(outputDir)).toEqual(before)
    fixture.responses.set(enUrl, en)
    const reduced = JSON.parse(zh)
    delete reduced['makeup.1.name']
    fixture.responses.set(zhUrl, JSON.stringify(reduced))
    await expect(updateGongeoCatalog({ baseUrl, outputDir })).rejects.toThrow('中英文 ID 不一致')
    expect(await snapshot(outputDir)).toEqual(before)
    const reducedEn = JSON.parse(en)
    delete reducedEn['makeup.1.name']
    fixture.responses.set(enUrl, JSON.stringify(reducedEn))
    await expect(updateGongeoCatalog({ baseUrl, outputDir })).rejects.toThrow('丢失既有整妆名称')
    expect(await snapshot(outputDir)).toEqual(before)
  })
  it.each([false, true])(
    'downloads a complete remote snapshot and skips identical content (published banners: %s)',
    async (published) => {
      const outputDir = await temporaryDir()
      const fixture = fixtures(published)
      const fetchMock = mockRemote(fixture)
      const result = await updateGongeoCatalog({ baseUrl, outputDir })
      expect(result).toEqual({
        updated: 16,
        total: 16,
        version: '2.10.1',
        generatedAt,
        source: baseUrl
      })
      expect(JSON.parse(await readFile(join(outputDir, 'banners.json'), 'utf8'))[0]).toMatchObject({
        name: '卡池1',
        runs: [{ version: '2.11.0', start: '2026-01-01', end: '2026-01-20' }],
        rewardIds: ['1000', '9999']
      })
      expect(
        JSON.parse(await readFile(join(outputDir, 'filterMetadata.json'), 'utf8'))
      ).toMatchObject({
        sources: expect.arrayContaining([
          {
            key: 'limited',
            label: { zh: '限定卡池', en: 'Limited banners' },
            ids: [21001],
            outfit: true
          },
          expect.objectContaining({ key: 'merchant', outfit: false })
        ]),
        tags: expect.arrayContaining([
          { id: 1, label: { zh: '保暖', en: 'Warm' } },
          { id: 116, label: { zh: '绮想', en: 'Whimsical' } }
        ]),
        versions: expect.arrayContaining([
          { value: '2.10', label: { zh: '金羽的裁决', en: 'Verdict of Gold' } },
          { value: '2.x', label: { zh: '伊赞之土', en: 'Itzaland' } }
        ]),
        deepEchoRewardIds: ['1000']
      })
      expect(JSON.parse(await readFile(join(outputDir, 'catalogSource.json'), 'utf8'))).toEqual({
        source: baseUrl,
        gameVersion: '2.10.1',
        generatedAt
      })
      const before = await snapshot(outputDir)
      expect((await updateGongeoCatalog({ baseUrl, outputDir })).updated).toBe(0)
      expect(await snapshot(outputDir)).toEqual(before)
      const urls = fetchMock.mock.calls.map(([url]) => String(url))
      expect(urls).toContain(baseUrl + '/public' + fixture.index.files.items.path)
      expect(urls).not.toContain(baseUrl + fixture.index.files.items.path)
      expect(urls.includes(baseUrl + '/data/banners.ts')).toBe(!published)
      expect(urls).toContain(baseUrl + '/data/source.json')
      expect(urls).toContain(baseUrl + '/app/locales/en/common.json')
      expect(urls).toContain(baseUrl + '/app/locales/zh/misc.json')
      expect(formatGongeoResult(result)).toContain('远程同步成功')
      expect(formatGongeoResult({ ...result, updated: 0 })).toContain('无需更新')
      expect(formatGongeoResult(result)).toContain(baseUrl)
    }
  )

  it('does not rewrite an unchanged Windows CRLF snapshot', async () => {
    const { outputDir } = await initialize()
    const files = await snapshot(outputDir)
    for (const [file, text] of Object.entries(files)) {
      await writeFile(join(outputDir, file), text.replace(/\n/g, '\r\n'))
    }
    const before = await snapshot(outputDir)
    expect((await updateGongeoCatalog({ baseUrl, outputDir })).updated).toBe(0)
    expect(await snapshot(outputDir)).toEqual(before)
  })

  it('accepts palette regrouping when every item ID is preserved', async () => {
    const { fixture, outputDir } = await initialize()
    setAsset(fixture, 'palettes', {
      items: Array.from({ length: 50 }, (_, i) => [[1000 + i * 2, 1001 + i * 2], [1], [2]]),
      palettes: { '1': [1, 2, 3] }
    })
    expect((await updateGongeoCatalog({ baseUrl, outputDir })).updated).toBe(1)
  })

  it.each([
    ['2.10.1', '2.9.2', 1],
    ['2.9.2', '2.10.1', -1],
    ['2.10', '2.10.0', 0]
  ])('compares version %s with %s numerically', (left, right, result) => {
    expect(compareGameVersions(left, right)).toBe(result)
  })

  it('does not read an available local repository after a failed index request', async () => {
    const { fixture, outputDir } = await initialize()
    const localSource = await temporaryDir()
    for (const [url, text] of fixture.responses) {
      const file = join(localSource, url.slice(baseUrl.length + 1))
      await mkdir(dirname(file), { recursive: true })
      await writeFile(file, text)
    }
    const before = await snapshot(outputDir)
    const failedFetch = vi.fn(async () => {
      throw Object.assign(new Error('fetch failed'), {
        cause: { code: 'ENOENT', message: 'getaddrinfo ENOENT raw.example.test' }
      })
    })
    vi.stubGlobal('fetch', failedFetch)
    await expect(
      updateGongeoCatalog({ baseUrl, outputDir, catalogSourceDir: localSource })
    ).rejects.toThrow('ENOENT')
    expect(failedFetch).toHaveBeenCalledTimes(1)
    expect(await snapshot(outputDir)).toEqual(before)
  })

  it('a failed catalog translation download preserves every file and metadata', async () => {
    const { fixture, outputDir } = await initialize()
    const before = await snapshot(outputDir)
    fixture.responses.delete(baseUrl + '/app/locales/en/banner.json')
    await expect(updateGongeoCatalog({ baseUrl, outputDir })).rejects.toThrow('HTTP 404')
    expect(await snapshot(outputDir)).toEqual(before)
  })

  it('a failed filter metadata download preserves the existing catalog and metadata', async () => {
    const { fixture, outputDir } = await initialize()
    const before = await snapshot(outputDir)
    fixture.responses.delete(baseUrl + '/app/locales/en/common.json')
    await expect(updateGongeoCatalog({ baseUrl, outputDir })).rejects.toThrow('HTTP 404')
    expect(await snapshot(outputDir)).toEqual(before)
  })

  it('rejects malformed source IDs before writing any catalog files', async () => {
    const { fixture, outputDir } = await initialize()
    const before = await snapshot(outputDir)
    fixture.responses.set(
      baseUrl + '/data/source.json',
      JSON.stringify([
        { key: 'limited', labelKey: 'import.banner_groups.limited_banners', ids: [-1] }
      ])
    )
    await expect(updateGongeoCatalog({ baseUrl, outputDir })).rejects.toMatchObject({
      code: 'GONGEO_INVALID'
    })
    expect(await snapshot(outputDir)).toEqual(before)
  })

  it('a failed remote banner source does not use readable local banner files', async () => {
    const { fixture, outputDir } = await initialize()
    const localSource = await temporaryDir()
    const bannerSourcePath = join(localSource, 'banners.ts')
    await writeFile(bannerSourcePath, fixture.responses.get(baseUrl + '/data/banners.ts')!)
    fixture.responses.delete(baseUrl + '/data/banners.ts')
    const before = await snapshot(outputDir)
    await expect(updateGongeoCatalog({ baseUrl, outputDir, bannerSourcePath })).rejects.toThrow(
      'HTTP 404'
    )
    expect(await snapshot(outputDir)).toEqual(before)
  })

  it('rejects 2.9.2 before downloading assets when the existing snapshot is 2.10.1', async () => {
    const { fixture, outputDir } = await initialize()
    const before = await snapshot(outputDir)
    fixture.index.gameVersion = '2.9.2'
    fixture.responses.set(indexUrl, JSON.stringify(fixture.index))
    const fetchMock = mockRemote(fixture)
    await expect(updateGongeoCatalog({ baseUrl, outputDir })).rejects.toMatchObject({
      code: 'GONGEO_OLD_VERSION'
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(await snapshot(outputDir)).toEqual(before)
  })

  it('uses the documented legacy snapshot version if source metadata is absent', async () => {
    const { fixture, outputDir } = await initialize()
    await rm(join(outputDir, 'catalogSource.json'))
    await writeFile(join(outputDir, 'README.md'), 'Catalog snapshot, game version 2.10.1.')
    const before = await snapshot(outputDir)
    fixture.index.gameVersion = '2.9.2'
    fixture.responses.set(indexUrl, JSON.stringify(fixture.index))
    await expect(updateGongeoCatalog({ baseUrl, outputDir })).rejects.toMatchObject({
      code: 'GONGEO_OLD_VERSION'
    })
    expect(await snapshot(outputDir)).toEqual(before)
  })

  it('rejects an older generation timestamp within the same game version', async () => {
    const { fixture, outputDir } = await initialize()
    const before = await snapshot(outputDir)
    fixture.index.generatedAt = '2026-09-14T02:54:46.716Z'
    fixture.responses.set(indexUrl, JSON.stringify(fixture.index))
    await expect(updateGongeoCatalog({ baseUrl, outputDir })).rejects.toMatchObject({
      code: 'GONGEO_OLD_VERSION'
    })
    expect(await snapshot(outputDir)).toEqual(before)
  })

  it('allows a valid newer version and also allows same-version translation corrections', async () => {
    const { fixture, outputDir } = await initialize()
    fixture.index.gameVersion = '2.11.0'
    fixture.index.generatedAt = '2026-10-11T01:00:00.000Z'
    fixture.responses.set(indexUrl, JSON.stringify(fixture.index))
    const url = baseUrl + '/app/locales/zh/item.json'
    const names = JSON.parse(fixture.responses.get(url)!)
    names['item.1000.name'] = '修正名称'
    fixture.responses.set(url, JSON.stringify(names))
    expect((await updateGongeoCatalog({ baseUrl, outputDir })).updated).toBe(1)
    names['item.1000.name'] = '再次修正名称'
    fixture.responses.set(url, JSON.stringify(names))
    expect((await updateGongeoCatalog({ baseUrl, outputDir })).updated).toBe(1)
    expect(
      JSON.parse(await readFile(join(outputDir, 'catalogSource.json'), 'utf8')).gameVersion
    ).toBe('2.11.0')
  })

  it.each(['hash', 'bytes'])(
    'rejects an asset with incorrect %s without writing files',
    async (field) => {
      const { fixture, outputDir } = await initialize()
      const before = await snapshot(outputDir)
      const url = baseUrl + '/public' + fixture.index.files.items.path
      if (field === 'hash')
        fixture.responses.set(url, fixture.responses.get(url)!.replace('1000', '9000'))
      else fixture.responses.set(url, fixture.responses.get(url)! + ' ')
      await expect(updateGongeoCatalog({ baseUrl, outputDir })).rejects.toThrow('文件校验失败')
      expect(await snapshot(outputDir)).toEqual(before)
    }
  )

  it.each([
    'missing-asset',
    'empty-palette',
    'bad-row',
    'empty-locale',
    'duplicate-id',
    'path-traversal',
    'invalid-version'
  ])('rejects incomplete or malformed input: %s', async (mode) => {
    const { fixture, outputDir } = await initialize()
    const before = await snapshot(outputDir)
    if (mode === 'missing-asset') {
      delete fixture.index.files.outfits
      fixture.responses.set(indexUrl, JSON.stringify(fixture.index))
    } else if (mode === 'empty-palette') setAsset(fixture, 'palettes', { items: [], palettes: {} })
    else if (mode === 'bad-row') setAsset(fixture, 'items', [{ id: 1000 }])
    else if (mode === 'empty-locale')
      fixture.responses.set(baseUrl + '/app/locales/en/item.json', '{}')
    else if (mode === 'duplicate-id') {
      const data = JSON.parse(
        fixture.responses.get(baseUrl + '/public' + fixture.index.files.items.path)!
      )
      data[1][0] = data[0][0]
      setAsset(fixture, 'items', data)
    } else if (mode === 'path-traversal') {
      fixture.index.files.items.path = '/catalog/../../private.json'
      fixture.responses.set(indexUrl, JSON.stringify(fixture.index))
    } else {
      fixture.index.gameVersion = 'unknown'
      fixture.responses.set(indexUrl, JSON.stringify(fixture.index))
    }
    await expect(updateGongeoCatalog({ baseUrl, outputDir })).rejects.toMatchObject({
      code: 'GONGEO_INVALID'
    })
    expect(await snapshot(outputDir)).toEqual(before)
  })

  it.each([false, true])(
    'rejects significant removal of existing IDs even if row count is preserved: %s',
    async (sameCount) => {
      const { fixture, outputDir } = await initialize()
      const before = await snapshot(outputDir)
      const old = JSON.parse(
        fixture.responses.get(baseUrl + '/public' + fixture.index.files.items.path)!
      )
      const next = old.slice(5)
      if (sameCount)
        next.push(...Array.from({ length: 5 }, (_, i) => [[9000 + i], 5, 0, 4, [1], 1, 9000 + i]))
      setAsset(fixture, 'items', next)
      await expect(updateGongeoCatalog({ baseUrl, outputDir })).rejects.toMatchObject({
        code: 'GONGEO_INCOMPLETE'
      })
      expect(await snapshot(outputDir)).toEqual(before)
    }
  )

  it('does not write when the remote index changes during downloads', async () => {
    const { fixture, outputDir } = await initialize()
    const before = await snapshot(outputDir)
    let indexCalls = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        let text = fixture.responses.get(url)!
        if (url === indexUrl && ++indexCalls > 1)
          text = JSON.stringify({ ...fixture.index, gameVersion: '2.11.0' })
        return new Response(text)
      })
    )
    await expect(updateGongeoCatalog({ baseUrl, outputDir })).rejects.toMatchObject({
      code: 'GONGEO_INCOMPLETE'
    })
    expect(await snapshot(outputDir)).toEqual(before)
  })
})

it('parses dynamic permanent end dates without truncating the runs array', () => {
  const source =
    "export const BANNER_DATA = {\n  1: { bannerId: 1, bannerType: 1, outfit4StarId: ['10084'], outfit5StarId: ['10093'], runs: [{ version: '1.0.0', start: '2024-12-05', end: new Date().toISOString().split('T')[0] ?? '', }],\n  },\n}"
  expect(parseGongeoBanners(source, {}, '2026-10-18')[0].runs).toEqual([
    { version: '1.0.0', start: '2024-12-05', end: '2026-10-18' }
  ])
})
