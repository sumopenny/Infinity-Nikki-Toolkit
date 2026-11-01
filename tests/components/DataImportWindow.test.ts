import * as diagnosticReporter from '../../src/utils/errorReporting/errorReporter'
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import DataImportWindow from '../../src/components/DataImportWindow.vue'
import { clearAllBrowserData } from '../../src/utils/file-system/database'
import {
  createWardrobeBackup,
  emptyWardrobe,
  loadWardrobe
} from '../../src/utils/wardrobe/wardrobeStorage'
import { loadResonanceRecords } from '../../src/utils/resonance/resonanceStorage'
import * as resonanceImport from '../../src/utils/resonance/resonanceImport'
import { encodeSnappyLiteral } from '../utils/resonanceSnappyFixture'
import { saveResonanceRecords } from '../../src/utils/resonance/resonanceStorage'
import { parseDataPreview } from '../../src/utils/unifiedDataImport'
import { updateWardrobe } from '../../src/utils/wardrobe/wardrobeStorage'

let wrapper: VueWrapper
beforeEach(async () => {
  localStorage.clear()
  await clearAllBrowserData()
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {}
  }))
  wrapper = mount(DataImportWindow, { props: { visible: true }, attachTo: document.body })
})
afterEach(() => {
  wrapper.unmount()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})
const submit = () =>
  document.querySelector<HTMLButtonElement>('.resonance-import-footer .primary-button')!
async function preview(raw: unknown) {
  document
    .querySelectorAll<HTMLButtonElement>('.resonance-choice-row:first-child button')[1]!
    .click()
  await flushPromises()
  const input = document.querySelector<HTMLInputElement>('input[type="file"]')!
  Object.defineProperty(input, 'files', {
    value: [{ name: 'sample.json', size: 100, text: async () => JSON.stringify(raw) }]
  })
  input.dispatchEvent(new Event('change', { bubbles: true }))
  await flushPromises()
  submit().click()
  await vi.waitFor(() => expect(document.querySelector('.data-import-targets')).not.toBeNull())
  return [...document.querySelectorAll<HTMLInputElement>('.data-import-targets input')]
}
const raw = {
  info_from_self: {
    suit_list: ['10347'],
    gacha_list: [
      {
        card_pool_id: 77,
        pool_cnt: 1,
        result: '1020100347',
        rarity: 5,
        times_from_last_five_stars: 16
      }
    ]
  }
}

async function selectRegion(value: string) {
  document.querySelector<HTMLButtonElement>('.data-import-region .cleanup-account-select')!.click()
  await flushPromises()
  document.querySelector<HTMLButtonElement>(`[data-region="${value}"]`)!.click()
  await flushPromises()
}
it.each(['cn', 'asia', 'america', 'europe', 'tw'])(
  'uses the selected %s server for a raw file without exclusive owned items, and requires confirmation',
  async (region) => {
    await selectRegion(region)
    await preview({ info_from_gm: { clothes: [{ item_id: 1020100347 }] } })
    expect(document.querySelector('.data-import-region .cleanup-account-select')).not.toBeNull()
    expect(document.querySelector('.data-import-wardrobe-region')?.textContent).toContain(
      region === 'cn' ? '国服' : '国际服'
    )
    expect((await loadWardrobe()).regionScope).toBeUndefined()
    submit().click()
    await vi.waitFor(() => expect(wrapper.emitted('imported')).toHaveLength(1))
    expect((await loadWardrobe()).regionScope).toBe(region === 'cn' ? 'cn' : 'global')
  }
)
it.each([
  ['cn', 'global'],
  ['asia', 'cn']
] as const)(
  'keeps backup region %s selection overridden by %s through preview and saving',
  async (selected, saved) => {
    await selectRegion(selected)
    await preview(
      JSON.parse(createWardrobeBackup({ ...emptyWardrobe(), regionScope: saved, imported: true }))
    )
    expect(document.querySelector('.data-import-wardrobe-region')?.textContent).toContain(
      saved === 'cn' ? '国服' : '国际服'
    )
    submit().click()
    await vi.waitFor(() => expect(wrapper.emitted('imported')).toHaveLength(1))
    expect((await loadWardrobe()).regionScope).toBe(saved)
  }
)
it('invalidates a raw file preview on server change while retaining the chosen file for re-preview', async () => {
  await preview({ info_from_gm: { clothes: [{ item_id: 1020100347 }] } })
  await selectRegion('asia')
  expect(document.querySelector('.resonance-preview')).toBeNull()
  expect((await loadWardrobe()).regionScope).toBeUndefined()
  expect(document.querySelector('.resonance-file-name')?.textContent).toContain('sample.json')
  submit().click()
  await vi.waitFor(() =>
    expect(document.querySelector('.data-import-wardrobe-region')?.textContent).toContain('国际服')
  )
})
async function pasteCredentials() {
  const input = document.querySelector<HTMLTextAreaElement>('.resonance-paste textarea')!
  input.value = JSON.stringify({ roleid: '123456', token: 'test-token', id: 'test-openid' })
  input.dispatchEvent(new Event('input', { bubbles: true }))
  await flushPromises()
}

