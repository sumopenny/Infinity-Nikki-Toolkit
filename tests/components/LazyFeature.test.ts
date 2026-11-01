import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, h, ref } from 'vue'
import { afterEach, expect, it, vi } from 'vitest'
import { lazyFeature } from '../../src/utils/lazyFeature'
import { reportError } from '../../src/utils/errorReporting/errorReporter'

vi.mock('../../src/utils/errorReporting/errorReporter', () => ({ reportError: vi.fn() }))
afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

it('loads only when rendered, retries failures and reuses the resolved component', async () => {
  vi.useFakeTimers()
  const ready = defineComponent({ template: '<p class="feature-ready">Ready</p>' })
  const loader = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(ready)
  const language = ref<'zh' | 'en'>('zh')
  const Feature = lazyFeature(loader, () => language.value)
  const visible = ref(false)
  const wrapper = mount(defineComponent(() => () => (visible.value ? h(Feature) : null)))
  try {
    expect(loader).not.toHaveBeenCalled()
    visible.value = true
    await flushPromises()
    await vi.advanceTimersByTimeAsync(160)
    expect(wrapper.get('[role="status"]').text()).toContain('页面加载失败')
    expect(reportError).toHaveBeenCalledOnce()
    language.value = 'en'
    await flushPromises()
    expect(wrapper.get('button').text()).toBe('Retry')
    await wrapper.get('button').trigger('click')
    await flushPromises()
    expect(wrapper.get('.feature-ready').text()).toBe('Ready')
    expect(loader).toHaveBeenCalledTimes(2)
    visible.value = false
    await flushPromises()
    visible.value = true
    await flushPromises()
    expect(wrapper.find('.feature-ready').exists()).toBe(true)
    expect(loader).toHaveBeenCalledTimes(2)
  } finally {
    wrapper.unmount()
  }
})

it('can cancel a pending dialog load without opening it when the download finishes', async () => {
  vi.useFakeTimers()
  const active = ref(true)
  let finish!: (component: ReturnType<typeof defineComponent>) => void
  const loader = () =>
    new Promise<ReturnType<typeof defineComponent>>((resolve) => {
      finish = resolve
    })
  const cancel = vi.fn(() => {
    active.value = false
  })
  const Feature = lazyFeature(loader, () => 'zh', { active: () => active.value, cancel })
  const wrapper = mount(defineComponent(() => () => h(Feature, { visible: active.value })))
  try {
    await vi.advanceTimersByTimeAsync(160)
    const button = document.body.querySelector<HTMLButtonElement>('button')!
    expect(button.textContent).toBe('取消')
    button.click()
    await flushPromises()
    expect(cancel).toHaveBeenCalledOnce()
    finish(
      defineComponent({
        props: ['visible'],
        template: '<div v-if="visible" class="late-dialog">Loaded</div>'
      })
    )
    await flushPromises()
    expect(document.body.querySelector('[role="dialog"]')).toBeNull()
    expect(wrapper.find('.late-dialog').exists()).toBe(false)
    expect(document.documentElement.style.overflowY).not.toBe('hidden')
  } finally {
    wrapper.unmount()
  }
})

it.each([
  [false, false],
  [true, false],
  [false, true],
  [true, true]
])('only reloads failed resources after confirmation %s', async (confirmed, dialog) => {
  vi.useFakeTimers()
  const reload = vi.fn()
  vi.stubGlobal('location', { ...window.location, reload })
  vi.spyOn(window, 'confirm').mockReturnValue(confirmed)
  const Feature = lazyFeature(
    () =>
      Promise.reject(new TypeError('Failed to fetch dynamically imported module: /assets/old.js')),
    () => 'zh',
    dialog ? { active: () => true, cancel: () => {} } : undefined
  )
  const wrapper = mount(defineComponent(() => () => h(Feature)))
  try {
    await flushPromises()
    await vi.advanceTimersByTimeAsync(160)
    const button = [
      ...wrapper.findAll('button').map((button) => button.element),
      ...document.body.querySelectorAll('button')
    ].find((button) => button.textContent === '刷新页面') as HTMLButtonElement
    expect(button).toBeDefined()
    button.click()
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('尚未保存'))
    expect(reload).toHaveBeenCalledTimes(confirmed ? 1 : 0)
  } finally {
    wrapper.unmount()
    vi.unstubAllGlobals()
  }
})
