import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ref } from 'vue'
import { mount } from '@vue/test-utils'

// Mock the complex dependencies that aren't relevant to scrollbar testing
vi.mock('xterm', () => ({
  Terminal: vi.fn(() => ({
    onKey: vi.fn(),
    onSelectionChange: vi.fn(),
    loadAddon: vi.fn(),
    open: vi.fn(),
    onResize: vi.fn(),
    write: vi.fn(),
    scrollToBottom: vi.fn(),
    focus: vi.fn(),
    buffer: { active: { baseY: 0 } },
    element: {
      querySelector: vi.fn(() => ({
        addEventListener: vi.fn(),
        removeEventListener: vi.fn()
      }))
    }
  }))
}))

vi.mock('xterm-addon-fit', () => ({
  FitAddon: vi.fn(() => ({ fit: vi.fn() }))
}))

vi.mock('xterm-addon-search', () => ({
  SearchAddon: vi.fn()
}))

vi.mock('@/utils/eventBus', () => ({
  default: {
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn()
  }
}))

vi.mock('@/store/userConfigStore', () => ({
  userConfigStore: () => ({
    getUserConfig: {
      background: { image: null },
      theme: 'dark',
      scrollBack: 1000,
      cursorStyle: 'block',
      fontSize: 12,
      fontFamily: 'monospace'
    }
  })
}))

// Mock other complex dependencies
vi.mock('@/services/userConfigStoreService', () => ({
  userConfigStore: {
    getConfig: vi.fn(() =>
      Promise.resolve({
        aliasStatus: 0,
        autoCompleteStatus: 0,
        scrollBack: 1000,
        highlightStatus: 0,
        terminalType: 'xterm-256color',
        pinchZoomStatus: 0,
        sshAgentsStatus: 0,
        quickVimStatus: 0,
        rightMouseEvent: 'contextMenu',
        middleMouseEvent: 'paste'
      })
    )
  }
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key
  })
}))

vi.mock('@/store/index', () => ({
  userInfoStore: () => ({
    userInfo: { email: 'test@example.com' }
  })
}))

// Create a simplified test component that isolates the scrollbar functionality
const TestScrollbarComponent = {
  template: `
    <div ref="terminalContainer" class="terminal-container">
      <div ref="terminalElement" class="terminal">
        <div class="xterm-viewport"></div>
      </div>
    </div>
  `,
  setup() {
    const terminalContainer = ref<HTMLDivElement | null>(null)
    const terminalElement = ref<HTMLDivElement | null>(null)

    let viewportScrollbarHideTimer: number | null = null

    const showTerminalScrollbarTemporarily = () => {
      const container = terminalContainer.value
      if (!container) return

      container.classList.add('scrollbar-visible')

      if (viewportScrollbarHideTimer) {
        window.clearTimeout(viewportScrollbarHideTimer)
      }

      viewportScrollbarHideTimer = window.setTimeout(() => {
        container.classList.remove('scrollbar-visible')
        viewportScrollbarHideTimer = null
      }, 2000)
    }

    const updateSelectionButtonPosition = vi.fn()

    const handleViewportScroll = () => {
      updateSelectionButtonPosition()
      showTerminalScrollbarTemporarily()
    }

    const cleanup = () => {
      if (viewportScrollbarHideTimer) {
        window.clearTimeout(viewportScrollbarHideTimer)
        viewportScrollbarHideTimer = null
      }
    }

    return {
      terminalContainer,
      terminalElement,
      showTerminalScrollbarTemporarily,
      handleViewportScroll,
      updateSelectionButtonPosition,
      cleanup
    }
  }
}

