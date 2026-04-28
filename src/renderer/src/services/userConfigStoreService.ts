import { shortcutActions } from '@/config/shortcutActions'
import { toRaw, nextTick } from 'vue'
import i18n from '@/locales'
import eventBus from '@/utils/eventBus'
import { getSystemTheme } from '@/utils/themeUtils'
import { userConfigStore as piniaConfigStore } from '@/store/userConfigStore'
import { type ConfigSyncMeta, buildDefaultConfigSyncMeta } from './configSyncManager'
import { THEME_PRESETS } from '../../../shared/themes/presets'
import { resolveThemePreset } from '../../../shared/themes/resolve'
import type { ThemeId } from '../../../shared/themes/types'
import { applyThemeToDocument } from '@/themes/applyTheme'

const logger = createRendererLogger('service.userConfig')

function isSystemBackgroundImage(image: string): boolean {
  return /(?:^|\/)wall-\d+\.jpg(?:\?.*)?$/i.test(image) || image.includes('assets/backgroup/wall-')
}

export interface ShortcutConfig {
  [key: string]: string
}

export type PlatformKey = 'mac' | 'windows' | 'linux'
export type PlatformShortcuts = Partial<Record<PlatformKey, ShortcutConfig>>

const PLATFORM_KEYS: PlatformKey[] = ['mac', 'windows', 'linux']

export interface BackgroundConfig {
  mode: 'none' | 'image'
  image: string
  opacity: number
  brightness: number
}

export const SUPPORTED_LANGUAGE_VALUES = ['zh-CN', 'zh-TW', 'en-US', 'de-DE', 'fr-FR', 'it-IT', 'pt-PT', 'ru-RU', 'ja-JP', 'ko-KR', 'ar-AR'] as const

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGE_VALUES)[number]

export interface UserConfig {
  id: string
  updatedAt: number
  autoCompleteStatus: number
  vimStatus: boolean
  quickVimStatus: number
  commonVimStatus: number
  aliasStatus: number
  highlightStatus: number
  pinchZoomStatus: number
  fontSize: number
  fontFamily?: string
  scrollBack: number
  language: SupportedLanguage
  cursorStyle: 'bar' | 'block' | 'underline' | undefined
  terminalType?: string
  middleMouseEvent?: 'paste' | 'contextMenu' | 'closeTab' | 'none'
  rightMouseEvent?: 'paste' | 'contextMenu' | 'none'
  watermark: 'open' | 'close' | undefined
  secretRedaction: 'enabled' | 'disabled' | undefined
  dataSync: 'enabled' | 'disabled' | undefined
  telemetry?: string
  theme: ThemeId | undefined
  defaultLayout?: 'terminal' | 'agents'
  feature?: number
  quickComand?: boolean
  shortcuts?: ShortcutConfig
  showCloseButton: number
  sshAgentsStatus: number
  sshAgentsMap?: string
  sshProxyConfigs?: Array<{
    name: string
    type?: 'HTTP' | 'HTTPS' | 'SOCKS4' | 'SOCKS5'
    host?: string
    port?: number
    enableProxyIdentity?: boolean
    username?: string
    password?: string
  }>
  workspaceExpandedKeys?: string[]
  workspaceShowIpMode?: boolean
  workspaceTunnelConfigs?: Record<
    string,
    Array<{
      id: string
      type: 'local_forward' | 'remote_forward' | 'dynamic_socks'
      localPort: number
      remotePort?: number
      description?: string
    }>
  >
  lastCustomImage?: string
  background: BackgroundConfig
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }
  return Object.prototype.toString.call(value) === '[object Object]'
}

export function isFlatShortcutConfig(value: unknown): value is ShortcutConfig {
  return isPlainObject(value) && Object.keys(value).length > 0 && Object.values(value).every((v) => typeof v === 'string')
}

