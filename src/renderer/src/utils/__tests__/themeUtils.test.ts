import { beforeEach, describe, expect, it, vi } from 'vitest'
import { THEME_PRESETS } from '../../../../shared/themes/presets'

const { mockGetConfig } = vi.hoisted(() => ({
  mockGetConfig: vi.fn()
}))

vi.mock('../../services/userConfigStoreService', () => ({
  userConfigStore: {
    getConfig: mockGetConfig
  }
}))

import { initializeThemeFromDatabase } from '../themeUtils'

function setSystemTheme(theme: 'dark' | 'light') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn((query: string) => ({
      matches: query.includes(theme),
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn()
    }))
  })
}

describe('initializeThemeFromDatabase', () => {
  beforeEach(() => {
    document.documentElement.className = ''
    document.documentElement.removeAttribute('data-theme-id')
    document.documentElement.style.cssText = ''
    localStorage.clear()
    mockGetConfig.mockReset()
    ;(globalThis as any).window.api = {
      mainWindowShow: vi.fn()
    }
  })

  it('applies a saved preset theme before showing the window', async () => {
    setSystemTheme('dark')
    mockGetConfig.mockResolvedValue({ theme: 'kanagawa-wave' })

    await initializeThemeFromDatabase()

    expect(document.documentElement.className).toBe('theme-dark')
    expect(document.documentElement.dataset.themeId).toBe('kanagawa-wave')
    expect(document.documentElement.style.getPropertyValue('--bg-color')).toBe(THEME_PRESETS['kanagawa-wave'].uiTokens['--bg-color'])
    expect(window.api.mainWindowShow).toHaveBeenCalledTimes(1)
  })

  it('resolves auto to the current system theme on startup', async () => {
    setSystemTheme('light')
    mockGetConfig.mockResolvedValue({ theme: 'auto' })

    await initializeThemeFromDatabase()

    expect(document.documentElement.className).toBe('theme-light')
    expect(document.documentElement.dataset.themeId).toBe('light')
    expect(document.documentElement.style.getPropertyValue('--bg-color')).toBe(THEME_PRESETS.light.uiTokens['--bg-color'])
    expect(window.api.mainWindowShow).toHaveBeenCalledTimes(1)
  })
})
