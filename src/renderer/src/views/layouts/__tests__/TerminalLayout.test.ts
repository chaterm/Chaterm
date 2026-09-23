/**
 * TerminalLayout Component - Unified Tests
 *
 * Covers:
 * - Close Tab Keyboard Shortcut (handleCloseTabKeyDown, isFocusInTerminal)
 * - AI Sidebar Sticky Logic (resize, quick close, state, KnowledgeCenter rename)
 * - Tab Context Menu (findPanelIdFromTab, index-based tab matching)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ref } from 'vue'
import { getDockTerminalTabId, getMenuForDockBackedUserTab, isDockBackedUserTab } from '../terminalLayoutNavigation'

// Mocks (required by AI Sidebar tests)
vi.mock('@/services/userConfigStoreService', () => ({
  default: {
    getConfig: vi.fn().mockResolvedValue({}),
    saveConfig: vi.fn().mockResolvedValue(undefined)
  }
}))

vi.mock('@/store/userConfigStore', () => ({
  userConfigStore: vi.fn(() => ({
    getUserConfig: { background: { image: null } },
    setUserConfig: vi.fn()
  }))
}))

vi.mock('@/utils/eventBus', () => ({
  default: {
    emit: vi.fn(),
    on: vi.fn(),
    off: vi.fn()
  }
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: vi.fn((key) => key)
  })
}))

// --- Close Tab Keyboard Shortcut (extracted logic) ---
const isFocusInTerminal = (event: KeyboardEvent): boolean => {
  const target = event.target as HTMLElement | null
  const activeElement = document.activeElement as HTMLElement | null
  const terminalContainer = target?.closest('.terminal-container') || activeElement?.closest('.terminal-container')
  const xtermElement = target?.closest('.xterm') || activeElement?.closest('.xterm')
  return !!(terminalContainer || xtermElement)
}

type MockDockApi = {
  activePanel: {
    params?: Record<string, any>
    api: { close: () => void }
  } | null
}

describe('Dockview terminal targeting', () => {
  it.each(['term', 'ssh'])('returns the active %s panel tab id', (type) => {
    expect(getDockTerminalTabId({ params: { id: 'tab-1', type } })).toBe('tab-1')
  })

  it.each(['k8s', 'userConfig'])('ignores an active non-SSH %s panel', (type) => {
    expect(getDockTerminalTabId({ params: { id: 'other-1', type, content: type } })).toBeNull()
  })

  it('lets snippets resolve Dockview activePanel at click time without caching active state', () => {
    const layoutSource = readFileSync(join(process.cwd(), 'src/renderer/src/views/layouts/TerminalLayout.vue'), 'utf8')
    const snippetsSource = readFileSync(join(process.cwd(), 'src/renderer/src/views/components/LeftTab/config/snippets.vue'), 'utf8')

    expect(layoutSource).toContain(':get-active-dock-terminal-tab-id="getActiveDockTerminalTabId"')
    expect(layoutSource).toContain('getDockTerminalTabId(dockApi?.activePanel)')
    expect(layoutSource).not.toContain('activeDockTerminalTabId = ref')
    expect(snippetsSource).toContain('props.getActiveDockTerminalTabId()')
    expect(snippetsSource).toContain("eventBus.emit('autoExecuteCode', { command: data, tabId: dockTabId })")
  })

  it('uses the same Dockview tab id to bind and refocus macro recording', () => {
    const snippetsSource = readFileSync(join(process.cwd(), 'src/renderer/src/views/components/LeftTab/config/snippets.vue'), 'utf8')
    const sshSource = readFileSync(join(process.cwd(), 'src/renderer/src/views/components/Ssh/sshConnect.vue'), 'utf8')

    expect(snippetsSource).toContain('macroRecorder.startRecording(dockTabId, selectedGroupUuid.value)')
    expect(snippetsSource).toContain("eventBus.emit('focusActiveTerminal', dockTabId)")
    expect(sshSource).toContain('macroRecorder.terminalId === props.currentConnectionId')
  })
})

const createHandleCloseTabKeyDown = (dockApi: MockDockApi | null, isFocusInAiTabFn: (event?: KeyboardEvent) => boolean) => {
  return (event: KeyboardEvent) => {
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0
    const isCloseShortcut = (isMac && event.metaKey && event.key === 'w') || (!isMac && event.ctrlKey && event.shiftKey && event.key === 'W')
    if (!isCloseShortcut) return
    if (isFocusInAiTabFn(event)) return
    if (!dockApi || !dockApi.activePanel) return
    const activePanel = dockApi.activePanel
    const params = activePanel.params as Record<string, any> | undefined
    if (isMac) event.preventDefault()
    if (isFocusInTerminal(event) && params?.organizationId && params.organizationId !== '') return
    const CLOSE_DEBOUNCE_TIME = 100
    const currentTime = Date.now()
    if (currentTime - ((window as any).lastCloseTime || 0) < CLOSE_DEBOUNCE_TIME) {
      event.preventDefault()
      event.stopPropagation()
      return
    }
    ;(window as any).lastCloseTime = currentTime
    event.preventDefault()
    event.stopPropagation()
    activePanel.api.close()
  }
}

// --- Tab Context Menu (extracted logic) ---
const findPanelIdFromTab = (tabElement: HTMLElement, dockApi: any): string | null => {
  try {
    if (!dockApi) return null
    for (const panel of dockApi.panels) {
      const panelGroup = panel.api.group
      if (!panelGroup?.element?.contains(tabElement)) continue
      const tabs = Array.from(panelGroup.element.querySelectorAll('.dv-tab'))
      const tabIndex = tabs.indexOf(tabElement)
      if (tabIndex === -1) continue
      const groupPanels = panelGroup.panels
      if (groupPanels && tabIndex < groupPanels.length) return groupPanels[tabIndex].id
    }
    return null
  } catch {
    return null
  }
}

const findPanelIdFromTabOld = (tabElement: HTMLElement, dockApi: any): string | null => {
  try {
    if (dockApi) {
      for (const panel of dockApi.panels) {
        const panelGroup = panel.api.group
        if (panelGroup?.element?.contains(tabElement)) {
          const tabTitle = tabElement.textContent?.trim()
          const panelTitle = panel.api.title
          if (tabTitle === panelTitle) return panel.id
        }
      }
    }
    return null
  } catch {
    return null
  }
}

// ========== Close Tab Keyboard Shortcut ==========
type IsFocusInAiTabFn = (event?: KeyboardEvent) => boolean
type IsFocusInAiTabMock = IsFocusInAiTabFn & { mockReturnValue: (v: boolean) => void }

describe('TerminalLayout - Close Tab Keyboard Shortcut', () => {
  let mockDockApi: MockDockApi
  let mockIsFocusInAiTab: IsFocusInAiTabMock
  let handleCloseTabKeyDown: (event: KeyboardEvent) => void
  let originalPlatform: PropertyDescriptor | undefined

  const createMockEvent = (overrides: Partial<KeyboardEvent> = {}): KeyboardEvent => {
    return {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      metaKey: false,
      ctrlKey: false,
      shiftKey: false,
      key: '',
      target: document.createElement('div'),
      ...overrides
    } as unknown as KeyboardEvent
  }

  beforeEach(() => {
    vi.clearAllMocks()
    ;(window as any).lastCloseTime = 0
    originalPlatform = Object.getOwnPropertyDescriptor(navigator, 'platform')
    mockDockApi = {
      activePanel: {
        params: {},
        api: { close: vi.fn() }
      }
    }
    mockIsFocusInAiTab = vi.fn(() => false) as IsFocusInAiTabMock
    handleCloseTabKeyDown = createHandleCloseTabKeyDown(mockDockApi, mockIsFocusInAiTab)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    if (originalPlatform) {
      Object.defineProperty(navigator, 'platform', originalPlatform)
    } else {
      Object.defineProperty(navigator, 'platform', {
        writable: true,
        configurable: true,
        value: ''
      })
    }
    delete (window as any).lastCloseTime
  })

  describe('Shortcut Detection', () => {
    it('should close active panel on Cmd+W (Mac)', () => {
      Object.defineProperty(navigator, 'platform', {
        writable: true,
        configurable: true,
        value: 'MacIntel'
      })
      handleCloseTabKeyDown = createHandleCloseTabKeyDown(mockDockApi, mockIsFocusInAiTab)
      const event = createMockEvent({ metaKey: true, key: 'w' })
      handleCloseTabKeyDown(event)
      expect(mockDockApi.activePanel!.api.close).toHaveBeenCalled()
      expect(event.preventDefault).toHaveBeenCalled()
      expect(event.stopPropagation).toHaveBeenCalled()
    })

    it('should close active panel on Ctrl+Shift+W (Windows/Linux)', () => {
      Object.defineProperty(navigator, 'platform', {
        writable: true,
        configurable: true,
        value: 'Win32'
      })
      handleCloseTabKeyDown = createHandleCloseTabKeyDown(mockDockApi, mockIsFocusInAiTab)
      const event = createMockEvent({ ctrlKey: true, shiftKey: true, key: 'W' })
      handleCloseTabKeyDown(event)
      expect(mockDockApi.activePanel!.api.close).toHaveBeenCalled()
      expect(event.preventDefault).toHaveBeenCalled()
    })

    it('should ignore non-close shortcut keys', () => {
      Object.defineProperty(navigator, 'platform', {
        writable: true,
        configurable: true,
        value: 'MacIntel'
      })
      handleCloseTabKeyDown = createHandleCloseTabKeyDown(mockDockApi, mockIsFocusInAiTab)
      const event = createMockEvent({ metaKey: true, key: 'a' })
      handleCloseTabKeyDown(event)
      expect(mockDockApi.activePanel!.api.close).not.toHaveBeenCalled()
      expect(event.preventDefault).not.toHaveBeenCalled()
    })

    it('should ignore Cmd+W on Windows (not a close shortcut)', () => {
      Object.defineProperty(navigator, 'platform', {
        writable: true,
        configurable: true,
        value: 'Win32'
      })
      handleCloseTabKeyDown = createHandleCloseTabKeyDown(mockDockApi, mockIsFocusInAiTab)
      const event = createMockEvent({ metaKey: true, key: 'w' })
      handleCloseTabKeyDown(event)
      expect(mockDockApi.activePanel!.api.close).not.toHaveBeenCalled()
    })

    it('should ignore Ctrl+W without Shift on Windows', () => {
      Object.defineProperty(navigator, 'platform', {
        writable: true,
        configurable: true,
        value: 'Win32'
      })
      handleCloseTabKeyDown = createHandleCloseTabKeyDown(mockDockApi, mockIsFocusInAiTab)
      const event = createMockEvent({ ctrlKey: true, shiftKey: false, key: 'w' })
      handleCloseTabKeyDown(event)
      expect(mockDockApi.activePanel!.api.close).not.toHaveBeenCalled()
    })
  })

  describe('AI Tab Guard', () => {
    it('should not close tab when focus is in AI tab', () => {
      Object.defineProperty(navigator, 'platform', {
        writable: true,
        configurable: true,
        value: 'MacIntel'
      })
      mockIsFocusInAiTab.mockReturnValue(true)
      handleCloseTabKeyDown = createHandleCloseTabKeyDown(mockDockApi, mockIsFocusInAiTab)
      const event = createMockEvent({ metaKey: true, key: 'w' })
      handleCloseTabKeyDown(event)
      expect(mockDockApi.activePanel!.api.close).not.toHaveBeenCalled()
      expect(event.preventDefault).not.toHaveBeenCalled()
    })
  })

  describe('DockApi Guard', () => {
    it('should not close when dockApi is null', () => {
      Object.defineProperty(navigator, 'platform', {
        writable: true,
        configurable: true,
        value: 'MacIntel'
      })
      handleCloseTabKeyDown = createHandleCloseTabKeyDown(null, mockIsFocusInAiTab)
      const event = createMockEvent({ metaKey: true, key: 'w' })
      handleCloseTabKeyDown(event)
      expect(event.preventDefault).not.toHaveBeenCalled()
    })

    it('should not close when there is no active panel', () => {
      Object.defineProperty(navigator, 'platform', {
        writable: true,
        configurable: true,
        value: 'MacIntel'
      })
      mockDockApi.activePanel = null
      handleCloseTabKeyDown = createHandleCloseTabKeyDown(mockDockApi, mockIsFocusInAiTab)
      const event = createMockEvent({ metaKey: true, key: 'w' })
      handleCloseTabKeyDown(event)
      expect(event.preventDefault).not.toHaveBeenCalled()
    })
  })

  describe('SSH Terminal Guard', () => {
    it('should not close SSH tab when focus is in terminal', () => {
      Object.defineProperty(navigator, 'platform', {
        writable: true,
        configurable: true,
        value: 'MacIntel'
      })
      mockDockApi.activePanel!.params = { organizationId: 'org-123' }
      handleCloseTabKeyDown = createHandleCloseTabKeyDown(mockDockApi, mockIsFocusInAiTab)
      const terminalContainer = document.createElement('div')
      terminalContainer.className = 'terminal-container'
      const targetInTerminal = document.createElement('div')
      terminalContainer.appendChild(targetInTerminal)
      const event = createMockEvent({ metaKey: true, key: 'w', target: targetInTerminal })
      handleCloseTabKeyDown(event)
      expect(mockDockApi.activePanel!.api.close).not.toHaveBeenCalled()
    })

    it('should not close SSH tab when focus is in xterm element', () => {
      Object.defineProperty(navigator, 'platform', {
        writable: true,
        configurable: true,
        value: 'MacIntel'
      })
      mockDockApi.activePanel!.params = { organizationId: 'org-123' }
      handleCloseTabKeyDown = createHandleCloseTabKeyDown(mockDockApi, mockIsFocusInAiTab)
      const xtermEl = document.createElement('div')
      xtermEl.className = 'xterm'
      const targetInXterm = document.createElement('div')
      xtermEl.appendChild(targetInXterm)
      const event = createMockEvent({ metaKey: true, key: 'w', target: targetInXterm })
      handleCloseTabKeyDown(event)
      expect(mockDockApi.activePanel!.api.close).not.toHaveBeenCalled()
    })

    it('should close non-SSH tab even when focus is in terminal', () => {
      Object.defineProperty(navigator, 'platform', {
        writable: true,
        configurable: true,
        value: 'MacIntel'
      })
      mockDockApi.activePanel!.params = { organizationId: '' }
      handleCloseTabKeyDown = createHandleCloseTabKeyDown(mockDockApi, mockIsFocusInAiTab)
      const terminalContainer = document.createElement('div')
      terminalContainer.className = 'terminal-container'
      const targetInTerminal = document.createElement('div')
      terminalContainer.appendChild(targetInTerminal)
      const event = createMockEvent({ metaKey: true, key: 'w', target: targetInTerminal })
      handleCloseTabKeyDown(event)
      expect(mockDockApi.activePanel!.api.close).toHaveBeenCalled()
    })

    it('should close tab when focus is outside terminal even for SSH tab', () => {
      Object.defineProperty(navigator, 'platform', {
        writable: true,
        configurable: true,
        value: 'MacIntel'
      })
      mockDockApi.activePanel!.params = { organizationId: 'org-123' }
      handleCloseTabKeyDown = createHandleCloseTabKeyDown(mockDockApi, mockIsFocusInAiTab)
      const event = createMockEvent({ metaKey: true, key: 'w' })
      handleCloseTabKeyDown(event)
      expect(mockDockApi.activePanel!.api.close).toHaveBeenCalled()
    })

    it('should close tab when organizationId is undefined (not SSH)', () => {
      Object.defineProperty(navigator, 'platform', {
        writable: true,
        configurable: true,
        value: 'MacIntel'
      })
      mockDockApi.activePanel!.params = {}
      handleCloseTabKeyDown = createHandleCloseTabKeyDown(mockDockApi, mockIsFocusInAiTab)
      const terminalContainer = document.createElement('div')
      terminalContainer.className = 'terminal-container'
      const targetInTerminal = document.createElement('div')
      terminalContainer.appendChild(targetInTerminal)
      const event = createMockEvent({ metaKey: true, key: 'w', target: targetInTerminal })
      handleCloseTabKeyDown(event)
      expect(mockDockApi.activePanel!.api.close).toHaveBeenCalled()
    })
  })

  describe('macOS native accelerator guard', () => {
    // On macOS Cmd+W is the accelerator of the native "Close Window" menu item, which the main
    // process turns into hide(). When this handler defers the close to the SSH terminal handler
    // it must still suppress the accelerator, otherwise a stale activeTermId in the terminal
    // handler lets the key fall through and the whole window gets hidden.
    it('suppresses the accelerator on Mac even when deferring the close to the SSH handler', () => {
      Object.defineProperty(navigator, 'platform', {
        writable: true,
        configurable: true,
        value: 'MacIntel'
      })
      mockDockApi.activePanel!.params = { organizationId: 'org-123' }
      handleCloseTabKeyDown = createHandleCloseTabKeyDown(mockDockApi, mockIsFocusInAiTab)
      const terminalContainer = document.createElement('div')
      terminalContainer.className = 'terminal-container'
      const targetInTerminal = document.createElement('div')
      terminalContainer.appendChild(targetInTerminal)
      const event = createMockEvent({ metaKey: true, key: 'w', target: targetInTerminal })
      handleCloseTabKeyDown(event)
      expect(mockDockApi.activePanel!.api.close).not.toHaveBeenCalled()
      expect(event.preventDefault).toHaveBeenCalled()
    })

    it('does not suppress the accelerator when there is no closable panel', () => {
      Object.defineProperty(navigator, 'platform', {
        writable: true,
        configurable: true,
        value: 'MacIntel'
      })
      mockDockApi.activePanel = null
      handleCloseTabKeyDown = createHandleCloseTabKeyDown(mockDockApi, mockIsFocusInAiTab)
      const event = createMockEvent({ metaKey: true, key: 'w' })
      handleCloseTabKeyDown(event)
      expect(event.preventDefault).not.toHaveBeenCalled()
    })

    it('does not suppress the accelerator on Windows/Linux', () => {
      Object.defineProperty(navigator, 'platform', {
        writable: true,
        configurable: true,
        value: 'Win32'
      })
      handleCloseTabKeyDown = createHandleCloseTabKeyDown(mockDockApi, mockIsFocusInAiTab)
      const event = createMockEvent({ metaKey: true, key: 'w' })
      handleCloseTabKeyDown(event)
      expect(event.preventDefault).not.toHaveBeenCalled()
    })

    it('keeps the layout handler and the SSH handler in sync with the shipped sources', () => {
      // Windows checkouts land as CRLF, so normalize before matching multi-line snippets.
      const readSource = (relativePath: string) => readFileSync(join(process.cwd(), relativePath), 'utf8').replace(/\r\n/g, '\n')
      const layoutSource = readSource('src/renderer/src/views/layouts/TerminalLayout.vue')
      const sshSource = readSource('src/renderer/src/views/components/Ssh/sshConnect.vue')

      // Layout handler suppresses the macOS accelerator before deferring.
      expect(layoutSource).toContain('if (isMac) {\n    event.preventDefault()\n  }')

      // The delayed registration must be cancellable, otherwise a tab closed inside the 100ms
      // window registers an unmounted instance and leaves activeTermId pointing at it.
      expect(sshSource).toContain('registerInstanceTimer = setTimeout(')
      expect(sshSource).toContain('if (registerInstanceTimer) {\n    clearTimeout(registerInstanceTimer)\n    registerInstanceTimer = null\n  }')

      // The SSH shortcut guard must accept real DOM focus, not only activeTermId.
      expect(sshSource).toContain('const hasDomFocus = !!terminalContainer.value?.contains(document.activeElement)')
      expect(sshSource).toContain('if (!hasDomFocus && (!activeTerm.id || activeTerm.id !== connectionId.value)) return')
    })
  })

  describe('Debounce', () => {
    it('should debounce rapid close attempts within 100ms', () => {
      Object.defineProperty(navigator, 'platform', {
        writable: true,
        configurable: true,
        value: 'MacIntel'
      })
      handleCloseTabKeyDown = createHandleCloseTabKeyDown(mockDockApi, mockIsFocusInAiTab)
      const now = 1000
      vi.spyOn(Date, 'now').mockReturnValue(now)
      const event1 = createMockEvent({ metaKey: true, key: 'w' })
      handleCloseTabKeyDown(event1)
      expect(mockDockApi.activePanel!.api.close).toHaveBeenCalledTimes(1)
      vi.spyOn(Date, 'now').mockReturnValue(now + 50)
      const event2 = createMockEvent({ metaKey: true, key: 'w' })
      handleCloseTabKeyDown(event2)
      expect(mockDockApi.activePanel!.api.close).toHaveBeenCalledTimes(1)
      expect(event2.preventDefault).toHaveBeenCalled()
      expect(event2.stopPropagation).toHaveBeenCalled()
    })

    it('should allow close after debounce window expires', () => {
      Object.defineProperty(navigator, 'platform', {
        writable: true,
        configurable: true,
        value: 'MacIntel'
      })
      handleCloseTabKeyDown = createHandleCloseTabKeyDown(mockDockApi, mockIsFocusInAiTab)
      const now = 1000
      vi.spyOn(Date, 'now').mockReturnValue(now)
      const event1 = createMockEvent({ metaKey: true, key: 'w' })
      handleCloseTabKeyDown(event1)
      expect(mockDockApi.activePanel!.api.close).toHaveBeenCalledTimes(1)
      vi.spyOn(Date, 'now').mockReturnValue(now + 150)
      const event2 = createMockEvent({ metaKey: true, key: 'w' })
      handleCloseTabKeyDown(event2)
      expect(mockDockApi.activePanel!.api.close).toHaveBeenCalledTimes(2)
    })
  })

  describe('isFocusInTerminal', () => {
    it('should return true when target is inside .terminal-container', () => {
      const container = document.createElement('div')
      container.className = 'terminal-container'
      const child = document.createElement('div')
      container.appendChild(child)
      const event = createMockEvent({ target: child })
      expect(isFocusInTerminal(event)).toBe(true)
    })

    it('should return true when target is inside .xterm', () => {
      const xtermEl = document.createElement('div')
      xtermEl.className = 'xterm'
      const child = document.createElement('div')
      xtermEl.appendChild(child)
      const event = createMockEvent({ target: child })
      expect(isFocusInTerminal(event)).toBe(true)
    })

    it('should return false when target is outside terminal elements', () => {
      const event = createMockEvent()
      expect(isFocusInTerminal(event)).toBe(false)
    })

    it('should check activeElement as fallback when target has no terminal ancestor', () => {
      const xtermEl = document.createElement('div')
      xtermEl.className = 'xterm'
      const activeChild = document.createElement('input')
      xtermEl.appendChild(activeChild)
      document.body.appendChild(xtermEl)
      activeChild.focus()
      const plainTarget = document.createElement('div')
      const event = createMockEvent({ target: plainTarget })
      const result = isFocusInTerminal(event)
      document.body.removeChild(xtermEl)
      expect(result).toBe(true)
    })
  })
})

describe('TerminalLayout - Dockview Tabs Overflow', () => {
  it('should disable tabs overflow dropdown list', () => {
    const sourcePath = join(process.cwd(), 'src/renderer/src/views/layouts/TerminalLayout.vue')
    const source = readFileSync(sourcePath, 'utf8')
    expect(source).toContain('disable-tabs-overflow-list')
  })
})

describe('TerminalLayout - Preview Actions Layout', () => {
  it('should reserve right padding for preview actions overlay', () => {
    const sourcePath = join(process.cwd(), 'src/renderer/src/views/layouts/TerminalLayout.vue')
    const source = readFileSync(sourcePath, 'utf8')
    expect(source).toContain('padding-right: 30px')
  })

  it('should set fixed width for preview actions button container', () => {
    const sourcePath = join(process.cwd(), 'src/renderer/src/views/layouts/components/EditorActions.vue')
    const source = readFileSync(sourcePath, 'utf8')
    expect(source).toContain('width: 30px')
    expect(source).toContain('min-width: 30px')
  })

  it('should only apply padding when preview actions are visible', () => {
    const sourcePath = join(process.cwd(), 'src/renderer/src/views/layouts/TerminalLayout.vue')
    const source = readFileSync(sourcePath, 'utf8')
    expect(source).toContain('has-preview-actions')
    expect(source).toContain('computePreviewActionsVisible')
  })
})

describe('TerminalLayout - Clone/Split Bastion Source Tagging', () => {
  it('tags clone requests on the tab data payload so sshConnect receives the clone source', () => {
    const sourcePath = join(process.cwd(), 'src/renderer/src/views/layouts/TerminalLayout.vue')
    const source = readFileSync(sourcePath, 'utf8')

    expect(source).toContain("params.data = { ...params.data, source: 'clone' }")
  })

  it('tags split requests on the tab data payload so sshConnect receives the split source', () => {
    const sourcePath = join(process.cwd(), 'src/renderer/src/views/layouts/TerminalLayout.vue')
    const source = readFileSync(sourcePath, 'utf8')

    expect(source).toContain("params.data = { ...params.data, source: 'split' }")
  })

  it('logs when a clone or split source tag is applied for bastion reuse', () => {
    const sourcePath = join(process.cwd(), 'src/renderer/src/views/layouts/TerminalLayout.vue')
    const source = readFileSync(sourcePath, 'utf8')

    expect(source).toContain('layout.terminal.clone_split_source_tagged')
  })

  it('warns when clone or split tagging cannot happen because panel data is missing', () => {
    const sourcePath = join(process.cwd(), 'src/renderer/src/views/layouts/TerminalLayout.vue')
    const source = readFileSync(sourcePath, 'utf8')

    expect(source).toContain('layout.terminal.clone_split_source_missing_data')
  })

  it('logs safe metadata fields instead of raw connection objects to avoid leaking credentials', () => {
    const sourcePath = join(process.cwd(), 'src/renderer/src/views/layouts/TerminalLayout.vue')
    const source = readFileSync(sourcePath, 'utf8')

    expect(source).toContain('panelDirection')
    expect(source).toContain('panelSource')
    expect(source).toContain('nextPanelId')
    expect(source).toContain('previousSource')
  })
})

// ========== Tab Context Menu ==========
describe('TerminalLayout - Tab Context Menu', () => {
  let mockDockApi: any
  let mockPanels: any[]

  const createMockGroup = (groupId: string, panelConfigs: Array<{ id: string; title: string }>) => {
    const tabElements: HTMLElement[] = []
    const groupPanels: any[] = []
    panelConfigs.forEach((config) => {
      const tabEl = document.createElement('div')
      tabEl.className = 'dv-tab'
      tabEl.textContent = config.title
      tabElements.push(tabEl)
    })
    const groupElement = document.createElement('div')
    groupElement.className = 'dv-group'
    tabElements.forEach((tab) => groupElement.appendChild(tab))
    panelConfigs.forEach((config) => {
      const panel = {
        id: config.id,
        api: { title: config.title, group: null as any }
      }
      groupPanels.push(panel)
      mockPanels.push(panel)
    })
    const group = { id: groupId, element: groupElement, panels: groupPanels }
    groupPanels.forEach((panel) => {
      panel.api.group = group
    })
    return { group, tabElements, groupPanels }
  }

  beforeEach(() => {
    mockPanels = []
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('findPanelIdFromTab - Index-Based Matching (New Implementation)', () => {
    it('should correctly identify single tab in a group', () => {
      const { tabElements } = createMockGroup('group1', [{ id: 'panel_1', title: 'Server A' }])
      mockDockApi = { panels: mockPanels }
      expect(findPanelIdFromTab(tabElements[0], mockDockApi)).toBe('panel_1')
    })

    it('should correctly identify tabs with unique titles', () => {
      const { tabElements } = createMockGroup('group1', [
        { id: 'panel_1', title: 'Server A' },
        { id: 'panel_2', title: 'Server B' },
        { id: 'panel_3', title: 'Server C' }
      ])
      mockDockApi = { panels: mockPanels }
      expect(findPanelIdFromTab(tabElements[0], mockDockApi)).toBe('panel_1')
      expect(findPanelIdFromTab(tabElements[1], mockDockApi)).toBe('panel_2')
      expect(findPanelIdFromTab(tabElements[2], mockDockApi)).toBe('panel_3')
    })

    it('should correctly identify tabs with SAME titles (critical fix)', () => {
      const { tabElements } = createMockGroup('group1', [
        { id: 'panel_1', title: 'production-server' },
        { id: 'panel_2', title: 'production-server' },
        { id: 'panel_3', title: 'production-server' }
      ])
      mockDockApi = { panels: mockPanels }
      expect(findPanelIdFromTab(tabElements[0], mockDockApi)).toBe('panel_1')
      expect(findPanelIdFromTab(tabElements[1], mockDockApi)).toBe('panel_2')
      expect(findPanelIdFromTab(tabElements[2], mockDockApi)).toBe('panel_3')
    })

    it('should correctly identify last tab with same title (the reported bug)', () => {
      const { tabElements } = createMockGroup('group1', [
        { id: 'panel_1', title: 'my-server' },
        { id: 'panel_2', title: 'my-server' },
        { id: 'panel_3', title: 'my-server' }
      ])
      mockDockApi = { panels: mockPanels }
      const lastTabIndex = tabElements.length - 1
      expect(findPanelIdFromTab(tabElements[lastTabIndex], mockDockApi)).toBe('panel_3')
    })

    it('should handle mixed unique and duplicate titles', () => {
      const { tabElements } = createMockGroup('group1', [
        { id: 'panel_1', title: 'Server A' },
        { id: 'panel_2', title: 'Server B' },
        { id: 'panel_3', title: 'Server A' },
        { id: 'panel_4', title: 'Server C' }
      ])
      mockDockApi = { panels: mockPanels }
      expect(findPanelIdFromTab(tabElements[0], mockDockApi)).toBe('panel_1')
      expect(findPanelIdFromTab(tabElements[1], mockDockApi)).toBe('panel_2')
      expect(findPanelIdFromTab(tabElements[2], mockDockApi)).toBe('panel_3')
      expect(findPanelIdFromTab(tabElements[3], mockDockApi)).toBe('panel_4')
    })
  })

  describe('Old vs New Implementation Comparison', () => {
    it('OLD implementation FAILS with duplicate titles', () => {
      const { tabElements } = createMockGroup('group1', [
        { id: 'panel_1', title: 'same-title' },
        { id: 'panel_2', title: 'same-title' },
        { id: 'panel_3', title: 'same-title' }
      ])
      mockDockApi = { panels: mockPanels }
      expect(findPanelIdFromTabOld(tabElements[0], mockDockApi)).toBe('panel_1')
      expect(findPanelIdFromTabOld(tabElements[1], mockDockApi)).toBe('panel_1')
      expect(findPanelIdFromTabOld(tabElements[2], mockDockApi)).toBe('panel_1')
      expect(findPanelIdFromTab(tabElements[0], mockDockApi)).toBe('panel_1')
      expect(findPanelIdFromTab(tabElements[1], mockDockApi)).toBe('panel_2')
      expect(findPanelIdFromTab(tabElements[2], mockDockApi)).toBe('panel_3')
    })
  })

  describe('Edge Cases', () => {
    it('should return null when dockApi is null', () => {
      const tabEl = document.createElement('div')
      tabEl.className = 'dv-tab'
      expect(findPanelIdFromTab(tabEl, null)).toBeNull()
    })

    it('should return null when tab element is not in any group', () => {
      createMockGroup('group1', [{ id: 'panel_1', title: 'Server A' }])
      mockDockApi = { panels: mockPanels }
      const orphanTab = document.createElement('div')
      orphanTab.className = 'dv-tab'
      expect(findPanelIdFromTab(orphanTab, mockDockApi)).toBeNull()
    })

    it('should return null when panels array is empty', () => {
      mockDockApi = { panels: [] }
      const tabEl = document.createElement('div')
      tabEl.className = 'dv-tab'
      expect(findPanelIdFromTab(tabEl, mockDockApi)).toBeNull()
    })

    it('should handle group with no panels gracefully', () => {
      const groupElement = document.createElement('div')
      const tabEl = document.createElement('div')
      tabEl.className = 'dv-tab'
      groupElement.appendChild(tabEl)
      const emptyGroup = { element: groupElement, panels: [] }
      const panel = {
        id: 'panel_orphan',
        api: { title: 'Orphan', group: emptyGroup }
      }
      mockDockApi = { panels: [panel] }
      expect(findPanelIdFromTab(tabEl, mockDockApi)).toBeNull()
    })

    it('should handle errors gracefully and return null', () => {
      const faultyDockApi = {
        panels: [
          {
            api: {
              get group() {
                throw new Error('Simulated error')
              }
            }
          }
        ]
      }
      const tabEl = document.createElement('div')
      tabEl.className = 'dv-tab'
      expect(findPanelIdFromTab(tabEl, faultyDockApi)).toBeNull()
    })
  })

  describe('Multiple Groups', () => {
    it('should correctly identify tabs across multiple groups', () => {
      const { tabElements: tabs1 } = createMockGroup('group1', [
        { id: 'panel_g1_1', title: 'Group1 Tab1' },
        { id: 'panel_g1_2', title: 'Group1 Tab2' }
      ])
      const { tabElements: tabs2 } = createMockGroup('group2', [
        { id: 'panel_g2_1', title: 'Group2 Tab1' },
        { id: 'panel_g2_2', title: 'Group2 Tab2' }
      ])
      mockDockApi = { panels: mockPanels }
      expect(findPanelIdFromTab(tabs1[0], mockDockApi)).toBe('panel_g1_1')
      expect(findPanelIdFromTab(tabs1[1], mockDockApi)).toBe('panel_g1_2')
      expect(findPanelIdFromTab(tabs2[0], mockDockApi)).toBe('panel_g2_1')
      expect(findPanelIdFromTab(tabs2[1], mockDockApi)).toBe('panel_g2_2')
    })

    it('should handle same titles across different groups', () => {
      const { tabElements: tabs1 } = createMockGroup('group1', [{ id: 'panel_g1_1', title: 'Server' }])
      const { tabElements: tabs2 } = createMockGroup('group2', [{ id: 'panel_g2_1', title: 'Server' }])
      mockDockApi = { panels: mockPanels }
      expect(findPanelIdFromTab(tabs1[0], mockDockApi)).toBe('panel_g1_1')
      expect(findPanelIdFromTab(tabs2[0], mockDockApi)).toBe('panel_g2_1')
    })
  })
})

// ========== AI Sidebar Sticky Logic (Core) ==========
const mockContainer = {
  offsetWidth: 1000,
  querySelector: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn()
}

describe('TerminalLayout - AI Sidebar Sticky Logic (Core)', () => {
  const MIN_AI_SIDEBAR_WIDTH_PX = 280
  const SNAP_THRESHOLD_PX = 200
  const DEFAULT_WIDTH_RIGHT_PX = 350
  const MIN_LEFT_SIDEBAR_WIDTH_PX = 200
  const MIN_LEFT_SIDEBAR_DRAG_WIDTH_PX = 120
  const LEFT_QUICK_CLOSE_THRESHOLD_PX = 50
  const DEFAULT_WIDTH_PX = 250

  let aiSidebarSize: any
  let aiMinSize: any
  let isDraggingSplitter: any
  let showAiSidebar: any
  let savedAiSidebarState: any
  let currentMode: any
  let leftPaneSize: any
  let agentsLeftPaneSize: any
  let isDraggingLeftSplitter: any
  let savedLeftSidebarState: any
  let currentMenu: any
  let isQuickClosing: any
  let isLeftQuickCloseArmed: any
  let updateAiSidebarMinSize: any
  let handleGlobalMouseMove: any
  let handleLeftSplitterMouseDown: any
  let getLeftSidebarContainer: any
  let getLeftSidebarSize: any
  let setLeftSidebarSize: any
  let saveLeftSidebarState: any
  let restoreLeftSidebarState: any
  let rememberedLeftWidthPx: any
  let getModeKey: any
  let rememberLeftSidebarWidth: any
  let getLeftSidebarOpenSize: any
  let handleGlobalMouseUp: any
  let updatePaneSize: any

  beforeEach(() => {
    vi.clearAllMocks()
    aiSidebarSize = ref(0)
    aiMinSize = ref(0)
    isDraggingSplitter = ref(false)
    showAiSidebar = ref(false)
    savedAiSidebarState = ref(null)
    currentMode = ref('terminal')
    leftPaneSize = ref(0)
    agentsLeftPaneSize = ref(0)
    isDraggingLeftSplitter = ref(false)
    savedLeftSidebarState = ref(null)
    currentMenu = ref('workspace')
    isQuickClosing = ref(false)
    isLeftQuickCloseArmed = ref(false)
    rememberedLeftWidthPx = ref({ terminal: null, agents: null })

    global.document = {
      querySelector: vi.fn((selector: string) => {
        if (selector === '.main-split-container') return { offsetWidth: 800 }
        // Terminal mode container starts after the 40px icon rail
        if (selector.includes('.left-sidebar-container')) {
          return { offsetWidth: 1000, getBoundingClientRect: () => ({ left: 40, width: 1000 }) }
        }
        if (selector === '.splitpanes') return mockContainer
        return null
      }),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(() => true),
      activeElement: { focus: vi.fn() }
    } as any

    global.window = {
      innerWidth: 1200,
      setTimeout: vi.fn((fn: () => void) => {
        fn()
        return 123
      }),
      clearTimeout: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    } as any

    updateAiSidebarMinSize = vi.fn(() => {
      if (currentMode.value === 'agents') {
        const container = global.document.querySelector('.left-sidebar-container') as HTMLElement
        if (container) aiMinSize.value = (SNAP_THRESHOLD_PX / container.offsetWidth) * 100
      } else {
        const mainContainer = global.document.querySelector('.main-split-container') as HTMLElement
        if (mainContainer) aiMinSize.value = (SNAP_THRESHOLD_PX / mainContainer.offsetWidth) * 100
      }
    })

    handleGlobalMouseMove = vi.fn((e: MouseEvent) => {
      if (isQuickClosing.value) return
      if (isDraggingSplitter.value && showAiSidebar.value) {
        if (currentMode.value === 'agents') return
        const distFromRight = global.window.innerWidth - e.clientX
        if (distFromRight < 50) {
          isQuickClosing.value = true
          const mouseUpEvent = new MouseEvent('mouseup', { bubbles: true, cancelable: true })
          global.document.dispatchEvent(mouseUpEvent)
          global.window.setTimeout(() => {
            showAiSidebar.value = false
            aiSidebarSize.value = 0
            isDraggingSplitter.value = false
            global.window.setTimeout(() => {
              isQuickClosing.value = false
            }, 100)
          }, 10)
        }
      }
      if (isDraggingLeftSplitter.value && getLeftSidebarSize() > 0) {
        const container = getLeftSidebarContainer()
        if (!container) return
        const distFromLeft = e.clientX - container.getBoundingClientRect().left
        if (!isLeftQuickCloseArmed.value) {
          if (distFromLeft >= 50) isLeftQuickCloseArmed.value = true
          return
        }
        if (distFromLeft < 50) {
          isQuickClosing.value = true
          const mouseUpEvent = new MouseEvent('mouseup', { bubbles: true, cancelable: true })
          global.document.dispatchEvent(mouseUpEvent)
          global.window.setTimeout(() => {
            saveLeftSidebarState()
            setLeftSidebarSize(0)
            isDraggingLeftSplitter.value = false
            isLeftQuickCloseArmed.value = false
            global.window.setTimeout(() => {
              isQuickClosing.value = false
            }, 100)
          }, 10)
        }
      }
    })

    handleLeftSplitterMouseDown = vi.fn((e: MouseEvent) => {
      isDraggingLeftSplitter.value = true
      const container = getLeftSidebarContainer()
      const distFromLeft = container ? e.clientX - container.getBoundingClientRect().left : e.clientX
      isLeftQuickCloseArmed.value = distFromLeft >= 50
    })

    getLeftSidebarContainer = vi.fn(() => {
      const modeSelector = currentMode.value === 'agents' ? '.agents-mode-layout' : '.terminal-mode-layout'
      return (global.document.querySelector(`${modeSelector} .left-sidebar-container`) ||
        global.document.querySelector('.left-sidebar-container')) as HTMLElement | null
    })

    getLeftSidebarSize = vi.fn(() => {
      return currentMode.value === 'agents' ? agentsLeftPaneSize.value : leftPaneSize.value
    })

    setLeftSidebarSize = vi.fn((size: number) => {
      if (currentMode.value === 'agents') {
        agentsLeftPaneSize.value = size
      } else {
        leftPaneSize.value = size
      }
    })

    saveLeftSidebarState = vi.fn(() => {
      savedLeftSidebarState.value = {
        size: getLeftSidebarSize(),
        currentMenu: currentMenu.value,
        isExpanded: getLeftSidebarSize() > 0
      }
    })

    getModeKey = vi.fn(() => (currentMode.value === 'agents' ? 'agents' : 'terminal'))

    rememberLeftSidebarWidth = vi.fn(() => {
      const size = getLeftSidebarSize()
      if (size <= 0) return
      const container = getLeftSidebarContainer()
      if (!container || container.offsetWidth <= 0) return
      const widthPx = (size / 100) * container.offsetWidth
      if (widthPx < LEFT_QUICK_CLOSE_THRESHOLD_PX) return
      rememberedLeftWidthPx.value[getModeKey()] = widthPx
    })

    getLeftSidebarOpenSize = vi.fn((containerWidth: number, defaultSize: number) => {
      const remembered = rememberedLeftWidthPx.value[getModeKey()]
      if (remembered !== null && containerWidth > 0) {
        return (remembered / containerWidth) * 100
      }
      return defaultSize
    })

    handleGlobalMouseUp = vi.fn(() => {
      if (isDraggingLeftSplitter.value && !isQuickClosing.value) {
        rememberLeftSidebarWidth()
      }
      isDraggingSplitter.value = false
      isDraggingLeftSplitter.value = false
      isLeftQuickCloseArmed.value = false
    })

    restoreLeftSidebarState = vi.fn(() => {
      const container = getLeftSidebarContainer()
      if (container && container.offsetWidth > 0) {
        const containerWidth = container.offsetWidth
        const minSizePercent = (MIN_LEFT_SIDEBAR_WIDTH_PX / containerWidth) * 100
        let restoredSize = getLeftSidebarOpenSize(containerWidth, savedLeftSidebarState.value.size)
        const floorPx = rememberedLeftWidthPx.value[getModeKey()] !== null ? MIN_LEFT_SIDEBAR_DRAG_WIDTH_PX : MIN_LEFT_SIDEBAR_WIDTH_PX
        if ((restoredSize / 100) * containerWidth < floorPx) {
          restoredSize = floorPx === MIN_LEFT_SIDEBAR_DRAG_WIDTH_PX ? (floorPx / containerWidth) * 100 : minSizePercent
        }
        setLeftSidebarSize(restoredSize)
        currentMenu.value = savedLeftSidebarState.value.currentMenu
      }
    })

    updatePaneSize = vi.fn(() => {
      const container = getLeftSidebarContainer()
      if (!container) return
      if (leftPaneSize.value > 0 && currentMode.value === 'terminal') {
        const containerWidth = container.offsetWidth
        const currentWidthPx = (leftPaneSize.value / 100) * containerWidth
        const targetWidthPx = rememberedLeftWidthPx.value.terminal ?? DEFAULT_WIDTH_PX
        if (Math.abs(currentWidthPx - targetWidthPx) > 50) {
          leftPaneSize.value = (targetWidthPx / containerWidth) * 100
        }
      }
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('AI Sidebar Core Features', () => {
    it('should calculate correct min-size for Terminal mode', () => {
      currentMode.value = 'terminal'
      updateAiSidebarMinSize()
      expect(aiMinSize.value).toBe(25)
    })

    it('should trigger quick close when dragged near right edge', () => {
      currentMode.value = 'terminal'
      isDraggingSplitter.value = true
      showAiSidebar.value = true
      aiSidebarSize.value = 30
      handleGlobalMouseMove({ clientX: 1160 } as MouseEvent)
      expect(showAiSidebar.value).toBe(false)
      expect(aiSidebarSize.value).toBe(0)
    })

    it('should restore to saved width when reopening', () => {
      const container = global.document.querySelector('.main-split-container') || global.document.querySelector('.splitpanes')
      const containerWidth = container ? (container as HTMLElement).offsetWidth : 1000
      savedAiSidebarState.value = { size: 50 }
      showAiSidebar.value = false
      const minSizePercent = (MIN_AI_SIDEBAR_WIDTH_PX / containerWidth) * 100
      let restoredSize = savedAiSidebarState.value?.size || (DEFAULT_WIDTH_RIGHT_PX / containerWidth) * 100
      if ((restoredSize / 100) * containerWidth < MIN_AI_SIDEBAR_WIDTH_PX) {
        restoredSize = minSizePercent
      }
      showAiSidebar.value = true
      aiSidebarSize.value = restoredSize
      expect(showAiSidebar.value).toBe(true)
      expect(aiSidebarSize.value).toBe(50)
    })
  })

  describe('Left Sidebar Core Features', () => {
    it('should trigger quick close when dragged near left edge', () => {
      currentMode.value = 'terminal'
      leftPaneSize.value = 30
      // Grab the splitter of an open sidebar, which sits outside the close zone
      handleLeftSplitterMouseDown({ clientX: 340 } as MouseEvent)
      handleGlobalMouseMove({ clientX: 40 } as MouseEvent)
      expect(getLeftSidebarSize()).toBe(0)
      expect(saveLeftSidebarState).toHaveBeenCalled()
    })

    it('should restore to saved width enforcing minimum', () => {
      currentMode.value = 'terminal'
      leftPaneSize.value = 0
      savedLeftSidebarState.value = { size: 10, currentMenu: 'workspace', isExpanded: true }
      restoreLeftSidebarState()
      expect(getLeftSidebarSize()).toBe(20)
    })

    it('should not quick close while dragging a collapsed sidebar back open', () => {
      currentMode.value = 'terminal'
      leftPaneSize.value = 0
      // A collapsed splitter sits at the container's left edge, inside the close zone
      handleLeftSplitterMouseDown({ clientX: 40 } as MouseEvent)
      expect(isLeftQuickCloseArmed.value).toBe(false)

      // splitpanes reports a non-zero size as the drag starts moving outward
      leftPaneSize.value = 15
      handleGlobalMouseMove({ clientX: 45 } as MouseEvent)
      handleGlobalMouseMove({ clientX: 60 } as MouseEvent)

      expect(getLeftSidebarSize()).toBe(15)
      expect(isQuickClosing.value).toBe(false)
    })

    it('should arm quick close once the pointer leaves the close zone', () => {
      currentMode.value = 'terminal'
      leftPaneSize.value = 0
      handleLeftSplitterMouseDown({ clientX: 40 } as MouseEvent)

      leftPaneSize.value = 20
      // 140 is 100px past the container's left edge, so quick close arms
      handleGlobalMouseMove({ clientX: 140 } as MouseEvent)
      expect(isLeftQuickCloseArmed.value).toBe(true)

      // Dragging back inward now collapses as intended
      handleGlobalMouseMove({ clientX: 45 } as MouseEvent)
      expect(getLeftSidebarSize()).toBe(0)
    })

    it('should measure the close zone from the container edge, not the window edge', () => {
      currentMode.value = 'terminal'
      leftPaneSize.value = 30
      handleLeftSplitterMouseDown({ clientX: 340 } as MouseEvent)

      // clientX 80 is only 40px past the container's left edge of 40, so it closes
      handleGlobalMouseMove({ clientX: 80 } as MouseEvent)
      expect(getLeftSidebarSize()).toBe(0)
    })
  })

  describe('Mode-Specific Behaviors', () => {
    it('should disable quick close in Agents mode for AI sidebar', () => {
      currentMode.value = 'agents'
      isDraggingSplitter.value = true
      showAiSidebar.value = true
      aiSidebarSize.value = 30
      handleGlobalMouseMove({ clientX: 1160 } as MouseEvent)
      expect(showAiSidebar.value).toBe(true)
    })

    it('should use different size variables for different modes', () => {
      currentMode.value = 'terminal'
      setLeftSidebarSize(25)
      expect(leftPaneSize.value).toBe(25)
      expect(agentsLeftPaneSize.value).toBe(0)
      currentMode.value = 'agents'
      setLeftSidebarSize(30)
      expect(agentsLeftPaneSize.value).toBe(30)
      expect(leftPaneSize.value).toBe(25)
    })
  })

  describe('Quick Close State Management (New Implementation)', () => {
    it('should complete quick close and reset flags for both sidebars', () => {
      currentMode.value = 'terminal'
      isDraggingSplitter.value = true
      showAiSidebar.value = true
      aiSidebarSize.value = 30
      handleGlobalMouseMove({ clientX: 1160 } as MouseEvent)
      expect(showAiSidebar.value).toBe(false)
      expect(aiSidebarSize.value).toBe(0)
      expect(isQuickClosing.value).toBe(false)
      leftPaneSize.value = 30
      handleLeftSplitterMouseDown({ clientX: 340 } as MouseEvent)
      handleGlobalMouseMove({ clientX: 40 } as MouseEvent)
      expect(getLeftSidebarSize()).toBe(0)
      expect(isQuickClosing.value).toBe(false)
    })

    it('should block events when isQuickClosing is true', () => {
      isQuickClosing.value = true
      currentMode.value = 'terminal'
      isDraggingSplitter.value = true
      showAiSidebar.value = true
      aiSidebarSize.value = 30
      handleGlobalMouseMove({ clientX: 1160 } as MouseEvent)
      expect(aiSidebarSize.value).toBe(30)
    })

    it('should trigger mouseup event to terminate splitpanes drag', () => {
      const dispatchEventSpy = vi.spyOn(global.document, 'dispatchEvent')
      currentMode.value = 'terminal'
      isDraggingSplitter.value = true
      showAiSidebar.value = true
      aiSidebarSize.value = 30
      handleGlobalMouseMove({ clientX: 1160 } as MouseEvent)
      expect(dispatchEventSpy).toHaveBeenCalledWith(expect.objectContaining({ type: 'mouseup' }))
    })

    it('should respect Agents mode - no quick close for AI sidebar', () => {
      currentMode.value = 'agents'
      isDraggingSplitter.value = true
      showAiSidebar.value = true
      aiSidebarSize.value = 30
      handleGlobalMouseMove({ clientX: 1160 } as MouseEvent)
      expect(showAiSidebar.value).toBe(true)
      expect(isQuickClosing.value).toBe(false)
    })
  })

  describe('Resize Event Protection During Quick Close', () => {
    let handleLeftPaneResize: any
    let onMainSplitResize: any

    beforeEach(() => {
      handleLeftPaneResize = vi.fn((params: any) => {
        if (isQuickClosing.value) return
        if (currentMode.value === 'agents') {
          agentsLeftPaneSize.value = params.prevPane.size
        } else {
          leftPaneSize.value = params.prevPane.size
        }
      })
      onMainSplitResize = vi.fn((params: any) => {
        if (isQuickClosing.value) return
        aiSidebarSize.value = params.prevPane.size
      })
    })

    it('should block resize events when isQuickClosing is true', () => {
      isQuickClosing.value = true
      currentMode.value = 'terminal'
      leftPaneSize.value = 0
      aiSidebarSize.value = 0
      handleLeftPaneResize({ prevPane: { size: 50 } })
      onMainSplitResize({ prevPane: { size: 50 } })
      expect(leftPaneSize.value).toBe(0)
      expect(aiSidebarSize.value).toBe(0)
    })

    it('should allow resize after isQuickClosing is reset', () => {
      currentMode.value = 'terminal'
      isQuickClosing.value = true
      leftPaneSize.value = 0
      handleLeftPaneResize({ prevPane: { size: 30 } })
      expect(leftPaneSize.value).toBe(0)
      isQuickClosing.value = false
      handleLeftPaneResize({ prevPane: { size: 30 } })
      expect(leftPaneSize.value).toBe(30)
    })
  })

  describe('Edge Cases', () => {
    it('should handle missing DOM elements gracefully', () => {
      global.document.querySelector = vi.fn(() => null)
      expect(() => updateAiSidebarMinSize()).not.toThrow()
      expect(() => restoreLeftSidebarState()).not.toThrow()
    })

    it('should handle both sidebars being dragged independently', () => {
      currentMode.value = 'terminal'
      leftPaneSize.value = 30
      handleLeftSplitterMouseDown({ clientX: 340 } as MouseEvent)
      handleGlobalMouseMove({ clientX: 40 } as MouseEvent)
      expect(getLeftSidebarSize()).toBe(0)
      isDraggingLeftSplitter.value = false
      isDraggingSplitter.value = true
      showAiSidebar.value = true
      aiSidebarSize.value = 30
      leftPaneSize.value = 25
      handleGlobalMouseMove({ clientX: 1160 } as MouseEvent)
      expect(showAiSidebar.value).toBe(false)
      expect(getLeftSidebarSize()).toBe(25)
    })
  })

  describe('Remembered Left Sidebar Width', () => {
    it('should remember the width a finished drag settled on', () => {
      currentMode.value = 'terminal'
      leftPaneSize.value = 15 // 150px of a 1000px container
      isDraggingLeftSplitter.value = true
      handleGlobalMouseUp()
      expect(rememberedLeftWidthPx.value.terminal).toBe(150)
      expect(isDraggingLeftSplitter.value).toBe(false)
    })

    it('should not remember the width when quick close synthesized the mouseup', () => {
      currentMode.value = 'terminal'
      rememberedLeftWidthPx.value.terminal = 120
      leftPaneSize.value = 3 // mid-collapse width, not a deliberate choice
      isDraggingLeftSplitter.value = true
      isQuickClosing.value = true
      handleGlobalMouseUp()
      expect(rememberedLeftWidthPx.value.terminal).toBe(120)
    })

    it('should not remember a width too small to be a deliberate choice', () => {
      currentMode.value = 'terminal'
      leftPaneSize.value = 3 // 30px, under the 50px quick close threshold
      isDraggingLeftSplitter.value = true
      handleGlobalMouseUp()
      expect(rememberedLeftWidthPx.value.terminal).toBeNull()
    })

    it('should remember a width that settled on the drag floor despite sub-pixel error', () => {
      currentMode.value = 'terminal'
      leftPaneSize.value = 11.998 // 119.98px, a hair under the 120px floor
      isDraggingLeftSplitter.value = true
      handleGlobalMouseUp()
      expect(rememberedLeftWidthPx.value.terminal).toBeCloseTo(119.98, 2)
    })

    it('should normalize a remembered width just under the floor back up to it', () => {
      currentMode.value = 'terminal'
      rememberedLeftWidthPx.value.terminal = 119.98
      savedLeftSidebarState.value = { size: 11.998, currentMenu: 'workspace', isExpanded: true }
      restoreLeftSidebarState()
      expect(leftPaneSize.value).toBe(12) // clamped to the 120px floor of 1000px
    })

    it('should reopen at the remembered width instead of the default', () => {
      currentMode.value = 'terminal'
      rememberedLeftWidthPx.value.terminal = 380
      expect(getLeftSidebarOpenSize(1000, 25)).toBe(38)
    })

    it('should fall back to the default size with no remembered width', () => {
      currentMode.value = 'terminal'
      expect(getLeftSidebarOpenSize(1000, 25)).toBe(25)
    })

    it('should restore a remembered width narrower than the preferred minimum', () => {
      currentMode.value = 'terminal'
      rememberedLeftWidthPx.value.terminal = 150
      savedLeftSidebarState.value = { size: 15, currentMenu: 'workspace', isExpanded: true }
      restoreLeftSidebarState()
      // 150px survives instead of being raised to the 200px preferred minimum
      expect(leftPaneSize.value).toBe(15)
    })

    it('should raise a restored size with no remembered width to the preferred minimum', () => {
      currentMode.value = 'terminal'
      savedLeftSidebarState.value = { size: 12, currentMenu: 'workspace', isExpanded: true }
      restoreLeftSidebarState()
      expect(leftPaneSize.value).toBe(20) // 200px of 1000px
    })

    it('should prefer the remembered width over a stale saved size', () => {
      currentMode.value = 'terminal'
      rememberedLeftWidthPx.value.terminal = 160
      savedLeftSidebarState.value = { size: 2, currentMenu: 'workspace', isExpanded: true }
      restoreLeftSidebarState()
      // 160px remembered wins over the 20px saved size, and stays above the 120px floor
      expect(leftPaneSize.value).toBe(16)
    })

    it('should keep remembered widths independent per mode', () => {
      currentMode.value = 'terminal'
      leftPaneSize.value = 12
      isDraggingLeftSplitter.value = true
      handleGlobalMouseUp()

      currentMode.value = 'agents'
      agentsLeftPaneSize.value = 14
      isDraggingLeftSplitter.value = true
      handleGlobalMouseUp()

      expect(rememberedLeftWidthPx.value.terminal).toBe(120)
      expect(rememberedLeftWidthPx.value.agents).toBe(140)

      currentMode.value = 'terminal'
      expect(getLeftSidebarOpenSize(1000, 25)).toBeCloseTo(12, 6)
      currentMode.value = 'agents'
      expect(getLeftSidebarOpenSize(1000, 25)).toBeCloseTo(14, 6)
    })

    it('should hold the remembered width across a window resize', () => {
      currentMode.value = 'terminal'
      rememberedLeftWidthPx.value.terminal = 380
      leftPaneSize.value = 25 // 250px, far enough from 380px to trip the adjustment
      updatePaneSize()
      expect(leftPaneSize.value).toBe(38)
    })

    it('should hold the default width across a window resize with no remembered width', () => {
      currentMode.value = 'terminal'
      leftPaneSize.value = 40 // 400px, far enough from the 250px default
      updatePaneSize()
      expect(leftPaneSize.value).toBe(25)
    })
  })

  describe('KnowledgeCenter Rename Sync', () => {
    const handleKbFileRenamed = (dockApi: any, payload: { oldRelPath: string; newRelPath: string; newName: string }) => {
      if (!dockApi) return
      const { oldRelPath, newRelPath, newName } = payload
      if (!oldRelPath || !newRelPath) return
      const panels = [...dockApi.panels]
      for (const panel of panels) {
        const params = panel.params as Record<string, any> | undefined
        if (!params || params.content !== 'KnowledgeCenterEditor') continue
        const tabRelPath = String(params.props?.relPath || params.data?.props?.relPath || '')
        if (!tabRelPath) continue
        let updatedRelPath = ''
        let updatedTitle = ''
        if (tabRelPath === oldRelPath) {
          updatedRelPath = newRelPath
          updatedTitle = newName
        } else if (tabRelPath.startsWith(oldRelPath + '/')) {
          updatedRelPath = newRelPath + tabRelPath.slice(oldRelPath.length)
          updatedTitle = updatedRelPath.split('/').pop() || updatedRelPath
        }
        if (!updatedRelPath) continue
        panel.api.setTitle(updatedTitle)
        if (params.props) params.props.relPath = updatedRelPath
        if (params.data?.props) params.data.props.relPath = updatedRelPath
        params.title = updatedTitle
        panel.api.updateParameters?.({ ...params })
      }
    }

    it('should update title and relPath for renamed file', () => {
      const panel = {
        params: {
          content: 'KnowledgeCenterEditor',
          title: 'old.md',
          props: { relPath: 'docs/old.md' }
        },
        api: { setTitle: vi.fn(), updateParameters: vi.fn() }
      }
      handleKbFileRenamed({ panels: [panel] }, { oldRelPath: 'docs/old.md', newRelPath: 'docs/new.md', newName: 'new.md' })
      expect(panel.api.setTitle).toHaveBeenCalledWith('new.md')
      expect(panel.params.props.relPath).toBe('docs/new.md')
      expect(panel.params.title).toBe('new.md')
      expect(panel.api.updateParameters).toHaveBeenCalledWith(expect.objectContaining({ title: 'new.md' }))
    })

    it('should update child tabs when a directory is renamed', () => {
      const panel = {
        params: {
          content: 'KnowledgeCenterEditor',
          title: 'notes.md',
          data: { props: { relPath: 'docs/child/notes.md' } }
        },
        api: { setTitle: vi.fn(), updateParameters: vi.fn() }
      }
      handleKbFileRenamed({ panels: [panel] }, { oldRelPath: 'docs', newRelPath: 'docs-new', newName: 'docs-new' })
      expect(panel.api.setTitle).toHaveBeenCalledWith('notes.md')
      expect(panel.params.data.props.relPath).toBe('docs-new/child/notes.md')
      expect(panel.params.title).toBe('notes.md')
      expect(panel.api.updateParameters).toHaveBeenCalledWith(expect.objectContaining({ title: 'notes.md' }))
    })

    it('should ignore non-KnowledgeCenter panels or empty paths', () => {
      const panel1 = {
        params: { content: 'TerminalEditor', props: { relPath: 'docs/a.md' } },
        api: { setTitle: vi.fn(), updateParameters: vi.fn() }
      }
      const panel2 = {
        params: { content: 'KnowledgeCenterEditor', props: { relPath: '' } },
        api: { setTitle: vi.fn(), updateParameters: vi.fn() }
      }
      handleKbFileRenamed({ panels: [panel1, panel2] }, { oldRelPath: 'docs/a.md', newRelPath: 'docs/b.md', newName: 'b.md' })
      expect(panel1.api.setTitle).not.toHaveBeenCalled()
      expect(panel2.api.setTitle).not.toHaveBeenCalled()
    })
  })
})

describe('TerminalLayout - Database Workspace Mode', () => {
  const sourcePath = join(process.cwd(), 'src/renderer/src/views/layouts/TerminalLayout.vue')
  const source = readFileSync(sourcePath, 'utf8')

  it('imports the Database component', () => {
    expect(source).toContain("import Database from '@views/components/Database/index.vue'")
  })

  it('branches the content area on currentMenu === "database"', () => {
    expect(source).toContain("currentMenu === 'database'")
    expect(source).toContain('database-workspace-mode')
    expect(source).toMatch(/<Database\s*\/>/)
  })

  it('renders the normal splitpanes layout when menu is not database', () => {
    expect(source).toMatch(/v-else[\s\S]{0,200}class="left-sidebar-container"/)
  })

  it('keeps the AI sidebar gated by the existing terminal-mode condition', () => {
    expect(source).toContain("props.currentMode === 'terminal' && showAiSidebar")
  })

  it('exposes the whole AI sidebar as an onboarding target', () => {
    expect(source).toContain('data-onboarding-id="right-ai-sidebar"')
  })

  it('uses a wider AI sidebar while the AI chat onboarding tour is active', () => {
    expect(source).toContain('ONBOARDING_AI_SIDEBAR_WIDTH_PX = 420')
    expect(source).toContain("onboardingStore.activeTour === 'aiChat'")
    expect(source).toContain('restoredSize = Math.max(restoredSize, preferredSize)')
  })

  it('defines scoped styles so database mode fills term_content', () => {
    expect(source).toContain('.database-workspace-mode')
    expect(source).toMatch(/\.database-workspace-mode\s*\{[\s\S]{0,200}height:\s*100%/)
  })

  it('switches back to a Dockview-backed menu before opening settings from database mode', () => {
    expect(isDockBackedUserTab('userConfig')).toBe(true)
    expect(isDockBackedUserTab('onboardingGuide')).toBe(true)
    expect(getMenuForDockBackedUserTab('database', 'userConfig')).toBe('workspace')
    expect(getMenuForDockBackedUserTab('database', 'onboardingGuide')).toBe('workspace')
    expect(source).toContain('await ensureDockWorkspaceVisibleForUserTab(value)')
  })

  it('auto-opens the onboarding guide tab once after Dockview is ready', () => {
    expect(source).toContain('openInitialOnboardingGuideTab()')
    expect(source).toContain('onboardingStore.guideTabAutoOpened')
    expect(source).toContain("await openUserTab('onboardingGuide')")
    expect(source).toContain('onboardingStore.markGuideTabAutoOpened()')
  })

  it('routes repeated database menu clicks to the database asset sidebar', () => {
    expect(source).toContain("params.menu === 'database'")
    expect(source).toContain('databaseWorkspaceStore.toggleDatabaseSidebar()')
    expect(source).toContain('databaseWorkspaceStore.setDatabaseSidebarOpen(true)')
  })
})