export function isPlatformShortcuts(value: unknown): value is PlatformShortcuts {
  if (!isPlainObject(value)) return false
  const keys = Object.keys(value)
  if (keys.length === 0) return false
  return keys.every((key) => PLATFORM_KEYS.includes(key as PlatformKey) && isFlatShortcutConfig((value as Record<string, unknown>)[key]))
}

export function getPlatformKey(): PlatformKey {
  const platform = navigator.platform.toUpperCase()
  if (platform.includes('MAC')) return 'mac'
  if (platform.includes('WIN')) return 'windows'
  return 'linux'
}

function resolveCurrentPlatformShortcuts(value: unknown): ShortcutConfig | null {
  if (isFlatShortcutConfig(value)) {
    return { ...value }
  }
  if (isPlatformShortcuts(value)) {
    const current = value[getPlatformKey()]
    return isFlatShortcutConfig(current) ? { ...current } : null
  }
  return null
}

export function buildDefaultShortcutConfig(platform: PlatformKey = getPlatformKey()): ShortcutConfig {
  const defaultShortcuts: ShortcutConfig = {}
  shortcutActions.forEach((action) => {
    defaultShortcuts[action.id] = platform === 'mac' ? action.defaultKey.mac : action.defaultKey.other
  })
  return defaultShortcuts
}

export function buildDefaultUserConfig(now: number = Date.now()): UserConfig {
  return {
    id: 'userConfig',
    updatedAt: now,
    autoCompleteStatus: 1,
    vimStatus: false,
    quickVimStatus: 1,
    commonVimStatus: 2,
    aliasStatus: 1,
    highlightStatus: 1,
    pinchZoomStatus: 1,
    showCloseButton: 1,
    fontSize: 12,
    scrollBack: 1000,
    language: 'zh-CN',
    cursorStyle: 'block',
    middleMouseEvent: 'paste',
    rightMouseEvent: 'contextMenu',
    watermark: 'open',
    secretRedaction: 'disabled',
    dataSync: 'disabled',
    theme: 'auto',
    defaultLayout: 'terminal',
    feature: 0.0,
    quickComand: false,
    shortcuts: buildDefaultShortcutConfig(),
    sshAgentsStatus: 2,
    sshAgentsMap: '[]',
    sshProxyConfigs: [],
    workspaceExpandedKeys: [],
    workspaceTunnelConfigs: {},
    lastCustomImage: '',
    background: {
      mode: 'none',
      image: '',
      opacity: 0.15,
      brightness: 0.45
    }
  }
}

export class UserConfigStoreService {
  constructor() {
    this.initDB()
  }

  async initDB(): Promise<void> {
    try {
      // Ensure default config exists
      const config = await window.api.kvGet({ key: 'userConfig' })
      if (!config) {
        // Create default config if it doesn't exist
        await window.api.kvMutate({
          action: 'set',
          key: 'userConfig',
          value: JSON.stringify(this.getDefaultConfig())
        })
      }
    } catch (error) {
      logger.error('Error initializing userConfig in SQLite', { error: error })
    }
  }

  private getDefaultConfig(): UserConfig {
    return buildDefaultUserConfig()
  }

