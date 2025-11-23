import { ref, watch, nextTick, onUnmounted } from 'vue'
import { useSessionState } from './useSessionState'
import { focusChatInput } from './useTabManagement'

/**
 * 自动滚动管理的 composable
 * 负责处理聊天容器的自动滚动到底部功能（粘性滚动）
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
   * 带重试机制的滚动到底部
   * 用于处理内容动态加载的情况，确保滚动到真正的底部
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
   * 判断是否为终端输出的折叠/展开操作
   * 终端折叠/展开不应触发自动滚动
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
        // 忽略断开失败的错误
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
