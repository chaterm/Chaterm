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
  let mockShowOpenDialog: ReturnType<typeof vi.fn>
  let mockStageChatAttachment: ReturnType<typeof vi.fn>

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

    mockShowOpenDialog = vi.fn()
    mockStageChatAttachment = vi.fn()
    ;(window as unknown as { api: Record<string, unknown> }).api = {
      showOpenDialog: mockShowOpenDialog,
      stageChatAttachment: mockStageChatAttachment
    }
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

      expect(consoleSpy).toHaveBeenCalledWith('[aitab.userInteractions] Voice transcription error', { error: 'Transcription failed' })
      consoleSpy.mockRestore()
    })
  })

  describe('handleFileUpload', () => {
    it('should warn when no task id', async () => {
      const { notification } = await import('ant-design-vue')
      const { handleFileUpload } = useUserInteractions({
        sendMessage: mockSendMessage,
        insertChipAtCursor: mockInsertChipAtCursor,
        getTaskId: () => undefined
      })

      await handleFileUpload()

      expect(notification.warning).toHaveBeenCalled()
      expect(mockShowOpenDialog).not.toHaveBeenCalled()
      expect(mockInsertChipAtCursor).not.toHaveBeenCalled()
    })

    it('should do nothing when dialog canceled', async () => {
      const { handleFileUpload } = useUserInteractions({
        sendMessage: mockSendMessage,
        insertChipAtCursor: mockInsertChipAtCursor,
        getTaskId: () => 'task-1'
      })
      mockShowOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] })

      await handleFileUpload()

      expect(mockShowOpenDialog).toHaveBeenCalled()
      expect(mockStageChatAttachment).not.toHaveBeenCalled()
      expect(mockInsertChipAtCursor).not.toHaveBeenCalled()
    })

    it('should insert chip with absolute path when staged as_is', async () => {
      const { handleFileUpload } = useUserInteractions({
        sendMessage: mockSendMessage,
        insertChipAtCursor: mockInsertChipAtCursor,
        getTaskId: () => 'task-1'
      })
      mockShowOpenDialog.mockResolvedValue({ canceled: false, filePaths: ['/Users/demo/notes.md'] })
      mockStageChatAttachment.mockResolvedValue({ mode: 'as_is', refPath: '/Users/demo/notes.md' })

      await handleFileUpload()

      expect(mockStageChatAttachment).toHaveBeenCalledWith({ taskId: 'task-1', srcAbsPath: '/Users/demo/notes.md' })
      expect(mockInsertChipAtCursor).toHaveBeenCalledWith('doc', { absPath: '/Users/demo/notes.md', name: 'notes.md', type: 'file' }, 'notes.md')
    })

    it('should insert chip with offload ref when staged to offload', async () => {
      const { handleFileUpload } = useUserInteractions({
        sendMessage: mockSendMessage,
        insertChipAtCursor: mockInsertChipAtCursor,
        getTaskId: () => 'task-1'
      })
      mockShowOpenDialog.mockResolvedValue({ canceled: false, filePaths: ['/tmp/outside/x.md'] })
      mockStageChatAttachment.mockResolvedValue({ mode: 'offload', refPath: 'offload/user-uploads/uuid-x.md' })

      await handleFileUpload()

      expect(mockInsertChipAtCursor).toHaveBeenCalledWith('doc', { absPath: 'offload/user-uploads/uuid-x.md', name: 'x.md', type: 'file' }, 'x.md')
    })

    it('should show error when staging fails', async () => {
      const { notification } = await import('ant-design-vue')
      const { handleFileUpload } = useUserInteractions({
        sendMessage: mockSendMessage,
        insertChipAtCursor: mockInsertChipAtCursor,
        getTaskId: () => 'task-1'
      })
      mockShowOpenDialog.mockResolvedValue({ canceled: false, filePaths: ['/bad/path'] })
      mockStageChatAttachment.mockRejectedValue(new Error('boom'))

      await handleFileUpload()

      expect(notification.error).toHaveBeenCalled()
      expect(mockInsertChipAtCursor).not.toHaveBeenCalled()
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
    it('should provide imageInputRef', () => {
      const { imageInputRef } = useUserInteractions({ sendMessage: mockSendMessage })

      expect(imageInputRef).toBeDefined()
      expect(imageInputRef.value).toBeUndefined()
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
