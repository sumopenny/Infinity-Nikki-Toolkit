import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, expect, it, vi } from 'vitest'
import TopBar from '../../src/components/TopBar.vue'
import { messages } from '../../src/i18n'

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

it('opens desktop menus on mouse hover and keeps the menu open across the gap', async () => {
  vi.useFakeTimers()
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {}
  }))
  const wrapper = mount(TopBar, {
    props: {
      directoryName: '',
      isLoading: false,
      isDeleting: false,
      hasAlbumDirectory: false,
      hasX6GameAuthorization: false,
      thumbnailMode: 'default',
      thumbnailModeOptions: [],
      themeMode: 'light',
      language: 'zh',
      messages: messages.zh.topBar
    },
    global: { stubs: { Teleport: true, Transition: true, LikeCounter: true } }
  })
  try {
    const tools = wrapper.get('.tools-menu-button')
    await tools.trigger('pointerenter', { pointerType: 'touch' })
    expect(tools.attributes('aria-expanded')).toBe('false')
    await tools.trigger('pointerenter', { pointerType: 'mouse' })
    await flushPromises()
    expect(tools.attributes('aria-expanded')).toBe('true')
    await tools.trigger('click')
    await tools.trigger('click')
    expect(tools.attributes('aria-expanded')).toBe('true')
    await tools.trigger('pointerleave', { pointerType: 'mouse' })
    await vi.advanceTimersByTimeAsync(80)
    await wrapper.get('.header-dropdown').trigger('pointerenter', { pointerType: 'mouse' })
    await vi.advanceTimersByTimeAsync(120)
    expect(tools.attributes('aria-expanded')).toBe('true')
    await wrapper.get('.more-menu-button').trigger('pointerenter', { pointerType: 'mouse' })
    await flushPromises()
    expect(tools.attributes('aria-expanded')).toBe('false')
    expect(wrapper.get('.more-menu-button').attributes('aria-expanded')).toBe('true')
    await wrapper.get('.header-dropdown').trigger('pointerleave', { pointerType: 'mouse' })
    await vi.advanceTimersByTimeAsync(119)
    expect(wrapper.find('.header-dropdown').exists()).toBe(true)
    await vi.advanceTimersByTimeAsync(1)
    expect(wrapper.find('.header-dropdown').exists()).toBe(false)
    await tools.trigger('click')
    await flushPromises()
    expect(tools.attributes('aria-expanded')).toBe('true')
    await tools.trigger('click')
    expect(tools.attributes('aria-expanded')).toBe('false')

    const backup = wrapper.get('.auto-backup-button')
    await backup.trigger('pointerenter', { pointerType: 'touch' })
    expect(backup.attributes('aria-expanded')).toBe('false')
    await backup.trigger('pointerenter', { pointerType: 'mouse' })
    await vi.advanceTimersByTimeAsync(150)
    expect(backup.attributes('aria-expanded')).toBe('false')

    await backup.trigger('click')
    expect(backup.attributes('aria-expanded')).toBe('true')
    await backup.trigger('pointerleave', { pointerType: 'mouse' })
    await vi.advanceTimersByTimeAsync(150)
    expect(backup.attributes('aria-expanded')).toBe('true')
    await wrapper.get('.auto-backup-panel').trigger('pointerleave', { pointerType: 'mouse' })
    await vi.advanceTimersByTimeAsync(150)
    expect(backup.attributes('aria-expanded')).toBe('true')
    await backup.trigger('click')
    expect(backup.attributes('aria-expanded')).toBe('false')

    await backup.trigger('click')
    await wrapper.get('.auto-backup-close').trigger('click')
    expect(backup.attributes('aria-expanded')).toBe('false')
    await backup.trigger('click')
    await wrapper.get('.more-menu-button').trigger('pointerenter', { pointerType: 'mouse' })
    expect(backup.attributes('aria-expanded')).toBe('false')
    expect(wrapper.get('.more-menu-button').attributes('aria-expanded')).toBe('true')
    await backup.trigger('pointerenter', { pointerType: 'mouse' })
    expect(wrapper.get('.more-menu-button').attributes('aria-expanded')).toBe('true')
    await wrapper.get('.more-menu-button').trigger('pointerleave', { pointerType: 'mouse' })
    await backup.trigger('click')
    await vi.advanceTimersByTimeAsync(150)
    expect(wrapper.get('.more-menu-button').attributes('aria-expanded')).toBe('false')
    expect(backup.attributes('aria-expanded')).toBe('true')
    await backup.trigger('click')
    expect(backup.attributes('aria-expanded')).toBe('false')
  } finally {
    wrapper.unmount()
  }
})

