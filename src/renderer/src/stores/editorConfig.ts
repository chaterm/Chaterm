import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { editor } from 'monaco-editor'

/**
 * Editor configuration interface
 */
export interface EditorConfig {
  /** Font size (px) */
  fontSize: number
  /** Font family */
  fontFamily: string
  /** Tab size (spaces) */
  tabSize: number
  /** Word wrap setting */
  wordWrap: 'off' | 'on' | 'wordWrapColumn' | 'bounded'
  /** Show minimap */
  minimap: boolean
  /** Enable mouse wheel zoom */
  mouseWheelZoom: boolean
  /** Cursor blinking style */
  cursorBlinking: 'blink' | 'smooth' | 'phase' | 'expand' | 'solid'
  /** Line height (0 for auto) */
  lineHeight: number
}

/**
 * Font configuration definition
 */
interface FontConfig {
  key: string
  labelKey: string // i18n key for label
  cssFamily: string
  platforms: ('windows' | 'macos' | 'linux')[]
}

// Predefined font configurations - only system default fonts, no installation required
const FONT_CONFIGS: FontConfig[] = [
  // Windows system fonts
  {
    key: 'cascadia-mono',
    labelKey: 'user.fontCascadiaMono',
    cssFamily: '"Cascadia Mono", monospace',
    platforms: ['windows']
  },
  {
    key: 'consolas',
    labelKey: 'user.fontConsolas',
    cssFamily: 'Consolas, monospace',
    platforms: ['windows']
  },
  {
    key: 'courier-new-win',
    labelKey: 'user.fontCourierNew',
    cssFamily: '"Courier New", monospace',
    platforms: ['windows']
  },
  {
    key: 'lucida-console',
    labelKey: 'user.fontLucidaConsole',
    cssFamily: '"Lucida Console", monospace',
    platforms: ['windows']
  },

  // macOS system fonts
  {
    key: 'sf-mono',
    labelKey: 'user.fontSfMono',
    cssFamily: '"SF Mono", monospace',
    platforms: ['macos']
  },
  {
    key: 'monaco',
    labelKey: 'user.fontMonaco',
    cssFamily: 'Monaco, monospace',
    platforms: ['macos']
  },
  {
    key: 'menlo',
    labelKey: 'user.fontMenlo',
    cssFamily: 'Menlo, monospace',
    platforms: ['macos']
  },
  {
    key: 'courier-new-mac',
    labelKey: 'user.fontCourierNew',
    cssFamily: '"Courier New", monospace',
    platforms: ['macos']
  },

  // Linux system fonts
  {
    key: 'ubuntu-mono',
    labelKey: 'user.fontUbuntuMono',
    cssFamily: '"Ubuntu Mono", monospace',
    platforms: ['linux']
  },
  {
    key: 'dejavu-sans-mono',
    labelKey: 'user.fontDejavuSansMono',
    cssFamily: '"DejaVu Sans Mono", monospace',
    platforms: ['linux']
  },
  {
    key: 'liberation-mono',
    labelKey: 'user.fontLiberationMono',
    cssFamily: '"Liberation Mono", monospace',
    platforms: ['linux']
  },
  {
    key: 'courier-new-linux',
    labelKey: 'user.fontCourierNew',
    cssFamily: '"Courier New", monospace',
    platforms: ['linux']
  },

  // Universal fallback
  {
    key: 'system-default',
    labelKey: 'user.fontSystemDefault',
    cssFamily: 'monospace',
    platforms: ['windows', 'macos', 'linux']
  }
]

/**
 * Get current platform
 */
function getCurrentPlatform(): 'windows' | 'macos' | 'linux' {
  const platform = navigator.platform.toLowerCase()
  const userAgent = navigator.userAgent.toLowerCase()

  if (platform.includes('win') || userAgent.includes('windows')) {
    return 'windows'
  }
  if (platform.includes('mac') || userAgent.includes('mac')) {
    return 'macos'
  }
  return 'linux'
}

/**
 * Get font options for current platform
 */
function getPlatformFontOptions(): Array<{ value: string; labelKey: string }> {
  const currentPlatform = getCurrentPlatform()

  return FONT_CONFIGS.filter((font) => font.platforms.includes(currentPlatform)).map((font) => ({
    value: font.key,
    labelKey: font.labelKey
  }))
}

