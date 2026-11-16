import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetConfig, mockSaveConfig } = vi.hoisted(() => ({
  mockGetConfig: vi.fn(),
  mockSaveConfig: vi.fn().mockResolvedValue(undefined)
}))

vi.mock('../userConfigStoreService', () => ({
  userConfigStore: { getConfig: mockGetConfig, saveConfig: mockSaveConfig }
}))

vi.mock('@/utils/eventBus', () => ({
  default: { on: vi.fn(), off: vi.fn(), emit: vi.fn() }
}))

const originalPlatform = navigator.platform
const setPlatform = (platform: string) => {
  Object.defineProperty(navigator, 'platform', { value: platform, configurable: true })
}

// Every freshly imported service registers its own document listener, so keep them to remove after each test.
const createdServices: Array<{ destroy: () => void }> = []

const loadService = async () => {
  vi.resetModules()
  const { shortcutService } = await import('../shortcutService')
  const { shortcutActions } = await import('@/config/shortcutActions')
  createdServices.push(shortcutService)
  return { shortcutService, shortcutActions }
}

// Mirrors the real store: saveConfig persists, so the next getConfig sees it.
let storedShortcuts: Record<string, string> | undefined
const useStoredShortcuts = (shortcuts: Record<string, string>) => {
  storedShortcuts = shortcuts
  mockGetConfig.mockImplementation(async () => ({ shortcuts: storedShortcuts }))
  mockSaveConfig.mockImplementation(async (config: { shortcuts: Record<string, string> }) => {
    storedShortcuts = config.shortcuts
  })
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

afterEach(() => {
  createdServices.splice(0).forEach((service) => service.destroy())
  setPlatform(originalPlatform)
})

describe('shortcut defaults', () => {
  it('has no two actions sharing the same default key on any platform', async () => {
    const { shortcutActions } = await loadService()

    for (const platform of ['mac', 'other'] as const) {
      const keys = shortcutActions.map((action) => action.defaultKey[platform])
      expect(new Set(keys).size).toBe(keys.length)
    }
  })

  it('binds quick jump to Command/Ctrl+P and the AI sidebar to Command+L / Alt+L', async () => {
    const { shortcutActions } = await loadService()
    const byId = (id: string) => shortcutActions.find((action) => action.id === id)

    expect(byId('quickJump')?.defaultKey).toEqual({ mac: 'Command+P', other: 'Ctrl+P' })
    expect(byId('sendOrToggleAi')?.defaultKey).toEqual({ mac: 'Command+L', other: 'Alt+L' })
  })

  it('no longer offers a clear terminal shortcut', async () => {
    const { shortcutActions } = await loadService()

    expect(shortcutActions.some((action) => action.id === 'clearTerminal')).toBe(false)
  })
})

describe('ShortcutService.loadShortcuts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setPlatform('Win32')
  })

  it('replaces a never-customized legacy AI shortcut on non-mac, writes it back and then stays quiet', async () => {
    useStoredShortcuts({ sendOrToggleAi: 'Ctrl+L', openSettings: 'Ctrl+,' })
    const { shortcutService } = await loadService()

    await shortcutService.loadShortcuts()
    await settle()

    expect(shortcutService.getShortcuts()!.sendOrToggleAi).toBe('Alt+L')
    expect(storedShortcuts!.sendOrToggleAi).toBe('Alt+L')
    expect(storedShortcuts!.openSettings).toBe('Ctrl+,')

    mockSaveConfig.mockClear()
    await shortcutService.loadShortcuts()
    expect(mockSaveConfig).not.toHaveBeenCalled()
  })

  it('keeps a customized AI shortcut and does not write anything back', async () => {
    mockGetConfig.mockResolvedValue({ shortcuts: { sendOrToggleAi: 'Ctrl+Shift+L' } })
    const { shortcutService } = await loadService()

    await shortcutService.loadShortcuts()

    expect(shortcutService.getShortcuts()!.sendOrToggleAi).toBe('Ctrl+Shift+L')
    expect(mockSaveConfig).not.toHaveBeenCalled()
  })

  it('leaves Command+L on mac untouched', async () => {
    setPlatform('MacIntel')
    mockGetConfig.mockResolvedValue({ shortcuts: { sendOrToggleAi: 'Command+L' } })
    const { shortcutService } = await loadService()

    await shortcutService.loadShortcuts()

    expect(shortcutService.getShortcuts()!.sendOrToggleAi).toBe('Command+L')
    expect(mockSaveConfig).not.toHaveBeenCalled()
  })

  it('does not treat Ctrl+L as legacy on mac', async () => {
    setPlatform('MacIntel')
    mockGetConfig.mockResolvedValue({ shortcuts: { sendOrToggleAi: 'Ctrl+L' } })
    const { shortcutService } = await loadService()

    await shortcutService.loadShortcuts()

    expect(shortcutService.getShortcuts()!.sendOrToggleAi).toBe('Ctrl+L')
    expect(mockSaveConfig).not.toHaveBeenCalled()
  })

  it('drops saved ids that no longer map to an action, so their key is free again', async () => {
    useStoredShortcuts({ clearTerminal: 'Ctrl+P', openSettings: 'Ctrl+,' })
    const { shortcutService } = await loadService()

    await shortcutService.loadShortcuts()
    await settle()

    const current = shortcutService.getShortcuts()!
    expect(current).not.toHaveProperty('clearTerminal')
    expect(current.quickJump).toBe('Ctrl+P')
    expect(storedShortcuts).not.toHaveProperty('clearTerminal')
    expect(storedShortcuts!.openSettings).toBe('Ctrl+,')
  })

  it('lets the user bind a key that a removed action used to hold', async () => {
    useStoredShortcuts({ clearTerminal: 'Ctrl+Shift+K' })
    const { shortcutService } = await loadService()
    await shortcutService.loadShortcuts()

    const ok = await shortcutService.updateShortcut('openFileManager', 'Ctrl+Shift+K')

    expect(ok).toBe(true)
    expect(storedShortcuts!.openFileManager).toBe('Ctrl+Shift+K')
  })

  it('fills in defaults for actions missing from the saved config', async () => {
    mockGetConfig.mockResolvedValue({ shortcuts: { openSettings: 'Ctrl+.' } })
    const { shortcutService } = await loadService()

    await shortcutService.loadShortcuts()

    const current = shortcutService.getShortcuts()!
    expect(current.openSettings).toBe('Ctrl+.')
    expect(current.quickJump).toBe('Ctrl+P')
    expect(current.sendOrToggleAi).toBe('Alt+L')
    expect(mockSaveConfig).not.toHaveBeenCalled()
  })

  it('triggers quick jump from Ctrl+P and the AI sidebar from Alt+L, and leaves Ctrl+L for the terminal', async () => {
    mockGetConfig.mockResolvedValue({ shortcuts: { quickJump: 'Ctrl+P', sendOrToggleAi: 'Alt+L' } })
    const { shortcutService } = await loadService()
    const { default: eventBus } = await import('@/utils/eventBus')
    await shortcutService.loadShortcuts()

    const fire = (init: KeyboardEventInit) => {
      const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init })
      document.dispatchEvent(event)
      return event
    }

    const quickJump = fire({ key: 'p', ctrlKey: true })
    expect(eventBus.emit).toHaveBeenCalledWith('toggleQuickJump')
    expect(quickJump.defaultPrevented).toBe(true)

    const ai = fire({ key: 'l', altKey: true })
    expect(eventBus.emit).toHaveBeenCalledWith('sendOrToggleAiFromTerminal')
    expect(ai.defaultPrevented).toBe(true)

    vi.mocked(eventBus.emit).mockClear()
    const clear = fire({ key: 'l', ctrlKey: true })
    expect(eventBus.emit).not.toHaveBeenCalled()
    expect(clear.defaultPrevented).toBe(false)
  })

  it('swallows load errors', async () => {
    mockGetConfig.mockRejectedValue(new Error('boom'))
    const { shortcutService } = await loadService()

    await expect(shortcutService.loadShortcuts()).resolves.toBeUndefined()
  })
})
