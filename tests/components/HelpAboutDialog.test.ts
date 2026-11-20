import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import HelpAboutDialog from '../../src/components/HelpAboutDialog.vue'
import { helpAboutZh, helpAboutEn } from '../../src/i18n/messages/helpAbout'
const messages = { zh: { helpAbout: helpAboutZh }, en: { helpAbout: helpAboutEn } }

const wrappers: Array<ReturnType<typeof mount>> = []
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

function create(language: 'zh' | 'en', compact: boolean, visible = true) {
  const wrapper = mount(HelpAboutDialog, {
    attachTo: document.body,
    props: { visible, compact, messages: messages[language].helpAbout }
  })
  wrappers.push(wrapper)
  return wrapper
}

describe('device-specific help', () => {
  it.each(['zh', 'en'] as const)(
    'shows desktop tutorials and mouse/keyboard groups in %s',
    (language) => {
      create(language, false)
      const content = messages[language].helpAbout.desktop
      expect(
        [...document.querySelectorAll('.help-about-feature h4')].map((node) => node.textContent)
      ).toEqual(content.features.map((feature) => feature.title))
      expect(
        [...document.querySelectorAll('.help-about-tutorial-grid h4')].map(
          (node) => node.textContent
        )
      ).toEqual(content.tutorialSections.map((section) => section.title))
      expect(
        [...document.querySelectorAll('.help-about-shortcuts h3')].map((node) => node.textContent)
      ).toEqual(content.operationSections.map((section) => section.title))
      expect(document.querySelector('.help-about-shortcuts.is-touch')).toBeNull()
      expect(content.features.some((feature) => feature.icon === 'home')).toBe(true)
      expect(content.features.some((feature) => feature.icon === 'resonance')).toBe(true)
      expect(content.features.some((feature) => feature.icon === 'backup')).toBe(true)
    }
  )

  it.each(['zh', 'en'] as const)(
    'shows phone workflows and touch instructions in %s',
    (language) => {
      create(language, true)
      const content = messages[language].helpAbout.mobile
      expect(
        [...document.querySelectorAll('.help-about-feature h4')].map((node) => node.textContent)
      ).toEqual(content.features.map((feature) => feature.title))
      expect(
        [...document.querySelectorAll('.help-about-tutorial-grid h4')].map(
          (node) => node.textContent
        )
      ).toEqual(content.tutorialSections.map((section) => section.title))
      expect(
        [...document.querySelectorAll('.help-about-shortcuts h3')].map((node) => node.textContent)
      ).toEqual(content.operationSections.map((section) => section.title))
      expect(content.operationSections.map((section) => section.icon)).toEqual(['touch'])
      expect(document.querySelectorAll('.help-about-shortcuts.is-touch section')).toHaveLength(1)
      expect(document.querySelector('.help-about-shortcuts')!.textContent).not.toContain('Ctrl+V')
      expect(document.querySelector('.help-about-tutorial-grid')!.textContent).not.toContain(
        language === 'zh' ? '通过左侧导航' : 'Use the left navigation'
      )
      expect(
        content.features.some((feature) => feature.icon === 'images' || feature.icon === 'cleanup')
      ).toBe(false)
    }
  )

  it('switches layout and language while keeping the same help panel open', async () => {
    const wrapper = create('zh', false)
    const panel = document.querySelector('.help-about-panel')
    await wrapper.setProps({ compact: true })
    expect(document.querySelector('.help-about-panel')).toBe(panel)
    expect(document.querySelector('.help-about-shortcuts h3')!.textContent).toBe('触摸操作')
    await wrapper.setProps({ messages: messages.en.helpAbout })
    expect(document.querySelector('.help-about-shortcuts h3')!.textContent).toBe('Touch controls')
    expect(document.querySelector('.help-about-header h2')!.textContent).toBe(
      'Help and introduction'
    )
    await wrapper.setProps({ compact: false })
    expect(
      [...document.querySelectorAll('.help-about-shortcuts h3')].map((node) => node.textContent)
    ).toEqual(['Mouse controls', 'Keyboard shortcuts'])
    expect(wrapper.emitted('close')).toBeUndefined()
  })

  it('preserves focus trapping and returns focus to the opener after closing', async () => {
    const opener = document.createElement('button')
    document.body.append(opener)
    const wrapper = create('zh', true, false)
    opener.focus()
    await wrapper.setProps({ visible: true })
    await flushPromises()
    const close = document.querySelector<HTMLButtonElement>('.help-about-header button')!
    const confirm = document.querySelector<HTMLButtonElement>('.help-about-footer button')!
    for (const button of [close, confirm])
      vi.spyOn(button, 'getClientRects').mockReturnValue([{}] as unknown as DOMRectList)
    expect(document.activeElement).toBe(close)
    const shiftTab = new KeyboardEvent('keydown', {
      key: 'Tab',
      shiftKey: true,
      bubbles: true,
      cancelable: true
    })
    close.dispatchEvent(shiftTab)
    expect(shiftTab.defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(confirm)
    const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
    confirm.dispatchEvent(tab)
    expect(tab.defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(close)
    close.click()
    expect(wrapper.emitted('close')).toHaveLength(1)
    await wrapper.setProps({ visible: false })
    expect(document.activeElement).toBe(opener)
  })

  it('closes through confirm, Escape or the backdrop, but not a content click', async () => {
    const wrapper = create('en', false)
    await flushPromises()
    document.querySelector<HTMLElement>('.help-about-panel')!.click()
    expect(wrapper.emitted('close')).toBeUndefined()
    document.querySelector<HTMLButtonElement>('.help-about-footer button')!.click()
    document.activeElement!.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    )
    document.querySelector<HTMLElement>('.help-about-dialog')!.click()
    expect(wrapper.emitted('close')).toHaveLength(3)
  })

  it('keeps translated device content complete and excludes obsolete phone instructions', () => {
    for (const device of ['desktop', 'mobile'] as const) {
      const zh = messages.zh.helpAbout[device],
        en = messages.en.helpAbout[device]
      expect(zh.features.map((feature) => feature.icon)).toEqual(
        en.features.map((feature) => feature.icon)
      )
      expect(zh.tutorialSections.map((section) => section.items.length)).toEqual(
        en.tutorialSections.map((section) => section.items.length)
      )
      expect(zh.operationSections.map((section) => section.icon)).toEqual(
        en.operationSections.map((section) => section.icon)
      )
      expect(zh.notes.length).toBe(en.notes.length)
    }
    const phoneCopy = JSON.stringify(messages.zh.helpAbout.mobile)
    expect(phoneCopy).not.toContain('上下移动')
    expect(phoneCopy).not.toContain('卡片右上角菜单')
    expect(phoneCopy).toContain('清除数据')
    expect(phoneCopy).toContain('永久删除当前浏览器中的全部方案')
    expect(phoneCopy).toContain('相机参数页的图片比例固定')
  })
})
