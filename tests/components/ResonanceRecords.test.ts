import { getCatalogImageSource } from '../../src/utils/gongeo/catalogImage'
import * as diagnosticReporter from '../../src/utils/errorReporting/errorReporter'
import * as unifiedImport from '../../src/utils/unifiedDataImport'
import * as resonanceImport from '../../src/utils/resonance/resonanceImport'
import * as resonanceStorage from '../../src/utils/resonance/resonanceStorage'
import 'fake-indexeddb/auto'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { ref } from 'vue'
import { archiveMotionDeadlineKey } from '../../src/composables/useAfterArchiveMotion'
import ResonanceRecords from '../../src/components/ResonanceRecords.vue'
vi.mock('../../src/components/ArchiveCloudActions.vue', () => ({
  default: { template: '<span />' }
}))
import ResonanceImportDialog from '../../src/components/ResonanceImportDialog.vue'
import MobileEmptyScreenshot from '../../src/components/MobileEmptyScreenshot.vue'
import {
  loadResonanceRecords,
  saveResonanceRecords
} from '../../src/utils/resonance/resonanceStorage'
import type { ResonanceRecord } from '../../src/utils/resonance/resonanceTypes'
import { encodeSnappyLiteral } from '../utils/resonanceSnappyFixture'

// 分别校验指标标签与数值，不依赖布局中的分隔符和空白。
const summaryValues = (wrapper: ReturnType<typeof mount>) =>
  wrapper.findAll('.resonance-overall-summary .resonance-summary-group').map((group) => ({
    label: group.get('.resonance-summary-label').text(),
    value: group.get('strong').text()
  }))

const dbName = 'infinity-nikki-album-manager'
const HAIR = '1020100347'
const wrappers: Array<ReturnType<typeof mount>> = []
const originalScrollTo = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollTo')
beforeEach(() => {
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn()
  }))
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
    configurable: true,
    value: vi.fn(function (this: HTMLElement, options: ScrollToOptions) {
      this.scrollTop = options.top ?? 0
    })
  })
})
const savedRecord: ResonanceRecord = {
  id: '77:10347',
  bannerId: '77',
  bannerName: { zh: '示例阁', en: 'Sample Banner' },
  bannerStartAt: '2026-01-01T00:00:00.000Z',
  outfitId: '10347',
  outfitName: { zh: '示例套装', en: 'Sample Outfit' },
  rarity: 5,
  outfitImageUrl: '/outfit.png',
  sets: [
    {
      setNumber: 1,
      totalPulls: 19,
      parts: [
        { id: HAIR, name: { zh: '部件名', en: 'Piece' }, imageUrl: '/hair.png', pullNumber: 19 }
      ]
    },
    {
      setNumber: 2,
      totalPulls: 0,
      parts: [
        { id: HAIR, name: { zh: '部件名', en: 'Piece' }, imageUrl: '/hair.png', pullNumber: 0 }
      ]
    }
  ]
}

afterEach(async () => {
  vi.useRealTimers()
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  if (originalScrollTo) Object.defineProperty(HTMLElement.prototype, 'scrollTo', originalScrollTo)
  else delete (HTMLElement.prototype as Partial<HTMLElement>).scrollTo
  await new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase(dbName)
    request.onsuccess = request.onerror = request.onblocked = () => resolve()
  })
})

async function openDialog(language: 'zh' | 'en' = 'zh', expectReady = true) {
  const wrapper = mount(ResonanceRecords, { props: { language } })
  wrappers.push(wrapper)
  await flushPromises()
  await wrapper.find('.resonance-actions .primary-button').trigger('click')
  await flushPromises()
  if (expectReady)
    await vi.waitFor(() =>
      expect(
        document.body.querySelector<HTMLButtonElement>('.resonance-import-footer .primary-button')
          ?.disabled
      ).toBe(false)
    )
  return { wrapper, panel: document.body.querySelector('.resonance-import-panel') as HTMLElement }
}

it('shows the linked makeup beside an eligible outfit title and opens its detail', async () => {
  await saveResonanceRecords([savedRecord])
  const wrapper = mount(ResonanceRecords, { props: { language: 'zh' } })
  wrappers.push(wrapper)
  await vi.waitFor(() => expect(wrapper.find('.resonance-makeup-link').exists()).toBe(true), {
    timeout: 10000
  })
  expect(wrapper.find('.resonance-title-actions').text()).toContain('查看妆容')
  await wrapper.get('.resonance-makeup-link').trigger('click')
  await vi.waitFor(
    () => expect(document.body.querySelector('.makeup-detail-dialog')).not.toBeNull(),
    { timeout: 10000 }
  )
})

it('hides the makeup shortcut when the outfit has no linked makeup', async () => {
  await saveResonanceRecords([{ ...savedRecord, outfitId: '99999999' }])
  const wrapper = mount(ResonanceRecords)
  wrappers.push(wrapper)
  await vi.waitFor(() =>
    expect(wrapper.find('.content-loaded-layer .resonance-record').exists()).toBe(true)
  )
  await flushPromises()
  expect(wrapper.find('.resonance-makeup-link').exists()).toBe(false)
})

it('shows a screenshot only for an empty resonance library, not a rarity miss', async () => {
  const wrapper = mount(ResonanceRecords)
  wrappers.push(wrapper)
  await vi.waitFor(() => expect(wrapper.findComponent(MobileEmptyScreenshot).exists()).toBe(true))
  await saveResonanceRecords([savedRecord])
  await (wrapper.vm as unknown as { reload: () => Promise<void> }).reload()
  expect(wrapper.findComponent(MobileEmptyScreenshot).exists()).toBe(false)
  await wrapper.setProps({ rarityFilter: 4 })
  expect(wrapper.find('.resonance-empty').exists()).toBe(true)
  expect(wrapper.findComponent(MobileEmptyScreenshot).exists()).toBe(false)
  await saveResonanceRecords([])
  await (wrapper.vm as unknown as { reload: () => Promise<void> }).reload()
  expect(wrapper.findComponent(MobileEmptyScreenshot).exists()).toBe(true)
})

function latestNotice(wrapper: ReturnType<typeof mount>) {
  const events = wrapper.emitted('notice') ?? []
  return events[events.length - 1]?.[0] as
    { message: string; tone: string; source: string } | undefined
}

