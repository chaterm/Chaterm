/**
 * ChatSyncEngine - Sync engine for Chat Sync V2
 *
 * Implements the upload-first sync loop:
 * 1. Upload all pending local changes
 * 2. Pull remote changes via GetTaskChanges
 * 3. Apply remote changes (with hash comparison to skip unnecessary updates)
 *
 * Handles:
 * - TASK_DELETED responses
 * - TASK_SNAPSHOT_TOO_LARGE responses
 * - cursor_expired fallback to full sync
 * - Remote delete propagation
 */

import type { ChatSyncApiClient } from './ChatSyncApiClient'
import type { ChatSnapshotStore } from './ChatSnapshotStore'
import type { ChatermDatabaseService } from '../../db/chaterm.service'
import type { SyncEngineStatus, TaskChange, TaskSnapshotTables, ListTaskSnapshotItem, NonActiveTaskStateItem } from '../models/ChatSyncTypes'
import { ChatSyncApiError, MAX_SNAPSHOT_BYTES } from '../models/ChatSyncTypes'
const logger = createLogger('chat-sync-engine')

export class ChatSyncEngine {
  private apiClient: ChatSyncApiClient
  private dbService: ChatermDatabaseService
  private store: ChatSnapshotStore
  private status: SyncEngineStatus = {
    status: 'idle',
    lastSyncAt: null,
    lastError: null,
    pendingUploadCount: 0
  }
  private isSyncing = false

  constructor(apiClient: ChatSyncApiClient, dbService: ChatermDatabaseService, store: ChatSnapshotStore) {
    this.apiClient = apiClient
    this.dbService = dbService
    this.store = store
  }

  getStatus(): SyncEngineStatus {
    return { ...this.status }
  }

  /**
   * Run a complete sync cycle: upload-first, then pull changes.
   */
  async runSyncCycle(): Promise<void> {
    if (this.isSyncing) {
      logger.info('Sync cycle already in progress, skipping')
      return
    }

    this.isSyncing = true
    this.status.status = 'syncing'

    try {
      // Phase 1: Upload pending local changes
      await this._uploadPendingChanges()

      // Phase 2: Handle tasks marked for remote deletion
      await this._processRemoteDeletions()

      // Phase 3: Freeze legacy apply_failed tasks so they stop retrying every cycle.
      await this._repairFailedTasks()

      // Phase 4: Pull and apply remote changes
      await this._pullRemoteChanges()

      this.status.status = 'idle'
      this.status.lastSyncAt = Date.now()
      this.status.lastError = null
    } catch (error) {
      this.status.status = 'error'
      this.status.lastError = (error as Error).message
      logger.error('Sync cycle failed', { error })
    } finally {
      this.isSyncing = false
    }
  }

  /**
   * Run background cleanup for remote-deleted tasks.
   * Called on startup or when entering chat module.
   */
  async runRemoteDeletedCleanup(): Promise<void> {
    try {
      await this.store.cleanupRemoteDeletedTasks()
    } catch (error) {
      logger.error('Remote deleted cleanup failed', { error })
    }
  }

  // ============================================================================
  // Phase 1: Upload Pending Changes
  // ============================================================================

  private async _uploadPendingChanges(): Promise<void> {
    const pendingTasks = this.dbService.getAllPendingUploadTasks()
    this.status.pendingUploadCount = pendingTasks.length

    if (pendingTasks.length === 0) {
      return
    }

    // Try to recover previously oversize-blocked tasks
    this._attemptOversizeRecovery()

    logger.info('Uploading pending changes', { count: pendingTasks.length })

    for (const taskState of pendingTasks) {
      try {
        // Skip tasks that are blocked
        if (taskState.sync_blocked_reason) {
          continue
        }

        // Capture candidate local_change_seq before export
        const candidateLocalChangeSeq = taskState.local_change_seq

        // Export snapshot
        const snapshot = this.store.exportSnapshot(taskState.task_id)
        const snapshotJson = JSON.stringify(snapshot)

        // Upload to server
        const reply = await this.apiClient.upsertTaskSnapshot(taskState.task_id, snapshotJson)

        if (reply.task_deleted) {
          // Task was deleted on server
          this._handleTaskDeleted(taskState.task_id)
          continue
        }

        // Write back sync state from server response
        const ackedSeq = Math.max(taskState.acked_local_change_seq, candidateLocalChangeSeq)
        const currentState = this.dbService.getSyncTaskState(taskState.task_id)
        const currentLocalChangeSeq = currentState?.local_change_seq ?? candidateLocalChangeSeq

        this.dbService.upsertSyncTaskState({
          task_id: taskState.task_id,
          last_uploaded_hash: reply.payload_hash,
          last_uploaded_hash_version: reply.payload_hash_version,
          last_applied_hash: reply.payload_hash,
          last_applied_hash_version: reply.payload_hash_version,
          last_server_revision: reply.server_revision,
          acked_local_change_seq: ackedSeq,
          // Recalculate pending_upload based on whether new changes occurred during upload
          pending_upload: currentLocalChangeSeq > ackedSeq ? 1 : 0,
          last_sync_status: 'uploaded'
        })
      } catch (error) {
        if (error instanceof ChatSyncApiError) {
          if (error.code === 'TASK_DELETED') {
            this._handleTaskDeleted(taskState.task_id)
            continue
          }
          if (error.code === 'TASK_ARCHIVED') {
            this._handleTaskArchived(taskState.task_id)
            continue
          }
          if (error.code === 'TASK_SNAPSHOT_TOO_LARGE') {
            this._handleSnapshotTooLarge(taskState.task_id)
            continue
          }
        }
        logger.error('Failed to upload task snapshot', {
          taskId: taskState.task_id,
          error
        })
        this.dbService.upsertSyncTaskState({
          task_id: taskState.task_id,
          last_sync_status: 'upload_failed',
          last_error: (error as Error).message
        })
      }
    }
  }

