import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useMessageOptions } from '../useMessageOptions'
import { useSessionState } from '../useSessionState'
import type { ChatMessage } from '../../types'

// Mock useSessionState
vi.mock('../useSessionState', () => ({
  useSessionState: vi.fn()
}))

// Mock window.api
const mockSendToMain = vi.fn()
global.window = {
  api: {
    sendToMain: mockSendToMain
  }
} as any

describe('useMessageOptions', () => {
  const mockSession = {
    chatHistory: [],
    lastChatMessageId: '',
    responseLoading: false,
    showRetryButton: false,
    showSendButton: true,
    buttonsDisabled: false,
    isExecutingCommand: false,
    lastStreamMessage: null,
    lastPartialMessage: null,
    lastStateChatermMessages: null,
    shouldStickToBottom: true,
    isCancelled: false
  }

  const mockAttachTabContext = vi.fn((payload) => ({
    ...payload,
    tabId: 'test-tab-id',
    taskId: 'test-tab-id'
  }))

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useSessionState).mockReturnValue({
      currentSession: { value: mockSession },
      attachTabContext: mockAttachTabContext
    } as any)
  })

  const makeMessage = (overrides: Partial<ChatMessage> = {}): ChatMessage => ({
    id: 'msg-1',
    role: 'assistant',
    content: { question: 'Test', options: ['Option 1', 'Option 2'] },
    ask: 'followup',
    ...overrides
  })

  describe('custom input state', () => {
    it('should return empty string when no custom input is set', () => {
      const { getCustomInput, hasCustomInput } = useMessageOptions()
      const message = makeMessage()

      expect(getCustomInput(message)).toBe('')
      expect(hasCustomInput(message)).toBe(false)
    })

    it('should store and update the custom input per message', () => {
      const { handleCustomInputChange, getCustomInput } = useMessageOptions()
      const first = makeMessage()
      const second = makeMessage({ id: 'msg-2' })

      handleCustomInputChange(first, 'First value')
      handleCustomInputChange(second, 'Other')
      handleCustomInputChange(first, 'Second value')

      expect(getCustomInput(first)).toBe('Second value')
      expect(getCustomInput(second)).toBe('Other')
    })

    it('should treat whitespace-only input as empty', () => {
      const { handleCustomInputChange, hasCustomInput } = useMessageOptions()
      const message = makeMessage()

      handleCustomInputChange(message, '   ')
      expect(hasCustomInput(message)).toBe(false)

      handleCustomInputChange(message, ' a ')
      expect(hasCustomInput(message)).toBe(true)
    })
  })

  describe('isOptionAnswered', () => {
    it('should be false for an untouched message', () => {
      const { isOptionAnswered } = useMessageOptions()

      expect(isOptionAnswered(makeMessage())).toBe(false)
    })

    it('should be true once an option is selected or the question is skipped', () => {
      const { isOptionAnswered } = useMessageOptions()

      expect(isOptionAnswered(makeMessage({ selectedOption: 'Option 1' }))).toBe(true)
      expect(isOptionAnswered(makeMessage({ skipped: true }))).toBe(true)
    })
  })

  describe('handleOptionChoose', () => {
    it('should send a preset option immediately and mark the message answered', async () => {
      const { handleOptionChoose } = useMessageOptions()
      const message = makeMessage()
      mockSendToMain.mockResolvedValue({ success: true })

      await handleOptionChoose(message, 'Option 1')

      expect(mockSendToMain).toHaveBeenCalledWith({
        type: 'askResponse',
        askResponse: 'optionResponse',
        text: 'Option 1',
        tabId: 'test-tab-id',
        taskId: 'test-tab-id'
      })
      expect(message.selectedOption).toBe('Option 1')
      expect(mockSession.responseLoading).toBe(true)
    })

    it('should ignore a second choice on an answered message', async () => {
      const { handleOptionChoose } = useMessageOptions()
      const message = makeMessage({ selectedOption: 'Option 1' })

      await handleOptionChoose(message, 'Option 2')

      expect(mockSendToMain).not.toHaveBeenCalled()
      expect(message.selectedOption).toBe('Option 1')
    })

    it('should not send when the session is not available', async () => {
      vi.mocked(useSessionState).mockReturnValue({
        currentSession: { value: null },
        attachTabContext: mockAttachTabContext
      } as any)
      const { handleOptionChoose } = useMessageOptions()
      const message = makeMessage()

      await handleOptionChoose(message, 'Option 1')

      expect(mockSendToMain).not.toHaveBeenCalled()
      expect(message.selectedOption).toBeUndefined()
    })

    it('should reopen the question and log an error when sending fails', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const { handleOptionChoose, isOptionAnswered } = useMessageOptions()
      const message = makeMessage()
      mockSendToMain.mockRejectedValue(new Error('Network error'))

      await handleOptionChoose(message, 'Option 1')

      expect(isOptionAnswered(message)).toBe(false)
      expect(consoleSpy).toHaveBeenCalledWith('[ai.messageOptions] Failed to send message to main process', { error: expect.any(Error) })
      consoleSpy.mockRestore()
    })
  })

  describe('handleOptionSubmit', () => {
    it('should send the trimmed custom input', async () => {
      const { handleCustomInputChange, handleOptionSubmit } = useMessageOptions()
      const message = makeMessage()
      handleCustomInputChange(message, '  Custom value  ')
      mockSendToMain.mockResolvedValue({ success: true })

      await handleOptionSubmit(message)

      expect(mockSendToMain).toHaveBeenCalledWith({
        type: 'askResponse',
        askResponse: 'optionResponse',
        text: 'Custom value',
        tabId: 'test-tab-id',
        taskId: 'test-tab-id'
      })
      expect(message.selectedOption).toBe('Custom value')
    })

    it('should not send when the custom input is empty after trim', async () => {
      const { handleCustomInputChange, handleOptionSubmit } = useMessageOptions()
      const message = makeMessage()
      handleCustomInputChange(message, '   ')

      await handleOptionSubmit(message)

      expect(mockSendToMain).not.toHaveBeenCalled()
    })
  })

  describe('handleOptionSkip', () => {
    it('should send a no-button response and mark the message skipped', async () => {
      const { handleOptionSkip } = useMessageOptions()
      const message = makeMessage()
      mockSendToMain.mockResolvedValue({ success: true })

      await handleOptionSkip(message)

      expect(mockSendToMain).toHaveBeenCalledWith({
        type: 'askResponse',
        askResponse: 'noButtonClicked',
        text: '',
        tabId: 'test-tab-id',
        taskId: 'test-tab-id'
      })
      expect(message.skipped).toBe(true)
      expect(mockSession.responseLoading).toBe(true)
    })

    it('should reopen the question when sending fails', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const { handleOptionSkip, isOptionAnswered } = useMessageOptions()
      const message = makeMessage()
      mockSendToMain.mockRejectedValue(new Error('Network error'))

      await handleOptionSkip(message)

      expect(isOptionAnswered(message)).toBe(false)
      consoleSpy.mockRestore()
    })

    it('should ignore a skip on an answered message', async () => {
      const { handleOptionSkip } = useMessageOptions()

      await handleOptionSkip(makeMessage({ selectedOption: 'Option 1' }))

      expect(mockSendToMain).not.toHaveBeenCalled()
    })

    it('should not send when the session is not available', async () => {
      vi.mocked(useSessionState).mockReturnValue({
        currentSession: { value: null },
        attachTabContext: mockAttachTabContext
      } as any)
      const { handleOptionSkip } = useMessageOptions()
      const message = makeMessage()

      await handleOptionSkip(message)

      expect(mockSendToMain).not.toHaveBeenCalled()
      expect(message.skipped).toBeUndefined()
    })
  })

  describe('handleCustomInputKeydown', () => {
    const keydown = (init: KeyboardEventInit) => new KeyboardEvent('keydown', { cancelable: true, ...init })

    it('should submit on Enter and suppress the newline', async () => {
      const { handleCustomInputChange, handleCustomInputKeydown } = useMessageOptions()
      const message = makeMessage()
      handleCustomInputChange(message, 'Custom value')
      mockSendToMain.mockResolvedValue({ success: true })
      const event = keydown({ key: 'Enter' })

      handleCustomInputKeydown(message, event)
      await vi.waitFor(() => expect(mockSendToMain).toHaveBeenCalled())

      expect(event.defaultPrevented).toBe(true)
      expect(mockSendToMain).toHaveBeenCalledWith(expect.objectContaining({ askResponse: 'optionResponse', text: 'Custom value' }))
    })

    it('should leave Shift+Enter to insert a newline', () => {
      const { handleCustomInputChange, handleCustomInputKeydown } = useMessageOptions()
      const message = makeMessage()
      handleCustomInputChange(message, 'Custom value')
      const event = keydown({ key: 'Enter', shiftKey: true })

      handleCustomInputKeydown(message, event)

      expect(event.defaultPrevented).toBe(false)
      expect(mockSendToMain).not.toHaveBeenCalled()
    })

    it('should not submit while an IME composition is active', () => {
      const { handleCustomInputChange, handleCustomInputKeydown } = useMessageOptions()
      const message = makeMessage()
      handleCustomInputChange(message, 'ni')
      const event = keydown({ key: 'Enter', isComposing: true })

      handleCustomInputKeydown(message, event)

      expect(event.defaultPrevented).toBe(false)
      expect(mockSendToMain).not.toHaveBeenCalled()
    })

    it('should ignore other keys', () => {
      const { handleCustomInputChange, handleCustomInputKeydown } = useMessageOptions()
      const message = makeMessage()
      handleCustomInputChange(message, 'Custom value')
      const event = keydown({ key: 'a' })

      handleCustomInputKeydown(message, event)

      expect(event.defaultPrevented).toBe(false)
      expect(mockSendToMain).not.toHaveBeenCalled()
    })

    it('should swallow Enter on an empty input without sending', () => {
      const { handleCustomInputKeydown } = useMessageOptions()
      const event = keydown({ key: 'Enter' })

      handleCustomInputKeydown(makeMessage(), event)

      expect(event.defaultPrevented).toBe(true)
      expect(mockSendToMain).not.toHaveBeenCalled()
    })
  })
})
