import { describe, it, expect, vi, beforeEach } from 'vitest'
import { defineComponent, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { useEventBusListeners } from '../useEventBusListeners'
import { useSessionState } from '../useSessionState'

const { handlers } = vi.hoisted(() => ({
  handlers: new Map<string, Set<(payload?: unknown) => void>>()
}))

vi.mock('@/utils/eventBus', () => ({
  default: {
    on: vi.fn((event: string, handler: (payload?: unknown) => void) => {
      if (!handlers.has(event)) handlers.set(event, new Set())
      handlers.get(event)!.add(handler)
    }),
    off: vi.fn((event: string, handler?: (payload?: unknown) => void) => {
      if (!handler) {
        handlers.delete(event)
        return
      }
      handlers.get(event)?.delete(handler)
    }),
    emit: vi.fn((event: string, payload?: unknown) => {
      handlers.get(event)?.forEach((handler) => handler(payload))
    })
  }
}))

vi.mock('../useTabManagement', () => ({
  focusChatInput: vi.fn()
}))

vi.mock('@/locales', () => ({
  default: {
    global: {
      t: vi.fn((key: string) => key)
    }
  }
}))

vi.mock('@/views/components/Notice', () => ({
  Notice: {
    open: vi.fn()
  }
}))

vi.mock('../../utils', () => ({
  isSwitchAssetType: vi.fn(() => false)
}))

describe('useEventBusListeners', () => {
  beforeEach(() => {
    handlers.clear()
    const sessionState = useSessionState()
    sessionState.chatTabs.value = []
    sessionState.currentChatId.value = undefined
  })

  it('queues chatToAi text until a chat session exists', async () => {
    const getCurentTabAssetInfo = vi.fn().mockResolvedValue(null)
    const updateHosts = vi.fn()
    const sessionState = useSessionState()

    mount(
      defineComponent({
        setup() {
          useEventBusListeners({
            sendMessageWithContent: vi.fn(),
            initModel: vi.fn(),
            getCurentTabAssetInfo,
            updateHosts,
            isAgentMode: false
          })
        },
        template: '<div />'
      })
    )

    await nextTick()
    const eventBus = (await import('@/utils/eventBus')).default

    eventBus.emit('chatToAi', 'Terminal output')
    await nextTick()

    expect(sessionState.chatInputParts.value).toEqual([])

    const chatId = 'chat-1'
    sessionState.chatTabs.value.push({
      id: chatId,
      title: 'New chat',
      hosts: [],
      chatType: 'cmd',
      autoUpdateHost: true,
      session: sessionState.createEmptySessionState(),
      chatInputParts: [],
      modelValue: '',
      welcomeTip: ''
    })
    sessionState.currentChatId.value = chatId
    await nextTick()
    await nextTick()

    expect(sessionState.chatInputParts.value).toEqual([{ type: 'text', text: 'Terminal output\n' }])
    expect(getCurentTabAssetInfo).toHaveBeenCalled()
  })
})
