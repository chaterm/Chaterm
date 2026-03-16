/**
 * Chat Sync V2 - Type Definitions
 *
 * Defines all types used by the desktop chat sync module including
 * snapshot structures, sync state, API client types, and engine types.
 */

// ============================================================================
// Snapshot JSON Structure (Section 2.2 of the plan)
// ============================================================================

export interface TaskSnapshot {
  task_id: string
  schema_version: number
  snapshot_type: 'full'
  tables: TaskSnapshotTables
  client_meta: ClientMeta
}

export interface TaskSnapshotTables {
  agent_api_conversation_history_v1: Record<string, unknown>[]
  agent_ui_messages_v1: Record<string, unknown>[]
  agent_task_metadata_v1: Record<string, unknown>[]
  agent_context_history_v1: Record<string, unknown>[]
}

export interface ClientMeta {
  device_id: string
  platform: 'desktop' | 'mobile'
  generated_at: number
}

// ============================================================================
// Local Sync State Tables (Section 2.6 of the plan)
// ============================================================================

export interface ChatSyncTaskState {
  task_id: string
  local_change_seq: number
  acked_local_change_seq: number
  last_uploaded_hash: string | null
  last_uploaded_hash_version: number
  last_applied_hash: string | null
  last_applied_hash_version: number
  last_server_revision: number
  pending_upload: number
  is_deleted: number
  remote_deleted: number
  sync_blocked_reason: string | null
  last_sync_status: string | null
  last_error: string | null
  updated_at: number
}

// ============================================================================
// API Client Types (Section 3 of the plan)
// ============================================================================

export interface UpsertTaskSnapshotRequest {
  snapshot_json: string
  device_id: string
  platform: string
}

export interface UpsertTaskSnapshotReply {
  task_id: string
  server_revision: number
  global_revision: number
  payload_hash: string
  payload_hash_version: number
  op: string
  deduplicated: boolean
  task_deleted: boolean
  error_code: string
  max_bytes: number
  actual_bytes: number
  retryable: boolean
}

export interface DeleteTaskSnapshotReply {
  task_id: string
  server_revision: number
  global_revision: number
  op: string
  deduplicated: boolean
  task_deleted: boolean
}

export interface GetTaskSnapshotReply {
  task_id: string
  server_revision: number
  payload_hash: string
  payload_hash_version: number
  snapshot_json: string
}

export interface TaskChange {
  task_id: string
  server_revision: number
  global_revision: number
  op: 'upsert' | 'delete'
  payload_hash: string
  payload_hash_version: number
  source_device_id: string
  updated_at: string
}

export interface GetTaskChangesReply {
  changes: TaskChange[]
  last_global_revision: number
  has_more: boolean
  cursor_expired: boolean
  oldest_available_global_revision: number
}

export interface ListTaskSnapshotItem {
  task_id: string
  server_revision: number
  payload_hash: string
  payload_hash_version: number
  updated_at: string
}

export interface ListTaskSnapshotsReply {
  items: ListTaskSnapshotItem[]
  next_after_task_id: string
  limit: number
  has_more: boolean
  last_global_revision: number
  authoritative: boolean
}

export interface NonActiveTaskStateItem {
  task_id: string
  state: 'archived' | 'deleted'
  state_revision: number
  updated_at: string
}

export interface ListNonActiveTaskStatesReply {
  items: NonActiveTaskStateItem[]
  next_after_task_id: string
  limit: number
  has_more: boolean
  last_global_revision: number
  authoritative: boolean
}

// ============================================================================
// API Error Types
// ============================================================================

export type ChatSyncApiErrorCode =
  | 'TASK_DELETED'
  | 'TASK_ARCHIVED'
  | 'TASK_SNAPSHOT_TOO_LARGE'
  | 'CURSOR_EXPIRED'
  | 'UNAUTHORIZED'
  | 'NETWORK_ERROR'
  | 'UNKNOWN'

export class ChatSyncApiError extends Error {
  code: ChatSyncApiErrorCode
  details?: Record<string, unknown>

  constructor(code: ChatSyncApiErrorCode, message: string, details?: Record<string, unknown>) {
    super(message)
    this.name = 'ChatSyncApiError'
    this.code = code
    this.details = details
  }
}

// ============================================================================
// Sync Engine Types
// ============================================================================

export type SyncStatus = 'idle' | 'syncing' | 'error' | 'disabled'

export interface SyncEngineStatus {
  status: SyncStatus
  lastSyncAt: number | null
  lastError: string | null
  pendingUploadCount: number
}

export interface UploadCandidate {
  taskId: string
  candidateLocalChangeSeq: number
}

// ============================================================================
// Scheduler Types
// ============================================================================

export interface ChatSyncSchedulerOptions {
  pollIntervalMs: number
  enabled: boolean
}

export const DEFAULT_POLL_INTERVAL_MS = 300_000
export const SCHEMA_VERSION = 2
export const MAX_SNAPSHOT_BYTES = 10 * 1024 * 1024
