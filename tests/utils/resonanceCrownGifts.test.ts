import { it, expect } from 'vitest'
import { parsePearpalResonance } from '../../src/utils/resonance/resonanceImport'
import { parseResonanceFile, createResonanceExport } from '../../src/utils/resonance/resonanceFile'
import { validateCloudRecords } from '../../src/utils/resonance/cloudSchema'
import { loadResonanceCatalog } from '../../src/utils/resonance/resonanceCatalog'
it('counts crown draws separately and assigns gifts to exact rounds', async () => {
  const c = await loadResonanceCatalog()
  const rows = [
    { result: '2020100529', rarity: 8, pool_cnt: 17, times_from_last_four_stars: 2 },
    { result: '2020100529', rarity: 8, pool_cnt: 35 }
  ]
  const gifts = [
    { card_pool_id: 83, reward_rarity: 8, reward_item_id: '2020100529', suit_round: 0 }
  ]
  const pulls = c.normalizePearpalPulls('83', rows, gifts)
  const records = c.buildResonanceRecords('83', pulls)
  expect(records[0].sets[0].parts.find((p) => p.id === '2020100529')).toMatchObject({
    gift: true,
    manual: true,
    pullNumber: 0
  })
  expect(records[0].sets[1].parts.find((p) => p.id === '2020100529')?.pullNumber).toBe(18)
  validateCloudRecords(records)
  expect((await parseResonanceFile(createResonanceExport(records))).records).toEqual(records)
  const second = c.buildResonanceRecords(
    '83',
    c.normalizePearpalPulls('83', rows, [{ ...gifts[0], suit_round: 1 }])
  )[0]
  expect(second.sets[0].parts.find((p) => p.id === '2020100529')?.pullNumber).toBe(18)
  expect(second.sets[1].parts.find((p) => p.id === '2020100529')?.gift).toBe(true)
  const giftOnly = await parsePearpalResonance({ info_from_self: { cloth_random_box_list: gifts } })
  expect(giftOnly.records[0].sets[0].parts.some((p) => p.gift)).toBe(true)
})
it('merges ten crown drops and two gifts into 12/12 at 180 pulls', async () => {
  const ids = [
    '2020100529',
    '2020200529',
    '2020600529',
    '2020710529',
    '2020720529',
    '2020770529',
    '2020790529',
    '2020890529',
    '2020900529',
    '2020920529'
  ]
  const raw = {
    info_from_self: {
      gacha_list: ids.map((result, i) => ({
        card_pool_id: 83,
        result,
        rarity: 8,
        pool_cnt: (i + 1) * 18 - 1,
        times_from_last_four_stars: 2
      })),
      cloth_random_box_list: ['2020760529', '2020940529'].map((reward_item_id) => ({
        card_pool_id: 83,
        reward_item_id,
        reward_rarity: 8,
        suit_round: 0
      }))
    }
  }
  const { records } = await parsePearpalResonance(raw)
  const set = records[0].sets[0]
  expect(set.parts.filter((p) => p.pullNumber > 0 || p.gift)).toHaveLength(12)
  expect(set.parts.filter((p) => p.gift)).toHaveLength(2)
  expect(set.totalPulls).toBe(180)
  expect(set.totalPulls / set.parts.filter((p) => p.pullNumber > 0).length).toBe(18)
  expect(records[0].sets[1].parts.every((p) => p.pullNumber === 0 && !p.gift)).toBe(true)
})
