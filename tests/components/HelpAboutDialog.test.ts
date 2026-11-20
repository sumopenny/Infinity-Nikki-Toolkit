import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import HelpAboutDialog from '../../src/components/HelpAboutDialog.vue'
import { helpAboutZh, helpAboutEn } from '../../src/i18n/messages/helpAbout'
import { topBarZh, topBarEn } from '../../src/i18n/messages/topBar'

const messages = { zh: helpAboutZh, en: helpAboutEn }
const wrappers: Array<ReturnType<typeof mount>> = []

afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

function create(language: 'zh' | 'en', compact: boolean, visible = true) {
  const wrapper = mount(HelpAboutDialog, {
    attachTo: document.body,
    props: { visible, compact, messages: messages[language] }
  })
  wrappers.push(wrapper)
  return wrapper
}

function helpBody() {
  return document.querySelector<HTMLElement>('.help-about-body')!
}

function tasks() {
  return [...helpBody().querySelectorAll<HTMLButtonElement>('button[aria-expanded]')]
}

function details(button: HTMLButtonElement) {
  return document.getElementById(button.getAttribute('aria-controls')!)!
}

function operationHeadings() {
  return [...helpBody().querySelectorAll('.help-about-operations h3')].map((heading) =>
    heading.textContent?.trim()
  )
}

function press(element: HTMLElement, key: string, shiftKey = false) {
  const event = new KeyboardEvent('keydown', { key, shiftKey, bubbles: true, cancelable: true })
  element.dispatchEvent(event)
  return event
}

