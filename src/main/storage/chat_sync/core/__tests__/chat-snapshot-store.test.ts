import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ChatSnapshotStore } from '../ChatSnapshotStore'
import { SCHEMA_VERSION } from '../../models/ChatSyncTypes'
import type { TaskSnapshotTables } from '../../models/ChatSyncTypes'

// Mock logger
vi.mock('@logging/index', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn()
  }))
}))

const EMPTY_TABLES: TaskSnapshotTables = {
  agent_api_conversation_history_v1: [],
  agent_ui_messages_v1: [],
  agent_task_metadata_v1: [],
  agent_context_history_v1: []
}

/**
 * Helper to create a mock database service with in-memory tracking.
 */
function createMockDbService() {
  const syncStates = new Map<string, any>()
  const runLog: Array<{ sql: string; params: unknown[] }> = []

  const mockDb = {
    transaction: (fn: () => void) => {
      const wrapper = () => fn()
      return wrapper
    },
    prepare: (sql: string) => ({
      run: (...params: unknown[]) => {
        runLog.push({ sql, params })
        return { changes: 1 }
      },
      get: (taskId: string) => {
        if (sql.includes('agent_chat_sync_task_state')) {
          return syncStates.get(taskId)
        }
        return undefined
      },
      all: () => []
    })
  }

  const dbService = {
    getDb: () => mockDb,
    getSyncTaskState: vi.fn((_taskId: string): any => null),
    upsertSyncTaskState: vi.fn((state: any) => {
      const existing = syncStates.get(state.task_id) || {}
      syncStates.set(state.task_id, { ...existing, ...state })
    }),
    deleteTaskChatData: vi.fn(),
    exportTaskSnapshot: vi.fn((_taskId: string) => ({ ...EMPTY_TABLES })),
    importTaskSnapshot: vi.fn(),
    _importTaskSnapshotRaw: vi.fn(),
    getRemoteDeletedNotCleanedTasks: vi.fn(() => [] as Array<{ task_id: string }>)
  }

  return { dbService, mockDb, syncStates, runLog }
}

describe('ChatSnapshotStore', () => {
  let store: ChatSnapshotStore

  beforeEach(() => {
    ChatSnapshotStore.resetInstance()
    store = ChatSnapshotStore.getInstance()
  })

  it('should be a singleton', () => {
    const store2 = ChatSnapshotStore.getInstance()
    expect(store).toBe(store2)
  })

  it('should not be initialized before calling initialize()', () => {
    expect(store.isInitialized()).toBe(false)
  })

  it('should throw when operations called before initialize()', async () => {
    await expect(store.saveTaskTitle('task-1', 'test')).rejects.toThrow('ChatSnapshotStore not initialized')
  })

  describe('after initialization', () => {
    let dbService: ReturnType<typeof createMockDbService>['dbService']
    let runLog: ReturnType<typeof createMockDbService>['runLog']

    beforeEach(() => {
      const mock = createMockDbService()
      dbService = mock.dbService
      runLog = mock.runLog
      store.initialize(dbService as any, 'device-123')
    })

    it('should be initialized', () => {
      expect(store.isInitialized()).toBe(true)
    })

    it('should export snapshot with correct structure', () => {
      const snapshot = store.exportSnapshot('task-1')

      expect(snapshot.task_id).toBe('task-1')
      expect(snapshot.schema_version).toBe(SCHEMA_VERSION)
      expect(snapshot.snapshot_type).toBe('full')
      expect(snapshot.client_meta.device_id).toBe('device-123')
      expect(snapshot.client_meta.platform).toBe('desktop')
      expect(snapshot.tables).toBeDefined()
      expect(dbService.exportTaskSnapshot).toHaveBeenCalledWith('task-1')
    })

    it('should delete task locally when never uploaded', async () => {
      dbService.getSyncTaskState.mockReturnValue(null)

      const result = await store.deleteTask('task-1')

      expect(result.needsRemoteDeletion).toBe(false)
      expect(dbService.deleteTaskChatData).toHaveBeenCalledWith('task-1')
    })

    it('should delete task locally when last_server_revision is 0', async () => {
      dbService.getSyncTaskState.mockReturnValue({
        task_id: 'task-1',
        last_server_revision: 0
      })

      const result = await store.deleteTask('task-1')

      expect(result.needsRemoteDeletion).toBe(false)
      expect(dbService.deleteTaskChatData).toHaveBeenCalledWith('task-1')
    })

    it('should mark for remote deletion when task was uploaded', async () => {
      dbService.getSyncTaskState.mockReturnValue({
        task_id: 'task-1',
        last_server_revision: 5
      })

      const result = await store.deleteTask('task-1')

      expect(result.needsRemoteDeletion).toBe(true)
      expect(dbService.deleteTaskChatData).toHaveBeenCalledWith('task-1')
      // Verify that is_deleted was set via raw SQL in transaction
      const updateCall = runLog.find((c) => c.sql.includes('is_deleted') && c.params.includes('task-1'))
      expect(updateCall).toBeDefined()
    })

    it('should apply remote snapshot in single transaction using raw import', () => {
      const tables: TaskSnapshotTables = { ...EMPTY_TABLES }

      store.applyRemoteSnapshot('task-1', tables, 10, 'hash-abc', 1)

      // Should use _importTaskSnapshotRaw (not importTaskSnapshot)
      expect(dbService._importTaskSnapshotRaw).toHaveBeenCalledWith('task-1', tables)
      expect(dbService.importTaskSnapshot).not.toHaveBeenCalled()

      // Verify sync state was updated via raw SQL in transaction
      const syncUpdate = runLog.find((c) => c.sql.includes('last_applied_hash') && c.params.includes('hash-abc'))
      expect(syncUpdate).toBeDefined()
    })

    it('should cleanup remote-deleted tasks', async () => {
      dbService.getRemoteDeletedNotCleanedTasks.mockReturnValue([{ task_id: 'task-a' }, { task_id: 'task-b' }])

      const cleaned = await store.cleanupRemoteDeletedTasks()

      expect(cleaned).toBe(2)
      expect(dbService.deleteTaskChatData).toHaveBeenCalledTimes(2)
      expect(dbService.upsertSyncTaskState).toHaveBeenCalledTimes(2)
    })

    it('should keep archived tasks out of the upload queue on local writes', async () => {
      dbService.upsertSyncTaskState({
        task_id: 'task-archived',
        local_change_seq: 4,
        acked_local_change_seq: 4,
        sync_blocked_reason: 'archived',
        pending_upload: 0
      })

      await store.saveTaskTitle('task-archived', 'new title after archive')

      const dirtyUpdate = runLog.find(
        (c) =>
          c.sql.includes('UPDATE agent_chat_sync_task_state') && c.sql.includes("sync_blocked_reason IS NULL OR sync_blocked_reason != 'archived'")
      )

      expect(dirtyUpdate).toBeDefined()
    })
  })
})