it('remembers only the server and updates the sole official login link in either language', async () => {
  expect(document.querySelector('.data-import-region select')).toBeNull()
  await selectRegion('tw')
  await pasteCredentials()
  expect(document.querySelector('a[href="https://pearpal.infoldgames.com/en/home"]')).not.toBeNull()
  expect(document.querySelector('a[href*="/tools/journal"]')).toBeNull()
  await wrapper.setProps({ language: 'en' })
  expect(
    document.querySelector('.data-import-region .cleanup-account-select')?.textContent
  ).toContain('Global · Taiwan/Hong Kong/Macao')
  wrapper.unmount()
  wrapper = mount(DataImportWindow, { props: { visible: true }, attachTo: document.body })
  expect(
    document.querySelector('.data-import-region .cleanup-account-select')!.textContent
  ).toContain('国际服·台港澳')
  expect(document.querySelector<HTMLTextAreaElement>('.resonance-paste textarea')!.value).toBe('')
  expect(localStorage.getItem('nikki-pearpal-region')).toBe('tw')
  expect(JSON.stringify(localStorage)).not.toContain('test-token')
})

it('aborts a pending notebook request and discards its late result after a server change', async () => {
  let finish!: (value: unknown) => void
  const fetchSnapshot = vi.spyOn(resonanceImport, 'fetchPearpalSnapshot').mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve
      })
  )
  await pasteCredentials()
  submit().click()
  await vi.waitFor(() => expect(fetchSnapshot).toHaveBeenCalledOnce())
  const signal = fetchSnapshot.mock.calls[0]![1]!
  await selectRegion('asia')
  expect(signal.aborted).toBe(true)
  expect(
    [...document.querySelectorAll<HTMLInputElement>('.resonance-form input')].every(
      (input) => !input.value
    )
  ).toBe(true)
  finish(raw)
  await flushPromises()
  expect(document.querySelector('.resonance-preview')).toBeNull()
  expect(document.querySelector('.data-import-progress')).toBeNull()
  expect(await loadResonanceRecords()).toEqual([])
})

it('clears an existing notebook preview when switching servers', async () => {
  vi.spyOn(resonanceImport, 'fetchPearpalSnapshot').mockResolvedValue(raw)
  await pasteCredentials()
  submit().click()
  await vi.waitFor(() => expect(document.querySelector('.resonance-preview')).not.toBeNull())
  await selectRegion('america')
  expect(document.querySelector('.resonance-preview')).toBeNull()
  expect(submit().textContent).toContain('获取预览')
})

it.each([
  ['asia', 4],
  ['america', 6],
  ['europe', 2],
  ['tw', 8]
])(
  'imports both notebook sections for %s and replaces the shared records after confirmation',
  async (region, zone) => {
    const old = await parseDataPreview({ 2: [['2026-01-01', '1020100126']] })
    await saveResonanceRecords(old.resonance!)
    await updateWardrobe((snapshot) => {
      snapshot.entries['1020100126'] = { owned: true, source: 'manual' }
      return snapshot
    })
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json(
          { code: 0, data: { role: { uid: 123456, zone_id: zone } } },
          { headers: { 'cache-control': 'no-store' } }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          encodeSnappyLiteral(
            JSON.stringify({
              ...raw,
              info_from_gm: { clothes: [{ item_id: 1020100347 }] }
            })
          ).buffer as ArrayBuffer,
          { headers: { 'cache-control': 'no-store' } }
        )
      )
    vi.stubGlobal('fetch', fetchMock)
    await selectRegion(String(region))
    await pasteCredentials()
    submit().click()
    await vi.waitFor(() => expect(document.querySelector('.resonance-preview')).not.toBeNull())
    expect(document.querySelector('.data-import-identity')?.textContent).toContain('123456')
    expect(document.querySelector('.data-import-warning:last-child')?.textContent).toContain(
      '其他服务器或账号'
    )
    expect((await loadResonanceRecords())[0]!.bannerId).toBe('2')
    expect(
      [...document.querySelectorAll<HTMLInputElement>('.data-import-targets input')].every(
        (input) => input.checked && !input.disabled
      )
    ).toBe(true)
    submit().click()
    await vi.waitFor(() => expect(wrapper.emitted('imported')).toHaveLength(1))
    expect((await loadResonanceRecords()).map((record) => record.bannerId)).toEqual(['77'])
    const wardrobe = await loadWardrobe()
    expect(wardrobe.regionScope).toBe('global')
    expect(wardrobe.entries['1020100347']?.owned).toBe(true)
    expect(wardrobe.entries['1020100126']).toBeUndefined()
  }
)

