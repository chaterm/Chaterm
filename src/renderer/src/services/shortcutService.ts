import { userConfigStore } from './userConfigStoreService'
import type { ShortcutConfig } from './userConfigStoreService'
import eventBus from '@/utils/eventBus'
import { shortcutActions } from '@/config/shortcutActions'

export interface ShortcutAction {
  id: string
  name: string
  nameKey: string // New field for i18n
  handler: () => void
  defaultKey: {
    mac: string
    other: string
  }
}

export interface ParsedShortcut {
  ctrlKey: boolean
  shiftKey: boolean
  altKey: boolean
  metaKey: boolean
  key: string
  keyCode?: number
}

export class ShortcutService {
  private static _instance: ShortcutService

  private shortcuts: Map<string, ShortcutAction> = new Map()
  private shortcutMappings: Map<string, { parsed: ParsedShortcut; handler: () => void }> = new Map()
  private currentShortcuts: ShortcutConfig | null = null
  private isRecording: boolean = false
  private recordingListener: ((event: KeyboardEvent) => void) | null = null
  private listener: ((event: KeyboardEvent) => void) | null = null

  private constructor() {
    console.log('ShortcutService constructor is now private.')
  }

  public static get instance(): ShortcutService {
    if (!ShortcutService._instance) {
      ShortcutService._instance = new ShortcutService()
      ShortcutService._instance.init()
    }
    return ShortcutService._instance
  }

  public init() {
    console.log('Initializing ShortcutService...')
    this.destroy() // Clean up old state
    this.initializeShortcuts()
  }

  private initializeShortcuts() {
    // Dynamically register all shortcut actions from configuration file
    shortcutActions.forEach((action) => {
      this.registerAction(
        action.id,
        '', // name will be retrieved from i18n, leave empty here
        action.handler,
        action.defaultKey,
        action.nameKey
      )
    })

    // Load user-configured shortcuts
    this.loadShortcuts()
  }

  private registerAction(id: string, name: string, handler: () => void, defaultKey: { mac: string; other: string }, nameKey: string) {
    this.shortcuts.set(id, {
      id,
      name,
      handler,
      defaultKey,
      nameKey
    })
  }

  async loadShortcuts() {
    try {
      const config = await userConfigStore.getConfig()
      if (config.shortcuts) {
        const defaultShortcuts: ShortcutConfig = {}
        const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0

        shortcutActions.forEach((action) => {
          defaultShortcuts[action.id] = isMac ? action.defaultKey.mac : action.defaultKey.other
        })

        this.currentShortcuts = { ...defaultShortcuts, ...config.shortcuts }
        this.bindShortcuts()
      }
    } catch (error) {
      console.error('Failed to load shortcuts:', error)
    }
  }

  private bindShortcuts() {
    // Clear previous shortcuts
    this.clearShortcuts()

    if (!this.currentShortcuts) return

    // Build shortcut mappings
    Object.entries(this.currentShortcuts).forEach(([actionId, shortcutKey]) => {
      const action = this.shortcuts.get(actionId)
      if (action) {
        if (actionId === 'switchToSpecificTab') {
          this.addDigitShortcuts()
        } else {
          this.addShortcutMapping(shortcutKey, action.handler)
        }
      }
    })

    // Always add digit shortcuts even if not in user config
    if (!this.currentShortcuts.switchToSpecificTab) {
      this.addDigitShortcuts()
    }

    // Set up single global listener
    this.setupListener()
  }

  private addShortcutMapping(shortcutKey: string, handler: () => void) {
    if (!shortcutKey) return

    const parsedShortcut = this.parseShortcut(shortcutKey)
    if (!parsedShortcut) return

    this.shortcutMappings.set(shortcutKey, {
      parsed: parsedShortcut,
      handler
    })
  }

  private setupListener() {
    // Remove existing global listener
    this.removeListener()

    // Create new global listener
    this.listener = (event: KeyboardEvent) => {
      // If currently recording shortcuts, don't trigger any shortcut actions
      if (this.isRecording) return

      // Check all registered shortcuts
      for (const { parsed, handler } of this.shortcutMappings.values()) {
        if (this.matchesShortcut(event, parsed)) {
          event.preventDefault()
          event.stopPropagation()
          handler()
          return // Only trigger the first matching shortcut
        }
      }
    }

    // Add global listener with capture mode
    document.addEventListener('keydown', this.listener, true)
  }

  private removeListener() {
    if (this.listener) {
      document.removeEventListener('keydown', this.listener, true)
      this.listener = null
    }
  }

  private clearShortcuts() {
    this.shortcutMappings.clear()
    this.removeListener()
  }