function mockPearpal(snapshot: unknown, uid = '123456') {
  const compressed = encodeSnappyLiteral(JSON.stringify(snapshot))
  const fetchMock = vi.fn<typeof fetch>(async (input) => {
    const action = new URL(String(input), 'https://local.test').searchParams.get('action')
    if (action === 'verify') {
      return Response.json(
        { code: 0, data: { role: { uid, zone_id: 1 } } },
        { headers: { 'cache-control': 'no-store' } }
      )
    }
    return new Response(compressed.buffer as ArrayBuffer, {
      headers: { 'cache-control': 'no-store', 'content-type': 'application/octet-stream' }
    })
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

async function pasteCredentials(panel: HTMLElement) {
  const textarea = panel.querySelector('textarea') as HTMLTextAreaElement
  textarea.value = '{"roleid":"123456","token":"tok","id":"openid"}'
  textarea.dispatchEvent(new Event('input', { bubbles: true }))
  await flushPromises()
}

describe('ResonanceRecords', () => {
  it('keeps mobile set controls outside transformed reveal blocks during loading and refresh', async () => {
    vi.stubGlobal('matchMedia', () => ({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    }))
    let resolveRecords!: (records: ResonanceRecord[]) => void
    vi.spyOn(resonanceStorage, 'loadResonanceRecords').mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRecords = resolve
        })
    )
    vi.useFakeTimers()
    const wrapper = mount(ResonanceRecords, {
      global: { provide: { [archiveMotionDeadlineKey as symbol]: ref(Date.now() + 280) } }
    })
    wrappers.push(wrapper)
    const assertAnchored = (selector: string) => {
      const controls = wrapper.findAll(`${selector} .resonance-set-switch`)
      expect(controls.length).toBeGreaterThan(0)
      controls.forEach((control) => {
        expect(control.element.parentElement?.classList.contains('resonance-record')).toBe(true)
        expect(control.element.closest('[data-load-block]')).toBeNull()
        expect(control.findAll('button')).toHaveLength(2)
      })
    }
    expect(wrapper.find('[data-skeleton-card]').exists()).toBe(false)
    resolveRecords([savedRecord])
    await flushPromises()
    assertAnchored('.content-skeleton-layer')
    await vi.advanceTimersByTimeAsync(280)
    await flushPromises()
    vi.useRealTimers()
    assertAnchored('.content-loaded-layer')

    const refreshing = (wrapper.vm as unknown as { reload: () => Promise<void> }).reload()
    await flushPromises()
    assertAnchored('.content-loaded-layer')
    resolveRecords([savedRecord])
    await refreshing
    await flushPromises()
    assertAnchored('.content-loaded-layer')
  })

  it.each(['zh', 'en'] as const)(
    'switches mobile set progress and known pulls independently in %s',
    async (language) => {
      vi.stubGlobal('matchMedia', () => ({
        matches: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn()
      }))
      const piece = savedRecord.sets[0].parts[0]!
      const record: ResonanceRecord = {
        ...savedRecord,
        sets: [
          {
            setNumber: 1,
            totalPulls: 37,
            parts: [
              piece,
              { ...piece, id: 'second', pullNumber: 18 },
              { ...piece, id: 'manual', pullNumber: 0, manual: true },
              { ...piece, id: 'missing', pullNumber: 0 }
            ]
          },
          savedRecord.sets[1]
        ]
      }
      await saveResonanceRecords([record])
      const wrapper = mount(ResonanceRecords, { props: { language } })
      wrappers.push(wrapper)
      await vi.waitFor(() =>
        expect(wrapper.findAll('.content-loaded-layer .resonance-record')).toHaveLength(1)
      )
      const desktopSummary = wrapper.find('.resonance-overall-summary').text()
      const buttons = wrapper.findAll('.resonance-set-switch button')
      expect(buttons[0]!.attributes('aria-pressed')).toBe('true')
      expect(wrapper.find('.resonance-mobile-progress').text()).toContain('3 / 4')
      expect(wrapper.find('.resonance-set-summary').text()).toContain('37')
      expect(wrapper.find('.resonance-set-summary').text()).toContain('18.5')
      expect(wrapper.find('.resonance-manual-note').exists()).toBe(true)

      await buttons[1]!.trigger('click')
      expect(buttons[1]!.attributes('aria-pressed')).toBe('true')
      expect(wrapper.find('.resonance-mobile-progress').text()).toContain('0 / 1')
      expect(wrapper.find('.resonance-set-summary').text().match(/—/g)).toHaveLength(2)
      expect(wrapper.find('.resonance-manual-note').exists()).toBe(false)
      expect(wrapper.findAll('.resonance-part')).toHaveLength(1)
      expect(wrapper.find('.resonance-part').classes()).toContain('is-missing')
      expect(wrapper.find('.resonance-overall-summary').text()).toBe(desktopSummary)

      await buttons[0]!.trigger('click')
      expect(wrapper.findAll('.resonance-part')).toHaveLength(4)
      expect(wrapper.find('.resonance-set-summary').text()).toContain('18.5')
      expect(await loadResonanceRecords()).toEqual([record])
    }
  )

  it('shares loaded records with the sidebar and gives each card a jump target', async () => {
    await saveResonanceRecords([savedRecord])
    const wrapper = mount(ResonanceRecords, { props: { language: 'zh' } })
    wrappers.push(wrapper)
    await vi.waitFor(() =>
      expect(wrapper.findAll('.content-loaded-layer .resonance-record')).toHaveLength(1)
    )

    expect(wrapper.emitted('recordsChange')?.[0]?.[0]).toEqual([savedRecord])
    expect(wrapper.find('.content-loaded-layer .resonance-record').attributes('id')).toBe(
      'resonance-record-77:10347'
    )
    expect(wrapper.find('.resonance-part img').attributes('src')).toBe(
      getCatalogImageSource('icon', HAIR)
    )
  })

  it('shows retryable failed images and retries the original without a proxy', async () => {
    await saveResonanceRecords([
      {
        ...savedRecord,
        outfitImageUrl:
          'https://ik.imagekit.io/nikkicube/images/outfits/T_showpic_suit_S0347.png?tr=f-webp,q-70'
      }
    ])
    const wrapper = mount(ResonanceRecords, { props: { language: 'zh' } })
    wrappers.push(wrapper)
    await vi.waitFor(() =>
      expect(wrapper.findAll('.content-loaded-layer .resonance-record')).toHaveLength(1)
    )
    const outfit = wrapper.find('.resonance-outfit-image img')
    await outfit.trigger('error')
    expect(wrapper.find('.resonance-outfit-image .is-failed').exists()).toBe(true)
    await wrapper.get('.resonance-outfit-image .catalog-image-retry').trigger('click')
    expect(wrapper.find('.resonance-outfit-image img').attributes('src')).toBe(
      'https://ik.imagekit.io/nikkicube/images/outfits/T_showpic_suit_S0347.png?tr=f-webp,q-70'
    )
    const part = wrapper.find('.resonance-part img')
    await part.trigger('error')
    expect(wrapper.find('.resonance-part .is-failed').exists()).toBe(true)
    await wrapper.get('.resonance-part .catalog-image-retry').trigger('click')
    expect(wrapper.find('.resonance-part img').attributes('src')).toBe(
      getCatalogImageSource('icon', HAIR)
    )
  })

  it('uses silver for missing parts and banner parity for obtained parts', async () => {
    const obtained = savedRecord.sets[0].parts[0]!
    const manual = {
      ...obtained,
      id: 'manual',
      name: { zh: '手动部件', en: 'Manual piece' },
      pullNumber: 0,
      manual: true
    }
    const missing = {
      ...obtained,
      id: 'missing',
      name: { zh: '未获得部件', en: 'Missing piece' },
      pullNumber: 0
    }
    const odd: ResonanceRecord = {
      ...savedRecord,
      sets: [{ ...savedRecord.sets[0], parts: [obtained, manual, missing] }, savedRecord.sets[1]]
    }
    const even: ResonanceRecord = { ...odd, id: '76:10347', bannerId: '76' }
    await saveResonanceRecords([odd, even])
    const wrapper = mount(ResonanceRecords, { props: { language: 'zh' } })
    wrappers.push(wrapper)
    await vi.waitFor(() =>
      expect(wrapper.findAll('.content-loaded-layer .resonance-record')).toHaveLength(2)
    )

    const partClasses = (recordId: string, name: string) =>
      wrapper
        .findAll('.content-loaded-layer .resonance-record')
        .find((card) => card.attributes('id') === `resonance-record-${recordId}`)!
        .findAll('.resonance-part')
        .find((part) => part.find('img').attributes('alt') === name)!
        .classes()

    expect(partClasses('77:10347', '部件名')).not.toContain('is-even-banner')
    expect(partClasses('77:10347', '手动部件')).not.toContain('is-missing')
    expect(partClasses('77:10347', '未获得部件')).toContain('is-missing')
    expect(partClasses('76:10347', '部件名')).toContain('is-even-banner')
    expect(partClasses('76:10347', '未获得部件')).toContain('is-missing')
  })

  it('displays latest owned pieces first for each set', async () => {
    const part = (id: string, pullNumber: number, acquisitionOrder?: number) => ({
      id,
      name: { zh: id, en: id },
      imageUrl: `/${id}.png`,
      pullNumber,
      acquisitionOrder
    })
    const record: ResonanceRecord = {
      ...savedRecord,
      sets: [
        {
          setNumber: 1,
          totalPulls: 12,
          parts: [part('missing', 0), part('later', 5, 3), part('earlier', 7, 1)]
        },
        {
          setNumber: 2,
          totalPulls: 8,
          parts: [part('missing', 0), part('second-later', 3, 4), part('second-earlier', 5, 2)]
        }
      ]
    }
    await saveResonanceRecords([record])
    const wrapper = mount(ResonanceRecords, { props: { language: 'zh' } })
    wrappers.push(wrapper)
    await vi.waitFor(() => expect(wrapper.findAll('.resonance-set-row')).toHaveLength(2))
    const rows = wrapper.findAll('.resonance-set-row')
    const displayedIds = (index: number) =>
      rows[index]!.findAll('.resonance-part img').map((image) => image.attributes('alt'))
    expect(displayedIds(0)).toEqual(['later', 'earlier', 'missing'])
    expect(displayedIds(1)).toEqual(['second-later', 'second-earlier', 'missing'])
    expect(rows[0]!.find('.resonance-desktop-set-heading').text()).toContain('本套已记录抽数：12')
    expect(rows[1]!.find('.resonance-desktop-set-heading').text()).toContain('本套已记录抽数：8')
    expect(rows[0]!.find('.resonance-desktop-set-heading').text()).toContain('已知部件均抽：6.0')
    expect(rows[1]!.find('.resonance-desktop-set-heading').text()).toContain('已知部件均抽：4.0')
  })

  it('reverses banner order in the cards while keeping the same-banner outfit order', async () => {
    const older = { ...savedRecord, id: '76:10347', bannerId: '76' }
    const sameBanner = { ...savedRecord, id: '77:10348', outfitId: '10348' }
    await saveResonanceRecords([older, sameBanner, savedRecord])
    const wrapper = mount(ResonanceRecords, { props: { language: 'zh', bannerOrder: 'newest' } })
    wrappers.push(wrapper)
    await vi.waitFor(() =>
      expect(wrapper.findAll('.content-loaded-layer .resonance-record')).toHaveLength(3)
    )

    const cardIds = () =>
      wrapper
        .findAll('.content-loaded-layer .resonance-record')
        .map((card) => card.attributes('id'))
    const newestOrder = cardIds()
    expect(newestOrder.slice(0, 2).sort()).toEqual([
      'resonance-record-77:10347',
      'resonance-record-77:10348'
    ])
    expect(newestOrder[2]).toBe('resonance-record-76:10347')

    await wrapper.setProps({ bannerOrder: 'oldest' })
    expect(cardIds()).toEqual(['resonance-record-76:10347', ...newestOrder.slice(0, 2)])
  })

  it('filters cards by rarity without changing the saved records', async () => {
    const fourStar: ResonanceRecord = {
      ...savedRecord,
      id: '76:10343',
      bannerId: '76',
      outfitId: '10343',
      rarity: 4
    }
    await saveResonanceRecords([fourStar, savedRecord])
    const wrapper = mount(ResonanceRecords, { props: { language: 'zh', rarityFilter: 5 } })
    wrappers.push(wrapper)
    await vi.waitFor(() =>
      expect(wrapper.findAll('.content-loaded-layer .resonance-record')).toHaveLength(1)
    )
    expect(wrapper.find('.content-loaded-layer .resonance-record').attributes('id')).toBe(
      'resonance-record-77:10347'
    )
    await wrapper.setProps({ rarityFilter: 4 })
    expect(wrapper.find('.content-loaded-layer .resonance-record').attributes('id')).toBe(
      'resonance-record-76:10343'
    )
    await wrapper.setProps({ rarityFilter: 'all' })
    expect(wrapper.findAll('.content-loaded-layer .resonance-record')).toHaveLength(2)
    expect(await loadResonanceRecords()).toEqual([fourStar, savedRecord])
  })

  it('disables export when no resonance records exist', async () => {
    const wrapper = mount(ResonanceRecords, { props: { language: 'zh' } })
    wrappers.push(wrapper)
    await flushPromises()

    const exportButton = wrapper
      .findAll('.resonance-actions button')
      .find((button) => button.text().includes('导出数据'))!
    expect(exportButton.attributes('disabled')).toBeDefined()
  })

  it('opens Pearpal flow and offers file import in the same dialog', async () => {
    const { panel } = await openDialog()
    const links = [...panel.querySelectorAll('a')].map((link) => link.getAttribute('href'))

    expect(panel.textContent).toContain('导入数据')
    expect(links).toContain('https://myl.nuanpaper.com/home')
    expect(panel.textContent).toContain('获取登录凭据的方法来自暖暖共鸣录')
    expect(panel.querySelector('.resonance-source-attribution strong')?.textContent).toBe(
      '方法来源'
    )
    expect(panel.querySelector('.resonance-region-chip')).toBeNull()
    expect(
      panel.querySelector('.data-import-region .cleanup-account-select')?.textContent
    ).toContain('国服')
    expect(panel.querySelector('.data-import-region select')).toBeNull()
    expect(panel.querySelectorAll('.resonance-choice')).toHaveLength(5)
    expect(panel.querySelector('input[type="file"]')).toBeNull()
    expect(panel.textContent).toContain('从文件导入')
    expect(panel.textContent).not.toContain('从游戏导入')
    expect(panel.textContent).not.toContain('手动输入')
  })

  it('previews a JSON file and saves it only after confirmation', async () => {
    const oldRecord = { ...savedRecord, id: '76:10347', bannerId: '76' }
    await saveResonanceRecords([oldRecord, savedRecord])
    const { wrapper, panel } = await openDialog()
    const methods = panel.querySelectorAll<HTMLButtonElement>(
      '.resonance-choice-row:first-child button'
    )
    const body = panel.querySelector<HTMLElement>('.resonance-import-body')!
    Object.defineProperty(body, 'scrollHeight', { configurable: true, value: 900 })
    methods[1]!.click()
    await flushPromises()
    const input = panel.querySelector<HTMLInputElement>('input[type="file"]')!
    Object.defineProperty(input, 'files', {
      configurable: true,
      value: [
        {
          name: 'resonance.json',
          text: async () => JSON.stringify({ 77: [['2026-01-01', HAIR]] })
        }
      ]
    })
    input.dispatchEvent(new Event('change', { bubbles: true }))
    await flushPromises()
    panel.querySelector<HTMLButtonElement>('.resonance-import-footer .primary-button')!.click()
    await flushPromises()
    await vi.waitFor(() => expect(panel.textContent).toContain('导入预览 (1)'))
    expect(body.scrollTop).toBe(900)
    expect(body.scrollTo).toHaveBeenCalledWith({ top: 900, behavior: 'smooth' })
    expect(panel.querySelectorAll('.resonance-import-footer button')).toHaveLength(1)
    expect(panel.textContent).toContain('整份覆盖勾选的记录')
    expect(await loadResonanceRecords()).toEqual([oldRecord, savedRecord])
    panel.querySelector<HTMLButtonElement>('.resonance-import-footer .primary-button')!.click()
    await flushPromises()
    expect((await loadResonanceRecords()).map((record) => record.id)).toEqual(['77:10347'])
    expect(latestNotice(wrapper)?.tone).toBe('success')
  })

  it('fills the credential fields from pasted bookmark or console output', async () => {
    const { wrapper, panel } = await openDialog()
    await pasteCredentials(panel)
    const values = [...panel.querySelectorAll('.resonance-form input')].map(
      (input) => (input as HTMLInputElement).value
    )
    expect(values).toEqual(['123456', 'tok', 'openid'])
    expect(latestNotice(wrapper)).toMatchObject({
      message: '数据粘贴成功！',
      tone: 'success',
      source: 'resonance'
    })
  })

  it('renders bilingual desktop set rows with independent stats and the combined summary', async () => {
    await saveResonanceRecords([savedRecord])
    const wrapper = mount(ResonanceRecords, { props: { language: 'en' } })
    wrappers.push(wrapper)
    await vi.waitFor(() =>
      expect(wrapper.findAll('.content-loaded-layer .resonance-record')).toHaveLength(1)
    )

    const loaded = (await loadResonanceRecords())[0]!
    expect(wrapper.find('.resonance-record h3').text()).toContain(loaded.outfitName.en)
    expect(summaryValues(wrapper)).toEqual([
      { label: 'Total pulls', value: '19' },
      { label: 'Average pulls', value: '19.0' }
    ])
    const headings = wrapper.findAll('.resonance-desktop-set-heading')
    expect(headings).toHaveLength(2)
    expect(headings[0]!.text()).toContain('First set')
    expect(headings[0]!.text()).toContain('Recorded pulls for this set: 19')
    expect(headings[1]!.text()).toContain('Second set')
    expect(headings[1]!.text()).toContain('Recorded pulls for this set: —')
    expect(headings[1]!.text()).toContain('Known-piece average: —')
    expect(wrapper.find('.resonance-second-set').exists()).toBe(false)
  })

  it('sums both sets and shows their obtained-piece average with one decimal place', async () => {
    const record = {
      ...savedRecord,
      sets: [
        {
          ...savedRecord.sets[0],
          parts: [
            ...savedRecord.sets[0].parts,
            {
              id: '1020500347',
              name: { zh: '部件二', en: 'Second piece' },
              imageUrl: '/second.png',
              pullNumber: 18
            }
          ]
        },
        { ...savedRecord.sets[1], parts: [{ ...savedRecord.sets[1].parts[0]!, pullNumber: 21 }] }
      ] as ResonanceRecord['sets']
    }
    await saveResonanceRecords([record])
    const wrapper = mount(ResonanceRecords, { props: { language: 'zh' } })
    wrappers.push(wrapper)
    await vi.waitFor(() =>
      expect(wrapper.findAll('.content-loaded-layer .resonance-record')).toHaveLength(1)
    )
    expect(summaryValues(wrapper)).toEqual([
      { label: '总抽数', value: '58' },
      { label: '平均抽数', value: '19.3' }
    ])
  })

  it('checks the UID before reading the notebook and keeps local records on mismatch', async () => {
    await saveResonanceRecords([savedRecord])
    const wrapper = mount(ResonanceRecords, { props: { language: 'zh' } })
    wrappers.push(wrapper)
    await flushPromises()
    await wrapper.find('.resonance-actions .primary-button').trigger('click')
    await flushPromises()
    const panel = document.body.querySelector('.resonance-import-panel') as HTMLElement
    await pasteCredentials(panel)
    const fetchMock = mockPearpal({ info_from_self: { gacha_list: [] } }, '999999')

    ;(panel.querySelector('.resonance-import-footer button') as HTMLButtonElement).click()
    await flushPromises()

    await vi.waitFor(() =>
      expect(latestNotice(wrapper)?.message).toContain('UID 与输入的 UID 不一致')
    )
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(await loadResonanceRecords()).toHaveLength(1)
    expect(panel.querySelector('.resonance-preview')).toBeNull()
  })

  it('previews a Pearpal snapshot and replaces all local pools after confirmation', async () => {
    const localOnly: ResonanceRecord = {
      ...savedRecord,
      id: 'local-only:outfit',
      bannerId: 'local-only',
      outfitId: 'outfit-local',
      bannerName: { zh: '本地阁', en: 'Local Banner' },
      outfitName: { zh: '本地套装', en: 'Local Outfit' }
    }
    await saveResonanceRecords([localOnly])
    const wrapper = mount(ResonanceRecords, { props: { language: 'zh' } })
    wrappers.push(wrapper)
    await flushPromises()
    await wrapper.find('.resonance-actions .primary-button').trigger('click')
    await flushPromises()
    const panel = document.body.querySelector('.resonance-import-panel') as HTMLElement
    await pasteCredentials(panel)
    const fetchMock = mockPearpal({
      info_from_self: {
        gacha_list: [
          {
            card_pool_id: 77,
            pool_cnt: 1,
            result: HAIR,
            rarity: 5,
            times_from_last_five_stars: 16
          },
          {
            card_pool_id: 77,
            pool_cnt: 99,
            result: '9999999999',
            rarity: 4,
            times_from_last_four_stars: 0
          }
        ]
      }
    })

    ;(panel.querySelector('.resonance-import-footer button') as HTMLButtonElement).click()
    await vi.waitFor(() => expect(panel.querySelector('.resonance-preview')).not.toBeNull())
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(panel.textContent).toContain('套装总抽数')
    expect(panel.querySelector('.resonance-preview tbody')?.textContent).toContain('17')
    expect(panel.textContent).not.toContain('第二套')

    ;(
      panel.querySelector('.resonance-import-footer button:last-child') as HTMLButtonElement
    ).click()
    await vi.waitFor(async () => expect(await loadResonanceRecords()).toHaveLength(1))
    const stored = await loadResonanceRecords()
    expect(stored.map((record) => record.id)).toEqual(['77:10347'])
    expect(stored.some((record) => record.id === localOnly.id)).toBe(false)
    expect(stored.find((record) => record.id === '77:10347')?.sets[0].totalPulls).toBe(17)
    expect(summaryValues(wrapper)).toEqual([
      { label: '总抽数', value: '17' },
      { label: '平均抽数', value: '17.0' }
    ])
    expect(document.body.querySelector('.resonance-import-panel')).toBeNull()
    expect(latestNotice(wrapper)?.tone).toBe('success')
  })

  it('closes a preview without writing to IndexedDB', async () => {
    await saveResonanceRecords([savedRecord])
    const { panel } = await openDialog()
    await pasteCredentials(panel)
    mockPearpal({
      info_from_self: {
        gacha_list: [
          { card_pool_id: 77, pool_cnt: 1, result: HAIR, rarity: 5, times_from_last_five_stars: 16 }
        ]
      }
    })
    ;(panel.querySelector('.resonance-import-footer button') as HTMLButtonElement).click()
    await vi.waitFor(() => expect(panel.querySelector('.resonance-preview')).not.toBeNull())
    expect(panel.querySelectorAll('.resonance-import-footer button')).toHaveLength(1)
    ;(panel.querySelector('.resonance-import-header button') as HTMLButtonElement).click()
    await flushPromises()
    expect(document.body.querySelector('.resonance-import-panel')).toBeNull()
    expect((await loadResonanceRecords())[0]?.sets[0].totalPulls).toBe(19)
  })

  it('clears the current records only after confirmation', async () => {
    await saveResonanceRecords([savedRecord])
    const wrapper = mount(ResonanceRecords, { props: { language: 'zh' } })
    wrappers.push(wrapper)
    await vi.waitFor(() =>
      expect(wrapper.findAll('.content-loaded-layer .resonance-record')).toHaveLength(1)
    )

    await wrapper
      .findAll('.resonance-actions button')
      .find((button) => button.text().includes('清空'))!
      .trigger('click')
    await flushPromises()
    expect(document.body.querySelector('.confirm-dialog')?.textContent).toContain('无法撤销')
    ;(document.body.querySelector('.confirm-dialog-button.primary') as HTMLButtonElement).click()
    await vi.waitFor(async () => expect(await loadResonanceRecords()).toEqual([]))
    expect(wrapper.emitted('recordsChange')?.at(-1)?.[0]).toEqual([])
    expect(latestNotice(wrapper)).toMatchObject({
      message: '本地共鸣记录已清空，云端存档保留。',
      tone: 'success',
      source: 'resonance'
    })
  })
})

