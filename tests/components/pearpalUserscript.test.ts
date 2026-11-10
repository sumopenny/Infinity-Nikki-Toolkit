import { afterEach, expect, it, vi } from 'vitest'
import { resonanceUserscript } from '../../src/utils/resonance/resonanceScripts'

const run = () => new Function(resonanceUserscript())()
afterEach(() => {
  document.body.innerHTML = ''
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

it.each([
  ['myl.nuanpaper.com', 'https://myl-api.nuanpaper.com', 1106, 1],
  ['pearpal.infoldgames.com', 'https://pearpal-api.infoldgames.com', 1116, 6]
])('copies credentials on %s only after clicking', async (hostname, api, clientId, zone) => {
  vi.stubGlobal('location', { hostname })
  vi.spyOn(document, 'cookie', 'get').mockReturnValue('momoToken=t; momoNid=i')
  const writeText = vi.fn().mockResolvedValue(undefined)
  vi.stubGlobal('navigator', { language: 'zh-CN', clipboard: { writeText } })
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ code: 0, data: { role: { uid: 123, zone_id: zone } } })
  })
  vi.stubGlobal('fetch', fetchMock)
  run()
  run()
  expect(document.querySelectorAll('button')).toHaveLength(1)
  expect(fetchMock).not.toHaveBeenCalled()
  expect(writeText).not.toHaveBeenCalled()
  document.querySelector('button')!.click()
  await vi.waitFor(() =>
    expect(writeText).toHaveBeenCalledWith(JSON.stringify({ roleid: '123', token: 't', id: 'i' }))
  )
  expect(fetchMock).toHaveBeenCalledWith(
    api + '/v1/strategy/user/info/get',
    expect.objectContaining({
      body: JSON.stringify({ client_id: clientId, token: 't', openid: 'i' })
    })
  )
})

it('offers manual copy when clipboard fails and uses the visible UID', async () => {
  vi.stubGlobal('location', { hostname: 'myl.nuanpaper.com' })
  vi.spyOn(document, 'cookie', 'get').mockReturnValue('momoToken=t; momoNid=i')
  document.body.textContent = 'UID: 456\n'
  vi.stubGlobal('navigator', {
    language: 'en',
    clipboard: { writeText: vi.fn().mockRejectedValue(new Error()) }
  })
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue({
        ok: true,
        json: async () => ({ code: 0, data: { role: { uid: 456 } } })
      })
  )
  const prompt = vi.fn()
  vi.stubGlobal('prompt', prompt)
  run()
  document.querySelector('button')!.click()
  await vi.waitFor(() =>
    expect(prompt).toHaveBeenCalledWith(
      expect.any(String),
      JSON.stringify({ roleid: '456', token: 't', id: 'i' })
    )
  )
})

it.each(['', 'momoToken=t', 'momoNid=i'])(
  'asks for login instead of copying incomplete credentials: %s',
  async (cookie) => {
    vi.stubGlobal('location', { hostname: 'myl.nuanpaper.com' })
    vi.spyOn(document, 'cookie', 'get').mockReturnValue(cookie)
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
    expect(document.querySelector('button')!.textContent).toBe('请先登录')
    expect(document.querySelector('button')!.disabled).toBe(false)
  }
)

it('does not add a button on another host', () => {
  run()
  expect(document.querySelector('button')).toBeNull()
})

it.each([{ code: 1801 }, { code: 0, data: {} }, { code: 0, data: { role: { uid: '' } } }])(
  'rejects leftover cookies even when the page has an old UID: %j',
  async (payload) => {
    vi.stubGlobal('location', { hostname: 'myl.nuanpaper.com' })
    vi.spyOn(document, 'cookie', 'get').mockReturnValue('momoToken=old; momoNid=i')
    document.body.textContent = 'UID: 999\n'
    const writeText = vi.fn()
    const prompt = vi.fn()
    const alert = vi.fn()
    vi.stubGlobal('navigator', { language: 'zh-CN', clipboard: { writeText } })
    vi.stubGlobal('prompt', prompt)
    vi.stubGlobal('alert', alert)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => payload }))
    run()
    document.querySelector('button')!.click()
    await vi.waitFor(() => expect(alert).toHaveBeenCalledWith(expect.stringContaining('重新登录')))
    expect(writeText).not.toHaveBeenCalled()
    expect(prompt).not.toHaveBeenCalled()
  }
)

it('does not copy or claim logout when verification has a network error', async () => {
  vi.stubGlobal('location', { hostname: 'pearpal.infoldgames.com' })
  vi.spyOn(document, 'cookie', 'get').mockReturnValue('momoToken=t; momoNid=i')
  const writeText = vi.fn()
  const alert = vi.fn()
  vi.stubGlobal('navigator', { language: 'zh-CN', clipboard: { writeText } })
  vi.stubGlobal('alert', alert)
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
  run()
  document.querySelector('button')!.click()
  await vi.waitFor(() => expect(alert).toHaveBeenCalledWith(expect.stringContaining('检查网络')))
  expect(writeText).not.toHaveBeenCalled()
})
