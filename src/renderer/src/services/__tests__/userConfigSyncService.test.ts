import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockGetConfig,
  mockSanitizeForSync,
  mockIsFlatShortcutConfig,
  mockIsPlatformShortcuts,
  mockParseRemoteConfig,
  mockMigrateRemoteConfig,
  mockBuildDefaultUserConfig,
  mockGetPlatformKey,
  mockApplyRemoteConfig,
  mockGetUserTermConfig,
  mockUpdateUserTermConfig
} = vi.hoisted(() => ({
  mockGetConfig: vi.fn(),
  mockSanitizeForSync: vi.fn(),
  mockIsFlatShortcutConfig: vi.fn((value: unknown) => {
    return (
      !!value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      Object.keys(value as Record<string, unknown>).length > 0 &&
      Object.values(value as Record<string, unknown>).every((v) => typeof v === 'string')
    )
  }),
  mockIsPlatformShortcuts: vi.fn((value: unknown) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false
    const obj = value as Record<string, unknown>
    const keys = Object.keys(obj)
    if (keys.length === 0) return false
    const platforms = new Set(['mac', 'windows', 'linux'])
    return keys.every((k) => platforms.has(k) && mockIsFlatShortcutConfig(obj[k]))
  }),
  mockParseRemoteConfig: vi.fn((payload) => payload),
  mockMigrateRemoteConfig: vi.fn((payload) => payload),
  mockBuildDefaultUserConfig: vi.fn(() => ({ theme: 'auto' })),
  mockGetPlatformKey: vi.fn(() => {
    const platform = navigator.platform.toUpperCase()
    if (platform.includes('MAC')) return 'mac'
    if (platform.includes('WIN')) return 'windows'
    return 'linux'
  }),
  mockApplyRemoteConfig: vi.fn(),
  mockGetUserTermConfig: vi.fn(),
  mockUpdateUserTermConfig: vi.fn()
}))

vi.mock('../userConfigStoreService', () => ({
  sanitizeForSync: mockSanitizeForSync,
  isFlatShortcutConfig: mockIsFlatShortcutConfig,
  isPlatformShortcuts: mockIsPlatformShortcuts,
  parseRemoteConfig: mockParseRemoteConfig,
  migrateRemoteConfig: mockMigrateRemoteConfig,
  buildDefaultUserConfig: mockBuildDefaultUserConfig,
  getPlatformKey: mockGetPlatformKey,
  applyRemoteConfig: mockApplyRemoteConfig,
  SUPPORTED_USER_CONFIG_SCHEMA_VERSION: 1,
  SYNC_WHITELIST: ['theme'],
  userConfigStore: {
    getConfig: mockGetConfig
  }
}))

vi.mock('@/api/sync/sync', () => ({
  getUserTermConfig: mockGetUserTermConfig,
  updateUserTermConfig: mockUpdateUserTermConfig
}))

function getCurrentPlatformKey(): 'mac' | 'windows' | 'linux' {
  const platform = navigator.platform.toUpperCase()
  if (platform.includes('MAC')) return 'mac'
  if (platform.includes('WIN')) return 'windows'
  return 'linux'
}

