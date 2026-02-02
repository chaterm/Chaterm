//  Copyright (c) 2025-present, chaterm.ai  All rights reserved.
//  This source code is licensed under the GPL-3.0

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('electron', () => ({
  app: { getAppPath: () => '' },
  BrowserWindow: { fromWebContents: () => null },
  ipcMain: { handle: vi.fn(), on: vi.fn(), once: vi.fn(), removeAllListeners: vi.fn() },
  dialog: { showOpenDialog: vi.fn(async () => ({ canceled: true, filePaths: [] })) }
}))

vi.mock('@storage/db/chaterm.service', () => ({
  ChatermDatabaseService: { getInstance: vi.fn(async () => ({})) }
}))
vi.mock('@storage/database', () => ({ connectAssetInfo: vi.fn(async () => undefined) }))
vi.mock('@integrations/remote-terminal', () => ({
  RemoteTerminalManager: class {
    disposeAll = vi.fn()
  }
}))
vi.mock('@integrations/local-terminal', () => ({
  LocalTerminalManager: class {},
  LocalCommandProcess: class {}
}))
vi.mock('@services/telemetry/TelemetryService', () => ({ telemetryService: { captureTaskFeedback: vi.fn() } }))
vi.mock('@api/index', () => ({
  ApiHandler: class {},
  buildApiHandler: vi.fn(() => ({}))
}))
vi.mock('@core/storage/state', () => ({
  getGlobalState: vi.fn(async () => ({})),
  getUserConfig: vi.fn(async () => ({}))
}))

import { Task } from '../index'
import type { ToolUse } from '../../assistant-message'
import { getGlobalState } from '@core/storage/state'
import { ContextManager } from '../../context/context-management/ContextManager'

