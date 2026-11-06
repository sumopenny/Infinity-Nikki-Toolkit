import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import OutfitParseDialog from '../../src/components/OutfitParseDialog.vue'
import { getOutfitMessages } from '../helpers/outfitMessages'

const { parseOutfitCodeMock, loadItemCatalogMock, loadOutfitDetailMock } = vi.hoisted(() => ({
  parseOutfitCodeMock: vi.fn(),
  loadItemCatalogMock: vi.fn(),
  loadOutfitDetailMock: vi.fn()
}))

vi.mock('../../src/utils/outfit/outfitCodeParser', async () => {
  const actual = await vi.importActual<typeof import('../../src/utils/outfit/outfitCodeParser')>(
    '../../src/utils/outfit/outfitCodeParser'
  )
  return { ...actual, parseOutfitCode: parseOutfitCodeMock }
})

vi.mock('../../src/utils/outfit/itemCatalog', () => ({
  loadItemCatalog: loadItemCatalogMock,
  getCatalogEntryName: (entry: { zh: string; en: string }, language: 'zh' | 'en') =>
    entry[language],
  getCatalogImageUrl: (entry: { id: number }) => `https://example.test/${entry.id}.png`
}))

vi.mock('../../src/utils/outfit/outfitDetails', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/utils/outfit/outfitDetails')>()
  return {
    ...actual,
    loadOutfitDetail: loadOutfitDetailMock,
    loadLocalOutfitDetail: vi.fn(async (id, _outfit, language, name) =>
      actual.createOutfitDetailPreview(id, language, name)
    )
  }
})

const detail = {
  itemId: 1020100001,
  outfitId: 1001,
  itemName: '时光讯号-发型',
  outfitName: '绽响黎明前',
  outfitImageUrl: 'https://example.test/outfit.png',
  detailImageUrl: 'https://example.test/outfit.png',
  evolution: '原套',
  dyeCondition: '进化后可染 / 焕新可染',
  dyes: [{ area: '区域 01', paletteId: 18, paletteName: '名流鸦盛宴', slot: 2, color: '#ff0000' }],
  loadError: false
}

