/**
 * AI Preferences Sync Service
 *
 * Uses the generic ConfigSyncManager with an ai_preferences-specific adapter.
 * Syncs AI-related settings (thinking budget, reasoning effort, auto-approval, proxy, etc.).
 *
 * SECURITY: Strips password and username from proxyConfig before uploading to server.
 */

import { ConfigSyncManager, type ConfigSyncAdapter, type ConfigSyncMeta } from './configSyncManager'
import { canonicalJSONStringify } from './syncJson'

const logger = createRendererLogger('service.aiPreferencesSync')

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AiPreferences {
  thinkingBudgetTokens?: number
  reasoningEffort?: string
  autoApprovalSettings?: {
    version?: number
    enabled?: boolean
    actions?: Record<string, boolean>
    maxRequests?: number
    enableNotifications?: boolean
    favorites?: string[]
  }
  chatSettings?: { mode?: string }
  shellIntegrationTimeout?: number
  needProxy?: boolean
  proxyConfig?: {
    type?: string
    host?: string
    port?: number
    enableProxyIdentity?: boolean
    // username and password are intentionally excluded from sync
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a safe AI preferences snapshot for upload.
 * Strips sensitive fields (proxy username/password) before serialization.
 */
async function buildAiPreferencesSnapshot(): Promise<AiPreferences> {
  const { getGlobalState } = await import('@renderer/agent/storage/state')

  const [thinkingBudgetTokens, reasoningEffort, autoApprovalSettings, chatSettings, shellIntegrationTimeout, needProxy, proxyConfig] =
    await Promise.all([
      getGlobalState('thinkingBudgetTokens'),
      getGlobalState('reasoningEffort'),
      getGlobalState('autoApprovalSettings'),
      getGlobalState('chatSettings'),
      getGlobalState('shellIntegrationTimeout'),
      getGlobalState('needProxy'),
      getGlobalState('proxyConfig')
    ])

  const result: AiPreferences = {}

  if (typeof thinkingBudgetTokens === 'number') {
    result.thinkingBudgetTokens = thinkingBudgetTokens
  }
  if (typeof reasoningEffort === 'string') {
    result.reasoningEffort = reasoningEffort
  }
  if (autoApprovalSettings && typeof autoApprovalSettings === 'object') {
    const aas = autoApprovalSettings as any
    result.autoApprovalSettings = {
      version: aas.version,
      enabled: aas.enabled,
      actions: aas.actions ? { ...aas.actions } : undefined,
      maxRequests: aas.maxRequests,
      enableNotifications: aas.enableNotifications,
      favorites: Array.isArray(aas.favorites) ? [...aas.favorites] : undefined
    }
  }
  if (chatSettings && typeof chatSettings === 'object') {
    result.chatSettings = { mode: (chatSettings as any).mode }
  }
  if (typeof shellIntegrationTimeout === 'number') {
    result.shellIntegrationTimeout = shellIntegrationTimeout
  }
  if (typeof needProxy === 'boolean') {
    result.needProxy = needProxy
  }
  if (proxyConfig && typeof proxyConfig === 'object') {
    const pc = proxyConfig as any
    // SECURITY: Strip username and password - never upload credentials to server
    result.proxyConfig = {
      type: pc.type,
      host: pc.host,
      port: pc.port,
      enableProxyIdentity: pc.enableProxyIdentity
    }
  }

  return result
}

// ---------------------------------------------------------------------------
// Validators
// ---------------------------------------------------------------------------

function validateAiPreferences(payload: unknown): AiPreferences | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null
  const obj = payload as Record<string, unknown>
  const result: AiPreferences = {}
  let hasField = false

  if ('thinkingBudgetTokens' in obj && typeof obj.thinkingBudgetTokens === 'number') {
    result.thinkingBudgetTokens = obj.thinkingBudgetTokens
    hasField = true
  }
  if ('reasoningEffort' in obj && typeof obj.reasoningEffort === 'string') {
    result.reasoningEffort = obj.reasoningEffort
    hasField = true
  }
  if ('autoApprovalSettings' in obj && typeof obj.autoApprovalSettings === 'object' && obj.autoApprovalSettings !== null) {
    result.autoApprovalSettings = obj.autoApprovalSettings as AiPreferences['autoApprovalSettings']
    hasField = true
  }
  if ('chatSettings' in obj && typeof obj.chatSettings === 'object' && obj.chatSettings !== null) {
    result.chatSettings = obj.chatSettings as AiPreferences['chatSettings']
    hasField = true
  }
  if ('shellIntegrationTimeout' in obj && typeof obj.shellIntegrationTimeout === 'number') {
    result.shellIntegrationTimeout = obj.shellIntegrationTimeout
    hasField = true
  }
  if ('needProxy' in obj && typeof obj.needProxy === 'boolean') {
    result.needProxy = obj.needProxy
    hasField = true
  }
  if ('proxyConfig' in obj && typeof obj.proxyConfig === 'object' && obj.proxyConfig !== null) {
    result.proxyConfig = obj.proxyConfig as AiPreferences['proxyConfig']
    hasField = true
  }

  return hasField ? result : null
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

const aiPreferencesAdapter: ConfigSyncAdapter<AiPreferences> = {
  configType: 'ai_preferences',
  metaKey: 'aiPreferencesSyncMeta',
  schemaVersion: 1,

  async readLocal(): Promise<AiPreferences> {
    return buildAiPreferencesSnapshot()
  },

  serializeForUpload(data: AiPreferences): string {
    return canonicalJSONStringify(data)
  },

  parseRemote(payload: unknown): AiPreferences | null {
    return validateAiPreferences(payload)
  },

  async applyRemote(data: AiPreferences, meta?: ConfigSyncMeta, metaKey?: string): Promise<void> {
    // Build the KV operations to write atomically.
    // globalState keys are prefixed with "global_" (see key-storage.ts).
    const ops: Array<{ key: string; value: string }> = []

    if (data.thinkingBudgetTokens !== undefined) {
      ops.push({ key: 'global_thinkingBudgetTokens', value: JSON.stringify(data.thinkingBudgetTokens) })
    }
    if (data.reasoningEffort !== undefined) {
      ops.push({ key: 'global_reasoningEffort', value: JSON.stringify(data.reasoningEffort) })
    }
    if (data.autoApprovalSettings !== undefined) {
      ops.push({ key: 'global_autoApprovalSettings', value: JSON.stringify(data.autoApprovalSettings) })
    }
    if (data.chatSettings !== undefined) {
      ops.push({ key: 'global_chatSettings', value: JSON.stringify(data.chatSettings) })
    }
    if (data.shellIntegrationTimeout !== undefined) {
      ops.push({ key: 'global_shellIntegrationTimeout', value: JSON.stringify(data.shellIntegrationTimeout) })
    }
    if (data.needProxy !== undefined) {
      ops.push({ key: 'global_needProxy', value: JSON.stringify(data.needProxy) })
    }
    if (data.proxyConfig !== undefined) {
      // Merge remote proxy config with local (preserve local credentials)
      const { getGlobalState } = await import('@renderer/agent/storage/state')
      const localProxy = (await getGlobalState('proxyConfig')) as Record<string, unknown> | null
      const merged = {
        ...(localProxy || {}),
        ...data.proxyConfig,
        // Preserve local username/password - remote never has them
        username: (localProxy as any)?.username ?? '',
        password: (localProxy as any)?.password ?? ''
      }
      ops.push({ key: 'global_proxyConfig', value: JSON.stringify(merged) })
    }

    // Atomic write: all config keys + sync meta in the same SQLite transaction
    await window.api.kvTransaction(async (tx) => {
      for (const op of ops) {
        tx.set(op.key, op.value)
      }
      if (meta && metaKey) {
        tx.set(metaKey, JSON.stringify(meta))
      }
    })

    // Emit event so AI settings page can reload from local storage
    try {
      const eventBus = (await import('@/utils/eventBus')).default
      eventBus.emit('aiPreferencesSyncApplied')
    } catch {
      // eventBus may not be available
    }
    logger.info('Applied remote AI preferences')
  },

  getDefault(): AiPreferences {
    return {
      thinkingBudgetTokens: 2048,
      reasoningEffort: 'low',
      shellIntegrationTimeout: 4,
      needProxy: false
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

class AiPreferencesSyncService {
  private static instance: AiPreferencesSyncService
  private manager = new ConfigSyncManager(aiPreferencesAdapter)

  static getInstance(): AiPreferencesSyncService {
    if (!AiPreferencesSyncService.instance) {
      AiPreferencesSyncService.instance = new AiPreferencesSyncService()
    }
    return AiPreferencesSyncService.instance
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

export const aiPreferencesSyncService = AiPreferencesSyncService.getInstance()
