import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ChatSyncEngine } from '../ChatSyncEngine'
import { ChatSnapshotStore } from '../ChatSnapshotStore'
import { ChatSyncApiError } from '../../models/ChatSyncTypes'
import type { ChatSyncTaskState } from '../../models/ChatSyncTypes'

// Mock logger
vi.mock('@logging/index', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn()
  }))
}))

function createMockApiClient() {
  return {
    upsertTaskSnapshot: vi.fn(),
    deleteTaskSnapshot: vi.fn(),
    getTaskSnapshot: vi.fn(),
    getTaskChanges: vi.fn(),
    listTaskSnapshots: vi.fn(),
    listNonActiveTaskStates: vi.fn()
  }
}

function createMockDbService() {
  const syncStates = new Map<string, any>()

  return {
    getAllPendingUploadTasks: vi.fn((): Partial<ChatSyncTaskState>[] => []),
    getTasksPendingRepair: vi.fn((): Partial<ChatSyncTaskState>[] => []),
    getSyncTaskState: vi.fn((taskId: string) => syncStates.get(taskId) || null),
    upsertSyncTaskState: vi.fn((state: any) => {
      const existing = syncStates.get(state.task_id) || {}
      syncStates.set(state.task_id, { ...existing, ...state })
    }),
    getTasksPendingRemoteDeletion: vi.fn((): Partial<ChatSyncTaskState>[] => []),
    getSyncCursorRevision: vi.fn(() => 0),
    upsertSyncCursorRevision: vi.fn(),
    getAllSyncedTasks: vi.fn((): Partial<ChatSyncTaskState>[] => []),
    getDb: vi.fn(() => ({
      prepare: vi.fn(() => ({
        all: vi.fn(() => []),
        get: vi.fn()
      }))
    })),
    _syncStates: syncStates
  }
}

function createMockStore() {
  return {
    exportSnapshot: vi.fn(() => ({
      task_id: 'test',
      schema_version: 2,
      snapshot_type: 'full' as const,
      tables: {
        api_conversation_history: [],
        ui_messages: [],
        task_metadata: [],
        context_history: []
      },
      client_meta: { device_id: 'dev-1', platform: 'desktop', generated_at: 0 }
    })),
    applyRemoteSnapshot: vi.fn(),
    cleanupRemoteDeletedTasks: vi.fn()
  }
}

function createStatefulDbService(initialStates: Array<Partial<ChatSyncTaskState> & { task_id: string }>, initialLocalTasks: string[]) {
  const syncStates = new Map<string, any>()
  for (const state of initialStates) {
    syncStates.set(state.task_id, { ...state })
  }

  const localTasks = new Set(initialLocalTasks)
  let cursorRevision = 0

  const mockDb = {
    transaction: (fn: () => void) => {
      const wrapper = () => fn()
      return wrapper
    },
    prepare: (sql: string) => ({
      all: () => {
        if (sql.includes('SELECT m.task_id FROM agent_task_metadata_v1')) {
          return []
        }
        return []
      },
      get: (taskId: string) => {
        if (sql.includes('agent_chat_sync_task_state')) {
          return syncStates.get(taskId)
        }
        return undefined
      },
      run: () => ({ changes: 1 })
    })
  }

  return {
    getAllPendingUploadTasks: vi.fn((): Partial<ChatSyncTaskState>[] => []),
    getTasksPendingRepair: vi.fn((): Partial<ChatSyncTaskState>[] =>
      Array.from(syncStates.values()).filter(
        (state) => state.last_sync_status === 'apply_failed' && state.pending_upload !== 1 && state.remote_deleted !== 1 && state.is_deleted !== 1
      )
    ),
    getSyncTaskState: vi.fn((taskId: string) => syncStates.get(taskId) || null),
    upsertSyncTaskState: vi.fn((state: any) => {
      const existing = syncStates.get(state.task_id) || {}
      syncStates.set(state.task_id, { ...existing, ...state })
    }),
    getTasksPendingRemoteDeletion: vi.fn((): Partial<ChatSyncTaskState>[] =>
      Array.from(syncStates.values()).filter((state) => state.is_deleted === 1 && state.last_server_revision > 0 && state.remote_deleted !== 1)
    ),
    getSyncCursorRevision: vi.fn(() => cursorRevision),
    upsertSyncCursorRevision: vi.fn((revision: number) => {
      cursorRevision = revision
    }),
    getAllSyncedTasks: vi.fn((): Partial<ChatSyncTaskState>[] =>
      Array.from(syncStates.values()).filter((state) => state.last_server_revision > 0 && state.is_deleted !== 1)
    ),
    getRemoteDeletedNotCleanedTasks: vi.fn((): Partial<ChatSyncTaskState>[] =>
      Array.from(syncStates.values()).filter((state) => state.remote_deleted === 1 && state.is_deleted !== 1)
    ),
    deleteTaskChatData: vi.fn((taskId: string) => {
      localTasks.delete(taskId)
    }),
    getDb: vi.fn(() => mockDb),
    exportTaskSnapshot: vi.fn(() => ({
      agent_api_conversation_history_v1: [],
      agent_ui_messages_v1: [],
      agent_task_metadata_v1: [],
      agent_context_history_v1: []
    })),
    importTaskSnapshot: vi.fn(),
    _importTaskSnapshotRaw: vi.fn(),
    _syncStates: syncStates,
    _localTasks: localTasks
  }
}

