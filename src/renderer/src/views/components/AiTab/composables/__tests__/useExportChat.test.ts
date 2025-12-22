import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'
import { useExportChat } from '../useExportChat'
import { useSessionState } from '../useSessionState'
import type { ChatMessage } from '../../types'

// Mock dependencies
vi.mock('../useSessionState')
vi.mock('@/locales', () => ({
  default: {
    global: {
      t: (key: string) => key
    }
  }
}))
vi.mock('ant-design-vue', () => ({
  notification: {
    error: vi.fn(),
    warning: vi.fn(),
    success: vi.fn()
  }
}))

// Mock window.api
const mockOpenSaveDialog = vi.fn()
const mockWriteLocalFile = vi.fn()
global.window = {
  api: {
    openSaveDialog: mockOpenSaveDialog,
    writeLocalFile: mockWriteLocalFile
  }
} as any

describe('useExportChat', () => {
  let chatHistory: ReturnType<typeof ref<ChatMessage[]>>
  let currentChatTitle: ReturnType<typeof ref<string>>

  beforeEach(() => {
    vi.clearAllMocks()

    chatHistory = ref<ChatMessage[]>([])
    currentChatTitle = ref('Test Chat')

    vi.mocked(useSessionState).mockReturnValue({
      chatHistory,
      currentChatTitle
    } as any)
  })

  describe('exportChat', () => {
    it('should warn when chat history is empty', async () => {
      const { notification } = await import('ant-design-vue')
      const { exportChat } = useExportChat()

      await exportChat()

      expect(notification.warning).toHaveBeenCalledWith({
        message: 'ai.exportChatEmpty',
        duration: 3
      })
      expect(mockOpenSaveDialog).not.toHaveBeenCalled()
    })

    it('should generate correct filename', async () => {
      currentChatTitle.value = 'My Test Chat'
      chatHistory.value = [{ id: 'msg-1', role: 'user', content: 'test', type: 'message', ask: '', say: '', ts: 100 }]

      mockOpenSaveDialog.mockResolvedValue('/path/to/file.md')
      mockWriteLocalFile.mockResolvedValue(undefined)

      const { exportChat } = useExportChat()
      await exportChat()

      expect(mockOpenSaveDialog).toHaveBeenCalledWith({ fileName: 'My Test Chat.md' })
    })

    it('should sanitize filename with invalid characters', async () => {
      currentChatTitle.value = 'Test/Chat:With*Special|Chars'
      chatHistory.value = [{ id: 'msg-1', role: 'user', content: 'test', type: 'message', ask: '', say: '', ts: 100 }]

      mockOpenSaveDialog.mockResolvedValue('/path/to/file.md')
      mockWriteLocalFile.mockResolvedValue(undefined)

      const { exportChat } = useExportChat()
      await exportChat()

      expect(mockOpenSaveDialog).toHaveBeenCalledWith({ fileName: 'Test-Chat-With-Special-Chars.md' })
    })

    it('should truncate long filename to 30 characters', async () => {
      currentChatTitle.value = 'This is a very long chat title that exceeds 30 characters'
      chatHistory.value = [{ id: 'msg-1', role: 'user', content: 'test', type: 'message', ask: '', say: '', ts: 100 }]

      mockOpenSaveDialog.mockResolvedValue('/path/to/file.md')
      mockWriteLocalFile.mockResolvedValue(undefined)

      const { exportChat } = useExportChat()
      await exportChat()

      const expectedFilename = 'This is a very long chat title.md'
      expect(mockOpenSaveDialog).toHaveBeenCalledWith({ fileName: expectedFilename })
    })

    it('should not export when user cancels save dialog', async () => {
      chatHistory.value = [{ id: 'msg-1', role: 'user', content: 'test', type: 'message', ask: '', say: '', ts: 100 }]

      mockOpenSaveDialog.mockResolvedValue(null)

      const { exportChat } = useExportChat()
      await exportChat()

      expect(mockWriteLocalFile).not.toHaveBeenCalled()
    })

    it('should export basic user and assistant messages', async () => {
      chatHistory.value = [
        { id: 'msg-1', role: 'user', content: 'Hello', type: 'message', ask: '', say: '', ts: 100 },
        { id: 'msg-2', role: 'assistant', content: 'Hi there!', type: 'message', ask: '', say: '', ts: 200 }
      ]

      mockOpenSaveDialog.mockResolvedValue('/path/to/file.md')
      mockWriteLocalFile.mockResolvedValue(undefined)

      const { exportChat } = useExportChat()
      await exportChat()

      expect(mockWriteLocalFile).toHaveBeenCalledWith('/path/to/file.md', expect.stringContaining('**User:**'))
      expect(mockWriteLocalFile).toHaveBeenCalledWith('/path/to/file.md', expect.stringContaining('**Chaterm:**'))
      expect(mockWriteLocalFile).toHaveBeenCalledWith('/path/to/file.md', expect.stringContaining('Hello'))
      expect(mockWriteLocalFile).toHaveBeenCalledWith('/path/to/file.md', expect.stringContaining('Hi there!'))
    })

    it('should format command messages with bash code blocks', async () => {
      chatHistory.value = [{ id: 'msg-1', role: 'assistant', content: 'ls -la', type: 'ask', ask: 'command', say: '', ts: 100 }]

      mockOpenSaveDialog.mockResolvedValue('/path/to/file.md')
      mockWriteLocalFile.mockResolvedValue(undefined)

      const { exportChat } = useExportChat()
      await exportChat()

      expect(mockWriteLocalFile).toHaveBeenCalledWith('/path/to/file.md', expect.stringContaining('```bash'))
      expect(mockWriteLocalFile).toHaveBeenCalledWith('/path/to/file.md', expect.stringContaining('ls -la'))
    })

    it('should format command output', async () => {
      chatHistory.value = [
        { id: 'msg-1', role: 'assistant', content: 'file1.txt\nfile2.txt', type: 'message', ask: '', say: 'command_output', ts: 100 }
      ]

      mockOpenSaveDialog.mockResolvedValue('/path/to/file.md')
      mockWriteLocalFile.mockResolvedValue(undefined)

      const { exportChat } = useExportChat()
      await exportChat()

      expect(mockWriteLocalFile).toHaveBeenCalledWith('/path/to/file.md', expect.stringContaining('**OUTPUT**'))
      expect(mockWriteLocalFile).toHaveBeenCalledWith('/path/to/file.md', expect.stringContaining('file1.txt'))
    })

    it('should format MCP tool call messages', async () => {
      chatHistory.value = [
        {
          id: 'msg-1',
          role: 'assistant',
          content: 'Calling tool',
          type: 'ask',
          ask: 'mcp_tool_call',
          say: '',
          ts: 100,
          mcpToolCall: {
            serverName: 'filesystem',
            toolName: 'read_file',
            arguments: { path: '/tmp/test.txt' }
          }
        }
      ]

      mockOpenSaveDialog.mockResolvedValue('/path/to/file.md')
      mockWriteLocalFile.mockResolvedValue(undefined)

      const { exportChat } = useExportChat()
      await exportChat()

      expect(mockWriteLocalFile).toHaveBeenCalledWith('/path/to/file.md', expect.stringContaining('```json'))
      expect(mockWriteLocalFile).toHaveBeenCalledWith('/path/to/file.md', expect.stringContaining('filesystem'))
      expect(mockWriteLocalFile).toHaveBeenCalledWith('/path/to/file.md', expect.stringContaining('read_file'))
    })

    it('should format followup messages with options', async () => {
      chatHistory.value = [
        {
          id: 'msg-1',
          role: 'assistant',
          content: { question: 'Continue?', options: ['Yes', 'No'] },
          type: 'ask',
          ask: 'followup',
          say: '',
          ts: 100,
          selectedOption: 'Yes'
        }
      ]

      mockOpenSaveDialog.mockResolvedValue('/path/to/file.md')
      mockWriteLocalFile.mockResolvedValue(undefined)

      const { exportChat } = useExportChat()
      await exportChat()

      expect(mockWriteLocalFile).toHaveBeenCalledWith('/path/to/file.md', expect.stringContaining('Continue?'))
      expect(mockWriteLocalFile).toHaveBeenCalledWith('/path/to/file.md', expect.stringContaining('[x] Yes'))
      expect(mockWriteLocalFile).toHaveBeenCalledWith('/path/to/file.md', expect.stringContaining('[ ] No'))
    })

    it('should format approved/rejected actions', async () => {
      chatHistory.value = [
        { id: 'msg-1', role: 'user', content: '', type: 'message', ask: '', say: '', ts: 100, action: 'approved' },
        { id: 'msg-2', role: 'user', content: '', type: 'message', ask: '', say: '', ts: 200, action: 'rejected' }
      ]

      mockOpenSaveDialog.mockResolvedValue('/path/to/file.md')
      mockWriteLocalFile.mockResolvedValue(undefined)

      const { exportChat } = useExportChat()
      await exportChat()

      expect(mockWriteLocalFile).toHaveBeenCalledWith('/path/to/file.md', expect.stringContaining('Approved'))
      expect(mockWriteLocalFile).toHaveBeenCalledWith('/path/to/file.md', expect.stringContaining('Rejected'))
    })

    it('should skip empty messages', async () => {
      chatHistory.value = [
        { id: 'msg-1', role: 'user', content: 'Hello', type: 'message', ask: '', say: '', ts: 100 },
        { id: 'msg-2', role: 'assistant', content: '', type: 'message', ask: '', say: '', ts: 200 },
        { id: 'msg-3', role: 'user', content: 'World', type: 'message', ask: '', say: '', ts: 300 }
      ]

      mockOpenSaveDialog.mockResolvedValue('/path/to/file.md')
      mockWriteLocalFile.mockResolvedValue(undefined)

      const { exportChat } = useExportChat()
      await exportChat()

      const markdown = mockWriteLocalFile.mock.calls[0][1]
      const sections = markdown.split('---\n\n').filter((s: string) => s.trim())
      // Header + 2 non-empty messages
      expect(sections.length).toBe(3)
    })

    it('should include header with title and timestamp', async () => {
      currentChatTitle.value = 'My Chat'
      chatHistory.value = [{ id: 'msg-1', role: 'user', content: 'test', type: 'message', ask: '', say: '', ts: 100 }]

      mockOpenSaveDialog.mockResolvedValue('/path/to/file.md')
      mockWriteLocalFile.mockResolvedValue(undefined)

      const { exportChat } = useExportChat()
      await exportChat()

      expect(mockWriteLocalFile).toHaveBeenCalledWith('/path/to/file.md', expect.stringContaining('# My Chat'))
      expect(mockWriteLocalFile).toHaveBeenCalledWith('/path/to/file.md', expect.stringContaining('ai.exportedOn'))
      expect(mockWriteLocalFile).toHaveBeenCalledWith('/path/to/file.md', expect.stringContaining('Chaterm'))
    })

    it('should show success notification after export', async () => {
      const { notification } = await import('ant-design-vue')
      chatHistory.value = [{ id: 'msg-1', role: 'user', content: 'test', type: 'message', ask: '', say: '', ts: 100 }]

      mockOpenSaveDialog.mockResolvedValue('/path/to/file.md')
      mockWriteLocalFile.mockResolvedValue(undefined)

      const { exportChat } = useExportChat()
      await exportChat()

      expect(notification.success).toHaveBeenCalledWith({
        message: 'ai.exportChatSuccess',
        duration: 3
      })
    })

    it('should handle export errors', async () => {
      const { notification } = await import('ant-design-vue')
      chatHistory.value = [{ id: 'msg-1', role: 'user', content: 'test', type: 'message', ask: '', say: '', ts: 100 }]

      mockOpenSaveDialog.mockResolvedValue('/path/to/file.md')
      mockWriteLocalFile.mockRejectedValue(new Error('Write failed'))

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const { exportChat } = useExportChat()
      await exportChat()

      expect(consoleSpy).toHaveBeenCalledWith('Export chat failed:', expect.any(Error))
      expect(notification.error).toHaveBeenCalledWith({
        message: 'ai.exportChatFailed',
        description: 'Write failed',
        duration: 5
      })

      consoleSpy.mockRestore()
    })

    it('should format search result messages', async () => {
      chatHistory.value = [
        { id: 'msg-1', role: 'assistant', content: 'Search results here', type: 'message', ask: '', say: 'search_result', ts: 100 }
      ]

      mockOpenSaveDialog.mockResolvedValue('/path/to/file.md')
      mockWriteLocalFile.mockResolvedValue(undefined)

      const { exportChat } = useExportChat()
      await exportChat()

      expect(mockWriteLocalFile).toHaveBeenCalledWith('/path/to/file.md', expect.stringContaining('**Search Result**'))
      expect(mockWriteLocalFile).toHaveBeenCalledWith('/path/to/file.md', expect.stringContaining('Search results here'))
    })

    it('should handle executed command in command messages', async () => {
      chatHistory.value = [
        {
          id: 'msg-1',
          role: 'assistant',
          content: 'ls',
          type: 'ask',
          ask: 'command',
          say: '',
          ts: 100,
          executedCommand: 'ls -la'
        }
      ]

      mockOpenSaveDialog.mockResolvedValue('/path/to/file.md')
      mockWriteLocalFile.mockResolvedValue(undefined)

      const { exportChat } = useExportChat()
      await exportChat()

      expect(mockWriteLocalFile).toHaveBeenCalledWith('/path/to/file.md', expect.stringContaining('ls -la'))
    })

    it('should handle command output with existing markdown code blocks', async () => {
      chatHistory.value = [
        {
          id: 'msg-1',
          role: 'assistant',
          content: 'Terminal output: ```bash\nls -la\n```',
          type: 'message',
          ask: '',
          say: 'command_output',
          ts: 100
        }
      ]

      mockOpenSaveDialog.mockResolvedValue('/path/to/file.md')
      mockWriteLocalFile.mockResolvedValue(undefined)

      const { exportChat } = useExportChat()
      await exportChat()

      expect(mockWriteLocalFile).toHaveBeenCalledWith('/path/to/file.md', expect.stringContaining('**OUTPUT**'))
      expect(mockWriteLocalFile).toHaveBeenCalledWith('/path/to/file.md', expect.stringContaining('Terminal output:'))
    })
  })
})
