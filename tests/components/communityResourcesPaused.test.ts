import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import AlbumViewSwitcher from '../../src/components/AlbumViewSwitcher.vue'
import MobileNavigation from '../../src/components/MobileNavigation.vue'
import PhotoParamsDialog from '../../src/components/PhotoParamsDialog.vue'
import { messages } from '../../src/i18n'
import { photoParamsZh } from '../../src/i18n/messages/photoParams'
import { getCatalogImageSource } from '../../src/utils/gongeo/catalogImage'
import { onRequest } from '../../functions/api/_middleware'

describe('community resources paused', () => {
  it('keeps archive navigation disabled on desktop and mobile while home remains available', async () => {
    const props = {
      activeView: 'all' as const,
      disabled: false,
      messages: messages.zh.viewNav,
      outfitLabel: '搭配',
      resonanceLabel: '暖暖档案',
      allCount: 0,
      outfitsCount: 0,
      homeSchemesCount: 0,
      favoriteCount: 0,
      trashCount: 0
    }
    const desktop = mount(AlbumViewSwitcher, { props })
    const mobile = mount(MobileNavigation, { props: { ...props, cameraLabel: '收藏' } })
    try {
      for (const nav of [desktop, mobile]) {
        const archive = nav.findAll('button')[3]!
        expect(archive.element.disabled).toBe(true)
        await archive.trigger('click')
        expect(nav.find('[role="menu"]').exists()).toBe(false)
        expect(nav.emitted('changeView')).toBeUndefined()
        await nav
          .findAll('button')
          .find((b) => b.text().includes(messages.zh.viewNav.homeSchemes))!
          .trigger('click')
        expect(nav.emitted('changeView')).toEqual([['home']])
      }
    } finally {
      desktop.unmount()
      mobile.unmount()
    }
  })

  it('reads old favorite names without rendering a remote preview', () => {
    const wrapper = mount(PhotoParamsDialog, {
      props: {
        visible: true,
        language: 'zh',
        photo: null,
        uidRequired: false,
        progress: { stage: 'ready', percent: 100, message: '' },
        error: null,
        messages: photoParamsZh,
        result: {
          environmentFields: [],
          cameraFields: [],
          imageFields: [],
          rawCameraParams: 'saved',
          resourceGroups: [
            {
              kind: 'filter',
              title: '滤镜',
              name: '薄雾',
              imageUrl: 'https://cdn.nikkialbums.com/filter/1090020001.webp'
            }
          ]
        }
      },
      global: { stubs: { Teleport: true } }
    })
    try {
      expect(wrapper.text()).toContain('薄雾')
      expect(wrapper.find('.photo-params-resource-row img').exists()).toBe(false)
      expect(getCatalogImageSource('icon', 1)).toBe('/catalog-placeholder.svg')
    } finally {
      wrapper.unmount()
    }
  })

  it('stops old catalog and image requests before forwarding, and passes the home route through', async () => {
    const next = vi.fn(async () => new Response('home'))
    for (const path of [
      '/api/share-image?path=items/icons/1.png',
      '/api/share-image?resource=old',
      '/api/gongeo/items/1',
      '/api/outfit-code/1',
      '/api/resonance/pearpal',
      '/api/home-build/1'
    ]) {
      const response = await onRequest({
        request: new Request('https://local.test' + path),
        env: {},
        data: {},
        waitUntil: vi.fn(),
        next
      })
      expect(response.status).toBe(path.includes('home-build') ? 200 : 503)
    }
    expect(next).toHaveBeenCalledTimes(1)
  })
})
