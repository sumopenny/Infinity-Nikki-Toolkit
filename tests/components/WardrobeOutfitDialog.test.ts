import { flushPromises, mount } from '@vue/test-utils'
import { expect, it, vi } from 'vitest'
import WardrobeOutfitDialog from '../../src/components/WardrobeOutfitDialog.vue'
import { emptyWardrobe } from '../../src/utils/wardrobe/wardrobeStorage'
import type { WardrobeEntry } from '../../src/utils/wardrobe/wardrobeCatalog'
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
