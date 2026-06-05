import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetUserTermConfig, mockUpdateUserTermConfig } = vi.hoisted(() => ({
  mockGetUserTermConfig: vi.fn(),
  mockUpdateUserTermConfig: vi.fn()
}))

const { mockUserConfigPiniaStore } = vi.hoisted(() => ({
  mockUserConfigPiniaStore: vi.fn(() => ({
    updateLanguage: vi.fn(),
    updateTheme: vi.fn(),
    updateSecretRedaction: vi.fn(),
    updateDataSync: vi.fn()
  }))
}))

const { mockEventBusEmit, mockEventBusEmitAsync } = vi.hoisted(() => ({
  mockEventBusEmit: vi.fn(),
  mockEventBusEmitAsync: vi.fn().mockResolvedValue(undefined)
}))

vi.mock('@/api/sync/sync', () => ({
  getUserTermConfig: mockGetUserTermConfig,
  updateUserTermConfig: mockUpdateUserTermConfig
}))

vi.mock('@/store/userConfigStore', () => ({
  userConfigStore: mockUserConfigPiniaStore
}))

vi.mock('@/utils/eventBus', () => ({
  default: {
    emit: mockEventBusEmit,
    emitAsync: mockEventBusEmitAsync
  }
}))

describe('UserConfigStoreService', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    vi.useFakeTimers()
    mockEventBusEmitAsync.mockResolvedValue(undefined)
  })

  it('persists dirty sync meta atomically when saving local config', async () => {
    const kvStore = new Map<string, string>()

    const kvGet = vi.fn(async ({ key }: { key?: string }) => {
      if (!key || !kvStore.has(key)) {
        return null
      }
      return { key, value: kvStore.get(key)! }
    })

    const kvMutate = vi.fn(async ({ action, key, value }: { action: string; key: string; value?: string }) => {
      if (action === 'set' && value !== undefined) {
        kvStore.set(key, value)
        return
      }
      if (action === 'delete') {
        kvStore.delete(key)
      }
    })

    const kvTransaction = vi.fn(
      async (
        callback: (tx: {
          get(key: string): Promise<string | null>
          set(key: string, value: string): void
          delete(key: string): void
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

    ;(window as any).api = {
      kvGet,
      kvMutate,
      kvTransaction,
      updateTheme: vi.fn()
    }

    mockGetUserTermConfig.mockResolvedValue({ data: { config: null } })
    mockUpdateUserTermConfig.mockResolvedValue({ data: {} })

    const { UserConfigStoreService } = await import('../userConfigStoreService')
    const service = new UserConfigStoreService()

    await service.initDB()
    await service.saveConfig({ theme: 'dark' })

    expect(kvTransaction).toHaveBeenCalledTimes(1)

    const storedConfig = JSON.parse(kvStore.get('userConfig') ?? '{}')
    const storedMeta = JSON.parse(kvStore.get('userConfigSyncMeta') ?? '{}')

    expect(storedConfig.theme).toBe('dark')
    expect(storedMeta.dirty).toBe(true)
    expect(storedMeta.schemaVersion).toBe(1)
  })

  it('emits runtime terminal config updates after local terminal settings change', async () => {
    const kvStore = new Map<string, string>()

    const kvGet = vi.fn(async ({ key }: { key?: string }) => {
      if (!key || !kvStore.has(key)) {
        return null
      }
      return { key, value: kvStore.get(key)! }
    })

    const kvMutate = vi.fn(async ({ action, key, value }: { action: string; key: string; value?: string }) => {
      if (action === 'set' && value !== undefined) {
        kvStore.set(key, value)
      }
    })

    const kvTransaction = vi.fn(
      async (
        callback: (tx: {
          get(key: string): Promise<string | null>
          set(key: string, value: string): void
          delete(key: string): void
        }) => Promise<void>
      ) => {
        const ops: Array<{ key: string; value: string }> = []
        await callback({
          get: async (key) => kvStore.get(key) ?? null,
          set: (key, value) => ops.push({ key, value }),
          delete: () => {}
        })

        for (const op of ops) {
          kvStore.set(op.key, op.value)
        }
      }
    )

    ;(window as any).api = {
      kvGet,
      kvMutate,
      kvTransaction,
      updateTheme: vi.fn()
    }

    const { UserConfigStoreService } = await import('../userConfigStoreService')
    const { TERMINAL_RUNTIME_CONFIG_CHANGED_EVENT } = await import('@/utils/terminalRuntimeConfig')
    const service = new UserConfigStoreService()

    await service.initDB()
    await service.saveConfig({
      scrollBack: 8000,
      fontSize: 14
    })

    expect(mockEventBusEmit).toHaveBeenCalledWith(TERMINAL_RUNTIME_CONFIG_CHANGED_EVENT, {
      scrollBack: 8000,
      fontSize: 14
    })
  })

  it('does not export a user-config specific default sync meta builder', async () => {
    const module = await import('../userConfigStoreService')
    expect('buildDefaultSyncMeta' in module).toBe(false)
  })

  it('supports chained remote schema migration and returns null when a step is missing', async () => {
    const { migrateRemoteConfig } = await import('../userConfigStoreService')

    expect(migrateRemoteConfig({ theme: 'dark' }, 0, 1)).toEqual({ theme: 'dark' })
    expect(migrateRemoteConfig({ theme: 'dark' }, 0, 2)).toBeNull()
  })

  it('parseRemoteConfig extracts current platform shortcuts from platform-partitioned payload', async () => {
    const { parseRemoteConfig, getPlatformKey } = await import('../userConfigStoreService')
    const platformShortcuts = {
      mac: { copy: 'Cmd+C' },
      windows: { copy: 'Ctrl+C' },
      linux: { copy: 'Ctrl+Shift+C' }
    }

    const parsed = parseRemoteConfig({
      theme: 'dark',
      shortcuts: platformShortcuts
    })

    expect(parsed.shortcuts).toEqual(platformShortcuts[getPlatformKey()])
  })

  it('sanitizeForSync normalizes platform-partitioned shortcuts to current platform', async () => {
    const { sanitizeForSync, buildDefaultUserConfig, getPlatformKey } = await import('../userConfigStoreService')
    const platformShortcuts = {
      mac: { copy: 'Cmd+C' },
      windows: { copy: 'Ctrl+C' },
      linux: { copy: 'Ctrl+Shift+C' }
    }
    const config: any = {
      ...buildDefaultUserConfig(),
      shortcuts: platformShortcuts
    }

    const sanitized = sanitizeForSync(config)
    expect(sanitized.shortcuts).toEqual(platformShortcuts[getPlatformKey()])
  })

  it('applyRemoteConfig writes userConfig only when no meta is provided, writes both atomically when meta is provided', async () => {
    const kvStore = new Map<string, string>()
    const txWrites: string[][] = []

    kvStore.set(
      'userConfig',
      JSON.stringify({
        id: 'userConfig',
        updatedAt: 100,
        autoCompleteStatus: 1,
        vimStatus: false,
        quickVimStatus: 1,
        commonVimStatus: 2,
        aliasStatus: 1,
        highlightStatus: 1,
        pinchZoomStatus: 1,
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
        shortcuts: {},
        sshAgentsStatus: 2,
        sshAgentsMap: '[]',
        sshProxyConfigs: [],
        workspaceExpandedKeys: [],
        lastCustomImage: '',
        background: {
          mode: 'none',
          image: '',
          opacity: 0.15,
          brightness: 0.45
        }
      })
    )
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
        dirty: true
      })
    )

    const kvGet = vi.fn(async ({ key }: { key?: string }) => {
      if (!key || !kvStore.has(key)) {
        return null
      }
      return { key, value: kvStore.get(key)! }
    })

    const kvMutate = vi.fn(async ({ action, key, value }: { action: string; key: string; value?: string }) => {
      if (action === 'set' && value !== undefined) {
        kvStore.set(key, value)
        return
      }
      if (action === 'delete') {
        kvStore.delete(key)
      }
    })

    const kvTransaction = vi.fn(
      async (
        callback: (tx: {
          get(key: string): Promise<string | null>
          set(key: string, value: string): void
          delete(key: string): void
        }) => Promise<void>
      ) => {
        const ops: Array<{ action: 'set'; key: string; value: string } | { action: 'delete'; key: string }> = []
        await callback({
          get: async (key) => kvStore.get(key) ?? null,
          set: (key, value) => ops.push({ action: 'set', key, value }),
          delete: (key) => ops.push({ action: 'delete', key })
        })

        txWrites.push(ops.filter((op) => op.action === 'set').map((op) => op.key))

        for (const op of ops) {
          if (op.action === 'set') {
            kvStore.set(op.key, op.value)
          } else {
            kvStore.delete(op.key)
          }
        }
      }
    )

    ;(window as any).api = {
      kvGet,
      kvMutate,
      kvTransaction,
      updateTheme: vi.fn()
    }

    const { applyRemoteConfig } = await import('../userConfigStoreService')
    await applyRemoteConfig({ fontSize: 14 })

    expect(txWrites).toHaveLength(1)
    expect(txWrites[0]).toEqual(['userConfig'])

    // Now test with meta provided - should write both atomically
    txWrites.length = 0
    const meta = {
      schemaVersion: 1,
      lastPulledAt: Date.now(),
      lastPushedAt: 0,
      lastSyncedPayload: '{}',
      lastSyncedHash: 'sha256:abc',
      lastRemoteUpdatedAt: 1000,
      lastRemoteSchemaVersion: 1,
      schemaBlocked: false,
      dirty: false
    }
    await applyRemoteConfig({ scrollBack: 2000 }, meta, 'userConfigSyncMeta')

    expect(txWrites).toHaveLength(1)
    expect(txWrites[0]).toEqual(['userConfig', 'userConfigSyncMeta'])
  })

  it('applyRemoteConfig emits runtime terminal config updates for changed terminal settings', async () => {
    const kvStore = new Map<string, string>()
    kvStore.set(
      'userConfig',
      JSON.stringify({
        id: 'userConfig',
        updatedAt: 100,
        autoCompleteStatus: 1,
        vimStatus: false,
        quickVimStatus: 1,
        commonVimStatus: 2,
        aliasStatus: 1,
        highlightStatus: 1,
        pinchZoomStatus: 1,
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
        shortcuts: {},
        sshAgentsStatus: 2,
        sshAgentsMap: '[]',
        sshProxyConfigs: [],
        workspaceExpandedKeys: [],
        lastCustomImage: '',
        background: {
          mode: 'none',
          image: '',
          opacity: 0.15,
          brightness: 0.45
        }
      })
    )
    ;(window as any).api = {
      kvGet: vi.fn(async ({ key }: { key?: string }) => {
        if (!key || !kvStore.has(key)) {
          return null
        }
        return { key, value: kvStore.get(key)! }
      }),
      kvMutate: vi.fn(),
      kvTransaction: vi.fn(async (callback: (tx: { set(key: string, value: string): void }) => Promise<void>) => {
        const writes = new Map<string, string>()
        await callback({
          set: (key, value) => writes.set(key, value)
        } as any)
        writes.forEach((value, key) => kvStore.set(key, value))
      }),
      updateTheme: vi.fn()
    }

    const { applyRemoteConfig } = await import('../userConfigStoreService')
    const { TERMINAL_RUNTIME_CONFIG_CHANGED_EVENT } = await import('@/utils/terminalRuntimeConfig')

    await applyRemoteConfig({
      scrollBack: 5000,
      cursorStyle: 'underline'
    })

    expect(mockEventBusEmit).toHaveBeenCalledWith(TERMINAL_RUNTIME_CONFIG_CHANGED_EVENT, {
      scrollBack: 5000,
      cursorStyle: 'underline'
    })
  })

  it('buildDefaultUserConfig should include cursorBlink, lineHeight, and localEchoEnabled defaults', async () => {
    const { buildDefaultUserConfig } = await import('../userConfigStoreService')

    const config = buildDefaultUserConfig()

    expect(config.cursorBlink).toBe(true)
    expect(config.lineHeight).toBe(1)
    expect(config.localEchoEnabled).toBe(false)
  })

  it('sync whitelist and validators should support cursorBlink, lineHeight, and localEchoEnabled', async () => {
    const { SYNC_WHITELIST, SYNC_FIELD_VALIDATORS } = await import('../userConfigStoreService')

    expect(SYNC_WHITELIST).toContain('cursorBlink')
    expect(SYNC_WHITELIST).toContain('lineHeight')
    expect(SYNC_WHITELIST).toContain('localEchoEnabled')

    expect(SYNC_FIELD_VALIDATORS.cursorBlink(true)).toBe(true)
    expect(SYNC_FIELD_VALIDATORS.cursorBlink(false)).toBe(true)
    expect(SYNC_FIELD_VALIDATORS.cursorBlink('true' as any)).toBe(false)

    expect(SYNC_FIELD_VALIDATORS.lineHeight(1)).toBe(true)
    expect(SYNC_FIELD_VALIDATORS.lineHeight(2.5)).toBe(true)
    expect(SYNC_FIELD_VALIDATORS.lineHeight(3)).toBe(true)
    expect(SYNC_FIELD_VALIDATORS.lineHeight(0.9)).toBe(false)
    expect(SYNC_FIELD_VALIDATORS.lineHeight(3.1)).toBe(false)
    expect(SYNC_FIELD_VALIDATORS.lineHeight('1.5' as any)).toBe(false)

    expect(SYNC_FIELD_VALIDATORS.localEchoEnabled(true)).toBe(true)
    expect(SYNC_FIELD_VALIDATORS.localEchoEnabled(false)).toBe(true)
    expect(SYNC_FIELD_VALIDATORS.localEchoEnabled(1 as any)).toBe(false)
  })
})
