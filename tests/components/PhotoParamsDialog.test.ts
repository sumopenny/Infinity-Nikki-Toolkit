import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import PhotoParamsDialog from '../../src/components/PhotoParamsDialog.vue'
import { photoParamsEn, photoParamsZh as messages } from '../../src/i18n/messages/photoParams'

describe('PhotoParamsDialog', () => {
  it('keeps the UID form during retries and announces repeated failures', async () => {
    const wrapper = mount(PhotoParamsDialog, {
      props: {
        visible: true,
        photo: { name: 'photo.jpeg' },
        uidRequired: true,
        progress: { stage: 'error', percent: 100, message: '' },
        result: null,
        error: '未找到有效 UID 账号',
        messages
      },
      global: { stubs: { Teleport: true } }
    })
    try {
      const input = wrapper.get('input')
      await input.setValue('123')
      for (let attempt = 1; attempt <= 2; attempt++) {
        await wrapper.get('form').trigger('submit')
        expect(wrapper.emitted('submitUid')).toHaveLength(attempt)
        expect(wrapper.get('button[type="submit"]').text()).toContain(messages.uidParsing)
        await wrapper.get('form').trigger('submit')
        expect(wrapper.emitted('submitUid')).toHaveLength(attempt)
        await wrapper.setProps({
          error: null,
          uidRequired: false,
          progress: { stage: 'readingPhoto', percent: 30, message: '' }
        })
        expect(wrapper.find('input').exists()).toBe(true)
        await wrapper.setProps({
          error: '未找到有效 UID 账号',
          uidRequired: true,
          progress: { stage: 'error', percent: 100, message: '' }
        })
        expect(wrapper.get('[role="alert"]').text()).toContain(messages.uidMismatch)
        expect((wrapper.get('input').element as HTMLInputElement).value).toBe('123')
        expect(wrapper.get('input').attributes('aria-invalid')).toBe('true')
        expect(wrapper.get('button[type="submit"]').attributes('disabled')).toBeUndefined()
      }
      await wrapper.get('input').setValue('456')
      expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    } finally {
      wrapper.unmount()
    }
  })

  it('shows a fixed placeholder when a resource image fails', async () => {
    const wrapper = mount(PhotoParamsDialog, {
      props: {
        visible: true,
        photo: null,
        uidRequired: false,
        progress: { stage: 'ready', percent: 100, message: '' },
        result: {
          environmentFields: [],
          cameraFields: [],
          imageFields: [],
          resourceGroups: [
            {
              kind: 'light',
              title: '灯光',
              name: 'unknown',
              imageUrl: 'https://invalid.example/image.webp'
            }
          ],
          rawCameraParams: 'raw'
        },
        error: null,
        messages
      },
      global: { stubs: { Teleport: true } }
    })
    await wrapper.find('.photo-params-resource-row img').trigger('error')
    expect(wrapper.find('.photo-params-resource-image-placeholder').exists()).toBe(true)
    wrapper.unmount()
  })

  it('does not render a numeric value when an action only provides its name', () => {
    const wrapper = mount(PhotoParamsDialog, {
      props: {
        visible: true,
        photo: null,
        uidRequired: false,
        progress: { stage: 'ready', percent: 100, message: '' },
        result: {
          environmentFields: [],
          cameraFields: [],
          imageFields: [],
          resourceGroups: [
            { kind: 'pose', title: '动作', name: '我生气啦！', imageUrl: '/pose.png' }
          ],
          rawCameraParams: 'raw'
        },
        error: null,
        messages
      },
      global: { stubs: { Teleport: true } }
    })
    const row = wrapper.get('.photo-params-resource-row')
    expect(row.get('.photo-params-resource-placeholder').text()).toBe('我生气啦！')
    expect(row.find('strong').exists()).toBe(false)
    wrapper.unmount()
  })

  it('renders capture information before the camera section', () => {
    const wrapper = mount(PhotoParamsDialog, {
      props: {
        visible: true,
        photo: null,
        uidRequired: false,
        progress: { stage: 'ready', percent: 100, message: '' },
        result: {
          environmentFields: [
            { label: '拍摄时间', value: '12:34:56' },
            { label: '天气', value: '2' }
          ],
          cameraFields: [{ label: '焦距', value: '50 mm' }],
          imageFields: [],
          resourceGroups: [],
          rawCameraParams: 'raw'
        },
        error: null,
        messages
      },
      global: { stubs: { Teleport: true } }
    })
    const sections = wrapper.findAll('.photo-params-section')
    expect(sections[0].find('h3').text()).toBe('环境')
    expect(sections[0].text()).toContain('12:34:56')
    expect(sections[1].find('h3').text()).toBe('相机')
    wrapper.unmount()
  })

  it('passes normalized slider ratios to the thumb track', () => {
    const wrapper = mount(PhotoParamsDialog, {
      props: {
        visible: true,
        photo: null,
        uidRequired: false,
        progress: { stage: 'ready', percent: 100, message: '' },
        result: {
          environmentFields: [],
          cameraFields: [{ label: '焦距', value: '10mm', position: 0 }],
          imageFields: [{ label: '曝光', value: '1.0', position: 100 }],
          resourceGroups: [],
          rawCameraParams: 'raw'
        },
        error: null,
        messages
      },
      global: { stubs: { Teleport: true } }
    })
    const sliders = wrapper.findAll('.photo-params-slider')
    expect(sliders[0].attributes('style')).toContain('--photo-params-slider-ratio: 0')
    expect(sliders[1].attributes('style')).toContain('--photo-params-slider-ratio: 1')
    wrapper.unmount()
  })

  it('shows the UID form only when a valid UID account is required', () => {
    const props = {
      visible: true,
      photo: null,
      progress: { stage: 'error' as const, percent: 100, message: '' },
      result: null,
      error: '未找到有效UID账号',
      messages
    }
    const required = mount(PhotoParamsDialog, {
      props: { ...props, uidRequired: true },
      global: { stubs: { Teleport: true } }
    })
    expect(required.find('.photo-params-uid-form').exists()).toBe(true)
    required.unmount()

    const optional = mount(PhotoParamsDialog, {
      props: { ...props, uidRequired: false },
      global: { stubs: { Teleport: true } }
    })
    expect(optional.find('.photo-params-uid-form').exists()).toBe(false)
    expect(optional.find('.photo-params-error').text()).toContain('未找到有效UID账号')
    optional.unmount()
  })

  it('uses a spinner and stage text while parsing without a percentage', () => {
    const wrapper = mount(PhotoParamsDialog, {
      props: {
        visible: true,
        photo: null,
        uidRequired: false,
        progress: { stage: 'decryptingPhoto', percent: 70, message: '正在解密照片参数…' },
        result: null,
        error: null,
        messages
      },
      global: { stubs: { Teleport: true } }
    })
    expect(wrapper.find('.photo-params-spinner').exists()).toBe(true)
    expect(wrapper.find('.photo-params-loading').text()).toContain('正在解密照片参数…')
    expect(wrapper.find('.photo-params-loading').text()).not.toContain('70%')
    expect(wrapper.findAll('.photo-params-stage')).toHaveLength(0)
    expect(wrapper.find('.photo-params-progress').exists()).toBe(false)
    wrapper.unmount()
  })
})

