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
      '主页',
      '我的相册12 张',
      '搭配码4 张',
      '家园方案5 个方案',
      '相机参数3 张',
      '共鸣',
      '数据备份'
    ])
    await wrapper.get('.backup-nav').trigger('click')
    expect(wrapper.emitted('changeView')).toEqual([['backup']])
    await wrapper.setProps({ backupStatus: { state: 'warning', label: '备份目录需要重新授权' } })
    const backup = wrapper.get('.backup-nav')
    expect(backup.get('.backup-nav-status').attributes('data-state')).toBe('warning')
    expect(backup.attributes('title')).toBe('备份目录需要重新授权')
    expect(backup.attributes('aria-label')).toBe('数据备份：备份目录需要重新授权')
    expect(backup.findAll('button')).toHaveLength(0)
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

    const resonanceItem = wrapper
      .findAll('.album-view-item')
      .find((item) => item.find('.resonance-nav-arrow').exists())!
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
    const item = wrapper
      .findAll('.album-view-item')
      .find((item) => item.find('.resonance-nav-arrow').exists())!!
    await item.trigger('pointerenter', { pointerType: 'mouse' })
    expect(item.findAll('[role="menuitem"]').map((button) => button.text())).toEqual([
      'Resonance records',
      'Personal wardrobe',
      'Makeup catalog',
      'Evolution animations'
    ])
    await wrapper.setProps({ messages: messages.zh.viewNav })
    expect(item.findAll('[role="menuitem"]').map((button) => button.text())).toEqual([
      '共鸣记录',
      '个人衣橱',
      '妆容图鉴',
      '满进动画'
    ])
    await item.findAll('[role="menuitem"]')[1]!.trigger('click')
    expect(wrapper.emitted('changeView')).toEqual([['wardrobe']])
  } finally {
    wrapper.unmount()
  }
})
