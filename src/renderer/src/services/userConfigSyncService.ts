/**
 * User Config Sync Service - Renderer Process
 *
 * Uses the generic ConfigSyncManager with a user_config-specific adapter.
 * This service syncs the terminal/UI preferences whitelist fields.
 *
 * Lifecycle:
 *   - initialize(): called on login / dataSync enable
 *   - scheduleUpload(): called after local config change (saveConfig success)
 *   - reset(): called on account switch (clears all state)
 *   - stop(): called on dataSync disable (pauses sync, keeps persisted meta)
 */

import {
  sanitizeForSync,
  parseRemoteConfig,
  migrateRemoteConfig,
  applyRemoteConfig,
  buildDefaultUserConfig,
  getPlatformKey,
  isFlatShortcutConfig,
  isPlatformShortcuts,
  SUPPORTED_USER_CONFIG_SCHEMA_VERSION,
  type PlatformKey,
  type PlatformShortcuts,
  type SyncableUserConfig,
  userConfigStore
} from './userConfigStoreService'
import { ConfigSyncManager, type ConfigSyncAdapter, type ConfigSyncMeta } from './configSyncManager'
import { canonicalJSONStringify } from './syncJson'

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const PLATFORM_KEYS: PlatformKey[] = ['mac', 'windows', 'linux']

function clonePlatformShortcuts(shortcuts: PlatformShortcuts): PlatformShortcuts {
  const cloned: PlatformShortcuts = {}
  for (const platform of PLATFORM_KEYS) {
    const current = shortcuts[platform]
    if (isFlatShortcutConfig(current)) {
      cloned[platform] = { ...current }
    }
  }
  return cloned
}

const PLATFORM_SHORTCUTS_CACHE_KEY = 'platformShortcutsCache'

let cachedRemotePlatformShortcuts: PlatformShortcuts = {}

function setCachedPlatformShortcuts(shortcuts: PlatformShortcuts): void {
  cachedRemotePlatformShortcuts = clonePlatformShortcuts(shortcuts)
  // Persist to SQLite so cache survives restart
  window.api
    .kvMutate({
      action: 'set',
      key: PLATFORM_SHORTCUTS_CACHE_KEY,
      value: JSON.stringify(cachedRemotePlatformShortcuts)
    })
    .catch(() => {
      // Non-critical: sync still works with current platform only
    })
}

async function ensurePlatformShortcutsCache(): Promise<void> {
  if (Object.keys(cachedRemotePlatformShortcuts).length > 0) return
  try {
    // Priority 1: dedicated persisted cache (survives restart)
    const cacheResult = await window.api.kvGet({ key: PLATFORM_SHORTCUTS_CACHE_KEY })
    if (cacheResult?.value) {
      const cached = JSON.parse(cacheResult.value)
      if (isPlatformShortcuts(cached)) {
        cachedRemotePlatformShortcuts = clonePlatformShortcuts(cached)
        return
      }
    }
    // Priority 2: fallback to lastSyncedPayload in meta
    const metaResult = await window.api.kvGet({ key: 'userConfigSyncMeta' })
    if (!metaResult?.value) return
    const meta = JSON.parse(metaResult.value) as { lastSyncedPayload?: string }
    if (!meta.lastSyncedPayload || typeof meta.lastSyncedPayload !== 'string') return

    const payload = JSON.parse(meta.lastSyncedPayload)
    if (!isPlainObject(payload) || !('shortcuts' in payload)) return

    const shortcuts = (payload as Record<string, unknown>).shortcuts
    if (isPlatformShortcuts(shortcuts)) {
      setCachedPlatformShortcuts(shortcuts)
      return
    }
    if (isFlatShortcutConfig(shortcuts)) {
      setCachedPlatformShortcuts({ [getPlatformKey()]: shortcuts })
    }
  } catch {
    // Ignore cache restoration failures; sync still works with current platform only.
  }
}

function normalizeShortcutsForUpload(shortcuts: unknown): PlatformShortcuts | null {
  if (isPlatformShortcuts(shortcuts)) {
    const normalized = clonePlatformShortcuts(shortcuts)
    setCachedPlatformShortcuts(normalized)
    return normalized
  }

  if (isFlatShortcutConfig(shortcuts)) {
    const merged = clonePlatformShortcuts(cachedRemotePlatformShortcuts)
    merged[getPlatformKey()] = { ...shortcuts }
    setCachedPlatformShortcuts(merged)
    return merged
  }

  return null
}