describe('OutfitParseDialog', () => {
  it('切换搭配码后旧图鉴的晚响应不能覆盖新图鉴', async () => {
    parseOutfitCodeMock.mockResolvedValue({
      code: '13dub3nPiPu#',
      wearingClothes: [{ itemId: 1020100001, clothType: 10, outfitId: null }],
      dyeItems: []
    })
    let finish!: (value: Map<number, unknown>) => void
    const catalog = (name: string) =>
      new Map([[1020100001, { id: 1020100001, zh: name, en: name, makeup: false }]])
    loadItemCatalogMock
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve
          })
      )
      .mockResolvedValueOnce(catalog('新图鉴'))
    const wrapper = mount(OutfitParseDialog, {
      props: {
        visible: true,
        code: '13dub3nPiPu#',
        language: 'zh',
        messages: getOutfitMessages('zh')
      },
      global: { stubs: { Teleport: true, Transition: true } }
    })
    try {
      await flushPromises()
      await wrapper.setProps({ code: '1I46pljmAER#' })
      await flushPromises()
      expect(wrapper.text()).toContain('新图鉴')
      finish(catalog('旧图鉴'))
      await flushPromises()
      expect(wrapper.text()).toContain('新图鉴')
      expect(wrapper.text()).not.toContain('旧图鉴')
    } finally {
      wrapper.unmount()
    }
  })

  it.each(['success', 'failure'])(
    '图鉴延迟时先展示解析结果，图鉴 %s 不影响成功状态',
    async (outcome) => {
      parseOutfitCodeMock.mockResolvedValue({
        code: '13dub3nPiPu#',
        wearingClothes: [{ itemId: 1020100001, clothType: 10, outfitId: null }],
        dyeItems: []
      })
      let finish!: (value: Map<number, unknown>) => void
      let fail!: (error: Error) => void
      loadItemCatalogMock.mockImplementationOnce(
        () =>
          new Promise((resolve, reject) => {
            finish = resolve
            fail = reject
          })
      )
      const wrapper = mount(OutfitParseDialog, {
        props: {
          visible: true,
          code: '13dub3nPiPu#',
          language: 'zh',
          messages: getOutfitMessages('zh')
        },
        global: { stubs: { Teleport: true, Transition: true } }
      })
      try {
        await flushPromises()
        expect(wrapper.text()).toContain('1020100001')
        expect(wrapper.text()).not.toContain(getOutfitMessages('zh').parseLoading)
        if (outcome === 'success')
          finish(
            new Map([[1020100001, { id: 1020100001, zh: '补齐名称', en: 'Loaded', makeup: false }]])
          )
        else fail(new Error('offline'))
        await flushPromises()
        expect(wrapper.text()).toContain(outcome === 'success' ? '补齐名称' : '1020100001')
        expect(wrapper.text()).not.toContain(getOutfitMessages('zh').parseUnavailable)
      } finally {
        wrapper.unmount()
      }
    }
  )

  it('补充图鉴期间不显示顶部提示，失败后仍可重试并保留部件预览', async () => {
    parseOutfitCodeMock.mockResolvedValue({
      code: '13dub3nPiPu#',
      wearingClothes: [{ itemId: 1020100001, clothType: 10, outfitId: null }],
      dyeItems: []
    })
    loadItemCatalogMock.mockResolvedValue(
      new Map([
        [1020100001, { id: 1020100001, zh: '时光讯号', en: 'Signal of Time', makeup: false }]
      ])
    )
    let rejectDetail!: (error: Error) => void
    loadOutfitDetailMock
      .mockImplementationOnce(
        () =>
          new Promise((_resolve, reject) => {
            rejectDetail = reject
          })
      )
      .mockResolvedValueOnce(detail)
    const wrapper = mount(OutfitParseDialog, {
      props: {
        visible: true,
        code: '13dub3nPiPu#',
        language: 'zh',
        messages: getOutfitMessages('zh')
      },
      global: { stubs: { Teleport: true, Transition: true } }
    })
    try {
      await flushPromises()
      await wrapper.get('.outfit-parse-item-button').trigger('click')
      await flushPromises()
      expect(wrapper.find('.outfit-detail-progress').exists()).toBe(false)
      expect(wrapper.find('.outfit-detail-loading').exists()).toBe(false)
      expect(wrapper.get('.outfit-detail-summary').text()).not.toContain('正在加载部件图鉴详情')
      expect(wrapper.get('.outfit-detail-info').text()).toContain('加载中…')
      expect(wrapper.find('.outfit-detail-image').exists()).toBe(true)
      rejectDetail(new Error('offline'))
      await flushPromises()
      expect(wrapper.get('.outfit-detail-info').text()).toContain('时光讯号')
      await wrapper.get('.outfit-detail-error button').trigger('click')
      await flushPromises()
      expect(wrapper.find('.outfit-detail-error').exists()).toBe(false)
      expect(wrapper.get('.outfit-detail-info').text()).toContain('绽响黎明前')
    } finally {
      wrapper.unmount()
    }
  })

  it('opens item details from a focused image button and returns focus on close', async () => {
    parseOutfitCodeMock.mockResolvedValue({
      code: 'a1B2c3D4e5F#',
      wearingClothes: [{ itemId: 1020100001, clothType: 10, outfitId: 1001 }],
      dyeItems: [
        {
          itemId: 1020100001,
          clothType: 10,
          outfitId: 1001,
          dyes: detail.dyes.map((dye) => ({ ...dye, targetGroupId: 1, featureTag: 1 }))
        }
      ]
    })
    loadItemCatalogMock.mockResolvedValue(
      new Map([
        [1020100001, { id: 1020100001, zh: '时光讯号', en: 'Signal of Time', makeup: false }]
      ])
    )
    loadOutfitDetailMock.mockResolvedValue(detail)

    const wrapper = mount(OutfitParseDialog, {
      props: {
        visible: false,
        code: 'a1B2c3D4e5F',
        language: 'zh',
        messages: getOutfitMessages('zh')
      },
      attachTo: document.body,
      global: { stubs: { Teleport: true, Transition: { template: '<div><slot /></div>' } } }
    })
    await wrapper.setProps({ visible: true })
    await flushPromises()

    const itemButton = wrapper.get('.outfit-parse-item-button')
    const itemImage = wrapper.get('.outfit-parse-item-icon')
    expect(itemImage.classes()).toContain('is-loading')
    await itemImage.trigger('load')
    expect(itemImage.classes()).not.toContain('is-loading')
    await itemButton.trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('时光讯号(发型)')
    expect(wrapper.find('.outfit-detail-panel').exists()).toBe(true)
    const detailImage = wrapper.get('.outfit-detail-image')
    expect(detailImage.classes()).toContain('is-loading')
    await detailImage.trigger('load')
    expect(detailImage.classes()).not.toContain('is-loading')
    expect(wrapper.text()).toContain('绽响黎明前')
    expect(wrapper.findAll('.outfit-detail-table-wrap tbody tr')).toHaveLength(1)

    await wrapper.get('.outfit-detail-panel header button').trigger('click')
    await flushPromises()
    expect(wrapper.find('.outfit-detail-panel').exists()).toBe(false)
    expect(document.activeElement).toBe(itemButton.element)
    wrapper.unmount()
  })

  it('passes the decoded special-effect flag through to item details', async () => {
    const dyes = [
      { targetGroupId: 1, featureTag: 1, paletteId: 11, slot: 1, color: '#2c646a' },
      { targetGroupId: 2, featureTag: 1, paletteId: 16, slot: 8, color: '#f7b3dc' }
    ]
    parseOutfitCodeMock.mockResolvedValue({
      code: '13Zb1zKZgf1#',
      wearingClothes: [{ itemId: 1025740294, clothType: null, outfitId: null }],
      dyeItems: [
        { itemId: 1025740294, clothType: null, outfitId: null, dyes, hasSpecialEffect: true }
      ]
    })
    loadItemCatalogMock.mockResolvedValue(
      new Map([
        [1025740294, { id: 1025740294, zh: '童话终章', en: 'Fairytale Finale', makeup: false }]
      ])
    )
    loadOutfitDetailMock.mockResolvedValue({
      ...detail,
      itemId: 1025740294,
      itemName: '童话终章',
      dyeCondition: '满进可染'
    })

    const wrapper = mount(OutfitParseDialog, {
      props: {
        visible: false,
        code: '13Zb1zKZgf1#',
        language: 'zh',
        messages: getOutfitMessages('zh')
      },
      attachTo: document.body,
      global: { stubs: { Teleport: true, Transition: { template: '<div><slot /></div>' } } }
    })
    await wrapper.setProps({ visible: true })
    await flushPromises()
    await wrapper.get('.outfit-parse-item-button').trigger('click')
    await flushPromises()

    expect(loadOutfitDetailMock).toHaveBeenCalledWith(
      1025740294,
      null,
      'zh',
      '童话终章(颈饰)',
      dyes,
      74,
      true
    )
    expect(wrapper.text()).toContain('童话终章(颈饰)')
    expect(wrapper.text()).toContain('满进可染')
    wrapper.unmount()
  })

  it('closes the detail layer with Escape and hides an empty dye table', async () => {
    parseOutfitCodeMock.mockResolvedValue({
      code: 'a1B2c3D4e5F#',
      wearingClothes: [{ itemId: 1020100001, clothType: 10, outfitId: null }],
      dyeItems: []
    })
    loadItemCatalogMock.mockResolvedValue(
      new Map([
        [1020100001, { id: 1020100001, zh: '时光讯号', en: 'Signal of Time', makeup: false }]
      ])
    )
    loadOutfitDetailMock.mockResolvedValue({
      ...detail,
      outfitName: '',
      dyes: [],
      outfitId: null,
      outfitImageUrl: null
    })

    const wrapper = mount(OutfitParseDialog, {
      props: {
        visible: false,
        code: 'a1B2c3D4e5F',
        language: 'zh',
        messages: getOutfitMessages('zh')
      },
      attachTo: document.body,
      global: { stubs: { Teleport: true, Transition: { template: '<div><slot /></div>' } } }
    })
    await wrapper.setProps({ visible: true })
    await flushPromises()
    await wrapper.get('.outfit-parse-item-button').trigger('click')
    await flushPromises()
    expect(wrapper.find('.outfit-detail-dyes').exists()).toBe(false)
    expect(wrapper.text()).toContain('无')
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await flushPromises()
    expect(wrapper.find('.outfit-detail-panel').exists()).toBe(false)
    wrapper.unmount()
  })
})

