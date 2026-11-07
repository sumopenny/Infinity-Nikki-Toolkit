import { DOMWrapper, flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, provide, ref } from 'vue'
import { messages } from '../../src/i18n'
import AlbumViewSwitcher from '../../src/components/AlbumViewSwitcher.vue'
import TopBar from '../../src/components/TopBar.vue'
import AdaptiveFilterPanel from '../../src/components/AdaptiveFilterPanel.vue'
import CollectionFilterBar from '../../src/components/CollectionFilterBar.vue'
import CollectionActions from '../../src/components/CollectionActions.vue'
import OutfitSidebar from '../../src/components/OutfitSidebar.vue'
import SelectionBar from '../../src/components/SelectionBar.vue'
import ResonanceSidebar from '../../src/components/ResonanceSidebar.vue'

const wrappers: { unmount: () => void }[] = []
beforeEach(() => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
  )
})
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

describe('mobile navigation and collection controls', () => {
  it('moves one like instance between active tag rows and desktop while a request is pending', async () => {
    let compact = true
    const layoutListeners = new Set<() => void>()
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({
        get matches() {
          return compact
        },
        addEventListener: (_event: string, listener: () => void) => layoutListeners.add(listener),
        removeEventListener: (_event: string, listener: () => void) =>
          layoutListeners.delete(listener)
      }))
    )
    let resolvePost!: (response: Response) => void
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ count: 12000 }) })
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            resolvePost = resolve
          })
      )
    vi.stubGlobal('fetch', fetchMock)
    const view = ref('outfits')
    const language = ref<'zh' | 'en'>('zh')
    const root = defineComponent({
      components: { TopBar, CollectionFilterBar },
      setup() {
        provide('mobileLikeTarget', ref<HTMLElement | null>(null))
        return {
          view,
          language,
          topBarProps: {
            directoryName: '',
            isLoading: false,
            isDeleting: false,
            hasAlbumDirectory: false,
            hasX6GameAuthorization: false,
            thumbnailMode: 'default',
            thumbnailModeOptions: [],
            themeMode: 'light',
            messages: messages.zh.topBar
          }
        }
      },
      template: `<div>
        <TopBar v-bind="topBarProps" :language="language" :active-view="view" />
        <CollectionFilterBar v-if="view !== 'favorites' && view !== 'trash'" :key="view"
          tag-picker :entries="[{key:'all',label:'All'}]" active="all" :count="0" :language="language" />
        <section v-show="view === 'favorites'" class="retained-camera">
          <CollectionFilterBar tag-picker :like-active="view === 'favorites'"
            :entries="[{key:'all',label:'All'}]" active="all" :count="0" :language="language" />
        </section>
      </div>`
    })
    const wrapper = mount(root, { attachTo: document.body })
    wrappers.push(wrapper)
    await flushPromises()
    const button = document.querySelector<HTMLButtonElement>(
      '.collection-like-target .like-counter'
    )!
    expect(button).not.toBeNull()
    expect(button.nextElementSibling).toBeNull()
    expect(
      button.parentElement!.nextElementSibling!.classList.contains('collection-tag-select')
    ).toBe(true)
    expect(document.querySelector('.mobile-header-row .like-counter')).toBeNull()
    expect(document.querySelectorAll('.like-counter')).toHaveLength(1)
    expect(button.querySelector('.like-counter-number')!.textContent).toBe('12,000')
    expect(button.getAttribute('aria-label')).toContain('12,000')
    button.click()
    await flushPromises()
    expect(fetchMock).toHaveBeenCalledTimes(2)
    for (const nextView of ['home', 'resonance', 'favorites', 'outfits']) {
      view.value = nextView
      await flushPromises()
      expect(document.querySelector('.collection-like-target .like-counter')).toBe(button)
      expect(document.querySelectorAll('.like-counter')).toHaveLength(1)
      expect(button.getAttribute('aria-label')).toContain('12,001')
      expect(fetchMock).toHaveBeenCalledTimes(2)
    }
    view.value = 'trash'
    await flushPromises()
    expect(document.querySelector('.header-actions .like-counter')).toBe(button)
    expect(document.querySelector('.retained-camera .like-counter')).toBeNull()
    view.value = 'favorites'
    await flushPromises()
    expect(document.querySelector('.retained-camera .like-counter')).toBe(button)
    compact = false
    layoutListeners.forEach((listener) => listener())
    await flushPromises()
    expect(document.querySelector('.header-actions .like-counter')).toBe(button)
    resolvePost({ ok: true, json: async () => ({ count: 12005 }) } as Response)
    await flushPromises()
    expect(button.querySelector('.like-counter-number')!.textContent).toBe('12,005')
    compact = true
    layoutListeners.forEach((listener) => listener())
    language.value = 'en'
    await flushPromises()
    expect(document.querySelector('.retained-camera .like-counter')).toBe(button)
    expect(button.querySelector('.like-counter-number')!.textContent).toBe('12,005')
    expect(button.getAttribute('aria-label')).toContain('12,005')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('navigates to resonance once even after a compatibility hover event', async () => {
    const wrapper = mount(AlbumViewSwitcher, {
      props: {
        activeView: 'outfits',
        allCount: 0,
        outfitsCount: 0,
        homeSchemesCount: 0,
        favoriteCount: 0,
        trashCount: 0,
        outfitLabel: '搭配码',
        disabled: false,
        messages: messages.zh.viewNav
      }
    })
    wrappers.push(wrapper)
    const entry = wrapper.findAll('.album-view-item')[3]!
    await entry.trigger('pointerenter', { pointerType: 'touch' })
    await entry.trigger('mouseenter')
    await entry.get('button').trigger('click')
    expect(wrapper.emitted('changeView')).toBeUndefined()
    await wrapper.get('.resonance-nav-menu [role=menuitem]').trigger('click')
    expect(wrapper.emitted('changeView')).toEqual([['resonance']])
    expect(wrapper.find('.resonance-nav-menu').exists()).toBe(false)
  })

  it('opens More from the mobile header and omits unsupported album actions', async () => {
    const wrapper = mount(TopBar, {
      attachTo: document.body,
      props: {
        directoryName: '',
        isLoading: false,
        isDeleting: false,
        hasAlbumDirectory: false,
        hasX6GameAuthorization: false,
        thumbnailMode: 'default',
        thumbnailModeOptions: [],
        themeMode: 'light',
        language: 'zh',
        messages: messages.zh.topBar,
        viewMessages: messages.zh.viewNav,
        directorySupported: false
      },
      global: { stubs: { transition: false } }
    })
    wrappers.push(wrapper)
    await wrapper.get('.mobile-header-row button[aria-label="打开更多菜单"]').trigger('click')
    await flushPromises()
    expect(
      wrapper.findAll('.mobile-header-row button').map((button) => button.attributes('aria-label'))
    ).toEqual(['搜索当前页面', messages.zh.topBar.viewMenuAria, messages.zh.topBar.moreMenuAria])
    expect(wrapper.get('.mobile-header-row button').find('svg.lucide-search').exists()).toBe(true)
    const sheet = document.querySelector('.mobile-menu-sheet')!
    expect(sheet).not.toBeNull()
    expect(sheet.textContent).toContain(messages.zh.topBar.importAllData)
    expect(sheet.textContent).not.toContain('显示、主题与语言')
    expect(
      [...sheet.querySelectorAll('button')].some(
        (button) => button.textContent === messages.zh.viewNav.allPhotos
      )
    ).toBe(false)
    expect(document.body.style.overflow).toBe('clip')
    wrapper.vm.closeMenus()
    await flushPromises()
    await vi.waitFor(() => expect(document.querySelector('.mobile-menu-sheet')).toBeNull())
    await vi.waitFor(() => expect(document.body.style.overflow).not.toBe('clip'))
    await wrapper.get('.mobile-header-row button[aria-label="打开视图菜单"]').trigger('click')
    await flushPromises()
    expect(document.querySelector('.view-dropdown')).not.toBeNull()
    expect(
      wrapper
        .get('.mobile-header-row button[aria-label="打开更多菜单"]')
        .attributes('aria-expanded')
    ).toBe('false')
    expect(document.querySelector('.view-dropdown')!.textContent).toContain(
      messages.zh.topBar.thumbnailRatio
    )
  })

  it.each([true, false])(
    'handles independent ratio and size choices without disabling theme or language (compact=%s)',
    async (compact) => {
      vi.stubGlobal(
        'matchMedia',
        vi.fn(() => ({ matches: compact, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
      )
      const wrapper = mount(TopBar, {
        attachTo: document.body,
        props: {
          directoryName: '',
          isLoading: false,
          isDeleting: false,
          hasAlbumDirectory: false,
          hasX6GameAuthorization: false,
          thumbnailMode: 'default',
          thumbnailModeOptions: [
            { value: 'default', label: '1:1' },
            { value: 'wide', label: '16:9' },
            { value: 'portrait-standard', label: '3:4' }
          ],
          thumbnailModeDisabled: true,
          thumbnailSizeDisabled: true,
          themeMode: 'light',
          language: 'zh',
          messages: messages.zh.topBar
        }
      })
      wrappers.push(wrapper)
      await wrapper
        .get(compact ? '.mobile-header-row button[aria-label="打开视图菜单"]' : '.view-menu-button')
        .trigger('click')
      await flushPromises()
      let options = [...document.querySelectorAll<HTMLButtonElement>('.thumbnail-options button')]
      expect(options).toHaveLength(0)
      expect(options.every((button) => button.disabled)).toBe(true)
      expect(
        [...document.querySelectorAll<HTMLButtonElement>('.thumbnail-size-options button')].every(
          (button) => button.disabled
        )
      ).toBe(true)
      expect(wrapper.emitted('changeThumbnailMode')).toBeUndefined()
      expect(
        [...document.querySelectorAll<HTMLButtonElement>('.view-toggle-option')].every(
          (button) => !button.disabled
        )
      ).toBe(true)
      await wrapper.setProps({ thumbnailModeDisabled: false, thumbnailSizeDisabled: false })
      options = [...document.querySelectorAll<HTMLButtonElement>('.thumbnail-options button')]
      expect(options).toHaveLength(3)
      expect(options[0]!.disabled).toBe(false)
      expect(options[1]!.disabled).toBe(false)
      expect(options[2]!.disabled).toBe(false)
      const sizes = [
        ...document.querySelectorAll<HTMLButtonElement>('.thumbnail-size-options button')
      ]
      expect(sizes.map((button) => button.textContent?.trim())).toEqual(['小', '中', '大'])
      expect(sizes.every((button) => !button.disabled)).toBe(true)
      sizes[0]!.click()
      expect(wrapper.emitted('changeThumbnailSize')).toEqual([['small']])
      options[1]!.click()
      expect(wrapper.emitted('changeThumbnailMode')).toEqual([['wide']])
    }
  )

  it('uses a separate search popover with clear, close and menu/view coordination', async () => {
    let finishLeave = () => {}
    const transitionStub = defineComponent({
      props: { name: String, css: Boolean },
      emits: ['after-leave', 'before-enter', 'before-leave'],
      setup(props, { emit, slots }) {
        if (props.name === 'mobile-search-popover') finishLeave = () => emit('after-leave')
        return () => slots.default?.()
      }
    })
    const wrapper = mount(TopBar, {
      attachTo: document.body,
      props: {
        directoryName: '',
        isLoading: false,
        isDeleting: false,
        hasAlbumDirectory: false,
        hasX6GameAuthorization: false,
        thumbnailMode: 'default',
        thumbnailModeOptions: [],
        themeMode: 'light',
        language: 'zh',
        messages: messages.zh.topBar,
        activeView: 'outfits',
        searchQuery: ''
      },
      global: {
        stubs: {
          transition: transitionStub
        }
      }
    })
    wrappers.push(wrapper)
    const popup = () =>
      new DOMWrapper(document.querySelector<HTMLElement>('.mobile-header-search')!)
    const search = wrapper.get('.mobile-header-row button[aria-label="搜索当前页面"]')
    await search.trigger('click')
    await flushPromises()
    expect(document.querySelector('.mobile-header-search')?.closest('.app-header')).toBeNull()
    expect(document.activeElement).toBe(popup().get('input').element)
    await popup().get('input').setValue('花')
    expect(wrapper.emitted('updateSearch')).toEqual([['花']])
    await wrapper.setProps({ searchQuery: '花' })
    expect(search.classes()).toContain('has-search')
    await popup().get('button[aria-label="关闭搜索"]').trigger('click')
    expect(Boolean(document.querySelector('.mobile-header-search'))).toBe(false)
    expect(document.activeElement).not.toBe(search.element)
    finishLeave()
    expect(document.activeElement).toBe(search.element)
    expect(wrapper.emitted('updateSearch')).toHaveLength(1)
    await search.trigger('click')
    // 模拟清除按钮在事件冒泡前卸载，点击仍应被认作浮层内部操作。
    const clearButton = popup().get('button[aria-label="清除搜索"]')
    clearButton.element.addEventListener('click', () => clearButton.element.remove(), {
      once: true
    })
    await clearButton.get('svg').trigger('click')
    expect(wrapper.emitted('updateSearch')?.at(-1)).toEqual([''])
    await wrapper.setProps({ searchQuery: '' })
    expect(Boolean(document.querySelector('.mobile-header-search'))).toBe(true)
    expect(document.activeElement).toBe(popup().get('input').element)
    await wrapper.get('.mobile-header-row button[aria-label="打开视图菜单"]').trigger('click')
    await flushPromises()
    expect(Boolean(document.querySelector('.mobile-header-search'))).toBe(false)
    expect(document.querySelector('.view-dropdown')).not.toBeNull()
    const menuFocus = document.activeElement
    finishLeave()
    expect(document.activeElement).toBe(menuFocus)
    await search.trigger('click')
    await flushPromises()
    expect(document.querySelector('.view-dropdown')).toBeNull()
    expect(Boolean(document.querySelector('.mobile-header-search'))).toBe(true)
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await flushPromises()
    expect(Boolean(document.querySelector('.mobile-header-search'))).toBe(false)
    finishLeave()
    expect(document.activeElement).toBe(search.element)
    await search.trigger('click')
    document.body.click()
    await flushPromises()
    expect(Boolean(document.querySelector('.mobile-header-search'))).toBe(false)
    await search.trigger('click')
    await wrapper.get('.brand-lockup').trigger('click')
    expect(Boolean(document.querySelector('.mobile-header-search'))).toBe(false)
    await search.trigger('click')
    await wrapper.setProps({ activeView: 'home' })
    expect(Boolean(document.querySelector('.mobile-header-search'))).toBe(false)
    // 显式关闭尚未完成时切换菜单，旧动画不能将焦点抢回搜索按钮。
    await search.trigger('click')
    await popup().get('button[aria-label="关闭搜索"]').trigger('click')
    await wrapper.get('.mobile-header-row button[aria-label="打开视图菜单"]').trigger('click')
    await flushPromises()
    const focusAfterSwitch = document.activeElement
    finishLeave()
    expect(document.activeElement).toBe(focusAfterSwitch)
    expect(document.activeElement).not.toBe(search.element)
  })

  it('keeps the full filter slot mounted when switching between the desktop and mobile presentations', async () => {
    const wrapper = mount(AdaptiveFilterPanel, {
      attachTo: document.body,
      props: {
        compact: false,
        open: false,
        title: '筛选',
        closeLabel: '关闭',
        applyLabel: '查看结果'
      },
      slots: { default: '<input value="保留输入" data-filter-input />' }
    })
    wrappers.push(wrapper)
    const input = document.querySelector('[data-filter-input]')
    await wrapper.setProps({ compact: true, open: true })
    expect(document.querySelector('[data-filter-input]')).toBe(input)
    expect(document.querySelector('[role="dialog"]')).not.toBeNull()
    await wrapper.getComponent(AdaptiveFilterPanel).vm.$nextTick()
    document.querySelector<HTMLButtonElement>('.mobile-filter-panel > footer button')!.click()
    expect(wrapper.emitted('close')).toHaveLength(1)
    await wrapper.setProps({ open: false })
    expect(document.querySelector('[data-filter-input]')).toBe(input)
  })

  it('limits forty quick categories while keeping a selected distant tag visible', async () => {
    const wrapper = mount(CollectionFilterBar, {
      props: {
        entries: Array.from({ length: 40 }, (_, i) => ({ key: String(i), label: `标签${i}` })),
        active: '39',
        count: 2,
        language: 'zh'
      }
    })
    wrappers.push(wrapper)
    expect(wrapper.findAll('.collection-filter-chips button')).toHaveLength(4)
    expect(wrapper.get('[aria-pressed="true"]').text()).toBe('标签39')
    await wrapper.get('.collection-filter-summary button').trigger('click')
    expect(wrapper.emitted('clear')).toHaveLength(1)
    await wrapper.get('.collection-filter-open').trigger('click')
    expect(wrapper.emitted('open')).toHaveLength(1)
  })

  it('offers Add beside search before management and keeps drag sorting', async () => {
    const wrapper = mount(OutfitSidebar, {
      props: {
        outfits: [],
        tags: ['甜美', '帅气'],
        activeFilter: 'all',
        disabled: false,
        messages: messages.zh.outfit
      }
    })
    wrappers.push(wrapper)
    expect(wrapper.find('.outfit-delete-tag').exists()).toBe(false)
    expect(wrapper.find('.outfit-tag-drag-handle').exists()).toBe(false)
    expect(wrapper.find('.tag-order-buttons').exists()).toBe(false)
    expect(wrapper.get('.outfit-sidebar-heading').find('.tag-picker-search').exists()).toBe(true)
    await wrapper.get('.outfit-sidebar-heading .outfit-add-tag-toggle').trigger('click')
    const form = document.querySelector<HTMLFormElement>('.outfit-tag-editor-popover')!
    const input = form.querySelector('input')!
    input.value = '清新'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await flushPromises()
    expect(wrapper.emitted('addTag')).toEqual([['清新']])
    await wrapper.get('.tag-manage-toggle').trigger('click')
    expect(wrapper.find('.outfit-sidebar-heading').exists()).toBe(false)
    expect(wrapper.find('.tag-picker-search').exists()).toBe(false)
    expect(wrapper.find('.outfit-add-tag-toggle').exists()).toBe(false)
    expect(document.querySelector('.outfit-tag-editor-popover')).toBeNull()
    const rows = wrapper.findAll('[data-outfit-tag]')
    const target = rows[1]!.element
    const original = document.elementFromPoint
    Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => target })
    try {
      await rows[0]!.get('.outfit-tag-drag-handle').trigger('pointerdown', { button: 0 })
      window.dispatchEvent(new MouseEvent('pointermove', { clientX: 10, clientY: 10 }))
      window.dispatchEvent(new MouseEvent('pointerup'))
      await flushPromises()
      expect(wrapper.emitted('reorderTags')).toEqual([[['帅气', '甜美']]])
    } finally {
      if (original)
        Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: original })
      else Reflect.deleteProperty(document, 'elementFromPoint')
    }
    await wrapper.setProps({ disabled: true })
    expect(
      wrapper
        .findAll('.outfit-tag-drag-handle')
        .every((button) => button.attributes('disabled') !== undefined)
    ).toBe(true)
    await wrapper.setProps({ disabled: false })
    await wrapper.get('.tag-manage-toggle').trigger('click')
    await wrapper.setProps({ disabled: true })
    expect(wrapper.get('.outfit-add-tag-toggle').attributes('disabled')).toBeDefined()
  })

  it('collects forty tags into one entry and shows the selected label and inline clear action', async () => {
    const entries = [
      { key: 'all', label: '全部' },
      ...Array.from({ length: 40 }, (_, i) => ({ key: `tag:${i}`, label: `标签${i}` }))
    ]
    const wrapper = mount(CollectionFilterBar, {
      props: { entries, active: 'all', count: 40, language: 'zh', tagPicker: true }
    })
    wrappers.push(wrapper)
    expect(wrapper.find('.collection-filter-chips').exists()).toBe(false)
    expect(wrapper.find('.collection-filter-summary').exists()).toBe(false)
    expect(wrapper.get('.collection-tag-select').text()).toBe('全部标签')
    expect(wrapper.find('.collection-tag-clear').exists()).toBe(false)
    await wrapper.get('.collection-tag-select').trigger('click')
    expect(wrapper.find('.collection-filter-open').exists()).toBe(false)
    expect(wrapper.emitted('open')).toHaveLength(1)
    await wrapper.setProps({ active: 'tag:39', count: 2 })
    expect(wrapper.get('.collection-tag-select').text()).toBe('标签39')
    expect(wrapper.get('.collection-tag-count').text()).toBe('2 项')
    await wrapper.get('.collection-tag-clear').trigger('click')
    expect(wrapper.emitted('clear')).toHaveLength(1)
    await wrapper.setProps({ disabled: true, language: 'en', active: 'all' })
    expect(wrapper.get('.collection-tag-select').text()).toBe('All tags')
    expect(
      wrapper.findAll('button').every((button) => button.attributes('disabled') !== undefined)
    ).toBe(true)
  })

  it('counts full collections by first tag and updates counts independently of tag search', async () => {
    const wrapper = mount(OutfitSidebar, {
      props: {
        outfits: [
          { code: ' ', tags: ['A', 'B'] },
          { code: 'CODE', tags: ['A'] },
          { code: '', tags: [] }
        ],
        tags: ['A', 'B'],
        activeFilter: 'all',
        disabled: false,
        messages: messages.zh.outfit,
        pickerOpen: true
      }
    })
    wrappers.push(wrapper)
    const totals = () =>
      wrapper.findAll('.outfit-filter-list > button small').map((item) => item.text())
    expect(totals()).toEqual(['3', '2', '1'])
    expect(wrapper.get('[data-outfit-tag="A"] small').text()).toBe('2')
    expect(wrapper.get('[data-outfit-tag="B"] small').text()).toBe('0')
    await wrapper.get('.tag-picker-search input').setValue('B')
    expect(totals()).toEqual(['3', '2', '1'])
    expect(wrapper.get('[data-outfit-tag="B"] small').text()).toBe('0')
    await wrapper.setProps({ outfits: [{ code: 'CODE', tags: ['B', 'A'] }] })
    expect(totals()).toEqual(['1', '0', '0'])
    expect(wrapper.get('[data-outfit-tag="B"] small').text()).toBe('1')
  })

  it('searches tags without mutating their order and closes only after ordinary selection', async () => {
    const wrapper = mount(OutfitSidebar, {
      props: {
        outfits: [],
        tags: ['甜美', '帅气', 'Warm'],
        activeFilter: 'all',
        disabled: false,
        messages: messages.zh.outfit,
        pickerOpen: true
      }
    })
    wrappers.push(wrapper)
    await wrapper.get('.tag-picker-search input').setValue('warm')
    expect(
      wrapper.findAll('[data-outfit-tag]').map((row) => row.attributes('data-outfit-tag'))
    ).toEqual(['Warm'])
    await wrapper.get('[data-outfit-tag="Warm"] .outfit-filter-button').trigger('click')
    expect(wrapper.emitted('changeFilter')).toEqual([['tag:Warm']])
    expect(wrapper.emitted('filterSelected')).toHaveLength(1)
    await wrapper.get('.tag-picker-search input').setValue('不存在')
    expect(wrapper.get('.tag-picker-empty').text()).toBe('没有匹配的标签')
    expect(wrapper.findAll('.outfit-filter-list > button')).toHaveLength(3)
    await wrapper.get('.tag-manage-toggle').trigger('click')
    expect(wrapper.findAll('[data-outfit-tag]')).toHaveLength(3)
    expect(wrapper.find('.tag-picker-search').exists()).toBe(false)
    await wrapper.get('[data-outfit-tag="甜美"] .outfit-filter-button').trigger('click')
    expect(wrapper.emitted('filterSelected')).toHaveLength(1)
    await wrapper.setProps({ pickerOpen: false })
    expect(wrapper.find('.outfit-delete-tag').exists()).toBe(false)
    expect((wrapper.get('.tag-picker-search input').element as HTMLInputElement).value).toBe('')
    expect(wrapper.emitted('reorderTags')).toBeUndefined()
  })

  it('moves existing collection actions into the tag row and keeps menu callbacks', async () => {
    const added = vi.fn(),
      imported = vi.fn()
    const wrapper = mount(
      {
        components: { CollectionActions, CollectionFilterBar },
        template: `
      <div><CollectionActions label="页面操作" mobile-target="#test-tag-actions">
        <button aria-label="添加方案" @click="added">+</button>
        <template #secondary><button @click="imported">导入</button></template>
      </CollectionActions>
      <CollectionFilterBar tag-picker actions-id="test-tag-actions" :entries="[{key:'all',label:'全部'}]" active="all" :count="0" language="zh" /></div>`,
        setup: () => ({ added, imported })
      },
      { attachTo: document.body }
    )
    wrappers.push(wrapper)
    await flushPromises()
    const actions = document.querySelector('#test-tag-actions .collection-actions')!
    expect(actions).not.toBeNull()
    expect(document.querySelector('.tag-picker-bar .collection-filter-open')).toBeNull()
    const add = actions.querySelector<HTMLButtonElement>('button[aria-label="添加方案"]')!
    add.click()
    expect(added).toHaveBeenCalledOnce()
    const trigger = actions.querySelector<HTMLButtonElement>('.collection-action-trigger')!
    expect(trigger.textContent).toBe('')
    expect(trigger.getAttribute('aria-label')).toBe('页面操作')
    trigger.click()
    await flushPromises()
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    await new DOMWrapper(
      actions.querySelector<HTMLButtonElement>('.collection-action-options button')!
    ).trigger('click')
    expect(imported).toHaveBeenCalledOnce()
    await flushPromises()
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(actions.querySelector('.collection-action-options')).toBeNull()
  })

  it('uses resonance labels in the shared row without a duplicate Filter entry', async () => {
    const wrapper = mount(CollectionFilterBar, {
      props: {
        entries: [
          { key: 'all', label: '全部' },
          { key: '5', label: '五星' },
          { key: '4', label: '四星' }
        ],
        active: 'all',
        count: 2,
        language: 'zh',
        tagPicker: true,
        allLabel: '全部星级',
        selectLabel: '筛选共鸣：',
        actionsId: 'resonance-filter-actions'
      }
    })
    wrappers.push(wrapper)
    expect(wrapper.get('.collection-tag-select').text()).toBe('全部星级')
    expect(wrapper.get('.collection-tag-select').attributes('aria-label')).toBe(
      '筛选共鸣：全部星级'
    )
    expect(wrapper.find('#resonance-filter-actions').exists()).toBe(true)
    expect(wrapper.find('.collection-filter-open').exists()).toBe(false)
    await wrapper.setProps({ active: '5', count: 1 })
    expect(wrapper.get('.collection-tag-select').text()).toBe('五星')
    await wrapper.get('.collection-tag-clear').trigger('click')
    expect(wrapper.emitted('clear')).toHaveLength(1)
  })

  it('offers resonance rarity and ordering directly on phones even with no records', async () => {
    const wrapper = mount(ResonanceSidebar, { props: { records: [], language: 'zh' } })
    wrappers.push(wrapper)
    expect(wrapper.find('.resonance-sort-control').exists()).toBe(false)
    const buttons = wrapper.findAll('.resonance-picker-options button')
    expect(buttons.map((button) => button.text())).toEqual([
      '最新优先',
      '最早优先',
      '全部展示',
      '只展示五星',
      '只展示四星'
    ])
    await buttons[3]!.trigger('click')
    expect(wrapper.emitted('changeRarityFilter')).toEqual([[5]])
    expect(wrapper.emitted('filterSelected')).toHaveLength(1)
    await buttons[1]!.trigger('click')
    expect(wrapper.emitted('changeBannerOrder')).toEqual([['oldest']])
    expect(wrapper.emitted('filterSelected')).toHaveLength(2)
    await wrapper.setProps({ rarityFilter: 5, bannerOrder: 'oldest' })
    expect(buttons[3]!.attributes('aria-pressed')).toBe('true')
    expect(buttons[1]!.attributes('aria-pressed')).toBe('true')
    await buttons[3]!.trigger('click')
    expect(wrapper.emitted('changeRarityFilter')).toHaveLength(1)
    expect(wrapper.emitted('filterSelected')).toHaveLength(3)
  })

  it('uses immediate selection for custom home categories and ignores disabled choices', async () => {
    const wrapper = mount(OutfitSidebar, {
      props: {
        outfits: [],
        tags: [],
        activeFilter: 'all',
        disabled: false,
        messages: messages.zh.outfit
      },
      slots: {
        filters: ({ selectFilter }: { selectFilter: (filter: string) => void }) =>
          h('button', { onClick: () => selectFilter('home') }, '家园码')
      }
    })
    wrappers.push(wrapper)
    await wrapper.get('.outfit-filter-list button').trigger('click')
    expect(wrapper.emitted('changeFilter')).toEqual([['home']])
    expect(wrapper.emitted('filterSelected')).toHaveLength(1)
    await wrapper.setProps({ disabled: true })
    await wrapper.get('.outfit-filter-list button').trigger('click')
    expect(wrapper.emitted('changeFilter')).toHaveLength(1)
  })

  it('presents tag selection without an Apply button and keeps the slot mounted', async () => {
    const wrapper = mount(AdaptiveFilterPanel, {
      attachTo: document.body,
      props: {
        compact: true,
        open: true,
        tagPicker: true,
        title: '选择标签',
        closeLabel: '关闭筛选',
        applyLabel: '查看结果'
      },
      slots: { default: '<input data-tag-picker />' }
    })
    wrappers.push(wrapper)
    expect(document.querySelector('.mobile-tag-picker header h2')!.textContent).toBe('选择标签')
    expect(document.querySelector('.mobile-tag-picker footer')).toBeNull()
    const input = document.querySelector('[data-tag-picker]')
    document.querySelector<HTMLButtonElement>('.mobile-tag-picker header button')!.click()
    await flushPromises()
    expect(wrapper.emitted('close')).toHaveLength(1)
    await wrapper.setProps({ compact: false, open: false })
    expect(document.querySelector('[data-tag-picker]')).toBe(input)
  })

  it('offers batch actions directly and keeps busy and selection behavior', async () => {
    const wrapper = mount(SelectionBar, {
      props: {
        mode: 'album',
        selectedCount: 2,
        allSelected: false,
        allItemsSelected: false,
        allSelectedFavorited: false,
        isBusy: false,
        messages: messages.zh.selectionBar
      }
    })
    wrappers.push(wrapper)
    expect(wrapper.find('.selection-more').exists()).toBe(false)
    const buttons = wrapper.findAll('button')
    for (const [label, event] of [
      [messages.zh.selectionBar.selectAll, 'toggleAll'],
      [messages.zh.selectionBar.exportPhotos, 'export'],
      [messages.zh.selectionBar.deleteRelated, 'deleteRelated']
    ]) {
      await buttons.find((button) => button.text() === label)!.trigger('click')
      expect(wrapper.emitted(event)).toHaveLength(1)
    }
    await wrapper.setProps({ isBusy: true })
    expect(
      wrapper.findAll('button').every((button) => button.attributes('disabled') !== undefined)
    ).toBe(true)
    await wrapper.setProps({ selectedCount: 0 })
    expect(wrapper.find('.selection-bar').exists()).toBe(false)
    await wrapper.setProps({ selectedCount: 1 })
    expect(wrapper.find('.selection-bar').exists()).toBe(true)
  })
})
