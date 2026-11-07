import { clearMakeupCatalogCache } from '../../src/utils/loadMakeupCatalog'
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import MakeupCatalog from '../../src/components/MakeupCatalog.vue'
import MobileNavigation from '../../src/components/MobileNavigation.vue'
import { messages } from '../../src/i18n'

const resources = vi.hoisted(() => ({ rows: vi.fn(), names: vi.fn(), makeups: vi.fn() }))
vi.mock('../../src/utils/gongeo/catalogResources', () => ({
  catalogResources: {
    makeupItems: resources.rows,
    outfits: async () => [
      [10001, 5],
      [[1000101, 1000104], 5],
      [1006204, 5]
    ],
    makeupOutfits: async () => [
      [1000104, [10001001]],
      [10001, [10001001]],
      [1000101, [10001001]],
      [1006204, [10062003]]
    ],
    makeups: resources.makeups
  },
  loadCatalogNames: resources.names
}))
vi.mock('../../src/utils/cardReveal', () => ({ vCardReveal: {} }))

beforeEach(() => {
  clearMakeupCatalogCache()
  resources.makeups.mockReset().mockResolvedValue([
    [[10001001], 5, 0, 0, 21001],
    [99999999, 4, 0, 0, 20007],
    [[1020810438, 1025810438], 5, 1, 2, 21101],
    [1020820001, 4, 2, 0, 20007]
  ])
  resources.rows.mockReset().mockResolvedValue([
    [10001001, []],
    [99999999, []],
    [10001001, []]
  ])
  resources.names.mockReset().mockImplementation((_kind, language) =>
    Promise.resolve(
      _kind === 'item'
        ? {
            'item.1020810438.name': language === 'zh' ? '部件原妆' : 'Base piece',
            'item.1025810438.name': '部件进化',
            'item.1020820001.name': '独立眉毛'
          }
        : language === 'zh'
          ? { 'makeup.10001001.name': '绽响黎明前·妆', 'makeup.99999999.name': '测试缺图妆容' }
          : { 'makeup.10001001.name': 'Dawn', 'makeup.99999999.name': 'Ripples' }
    )
  )
})