it.each([false, true])(
  'ignores older detail success/error and late results after close (%s)',
  async (rejectOld) => {
    parseOutfitCodeMock.mockResolvedValue({
      code: 'CODE',
      wearingClothes: [
        { itemId: 1, outfitId: null, clothType: null },
        { itemId: 2, outfitId: null, clothType: null }
      ],
      dyeItems: []
    })
    loadItemCatalogMock.mockResolvedValue(
      new Map([
        [1, { id: 1, zh: '甲', en: 'A' }],
        [2, { id: 2, zh: '乙', en: 'B' }]
      ])
    )
    let finishOld!: (value: typeof detail) => void, failOld!: (reason: Error) => void
    loadOutfitDetailMock
      .mockImplementationOnce(
        () =>
          new Promise((resolve, reject) => {
            finishOld = resolve
            failOld = reject
          })
      )
      .mockResolvedValueOnce({ ...detail, itemName: '最新详情', outfitName: '最新套装' })
    const wrapper = mount(OutfitParseDialog, {
      props: { visible: false, code: 'CODE', language: 'zh', messages: getOutfitMessages('zh') },
      global: { stubs: { Teleport: true } }
    })
    try {
      await wrapper.setProps({ visible: true })
      await flushPromises()
      await wrapper.findAll('.outfit-parse-item-button')[0]!.trigger('click')
      await wrapper.findAll('.outfit-parse-item-button')[1]!.trigger('click')
      await flushPromises()
      expect(wrapper.get('.outfit-detail-panel').text()).toContain('最新套装')
      if (rejectOld) failOld(new Error('old failed'))
      else finishOld(detail)
      await flushPromises()
      expect(wrapper.get('.outfit-detail-panel').text()).toContain('最新套装')
      let late!: (value: typeof detail) => void
      loadOutfitDetailMock.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            late = resolve
          })
      )
      await wrapper.findAll('.outfit-parse-item-button')[0]!.trigger('click')
      await wrapper.get('.outfit-detail-panel header button').trigger('click')
      late(detail)
      await flushPromises()
      expect(wrapper.find('.outfit-detail-panel').exists()).toBe(false)
    } finally {
      wrapper.unmount()
    }
  }
)