it.each([
  [false, false],
  [true, false],
  [false, true],
  [true, true]
])(
  'scrolls a successful Cookie preview on compact=%s reducedMotion=%s',
  async (compact, reducedMotion) => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('prefers-reduced-motion') ? reducedMotion : compact,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    }))
    vi.spyOn(resonanceImport, 'fetchPearpalSnapshot').mockResolvedValueOnce({
      info_from_self: { gacha_list: [{}] }
    })
    vi.spyOn(resonanceImport, 'parsePearpalResonance').mockResolvedValueOnce({
      records: [savedRecord],
      skippedPools: 0
    })
    const { panel } = await openDialog()
    const body = panel.querySelector<HTMLElement>('.resonance-import-body')!
    Object.defineProperty(body, 'scrollHeight', { configurable: true, value: 1200 })
    await pasteCredentials(panel)
    panel.querySelector<HTMLButtonElement>('.resonance-import-footer .primary-button')!.click()
    await vi.waitFor(() => expect(body.scrollTop).toBe(1200))
    expect(body.scrollTo).toHaveBeenCalledWith({
      top: 1200,
      behavior: reducedMotion ? 'instant' : 'smooth'
    })
    expect(panel.querySelector('.resonance-preview')).not.toBeNull()
    expect(panel.querySelector('.resonance-import-footer')?.textContent).toContain('确认导入')
    expect(await loadResonanceRecords()).toEqual([])
  }
)

