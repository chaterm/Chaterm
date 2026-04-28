// src/shared/themes/__tests__/presets.test.ts
import { describe, it, expect } from 'vitest'
import { THEME_PRESETS } from '../presets'

const EXPECTED_THEMES = [
  'dark',
  'light',
  'termius-dark',
  'termius-light',
  'flexoki-dark',
  'flexoki-light',
  'kanagawa-wave',
  'kanagawa-dragon',
  'kanagawa-lotus',
  'hacker-blue',
  'hacker-green',
  'dracula-night',
  'catppuccin-mocha',
  'catppuccin-latte',
  'gruvbox-dark',
  'nord-frost'
] as const

// Spot-check: a preset must carry the core variables theme.less used to own.
// We only assert hex shape on pure-color keys (the rgba/filter/shadow ones are
// intentionally non-hex).
const UI_TOKEN_HEX_KEYS = ['--bg-color', '--bg-color-secondary', '--bg-color-tertiary', '--text-color', '--text-color-secondary', '--button-bg-color']

const UI_TOKEN_REQUIRED_KEYS = [
  ...UI_TOKEN_HEX_KEYS,
  '--hover-bg-color',
  '--active-bg-color',
  '--border-color',
  '--border-color-light',
  '--icon-filter',
  '--box-shadow',
  '--input-focus-shadow',
  '--scrollbar-thumb-color'
]

const TERMINAL_KEYS = [
  'background',
  'foreground',
  'cursor',
  'cursorAccent',
  'selectionBackground',
  'black',
  'red',
  'green',
  'yellow',
  'blue',
  'magenta',
  'cyan',
  'white',
  'brightBlack',
  'brightRed',
  'brightGreen',
  'brightYellow',
  'brightBlue',
  'brightMagenta',
  'brightCyan',
  'brightWhite'
]

const TUNED_UI_EXPECTATIONS = {
  'termius-dark': {
    '--bg-color': '#101722',
    '--bg-color-secondary': '#16202c',
    '--text-color': '#e3ebf6',
    '--text-color-secondary': '#a5b3c5',
    '--border-color': '#223145',
    '--button-bg-color': '#5b8fff'
  },
  'termius-light': {
    '--bg-color': '#f4f7fb',
    '--bg-color-secondary': '#ffffff',
    '--text-color': '#1d2835',
    '--text-color-secondary': '#617385',
    '--border-color': '#d8e0eb',
    '--button-bg-color': '#3d74f2'
  },
  'flexoki-dark': {
    '--bg-color': '#130f0c',
    '--bg-color-secondary': '#191410',
    '--text-color': '#ddd2bf',
    '--text-color-secondary': '#b6a18b',
    '--border-color': '#38291f',
    '--button-bg-color': '#b06a2f'
  },
  'flexoki-light': {
    '--bg-color': '#f7efdf',
    '--bg-color-secondary': '#fdf7ea',
    '--text-color': '#372e25',
    '--text-color-secondary': '#80705f',
    '--border-color': '#dccbb5',
    '--button-bg-color': '#b37a33'
  },
  'kanagawa-wave': {
    '--bg-color': '#141625',
    '--bg-color-secondary': '#1a1d2f',
    '--text-color': '#d8d5c2',
    '--text-color-secondary': '#9f9cb0',
    '--border-color': '#2a2f49',
    '--button-bg-color': '#86a2ff'
  },
  'kanagawa-dragon': {
    '--bg-color': '#18110f',
    '--bg-color-secondary': '#221715',
    '--text-color': '#dbc9c2',
    '--text-color-secondary': '#b79c93',
    '--border-color': '#472c28',
    '--button-bg-color': '#c17563'
  },
  'kanagawa-lotus': {
    '--bg-color': '#fff2ec',
    '--bg-color-secondary': '#fff8f5',
    '--text-color': '#625565',
    '--text-color-secondary': '#8a788b',
    '--border-color': '#e6d2d6',
    '--button-bg-color': '#b47edc'
  },
  'hacker-blue': {
    '--bg-color': '#090d12',
    '--bg-color-secondary': '#0d131b',
    '--text-color': '#d2e7ff',
    '--text-color-secondary': '#89a7c8',
    '--border-color': '#17304e',
    '--button-bg-color': '#3f8cff'
  },
  'hacker-green': {
    '--bg-color': '#090f0c',
    '--bg-color-secondary': '#0d1511',
    '--text-color': '#d8f3df',
    '--text-color-secondary': '#8daf97',
    '--border-color': '#153125',
    '--button-bg-color': '#46c978'
  },
  'dracula-night': {
    '--bg-color': '#1f1f2c',
    '--bg-color-secondary': '#262737',
    '--text-color': '#f6f3ff',
    '--text-color-secondary': '#c3bdd7',
    '--border-color': '#3a3554',
    '--button-bg-color': '#bd93f9'
  },
  'catppuccin-mocha': {
    '--bg-color': '#181825',
    '--bg-color-secondary': '#1f2030',
    '--text-color': '#d9e0f6',
    '--text-color-secondary': '#b2bbdb',
    '--border-color': '#31354f',
    '--button-bg-color': '#8caaee'
  },
  'catppuccin-latte': {
    '--bg-color': '#f2f0f8',
    '--bg-color-secondary': '#fcfafc',
    '--text-color': '#4c4f69',
    '--text-color-secondary': '#6d6f89',
    '--border-color': '#d9d3e5',
    '--button-bg-color': '#8c6be8'
  },
  'gruvbox-dark': {
    '--bg-color': '#171611',
    '--bg-color-secondary': '#1f1d18',
    '--text-color': '#dbd6bb',
    '--text-color-secondary': '#b1a88a',
    '--border-color': '#383527',
    '--button-bg-color': '#98a84d'
  },
  'nord-frost': {
    '--bg-color': '#242a35',
    '--bg-color-secondary': '#2b3240',
    '--text-color': '#e4ebf5',
    '--text-color-secondary': '#b7c4d5',
    '--border-color': '#3b465a',
    '--button-bg-color': '#7fa7d8'
  }
} as const

