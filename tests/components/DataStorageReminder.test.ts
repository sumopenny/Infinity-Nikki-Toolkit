import { mount } from '@vue/test-utils'
import { expect, it } from 'vitest'
import DataStorageReminder from '../../src/components/DataStorageReminder.vue'

it.each(['zh', 'en'] as const)(
  'uses one acknowledgment button and persists the checkbox choice (%s)',
  async (language) => {
    const wrapper = mount(DataStorageReminder, {
      props: {
        visible: true,
        dismissed: false,
        language,
        canAutoBackup: true
      },
      global: { stubs: { Teleport: true } }
    })
    try {
      const buttons = wrapper.findAll('button')
      expect(buttons).toHaveLength(1)
      expect(buttons[0].attributes('disabled')).toBeUndefined()
      expect(buttons[0].text()).toBe(language === 'zh' ? '我已了解' : 'Understood')
      await wrapper.get('input').setValue(true)
      await buttons[0].trigger('click')
      expect(wrapper.emitted('close')).toEqual([[true]])
    } finally {
      wrapper.unmount()
    }
  }
)

it('shows manual export guidance without an automatic backup action when unavailable', async () => {
  const wrapper = mount(DataStorageReminder, {
    props: {
      visible: true,
      dismissed: true,
      language: 'zh',
      canAutoBackup: false
    },
    global: { stubs: { Teleport: true } }
  })
  try {
    expect(wrapper.text()).toContain('请定期通过「更多 → 导出全部数据」保存备份')
    expect(wrapper.findAll('button')).toHaveLength(1)
    expect(wrapper.get('button').text()).toBe('我已了解')
    await wrapper.get('button').trigger('click')
    expect(wrapper.emitted('close')).toEqual([[true]])
    await wrapper.setProps({ visible: false, dismissed: false })
    await wrapper.setProps({ visible: true })
    expect(wrapper.get<HTMLInputElement>('input').element.checked).toBe(false)
  } finally {
    wrapper.unmount()
  }
})
