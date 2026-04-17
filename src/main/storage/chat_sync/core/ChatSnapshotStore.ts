/**
 * ChatSnapshotStore - Unified Write Boundary for Chat Tables
 *
 * This is the ONLY entry point for writing to the 4 chat tables:
 * - agent_api_conversation_history_v1
 * - agent_ui_messages_v1
 * - agent_task_metadata_v1
 * - agent_context_history_v1
 *
 * Every write operation atomically:
 * 1. Performs the business table write
 * 2. Increments local_change_seq for sync-eligible tasks
 * 3. Marks pending_upload for sync-eligible tasks only
 *
 * Remote snapshot application uses a separate non-dirty path
 * that does NOT increment local_change_seq.
 */

import type { ChatermDatabaseService } from '../../db/chaterm.service'
import type { TaskSnapshotTables, TaskSnapshot } from '../models/ChatSyncTypes'
import { SCHEMA_VERSION } from '../models/ChatSyncTypes'
const logger = createLogger('chat-sync')

export class ChatSnapshotStore {
  private static instance: ChatSnapshotStore | null = null
  private dbService: ChatermDatabaseService | null = null
  private deviceId: string = ''

  // Private constructor to enforce singleton pattern
  private constructor() {
    // intentionally empty - use getInstance()
  }

  static getInstance(): ChatSnapshotStore {
    if (!ChatSnapshotStore.instance) {
      ChatSnapshotStore.instance = new ChatSnapshotStore()
    }
    return ChatSnapshotStore.instance
  }

  /**
   * Initialize with database service and device ID.
   * Must be called before any operations.
   * Also bootstraps sync state for existing untracked tasks.
   */
  initialize(dbService: ChatermDatabaseService, deviceId: string): void {
    this.dbService = dbService
    this.deviceId = deviceId

    // Bootstrap: create initial agent_chat_sync_task_state rows for any existing
    // tasks that don't yet have sync tracking. This ensures the unified write
    // boundary invariant holds even for tasks created before sync was enabled.
    this._bootstrapUntrackedTasks(dbService)

    logger.info('ChatSnapshotStore initialized', { deviceId })
  }

  isInitialized(): boolean {
    return this.dbService !== null
  }

  private ensureInitialized(): ChatermDatabaseService {
    if (!this.dbService) {
      throw new Error('ChatSnapshotStore not initialized. Call initialize() first.')
    }
    return this.dbService
  }

  // ============================================================================
  // Business Write Operations (all push local_change_seq in same transaction)
  // ============================================================================

  /**
   * Save API conversation history with sync state update.
   */
  async saveApiConversationHistory(taskId: string, apiConversationHistory: any[]): Promise<void> {
    const dbService = this.ensureInitialized()
    const db = dbService.getDb()

    db.transaction(() => {
      // Business write: delegate to existing logic but inline for transactional safety
      const deleteStmt = db.prepare('DELETE FROM agent_api_conversation_history_v1 WHERE task_id = ?')
      deleteStmt.run(taskId)

      const insertStmt = db.prepare(`
        INSERT INTO agent_api_conversation_history_v1
        (task_id, ts, role, content_type, content_data, tool_use_id, sequence_order, message_index)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `)

      let sequenceOrder = 0
      let messageIndex = 0
      const now = Date.now()

      for (const message of apiConversationHistory) {
        if (Array.isArray(message.content)) {
          for (const content of message.content) {
            const contentType = content.type
            let contentData = {}
            let toolUseId = null

            if (content.type === 'text') {
              contentData = { text: content.text }
            } else if (content.type === 'tool_use') {
              contentData = { name: content.name, input: content.input }
              toolUseId = content.id
            } else if (content.type === 'tool_result') {
              contentData = { content: content.content, is_error: content.is_error }
              toolUseId = content.tool_use_id
            }

            insertStmt.run(taskId, now, message.role, contentType, JSON.stringify(contentData), toolUseId, sequenceOrder++, messageIndex)
          }
        } else {
          insertStmt.run(taskId, now, message.role, 'text', JSON.stringify({ text: message.content }), null, sequenceOrder++, messageIndex)
        }
        messageIndex++
      }

      // Sync state: increment local_change_seq and mark pending
      this._markDirtyInTransaction(db, taskId)
    })()
  }

