/**
 * ConfigSyncManager - Generic config sync engine for all config_type values.
 *
 * Encapsulates the full protection mechanism set:
 *   1. sessionGeneration - prevents stale async responses
 *   2. debounce - aggregates rapid local changes
 *   3. single-flight - at most one inflight upload at a time
 *   4. consecutive failure degradation - stops retrying after MAX failures
 *   5. schema version checks - blocks incompatible remote configs
 *   6. dirty tracking - ensures pending changes are eventually uploaded
 *   7. meta persistence - survives page refresh via SQLite KV store
 *   8. AbortController signal - propagated to HTTP layer for real cancellation
 *
 * Usage: Each config_type provides a ConfigSyncAdapter<T> and instantiates
 * ConfigSyncManager with it. The manager handles the rest.
 */

import { getUserTermConfig, updateUserTermConfig } from '@/api/sync/sync'

const logger = createRendererLogger('service.configSyncManager')

// ---------------------------------------------------------------------------
// Adapter interface - each config_type implements this
// ---------------------------------------------------------------------------

export interface ConfigSyncAdapter<T> {
  /** The config_type string sent to server */
  readonly configType: string

  /** SQLite KV key for storing sync metadata */
  readonly metaKey: string

  /** Current schema version */
  readonly schemaVersion: number

  /** Read the current local config snapshot */
  readLocal(): Promise<T>

  /**
   * Serialize the local config for upload (must be deterministic).
   * Returns a canonical JSON string suitable for comparison and PUT body.
   */
  serializeForUpload(data: T): string

  /**
   * Parse and validate a remote config payload.
   * Returns null if the payload is invalid / should be rejected.
   */
  parseRemote(payload: unknown): T | null

  /**
   * Optional: migrate remote payload from an older schema to current schema.
   * Return null when migration cannot be completed safely.
   */
  migrateRemote?(payload: unknown, fromVersion: number, toVersion: number): unknown | null

  /**
   * Apply a validated remote config locally.
   * Responsible for writing to persistent storage and refreshing UI state.
   * When meta + metaKey are provided, the implementation MUST write both
   * config and meta inside the same SQLite transaction to avoid crash windows.
   */
  applyRemote(data: T, meta?: ConfigSyncMeta, metaKey?: string): Promise<void>

  /**
   * Optional: Return a default config for first-sync comparison.
   * If the local config equals the default, no bootstrap upload is needed.
   * Return null to skip this optimization (always bootstrap upload).
   */
  getDefault?(): T | null

  /**
   * Optional: Cache cross-platform data from remote config without applying it.
   * Called when local wins on first sync so other-platform data is not lost.
   */
  cacheRemotePlatformData?(serverConfig: string): void
}

// ---------------------------------------------------------------------------
// Sync metadata (persisted in SQLite KV per config_type)
// ---------------------------------------------------------------------------

export interface ConfigSyncMeta {
  schemaVersion: number
  lastPulledAt: number
  lastPushedAt: number
  lastSyncedPayload: string
  lastSyncedHash: string
  lastRemoteUpdatedAt: number
  lastRemoteSchemaVersion: number
  schemaBlocked: boolean
  dirty: boolean
}

export function buildDefaultConfigSyncMeta(schemaVersion: number): ConfigSyncMeta {
  return {
    schemaVersion,
    lastPulledAt: 0,
    lastPushedAt: 0,
    lastSyncedPayload: '',
    lastSyncedHash: '',
    lastRemoteUpdatedAt: 0,
    lastRemoteSchemaVersion: 0,
    schemaBlocked: false,
    dirty: false
  }
}

/**
 * Mark sync metadata dirty for a specific config type.
 *
 * This is a lightweight helper for local write paths that are not yet fully
 * unified behind a single storage boundary.
 */
export async function markSyncMetaDirty(metaKey: string, schemaVersion: number): Promise<void> {
  try {
    const current = await window.api.kvGet({ key: metaKey })
    const meta = current?.value ? (JSON.parse(current.value) as ConfigSyncMeta) : buildDefaultConfigSyncMeta(schemaVersion)

    if (meta.dirty && meta.schemaVersion === schemaVersion) {
      return
    }

    await window.api.kvMutate({
      action: 'set',
      key: metaKey,
      value: JSON.stringify({
        ...meta,
        schemaVersion,
        dirty: true
      } satisfies ConfigSyncMeta)
    })
  } catch (error) {
    logger.error(`Failed to mark sync meta dirty: ${metaKey}`, { error })
  }
}

