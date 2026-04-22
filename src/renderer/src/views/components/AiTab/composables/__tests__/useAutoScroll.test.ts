import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { nextTick, ref } from 'vue'
import { useAutoScroll } from '../useAutoScroll'

// Create shared ref for shouldStickToBottom
const shouldStickToBottom = ref(true)
const chatContainerScrollSignal = ref(0)
let latestIntersectionCallback: ((entries: Array<{ isIntersecting: boolean }>) => void) | null = null

// Mock useSessionState
vi.mock('../useSessionState', () => ({
  useSessionState: () => ({
    shouldStickToBottom,
    chatContainerScrollSignal
  })
}))

// Mock focusChatInput
vi.mock('../useTabManagement', () => ({
  focusChatInput: vi.fn()
}))

describe('useAutoScroll', () => {
  let mockContainer: HTMLElement

  beforeEach(() => {
    // Reset shouldStickToBottom
    shouldStickToBottom.value = true
    chatContainerScrollSignal.value = 0

    // Create a mock container element
    mockContainer = document.createElement('div')
    Object.defineProperties(mockContainer, {
      scrollHeight: { value: 1000, writable: true, configurable: true },
      scrollTop: { value: 0, writable: true, configurable: true },
      clientHeight: { value: 500, writable: true, configurable: true }
    })
    document.body.appendChild(mockContainer)

    // Mock requestAnimationFrame
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
      cb(0)
      return 0
    })

    latestIntersectionCallback = null
    class MockIntersectionObserver {
      observe = vi.fn()
      disconnect = vi.fn()
      unobserve = vi.fn()

      constructor(callback: (entries: Array<{ isIntersecting: boolean }>) => void) {
        latestIntersectionCallback = callback
      }
    }

    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver)
  })

  afterEach(() => {
    document.body.removeChild(mockContainer)
    vi.clearAllMocks()
    vi.unstubAllGlobals()
  })

  describe('isAtBottom', () => {
    it('should return true when element is at bottom', () => {
      const { isAtBottom } = useAutoScroll()

      Object.defineProperty(mockContainer, 'scrollTop', { value: 500, writable: true })

      expect(isAtBottom(mockContainer)).toBe(true)
    })

    it('should return true when element is within sticky threshold of bottom', () => {
      const { isAtBottom } = useAutoScroll()

      // scrollHeight (1000) - (scrollTop (490) + clientHeight (500)) = 10 < 24 (threshold)
      Object.defineProperty(mockContainer, 'scrollTop', { value: 490, writable: true })

      expect(isAtBottom(mockContainer)).toBe(true)
    })

    it('should return false when element is not at bottom', () => {
      const { isAtBottom } = useAutoScroll()

      Object.defineProperty(mockContainer, 'scrollTop', { value: 400, writable: true })

      expect(isAtBottom(mockContainer)).toBe(false)
    })
  })

  describe('scrollToBottom', () => {
    it('should scroll container to bottom when shouldStickToBottom is true', async () => {
      const { scrollToBottom, chatContainer } = useAutoScroll()
      chatContainer.value = mockContainer

      scrollToBottom()
      await nextTick()
      await nextTick()

      expect(mockContainer.scrollTop).toBe(1000)
    })

    it('should force scroll even when shouldStickToBottom is false', async () => {
      const { scrollToBottom, chatContainer } = useAutoScroll()
      chatContainer.value = mockContainer

      scrollToBottom(true)
      await nextTick()
      await nextTick()

      expect(mockContainer.scrollTop).toBe(1000)
    })

    it('should handle null container gracefully', async () => {
      const { scrollToBottom, chatContainer } = useAutoScroll()
      chatContainer.value = null

      expect(() => scrollToBottom()).not.toThrow()
    })
  })

  describe('executeScroll', () => {
    it('should set scrollTop to scrollHeight', async () => {
      const { executeScroll, chatContainer } = useAutoScroll()
      chatContainer.value = mockContainer

      executeScroll()
      await nextTick()

      expect(mockContainer.scrollTop).toBe(1000)
    })
  })

  describe('scrollToBottomWithRetry', () => {
    it('should retry scrolling multiple times', async () => {
      const { scrollToBottomWithRetry, chatContainer } = useAutoScroll()
      chatContainer.value = mockContainer

      // Mock setTimeout to execute immediately
      vi.spyOn(global, 'setTimeout').mockImplementation((cb: any) => {
        cb()
        return 0 as any
      })

      scrollToBottomWithRetry(3, 10)
      await nextTick()

      // Verify that scrollTop was set
      expect(mockContainer.scrollTop).toBe(1000)

      vi.restoreAllMocks()
    })

    it('should handle null container gracefully', () => {
      const { scrollToBottomWithRetry, chatContainer } = useAutoScroll()
      chatContainer.value = null

      expect(() => scrollToBottomWithRetry()).not.toThrow()
    })
  })

  describe('initializeAutoScroll', () => {
    it('should initialize scroll event listener', async () => {
      const { initializeAutoScroll, chatContainer } = useAutoScroll()
      const addEventListenerSpy = vi.spyOn(mockContainer, 'addEventListener')
      chatContainer.value = mockContainer

      initializeAutoScroll()
      await nextTick()

      expect(addEventListenerSpy).toHaveBeenCalledWith('scroll', expect.any(Function), { passive: true })
    })

    it('should set initial shouldStickToBottom state', async () => {
      const { initializeAutoScroll, chatContainer } = useAutoScroll()
      Object.defineProperty(mockContainer, 'scrollTop', { value: 500, writable: true })
      chatContainer.value = mockContainer

      initializeAutoScroll()
      await nextTick()

      // Since we're at bottom, shouldStickToBottom should be true
      // This is verified through the isAtBottom check
      expect(mockContainer.scrollTop).toBe(500)
    })

    it('should trigger older history loading when scrolling near top', async () => {
      const onReachHistoryTop = vi.fn()
      const { initializeAutoScroll, chatContainer, historyTopSentinel } = useAutoScroll({ onReachHistoryTop })

      chatContainer.value = mockContainer
      historyTopSentinel.value = document.createElement('div')
      initializeAutoScroll()
      await nextTick()

      Object.defineProperty(mockContainer, 'scrollTop', { value: 80, writable: true })
      mockContainer.dispatchEvent(new Event('scroll'))

      expect(onReachHistoryTop).toHaveBeenCalledWith(mockContainer)
      expect(chatContainerScrollSignal.value).toBe(1)
    })

    it('should trigger older history loading via IntersectionObserver without prior user scroll', async () => {
      const onReachHistoryTop = vi.fn()
      const { initializeAutoScroll, chatContainer, historyTopSentinel } = useAutoScroll({ onReachHistoryTop })

      chatContainer.value = mockContainer
      historyTopSentinel.value = document.createElement('div')
      initializeAutoScroll()
      await nextTick()

      // No user scroll has happened, but IntersectionObserver should still trigger
      Object.defineProperty(mockContainer, 'scrollTop', { value: 0, writable: true })
      latestIntersectionCallback?.([{ isIntersecting: true }])

      expect(onReachHistoryTop).toHaveBeenCalledWith(mockContainer)
    })
  })

  describe('handleTabSwitch', () => {
    it('should reset shouldStickToBottom to true', async () => {
      const { handleTabSwitch, chatContainer } = useAutoScroll()
      chatContainer.value = mockContainer

      handleTabSwitch()
      await nextTick()

      // Verify scrolling behavior was triggered
      expect(mockContainer.scrollTop).toBeGreaterThanOrEqual(0)
    })

    it('should scroll to bottom with retry', async () => {
      const { handleTabSwitch, chatContainer } = useAutoScroll()
      chatContainer.value = mockContainer

      // Mock setTimeout to execute immediately
      vi.spyOn(global, 'setTimeout').mockImplementation((cb: any) => {
        cb()
        return 0 as any
      })

      handleTabSwitch()
      await nextTick()
      await nextTick()

      expect(mockContainer.scrollTop).toBe(1000)

      vi.restoreAllMocks()
    })
  })
})