  /**
   * Save UI messages with sync state update.
   */
  async saveChatermMessages(taskId: string, uiMessages: any[]): Promise<void> {
    const dbService = this.ensureInitialized()
    const db = dbService.getDb()

    db.transaction(() => {
      const deleteStmt = db.prepare('DELETE FROM agent_ui_messages_v1 WHERE task_id = ?')
      deleteStmt.run(taskId)

      const insertStmt = db.prepare(`
        INSERT INTO agent_ui_messages_v1
        (task_id, ts, type, ask_type, say_type, text, content_parts, reasoning, images, partial,
         last_checkpoint_hash, is_checkpoint_checked_out, is_operation_outside_workspace,
         conversation_history_index, conversation_history_deleted_range, mcp_tool_call_data,
         hosts)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)

      for (const message of uiMessages) {
        const hostsStr = message.hosts && message.hosts.length > 0 ? JSON.stringify(message.hosts) : null

        insertStmt.run(
          taskId,
          message.ts,
          message.type,
          message.ask || null,
          message.say || null,
          message.text ?? null,
          message.contentParts ? JSON.stringify(message.contentParts) : null,
          message.reasoning || null,
          message.images ? JSON.stringify(message.images) : null,
          message.partial ? 1 : 0,
          message.lastCheckpointHash || null,
          message.isCheckpointCheckedOut ? 1 : 0,
          message.isOperationOutsideWorkspace ? 1 : 0,
          message.conversationHistoryIndex || null,
          message.conversationHistoryDeletedRange ? JSON.stringify(message.conversationHistoryDeletedRange) : null,
          message.mcpToolCall ? JSON.stringify(message.mcpToolCall) : null,
          hostsStr
        )
      }

      this._markDirtyInTransaction(db, taskId)
    })()
  }

  /**
   * Save task metadata with sync state update.
   */
  async saveTaskMetadata(taskId: string, metadata: any): Promise<void> {
    const dbService = this.ensureInitialized()
    const db = dbService.getDb()

    db.transaction(() => {
      const upsertStmt = db.prepare(`
        INSERT INTO agent_task_metadata_v1 (task_id, files_in_context, model_usage, hosts, todos, experience_ledger, title, favorite)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(task_id) DO UPDATE SET
          files_in_context = excluded.files_in_context,
          model_usage = excluded.model_usage,
          hosts = excluded.hosts,
          todos = excluded.todos,
          experience_ledger = excluded.experience_ledger,
          title = CASE WHEN excluded.title IS NOT NULL THEN excluded.title ELSE agent_task_metadata_v1.title END,
          favorite = CASE WHEN excluded.favorite IS NOT NULL THEN excluded.favorite ELSE agent_task_metadata_v1.favorite END
      `)

      upsertStmt.run(
        taskId,
        JSON.stringify(metadata.files_in_context || []),
        JSON.stringify(metadata.model_usage || []),
        JSON.stringify(metadata.hosts || []),
        JSON.stringify(metadata.todos || []),
        JSON.stringify(metadata.experience_ledger || []),
        metadata.title !== undefined ? metadata.title : null,
        metadata.favorite !== undefined ? (metadata.favorite ? 1 : 0) : null
      )

      this._markDirtyInTransaction(db, taskId)
    })()
  }

  /**
   * Save task title with sync state update.
   */
  async saveTaskTitle(taskId: string, title: string): Promise<void> {
    const dbService = this.ensureInitialized()
    const db = dbService.getDb()

    db.transaction(() => {
      const nowSec = Math.floor(Date.now() / 1000)
      db.prepare('UPDATE agent_task_metadata_v1 SET title = ?, updated_at = ? WHERE task_id = ?').run(title, nowSec, taskId)
      this._markDirtyInTransaction(db, taskId)
    })()
  }

  /**
   * Save task favorite status with sync state update.
   */
  async saveTaskFavorite(taskId: string, favorite: boolean): Promise<void> {
    const dbService = this.ensureInitialized()
    const db = dbService.getDb()

    db.transaction(() => {
      db.prepare('UPDATE agent_task_metadata_v1 SET favorite = ? WHERE task_id = ?').run(favorite ? 1 : 0, taskId)
      this._markDirtyInTransaction(db, taskId)
    })()
  }

  /**
   * Save context history with sync state update.
   */
  async saveContextHistory(taskId: string, contextHistory: any): Promise<void> {
    const dbService = this.ensureInitialized()
    const db = dbService.getDb()
    const jsonDataString = JSON.stringify(contextHistory)

    db.transaction(() => {
      db.prepare(
        `
        INSERT INTO agent_context_history_v1 (task_id, context_history_data, updated_at)
        VALUES (?, ?, strftime('%s', 'now'))
        ON CONFLICT(task_id) DO UPDATE SET
          context_history_data = excluded.context_history_data,
          updated_at = strftime('%s', 'now')
      `
      ).run(taskId, jsonDataString)

      this._markDirtyInTransaction(db, taskId)
    })()
  }

  /**
   * Ensure task metadata row exists. Also marks dirty if this is a new creation.
   */
  async ensureTaskMetadataExists(taskId: string, initialTitle?: string): Promise<void> {
    const dbService = this.ensureInitialized()
    const db = dbService.getDb()

    db.transaction(() => {
      db.prepare(
        `
        INSERT INTO agent_task_metadata_v1 (task_id, title, updated_at)
        VALUES (?, ?, strftime('%s', 'now'))
        ON CONFLICT(task_id) DO UPDATE SET
          title = CASE
            WHEN agent_task_metadata_v1.title IS NULL OR agent_task_metadata_v1.title = ''
            THEN excluded.title
            ELSE agent_task_metadata_v1.title
          END
      `
      ).run(taskId, initialTitle || null)

      this._markDirtyInTransaction(db, taskId)
    })()
  }

  /**
   * Touch task updated_at timestamp with sync state update.
   */
  async touchTaskUpdatedAt(taskId: string): Promise<void> {
    const dbService = this.ensureInitialized()
    const db = dbService.getDb()

    db.transaction(() => {
      db.prepare(
        `
        INSERT INTO agent_task_metadata_v1 (task_id, updated_at)
        VALUES (?, strftime('%s', 'now'))
        ON CONFLICT(task_id) DO UPDATE SET
          updated_at = strftime('%s', 'now')
      `
      ).run(taskId)

      this._markDirtyInTransaction(db, taskId)
    })()
  }

  // ============================================================================
  // Delete Operations
  // ============================================================================

  /**
   * Delete a task locally. If never uploaded (last_server_revision = 0),
   * just clean local data. If uploaded, mark for remote deletion.
   *
   * All operations run in a single SQLite transaction for atomicity.
   * Returns true if remote deletion is needed.
   */
  async deleteTask(taskId: string): Promise<{ needsRemoteDeletion: boolean }> {
    const dbService = this.ensureInitialized()
    const db = dbService.getDb()
    let needsRemoteDeletion = false

    db.transaction(() => {
      const state = dbService.getSyncTaskState(taskId)

      if (!state || state.last_server_revision === 0) {
        // Never uploaded - just clean locally
        dbService.deleteTaskChatData(taskId)
        if (state) {
          const now = Math.floor(Date.now() / 1000)
          db.prepare('UPDATE agent_chat_sync_task_state SET is_deleted = 1, pending_upload = 0, updated_at = ? WHERE task_id = ?').run(now, taskId)
        }
        needsRemoteDeletion = false
      } else {
        // Already uploaded - mark for remote deletion, delete local data
        dbService.deleteTaskChatData(taskId)
        const now = Math.floor(Date.now() / 1000)
        db.prepare('UPDATE agent_chat_sync_task_state SET is_deleted = 1, pending_upload = 0, updated_at = ? WHERE task_id = ?').run(now, taskId)
        needsRemoteDeletion = true
      }
    })()

    return { needsRemoteDeletion }
  }

  // ============================================================================
  // Remote Snapshot Application (NON-dirty path)
  // ============================================================================

  /**
   * Apply a remote snapshot. This is the non-dirty path:
   * - Replaces all 4 chat tables for the task
   * - Updates sync state (last_applied_hash, last_server_revision)
   * - Does NOT increment local_change_seq
   *
   * All operations run in a single SQLite transaction for atomicity.
   */
  applyRemoteSnapshot(taskId: string, tables: TaskSnapshotTables, serverRevision: number, payloadHash: string, payloadHashVersion: number): void {
    const dbService = this.ensureInitialized()
    const db = dbService.getDb()

    db.transaction(() => {
      // Import snapshot data (raw, no nested transaction)
      dbService._importTaskSnapshotRaw(taskId, tables)

      // Update sync state WITHOUT incrementing local_change_seq
      const now = Math.floor(Date.now() / 1000)
      const existing = db.prepare('SELECT task_id FROM agent_chat_sync_task_state WHERE task_id = ?').get(taskId)

      if (existing) {
        db.prepare(
          `UPDATE agent_chat_sync_task_state SET
            last_applied_hash = ?, last_applied_hash_version = ?,
            last_server_revision = ?, remote_deleted = 0,
            is_deleted = 0, pending_upload = 0,
            sync_blocked_reason = NULL, last_sync_status = ?, last_error = NULL, updated_at = ?
           WHERE task_id = ?`
        ).run(payloadHash, payloadHashVersion, serverRevision, 'synced', now, taskId)
      } else {
        db.prepare(
          `INSERT INTO agent_chat_sync_task_state
            (task_id, last_applied_hash, last_applied_hash_version,
             last_server_revision, pending_upload, is_deleted, remote_deleted,
             sync_blocked_reason, last_sync_status, last_error, updated_at)
           VALUES (?, ?, ?, ?, 0, 0, 0, NULL, ?, NULL, ?)`
        ).run(taskId, payloadHash, payloadHashVersion, serverRevision, 'synced', now)
      }
    })()
  }

  // ============================================================================
  // Snapshot Export
  // ============================================================================

  /**
   * Export the current task data as a snapshot JSON structure.
   */
  exportSnapshot(taskId: string): TaskSnapshot {
    const dbService = this.ensureInitialized()
    const tables = dbService.exportTaskSnapshot(taskId)

    return {
      task_id: taskId,
      schema_version: SCHEMA_VERSION,
      snapshot_type: 'full',
      tables,
      client_meta: {
        device_id: this.deviceId,
        platform: 'desktop',
        generated_at: Math.floor(Date.now() / 1000)
      }
    }
  }

  // ============================================================================
  // Background Cleanup for Remote-Deleted Tasks
  // ============================================================================

  /**
   * Clean up local chat data for tasks that have been remotely deleted.
   * Scans for remote_deleted = 1 AND is_deleted = 0, deletes local 4 tables,
   * and updates state to tombstone-only.
   */
  async cleanupRemoteDeletedTasks(): Promise<number> {
    const dbService = this.ensureInitialized()
    const tasks = dbService.getRemoteDeletedNotCleanedTasks()

    let cleaned = 0
    for (const task of tasks) {
      try {
        dbService.deleteTaskChatData(task.task_id)
        dbService.upsertSyncTaskState({
          task_id: task.task_id,
          is_deleted: 1,
          pending_upload: 0
        })
        cleaned++
      } catch (error) {
        logger.error('Failed to cleanup remote-deleted task', {
          taskId: task.task_id,
          error
        })
      }
    }

    if (cleaned > 0) {
      logger.info('Cleaned up remote-deleted tasks', { count: cleaned })
    }
    return cleaned
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  /**
   * Bootstrap sync state for existing tasks that don't have tracking rows.
   * Queries agent_task_metadata_v1 for all task_ids and creates
   * agent_chat_sync_task_state rows with pending_upload=1 for untracked ones.
   */
  private _bootstrapUntrackedTasks(dbService: ChatermDatabaseService): void {
    try {
      const db = dbService.getDb()
      const untrackedTasks = db
        .prepare(
          `SELECT m.task_id FROM agent_task_metadata_v1 m
           LEFT JOIN agent_chat_sync_task_state s ON m.task_id = s.task_id
           WHERE s.task_id IS NULL`
        )
        .all() as Array<{ task_id: string }>

      if (untrackedTasks.length === 0) return

      const now = Math.floor(Date.now() / 1000)
      const insertStmt = db.prepare(
        `INSERT OR IGNORE INTO agent_chat_sync_task_state
         (task_id, local_change_seq, acked_local_change_seq, pending_upload, updated_at)
         VALUES (?, 1, 0, 1, ?)`
      )

      db.transaction(() => {
        for (const task of untrackedTasks) {
          insertStmt.run(task.task_id, now)
        }
      })()

      logger.info('Bootstrapped sync state for untracked tasks', { count: untrackedTasks.length })
    } catch (error) {
      logger.error('Failed to bootstrap untracked tasks', { error })
    }
  }

  /**
   * Mark a task as dirty within an existing transaction.
   * Archived / remote-deleted / locally deleted tasks are intentionally excluded
   * from re-entering the upload queue.
   */
  private _markDirtyInTransaction(db: ReturnType<ChatermDatabaseService['getDb']>, taskId: string): void {
    const existing = db.prepare('SELECT local_change_seq FROM agent_chat_sync_task_state WHERE task_id = ?').get(taskId) as
      | { local_change_seq: number }
      | undefined

    const now = Math.floor(Date.now() / 1000)

    if (existing) {
      db.prepare(
        `UPDATE agent_chat_sync_task_state
         SET local_change_seq = local_change_seq + 1,
             pending_upload = 1,
             updated_at = ?
         WHERE task_id = ?
           AND remote_deleted = 0
           AND is_deleted = 0
           AND (sync_blocked_reason IS NULL OR sync_blocked_reason != 'archived')`
      ).run(now, taskId)
    } else {
      db.prepare(
        `INSERT INTO agent_chat_sync_task_state
         (task_id, local_change_seq, acked_local_change_seq, pending_upload, updated_at)
         VALUES (?, 1, 0, 1, ?)`
      ).run(taskId, now)
    }
  }

  /**
   * Reset the singleton (for testing)
   */
  static resetInstance(): void {
    ChatSnapshotStore.instance = null
  }
}
