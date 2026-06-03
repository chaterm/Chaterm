import type { UserConfig } from '@/services/userConfigStoreService'

export const TERMINAL_RUNTIME_CONFIG_CHANGED_EVENT = 'terminalRuntimeConfigChanged'

export type TerminalRuntimeConfig = Pick<
  UserConfig,
  'fontSize' | 'fontFamily' | 'scrollBack' | 'cursorStyle' | 'cursorBlink' | 'lineHeight' | 'middleMouseEvent' | 'rightMouseEvent' | 'terminalType'
>

const TERMINAL_RUNTIME_CONFIG_KEYS: Array<keyof TerminalRuntimeConfig> = [
  'fontSize',
  'fontFamily',
  'scrollBack',
  'cursorStyle',
  'cursorBlink',
  'lineHeight',
  'middleMouseEvent',
  'rightMouseEvent',
  'terminalType'
]

type PartialTerminalRuntimeConfig = Partial<TerminalRuntimeConfig>

type TerminalOptionTarget = {
  options: {
    scrollback?: number
    fontSize?: number
    fontFamily?: string
    cursorStyle?: 'bar' | 'block' | 'underline'
    cursorBlink?: boolean
    lineHeight?: number
  }
}

export const pickTerminalRuntimeConfig = (
  config: Partial<UserConfig> | PartialTerminalRuntimeConfig | null | undefined
): PartialTerminalRuntimeConfig => {
  if (!config) return {}

  const picked: PartialTerminalRuntimeConfig = {}
  for (const key of TERMINAL_RUNTIME_CONFIG_KEYS) {
    const value = config[key]
    if (value !== undefined) {
      picked[key] = value as never
    }
  }
  return picked
}

export const diffTerminalRuntimeConfig = (
  previous: Partial<UserConfig> | null | undefined,
  next: Partial<UserConfig> | null | undefined
): PartialTerminalRuntimeConfig => {
  const changed: PartialTerminalRuntimeConfig = {}
  if (!next) return changed

  for (const key of TERMINAL_RUNTIME_CONFIG_KEYS) {
    const nextValue = next[key]
    if (nextValue !== undefined && previous?.[key] !== nextValue) {
      changed[key] = nextValue as never
    }
  }

  return changed
}

export const hasTerminalRuntimeConfig = (config: PartialTerminalRuntimeConfig): boolean => Object.keys(config).length > 0

export const applyTerminalRuntimeConfig = (
  terminal: TerminalOptionTarget | null | undefined,
  config: PartialTerminalRuntimeConfig
): { requiresResize: boolean } => {
  if (!terminal) {
    return { requiresResize: false }
  }

  let requiresResize = false

  if (typeof config.scrollBack === 'number') {
    terminal.options.scrollback = config.scrollBack
  }
  if (typeof config.fontSize === 'number') {
    terminal.options.fontSize = config.fontSize
    requiresResize = true
  }
  if (typeof config.fontFamily === 'string' && config.fontFamily.length > 0) {
    terminal.options.fontFamily = config.fontFamily
    requiresResize = true
  }
  if (config.cursorStyle) {
    terminal.options.cursorStyle = config.cursorStyle
  }
  if (typeof config.cursorBlink === 'boolean') {
    terminal.options.cursorBlink = config.cursorBlink
  }
  if (typeof config.lineHeight === 'number' && Number.isFinite(config.lineHeight)) {
    terminal.options.lineHeight = config.lineHeight
    requiresResize = true
  }

  return { requiresResize }
}