it.each([false, true])('handles partial replacement with save failure=%s', async (failSaving) => {
  const oldRecord = { ...savedRecord, id: '76:10347', bannerId: '76' }
  await saveResonanceRecords([oldRecord])
  vi.spyOn(resonanceImport, 'fetchPearpalSnapshot').mockResolvedValueOnce({
    info_from_self: { gacha_list: [{}] }
  })
  vi.spyOn(resonanceImport, 'parsePearpalResonance').mockResolvedValueOnce({
    records: [savedRecord],
    skippedPools: 1
  })
  const { wrapper, panel } = await openDialog()
  await pasteCredentials(panel)
  panel.querySelector<HTMLButtonElement>('.resonance-import-footer .primary-button')!.click()
  await vi.waitFor(() => expect(panel.querySelector('.resonance-preview')).not.toBeNull())
  expect(panel.textContent).toContain('整份覆盖勾选的记录')
  if (failSaving)
    vi.spyOn(unifiedImport, 'saveDataImport').mockRejectedValueOnce(new Error('save failed'))
  panel.querySelector<HTMLButtonElement>('.resonance-import-footer .primary-button')!.click()
  await flushPromises()
  expect(await loadResonanceRecords()).toEqual(failSaving ? [oldRecord] : [savedRecord])
  if (failSaving) {
    expect(document.body.querySelector('.resonance-preview')).not.toBeNull()
    expect(wrapper.emitted('recordsChange')?.at(-1)?.[0]).toEqual([oldRecord])
    expect(latestNotice(wrapper)?.tone).toBe('error')
  } else {
    expect(document.body.querySelector('.resonance-import-panel')).toBeNull()
    expect(latestNotice(wrapper)?.tone).toBe('warning')
  }
})

