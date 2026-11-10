import { afterEach, expect, it, vi } from 'vitest'
import {
  resonanceBookmarkScript,
  resonanceUserscript
} from '../../src/utils/resonance/resonanceScripts'

const run = () => new Function(resonanceUserscript())()
const result = () => document.getElementById('nikki-pearpal-cookie-result')!.shadowRoot!
afterEach(() => {
  document.body.innerHTML = ''
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

it.each(['myl.nuanpaper.com', 'pearpal.infoldgames.com'])(
  'copies page credentials on %s only after clicking, without a request',
  async (hostname) => {
    vi.stubGlobal('location', { hostname })
    vi.spyOn(document, 'cookie', 'get').mockReturnValue('momoToken=t; momoNid=i')
    document.body.innerHTML = '<div hidden>个人资料<div>UID:<!-- -->999</div></div>'
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { language: 'zh-CN', clipboard: { writeText } })
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    run()
    run()
    expect(document.querySelectorAll('button')).toHaveLength(1)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(writeText).not.toHaveBeenCalled()
    document.querySelector('button')!.click()
    await vi.waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(JSON.stringify({ roleid: '999', token: 't', id: 'i' }))
    )
    expect(fetchMock).not.toHaveBeenCalled()
  }
)

it.each([false, true])(
  'offers manual copy when clipboard is unavailable or rejects: %s',
  async (rejects) => {
    vi.stubGlobal('location', { hostname: 'myl.nuanpaper.com' })
    vi.spyOn(document, 'cookie', 'get').mockReturnValue('momoToken=t; momoNid=i')
    document.body.innerHTML = '<div hidden><div><span>UID：</span><span>\n456</span></div></div>'
    vi.stubGlobal('navigator', {
      language: 'en',
      clipboard: rejects ? { writeText: vi.fn().mockRejectedValue(new Error()) } : undefined
    })
    run()
    document.querySelector('button')!.click()
    await vi.waitFor(() =>
      expect(result().querySelector('h2')!.textContent).toBe('Could not copy automatically')
    )
    expect(result().querySelector('p:not(.privacy)')!.textContent).toContain('manually')
    const full = result().querySelector('textarea')!
    expect(full.hidden).toBe(true)
    result().querySelectorAll('button')[1]!.click()
    expect(full.value).toBe(JSON.stringify({ roleid: '456', token: 't', id: 'i' }))
    expect(full.readOnly).toBe(true)
    expect(full.selectionStart).toBe(0)
    expect(full.selectionEnd).toBe(full.value.length)
  }
)

it.each(['zh-CN', 'en'])(
  'masks fields, reveals and hides JSON, and copies the same snapshot: %s',
  async (language) => {
    vi.stubGlobal('location', { hostname: 'myl.nuanpaper.com' })
    const cookie = vi
      .spyOn(document, 'cookie', 'get')
      .mockReturnValue('momoToken=abcdd123456; momoNid=987321234')
    document.body.innerHTML = '<div hidden><div>UID: 124651234</div></div>'
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { language, clipboard: { writeText } })
    run()
    const trigger = document.getElementById('nikki-pearpal-cookie-button') as HTMLButtonElement
    trigger.click()
    await vi.waitFor(() =>
      expect(result().querySelector('h2')!.textContent).toContain(
        language === 'en' ? 'credentials copied' : '登录凭据已复制'
      )
    )
    const root = result()
    expect([...root.querySelectorAll('dd')].map((el) => el.textContent)).toEqual([
      '12465••••',
      '98732••••',
      'abcdd••••'
    ])
    const json = JSON.stringify({ roleid: '124651234', token: 'abcdd123456', id: '987321234' })
    expect(writeText).toHaveBeenLastCalledWith(json)
    expect(root.textContent).not.toContain('abcdd123456')
    const [retry, reveal, close] = [...root.querySelectorAll('button')]
    const full = root.querySelector('textarea')!
    expect(full.value).toBe('')
    reveal!.click()
    expect(full.hidden).toBe(false)
    expect(full.value).toBe(json)
    expect(reveal!.getAttribute('aria-expanded')).toBe('true')
    reveal!.click()
    expect(full.hidden).toBe(true)
    expect(full.value).toBe('')
    cookie.mockReturnValue('momoToken=new-token; momoNid=new-id')
    document.querySelector('div div')!.textContent = 'UID: 555555555'
    retry!.click()
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledTimes(2))
    expect(writeText).toHaveBeenLastCalledWith(json)
    close!.click()
    expect(document.getElementById('nikki-pearpal-cookie-result')).toBeNull()
    expect(full.value).toBe('')
    trigger.click()
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledTimes(3))
    expect(writeText).toHaveBeenLastCalledWith(
      JSON.stringify({ roleid: '555555555', token: 'new-token', id: 'new-id' })
    )
  }
)

