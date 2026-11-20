import { flushPromises, mount } from '@vue/test-utils'
import { expect, it, vi } from 'vitest'
import OutfitSummaryDialog from '../../src/components/OutfitSummaryDialog.vue'
import type { OutfitItem } from '../../src/utils/outfit/outfitTypes'
import type { LookbookDecodeResult } from '../../src/utils/outfit/outfitCodeParser'
import * as parser from '../../src/utils/outfit/outfitCodeParser'

it('counts saved outfits separately, deduplicates worn items, and parses only on request', async () => {
  const code = 'a1B2c3D4e5F#'
  const cached: LookbookDecodeResult = {
    code,
    wearingClothes: [1020100001, 1020100001, 1020850001].map((itemId) => ({
      itemId,
      clothType: null,
      outfitId: null
    })),
    dyeItems: []
  }
  const read = vi
    .spyOn(parser, 'readCachedOutfitResult')
    .mockImplementation(async (key) => (key === code ? cached : null))
  const parse = vi.spyOn(parser, 'parseOutfitCode').mockResolvedValue(cached)
  const outfits = [code, code.slice(0, -1), '1I43NTCbOn0', ''].map((value, index) => ({
    id: String(index),
    code: value,
    tags: ['甜美']
  })) as OutfitItem[]
  const proto = HTMLDialogElement.prototype
  const { showModal, close } = proto
  proto.showModal = vi.fn()
  proto.close = vi.fn()
  const view = mount(OutfitSummaryDialog, {
    props: { outfits, language: 'zh' },
    global: { stubs: { teleport: true } }
  })
  try {
    await flushPromises()
    expect(read).toHaveBeenCalledTimes(2)
    expect(parse).not.toHaveBeenCalled()
    expect(view.get('.coverage').text()).toContain('已解析 2 / 4 套')
    await view.get('button.summary-tag-row').trigger('click')
    expect(view.emitted('tag')).toEqual([['甜美']])
    await view.get('[data-summary-tab="clothes"]').trigger('click')
    expect(view.findAll('.summary-row')).toHaveLength(1)
    expect(view.get('.summary-row').text()).toContain('2 套 · 100%')
    await view.get('[data-summary-tab="overview"]').trigger('click')
    await view.get('.parse-action').trigger('click')
    await flushPromises()
    expect(view.find('.parse-action').exists()).toBe(false)
    expect(parse).toHaveBeenCalledOnce()
    expect(parse).toHaveBeenCalledWith('1I43NTCbOn0#')
    await view.get('[data-summary-tab="makeup"]').trigger('click')
    expect(view.findAll('.summary-row')).toHaveLength(1)
    expect(view.get('.summary-row').text()).toContain('3 套')
  } finally {
    view.unmount()
    Object.assign(proto, { showModal, close })
    vi.restoreAllMocks()
  }
})

it('shows all saved outfits and retries the same unique code', async () => {
  await import('../../src/components/OutfitSummaryTrendChart.vue')
  const recentCode = 'a1B2c3D4e5F#'
  const oldCode = '1I43NTCbOn0#'
  const today = new Date()
  const old = new Date(today)
  old.setMonth(old.getMonth() - 2, 1)
  const cached: LookbookDecodeResult = {
    code: recentCode,
    wearingClothes: [{ itemId: 1020100001, clothType: 10, outfitId: null }],
    dyeItems: []
  }
  const outfits = [
    { id: 'one', code: recentCode, tags: ['甜美'], createdAt: today.toISOString() },
    { id: 'two', code: recentCode.slice(0, -1), tags: ['甜美'], createdAt: today.toISOString() },
    { id: 'three', code: '', tags: [], createdAt: today.toISOString() },
    { id: 'old', code: oldCode, tags: ['甜美'], createdAt: old.toISOString() }
  ] as OutfitItem[]
  const read = vi
    .spyOn(parser, 'readCachedOutfitResult')
    .mockImplementation(async (code) => (code === oldCode ? { ...cached, code } : null))
  const parse = vi
    .spyOn(parser, 'parseOutfitCode')
    .mockRejectedValueOnce(new Error('unavailable'))
    .mockResolvedValueOnce(cached)
  const proto = HTMLDialogElement.prototype
  const { showModal, close } = proto
  proto.showModal = vi.fn()
  proto.close = vi.fn()
  const view = mount(OutfitSummaryDialog, {
    props: { outfits, language: 'zh' },
    global: { stubs: { teleport: true } }
  })
  try {
    await flushPromises()
    expect(view.find('.range-menu').exists()).toBe(false)
    expect(read).toHaveBeenCalledTimes(2)
    expect(parse).not.toHaveBeenCalled()
    expect(view.get('.coverage').text()).toContain('已解析 1 / 4 套')
    expect(view.find('.summary-trend-detail select').exists()).toBe(false)
    await vi.waitFor(() => expect(view.findAll('.trend-period-target')).toHaveLength(3))
    const periodTargets = view.findAll('.trend-period-target')
    await periodTargets[1].trigger('pointerenter', { pointerType: 'mouse' })
    expect(view.get('.summary-period-readout').text()).toContain('0 套')
    await view.get('.trend-period-targets').trigger('pointerleave', { pointerType: 'mouse' })
    expect(view.get('.summary-period-readout').text()).toBe('')
    await periodTargets[2].trigger('pointerenter', { pointerType: 'touch' })
    expect(view.get('.summary-period-readout').text()).toBe('')
    await periodTargets[2].trigger('click')
    expect(view.get('.summary-period-readout').text()).toContain('3 套')
    const tagRows = view.findAll('.summary-tag-row')
    expect(tagRows[0].text()).toContain('3 套 · 75%')
    await tagRows[1].trigger('click')
    expect(view.emitted('tag')).toEqual([['']])

    await view.get('.parse-action').trigger('click')
    await flushPromises()
    expect(view.get('.coverage-key').text()).toContain('解析失败 2')
    expect(view.get('.parse-action').text()).toContain('重试 2 套')
    await view.get('.parse-action').trigger('click')
    await flushPromises()
    expect(parse.mock.calls).toEqual([[recentCode], [recentCode]])
    expect(view.get('.coverage').text()).toContain('已解析 3 / 4 套')
    expect(view.find('.parse-action').exists()).toBe(false)
    await view.get('[data-summary-tab="clothes"]').trigger('click')
    expect(view.get('.summary-row').text()).toContain('3 套 · 100%')
  } finally {
    view.unmount()
    Object.assign(proto, { showModal, close })
    vi.restoreAllMocks()
  }
})
