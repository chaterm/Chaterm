import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createI18n } from 'vue-i18n'
import CommandInputBar from '../CommandInputBar.vue'

const i18n = createI18n({
  legacy: false,
  locale: 'en-US',
  messages: {
    'en-US': {
      interaction: {
        inputCommand: 'Send input',
        inputPlaceholder: 'Enter input...',
        cancelTip: 'Send Ctrl+C'
      }
    }
  }
})

const focus = vi.fn()
const stubs = {
  'a-input': {
    template:
      '<input class="mock-input" :value="value" @input="$emit(\'update:value\', $event.target.value)" @keyup.enter="$emit(\'press-enter\')" />',
    props: ['value', 'placeholder', 'size'],
    emits: ['update:value', 'press-enter'],
    methods: { focus }
  },
  'a-button': {
    template: '<button class="mock-button" @click="$emit(\'click\')"><slot /></button>',
    emits: ['click']
  },
  'a-tooltip': {
    template: '<div class="mock-tooltip"><slot /></div>',
    props: ['title']
  }
}

const NOW = 1_800_000_000_000

describe('CommandInputBar', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    focus.mockClear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  const mountBar = (props: { startedAt: number; lastOutputAt: number | null; forceVisible?: boolean }) =>
    mount(CommandInputBar, {
      props: { commandId: 'cmd-1', ...props },
      global: { plugins: [i18n], stubs }
    })

  it('appears after 30 seconds of silence and stays when output resumes', async () => {
    const wrapper = mountBar({ startedAt: NOW - 25_000, lastOutputAt: NOW - 20_000 })
    expect(wrapper.find('.command-input-bar').exists()).toBe(false)

    await vi.advanceTimersByTimeAsync(9_000)
    expect(wrapper.find('.command-input-bar').exists()).toBe(false)

    await vi.advanceTimersByTimeAsync(1_000)
    expect(wrapper.find('.command-input-bar').exists()).toBe(true)
    expect(vi.getTimerCount()).toBe(0)

    await wrapper.setProps({ lastOutputAt: NOW + 10_000 })
    expect(wrapper.find('.command-input-bar').exists()).toBe(true)
    expect(focus).not.toHaveBeenCalled()
  })

  it('counts silence from the start when there is no output yet', () => {
    const wrapper = mountBar({ startedAt: NOW - 30_000, lastOutputAt: null })
    expect(wrapper.find('.command-input-bar').exists()).toBe(true)
  })

  it('shows immediately and focuses the input when a prompt is detected', async () => {
    const wrapper = mountBar({ startedAt: NOW, lastOutputAt: null })
    expect(wrapper.find('.command-input-bar').exists()).toBe(false)

    await wrapper.setProps({ forceVisible: true })
    await nextTick()

    expect(wrapper.find('.command-input-bar').exists()).toBe(true)
    expect(focus).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('submits the typed input with the button or Enter and clears it', async () => {
    const wrapper = mountBar({ startedAt: NOW, lastOutputAt: null, forceVisible: true })

    await wrapper.get('.mock-input').setValue('yes')
    await wrapper.get('.submit-btn').trigger('click')
    await wrapper.get('.mock-input').setValue('next')
    await wrapper.get('.mock-input').trigger('keyup.enter')

    expect(wrapper.emitted('submit')).toEqual([
      ['cmd-1', 'yes'],
      ['cmd-1', 'next']
    ])
    expect((wrapper.get('.mock-input').element as HTMLInputElement).value).toBe('')
  })

  it('emits cancel for Ctrl+C', async () => {
    const wrapper = mountBar({ startedAt: NOW, lastOutputAt: null, forceVisible: true })

    await wrapper.get('.interrupt-btn').trigger('click')

    expect(wrapper.emitted('cancel')).toEqual([['cmd-1']])
  })

  it('stops the silence timer when unmounted', () => {
    const wrapper = mountBar({ startedAt: NOW, lastOutputAt: null })
    expect(vi.getTimerCount()).toBe(1)

    wrapper.unmount()
    expect(vi.getTimerCount()).toBe(0)
  })
})