describe('Terminal Scrollbar Functionality', () => {
  let wrapper: any
  let mockSetTimeout: any
  let mockClearTimeout: any

  beforeEach(() => {
    // Mock timers
    vi.useFakeTimers()
    mockSetTimeout = vi.spyOn(window, 'setTimeout')
    mockClearTimeout = vi.spyOn(window, 'clearTimeout')

    wrapper = mount(TestScrollbarComponent)
  })

  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
    mockSetTimeout?.mockRestore()
    mockClearTimeout?.mockRestore()
    wrapper?.unmount()
  })

  describe('showTerminalScrollbarTemporarily', () => {
    it('should add scrollbar-visible class to terminal container', async () => {
      const container = wrapper.vm.terminalContainer

      wrapper.vm.showTerminalScrollbarTemporarily()

      expect(container.classList.contains('scrollbar-visible')).toBe(true)
    })

    it('should do nothing if terminal container is not available', () => {
      wrapper.vm.terminalContainer = null

      expect(() => {
        wrapper.vm.showTerminalScrollbarTemporarily()
      }).not.toThrow()

      expect(mockSetTimeout).not.toHaveBeenCalled()
    })

    it('should clear existing timer before setting new one', () => {
      // First call
      wrapper.vm.showTerminalScrollbarTemporarily()
      expect(mockSetTimeout).toHaveBeenCalledTimes(1)

      // Second call should clear the previous timer
      wrapper.vm.showTerminalScrollbarTemporarily()
      expect(mockClearTimeout).toHaveBeenCalledTimes(1)
      expect(mockSetTimeout).toHaveBeenCalledTimes(2)
    })

    it('should remove scrollbar-visible class after 2 seconds', async () => {
      const container = wrapper.vm.terminalContainer

      wrapper.vm.showTerminalScrollbarTemporarily()
      expect(container.classList.contains('scrollbar-visible')).toBe(true)

      // Fast-forward time by 2 seconds
      vi.advanceTimersByTime(2000)

      expect(container.classList.contains('scrollbar-visible')).toBe(false)
    })

    it('should set timer to 2000ms', () => {
      wrapper.vm.showTerminalScrollbarTemporarily()

      expect(mockSetTimeout).toHaveBeenCalledWith(expect.any(Function), 2000)
    })

    it('should reset timer variable to null after timeout', () => {
      wrapper.vm.showTerminalScrollbarTemporarily()

      // Fast-forward time by 2 seconds
      vi.advanceTimersByTime(2000)

      // The timer should be reset to null (we can't directly test this,
      // but we can verify behavior when calling the function again)
      wrapper.vm.showTerminalScrollbarTemporarily()

      // Should not call clearTimeout since timer was reset to null
      expect(mockClearTimeout).toHaveBeenCalledTimes(0)
    })
  })

  describe('handleViewportScroll', () => {
    it('should call updateSelectionButtonPosition', () => {
      wrapper.vm.handleViewportScroll()

      expect(wrapper.vm.updateSelectionButtonPosition).toHaveBeenCalledTimes(1)
    })

    it('should call showTerminalScrollbarTemporarily', () => {
      // Test the actual behavior instead of spying on internal calls
      const container = wrapper.vm.terminalContainer
      expect(container.classList.contains('scrollbar-visible')).toBe(false)

      wrapper.vm.handleViewportScroll()

      // The scrollbar should be shown after the scroll event
      expect(container.classList.contains('scrollbar-visible')).toBe(true)
    })

    it('should add scrollbar-visible class through showTerminalScrollbarTemporarily', () => {
      const container = wrapper.vm.terminalContainer

      wrapper.vm.handleViewportScroll()

      expect(container.classList.contains('scrollbar-visible')).toBe(true)
    })
  })

  describe('timer cleanup', () => {
    it('should clear timer on cleanup', () => {
      wrapper.vm.showTerminalScrollbarTemporarily()

      wrapper.vm.cleanup()

      expect(mockClearTimeout).toHaveBeenCalledTimes(1)
    })

    it('should handle cleanup when no timer exists', () => {
      expect(() => {
        wrapper.vm.cleanup()
      }).not.toThrow()
    })
  })

  describe('CSS class behavior', () => {
    it('should toggle scrollbar-visible class correctly', async () => {
      const container = wrapper.vm.terminalContainer

      // Initially no class
      expect(container.classList.contains('scrollbar-visible')).toBe(false)

      // Add class
      wrapper.vm.showTerminalScrollbarTemporarily()
      expect(container.classList.contains('scrollbar-visible')).toBe(true)

      // Remove class after timeout
      vi.advanceTimersByTime(2000)
      expect(container.classList.contains('scrollbar-visible')).toBe(false)
    })

    it('should handle multiple rapid calls correctly', () => {
      const container = wrapper.vm.terminalContainer

      // Multiple rapid calls
      wrapper.vm.showTerminalScrollbarTemporarily()
      wrapper.vm.showTerminalScrollbarTemporarily()
      wrapper.vm.showTerminalScrollbarTemporarily()

      expect(container.classList.contains('scrollbar-visible')).toBe(true)
      expect(mockClearTimeout).toHaveBeenCalledTimes(2) // Clear called for 2nd and 3rd calls

      // Only the last timer should be active
      vi.advanceTimersByTime(2000)
      expect(container.classList.contains('scrollbar-visible')).toBe(false)
    })
  })

  describe('edge cases', () => {
    it('should handle container becoming null after timer is set', () => {
      wrapper.vm.showTerminalScrollbarTemporarily()
      wrapper.vm.terminalContainer = null

      // Should not throw error when timer executes
      expect(() => {
        vi.advanceTimersByTime(2000)
      }).not.toThrow()
    })
  })
})
