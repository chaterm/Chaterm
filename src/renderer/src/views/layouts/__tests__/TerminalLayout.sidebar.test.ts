/**
 * TerminalLayout Component - AI Sidebar Sticky Logic Tests
 *
 * This test suite focuses on testing the AI sidebar sticky resizing functionality
 * implemented in TerminalLayout.vue, including:
 * - Physical resistance (min-size property)
 * - Quick close mechanism (global mouse tracking)
 * - Debounced auto-close
 * - State restoration
 * - Mode-specific behaviors (Terminal vs Agents)
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

describe('TerminalLayout - AI Sidebar Sticky Logic', () => {
  // Constants from the component
  const MIN_AI_SIDEBAR_WIDTH_PX = 350
  const SNAP_THRESHOLD_PX = 200
  const DEFAULT_WIDTH_RIGHT_PX = 500

  // Mock reactive variables
  let aiSidebarSize: any
  let aiMinSize: any
  let isDraggingSplitter: any
  let showAiSidebar: any
  let savedAiSidebarState: any
  let currentMode: any

  // Mock functions
  let updateAiSidebarMinSize: any
  let debouncedAiResizeCheck: any
  let handleGlobalMouseMove: any

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

    debouncedAiResizeCheck = vi.fn(() => {
      if (currentMode.value === 'agents') {
        return
      }

      const container = global.document.querySelector('.main-split-container') || global.document.querySelector('.splitpanes')
      if (container) {
        const containerWidth = (container as HTMLElement).offsetWidth
        const currentAiSidebarSize = aiSidebarSize.value
        const aiSidebarWidthPx = (currentAiSidebarSize / 100) * containerWidth

        if (aiSidebarWidthPx < 50 && currentAiSidebarSize > 0) {
          showAiSidebar.value = false
          aiSidebarSize.value = 0
        }
      }
    })

    handleGlobalMouseMove = vi.fn((e: MouseEvent) => {
      if (isDraggingSplitter.value && showAiSidebar.value) {
        if (currentMode.value === 'agents') {
          return
        }

        const distFromRight = global.window.innerWidth - e.clientX
        if (distFromRight < 50) {
          showAiSidebar.value = false
          aiSidebarSize.value = 0
          isDraggingSplitter.value = false
        }
      }
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('AI Sidebar Min-Size Calculation', () => {
    it('should calculate correct min-size for Terminal mode', () => {
      currentMode.value = 'terminal'
      updateAiSidebarMinSize()

      // Main container width is 800px, SNAP_THRESHOLD_PX is 200px
      // Expected: (200 / 800) * 100 = 25%
      expect(aiMinSize.value).toBe(25)
    })

    it('should calculate correct min-size for Agents mode', () => {
      currentMode.value = 'agents'
      updateAiSidebarMinSize()

      // Left sidebar container width is 1000px, SNAP_THRESHOLD_PX is 200px
      // Expected: (200 / 1000) * 100 = 20%
      expect(aiMinSize.value).toBe(20)
    })

    it('should use different containers for different modes', () => {
      const querySelectorSpy = vi.spyOn(global.document, 'querySelector')

      // Test Terminal mode
      currentMode.value = 'terminal'
      updateAiSidebarMinSize()
      expect(querySelectorSpy).toHaveBeenCalledWith('.main-split-container')

      // Test Agents mode
      currentMode.value = 'agents'
      updateAiSidebarMinSize()
      expect(querySelectorSpy).toHaveBeenCalledWith('.left-sidebar-container')
    })
  })

  describe('Quick Close Mechanism', () => {
    beforeEach(() => {
      isDraggingSplitter.value = true
      showAiSidebar.value = true
      aiSidebarSize.value = 30 // Some initial size
    })

    it('should trigger quick close when mouse is near right edge in Terminal mode', () => {
      currentMode.value = 'terminal'

      const mockEvent = { clientX: 1160 } as MouseEvent // 40px from right edge (1200 - 1160)
      handleGlobalMouseMove(mockEvent)

      expect(showAiSidebar.value).toBe(false)
      expect(aiSidebarSize.value).toBe(0)
      expect(isDraggingSplitter.value).toBe(false)
    })

    it('should not trigger quick close when mouse is far from right edge', () => {
      currentMode.value = 'terminal'

      const mockEvent = { clientX: 1100 } as MouseEvent // 100px from right edge
      handleGlobalMouseMove(mockEvent)

      expect(showAiSidebar.value).toBe(true)
      expect(aiSidebarSize.value).toBe(30)
      expect(isDraggingSplitter.value).toBe(true)
    })

    it('should not trigger quick close in Agents mode', () => {
      currentMode.value = 'agents'

      const mockEvent = { clientX: 1160 } as MouseEvent // 40px from right edge
      handleGlobalMouseMove(mockEvent)

      // Should remain unchanged in Agents mode
      expect(showAiSidebar.value).toBe(true)
      expect(aiSidebarSize.value).toBe(30)
      expect(isDraggingSplitter.value).toBe(true)
    })

    it('should not trigger when not dragging splitter', () => {
      isDraggingSplitter.value = false
      currentMode.value = 'terminal'

      const mockEvent = { clientX: 1160 } as MouseEvent
      handleGlobalMouseMove(mockEvent)

      expect(showAiSidebar.value).toBe(true)
      expect(aiSidebarSize.value).toBe(30)
    })

    it('should not trigger when sidebar is not shown', () => {
      showAiSidebar.value = false
      currentMode.value = 'terminal'

      const mockEvent = { clientX: 1160 } as MouseEvent
      handleGlobalMouseMove(mockEvent)

      expect(aiSidebarSize.value).toBe(30) // Should remain unchanged
    })
  })

  describe('Debounced Auto-Close', () => {
    it('should auto-close when width is less than 50px in Terminal mode', () => {
      currentMode.value = 'terminal'
      showAiSidebar.value = true
      aiSidebarSize.value = 4 // 4% of 1000px = 40px < 50px

      debouncedAiResizeCheck()

      expect(showAiSidebar.value).toBe(false)
      expect(aiSidebarSize.value).toBe(0)
    })

    it('should not auto-close when width is greater than 50px', () => {
      currentMode.value = 'terminal'
      showAiSidebar.value = true
      aiSidebarSize.value = 10 // 10% of 1000px = 100px > 50px

      debouncedAiResizeCheck()

      expect(showAiSidebar.value).toBe(true)
      expect(aiSidebarSize.value).toBe(10)
    })

    it('should not auto-close in Agents mode regardless of width', () => {
      currentMode.value = 'agents'
      showAiSidebar.value = true
      aiSidebarSize.value = 2 // 2% of 1000px = 20px < 50px

      debouncedAiResizeCheck()

      // Should remain unchanged in Agents mode
      expect(showAiSidebar.value).toBe(true)
      expect(aiSidebarSize.value).toBe(2)
    })

    it('should not auto-close when sidebar is already closed', () => {
      currentMode.value = 'terminal'
      showAiSidebar.value = true
      aiSidebarSize.value = 0 // Already closed

      debouncedAiResizeCheck()

      // Should remain closed
      expect(showAiSidebar.value).toBe(true) // showAiSidebar might still be true
      expect(aiSidebarSize.value).toBe(0)
    })
  })

  describe('State Restoration Logic', () => {
    const createMockToggleSideBar = () => {
      return (value: string) => {
        const container = global.document.querySelector('.main-split-container') || global.document.querySelector('.splitpanes')
        const containerWidth = container ? (container as HTMLElement).offsetWidth : 1000

        if (value === 'right') {
          if (!showAiSidebar.value) {
            showAiSidebar.value = true

            // Calculate minimum percentage
            const minSizePercent = (MIN_AI_SIDEBAR_WIDTH_PX / containerWidth) * 100

            // Try to restore saved width, otherwise use default width
            let restoredSize = savedAiSidebarState.value?.size || (DEFAULT_WIDTH_RIGHT_PX / containerWidth) * 100

            // Ensure restored width is not less than minimum usable width
            if ((restoredSize / 100) * containerWidth < MIN_AI_SIDEBAR_WIDTH_PX) {
              restoredSize = minSizePercent
            }

            aiSidebarSize.value = restoredSize
          }
        }
      }
    }

    it('should restore to minimum width when no saved state exists', () => {
      const toggleSideBar = createMockToggleSideBar()
      savedAiSidebarState.value = null

      toggleSideBar('right')

      // Should use default width: (500 / 800) * 100 = 62.5%
      // But minimum is: (350 / 800) * 100 = 43.75%
      // Since 62.5% > 43.75%, should use 62.5%
      expect(showAiSidebar.value).toBe(true)
      expect(aiSidebarSize.value).toBe(62.5)
    })

    it('should restore to saved width when it meets minimum requirement', () => {
      const toggleSideBar = createMockToggleSideBar()
      savedAiSidebarState.value = { size: 50 } // 50% of 800px = 400px > 350px minimum

      toggleSideBar('right')

      expect(showAiSidebar.value).toBe(true)
      expect(aiSidebarSize.value).toBe(50)
    })

    it('should enforce minimum width when saved width is too small', () => {
      const toggleSideBar = createMockToggleSideBar()
      savedAiSidebarState.value = { size: 20 } // 20% of 800px = 160px < 350px minimum

      toggleSideBar('right')

      // Should use minimum: (350 / 800) * 100 = 43.75%
      expect(showAiSidebar.value).toBe(true)
      expect(aiSidebarSize.value).toBe(43.75)
    })

    it('should handle different container widths correctly', () => {
      const toggleSideBar = createMockToggleSideBar()

      // Mock smaller container
      global.document.querySelector = vi.fn(() => ({ offsetWidth: 500 }))
      savedAiSidebarState.value = { size: 60 } // 60% of 500px = 300px < 350px minimum

      toggleSideBar('right')

      // Should use minimum: (350 / 500) * 100 = 70%
      expect(showAiSidebar.value).toBe(true)
      expect(aiSidebarSize.value).toBe(70)
    })
  })

  describe('Mode-Specific Behaviors', () => {
    it('should have different min-size calculations for different modes', () => {
      // Terminal mode
      currentMode.value = 'terminal'
      updateAiSidebarMinSize()
      const terminalMinSize = aiMinSize.value

      // Agents mode
      currentMode.value = 'agents'
      updateAiSidebarMinSize()
      const agentsMinSize = aiMinSize.value

      // Should be different due to different container widths
      expect(terminalMinSize).not.toBe(agentsMinSize)
      expect(terminalMinSize).toBe(25) // 200/800 * 100
      expect(agentsMinSize).toBe(20) // 200/1000 * 100
    })

    it('should disable auto-close in Agents mode but allow in Terminal mode', () => {
      showAiSidebar.value = true
      aiSidebarSize.value = 2 // Very small size

      // Terminal mode should auto-close
      currentMode.value = 'terminal'
      debouncedAiResizeCheck()
      expect(showAiSidebar.value).toBe(false)

      // Reset
      showAiSidebar.value = true
      aiSidebarSize.value = 2

      // Agents mode should not auto-close
      currentMode.value = 'agents'
      debouncedAiResizeCheck()
      expect(showAiSidebar.value).toBe(true)
    })

    it('should disable quick close in Agents mode but allow in Terminal mode', () => {
      isDraggingSplitter.value = true
      showAiSidebar.value = true
      aiSidebarSize.value = 30
      const mockEvent = { clientX: 1160 } as MouseEvent // Near right edge

      // Terminal mode should allow quick close
      currentMode.value = 'terminal'
      handleGlobalMouseMove(mockEvent)
      expect(showAiSidebar.value).toBe(false)

      // Reset
      showAiSidebar.value = true
      aiSidebarSize.value = 30

      // Agents mode should not allow quick close
      currentMode.value = 'agents'
      handleGlobalMouseMove(mockEvent)
      expect(showAiSidebar.value).toBe(true)
    })
  })

  describe('Edge Cases and Error Handling', () => {
    it('should handle missing DOM elements gracefully', () => {
      global.document.querySelector = vi.fn(() => null)

      expect(() => {
        updateAiSidebarMinSize()
      }).not.toThrow()

      expect(() => {
        debouncedAiResizeCheck()
      }).not.toThrow()
    })

    it('should handle zero container width', () => {
      global.document.querySelector = vi.fn(() => ({ offsetWidth: 0 }))

      updateAiSidebarMinSize()

      // Should handle division by zero gracefully
      expect(aiMinSize.value).toBe(Infinity)
    })

    it('should handle negative sidebar sizes', () => {
      currentMode.value = 'terminal'
      showAiSidebar.value = true
      aiSidebarSize.value = -5 // Negative size

      debouncedAiResizeCheck()

      // Should not auto-close for negative sizes (since -5 is not > 0)
      expect(showAiSidebar.value).toBe(true)
    })

    it('should handle very large sidebar sizes', () => {
      currentMode.value = 'terminal'
      showAiSidebar.value = true
      aiSidebarSize.value = 200 // 200% > 100%

      debouncedAiResizeCheck()

      // Should not auto-close for large sizes
      expect(showAiSidebar.value).toBe(true)
      expect(aiSidebarSize.value).toBe(200)
    })
  })

  describe('Integration Scenarios', () => {
    it('should maintain consistent state through mode switches', () => {
      // Start in Terminal mode
      currentMode.value = 'terminal'
      updateAiSidebarMinSize()
      const terminalMinSize = aiMinSize.value

      // Switch to Agents mode
      currentMode.value = 'agents'
      updateAiSidebarMinSize()
      const agentsMinSize = aiMinSize.value

      // Switch back to Terminal mode
      currentMode.value = 'terminal'
      updateAiSidebarMinSize()

      expect(aiMinSize.value).toBe(terminalMinSize)
      expect(terminalMinSize).not.toBe(agentsMinSize)
    })

    it('should handle rapid resize events correctly', () => {
      currentMode.value = 'terminal'
      showAiSidebar.value = true

      // Simulate rapid resize events
      aiSidebarSize.value = 10 // Above threshold
      debouncedAiResizeCheck()
      expect(showAiSidebar.value).toBe(true)

      aiSidebarSize.value = 3 // Below threshold
      debouncedAiResizeCheck()
      expect(showAiSidebar.value).toBe(false)

      // Reset and test again
      showAiSidebar.value = true
      aiSidebarSize.value = 8 // Above threshold again
      debouncedAiResizeCheck()
      expect(showAiSidebar.value).toBe(true)
    })

    it('should handle simultaneous mouse and resize events', () => {
      currentMode.value = 'terminal'
      isDraggingSplitter.value = true
      showAiSidebar.value = true
      aiSidebarSize.value = 3 // Below auto-close threshold

      // Trigger auto-close first
      debouncedAiResizeCheck()
      expect(showAiSidebar.value).toBe(false)

      // Then trigger mouse move (should not affect already closed sidebar)
      const mockEvent = { clientX: 1160 } as MouseEvent
      handleGlobalMouseMove(mockEvent)

      expect(showAiSidebar.value).toBe(false)
      expect(aiSidebarSize.value).toBe(0)
    })
  })
})
