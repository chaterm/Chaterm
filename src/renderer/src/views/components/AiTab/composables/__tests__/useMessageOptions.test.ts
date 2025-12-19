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
    showNewTaskButton: false,
    showSendButton: true,
    buttonsDisabled: false,
    resumeDisabled: false,
    isExecutingCommand: false,
    messageFeedbacks: {},
    lastStreamMessage: null,
    lastPartialMessage: null,
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

  describe('handleOptionSelect', () => {
    it('should store the selected option for a message', () => {
      const { handleOptionSelect, getSelectedOption } = useMessageOptions()
      const message: ChatMessage = {
        id: 'msg-1',
        role: 'assistant',
        content: { question: 'Test', options: ['Option 1', 'Option 2'] }
      }

      handleOptionSelect(message, 'Option 1')

      expect(getSelectedOption(message)).toBe('Option 1')
    })

    it('should update the selected option when called multiple times', () => {
      const { handleOptionSelect, getSelectedOption } = useMessageOptions()
      const message: ChatMessage = {
        id: 'msg-1',
        role: 'assistant',
        content: { question: 'Test', options: ['Option 1', 'Option 2'] }
      }

      handleOptionSelect(message, 'Option 1')
      expect(getSelectedOption(message)).toBe('Option 1')

      handleOptionSelect(message, 'Option 2')
      expect(getSelectedOption(message)).toBe('Option 2')
    })
  })

  describe('getSelectedOption', () => {
    it('should return empty string when no option is selected', () => {
      const { getSelectedOption } = useMessageOptions()
      const message: ChatMessage = {
        id: 'msg-1',
        role: 'assistant',
        content: { question: 'Test', options: ['Option 1', 'Option 2'] }
      }

      expect(getSelectedOption(message)).toBe('')
    })
  })

  describe('handleCustomInputChange', () => {
    it('should store the custom input for a message', () => {
      const { handleCustomInputChange, getCustomInput } = useMessageOptions()
      const message: ChatMessage = {
        id: 'msg-1',
        role: 'assistant',
        content: { question: 'Test', options: ['Option 1', 'Option 2'] }
      }

      handleCustomInputChange(message, 'Custom value')

      expect(getCustomInput(message)).toBe('Custom value')
    })

    it('should update the custom input when called multiple times', () => {
      const { handleCustomInputChange, getCustomInput } = useMessageOptions()
      const message: ChatMessage = {
        id: 'msg-1',
        role: 'assistant',
        content: { question: 'Test', options: ['Option 1', 'Option 2'] }
      }

      handleCustomInputChange(message, 'First value')
      expect(getCustomInput(message)).toBe('First value')

      handleCustomInputChange(message, 'Second value')
      expect(getCustomInput(message)).toBe('Second value')
    })
  })

  describe('getCustomInput', () => {
    it('should return empty string when no custom input is set', () => {
      const { getCustomInput } = useMessageOptions()
      const message: ChatMessage = {
        id: 'msg-1',
        role: 'assistant',
        content: { question: 'Test', options: ['Option 1', 'Option 2'] }
      }

      expect(getCustomInput(message)).toBe('')
    })
  })

  describe('canSubmitOption', () => {
    it('should return false when no option is selected', () => {
      const { canSubmitOption } = useMessageOptions()
      const message: ChatMessage = {
        id: 'msg-1',
        role: 'assistant',
        content: { question: 'Test', options: ['Option 1', 'Option 2'] }
      }

      expect(canSubmitOption(message)).toBe(false)
    })

    it('should return true when a preset option is selected', () => {
      const { handleOptionSelect, canSubmitOption } = useMessageOptions()
      const message: ChatMessage = {
        id: 'msg-1',
        role: 'assistant',
        content: { question: 'Test', options: ['Option 1', 'Option 2'] }
      }

      handleOptionSelect(message, 'Option 1')

      expect(canSubmitOption(message)).toBe(true)
    })

    it('should return false when custom option is selected but no input is provided', () => {
      const { handleOptionSelect, canSubmitOption } = useMessageOptions()
      const message: ChatMessage = {
        id: 'msg-1',
        role: 'assistant',
        content: { question: 'Test', options: ['Option 1', 'Option 2'] }
      }

      handleOptionSelect(message, '__custom__')

      expect(canSubmitOption(message)).toBe(false)
    })

    it('should return false when custom option has only whitespace', () => {
      const { handleOptionSelect, handleCustomInputChange, canSubmitOption } = useMessageOptions()
      const message: ChatMessage = {
        id: 'msg-1',
        role: 'assistant',
        content: { question: 'Test', options: ['Option 1', 'Option 2'] }
      }

      handleOptionSelect(message, '__custom__')
      handleCustomInputChange(message, '   ')

      expect(canSubmitOption(message)).toBe(false)
    })

    it('should return true when custom option is selected with valid input', () => {
      const { handleOptionSelect, handleCustomInputChange, canSubmitOption } = useMessageOptions()
      const message: ChatMessage = {
        id: 'msg-1',
        role: 'assistant',
        content: { question: 'Test', options: ['Option 1', 'Option 2'] }
      }

      handleOptionSelect(message, '__custom__')
      handleCustomInputChange(message, 'Custom value')

      expect(canSubmitOption(message)).toBe(true)
    })
  })

  describe('handleOptionSubmit', () => {
    it('should not send message when no option is selected', async () => {
      const { handleOptionSubmit } = useMessageOptions()
      const message: ChatMessage = {
        id: 'msg-1',
        role: 'assistant',
        content: { question: 'Test', options: ['Option 1', 'Option 2'] },
        ask: 'followup'
      }

      await handleOptionSubmit(message)

      expect(mockSendToMain).not.toHaveBeenCalled()
    })

    it('should send message with preset option', async () => {
      const { handleOptionSelect, handleOptionSubmit } = useMessageOptions()
      const message: ChatMessage = {
        id: 'msg-1',
        role: 'assistant',
        content: { question: 'Test', options: ['Option 1', 'Option 2'] },
        ask: 'followup'
      }

      handleOptionSelect(message, 'Option 1')
      mockSendToMain.mockResolvedValue({ success: true })

      await handleOptionSubmit(message)

      expect(mockSendToMain).toHaveBeenCalledWith({
        type: 'askResponse',
        askResponse: 'messageResponse',
        text: 'Option 1',
        tabId: 'test-tab-id',
        taskId: 'test-tab-id'
      })
      expect(message.selectedOption).toBe('Option 1')
      expect(mockSession.responseLoading).toBe(true)
    })

    it('should send message with custom input', async () => {
      const { handleOptionSelect, handleCustomInputChange, handleOptionSubmit } = useMessageOptions()
      const message: ChatMessage = {
        id: 'msg-1',
        role: 'assistant',
        content: { question: 'Test', options: ['Option 1', 'Option 2'] },
        ask: 'followup'
      }

      handleOptionSelect(message, '__custom__')
      handleCustomInputChange(message, 'Custom value')
      mockSendToMain.mockResolvedValue({ success: true })

      await handleOptionSubmit(message)

      expect(mockSendToMain).toHaveBeenCalledWith({
        type: 'askResponse',
        askResponse: 'messageResponse',
        text: 'Custom value',
        tabId: 'test-tab-id',
        taskId: 'test-tab-id'
      })
      expect(message.selectedOption).toBe('Custom value')
    })

    it('should trim whitespace from custom input', async () => {
      const { handleOptionSelect, handleCustomInputChange, handleOptionSubmit } = useMessageOptions()
      const message: ChatMessage = {
        id: 'msg-1',
        role: 'assistant',
        content: { question: 'Test', options: ['Option 1', 'Option 2'] },
        ask: 'followup'
      }

      handleOptionSelect(message, '__custom__')
      handleCustomInputChange(message, '  Custom value  ')
      mockSendToMain.mockResolvedValue({ success: true })

      await handleOptionSubmit(message)

      expect(mockSendToMain).toHaveBeenCalledWith({
        type: 'askResponse',
        askResponse: 'messageResponse',
        text: 'Custom value',
        tabId: 'test-tab-id',
        taskId: 'test-tab-id'
      })
    })

    it('should not send message when custom input is empty after trim', async () => {
      const { handleOptionSelect, handleCustomInputChange, handleOptionSubmit } = useMessageOptions()
      const message: ChatMessage = {
        id: 'msg-1',
        role: 'assistant',
        content: { question: 'Test', options: ['Option 1', 'Option 2'] },
        ask: 'followup'
      }

      handleOptionSelect(message, '__custom__')
      handleCustomInputChange(message, '   ')

      await handleOptionSubmit(message)

      expect(mockSendToMain).not.toHaveBeenCalled()
    })

    it('should handle error when sending message fails', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const { handleOptionSelect, handleOptionSubmit } = useMessageOptions()
      const message: ChatMessage = {
        id: 'msg-1',
        role: 'assistant',
        content: { question: 'Test', options: ['Option 1', 'Option 2'] },
        ask: 'followup'
      }

      handleOptionSelect(message, 'Option 1')
      mockSendToMain.mockRejectedValue(new Error('Network error'))

      await handleOptionSubmit(message)

      expect(consoleSpy).toHaveBeenCalledWith('Failed to send message to main process:', expect.any(Error))
      consoleSpy.mockRestore()
    })

    it('should not send message when session is not available', async () => {
      vi.mocked(useSessionState).mockReturnValue({
        currentSession: { value: null },
        attachTabContext: mockAttachTabContext
      } as any)

      const { handleOptionSelect, handleOptionSubmit } = useMessageOptions()
      const message: ChatMessage = {
        id: 'msg-1',
        role: 'assistant',
        content: { question: 'Test', options: ['Option 1', 'Option 2'] },
        ask: 'followup'
      }

      handleOptionSelect(message, 'Option 1')

      await handleOptionSubmit(message)

      expect(mockSendToMain).not.toHaveBeenCalled()
    })
  })
})
