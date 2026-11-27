import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import EvolutionAnimations from '../../src/components/EvolutionAnimations.vue'
import {
  animations,
  animationSyncStatus,
  loadEvolutionAnimations
} from '../../src/utils/evolutionAnimations'
import { readBilibiliEvolution } from '../../src/utils/bilibiliEvolution'
vi.mock('../../src/utils/bilibiliEvolution', async (original) => ({
  ...(await original<typeof import('../../src/utils/bilibiliEvolution')>()),
  readBilibiliEvolution: vi.fn()
}))
const rows = [
  {
    version: '3.0',
    name: '测试套装',
    source: '限定共鸣',
    page: 2,
    cid: '202',
    duration: 40,
    thumbnail: 'https://i0.hdslb.com/test.jpg'
  },
  {
    version: '2.11',
    name: '旧套装',
    source: '限定共鸣',
    page: 1,
    cid: '101',
    duration: 30,
    thumbnail: ''
  }
]
beforeEach(() => {
  animations.splice(0)
  animationSyncStatus.value = 'idle'
  vi.mocked(readBilibiliEvolution).mockReset().mockResolvedValue(rows)
})
afterEach(() => {
  vi.unstubAllGlobals()
  animations.splice(0)
})
it('starts empty and renders Bilibili results without autoplay', async () => {
  const wrapper = mount(EvolutionAnimations, {
    props: { selectedCid: '', loadOnEntry: false, language: 'zh' }
  })
  expect(wrapper.find('.animation-player').exists()).toBe(false)
  expect(wrapper.text()).toContain('正在读取')
  await loadEvolutionAnimations(true)
  await flushPromises()
  expect(wrapper.findAll('.animation-card')).toHaveLength(2)
  expect(wrapper.get('h2').text()).toBe('【限定共鸣】测试套装')
  expect(wrapper.find('iframe').exists()).toBe(false)
  await wrapper.get('.animation-cover').trigger('click')
  expect(wrapper.emitted('update:selectedCid')?.at(-1)).toEqual(['202'])
  await wrapper.setProps({ selectedCid: '202' })
  expect(wrapper.get('iframe').attributes('src')).toContain('cid=202&p=2')
  wrapper.unmount()
})
it('shows an empty error and recovers through Retry', async () => {
  vi.mocked(readBilibiliEvolution).mockRejectedValue(new Error('offline'))
  const wrapper = mount(EvolutionAnimations, {
    props: { selectedCid: '', loadOnEntry: false, language: 'zh' }
  })
  await loadEvolutionAnimations(true)
  await flushPromises()
  expect(wrapper.text()).toContain('暂时无法读取')
  expect(wrapper.find('iframe').exists()).toBe(false)
  expect(wrapper.findAll('.animation-card')).toHaveLength(0)
  vi.mocked(readBilibiliEvolution).mockResolvedValue(rows)
  await wrapper.get('.animation-sync button').trigger('click')
  await flushPromises()
  expect(wrapper.findAll('.animation-card')).toHaveLength(2)
  wrapper.unmount()
})
it('keeps CID selection across reordering and avoids autoplay when that CID disappears', async () => {
  animations.push(...rows)
  const wrapper = mount(EvolutionAnimations, {
    props: { selectedCid: '202', loadOnEntry: true, language: 'en' }
  })
  await loadEvolutionAnimations(true)
  await flushPromises()
  expect(wrapper.get('iframe').attributes('src')).toContain('p=2&autoplay=0')
  vi.mocked(readBilibiliEvolution).mockResolvedValue([{ ...rows[0], page: 5 }])
  await loadEvolutionAnimations(true)
  await flushPromises()
  expect(wrapper.get('iframe').attributes('src')).toContain('p=5&autoplay=0')
  vi.mocked(readBilibiliEvolution).mockResolvedValue([rows[1]])
  await loadEvolutionAnimations(true)
  await flushPromises()
  expect(wrapper.find('iframe').exists()).toBe(false)
  expect(wrapper.get('h2').text()).toBe('【限定共鸣】旧套装')
  wrapper.unmount()
})
it('keeps full-screen permissions and recovers visually when a cover fails', async () => {
  animations.push(...rows)
  const wrapper = mount(EvolutionAnimations, {
    props: { selectedCid: '202', loadOnEntry: true, language: 'zh' }
  })
  expect(wrapper.get('iframe').attributes('allow')).toContain('https://www.bilibili.com')
  await wrapper.get('.animation-card img').trigger('error')
  expect(wrapper.find('.animation-card a').exists()).toBe(true)
  wrapper.unmount()
  await flushPromises()
})
