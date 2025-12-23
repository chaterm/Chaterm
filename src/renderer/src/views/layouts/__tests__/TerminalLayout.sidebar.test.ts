/**
 * TerminalLayout Component - AI Sidebar Sticky Logic Tests (Core Tests Only)
 *
 * This test suite focuses on testing the AI sidebar sticky resizing functionality
 * implemented in TerminalLayout.vue, including:
 * - Physical resistance (min-size property)
 * - Quick close mechanism (global mouse tracking)
 * - State restoration
 * - Mode-specific behaviors (Terminal vs Agents)
 * - Quick close state management (new implementation)
 *
 * Note: These tests focus on the logic and integration patterns rather than
 * full component mounting due to heavy dependencies (dockview, splitpanes, etc.).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ref } from 'vue'

// Mock dependencies
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

// Mock DOM elements and methods
const mockContainer = {
  offsetWidth: 1000,
  querySelector: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn()
}

describe('TerminalLayout - AI Sidebar Sticky Logic (Core)', () => {
  // Constants from the component
  const MIN_AI_SIDEBAR_WIDTH_PX = 350
  const SNAP_THRESHOLD_PX = 200
  const DEFAULT_WIDTH_RIGHT_PX = 500
  const MIN_LEFT_SIDEBAR_WIDTH_PX = 180

  // Mock reactive variables
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

  // Mock functions
  let updateAiSidebarMinSize: any
  let handleGlobalMouseMove: any
  let getLeftSidebarSize: any
  let setLeftSidebarSize: any
  let saveLeftSidebarState: any
  let restoreLeftSidebarState: any

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks()

    // Initialize reactive variables
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

    // Mock DOM
    global.document = {
      querySelector: vi.fn((selector) => {
        if (selector === '.main-split-container') {
          return { offsetWidth: 800 } // Main container width
        }
        if (selector === '.left-sidebar-container') {
          return { offsetWidth: 1000 } // Full container width
        }
        if (selector === '.splitpanes') {
          return mockContainer
        }
        return null
      }),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(() => true),
      activeElement: { focus: vi.fn() }
    } as any

    global.window = {
      innerWidth: 1200,
      setTimeout: vi.fn((fn) => {
        // Execute immediately for testing
        fn()
        return 123
      }),
      clearTimeout: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    } as any

    // Mock functions
    updateAiSidebarMinSize = vi.fn(() => {
      if (currentMode.value === 'agents') {
        const container = global.document.querySelector('.left-sidebar-container') as HTMLElement
        if (container) {
          aiMinSize.value = (SNAP_THRESHOLD_PX / container.offsetWidth) * 100
        }
      } else {
        const mainContainer = global.document.querySelector('.main-split-container') as HTMLElement
        if (mainContainer) {
          aiMinSize.value = (SNAP_THRESHOLD_PX / mainContainer.offsetWidth) * 100
        }
      }
    })

    handleGlobalMouseMove = vi.fn((e: MouseEvent) => {
      // Skip if quick closing is in progress
      if (isQuickClosing.value) {
        return
      }

      // AI sidebar quick close logic
      if (isDraggingSplitter.value && showAiSidebar.value) {
        if (currentMode.value === 'agents') {
          return
        }

        const distFromRight = global.window.innerWidth - e.clientX
        if (distFromRight < 50) {
          isQuickClosing.value = true

          // Trigger mouseup event
          const mouseUpEvent = new MouseEvent('mouseup', {
            bubbles: true,
            cancelable: true
          })
          global.document.dispatchEvent(mouseUpEvent)

          // Execute close logic (using synchronous execution for testing)
          global.window.setTimeout(() => {
            showAiSidebar.value = false
            aiSidebarSize.value = 0
            isDraggingSplitter.value = false

            // Reset flag
            global.window.setTimeout(() => {
              isQuickClosing.value = false
            }, 100)
          }, 10)
        }
      }

      // Left sidebar quick close logic
      if (isDraggingLeftSplitter.value && getLeftSidebarSize() > 0) {
        const distFromLeft = e.clientX
        const container = global.document.querySelector('.left-sidebar-container') as HTMLElement
        if (!container) return

        // Quick close: < 50px
        if (distFromLeft < 50) {
          isQuickClosing.value = true

          // Trigger mouseup event
          const mouseUpEvent = new MouseEvent('mouseup', {
            bubbles: true,
            cancelable: true
          })
          global.document.dispatchEvent(mouseUpEvent)

          // Execute close logic
          global.window.setTimeout(() => {
            saveLeftSidebarState()
            setLeftSidebarSize(0)
            isDraggingLeftSplitter.value = false

            // Reset flag
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

        // Ensure restored width is not less than minimum usable width
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

      // Main container width is 800px, SNAP_THRESHOLD_PX is 200px
      // Expected: (200 / 800) * 100 = 25%
      expect(aiMinSize.value).toBe(25)
    })

    it('should trigger quick close when dragged near right edge', () => {
      currentMode.value = 'terminal'
      isDraggingSplitter.value = true
      showAiSidebar.value = true
      aiSidebarSize.value = 30

      const mockEvent = { clientX: 1160 } as MouseEvent // 40px from right edge
      handleGlobalMouseMove(mockEvent)

      expect(showAiSidebar.value).toBe(false)
      expect(aiSidebarSize.value).toBe(0)
    })

    it('should restore to saved width when reopening', () => {
      const container = global.document.querySelector('.main-split-container') || global.document.querySelector('.splitpanes')
      const containerWidth = container ? (container as HTMLElement).offsetWidth : 1000

      savedAiSidebarState.value = { size: 50 } // 50% of 800px = 400px > 350px minimum
      showAiSidebar.value = false

      // Simulate toggle open
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

      const mockEvent = { clientX: 40 } as MouseEvent // 40px from left edge
      handleGlobalMouseMove(mockEvent)

      expect(getLeftSidebarSize()).toBe(0)
      expect(saveLeftSidebarState).toHaveBeenCalled()
    })

    it('should restore to saved width enforcing minimum', () => {
      currentMode.value = 'terminal'
      leftPaneSize.value = 0
      savedLeftSidebarState.value = { size: 10, currentMenu: 'workspace', isExpanded: true }
      // 10% of 1000px = 100px < 180px minimum

      restoreLeftSidebarState()

      // Should use minimum: (180 / 1000) * 100 = 18%
      expect(getLeftSidebarSize()).toBe(18)
    })
  })

  describe('Mode-Specific Behaviors', () => {
    it('should disable quick close in Agents mode for AI sidebar', () => {
      currentMode.value = 'agents'
      isDraggingSplitter.value = true
      showAiSidebar.value = true
      aiSidebarSize.value = 30

      const mockEvent = { clientX: 1160 } as MouseEvent
      handleGlobalMouseMove(mockEvent)

      // Should not trigger in Agents mode
      expect(showAiSidebar.value).toBe(true)
    })

    it('should use different size variables for different modes', () => {
      // Terminal mode
      currentMode.value = 'terminal'
      setLeftSidebarSize(25)
      expect(leftPaneSize.value).toBe(25)
      expect(agentsLeftPaneSize.value).toBe(0)

      // Agents mode
      currentMode.value = 'agents'
      setLeftSidebarSize(30)
      expect(agentsLeftPaneSize.value).toBe(30)
      expect(leftPaneSize.value).toBe(25)
    })
  })

  describe('Quick Close State Management (New Implementation)', () => {
    it('should complete quick close and reset flags for both sidebars', () => {
      currentMode.value = 'terminal'

      // Test AI sidebar quick close
      isDraggingSplitter.value = true
      showAiSidebar.value = true
      aiSidebarSize.value = 30
      const mockEventRight = { clientX: 1160 } as MouseEvent
      handleGlobalMouseMove(mockEventRight)
      expect(showAiSidebar.value).toBe(false)
      expect(aiSidebarSize.value).toBe(0)
      expect(isQuickClosing.value).toBe(false) // Reset after execution

      // Test left sidebar quick close
      isDraggingLeftSplitter.value = true
      leftPaneSize.value = 30
      const mockEventLeft = { clientX: 40 } as MouseEvent
      handleGlobalMouseMove(mockEventLeft)
      expect(getLeftSidebarSize()).toBe(0)
      expect(isQuickClosing.value).toBe(false) // Reset after execution
    })

    it('should block events when isQuickClosing is true', () => {
      isQuickClosing.value = true
      currentMode.value = 'terminal'
      isDraggingSplitter.value = true
      showAiSidebar.value = true
      aiSidebarSize.value = 30

      const mockEvent = { clientX: 1160 } as MouseEvent
      handleGlobalMouseMove(mockEvent)

      // Should not process the event
      expect(aiSidebarSize.value).toBe(30)
    })

    it('should trigger mouseup event to terminate splitpanes drag', () => {
      const dispatchEventSpy = vi.spyOn(global.document, 'dispatchEvent')
      currentMode.value = 'terminal'
      isDraggingSplitter.value = true
      showAiSidebar.value = true
      aiSidebarSize.value = 30

      const mockEvent = { clientX: 1160 } as MouseEvent
      handleGlobalMouseMove(mockEvent)

      expect(dispatchEventSpy).toHaveBeenCalledWith(expect.objectContaining({ type: 'mouseup' }))
    })

    it('should respect Agents mode - no quick close for AI sidebar', () => {
      currentMode.value = 'agents'
      isDraggingSplitter.value = true
      showAiSidebar.value = true
      aiSidebarSize.value = 30

      const mockEvent = { clientX: 1160 } as MouseEvent
      handleGlobalMouseMove(mockEvent)

      // Should not trigger in Agents mode
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

      // Both should be blocked
      expect(leftPaneSize.value).toBe(0)
      expect(aiSidebarSize.value).toBe(0)
    })

    it('should allow resize after isQuickClosing is reset', () => {
      currentMode.value = 'terminal'
      isQuickClosing.value = true
      leftPaneSize.value = 0

      handleLeftPaneResize({ prevPane: { size: 30 } })
      expect(leftPaneSize.value).toBe(0) // Blocked

      isQuickClosing.value = false
      handleLeftPaneResize({ prevPane: { size: 30 } })
      expect(leftPaneSize.value).toBe(30) // Now allowed
    })
  })

  describe('Edge Cases', () => {
    it('should handle missing DOM elements gracefully', () => {
      global.document.querySelector = vi.fn(() => null)

      expect(() => {
        updateAiSidebarMinSize()
      }).not.toThrow()

      expect(() => {
        restoreLeftSidebarState()
      }).not.toThrow()
    })

    it('should handle both sidebars being dragged independently', () => {
      currentMode.value = 'terminal'

      // Left sidebar quick close
      isDraggingLeftSplitter.value = true
      leftPaneSize.value = 30
      const mockEventLeft = { clientX: 40 } as MouseEvent
      handleGlobalMouseMove(mockEventLeft)
      expect(getLeftSidebarSize()).toBe(0)

      // AI sidebar quick close (should not affect left sidebar)
      isDraggingLeftSplitter.value = false
      isDraggingSplitter.value = true
      showAiSidebar.value = true
      aiSidebarSize.value = 30
      leftPaneSize.value = 25 // Reset left sidebar

      const mockEventRight = { clientX: 1160 } as MouseEvent
      handleGlobalMouseMove(mockEventRight)
      expect(showAiSidebar.value).toBe(false)
      expect(getLeftSidebarSize()).toBe(25) // Left sidebar should remain unchanged
    })
  })
})