/**
 * Get CSS font family string for a font key
 */
export function getFontFamily(fontKey: string): string {
  const fontConfig = FONT_CONFIGS.find((f) => f.key === fontKey)
  return fontConfig?.cssFamily || 'monospace'
}

/**
 * Get default font key for current platform
 */
function getDefaultFontKey(): string {
  const currentPlatform = getCurrentPlatform()

  // Platform-specific default fonts
  const platformDefaults = {
    windows: 'cascadia-mono',
    macos: 'sf-mono',
    linux: 'ubuntu-mono'
  }

  const defaultKey = platformDefaults[currentPlatform]

  // Ensure default font is in current platform's supported list
  const supportedFonts = FONT_CONFIGS.filter((f) => f.platforms.includes(currentPlatform))
  const hasDefault = supportedFonts.some((f) => f.key === defaultKey)

  return hasDefault ? defaultKey : 'system-default'
}

// Export font options for UI components
export const FONT_FAMILY_OPTIONS = getPlatformFontOptions()

/**
 * Default editor configuration
 */
const DEFAULT_CONFIG: EditorConfig = {
  fontSize: 14,
  fontFamily: getDefaultFontKey(),
  tabSize: 4, // Changed to 4 spaces for better programming habits
  wordWrap: 'off',
  minimap: true,
  mouseWheelZoom: true,
  cursorBlinking: 'blink',
  lineHeight: 0
}

const logger = createRendererLogger('store.editorConfig')

/**
 * Editor configuration store
 */
export const useEditorConfigStore = defineStore('editorConfig', () => {
  // Configuration state
  const config = ref<EditorConfig>({ ...DEFAULT_CONFIG })

  /**
   * Convert to Monaco Editor options
   */
  const monacoOptions = computed<editor.IStandaloneEditorConstructionOptions>(() => ({
    fontSize: config.value.fontSize,
    fontFamily: getFontFamily(config.value.fontFamily),
    tabSize: config.value.tabSize,
    wordWrap: config.value.wordWrap,
    minimap: {
      enabled: config.value.minimap
    },
    mouseWheelZoom: config.value.mouseWheelZoom,
    cursorBlinking: config.value.cursorBlinking,
    lineHeight: config.value.lineHeight || 0
  }))

  /**
   * Load configuration from main process
   */
  const loadConfig = async () => {
    try {
      const savedConfig = await (window as any).api.getEditorConfig()

      if (savedConfig) {
        // Validate saved font is in supported list
        const fontKey = savedConfig.fontFamily
        const isValidFont = FONT_CONFIGS.some((f) => f.key === fontKey)

        config.value = {
          ...DEFAULT_CONFIG,
          ...savedConfig,
          fontFamily: isValidFont ? fontKey : DEFAULT_CONFIG.fontFamily
        }
      }
    } catch (error) {
      logger.error('Failed to load editor config', { error: error })
    }
  }

  /**
   * Save config to main process. Build plain object to avoid IPC "object could not be cloned" (Vue Proxy).
   */
  const saveConfig = async () => {
    try {
      const c = config.value
      const plain: EditorConfig = {
        fontSize: Number(c.fontSize),
        fontFamily: String(c.fontFamily),
        tabSize: Number(c.tabSize),
        wordWrap: c.wordWrap,
        minimap: Boolean(c.minimap),
        mouseWheelZoom: Boolean(c.mouseWheelZoom),
        cursorBlinking: c.cursorBlinking,
        lineHeight: Number(c.lineHeight)
      }
      await (window as any).api.saveEditorConfig(plain)
    } catch (error) {
      logger.error('Failed to save editor config', { error: error })
      throw error
    }
  }

  /**
   * Update configuration
   */
  const updateConfig = async (newConfig: Partial<EditorConfig>) => {
    config.value = { ...config.value, ...newConfig }
    await saveConfig()
  }

  /**
   * Reset to default configuration
   */
  const resetConfig = async () => {
    config.value = { ...DEFAULT_CONFIG }
    await saveConfig()
  }

  /**
   * Return a plain snapshot of current config (for form binding / copying)
   */
  const getConfigSnapshot = (): EditorConfig => {
    return { ...config.value }
  }

  return {
    config,
    monacoOptions,
    loadConfig,
    saveConfig,
    updateConfig,
    resetConfig,
    getConfigSnapshot
  }
})
