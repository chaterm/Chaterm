import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref, nextTick } from 'vue'
import { useUserInteractions } from '../useUserInteractions'
import { useSessionState } from '../useSessionState'

// Mock dependencies
vi.mock('../useSessionState')
vi.mock('@/utils/eventBus', () => ({
  default: {
    emit: vi.fn()
  }
}))
vi.mock('@/locales', () => ({
  default: {
    global: {
      t: (key: string, params?: any) => {
        if (params) {
          let str = key
          Object.keys(params).forEach((k) => {
            str = str.replace(`{${k}}`, params[k])
          })
          return str
        }
        return key
      }
    }
  }
}))

// Mock ant-design-vue notification
vi.mock('ant-design-vue', () => ({
  notification: {
    error: vi.fn(),
    warning: vi.fn(),
    success: vi.fn()
  }
}))

describe('useUserInteractions', () => {
  let mockSendMessage: (sendType: string) => Promise<any>
  let chatInputParts: ReturnType<typeof ref<Array<{ type: string; text: string }>>>

  let mockInsertChipAtCursor: any

  const getText = (parts: Array<{ type: string; text: string }>) => {
    return parts
      .filter((part) => part.type === 'text')
      .map((part) => part.text)
      .join('')
  }

  beforeEach(() => {
    vi.clearAllMocks()

    mockSendMessage = vi.fn().mockResolvedValue(undefined)
    chatInputParts = ref([])
    mockInsertChipAtCursor = vi.fn()

    // Mock appendTextToInputParts to modify chatInputParts directly
    const mockAppendTextToInputParts = (text: string, prefix: string = ' ', suffix: string = '') => {
      const parts = [...(chatInputParts.value ?? [])]
      const last = parts[parts.length - 1]
      const textToAppend = parts.length > 0 ? `${prefix}${text}${suffix}` : `${text}${suffix}`
      if (last && last.type === 'text') {
        parts[parts.length - 1] = { ...last, text: last.text + textToAppend }
      } else {
        parts.push({ type: 'text', text: textToAppend })
      }
      chatInputParts.value = parts
    }

    vi.mocked(useSessionState).mockReturnValue({
      chatInputParts,
      appendTextToInputParts: mockAppendTextToInputParts
    } as any)
  })

  describe('handleTranscriptionComplete', () => {
    it('should append transcribed text to existing content', () => {
      const { handleTranscriptionComplete } = useUserInteractions({ sendMessage: mockSendMessage })

      chatInputParts.value = [{ type: 'text', text: 'Hello' }]
      handleTranscriptionComplete('world')

      expect(getText(chatInputParts.value)).toBe('Hello world')
    })

    it('should set transcribed text when input is empty', () => {
      const { handleTranscriptionComplete } = useUserInteractions({ sendMessage: mockSendMessage })

      handleTranscriptionComplete('Hello world')

      expect(getText(chatInputParts.value ?? [])).toBe('Hello world')
    })

    it('should auto-send when enabled', async () => {
      const { handleTranscriptionComplete, autoSendAfterVoice } = useUserInteractions({ sendMessage: mockSendMessage })

      autoSendAfterVoice.value = true
      handleTranscriptionComplete('Test message')

      await nextTick()
      await nextTick() // Wait for async sendMessage

      expect(mockSendMessage).toHaveBeenCalledWith('send')
    })

    it('should not auto-send when disabled', async () => {
      const { handleTranscriptionComplete, autoSendAfterVoice } = useUserInteractions({ sendMessage: mockSendMessage })

      autoSendAfterVoice.value = false
      handleTranscriptionComplete('Test message')

      await nextTick()

      expect(mockSendMessage).not.toHaveBeenCalled()
    })
  })

  describe('handleTranscriptionError', () => {
    it('should log error', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const { handleTranscriptionError } = useUserInteractions({ sendMessage: mockSendMessage })

      handleTranscriptionError('Transcription failed')

      expect(consoleSpy).toHaveBeenCalledWith('Voice transcription error:', 'Transcription failed')
      consoleSpy.mockRestore()
    })
  })

  describe('handleFileUpload', () => {
    it('should trigger file input click', () => {
      const { handleFileUpload, fileInputRef } = useUserInteractions({ sendMessage: mockSendMessage })

      const mockClick = vi.fn()
      fileInputRef.value = { click: mockClick } as any

      handleFileUpload()

      expect(mockClick).toHaveBeenCalled()
    })

    it('should not throw when file input is not set', () => {
      const { handleFileUpload } = useUserInteractions({ sendMessage: mockSendMessage })

      expect(() => handleFileUpload()).not.toThrow()
    })
  })

  describe('handleFileSelected', () => {
    it('should handle no file selected', async () => {
      const { handleFileSelected } = useUserInteractions({
        sendMessage: mockSendMessage,
        insertChipAtCursor: mockInsertChipAtCursor
      })

      const mockEvent = {
        target: {
          files: []
        }
      } as any

      await handleFileSelected(mockEvent)

      expect(getText(chatInputParts.value ?? [])).toBe('')
      expect(mockInsertChipAtCursor).not.toHaveBeenCalled()
    })

    it('should warn when file is too large', async () => {
      const { notification } = await import('ant-design-vue')
      const { handleFileSelected } = useUserInteractions({
        sendMessage: mockSendMessage,
        insertChipAtCursor: mockInsertChipAtCursor
      })

      const largeFile = new File(['x'.repeat(2 * 1024 * 1024)], 'large.txt', { type: 'text/plain' })
      const mockEvent = {
        target: {
          files: [largeFile],
          value: 'test.txt'
        }
      } as any

      await handleFileSelected(mockEvent)

      expect(notification.warning).toHaveBeenCalled()
      expect(getText(chatInputParts.value ?? [])).toBe('')
      expect(mockInsertChipAtCursor).not.toHaveBeenCalled()
    })

    it('should insert doc chip for selected file', async () => {
      const { handleFileSelected } = useUserInteractions({
        sendMessage: mockSendMessage,
        insertChipAtCursor: mockInsertChipAtCursor
      })

      const file = Object.assign(new File(['Hello'], 'test.txt', { type: 'text/plain' }), {
        path: '/Users/demo/test.txt'
      })

      const mockEvent = {
        target: {
          files: [file],
          value: 'test.txt'
        }
      } as any

      await handleFileSelected(mockEvent)

      expect(mockInsertChipAtCursor).toHaveBeenCalledWith('doc', { absPath: '/Users/demo/test.txt', name: 'test.txt', type: 'file' }, 'test.txt')
      expect(mockEvent.target.value).toBe('')
    })
  })

  describe('handleKeyDown', () => {
    it('should send message on Enter key', async () => {
      const { handleKeyDown } = useUserInteractions({ sendMessage: mockSendMessage })

      chatInputParts.value = [{ type: 'text', text: 'Test message' }]

      const mockEvent = {
        key: 'Enter',
        shiftKey: false,
        isComposing: false,
        preventDefault: vi.fn()
      } as any

      handleKeyDown(mockEvent)

      expect(mockEvent.preventDefault).toHaveBeenCalled()
      expect(mockSendMessage).toHaveBeenCalledWith('send')
    })

    it('should not send on Shift+Enter', () => {
      const { handleKeyDown } = useUserInteractions({ sendMessage: mockSendMessage })

      chatInputParts.value = [{ type: 'text', text: 'Test message' }]

      const mockEvent = {
        key: 'Enter',
        shiftKey: true,
        isComposing: false,
        preventDefault: vi.fn()
      } as any

      handleKeyDown(mockEvent)

      expect(mockSendMessage).not.toHaveBeenCalled()
    })

    it('should not send when composing', () => {
      const { handleKeyDown } = useUserInteractions({ sendMessage: mockSendMessage })

      chatInputParts.value = [{ type: 'text', text: 'Test message' }]

      const mockEvent = {
        key: 'Enter',
        shiftKey: false,
        isComposing: true,
        preventDefault: vi.fn()
      } as any

      handleKeyDown(mockEvent)

      expect(mockSendMessage).not.toHaveBeenCalled()
    })

    it('should not send when input is empty', () => {
      const { handleKeyDown } = useUserInteractions({ sendMessage: mockSendMessage })

      chatInputParts.value = [{ type: 'text', text: '   ' }]

      const mockEvent = {
        key: 'Enter',
        shiftKey: false,
        isComposing: false,
        preventDefault: vi.fn()
      } as any

      handleKeyDown(mockEvent)

      expect(mockEvent.preventDefault).toHaveBeenCalled()
      expect(mockSendMessage).not.toHaveBeenCalled()
    })

    it('should do nothing for other keys', () => {
      const { handleKeyDown } = useUserInteractions({ sendMessage: mockSendMessage })

      chatInputParts.value = [{ type: 'text', text: 'Test message' }]

      const mockEvent = {
        key: 'a',
        shiftKey: false,
        isComposing: false,
        preventDefault: vi.fn()
      } as any

      handleKeyDown(mockEvent)

      expect(mockEvent.preventDefault).not.toHaveBeenCalled()
      expect(mockSendMessage).not.toHaveBeenCalled()
    })
  })

  describe('refs', () => {
    it('should provide fileInputRef', () => {
      const { fileInputRef } = useUserInteractions({ sendMessage: mockSendMessage })

      expect(fileInputRef).toBeDefined()
      expect(fileInputRef.value).toBeUndefined()
    })

    it('should provide autoSendAfterVoice', () => {
      const { autoSendAfterVoice } = useUserInteractions({ sendMessage: mockSendMessage })

      expect(autoSendAfterVoice.value).toBe(false)

      autoSendAfterVoice.value = true
      expect(autoSendAfterVoice.value).toBe(true)
    })

    it('should provide currentEditingId', () => {
      const { currentEditingId } = useUserInteractions({ sendMessage: mockSendMessage })

      expect(currentEditingId.value).toBeNull()

      currentEditingId.value = 'test-id'
      expect(currentEditingId.value).toBe('test-id')
    })
  })
})
