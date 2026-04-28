// src/shared/themes/types.ts

export type ThemeId =
  | 'auto'
  | 'dark'
  | 'light'
  | 'termius-dark'
  | 'termius-light'
  | 'flexoki-dark'
  | 'flexoki-light'
  | 'kanagawa-wave'
  | 'kanagawa-dragon'
  | 'kanagawa-lotus'
  | 'hacker-blue'
  | 'hacker-green'
  | 'dracula-night'
  | 'catppuccin-mocha'
  | 'catppuccin-latte'
  | 'gruvbox-dark'
  | 'nord-frost'

export type ConcreteThemeId = Exclude<ThemeId, 'auto'>

export type Appearance = 'dark' | 'light'

// xterm.js ITheme compatible subset
export interface TerminalThemeColors {
  background: string
  foreground: string
  cursor: string
  cursorAccent: string
  selectionBackground: string
  black: string
  red: string
  green: string
  yellow: string
  blue: string
  magenta: string
  cyan: string
  white: string
  brightBlack: string
  brightRed: string
  brightGreen: string
  brightYellow: string
  brightBlue: string
  brightMagenta: string
  brightCyan: string
  brightWhite: string
}

export interface TitleBarOverlay {
  color: string
  symbolColor: string
  height: number
}

// UiTokens mirrors every CSS custom property defined under
// .theme-dark / .theme-light in src/renderer/src/assets/theme.less.
// Applied as inline styles on <html> so they win over the class-scoped values.
export interface UiTokens {
  // Background layers
  '--bg-color': string
  '--bg-color-secondary': string
  '--bg-color-tertiary': string
  '--bg-color-quaternary': string
  '--bg-color-quinary': string
  '--bg-color-senary': string
  '--bg-color-septenary': string
  '--bg-color-octonary': string
  '--bg-color-novenary': string
  '--bg-color-suggestion': string
  '--bg-color-vim-editor': string
  '--bg-color-switch': string
  '--bg-color-default': string

  // Text
  '--text-color': string
  '--text-color-secondary': string
  '--text-color-secondary-light': string
  '--text-color-tertiary': string
  '--text-color-quaternary': string
  '--text-color-quinary': string
  '--text-color-senary': string
  '--text-color-septenary': string

  // Borders / splitters
  '--border-color': string
  '--border-color-light': string
  '--splitter-color': string

  // Interactive states
  '--hover-bg-color': string
  '--active-bg-color': string
  '--watermark-color': string

  // Icons / buttons
  '--icon-filter': string
  '--globalInput-bg-color': string
  '--button-bg-color': string
  '--box-shadow': string
  '--button-default-bg-color': string

  // Form components
  '--input-number-bg': string
  '--input-number-hover-bg': string
  '--select-bg': string
  '--select-hover-bg': string
  '--select-border': string

  // Enhanced component colors
  '--card-bg': string
  '--card-border': string
  '--card-shadow': string
  '--command-output-bg': string
  '--input-focus-border': string
  '--input-focus-shadow': string
  '--button-hover-bg': string
  '--button-active-bg': string
  '--success-color': string
  '--warning-color': string
  '--error-color': string
  '--info-color': string

  // Scrollbar
  '--scrollbar-track-color': string
  '--scrollbar-thumb-color': string
  '--scrollbar-thumb-hover-color': string
}

export interface ThemePreset {
  id: ConcreteThemeId
  name: string
  appearance: Appearance
  uiTokens: UiTokens
  terminalTheme: TerminalThemeColors
  titleBarOverlay: TitleBarOverlay
  // Optional Monaco override; when omitted, falls back to vs / vs-dark by appearance.
  monacoTheme?: {
    base: 'vs' | 'vs-dark'
    colors: Record<string, string>
  }
}

// updateTheme eventBus payload (new shape)
export interface ThemeChangePayload {
  themeId: ThemeId
  appearance: Appearance
  preset: ThemePreset
}
