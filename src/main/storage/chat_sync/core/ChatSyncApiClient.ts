/**
 * ChatSyncApiClient - HTTP client for Chat Sync V2 server API
 *
 * Communicates with the server endpoints:
 * - POST /v1/chat-sync/tasks/{task_id}/snapshot (Upsert)
 * - DELETE /v1/chat-sync/tasks/{task_id} (Delete)
 * - GET /v1/chat-sync/tasks/{task_id}/snapshot (Get)
 * - GET /v1/chat-sync/changes?since_global_revision={x}&limit={n}
 * - GET /v1/chat-sync/tasks?after_task_id={x}&limit={n}
 * - GET /v1/chat-sync/non-active-task-states?after_task_id={x}&limit={n}
 */

import type {
  UpsertTaskSnapshotRequest,
  UpsertTaskSnapshotReply,
  DeleteTaskSnapshotReply,
  GetTaskSnapshotReply,
  GetTaskChangesReply,
  ListTaskSnapshotsReply,
  ListNonActiveTaskStatesReply
} from '../models/ChatSyncTypes'
import { ChatSyncApiError } from '../models/ChatSyncTypes'

export interface ChatSyncApiClientOptions {
  baseUrl: string
  getAuthToken: () => Promise<string | null>
  deviceId: string
  platform: string
}

export class ChatSyncApiClient {
  private baseUrl: string
  private getAuthToken: () => Promise<string | null>
  private deviceId: string
  private platform: string

