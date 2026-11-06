import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { messages } from '../../src/i18n'
import AlbumViewSwitcher from '../../src/components/AlbumViewSwitcher.vue'

describe('album view controls', () => {
  it('renders the four separate entries in the required order', async () => {
    const wrapper = mount(AlbumViewSwitcher, {
      props: {
        activeView: 'all',
        allCount: 12,
        outfitsCount: 4,
        homeSchemesCount: 5,
        resonanceLabel: '共鸣',
        favoriteCount: 3,
        trashCount: 2,
        outfitLabel: '搭配码',
        disabled: false,
        messages: messages.zh.viewNav
      }
    })

    expect(wrapper.findAll('button').map((button) => button.text())).toEqual([
      '全部照片12 张',
      '搭配码4 张',
      '家园方案5 个方案',
      '共鸣',
      '参数与收藏3 张',
      '最近删除2 张'
    ])
    await wrapper.findAll('button')[5].trigger('click')
    expect(wrapper.emitted('changeView')).toEqual([['trash']])
  })

  it('turns the resonance arrow right and opens the submenu on hover', async () => {
    const wrapper = mount(AlbumViewSwitcher, {
      props: {
        activeView: 'all',
        allCount: 0,
        outfitsCount: 0,
        homeSchemesCount: 0,
        resonanceLabel: '共鸣',
        favoriteCount: 0,
        trashCount: 0,
        outfitLabel: '搭配码',
        disabled: false,
        messages: messages.zh.viewNav
      }
    })

    const resonanceItem = wrapper.findAll('.album-view-item')[3]
    const arrow = resonanceItem.find('.resonance-nav-arrow')
    expect(arrow.classes()).not.toContain('is-open')
    await resonanceItem.trigger('pointerenter', { pointerType: 'mouse' })
    expect(arrow.classes()).toContain('is-open')
    expect(resonanceItem.find('.album-view-button').attributes('aria-expanded')).toBe('true')
    expect(resonanceItem.find('[role="menu"]').exists()).toBe(true)
    // 悬停后点击入口应继续展开，不能直接跳转或将菜单关闭。
    await resonanceItem.find('.album-view-button').trigger('click')
    expect(wrapper.emitted('changeView')).toBeUndefined()
    expect(resonanceItem.find('[role="menu"]').exists()).toBe(true)
    await resonanceItem.find('[role="menuitem"]').trigger('click')
    expect(wrapper.emitted('changeView')).toEqual([['resonance']])
    // 无悬停时，点击入口也能展开菜单并选择衣橱。
    await resonanceItem.find('.album-view-button').trigger('click')
    expect(resonanceItem.find('.album-view-button').attributes('aria-expanded')).toBe('true')
    await resonanceItem.findAll('[role="menuitem"]')[1]!.trigger('click')
    expect(wrapper.emitted('changeView')).toEqual([['resonance'], ['wardrobe']])
    wrapper.unmount()
  })
})

it('localizes the resonance submenu and updates it when the language changes', async () => {
  const wrapper = mount(AlbumViewSwitcher, {
    props: {
      activeView: 'all',
      allCount: 0,
      outfitsCount: 0,
      homeSchemesCount: 0,
      favoriteCount: 0,
      trashCount: 0,
      outfitLabel: 'Outfits',
      disabled: false,
      messages: messages.en.viewNav
    }
  })
  try {
    const item = wrapper.findAll('.album-view-item')[3]!
    await item.trigger('pointerenter', { pointerType: 'mouse' })
    expect(item.findAll('[role="menuitem"]').map((button) => button.text())).toEqual([
      'Resonance records',
      'Personal wardrobe'
    ])
    await wrapper.setProps({ messages: messages.zh.viewNav })
    expect(item.findAll('[role="menuitem"]').map((button) => button.text())).toEqual([
      '共鸣记录',
      '个人衣橱'
    ])
    await item.findAll('[role="menuitem"]')[1]!.trigger('click')
    expect(wrapper.emitted('changeView')).toEqual([['wardrobe']])
  } finally {
    wrapper.unmount()
  }
})
