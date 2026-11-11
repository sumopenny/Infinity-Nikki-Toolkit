import { afterEach, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { defineComponent, ref } from 'vue'
import { vSelectableCard } from '../../src/utils/selectableCard'
import PhotoSelectionBadge from '../../src/components/PhotoSelectionBadge.vue'

let wrapper: VueWrapper | undefined
const preview = vi.fn()
const action = vi.fn()

function create() {
  preview.mockReset()
  action.mockReset()
  wrapper = mount(
    defineComponent({
      directives: { selectableCard: vSelectableCard },
      components: { PhotoSelectionBadge },
      setup() {
        const selected = ref(new Set<number>())
        const disabled = ref(false)
        function toggle(id: number) {
          const next = new Set(selected.value)
          next.has(id) ? next.delete(id) : next.add(id)
          selected.value = next
        }
        return { selected, disabled, toggle, preview, action }
      },
      template: `<div>
      <article v-for="id in [1, 2]" :key="id" tabindex="0" class="photo-card selectable-card"
        :class="{ selected: selected.has(id) }"
        v-selectable-card="{ selected: selected.has(id), selectionMode: selected.size > 0, disabled,
          toggle: () => toggle(id), preview: () => preview(id) }">
        <div class="photo-frame"><img alt="photo" />
          <PhotoSelectionBadge :selected="selected.has(id)" :disabled="disabled" />
          <button class="action" @click.stop="action()">Edit</button>
        </div><footer>Metadata</footer>
      </article>
      <button class="clear" @click="selected = new Set()">Clear</button>
    </div>`
    }),
    { attachTo: document.body }
  )
  return wrapper
}

function pointer(target: EventTarget, type: string, overrides: Record<string, unknown> = {}) {
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.entries({
    pointerType: 'touch',
    pointerId: 1,
    isPrimary: true,
    clientX: 20,
    clientY: 20,
    ...overrides
  }).forEach(([key, value]) => Object.defineProperty(event, key, { value }))
  target.dispatchEvent(event)
}

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  vi.useRealTimers()
})

it('previews with one click, selects only through circles, and exits on the last deselection', async () => {
  const view = create()
  const cards = view.findAll('article')
  await cards[0]!.get('img').trigger('click')
  expect(preview).toHaveBeenCalledWith(1)
  expect(cards[0]!.classes()).not.toContain('selected')
  await cards[0]!.get('.selected-badge').trigger('click')
  expect(preview).toHaveBeenCalledTimes(1)
  expect(cards.every((card) => card.classes().includes('selection-mode'))).toBe(true)
  expect(cards[0]!.get('.selected-badge').attributes('aria-pressed')).toBe('true')
  expect(cards[0]!.classes()).toContain('selectable-card')
  await cards[1]!.get('img').trigger('click')
  expect(preview).toHaveBeenLastCalledWith(2)
  expect(cards[0]!.classes()).toContain('selected')
  await cards[0]!.get('.selected-badge').trigger('click')
  expect(cards.every((card) => !card.classes().includes('selection-mode'))).toBe(true)
})

it('keeps nested actions separate and gives Enter and Space different meanings', async () => {
  const view = create()
  const card = view.get('article')
  await card.get('.action').trigger('click')
  await card.get('.action').trigger('keydown', { key: ' ' })
  expect(action).toHaveBeenCalledOnce()
  expect(preview).not.toHaveBeenCalled()
  expect(card.classes()).not.toContain('selected')
  await card.trigger('keydown', { key: ' ' })
  expect(card.classes()).toContain('selected')
  await card.trigger('keydown', { key: 'Enter' })
  expect(preview).toHaveBeenCalledWith(1)
  await view.get('.clear').trigger('click')
  expect(card.classes()).not.toContain('selection-mode')
})