it('keeps an already loaded image visible when retrying catalog details', async () => {
  parseOutfitCodeMock.mockResolvedValue({
    code: 'CODE',
    wearingClothes: [{ itemId: 1020100001, clothType: 10, outfitId: null }],
    dyeItems: []
  })
  loadItemCatalogMock.mockResolvedValue(
    new Map([[1020100001, { id: 1020100001, zh: '发型', en: 'Hair', makeup: false }]])
  )
  const sameImageDetail = {
    ...detail,
    detailImageUrl: 'https://cdn.gongeo.us/images/items/1020100001.png'
  }
  loadOutfitDetailMock
    .mockResolvedValueOnce({ ...sameImageDetail, loadError: true })
    .mockResolvedValueOnce(sameImageDetail)
  const wrapper = mount(OutfitParseDialog, {
    props: { visible: true, code: 'CODE', language: 'zh', messages: getOutfitMessages('zh') },
    global: { stubs: { Teleport: true, Transition: true } }
  })
  try {
    await flushPromises()
    await wrapper.get('.outfit-parse-item-button').trigger('click')
    await flushPromises()
    const image = wrapper.get('.outfit-detail-image')
    await image.trigger('load')
    expect(wrapper.find('.outfit-detail-image-placeholder').exists()).toBe(false)
    await wrapper.get('.outfit-detail-error button').trigger('click')
    await flushPromises()
    expect(wrapper.get('.outfit-detail-image').element).toBe(image.element)
    expect(wrapper.find('.outfit-detail-error').exists()).toBe(false)
    expect(wrapper.find('.outfit-detail-image-placeholder').exists()).toBe(false)
    expect(wrapper.get('.outfit-detail-image').classes()).not.toContain('is-loading')
  } finally {
    wrapper.unmount()
  }
})

