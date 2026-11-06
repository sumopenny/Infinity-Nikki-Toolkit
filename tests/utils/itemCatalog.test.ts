import { afterEach, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.restoreAllMocks()
  vi.resetModules()
})

it('shares original locale requests and preserves all item and makeup names', async () => {
  const { loadCatalogNames } = await import('../../src/utils/gongeo/catalogResources')
  const { loadItemCatalog } = await import('../../src/utils/outfit/itemCatalog')
  expect(loadCatalogNames('item', 'zh')).toBe(loadCatalogNames('item', 'zh'))
  expect(loadCatalogNames('makeup', 'en')).toBe(loadCatalogNames('makeup', 'en'))
  const pending = loadItemCatalog()
  expect(loadItemCatalog()).toBe(pending)
  const catalog = await pending
  for (const kind of ['item', 'makeup'] as const) {
    const zh = await loadCatalogNames(kind, 'zh')
    const en = await loadCatalogNames(kind, 'en')
    for (const [key, name] of Object.entries(zh)) {
      const id = Number(key.split('.')[1])
      expect(catalog.get(id)).toEqual({ id, zh: name, en: en[key], makeup: kind === 'makeup' })
    }
  }
  expect([...catalog.values()].filter((entry) => entry.makeup)).toHaveLength(100)
  expect([...catalog.values()].filter((entry) => !entry.makeup)).toHaveLength(9008)
})

it('retries failures and preserves single-language fallback and makeup classification', async () => {
  const resources = await import('../../src/utils/gongeo/catalogResources')
  const loader = vi.spyOn(resources, 'loadCatalogNames').mockRejectedValue(new Error('offline'))
  const { loadItemCatalog } = await import('../../src/utils/outfit/itemCatalog')
  await expect(loadItemCatalog()).rejects.toThrow('offline')
  loader.mockImplementation(async (kind, language): Promise<Record<string, string>> => {
    if (kind === 'makeup') return language === 'en' ? { 'makeup.2.name': 'Makeup' } : {}
    return language === 'zh' ? { 'item.1.name': ' 中文 ', 'item.bad.name': 'invalid' } : {}
  })
  expect([...(await loadItemCatalog())].map(([, entry]) => entry)).toEqual([
    { id: 1, zh: '中文', en: '中文', makeup: false },
    { id: 2, zh: 'Makeup', en: 'Makeup', makeup: true }
  ])
})
