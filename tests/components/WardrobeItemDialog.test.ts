import { getCatalogImageSource } from '../../src/utils/gongeo/catalogImage'
import { mount, DOMWrapper } from '@vue/test-utils'
import { expect, it, vi } from 'vitest'
import WardrobeItemDialog from '../../src/components/WardrobeItemDialog.vue'
import type { WardrobeEntry } from '../../src/utils/wardrobe/wardrobeCatalog'

it('衣橱详情在加载、失败、重试和切换部件时保留展示框', async () => {
  const item: WardrobeEntry = {
    id: '1020100001',
    kind: 'item',
    name: { zh: '测试发型', en: 'Test hair' },
    quality: 5,
    variant: 0,
    category: 10,
    familyRootId: null,
    style: null,
    labels: [],
    obtainType: null,
    version: null,
    sourceDetails: [],
    parts: [],
    image: 'https://example.test/items/icons/1020100001.png'
  }
  const wrapper = mount(WardrobeItemDialog, {
    props: { item, outfits: [], language: 'zh' },
    global: { stubs: { Teleport: true, Transition: true } }
  })
  try {
    const frame = wrapper.get('.outfit-detail-image-frame').element
    expect(wrapper.get('.outfit-detail-image-frame').attributes('aria-busy')).toBe('true')
    await wrapper.get('img').trigger('error')
    expect(wrapper.get('.outfit-detail-image-frame').element).toBe(frame)
    expect(wrapper.get('img').attributes('data-image-failed')).toBe('true')
    await wrapper.get('img').trigger('click')
    expect(wrapper.get('.outfit-detail-image-frame').attributes('aria-busy')).toBe('true')
    await wrapper.get('img').trigger('load')
    expect(wrapper.get('.outfit-detail-image-frame').element).toBe(frame)
    expect(wrapper.find('.outfit-detail-image-placeholder').exists()).toBe(false)
    await wrapper.setProps({
      item: { ...item, id: '1020100002', image: 'https://example.test/items/icons/1020100002.png' }
    })
    expect(wrapper.get('.outfit-detail-image-frame').attributes('aria-busy')).toBe('true')
    expect(wrapper.get('img').attributes('src')).toBe(getCatalogImageSource('item', '1020100002'))
  } finally {
    wrapper.unmount()
  }
})

it.each([false, true])(
  'switches item forms without claiming unknown ownership (mobile=%s)',
  async (compact) => {
    vi.stubGlobal('matchMedia', () => ({
      matches: compact,
      addEventListener() {},
      removeEventListener() {}
    }))
    const { loadWardrobeCatalog } = await import('../../src/utils/wardrobe/wardrobeCatalog')
    const catalog = await loadWardrobeCatalog()
    const original = catalog.entries.find(
      (entry) =>
        entry.kind === 'item' &&
        entry.variant === 0 &&
        catalog.entries.some(
          (other) =>
            other.kind === 'item' && other.familyRootId === entry.familyRootId && other.variant > 0
        )
    )!
    const evolved = catalog.entries.find(
      (entry) =>
        entry.kind === 'item' && entry.familyRootId === original.familyRootId && entry.variant > 0
    )!
    const wrapper = mount(WardrobeItemDialog, {
      props: { item: original, outfits: [], catalog, language: 'zh' },
      attachTo: document.body,
      global: { stubs: { Transition: true } }
    })
    try {
      const view = new DOMWrapper(document.body)
      const nav = view.get('.wardrobe-form-nav')
      expect(nav.element.closest('.wardrobe-detail-scroll')).toBe(
        view.get('.outfit-detail-content').element.parentElement
      )
      expect(nav.find('.form-label small').exists()).toBe(false)
      expect(nav.find('.wardrobe-form-owned').exists()).toBe(false)
      expect(nav.text()).not.toContain('已拥有')
      await wrapper.setProps({
        snapshot: {
          entries: Object.fromEntries(
            original.parts.map((id) => [id, { owned: true, source: 'pearpal' as const }])
          ),
          unknownSuitIds: [],
          updatedAt: '2026-10-27T00:00:00Z'
        }
      })
      expect(nav.findAll('.wardrobe-form-owned')).toHaveLength(1)
      expect(
        nav
          .get('button[aria-pressed="true"] .wardrobe-form-title')
          .find('.lucide-circle-check')
          .exists()
      ).toBe(true)
      expect(nav.find('.form-label small').exists()).toBe(false)
      const buttons = nav.findAll('button')
      const index = catalog.entries
        .filter((entry) => entry.kind === 'item' && entry.familyRootId === original.familyRootId)
        .sort((a, b) => a.variant - b.variant)
        .findIndex((entry) => entry.id === evolved.id)
      await buttons[index]!.trigger('click')
      expect(wrapper.emitted('selectForm')?.[0]).toEqual([evolved])
      const panel = view.get('.outfit-detail-panel').element
      await wrapper.setProps({ item: evolved })
      expect(view.get('.outfit-detail-panel').element).toBe(panel)
      expect(view.get('.outfit-detail-info').text()).toContain(evolved.name.zh)
      expect(view.get('.outfit-detail-image').attributes('src')).toBe(
        getCatalogImageSource('item', evolved.id)
      )
    } finally {
      wrapper.unmount()
      vi.unstubAllGlobals()
    }
  }
)

it('shows the item source beside the title, updates language and hides missing sources', async () => {
  const { loadWardrobeCatalog } = await import('../../src/utils/wardrobe/wardrobeCatalog')
  const catalog = await loadWardrobeCatalog()
  const item = catalog.entries.find((entry) => entry.kind === 'item' && entry.obtainType === 10007)!
  expect(item).toBeDefined()
  const wrapper = mount(WardrobeItemDialog, {
    props: { item, catalog, outfits: [], language: 'zh' },
    global: { stubs: { Teleport: true, Transition: true } }
  })
  try {
    const heading = wrapper.get('.outfit-detail-panel > header .outfit-detail-heading')
    expect(heading.get('h2').text()).toBe('部件详情')
    expect(heading.get('.wardrobe-detail-source').text()).toBe('唱诗蓝龙')
    await wrapper.setProps({ language: 'en' })
    expect(wrapper.get('.outfit-detail-heading .wardrobe-detail-source').text()).toBe(
      "Cadenceborn's Gift"
    )
    await wrapper.setProps({ item: { ...item, obtainType: null } })
    expect(wrapper.find('.outfit-detail-heading .wardrobe-detail-source').exists()).toBe(false)
  } finally {
    wrapper.unmount()
  }
})