it.each([false, true])(
  'switches wardrobe forms without copying worn dyes (mobile=%s)',
  async (compact) => {
    vi.stubGlobal('matchMedia', () => ({
      matches: compact,
      addEventListener() {},
      removeEventListener() {}
    }))
    const catalogModule = await import('../../src/utils/wardrobe/wardrobeCatalog')
    const storage = await import('../../src/utils/wardrobe/wardrobeStorage')
    const catalog = await catalogModule.loadWardrobeCatalog()
    const family = (entry: (typeof catalog.entries)[number]) => entry.familyRootId ?? entry.id
    const original = catalog.entries.find(
      (entry) =>
        entry.kind === 'item' &&
        entry.variant === 0 &&
        catalog.entries.some(
          (other) => other.kind === 'item' && other.variant > 0 && family(other) === family(entry)
        )
    )!
    const evolved = catalog.entries.find(
      (entry) => entry.kind === 'item' && entry.variant > 0 && family(entry) === family(original)
    )!
    const snapshotSpy = vi.spyOn(storage, 'loadWardrobe').mockResolvedValue({
      ...storage.emptyWardrobe(),
      entries: Object.fromEntries(
        original.parts.map((id) => [id, { owned: true, source: 'pearpal' as const }])
      ),
      updatedAt: '2026-10-28T00:00:00Z'
    })
    const dyes = [{ targetGroupId: 1, featureTag: 1, paletteId: 18, slot: 2, color: '#ff0000' }]
    parseOutfitCodeMock.mockResolvedValue({
      code: 'forms-test',
      wearingClothes: [{ itemId: Number(original.id), clothType: 10, outfitId: null }],
      dyeItems: [{ itemId: Number(original.id), dyes, hasSpecialEffect: true }]
    })
    loadItemCatalogMock.mockResolvedValue(
      new Map([
        [
          Number(original.id),
          { id: Number(original.id), zh: original.name.zh, en: original.name.en, makeup: false }
        ]
      ])
    )
    loadOutfitDetailMock.mockImplementation(async (id, _outfit, _lang, name, swatches) => ({
      ...detail,
      itemId: id,
      itemName: name,
      dyes: swatches.length ? detail.dyes : []
    }))
    const wrapper = mount(OutfitParseDialog, {
      props: {
        visible: true,
        code: 'forms-test',
        language: 'zh',
        messages: getOutfitMessages('zh')
      },
      attachTo: document.body,
      global: { stubs: { Teleport: true, Transition: true } }
    })
    try {
      await flushPromises()
      await wrapper.get('.outfit-parse-item-button').trigger('click')
      await flushPromises()
      const panel = wrapper.get('.outfit-detail-panel').element
      const nav = wrapper.get('.wardrobe-form-nav')
      expect(nav.classes().includes('is-horizontal')).toBe(compact)
      expect(nav.findAll('.wardrobe-form-owned')).toHaveLength(1)
      expect(wrapper.findAll('.outfit-detail-table-wrap tbody tr')).toHaveLength(1)
      const forms = catalog.entries
        .filter((entry) => entry.kind === 'item' && family(entry) === family(original))
        .sort((a, b) => a.variant - b.variant)
      await nav
        .findAll('button')
        [forms.findIndex((entry) => entry.id === evolved.id)]!.trigger('click')
      await flushPromises()
      expect(wrapper.get('.outfit-detail-panel').element).toBe(panel)
      expect(loadOutfitDetailMock.mock.lastCall?.[0]).toBe(Number(evolved.id))
      expect(loadOutfitDetailMock.mock.lastCall?.[4]).toEqual([])
      expect(loadOutfitDetailMock.mock.lastCall?.[6]).toBe(false)
      expect(wrapper.find('.outfit-detail-dyes').exists()).toBe(false)
      await nav
        .findAll('button')
        [forms.findIndex((entry) => entry.id === original.id)]!.trigger('click')
      await flushPromises()
      expect(loadOutfitDetailMock.mock.lastCall?.[4]).toEqual(dyes)
      expect(loadOutfitDetailMock.mock.lastCall?.[6]).toBe(true)
      expect(wrapper.findAll('.outfit-detail-table-wrap tbody tr')).toHaveLength(1)
      await wrapper.get('.outfit-detail-panel header button').trigger('click')
      await flushPromises()
      expect(document.activeElement).toBe(wrapper.get('.outfit-parse-item-button').element)
    } finally {
      wrapper.unmount()
      snapshotSpy.mockRestore()
      vi.unstubAllGlobals()
    }
  }
)