describe('device-specific help', () => {
  it.each(['zh', 'en'] as const)(
    'starts desktop help in %s with mouse and keyboard rows',
    (language) => {
      create(language, false)
      expect(helpBody().firstElementChild?.className).toBe('help-about-operations')
      expect(operationHeadings()).toEqual(
        language === 'zh' ? ['鼠标操作', '快捷键'] : ['Mouse controls', 'Keyboard shortcuts']
      )
      expect([...document.querySelectorAll('kbd')].map((key) => key.textContent)).toEqual([
        '←',
        '→',
        'Esc',
        'Enter',
        language === 'zh' ? '空格' : 'Space',
        'Ctrl',
        'V',
        'Delete'
      ])
      expect(tasks()).toHaveLength(7)
      expect(tasks()[0]?.textContent).toContain(
        language === 'zh' ? '打开游戏相册' : 'Open my game album'
      )
      expect(details(tasks()[0]!).textContent).toContain(
        language === 'zh' ? '兼容打开（只读）' : 'Compatibility open (read-only)'
      )
      expect(details(tasks()[4]!).textContent).toContain(
        language === 'zh' ? '自动备份' : 'Auto backup'
      )
      expect(tasks().every((button) => button.getAttribute('aria-expanded') === 'false')).toBe(true)
    }
  )

  it.each(['zh', 'en'] as const)(
    'starts compact help in %s with gestures and mobile paths',
    (language) => {
      create(language, true)
      expect(helpBody().firstElementChild?.className).toBe('help-about-operations')
      expect(operationHeadings()).toEqual([language === 'zh' ? '手势操作' : 'Touch gestures'])
      expect(helpBody().querySelectorAll('.help-about-operation')).toHaveLength(5)
      expect(helpBody().querySelector('kbd')).toBeNull()
      expect(tasks()).toHaveLength(6)
      expect(details(tasks()[0]!).textContent).toContain(
        language === 'zh' ? '底部导航' : 'Bottom navigation'
      )
      expect(details(tasks()[1]!).textContent).toContain(
        language === 'zh' ? '工具 → 参数/搭配码解析' : 'Tools → Parameter / outfit-code parser'
      )
      expect(details(tasks()[0]!).textContent).toContain(
        language === 'zh' ? '⋯ → 搭配总结' : '⋯ → Outfit summary'
      )
      expect(details(tasks()[3]!).textContent).toContain(
        language === 'zh' ? '⋯ → 登录' : '⋯ → Log in'
      )
      expect(details(tasks()[4]!).textContent).toContain(
        language === 'zh' ? '导航栏样式' : 'Navigation style'
      )
      const install = tasks().at(-1)!
      expect(install.textContent?.trim()).toBe(language === 'zh' ? '安装应用' : 'Install the app')
      expect(details(install).textContent).toContain(
        language === 'zh' ? '手机主屏幕' : 'home screen'
      )
    }
  )

  it('opens one answer at a time and makes collapsed answers inert', async () => {
    create('zh', true)
    const [save, camera] = tasks()
    expect(details(save!).hasAttribute('inert')).toBe(true)
    save!.click()
    await flushPromises()
    expect(details(save!).classList.contains('expanded')).toBe(true)
    expect(details(save!).hasAttribute('inert')).toBe(false)

    camera!.click()
    await flushPromises()
    expect(save!.getAttribute('aria-expanded')).toBe('false')
    expect(details(save!).classList.contains('expanded')).toBe(false)
    expect(details(save!).hasAttribute('inert')).toBe(true)
    expect(camera!.getAttribute('aria-expanded')).toBe('true')
    expect(details(camera!).classList.contains('expanded')).toBe(true)

    camera!.click()
    await flushPromises()
    expect(tasks().every((button) => button.getAttribute('aria-expanded') === 'false')).toBe(true)
  })

  it('keeps the expanded topic when the language changes and resets it on reopening', async () => {
    const wrapper = create('zh', true)
    const save = tasks()[0]!
    save.click()
    await flushPromises()
    expect(save.getAttribute('aria-expanded')).toBe('true')
    helpBody().scrollTop = 120

    await wrapper.setProps({ messages: helpAboutEn })
    expect(tasks()[0]).toBe(save)
    expect(save.getAttribute('aria-expanded')).toBe('true')
    expect(save.textContent).toContain('Save an outfit or home scheme')
    expect(helpBody().scrollTop).toBe(120)

    await wrapper.setProps({ visible: false })
    await wrapper.setProps({ visible: true })
    expect(tasks()[0]?.getAttribute('aria-expanded')).toBe('false')
    expect(helpBody().scrollTop).toBe(0)
  })

  it('switches layout in the same open dialog and resets its scroll and focus', async () => {
    const wrapper = create('zh', false)
    await flushPromises()
    const panel = document.querySelector('.help-about-panel')
    const album = tasks()[0]!
    album.focus()
    album.click()
    helpBody().scrollTop = 120

    await wrapper.setProps({ compact: true })
    expect(document.querySelector('.help-about-panel')).toBe(panel)
    expect(operationHeadings()).toEqual(['手势操作'])
    expect(helpBody().scrollTop).toBe(0)
    expect(tasks().every((button) => button.getAttribute('aria-expanded') === 'false')).toBe(true)
    expect(document.activeElement).toBe(document.querySelector('.help-about-header button'))
    expect(wrapper.emitted('close')).toBeUndefined()
  })

  it('keeps keyboard focus inside the dialog and returns it to the opener', async () => {
    const opener = document.createElement('button')
    document.body.append(opener)
    const wrapper = create('zh', true, false)
    opener.focus()
    await wrapper.setProps({ visible: true })
    await flushPromises()
    const close = document.querySelector<HTMLButtonElement>('.help-about-header button')!
    const last = tasks().at(-1)!
    for (const button of [close, ...tasks()]) {
      vi.spyOn(button, 'getClientRects').mockReturnValue([{}] as unknown as DOMRectList)
    }
    expect(document.activeElement).toBe(close)
    expect(press(close, 'Tab', true).defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(last)
    expect(press(last, 'Tab').defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(close)
    expect(press(close, 'Escape').defaultPrevented).toBe(true)
    expect(wrapper.emitted('close')).toHaveLength(1)
    await wrapper.setProps({ visible: false })
    expect(document.activeElement).toBe(opener)
  })

  it('closes from the header or backdrop and uses the same title as the More menu', async () => {
    const wrapper = create('en', false)
    await flushPromises()
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!
    const title = document.getElementById(dialog.getAttribute('aria-labelledby')!)
    expect(title?.textContent?.trim()).toBe('Help')
    expect(helpAboutEn.title).toBe(topBarEn.helpAbout)
    expect(helpAboutZh.title).toBe(topBarZh.helpAbout)
    helpBody().click()
    expect(wrapper.emitted('close')).toBeUndefined()
    document.querySelector<HTMLButtonElement>('.help-about-header button')!.click()
    dialog.click()
    expect(wrapper.emitted('close')).toHaveLength(2)
  })
})
