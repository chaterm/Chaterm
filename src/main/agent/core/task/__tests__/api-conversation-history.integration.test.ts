//  Copyright (c) 2025-present, chaterm.ai  All rights reserved.
//  This source code is licensed under the GPL-3.0

/**
 * Integration tests for apiConversationHistory and conversationHistoryIndex
 *
 * Bug 1: conversationHistoryIndex records wrong value
 *   - addToChatermMessages is called BEFORE assistant message is added to apiConversationHistory
 *   - Result: index points to user message instead of assistant message
 *
 * Bug 2: apiConversationHistory flattening on save/restore
 *   - When saving, each content block gets its own sequence_order
 *   - When loading, uses sequence_order as message key, causing flattening
 *   - Result: [{ content: [a, b] }] becomes [{ content: [a] }, { content: [b] }]
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock electron and other dependencies
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

// Mock disk storage - we'll capture what gets saved
let savedApiConversationHistory: any[] = []
vi.mock('@core/storage/disk', () => ({
  saveChatermMessages: vi.fn(async () => undefined),
  saveApiConversationHistory: vi.fn(async (_taskId: string, history: any[]) => {
    savedApiConversationHistory = history
  }),
  getChatermMessages: vi.fn(async () => []),
  getSavedApiConversationHistory: vi.fn(async () => savedApiConversationHistory),
  ensureTaskExists: vi.fn(async () => 'test-task'),
  getTaskMetadata: vi.fn(async () => ({})),
  saveTaskMetadata: vi.fn(async () => undefined)
}))

import { Task } from '../index'
import { getApiConversationHistoryLogic, saveApiConversationHistoryLogic } from '../../../../storage/db/chaterm/agent'

describe('Bug 1: conversationHistoryIndex points to wrong message', () => {
  let task: any

  beforeEach(() => {
    vi.clearAllMocks()
    savedApiConversationHistory = []

    // Create Task instance with required properties
    task = Object.create((Task as unknown as { prototype: object }).prototype) as any
    task.taskId = 'test-task-123'
    task.chatermMessages = []
    task.apiConversationHistory = []
    task.conversationHistoryDeletedRange = undefined

    // Mock methods called by the methods under test
    task.saveChatermMessagesAndUpdateHistory = vi.fn().mockResolvedValue(undefined)

    // Bind actual methods we're testing
    task.addToChatermMessages = Task.prototype['addToChatermMessages'].bind(task)
    task.addToApiConversationHistory = Task.prototype['addToApiConversationHistory'].bind(task)
  })

  it('Bug1: chatermMessage.conversationHistoryIndex should point to assistant message index', async () => {
    // Step 1: Build up conversation history like real usage
    // Turn 1: user asks, assistant responds
    await task.addToApiConversationHistory({
      role: 'user',
      content: [{ type: 'text', text: 'Check disk space' }]
    })
    await task.addToApiConversationHistory({
      role: 'assistant',
      content: [{ type: 'text', text: 'Running df -h...' }]
    })

    // Turn 2: tool results come back as user message
    await task.addToApiConversationHistory({
      role: 'user',
      content: [
        { type: 'text', text: '[execute_command] Result: ...' },
        { type: 'text', text: 'Environment details...' }
      ]
    })

    // At this point: apiConversationHistory = [user, assistant, user], length = 3

    // Step 2: During assistant response processing, say() is called which calls addToChatermMessages
    // This happens BEFORE the assistant message is added to apiConversationHistory
    await task.addToChatermMessages({
      ts: Date.now(),
      type: 'say',
      say: 'completion_result',
      text: 'Disk space is sufficient'
    })

    // Step 3: After processing, assistant message is added
    await task.addToApiConversationHistory({
      role: 'assistant',
      content: [{ type: 'text', text: '<attempt_completion>...</attempt_completion>' }]
    })

    // Now: apiConversationHistory = [user, assistant, user, assistant], length = 4

    // Verification: The chatermMessage should reference the assistant message (index 3)
    const chatermMsg = task.chatermMessages[0]
    const referencedMsg = task.apiConversationHistory[chatermMsg.conversationHistoryIndex]

    // This test FAILS with current code:
    // - Expected: index 3, pointing to assistant message
    // - Actual: index 2, pointing to user message
    expect(chatermMsg.conversationHistoryIndex).toBe(3)
    expect(referencedMsg.role).toBe('assistant')
  })

  it('Bug1: multiple chatermMessages in same turn should all point to same assistant message', async () => {
    // Setup conversation
    await task.addToApiConversationHistory({
      role: 'user',
      content: [{ type: 'text', text: 'Run multiple commands' }]
    })
    await task.addToApiConversationHistory({
      role: 'assistant',
      content: [{ type: 'text', text: 'Executing...' }]
    })
    await task.addToApiConversationHistory({
      role: 'user',
      content: [{ type: 'text', text: 'Command results...' }]
    })

    // Multiple say() calls during one assistant turn
    await task.addToChatermMessages({
      ts: 1000,
      type: 'say',
      say: 'command',
      text: 'Running ls...'
    })
    await task.addToChatermMessages({
      ts: 2000,
      type: 'say',
      say: 'command_output',
      text: 'file1.txt\nfile2.txt'
    })
    await task.addToChatermMessages({
      ts: 3000,
      type: 'say',
      say: 'completion_result',
      text: 'Commands executed successfully'
    })

    // Assistant message added after all say() calls
    await task.addToApiConversationHistory({
      role: 'assistant',
      content: [{ type: 'text', text: 'All commands completed' }]
    })

    // All chatermMessages should point to the same assistant message (index 3)
    // With the bug, they all point to user message (index 2)
    expect(task.chatermMessages[0].conversationHistoryIndex).toBe(3)
    expect(task.chatermMessages[1].conversationHistoryIndex).toBe(3)
    expect(task.chatermMessages[2].conversationHistoryIndex).toBe(3)
  })
})

describe('Bug 2: apiConversationHistory flattening on save/restore', () => {
  /**
   * This test uses a mock database to verify save/restore logic
   * without requiring actual better-sqlite3 (which has version issues in test env).
   */

  // Mock database row structure
  interface DbRow {
    content_data: string
    role: string
    content_type: string
    tool_use_id: string | null
    sequence_order: number
    message_index: number
  }

  // Mock database storage
  let mockDbRows: DbRow[] = []
  const taskId = 'test-task'

  // Create mock database that mimics better-sqlite3 interface
  function createMockDb() {
    return {
      prepare: (sql: string) => {
        if (sql.includes('DELETE')) {
          return {
            run: () => {
              mockDbRows = []
            }
          }
        }
        if (sql.includes('INSERT')) {
          return {
            run: (
              _taskId: string,
              _ts: number,
              role: string,
              contentType: string,
              contentData: string,
              toolUseId: string | null,
              sequenceOrder: number,
              messageIndex: number
            ) => {
              mockDbRows.push({
                content_data: contentData,
                role,
                content_type: contentType,
                tool_use_id: toolUseId,
                sequence_order: sequenceOrder,
                message_index: messageIndex
              })
            }
          }
        }
        if (sql.includes('SELECT')) {
          return {
            all: () => mockDbRows.slice().sort((a, b) => a.sequence_order - b.sequence_order)
          }
        }
        return { run: () => {}, all: () => [] }
      },
      transaction: (fn: () => void) => fn,
      exec: () => {},
      close: () => {}
    }
  }

  beforeEach(() => {
    mockDbRows = []
  })

  it('Bug2: save then load should preserve message count', async () => {
    const originalHistory = [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Check system status' },
          { type: 'text', text: 'Environment: Linux...' }
        ]
      },
      {
        role: 'assistant',
        content: [{ type: 'text', text: 'Running diagnostics...' }]
      },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'df -h result: ...' },
          { type: 'text', text: 'free -m result: ...' },
          { type: 'text', text: 'top result: ...' }
        ]
      },
      {
        role: 'assistant',
        content: [{ type: 'text', text: 'System status: OK' }]
      }
    ]

    const db = createMockDb()

    await saveApiConversationHistoryLogic(db as never, taskId, originalHistory)
    const restoredHistory = await getApiConversationHistoryLogic(db as never, taskId)

    // With fix: 4 messages preserved (message_index groups content blocks correctly)
    expect(restoredHistory.length).toBe(originalHistory.length)
  })

  it('Bug2: save then load should preserve content structure per message', async () => {
    const originalHistory = [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Message A' },
          { type: 'text', text: 'Message B' }
        ]
      },
      {
        role: 'assistant',
        content: [{ type: 'text', text: 'Response' }]
      }
    ]

    const db = createMockDb()

    await saveApiConversationHistoryLogic(db as never, taskId, originalHistory)
    const restoredHistory = await getApiConversationHistoryLogic(db as never, taskId)

    // With fix: first message has 2 content blocks
    expect(restoredHistory[0].content.length).toBe(2)
    expect(restoredHistory[0].content[0].text).toBe('Message A')
    expect(restoredHistory[0].content[1].text).toBe('Message B')
  })

  it('Bug2: save then load should preserve conversationHistoryIndex mapping', async () => {
    const originalHistory = [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'msg1' },
          { type: 'text', text: 'ctx1' }
        ]
      },
      { role: 'assistant', content: [{ type: 'text', text: 'resp1' }] },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'result1' },
          { type: 'text', text: 'result2' }
        ]
      },
      { role: 'assistant', content: [{ type: 'text', text: 'resp2' }] }
    ]

    const chatermMessage = {
      ts: 1000,
      conversationHistoryIndex: 3,
      say: 'completion_result'
    }

    expect(originalHistory[chatermMessage.conversationHistoryIndex].role).toBe('assistant')

    const db = createMockDb()

    await saveApiConversationHistoryLogic(db as never, taskId, originalHistory)
    const restoredHistory = await getApiConversationHistoryLogic(db as never, taskId)

    // With fix: index 3 still points to assistant message
    expect(restoredHistory[chatermMessage.conversationHistoryIndex].role).toBe('assistant')
  })
})
