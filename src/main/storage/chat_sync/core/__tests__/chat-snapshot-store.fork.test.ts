import { describe, it, expect, beforeEach, vi } from 'vitest'
import type Database from 'better-sqlite3'
import { ChatSnapshotStore } from '../ChatSnapshotStore'
import type { ForkTaskPayload } from '../../../db/chaterm/agent'
import { createChatDb } from '../../../db/chaterm/__tests__/helpers/chatSchema'

vi.mock('@logging/index', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn()
  }))
}))

const TASK = 'fork-task'

const payload = (overrides: Partial<ForkTaskPayload> = {}): ForkTaskPayload => ({
  taskId: TASK,
  title: 'Server health (Fork)',
  metadata: { title: 'Server health (Fork)', favorite: false, hosts: [{ host: '10.0.0.1', uuid: 'a', connection: 'personal' }] },
  messages: [
    { ts: 100, type: 'say', say: 'text', text: 'check disk', conversationHistoryIndex: 1 },
    { ts: 102, type: 'say', say: 'completion_result', text: 'Disk is fine', conversationHistoryIndex: 2 }
  ] as ForkTaskPayload['messages'],
  apiHistory: [
    { role: 'user', content: [{ type: 'text', text: 'check disk' }] },
    { role: 'assistant', content: [{ type: 'text', text: 'Disk is fine' }] }
  ],
  contextHistory: { version: 2, truncationNotice: { timestamp: 1, text: 'summary' } },
  ...overrides
})

const rowCounts = (db: Database.Database) =>
  [
    'agent_task_metadata_v1',
    'agent_ui_messages_v1',
    'agent_api_conversation_history_v1',
    'agent_context_history_v1',
    'agent_chat_sync_task_state'
  ].map((table) => (db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE task_id = ?`).get(TASK) as { n: number }).n)

describe('ChatSnapshotStore.forkTask', () => {
  let db: Database.Database
  let store: ChatSnapshotStore

  beforeEach(() => {
    ChatSnapshotStore.resetInstance()
    db = createChatDb()
    store = ChatSnapshotStore.getInstance()
    store.initialize({ getDb: () => db } as never, 'device-1')
  })

  it('writes the four chat tables and marks the task for upload exactly once', async () => {
    await store.forkTask(payload())

    expect(rowCounts(db)).toEqual([1, 2, 2, 1, 1])
    expect(db.prepare('SELECT title, favorite, hosts FROM agent_task_metadata_v1 WHERE task_id = ?').get(TASK)).toEqual({
      title: 'Server health (Fork)',
      favorite: 0,
      hosts: JSON.stringify([{ host: '10.0.0.1', uuid: 'a', connection: 'personal' }])
    })
    expect(db.prepare('SELECT local_change_seq, pending_upload FROM agent_chat_sync_task_state WHERE task_id = ?').get(TASK)).toEqual({
      local_change_seq: 1,
      pending_upload: 1
    })
  })

  it('skips the context table when the fork has no context history', async () => {
    await store.forkTask(payload({ contextHistory: null }))

    expect(rowCounts(db)).toEqual([1, 2, 2, 0, 1])
  })

  it('stores nothing when a later write fails', async () => {
    const circular: Record<string, unknown> = {}
    circular.self = circular

    await expect(store.forkTask(payload({ contextHistory: circular }))).rejects.toThrow()

    expect(rowCounts(db)).toEqual([0, 0, 0, 0, 0])
  })

  it('stores nothing when the messages cannot be written', async () => {
    const withBadMessage = payload({ messages: [{ ts: 100, type: undefined } as unknown as ForkTaskPayload['messages'][number]] })

    await expect(store.forkTask(withBadMessage)).rejects.toThrow()

    expect(rowCounts(db)).toEqual([0, 0, 0, 0, 0])
  })

  it('rejects before storing anything when the store is not initialized', async () => {
    ChatSnapshotStore.resetInstance()

    await expect(ChatSnapshotStore.getInstance().forkTask(payload())).rejects.toThrow('ChatSnapshotStore not initialized')
    expect(rowCounts(db)).toEqual([0, 0, 0, 0, 0])
  })
})