  async getConfig(): Promise<UserConfig> {
    try {
      const result = await window.api.kvGet({ key: 'userConfig' })
      let savedConfig: any = {}
      if (result?.value) {
        savedConfig = JSON.parse(result.value)
        if (!savedConfig || typeof savedConfig !== 'object' || Array.isArray(savedConfig)) {
          logger.warn('Loaded unexpected userConfig payload from SQLite, falling back to defaults', {
            rawValue: typeof result.value === 'string' ? result.value.slice(0, 200) : result.value
          })
          savedConfig = {}
        }
      }

      const defaultConfig = this.getDefaultConfig()

      // Migration: If background object is missing but old fields exist, migrate them
      if (!savedConfig.background) {
        savedConfig.background = { ...defaultConfig.background }

        if (savedConfig.backgroundImage !== undefined) {
          savedConfig.background.image = savedConfig.backgroundImage
        }
        if (savedConfig.backgroundOpacity !== undefined) {
          savedConfig.background.opacity = savedConfig.backgroundOpacity
        }
        if (savedConfig.backgroundBrightness !== undefined) {
          savedConfig.background.brightness = savedConfig.backgroundBrightness
        }
        if (savedConfig.backgroundMode !== undefined) {
          savedConfig.background.mode = savedConfig.backgroundMode
        }
      }

      // Migration: Handle legacy backgroundConfig object format
      if (savedConfig.backgroundConfig) {
        if (!savedConfig.background.image && savedConfig.backgroundConfig.imagePath) {
          savedConfig.background.image = savedConfig.backgroundConfig.imagePath
        }
        if (savedConfig.backgroundConfig.enabled !== undefined) {
          savedConfig.background.mode = savedConfig.backgroundConfig.enabled ? 'image' : 'none'
        }
        delete savedConfig.backgroundConfig
      }

      // Discard base64 image data from legacy versions - only file paths are valid
      if (savedConfig.background.image && savedConfig.background.image.startsWith('data:')) {
        savedConfig.background.image = ''
        savedConfig.background.mode = 'none'
      }

      // Migration: Preserve last custom background path explicitly for UI restore
      if (
        !savedConfig.lastCustomImage &&
        savedConfig.background.image &&
        !savedConfig.background.image.startsWith('data:') &&
        !isSystemBackgroundImage(savedConfig.background.image)
      ) {
        savedConfig.lastCustomImage = savedConfig.background.image
      }

      // Merge with default config to ensure all fields exist
      return {
        ...defaultConfig,
        ...savedConfig,
        background: {
          ...defaultConfig.background,
          ...(savedConfig.background || {})
        }
      }
    } catch (error) {
      logger.error('Error getting config from SQLite', { error: error })
      return this.getDefaultConfig()
    }
  }

  async saveConfig(config: Partial<UserConfig>): Promise<void> {
    try {
      const defaultConfig = await this.getConfig()

      const sanitizedConfig: UserConfig = {
        ...defaultConfig,
        ...config,
        sshProxyConfigs: config.sshProxyConfigs ? toRaw(config.sshProxyConfigs) : defaultConfig.sshProxyConfigs,
        id: 'userConfig',
        updatedAt: Date.now()
      }

      await window.api.kvTransaction(async (tx) => {
        const existingMetaRaw = await tx.get('userConfigSyncMeta')
        const existingMeta = existingMetaRaw
          ? (JSON.parse(existingMetaRaw) as ConfigSyncMeta)
          : buildDefaultConfigSyncMeta(SUPPORTED_USER_CONFIG_SCHEMA_VERSION)

        tx.set('userConfig', JSON.stringify(sanitizedConfig))
        tx.set(
          'userConfigSyncMeta',
          JSON.stringify({
            ...existingMeta,
            schemaVersion: SUPPORTED_USER_CONFIG_SCHEMA_VERSION,
            dirty: true
          } satisfies ConfigSyncMeta)
        )
      })

      logger.info('Config saved successfully to SQLite', {
        theme: sanitizedConfig.theme,
        language: sanitizedConfig.language,
        defaultLayout: sanitizedConfig.defaultLayout,
        watermark: sanitizedConfig.watermark
      })

      // Trigger sync upload after successful save
      try {
        const { userConfigSyncService } = await import('./userConfigSyncService')
        userConfigSyncService.scheduleUpload()
      } catch (e) {
        // Sync service may not be initialized yet, ignore
      }
    } catch (error) {
      logger.error('Error saving config to SQLite', { error: error })
      throw error
    }
  }

  async resetConfig(): Promise<void> {
    return this.saveConfig(this.getDefaultConfig())
  }

