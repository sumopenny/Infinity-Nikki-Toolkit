import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import EvolutionAnimations from '../../src/components/EvolutionAnimations.vue'
import {
  animations,
  animationForOutfit,
  animationWatchUrl
} from '../../src/utils/evolutionAnimations'
import outfits from '../../src/data/gongeo/outfits.json'
import type { WardrobeEntry } from '../../src/utils/wardrobe/wardrobeCatalog'

describe('evolution animations', () => {
  it.each([true, false])(
    'scrolls to the player only for a detail entry, loadOnEntry=%s',
    async (loadOnEntry) => {
      const wrapper = mount(EvolutionAnimations, {
        props: { selectedPage: 22, loadOnEntry, language: 'zh' }
      })
      const player = wrapper.get('.animation-player').element as HTMLElement
      const scroll = vi.fn()
      player.scrollIntoView = scroll
      await flushPromises()
      if (loadOnEntry) {
        expect(scroll).toHaveBeenCalledWith({ block: 'start', behavior: 'auto' })
      } else {
        expect(scroll).not.toHaveBeenCalled()
      }
      wrapper.unmount()
    }
  )

  it('ships 43 unique pages linked to real outfit families in numeric version order', () => {
    expect(animations).toHaveLength(43)
    expect(new Set(animations.map((item) => item.page)).size).toBe(43)
    expect(new Set(animations.map((item) => item.cid)).size).toBe(43)
    const roots = outfits.map((row) => String((row[0] as number[])[0]))
    for (const item of animations) {
      expect(roots).toContain(item.outfitId)
      expect(animationWatchUrl(item)).toContain(`?p=${item.page}`)
      expect(
        animationForOutfit({
          id: item.outfitId + '04',
          familyRootId: item.outfitId
        } as WardrobeEntry)
      ).toEqual(item)
    }
    expect(animations[0].version).toBe('2.11')
    expect(animations.at(-1)?.version).toBe('1.0')
    expect(
      animationForOutfit({ id: 'unknown', familyRootId: null } as WardrobeEntry)
    ).toBeUndefined()
  })
  it('loads one player on demand, preserves it on repeated clicks, and returns to a cover after remount', async () => {
    const props = { selectedPage: 43, loadOnEntry: false, language: 'zh' as const }
    const wrapper = mount(EvolutionAnimations, { props })
    expect(wrapper.findAll('.animation-card')).toHaveLength(43)
    expect(wrapper.find('iframe').exists()).toBe(false)
    await wrapper.find('.animation-card > a').trigger('click')
    expect(wrapper.find('iframe').exists()).toBe(false)
    await wrapper.find('.animation-cover').trigger('click')
    const player = wrapper.get('iframe').element
    await wrapper.find('.animation-card button').trigger('click')
    expect(wrapper.get('iframe').element).toBe(player)
    await wrapper.setProps({ selectedPage: 1 })
    expect(wrapper.findAll('iframe')).toHaveLength(1)
    expect(wrapper.get('iframe').attributes('src')).toContain('p=1&autoplay=0')
    wrapper.unmount()
    const returned = mount(EvolutionAnimations, { props: { ...props, selectedPage: 1 } })
    expect(returned.find('iframe').exists()).toBe(false)
    expect(returned.get('h2').text()).toBe(animations.find((item) => item.page === 1)?.name)
    returned.unmount()
  })
  it('loads from a detail entry and keeps controls when thumbnails fail', async () => {
    const wrapper = mount(EvolutionAnimations, {
      props: { selectedPage: 22, loadOnEntry: true, language: 'en' }
    })
    expect(wrapper.get('iframe').attributes('src')).toContain('p=22&autoplay=0')
    await wrapper.get('.animation-card img').trigger('error')
    expect(wrapper.findAll('.animation-card')).toHaveLength(43)
    expect(wrapper.get('.animation-card button').text()).toContain(animations[0].nameEn)
    expect(wrapper.find('.animation-card a').exists()).toBe(true)
    wrapper.unmount()
  })
})