it('blocks import after a storage read failure without overwriting existing records', async () => {
  await saveResonanceRecords([savedRecord])
  vi.spyOn(resonanceStorage, 'loadResonanceRecords').mockRejectedValueOnce(new Error('read failed'))
  const save = vi.spyOn(resonanceStorage, 'saveResonanceRecords')
  const { wrapper, panel } = await openDialog('zh', false)
  panel.querySelectorAll<HTMLButtonElement>('.resonance-choice-row:first-child button')[1]!.click()
  await flushPromises()
  const input = panel.querySelector<HTMLInputElement>('input[type="file"]')!
  Object.defineProperty(input, 'files', {
    configurable: true,
    value: [
      {
        name: 'resonance.json',
        text: async () => JSON.stringify({ 77: [['2026-01-01', HAIR]] })
      }
    ]
  })
  input.dispatchEvent(new Event('change', { bubbles: true }))
  await flushPromises()
  panel.querySelector<HTMLButtonElement>('.resonance-import-footer .primary-button')!.click()
  await flushPromises()
  panel.querySelector<HTMLButtonElement>('.resonance-import-footer .primary-button')!.click()
  await flushPromises()
  expect(save).not.toHaveBeenCalled()
  expect(latestNotice(wrapper)).toMatchObject({
    tone: 'error',
    message: expect.stringContaining('读取失败')
  })
  expect(await loadResonanceRecords()).toEqual([savedRecord])
})