it('locks scrolling, cycles focus, closes with Escape and returns focus to its trigger', async () => {
  const { nextTick } = await import('vue')
  const trigger = document.createElement('button')
  document.body.append(trigger)
  trigger.focus()
  document.body.style.overflow = 'scroll'
  const wrapper = mount(PhotoParamsDialog, {
    attachTo: document.body,
    props: {
      visible: false,
      photo: null,
      uidRequired: true,
      progress: { stage: 'error', percent: 100, message: '' },
      result: null,
      error: 'UID',
      messages
    }
  })
  await wrapper.setProps({ visible: true })
  await nextTick()
  const panel = document.querySelector<HTMLElement>('.photo-params-dialog')!
  expect(document.activeElement).toBe(panel)
  expect(document.body.style.overflow).toBe('clip')
  const buttons = [...panel.querySelectorAll<HTMLElement>('button:not(:disabled),input')]
  for (const element of buttons)
    Object.defineProperty(element, 'getClientRects', { value: () => [{}] })
  buttons.at(-1)!.focus()
  buttons
    .at(-1)!
    .dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }))
  expect(document.activeElement).toBe(buttons[0])
  buttons[0].dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
  )
  expect(wrapper.emitted('close')).toHaveLength(1)
  await wrapper.setProps({ visible: false })
  await nextTick()
  expect(document.activeElement).toBe(trigger)
  expect(document.body.style.overflow).toBe('scroll')
  wrapper.unmount()
  trigger.remove()
  document.body.style.overflow = ''
})