it('embeds photo dressing, opens dye details and updates without requesting a share code', async () => {
  parseOutfitCodeMock.mockClear()
  loadOutfitDetailMock.mockReset().mockResolvedValue(detail)
  loadItemCatalogMock
    .mockReset()
    .mockResolvedValue(
      new Map([[1020100001, { id: 1020100001, zh: '照片发型', en: 'Photo hair', makeup: false }]])
    )
  const dyes = [{ targetGroupId: 1, featureTag: 6, paletteId: 18, slot: 2, color: '#ff0000' }]
  const suppliedResult = {
    code: '',
    wearingClothes: [{ itemId: 1020100001, clothType: 10, outfitId: null }],
    dyeItems: [{ itemId: 1020100001, clothType: 10, outfitId: null, dyes, hasSpecialEffect: false }]
  }
  const wrapper = mount(OutfitParseDialog, {
    props: {
      visible: true,
      embedded: true,
      suppliedResult,
      code: '',
      language: 'zh',
      messages: getOutfitMessages('zh')
    },
    global: { stubs: { Teleport: true, Transition: true } }
  })
  try {
    await flushPromises()
    expect(wrapper.find('.outfit-editor').exists()).toBe(false)
    expect(wrapper.find('.outfit-parse-code').exists()).toBe(false)
    expect(wrapper.text()).toContain('照片发型')
    expect(wrapper.find('.outfit-parse-dye-dot').exists()).toBe(true)
    await wrapper.get('.outfit-parse-item-button').trigger('click')
    await flushPromises()
    expect(loadOutfitDetailMock).toHaveBeenLastCalledWith(
      1020100001,
      null,
      'zh',
      expect.any(String),
      dyes,
      10,
      false
    )
    expect(wrapper.get('.outfit-detail-overlay').text()).toContain('名流鸦盛宴')
    const escape = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true })
    window.dispatchEvent(escape)
    await flushPromises()
    expect(wrapper.find('.outfit-detail-overlay').exists()).toBe(false)
    expect(wrapper.emitted('close')).toBeUndefined()
    await wrapper.setProps({ suppliedResult: { code: '', wearingClothes: [], dyeItems: [] } })
    await flushPromises()
    expect(wrapper.find('.outfit-parse-item-button').exists()).toBe(false)
    expect(parseOutfitCodeMock).not.toHaveBeenCalled()
  } finally {
    wrapper.unmount()
  }
})
