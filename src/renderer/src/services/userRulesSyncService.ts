/**
 * User Rules Sync Service
 *
 * Uses the generic ConfigSyncManager with a user_rules-specific adapter.
 * Syncs user-defined instruction rules (array of {id, content, enabled}).
 */

import { ConfigSyncManager, type ConfigSyncAdapter, type ConfigSyncMeta } from './configSyncManager'

const logger = createRendererLogger('service.userRulesSync')

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface UserRule {
  id: string
  content: string
  enabled: boolean
}

// ---------------------------------------------------------------------------
// Validators
// ---------------------------------------------------------------------------

function validateUserRules(payload: unknown): UserRule[] | null {
  if (!Array.isArray(payload)) return null
  // Empty array is valid - means user cleared all rules
  if (payload.length === 0) return []
  const valid = payload
    .filter((r: any) => typeof r === 'object' && r !== null && typeof r.id === 'string' && typeof r.content === 'string')
    .map((r: any) => ({
      id: r.id,
      content: r.content,
      enabled: r.enabled !== undefined ? Boolean(r.enabled) : true
    }))
  return valid
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

const userRulesAdapter: ConfigSyncAdapter<UserRule[]> = {
  configType: 'user_rules',
  metaKey: 'userRulesSyncMeta',
  schemaVersion: 1,

  async readLocal(): Promise<UserRule[]> {
    try {
      const { getGlobalState } = await import('@renderer/agent/storage/state')
      const saved = await getGlobalState('userRules')
      if (saved && Array.isArray(saved)) {
        return saved
          .filter((r: any) => typeof r === 'object' && r !== null && typeof r.content === 'string')
          .map((r: any) => ({
            id: r.id || '',
            content: r.content,
            enabled: r.enabled !== undefined ? Boolean(r.enabled) : true
          }))
      }
    } catch {
      // fall through
    }
    return []
  },

  serializeForUpload(data: UserRule[]): string {
    // Sort rules by id for deterministic comparison
    const sorted = [...data]
      .filter((r) => r.content.trim() !== '')
      .map((r) => ({ content: r.content, enabled: r.enabled, id: r.id }))
      .sort((a, b) => a.id.localeCompare(b.id))
    return JSON.stringify(sorted)
  },

  parseRemote(payload: unknown): UserRule[] | null {
    return validateUserRules(payload)
  },

  async applyRemote(data: UserRule[], meta?: ConfigSyncMeta, metaKey?: string): Promise<void> {
    // Atomic write: config + meta in the same SQLite transaction
    await window.api.kvTransaction(async (tx) => {
      tx.set('global_userRules', JSON.stringify(data))
      if (meta && metaKey) {
        tx.set(metaKey, JSON.stringify(meta))
      }
    })
    // Emit event so the rules component can reload from local storage
    try {
      const eventBus = (await import('@/utils/eventBus')).default
      eventBus.emit('userRulesSyncApplied')
    } catch {
      // eventBus may not be available
    }
    logger.info('Applied remote user rules')
  },

  getDefault(): UserRule[] {
    return []
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

class UserRulesSyncService {
  private static instance: UserRulesSyncService
  private manager = new ConfigSyncManager(userRulesAdapter)

  static getInstance(): UserRulesSyncService {
    if (!UserRulesSyncService.instance) {
      UserRulesSyncService.instance = new UserRulesSyncService()
    }
    return UserRulesSyncService.instance
  }

  initialize(): Promise<void> {
    return this.manager.initialize()
  }

  scheduleUpload(): void {
    this.manager.scheduleUpload()
  }

  reset(): void {
    this.manager.reset()
  }

  stop(): void {
    this.manager.stop()
  }
}

export const userRulesSyncService = UserRulesSyncService.getInstance()