  async deleteDatabase(): Promise<void> {
    logger.info('deleteDatabase is deprecated when using SQLite')
  }
}

// ---------------------------------------------------------------------------
// Sync whitelist fields
// ---------------------------------------------------------------------------

export const SYNC_WHITELIST = [
  'language',
  'theme',
  'defaultLayout',
  'watermark',
  'secretRedaction',
  'fontSize',
  'scrollBack',
  'cursorStyle',
  'terminalType',
  'middleMouseEvent',
  'rightMouseEvent',
  'pinchZoomStatus',
  'autoCompleteStatus',
  'quickVimStatus',
  'commonVimStatus',
  'aliasStatus',
  'highlightStatus',
  'shortcuts'
] as const

export type SyncWhitelistKey = (typeof SYNC_WHITELIST)[number]

export type SyncableUserConfig = Pick<UserConfig, SyncWhitelistKey>

// ---------------------------------------------------------------------------
// Schema version
// ---------------------------------------------------------------------------

export const SUPPORTED_USER_CONFIG_SCHEMA_VERSION = 1

// ---------------------------------------------------------------------------
// Field validators
// ---------------------------------------------------------------------------

export const SYNC_FIELD_VALIDATORS: Record<SyncWhitelistKey, (val: unknown) => boolean> = {
  language: (val) => typeof val === 'string' && SUPPORTED_LANGUAGE_VALUES.includes(val as SupportedLanguage),
  theme: (val) => typeof val === 'string' && (val === 'auto' || Object.prototype.hasOwnProperty.call(THEME_PRESETS, val)),
  defaultLayout: (val) => typeof val === 'string' && ['terminal', 'agents'].includes(val),
  watermark: (val) => typeof val === 'string' && ['open', 'close'].includes(val),
  secretRedaction: (val) => typeof val === 'string' && ['enabled', 'disabled'].includes(val),
  fontSize: (val) => typeof val === 'number' && Number.isInteger(val) && val >= 8 && val <= 64,
  scrollBack: (val) => typeof val === 'number' && Number.isInteger(val) && val >= 1 && val <= 100000,
  cursorStyle: (val) => typeof val === 'string' && ['block', 'bar', 'underline'].includes(val),
  terminalType: (val) =>
    typeof val === 'string' && ['xterm', 'xterm-256color', 'vt100', 'vt102', 'vt220', 'vt320', 'linux', 'scoansi', 'ansi'].includes(val),
  middleMouseEvent: (val) => typeof val === 'string' && ['paste', 'contextMenu', 'closeTab', 'none'].includes(val),
  rightMouseEvent: (val) => typeof val === 'string' && ['paste', 'contextMenu', 'none'].includes(val),
  pinchZoomStatus: (val) => typeof val === 'number' && [1, 2].includes(val),
  autoCompleteStatus: (val) => typeof val === 'number' && [1, 2].includes(val),
  quickVimStatus: (val) => typeof val === 'number' && [1, 2].includes(val),
  commonVimStatus: (val) => typeof val === 'number' && [1, 2].includes(val),
  aliasStatus: (val) => typeof val === 'number' && [1, 2].includes(val),
  highlightStatus: (val) => typeof val === 'number' && [1, 2].includes(val),
  shortcuts: (val) => isFlatShortcutConfig(val) || isPlatformShortcuts(val)
}

// ---------------------------------------------------------------------------
// Sanitize / parse helpers
// ---------------------------------------------------------------------------

export function sanitizeForSync(config: UserConfig): SyncableUserConfig {
  const result = {} as SyncableUserConfig
  for (const key of SYNC_WHITELIST) {
    if (key in config && config[key] !== undefined) {
      if (key === 'shortcuts') {
        const resolved = resolveCurrentPlatformShortcuts((config as any)[key])
        if (resolved) {
          ;(result as any).shortcuts = resolved
        }
        continue
      }
      ;(result as any)[key] = config[key]
    }
  }
  return result
}

