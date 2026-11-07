import { flushPromises, mount } from '@vue/test-utils'
import { expect, it, vi } from 'vitest'
import WardrobeOutfitDialog from '../../src/components/WardrobeOutfitDialog.vue'
import { emptyWardrobe } from '../../src/utils/wardrobe/wardrobeStorage'
import type { WardrobeEntry } from '../../src/utils/wardrobe/wardrobeCatalog'
vi.mock('../../src/utils/gongeo/catalogResources', () => ({
  catalogResources: {
    makeupOutfits: vi.fn().mockResolvedValue([
      [1001, [10001]],
      [100104, [10004]]
    ])
  }
}))
vi.mock('../../src/utils/loadMakeupCatalog', () => ({
  loadMakeupCatalog: vi.fn().mockResolvedValue({
    entries: [0, 4].map((variant) => ({
      id: variant === 0 ? '10001' : '10004',
      category: 0,
      name: { zh: variant === 0 ? '原套妆容' : '满进妆容', en: 'Makeup' },
      image: '/makeup.png',
      quality: 5,
      variant,
      version: '2.10',
      obtainType: null,
      sourceDetails: []
    })),
    parts: [],
    relations: new Map(),
    relatedOutfits: []
  })
}))
vi.mock('../../src/utils/outfit/outfitText', () => ({
  loadOutfitText: vi.fn().mockResolvedValue({})
}))
it('shows unknown ownership without wardrobe records and actual ownership after import', async () => {
  const detail: WardrobeEntry = {
    id: '1001',
    kind: 'outfit',
    name: { zh: 'Test', en: 'Test' },
    quality: 5,
    variant: 0,
    category: 0,
    familyRootId: null,
    style: null,
    labels: [],
    obtainType: null,
    version: null,
    sourceDetails: [],
    image: '/outfit.png',
    parts: ['1002', '1003']
  }
  const wrapper = mount(WardrobeOutfitDialog, {
    props: {
      detail,
      catalog: { entries: [detail], byId: new Map([[detail.id, detail]]) },
      snapshot: emptyWardrobe(),
      language: 'en'
    },
    global: { stubs: { Teleport: true, Transition: true } }
  })
  expect(wrapper.findAll('.wardrobe-part-state').map((node) => node.text())).toEqual([
    'Unknown',
    'Unknown'
  ])
  expect(wrapper.get('.wardrobe-suit-message').text()).toContain('Unknown')
  expect(wrapper.find('.wardrobe-suit-progress').exists()).toBe(false)
  expect(wrapper.text()).not.toContain('Not owned')
  await wrapper.setProps({
    snapshot: {
      entries: { '1002': { owned: true, source: 'pearpal' } },
      unknownSuitIds: [],
      updatedAt: '2026-10-17T00:00:00Z'
    }
  })
  await flushPromises()
  expect(wrapper.findAll('.wardrobe-part-state').map((node) => node.text())).toEqual([
    'Owned',
    'Not owned'
  ])
  expect(wrapper.get('.wardrobe-suit-progress').text()).toContain('1/2')
  await wrapper.setProps({ snapshot: emptyWardrobe() })
  expect(wrapper.get('.wardrobe-suit-message').text()).toContain('Unknown')
  expect(wrapper.find('.wardrobe-suit-progress').exists()).toBe(false)
  wrapper.unmount()
})

it('opens the matching makeup, preserves the outfit, and follows variant changes', async () => {
  const detail: WardrobeEntry = {
    id: '1001',
    kind: 'outfit',
    name: { zh: '测试套装', en: 'Test' },
    quality: 5,
    variant: 0,
    category: 0,
    familyRootId: null,
    style: null,
    labels: [],
    obtainType: null,
    version: null,
    sourceDetails: [],
    image: '/outfit.png',
    parts: []
  }
  const wrapper = mount(WardrobeOutfitDialog, {
    props: { detail, catalog: null, snapshot: emptyWardrobe(), language: 'zh' },
    global: { stubs: { Teleport: true, Transition: true } }
  })
  try {
    await flushPromises()
    expect(wrapper.find('.wardrobe-suit-copy h3').exists()).toBe(false)
    await wrapper.get('.wardrobe-makeup-link').trigger('click')
    await flushPromises()
    expect(wrapper.get('#makeup-detail-title').text()).toBe('原套妆容')
    expect(wrapper.find('.wardrobe-dialog').exists()).toBe(true)
    expect(wrapper.get('.makeup-detail-overlay').attributes('style')).toContain('223')
    await wrapper.get('.makeup-detail-header button').trigger('click')
    await flushPromises()
    expect(wrapper.find('.makeup-detail-dialog').exists()).toBe(false)
    expect(wrapper.get('#wardrobe-dialog-title').text()).toBe('测试套装')
    await wrapper.setProps({ detail: { ...detail, id: '100104', variant: 4 } })
    await flushPromises()
    await wrapper.get('.wardrobe-makeup-link').trigger('click')
    await flushPromises()
    expect(wrapper.get('#makeup-detail-title').text()).toBe('满进妆容')
    await wrapper.setProps({ detail: { ...detail, id: '9999' } })
    await flushPromises()
    expect(wrapper.find('.makeup-detail-dialog').exists()).toBe(false)
    expect(wrapper.find('.wardrobe-makeup-link').exists()).toBe(false)
    expect(wrapper.get('.wardrobe-suit-copy h3').text()).toBe('测试套装')
  } finally {
    wrapper.unmount()
  }
})
