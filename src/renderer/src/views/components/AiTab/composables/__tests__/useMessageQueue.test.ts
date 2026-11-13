import { describe, it, expect, vi, beforeEach } from 'vitest'
import { markRaw, reactive } from 'vue'
import { useMessageQueue } from '../useMessageQueue'
import { useSessionState, type ChatTab } from '../useSessionState'
import type { ContentPart } from '@shared/WebviewMessage'

const mockSendToMain = vi.fn()
;(globalThis as any).window.api = { sendToMain: mockSendToMain }

const text = (value: string): ContentPart => ({ type: 'text', text: value })
const image: ContentPart = { type: 'image', mediaType: 'image/png', data: 'abc' }

describe('useMessageQueue', () => {
  const sendMessageWithContent = vi.fn()
  const clearTodoState = vi.fn()
  const scrollToBottom = vi.fn()
  const currentTodos = { value: [] as unknown[] }

  const createTab = (id: string, overrides: Partial<ChatTab['session']> = {}, hosts: ChatTab['hosts'] = []): ChatTab => {
    const { createEmptySessionState } = useSessionState()
    return reactive({
      id,
      title: id,
      hosts,
      chatType: 'agent',
      autoUpdateHost: false,
      session: { ...createEmptySessionState(), ...overrides },
      chatInputParts: [],
      modelValue: '',
      welcomeTip: ''
    }) as ChatTab
  }

  const setup = (tabs: ChatTab[], activeId = tabs[0]?.id) => {
    const state = useSessionState()
    state.chatTabs.value = tabs
    state.currentChatId.value = activeId
    return { queue: useMessageQueue({ sendMessageWithContent, clearTodoState, currentTodos, scrollToBottom }), tabs, state }
  }

  const queueOf = (tab: ChatTab) => tab.session.messageQueue

  beforeEach(() => {
    vi.clearAllMocks()
    currentTodos.value = []
    mockSendToMain.mockResolvedValue(undefined)
  })

  describe('enqueue', () => {
    it('appends a message that is not yet injecting', () => {
      const { queue, tabs } = setup([createTab('t1')])
      queue.enqueue('hello', [text('hello')])

      expect(queueOf(tabs[0])).toHaveLength(1)
      expect(queueOf(tabs[0])[0]).toMatchObject({ content: 'hello', contentParts: [text('hello')], injecting: false })
    })

    it('does nothing without an active session', () => {
      const { queue } = setup([], undefined)
      expect(() => queue.enqueue('hello', [])).not.toThrow()
    })
  })

  describe('remove', () => {
    it('removes a queued message', () => {
      const { queue, tabs } = setup([createTab('t1')])
      queue.enqueue('a', [])
      queue.remove(queueOf(tabs[0])[0].id)

      expect(queueOf(tabs[0])).toHaveLength(0)
    })

    it('keeps a message that is already injecting', () => {
      const { queue, tabs } = setup([createTab('t1')])
      queue.enqueue('a', [])
      queueOf(tabs[0])[0].injecting = true
      queue.remove(queueOf(tabs[0])[0].id)

      expect(queueOf(tabs[0])).toHaveLength(1)
    })

    it('ignores an unknown id', () => {
      const { queue, tabs } = setup([createTab('t1')])
      queue.enqueue('a', [])
      queue.remove('missing')

      expect(queueOf(tabs[0])).toHaveLength(1)
    })

    it('does nothing without an active session', () => {
      const { queue } = setup([], undefined)
      expect(() => queue.remove('x')).not.toThrow()
    })
  })

  describe('move', () => {
    const enqueueThree = () => {
      const ctx = setup([createTab('t1')])
      ;['a', 'b', 'c'].forEach((value) => ctx.queue.enqueue(value, []))
      return { ...ctx, ids: queueOf(ctx.tabs[0]).map((item) => item.id) }
    }
    const contents = (tab: ChatTab) => queueOf(tab).map((item) => item.content)

    it('places the dragged message at the drop target position', () => {
      const { queue, tabs, ids } = enqueueThree()
      queue.move(ids[0], ids[2])
      expect(contents(tabs[0])).toEqual(['b', 'c', 'a'])

      queue.move(ids[2], ids[1])
      expect(contents(tabs[0])).toEqual(['c', 'b', 'a'])
    })

    it('moves a later message before an earlier one', () => {
      const { queue, tabs, ids } = enqueueThree()
      queue.move(ids[2], ids[0])
      expect(contents(tabs[0])).toEqual(['c', 'a', 'b'])
    })

    it('ignores a drop onto itself', () => {
      const { queue, tabs, ids } = enqueueThree()
      queue.move(ids[1], ids[1])
      expect(contents(tabs[0])).toEqual(['a', 'b', 'c'])
    })

    it('ignores unknown ids', () => {
      const { queue, tabs, ids } = enqueueThree()
      queue.move('missing', ids[0])
      queue.move(ids[0], 'missing')
      expect(contents(tabs[0])).toEqual(['a', 'b', 'c'])
    })

    it('does not move a message that is injecting', () => {
      const { queue, tabs, ids } = enqueueThree()
      queueOf(tabs[0])[0].injecting = true
      queue.move(ids[0], ids[2])
      expect(contents(tabs[0])).toEqual(['a', 'b', 'c'])
    })

    it('does nothing without an active session', () => {
      const { queue } = setup([], undefined)
      expect(() => queue.move('a', 'b')).not.toThrow()
    })
  })

  describe('edit', () => {
    it('moves the message back into an empty input', () => {
      const { queue, tabs, state } = setup([createTab('t1')])
      queue.enqueue('hello', [text('hello')])
      queue.edit(queueOf(tabs[0])[0].id)

      expect(state.chatInputParts.value).toEqual([text('hello')])
      expect(queueOf(tabs[0])).toHaveLength(0)
    })

    it('appends after the current draft with a separator', () => {
      const { queue, tabs, state } = setup([createTab('t1')])
      state.chatInputParts.value = [text('draft')]
      queue.enqueue('hello', [text('hello')])
      queue.edit(queueOf(tabs[0])[0].id)

      expect(state.chatInputParts.value).toEqual([text('draft'), text(' '), text('hello')])
    })

    it('adds no separator when only an image is restored', () => {
      const { queue, tabs, state } = setup([createTab('t1')])
      state.chatInputParts.value = [text('draft')]
      queue.enqueue('[image]', [image])
      queue.edit(queueOf(tabs[0])[0].id)

      expect(state.chatInputParts.value).toEqual([text('draft'), image])
    })

    it('keeps a message that is already injecting', () => {
      const { queue, tabs, state } = setup([createTab('t1')])
      queue.enqueue('hello', [text('hello')])
      queueOf(tabs[0])[0].injecting = true
      queue.edit(queueOf(tabs[0])[0].id)

      expect(state.chatInputParts.value).toEqual([])
      expect(queueOf(tabs[0])).toHaveLength(1)
    })

    it('ignores an unknown id', () => {
      const { queue, state } = setup([createTab('t1')])
      queue.edit('missing')
      expect(state.chatInputParts.value).toEqual([])
    })

    it('does nothing without an active session', () => {
      const { queue } = setup([], undefined)
      expect(() => queue.edit('x')).not.toThrow()
    })
  })

  describe('sendNow', () => {
    it('sends directly when the agent is idle', async () => {
      const { queue, tabs } = setup([createTab('t1')])
      queue.enqueue('hello', [text('hello')])
      await queue.sendNow(queueOf(tabs[0])[0].id)

      expect(sendMessageWithContent).toHaveBeenCalledWith('hello', 'send', 't1', undefined, [text('hello')])
      expect(mockSendToMain).not.toHaveBeenCalled()
      expect(queueOf(tabs[0])).toHaveLength(0)
    })

    it('clears the todo list of the active tab when sending directly', async () => {
      currentTodos.value = [{ id: 1 }]
      const { queue, tabs } = setup([createTab('t1')])
      queue.enqueue('hello', [])
      await queue.sendNow(queueOf(tabs[0])[0].id)

      expect(clearTodoState).toHaveBeenCalledWith(tabs[0].session.chatHistory)
    })

    it('hands the message to the main process while the agent runs', async () => {
      const { queue, tabs } = setup([createTab('t1', { responseLoading: true })])
      queue.enqueue('hello', [text('hello')])
      const item = queueOf(tabs[0])[0]
      await queue.sendNow(item.id)

      expect(mockSendToMain).toHaveBeenCalledWith({
        type: 'injectUserMessage',
        text: 'hello',
        contentParts: [text('hello')],
        queuedMessageId: item.id,
        tabId: 't1',
        taskId: 't1'
      })
      expect(sendMessageWithContent).not.toHaveBeenCalled()
      expect(item.injecting).toBe(true)
      expect(queueOf(tabs[0])).toHaveLength(1)
    })

    it('passes parts that are already plain objects through unchanged', async () => {
      const plain = markRaw(text('plain'))
      const { queue, tabs } = setup([createTab('t1', { responseLoading: true })])
      queue.enqueue('plain', [plain])
      await queue.sendNow(queueOf(tabs[0])[0].id)

      expect(mockSendToMain.mock.calls[0][0].contentParts[0]).toBe(plain)
    })

    it('restores the message when the main process call fails', async () => {
      mockSendToMain.mockRejectedValueOnce(new Error('ipc down'))
      const { queue, tabs } = setup([createTab('t1', { responseLoading: true })])
      queue.enqueue('hello', [])
      const item = queueOf(tabs[0])[0]
      await queue.sendNow(item.id)

      expect(item.injecting).toBe(false)
    })

    it('does not send a message twice', async () => {
      const { queue, tabs } = setup([createTab('t1', { responseLoading: true })])
      queue.enqueue('hello', [])
      const item = queueOf(tabs[0])[0]
      await queue.sendNow(item.id)
      await queue.sendNow(item.id)

      expect(mockSendToMain).toHaveBeenCalledTimes(1)
    })

    it('ignores an unknown id and a missing session', async () => {
      const { queue } = setup([createTab('t1')])
      await queue.sendNow('missing')

      const empty = setup([], undefined)
      await empty.queue.sendNow('missing')

      expect(sendMessageWithContent).not.toHaveBeenCalled()
      expect(mockSendToMain).not.toHaveBeenCalled()
    })
  })

  describe('drainNext', () => {
    it('sends the first queued message once the agent is idle', async () => {
      const { queue, tabs } = setup([createTab('t1')])
      queue.enqueue('a', [text('a')])
      queue.enqueue('b', [text('b')])
      await queue.drainNext('t1')

      expect(sendMessageWithContent).toHaveBeenCalledTimes(1)
      expect(sendMessageWithContent).toHaveBeenCalledWith('a', 'send', 't1', undefined, [text('a')])
      expect(queueOf(tabs[0]).map((item) => item.content)).toEqual(['b'])
    })

    it('clears the todo list only for the active tab', async () => {
      currentTodos.value = [{ id: 1 }]
      const { queue } = setup([createTab('t1'), createTab('t2')], 't1')
      queue.enqueue('a', [])
      useSessionState().chatTabs.value[1].session.messageQueue.push({ id: 'q2', content: 'b', contentParts: [], injecting: false })

      await queue.drainNext('t1')
      expect(clearTodoState).toHaveBeenCalledTimes(1)

      await queue.drainNext('t2')
      expect(clearTodoState).toHaveBeenCalledTimes(1)
    })

    it('waits while the agent is still responding', async () => {
      const { queue, tabs } = setup([createTab('t1', { responseLoading: true })])
      queue.enqueue('a', [])
      await queue.drainNext('t1')

      expect(sendMessageWithContent).not.toHaveBeenCalled()
      expect(queueOf(tabs[0])).toHaveLength(1)
    })

    it('waits while a message is being injected', async () => {
      const { queue, tabs } = setup([createTab('t1')])
      queue.enqueue('a', [])
      queue.enqueue('b', [])
      queueOf(tabs[0])[0].injecting = true
      await queue.drainNext('t1')

      expect(sendMessageWithContent).not.toHaveBeenCalled()
    })

    it('does nothing for an empty queue or an unknown tab', async () => {
      const { queue } = setup([createTab('t1')])
      await queue.drainNext('t1')
      await queue.drainNext('missing')

      expect(sendMessageWithContent).not.toHaveBeenCalled()
    })
  })

  describe('handleInjected', () => {
    it('moves the confirmed message into the chat history and resumes loading', () => {
      const hosts = [{ host: '10.0.0.1', uuid: 'h1', connection: 'personal' }]
      const { queue, tabs } = setup([createTab('t1', {}, hosts)])
      queue.enqueue('hello', [text('hello')])
      const id = queueOf(tabs[0])[0].id
      queue.handleInjected('t1', id)

      const [message] = tabs[0].session.chatHistory
      expect(message).toMatchObject({ role: 'user', content: 'hello', contentParts: [text('hello')], hosts })
      expect(queueOf(tabs[0])).toHaveLength(0)
      expect(tabs[0].session.responseLoading).toBe(true)
      expect(scrollToBottom).toHaveBeenCalledWith(true)
    })

    it('omits hosts when the tab has none', () => {
      const { queue, tabs } = setup([createTab('t1')])
      queue.enqueue('hello', [])
      queue.handleInjected('t1', queueOf(tabs[0])[0].id)

      expect(tabs[0].session.chatHistory[0]).not.toHaveProperty('hosts')
    })

    it('keeps loading off for a cancelled run and skips scrolling in background tabs', () => {
      const { queue, tabs } = setup([createTab('t1'), createTab('t2', { isCancelled: true })], 't1')
      tabs[1].session.messageQueue.push({ id: 'q', content: 'hello', contentParts: [], injecting: true })
      queue.handleInjected('t2', 'q')

      expect(tabs[1].session.chatHistory).toHaveLength(1)
      expect(tabs[1].session.responseLoading).toBe(false)
      expect(scrollToBottom).not.toHaveBeenCalled()
    })

    it('ignores unknown tabs and unknown messages', () => {
      const { queue, tabs } = setup([createTab('t1')])
      queue.handleInjected('missing', 'q')
      queue.handleInjected('t1', 'missing')

      expect(tabs[0].session.chatHistory).toHaveLength(0)
    })
  })
})