describe('original photo warning', () => {
  it.each([
    ['jpeg_second_end_marker_missing', true],
    ['base64_invalid', true],
    ['photo_structure_invalid', false],
    ['camera_base64_invalid', false],
    ['unreachable', false]
  ])('only shows hint for supported photo format errors: %s', (code, expected) => {
    const wrapper = mount(PhotoParamsDialog, {
      props: {
        visible: true,
        photo: null,
        uidRequired: false,
        progress: { stage: 'error', percent: 100, message: '' },
        result: null,
        error: `Error code: ${code}; Meaning: failed`,
        errorCodes: [code],
        messages: photoParamsEn
      },
      global: { stubs: { Teleport: true } }
    })
    const hints = wrapper.findAll('.photo-params-original-hint').map((element) => element.text())
    expect(hints.includes(photoParamsEn.nonOriginalPhotoHint)).toBe(expected)
    expect(hints).toContain(photoParamsEn.originalFolderHint)
    wrapper.unmount()
  })
})

it('switches photo layouts and keeps the raw code below both columns', async () => {
  const wrapper = mount(PhotoParamsDialog, {
    props: {
      visible: true,
      language: 'zh',
      photo: { name: 'photo.jpeg' },
      uidRequired: false,
      progress: { stage: 'ready', percent: 100, message: '' },
      error: null,
      messages,
      favoriteLabel: '收藏参数',
      result: {
        environmentFields: [],
        cameraFields: [],
        imageFields: [],
        resourceGroups: [],
        rawCameraParams: 'raw',
        outfit: {
          code: '',
          wearingClothes: [{ itemId: 1020100001, clothType: 10, outfitId: null }],
          dyeItems: []
        }
      }
    },
    global: {
      stubs: {
        Teleport: true,
        OutfitParseDialog: { template: '<div class="test-parts">parts</div>' }
      }
    }
  })
  try {
    await flushPromises()
    const button = () => wrapper.get('.photo-params-layout-button')
    expect(button().attributes('aria-pressed')).toBe('true')
    await button().trigger('click')
    expect(button().attributes('aria-pressed')).toBe('false')
    await button().trigger('click')
    expect(wrapper.get('.photo-params-dialog').classes()).toContain('is-split-layout')
    expect(button().attributes('aria-label')).toBe('切换为上下布局')
    expect(wrapper.findAll('.test-parts')).toHaveLength(1)
    expect(wrapper.get('.photo-params-columns').element.nextElementSibling).toBe(
      wrapper.get('.photo-params-raw').element
    )
    await wrapper.get('.photo-params-copy-button').trigger('click')
    expect(wrapper.emitted('copy')).toHaveLength(1)
    await button().trigger('click')
    expect(wrapper.get('.photo-params-dialog').classes()).not.toContain('is-split-layout')
    await wrapper.setProps({ language: 'en' })
    expect(button().attributes('aria-label')).toBe('Switch to side-by-side view')
    await button().trigger('click')
    await wrapper.setProps({ visible: false })
    await wrapper.setProps({ visible: true })
    expect(wrapper.get('.photo-params-layout-button').attributes('aria-pressed')).toBe('true')
    expect(localStorage.getItem('nikki-photo-params-layout')).toBe('split')
    const restored = mount(PhotoParamsDialog, {
      props: wrapper.props(),
      global: { stubs: { Teleport: true, OutfitParseDialog: true } }
    })
    expect(restored.get('.photo-params-layout-button').attributes('aria-pressed')).toBe('true')
    restored.unmount()
    await wrapper.setProps({
      result: {
        environmentFields: [],
        cameraFields: [],
        imageFields: [],
        resourceGroups: [],
        rawCameraParams: 'code'
      }
    })
    expect(wrapper.find('.photo-params-layout-button').exists()).toBe(false)
  } finally {
    wrapper.unmount()
    localStorage.removeItem('nikki-photo-params-layout')
  }
})
