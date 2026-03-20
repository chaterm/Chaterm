import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockGetStoredUserConfigSnapshot,
  mockResolveDataSyncPreference,
  mockChatSyncInitialize,
  mockChatSyncEnable,
  mockChatSyncDisable,
  mockChatSyncReset,
  mockUserConfigSyncInitialize,
  mockUserConfigSyncStop,
  mockUserConfigSyncReset,
  mockEditorConfigSyncInitialize,
  mockEditorConfigSyncStop,
  mockEditorConfigSyncReset,
  mockUserRulesSyncInitialize,
  mockUserRulesSyncStop,
  mockUserRulesSyncReset,
  mockAiPreferencesSyncInitialize,
  mockAiPreferencesSyncStop,
  mockAiPreferencesSyncReset
} = vi.hoisted(() => ({
  mockGetStoredUserConfigSnapshot: vi.fn(),
  mockResolveDataSyncPreference: vi.fn(),
  mockChatSyncInitialize: vi.fn(),
  mockChatSyncEnable: vi.fn(),
  mockChatSyncDisable: vi.fn(),
  mockChatSyncReset: vi.fn(),
  mockUserConfigSyncInitialize: vi.fn(),
  mockUserConfigSyncStop: vi.fn(),
  mockUserConfigSyncReset: vi.fn(),
  mockEditorConfigSyncInitialize: vi.fn(),
  mockEditorConfigSyncStop: vi.fn(),
  mockEditorConfigSyncReset: vi.fn(),
  mockUserRulesSyncInitialize: vi.fn(),
  mockUserRulesSyncStop: vi.fn(),
  mockUserRulesSyncReset: vi.fn(),
  mockAiPreferencesSyncInitialize: vi.fn(),
  mockAiPreferencesSyncStop: vi.fn(),
  mockAiPreferencesSyncReset: vi.fn()
}))

vi.mock('../userConfigStoreService', () => ({
  getStoredUserConfigSnapshot: mockGetStoredUserConfigSnapshot,
  resolveDataSyncPreference: mockResolveDataSyncPreference
}))

vi.mock('../chatSyncService', () => ({
  chatSyncService: {
    initialize: mockChatSyncInitialize,
    enable: mockChatSyncEnable,
    disable: mockChatSyncDisable,
    reset: mockChatSyncReset
  }
}))

vi.mock('../userConfigSyncService', () => ({
  userConfigSyncService: {
    initialize: mockUserConfigSyncInitialize,
    stop: mockUserConfigSyncStop,
    reset: mockUserConfigSyncReset
  }
}))

vi.mock('../editorConfigSyncService', () => ({
  editorConfigSyncService: {
    initialize: mockEditorConfigSyncInitialize,
    stop: mockEditorConfigSyncStop,
    reset: mockEditorConfigSyncReset
  }
}))

vi.mock('../userRulesSyncService', () => ({
  userRulesSyncService: {
    initialize: mockUserRulesSyncInitialize,
    stop: mockUserRulesSyncStop,
    reset: mockUserRulesSyncReset
  }
}))

vi.mock('../aiPreferencesSyncService', () => ({
  aiPreferencesSyncService: {
    initialize: mockAiPreferencesSyncInitialize,
    stop: mockAiPreferencesSyncStop,
    reset: mockAiPreferencesSyncReset
  }
}))

describe('DataSyncService', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    ;(window as any).api = {
      setDataSyncEnabled: vi.fn(async () => ({ success: true }))
    }

    vi.spyOn(Storage.prototype, 'getItem').mockImplementation((key: string) => {
      if (key === 'login-skipped') return null
      if (key === 'ctm-token') return 'test-token'
      return null
    })

    mockGetStoredUserConfigSnapshot.mockResolvedValue({})
    mockResolveDataSyncPreference.mockReturnValue('enabled')
    mockChatSyncInitialize.mockResolvedValue(undefined)
    mockChatSyncEnable.mockResolvedValue(true)
    mockChatSyncDisable.mockResolvedValue(true)
    mockUserConfigSyncInitialize.mockResolvedValue(undefined)
    mockEditorConfigSyncInitialize.mockResolvedValue(undefined)
    mockUserRulesSyncInitialize.mockResolvedValue(undefined)
    mockAiPreferencesSyncInitialize.mockResolvedValue(undefined)
  })

  it('enables chat sync and all config sync services when dataSync is enabled', async () => {
    const { dataSyncService } = await import('../dataSyncService')

    const ok = await dataSyncService.enableDataSync()

    expect(ok).toBe(true)
    expect((window as any).api.setDataSyncEnabled).toHaveBeenCalledWith(true)
    expect(mockChatSyncEnable).toHaveBeenCalledTimes(1)
    expect(mockUserConfigSyncInitialize).toHaveBeenCalledTimes(1)
    expect(mockEditorConfigSyncInitialize).toHaveBeenCalledTimes(1)
    expect(mockUserRulesSyncInitialize).toHaveBeenCalledTimes(1)
    expect(mockAiPreferencesSyncInitialize).toHaveBeenCalledTimes(1)
  })

  it('disables chat sync and stops all config sync services when dataSync is disabled', async () => {
    const { dataSyncService } = await import('../dataSyncService')

    const ok = await dataSyncService.disableDataSync()

    expect(ok).toBe(true)
    expect((window as any).api.setDataSyncEnabled).toHaveBeenCalledWith(false)
    expect(mockChatSyncDisable).toHaveBeenCalledTimes(1)
    expect(mockUserConfigSyncStop).toHaveBeenCalledTimes(1)
    expect(mockEditorConfigSyncStop).toHaveBeenCalledTimes(1)
    expect(mockUserRulesSyncStop).toHaveBeenCalledTimes(1)
    expect(mockAiPreferencesSyncStop).toHaveBeenCalledTimes(1)
  })

  it('does not initialize chat sync when dataSync preference is disabled at startup', async () => {
    mockResolveDataSyncPreference.mockReturnValue('disabled')

    const { dataSyncService } = await import('../dataSyncService')
    await dataSyncService.initialize()

    expect(mockChatSyncInitialize).not.toHaveBeenCalled()
    expect(mockChatSyncEnable).not.toHaveBeenCalled()
  })
})
