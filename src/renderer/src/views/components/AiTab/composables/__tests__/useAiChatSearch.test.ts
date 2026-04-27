import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ref, nextTick, effectScope, type Ref } from 'vue'
import { useAiChatSearch } from '../useAiChatSearch'

const shouldStickToBottom = ref(true)

vi.mock('../useSessionState', () => ({
  useSessionState: () => ({
    shouldStickToBottom
  })
}))

/**
 * Helper: create a DOM container with text content for search testing.
 */
function createChatContainer(html: string): HTMLElement {
  const el = document.createElement('div')
  el.innerHTML = html
  document.body.appendChild(el)
  return el
}

/**
 * Wait for debounce (200ms) + buffer.
 */
function waitForDebounce(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 300))
}

describe('useAiChatSearch', () => {
  let container: HTMLElement
  let containerRef: Ref<HTMLElement | null>
  let scope: ReturnType<typeof effectScope>

  let isSearchOpen: ReturnType<typeof useAiChatSearch>['isSearchOpen']
  let searchTerm: ReturnType<typeof useAiChatSearch>['searchTerm']
  let matchCount: ReturnType<typeof useAiChatSearch>['matchCount']
  let currentMatchIndex: ReturnType<typeof useAiChatSearch>['currentMatchIndex']
  let openSearch: ReturnType<typeof useAiChatSearch>['openSearch']
  let closeSearch: ReturnType<typeof useAiChatSearch>['closeSearch']
  let findNext: ReturnType<typeof useAiChatSearch>['findNext']
  let findPrevious: ReturnType<typeof useAiChatSearch>['findPrevious']
  let clearSearch: ReturnType<typeof useAiChatSearch>['clearSearch']

  function initComposable(refOverride: Ref<HTMLElement | null> = containerRef) {
    scope = effectScope()
    const result = scope.run(() => useAiChatSearch(refOverride))!
    isSearchOpen = result.isSearchOpen
    searchTerm = result.searchTerm
    matchCount = result.matchCount
    currentMatchIndex = result.currentMatchIndex
    openSearch = result.openSearch
    closeSearch = result.closeSearch
    findNext = result.findNext
    findPrevious = result.findPrevious
    clearSearch = result.clearSearch
  }

  /**
   * Trigger search and wait for debounce.
   */
  async function triggerSearch(term: string) {
    searchTerm.value = term
    await waitForDebounce()
  }

  beforeEach(() => {
    shouldStickToBottom.value = true

    // jsdom does not implement scrollIntoView
    Element.prototype.scrollIntoView = vi.fn()

    container = createChatContainer(
      '<p>Hello world, hello Vue. This is a test.</p>' +
        '<p>Another hello here.</p>' +
        '<div class="monaco-container"><div class="view-lines">hello inside monaco</div></div>' +
        '<div class="terminal-output"><div class="xterm-rows"><div>hello in terminal</div></div></div>'
    )
    containerRef = ref<HTMLElement | null>(container)
    initComposable()
  })

  afterEach(() => {
    scope.stop()
    container.remove()
    vi.clearAllMocks()
  })

  // ---------- openSearch / closeSearch ----------

  describe('openSearch', () => {
    it('should set isSearchOpen to true', () => {
      expect(isSearchOpen.value).toBe(false)
      openSearch()
      expect(isSearchOpen.value).toBe(true)
    })

    it('should disable shouldStickToBottom', () => {
      expect(shouldStickToBottom.value).toBe(true)
      openSearch()
      expect(shouldStickToBottom.value).toBe(false)
    })
  })

  describe('closeSearch', () => {
    it('should set isSearchOpen to false and clear state', async () => {
      openSearch()
      await triggerSearch('hello')
      expect(matchCount.value).toBeGreaterThan(0)

      closeSearch()
      expect(isSearchOpen.value).toBe(false)
      expect(searchTerm.value).toBe('')
      expect(matchCount.value).toBe(0)
      expect(currentMatchIndex.value).toBe(0)
    })

    it('should remove all highlight marks from DOM', async () => {
      await triggerSearch('hello')
      expect(container.querySelectorAll('mark.ai-chat-search-highlight').length).toBeGreaterThan(0)

      closeSearch()
      expect(container.querySelectorAll('mark.ai-chat-search-highlight').length).toBe(0)
    })
  })

  // ---------- Search execution ----------

  describe('search execution', () => {
    it('should find matches after debounce when searchTerm changes', async () => {
      searchTerm.value = 'hello'
      // Before debounce fires
      expect(matchCount.value).toBe(0)

      await waitForDebounce()
      // "hello" appears 3 times in normal text + 1 in monaco + 1 in terminal = 5
      expect(matchCount.value).toBe(5)
      expect(currentMatchIndex.value).toBe(1)
    })

    it('should perform case-insensitive search', async () => {
      await triggerSearch('HELLO')
      expect(matchCount.value).toBe(5)
    })

    it('should find matches inside .monaco-container via container search', async () => {
      await triggerSearch('monaco')
      // "monaco" appears once inside .monaco-container
      expect(matchCount.value).toBe(1)
    })

    it('should return 0 matches for empty/whitespace search term', async () => {
      await triggerSearch('   ')
      expect(matchCount.value).toBe(0)
      expect(currentMatchIndex.value).toBe(0)
    })

    it('should return 0 matches when term is not found', async () => {
      await triggerSearch('nonexistent')
      expect(matchCount.value).toBe(0)
      expect(currentMatchIndex.value).toBe(0)
    })

    it('should handle null chatResponseRef gracefully', async () => {
      scope.stop()
      const nullRef = ref<HTMLElement | null>(null)
      initComposable(nullRef)

      await triggerSearch('hello')
      expect(matchCount.value).toBe(0)
      expect(currentMatchIndex.value).toBe(0)
    })
  })

  // ---------- Highlight DOM manipulation ----------

  describe('highlight marks', () => {
    it('should wrap normal text matches with <mark> elements', async () => {
      await triggerSearch('hello')
      const marks = container.querySelectorAll('mark.ai-chat-search-highlight')
      // Only normal text nodes get <mark> wrapping (3), not container matches
      expect(marks.length).toBe(3)
    })

    it('should set active class on first match', async () => {
      await triggerSearch('hello')
      const activeMarks = container.querySelectorAll('mark.ai-chat-search-highlight-active')
      expect(activeMarks.length).toBe(1)
    })

    it('should add highlight class to containers with matches', async () => {
      await triggerSearch('hello')
      const highlightedContainers = container.querySelectorAll('.ai-chat-search-container-highlight')
      // monaco-container and terminal-output both contain "hello"
      expect(highlightedContainers.length).toBe(2)
    })

    it('should restore original text after clearSearch', async () => {
      const originalText = container.textContent

      await triggerSearch('hello')
      clearSearch()
      await waitForDebounce()

      expect(container.querySelectorAll('mark').length).toBe(0)
      expect(container.textContent).toBe(originalText)
    })

    it('should clear old highlights before new search', async () => {
      await triggerSearch('hello')
      expect(container.querySelectorAll('mark.ai-chat-search-highlight').length).toBe(3)
      expect(container.querySelectorAll('.ai-chat-search-container-highlight').length).toBe(2)

      await triggerSearch('test')
      expect(container.querySelectorAll('mark.ai-chat-search-highlight').length).toBe(1)
      expect(container.querySelectorAll('.ai-chat-search-container-highlight').length).toBe(0)
    })

    it('should find multiple matches within the same text node', async () => {
      const el = createChatContainer('<p>aaa bbb aaa ccc aaa</p>')
      scope.stop()
      initComposable(ref<HTMLElement | null>(el))

      await triggerSearch('aaa')
      expect(matchCount.value).toBe(3)
      el.remove()
    })
  })

  // ---------- findNext / findPrevious navigation ----------

  describe('findNext', () => {
    it('should advance currentMatchIndex', async () => {
      await triggerSearch('hello')
      expect(currentMatchIndex.value).toBe(1)

      findNext()
      expect(currentMatchIndex.value).toBe(2)
      findNext()
      expect(currentMatchIndex.value).toBe(3)
    })

    it('should wrap around to first match after last', async () => {
      await triggerSearch('hello')
      // 5 matches total, navigate past the end
      findNext() // 2
      findNext() // 3
      findNext() // 4
      findNext() // 5
      findNext() // wraps to 1
      expect(currentMatchIndex.value).toBe(1)
    })

    it('should do nothing when no matches', async () => {
      await triggerSearch('nonexistent')
      findNext()
      expect(currentMatchIndex.value).toBe(0)
    })

    it('should move active class to next mark', async () => {
      await triggerSearch('hello')
      const marks = container.querySelectorAll('mark.ai-chat-search-highlight')

      expect(marks[0].classList.contains('ai-chat-search-highlight-active')).toBe(true)
      expect(marks[1].classList.contains('ai-chat-search-highlight-active')).toBe(false)

      findNext()
      expect(marks[0].classList.contains('ai-chat-search-highlight-active')).toBe(false)
      expect(marks[1].classList.contains('ai-chat-search-highlight-active')).toBe(true)
    })
  })

  describe('findPrevious', () => {
    it('should decrement currentMatchIndex', async () => {
      await triggerSearch('hello')
      findNext() // 2
      findPrevious() // back to 1
      expect(currentMatchIndex.value).toBe(1)
    })

    it('should wrap around to last match from first', async () => {
      await triggerSearch('hello')
      expect(currentMatchIndex.value).toBe(1)
      findPrevious() // wraps to 5
      expect(currentMatchIndex.value).toBe(5)
    })

    it('should do nothing when no matches', async () => {
      await triggerSearch('nonexistent')
      findPrevious()
      expect(currentMatchIndex.value).toBe(0)
    })

    it('should move active class to previous mark', async () => {
      await triggerSearch('hello')
      findNext() // active on mark[1]
      findPrevious() // active back to mark[0]

      const marks = container.querySelectorAll('mark.ai-chat-search-highlight')
      expect(marks[0].classList.contains('ai-chat-search-highlight-active')).toBe(true)
      expect(marks[1].classList.contains('ai-chat-search-highlight-active')).toBe(false)
    })
  })

  // ---------- clearSearch ----------

  describe('clearSearch', () => {
    it('should reset all state and remove marks', async () => {
      await triggerSearch('hello')

      clearSearch()
      expect(searchTerm.value).toBe('')
      expect(matchCount.value).toBe(0)
      expect(currentMatchIndex.value).toBe(0)
      expect(container.querySelectorAll('mark').length).toBe(0)
    })
  })

  // ---------- Tab switch (chatResponseRef change) ----------

  describe('chatResponseRef change (tab switch)', () => {
    it('should auto-close search when chatResponseRef changes', async () => {
      openSearch()
      await triggerSearch('hello')
      expect(isSearchOpen.value).toBe(true)
      expect(matchCount.value).toBe(5)

      // Simulate tab switch
      const newContainer = createChatContainer('<p>New tab content</p>')
      containerRef.value = newContainer
      await nextTick()

      expect(isSearchOpen.value).toBe(false)
      expect(searchTerm.value).toBe('')
      expect(matchCount.value).toBe(0)
      newContainer.remove()
    })

    it('should not close search if search is not open', async () => {
      const newContainer = createChatContainer('<p>New tab content</p>')
      containerRef.value = newContainer
      await nextTick()

      expect(isSearchOpen.value).toBe(false)
      newContainer.remove()
    })
  })

  // ---------- Edge cases ----------

  describe('edge cases', () => {
    it('should handle nested HTML elements correctly', async () => {
      const el = createChatContainer('<div><strong>Hello</strong> <em>world</em>, <a href="#">hello</a> again</div>')
      scope.stop()
      initComposable(ref<HTMLElement | null>(el))

      await triggerSearch('hello')
      expect(matchCount.value).toBe(2)
      el.remove()
    })

    it('should find matches inside .monaco-wrapper via container search', async () => {
      const el = createChatContainer(
        '<p>hello outside</p><div class="monaco-wrapper"><div class="monaco-container"><div class="view-lines">hello inside</div></div></div>'
      )
      scope.stop()
      initComposable(ref<HTMLElement | null>(el))

      await triggerSearch('hello')
      // 1 normal text match + 1 container match
      expect(matchCount.value).toBe(2)
      el.remove()
    })

    it('should find matches inside .terminal-output', async () => {
      const el = createChatContainer(
        '<p>hello outside</p><div class="terminal-output"><div class="xterm-rows"><div>hello in output</div></div></div>'
      )
      scope.stop()
      initComposable(ref<HTMLElement | null>(el))

      await triggerSearch('hello')
      // 1 normal text match + 1 container match
      expect(matchCount.value).toBe(2)
      el.remove()
    })

    it('should handle single character search', async () => {
      const el = createChatContainer('<p>abcabc</p>')
      scope.stop()
      initComposable(ref<HTMLElement | null>(el))

      await triggerSearch('a')
      expect(matchCount.value).toBe(2)
      el.remove()
    })

    it('should handle special regex characters in search term', async () => {
      const el = createChatContainer('<p>price is $100 (USD)</p>')
      scope.stop()
      initComposable(ref<HTMLElement | null>(el))

      await triggerSearch('$100')
      expect(matchCount.value).toBe(1)
      el.remove()
    })

    it('should handle search in empty container', async () => {
      const el = createChatContainer('')
      scope.stop()
      initComposable(ref<HTMLElement | null>(el))

      await triggerSearch('hello')
      expect(matchCount.value).toBe(0)
      el.remove()
    })

    it('should handle re-search after clearing', async () => {
      await triggerSearch('hello')
      expect(matchCount.value).toBe(5)

      clearSearch()
      await waitForDebounce()
      expect(matchCount.value).toBe(0)

      await triggerSearch('hello')
      expect(matchCount.value).toBe(5)
    })
  })
})
