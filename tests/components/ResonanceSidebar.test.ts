import { mount as vueMount, DOMWrapper, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import ResonanceSidebar from '../../src/components/ResonanceSidebar.vue'
import type { ResonanceRecord } from '../../src/utils/resonance/resonanceTypes'

const mounted: VueWrapper[] = []
const mount: typeof vueMount = ((...args: Parameters<typeof vueMount>) => {
  const wrapper = vueMount(...args)
  mounted.push(wrapper)
  return wrapper
}) as typeof vueMount
afterEach(() => {
  mounted.splice(0).forEach((wrapper) => wrapper.unmount())
})
const menuOptions = () =>
  [...document.querySelectorAll('.resonance-options-menu [role="menuitemradio"]')].map(
    (node) => new DOMWrapper(node)
  )
// 名称与星级是独立元素；按条目顺序校验两者，保留排序及本地化覆盖。
const sidebarEntries = (wrapper: VueWrapper) =>
  wrapper
    .findAll('.resonance-sidebar-link')
    .map((link) => [
      link.get('.resonance-sidebar-outfit-name').text(),
      link.get('.resonance-sidebar-rarity').text()
    ])
function record(id: string, bannerId: string, rarity: 4 | 5): ResonanceRecord {
  return {
    id,
    bannerId,
    bannerName: { zh: '示例阁', en: 'Sample Banner' },
    bannerStartAt: '',
    outfitId: id,
    outfitName: { zh: `套装${id}`, en: `Outfit ${id}` },
    rarity,
    outfitImageUrl: `/outfit-${id}.png`,
    sets: [
      { setNumber: 1, parts: [], totalPulls: 0 },
      { setNumber: 2, parts: [], totalPulls: 0 }
    ]
  }
}

describe('ResonanceSidebar', () => {
  it('shows sorted thumbnails, localized outfit names and rarity, then emits the selected record', async () => {
    const wrapper = mount(ResonanceSidebar, {
      props: { records: [record('older', '1', 4), record('newer', '2', 5)], language: 'zh' }
    })

    const links = wrapper.findAll('.resonance-sidebar-link')
    expect(sidebarEntries(wrapper)).toEqual([
      ['套装newer', '5星'],
      ['套装older', '4星']
    ])
    expect(links[0].find('img').attributes()).toMatchObject({
      src: '/outfit-newer.png',
      alt: '',
      referrerpolicy: 'strict-origin-when-cross-origin'
    })
    await links[0].trigger('click')
    expect(wrapper.emitted('jumpToRecord')).toEqual([['newer']])

    await wrapper.setProps({ language: 'en' })
    expect(sidebarEntries(wrapper)).toEqual([
      ['Outfit newer', '5-star'],
      ['Outfit older', '4-star']
    ])
  })

  it('leaves the sidebar empty when there are no records', () => {
    const wrapper = mount(ResonanceSidebar, { props: { records: [], language: 'zh' } })
    expect(wrapper.find('.resonance-sidebar').exists()).toBe(false)
  })

  it('places banner order below the title and reverses the sidebar when changed', async () => {
    const wrapper = mount(ResonanceSidebar, {
      props: {
        records: [record('older', '1', 4), record('newer', '2', 5)],
        language: 'zh',
        bannerOrder: 'newest'
      }
    })

    expect(
      wrapper
        .find('.sidebar-section-title')
        .element.nextElementSibling?.classList.contains('resonance-sort-control')
    ).toBe(true)
    await wrapper.find('.resonance-sort-control > button').trigger('click')
    expect(menuOptions().map((option) => option.text())).toEqual([
      '最新优先',
      '最早优先',
      '全部展示',
      '只展示五星',
      '只展示四星'
    ])
    await menuOptions()[1].trigger('click')
    expect(wrapper.emitted('changeBannerOrder')).toEqual([['oldest']])

    await wrapper.setProps({ bannerOrder: 'oldest' })
    expect(sidebarEntries(wrapper)).toEqual([
      ['套装older', '4星'],
      ['套装newer', '5星']
    ])
    expect(wrapper.find('.resonance-sort-control > button').text()).toBe('最早优先')
  })

  it('filters the sidebar by rarity and keeps the filter menu available with no matches', async () => {
    const wrapper = mount(ResonanceSidebar, {
      props: { records: [record('four', '1', 4), record('five', '2', 5)], language: 'zh' }
    })
    await wrapper.find('.resonance-sort-control > button').trigger('click')
    await menuOptions()[3].trigger('click')
    expect(wrapper.emitted('changeRarityFilter')).toEqual([[5]])
    await wrapper.setProps({ rarityFilter: 5 })
    expect(sidebarEntries(wrapper)).toEqual([['套装five', '5星']])
    expect(wrapper.find('.resonance-sort-control > button').text()).toBe('5星 · 最新优先')

    await wrapper.setProps({ records: [record('four', '1', 4)] })
    expect(wrapper.find('.resonance-sidebar').exists()).toBe(true)
    expect(wrapper.findAll('.resonance-sidebar-link')).toHaveLength(0)
    expect(wrapper.text()).toContain('当前星级没有套装记录')
    await wrapper.find('.resonance-sort-control > button').trigger('click')
    await menuOptions()[2].trigger('click')
    expect(wrapper.emitted('changeRarityFilter')).toEqual([[5], ['all']])
  })
})