function preprocessRemotePayload(payload: Record<string, unknown>): Record<string, unknown> {
  const processed = { ...payload }
  const shortcuts = processed.shortcuts

  if (isPlatformShortcuts(shortcuts)) {
    setCachedPlatformShortcuts(shortcuts)
    const current = shortcuts[getPlatformKey()]
    if (isFlatShortcutConfig(current)) {
      processed.shortcuts = { ...current }
    } else {
      delete processed.shortcuts
    }
    return processed
  }

  if (isFlatShortcutConfig(shortcuts)) {
    normalizeShortcutsForUpload(shortcuts)
    processed.shortcuts = { ...shortcuts }
  }

  return processed
}

function buildCanonicalSyncPayload(data: Record<string, unknown>): string {
  const payload: Record<string, unknown> = { ...data }
  if ('shortcuts' in payload) {
    const normalized = normalizeShortcutsForUpload(payload.shortcuts)
    if (normalized) {
      payload.shortcuts = normalized
    }
  }
  return canonicalJSONStringify(payload)
}

// ---------------------------------------------------------------------------
// Adapter for user_config
// ---------------------------------------------------------------------------

const userConfigAdapter: ConfigSyncAdapter<SyncableUserConfig> = {
  configType: 'user_config',
  metaKey: 'userConfigSyncMeta',
  schemaVersion: SUPPORTED_USER_CONFIG_SCHEMA_VERSION,

  async readLocal(): Promise<SyncableUserConfig> {
    await ensurePlatformShortcutsCache()
    const fullConfig = await userConfigStore.getConfig()
    return sanitizeForSync(fullConfig)
  },

  serializeForUpload(data: SyncableUserConfig): string {
    return buildCanonicalSyncPayload(data as Record<string, unknown>)
  },

  parseRemote(payload: unknown): SyncableUserConfig | null {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null
    const preprocessed = preprocessRemotePayload(payload as Record<string, unknown>)
    const parsed = parseRemoteConfig(preprocessed)
    if (Object.keys(parsed).length === 0) return null
    return parsed as SyncableUserConfig
  },

  migrateRemote(payload: unknown, fromVersion: number, toVersion: number): unknown | null {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null
    return migrateRemoteConfig(payload as Record<string, unknown>, fromVersion, toVersion)
  },

  async applyRemote(data: SyncableUserConfig, meta?: ConfigSyncMeta, metaKey?: string): Promise<void> {
    // applyRemoteConfig handles local userConfig apply + atomic meta write.
    await applyRemoteConfig(data, meta, metaKey)
  },

  getDefault(): SyncableUserConfig {
    return sanitizeForSync(buildDefaultUserConfig())
  },

  cacheRemotePlatformData(serverConfig: string): void {
    try {
      const parsed = typeof serverConfig === 'string' ? JSON.parse(serverConfig) : serverConfig
      if (!isPlainObject(parsed) || !('shortcuts' in parsed)) return
      const shortcuts = (parsed as Record<string, unknown>).shortcuts
      if (isPlatformShortcuts(shortcuts)) {
        setCachedPlatformShortcuts(shortcuts)
      }
    } catch {
      // Non-critical: cache miss only affects cross-platform shortcuts
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton instance
// ---------------------------------------------------------------------------

class UserConfigSyncService {
  private static instance: UserConfigSyncService
  private manager = new ConfigSyncManager(userConfigAdapter)

  static getInstance(): UserConfigSyncService {
    if (!UserConfigSyncService.instance) {
      UserConfigSyncService.instance = new UserConfigSyncService()
    }
    return UserConfigSyncService.instance
  }

  initialize(): Promise<void> {
    return this.manager.initialize()
  }

  scheduleUpload(): void {
    this.manager.scheduleUpload()
  }

  reset(): void {
    cachedRemotePlatformShortcuts = {}
    window.api.kvMutate({ action: 'delete', key: PLATFORM_SHORTCUTS_CACHE_KEY }).catch(() => {})
    this.manager.reset()
  }

  stop(): void {
    this.manager.stop()
  }
}

export const userConfigSyncService = UserConfigSyncService.getInstance()
