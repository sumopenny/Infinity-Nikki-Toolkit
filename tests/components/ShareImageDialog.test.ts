import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ShareImageDialog from '../../src/components/ShareImageDialog.vue'
import { renderShareImage } from '../../src/utils/shareImage'

vi.mock('../../src/utils/shareImage', () => ({
  loadShareImage: vi.fn(async () => ({ naturalWidth: 100, naturalHeight: 200 })),
  renderShareImage: vi.fn(async () => new Blob(['png']))
}))
afterEach(() => {
  vi.restoreAllMocks()
  vi.clearAllMocks()
})
function setup() {
  URL.createObjectURL = vi.fn(() => 'blob:preview')
  URL.revokeObjectURL = vi.fn()
}
describe('ShareImageDialog', () => {
  it('shares original-photo hints without a parsing retry button', async () => {
    setup()
    const wrapper = mount(ShareImageDialog, {
      props: { language: 'en', preparing: true, preparationError: 'Invalid photo',
        preparationErrorCodes: ['jpeg_second_end_marker_missing'] },
      global: { stubs: { Teleport: true } }
    })
    await flushPromises()
    expect(wrapper.get('.photo-params-error').text()).toContain('HighQuality')
    expect(wrapper.get('.photo-params-error').text()).toContain('compressed')
    expect(wrapper.get('.photo-params-error').find('button').exists()).toBe(false)
    wrapper.unmount()
  })

  it('handles parsing and UID entry inside the share window before loading the cached photo', async () => {
    setup()
    const loadPhoto = vi.fn(async () => new Blob(['cached photo']))
    const wrapper = mount(ShareImageDialog, {
      props: { language: 'zh', preparing: true, preparationMessage: '正在解析照片', loadPhoto },
      global: { stubs: { Teleport: true } }
    })
    await flushPromises()
    expect(wrapper.get('[role="status"]').text()).toContain('正在解析照片')
    expect(loadPhoto).not.toHaveBeenCalled()
    expect(renderShareImage).not.toHaveBeenCalled()
    await wrapper.setProps({ preparationError: '需要 UID', uidRequired: true })
    await wrapper.get('#photo-params-uid-input').setValue('123456')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.emitted('submitUid')).toEqual([['123456']])
    await wrapper.setProps({
      preparing: false,
      preparationError: null,
      uidRequired: false,
      result: {
        environmentFields: [],
        cameraFields: [],
        imageFields: [],
        resourceGroups: [],
        rawCameraParams: 'code'
      }
    })
    await flushPromises()
    expect(loadPhoto).toHaveBeenCalledOnce()
    expect(vi.mocked(renderShareImage).mock.lastCall?.[0].modules.code).toBe(true)
    expect(wrapper.find('form').exists()).toBe(false)
    expect(wrapper.find('.share-image-stage img').exists()).toBe(true)
    wrapper.unmount()
  })
  it('reflows each independent module and supports photo-only export', async () => {
    setup()
    const wrapper = mount(ShareImageDialog, {
      props: {
        language: 'zh',
        loadPhoto: async () => new Blob(),
        result: {
          environmentFields: [],
          cameraFields: [],
          imageFields: [],
          resourceGroups: [],
          rawCameraParams: 'complete-code'
        }
      },
      global: { stubs: { Teleport: true } }
    })
    await flushPromises()
    const checks = wrapper.findAll('input[type="checkbox"]')
    expect(checks[1]!.attributes('disabled')).toBeDefined()
    await checks[0]!.setValue(false)
    await checks[2]!.setValue(false)
    await flushPromises()
    expect(vi.mocked(renderShareImage).mock.lastCall?.[0].modules).toEqual({
      parameters: false,
      clothes: false,
      code: false
    })
    wrapper.unmount()
    expect(URL.revokeObjectURL).toHaveBeenCalled()
  })
  it('automatically loads the matching outfit image and renders fixed 9:16 without a ratio picker', async () => {
    setup()
    const loadPhoto = vi.fn(async () => new Blob(['matching outfit']))
    const wrapper = mount(ShareImageDialog, {
      props: { language: 'zh', code: '13dub3nPiPu#', loadPhoto },
      global: { stubs: { Teleport: true } }
    })
    expect(wrapper.find('.share-image-save').attributes('disabled')).toBeDefined()
    await flushPromises()
    expect(wrapper.find('footer').exists()).toBe(false)
    expect(wrapper.find('.share-image-preview .share-image-save').exists()).toBe(true)
    expect(loadPhoto).toHaveBeenCalledOnce()
    expect(wrapper.find('input[type="file"]').exists()).toBe(false)
    expect(vi.mocked(renderShareImage).mock.lastCall?.[0].outfitCode).toBe('13dub3nPiPu#')
    expect(wrapper.find('select').exists()).toBe(false)
    expect(vi.mocked(renderShareImage).mock.lastCall?.[0]).not.toHaveProperty('ratio')
    wrapper.unmount()
  })
  it('does not generate an unrelated image when the code has no matching source', async () => {
    setup()
    const wrapper = mount(ShareImageDialog, {
      props: { language: 'zh', code: '13dub3nPiPu#' },
      global: { stubs: { Teleport: true } }
    })
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toContain('搭配库中没有该码对应的图片')
    expect(wrapper.find('input[type="file"]').exists()).toBe(false)
    expect(wrapper.get('.share-image-save').attributes('disabled')).toBeDefined()
    expect(renderShareImage).not.toHaveBeenCalled()
    wrapper.unmount()
  })
})