describe('makeup catalog', () => {
  it('shows the other four pieces above the two related sections and updates on selection', async () => {
    const ids = [1020810438, 1020820438, 1020830438, 1020840438, 1020850438]
    resources.rows.mockResolvedValue([[10001001, ids]])
    resources.makeups.mockResolvedValue([
      [10001001, 5, 0, 0, 21001],
      ...ids.map((id, index) => [id, 5, index + 1, 0, 21001])
    ])
    const wrapper = mount(MakeupCatalog, { global: { stubs: { teleport: true } } })
    try {
      await flushPromises()
      await wrapper.get('.makeup-card').trigger('click')
      await wrapper.findAll('.makeup-detail-piece')[0]!.trigger('click')
      const pieces = wrapper.findAll('.makeup-detail-piece')
      expect(pieces).toHaveLength(4)
      expect(pieces.map((piece) => piece.attributes('aria-label'))).not.toContain(
        '查看部件详情：部件原妆'
      )
      expect(
        pieces.every((piece) => piece.get('img').attributes('src')!.includes('/IconClothes/'))
      ).toBe(true)
      expect(wrapper.get('.makeup-related-grid').classes()).toContain('is-piece-detail')
      expect(wrapper.get('.makeup-related-grid').findAll(':scope > section')).toHaveLength(2)
      await pieces[0]!.trigger('click')
      expect(wrapper.get('#makeup-detail-title').text()).toBe('1020820438')
      expect(wrapper.findAll('.makeup-detail-piece')).toHaveLength(4)
      expect(
        wrapper.findAll('.makeup-detail-piece').some((piece) => piece.text().includes('部件原妆'))
      ).toBe(true)
    } finally {
      wrapper.unmount()
    }
  })

  it('opens piece details and navigates between a full makeup and its piece', async () => {
    resources.rows.mockResolvedValue([[10001001, [1020810438]]])
    const wrapper = mount(MakeupCatalog, { global: { stubs: { teleport: true } } })
    try {
      await flushPromises()
      await wrapper.get('.makeup-card').trigger('click')
      await wrapper.get('.makeup-detail-piece').trigger('click')
      const dialog = wrapper.get('.makeup-detail-dialog')
      expect(dialog.get('#makeup-detail-title').text()).toBe('部件原妆')
      expect(dialog.get('.wardrobe-detail-variant').text()).toBe('底妆')
      expect(dialog.get('.makeup-detail-preview img').attributes('src')).toContain('/itemDetails/')
      expect(dialog.get('.wardrobe-rarity-tag').text()).toBe('5 ★')
      expect(dialog.get('.wardrobe-version-tag').text()).toBe('2.11')
      expect(dialog.find('.makeup-detail-parts').exists()).toBe(false)
      expect(dialog.findAll('.makeup-form-stage > button').map((button) => button.text())).toEqual([
        '原套',
        '满进'
      ])
      await dialog.findAll('.makeup-form-stage > button')[1]!.trigger('click')
      expect(wrapper.get('#makeup-detail-title').text()).toBe('部件进化')
      expect(wrapper.find('.makeup-related-makeups').exists()).toBe(false)
      await wrapper.findAll('.makeup-form-stage > button')[0]!.trigger('click')
      expect(dialog.findAll('.makeup-related-section button')).toHaveLength(1)
      await dialog.get('.makeup-related-makeups button').trigger('click')
      expect(wrapper.get('#makeup-detail-title').text()).toBe('绽响黎明前·妆')
      expect(wrapper.find('.makeup-detail-parts').exists()).toBe(true)
    } finally {
      wrapper.unmount()
    }
  })

  it('merges piece variants stored in separate rows by their explicit family root', async () => {
    resources.makeups.mockResolvedValue([
      [1025810438, 5, 1, 0, 21101, 1020810438],
      [1020810438, 5, 1, 2, 21101, 1020810438]
    ])
    const wrapper = mount(MakeupCatalog, { global: { stubs: { teleport: true } } })
    try {
      await flushPromises()
      await wrapper.findAll('.makeup-category-tabs button')[1]!.trigger('click')
      await wrapper.findAll('.makeup-card')[0]!.trigger('click')
      expect(wrapper.findAll('.makeup-form-stage > button').map((button) => button.text())).toEqual(
        ['原套', '满进']
      )
      expect(wrapper.findAll('.makeup-form-stage > button')[1]!.attributes('aria-pressed')).toBe(
        'true'
      )
      await wrapper.findAll('.makeup-form-stage > button')[0]!.trigger('click')
      expect(wrapper.get('#makeup-detail-title').text()).toBe('部件原妆')
    } finally {
      wrapper.unmount()
    }
  })

  it('opens standalone piece details from the grid with keyboard and hides absent relations', async () => {
    const wrapper = mount(MakeupCatalog, { global: { stubs: { teleport: true } } })
    try {
      await flushPromises()
      await wrapper
        .findAll('.makeup-type-filters button')
        .find((x) => x.text() === '眉妆')!
        .trigger('click')
      await wrapper.get('.makeup-card').trigger('keydown', { key: 'Enter' })
      const dialog = wrapper.get('.makeup-detail-dialog')
      expect(dialog.get('#makeup-detail-title').text()).toBe('独立眉毛')
      expect(dialog.get('.wardrobe-detail-variant').text()).toBe('眉妆')
      expect(dialog.get('.wardrobe-rarity-tag').text()).toBe('4 ★')
      expect(dialog.find('.makeup-detail-forms').exists()).toBe(false)
      expect(dialog.find('.makeup-detail-parts').exists()).toBe(false)
      expect(dialog.find('.makeup-related-makeups').exists()).toBe(false)
      expect(dialog.find('.makeup-related-section').exists()).toBe(false)
      await dialog.get('.makeup-detail-header button').trigger('click')
      expect(wrapper.find('.makeup-detail-dialog').exists()).toBe(false)
    } finally {
      wrapper.unmount()
    }
  })

  it('opens full makeup details and switches linked forms with icon pieces', async () => {
    resources.rows.mockResolvedValue([
      [10001001, [1020810438]],
      [10062003, [1025810438]]
    ])
    resources.makeups.mockResolvedValue([
      [10001001, 5, 0, 0, 21001, 10001001],
      [10062003, 5, 0, 1, 21001, 10001001],
      [[1020810438, 1025810438], 5, 1, 0, 21001]
    ])
    const wrapper = mount(MakeupCatalog, {
      attachTo: document.body,
      global: { stubs: { teleport: true } }
    })
    try {
      await flushPromises()
      await wrapper.findAll('.makeup-card')[0]!.trigger('keydown', { key: 'Enter' })
      let dialog = wrapper.get('.makeup-detail-dialog')
      expect(dialog.findAll('.makeup-form-stage > button').map((x) => x.text())).toEqual([
        '原套',
        '满进'
      ])
      expect(dialog.get('.makeup-detail-preview img').attributes('src')).toContain('/itemDetails/')
      expect(dialog.get('.makeup-detail-piece img').attributes('src')).toContain('/IconClothes/')
      expect(dialog.get('.makeup-detail-piece').text()).toContain('部件原妆')
      expect(dialog.findAll('.makeup-related-outfit')).toHaveLength(1)
      await dialog.findAll('.makeup-form-stage > button')[1]!.trigger('click')
      await flushPromises()
      dialog = wrapper.get('.makeup-detail-dialog')
      expect(dialog.get('#makeup-detail-title').text()).toBe('10062003')
      expect(dialog.get('.makeup-detail-piece').text()).toContain('部件进化')
      expect(dialog.findAll('.makeup-form-stage > button')[1]!.attributes('aria-pressed')).toBe(
        'true'
      )
      await dialog.get('.makeup-detail-header button').trigger('click')
      expect(wrapper.find('.makeup-detail-dialog').exists()).toBe(false)
    } finally {
      wrapper.unmount()
    }
  })

  it('hides form navigation and related outfits for standalone makeup', async () => {
    resources.rows.mockResolvedValue([[99999999, []]])
    const wrapper = mount(MakeupCatalog, { global: { stubs: { teleport: true } } })
    await flushPromises()
    await wrapper.get('.makeup-card').trigger('click')
    expect(wrapper.find('.makeup-detail-dialog').exists()).toBe(true)
    expect(wrapper.find('.makeup-detail-forms').exists()).toBe(false)
    expect(wrapper.find('.makeup-related-section').exists()).toBe(false)
    expect(wrapper.get('.makeup-detail-dialog').text()).toContain('暂无部件资料')
    await wrapper.get('.makeup-detail-overlay').trigger('click')
    expect(wrapper.find('.makeup-detail-dialog').exists()).toBe(false)
    wrapper.unmount()
  })

  it('sorts both views by newest version then highest rarity, retaining ties', async () => {
    const rows = [
      [90001, 5, 0, 0, 20901],
      [90002, 3, 0, 0, 21001],
      [90003, 5, 0, 0, 21001],
      [90004, 5, 0, 0, 21001],
      [90005, 5, 0, 0, null]
    ]
    resources.rows.mockResolvedValue(rows.map((row) => [row[0], []]))
    resources.makeups.mockResolvedValue([
      ...rows,
      ...rows.map((row) => [Number(row[0]) + 100, row[1], 1, 0, row[4]])
    ])
    const wrapper = mount(MakeupCatalog, { global: { stubs: { teleport: true } } })
    await flushPromises()
    expect(wrapper.findAll('h3').map((x) => x.text())).toEqual([
      '90003',
      '90004',
      '90002',
      '90001',
      '90005'
    ])
    await wrapper.findAll('.makeup-category-tabs button')[1]!.trigger('click')
    expect(wrapper.findAll('h3').map((x) => x.text())).toEqual([
      '90103',
      '90104',
      '90102',
      '90101',
      '90105'
    ])
    wrapper.unmount()
  })

  it('shows every distinct full makeup without an ownership import, including missing images', async () => {
    const wrapper = mount(MakeupCatalog)
    await flushPromises()
    expect(wrapper.findAll('.makeup-card')).toHaveLength(2)
    expect(wrapper.text()).toContain('共 2 款')
    expect(wrapper.findAll('.makeup-variant').map((x) => x.text())).toEqual(['原套', '全妆'])
    expect(wrapper.findAll('.makeup-card-rarity').map((x) => x.text())).toEqual(['5 ★', '4 ★'])
    expect(wrapper.get('.makeup-missing').text()).toBe('暂无图片')
    expect(wrapper.findAll('img')).toHaveLength(1)
    await wrapper.setProps({ searchQuery: ' 99999999 ' })
    expect(wrapper.findAll('.makeup-card')).toHaveLength(1)
    expect(wrapper.get('h3').text()).toBe('测试缺图妆容')
    await wrapper.setProps({ searchQuery: 'DAWN', language: 'en' })
    expect(wrapper.get('h3').text()).toBe('Dawn')
    await wrapper.setProps({ searchQuery: 'no match' })
    expect(wrapper.text()).toContain('No matching makeup')
    await wrapper.setProps({ searchQuery: '' })
    expect(wrapper.findAll('.makeup-card')).toHaveLength(2)
    wrapper.unmount()
  })

  it('labels makeup exclusive to the final evolution and updates the label language', async () => {
    resources.rows.mockResolvedValue([[10062003, []]])
    const wrapper = mount(MakeupCatalog)
    await flushPromises()
    expect(wrapper.get('.makeup-variant').text()).toBe('满进')
    await wrapper.setProps({ language: 'en' })
    expect(wrapper.get('.makeup-variant').text()).toBe('Evo. 3')
    wrapper.unmount()
  })

  it('combines version, source and search and resets both filters', async () => {
    const wrapper = mount(MakeupCatalog, { global: { stubs: { teleport: true } } })
    await flushPromises()
    await wrapper.get('#makeup-filter-source').trigger('click')
    const sourceOption = wrapper
      .findAll('[role="menuitemradio"]')
      .find((option) => option.text() === '活动')!
    await sourceOption.trigger('click')
    expect(wrapper.findAll('.makeup-card')).toHaveLength(1)
    expect(wrapper.get('h3').text()).toBe('测试缺图妆容')
    await wrapper.get('#makeup-filter-version').trigger('click')
    await wrapper
      .findAll('[role="menuitemradio"]')
      .find((option) => option.text().startsWith('2.10'))!
      .trigger('click')
    expect(wrapper.findAll('.makeup-card')).toHaveLength(0)
    expect(wrapper.text()).toContain('没有符合条件的妆容')
    await wrapper.get('.makeup-reset-button').trigger('click')
    expect(wrapper.findAll('.makeup-card')).toHaveLength(2)
    await wrapper.setProps({ searchQuery: 'Dawn' })
    await wrapper.get('#makeup-filter-source').trigger('click')
    await wrapper
      .findAll('[role="menuitemradio"]')
      .find((option) => option.text() === '活动')!
      .trigger('click')
    expect(wrapper.findAll('.makeup-card')).toHaveLength(0)
    await wrapper.get('.makeup-reset-button').trigger('click')
    expect(wrapper.findAll('.makeup-card')).toHaveLength(1)
    await wrapper.get('#makeup-filter-version').trigger('click')
    await wrapper.get('#makeup-menu-version').trigger('keydown', { key: 'Escape' })
    expect(wrapper.find('#makeup-menu-version').exists()).toBe(false)
    wrapper.unmount()
  })

  it('opens the mobile filter panel and selects a source', async () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({
        matches: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn()
      }))
    )
    const wrapper = mount(MakeupCatalog, {
      attachTo: document.body,
      global: { stubs: { teleport: true } }
    })
    try {
      await flushPromises()
      await wrapper.get('.collection-tag-select').trigger('click')
      expect(wrapper.get('[role="dialog"]').isVisible()).toBe(true)
      await wrapper.get('#makeup-filter-source').trigger('click')
      await wrapper
        .findAll('[role="menuitemradio"]')
        .find((option) => option.text() === '活动')!
        .trigger('click')
      expect(wrapper.findAll('.makeup-card')).toHaveLength(1)
      await wrapper.get('.mobile-filter-panel footer button').trigger('click')
      expect(wrapper.find('#makeup-menu-source').exists()).toBe(false)
      await wrapper.get('.collection-tag-clear').trigger('click')
      expect(wrapper.findAll('.makeup-card')).toHaveLength(2)
      await wrapper.get('.makeup-mobile-category-switch').trigger('click')
      expect(wrapper.findAll('.makeup-card')).toHaveLength(3)
      expect(wrapper.find('.makeup-type-filters').exists()).toBe(false)
      await wrapper.get('.collection-tag-select').trigger('click')
      await wrapper.get('#makeup-filter-category').trigger('click')
      await wrapper
        .findAll('[role="menuitemradio"]')
        .find((x) => x.text() === '眉妆')!
        .trigger('click')
      expect(wrapper.findAll('.makeup-card')).toHaveLength(1)
      expect(wrapper.get('h3').text()).toBe('独立眉毛')
      await wrapper.get('.makeup-reset-button').trigger('click')
      expect(wrapper.findAll('.makeup-card')).toHaveLength(3)
      await wrapper.get('.mobile-filter-panel footer button').trigger('click')
      expect(wrapper.get('.makeup-mobile-category-switch').attributes('aria-label')).toBe(
        '切换到全妆'
      )
      await wrapper.get('.makeup-mobile-category-switch').trigger('click')
      expect(wrapper.findAll('.makeup-card')).toHaveLength(2)
    } finally {
      wrapper.unmount()
      vi.unstubAllGlobals()
    }
  })

  it('opens a piece category from full makeup and reserves image dimensions', async () => {
    const wrapper = mount(MakeupCatalog, { global: { stubs: { teleport: true } } })
    await flushPromises()
    const image = wrapper.get('.makeup-cover img')
    expect(image.attributes('width')).toBe('520')
    expect(image.attributes('height')).toBe('724')
    expect(wrapper.findAll('.makeup-type-filters button')).toHaveLength(6)
    await wrapper
      .findAll('.makeup-type-filters button')
      .find((x) => x.text() === '眉妆')!
      .trigger('click')
    expect(wrapper.get('.makeup-grid').classes()).toContain('is-pieces')
    expect(wrapper.findAll('.makeup-card')).toHaveLength(1)
    expect(wrapper.get('h3').text()).toBe('独立眉毛')
    await wrapper.findAll('.makeup-category-tabs button')[0]!.trigger('click')
    expect(wrapper.findAll('.makeup-card')).toHaveLength(2)
    expect(wrapper.get('.makeup-type-filters button').attributes('aria-pressed')).toBe('true')
    wrapper.unmount()
  })

  it('shows independent makeup pieces and remembers each view filter', async () => {
    const wrapper = mount(MakeupCatalog, { global: { stubs: { teleport: true } } })
    await flushPromises()
    await wrapper.get('#makeup-filter-source').trigger('click')
    await wrapper
      .findAll('[role="menuitemradio"]')
      .find((x) => x.text() === '活动')!
      .trigger('click')
    expect(wrapper.findAll('.makeup-card')).toHaveLength(1)
    await wrapper.findAll('.makeup-category-tabs button')[1]!.trigger('click')
    expect(wrapper.findAll('.makeup-card')).toHaveLength(3)
    expect(wrapper.get('.makeup-grid').classes()).toContain('is-pieces')
    expect(wrapper.findAll('h3').map((x) => x.text())).toContain('独立眉毛')
    expect(wrapper.findAll('.makeup-variant').map((x) => x.text())).toEqual([
      '底妆',
      '底妆',
      '眉毛'
    ])
    expect(wrapper.get('.makeup-cover img').attributes('src')).toContain('/itemDetails/')
    expect(wrapper.find('#makeup-filter-category').exists()).toBe(false)
    await wrapper
      .findAll('.makeup-type-filters button')
      .find((x) => x.text() === '眉妆')!
      .trigger('click')
    expect(wrapper.findAll('.makeup-card')).toHaveLength(1)
    expect(wrapper.get('h3').text()).toBe('独立眉毛')
    await wrapper.findAll('.makeup-type-filters button')[0]!.trigger('click')
    expect(wrapper.findAll('.makeup-card')).toHaveLength(3)
    await wrapper.get('#makeup-filter-quality').trigger('click')
    await wrapper
      .findAll('[role="menuitemradio"]')
      .find((x) => x.text() === '4 ★')!
      .trigger('click')
    expect(wrapper.findAll('.makeup-card')).toHaveLength(1)
    expect(wrapper.get('h3').text()).toBe('独立眉毛')
    await wrapper.findAll('.makeup-category-tabs button')[0]!.trigger('click')
    expect(wrapper.find('#makeup-filter-quality').exists()).toBe(false)
    expect(wrapper.findAll('.makeup-card')).toHaveLength(1)
    await wrapper.findAll('.makeup-category-tabs button')[1]!.trigger('click')
    expect(wrapper.get('#makeup-filter-quality').text()).toContain('4 ★')
    await wrapper.get('.makeup-reset-button').trigger('click')
    expect(wrapper.findAll('.makeup-card')).toHaveLength(3)
    await wrapper.get('#makeup-filter-version').trigger('click')
    await wrapper
      .findAll('[role="menuitemradio"]')
      .find((x) => x.text().startsWith('2.11'))!
      .trigger('click')
    expect(wrapper.findAll('.makeup-card')).toHaveLength(2)
    await wrapper.findAll('.makeup-category-tabs button')[0]!.trigger('click')
    expect(wrapper.findAll('.makeup-card')).toHaveLength(1)
    expect(wrapper.get('#makeup-filter-source').text()).toContain('活动')
    await wrapper.findAll('.makeup-category-tabs button')[1]!.trigger('click')
    expect(wrapper.findAll('.makeup-card')).toHaveLength(2)
    await wrapper.setProps({ searchQuery: 'Base piece' })
    expect(wrapper.findAll('.makeup-card')).toHaveLength(1)
    wrapper.unmount()
  })

  it('recovers from a catalog loading failure', async () => {
    resources.rows.mockRejectedValueOnce(new Error('offline'))
    const wrapper = mount(MakeupCatalog)
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toContain('加载失败')
    await wrapper.get('[role="alert"] button').trigger('click')
    await flushPromises()
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    expect(wrapper.findAll('.makeup-card')).toHaveLength(2)
    wrapper.unmount()
  })

  it('keeps the existing mobile archive navigation selected', () => {
    const wrapper = mount(MobileNavigation, {
      props: {
        activeView: 'makeup',
        disabled: false,
        messages: messages.zh.viewNav,
        outfitLabel: '搭配码',
        cameraLabel: '相机参数'
      }
    })
    expect(wrapper.get('button[aria-current="page"]').text()).toBe('暖暖档案')
    expect(wrapper.findAll('button').filter((button) => button.text() === '妆容图鉴')).toHaveLength(
      0
    )
    wrapper.unmount()
  })
})
