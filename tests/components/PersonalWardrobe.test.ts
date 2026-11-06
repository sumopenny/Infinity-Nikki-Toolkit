import 'fake-indexeddb/auto'
import { mount, flushPromises, DOMWrapper, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import PersonalWardrobe from '../../src/components/PersonalWardrobe.vue'
vi.mock('../../src/components/ArchiveCloudActions.vue', () => ({
  default: { template: '<span />' }
}))
import { clearAllBrowserData, runStoreRequest } from '../../src/utils/file-system/database'
import { messages } from '../../src/i18n'
import { loadWardrobe } from '../../src/utils/wardrobe/wardrobeStorage'
import * as storage from '../../src/utils/wardrobe/wardrobeStorage'
import * as pearpal from '../../src/utils/resonance/resonanceImport'
import * as catalogModule from '../../src/utils/wardrobe/wardrobeCatalog'
import { clearCatalogApiCache } from '../../src/utils/gongeo/catalogApi'

const choose = async (key: string, label: string | RegExp) => {
  buttonFilter(key).click()
  await flushPromises()
  const option = [...document.querySelectorAll('[role="menuitemradio"]')].find((node) => {
    const value = node.textContent?.trim() ?? ''
    return typeof label === 'string' ? value === label : label.test(value)
  })!
  await new DOMWrapper(option).trigger('click')
  return option.textContent?.trim() ?? ''
}
const buttonFilter = (key: string) =>
  document.querySelector<HTMLButtonElement>('#wardrobe-filter-' + key)!
const openSuit = async (id = '1029402') => {
  await wrapper.setProps({ searchQuery: id })
  await wrapper.get('.wardrobe-card-open').trigger('click')
  return new DOMWrapper(document.querySelector<HTMLElement>('.wardrobe-dialog')!)
}
const reload = async () => {
  await (wrapper.vm as unknown as { reload: () => Promise<boolean> }).reload()
  await flushPromises()
}

let wrapper: VueWrapper
const button = (label: string) =>
  [...document.querySelectorAll<HTMLButtonElement>('button')].find(
    (node) => node.textContent?.trim() === label
  )!
beforeEach(async () => {
  localStorage.removeItem('nikki-wardrobe-ownership-notice-v1')
  localStorage.removeItem('nikki-wardrobe-show-evolutions')
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {}
  }))
  await clearAllBrowserData()
  // 当前衣橱默认只看已拥有；无数据时是初始界面，不能沿用旧测试的空库全图鉴假设。
  const catalog = await catalogModule.loadWardrobeCatalog()
  await storage.updateWardrobe(() => ({
    ...storage.emptyWardrobe(),
    entries: Object.fromEntries(
      ['10347', '1034701', '1029402']
        .flatMap((id) => catalog.byId.get(id)!.parts)
        .map((id) => [id, { owned: true, source: 'pearpal' as const }])
    )
  }))
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify({ description: '' })))
  )
  if (!document.getElementById('wardrobe-mobile-category-target')) {
    const target = document.createElement('div')
    target.id = 'wardrobe-mobile-category-target'
    document.body.append(target)
  }
  wrapper = mount(PersonalWardrobe, { attachTo: document.body })
  await vi.waitFor(() => expect(wrapper.find('.wardrobe-grid').exists()).toBe(true))
})
afterEach(() => {
  localStorage.removeItem('nikki-wardrobe-ownership-notice-v1')
  localStorage.removeItem('nikki-wardrobe-show-evolutions')
  wrapper.unmount()
  clearCatalogApiCache()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

describe('personal wardrobe interactions', () => {
  it('keeps the English name and expansion controls separate and opens details from the name', async () => {
    await wrapper.setProps({ searchQuery: '10347', language: 'en' })
    await wrapper.get('input[role="switch"]').setValue(false)
    const heading = wrapper.get('.wardrobe-card-heading')
    expect(heading.get('.wardrobe-form-toggle').attributes('aria-label')).toBe('Expand forms')
    expect(heading.get('.wardrobe-form-toggle').text()).toBe('Expand')
    await heading.get('.wardrobe-form-toggle').trigger('click')
    expect(heading.get('.wardrobe-form-toggle').attributes('aria-label')).toBe('Collapse forms')
    expect(document.querySelector('.wardrobe-dialog')).toBeNull()
    await heading.get('.wardrobe-card-name').trigger('click')
    await flushPromises()
    const catalog = await catalogModule.loadWardrobeCatalog()
    expect(document.querySelector('#wardrobe-dialog-title')!.textContent).toBe(
      catalog.byId.get('10347')!.name.en
    )
  })

  it('centers the form popover on its card and only shifts it at viewport edges', async () => {
    await wrapper.setProps({ searchQuery: '10347' })
    await wrapper.get('input[role="switch"]').setValue(false)
    const box = {
      left: 500,
      top: 200,
      bottom: 450,
      right: 680,
      width: 180,
      height: 250,
      x: 500,
      y: 200,
      toJSON() {}
    }
    vi.spyOn(wrapper.get('.wardrobe-card').element, 'getBoundingClientRect').mockImplementation(
      () => box
    )
    const trigger = wrapper.get('.wardrobe-form-toggle')
    for (const [left, expected] of [
      [500, 400],
      [0, 12],
      [window.innerWidth - 50, window.innerWidth - 380 - 12]
    ]) {
      box.left = left!
      await trigger.trigger('click')
      await flushPromises()
      const popup = document.querySelector<HTMLElement>('.wardrobe-form-popover')!
      expect(popup.style.left).toBe(`${expected}px`)
      await trigger.trigger('click')
    }
  })

  it('merges matching forms without changing totals and keeps dialog/card selection in sync', async () => {
    await wrapper.setProps({ searchQuery: '10347' })
    const originalCount = wrapper.findAll('.wardrobe-card').length
    expect(originalCount).toBeGreaterThan(1)
    const summary = wrapper.get('.wardrobe-summary').text()
    await wrapper.get('input[role="switch"]').setValue(false)
    expect(wrapper.findAll('.wardrobe-card')).toHaveLength(1)
    expect(wrapper.get('.wardrobe-summary').text()).toBe(summary)
    expect(!!document.querySelector('.wardrobe-form-popover')).toBe(false)
    await wrapper.get('.wardrobe-form-toggle').trigger('click')
    const thumbs = new DOMWrapper(
      document.querySelector<HTMLElement>('.wardrobe-form-popover')!
    ).findAll('button')
    expect(thumbs).toHaveLength(5)
    expect(thumbs.map((thumb) => thumb.get('strong').text())).toEqual([
      '原套',
      '焕新',
      '一进',
      '二进',
      '满进'
    ])
    expect(thumbs[0]!.find('.lucide-circle-check').exists()).toBe(true)
    expect(thumbs[3]!.find('.wardrobe-form-owned').exists()).toBe(false)
    expect(thumbs[4]!.find('.wardrobe-form-owned').exists()).toBe(false)
    expect(thumbs[4]!.find('small').exists()).toBe(false)
    await thumbs[1]!.trigger('click')
    await flushPromises()
    const dialog = new DOMWrapper(document.querySelector<HTMLElement>('.wardrobe-dialog')!)
    expect(dialog.get('.wardrobe-form-nav button[aria-pressed="true"]').text()).toContain('焕新')
    const navigation = dialog.findAll('.wardrobe-form-nav button')
    expect(navigation.map((button) => button.get('strong').text())).toEqual([
      '原套',
      '焕新',
      '一进',
      '二进',
      '满进'
    ])
    const catalog = await catalogModule.loadWardrobeCatalog()
    for (const [index, id] of [
      [3, '1034703'],
      [4, '1034704']
    ] as const) {
      await navigation[index]!.trigger('click')
      expect(dialog.get('#wardrobe-dialog-title').text()).toBe(catalog.byId.get(id)!.name.zh)
      expect(
        dialog.get('.wardrobe-form-nav button[aria-pressed="true"]').get('strong').text()
      ).toBe(index === 3 ? '二进' : '满进')
    }
    await dialog.findAll('.wardrobe-form-nav button')[0]!.trigger('click')
    expect(dialog.get('.wardrobe-form-nav button[aria-pressed="true"]').text()).toContain('原套')
    expect(wrapper.get('.wardrobe-variant').text()).toBe('原套')
    await dialog.get('button[aria-label="关闭"]').trigger('click')
    await choose('variant', '焕新')
    expect(wrapper.findAll('.wardrobe-card')).toHaveLength(1)
    expect(wrapper.get('.wardrobe-variant').text()).toBe('焕新')
    expect(wrapper.find('.wardrobe-form-toggle').exists()).toBe(true)
    expect(wrapper.get('.wardrobe-form-toggle').attributes('aria-expanded')).toBe('false')
    await wrapper.get('.wardrobe-form-toggle').trigger('click')
    expect(wrapper.get('.wardrobe-form-toggle').attributes('aria-expanded')).toBe('true')
    await choose('variant', '全部')
    expect(wrapper.get('.wardrobe-form-toggle').attributes('aria-expanded')).toBe('false')
    await wrapper.get('.wardrobe-card-open').trigger('click')
    expect(document.querySelectorAll('.wardrobe-form-nav button').length).toBeGreaterThan(1)
    await wrapper.get('input[role="switch"]').setValue(true)
    expect(localStorage.getItem('nikki-wardrobe-show-evolutions')).toBe('true')
  })

  it('shares mobile evolution preferences and opens the selected form directly in details', async () => {
    wrapper.unmount()
    vi.stubGlobal('matchMedia', () => ({
      matches: true,
      addEventListener() {},
      removeEventListener() {}
    }))
    wrapper = mount(PersonalWardrobe, { attachTo: document.body, props: { searchQuery: '10347' } })
    await vi.waitFor(() => expect(wrapper.find('.wardrobe-grid').exists()).toBe(true))
    const expandedCount = wrapper.findAll('.wardrobe-card').length
    expect(expandedCount).toBeGreaterThan(1)
    await wrapper.get('input[role="switch"]').setValue(false)
    expect(localStorage.getItem('nikki-wardrobe-show-evolutions')).toBe('false')
    expect(wrapper.findAll('.wardrobe-card')).toHaveLength(1)
    expect(wrapper.find('.wardrobe-form-toggle').exists()).toBe(false)
    await wrapper.get('.wardrobe-mobile-form-toggle').trigger('click')
    await flushPromises()
    const popup = new DOMWrapper(document.querySelector<HTMLElement>('.wardrobe-form-popover')!)
    expect(popup.findAll('button')).toHaveLength(5)
    expect(popup.find('.form-label small').exists()).toBe(false)
    expect(popup.findAll('.wardrobe-form-owned')).toHaveLength(2)
    expect(popup.findAll('button')[3]!.find('.wardrobe-form-owned').exists()).toBe(false)
    await popup.findAll('button')[3]!.trigger('click')
    await flushPromises()
    expect(document.querySelector('.wardrobe-form-popover')).toBeNull()
    const dialog = new DOMWrapper(document.querySelector<HTMLElement>('.wardrobe-dialog')!)
    expect(dialog.get('.wardrobe-form-nav').classes()).toContain('is-horizontal')
    expect(dialog.get('.wardrobe-form-nav button[aria-pressed="true"]').text()).toContain('二进')
    expect(dialog.get('.wardrobe-detail-variant').text()).toBe('二进')
    await dialog.findAll('.wardrobe-form-nav button')[4]!.trigger('click')
    await flushPromises()
    expect(dialog.get('.wardrobe-detail-variant').text()).toBe('满进')
    await dialog.get('button[aria-label="关闭"]').trigger('click')
    await wrapper.get('input[role="switch"]').setValue(true)
    expect(wrapper.findAll('.wardrobe-card')).toHaveLength(expandedCount)
    expect(wrapper.find('.wardrobe-mobile-form-toggle').exists()).toBe(false)
    expect(localStorage.getItem('nikki-wardrobe-show-evolutions')).toBe('true')
  })

  it('positions mobile forms above low cards and closes on outside input, Escape and scrolling', async () => {
    wrapper.unmount()
    vi.stubGlobal('matchMedia', () => ({
      matches: true,
      addEventListener() {},
      removeEventListener() {}
    }))
    localStorage.setItem('nikki-wardrobe-show-evolutions', 'false')
    wrapper = mount(PersonalWardrobe, { attachTo: document.body, props: { searchQuery: '10347' } })
    await vi.waitFor(() => expect(wrapper.find('.wardrobe-grid').exists()).toBe(true))
    const rect = {
      top: window.innerHeight - 200,
      bottom: window.innerHeight - 10,
      left: 10,
      right: 110,
      width: 100,
      height: 190,
      x: 10,
      y: window.innerHeight - 200,
      toJSON() {}
    }
    vi.spyOn(wrapper.get('.wardrobe-card').element, 'getBoundingClientRect').mockReturnValue(rect)
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(160)
    const trigger = wrapper.get('.wardrobe-mobile-form-toggle')
    await trigger.trigger('click')
    await flushPromises()
    let popup = document.querySelector<HTMLElement>('.wardrobe-form-popover')!
    expect(popup.style.top).toBe('auto')
    expect(popup.style.bottom).toBe('206px')
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await flushPromises()
    expect(document.querySelector('.wardrobe-form-popover')).toBeNull()
    expect(document.activeElement).toBe(trigger.element)
    await trigger.trigger('click')
    await flushPromises()
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    await flushPromises()
    expect(document.querySelector('.wardrobe-form-popover')).toBeNull()
    // 两侧都能容纳时，即使下方更宽裕，也优先向上。
    rect.top = 200
    rect.bottom = 390
    await trigger.trigger('click')
    await flushPromises()
    popup = document.querySelector<HTMLElement>('.wardrobe-form-popover')!
    expect(popup.style.top).toBe('auto')
    expect(popup.style.bottom).toBe(`${window.innerHeight - 200 + 6}px`)
    await trigger.trigger('click')
    rect.top = 10
    rect.bottom = 200
    await trigger.trigger('click')
    await flushPromises()
    popup = document.querySelector<HTMLElement>('.wardrobe-form-popover')!
    expect(popup.style.top).toBe('206px')
    expect(popup.style.bottom).toBe('auto')
    window.dispatchEvent(new Event('scroll'))
    await flushPromises()
    expect(document.querySelector('.wardrobe-form-popover')).toBeNull()
  })

  it('reports a refresh failure to callers and reports success after recovery', async () => {
    const reloadView = () => (wrapper.vm as unknown as { reload: () => Promise<boolean> }).reload()
    vi.spyOn(storage, 'loadWardrobe').mockRejectedValueOnce(new Error('read failed'))
    expect(await reloadView()).toBe(false)
    expect(await reloadView()).toBe(true)
  })

  it('shows a retry action after a failed load and recovers', async () => {
    vi.spyOn(storage, 'loadWardrobe').mockRejectedValueOnce(new Error('read failed'))
    await reload()
    expect(wrapper.text()).toContain('衣橱加载失败或超时')
    await new DOMWrapper(button('重新加载')).trigger('click')
    await vi.waitFor(() => expect(wrapper.find('.wardrobe-grid').exists()).toBe(true))
  })

  it('times out a stalled load and ignores its late result after retry', async () => {
    const saved = await storage.loadWardrobe()
    let resolveStalled!: (value: storage.WardrobeSnapshot) => void
    vi.spyOn(storage, 'loadWardrobe')
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveStalled = resolve
        })
      )
      .mockResolvedValueOnce(saved)
    vi.useFakeTimers()
    try {
      const pending = (wrapper.vm as unknown as { reload: () => Promise<boolean> }).reload()
      await vi.advanceTimersByTimeAsync(15000)
      await pending
      expect(wrapper.text()).toContain('衣橱加载失败或超时')
      await reload()
      expect(wrapper.find('.wardrobe-grid').exists()).toBe(true)
      resolveStalled(storage.emptyWardrobe())
      await flushPromises()
      expect(wrapper.find('.wardrobe-grid').exists()).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })

  it('remembers dismissal and allows the ownership explanation to be reopened', async () => {
    expect(wrapper.get('.wardrobe-collection-notice').text()).toContain('不代表游戏内实际未拥有')
    await wrapper.get('.wardrobe-collection-notice-close').trigger('click')
    expect(wrapper.find('.wardrobe-collection-notice').exists()).toBe(false)
    wrapper.unmount()
    wrapper = mount(PersonalWardrobe, { attachTo: document.body })
    await vi.waitFor(() => expect(wrapper.find('.wardrobe-grid').exists()).toBe(true))
    expect(wrapper.find('.wardrobe-collection-notice').exists()).toBe(false)
    await new DOMWrapper(button('收集状态说明')).trigger('click')
    expect(wrapper.find('.wardrobe-collection-notice').exists()).toBe(true)
    expect(document.activeElement).toBe(wrapper.get('.wardrobe-collection-notice').element)
    await storage.updateWardrobe(() => storage.emptyWardrobe())
    await reload()
    expect(wrapper.find('.wardrobe-collection-notice').exists()).toBe(false)
  })

  it('reuses the approved mobile filter bar and opens the existing filters in a sheet', async () => {
    wrapper.unmount()
    vi.stubGlobal('matchMedia', () => ({
      matches: true,
      addEventListener() {},
      removeEventListener() {}
    }))
    if (!document.getElementById('wardrobe-mobile-category-target')) {
      const target = document.createElement('div')
      target.id = 'wardrobe-mobile-category-target'
      document.body.append(target)
    }
    wrapper = mount(PersonalWardrobe, { attachTo: document.body })
    await vi.waitFor(() => expect(wrapper.find('.wardrobe-mobile-filter-bar').exists()).toBe(true))
    await flushPromises()
    expect(
      document.querySelector('#wardrobe-mobile-category-target .wardrobe-mobile-category-switch')
    ).not.toBeNull()
    expect(
      document.querySelector('#wardrobe-filter-actions .collection-icon-actions')
    ).not.toBeNull()
    const trigger = wrapper.get('.wardrobe-mobile-filter-bar .collection-tag-select')
    expect(trigger.text()).toContain('已拥有')
    await trigger.trigger('click')
    await flushPromises()
    const modal = document.querySelector<HTMLElement>('.mobile-filter-overlay')
    expect(modal).not.toBeNull()
    expect(modal?.style.display).not.toBe('none')
    await choose('source', '限定卡池')
    expect(buttonFilter('source').textContent).toContain('限定卡池')
    expect(wrapper.get('.wardrobe-mobile-filter-bar .collection-tag-select').text()).toContain(
      '已筛选'
    )
    await wrapper.setProps({ searchQuery: '1020100347' })
    document
      .querySelector<HTMLButtonElement>(
        '#wardrobe-mobile-category-target .wardrobe-mobile-category-switch'
      )!
      .click()
    await flushPromises()
    expect(wrapper.get('.wardrobe-mobile-filter-bar .collection-tag-select').text()).toContain(
      '全部筛选'
    )

    await storage.updateWardrobe(() => storage.emptyWardrobe())
    await reload()
    expect(wrapper.find('.wardrobe-initial').exists()).toBe(true)
    expect(
      wrapper.get('.wardrobe-mobile-filter-bar .collection-tag-select').attributes('disabled')
    ).toBeDefined()
    const importButton = document.querySelector<HTMLButtonElement>(
      '#wardrobe-filter-actions .collection-icon-actions > .primary-button'
    )
    expect(importButton).not.toBeNull()
    expect(importButton?.disabled).toBe(false)
  }, 15000)

  it('keeps every filter per tab and resets only the current tab', async () => {
    await wrapper.setProps({ searchQuery: '花' })
    await choose('rarity', '5 ★')
    await choose('variant', '焕新')
    const outfitVersion = await choose('version', /^2\.10\b/)
    await choose('style', '典雅')
    await choose('source', '限定卡池')
    await choose('tag', '浪漫')
    await choose('sort', '名称')
    button('部件').click()
    await flushPromises()
    expect(buttonFilter('ownership').textContent).toContain('全部')
    for (const key of ['rarity', 'version', 'style', 'source', 'tag']) {
      expect(buttonFilter(key).textContent).toContain('全部')
    }
    await choose('category', '发型')
    await choose('ownership', '未拥有')
    const itemVersion = await choose('version', /^1\.11\b/)
    await choose('style', '甜美')
    await choose('source', '活动')
    await choose('tag', '幻想')
    button('套装').click()
    await flushPromises()
    expect(buttonFilter('rarity').textContent).toContain('5 ★')
    expect(buttonFilter('variant').textContent).toContain('焕新')
    expect(buttonFilter('version').textContent).toContain(outfitVersion)
    expect(buttonFilter('style').textContent).toContain('典雅')
    expect(buttonFilter('source').textContent).toContain('限定卡池')
    expect(buttonFilter('tag').textContent).toContain('浪漫')
    expect(buttonFilter('sort').textContent).toContain('名称')
    expect(wrapper.emitted('update-search')).toBeUndefined()
    button('重置筛选').click()
    await flushPromises()
    for (const key of ['ownership', 'rarity', 'variant', 'version', 'style', 'source', 'tag']) {
      expect(buttonFilter(key).textContent).toContain('全部')
    }
    expect(buttonFilter('sort').textContent).toContain('图鉴顺序')
    expect(wrapper.emitted('update-search')?.at(-1)).toEqual([''])
    button('部件').click()
    await flushPromises()
    expect(buttonFilter('category').textContent).toContain('发型')
    expect(buttonFilter('ownership').textContent).toContain('未拥有')
    expect(buttonFilter('version').textContent).toContain(itemVersion)
    expect(buttonFilter('style').textContent).toContain('甜美')
    expect(buttonFilter('source').textContent).toContain('活动')
    expect(buttonFilter('tag').textContent).toContain('幻想')
  })
  it.each(['outfit', 'item'] as const)(
    'combines evolution, version, style, source and tag filters for %s',
    async (kind) => {
      const original = await catalogModule.loadWardrobeCatalog()
      const outfit = original.byId.get('10347')!
      const base = kind === 'outfit' ? outfit : original.byId.get(outfit.parts[0])!
      const samples: (Partial<catalogModule.WardrobeEntry> & { id: string })[] = [
        { id: 'base', variant: 0 },
        { id: 'glow', variant: 1 },
        { id: 'evo-1', variant: 2, category: 4 },
        { id: 'evo-2', variant: 3, category: 7 },
        { id: 'evo-3', variant: 4, category: 16 },
        { id: 'other-version', version: '2.9', obtainType: 20901 },
        { id: 'older-major', version: '1.10', obtainType: 11001 },
        { id: 'other-style', style: 'cool' },
        { id: 'other-source', obtainType: 21006, sourceDetails: [] },
        { id: 'other-tag', labels: [8] },
        { id: 'other-banner', sourceDetails: [] },
        {
          id: 'missing-metadata',
          version: null,
          style: null,
          obtainType: null,
          labels: [],
          sourceDetails: []
        }
      ]
      const entries = samples.map((sample): catalogModule.WardrobeEntry => ({
        ...base,
        variant: 2,
        version: '2.10',
        style: 'sweet',
        obtainType: 21001,
        labels: [9],
        sourceDetails: [],
        ...sample,
        name: { zh: sample.id, en: sample.id }
      }))
      vi.spyOn(catalogModule, 'loadWardrobeCatalog').mockResolvedValue({
        entries,
        byId: new Map(entries.map((entry) => [entry.id, entry]))
      })
      await reload()
      if (kind === 'item') {
        button('部件').click()
        await flushPromises()
      }
      const cards = () => wrapper.findAll('.wardrobe-card h3').map((node) => node.text())
      expect(cards()).toHaveLength(samples.length)
      await choose('variant', '一进')
      expect(cards()).not.toContain('base')
      expect(cards()).not.toContain('glow')
      expect(cards()).toContain('evo-1')
      await choose('variant', '全部')
      await choose('version', /^2\.10\b/)
      expect(cards()).not.toContain('other-version')
      expect(cards()).not.toContain('older-major')
      expect(cards()).not.toContain('missing-metadata')
      await choose('version', /^2\.10\b/)
      expect(cards()).not.toContain('other-version')
      await choose('style', '甜美')
      expect(cards()).not.toContain('other-style')
      await choose('source', '限定卡池')
      expect(cards()).not.toContain('other-source')
      await choose('tag', '浪漫')
      expect(cards()).not.toContain('other-tag')
      expect(cards()).toContain('other-banner')
      expect(cards()).toEqual(['base', 'glow', 'evo-1', 'evo-2', 'evo-3', 'other-banner'])
      await choose('variant', '二进')
      expect(cards()).toEqual(['evo-2'])
      await choose('variant', '全部')
      if (kind === 'item') {
        await choose('category', '帽子')
        expect(cards()).toEqual(['evo-1'])
        await choose('category', '项圈')
        expect(cards()).toEqual(['evo-2'])
        await choose('category', '腕饰')
        expect(cards()).toEqual(['evo-3'])
      }
      await choose('tag', '幻想')
      expect(wrapper.find('.wardrobe-empty').exists()).toBe(true)
      button('重置筛选').click()
      await flushPromises()
      expect(cards()).toHaveLength(samples.length)
    }
  )
  it('shows outfit pieces and individual pieces together under 部件', async () => {
    const original = await catalogModule.loadWardrobeCatalog()
    const outfit = original.byId.get('10347')!
    const outfitPartIds = new Set(
      original.entries.filter((entry) => entry.kind === 'outfit').flatMap((entry) => entry.parts)
    )
    const outfitPiece = original.byId.get(outfit.parts[0])!
    const individualPiece = original.entries.find(
      (entry) => entry.kind === 'item' && !outfitPartIds.has(entry.id)
    )!
    expect(individualPiece).toBeDefined()
    const entries = [outfit, outfitPiece, individualPiece]
    vi.spyOn(catalogModule, 'loadWardrobeCatalog').mockResolvedValue({
      entries,
      byId: new Map(entries.map((entry) => [entry.id, entry]))
    })
    await reload()
    button('部件').click()
    await flushPromises()
    await choose('ownership', '全部')
    expect(wrapper.findAll('.wardrobe-card h3').map((node) => node.text())).toEqual([
      outfitPiece.name.zh,
      individualPiece.name.zh
    ])
    expect(wrapper.find('.wardrobe-grid.is-pieces').exists()).toBe(true)
  })
  it('uses the shared menu styling and applies a variant before closing the menu', async () => {
    expect(wrapper.find('select').exists()).toBe(false)
    await wrapper.get('#wardrobe-filter-variant').trigger('click')
    expect(new DOMWrapper(document.querySelector('[role="menu"]')!).classes()).toContain(
      'cleanup-account-menu'
    )
    const option = [...document.querySelectorAll('[role="menuitemradio"]')]
      .map((node) => new DOMWrapper(node))
      .find((node) => node.text() === '焕新')!
    await option.trigger('click')
    expect(!!document.querySelector('[role="menu"]')).toBe(false)
    expect(wrapper.get('#wardrobe-filter-variant').text()).toBe('焕新')
    expect(wrapper.findAll('.wardrobe-variant').every((node) => node.text() === '焕新')).toBe(true)
    await wrapper.get('#wardrobe-filter-variant').trigger('click')
    await wrapper.get('#wardrobe-filter-variant').trigger('keydown', { key: 'Escape' })
    expect(!!document.querySelector('[role="menu"]')).toBe(false)
  })
  it('uses the supplied top-bar query and places desktop filters in the sidebar', async () => {
    const host = document.createElement('aside')
    host.id = 'wardrobe-test-sidebar'
    document.body.append(host)
    await wrapper.setProps({
      sidebarTarget: '#wardrobe-test-sidebar',
      searchQuery: '如果爱上一朵花'
    })
    expect(host.querySelector('.sidebar-mode-switch')).not.toBeNull()
    expect(host.querySelector('.wardrobe-filters')).not.toBeNull()
    expect(wrapper.find('input[type="search"]').exists()).toBe(false)
    expect(wrapper.findAll('.wardrobe-card').length).toBeGreaterThan(0)
    expect(
      wrapper.findAll('.wardrobe-card h3').every((node) => node.text().includes('如果爱上一朵花'))
    ).toBe(true)
    await wrapper.setProps({ searchQuery: 'no-such-clothing-xyz' })
    expect(wrapper.find('.wardrobe-empty').exists()).toBe(true)
    await wrapper.find('.wardrobe-empty button').trigger('click')
    expect(wrapper.emitted('update-search')?.at(-1)).toEqual([''])
    await wrapper.setProps({ searchQuery: '' })
    expect(wrapper.find('.wardrobe-grid').exists()).toBe(true)
  })
  it('mounts mobile actions after the asynchronous wardrobe toolbar becomes available', async () => {
    wrapper.unmount()
    vi.stubGlobal('matchMedia', () => ({
      matches: true,
      addEventListener() {},
      removeEventListener() {}
    }))
    if (!document.getElementById('wardrobe-mobile-category-target')) {
      const target = document.createElement('div')
      target.id = 'wardrobe-mobile-category-target'
      document.body.append(target)
    }
    wrapper = mount(PersonalWardrobe, { attachTo: document.body })
    await vi.waitFor(() =>
      expect(
        document.querySelector('#wardrobe-filter-actions [aria-label="导入数据"]')
      ).not.toBeNull()
    )
    document
      .querySelector<HTMLButtonElement>('#wardrobe-filter-actions [aria-label="导入数据"]')!
      .click()
    await flushPromises()
    expect(document.querySelector('.resonance-import-dialog')).not.toBeNull()
  })
  it('uses the shared file picker but only previews after the preview action', async () => {
    const saved = await loadWardrobe()
    button('导入数据').click()
    await flushPromises()
    button(messages.zh.resonance.fromFile).click()
    await flushPromises()
    const file = {
      name: 'wardrobe.json',
      size: 100,
      text: vi.fn().mockResolvedValue(
        storage.createWardrobeBackup({
          ...storage.emptyWardrobe(),
          entries: { '1020100347': { owned: true, source: 'manual' } }
        })
      )
    }
    const input = document.querySelector<HTMLInputElement>('input[type="file"]')!
    Object.defineProperty(input, 'files', { value: [file], configurable: true })
    input.dispatchEvent(new Event('change', { bubbles: true }))
    await flushPromises()
    expect(file.text).toHaveBeenCalledOnce()
    expect(document.querySelector('.resonance-file-name')?.textContent).toContain('wardrobe.json')
    expect(document.querySelector('.resonance-preview')).toBeNull()
    button('获取预览').click()
    await vi.waitFor(() => expect(document.querySelector('.resonance-preview')).not.toBeNull())
    expect(await loadWardrobe()).toEqual(saved)
  })
  it('cancels clearing without loss and confirms clearing only wardrobe data', async () => {
    await runStoreRequest('resonance-records', 'readwrite', (store) =>
      store.put([{ id: 'resonance-sentinel' }], 'current-profile')
    )
    await storage.updateWardrobe(() => ({
      ...storage.emptyWardrobe(),
      entries: { '1020100347': { owned: true, source: 'pearpal' } }
    }))
    await (wrapper.vm as unknown as { reload: () => Promise<boolean> }).reload()
    await flushPromises()
    button('清空本地记录').click()
    await vi.waitFor(() => expect(document.querySelector('.confirm-dialog')).not.toBeNull())
    button(messages.zh.resonance.clearCancel).click()
    await flushPromises()
    expect(Object.keys((await loadWardrobe()).entries)).toHaveLength(1)
    button('清空本地记录').click()
    await vi.waitFor(() => expect(document.querySelector('.confirm-dialog')).not.toBeNull())
    document.querySelector<HTMLButtonElement>('.confirm-dialog-actions .primary')!.click()
    await vi.waitFor(() => expect(document.querySelector('.confirm-dialog')).toBeNull())
    expect(Object.keys((await loadWardrobe()).entries)).toHaveLength(0)
    expect(
      await runStoreRequest('resonance-records', 'readonly', (store) =>
        store.get('current-profile')
      )
    ).toEqual([{ id: 'resonance-sentinel' }])
  })
  it('opens item previews from outfit parts without changing ownership', async () => {
    const saved = await loadWardrobe()
    const write = vi.spyOn(storage, 'updateWardrobe')
    const dialog = await openSuit()
    expect(dialog.findAll('.wardrobe-part-open').length).toBeGreaterThan(0)
    expect(dialog.get('header button').attributes('aria-label')).toBe('关闭')
    await dialog.get('.wardrobe-part-open').trigger('click')
    await flushPromises()
    expect(document.querySelector('.outfit-detail-overlay')).not.toBeNull()
    expect(document.querySelector('.wardrobe-dialog')).not.toBeNull()
    document.querySelector<HTMLButtonElement>('.outfit-detail-panel header button')!.click()
    await flushPromises()
    expect(document.querySelector('.outfit-detail-overlay')).toBeNull()
    expect(write).not.toHaveBeenCalled()
    expect(await loadWardrobe()).toEqual(saved)
    await dialog.get('header button').trigger('click')
    // 聚焦预览交互，避免部件默认全部时渲染整个图鉴。
    await wrapper.setProps({ searchQuery: '1020100347' })
    button('部件').click()
    await flushPromises()
    expect(wrapper.get('.wardrobe-card-open').element.tagName).toBe('BUTTON')
    await wrapper.get('.wardrobe-card-open').trigger('click')
    expect(document.querySelector('.wardrobe-dialog')).toBeNull()
    await flushPromises()
    expect(document.querySelector('.outfit-detail-overlay')).not.toBeNull()
    document.querySelector<HTMLButtonElement>('.wardrobe-outfit-link')!.click()
    await flushPromises()
    expect(document.querySelector('.wardrobe-dialog')).not.toBeNull()
    expect(document.querySelector('.outfit-detail-overlay')).not.toBeNull()
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    )
    await flushPromises()
    expect(document.querySelector('.wardrobe-dialog')).toBeNull()
    expect(document.querySelector('.outfit-detail-overlay')).not.toBeNull()

    expect(await loadWardrobe()).toEqual(saved)
  })
  it('requires preview confirmation before replacing manual ownership', async () => {
    await storage.updateWardrobe((latest) => {
      latest.entries['1020100399'] = { owned: true, source: 'manual' }
      return latest
    })
    vi.spyOn(pearpal, 'fetchPearpalSnapshot').mockResolvedValue({
      info_from_self: { suit_list: ['10347'] }
    })
    button('导入数据').click()
    await flushPromises()
    const auth = document.querySelector<HTMLTextAreaElement>('textarea')!
    auth.value = '{"roleid":"1","token":"test","id":"1"}'
    auth.dispatchEvent(new Event('input', { bubbles: true }))
    await flushPromises()
    button('获取预览').click()
    await vi.waitFor(() => expect(document.querySelector('.resonance-preview')).not.toBeNull())
    expect((await loadWardrobe()).entries['1020100399']?.source).toBe('manual')
    expect(
      [...document.querySelectorAll('.data-import-warning')].map((el) => el.textContent).join(' ')
    ).toContain('整份覆盖勾选的记录')
    button('确认导入').click()
    await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).toBeNull())
    const saved = await loadWardrobe()
    expect(saved.entries['1020100399']).toBeUndefined()
    expect(Object.keys(saved.entries)).toHaveLength(10)
    expect(JSON.stringify(saved)).not.toContain('token')
  })
  it('discards a late notebook response after closing the dialog', async () => {
    const saved = await loadWardrobe()
    let finish!: (data: unknown) => void
    vi.spyOn(pearpal, 'fetchPearpalSnapshot').mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve
        })
    )
    button('导入数据').click()
    await flushPromises()
    const auth = document.querySelector<HTMLTextAreaElement>('textarea')!
    auth.value = '{"roleid":"1","token":"test","id":"1"}'
    auth.dispatchEvent(new Event('input', { bubbles: true }))
    await flushPromises()
    button('获取预览').click()
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'))
    document.querySelector<HTMLButtonElement>('[aria-label="关闭"]')!.click()
    await flushPromises()
    finish({ info_from_self: { suit_list: ['10347'] } })
    await flushPromises()
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    expect(await loadWardrobe()).toEqual(saved)
  })
})

