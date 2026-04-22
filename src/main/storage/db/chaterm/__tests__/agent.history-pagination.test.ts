import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@logging/index', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn()
  }))
}))

const { getSavedChatermMessagesPageLogic } = await import('../agent')

type Row = Record<string, unknown>

describe('agent.ts - history pagination', () => {
  let rows: Row[]
  let db: {
    prepare: (sql: string) => {
      all: (...args: unknown[]) => Row[]
    }
  }

  beforeEach(() => {
    rows = Array.from({ length: 5 }, (_, index) => ({
      id: index + 1,
      ts: 101 + index,
      type: 'say',
      ask_type: null,
      say_type: 'text',
      text: `Message ${index + 1}`,
      content_parts: null,
      reasoning: null,
      images: null,
      partial: 0,
      last_checkpoint_hash: null,
      is_checkpoint_checked_out: 0,
      is_operation_outside_workspace: 0,
      conversation_history_index: null,
      conversation_history_deleted_range: null,
      mcp_tool_call_data: null,
      hosts: null
    }))

    db = {
      prepare: () => ({
        all: (...args: unknown[]) => {
          const [taskId, beforeCursor, limitPlusOne] = args.length === 3 ? args : [args[0], null, args[1]]
          if (taskId !== 'task-1') return []

          const filtered = rows
            .filter((row) => (beforeCursor == null ? true : Number(row.id) < Number(beforeCursor)))
            .sort((a, b) => Number(b.id) - Number(a.id))
            .slice(0, Number(limitPlusOne))

          return filtered
        }
      })
    }
  })

  it('returns the newest chunk first with an older-page cursor', async () => {
    const page = await getSavedChatermMessagesPageLogic(db as never, 'task-1', { limit: 2 })

    expect(page.messages.map((message) => message.text)).toEqual(['Message 4', 'Message 5'])
    expect(page.hasMore).toBe(true)
    expect(page.nextCursor).toBe(4)
  })

  it('returns older chunks using the beforeCursor boundary', async () => {
    const page = await getSavedChatermMessagesPageLogic(db as never, 'task-1', { limit: 2, beforeCursor: 4 })

    expect(page.messages.map((message) => message.text)).toEqual(['Message 2', 'Message 3'])
    expect(page.hasMore).toBe(true)
    expect(page.nextCursor).toBe(2)
  })

  it('returns hasMore false and null cursor at the oldest chunk', async () => {
    const page = await getSavedChatermMessagesPageLogic(db as never, 'task-1', { limit: 2, beforeCursor: 2 })

    expect(page.messages.map((message) => message.text)).toEqual(['Message 1'])
    expect(page.hasMore).toBe(false)
    expect(page.nextCursor).toBeNull()
  })
})