// ---------------------------------------------------------------------------
// ConfigSyncManager
// ---------------------------------------------------------------------------

export class ConfigSyncManager<T> {
  // === Pure in-memory state ===
  private sessionGeneration: number = 0
  private consecutiveFailureCount: number = 0
  private debounceTimer: ReturnType<typeof setTimeout> | null = null
  private inflightController: AbortController | null = null
  private schemaBlocked: boolean = false
  private stopped: boolean = true // starts stopped; initialize() activates

  // === Constants ===
  private readonly REQUEST_TIMEOUT = 15_000
  private readonly DEBOUNCE_DELAY = 1_000
  private readonly MAX_CONSECUTIVE_FAILURES = 3

  constructor(private readonly adapter: ConfigSyncAdapter<T>) {}

  // ---------------------------------------------------------------------------
  // Initialize - startup pull
  // ---------------------------------------------------------------------------

  async initialize(): Promise<void> {
    try {
      this.stopped = false
      this.sessionGeneration++
      const gen = this.sessionGeneration
      const configType = this.adapter.configType
      logger.info(`[${configType}] Initializing sync`, { generation: gen })

      // Reset failure counter on each init
      this.consecutiveFailureCount = 0

      // Read local config and meta
      const localData = await this.adapter.readLocal()
      let meta = await this.readMeta()
      const isFirstSync = !meta
      if (isFirstSync) {
        meta = buildDefaultConfigSyncMeta(this.adapter.schemaVersion)
        logger.info(`[${configType}] No sync meta found, treating as first-time sync`)
      }

      const localPayload = this.adapter.serializeForUpload(localData)

      // Detect local drift
      if (meta && !meta.dirty && meta.lastSyncedPayload && meta.lastSyncedPayload !== localPayload) {
        logger.warn(`[${configType}] Detected local drift, marking dirty`)
        meta.dirty = true
        await this.writeMeta(meta)
      }

      // Fetch remote
      let remoteData: any = null
      try {
        remoteData = await this.fetchWithTimeout((signal) => getUserTermConfig({ configType }, { signal }), gen)
      } catch (err: any) {
        if (err?.name === 'AbortError' || err?.message === 'STALE_SESSION') {
          return
        }
        logger.error(`[${configType}] Failed to fetch remote config`, { error: err })
        return
      }

      if (gen !== this.sessionGeneration) return

      // Server has no config (field missing or empty string)
      const serverConfig = remoteData?.data?.config
      const serverHasConfig = serverConfig != null && typeof serverConfig === 'string' && serverConfig.length > 0

      if (!serverHasConfig) {
        const defaultData = this.adapter.getDefault?.() ?? null
        const localIsDefault = defaultData !== null && localPayload === this.adapter.serializeForUpload(defaultData)

        if (localIsDefault) {
          meta!.dirty = false
          await this.writeMeta(meta!)
        } else {
          meta!.dirty = true
          await this.writeMeta(meta!)
          this.scheduleUpload()
        }
        return
      }

      // Schema version check
      const remoteSchemaVersion = remoteData?.data?.schemaVersion ?? 1
      if (remoteSchemaVersion > this.adapter.schemaVersion) {
        logger.warn(`[${configType}] Remote schema version too high`, {
          remote: remoteSchemaVersion,
          supported: this.adapter.schemaVersion
        })
        this.schemaBlocked = true
        meta!.schemaBlocked = true
        await this.writeMeta(meta!)
        return
      }

      this.schemaBlocked = false
      meta!.schemaBlocked = false

      // First sync + local not default → local wins
      if (isFirstSync) {
        const defaultData = this.adapter.getDefault?.() ?? null
        const localIsDefault = defaultData !== null && localPayload === this.adapter.serializeForUpload(defaultData)
        if (!localIsDefault) {
          logger.info(`[${configType}] First sync with custom local, local wins`)
          // Cache cross-platform data from remote before overwriting
          if (this.adapter.cacheRemotePlatformData && serverConfig) {
            this.adapter.cacheRemotePlatformData(serverConfig)
          }
          meta!.dirty = true
          await this.writeMeta(meta!)
          this.scheduleUpload()
          return
        }
      }

      // Dirty → upload local
      if (meta!.dirty) {
        logger.info(`[${configType}] Local is dirty, scheduling upload`)
        this.scheduleUpload()
        return
      }

      // Apply remote config
      const freshMeta = await this.readMeta()
      if (freshMeta && freshMeta.dirty) {
        this.scheduleUpload()
        return
      }
      if (gen !== this.sessionGeneration) return

      // Parse the remote config string
      let parsedConfig: unknown
      try {
        parsedConfig = typeof serverConfig === 'string' ? JSON.parse(serverConfig) : serverConfig
      } catch {
        logger.warn(`[${configType}] Failed to parse remote config JSON`)
        return
      }

      let payloadForValidation = parsedConfig
      if (remoteSchemaVersion < this.adapter.schemaVersion) {
        if (this.adapter.migrateRemote) {
          const migrated = this.adapter.migrateRemote(parsedConfig, remoteSchemaVersion, this.adapter.schemaVersion)
          if (migrated === null) {
            logger.warn(`[${configType}] Failed to migrate remote config`, {
              remote: remoteSchemaVersion,
              supported: this.adapter.schemaVersion
            })
            return
          }
          payloadForValidation = migrated
          logger.info(`[${configType}] Remote config migrated`, {
            from: remoteSchemaVersion,
            to: this.adapter.schemaVersion
          })
        } else {
          logger.info(`[${configType}] Remote schema older than supported, applying compatible fields only`, {
            remote: remoteSchemaVersion,
            supported: this.adapter.schemaVersion
          })
        }
      }

      const validated = this.adapter.parseRemote(payloadForValidation)
      if (validated === null) {
        logger.warn(`[${configType}] Remote config failed validation, skipping apply`)
        return
      }

      // Build the post-apply meta BEFORE calling applyRemote so it can be
      // written atomically with the config inside the same SQLite transaction.
      const appliedMeta: ConfigSyncMeta = {
        ...meta!,
        lastPulledAt: Date.now(),
        lastRemoteUpdatedAt: remoteData?.data?.updatedAt ?? 0,
        lastRemoteSchemaVersion: remoteSchemaVersion,
        lastSyncedHash: remoteData?.data?.configHash ?? '',
        lastSyncedPayload: this.adapter.serializeForUpload(validated),
        schemaBlocked: false,
        dirty: false
      }

      await this.adapter.applyRemote(validated, appliedMeta, this.adapter.metaKey)

      logger.info(`[${configType}] Sync initialization completed`)
    } catch (error) {
      logger.error(`[${this.adapter.configType}] Sync initialization failed`, { error })
    }
  }