const DISPLAY_NAME_EXPECTATIONS = {
  dark: 'Dark',
  light: 'Light',
  'termius-dark': 'Graphite Dark',
  'termius-light': 'Mist Light',
  'flexoki-dark': 'Ember Earth',
  'flexoki-light': 'Canvas Paper',
  'kanagawa-wave': 'Tide Indigo',
  'kanagawa-dragon': 'Forge Copper',
  'kanagawa-lotus': 'Dawn Petal',
  'hacker-blue': 'Pulse Blue',
  'hacker-green': 'Pulse Green',
  'dracula-night': 'Eclipse Violet',
  'catppuccin-mocha': 'Truffle Mocha',
  'catppuccin-latte': 'Cream Latte',
  'gruvbox-dark': 'Grove Moss',
  'nord-frost': 'Fjord Ice'
} as const

describe('THEME_PRESETS', () => {
  it('registers every expected theme id', () => {
    for (const id of EXPECTED_THEMES) {
      expect(THEME_PRESETS[id], `missing preset: ${id}`).toBeDefined()
      expect(THEME_PRESETS[id].id).toBe(id)
    }
  })

  it('each preset has all required uiTokens', () => {
    for (const id of EXPECTED_THEMES) {
      const p = THEME_PRESETS[id]
      for (const key of UI_TOKEN_REQUIRED_KEYS) {
        const v = (p.uiTokens as any)[key]
        expect(typeof v === 'string' && v.length > 0, `${id} missing ${key}`).toBe(true)
      }
      for (const key of UI_TOKEN_HEX_KEYS) {
        expect((p.uiTokens as any)[key], `${id}.${key} not hex`).toMatch(/^#[0-9A-Fa-f]{6}$/)
      }
    }
  })

  it('each preset has all required terminal colors as valid hex', () => {
    for (const id of EXPECTED_THEMES) {
      const t = THEME_PRESETS[id].terminalTheme as any
      for (const key of TERMINAL_KEYS) {
        expect(t[key], `${id}.${key} not hex`).toMatch(/^#[0-9A-Fa-f]{6}$/)
      }
    }
  })

  it('each preset has a titleBarOverlay with height 27', () => {
    for (const id of EXPECTED_THEMES) {
      const o = THEME_PRESETS[id].titleBarOverlay
      expect(o.height).toBe(27)
      expect(o.color).toMatch(/^#[0-9A-Fa-f]{6}$/)
      expect(o.symbolColor).toMatch(/^#[0-9A-Fa-f]{6}$/)
    }
  })

  it('uses restrained curated ui tokens for non-default official themes', () => {
    for (const [id, expected] of Object.entries(TUNED_UI_EXPECTATIONS)) {
      const preset = THEME_PRESETS[id as keyof typeof TUNED_UI_EXPECTATIONS]
      for (const [token, value] of Object.entries(expected)) {
        expect((preset.uiTokens as unknown as Record<string, string>)[token], `${id}.${token}`).toBe(value)
      }
    }
  })

  it('exposes branded display names for presets', () => {
    for (const [id, expected] of Object.entries(DISPLAY_NAME_EXPECTATIONS)) {
      expect(THEME_PRESETS[id as keyof typeof THEME_PRESETS].name).toBe(expected)
    }
  })
})
