import { defineComponent, h, mergeProps, reactive, ref } from 'vue'
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import FollowupOptions from '../FollowupOptions.vue'
import type { ChatMessage } from '../../types'

const mocks = vi.hoisted(() => ({
  state: {} as ReturnType<typeof createMessageOptions>
}))

vi.mock('../../composables/useMessageOptions', () => ({ useMessageOptions: () => mocks.state }))

const createMessageOptions = () => ({
  customInput: ref(''),
  handleCustomInputChange: vi.fn(),
  getCustomInput: vi.fn(() => ''),
  hasCustomInput: vi.fn(() => false),
  handleOptionChoose: vi.fn(),
  handleOptionSubmit: vi.fn(),
  handleOptionSkip: vi.fn(),
  handleCustomInputKeydown: vi.fn()
})

const textareaStub = defineComponent({
  inheritAttrs: false,
  props: ['value', 'placeholder', 'disabled'],
  emits: ['input', 'keydown'],
  setup(props, { attrs, emit }) {
    return () =>
      h(
        'textarea',
        mergeProps(attrs, {
          value: props.value,
          placeholder: props.placeholder,
          disabled: props.disabled,
          onInput: (event: Event) => emit('input', event),
          onKeydown: (event: KeyboardEvent) => emit('keydown', event)
        })
      )
  }
})
const buttonStub = defineComponent({
  inheritAttrs: false,
  setup(_, { attrs, slots }) {
    return () => h('button', attrs, slots.default?.())
  }
})

const mountOptions = (content: Record<string, unknown>, overrides: Partial<ChatMessage> = {}) => {
  const message = reactive({ id: 'followup-1', role: 'assistant', ask: 'followup', content, ...overrides }) as ChatMessage
  const wrapper = mount(FollowupOptions, {
    props: { message },
    global: { stubs: { 'a-textarea': textareaStub, 'a-button': buttonStub }, mocks: { $t: (key: string) => key } }
  })
  return { wrapper, message }
}

describe('FollowupOptions', () => {
  beforeEach(() => {
    mocks.state = createMessageOptions()
  })

  it('renders numbered options', () => {
    const { wrapper } = mountOptions({ question: 'Q', options: ['Read only', 'Plan A'] })

    const options = wrapper.findAll('.followup-option')
    expect(options.map((o) => o.get('.followup-option-index').text())).toEqual(['1', '2'])
    expect(options.map((o) => o.get('.followup-option-label').text())).toEqual(['Read only', 'Plan A'])
  })

  it('renders only the custom row when the question has no options', () => {
    const { wrapper } = mountOptions({ question: 'Q' })

    expect(wrapper.findAll('.followup-option')).toHaveLength(0)
    expect(wrapper.find('.followup-custom').exists()).toBe(true)
  })

  it('answers with the clicked option', async () => {
    const { wrapper, message } = mountOptions({ question: 'Q', options: ['Read only', 'Plan A'] })

    await wrapper.findAll('.followup-option')[1].trigger('click')

    expect(mocks.state.handleOptionChoose).toHaveBeenCalledExactlyOnceWith(message, 'Plan A')
  })

  it('forwards typed text, including an emptied input, and key presses', async () => {
    const { wrapper, message } = mountOptions({ question: 'Q', options: ['A'] })
    const textarea = wrapper.get('textarea')

    await textarea.setValue('typed answer')
    await textarea.setValue('')
    await textarea.trigger('keydown', { key: 'Enter' })

    expect(mocks.state.handleCustomInputChange).toHaveBeenNthCalledWith(1, message, 'typed answer')
    expect(mocks.state.handleCustomInputChange).toHaveBeenNthCalledWith(2, message, '')
    expect(mocks.state.handleCustomInputKeydown).toHaveBeenCalledWith(message, expect.objectContaining({ key: 'Enter' }))
  })

  it('shows skip while the input is empty and submit once text is typed', async () => {
    const { wrapper, message } = mountOptions({ question: 'Q', options: ['A'] })

    expect(wrapper.get('.followup-skip-btn').text()).toBe('ai.skip')
    await wrapper.get('.followup-skip-btn').trigger('click')
    expect(mocks.state.handleOptionSkip).toHaveBeenCalledExactlyOnceWith(message)

    mocks.state.hasCustomInput.mockReturnValue(true)
    const typed = mountOptions({ question: 'Q', options: ['A'] })
    expect(typed.wrapper.find('.followup-skip-btn').exists()).toBe(false)
    await typed.wrapper.get('.followup-action-btn').trigger('click')
    expect(typed.wrapper.get('.followup-action-btn').text()).toBe('ai.submit')
    expect(mocks.state.handleOptionSubmit).toHaveBeenCalledExactlyOnceWith(typed.message)
  })

  it('disables every control while the question is still streaming', () => {
    const { wrapper } = mountOptions({ question: 'Q', options: ['A', 'B'] }, { partial: true })

    const disabled = wrapper.findAll('button, textarea').map((el) => el.attributes('disabled') !== undefined)
    expect(disabled.length).toBeGreaterThan(0)
    expect(disabled.every(Boolean)).toBe(true)
  })
})