it.each(['zh', 'en'] as const)(
  'shows actionable credential guidance instead of OK in %s',
  async (language) => {
    await saveResonanceRecords([savedRecord])
    const { wrapper, panel } = await openDialog(language)
    const body = panel.querySelector<HTMLElement>('.resonance-import-body')!
    body.scrollTop = 37
    await pasteCredentials(panel)
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(async () =>
        Response.json({ code: 0, info: 'OK' }, { headers: { 'cache-control': 'no-store' } })
      )
    )
    panel.querySelector<HTMLButtonElement>('.resonance-import-footer .primary-button')!.click()
    await vi.waitFor(() => expect(latestNotice(wrapper)?.tone).toBe('error'))
    expect(latestNotice(wrapper)?.message).toContain(
      language === 'zh'
        ? '当前凭据已过期或失效'
        : 'Your credentials have expired or are no longer valid'
    )
    expect(latestNotice(wrapper)?.message).toContain(
      language === 'zh'
        ? '请前往美鸭梨网站重新登录并获取新凭据'
        : 'Sign in to the Pear-Pal website again to obtain fresh credentials'
    )
    expect(latestNotice(wrapper)?.message).toContain(
      language === 'zh' ? '无痕窗口' : 'private browser window'
    )
    expect(panel.querySelector('.resonance-preview')).toBeNull()
    expect(body.scrollTop).toBe(37)
    expect(await loadResonanceRecords()).toEqual([savedRecord])
  }
)

