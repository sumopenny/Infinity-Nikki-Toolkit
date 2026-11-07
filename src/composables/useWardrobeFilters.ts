import { computed, ref, type Ref } from 'vue'
import type { Language } from '../i18n/types'
import {
  wardrobeStyleLabels,
  type WardrobeKind,
  type WardrobeStyle
} from '../utils/wardrobe/wardrobeCatalog'
import {
  hasIncompleteWardrobeOwnership,
  wardrobeGameVersionOptions,
  wardrobeSourceOptions,
  wardrobeTagOptions
} from '../utils/wardrobe/wardrobeFilters'
import {
  wardrobeCategoryLabels,
  wardrobeVariantLabels
} from '../utils/wardrobe/wardrobePresentation'

export type OwnershipFilter = 'all' | 'owned' | 'partial' | 'none' | 'unknown'
export interface WardrobeFilters {
  ownership: OwnershipFilter
  rarity: string
  variant: string
  version: string
  style: 'all' | WardrobeStyle
  source: string
  tag: string
  category: string
  sort: 'catalog' | 'name' | 'progress'
}
export type FilterKey = keyof WardrobeFilters

export function useWardrobeFilters(tab: Ref<WardrobeKind>, language: Ref<Language>) {
  const text = (zh: string, en: string) => (language.value === 'zh' ? zh : en)
  const variants = computed(() => wardrobeVariantLabels[language.value])
  const categories = computed(() => wardrobeCategoryLabels[language.value])
  const createFilters = (): WardrobeFilters => ({
    ownership: 'all',
    rarity: 'all',
    variant: 'all',
    version: 'all',
    style: 'all',
    source: 'all',
    tag: 'all',
    category: 'all',
    sort: 'catalog'
  })
  // 套装和部件各自保存筛选条件，切换分类只切换当前使用的状态。
  const filtersByTab = ref<Record<WardrobeKind, WardrobeFilters>>({
    outfit: createFilters(),
    item: createFilters()
  })
  function currentFilter<K extends FilterKey>(key: K) {
    return computed({
      get: () => filtersByTab.value[tab.value][key],
      set: (value: WardrobeFilters[K]) => {
        filtersByTab.value[tab.value][key] = value
      }
    })
  }
  const ownership = currentFilter('ownership'),
    rarity = currentFilter('rarity'),
    variant = currentFilter('variant'),
    version = currentFilter('version'),
    style = currentFilter('style'),
    source = currentFilter('source'),
    tag = currentFilter('tag'),
    category = currentFilter('category'),
    sort = currentFilter('sort')
  const filterValues = { ownership, rarity, variant, version, style, source, tag, category, sort }
  const filterOptions = computed(() => {
    const all = { value: 'all', label: text('全部', 'All') }
    return [
      {
        key: 'ownership',
        label: text('状态', 'Status'),
        options: [
          all,
          { value: 'owned', label: text('已拥有', 'Owned') },
          ...(tab.value === 'outfit'
            ? [{ value: 'partial', label: text('收集中', 'Partial') }]
            : []),
          { value: 'none', label: text('未拥有', 'Not owned') },
          ...(tab.value === 'item' ? [{ value: 'unknown', label: text('未知', 'Unknown') }] : [])
        ]
      },
      {
        key: 'rarity',
        label: text('星级', 'Rarity'),
        options: [all, ...[5, 4, 3, 2, 1].map((n) => ({ value: String(n), label: n + ' ★' }))]
      },
      {
        key: 'variant',
        label: text('进化阶段', 'Evolution stage'),
        options: [all, ...variants.value.map((label, index) => ({ value: String(index), label }))]
      },
      {
        key: 'version',
        label: text('游戏版本', 'Game version'),
        options: [all, ...wardrobeGameVersionOptions(language.value)]
      },
      {
        key: 'style',
        label: text('风格', 'Style'),
        options: [
          all,
          ...(['elegant', 'fresh', 'sweet', 'sexy', 'cool'] as const).map((value) => ({
            value,
            label: wardrobeStyleLabels[value][language.value]
          }))
        ]
      },
      ...(tab.value === 'item'
        ? [
            {
              key: 'category',
              label: text('部位', 'Category'),
              options: [
                all,
                ...categories.value.map((label, index) => ({ value: String(index), label }))
              ]
            }
          ]
        : []),
      {
        key: 'source',
        label: text('获取来源', 'Source'),
        options: [all, ...wardrobeSourceOptions(tab.value, language.value)]
      },
      {
        key: 'tag',
        label: text('标签', 'Tag'),
        options: [all, ...wardrobeTagOptions(language.value)]
      },
      {
        key: 'sort',
        label: text('排序', 'Sort'),
        options: [
          { value: 'catalog', label: text('图鉴顺序', 'Catalog order') },
          { value: 'name', label: text('名称', 'Name') },
          { value: 'progress', label: text('收集进度', 'Progress') }
        ]
      }
    ] as {
      key: FilterKey
      label: string
      options: { value: string; label: string; separatorBefore?: boolean }[]
    }[]
  })
  const selectedMobileFilters = computed(() =>
    filterOptions.value.filter(({ key }) => {
      const value = filterValues[key].value
      return value !== (key === 'sort' ? 'catalog' : 'all')
    })
  )
  const mobileFilterEntries = computed(() => {
    const selected = selectedMobileFilters.value
    const selectedLabel =
      selected.length === 1
        ? (selected[0]?.options.find(
            (option) => option.value === filterValues[selected[0]!.key].value
          )?.label ?? text('已筛选', 'Filtered'))
        : text('已筛选', 'Filtered')
    return [
      { key: 'all', label: text('全部筛选', 'All filters') },
      { key: 'active', label: selectedLabel }
    ]
  })
  const mobileFilterActive = computed(() => (selectedMobileFilters.value.length ? 'active' : 'all'))

  const automaticOwnership = ref<OwnershipFilter | null>(null)
  function select(key: FilterKey, value: string) {
    // Menu values cross a string boundary: validate against the current options first.
    if (
      !filterOptions.value
        .find((filter) => filter.key === key)
        ?.options.some((option) => option.value === value)
    )
      return
    if (key === 'ownership' && tab.value === 'item') automaticOwnership.value = null
    if (key === 'source' && tab.value === 'item') {
      if (hasIncompleteWardrobeOwnership(value)) {
        if (automaticOwnership.value === null) automaticOwnership.value = ownership.value
        ownership.value = 'unknown'
      } else if (automaticOwnership.value !== null) {
        ownership.value = automaticOwnership.value
        automaticOwnership.value = null
      }
    }
    Object.assign(filtersByTab.value[tab.value], { [key]: value })
  }
  function reset() {
    Object.assign(filtersByTab.value[tab.value], createFilters())
    if (tab.value === 'item') automaticOwnership.value = null
  }
  return {
    ...filterValues,
    filterValues,
    filterOptions,
    mobileFilterEntries,
    mobileFilterActive,
    select,
    reset
  }
}