describe('handleSummarizeToKnowledgeToolUse', () => {
  let task: any
  let sayMock: ReturnType<typeof vi.fn>
  let pushToolResultMock: ReturnType<typeof vi.fn>
  let getToolDescriptionMock: ReturnType<typeof vi.fn>
  let handleMissingParamMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()

    vi.mocked(getGlobalState).mockResolvedValue({ mode: 'agent' })

    sayMock = vi.fn().mockResolvedValue(undefined)
    pushToolResultMock = vi.fn()
    getToolDescriptionMock = vi.fn().mockReturnValue('[summarize_to_knowledge]')
    handleMissingParamMock = vi.fn().mockResolvedValue(undefined)

    task = Object.create((Task as unknown as { prototype: object }).prototype) as any
    task.say = sayMock
    task.pushToolResult = pushToolResultMock
    task.getToolDescription = getToolDescriptionMock
    task.handleMissingParam = handleMissingParamMock
    task.saveCheckpoint = vi.fn().mockResolvedValue(undefined)
    task.addTodoStatusUpdateReminder = vi.fn().mockResolvedValue(undefined)
    task.userMessageContent = []
    task.didRejectTool = false
    task.didAlreadyUseTool = false
    task.chatermMessages = []
    task.removeClosingTag = vi.fn((_partial: boolean, _tag: string, value?: string) => value ?? '')
  })

  it('should send knowledge_summary message with file_name and summary', async () => {
    const block: ToolUse = {
      type: 'tool_use',
      name: 'summarize_to_knowledge',
      params: {
        file_name: 'ssh-troubleshooting',
        summary: '# SSH Guide\n\n## Solution\nCheck connectivity.'
      },
      partial: false
    }

    await task.handleSummarizeToKnowledgeToolUse(block)

    expect(sayMock).toHaveBeenCalledWith('knowledge_summary', expect.stringContaining('ssh-troubleshooting'), false)

    const callArg = sayMock.mock.calls[0][1]
    const parsed = JSON.parse(callArg)
    expect(parsed.fileName).toBe('ssh-troubleshooting')
    expect(parsed.summary).toContain('# SSH Guide')
  })

  it('should call pushToolResult with success message', async () => {
    const block: ToolUse = {
      type: 'tool_use',
      name: 'summarize_to_knowledge',
      params: {
        file_name: 'test-file',
        summary: 'Test content'
      },
      partial: false
    }

    await task.handleSummarizeToKnowledgeToolUse(block)

    expect(pushToolResultMock).toHaveBeenCalled()
    const resultArg = pushToolResultMock.mock.calls[0][1]
    expect(resultArg).toContain('test-file')
  })

  it('should handle missing file_name parameter', async () => {
    const block: ToolUse = {
      type: 'tool_use',
      name: 'summarize_to_knowledge',
      params: {
        summary: 'Content without file name'
      },
      partial: false
    }

    await task.handleSummarizeToKnowledgeToolUse(block)

    expect(handleMissingParamMock).toHaveBeenCalledWith('file_name', expect.any(String), 'summarize_to_knowledge')
    expect(sayMock).not.toHaveBeenCalledWith('knowledge_summary', expect.anything(), expect.anything())
  })

  it('should handle missing summary parameter', async () => {
    const block: ToolUse = {
      type: 'tool_use',
      name: 'summarize_to_knowledge',
      params: {
        file_name: 'test-file'
      },
      partial: false
    }

    await task.handleSummarizeToKnowledgeToolUse(block)

    expect(handleMissingParamMock).toHaveBeenCalledWith('summary', expect.any(String), 'summarize_to_knowledge')
    expect(sayMock).not.toHaveBeenCalledWith('knowledge_summary', expect.anything(), expect.anything())
  })

  it('should stream knowledge_summary when tool is partial', async () => {
    const block: ToolUse = {
      type: 'tool_use',
      name: 'summarize_to_knowledge',
      params: {
        file_name: 'partial-file',
        summary: '# Part 1'
      },
      partial: true
    }

    await task.handleToolUse(block)

    expect(sayMock).toHaveBeenCalledWith('knowledge_summary', expect.any(String), true)
    const callArg = sayMock.mock.calls[0][1]
    const parsed = JSON.parse(callArg)
    expect(parsed.fileName).toBe('partial-file')
    expect(parsed.summary).toContain('# Part 1')
  })

  it('should handle partial block with incomplete file_name parameter', async () => {
    const block: ToolUse = {
      type: 'tool_use',
      name: 'summarize_to_knowledge',
      params: {
        summary: '# Partial content'
      },
      partial: true
    }

    await task.handleSummarizeToKnowledgeToolUse(block)

    expect(sayMock).toHaveBeenCalledWith('knowledge_summary', expect.any(String), true)
    expect(handleMissingParamMock).not.toHaveBeenCalled()
    const callArg = sayMock.mock.calls[0][1]
    const parsed = JSON.parse(callArg)
    expect(parsed.fileName).toBe('')
    expect(parsed.summary).toBe('# Partial content')
  })

  it('should handle partial block with incomplete summary parameter', async () => {
    const block: ToolUse = {
      type: 'tool_use',
      name: 'summarize_to_knowledge',
      params: {
        file_name: 'test-file'
      },
      partial: true
    }

    await task.handleSummarizeToKnowledgeToolUse(block)

    expect(sayMock).toHaveBeenCalledWith('knowledge_summary', expect.any(String), true)
    expect(handleMissingParamMock).not.toHaveBeenCalled()
    const callArg = sayMock.mock.calls[0][1]
    const parsed = JSON.parse(callArg)
    expect(parsed.fileName).toBe('test-file')
    expect(parsed.summary).toBe('')
  })

  it('should handle partial block with no parameters', async () => {
    const block: ToolUse = {
      type: 'tool_use',
      name: 'summarize_to_knowledge',
      params: {},
      partial: true
    }

    await task.handleSummarizeToKnowledgeToolUse(block)

    expect(sayMock).toHaveBeenCalledWith('knowledge_summary', expect.any(String), true)
    expect(handleMissingParamMock).not.toHaveBeenCalled()
    const callArg = sayMock.mock.calls[0][1]
    const parsed = JSON.parse(callArg)
    expect(parsed.fileName).toBe('')
    expect(parsed.summary).toBe('')
  })
})

describe('handleAttemptCompletionToolUse (partial)', () => {
  let task: any
  let sayMock: ReturnType<typeof vi.fn>
  let getToolDescriptionMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()

    sayMock = vi.fn().mockResolvedValue(undefined)
    getToolDescriptionMock = vi.fn().mockReturnValue('[attempt_completion]')

    task = Object.create((Task as unknown as { prototype: object }).prototype) as any
    task.say = sayMock
    task.getToolDescription = getToolDescriptionMock
    task.saveCheckpoint = vi.fn().mockResolvedValue(undefined)
    task.addTodoStatusUpdateReminder = vi.fn().mockResolvedValue(undefined)
    task.userMessageContent = []
    task.didRejectTool = false
    task.didAlreadyUseTool = false
    task.chatermMessages = []
    task.removeClosingTag = vi.fn((_partial: boolean, _tag: string, value?: string) => value ?? '')
  })

  it('should stream completion_result text when tool is partial', async () => {
    const block: ToolUse = {
      type: 'tool_use',
      name: 'attempt_completion',
      params: {
        result: 'Partial completion text'
      },
      partial: true
    }

    await task.handleToolUse(block)

    expect(sayMock).toHaveBeenCalledWith('completion_result', 'Partial completion text', true)
  })
})