export function parseRemoteConfig(payload: Record<string, unknown>): Partial<SyncableUserConfig> {
  const result: Partial<SyncableUserConfig> = {}
  for (const key of SYNC_WHITELIST) {
    if (key in payload) {
      const val = payload[key]
      if (key === 'shortcuts') {
        const validator = SYNC_FIELD_VALIDATORS[key]
        if (validator(val)) {
          const resolved = resolveCurrentPlatformShortcuts(val)
          if (resolved) {
            ;(result as any).shortcuts = resolved
          }
        } else {
          logger.warn('Remote shortcuts failed validation, skipping')
        }
      } else {
        const validator = SYNC_FIELD_VALIDATORS[key]
        if (validator(val)) {
          ;(result as any)[key] = val
        }
      }
    }
  }
  return result
}

// ---------------------------------------------------------------------------
// Schema migration registry
// ---------------------------------------------------------------------------

type MigrationFn = (config: Record<string, unknown>) => Record<string, unknown>

export const remoteConfigMigrations: Record<number, MigrationFn> = {
  // Current schema is v1. Legacy payloads from v0 map 1:1.
  0: (config) => ({ ...config })
}

export function migrateRemoteConfig(config: Record<string, unknown>, fromVersion: number, toVersion: number): Record<string, unknown> | null {
  if (fromVersion > toVersion) {
    return null
  }
  if (fromVersion === toVersion) {
    return { ...config }
  }

  let current = { ...config }
  for (let version = fromVersion; version < toVersion; version++) {
    const migrate = remoteConfigMigrations[version]
    if (!migrate) {
      logger.warn('Missing remote config migration step', { fromVersion, toVersion, missingStep: version })
      return null
    }
    current = migrate(current)
  }
  return current
}

export const userConfigStore = new UserConfigStoreService()

export async function getStoredUserConfigSnapshot(): Promise<Partial<UserConfig> | null> {
  try {
    const result = await window.api.kvGet({ key: 'userConfig' })
    if (!result?.value) {
      return null
    }

    const parsed = JSON.parse(result.value)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null
    }

    return parsed as Partial<UserConfig>
  } catch (error) {
    logger.warn('Failed to read raw userConfig snapshot', { error })
    return null
  }
}

export function resolveDataSyncPreference(storedConfig: Partial<UserConfig> | null, isLoggedIn: boolean): 'enabled' | 'disabled' {
  const storedValue = storedConfig?.dataSync
  if (storedValue === 'enabled' || storedValue === 'disabled') {
    return storedValue
  }

  return isLoggedIn ? 'enabled' : 'disabled'
}

// ---------------------------------------------------------------------------
// RemoteApplyGuard - suppresses deep watch writeback during remote apply
// ---------------------------------------------------------------------------

class RemoteApplyGuard {
  private _applying = false
  get isApplying(): boolean {
    return this._applying
  }

  async run(fn: () => Promise<void>): Promise<void> {
    this._applying = true
    try {
      await fn()
    } finally {
      await nextTick()
      this._applying = false
    }
  }
}

export const remoteApplyGuard = new RemoteApplyGuard()

// ---------------------------------------------------------------------------
// Runtime side-effect dispatch (only for fields that actually changed)
// ---------------------------------------------------------------------------