  parseShortcut(shortcutString: string): ParsedShortcut | null {
    if (!shortcutString) return null

    const parts = shortcutString.split('+').map((part) => part.trim())
    if (parts.length === 0) return null

    const parsed: ParsedShortcut = {
      ctrlKey: false,
      shiftKey: false,
      altKey: false,
      metaKey: false,
      key: ''
    }

    let mainKey = ''

    for (const part of parts) {
      const lowerPart = part.toLowerCase()
      switch (lowerPart) {
        case 'ctrl':
        case 'control':
          parsed.ctrlKey = true
          break
        case 'shift':
          parsed.shiftKey = true
          break
        case 'alt':
        case 'option':
          parsed.altKey = true
          break
        case 'cmd':
        case 'command':
        case 'meta':
          parsed.metaKey = true
          break
        default:
          if (!mainKey) {
            mainKey = part
          }
          break
      }
    }

    // Allow shortcuts with only modifier keys (for special cases like switchToSpecificTab)
    if (!mainKey) {
      // Check if we have at least one modifier key
      if (parsed.ctrlKey || parsed.shiftKey || parsed.altKey || parsed.metaKey) {
        parsed.key = '' // Empty key for modifier-only shortcuts
        return parsed
      }
      return null
    }

    parsed.key = mainKey.toLowerCase()
    return parsed
  }

  private matchesShortcut(event: KeyboardEvent, parsed: ParsedShortcut): boolean {
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0
    let eventKey = event.key.toLowerCase()

    // Special handling for Tab key
    if (event.code === 'Tab' || event.key === 'Tab') {
      eventKey = 'tab'
    }

    // If Option key is pressed on Mac, use event.code to get the correct key name
    if (event.altKey && isMac) {
      if (event.code.startsWith('Key')) {
        eventKey = event.code.substring(3).toLowerCase() // Remove "Key" prefix and convert to lowercase
      } else if (event.code.startsWith('Digit')) {
        eventKey = event.code.substring(5).toLowerCase() // Remove "Digit" prefix and convert to lowercase
      } else {
        const codeMap: { [key: string]: string } = {
          Comma: ',',
          Period: '.',
          Slash: '/',
          Semicolon: ';',
          Quote: "'",
          BracketLeft: '[',
          BracketRight: ']',
          Backslash: '\\',
          Backquote: '`',
          Minus: '-',
          Equal: '=',
          Space: ' ',
          Enter: 'enter',
          Escape: 'escape',
          Tab: 'tab'
        }
        eventKey = (codeMap[event.code] || event.code).toLowerCase()
      }
    }

    const parsedKey = parsed.key.toLowerCase()

    // Special handling for modifier-only shortcuts (empty key)
    if (parsed.key === '') {
      // For modifier-only shortcuts, we need to check if only modifiers are pressed
      // and no other keys are pressed
      const isModifierKey = ['Control', 'Alt', 'Shift', 'Meta', 'Command'].includes(event.key)
      if (!isModifierKey) {
        return false // A non-modifier key was pressed
      }
    } else {
      // Special key mapping
      const keyMap: { [key: string]: string } = {
        ',': 'comma',
        '.': 'period',
        '/': 'slash',
        ';': 'semicolon',
        "'": 'quote',
        '[': 'bracketleft',
        ']': 'bracketright',
        '\\': 'backslash',
        '`': 'backquote',
        '-': 'minus',
        '=': 'equal',
        tab: 'tab'
      }

      // Check if main key matches
      let keyMatches = false
      if (parsedKey === eventKey) {
        keyMatches = true
      } else if (keyMap[parsedKey] === eventKey) {
        keyMatches = true
      } else if (parsedKey === keyMap[eventKey]) {
        keyMatches = true
      } else if (parsedKey === 'comma' && eventKey === ',') {
        keyMatches = true
      } else if (parsedKey === 'tab' && (eventKey === 'tab' || event.code === 'Tab')) {
        keyMatches = true
      }

      if (!keyMatches) {
        return false
      }
    }

    return (
      event.ctrlKey === parsed.ctrlKey && event.shiftKey === parsed.shiftKey && event.altKey === parsed.altKey && event.metaKey === parsed.metaKey
    )
  }

  // Add digit shortcuts (Command/Ctrl + 1-9)
  private addDigitShortcuts() {
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0
    const action = this.shortcuts.get('switchToSpecificTab')

    if (!action) return

    // Get the configured prefix shortcut (without the digit part)
    let prefixShortcut = this.currentShortcuts?.switchToSpecificTab || (isMac ? 'Command' : 'Ctrl')

    // Add shortcuts for digits 1-9
    for (let digit = 1; digit <= 9; digit++) {
      const shortcutKey = `${prefixShortcut}+${digit}`
      const parsedShortcut = this.parseShortcut(shortcutKey)

      if (parsedShortcut) {
        this.shortcutMappings.set(shortcutKey, {
          parsed: parsedShortcut,
          handler: () => {
            eventBus.emit('switchToSpecificTab', digit)
          }
        })
      }
    }
  }