async function selectProgressFile(text: () => Promise<string>) {
  document
    .querySelectorAll<HTMLButtonElement>('.resonance-choice-row:first-child button')[1]!
    .click()
  await flushPromises()
  const input = document.querySelector<HTMLInputElement>('input[type="file"]')!
  Object.defineProperty(input, 'files', {
    configurable: true,
    value: [{ name: 'progress.json', size: 100, text }]
  })
  input.dispatchEvent(new Event('change', { bubbles: true }))
  await flushPromises()
}

it('shows real stages and replaces progress with an unsaved preview', async () => {
  let resolveRead!: (value: string) => void
  await selectProgressFile(
    () =>
      new Promise((resolve) => {
        resolveRead = resolve
      })
  )
  const stages: string[] = []
  const observer = new MutationObserver(() => {
    const node = document.querySelector('.data-import-progress')
    if (node) stages.push(node.textContent ?? '')
  })
  observer.observe(document.body, { childList: true, subtree: true, characterData: true })
  try {
    submit().click()
    await vi.waitFor(() =>
      expect(document.querySelector('.data-import-progress')?.textContent).toContain('正在读取文件')
    )
    expect(document.querySelector('[role="progressbar"]')?.hasAttribute('aria-valuenow')).toBe(
      false
    )
    expect(document.querySelector('.progress-track.is-indeterminate')).not.toBeNull()
    resolveRead(JSON.stringify(raw))
    await vi.waitFor(() => expect(document.querySelector('.data-import-targets')).not.toBeNull())
    expect(stages.some((s) => s.includes('正在检查数据格式'))).toBe(true)
    expect(stages.some((s) => s.includes('解析衣橱记录') && s.includes('3/5'))).toBe(true)
    expect(stages.some((s) => s.includes('解析共鸣记录') && s.includes('4/5'))).toBe(true)
    expect(stages.some((s) => s.includes('生成预览') && s.includes('5/5'))).toBe(true)
    expect(document.querySelector('.data-import-progress')).toBeNull()
    expect(await loadResonanceRecords()).toEqual([])
    expect((await loadWardrobe()).entries).toEqual({})
  } finally {
    observer.disconnect()
  }
})

it('retains the failed format stage and recovers with a new file', async () => {
  await selectProgressFile(async () => '{broken')
  submit().click()
  await vi.waitFor(() =>
    expect(document.querySelector('.data-import-progress[role="alert"]')?.textContent).toContain(
      '检查数据格式'
    )
  )
  expect(document.querySelector('.data-import-progress')?.textContent).toContain('此阶段失败')
  await selectProgressFile(async () => JSON.stringify({ 77: [['2026-01-01', '1020100347']] }))
  expect(document.querySelector('.data-import-progress')).toBeNull()
  submit().click()
  await vi.waitFor(() => expect(document.querySelector('.data-import-targets')).not.toBeNull())
})

it('does not restore progress or preview after closing a pending read', async () => {
  let resolveRead!: (value: string) => void
  await selectProgressFile(
    () =>
      new Promise((resolve) => {
        resolveRead = resolve
      })
  )
  submit().click()
  await vi.waitFor(() => expect(document.querySelector('.data-import-progress')).not.toBeNull())
  await wrapper.setProps({ visible: false })
  await wrapper.setProps({ visible: true })
  resolveRead(JSON.stringify(raw))
  await new Promise((resolve) => setTimeout(resolve, 40))
  await flushPromises()
  expect(document.querySelector('.data-import-progress')).toBeNull()
  expect(document.querySelector('.data-import-targets')).toBeNull()
})