  constructor(options: ChatSyncApiClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '')
    this.getAuthToken = options.getAuthToken
    this.deviceId = options.deviceId
    this.platform = options.platform
  }

  /**
   * Upload or update a task snapshot.
   */
  async upsertTaskSnapshot(taskId: string, snapshotJson: string): Promise<UpsertTaskSnapshotReply> {
    const body: UpsertTaskSnapshotRequest = {
      snapshot_json: snapshotJson,
      device_id: this.deviceId,
      platform: this.platform
    }

    const response = await this._request<UpsertTaskSnapshotReply>('POST', `/v1/chat-sync/tasks/${encodeURIComponent(taskId)}/snapshot`, body)

    // Server returns business errors (TASK_SNAPSHOT_TOO_LARGE, TASK_DELETED, TASK_ARCHIVED)
    // inside a 200 response body via error_code field.
    if (response.error_code) {
      throw new ChatSyncApiError(response.error_code as any, `Server returned error_code: ${response.error_code}`, {
        task_deleted: response.task_deleted,
        max_bytes: response.max_bytes,
        actual_bytes: response.actual_bytes,
        retryable: response.retryable
      })
    }

    return response
  }

  /**
   * Delete a task snapshot (for already-uploaded tasks).
   */
  async deleteTaskSnapshot(taskId: string): Promise<DeleteTaskSnapshotReply> {
    const params = new URLSearchParams({
      device_id: this.deviceId,
      platform: this.platform
    })

    return this._request<DeleteTaskSnapshotReply>('DELETE', `/v1/chat-sync/tasks/${encodeURIComponent(taskId)}?${params.toString()}`)
  }

  /**
   * Get the full snapshot for a specific task.
   */
  async getTaskSnapshot(taskId: string, updatedAtHint?: string): Promise<GetTaskSnapshotReply> {
    let path = `/v1/chat-sync/tasks/${encodeURIComponent(taskId)}/snapshot`
    if (updatedAtHint) {
      const params = new URLSearchParams({ updated_at_hint: updatedAtHint })
      path += `?${params.toString()}`
    }
    return this._request<GetTaskSnapshotReply>('GET', path)
  }

  /**
   * Get task changes since a given global revision.
   * Does NOT pass device_id - server must return all changes including from this device.
   */
  async getTaskChanges(sinceGlobalRevision: number, limit: number = 100): Promise<GetTaskChangesReply> {
    const params = new URLSearchParams({
      since_global_revision: String(sinceGlobalRevision),
      limit: String(limit)
    })

    return this._request<GetTaskChangesReply>('GET', `/v1/chat-sync/changes?${params.toString()}`)
  }

  /**
   * List task snapshot summaries (for full sync fallback).
   * Does NOT return snapshot_json, only metadata.
   */
  async listTaskSnapshots(afterTaskId: string = '', limit: number = 200): Promise<ListTaskSnapshotsReply> {
    const params = new URLSearchParams({ limit: String(limit) })
    if (afterTaskId) {
      params.set('after_task_id', afterTaskId)
    }

    return this._request<ListTaskSnapshotsReply>('GET', `/v1/chat-sync/tasks?${params.toString()}`)
  }

  /**
   * List explicit archived/deleted task states for full sync reconciliation.
   */
  async listNonActiveTaskStates(afterTaskId: string = '', limit: number = 200): Promise<ListNonActiveTaskStatesReply> {
    const params = new URLSearchParams({ limit: String(limit) })
    if (afterTaskId) {
      params.set('after_task_id', afterTaskId)
    }

    return this._request<ListNonActiveTaskStatesReply>('GET', `/v1/chat-sync/non-active-task-states?${params.toString()}`)
  }

  // ============================================================================
  // Private HTTP Helper
  // ============================================================================

  private static readonly REQUEST_TIMEOUT_MS = 30_000
  private static readonly MAX_RETRIES = 2

  private async _request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const token = await this.getAuthToken()
    if (!token) {
      throw new ChatSyncApiError('UNAUTHORIZED', 'No auth token available')
    }

    const url = `${this.baseUrl}${path}`
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    }

    const fetchOptions: RequestInit = {
      method,
      headers
    }

    if (body) {
      fetchOptions.body = JSON.stringify(body)
    }

    let lastError: Error | null = null
    for (let attempt = 0; attempt <= ChatSyncApiClient.MAX_RETRIES; attempt++) {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), ChatSyncApiClient.REQUEST_TIMEOUT_MS)

      try {
        const response = await fetch(url, { ...fetchOptions, signal: controller.signal })
        clearTimeout(timeoutId)
        const responseText = await response.text()

        if (!response.ok) {
          return this._handleErrorResponse(response.status, responseText)
        }

        try {
          const wrapped = JSON.parse(responseText)
          // Server wraps all responses in { code, data, ts } via ResponseEncoder
          if (wrapped && typeof wrapped === 'object' && 'data' in wrapped) {
            return wrapped.data as T
          }
          return wrapped as T
        } catch {
          throw new ChatSyncApiError('UNKNOWN', `Invalid JSON response from server: ${responseText}`)
        }
      } catch (error) {
        clearTimeout(timeoutId)
        if (error instanceof ChatSyncApiError) {
          throw error
        }
        lastError = error as Error
        // Only retry on network/timeout errors, not on the last attempt
        if (attempt < ChatSyncApiClient.MAX_RETRIES) {
          continue
        }
        throw new ChatSyncApiError('NETWORK_ERROR', `Network request failed: ${lastError.message}`)
      }
    }

    throw new ChatSyncApiError('NETWORK_ERROR', `Network request failed: ${lastError?.message}`)
  }

  private _handleErrorResponse(status: number, responseText: string): never {
    let errorData: any = {}
    try {
      const parsed = JSON.parse(responseText)
      // Server wraps error responses in { code, data, ts } as well
      errorData = parsed && typeof parsed === 'object' && 'data' in parsed ? parsed.data : parsed
    } catch {
      // Response is not JSON
    }

    if (status === 401 || status === 403) {
      throw new ChatSyncApiError('UNAUTHORIZED', 'Authentication failed')
    }

    // Check for business-level error codes in response body
    const reason = errorData?.reason || errorData?.code || ''

    if (reason === 'TASK_DELETED' || errorData?.task_deleted === true) {
      throw new ChatSyncApiError('TASK_DELETED', 'Task has been deleted on server', errorData)
    }

    if (reason === 'TASK_ARCHIVED') {
      throw new ChatSyncApiError('TASK_ARCHIVED', 'Task has been archived on server', errorData)
    }

    if (reason === 'TASK_SNAPSHOT_TOO_LARGE') {
      throw new ChatSyncApiError('TASK_SNAPSHOT_TOO_LARGE', 'Task snapshot exceeds 10MiB limit', {
        max_bytes: errorData?.max_bytes,
        actual_bytes: errorData?.actual_bytes,
        retryable: false
      })
    }

    throw new ChatSyncApiError('UNKNOWN', `Server error ${status}: ${responseText}`, errorData)
  }
}
