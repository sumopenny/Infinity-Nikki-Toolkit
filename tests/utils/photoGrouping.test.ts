import { computed, ref } from 'vue'
import { useAlbumViewModel } from '../../src/composables/useAlbumViewModel'
import { messages } from '../../src/i18n'
import { resourceName } from '../../src/utils/photo-params/resourceManifest'
import { describe, expect, it } from 'vitest'
import {
  groupDatesByYear,
  groupPhotosByAction,
  type DateGroup,
  type PhotoActionInfo,
  type PhotoItem
} from '../../src/utils/photoGrouping'

/** 创建只包含分组所需字段的日期测试数据。参数：dateKey 为日期，count 为照片数量。 */
function createDateGroup(dateKey: string, count: number): DateGroup {
  return {
    dateKey,
    year: dateKey.slice(0, 4),
    monthDay: dateKey.slice(5),
    displayDate: dateKey,
    photos: Array.from(
      { length: count },
      (_, index) => ({ id: `${dateKey}-${index}` }) as DateGroup['photos'][number]
    )
  }
}

describe('groupDatesByYear', () => {
  it('groups dates by year and month in descending order with accurate counts', () => {
    const result = groupDatesByYear([
      createDateGroup('2025-12-30', 1),
      createDateGroup('2026-06-02', 2),
      createDateGroup('2026-07-04', 3),
      createDateGroup('2026-07-01', 4)
    ])

    expect(result.map((year) => year.year)).toEqual(['2026', '2025'])
    expect(result[0].photoCount).toBe(9)
    expect(result[0].months.map((month) => month.month)).toEqual(['07', '06'])
    expect(result[0].months[0].photoCount).toBe(7)
    expect(result[0].months[0].dates.map((date) => date.dateKey)).toEqual([
      '2026-07-04',
      '2026-07-01'
    ])
  })
})

describe('groupPhotosByAction', () => {
  it('keeps action, no-action, and unparsed groups distinct and sorts action ids descending', () => {
    const photos = ['a', 'b', 'c', 'd'].map(
      (id, index) => ({ id, timestamp: index + 1 }) as PhotoItem
    )
    const info = new Map<string, PhotoActionInfo>([
      ['a', { status: 'action', actionId: '1340020002', actionName: '旧动作' }],
      ['b', { status: 'action', actionId: '13400200020', actionName: '新动作' }],
      ['c', { status: 'none' }],
      ['d', { status: 'unparsed' }]
    ])

    const result = groupPhotosByAction(photos, info, 'id', {
      none: '未使用动作',
      unparsed: '未解析'
    })
    expect(result.map((group) => group.actionId ?? group.actionName)).toEqual([
      '13400200020',
      '1340020002',
      '未使用动作',
      '未解析'
    ])
  })
})

it('sorts action groups by the displayed language even when names were cached in Chinese', () => {
  const language = ref<'zh' | 'en'>('zh')
  const ids = ['1340020002', '1340020003', '1340020004', '1340020005', '1340020008', '1340020009']
  const photos = ids.map((id, timestamp) => ({ id, name: id, timestamp, note: '' }) as PhotoItem)
  const actionInfo = new Map<string, PhotoActionInfo>(
    ids.map((id) => [
      id,
      {
        status: 'action',
        actionId: id,
        actionName: resourceName('pose', id, 'zh')
      }
    ])
  )
  const model = useAlbumViewModel({
    photos: ref(photos),
    outfits: ref([]),
    recentlyDeleted: ref([]),
    favoriteIds: ref(new Set()),
    activeView: ref('all'),
    activeOutfitFilter: ref('all'),
    searchQuery: ref(''),
    currentPreview: ref(null),
    thumbnailMode: ref('default'),
    outfitThumbnailMode: ref('default'),
    homeThumbnailMode: ref('default'),
    directoryState: ref({ type: 'none' }),
    language,
    locale: computed(() => messages[language.value]),
    actionInfo: ref(actionInfo),
    actionSort: ref('name')
  })
  for (const current of ['zh', 'en', 'zh'] as const) {
    language.value = current
    expect(model.actionGroups.value.map((group) => group.actionName)).toEqual(
      ids.map((id) => resourceName('pose', id, current)).sort((a, b) => a.localeCompare(b))
    )
  }
})
