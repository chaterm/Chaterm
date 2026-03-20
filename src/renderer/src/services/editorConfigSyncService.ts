/**
 * Editor Config Sync Service
 *
 * Uses the generic ConfigSyncManager with an editor_config-specific adapter.
 * Syncs Monaco Editor preferences (font, tab size, word wrap, etc.).
 */

import { ConfigSyncManager, type ConfigSyncAdapter, type ConfigSyncMeta } from './configSyncManager'
import { canonicalJSONStringify } from './syncJson'

const logger = createRendererLogger('service.editorConfigSync')

// ---------------------------------------------------------------------------
// EditorConfig type (mirrored from stores/editorConfig.ts to avoid circular dep)
// ---------------------------------------------------------------------------

interface EditorConfigData {
  fontSize: number
  fontFamily: string
  tabSize: number
  wordWrap: 'off' | 'on' | 'wordWrapColumn' | 'bounded'
  minimap: boolean
  mouseWheelZoom: boolean
  cursorBlinking: 'blink' | 'smooth' | 'phase' | 'expand' | 'solid'
  lineHeight: number
}

function getDefaultEditorFontKey(): string {
  const platform = navigator.platform.toLowerCase()
  const userAgent = navigator.userAgent.toLowerCase()

  if (platform.includes('win') || userAgent.includes('windows')) {
    return 'cascadia-mono'
  }
  if (platform.includes('mac') || userAgent.includes('mac')) {
    return 'sf-mono'
  }
  return 'ubuntu-mono'
}

const DEFAULT_EDITOR_FONT_FAMILY = getDefaultEditorFontKey()

// ---------------------------------------------------------------------------
// Validators
// ---------------------------------------------------------------------------

function validateEditorConfig(payload: unknown): EditorConfigData | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null
  const obj = payload as Record<string, unknown>
  const result: Partial<EditorConfigData> = {}

  if (typeof obj.fontSize === 'number' && obj.fontSize >= 8 && obj.fontSize <= 64) {
    result.fontSize = obj.fontSize
  }
  if (typeof obj.fontFamily === 'string' && obj.fontFamily.length > 0) {
    result.fontFamily = obj.fontFamily
  }
  if (typeof obj.tabSize === 'number' && [2, 4, 8].includes(obj.tabSize)) {
    result.tabSize = obj.tabSize
  }
  if (typeof obj.wordWrap === 'string' && ['off', 'on', 'wordWrapColumn', 'bounded'].includes(obj.wordWrap)) {
    result.wordWrap = obj.wordWrap as EditorConfigData['wordWrap']
  }
  if (typeof obj.minimap === 'boolean') {
    result.minimap = obj.minimap
  }
  if (typeof obj.mouseWheelZoom === 'boolean') {
    result.mouseWheelZoom = obj.mouseWheelZoom
  }
  if (typeof obj.cursorBlinking === 'string' && ['blink', 'smooth', 'phase', 'expand', 'solid'].includes(obj.cursorBlinking)) {
    result.cursorBlinking = obj.cursorBlinking as EditorConfigData['cursorBlinking']
  }
  if (typeof obj.lineHeight === 'number' && obj.lineHeight >= 0 && obj.lineHeight <= 100) {
    result.lineHeight = obj.lineHeight
  }

  // Must have at least one valid field
  if (Object.keys(result).length === 0) return null
  return result as EditorConfigData
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

const editorConfigAdapter: ConfigSyncAdapter<EditorConfigData> = {
  configType: 'editor_config',
  metaKey: 'editorConfigSyncMeta',
  schemaVersion: 1,

  async readLocal(): Promise<EditorConfigData> {
    const result = await window.api.kvGet({ key: 'editorConfig' })
    if (result?.value) {
      try {
        return JSON.parse(result.value)
      } catch {
        // fall through to default
      }
    }
    return {
      fontSize: 14,
      fontFamily: DEFAULT_EDITOR_FONT_FAMILY,
      tabSize: 4,
      wordWrap: 'off',
      minimap: true,
      mouseWheelZoom: true,
      cursorBlinking: 'blink',
      lineHeight: 0
    }
  },

  serializeForUpload(data: EditorConfigData): string {
    return canonicalJSONStringify(data)
  },

  parseRemote(payload: unknown): EditorConfigData | null {
    return validateEditorConfig(payload)
  },

  async applyRemote(data: EditorConfigData, meta?: ConfigSyncMeta, metaKey?: string): Promise<void> {
    // Atomic write: config + meta in the same SQLite transaction
    await window.api.kvTransaction(async (tx) => {
      tx.set('editorConfig', JSON.stringify(data))
      if (meta && metaKey) {
        tx.set(metaKey, JSON.stringify(meta))
      }
    })
    // The Pinia store will pick up the change on next loadConfig() call
    // Emit event so the editor config store can reload
    try {
      const eventBus = (await import('@/utils/eventBus')).default
      eventBus.emit('editorConfigSyncApplied')
    } catch {
      // eventBus may not be available
    }
    logger.info('Applied remote editor config')
  },

  getDefault(): EditorConfigData {
    return {
      fontSize: 14,
      fontFamily: DEFAULT_EDITOR_FONT_FAMILY,
      tabSize: 4,
      wordWrap: 'off',
      minimap: true,
      mouseWheelZoom: true,
      cursorBlinking: 'blink',
      lineHeight: 0
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

class EditorConfigSyncService {
  private static instance: EditorConfigSyncService
  private manager = new ConfigSyncManager(editorConfigAdapter)

  static getInstance(): EditorConfigSyncService {
    if (!EditorConfigSyncService.instance) {
      EditorConfigSyncService.instance = new EditorConfigSyncService()
    }
    return EditorConfigSyncService.instance
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

export const editorConfigSyncService = EditorConfigSyncService.getInstance()