  // ---------------------------------------------------------------------------
  // Schedule upload (debounced)
  // ---------------------------------------------------------------------------

  scheduleUpload(): void {
    if (this.stopped) {
      return
    }
    if (this.schemaBlocked) {
      logger.warn(`[${this.adapter.configType}] Upload skipped: schema blocked`)
      return
    }
    if (this.consecutiveFailureCount >= this.MAX_CONSECUTIVE_FAILURES) {
      logger.warn(`[${this.adapter.configType}] Upload skipped: failure limit reached`)
      return
    }
    this.clearDebounce()
    this.debounceTimer = setTimeout(() => this.doUpload(), this.DEBOUNCE_DELAY)
  }

  // ---------------------------------------------------------------------------
  // Execute upload (single-flight)
  // ---------------------------------------------------------------------------

  private async doUpload(): Promise<void> {
    if (this.stopped) return
    if (this.inflightController) {
      logger.info(`[${this.adapter.configType}] Upload skipped: already in flight`)
      return
    }

    const configType = this.adapter.configType

    try {
      const localData = await this.adapter.readLocal()
      const payload = this.adapter.serializeForUpload(localData)

      // Compare with last synced payload
      const meta = await this.readMeta()
      if (meta && payload === meta.lastSyncedPayload) {
        if (meta.dirty) {
          meta.dirty = false
          await this.writeMeta(meta)
        }
        return
      }

      const gen = this.sessionGeneration

      // Create AbortController
      this.inflightController = new AbortController()
      const signal = this.inflightController.signal
      const timeoutId = setTimeout(() => this.inflightController?.abort(), this.REQUEST_TIMEOUT)

      let response: any
      try {
        response = await updateUserTermConfig(
          {
            schemaVersion: this.adapter.schemaVersion,
            config: payload,
            configType
          },
          { signal }
        )
      } finally {
        clearTimeout(timeoutId)
        this.inflightController = null
      }

      // Verify generation
      if (gen !== this.sessionGeneration) return

      // Re-read and compare
      const freshData = await this.adapter.readLocal()
      const freshMeta = await this.readMeta()
      if (!freshMeta) return

      const currentPayload = this.adapter.serializeForUpload(freshData)
      if (currentPayload === payload) {
        freshMeta.lastSyncedPayload = payload
        freshMeta.lastSyncedHash = response?.data?.configHash ?? ''
        freshMeta.lastPushedAt = Date.now()
        freshMeta.lastRemoteUpdatedAt = response?.data?.updatedAt ?? 0
        freshMeta.lastRemoteSchemaVersion = response?.data?.schemaVersion ?? this.adapter.schemaVersion
        freshMeta.dirty = false
        freshMeta.schemaBlocked = false
        await this.writeMeta(freshMeta)
        this.consecutiveFailureCount = 0
        logger.info(`[${configType}] Upload succeeded`)
      } else {
        freshMeta.dirty = true
        await this.writeMeta(freshMeta)
        this.scheduleUpload()
      }
    } catch (error: any) {
      this.inflightController = null
      if (error?.message === 'STALE_SESSION') return

      logger.error(`[${configType}] Upload failed`, { error })

      try {
        const meta = await this.readMeta()
        if (meta && !meta.dirty) {
          meta.dirty = true
          await this.writeMeta(meta)
        }
      } catch (metaErr) {
        logger.error(`[${configType}] Failed to update meta after upload failure`, { error: metaErr })
      }

      this.consecutiveFailureCount++
    }
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  reset(): void {
    this.stopped = true
    this.sessionGeneration++
    this.abortInflight()
    this.clearDebounce()
    this.consecutiveFailureCount = 0
    this.schemaBlocked = false
    logger.info(`[${this.adapter.configType}] Sync reset (account switch)`)
  }

  stop(): void {
    this.stopped = true
    this.sessionGeneration++
    this.abortInflight()
    this.clearDebounce()
    this.consecutiveFailureCount = 0
    logger.info(`[${this.adapter.configType}] Sync stopped (dataSync disabled)`)
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private abortInflight(): void {
    if (this.inflightController) {
      this.inflightController.abort()
      this.inflightController = null
    }
  }

  private clearDebounce(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
      this.debounceTimer = null
    }
  }

  private async readMeta(): Promise<ConfigSyncMeta | null> {
    try {
      const result = await window.api.kvGet({ key: this.adapter.metaKey })
      if (result?.value) {
        return JSON.parse(result.value) as ConfigSyncMeta
      }
      return null
    } catch (error) {
      logger.error(`[${this.adapter.configType}] Failed to read sync meta`, { error })
      return null
    }
  }

  private async writeMeta(meta: ConfigSyncMeta): Promise<void> {
    try {
      await window.api.kvMutate({
        action: 'set',
        key: this.adapter.metaKey,
        value: JSON.stringify(meta)
      })
    } catch (error) {
      logger.error(`[${this.adapter.configType}] Failed to write sync meta`, { error })
    }
  }

  private async fetchWithTimeout<R>(apiFn: (signal: AbortSignal) => Promise<R>, gen: number): Promise<R> {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), this.REQUEST_TIMEOUT)

    try {
      const result = await apiFn(controller.signal)
      if (gen !== this.sessionGeneration) {
        throw new Error('STALE_SESSION')
      }
      return result
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        throw new DOMException('Request timeout', 'AbortError')
      }
      throw err
    } finally {
      clearTimeout(timeoutId)
    }
  }
}
