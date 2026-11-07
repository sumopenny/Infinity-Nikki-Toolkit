import { mount } from '@vue/test-utils'
import { afterEach, expect, it, vi } from 'vitest'
import { defineComponent, ref } from 'vue'
import { archiveMotionDeadlineKey, useAfterArchiveMotion } from '../../src/composables/useAfterArchiveMotion'

afterEach(() => vi.useRealTimers())

it('waits only for the remaining toolbar animation before starting initialization', async () => {
  vi.useFakeTimers()
  const load = vi.fn()
  const wrapper = mount(defineComponent({ setup() { useAfterArchiveMotion(load); return () => null } }), {
    global: { provide: { [archiveMotionDeadlineKey as symbol]: ref(Date.now() + 160) } }
  })
  expect(load).not.toHaveBeenCalled()
  await vi.advanceTimersByTimeAsync(159)
  expect(load).not.toHaveBeenCalled()
  await vi.advanceTimersByTimeAsync(1)
  expect(load).toHaveBeenCalledOnce()
  wrapper.unmount()
})

it('cancels initialization when a newer navigation unmounts the page', async () => {
  vi.useFakeTimers()
  const load = vi.fn()
  const wrapper = mount(defineComponent({ setup() { useAfterArchiveMotion(load); return () => null } }), {
    global: { provide: { [archiveMotionDeadlineKey as symbol]: ref(Date.now() + 280) } }
  })
  wrapper.unmount()
  await vi.advanceTimersByTimeAsync(1000)
  expect(load).not.toHaveBeenCalled()
})

it.each([undefined, 0, -1])('loads immediately without an active animation (%s)', (deadline) => {
  const load = vi.fn()
  const wrapper = mount(defineComponent({ setup() { useAfterArchiveMotion(load); return () => null } }), {
    global: { provide: deadline === undefined ? {} : { [archiveMotionDeadlineKey as symbol]: ref(deadline) } }
  })
  expect(load).toHaveBeenCalledOnce()
  wrapper.unmount()
})
