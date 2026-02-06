import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useEditorConfigStore, FONT_FAMILY_OPTIONS } from '../editorConfig'

// Mock window.api
const mockApi = {
  getEditorConfig: vi.fn(),
  saveEditorConfig: vi.fn()
}

Object.defineProperty(window, 'api', {
  value: mockApi,
  writable: true
})

describe('EditorConfig Store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('should initialize with default config', () => {
    const store = useEditorConfigStore()

    expect(store.config.fontSize).toBe(14)
    expect(store.config.tabSize).toBe(4) // Updated default
    expect(store.config.wordWrap).toBe('off')
    expect(store.config.minimap).toBe(true)
    expect(store.config.mouseWheelZoom).toBe(true)
    // Don't test specific font family as it depends on platform
    expect(typeof store.config.fontFamily).toBe('string')
  })

  it('should provide platform-specific font options', () => {
    const options = FONT_FAMILY_OPTIONS

    // Should have at least some font options
    expect(options.length).toBeGreaterThan(0)

    // Each option should have value and labelKey
    options.forEach((opt) => {
      expect(opt.value).toBeDefined()
      expect(opt.labelKey).toBeDefined()
      expect(typeof opt.value).toBe('string')
      expect(typeof opt.labelKey).toBe('string')
    })

    // Should include system default
    expect(options.some((opt) => opt.value === 'system-default')).toBe(true)

    // Should not include fonts that need installation (check by labelKey pattern)
    expect(options.some((opt) => opt.labelKey.includes('install'))).toBe(false)
  })

  it('should generate correct Monaco options', () => {
    const store = useEditorConfigStore()

    const monacoOptions = store.monacoOptions

    expect(monacoOptions.fontSize).toBe(14)
    expect(monacoOptions.tabSize).toBe(4)
    expect(typeof monacoOptions.fontFamily).toBe('string')
    expect(monacoOptions.fontFamily).toContain('monospace') // Should always have monospace fallback
    expect(monacoOptions.wordWrap).toBe('off')
    expect(monacoOptions.minimap?.enabled).toBe(true)
    expect(monacoOptions.mouseWheelZoom).toBe(true)
  })

  it('should update config correctly', async () => {
    mockApi.saveEditorConfig.mockResolvedValue(undefined)

    const store = useEditorConfigStore()

    await store.updateConfig({
      fontSize: 16,
      tabSize: 2,
      fontFamily: 'system-default'
    })

    expect(store.config.fontSize).toBe(16)
    expect(store.config.tabSize).toBe(2)
    expect(store.config.fontFamily).toBe('system-default')
    expect(mockApi.saveEditorConfig).toHaveBeenCalledWith({
      fontSize: 16,
      fontFamily: 'system-default',
      tabSize: 2,
      wordWrap: 'off',
      minimap: true,
      mouseWheelZoom: true,
      cursorBlinking: 'blink',
      lineHeight: 0
    })
  })

  it('should load saved config correctly', async () => {
    const savedConfig = {
      fontSize: 18,
      fontFamily: 'system-default',
      tabSize: 8,
      wordWrap: 'on' as const,
      minimap: false,
      mouseWheelZoom: false,
      cursorBlinking: 'smooth' as const,
      lineHeight: 20
    }

    mockApi.getEditorConfig.mockResolvedValue(savedConfig)

    const store = useEditorConfigStore()
    await store.loadConfig()

    expect(store.config).toEqual(savedConfig)
  })

  it('should fallback to default font if saved font is invalid', async () => {
    const savedConfig = {
      fontSize: 16,
      fontFamily: 'invalid-font',
      tabSize: 4,
      wordWrap: 'off' as const,
      minimap: true,
      mouseWheelZoom: true,
      cursorBlinking: 'blink' as const,
      lineHeight: 0
    }

    mockApi.getEditorConfig.mockResolvedValue(savedConfig)

    const store = useEditorConfigStore()
    await store.loadConfig()

    // Should fallback to a valid font (not the invalid one)
    expect(store.config.fontFamily).not.toBe('invalid-font')
    expect(store.config.fontSize).toBe(16) // Other settings should be preserved
  })

  it('should reset to default config', async () => {
    mockApi.saveEditorConfig.mockResolvedValue(undefined)

    const store = useEditorConfigStore()

    // Change some values first
    await store.updateConfig({ fontSize: 20, tabSize: 8 })

    // Reset to defaults
    await store.resetConfig()

    expect(store.config.fontSize).toBe(14)
    expect(store.config.tabSize).toBe(4)
    // Font family should be some valid default
    expect(typeof store.config.fontFamily).toBe('string')
  })
})
