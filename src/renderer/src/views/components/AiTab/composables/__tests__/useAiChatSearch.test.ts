import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest'
import { ref, nextTick, effectScope, defineComponent, h, type Ref } from 'vue'
import { mount } from '@vue/test-utils'
import { useAiChatSearch } from '../useAiChatSearch'
import { registerTerminalOutput } from '../terminalOutputRegistry'
import { createFakeEditor, createFakeTerminal } from './aiChatSearchFakes'

const shouldStickToBottom = ref(true)
const mocks = vi.hoisted(() => ({ editors: [] as unknown[] }))

vi.mock('../useSessionState', () => ({
  useSessionState: () => ({
    shouldStickToBottom
  })
}))

vi.mock('monaco-editor', () => ({
  editor: { getEditors: () => mocks.editors }
}))

/**
 * Add a Monaco editor (fake model) or an xterm output (fake buffer) under parent.
 */
function addMonaco(parent: HTMLElement, lines: string[]) {
  const el = document.createElement('div')
  el.className = 'monaco-container'
  parent.appendChild(el)
  const editor = createFakeEditor(el, lines)
  mocks.editors.push(editor)
  return { el, editor }
}

function addTerminal(parent: HTMLElement, lines: string[]) {
  const el = document.createElement('div')
  el.className = 'terminal-output'
  parent.appendChild(el)
  const terminal = createFakeTerminal(lines)
  registerTerminalOutput(el, terminal as never)
  return { el, terminal }
}

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
  let monaco: ReturnType<typeof addMonaco>
  let terminalOutput: ReturnType<typeof addTerminal>
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
  let searchFocusToken: ReturnType<typeof useAiChatSearch>['searchFocusToken']

  function initComposable(refOverride: Ref<HTMLElement | null> = containerRef) {
    scope = effectScope()
    const result = scope.run(() => useAiChatSearch(refOverride))!
    searchFocusToken = result.searchFocusToken
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

    mocks.editors = []
    container = createChatContainer('<p>Hello world, hello Vue. This is a test.</p><p>Another hello here.</p>')
    monaco = addMonaco(container, ['hello inside monaco'])
    terminalOutput = addTerminal(container, ['hello in terminal'])
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

    it('should find matches inside a Monaco editor through its model', async () => {
      await triggerSearch('monaco')
      // "monaco" appears once in the editor model
      expect(matchCount.value).toBe(1)
    })

    it('should find matches in the xterm buffer', async () => {
      await triggerSearch('terminal')
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

    it('should decorate the Monaco and xterm matches', async () => {
      await triggerSearch('hello')

      expect(monaco.editor.collection.set).toHaveBeenCalled()
      expect(terminalOutput.terminal.decorations).toHaveLength(1)
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
      expect(terminalOutput.terminal.decorations).toHaveLength(1)

      await triggerSearch('test')
      expect(container.querySelectorAll('mark.ai-chat-search-highlight').length).toBe(1)
      expect(monaco.editor.collection.clear).toHaveBeenCalled()
      expect(terminalOutput.terminal.decorations[0].dispose).toHaveBeenCalled()
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

    it('should not count the rendered text of Monaco and xterm a second time', async () => {
      const el = createChatContainer('<p>hello outside</p>')
      const wrapper = document.createElement('div')
      wrapper.className = 'monaco-wrapper'
      el.appendChild(wrapper)
      const inEditor = addMonaco(wrapper, ['hello inside'])
      inEditor.el.innerHTML = '<div class="view-lines">hello inside</div>'
      const inTerminal = addTerminal(el, ['hello in output'])
      inTerminal.el.innerHTML = '<div class="xterm-rows"><div>hello in output</div></div>'
      scope.stop()
      initComposable(ref<HTMLElement | null>(el))

      await triggerSearch('hello')

      // 1 text match + 1 editor match + 1 terminal match
      expect(matchCount.value).toBe(3)
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

  // ---------- Current match in Monaco and xterm ----------

  describe('current match in Monaco and xterm', () => {
    const lastPainted = () => monaco.editor.collection.set.mock.calls.at(-1)![0][0].options.inlineClassName as string

    it('gives the Monaco match the active class only while it is the current one', async () => {
      await triggerSearch('hello')
      expect(lastPainted()).not.toContain('ai-chat-search-monaco-match-active')

      findNext()
      findNext()
      findNext() // 4th match: the Monaco one
      expect(lastPainted()).toContain('ai-chat-search-monaco-match-active')

      findNext() // 5th match: xterm
      expect(lastPainted()).not.toContain('ai-chat-search-monaco-match-active')
    })

    it('recolors the xterm match when it becomes current and when it stops being current', async () => {
      await triggerSearch('hello')
      const decorations = terminalOutput.terminal.decorations
      const normalColor = decorations[0].options.backgroundColor

      for (let i = 0; i < 4; i++) findNext() // 5th match: xterm
      expect(decorations.at(-1)!.options.backgroundColor).not.toBe(normalColor)

      findNext() // wraps to the first match
      expect(decorations.at(-1)!.options.backgroundColor).toBe(normalColor)
    })
  })

  // ---------- Folded regions ----------

  describe('folded regions', () => {
    let headerClick: Mock

    function useFoldedContainer() {
      const el = createChatContainer(
        '<p>needle one</p><div class="ant-collapse-item"><div class="ant-collapse-header"></div><div><p class="folded">needle two</p></div></div>'
      )
      headerClick = vi.fn()
      el.querySelector('.ant-collapse-header')!.addEventListener('click', headerClick)
      scope.stop()
      initComposable(ref<HTMLElement | null>(el))
      return el
    }

    afterEach(() => {
      vi.useRealTimers()
    })

    it('opens the fold when navigation reaches a match inside it', async () => {
      const el = useFoldedContainer()
      await triggerSearch('needle')
      expect(headerClick).not.toHaveBeenCalled()

      findNext()

      expect(headerClick).toHaveBeenCalledTimes(1)
      el.remove()
    })

    it('opens the fold when the first match is already inside it', async () => {
      const el = useFoldedContainer()
      el.querySelector('p')!.textContent = 'nothing'

      await triggerSearch('needle')

      expect(headerClick).toHaveBeenCalledTimes(1)
      el.remove()
    })

    it('waits for the fold animation before scrolling to the match', async () => {
      const el = useFoldedContainer()
      el.querySelector('p')!.textContent = 'nothing'
      vi.useFakeTimers()
      const scroll = vi.mocked(Element.prototype.scrollIntoView)
      scroll.mockClear()

      searchTerm.value = 'needle'
      await nextTick()
      vi.advanceTimersByTime(200)
      expect(scroll).not.toHaveBeenCalled()

      vi.advanceTimersByTime(299)
      expect(scroll).not.toHaveBeenCalled()
      vi.advanceTimersByTime(1)
      expect(scroll).toHaveBeenCalledTimes(1)
      el.remove()
    })
  })

  // ---------- Scrolling to the current match ----------

  describe('scrolling to the current match', () => {
    afterEach(() => {
      vi.useRealTimers()
    })

    async function searchWithFakeTimers(term: string) {
      vi.useFakeTimers()
      searchTerm.value = term
      await nextTick()
      vi.advanceTimersByTime(200)
    }

    it('scrolls a text match into view right away', async () => {
      await triggerSearch('Another')

      const mark = container.querySelector('mark.ai-chat-search-highlight-active')!
      expect(mark.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' })
    })

    it('reveals a Monaco match once its decoration has rendered', async () => {
      await searchWithFakeTimers('monaco')
      expect(monaco.editor.revealRangeInCenterIfOutsideViewport).not.toHaveBeenCalled()

      vi.advanceTimersByTime(50)

      expect(monaco.editor.revealRangeInCenterIfOutsideViewport).toHaveBeenCalledTimes(1)
    })

    it('reveals an xterm match once its decoration has rendered', async () => {
      const spy = (terminalOutput.el.scrollIntoView = vi.fn())
      await searchWithFakeTimers('terminal')
      expect(spy).not.toHaveBeenCalled()

      vi.advanceTimersByTime(50)

      expect(spy).toHaveBeenCalledTimes(1)
    })

    it('drops a pending reveal when another match becomes current', async () => {
      await searchWithFakeTimers('hello')
      for (let i = 0; i < 3; i++) findNext() // 4th match: Monaco, reveal pending
      const spy = (terminalOutput.el.scrollIntoView = vi.fn())
      findNext() // 5th match: xterm

      vi.advanceTimersByTime(50)

      expect(monaco.editor.revealRangeInCenterIfOutsideViewport).not.toHaveBeenCalled()
      expect(spy).toHaveBeenCalledTimes(1)
    })

    it('drops a pending reveal when the highlights are cleared', async () => {
      await searchWithFakeTimers('monaco')

      clearSearch()
      vi.advanceTimersByTime(50)

      expect(monaco.editor.revealRangeInCenterIfOutsideViewport).not.toHaveBeenCalled()
    })
  })

  // ---------- Focus token and unmount ----------

  describe('search bar focus', () => {
    it('bumps the focus token on every openSearch so an open bar can refocus', () => {
      const before = searchFocusToken.value

      openSearch()
      openSearch()

      expect(searchFocusToken.value).toBe(before + 2)
    })
  })

  describe('unmount', () => {
    // Mounts a throwaway component so onBeforeUnmount has a real instance to run on.
    function mountWithSearch() {
      let api!: ReturnType<typeof useAiChatSearch>
      const wrapper = mount(
        defineComponent({
          setup() {
            api = useAiChatSearch(containerRef)
            return () => h('div')
          }
        })
      )
      return { api, wrapper }
    }

    it('removes every highlight when the component using the search goes away', async () => {
      const { api, wrapper } = mountWithSearch()
      api.searchTerm.value = 'hello'
      await waitForDebounce()
      expect(api.matchCount.value).toBe(5)

      wrapper.unmount()

      expect(container.querySelectorAll('mark.ai-chat-search-highlight').length).toBe(0)
      expect(monaco.editor.collection.clear).toHaveBeenCalled()
      expect(terminalOutput.terminal.decorations[0].dispose).toHaveBeenCalled()
    })

    it('cancels a search that has not run yet', async () => {
      const { api, wrapper } = mountWithSearch()
      api.searchTerm.value = 'hello'
      await nextTick()

      wrapper.unmount()
      await waitForDebounce()

      expect(container.querySelectorAll('mark.ai-chat-search-highlight').length).toBe(0)
    })
  })
})