it('shows notebook fetching and drops its results after switching to file import', async () => {
  let finish!: (value: unknown) => void
  vi.spyOn(resonanceImport, 'fetchPearpalSnapshot').mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve
      })
  )
  for (const input of document.querySelectorAll<HTMLInputElement>('.resonance-form input')) {
    input.value = '123'
    input.dispatchEvent(new Event('input', { bubbles: true }))
  }
  await flushPromises()
  submit().click()
  await vi.waitFor(() => expect(resonanceImport.fetchPearpalSnapshot).toHaveBeenCalledOnce())
  expect(document.querySelector('.data-import-progress')?.textContent).toContain('正在获取手账数据')
  document
    .querySelectorAll<HTMLButtonElement>('.resonance-choice-row:first-child button')[1]!
    .click()
  await flushPromises()
  finish(raw)
  await flushPromises()
  expect(document.querySelector('.data-import-progress')).toBeNull()
  expect(document.querySelector('.data-import-targets')).toBeNull()
})

it('shows recommended mobile browsers directly without a compatibility dialog', () => {
  const guide = document.querySelector('.resonance-mobile-browsers')!
  expect(guide.textContent).toContain('安卓建议浏览器：Chrome（谷歌）、Firefox（火狐）')
  expect(guide.textContent).toContain('iOS 建议浏览器：Chrome（谷歌）、Firefox（火狐）、Safari')
  expect(document.querySelector('.resonance-mobile-compatibility')).toBeNull()
  expect(document.querySelector('.confirm-dialog')).toBeNull()
})

it('offers a mobile bookmark guide and copies the complete executable script', async () => {
  const writeText = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
  const guide = document.querySelector('.resonance-mobile-bookmark-steps')!
  expect(guide.textContent).toContain('在浏览器中将任意网页添加为书签。')
  expect(guide.textContent).toContain('在美鸭梨页面运行书签。书签可从书签列表打开。')
  expect(guide.textContent).toContain('javascript:')
  guide.querySelector<HTMLButtonElement>('button')!.click()
  await flushPromises()
  expect(writeText).toHaveBeenCalledWith(expect.stringMatching(/^javascript:/))
  expect(wrapper.emitted('notice')).toContainEqual(['代码已复制', 'success'])
})

it('defaults both options on, blocks empty selection and imports only the chosen module', async () => {
  const choices = await preview(raw)
  expect(choices.map((input) => [input.checked, input.disabled])).toEqual([
    [true, false],
    [true, false]
  ])
  choices.forEach((input) => input.click())
  await flushPromises()
  expect(submit().disabled).toBe(true)
  choices[1]!.click()
  await flushPromises()
  expect(submit().disabled).toBe(false)
  submit().click()
  await vi.waitFor(() => expect(wrapper.emitted('imported')).toHaveLength(1))
  expect(await loadResonanceRecords()).toEqual([])
  expect(Object.keys((await loadWardrobe()).entries)).toHaveLength(10)
})
it('disables unavailable wardrobe data in resonance-only files', async () => {
  const choices = await preview({ 77: [['2026-01-01', '1020100347']] })
  expect(choices.map((input) => [input.checked, input.disabled])).toEqual([
    [true, false],
    [false, true]
  ])
  expect(document.body.textContent).toContain('数据不包含衣橱清单')
})
it('resets selection to both enabled after reopening and previewing again', async () => {
  const choices = await preview(raw)
  choices[0]!.click()
  await wrapper.setProps({ visible: false })
  await wrapper.setProps({ visible: true })
  expect((await preview(raw)).every((input) => input.checked)).toBe(true)
})

it('reports a Pearpal credential failure at the UI boundary without changing its user message', async () => {
  const capture = vi.spyOn(diagnosticReporter, 'reportError').mockReturnValue('test-event')
  const error = new Error(resonanceImport.PEARPAL_AUTH_FAILED)
  vi.spyOn(resonanceImport, 'fetchPearpalSnapshot').mockRejectedValue(error)
  await pasteCredentials()
  submit().click()
  await vi.waitFor(() =>
    expect(capture).toHaveBeenCalledWith(
      error,
      expect.objectContaining({ module: 'data-import', action: 'preview' })
    )
  )
  expect(wrapper.emitted('notice')?.at(-1)?.[0]).toContain('请前往美鸭梨网站重新登录并获取新凭据')
  expect(wrapper.emitted('imported')).toBeUndefined()
})
