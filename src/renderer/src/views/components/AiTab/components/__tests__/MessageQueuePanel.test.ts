import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import MessageQueuePanel from '../MessageQueuePanel.vue'
import type { QueuedMessage } from '../../composables/useSessionState'
import i18n from '@/locales'

const item = (id: string, content: string, injecting = false): QueuedMessage => ({ id, content, contentParts: [], injecting })

const mountPanel = (items: QueuedMessage[]) =>
  mount(MessageQueuePanel, {
    props: { items },
    global: {
      plugins: [i18n],
      stubs: {
        'a-dropdown': { template: '<div class="dropdown-stub"><slot /><slot name="overlay" /></div>' },
        'a-menu': { template: '<div><slot /></div>' },
        'a-menu-item': { template: '<button class="menu-item-stub" @click="$emit(\'click\')"><slot /></button>', emits: ['click'] }
      }
    }
  })

const rows = (wrapper: ReturnType<typeof mountPanel>) => wrapper.findAll('[data-testid="message-queue-item"]')

describe('MessageQueuePanel', () => {
  it('renders nothing for an empty queue', () => {
    expect(mountPanel([]).find('[data-testid="message-queue-panel"]').exists()).toBe(false)
  })

  it('lists queued messages under a header with the count', () => {
    const wrapper = mountPanel([item('a', 'first'), item('b', 'second')])

    expect(wrapper.get('[data-testid="message-queue-toggle"]').text()).toContain('2')
    expect(rows(wrapper).map((row) => row.get('.queue-text').text())).toEqual(['first', 'second'])
  })

  it('collapses and expands the list from the header', async () => {
    const wrapper = mountPanel([item('a', 'first')])
    const toggle = wrapper.get('[data-testid="message-queue-toggle"]')

    await toggle.trigger('click')
    expect(rows(wrapper)).toHaveLength(0)
    expect(toggle.attributes('aria-expanded')).toBe('false')

    await toggle.trigger('keydown.enter')
    expect(rows(wrapper)).toHaveLength(1)
    expect(toggle.attributes('aria-expanded')).toBe('true')
  })

  it('toggles the list with the Space key', async () => {
    const wrapper = mountPanel([item('a', 'first')])
    const toggle = wrapper.get('[data-testid="message-queue-toggle"]')

    await toggle.trigger('keydown.space')
    expect(rows(wrapper)).toHaveLength(0)
    expect(toggle.attributes('aria-expanded')).toBe('false')

    await toggle.trigger('keydown.space')
    expect(rows(wrapper)).toHaveLength(1)
    expect(toggle.attributes('aria-expanded')).toBe('true')
  })

  it('emits send-now, remove and edit with the message id', async () => {
    const wrapper = mountPanel([item('a', 'first'), item('b', 'second')])
    const second = rows(wrapper)[1]

    await second.get('[data-testid="message-queue-send-now"]').trigger('click')
    await second.get('[data-testid="message-queue-remove"]').trigger('click')
    await second.get('[data-testid="message-queue-edit"]').trigger('click')

    expect(wrapper.emitted('send-now')).toEqual([['b']])
    expect(wrapper.emitted('remove')).toEqual([['b']])
    expect(wrapper.emitted('edit')).toEqual([['b']])
  })

  it('disables the actions and dragging of a message being injected', () => {
    const wrapper = mountPanel([item('a', 'merging now', true)])
    const row = rows(wrapper)[0]

    expect(row.classes()).toContain('injecting')
    expect(row.attributes('draggable')).toBe('false')
    for (const id of ['send-now', 'remove', 'more']) {
      expect(row.get(`[data-testid="message-queue-${id}"]`).attributes('disabled')).toBeDefined()
    }
  })

  it('emits move with the dragged and the drop target ids', async () => {
    const wrapper = mountPanel([item('a', 'first'), item('b', 'second')])
    const [first, second] = rows(wrapper)

    await first.trigger('dragstart', { dataTransfer: { effectAllowed: '' } })
    await second.trigger('dragover')
    expect(second.classes()).toContain('drag-over')

    await second.trigger('drop')
    expect(wrapper.emitted('move')).toEqual([['a', 'b']])
    expect(second.classes()).not.toContain('drag-over')
  })

  it('starts a drag without a data transfer and clears the indicator on leave and end', async () => {
    const wrapper = mountPanel([item('a', 'first'), item('b', 'second')])
    const [first, second] = rows(wrapper)

    await first.trigger('dragstart')
    await second.trigger('dragover')
    await second.trigger('dragleave')
    expect(second.classes()).not.toContain('drag-over')

    await second.trigger('dragover')
    await first.trigger('dragend')
    expect(second.classes()).not.toContain('drag-over')
  })

  it('ignores a drop that has no dragged message', async () => {
    const wrapper = mountPanel([item('a', 'first')])

    await rows(wrapper)[0].trigger('drop')

    expect(wrapper.emitted('move')).toBeUndefined()
  })
})
