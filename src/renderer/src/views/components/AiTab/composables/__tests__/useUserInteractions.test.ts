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
  let chatInputValue: ReturnType<typeof ref<string>>

  beforeEach(() => {
    vi.clearAllMocks()

    mockSendMessage = vi.fn().mockResolvedValue(undefined)
    chatInputValue = ref('')

    vi.mocked(useSessionState).mockReturnValue({
      chatInputValue
    } as any)
  })

  describe('handleTranscriptionComplete', () => {
    it('should append transcribed text to existing content', () => {
      const { handleTranscriptionComplete } = useUserInteractions(mockSendMessage)

      chatInputValue.value = 'Hello'
      handleTranscriptionComplete('world')

      expect(chatInputValue.value).toBe('Hello world')
    })

    it('should set transcribed text when input is empty', () => {
      const { handleTranscriptionComplete } = useUserInteractions(mockSendMessage)

      handleTranscriptionComplete('Hello world')

      expect(chatInputValue.value).toBe('Hello world')
    })

    it('should auto-send when enabled', async () => {
      const { handleTranscriptionComplete, autoSendAfterVoice } = useUserInteractions(mockSendMessage)

      autoSendAfterVoice.value = true
      handleTranscriptionComplete('Test message')

      await nextTick()
      await nextTick() // Wait for async sendMessage

      expect(mockSendMessage).toHaveBeenCalledWith('send')
    })

    it('should not auto-send when disabled', async () => {
      const { handleTranscriptionComplete, autoSendAfterVoice } = useUserInteractions(mockSendMessage)

      autoSendAfterVoice.value = false
      handleTranscriptionComplete('Test message')

      await nextTick()

      expect(mockSendMessage).not.toHaveBeenCalled()
    })
  })

  describe('handleTranscriptionError', () => {
    it('should log error', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const { handleTranscriptionError } = useUserInteractions(mockSendMessage)

      handleTranscriptionError('Transcription failed')

      expect(consoleSpy).toHaveBeenCalledWith('Voice transcription error:', 'Transcription failed')
      consoleSpy.mockRestore()
    })
  })

  describe('handleFileUpload', () => {
    it('should trigger file input click', () => {
      const { handleFileUpload, fileInputRef } = useUserInteractions(mockSendMessage)

      const mockClick = vi.fn()
      fileInputRef.value = { click: mockClick } as any

      handleFileUpload()

      expect(mockClick).toHaveBeenCalled()
    })

    it('should not throw when file input is not set', () => {
      const { handleFileUpload } = useUserInteractions(mockSendMessage)

      expect(() => handleFileUpload()).not.toThrow()
    })
  })

  describe('readFileContent', () => {
    it('should read file content as text', async () => {
      const { readFileContent } = useUserInteractions(mockSendMessage)

      const mockFile = new File(['test content'], 'test.txt', { type: 'text/plain' })

      const content = await readFileContent(mockFile)

      expect(content).toBe('test content')
    })
  })

  describe('handleFileSelected', () => {
    it('should handle no file selected', async () => {
      const { handleFileSelected } = useUserInteractions(mockSendMessage)

      const mockEvent = {
        target: {
          files: []
        }
      } as any

      await handleFileSelected(mockEvent)

      expect(chatInputValue.value).toBe('')
    })

    it('should warn when file is too large', async () => {
      const { notification } = await import('ant-design-vue')
      const { handleFileSelected } = useUserInteractions(mockSendMessage)

      const largeFile = new File(['x'.repeat(2 * 1024 * 1024)], 'large.txt', { type: 'text/plain' })
      const mockEvent = {
        target: {
          files: [largeFile],
          value: 'test.txt'
        }
      } as any

      await handleFileSelected(mockEvent)

      expect(notification.warning).toHaveBeenCalled()
      expect(chatInputValue.value).toBe('')
    })

    it('should format JSON file content', async () => {
      const { notification } = await import('ant-design-vue')
      const { handleFileSelected } = useUserInteractions(mockSendMessage)

      const jsonContent = { key: 'value', nested: { prop: 123 } }
      const jsonFile = new File([JSON.stringify(jsonContent)], 'test.json', { type: 'application/json' })

      const mockEvent = {
        target: {
          files: [jsonFile],
          value: 'test.json'
        }
      } as any

      await handleFileSelected(mockEvent)

      expect(chatInputValue.value).toContain('```json')
      expect(chatInputValue.value).toContain('"key"')
      expect(notification.success).toHaveBeenCalled()
      expect(mockEvent.target.value).toBe('')
    })

    it('should format markdown file content', async () => {
      const { notification } = await import('ant-design-vue')
      const { handleFileSelected } = useUserInteractions(mockSendMessage)

      const mdFile = new File(['# Title\n\nContent'], 'test.md', { type: 'text/markdown' })

      const mockEvent = {
        target: {
          files: [mdFile],
          value: 'test.md'
        }
      } as any

      await handleFileSelected(mockEvent)

      expect(chatInputValue.value).toContain('```markdown')
      expect(chatInputValue.value).toContain('# Title')
      expect(notification.success).toHaveBeenCalled()
    })

    it('should format code file content with language', async () => {
      const { notification } = await import('ant-design-vue')
      const { handleFileSelected } = useUserInteractions(mockSendMessage)

      const pyFile = new File(['def hello():\n    print("world")'], 'test.py', { type: 'text/x-python' })

      const mockEvent = {
        target: {
          files: [pyFile],
          value: 'test.py'
        }
      } as any

      await handleFileSelected(mockEvent)

      expect(chatInputValue.value).toContain('```py')
      expect(chatInputValue.value).toContain('def hello')
      expect(notification.success).toHaveBeenCalled()
    })

    it('should append to existing input', async () => {
      const { handleFileSelected } = useUserInteractions(mockSendMessage)

      chatInputValue.value = 'Existing content'

      const txtFile = new File(['New content'], 'test.txt', { type: 'text/plain' })
      const mockEvent = {
        target: {
          files: [txtFile],
          value: 'test.txt'
        }
      } as any

      await handleFileSelected(mockEvent)

      expect(chatInputValue.value).toContain('Existing content')
      expect(chatInputValue.value).toContain('New content')
    })

    it('should handle invalid JSON gracefully', async () => {
      const { notification } = await import('ant-design-vue')
      const { handleFileSelected } = useUserInteractions(mockSendMessage)

      const invalidJsonFile = new File(['{ invalid json }'], 'test.json', { type: 'application/json' })
      const mockEvent = {
        target: {
          files: [invalidJsonFile],
          value: 'test.json'
        }
      } as any

      await handleFileSelected(mockEvent)

      expect(chatInputValue.value).toContain('```')
      expect(notification.success).toHaveBeenCalled()
    })
  })

  describe('handleKeyDown', () => {
    it('should send message on Enter key', async () => {
      const { handleKeyDown } = useUserInteractions(mockSendMessage)

      chatInputValue.value = 'Test message'

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
      const { handleKeyDown } = useUserInteractions(mockSendMessage)

      chatInputValue.value = 'Test message'

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
      const { handleKeyDown } = useUserInteractions(mockSendMessage)

      chatInputValue.value = 'Test message'

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
      const { handleKeyDown } = useUserInteractions(mockSendMessage)

      chatInputValue.value = '   '

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
      const { handleKeyDown } = useUserInteractions(mockSendMessage)

      chatInputValue.value = 'Test message'

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
      const { fileInputRef } = useUserInteractions(mockSendMessage)

      expect(fileInputRef).toBeDefined()
      expect(fileInputRef.value).toBeUndefined()
    })

    it('should provide autoSendAfterVoice', () => {
      const { autoSendAfterVoice } = useUserInteractions(mockSendMessage)

      expect(autoSendAfterVoice.value).toBe(false)

      autoSendAfterVoice.value = true
      expect(autoSendAfterVoice.value).toBe(true)
    })

    it('should provide currentEditingId', () => {
      const { currentEditingId } = useUserInteractions(mockSendMessage)

      expect(currentEditingId.value).toBeNull()

      currentEditingId.value = 'test-id'
      expect(currentEditingId.value).toBe('test-id')
    })
  })
})