describe('processSlashCommands and filterConversationHistoryByTimestamp', () => {
  let task: any
  let contextManager: ContextManager

  beforeEach(async () => {
    vi.clearAllMocks()

    vi.mocked(getGlobalState).mockResolvedValue({ language: 'en-US' })

    contextManager = new ContextManager()
    task = Object.create((Task as unknown as { prototype: object }).prototype) as any
    task.summarizeUpToTs = undefined
    task.contextManager = contextManager
    task.chatermMessages = [
      { ts: 1000, conversationHistoryIndex: 0 },
      { ts: 2000, conversationHistoryIndex: 1 },
      { ts: 3000, conversationHistoryIndex: 2 },
      { ts: 4000, conversationHistoryIndex: 3 }
    ]
  })

  it('should extract summarizeUpToTs from command chip', async () => {
    const userContent: any[] = [{ type: 'text', text: '/summary-to-doc' }]
    const contentParts: any[] = [
      {
        type: 'chip',
        chipType: 'command',
        ref: {
          command: '/summary-to-doc',
          label: '/Summary to Doc',
          summarizeUpToTs: 2500
        }
      }
    ]

    await task.processSlashCommands(userContent, contentParts)

    expect(task.summarizeUpToTs).toBe(2500)
  })

  it('should set summarizeUpToTs to undefined when not provided in command chip', async () => {
    task.summarizeUpToTs = 999 // Set initial value
    const userContent: any[] = [{ type: 'text', text: '/summary-to-doc' }]
    const contentParts: any[] = [
      {
        type: 'chip',
        chipType: 'command',
        ref: {
          command: '/summary-to-doc',
          label: '/Summary to Doc'
          // No summarizeUpToTs
        }
      }
    ]

    await task.processSlashCommands(userContent, contentParts)

    expect(task.summarizeUpToTs).toBeUndefined()
  })

  it('should replace slash command with full prompt', async () => {
    const userContent: any[] = [{ type: 'text', text: '/summary-to-doc' }]
    const contentParts: any[] = [
      {
        type: 'chip',
        chipType: 'command',
        ref: {
          command: '/summary-to-doc',
          label: '/Summary to Doc',
          summarizeUpToTs: 2000
        }
      }
    ]

    await task.processSlashCommands(userContent, contentParts)

    expect(userContent[0].text).toContain('summarize_to_knowledge')
    expect(userContent[0].text).toContain('ONLY use summarize_to_knowledge')
  })

  it('should filter conversation history up to timestamp', () => {
    const conversationHistory: any[] = [
      { role: 'user', content: 'Message 1' },
      { role: 'assistant', content: 'Response 1' },
      { role: 'user', content: 'Message 2' },
      { role: 'assistant', content: 'Response 2' }
    ]

    const filtered = contextManager.filterConversationHistoryByTimestamp(conversationHistory, task.chatermMessages, 2500)

    expect(filtered).toHaveLength(2)
    expect(filtered[0].content).toBe('Message 1')
    expect(filtered[1].content).toBe('Response 1')
  })

  it('should return full history when timestamp is beyond all messages', () => {
    const conversationHistory: any[] = [
      { role: 'user', content: 'Message 1' },
      { role: 'assistant', content: 'Response 1' }
    ]

    const filtered = contextManager.filterConversationHistoryByTimestamp(conversationHistory, task.chatermMessages, 9999)

    expect(filtered).toEqual(conversationHistory)
  })

  it('should return full history when timestamp is before first message', () => {
    const conversationHistory: any[] = [
      { role: 'user', content: 'Message 1' },
      { role: 'assistant', content: 'Response 1' }
    ]

    const filtered = contextManager.filterConversationHistoryByTimestamp(conversationHistory, task.chatermMessages, 500)

    expect(filtered).toEqual(conversationHistory)
  })

  it('should handle empty conversation history', () => {
    const conversationHistory: any[] = []

    const filtered = contextManager.filterConversationHistoryByTimestamp(conversationHistory, task.chatermMessages, 2000)

    expect(filtered).toEqual([])
  })

  it('should handle message without conversationHistoryIndex', () => {
    const chatermMessagesWithMissing = [
      { ts: 1000, conversationHistoryIndex: 0 },
      { ts: 2000 } // Missing conversationHistoryIndex
    ] as any[]

    const conversationHistory: any[] = [
      { role: 'user', content: 'Message 1' },
      { role: 'assistant', content: 'Response 1' }
    ]

    const filtered = contextManager.filterConversationHistoryByTimestamp(conversationHistory, chatermMessagesWithMissing, 2000)

    expect(filtered).toEqual(conversationHistory)
  })

  it('should preserve last user message after truncation', () => {
    const conversationHistory: any[] = [
      { role: 'user', content: 'Message 1' },
      { role: 'assistant', content: 'Response 1' },
      { role: 'user', content: 'Message 2' },
      { role: 'assistant', content: 'Response 2' },
      { role: 'user', content: 'Current user message with /summary-to-doc' }
    ]

    // chatermMessages with text content for verification
    const chatermMessagesWithText = [
      { ts: 1000, type: 'say', conversationHistoryIndex: 0, text: 'Message 1' },
      { ts: 2000, type: 'say', conversationHistoryIndex: 2, text: 'Message 2' },
      { ts: 3000, type: 'say', conversationHistoryIndex: 4, text: 'Current user message with /summary-to-doc' }
    ] as any[]

    const filtered = contextManager.filterConversationHistoryByTimestamp(conversationHistory, chatermMessagesWithText, 1500)

    // Should truncate to before ts=2000 (Message 2), but preserve the current user message
    expect(filtered.length).toBeGreaterThanOrEqual(3)
    expect(filtered[0].content).toBe('Message 1')
    expect(filtered[1].content).toBe('Response 1')
    // Last message should be the current user message
    const lastMsg = filtered[filtered.length - 1]
    expect(lastMsg.role).toBe('user')
    expect(lastMsg.content).toBe('Current user message with /summary-to-doc')
  })

  it('should skip truncation if message content does not match', () => {
    const conversationHistory: any[] = [
      { role: 'user', content: 'Message 1' },
      { role: 'assistant', content: 'Response 1' },
      { role: 'user', content: 'Message 2' },
      { role: 'assistant', content: 'Response 2' }
    ]

    // chatermMessages with mismatched text (content mismatch)
    const chatermMessagesWithMismatch = [
      { ts: 1000, type: 'say', conversationHistoryIndex: 0, text: 'Message 1' },
      { ts: 2000, type: 'say', conversationHistoryIndex: 2, text: 'Completely different text' } // Mismatch
    ] as any[]

    const filtered = contextManager.filterConversationHistoryByTimestamp(conversationHistory, chatermMessagesWithMismatch, 2000)

    // Should return full history due to content mismatch
    expect(filtered).toEqual(conversationHistory)
  })

  it('should handle truncation with array content in API messages', () => {
    const conversationHistory: any[] = [
      { role: 'user', content: [{ type: 'text', text: 'Message 1' }] },
      { role: 'assistant', content: [{ type: 'text', text: 'Response 1' }] },
      { role: 'user', content: [{ type: 'text', text: 'Message 2' }] },
      { role: 'user', content: [{ type: 'text', text: 'Current request' }] }
    ]

    const chatermMessagesWithText = [
      { ts: 1000, type: 'say', conversationHistoryIndex: 0, text: 'Message 1' },
      { ts: 2000, type: 'say', conversationHistoryIndex: 2, text: 'Message 2' },
      { ts: 3000, type: 'say', conversationHistoryIndex: 3, text: 'Current request' }
    ] as any[]

    const filtered = contextManager.filterConversationHistoryByTimestamp(conversationHistory, chatermMessagesWithText, 2500)

    // Should truncate to before Message 2, but preserve current request
    expect(filtered.length).toBeGreaterThanOrEqual(3)
    const lastMsg = filtered[filtered.length - 1]
    expect(lastMsg.role).toBe('user')
    expect(lastMsg.content).toEqual([{ type: 'text', text: 'Current request' }])
  })
})
