import { ref, watch, nextTick, onUnmounted } from 'vue'
import { useSessionState } from './useSessionState'
import { focusChatInput } from './useTabManagement'

/**
 * Composable for auto-scroll management
 * Handles automatic scrolling to bottom functionality for chat container (sticky scroll)
 */
export function useAutoScroll() {
  const { shouldStickToBottom } = useSessionState()
  const chatContainer = ref<HTMLElement | null>(null)
  const chatResponse = ref<HTMLElement | null>(null)

  const STICKY_THRESHOLD = 24

  const domObserver = ref<MutationObserver | null>(null)
  // Track last scrollTop to distinguish user-initiated scroll from content-change-induced scroll
  const lastScrollTop = ref<number>(0)
  const lastScrollHeight = ref<number>(0)
  // Flag to mark programmatic scrolling (to ignore scroll events during auto-scroll)
  const isProgrammaticScroll = ref<boolean>(false)

  const getElement = (refValue: any): HTMLElement | null => {
    if (!refValue) return null
    return Array.isArray(refValue) ? refValue[0] || null : refValue
  }

  const isAtBottom = (el: HTMLElement): boolean => {
    return el.scrollHeight - (el.scrollTop + el.clientHeight) <= STICKY_THRESHOLD
  }

  const executeScroll = () => {
    isProgrammaticScroll.value = true
    requestAnimationFrame(() => {
      const el = getElement(chatContainer.value)
      if (el instanceof HTMLElement) {
        el.scrollTop = el.scrollHeight
        // Reset flag after a short delay to allow scroll event to fire
        requestAnimationFrame(() => {
          setTimeout(() => {
            isProgrammaticScroll.value = false
          }, 100)
        })
      }
    })
  }

  const scrollToBottom = (force = false) => {
    if (!force && !shouldStickToBottom.value) return
    nextTick(executeScroll)
  }

  /**
   * Scroll to bottom with retry mechanism
   * Used to handle dynamically loaded content, ensuring scroll to actual bottom
   */
  const scrollToBottomWithRetry = (maxRetries = 5, delay = 50) => {
    let retryCount = 0
    let lastScrollHeight = 0

    const attemptScroll = () => {
      const el = getElement(chatContainer.value)
      if (!(el instanceof HTMLElement)) return

      const currentScrollHeight = el.scrollHeight
      const clientHeight = el.clientHeight

      el.scrollTop = el.scrollHeight

      const newScrollTop = el.scrollTop
      const distanceFromBottom = currentScrollHeight - (newScrollTop + clientHeight)
      const isReallyAtBottom = distanceFromBottom <= STICKY_THRESHOLD

      const scrollHeightChanged = currentScrollHeight !== lastScrollHeight

      if (isReallyAtBottom && !scrollHeightChanged && retryCount > 0) {
        return
      }

      lastScrollHeight = currentScrollHeight
      retryCount++

      if (retryCount < maxRetries) {
        setTimeout(() => {
          requestAnimationFrame(attemptScroll)
        }, delay)
      }
    }

    requestAnimationFrame(() => {
      requestAnimationFrame(attemptScroll)
    })
  }

  /**
   * Determine if the scroll event is user-initiated
   * Returns true if it's a user scroll, false if it's programmatic or content-change-induced
   */
  const isUserScroll = (container: HTMLElement): boolean => {
    const currentScrollTop = container.scrollTop
    const currentScrollHeight = container.scrollHeight

    // 1. Ignore if it's during programmatic scroll
    if (isProgrammaticScroll.value) {
      return false
    }

    // 2. If scrollTop didn't change, it's content height change, not user scroll
    const scrollTopChanged = Math.abs(currentScrollTop - lastScrollTop.value) > 1
    if (!scrollTopChanged) {
      return false
    }

    // 3. Calculate previous position state
    const wasAtBottom = lastScrollHeight.value > 0 && lastScrollHeight.value - (lastScrollTop.value + container.clientHeight) <= STICKY_THRESHOLD
    const isAtBottomNow = isAtBottom(container)
    const scrollingDown = currentScrollTop > lastScrollTop.value
    const scrollingUp = currentScrollTop < lastScrollTop.value
    const scrollHeightChanged = currentScrollHeight !== lastScrollHeight.value

    // 4. If scrolling up (away from bottom), definitely user scroll
    if (scrollingUp) {
      return true
    }

    // 5. If user scrolled from non-bottom to bottom, it's user scroll
    // This handles the case where user manually scrolls down to bottom
    if (scrollingDown && !wasAtBottom && isAtBottomNow) {
      return true
    }

    // 6. If scrolling down but not at bottom, likely user scroll
    if (scrollingDown && !isAtBottomNow) {
      return true
    }

    // 7. If scrollHeight changed, check if it's content change + programmatic scroll
    if (scrollHeightChanged) {
      // If we were at bottom, scrollHeight increased, and we're still at bottom after scrolling down,
      // it's likely programmatic scroll to maintain bottom position
      if (wasAtBottom && scrollingDown && isAtBottomNow) {
        return false
      }
    }

    // 8. If scrolling down to bottom and we were already at bottom (no scrollHeight change),
    // it might be programmatic scroll, but also could be user scroll (e.g., using scrollbar)
    // To be safe, if scrollTop changed significantly, treat it as user scroll
    if (scrollingDown && isAtBottomNow && wasAtBottom && !scrollHeightChanged) {
      const scrollDistance = currentScrollTop - lastScrollTop.value
      // If scroll distance is significant (> 50px), likely user scroll
      if (scrollDistance > 50) {
        return true
      }
      // Otherwise, might be programmatic scroll
      return false
    }

    // 9. Default: if we reach here and scrollTop changed, it's likely user scroll
    return true
  }

  const handleContainerScroll = () => {
    const container = getElement(chatContainer.value)
    if (container) {
      const currentScrollTop = container.scrollTop
      const currentScrollHeight = container.scrollHeight

      // Only update shouldStickToBottom if it's a user-initiated scroll
      if (isUserScroll(container)) {
        shouldStickToBottom.value = isAtBottom(container)
      }

      // Update tracking values
      lastScrollTop.value = currentScrollTop
      lastScrollHeight.value = currentScrollHeight
    }
  }

  /**
   * Determine if it's a terminal output collapse/expand operation
   * Terminal collapse/expand should not trigger auto-scroll
   */
  const isTerminalToggleMutation = (mutations: MutationRecord[], rootEl: HTMLElement | null): boolean => {
    return mutations.some((mutation) => {
      let target = mutation.target as HTMLElement
      while (target && target !== rootEl) {
        if (target.classList?.contains('terminal-output-container') || target.classList?.contains('terminal-output')) {
          return true
        }
        target = target.parentElement as HTMLElement
      }
      return false
    })
  }

  const startObservingDom = () => {
    if (domObserver.value) {
      try {
        domObserver.value.disconnect()
      } catch (e) {
        // Ignore disconnect failure errors
      }
    }

    const responseEl = getElement(chatResponse.value)
    if (!responseEl || !(responseEl instanceof Node)) return

    domObserver.value = new MutationObserver((mutations) => {
      if (isTerminalToggleMutation(mutations, responseEl)) return

      if (shouldStickToBottom.value) {
        executeScroll()
      }
    })

    domObserver.value.observe(responseEl, {
      childList: true,
      subtree: true,
      characterData: true
    })
  }

  const initializeAutoScroll = () => {
    nextTick(() => {
      const container = getElement(chatContainer.value)
      if (container) {
        container.removeEventListener('scroll', handleContainerScroll)
        container.addEventListener('scroll', handleContainerScroll, { passive: true })
        shouldStickToBottom.value = isAtBottom(container)
        lastScrollTop.value = container.scrollTop // Initialize lastScrollTop
        lastScrollHeight.value = container.scrollHeight // Initialize lastScrollHeight
      }
      startObservingDom()
    })
  }

  const handleTabSwitch = () => {
    shouldStickToBottom.value = true

    // Wait for DOM to update, then scroll to bottom
    // The watch on chatContainer will handle listener initialization
    nextTick(() => {
      scrollToBottomWithRetry()
      focusChatInput()
    })
  }

  watch(
    () => chatResponse.value,
    () => {
      nextTick(startObservingDom)
    }
  )

  // Watch chatContainer to initialize scroll listener when element becomes available
  // This is needed because chatContainer is conditionally rendered (v-if="filteredChatHistory.length > 0")
  // Also handles tab switching by re-initializing listeners when container changes
  watch(
    () => chatContainer.value,
    (newVal, oldVal) => {
      // Remove listener from old element if it exists
      if (oldVal) {
        const oldContainer = getElement(oldVal)
        if (oldContainer instanceof HTMLElement) {
          oldContainer.removeEventListener('scroll', handleContainerScroll)
        }
      }

      // Add listener to new element if it exists
      if (newVal) {
        nextTick(() => {
          const container = getElement(chatContainer.value)
          if (container instanceof HTMLElement) {
            container.removeEventListener('scroll', handleContainerScroll)
            container.addEventListener('scroll', handleContainerScroll, { passive: true })
            shouldStickToBottom.value = isAtBottom(container)
            lastScrollTop.value = container.scrollTop // Initialize lastScrollTop
            lastScrollHeight.value = container.scrollHeight // Initialize lastScrollHeight
          }
        })
      }
    }
  )

  onUnmounted(() => {
    if (domObserver.value) {
      domObserver.value.disconnect()
    }
    const container = getElement(chatContainer.value)
    if (container) {
      container.removeEventListener('scroll', handleContainerScroll)
    }
  })

  return {
    chatContainer,
    chatResponse,
    scrollToBottom,
    scrollToBottomWithRetry,
    initializeAutoScroll,
    handleTabSwitch,
    isAtBottom,
    executeScroll
  }
}