it.each(['close', 'method', 'credentials', 'unmount'])(
  'discards a late Pearpal preview after %s',
  async (action) => {
    let finish!: (value: unknown) => void
    const pending = vi.spyOn(resonanceImport, 'fetchPearpalSnapshot').mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve
        })
    )
    const { wrapper, panel } = await openDialog()
    await pasteCredentials(panel)
    panel.querySelector<HTMLButtonElement>('.resonance-import-footer button')!.click()
    await vi.waitFor(() => expect(pending).toHaveBeenCalled())
    const signal = pending.mock.calls[0]![1]!
    if (action === 'close')
      panel.querySelector<HTMLButtonElement>('.resonance-import-header button')!.click()
    if (action === 'method')
      panel
        .querySelectorAll<HTMLButtonElement>('.resonance-choice-row:first-child button')[1]!
        .click()
    if (action === 'credentials') {
      const input = panel.querySelector<HTMLInputElement>('.resonance-form input')!
      input.value = 'different'
      input.dispatchEvent(new Event('input', { bubbles: true }))
    }
    if (action === 'unmount') wrapper.unmount()
    await flushPromises()
    expect(signal.aborted).toBe(true)
    const notices = wrapper.emitted('notice')?.length ?? 0
    finish({ info_from_self: { suit_list: ['10347'] } })
    await flushPromises()
    expect(document.body.querySelector('.resonance-preview')).toBeNull()
    expect(wrapper.emitted('notice')?.length ?? 0).toBe(notices)
  }
)

it('does not let an old file preview overwrite a newer selection', async () => {
  const { panel } = await openDialog()
  panel.querySelectorAll<HTMLButtonElement>('.resonance-choice-row:first-child button')[1]!.click()
  await flushPromises()
  const input = panel.querySelector<HTMLInputElement>('input[type="file"]')!
  let finish!: (value: string) => void
  Object.defineProperty(input, 'files', {
    configurable: true,
    value: [
      {
        name: 'old.json',
        text: () =>
          new Promise<string>((resolve) => {
            finish = resolve
          })
      }
    ]
  })
  input.dispatchEvent(new Event('change', { bubbles: true }))
  await flushPromises()
  panel.querySelector<HTMLButtonElement>('.resonance-import-footer .primary-button')!.click()
  await flushPromises()
  Object.defineProperty(input, 'files', {
    configurable: true,
    value: [{ name: 'new.json', text: async () => '{}' }]
  })
  input.dispatchEvent(new Event('change', { bubbles: true }))
  await flushPromises()
  finish(JSON.stringify({ 77: [['2026-01-01', HAIR]] }))
  await flushPromises()
  expect(panel.querySelector('.resonance-preview')).toBeNull()
  expect(panel.textContent).toContain('new.json')
})

it('opens outfit and item details from record images without changing records', async () => {
  const api = await import('../../src/utils/outfit/outfitText')
  vi.spyOn(api, 'loadOutfitText').mockResolvedValue({ id: 10001, description: '' })
  await saveResonanceRecords([savedRecord])
  const wrapper = mount(ResonanceRecords, { attachTo: document.body })
  wrappers.push(wrapper)
  await flushPromises()
  await vi.waitFor(() => expect(wrapper.find('button.resonance-outfit-image').exists()).toBe(true))
  await wrapper.get('button.resonance-outfit-image').trigger('click')
  await vi.waitFor(() => expect(document.querySelector('.wardrobe-dialog')).not.toBeNull())
  // 未导入衣橱数据时，当前弹窗用状态说明表达未知，不应展示拥有进度。
  const dialog = document.querySelector('.wardrobe-dialog')!
  expect(dialog.querySelector('.wardrobe-suit-message')?.textContent).toContain('未知')
  expect(dialog.querySelector('.wardrobe-suit-progress')).toBeNull()
  document.querySelector<HTMLButtonElement>('.wardrobe-detail-header button')!.click()
  await flushPromises()
  expect(document.querySelector('.wardrobe-dialog')).toBeNull()
  await wrapper.get('button.resonance-part').trigger('click')
  await vi.waitFor(() => expect(document.querySelector('.outfit-detail-panel')).not.toBeNull())
  expect(document.querySelector<HTMLImageElement>('.outfit-detail-image')?.src).toBe(
    getCatalogImageSource('item', HAIR)
  )
  expect(document.querySelector('.outfit-detail-image-frame [data-image-pending]')).not.toBeNull()
  const { loadWardrobeCatalog } = await import('../../src/utils/wardrobe/wardrobeCatalog')
  const { wardrobeFamilyKey } = await import('../../src/utils/wardrobe/wardrobeFamilies')
  const catalog = await loadWardrobeCatalog()
  const original = catalog.byId.get(HAIR)!
  const forms = catalog.entries
    .filter((entry) => wardrobeFamilyKey(entry) === wardrobeFamilyKey(original))
    .sort((a, b) => a.variant - b.variant)
  expect(forms.length).toBeGreaterThan(1)
  const formButtons = document.querySelectorAll<HTMLButtonElement>('.wardrobe-form-nav button')
  expect(formButtons).toHaveLength(forms.length)
  const evolvedIndex = forms.findIndex((entry) => entry.variant > original.variant)
  const evolved = forms[evolvedIndex]!
  formButtons[evolvedIndex]!.click()
  await flushPromises()
  expect(document.querySelector<HTMLImageElement>('.outfit-detail-image')?.src).toBe(
    getCatalogImageSource('item', evolved.id)
  )
  expect(document.querySelector('.outfit-detail-info')?.textContent).toContain(evolved.name.zh)
  const evolvedOutfits = catalog.entries.filter(
    (entry) => entry.kind === 'outfit' && entry.parts.includes(evolved.id)
  )
  expect(document.querySelectorAll('.wardrobe-outfit-link')).toHaveLength(evolvedOutfits.length)
  formButtons[forms.findIndex((entry) => entry.id === HAIR)]!.click()
  await flushPromises()
  document.querySelector<HTMLButtonElement>('.wardrobe-outfit-link')!.click()
  await vi.waitFor(() => expect(document.querySelector('.wardrobe-dialog')).not.toBeNull())
  expect(document.querySelector('.outfit-detail-panel')).not.toBeNull()
  expect(await loadResonanceRecords()).toEqual([savedRecord])
})

