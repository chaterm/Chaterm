import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import TerminalOutputRenderer from '../terminalOutputRenderer.vue'
import { getTerminalOutput } from '../../../composables/terminalOutputRegistry'

vi.mock('@xterm/xterm', () => ({
  Terminal: class {
    options: Record<string, unknown> = {}
    rows = 1
    buffer = { active: { length: 0, getLine: () => undefined } }
    open = vi.fn()
    write = vi.fn()
    clear = vi.fn()
    reset = vi.fn()
    resize = vi.fn()
    refresh = vi.fn()
    dispose = vi.fn()
    hasSelection = vi.fn(() => false)
    getSelection = vi.fn(() => '')
  }
}))
vi.mock('@xterm/xterm/css/xterm.css', () => ({}))
vi.mock('@/themes/terminalTheme', () => ({ getResolvedTerminalTheme: () => ({}) }))
vi.mock('@/store/userConfigStore', () => ({ userConfigStore: () => ({ getUserConfig: { theme: 'dark' } }) }))
vi.mock('@/locales', () => ({ default: { global: { t: (key: string) => key } } }))

const stubs = {
  'a-button': { template: '<button><slot /></button>' },
  CaretDownOutlined: true,
  CaretRightOutlined: true
}

const NOW = 1_800_000_000_000

describe('TerminalOutputRenderer run time', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  const mountOutput = (props: Record<string, unknown>) =>
    mount(TerminalOutputRenderer, { props: { content: '', hostName: '10.48.2.117', ...props }, global: { stubs } })

  it('counts up after the host while the command runs', async () => {
    const wrapper = mountOutput({ startedAt: NOW - 65_000, running: true })
    const header = wrapper.get('.output-title-section')
    expect(header.text()).toBe('OUTPUT10.48.2.1171:05')

    await vi.advanceTimersByTimeAsync(2000)
    expect(wrapper.get('.output-duration').text()).toBe('1:07')
  })

  it('shows the final duration and stops counting once finished', async () => {
    const wrapper = mountOutput({ startedAt: NOW - 65_000, running: true })
    await wrapper.setProps({ durationMs: 3_725_000 })

    expect(wrapper.get('.output-duration').text()).toBe('1:02:05')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('shows no time for output that is not running and has no recorded duration', () => {
    const wrapper = mountOutput({ startedAt: NOW - 65_000, running: false })
    expect(wrapper.find('.output-duration').exists()).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('registers its terminal for chat search while mounted', () => {
    const wrapper = mountOutput({})
    const element = wrapper.get('.terminal-output').element as HTMLElement

    expect(getTerminalOutput(element)).toBeDefined()

    wrapper.unmount()

    expect(getTerminalOutput(element)).toBeUndefined()
  })

  it('stops counting when unmounted', () => {
    const wrapper = mountOutput({ startedAt: NOW, running: true })
    expect(vi.getTimerCount()).toBeGreaterThan(0)

    wrapper.unmount()
    expect(vi.getTimerCount()).toBe(0)
  })
})
