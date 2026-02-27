/**
 * TerminalLayout Component - Unified Tests
 *
 * Covers:
 * - Close Tab Keyboard Shortcut (handleCloseTabKeyDown, isFocusInTerminal)
 * - AI Sidebar Sticky Logic (resize, quick close, state, KnowledgeCenter rename)
 * - Tab Context Menu (findPanelIdFromTab, index-based tab matching)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ref } from 'vue'

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

const createHandleCloseTabKeyDown = (dockApi: MockDockApi | null, isFocusInAiTabFn: (event?: KeyboardEvent) => boolean) => {
  return (event: KeyboardEvent) => {
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0
    const isCloseShortcut = (isMac && event.metaKey && event.key === 'w') || (!isMac && event.ctrlKey && event.shiftKey && event.key === 'W')
    if (!isCloseShortcut) return
    if (isFocusInAiTabFn(event)) return
    if (!dockApi || !dockApi.activePanel) return
    const activePanel = dockApi.activePanel
    const params = activePanel.params as Record<string, any> | undefined
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
  let updateAiSidebarMinSize: any
  let handleGlobalMouseMove: any
  let getLeftSidebarSize: any
  let setLeftSidebarSize: any
  let saveLeftSidebarState: any
  let restoreLeftSidebarState: any

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

    global.document = {
      querySelector: vi.fn((selector: string) => {
        if (selector === '.main-split-container') return { offsetWidth: 800 }
        if (selector === '.left-sidebar-container') return { offsetWidth: 1000 }
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
        const distFromLeft = e.clientX
        const container = global.document.querySelector('.left-sidebar-container') as HTMLElement
        if (!container) return
        if (distFromLeft < 50) {
          isQuickClosing.value = true
          const mouseUpEvent = new MouseEvent('mouseup', { bubbles: true, cancelable: true })
          global.document.dispatchEvent(mouseUpEvent)
          global.window.setTimeout(() => {
            saveLeftSidebarState()
            setLeftSidebarSize(0)
            isDraggingLeftSplitter.value = false
            global.window.setTimeout(() => {
              isQuickClosing.value = false
            }, 100)
          }, 10)
        }
      }
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

    restoreLeftSidebarState = vi.fn(() => {
      const container = global.document.querySelector('.left-sidebar-container') as HTMLElement
      if (container && container.offsetWidth > 0) {
        const containerWidth = container.offsetWidth
        const minSizePercent = (MIN_LEFT_SIDEBAR_WIDTH_PX / containerWidth) * 100
        let restoredSize = savedLeftSidebarState.value.size
        if ((restoredSize / 100) * containerWidth < MIN_LEFT_SIDEBAR_WIDTH_PX) {
          restoredSize = minSizePercent
        }
        setLeftSidebarSize(restoredSize)
        currentMenu.value = savedLeftSidebarState.value.currentMenu
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
      isDraggingLeftSplitter.value = true
      leftPaneSize.value = 30
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
      isDraggingLeftSplitter.value = true
      leftPaneSize.value = 30
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
      isDraggingLeftSplitter.value = true
      leftPaneSize.value = 30
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