describe('ChatSyncEngine', () => {
  let engine: ChatSyncEngine
  let apiClient: ReturnType<typeof createMockApiClient>
  let dbService: ReturnType<typeof createMockDbService>
  let store: ReturnType<typeof createMockStore>

  beforeEach(() => {
    ChatSnapshotStore.resetInstance()
    apiClient = createMockApiClient()
    dbService = createMockDbService()
    store = createMockStore()

    engine = new ChatSyncEngine(apiClient as any, dbService as any, store as any)
  })

  describe('getStatus', () => {
    it('should return initial idle status', () => {
      const status = engine.getStatus()
      expect(status.status).toBe('idle')
      expect(status.lastSyncAt).toBeNull()
      expect(status.lastError).toBeNull()
      expect(status.pendingUploadCount).toBe(0)
    })
  })

  describe('runSyncCycle', () => {
    it('should complete a sync cycle with no pending changes', async () => {
      apiClient.getTaskChanges.mockResolvedValue({
        changes: [],
        has_more: false,
        cursor_expired: false,
        last_global_revision: 0
      })

      await engine.runSyncCycle()

      const status = engine.getStatus()
      expect(status.status).toBe('idle')
      expect(status.lastSyncAt).not.toBeNull()
    })

    it('should skip if already syncing', async () => {
      // Make first sync hang
      apiClient.getTaskChanges.mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(
              () =>
                resolve({
                  changes: [],
                  has_more: false,
                  cursor_expired: false,
                  last_global_revision: 0
                }),
              100
            )
          )
      )

      const p1 = engine.runSyncCycle()
      const p2 = engine.runSyncCycle() // Should skip

      await Promise.all([p1, p2])

      // getTaskChanges should only be called once (from p1)
      expect(apiClient.getTaskChanges).toHaveBeenCalledTimes(1)
    })

    it('should upload pending tasks during sync', async () => {
      dbService.getAllPendingUploadTasks.mockReturnValue([
        {
          task_id: 'task-1',
          local_change_seq: 3,
          acked_local_change_seq: 0,
          pending_upload: 1,
          sync_blocked_reason: null,
          last_server_revision: 0
        }
      ])

      apiClient.upsertTaskSnapshot.mockResolvedValue({
        server_revision: 1,
        payload_hash: 'hash-1',
        payload_hash_version: 1,
        task_deleted: false
      })

      dbService.getSyncTaskState.mockReturnValue({
        task_id: 'task-1',
        local_change_seq: 3
      })

      apiClient.getTaskChanges.mockResolvedValue({
        changes: [],
        has_more: false,
        cursor_expired: false,
        last_global_revision: 1
      })

      await engine.runSyncCycle()

      expect(store.exportSnapshot).toHaveBeenCalledWith('task-1')
      expect(apiClient.upsertTaskSnapshot).toHaveBeenCalledWith('task-1', expect.any(String))
      expect(dbService.upsertSyncTaskState).toHaveBeenCalledWith(
        expect.objectContaining({
          task_id: 'task-1',
          last_server_revision: 1,
          last_uploaded_hash: 'hash-1'
        })
      )
    })

    it('should skip blocked tasks during upload', async () => {
      dbService.getAllPendingUploadTasks.mockReturnValue([
        {
          task_id: 'blocked-task',
          local_change_seq: 1,
          acked_local_change_seq: 0,
          pending_upload: 1,
          sync_blocked_reason: 'oversize'
        }
      ])

      apiClient.getTaskChanges.mockResolvedValue({
        changes: [],
        has_more: false,
        cursor_expired: false,
        last_global_revision: 0
      })

      await engine.runSyncCycle()

      expect(store.exportSnapshot).not.toHaveBeenCalled()
      expect(apiClient.upsertTaskSnapshot).not.toHaveBeenCalled()
    })

    it('should handle TASK_DELETED during upload', async () => {
      dbService.getAllPendingUploadTasks.mockReturnValue([
        {
          task_id: 'task-deleted',
          local_change_seq: 1,
          acked_local_change_seq: 0,
          pending_upload: 1,
          sync_blocked_reason: null,
          last_server_revision: 5
        }
      ])

      apiClient.upsertTaskSnapshot.mockRejectedValue(new ChatSyncApiError('TASK_DELETED', 'Task deleted'))

      apiClient.getTaskChanges.mockResolvedValue({
        changes: [],
        has_more: false,
        cursor_expired: false,
        last_global_revision: 0
      })

      await engine.runSyncCycle()

      expect(dbService.upsertSyncTaskState).toHaveBeenCalledWith(
        expect.objectContaining({
          task_id: 'task-deleted',
          remote_deleted: 1,
          pending_upload: 0,
          last_sync_status: 'remote_deleted'
        })
      )
    })

    it('should handle TASK_SNAPSHOT_TOO_LARGE during upload', async () => {
      dbService.getAllPendingUploadTasks.mockReturnValue([
        {
          task_id: 'big-task',
          local_change_seq: 1,
          acked_local_change_seq: 0,
          pending_upload: 1,
          sync_blocked_reason: null,
          last_server_revision: 0
        }
      ])

      apiClient.upsertTaskSnapshot.mockRejectedValue(new ChatSyncApiError('TASK_SNAPSHOT_TOO_LARGE', 'Too large'))

      apiClient.getTaskChanges.mockResolvedValue({
        changes: [],
        has_more: false,
        cursor_expired: false,
        last_global_revision: 0
      })

      await engine.runSyncCycle()

      expect(dbService.upsertSyncTaskState).toHaveBeenCalledWith(
        expect.objectContaining({
          task_id: 'big-task',
          sync_blocked_reason: 'oversize',
          pending_upload: 0,
          last_sync_status: 'blocked'
        })
      )
    })

    it('should handle TASK_ARCHIVED during upload', async () => {
      dbService.getAllPendingUploadTasks.mockReturnValue([
        {
          task_id: 'archived-task',
          local_change_seq: 1,
          acked_local_change_seq: 0,
          pending_upload: 1,
          sync_blocked_reason: null,
          last_server_revision: 3
        }
      ])

      apiClient.upsertTaskSnapshot.mockRejectedValue(new ChatSyncApiError('TASK_ARCHIVED' as any, 'Task archived'))

      apiClient.getTaskChanges.mockResolvedValue({
        changes: [],
        has_more: false,
        cursor_expired: false,
        last_global_revision: 0
      })

      await engine.runSyncCycle()

      expect(dbService.upsertSyncTaskState).toHaveBeenCalledWith(
        expect.objectContaining({
          task_id: 'archived-task',
          sync_blocked_reason: 'archived',
          pending_upload: 0,
          last_sync_status: 'frozen'
        })
      )
    })

    it('should pull and apply remote changes', async () => {
      apiClient.getTaskChanges.mockResolvedValue({
        changes: [
          {
            task_id: 'remote-task-1',
            op: 'upsert',
            server_revision: 5,
            payload_hash: 'remote-hash',
            payload_hash_version: 1
          }
        ],
        has_more: false,
        cursor_expired: false,
        last_global_revision: 5
      })

      // No local state for this task
      dbService.getSyncTaskState.mockReturnValue(null)

      apiClient.getTaskSnapshot.mockResolvedValue({
        snapshot_json: JSON.stringify({
          tables: {
            api_conversation_history: [],
            ui_messages: [],
            task_metadata: [],
            context_history: []
          }
        }),
        server_revision: 5,
        payload_hash: 'remote-hash',
        payload_hash_version: 1
      })

      await engine.runSyncCycle()

      expect(apiClient.getTaskSnapshot).toHaveBeenCalledWith('remote-task-1', undefined)
      expect(store.applyRemoteSnapshot).toHaveBeenCalledWith('remote-task-1', expect.any(Object), 5, 'remote-hash', 1)
    })

    it('should skip remote change when hash matches local', async () => {
      apiClient.getTaskChanges.mockResolvedValue({
        changes: [
          {
            task_id: 'task-same-hash',
            op: 'upsert',
            server_revision: 5,
            payload_hash: 'same-hash',
            payload_hash_version: 1
          }
        ],
        has_more: false,
        cursor_expired: false,
        last_global_revision: 5
      })

      dbService.getSyncTaskState.mockReturnValue({
        task_id: 'task-same-hash',
        last_server_revision: 3,
        last_applied_hash: 'same-hash',
        last_applied_hash_version: 1
      })

      await engine.runSyncCycle()

      // Should only update revision, not fetch snapshot
      expect(apiClient.getTaskSnapshot).not.toHaveBeenCalled()
      expect(store.applyRemoteSnapshot).not.toHaveBeenCalled()
      expect(dbService.upsertSyncTaskState).toHaveBeenCalledWith(
        expect.objectContaining({
          task_id: 'task-same-hash',
          last_server_revision: 5
        })
      )
    })

    it('should handle remote delete operations', async () => {
      apiClient.getTaskChanges.mockResolvedValue({
        changes: [
          {
            task_id: 'deleted-remote',
            op: 'delete',
            server_revision: 7,
            payload_hash: '',
            payload_hash_version: 0
          }
        ],
        has_more: false,
        cursor_expired: false,
        last_global_revision: 7
      })

      await engine.runSyncCycle()

      expect(dbService.upsertSyncTaskState).toHaveBeenCalledWith(
        expect.objectContaining({
          task_id: 'deleted-remote',
          remote_deleted: 1,
          pending_upload: 0,
          last_server_revision: 7
        })
      )
    })

    it('should advance cursor even when one task apply fails', async () => {
      apiClient.getTaskChanges.mockResolvedValue({
        changes: [
          {
            task_id: 'broken-task',
            op: 'upsert',
            server_revision: 2,
            payload_hash: 'broken-hash',
            payload_hash_version: 1
          },
          {
            task_id: 'healthy-task',
            op: 'upsert',
            server_revision: 3,
            payload_hash: 'healthy-hash',
            payload_hash_version: 1
          }
        ],
        has_more: false,
        cursor_expired: false,
        last_global_revision: 3
      })

      apiClient.getTaskSnapshot.mockRejectedValueOnce(new Error('snapshot missing')).mockResolvedValueOnce({
        snapshot_json: JSON.stringify({
          tables: {
            api_conversation_history: [],
            ui_messages: [],
            task_metadata: [],
            context_history: []
          }
        }),
        server_revision: 3,
        payload_hash: 'healthy-hash',
        payload_hash_version: 1
      })

      await engine.runSyncCycle()

      expect(dbService.upsertSyncTaskState).toHaveBeenCalledWith(
        expect.objectContaining({
          task_id: 'broken-task',
          sync_blocked_reason: 'apply_failed',
          last_sync_status: 'blocked'
        })
      )
      expect(store.applyRemoteSnapshot).toHaveBeenCalledWith('healthy-task', expect.any(Object), 3, 'healthy-hash', 1)
      expect(dbService.upsertSyncCursorRevision).toHaveBeenCalledWith(3)
    })

    it('should stop retrying a task after a snapshot apply failure', async () => {
      const statefulDbService = createStatefulDbService([], [])
      const retryEngine = new ChatSyncEngine(apiClient as any, statefulDbService as any, store as any)

      apiClient.getTaskChanges
        .mockResolvedValueOnce({
          changes: [
            {
              task_id: 'broken-task',
              op: 'upsert',
              server_revision: 5,
              global_revision: 5,
              payload_hash: 'broken-hash',
              payload_hash_version: 1,
              source_device_id: 'device-1',
              updated_at: '2026-03-11T00:00:00Z'
            }
          ],
          has_more: false,
          cursor_expired: false,
          last_global_revision: 5
        })
        .mockResolvedValueOnce({
          changes: [],
          has_more: false,
          cursor_expired: false,
          last_global_revision: 5
        })

      apiClient.getTaskSnapshot.mockRejectedValue(new Error('snapshot missing'))

      await retryEngine.runSyncCycle()
      await retryEngine.runSyncCycle()

      expect(apiClient.getTaskSnapshot).toHaveBeenCalledTimes(1)
      expect(statefulDbService._syncStates.get('broken-task')).toMatchObject({
        task_id: 'broken-task',
        sync_blocked_reason: 'apply_failed',
        last_sync_status: 'blocked',
        last_error: 'snapshot missing'
      })
    })

    it('should advance full sync cursor after blocking a failed task', async () => {
      apiClient.getTaskChanges.mockResolvedValue({
        changes: [],
        has_more: false,
        cursor_expired: true,
        last_global_revision: 0
      })

      apiClient.listTaskSnapshots.mockResolvedValue({
        items: [
          {
            task_id: 'broken-task',
            server_revision: 10,
            payload_hash: 'broken-hash',
            payload_hash_version: 1,
            updated_at: '2026-03-11T00:00:00Z'
          },
          {
            task_id: 'healthy-task',
            server_revision: 11,
            payload_hash: 'healthy-hash',
            payload_hash_version: 1,
            updated_at: '2026-03-11T00:00:01Z'
          }
        ],
        has_more: false,
        last_global_revision: 200,
        next_after_task_id: ''
      })
      apiClient.listNonActiveTaskStates.mockResolvedValue({
        items: [],
        has_more: false,
        last_global_revision: 200,
        next_after_task_id: ''
      })
      apiClient.getTaskSnapshot.mockRejectedValueOnce(new Error('snapshot missing')).mockResolvedValueOnce({
        snapshot_json: JSON.stringify({
          tables: {
            api_conversation_history: [],
            ui_messages: [],
            task_metadata: [],
            context_history: []
          }
        }),
        server_revision: 11,
        payload_hash: 'healthy-hash',
        payload_hash_version: 1
      })

      dbService.getAllSyncedTasks.mockReturnValue([])

      await engine.runSyncCycle()

      expect(dbService.upsertSyncTaskState).toHaveBeenCalledWith(
        expect.objectContaining({
          task_id: 'broken-task',
          sync_blocked_reason: 'apply_failed',
          last_sync_status: 'blocked'
        })
      )
      expect(store.applyRemoteSnapshot).toHaveBeenCalledWith('healthy-task', expect.any(Object), 11, 'healthy-hash', 1)
      expect(dbService.upsertSyncCursorRevision).toHaveBeenCalledWith(200)
    })

    it('should fallback to full sync on cursor_expired', async () => {
      apiClient.getTaskChanges.mockResolvedValue({
        changes: [],
        has_more: false,
        cursor_expired: true,
        last_global_revision: 0
      })

      apiClient.listTaskSnapshots.mockResolvedValue({
        items: [],
        has_more: false,
        last_global_revision: 100,
        next_after_task_id: ''
      })
      apiClient.listNonActiveTaskStates.mockResolvedValue({
        items: [],
        has_more: false,
        last_global_revision: 100,
        next_after_task_id: ''
      })

      dbService.getAllSyncedTasks.mockReturnValue([])

      await engine.runSyncCycle()

      expect(apiClient.listTaskSnapshots).toHaveBeenCalled()
      expect(dbService.upsertSyncCursorRevision).toHaveBeenCalledWith(100)
    })

    it('should reconcile archived and deleted tasks during full sync', async () => {
      apiClient.getTaskChanges.mockResolvedValue({
        changes: [],
        has_more: false,
        cursor_expired: true,
        last_global_revision: 0
      })

      apiClient.listTaskSnapshots.mockResolvedValue({
        items: [
          {
            task_id: 'active-task',
            server_revision: 8,
            payload_hash: 'active-hash',
            payload_hash_version: 1,
            updated_at: '2026-03-11T00:00:00Z'
          }
        ],
        has_more: false,
        last_global_revision: 120,
        next_after_task_id: ''
      })

      apiClient.listNonActiveTaskStates.mockResolvedValue({
        items: [
          {
            task_id: 'archived-task',
            state: 'archived',
            state_revision: 4,
            updated_at: '2026-03-10T00:00:00Z'
          },
          {
            task_id: 'deleted-task',
            state: 'deleted',
            state_revision: 6,
            updated_at: '2026-03-09T00:00:00Z'
          }
        ],
        has_more: false,
        last_global_revision: 120,
        next_after_task_id: ''
      })

      dbService.getAllSyncedTasks.mockReturnValue([
        { task_id: 'archived-task', last_server_revision: 4 },
        { task_id: 'deleted-task', last_server_revision: 6 },
        { task_id: 'orphan-task', last_server_revision: 9 }
      ])

      apiClient.getTaskSnapshot.mockResolvedValue({
        snapshot_json: JSON.stringify({
          tables: {
            api_conversation_history: [],
            ui_messages: [],
            task_metadata: [],
            context_history: []
          }
        }),
        server_revision: 8,
        payload_hash: 'active-hash',
        payload_hash_version: 1
      })

      await engine.runSyncCycle()

      expect(apiClient.listNonActiveTaskStates).toHaveBeenCalled()
      expect(dbService.upsertSyncTaskState).toHaveBeenCalledWith(
        expect.objectContaining({
          task_id: 'archived-task',
          sync_blocked_reason: 'archived',
          pending_upload: 0,
          last_sync_status: 'frozen'
        })
      )
      expect(dbService.upsertSyncTaskState).toHaveBeenCalledWith(
        expect.objectContaining({
          task_id: 'deleted-task',
          remote_deleted: 1,
          pending_upload: 0
        })
      )
      expect(dbService.upsertSyncTaskState).not.toHaveBeenCalledWith(
        expect.objectContaining({
          task_id: 'orphan-task',
          remote_deleted: 1
        })
      )
    })

    it('should preserve archived local data across full sync and cleanup only deleted tasks', async () => {
      const statefulDbService = createStatefulDbService(
        [
          {
            task_id: 'archived-task',
            last_server_revision: 4,
            remote_deleted: 0,
            is_deleted: 0,
            pending_upload: 0
          },
          {
            task_id: 'deleted-task',
            last_server_revision: 6,
            remote_deleted: 0,
            is_deleted: 0,
            pending_upload: 0
          }
        ],
        ['archived-task', 'deleted-task']
      )
      const realStore = ChatSnapshotStore.getInstance()
      realStore.initialize(statefulDbService as any, 'device-123')
      const integrationEngine = new ChatSyncEngine(apiClient as any, statefulDbService as any, realStore)

      apiClient.getTaskChanges.mockResolvedValue({
        changes: [],
        has_more: false,
        cursor_expired: true,
        last_global_revision: 0
      })
      apiClient.listTaskSnapshots.mockResolvedValue({
        items: [],
        has_more: false,
        last_global_revision: 120,
        next_after_task_id: ''
      })
      apiClient.listNonActiveTaskStates.mockResolvedValue({
        items: [
          {
            task_id: 'archived-task',
            state: 'archived',
            state_revision: 4,
            updated_at: '2026-03-10T00:00:00Z'
          },
          {
            task_id: 'deleted-task',
            state: 'deleted',
            state_revision: 6,
            updated_at: '2026-03-09T00:00:00Z'
          }
        ],
        has_more: false,
        last_global_revision: 120,
        next_after_task_id: ''
      })

      await integrationEngine.runSyncCycle()

      expect(statefulDbService._syncStates.get('archived-task')).toMatchObject({
        task_id: 'archived-task',
        last_server_revision: 4,
        sync_blocked_reason: 'archived',
        pending_upload: 0,
        last_sync_status: 'frozen'
      })
      expect(statefulDbService._localTasks.has('archived-task')).toBe(true)

      expect(statefulDbService._syncStates.get('deleted-task')).toMatchObject({
        task_id: 'deleted-task',
        last_server_revision: 6,
        remote_deleted: 1,
        pending_upload: 0,
        last_sync_status: 'remote_deleted'
      })
      expect(statefulDbService._localTasks.has('deleted-task')).toBe(true)

      await integrationEngine.runRemoteDeletedCleanup()

      expect(statefulDbService._localTasks.has('archived-task')).toBe(true)
      expect(statefulDbService._syncStates.get('archived-task').is_deleted ?? 0).not.toBe(1)
      expect(statefulDbService._localTasks.has('deleted-task')).toBe(false)
      expect(statefulDbService._syncStates.get('deleted-task')).toMatchObject({
        task_id: 'deleted-task',
        last_server_revision: 6,
        remote_deleted: 1,
        is_deleted: 1,
        pending_upload: 0
      })
    })
  })

  describe('runRemoteDeletedCleanup', () => {
    it('should delegate to store cleanup', async () => {
      await engine.runRemoteDeletedCleanup()
      expect(store.cleanupRemoteDeletedTasks).toHaveBeenCalled()
    })
  })
})
