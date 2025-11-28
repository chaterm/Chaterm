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

  const getElement = (refValue: any): HTMLElement | null => {
    if (!refValue) return null
    return Array.isArray(refValue) ? refValue[0] || null : refValue
  }

  const isAtBottom = (el: HTMLElement): boolean => {
    return el.scrollHeight - (el.scrollTop + el.clientHeight) <= STICKY_THRESHOLD
  }

  const executeScroll = () => {
    requestAnimationFrame(() => {
      const el = getElement(chatContainer.value)
      if (el instanceof HTMLElement) {
        el.scrollTop = el.scrollHeight
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

  const handleContainerScroll = () => {
    const container = getElement(chatContainer.value)
    if (container) {
      shouldStickToBottom.value = isAtBottom(container)
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
      }
      startObservingDom()
    })
  }

  const handleTabSwitch = () => {
    shouldStickToBottom.value = true

    nextTick(() => {
      initializeAutoScroll()
      shouldStickToBottom.value = true
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