  // Validate switchToSpecificTab shortcut - only modifier keys can be changed
  private validateSpecificTabShortcut(shortcut: string): boolean {
    if (!shortcut) return false

    // The shortcut should not contain digit keys, as they will be added automatically
    const parts = shortcut.split('+').map((part) => part.trim())
    const hasDigit = parts.some((part) => /^\d$/.test(part))

    if (hasDigit) {
      return false // User shouldn't specify digit keys
    }

    // Must have at least one modifier key
    const hasModifier = parts.some((part) => {
      const lowerPart = part.toLowerCase()
      return ['ctrl', 'control', 'shift', 'alt', 'option', 'cmd', 'command', 'meta'].includes(lowerPart)
    })

    return hasModifier
  }

  async updateShortcut(actionId: string, newShortcut: string): Promise<boolean> {
    try {
      // Special validation for switchToSpecificTab
      if (actionId === 'switchToSpecificTab') {
        if (!this.validateSpecificTabShortcut(newShortcut)) {
          throw new Error(
            'Invalid shortcut format for tab switching. Please only specify modifier keys (e.g., Command, Ctrl, Alt, Shift). Digit keys 1-9 are automatically added.'
          )
        }
      } else {
        // Check if shortcut is valid for other actions
        const parsed = this.parseShortcut(newShortcut)
        if (!parsed) {
          throw new Error('Invalid shortcut format')
        }
      }

      // Check if shortcut is already in use
      const conflict = this.checkConflict(actionId, newShortcut)
      if (conflict) {
        throw new Error('Shortcut conflict')
      }

      // Update configuration
      const config = await userConfigStore.getConfig()

      const shortcuts = { ...(config.shortcuts || {}) } as ShortcutConfig
      shortcuts[actionId] = newShortcut

      await userConfigStore.saveConfig({ shortcuts })

      // Reload shortcuts
      await this.loadShortcuts()

      return true
    } catch (error) {
      console.error('Failed to update shortcut:', error)
      return false
    }
  }

  private checkConflict(excludeActionId: string, shortcut: string): boolean {
    if (!this.currentShortcuts) return false

    return Object.entries(this.currentShortcuts).some(([actionId, existingShortcut]) => {
      return actionId !== excludeActionId && existingShortcut === shortcut
    })
  }

  async resetShortcuts(): Promise<void> {
    try {
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0
      const defaultShortcuts: ShortcutConfig = {}

      this.shortcuts.forEach((action) => {
        defaultShortcuts[action.id] = isMac ? action.defaultKey.mac : action.defaultKey.other
      })

      await userConfigStore.saveConfig({ shortcuts: defaultShortcuts })
      await this.loadShortcuts()
    } catch (error) {
      console.error('Failed to reset shortcuts:', error)
    }
  }

  getShortcuts(): ShortcutConfig | null {
    return this.currentShortcuts
  }

  getActions(): ShortcutAction[] {
    return Array.from(this.shortcuts.values())
  }

  destroy() {
    this.clearShortcuts()
    this.shortcuts.clear()
  }

  // Set recording state
  setRecording(recording: boolean) {
    this.isRecording = recording

    // If starting recording, add ESC key listener
    if (recording) {
      this.recordingListener = this.handleRecordingKeyDown.bind(this)
      document.addEventListener('keydown', this.recordingListener)
    } else if (this.recordingListener) {
      // If ending recording, remove listener
      document.removeEventListener('keydown', this.recordingListener)
      this.recordingListener = null
    }
  }

  // Handle keyboard events during recording
  private handleRecordingKeyDown(event: KeyboardEvent) {
    // If ESC key is pressed, cancel recording
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      this.setRecording(false)
      // Emit recording cancelled event
      eventBus.emit('shortcut-recording-cancelled')
    }
  }

  // Format shortcut for display
  formatShortcut(shortcut: string, actionId?: string): string {
    if (!shortcut) return ''

    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0
    let formatted = shortcut

    if (isMac) {
      formatted = formatted
        .replace(/Command/g, '⌘')
        .replace(/Option/g, '⌥')
        .replace(/Alt/g, '⌥')
        .replace(/Shift/g, 'Shift')
        .replace(/Control/g, '⌃')
        .replace(/Ctrl/g, '⌃')
    } else {
      formatted = formatted
        .replace(/Command/g, 'Ctrl')
        .replace(/Option/g, 'Alt')
        .replace(/Meta/g, 'Ctrl')
    }

    if (actionId === 'switchToSpecificTab') {
      formatted = `${formatted}+[1...9]`
    }

    return formatted
  }

  // Validate if shortcut is valid
  validateShortcut(shortcut: string): boolean {
    return this.parseShortcut(shortcut) !== null
  }
}

export const shortcutService = ShortcutService.instance
