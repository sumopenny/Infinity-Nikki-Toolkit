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
    expect(view.get('.coverage').text()).toContain('已解析 2 套')
    await view.get('button.summary-row').trigger('click')
    expect(view.emitted('tag')).toEqual([['甜美']])
    await view.findAll('nav button')[1].trigger('click')
    expect(view.findAll('.summary-row')).toHaveLength(1)
    expect(view.get('.summary-row').text()).toContain('2 套')
    await view.get('.parse-action').trigger('click')
    await flushPromises()
    expect(view.find('.parse-action').exists()).toBe(false)
    expect(parse).toHaveBeenCalledOnce()
    expect(parse).toHaveBeenCalledWith('1I43NTCbOn0#')
    await view.findAll('nav button')[2].trigger('click')
    expect(view.findAll('.summary-row')).toHaveLength(1)
    expect(view.get('.summary-row').text()).toContain('3 套')
  } finally {
    view.unmount()
    Object.assign(proto, { showModal, close })
    vi.restoreAllMocks()
  }
})