describe('UserConfigSyncService', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  it('uploads local config on initialize when payload drift exists despite dirty=false', async () => {
    const kvStore = new Map<string, string>()
    kvStore.set(
      'userConfigSyncMeta',
      JSON.stringify({
        schemaVersion: 1,
        lastPulledAt: 0,
        lastPushedAt: 0,
        lastSyncedPayload: JSON.stringify({ theme: 'auto' }),
        lastSyncedHash: 'hash-old',
        lastRemoteUpdatedAt: 0,
        lastRemoteSchemaVersion: 1,
        schemaBlocked: false,
        dirty: false
      })
    )
    ;(window as any).api = {
      kvGet: vi.fn(async ({ key }: { key?: string }) => {
        if (!key || !kvStore.has(key)) {
          return null
        }
        return { key, value: kvStore.get(key)! }
      }),
      kvMutate: vi.fn(async ({ action, key, value }: { action: string; key: string; value?: string }) => {
        if (action === 'set' && value !== undefined) {
          kvStore.set(key, value)
        }
      })
    }

    mockGetConfig.mockResolvedValue({ theme: 'dark' })
    mockSanitizeForSync.mockImplementation((config) => ({ theme: config.theme }))
    mockGetUserTermConfig.mockResolvedValue({
      data: {
        config: { theme: 'light' },
        schemaVersion: 1,
        updatedAt: 123,
        configHash: 'hash-remote'
      }
    })
    mockUpdateUserTermConfig.mockResolvedValue({
      data: {
        configHash: 'hash-local',
        updatedAt: 456,
        schemaVersion: 1
      }
    })

    const { userConfigSyncService } = await import('../userConfigSyncService')

    await userConfigSyncService.initialize()
    await vi.advanceTimersByTimeAsync(1000)

    expect(mockUpdateUserTermConfig).toHaveBeenCalledTimes(1)
    expect(mockUpdateUserTermConfig.mock.calls[0][0]).toEqual({
      schemaVersion: 1,
      config: JSON.stringify({ theme: 'dark' }),
      configType: 'user_config'
    })
    expect(mockApplyRemoteConfig).not.toHaveBeenCalled()
  })

  it('stores platform-partitioned shortcuts payload in lastSyncedPayload after remote apply', async () => {
    const kvStore = new Map<string, string>()
    const platformShortcuts = {
      mac: { copy: 'Cmd+C', paste: 'Cmd+V' },
      windows: { copy: 'Ctrl+C', paste: 'Ctrl+V' },
      linux: { copy: 'Ctrl+Shift+C', paste: 'Ctrl+Shift+V' }
    }
    const currentPlatform = getCurrentPlatformKey()
    const currentShortcuts = platformShortcuts[currentPlatform]
    const { canonicalJSONStringify } = await import('../syncJson')
    const canonicalLastSyncedPayload = canonicalJSONStringify({
      shortcuts: platformShortcuts,
      theme: 'dark'
    })

    kvStore.set(
      'userConfigSyncMeta',
      JSON.stringify({
        schemaVersion: 1,
        lastPulledAt: 0,
        lastPushedAt: 0,
        lastSyncedPayload: canonicalLastSyncedPayload,
        lastSyncedHash: 'hash-old',
        lastRemoteUpdatedAt: 0,
        lastRemoteSchemaVersion: 1,
        schemaBlocked: false,
        dirty: false
      })
    )
    ;(window as any).api = {
      kvGet: vi.fn(async ({ key }: { key?: string }) => {
        if (!key || !kvStore.has(key)) {
          return null
        }
        return { key, value: kvStore.get(key)! }
      }),
      kvMutate: vi.fn(async ({ action, key, value }: { action: string; key: string; value?: string }) => {
        if (action === 'set' && value !== undefined) {
          kvStore.set(key, value)
        }
      })
    }

    mockGetConfig.mockResolvedValue({ theme: 'dark', shortcuts: currentShortcuts })
    mockSanitizeForSync.mockReturnValue({ theme: 'dark', shortcuts: currentShortcuts } as any)
    mockParseRemoteConfig.mockReturnValue({ theme: 'dark', shortcuts: currentShortcuts } as any)
    mockGetUserTermConfig.mockResolvedValue({
      data: {
        config: JSON.stringify({ theme: 'dark', shortcuts: platformShortcuts }),
        schemaVersion: 1,
        updatedAt: 123,
        configHash: 'hash-remote'
      }
    })

    const { userConfigSyncService } = await import('../userConfigSyncService')
    await userConfigSyncService.initialize()

    expect(mockParseRemoteConfig).toHaveBeenCalledWith(expect.objectContaining({ shortcuts: currentShortcuts, theme: 'dark' }))

    const storedMeta = JSON.parse(kvStore.get('userConfigSyncMeta') ?? '{}')
    const storedPayload = JSON.parse(storedMeta.lastSyncedPayload ?? '{}')
    expect(storedPayload.shortcuts).toEqual(platformShortcuts)
  })

  it('applies compatible fields when remote schema version is lower than local support', async () => {
    const kvStore = new Map<string, string>()
    kvStore.set(
      'userConfigSyncMeta',
      JSON.stringify({
        schemaVersion: 1,
        lastPulledAt: 0,
        lastPushedAt: 0,
        lastSyncedPayload: JSON.stringify({ theme: 'dark' }),
        lastSyncedHash: 'hash-old',
        lastRemoteUpdatedAt: 0,
        lastRemoteSchemaVersion: 1,
        schemaBlocked: false,
        dirty: false
      })
    )
    ;(window as any).api = {
      kvGet: vi.fn(async ({ key }: { key?: string }) => {
        if (!key || !kvStore.has(key)) {
          return null
        }
        return { key, value: kvStore.get(key)! }
      }),
      kvMutate: vi.fn(async ({ action, key, value }: { action: string; key: string; value?: string }) => {
        if (action === 'set' && value !== undefined) {
          kvStore.set(key, value)
        }
      }),
      kvTransaction: vi.fn(
        async (
          callback: (tx: {
            get: (key: string) => Promise<string | null>
            set: (key: string, value: string) => void
            delete: (key: string) => void
          }) => Promise<void>
        ) => {
          const ops: Array<{ action: 'set'; key: string; value: string } | { action: 'delete'; key: string }> = []
          await callback({
            get: async (key) => kvStore.get(key) ?? null,
            set: (key, value) => ops.push({ action: 'set', key, value }),
            delete: (key) => ops.push({ action: 'delete', key })
          })
          for (const op of ops) {
            if (op.action === 'set') {
              kvStore.set(op.key, op.value)
            } else {
              kvStore.delete(op.key)
            }
          }
        }
      )
    }

    mockGetConfig.mockResolvedValue({ theme: 'dark' })
    mockSanitizeForSync.mockImplementation((config) => ({ theme: config.theme }))
    mockParseRemoteConfig.mockReturnValue({ theme: 'light' } as any)
    mockGetUserTermConfig.mockResolvedValue({
      data: {
        config: JSON.stringify({ theme: 'light', unknownField: 'ignored' }),
        schemaVersion: 0,
        updatedAt: 456,
        configHash: 'hash-remote-lower'
      }
    })

    const { userConfigSyncService } = await import('../userConfigSyncService')
    await userConfigSyncService.initialize()

    expect(mockMigrateRemoteConfig).toHaveBeenCalledWith({ theme: 'light', unknownField: 'ignored' }, 0, 1)
    expect(mockApplyRemoteConfig).toHaveBeenCalledTimes(1)
    expect(mockApplyRemoteConfig.mock.calls[0][0]).toEqual({ theme: 'light' })
  })

  it('blocks remote apply when remote schema version is higher than local support', async () => {
    const kvStore = new Map<string, string>()
    kvStore.set(
      'userConfigSyncMeta',
      JSON.stringify({
        schemaVersion: 1,
        lastPulledAt: 0,
        lastPushedAt: 0,
        lastSyncedPayload: '',
        lastSyncedHash: '',
        lastRemoteUpdatedAt: 0,
        lastRemoteSchemaVersion: 0,
        schemaBlocked: false,
        dirty: false
      })
    )
    ;(window as any).api = {
      kvGet: vi.fn(async ({ key }: { key?: string }) => {
        if (!key || !kvStore.has(key)) {
          return null
        }
        return { key, value: kvStore.get(key)! }
      }),
      kvMutate: vi.fn(async ({ action, key, value }: { action: string; key: string; value?: string }) => {
        if (action === 'set' && value !== undefined) {
          kvStore.set(key, value)
        }
      }),
      kvTransaction: vi.fn(
        async (
          callback: (tx: {
            get: (key: string) => Promise<string | null>
            set: (key: string, value: string) => void
            delete: (key: string) => void
          }) => Promise<void>
        ) => {
          const ops: Array<{ action: 'set'; key: string; value: string } | { action: 'delete'; key: string }> = []
          await callback({
            get: async (key) => kvStore.get(key) ?? null,
            set: (key, value) => ops.push({ action: 'set', key, value }),
            delete: (key) => ops.push({ action: 'delete', key })
          })
          for (const op of ops) {
            if (op.action === 'set') {
              kvStore.set(op.key, op.value)
            } else {
              kvStore.delete(op.key)
            }
          }
        }
      )
    }

    mockGetConfig.mockResolvedValue({ theme: 'dark' })
    mockSanitizeForSync.mockImplementation((config) => ({ theme: config.theme }))
    mockGetUserTermConfig.mockResolvedValue({
      data: {
        config: JSON.stringify({ theme: 'light' }),
        schemaVersion: 2,
        updatedAt: 999,
        configHash: 'hash-remote-higher'
      }
    })

    const { userConfigSyncService } = await import('../userConfigSyncService')
    await userConfigSyncService.initialize()

    expect(mockApplyRemoteConfig).not.toHaveBeenCalled()
    const storedMeta = JSON.parse(kvStore.get('userConfigSyncMeta') ?? '{}')
    expect(storedMeta.schemaBlocked).toBe(true)
  })
})
