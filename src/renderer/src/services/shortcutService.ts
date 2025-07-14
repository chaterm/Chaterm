import { userConfigStore } from './userConfigStoreService'
import type { ShortcutConfig } from './userConfigStoreService'
import eventBus from '@/utils/eventBus'
import { shortcutActions } from '@/config/shortcutActions'

export interface ShortcutAction {
  id: string
  name: string
  nameKey: string // 新增，用于i18n
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
  private keyListeners: Map<string, (event: KeyboardEvent) => void> = new Map()
  private currentShortcuts: ShortcutConfig | null = null
  private isRecording: boolean = false
  private recordingListener: ((event: KeyboardEvent) => void) | null = null

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
    this.destroy() // 清理旧状态
    this.initializeShortcuts()
  }

  private initializeShortcuts() {
    // 从配置文件动态注册所有快捷键操作
    shortcutActions.forEach((action) => {
      this.registerAction(
        action.id,
        '', // name 将从 i18n 获取，此处留空
        action.handler,
        action.defaultKey,
        action.nameKey
      )
    })

    // 加载用户配置的快捷键
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
        this.currentShortcuts = config.shortcuts
        this.bindShortcuts()
      }
    } catch (error) {
      console.error('Failed to load shortcuts:', error)
    }
  }

  private bindShortcuts() {
    // 清除之前的监听器
    this.clearListeners()

    if (!this.currentShortcuts) return

    // 绑定新的快捷键
    Object.entries(this.currentShortcuts).forEach(([actionId, shortcutKey]) => {
      const action = this.shortcuts.get(actionId)
      if (action) {
        this.bindShortcut(shortcutKey, action.handler)
      }
    })
  }

  private bindShortcut(shortcutKey: string, handler: () => void) {
    if (!shortcutKey) return

    const parsedShortcut = this.parseShortcut(shortcutKey)
    if (!parsedShortcut) return

    const listener = (event: KeyboardEvent) => {
      // 如果正在录制快捷键，不触发任何快捷键操作
      if (this.isRecording) return

      if (this.matchesShortcut(event, parsedShortcut)) {
        event.preventDefault()
        event.stopPropagation()
        handler()
      }
    }

    this.keyListeners.set(shortcutKey, listener)
    document.addEventListener('keydown', listener)
  }

  private clearListeners() {
    this.keyListeners.forEach((listener) => {
      document.removeEventListener('keydown', listener)
    })
    this.keyListeners.clear()
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

    if (!mainKey) return null

    parsed.key = mainKey.toLowerCase()
    return parsed
  }

  private matchesShortcut(event: KeyboardEvent, parsed: ParsedShortcut): boolean {
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0
    let eventKey = event.key.toLowerCase()

    // 如果在Mac上按下了Option键，使用event.code来获取正确的按键名称
    if (event.altKey && isMac) {
      if (event.code.startsWith('Key')) {
        eventKey = event.code.substring(3).toLowerCase() // 去掉"Key"前缀并转小写
      } else if (event.code.startsWith('Digit')) {
        eventKey = event.code.substring(5).toLowerCase() // 去掉"Digit"前缀并转小写
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
          Escape: 'escape'
        }
        eventKey = (codeMap[event.code] || event.code).toLowerCase()
      }
    }

    const parsedKey = parsed.key.toLowerCase()

    // 特殊按键映射
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
      '=': 'equal'
    }

    // 检查主键是否匹配
    let keyMatches = false
    if (parsedKey === eventKey) {
      keyMatches = true
    } else if (keyMap[parsedKey] === eventKey) {
      keyMatches = true
    } else if (parsedKey === keyMap[eventKey]) {
      keyMatches = true
    } else if (parsedKey === 'comma' && eventKey === ',') {
      keyMatches = true
    }

    return (
      keyMatches &&
      event.ctrlKey === parsed.ctrlKey &&
      event.shiftKey === parsed.shiftKey &&
      event.altKey === parsed.altKey &&
      event.metaKey === parsed.metaKey
    )
  }

  async updateShortcut(actionId: string, newShortcut: string): Promise<boolean> {
    try {
      // 检查快捷键是否有效
      const parsed = this.parseShortcut(newShortcut)
      if (!parsed) {
        throw new Error('Invalid shortcut format')
      }

      // 检查快捷键是否已被占用
      const conflict = this.checkConflict(actionId, newShortcut)
      if (conflict) {
        throw new Error('Shortcut conflict')
      }

      // 更新配置
      const config = await userConfigStore.getConfig()
      const shortcuts = { ...(config.shortcuts || {}) } as ShortcutConfig
      shortcuts[actionId] = newShortcut

      await userConfigStore.saveConfig({ shortcuts })

      // 重新加载快捷键
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
    this.clearListeners()
    this.shortcuts.clear()
  }

  // 设置录制状态
  setRecording(recording: boolean) {
    this.isRecording = recording

    // 如果开始录制，添加ESC键监听
    if (recording) {
      this.recordingListener = this.handleRecordingKeyDown.bind(this)
      document.addEventListener('keydown', this.recordingListener)
    } else if (this.recordingListener) {
      // 如果结束录制，移除监听
      document.removeEventListener('keydown', this.recordingListener)
      this.recordingListener = null
    }
  }

  // 处理录制过程中的键盘事件
  private handleRecordingKeyDown(event: KeyboardEvent) {
    // 如果按下ESC键，取消录制
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      this.setRecording(false)
      // 发送取消录制事件
      eventBus.emit('shortcut-recording-cancelled')
    }
  }

  // 格式化快捷键显示
  formatShortcut(shortcut: string): string {
    if (!shortcut) return ''

    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0
    let formatted = shortcut

    if (isMac) {
      formatted = formatted
        .replace(/Command/g, '⌘')
        .replace(/Option/g, '⌥')
        .replace(/Alt/g, '⌥')
        .replace(/Shift/g, '⇧')
        .replace(/Control/g, '⌃')
        .replace(/Ctrl/g, '⌃')
    } else {
      formatted = formatted
        .replace(/Command/g, 'Ctrl')
        .replace(/Option/g, 'Alt')
        .replace(/Meta/g, 'Ctrl')
    }

    return formatted
  }

  // 验证快捷键是否有效
  validateShortcut(shortcut: string): boolean {
    return this.parseShortcut(shortcut) !== null
  }
}

export const shortcutService = ShortcutService.instance
