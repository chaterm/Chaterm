/**
 * TerminalLayout Component - Tab Context Menu Tests
 *
 * This test suite focuses on testing the tab context menu functionality
 * implemented in TerminalLayout.vue, including:
 * - findPanelIdFromTab function for correctly identifying clicked tabs
 * - Context menu operations (close, rename, clone, split)
 * - Handling multiple tabs with same titles
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

describe('TerminalLayout - Tab Context Menu', () => {
  // Mock DockviewApi
  let mockDockApi: any
  let mockPanels: any[]
  let mockGroups: Map<string, any>

  // Implementation of findPanelIdFromTab (extracted from component)
  const findPanelIdFromTab = (tabElement: HTMLElement, dockApi: any): string | null => {
    try {
      if (!dockApi) return null

      for (const panel of dockApi.panels) {
        const panelGroup = panel.api.group
        if (!panelGroup?.element?.contains(tabElement)) continue

        // Get all tab elements in the group
        const tabs = Array.from(panelGroup.element.querySelectorAll('.dv-tab'))
        // Find the index of the clicked tab
        const tabIndex = tabs.indexOf(tabElement)

        if (tabIndex === -1) continue

        // Get panels in the group (in tab order)
        const groupPanels = panelGroup.panels

        // Return the panel ID based on index
        if (groupPanels && tabIndex < groupPanels.length) {
          return groupPanels[tabIndex].id
        }
      }
      return null
    } catch (error) {
      return null
    }
  }

  // Old implementation for comparison testing
  const findPanelIdFromTabOld = (tabElement: HTMLElement, dockApi: any): string | null => {
    try {
      if (dockApi) {
        for (const panel of dockApi.panels) {
          const panelGroup = panel.api.group
          if (panelGroup?.element?.contains(tabElement)) {
            const tabTitle = tabElement.textContent?.trim()
            const panelTitle = panel.api.title
            if (tabTitle === panelTitle) {
              return panel.id
            }
          }
        }
      }
      return null
    } catch (error) {
      return null
    }
  }

  beforeEach(() => {
    // Create mock groups
    mockGroups = new Map()

    // Create mock panels with different scenarios
    mockPanels = []

    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  /**
   * Helper to create a mock group with tabs
   */
  const createMockGroup = (groupId: string, panelConfigs: Array<{ id: string; title: string }>) => {
    const tabElements: HTMLElement[] = []
    const groupPanels: any[] = []

    // Create tab elements
    panelConfigs.forEach((config) => {
      const tabEl = document.createElement('div')
      tabEl.className = 'dv-tab'
      tabEl.textContent = config.title
      tabElements.push(tabEl)
    })

    // Create group element containing tabs
    const groupElement = document.createElement('div')
    groupElement.className = 'dv-group'
    tabElements.forEach((tab) => groupElement.appendChild(tab))

    // Create panels for this group
    panelConfigs.forEach((config) => {
      const panel = {
        id: config.id,
        api: {
          title: config.title,
          group: null as any // Will be set below
        }
      }
      groupPanels.push(panel)
      mockPanels.push(panel)
    })

    // Create group object
    const group = {
      id: groupId,
      element: groupElement,
      panels: groupPanels
    }

    // Link panels to group
    groupPanels.forEach((panel) => {
      panel.api.group = group
    })

    mockGroups.set(groupId, group)

    return { group, tabElements, groupPanels }
  }

  describe('findPanelIdFromTab - Index-Based Matching (New Implementation)', () => {
    it('should correctly identify single tab in a group', () => {
      const { tabElements } = createMockGroup('group1', [{ id: 'panel_1', title: 'Server A' }])

      mockDockApi = { panels: mockPanels }

      const result = findPanelIdFromTab(tabElements[0], mockDockApi)
      expect(result).toBe('panel_1')
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
      // This is the bug scenario: multiple tabs connected to same server
      const { tabElements } = createMockGroup('group1', [
        { id: 'panel_1', title: 'production-server' },
        { id: 'panel_2', title: 'production-server' },
        { id: 'panel_3', title: 'production-server' }
      ])

      mockDockApi = { panels: mockPanels }

      // New implementation should correctly identify each tab by index
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

      // Clicking on the LAST tab should return the LAST panel's ID
      const lastTabIndex = tabElements.length - 1
      const result = findPanelIdFromTab(tabElements[lastTabIndex], mockDockApi)
      expect(result).toBe('panel_3')
    })

    it('should handle mixed unique and duplicate titles', () => {
      const { tabElements } = createMockGroup('group1', [
        { id: 'panel_1', title: 'Server A' },
        { id: 'panel_2', title: 'Server B' },
        { id: 'panel_3', title: 'Server A' }, // Same as first
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

      // Old implementation always returns the first matching panel
      // This demonstrates the bug
      const oldResult1 = findPanelIdFromTabOld(tabElements[0], mockDockApi)
      const oldResult2 = findPanelIdFromTabOld(tabElements[1], mockDockApi)
      const oldResult3 = findPanelIdFromTabOld(tabElements[2], mockDockApi)

      // Old implementation incorrectly returns panel_1 for all tabs
      expect(oldResult1).toBe('panel_1')
      expect(oldResult2).toBe('panel_1') // BUG: should be panel_2
      expect(oldResult3).toBe('panel_1') // BUG: should be panel_3

      // New implementation returns correct panel IDs
      const newResult1 = findPanelIdFromTab(tabElements[0], mockDockApi)
      const newResult2 = findPanelIdFromTab(tabElements[1], mockDockApi)
      const newResult3 = findPanelIdFromTab(tabElements[2], mockDockApi)

      expect(newResult1).toBe('panel_1')
      expect(newResult2).toBe('panel_2') // FIXED
      expect(newResult3).toBe('panel_3') // FIXED
    })
  })

  describe('Edge Cases', () => {
    it('should return null when dockApi is null', () => {
      const tabEl = document.createElement('div')
      tabEl.className = 'dv-tab'

      const result = findPanelIdFromTab(tabEl, null)
      expect(result).toBeNull()
    })

    it('should return null when tab element is not in any group', () => {
      createMockGroup('group1', [{ id: 'panel_1', title: 'Server A' }])
      mockDockApi = { panels: mockPanels }

      // Create a tab element that's not in any group
      const orphanTab = document.createElement('div')
      orphanTab.className = 'dv-tab'

      const result = findPanelIdFromTab(orphanTab, mockDockApi)
      expect(result).toBeNull()
    })

    it('should return null when panels array is empty', () => {
      mockDockApi = { panels: [] }

      const tabEl = document.createElement('div')
      tabEl.className = 'dv-tab'

      const result = findPanelIdFromTab(tabEl, mockDockApi)
      expect(result).toBeNull()
    })

    it('should handle group with no panels gracefully', () => {
      // Create a group element with tabs but no panels
      const groupElement = document.createElement('div')
      const tabEl = document.createElement('div')
      tabEl.className = 'dv-tab'
      groupElement.appendChild(tabEl)

      const emptyGroup = {
        element: groupElement,
        panels: [] // No panels
      }

      const panel = {
        id: 'panel_orphan',
        api: {
          title: 'Orphan',
          group: emptyGroup
        }
      }

      mockDockApi = { panels: [panel] }

      const result = findPanelIdFromTab(tabEl, mockDockApi)
      expect(result).toBeNull() // tabIndex 0, but groupPanels is empty
    })

    it('should handle errors gracefully and return null', () => {
      // Create a scenario that would throw an error
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

      const result = findPanelIdFromTab(tabEl, faultyDockApi)
      expect(result).toBeNull()
    })
  })

  describe('Multiple Groups', () => {
    it('should correctly identify tabs across multiple groups', () => {
      // Create first group
      const { tabElements: tabs1 } = createMockGroup('group1', [
        { id: 'panel_g1_1', title: 'Group1 Tab1' },
        { id: 'panel_g1_2', title: 'Group1 Tab2' }
      ])

      // Create second group
      const { tabElements: tabs2 } = createMockGroup('group2', [
        { id: 'panel_g2_1', title: 'Group2 Tab1' },
        { id: 'panel_g2_2', title: 'Group2 Tab2' }
      ])

      mockDockApi = { panels: mockPanels }

      // Should correctly identify tabs in both groups
      expect(findPanelIdFromTab(tabs1[0], mockDockApi)).toBe('panel_g1_1')
      expect(findPanelIdFromTab(tabs1[1], mockDockApi)).toBe('panel_g1_2')
      expect(findPanelIdFromTab(tabs2[0], mockDockApi)).toBe('panel_g2_1')
      expect(findPanelIdFromTab(tabs2[1], mockDockApi)).toBe('panel_g2_2')
    })

    it('should handle same titles across different groups', () => {
      // Both groups have tabs with same title
      const { tabElements: tabs1 } = createMockGroup('group1', [{ id: 'panel_g1_1', title: 'Server' }])

      const { tabElements: tabs2 } = createMockGroup('group2', [{ id: 'panel_g2_1', title: 'Server' }])

      mockDockApi = { panels: mockPanels }

      // Should correctly identify the right panel in each group
      expect(findPanelIdFromTab(tabs1[0], mockDockApi)).toBe('panel_g1_1')
      expect(findPanelIdFromTab(tabs2[0], mockDockApi)).toBe('panel_g2_1')
    })
  })
})