it('long presses to select and consumes the release click without blocking the next tap', async () => {
  vi.useFakeTimers()
  const view = create()
  const card = view.get('article')
  const image = card.get('img')
  pointer(image.element, 'pointerdown')
  expect(card.classes()).toContain('is-pressing')
  await vi.advanceTimersByTimeAsync(449)
  expect(card.classes()).not.toContain('selected')
  await vi.advanceTimersByTimeAsync(1)
  expect(card.classes()).toContain('selected')
  expect(card.classes()).not.toContain('is-pressing')
  // 用户保持按住超过抑制窗口，松手时仍须拦截浏览器补发的 click。
  await vi.advanceTimersByTimeAsync(1500)
  pointer(image.element, 'pointerup')
  image.element.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }))
  await flushPromises()
  expect(preview).not.toHaveBeenCalled()
  pointer(image.element, 'pointerdown')
  pointer(image.element, 'pointerup')
  image.element.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }))
  await flushPromises()
  expect(preview).toHaveBeenCalledWith(1)
  pointer(image.element, 'pointerdown')
  await vi.advanceTimersByTimeAsync(450)
  pointer(image.element, 'pointerup')
  image.element.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }))
  await flushPromises()
  expect(card.classes()).not.toContain('selected')
  expect(view.findAll('article').every((c) => !c.classes().includes('selection-mode'))).toBe(true)
  expect(preview).toHaveBeenCalledTimes(1)
})

it.each(['move', 'scroll', 'leave', 'cancel', 'disabled', 'unmount'])(
  'cancels a pending long press on %s',
  async (reason) => {
    vi.useFakeTimers()
    const view = create()
    const card = view.get('article')
    pointer(card.get('img').element, 'pointerdown')
    if (reason === 'move') pointer(document, 'pointermove', { clientX: 40 })
    if (reason === 'scroll') document.dispatchEvent(new Event('scroll'))
    if (reason === 'leave') pointer(card.element, 'pointerleave')
    if (reason === 'cancel') pointer(document, 'pointercancel')
    if (reason === 'disabled') {
      ;(view.vm as unknown as { disabled: boolean }).disabled = true
      await flushPromises()
    }
    if (reason === 'unmount') {
      view.unmount()
      wrapper = undefined
    }
    await vi.advanceTimersByTimeAsync(600)
    if (reason !== 'unmount') {
      expect(card.classes()).not.toContain('selected')
      expect(card.classes()).not.toContain('is-pressing')
    }
    expect(preview).not.toHaveBeenCalled()
  }
)

it('does not start a long press from operation buttons or mouse pointers', async () => {
  vi.useFakeTimers()
  const view = create()
  const card = view.get('article')
  pointer(card.get('.action').element, 'pointerdown')
  await vi.advanceTimersByTimeAsync(500)
  pointer(card.get('img').element, 'pointerdown', { pointerType: 'mouse' })
  await vi.advanceTimersByTimeAsync(500)
  expect(card.classes()).not.toContain('is-pressing')
  expect(card.classes()).not.toContain('selected')
})

it('blocks image callouts throughout a touch gesture, including after pointercancel', async () => {
  vi.useFakeTimers()
  const view = create()
  const image = view.get('article img').element
  const menu = (target: Element) => {
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true })
    target.dispatchEvent(event)
    return event.defaultPrevented
  }
  expect(menu(image)).toBe(false)
  pointer(image, 'pointerdown')
  await vi.advanceTimersByTimeAsync(3000)
  expect(menu(image)).toBe(true)
  pointer(document, 'pointercancel')
  expect(menu(image)).toBe(true)
  expect(menu(view.get('.action').element)).toBe(false)
  document.dispatchEvent(new Event('touchend'))
  expect(menu(image)).toBe(true)
  await vi.advanceTimersByTimeAsync(0)
  expect(menu(image)).toBe(false)
})

it('preserves mouse and keyboard context menus and recognizes explicitly touch-generated menus', async () => {
  const view = create()
  const card = view.get('article')
  const image = card.get('img').element
  pointer(image, 'pointerdown')
  pointer(image, 'pointerdown', { pointerType: 'mouse' })
  const mouseMenu = new MouseEvent('contextmenu', { bubbles: true, cancelable: true })
  image.dispatchEvent(mouseMenu)
  expect(mouseMenu.defaultPrevented).toBe(false)
  pointer(image, 'pointerdown')
  await card.trigger('keydown', { key: 'ContextMenu' })
  const keyboardMenu = new MouseEvent('contextmenu', { bubbles: true, cancelable: true })
  image.dispatchEvent(keyboardMenu)
  expect(keyboardMenu.defaultPrevented).toBe(false)
  const touchMenu = new MouseEvent('contextmenu', { bubbles: true, cancelable: true })
  Object.defineProperty(touchMenu, 'pointerType', { value: 'touch' })
  image.dispatchEvent(touchMenu)
  expect(touchMenu.defaultPrevented).toBe(true)
})