it('fully masks short fields and closes with Escape while copying is pending', async () => {
  vi.stubGlobal('location', { hostname: 'myl.nuanpaper.com' })
  vi.spyOn(document, 'cookie', 'get').mockReturnValue('momoToken=12345; momoNid=id')
  document.body.innerHTML = '<div>UID: 1</div>'
  let finish!: () => void
  const writeText = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve
      })
  )
  vi.stubGlobal('navigator', { language: 'zh-CN', clipboard: { writeText } })
  run()
  document.querySelector('button')!.click()
  const root = result()
  expect([...root.querySelectorAll('dd')].map((el) => el.textContent)).toEqual([
    '••••',
    '••••',
    '••••'
  ])
  expect(root.querySelector('button')!.disabled).toBe(true)
  root
    .querySelector('section')!
    .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  expect(document.getElementById('nikki-pearpal-cookie-result')).toBeNull()
  finish()
  await vi.waitFor(() => expect(document.querySelector('button')!.disabled).toBe(false))
  expect(document.getElementById('nikki-pearpal-cookie-result')).toBeNull()
})

it.each([
  '<div hidden><div>UID:<!-- -->123456</div></div>',
  '<div style="display:none"><div><span>UID：</span><span>\n123456</span></div></div>'
])('reads a hidden bookmark UID without classes or a role request: %s', async (html) => {
  document.body.innerHTML =
    '<div>首页内容</div><div>文章 UID: 999999</div><div>UID: 999999 其他文字</div>' + html
  Object.defineProperty(document.body, 'innerText', {
    configurable: true,
    get() {
      throw new Error('UID extraction must not read body.innerText')
    }
  })
  vi.stubGlobal('location', { hostname: 'myl.nuanpaper.com' })
  vi.spyOn(document, 'cookie', 'get').mockReturnValue('momoToken=t; momoNid=i')
  const prompt = vi.fn()
  const fetchMock = vi.fn()
  vi.stubGlobal('prompt', prompt)
  vi.stubGlobal('fetch', fetchMock)
  try {
    await new Function(
      'return ' + resonanceBookmarkScript('Wrong site').slice('javascript:'.length)
    )()
    expect(prompt).toHaveBeenCalledWith(
      'Cookie:',
      JSON.stringify({ roleid: '123456', token: 't', id: 'i' })
    )
    expect(fetchMock).not.toHaveBeenCalled()
  } finally {
    Reflect.deleteProperty(document.body, 'innerText')
  }
})

it.each(['', 'momoToken=t', 'momoNid=i'])(
  'asks for login instead of copying incomplete credentials: %s',
  async (cookie) => {
    vi.stubGlobal('location', { hostname: 'myl.nuanpaper.com' })
    vi.spyOn(document, 'cookie', 'get').mockReturnValue(cookie)
    document.body.innerHTML = '<div>UID: 123</div>'
    const writeText = vi.fn()
    vi.stubGlobal('navigator', { language: 'zh-CN', clipboard: { writeText } })
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const alert = vi.fn()
    const prompt = vi.fn()
    vi.stubGlobal('alert', alert)
    vi.stubGlobal('prompt', prompt)
    run()
    document.querySelector('button')!.click()
    await vi.waitFor(() => expect(alert).toHaveBeenCalled())
    expect(prompt).not.toHaveBeenCalled()
    expect(writeText).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(document.querySelector('button')!.textContent).toBe('请先登录并确认角色')
    expect(document.querySelector('button')!.disabled).toBe(false)
  }
)

it('does not add a button on another host', () => {
  run()
  expect(document.querySelector('button')).toBeNull()
})

it('does not fetch a missing UID and allows retrying after the page role appears', async () => {
  vi.stubGlobal('location', { hostname: 'myl.nuanpaper.com' })
  vi.spyOn(document, 'cookie', 'get').mockReturnValue('momoToken=t; momoNid=i')
  document.body.innerHTML = '<div>文章 UID: 999 其他文字</div>'
  const writeText = vi.fn().mockResolvedValue(undefined)
  const alert = vi.fn()
  const fetchMock = vi.fn()
  vi.stubGlobal('navigator', { language: 'zh-CN', clipboard: { writeText } })
  vi.stubGlobal('alert', alert)
  vi.stubGlobal('fetch', fetchMock)
  run()
  const button = document.querySelector('button')!
  button.click()
  expect(alert).toHaveBeenCalledWith(expect.stringContaining('未读取到完整凭据'))
  expect(writeText).not.toHaveBeenCalled()
  expect(fetchMock).not.toHaveBeenCalled()
  expect(button.disabled).toBe(false)
  const role = document.createElement('div')
  role.hidden = true
  role.textContent = 'UID: 123'
  document.body.appendChild(role)
  button.click()
  await vi.waitFor(() =>
    expect(writeText).toHaveBeenCalledWith(JSON.stringify({ roleid: '123', token: 't', id: 'i' }))
  )
  expect(fetchMock).not.toHaveBeenCalled()
  await vi.waitFor(() => expect(button.disabled).toBe(false))
})