  // ============================================================================
  // Phase 2: Process Remote Deletions
  // ============================================================================

  private async _processRemoteDeletions(): Promise<void> {
    const deletedTasks = this.dbService.getTasksPendingRemoteDeletion()

    for (const task of deletedTasks) {
      try {
        await this.apiClient.deleteTaskSnapshot(task.task_id)
        this.dbService.upsertSyncTaskState({
          task_id: task.task_id,
          remote_deleted: 1,
          pending_upload: 0
        })
      } catch (error) {
        if (error instanceof ChatSyncApiError && error.code === 'TASK_DELETED') {
          // Already deleted on server, mark accordingly
          this.dbService.upsertSyncTaskState({
            task_id: task.task_id,
            remote_deleted: 1,
            pending_upload: 0
          })
        } else {
          logger.error('Failed to delete task on server', {
            taskId: task.task_id,
            error
          })
        }
      }
    }
  }

  // ============================================================================
  // Phase 3: Pull Remote Changes
  // ============================================================================

  private async _repairFailedTasks(): Promise<void> {
    const repairTasks = this.dbService.getTasksPendingRepair()

    for (const task of repairTasks) {
      this._blockTaskAfterApplyFailure(task.task_id, task.last_error || 'Task sync disabled after apply failure')
    }
  }

  private async _pullRemoteChanges(): Promise<void> {
    let sinceGlobalRevision = this.dbService.getSyncCursorRevision()

    let hasMore = true
    while (hasMore) {
      try {
        const changesReply = await this.apiClient.getTaskChanges(sinceGlobalRevision, 100)

        if (changesReply.cursor_expired) {
          logger.info('Cursor expired, switching to full sync')
          await this._runFullSync()
          return
        }

        for (const change of changesReply.changes) {
          await this._applyRemoteChange(change)
        }

        // Advance cursor whenever server reports a newer revision
        if (changesReply.last_global_revision > sinceGlobalRevision) {
          sinceGlobalRevision = changesReply.last_global_revision
          this.dbService.upsertSyncCursorRevision(sinceGlobalRevision)
        }

        hasMore = changesReply.has_more
      } catch (error) {
        logger.error('Failed to pull remote changes', { error })
        throw error
      }
    }
  }