describe('scheme A outfit detail', () => {
  it.each([0, 4, 10])(
    'shows real variant metadata and %s/10 owned pieces without writing records',
    async (owned) => {
      const catalog = await catalogModule.loadWardrobeCatalog()
      const entry = catalog.byId.get('1029402')!
      await storage.updateWardrobe((saved) => {
        entry.parts.forEach((id, index) => {
          saved.entries[id] = { owned: index < owned, source: 'pearpal' }
        })
        return saved
      })
      await reload()
      await choose('ownership', '全部')
      const saved = await loadWardrobe()
      const dialog = await openSuit()
      expect(dialog.get('h2').text()).toBe('花影心期·炽心')
      expect(dialog.get('.wardrobe-detail-variant').text()).toBe('一进')
      expect(dialog.find('.wardrobe-detail-rarity').exists()).toBe(false)
      expect(dialog.find('.wardrobe-detail-count').exists()).toBe(false)
      expect(dialog.get('.wardrobe-suit-progress').text()).toContain(`${owned}/10`)
      expect(dialog.get('.wardrobe-style-tag').text()).toBe('甜美')
      expect(dialog.get('.wardrobe-suit-facts dt').text()).toBe('星级')
      expect(dialog.get('.wardrobe-suit-facts dd').text()).toBe('5 ★')
      expect(dialog.get('.wardrobe-suit-preview img').attributes('src')).toContain('/1029402.png')
      expect(dialog.findAll('.wardrobe-part')).toHaveLength(10)
      expect(dialog.findAll('.wardrobe-part.is-owned')).toHaveLength(owned)
      expect(dialog.get('progress').attributes('value')).toBe(String(owned))
      expect(dialog.get('.wardrobe-suit-message').text()).toContain(
        owned === 10 ? '所有部件均已拥有' : owned === 4 ? '还差 6 件集齐' : '当前记录中尚未拥有'
      )
      const image = dialog.get('.wardrobe-part img')
      await image.trigger('error')
      expect(dialog.findAll('.wardrobe-part')).toHaveLength(10)
      expect(dialog.get('.wardrobe-part img').attributes('data-image-failed')).toBe('true')
      expect(await loadWardrobe()).toEqual(saved)
    }
  )

  it('discards a closed request, uses the new variant/language and renders descriptions as plain text', async () => {
    const pending: { resolve: (value: Response) => void; signal: AbortSignal; url: string }[] = []
    const fetcher = vi.fn(
      (url: string, init: RequestInit) =>
        new Promise<Response>((resolve) => {
          pending.push({ resolve, signal: init.signal as AbortSignal, url })
        })
    )
    vi.stubGlobal('fetch', fetcher)
    const first = await openSuit()
    expect(pending).toHaveLength(1)
    expect(first.findAll('.wardrobe-part')).toHaveLength(10)
    await first.get('button').trigger('click')
    expect(pending[0].signal.aborted).toBe(true)
    const second = await openSuit('1034701')
    pending[0].resolve(new Response(JSON.stringify({ description: 'Old variant' })))
    await flushPromises()
    expect(second.get('.wardrobe-suit-description').text()).toContain('正在加载套装描述')
    pending[1].resolve(new Response(JSON.stringify({ description: '当前形态描述' })))
    await flushPromises()
    expect(second.get('.wardrobe-suit-description').text()).toContain('当前形态描述')
    await wrapper.setProps({ language: 'en' })
    expect(second.get('.wardrobe-suit-description').text()).toContain('Loading outfit description')
    expect(pending[2].url).toContain('/outfits/1034701?lang=en')
    pending[2].resolve(new Response(JSON.stringify({ description: '<b>English description</b>' })))
    await flushPromises()
    expect(second.get('.wardrobe-suit-description').text()).toContain('<b>English description</b>')
    expect(second.find('.wardrobe-suit-description b').exists()).toBe(false)
    expect(second.get('.wardrobe-style-tag').text()).not.toMatch(/[\u4e00-\u9fff]/)
    await second.get('button').trigger('click')
    await openSuit('1034701')
    await flushPromises()
    expect(fetcher).toHaveBeenCalledTimes(3)
    wrapper.unmount()
    expect(document.querySelector('.wardrobe-dialog')).toBeNull()
  })

  it('keeps local details usable after a request failure and retries on reopening', async () => {
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockImplementation(
        async () => new Response(JSON.stringify({ description: 'Recovered description' }))
      )
    vi.stubGlobal('fetch', fetcher)
    let dialog = await openSuit()
    await flushPromises()
    expect(dialog.findAll('.wardrobe-part')).toHaveLength(10)
    expect(dialog.get('.wardrobe-suit-description').text()).toContain('暂无套装描述')
    await dialog.get('button').trigger('click')
    dialog = await openSuit()
    await flushPromises()
    expect(dialog.get('.wardrobe-suit-description').text()).toContain('Recovered description')
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('does not claim completion or fabricate style and family when catalog metadata is unavailable', async () => {
    const original = await catalogModule.loadWardrobeCatalog()
    const outfit = { ...original.byId.get('1029402')!, parts: [], style: null, familyRootId: null }
    vi.spyOn(catalogModule, 'loadWardrobeCatalog').mockResolvedValue({
      entries: [outfit],
      byId: new Map([[outfit.id, outfit]])
    })
    await reload()
    await choose('ownership', '全部')
    const dialog = await openSuit()
    expect(dialog.find('.wardrobe-detail-count').exists()).toBe(false)
    expect(dialog.find('.wardrobe-state-tag').exists()).toBe(false)
    expect(dialog.get('.wardrobe-version-tag').text()).toMatch(/^\d+\.\d+$/)
    expect(dialog.find('progress').exists()).toBe(false)
    expect(dialog.find('.wardrobe-style-tag').exists()).toBe(false)
    expect(dialog.get('.wardrobe-suit-facts').text()).not.toContain('所属套装')
    expect(dialog.get('.wardrobe-parts-empty').text()).toBe('暂无部件资料')
  })
})

it('includes partially collected outfits in owned and partial but not unowned', async () => {
  await storage.updateWardrobe(() => ({
    ...storage.emptyWardrobe(),
    entries: { '1020100347': { owned: true, source: 'pearpal' } }
  }))
  await reload()
  await wrapper.setProps({ searchQuery: '10347' })
  expect(
    wrapper.findAll('.wardrobe-card h3').some((n) => n.text().includes('如果爱上一朵花'))
  ).toBe(true)
  await choose('ownership', '收集中')
  expect(wrapper.findAll('.wardrobe-card')).toHaveLength(1)
  await choose('ownership', '未拥有')
  expect(wrapper.findAll('.wardrobe-card h3').some((n) => n.text() === '如果爱上一朵花')).toBe(
    false
  )
})

it('separates unknown pieces from unowned and preserves positive ownership', async () => {
  const catalog = await catalogModule.loadWardrobeCatalog()
  const ids = ['1021920029', '1026920029', '1020100347']
  const entries = ids.map((id) => catalog.byId.get(id)!)
  vi.spyOn(catalogModule, 'loadWardrobeCatalog').mockResolvedValue({
    entries,
    byId: new Map(entries.map((entry) => [entry.id, entry]))
  })
  await storage.updateWardrobe(() => ({
    ...storage.emptyWardrobe(),
    entries: { '1021920029': { owned: true, source: 'pearpal' } }
  }))
  await reload()
  button('部件').click()
  await flushPromises()
  const names = () => wrapper.findAll('.wardrobe-card h3').map((node) => node.text())
  expect(names()).toHaveLength(3)
  await choose('ownership', '未知')
  expect(names()).toEqual([entries[1].name.zh])
  expect(wrapper.get('.wardrobe-card-status').text()).toContain('未知')
  await choose('ownership', '未拥有')
  expect(names()).toEqual([entries[2].name.zh])
  await choose('ownership', '已拥有')
  expect(names()).toEqual([entries[0].name.zh])
  await choose('source', '星光小铺')
  expect(names()).toEqual([entries[1].name.zh])
  expect(wrapper.get('#wardrobe-filter-ownership').text()).toContain('未知')
  expect(wrapper.get('.wardrobe-ownership-note').text()).toBe(
    '此来源的拥有信息可能未包含在导入数据中，未识别到的部件显示为未知。'
  )
  await choose('ownership', '全部')
  expect(names()).toHaveLength(2)
  await choose('source', '全部')
  expect(wrapper.find('.wardrobe-ownership-note').exists()).toBe(false)
})

it('restores automatically changed ownership but preserves a manual choice', async () => {
  await wrapper.setProps({ searchQuery: '1020100347' })
  button('部件').click()
  await flushPromises()
  await choose('ownership', '已拥有')
  await choose('source', '星光小铺')
  expect(buttonFilter('ownership').textContent).toContain('未知')
  await choose('source', '服装商店')
  button('套装').click()
  await flushPromises()
  await choose('ownership', '全部')
  button('部件').click()
  await flushPromises()
  await choose('source', '限定卡池')
  expect(buttonFilter('ownership').textContent).toContain('已拥有')
  await choose('source', '星光小铺')
  await choose('ownership', '全部')
  await choose('source', '限定卡池')
  expect(buttonFilter('ownership').textContent).toContain('全部')
})

it('shows an imported empty wardrobe and returns to the initial view after clearing', async () => {
  await storage.updateWardrobe(() => ({ ...storage.emptyWardrobe(), imported: true }))
  await reload()
  expect(wrapper.find('.wardrobe-initial').exists()).toBe(false)
  expect(wrapper.find('.wardrobe-empty').exists()).toBe(true)
  await storage.updateWardrobe(() => storage.emptyWardrobe())
  await reload()
  expect(wrapper.find('.wardrobe-initial').exists()).toBe(true)
})
