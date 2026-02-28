import { describe, it, expect, beforeEach, vi } from 'vitest'
import Database from 'better-sqlite3'
import type { ChatermMessage } from '@shared/ExtensionMessage'
import type { Host } from '@shared/WebviewMessage'

// Mock logger
vi.mock('@logging/index', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn()
  }))
}))

const { getSavedChatermMessagesLogic, saveChatermMessagesLogic } = await import('../agent')

type Statement = {
  run: (...args: unknown[]) => { changes: number }
  all: (taskId?: string) => Array<Record<string, unknown>>
}

type MockDb = {
  prepare: (sql: string) => Statement
  transaction: (fn: () => void) => () => void
}

describe('agent.ts - hosts field support', () => {
  let db: MockDb
  let savedMessages: Array<Record<string, unknown>>

  beforeEach(() => {
    savedMessages = []

    db = {
      prepare(sql: string): Statement {
        const normalized = sql.trim().toLowerCase()

        if (normalized.includes('select ts, type, ask_type')) {
          return {
            run: () => ({ changes: 0 }),
            all: () => savedMessages
          }
        }

        if (normalized.includes('insert into agent_ui_messages_v1')) {
          return {
            run: (...args: unknown[]) => {
              // Capture the insert call
              const [
                _taskId,
                ts,
                type,
                askType,
                sayType,
                text,
                contentParts,
                reasoning,
                images,
                partial,
                lastCheckpointHash,
                isCheckpointCheckedOut,
                isOperationOutsideWorkspace,
                conversationHistoryIndex,
                conversationHistoryDeletedRange,
                mcpToolCallData,
                hosts
              ] = args

              savedMessages.push({
                ts,
                type,
                ask_type: askType,
                say_type: sayType,
                text,
                content_parts: contentParts,
                reasoning,
                images,
                partial,
                last_checkpoint_hash: lastCheckpointHash,
                is_checkpoint_checked_out: isCheckpointCheckedOut,
                is_operation_outside_workspace: isOperationOutsideWorkspace,
                conversation_history_index: conversationHistoryIndex,
                conversation_history_deleted_range: conversationHistoryDeletedRange,
                mcp_tool_call_data: mcpToolCallData,
                hosts
              })

              return { changes: 1 }
            },
            all: () => []
          }
        }

        if (normalized.includes('delete from agent_ui_messages_v1')) {
          return {
            run: () => {
              savedMessages = []
              return { changes: savedMessages.length }
            },
            all: () => []
          }
        }

        return {
          run: () => ({ changes: 0 }),
          all: () => []
        }
      },
      transaction(fn: () => void) {
        return () => fn()
      }
    }
  })

  describe('saveChatermMessagesLogic', () => {
    it('should save messages with hosts as JSON string', async () => {
      const hosts: Host[] = [
        {
          host: '192.168.1.10',
          uuid: 'host-uuid-1',
          connection: 'personal',
          organizationUuid: 'org-1',
          assetType: 'linux'
        },
        {
          host: '10.0.0.5',
          uuid: 'host-uuid-2',
          connection: 'organization',
          assetType: 'windows'
        }
      ]

      const messages: ChatermMessage[] = [
        {
          ts: Date.now(),
          type: 'say',
          say: 'text',
          text: 'Test message',
          hosts
        }
      ]

      await saveChatermMessagesLogic(db as unknown as Database.Database, 'test-task-id', messages)

      expect(savedMessages).toHaveLength(1)
      const saved = savedMessages[0]
      expect(saved.hosts).toBe(JSON.stringify(hosts))
    })

    it('should save messages without hosts as null', async () => {
      const messages: ChatermMessage[] = [
        {
          ts: Date.now(),
          type: 'say',
          say: 'text',
          text: 'Test message without hosts'
        }
      ]

      await saveChatermMessagesLogic(db as unknown as Database.Database, 'test-task-id', messages)

      expect(savedMessages).toHaveLength(1)
      expect(savedMessages[0].hosts).toBeNull()
    })

    it('should save messages with empty hosts array as null', async () => {
      const messages: ChatermMessage[] = [
        {
          ts: Date.now(),
          type: 'say',
          say: 'text',
          text: 'Test message',
          hosts: []
        }
      ]

      await saveChatermMessagesLogic(db as unknown as Database.Database, 'test-task-id', messages)

      expect(savedMessages).toHaveLength(1)
      expect(savedMessages[0].hosts).toBeNull()
    })

    it('should handle multiple messages with different hosts', async () => {
      const hosts1: Host[] = [{ host: '192.168.1.10', uuid: 'uuid-1', connection: 'personal' }]
      const hosts2: Host[] = [{ host: '10.0.0.5', uuid: 'uuid-2', connection: 'organization' }]

      const messages: ChatermMessage[] = [
        {
          ts: Date.now(),
          type: 'say',
          say: 'text',
          text: 'Message 1',
          hosts: hosts1
        },
        {
          ts: Date.now() + 1,
          type: 'say',
          say: 'text',
          text: 'Message 2',
          hosts: hosts2
        }
      ]

      await saveChatermMessagesLogic(db as unknown as Database.Database, 'test-task-id', messages)

      expect(savedMessages).toHaveLength(2)
      expect(savedMessages[0].hosts).toBe(JSON.stringify(hosts1))
      expect(savedMessages[1].hosts).toBe(JSON.stringify(hosts2))
    })
  })

  describe('getSavedChatermMessagesLogic - backward compatibility', () => {
    it('should parse hosts from JSON string (new format)', async () => {
      const hosts: Host[] = [
        {
          host: '192.168.1.10',
          uuid: 'host-uuid-1',
          connection: 'personal',
          assetType: 'linux'
        }
      ]

      savedMessages = [
        {
          ts: Date.now(),
          type: 'say',
          say_type: 'text',
          text: 'Test message',
          hosts: JSON.stringify(hosts),
          ask_type: null,
          content_parts: null,
          reasoning: null,
          images: null,
          partial: 0,
          last_checkpoint_hash: null,
          is_checkpoint_checked_out: 0,
          is_operation_outside_workspace: 0,
          conversation_history_index: null,
          conversation_history_deleted_range: null,
          mcp_tool_call_data: null
        }
      ]

      const messages = await getSavedChatermMessagesLogic(db as unknown as Database.Database, 'test-task-id')

      expect(messages).toHaveLength(1)
      expect(messages[0].hosts).toEqual(hosts)
    })

    it('should convert old comma-separated string format to Host array', async () => {
      savedMessages = [
        {
          ts: Date.now(),
          type: 'say',
          say_type: 'text',
          text: 'Test message',
          hosts: '192.168.1.10,10.0.0.5', // Old format
          ask_type: null,
          content_parts: null,
          reasoning: null,
          images: null,
          partial: 0,
          last_checkpoint_hash: null,
          is_checkpoint_checked_out: 0,
          is_operation_outside_workspace: 0,
          conversation_history_index: null,
          conversation_history_deleted_range: null,
          mcp_tool_call_data: null
        }
      ]

      const messages = await getSavedChatermMessagesLogic(db as unknown as Database.Database, 'test-task-id')

      expect(messages).toHaveLength(1)
      expect(messages[0].hosts).toEqual([
        { host: '192.168.1.10', uuid: '192.168.1.10', connection: 'personal' },
        { host: '10.0.0.5', uuid: '10.0.0.5', connection: 'personal' }
      ])
    })

    it('should handle empty old format string', async () => {
      savedMessages = [
        {
          ts: Date.now(),
          type: 'say',
          say_type: 'text',
          text: 'Test message',
          hosts: '', // Empty old format
          ask_type: null,
          content_parts: null,
          reasoning: null,
          images: null,
          partial: 0,
          last_checkpoint_hash: null,
          is_checkpoint_checked_out: 0,
          is_operation_outside_workspace: 0,
          conversation_history_index: null,
          conversation_history_deleted_range: null,
          mcp_tool_call_data: null
        }
      ]

      const messages = await getSavedChatermMessagesLogic(db as unknown as Database.Database, 'test-task-id')

      expect(messages).toHaveLength(1)
      expect(messages[0].hosts).toBeUndefined()
    })

    it('should handle null hosts field', async () => {
      savedMessages = [
        {
          ts: Date.now(),
          type: 'say',
          say_type: 'text',
          text: 'Test message',
          hosts: null,
          ask_type: null,
          content_parts: null,
          reasoning: null,
          images: null,
          partial: 0,
          last_checkpoint_hash: null,
          is_checkpoint_checked_out: 0,
          is_operation_outside_workspace: 0,
          conversation_history_index: null,
          conversation_history_deleted_range: null,
          mcp_tool_call_data: null
        }
      ]

      const messages = await getSavedChatermMessagesLogic(db as unknown as Database.Database, 'test-task-id')

      expect(messages).toHaveLength(1)
      expect(messages[0].hosts).toBeUndefined()
    })

    it('should handle malformed JSON gracefully', async () => {
      savedMessages = [
        {
          ts: Date.now(),
          type: 'say',
          say_type: 'text',
          text: 'Test message',
          hosts: '{invalid json', // Malformed JSON
          ask_type: null,
          content_parts: null,
          reasoning: null,
          images: null,
          partial: 0,
          last_checkpoint_hash: null,
          is_checkpoint_checked_out: 0,
          is_operation_outside_workspace: 0,
          conversation_history_index: null,
          conversation_history_deleted_range: null,
          mcp_tool_call_data: null
        }
      ]

      const messages = await getSavedChatermMessagesLogic(db as unknown as Database.Database, 'test-task-id')

      expect(messages).toHaveLength(1)
      // Should fallback to treating it as comma-separated string
      expect(messages[0].hosts).toBeDefined()
      expect(Array.isArray(messages[0].hosts)).toBe(true)
    })

    it('should preserve all Host object fields when parsing', async () => {
      const hosts: Host[] = [
        {
          host: '192.168.1.10',
          uuid: 'host-uuid-1',
          connection: 'organization',
          organizationUuid: 'org-uuid-123',
          assetType: 'linux-server'
        }
      ]

      savedMessages = [
        {
          ts: Date.now(),
          type: 'say',
          say_type: 'text',
          text: 'Test message',
          hosts: JSON.stringify(hosts),
          ask_type: null,
          content_parts: null,
          reasoning: null,
          images: null,
          partial: 0,
          last_checkpoint_hash: null,
          is_checkpoint_checked_out: 0,
          is_operation_outside_workspace: 0,
          conversation_history_index: null,
          conversation_history_deleted_range: null,
          mcp_tool_call_data: null
        }
      ]

      const messages = await getSavedChatermMessagesLogic(db as unknown as Database.Database, 'test-task-id')

      expect(messages).toHaveLength(1)
      expect(messages[0].hosts).toEqual(hosts)
      expect(messages[0].hosts?.[0].organizationUuid).toBe('org-uuid-123')
      expect(messages[0].hosts?.[0].assetType).toBe('linux-server')
    })
  })
})