  /**
   * Apply a single remote change entry.
   * Returns true if applied successfully, false if failed.
   */
  private async _applyRemoteChange(change: TaskChange): Promise<boolean> {
    const localState = this.dbService.getSyncTaskState(change.task_id)

    // Handle delete changes - highest priority
    if (change.op === 'delete') {
      this._handleRemoteDelete(change.task_id, change.server_revision)
      return true
    }

    // Handle upsert changes
    if (change.op === 'upsert') {
      // Delete-wins: skip upsert if task is locally deleted (pending remote deletion)
      if (localState && localState.is_deleted === 1) {
        return true
      }

      // Skip if we've already processed this or a newer revision
      if (localState && change.server_revision <= localState.last_server_revision) {
        return true
      }

      // Compare hashes: if same as our last applied, just update revision
      if (
        localState &&
        localState.last_applied_hash === change.payload_hash &&
        localState.last_applied_hash_version === change.payload_hash_version
      ) {
        this.dbService.upsertSyncTaskState({
          task_id: change.task_id,
          last_server_revision: change.server_revision
        })
        return true
      }

      // Hash differs - need to fetch full snapshot and apply
      try {
        const snapshotReply = await this.apiClient.getTaskSnapshot(change.task_id, change.updated_at)

        // Double-check hash after fetch (may have been updated since change was emitted)
        if (
          localState &&
          snapshotReply.payload_hash === localState.last_applied_hash &&
          snapshotReply.payload_hash_version === localState.last_applied_hash_version
        ) {
          this.dbService.upsertSyncTaskState({
            task_id: change.task_id,
            last_server_revision: snapshotReply.server_revision
          })
          return true
        }

        // Parse and apply the remote snapshot
        const parsed = JSON.parse(snapshotReply.snapshot_json)
        const tables: TaskSnapshotTables = parsed.tables || parsed

        this.store.applyRemoteSnapshot(
          change.task_id,
          tables,
          snapshotReply.server_revision,
          snapshotReply.payload_hash,
          snapshotReply.payload_hash_version
        )
        return true
      } catch (error) {
        if (error instanceof ChatSyncApiError) {
          if (error.code === 'TASK_DELETED') {
            this._handleTaskDeleted(change.task_id)
            return true
          }
          if (error.code === 'TASK_ARCHIVED') {
            this._handleTaskArchived(change.task_id)
            return true
          }
        }

        this._blockTaskAfterApplyFailure(change.task_id, (error as Error).message)
        return true
      }
    }

    return true
  }

  // ============================================================================
  // Full Sync (cursor_expired fallback)
  // ============================================================================

  private async _runFullSync(): Promise<void> {
    logger.info('Starting full sync')

    let activeAfterTaskId = ''
    let nonActiveAfterTaskId = ''
    let fullSyncBaseRevision: number | null = null
    const activeTaskIds = new Set<string>()
    const nonActiveStateMap = new Map<string, NonActiveTaskStateItem>()
    let applyFailCount = 0

    let hasMoreActive = true
    while (hasMoreActive) {
      const listReply = await this.apiClient.listTaskSnapshots(activeAfterTaskId, 200)

      if (fullSyncBaseRevision === null) {
        fullSyncBaseRevision = listReply.last_global_revision
      }

      for (const item of listReply.items) {
        activeTaskIds.add(item.task_id)
        const ok = await this._applyFullSyncItem(item)
        if (!ok) {
          applyFailCount++
        }
      }

      hasMoreActive = listReply.has_more
      if (hasMoreActive && listReply.next_after_task_id) {
        activeAfterTaskId = listReply.next_after_task_id
      }
    }

    let hasMoreNonActive = true
    while (hasMoreNonActive) {
      const stateReply = await this.apiClient.listNonActiveTaskStates(nonActiveAfterTaskId, 200)

      if (fullSyncBaseRevision === null) {
        fullSyncBaseRevision = stateReply.last_global_revision
      }

      for (const item of stateReply.items) {
        nonActiveStateMap.set(item.task_id, item)
      }

      hasMoreNonActive = stateReply.has_more
      if (hasMoreNonActive && stateReply.next_after_task_id) {
        nonActiveAfterTaskId = stateReply.next_after_task_id
      }
    }

    const syncedTasks = this.dbService.getAllSyncedTasks()
    for (const task of syncedTasks) {
      if (activeTaskIds.has(task.task_id)) {
        continue
      }

      const nonActiveState = nonActiveStateMap.get(task.task_id)
      if (!nonActiveState) {
        // Server has no record of this task — mark for re-upload to restore data
        logger.warn('Task missing from server, marking for re-upload', {
          taskId: task.task_id
        })
        this.dbService.upsertSyncTaskState({
          task_id: task.task_id,
          last_server_revision: 0,
          pending_upload: 1,
          last_sync_status: 'pending'
        })
        continue
      }

      if (nonActiveState.state === 'archived') {
        this._handleTaskArchived(task.task_id, nonActiveState.state_revision)
        continue
      }

      this._handleRemoteDelete(task.task_id, nonActiveState.state_revision)
    }

    if (applyFailCount > 0) {
      logger.warn('Full sync completed with failures, cursor not advanced', {
        taskCount: activeTaskIds.size,
        failCount: applyFailCount
      })
    } else if (fullSyncBaseRevision !== null) {
      this.dbService.upsertSyncCursorRevision(fullSyncBaseRevision)
      logger.info('Full sync completed', {
        taskCount: activeTaskIds.size,
        baseRevision: fullSyncBaseRevision
      })
    }
  }

