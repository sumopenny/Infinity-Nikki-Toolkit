import { expect, it } from 'vitest'
import { ref } from 'vue'
import { useWardrobeFilters } from '../../src/composables/useWardrobeFilters'
import type { Language } from '../../src/i18n/types'
import type { WardrobeKind } from '../../src/utils/wardrobe/wardrobeCatalog'

it('defaults both wardrobe tabs to all and resets to all', () => {
  const tab = ref<WardrobeKind>('outfit')
  const filters = useWardrobeFilters(tab, ref<Language>('zh'))
  expect(filters.ownership.value).toBe('all')
  expect(filters.mobileFilterActive.value).toBe('all')

  filters.select('ownership', 'owned')
  tab.value = 'item'
  expect(filters.ownership.value).toBe('all')
  filters.select('ownership', 'none')

  tab.value = 'outfit'
  expect(filters.ownership.value).toBe('owned')
  filters.reset()
  expect(filters.ownership.value).toBe('all')

  tab.value = 'item'
  expect(filters.ownership.value).toBe('none')
  filters.reset()
  expect(filters.ownership.value).toBe('all')
})