export function dispatchSideEffects(changedFields: Partial<SyncableUserConfig>): void {
  // language -> localStorage + i18n locale
  if ('language' in changedFields && changedFields.language) {
    localStorage.setItem('lang', changedFields.language)
    i18n.global.locale.value = changedFields.language
  }

  // theme -> document class + main process
  if ('theme' in changedFields && changedFields.theme) {
    const themeId = changedFields.theme as import('../../../shared/themes/types').ThemeId
    const system = getSystemTheme() as 'dark' | 'light'
    const preset = resolveThemePreset(themeId, system)

    applyThemeToDocument(preset)

    eventBus.emit('updateTheme', {
      themeId,
      appearance: preset.appearance,
      preset
    })

    window.api.updateTheme(themeId)
  }

  // defaultLayout -> eventBus notification
  if ('defaultLayout' in changedFields && changedFields.defaultLayout) {
    eventBus.emit('defaultLayoutChanged', changedFields.defaultLayout)
  }

  // watermark -> eventBus notification
  if ('watermark' in changedFields && changedFields.watermark) {
    eventBus.emit('updateWatermark', changedFields.watermark)
  }

  // pinchZoomStatus -> eventBus notification
  if ('pinchZoomStatus' in changedFields && changedFields.pinchZoomStatus !== undefined) {
    eventBus.emit('pinchZoomStatusChanged', changedFields.pinchZoomStatus === 1)
  }

  // aliasStatus -> eventBus notification
  if ('aliasStatus' in changedFields && changedFields.aliasStatus !== undefined) {
    eventBus.emit('aliasStatusChanged', changedFields.aliasStatus)
  }

  // shortcuts -> notify shortcut service to reload bindings
  if ('shortcuts' in changedFields && changedFields.shortcuts) {
    eventBus.emit('shortcutsSyncApplied')
  }

  // Other fields (fontSize, scrollBack, cursorStyle, terminalType, etc.)
  // are consumed via Pinia computed/watch - no extra side-effects needed.
}

// ---------------------------------------------------------------------------
// Apply remote config - atomic write + Pinia refresh + side-effects + notify
// ---------------------------------------------------------------------------

export async function applyRemoteConfig(
  parsedFields: Partial<SyncableUserConfig>,
  meta?: import('./configSyncManager').ConfigSyncMeta,
  metaKey?: string
): Promise<void> {
  await remoteApplyGuard.run(async () => {
    // 1. Read current local config
    const currentConfig = await userConfigStore.getConfig()

    // 2. Identify actually changed fields (deep comparison for object-type fields)
    const changedFields: Partial<SyncableUserConfig> = {}
    for (const key of Object.keys(parsedFields) as Array<keyof SyncableUserConfig>) {
      const remoteVal = parsedFields[key]
      const localVal = currentConfig[key]
      const isEqual =
        typeof remoteVal === 'object' && remoteVal !== null ? JSON.stringify(remoteVal) === JSON.stringify(localVal) : remoteVal === localVal
      if (!isEqual) {
        ;(changedFields as any)[key] = remoteVal
      }
    }

    // 3. No-op when remote payload does not change any synced field.
    if (Object.keys(changedFields).length === 0) {
      return
    }

    // 4. Merge changed whitelist fields into local config
    const mergedConfig = { ...currentConfig, ...changedFields, updatedAt: Date.now() }

    // 5. Atomic write SQLite (userConfig + syncMeta in the same transaction).
    await window.api.kvTransaction(async (tx) => {
      tx.set('userConfig', JSON.stringify(mergedConfig))
      if (meta && metaKey) {
        tx.set(metaKey, JSON.stringify(meta))
      }
    })

    // 6. Refresh Pinia store for changed whitelist fields
    const store = piniaConfigStore()
    const piniaUpdatable: Record<string, (val: any) => void> = {
      language: (v) => store.updateLanguage(v),
      theme: (v) => store.updateTheme(v),
      secretRedaction: (v) => store.updateSecretRedaction(v),
      dataSync: (v) => store.updateDataSync(v)
    }
    for (const key of Object.keys(changedFields) as Array<keyof SyncableUserConfig>) {
      if (piniaUpdatable[key]) {
        piniaUpdatable[key]((changedFields as any)[key])
      }
    }

    // 7. Dispatch runtime side-effects for changed fields
    dispatchSideEffects(changedFields)

    // 8. Notify setting pages to reload and wait for handlers to complete
    await eventBus.emitAsync('userConfigSyncApplied')
  })
}
