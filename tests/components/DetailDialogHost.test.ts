import { mount } from '@vue/test-utils'
import { expect, it } from 'vitest'
import DetailDialogHost from '../../src/components/DetailDialogHost.vue'
import type { DetailPage } from '../../src/utils/detailNavigation'
import { emptyWardrobe } from '../../src/utils/wardrobe/wardrobeStorage'
it('uses one view across repeated links and returns through history on close', async () => {
  const makeup = {
    id: 'm',
    category: 0,
    name: { zh: 'Makeup', en: 'Makeup' },
    image: '/makeup.png',
    quality: 5,
    variant: 0,
    version: '2.10',
    obtainType: null,
    sourceDetails: []
  }
  const outfit = { id: 'o', kind: 'outfit', name: { zh: 'Outfit', en: 'Outfit' } }
  const data = { entries: [makeup], parts: [], relations: new Map(), relatedOutfits: [] }
  const initial = { kind: 'makeup', detail: makeup, data } as DetailPage
  const wrapper = mount(DetailDialogHost, {
    props: { initial, language: 'zh' },
    global: { stubs: { MakeupDetailView: true, WardrobeOutfitView: true } }
  })
  for (let i = 0; i < 10; i++) {
    wrapper
      .findComponent({ name: 'MakeupDetailView' })
      .vm.$emit('openOutfit', outfit, null, emptyWardrobe())
    await wrapper.vm.$nextTick()
    expect(wrapper.findComponent({ name: 'MakeupDetailView' }).exists()).toBe(false)
    wrapper.findComponent({ name: 'WardrobeOutfitView' }).vm.$emit('openMakeup', makeup, data)
    await wrapper.vm.$nextTick()
    expect(wrapper.findComponent({ name: 'WardrobeOutfitView' }).exists()).toBe(false)
  }
  wrapper.findComponent({ name: 'MakeupDetailView' }).vm.$emit('close')
  await wrapper.vm.$nextTick()
  wrapper.findComponent({ name: 'WardrobeOutfitView' }).vm.$emit('close')
  await wrapper.vm.$nextTick()
  expect(wrapper.findComponent({ name: 'MakeupDetailView' }).exists()).toBe(true)
  wrapper.findComponent({ name: 'MakeupDetailView' }).vm.$emit('close')
  await wrapper.vm.$nextTick()
  expect(wrapper.emitted('close')).toHaveLength(1)
  wrapper.unmount()
})