  /**
   * Apply a single item from ListTaskSnapshots during full sync.
   * Returns true if applied successfully, false if failed.
   */
  private async _applyFullSyncItem(item: ListTaskSnapshotItem): Promise<boolean> {
    const localState = this.dbService.getSyncTaskState(item.task_id)

    // Delete-wins: skip if task is locally deleted (pending remote deletion)
    if (localState && localState.is_deleted === 1) {
      return true
    }

    // Skip if same hash (already up to date)
    if (localState && localState.last_applied_hash === item.payload_hash && localState.last_applied_hash_version === item.payload_hash_version) {
      // Just update server revision if needed
      if (item.server_revision > localState.last_server_revision) {
        this.dbService.upsertSyncTaskState({
          task_id: item.task_id,
          last_server_revision: item.server_revision
        })
      }
      return true
    }

    // Fetch full snapshot
    try {
      const snapshotReply = await this.apiClient.getTaskSnapshot(item.task_id, item.updated_at)
      const parsed = JSON.parse(snapshotReply.snapshot_json)
      const tables: TaskSnapshotTables = parsed.tables || parsed

      this.store.applyRemoteSnapshot(
        item.task_id,
        tables,
        snapshotReply.server_revision,
        snapshotReply.payload_hash,
        snapshotReply.payload_hash_version
      )
      return true
    } catch (error) {
      if (error instanceof ChatSyncApiError) {
        if (error.code === 'TASK_DELETED') {
          this._handleTaskDeleted(item.task_id)
          return true
        }
        if (error.code === 'TASK_ARCHIVED') {
          this._handleTaskArchived(item.task_id, item.server_revision)
          return true
        }
      }

      this._blockTaskAfterApplyFailure(item.task_id, (error as Error).message)
      return true
    }
  }

  // ============================================================================
  // Error Handlers
  // ============================================================================

  private _handleTaskDeleted(taskId: string): void {
    logger.info('Task marked as deleted by server', { taskId })
    this.dbService.upsertSyncTaskState({
      task_id: taskId,
      remote_deleted: 1,
      pending_upload: 0,
      last_sync_status: 'remote_deleted'
    })
  }

  private _handleRemoteDelete(taskId: string, serverRevision: number): void {
    this.dbService.upsertSyncTaskState({
      task_id: taskId,
      remote_deleted: 1,
      pending_upload: 0,
      sync_blocked_reason: null,
      last_server_revision: serverRevision,
      last_sync_status: 'remote_deleted'
    })
  }

  private _handleTaskArchived(taskId: string, serverRevision?: number): void {
    logger.info('Task marked as archived by server', { taskId })
    const nextState: {
      task_id: string
      last_server_revision?: number
      sync_blocked_reason: 'archived'
      pending_upload: 0
      last_sync_status: 'frozen'
      last_error: null
    } = {
      task_id: taskId,
      sync_blocked_reason: 'archived',
      pending_upload: 0,
      last_sync_status: 'frozen',
      last_error: null
    }
    if (serverRevision !== undefined) {
      nextState.last_server_revision = serverRevision
    }
    this.dbService.upsertSyncTaskState(nextState)
  }

  private _handleSnapshotTooLarge(taskId: string): void {
    logger.warn('Task snapshot too large, blocking sync', { taskId })
    this.dbService.upsertSyncTaskState({
      task_id: taskId,
      sync_blocked_reason: 'oversize',
      pending_upload: 0,
      last_sync_status: 'blocked',
      last_error: 'Task snapshot exceeds 10MiB limit'
    })
  }

  private _blockTaskAfterApplyFailure(taskId: string, errorMessage: string): void {
    logger.warn('Task sync disabled after apply failure', {
      taskId,
      error: errorMessage
    })
    this.dbService.upsertSyncTaskState({
      task_id: taskId,
      sync_blocked_reason: 'apply_failed',
      pending_upload: 0,
      last_sync_status: 'blocked',
      last_error: errorMessage
    })
  }

  /**
   * Check oversize-blocked tasks and unblock those whose snapshot size
   * has dropped below the 10MiB threshold (e.g. after user deleted messages).
   */
  private _attemptOversizeRecovery(): void {
    try {
      const blockedTasks = this.dbService
        .getDb()
        .prepare("SELECT task_id FROM agent_chat_sync_task_state WHERE sync_blocked_reason = 'oversize' AND is_deleted = 0")
        .all() as Array<{ task_id: string }>

      for (const task of blockedTasks) {
        const snapshot = this.store.exportSnapshot(task.task_id)
        const size = JSON.stringify(snapshot).length
        if (size < MAX_SNAPSHOT_BYTES) {
          this.dbService.upsertSyncTaskState({
            task_id: task.task_id,
            sync_blocked_reason: null,
            pending_upload: 1,
            last_sync_status: null,
            last_error: null
          })
          logger.info('Recovered oversize-blocked task', {
            taskId: task.task_id,
            currentSize: size
          })
        }
      }
    } catch (error) {
      logger.error('Failed to attempt oversize recovery', { error })
    }
  }
}