it.each(['zh', 'en'] as const)(
  'offers all navigation styles only on mobile (%s)',
  async (language) => {
    vi.stubGlobal('matchMedia', () => ({
      matches: true,
      addEventListener() {},
      removeEventListener() {}
    }))
    const wrapper = mount(TopBar, {
      props: {
        directoryName: '',
        isLoading: false,
        isDeleting: false,
        hasAlbumDirectory: false,
        hasX6GameAuthorization: false,
        thumbnailMode: 'default',
        thumbnailModeOptions: [],
        themeMode: 'light',
        language,
        messages: messages[language].topBar,
        mobileNavStyle: 'docked'
      },
      global: { stubs: { Teleport: true, Transition: true, LikeCounter: true } }
    })
    try {
      await wrapper.get('.view-menu-button').trigger('click')
      await flushPromises()
      const buttons = wrapper.findAll('.mobile-nav-style-options button')
      expect(buttons).toHaveLength(2)
      expect(buttons[0].attributes('aria-checked')).toBe('true')
      expect(buttons[1].attributes('role')).toBe('menuitemradio')
      expect(buttons.every((button) => button.find('.radio-mark').exists())).toBe(true)
      await buttons[1].trigger('click')
      expect(wrapper.find('.mobile-nav-style-options').exists()).toBe(false)
      expect(wrapper.get('.view-menu-button').attributes('aria-expanded')).toBe('false')
      expect(wrapper.emitted('changeMobileNavStyle')?.at(-1)).toEqual(['capsule'])
      await wrapper.setProps({ mobileNavStyle: 'capsule' })
      await wrapper.get('.view-menu-button').trigger('click')
      await flushPromises()
      expect(
        wrapper.findAll('.mobile-nav-style-options button')[1].attributes('aria-checked')
      ).toBe('true')
      expect(
        wrapper.findAll('.mobile-nav-style-options button')[0].attributes('aria-checked')
      ).toBe('false')
    } finally {
      wrapper.unmount()
    }
  }
)

it.each([false, true])('offers material styles on desktop/mobile: compact=%s', async (compact) => {
  vi.stubGlobal('matchMedia', () => ({
    matches: compact,
    addEventListener() {},
    removeEventListener() {}
  }))
  const wrapper = mount(TopBar, {
    props: {
      directoryName: '',
      isLoading: false,
      isDeleting: false,
      hasAlbumDirectory: false,
      hasX6GameAuthorization: false,
      thumbnailMode: 'default',
      thumbnailModeOptions: [],
      themeMode: 'light',
      language: 'en',
      messages: messages.en.topBar,
      surfaceStyle: 'frosted'
    },
    global: { stubs: { Teleport: true, Transition: true, LikeCounter: true } }
  })
  try {
    await wrapper.get('.view-menu-button').trigger('click')
    await flushPromises()
    const choices = wrapper.findAll('.surface-style-options button')
    expect(choices.map((button) => button.text())).toEqual(['Opaque', 'Frosted', 'Liquid glass'])
    expect(choices[1].attributes('aria-checked')).toBe('true')
    expect(wrapper.find('.mobile-nav-style-options').exists()).toBe(compact)
    await choices[2].trigger('click')
    expect(wrapper.emitted('changeSurfaceStyle')?.at(-1)).toEqual(['glass'])
    expect(wrapper.get('.view-menu-button').attributes('aria-expanded')).toBe('false')
  } finally {
    wrapper.unmount()
  }
})