it.each(['bookmark', 'console'] as const)(
  'reports %s code copying only through top notices',
  async (kind) => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    const original = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    try {
      const { wrapper, panel } = await openDialog()
      wrapper.findComponent(ResonanceImportDialog).vm.$emit('copyScript', kind)
      await flushPromises()
      expect(writeText).toHaveBeenCalledOnce()
      expect(latestNotice(wrapper)?.tone).toBe('success')
      expect(panel.querySelector('[role="status"]')).toBeNull()
      writeText.mockRejectedValueOnce(new Error('clipboard denied'))
      wrapper.findComponent(ResonanceImportDialog).vm.$emit('copyScript', kind)
      await flushPromises()
      expect(latestNotice(wrapper)?.tone).toBe('error')
      expect(panel.querySelector('.data-import-error')).toBeNull()
    } finally {
      if (original) Object.defineProperty(navigator, 'clipboard', original)
      else delete (navigator as unknown as { clipboard?: unknown }).clipboard
    }
  }
)

it.each(['zh', 'en'] as const)(
  'uses explicit emphasis segments in the %s import tutorial',
  async (language) => {
    const { panel } = await openDialog(language)
    const emphasis = [...panel.querySelectorAll('.resonance-bookmark-emphasis')].map(
      (node) => node.textContent
    )
    expect(emphasis).toHaveLength(2)
    expect(emphasis[0]).toContain(language === 'zh' ? '在当前页面打开' : 'current tab')
    expect(emphasis[1]).toContain(language === 'zh' ? '电脑版 QQ 浏览器' : 'QQ Browser')
  }
)

it('reports failed resonance storage reads instead of only showing a notice', async () => {
  const error = new Error('read-fixture-failure')
  const capture = vi.spyOn(diagnosticReporter, 'reportError').mockReturnValue('test-event')
  vi.spyOn(resonanceStorage, 'loadResonanceRecords').mockRejectedValueOnce(error)
  const wrapper = mount(ResonanceRecords)
  wrappers.push(wrapper)
  await flushPromises()
  expect(capture).toHaveBeenCalledWith(error, { module: 'resonance', action: 'load' })
  expect(latestNotice(wrapper)?.tone).toBe('error')
})

it.each([false, true])(
  'expands resonance outfit forms without changing records (mobile=%s)',
  async (compact) => {
    vi.stubGlobal('matchMedia', () => ({
      matches: compact,
      addEventListener() {},
      removeEventListener() {}
    }))
    const { loadWardrobeCatalog } = await import('../../src/utils/wardrobe/wardrobeCatalog')
    const storage = await import('../../src/utils/wardrobe/wardrobeStorage')
    const catalog = await loadWardrobeCatalog()
    const original = catalog.byId.get(savedRecord.outfitId)!
    const data = [savedRecord, { ...savedRecord, id: 'second-record' }]
    await saveResonanceRecords(data)
    vi.spyOn(storage, 'loadWardrobe').mockResolvedValue({
      ...storage.emptyWardrobe(),
      entries: Object.fromEntries(
        original.parts.map((id) => [id, { owned: true, source: 'pearpal' as const }])
      ),
      updatedAt: '2026-10-29T00:00:00Z'
    })
    const wrapper = mount(ResonanceRecords, { attachTo: document.body })
    wrappers.push(wrapper)
    await vi.waitFor(() =>
      expect(
        wrapper.findAll('.resonance-outfit-preview button[aria-label="展开形态"]')
      ).toHaveLength(2)
    )
    const before = wrapper.findAll('.resonance-overall-summary').map((node) => node.text())
    const buttons = wrapper.findAll('.resonance-outfit-preview button[aria-label="展开形态"]')
    await buttons[0]!.trigger('click')
    await flushPromises()
    expect(document.querySelectorAll('.wardrobe-form-popover')).toHaveLength(1)
    expect(document.querySelectorAll('.wardrobe-form-popover .wardrobe-form-owned')).toHaveLength(1)
    await buttons[1]!.trigger('click')
    await flushPromises()
    expect(buttons[0]!.attributes('aria-expanded')).toBe('false')
    expect(buttons[1]!.attributes('aria-expanded')).toBe('true')
    expect(document.querySelectorAll('.wardrobe-form-popover')).toHaveLength(1)
    document.querySelectorAll<HTMLButtonElement>('.wardrobe-form-popover nav button')[1]!.click()
    await vi.waitFor(() => expect(document.querySelector('.wardrobe-dialog')).not.toBeNull())
    expect(document.querySelector('.wardrobe-detail-variant')?.textContent).toBe('焕新')
    expect(document.querySelector('.wardrobe-form-popover')).toBeNull()
    expect(wrapper.findAll('.resonance-overall-summary').map((node) => node.text())).toEqual(before)
    expect(await loadResonanceRecords()).toEqual(data)
  }
)

it('does not expose forms for unmatched outfit records', async () => {
  await saveResonanceRecords([{ ...savedRecord, id: '77:99999999', outfitId: '99999999' }])
  const wrapper = mount(ResonanceRecords)
  wrappers.push(wrapper)
  await flushPromises()
  await vi.waitFor(() => expect(wrapper.findAll('button.resonance-outfit-image')).toHaveLength(1))
  expect(wrapper.findComponent({ name: 'WardrobeFormPopover' }).exists()).toBe(false)
})

it('reads immediately and shows empty state without skeletons even during archive motion', async () => {
  vi.useFakeTimers()
  let complete!: (records: ResonanceRecord[]) => void
  const read = vi.spyOn(resonanceStorage, 'loadResonanceRecords').mockImplementation(
    () =>
      new Promise((resolve) => {
        complete = resolve
      })
  )
  const wrapper = mount(ResonanceRecords, {
    global: { provide: { [archiveMotionDeadlineKey as symbol]: ref(Date.now() + 280) } }
  })
  wrappers.push(wrapper)
  expect(read).toHaveBeenCalledOnce()
  expect(wrapper.find('[data-skeleton-card]').exists()).toBe(false)
  expect(wrapper.find('.resonance-empty').exists()).toBe(false)
  complete([])
  await flushPromises()
  expect(wrapper.find('.resonance-empty').exists()).toBe(true)
  expect(wrapper.find('[data-skeleton-card]').exists()).toBe(false)
  await vi.advanceTimersByTimeAsync(280)
  await flushPromises()
  expect(wrapper.find('[data-skeleton-card]').exists()).toBe(false)
  expect(read).toHaveBeenCalledOnce()
})
