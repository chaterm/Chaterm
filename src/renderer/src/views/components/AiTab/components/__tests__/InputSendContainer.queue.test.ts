import { describe, it, expect, vi, beforeEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { reactive } from 'vue'
import InputSendContainer from '../InputSendContainer.vue'
import { useSessionState, type ChatTab } from '../../composables/useSessionState'
import i18n from '@/locales'

vi.mock('@/utils/edition', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/utils/edition')>()), getDeployStatus: () => 1 }))
vi.mock('@/utils/telemetry', () => ({ captureButtonClick: vi.fn() }))
vi.mock('../voice/voiceInput.vue', () => ({ default: { template: '<span />' } }))
vi.mock('../ContextSelectPopup.vue', () => ({ default: { template: '<span />' } }))
vi.mock('../CommandSelectPopup.vue', () => ({ default: { template: '<span />' } }))

const api = new Proxy({} as Record<string, unknown>, {
  get: (target, key: string) => target[key] ?? vi.fn().mockResolvedValue(undefined)
})
;(globalThis as any).window.api = api

describe('InputSendContainer queueing', () => {
  const sendMessage = vi.fn().mockResolvedValue(undefined)
  const handleInterrupt = vi.fn()

  const setup = (responseLoading: boolean, draft: string, props: Record<string, unknown> = {}) => {
    const state = useSessionState()
    const tab = reactive({
      id: 't1',
      title: 't1',
      hosts: [],
      chatType: 'agent',
      autoUpdateHost: false,
      session: { ...state.createEmptySessionState(), responseLoading },
      chatInputParts: draft ? [{ type: 'text', text: draft }] : [],
      modelValue: '',
      welcomeTip: ''
    }) as unknown as ChatTab
    state.chatTabs.value = [tab]
    state.currentChatId.value = 't1'
    return mount(InputSendContainer, {
      props: { isActiveTab: true, sendMessage, handleInterrupt, ...props },
      global: {
        plugins: [i18n],
        stubs: { 'a-tooltip': { template: '<span><slot /></span>' }, 'a-button': { template: '<button><slot /></button>' } }
      }
    })
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  const sendButton = (wrapper: ReturnType<typeof setup>) => wrapper.get('[data-testid="send-message-btn"]')

  it('queues typed content instead of interrupting while the agent runs', async () => {
    const wrapper = setup(true, 'and check disk usage')

    expect(sendButton(wrapper).find('img').attributes('alt')).toBe('send')
    await sendButton(wrapper).trigger('click')

    expect(sendMessage).toHaveBeenCalledWith('send')
    expect(handleInterrupt).not.toHaveBeenCalled()
  })

  it('interrupts while the agent runs and the input is empty', async () => {
    const wrapper = setup(true, '')

    expect(sendButton(wrapper).find('img').attributes('alt')).toBe('stop')
    await sendButton(wrapper).trigger('click')

    expect(handleInterrupt).toHaveBeenCalledTimes(1)
    expect(sendMessage).not.toHaveBeenCalled()
  })

  it('sends normally when the agent is idle', async () => {
    const wrapper = setup(false, 'hello')

    expect(sendButton(wrapper).find('img').attributes('alt')).toBe('send')
    await sendButton(wrapper).trigger('click')

    expect(sendMessage).toHaveBeenCalledWith('send')
    expect(handleInterrupt).not.toHaveBeenCalled()
  })

  it('still interrupts in edit mode even when the draft has content', async () => {
    const wrapper = setup(true, '', { mode: 'edit', initialContentParts: [{ type: 'text', text: 'edited' }] })
    await flushPromises()

    expect(wrapper.find('[contenteditable]').text()).toBe('edited')
    expect(sendButton(wrapper).find('img').attributes('alt')).toBe('stop')
    await sendButton(wrapper).trigger('click')

    expect(handleInterrupt).toHaveBeenCalledTimes(1)
    expect(sendMessage).not.toHaveBeenCalled()
  })
})
