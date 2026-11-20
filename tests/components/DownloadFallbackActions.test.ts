import { afterEach, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { computed } from 'vue'
import DownloadFallbackActions from '../../src/components/DownloadFallbackActions.vue'
import OperationNotice from '../../src/components/OperationNotice.vue'
import { retainDownload, takeDownloadFiles } from '../../src/utils/backup/downloadFallback'
import { useOperationNotice } from '../../src/composables/useOperationNotice'
import { messages } from '../../src/i18n'

afterEach(() => {
  takeDownloadFiles()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

it('shares the generated file and allows retry after cancellation', async () => {
  const file = new File(['backup'], 'backup.zip', { type: 'application/zip' })
  const share = vi
    .fn()
    .mockRejectedValueOnce(new DOMException('Cancelled', 'AbortError'))
    .mockResolvedValue(undefined)
  vi.stubGlobal('navigator', { canShare: vi.fn(() => true), share })
  const wrapper = mount(DownloadFallbackActions, { props: { files: [file], language: 'zh' } })
  await wrapper.get('button').trigger('click')
  await flushPromises()
  expect(wrapper.text()).toContain('分享已取消或未完成')
  await wrapper.get('button').trigger('click')
  await flushPromises()
  expect(share).toHaveBeenLastCalledWith({ files: [file] })
  expect(wrapper.text()).toContain('请确认文件已保存')
  expect(wrapper.emitted('sharing')).toEqual([[true], [false], [true], [false]])
  wrapper.unmount()
})

it('retries a normal download when file sharing is unsupported', async () => {
  vi.stubGlobal('navigator', {})
  const create = vi.fn(() => 'blob:test')
  vi.stubGlobal('URL', { createObjectURL: create, revokeObjectURL: vi.fn() })
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
  const wrapper = mount(DownloadFallbackActions, {
    props: { files: [new File(['data'], 'records.json')], language: 'en' }
  })
  await wrapper.get('button').trigger('click')
  await flushPromises()
  expect(click).toHaveBeenCalledOnce()
  expect(wrapper.text()).toContain('Download requested')
  wrapper.unmount()
})

it('binds files explicitly, replaces only the same module and expires after six seconds', () => {
  vi.useFakeTimers()
  const notices = useOperationNotice(computed(() => messages.zh))
  retainDownload('part1.zip', new Blob(['one']), 'outfits')
  retainDownload('part2.zip', new Blob(['two']), 'outfits')
  notices.showStatus({ message: 'Copy succeeded' })
  expect(notices.notices.value[0]?.downloadFiles).toBeUndefined()
  notices.closeNotice()
  notices.showStatus({
    message: 'Original export message',
    source: 'outfits',
    downloadFiles: takeDownloadFiles('outfits')
  })
  const first = notices.notices.value[0]!
  expect(first.message).toBe('Original export message')
  expect(first.downloadFiles?.map((file) => file.name)).toEqual(['part1.zip', 'part2.zip'])
  vi.advanceTimersByTime(5999)
  expect(notices.notices.value).toHaveLength(1)
  retainDownload('home.zip', new Blob(['home']), 'home')
  notices.showStatus({
    message: 'Home export',
    source: 'home',
    downloadFiles: takeDownloadFiles('home')
  })
  retainDownload('new.zip', new Blob(['new']), 'outfits')
  notices.showStatus({
    message: 'Original export message',
    source: 'outfits',
    downloadFiles: takeDownloadFiles('outfits')
  })
  expect(notices.notices.value).toHaveLength(2)
  expect(notices.notices.value.some((notice) => notice.id === first.id)).toBe(false)
  expect(notices.notices.value[1]?.downloadFiles?.[0]?.name).toBe('new.zip')
  vi.advanceTimersByTime(5999)
  expect(notices.notices.value).toHaveLength(2)
  notices.pauseNotice()
  vi.advanceTimersByTime(10_000)
  expect(notices.notices.value).toHaveLength(1)
  notices.resumeNotice()
  vi.advanceTimersByTime(1)
  expect(notices.notices.value).toHaveLength(0)
  notices.dispose()
})

it('does not resume on mouseleave while the system share is still pending', async () => {
  vi.useFakeTimers()
  let finishShare!: () => void
  vi.stubGlobal('navigator', {
    canShare: () => true,
    share: () =>
      new Promise<void>((resolve) => {
        finishShare = resolve
      })
  })
  const notices = useOperationNotice(computed(() => messages.zh))
  notices.showStatus({
    message: 'Exported',
    source: 'outfits',
    downloadFiles: [new File(['data'], 'backup.zip')]
  })
  const wrapper = mount(OperationNotice, {
    props: {
      title: '提示',
      closeLabel: '关闭',
      notices: notices.notices.value,
      onPause: (id: number) => notices.pauseNotice(id),
      onResume: (id: number) => notices.resumeNotice(id)
    },
    global: { stubs: { Teleport: true } }
  })
  vi.advanceTimersByTime(2000)
  await wrapper.get('aside').trigger('mouseenter')
  await wrapper.get('.download-save-button').trigger('click')
  await wrapper.get('aside').trigger('mouseleave')
  vi.advanceTimersByTime(20_000)
  expect(notices.notices.value).toHaveLength(1)
  finishShare()
  await flushPromises()
  vi.advanceTimersByTime(3999)
  expect(notices.notices.value).toHaveLength(1)
  vi.advanceTimersByTime(1)
  expect(notices.notices.value).toHaveLength(0)
  wrapper.unmount()
  notices.dispose()
})
