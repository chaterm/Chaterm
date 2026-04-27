import { ref, watch, onBeforeUnmount, type Ref } from 'vue'
import { useSessionState } from './useSessionState'

const MARK_CLASS = 'ai-chat-search-highlight'
const MARK_CLASS_ACTIVE = 'ai-chat-search-highlight-active'
const CONTAINER_HIGHLIGHT_CLASS = 'ai-chat-search-container-highlight'
const CONTAINER_HIGHLIGHT_ACTIVE_CLASS = 'ai-chat-search-container-highlight-active'
const SEARCH_DEBOUNCE_MS = 200

/** A match that lives inside a normal DOM text node and can be wrapped with <mark>. */
interface TextNodeMatch {
  type: 'textNode'
  markElement?: HTMLElement
}

/** A match that lives inside a special container (Monaco / xterm) that cannot be DOM-modified. */
interface ContainerMatch {
  type: 'container'
  container: HTMLElement
  /** Number of occurrences of the search term inside this container. */
  count: number
}

type SearchMatch = TextNodeMatch | ContainerMatch

/**
 * Extract plain text from a special container (Monaco editor or xterm terminal).
 * Monaco renders text into .view-lines > .view-line elements.
 * xterm renders text into .xterm-rows > div elements.
 * Falls back to textContent for unknown container types.
 */
function getContainerText(container: HTMLElement): string {
  // Monaco: read from .view-lines
  const viewLines = container.querySelector('.view-lines')
  if (viewLines) {
    return viewLines.textContent || ''
  }
  // xterm: read from .xterm-rows
  const xtermRows = container.querySelector('.xterm-rows')
  if (xtermRows) {
    const lines: string[] = []
    xtermRows.querySelectorAll(':scope > div').forEach((row) => {
      lines.push(row.textContent || '')
    })
    return lines.join('\n')
  }
  return container.textContent || ''
}

/**
 * Count occurrences of a search term (case-insensitive) in text.
 */
function countOccurrences(text: string, term: string): number {
  const lowerText = text.toLowerCase()
  const lowerTerm = term.toLowerCase()
  let count = 0
  let idx = 0
  while (true) {
    idx = lowerText.indexOf(lowerTerm, idx)
    if (idx === -1) break
    count++
    idx++
  }
  return count
}

/**
 * Composable for AI chat content search.
 * Uses TreeWalker to find text matches in normal DOM and also searches
 * inside Monaco editor / xterm terminal containers via their rendered text.
 */
export function useAiChatSearch(chatResponseRef: Ref<HTMLElement | null>) {
  const { shouldStickToBottom } = useSessionState()

  const isSearchOpen = ref(false)
  const searchTerm = ref('')
  const matchCount = ref(0)
  const currentMatchIndex = ref(0)

  let matches: SearchMatch[] = []
  let debounceTimer: ReturnType<typeof setTimeout> | null = null

  /**
   * Clear all highlight marks and container highlights from the DOM.
   */
  function clearHighlights(root: HTMLElement | null) {
    if (!root) return
    // Remove <mark> elements for normal text matches
    const marks = root.querySelectorAll(`mark.${MARK_CLASS}`)
    marks.forEach((mark) => {
      const parent = mark.parentNode
      if (parent) {
        parent.replaceChild(document.createTextNode(mark.textContent || ''), mark)
        parent.normalize()
      }
    })
    // Remove container highlight classes
    root.querySelectorAll(`.${CONTAINER_HIGHLIGHT_CLASS}`).forEach((el) => {
      el.classList.remove(CONTAINER_HIGHLIGHT_CLASS, CONTAINER_HIGHLIGHT_ACTIVE_CLASS)
    })
    matches = []
  }

  /**
   * Find all text matches in normal DOM text nodes using TreeWalker.
   * Returns an array of Ranges, each covering one match within a single text node.
   */
  function findTextNodeMatches(root: HTMLElement, term: string): Range[] {
    const ranges: Range[] = []
    if (!term) return ranges

    const lowerTerm = term.toLowerCase()
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const parent = node.parentElement
        if (!parent) return NodeFilter.FILTER_REJECT
        // Skip already-highlighted marks
        if (parent.tagName === 'MARK' && parent.classList.contains(MARK_CLASS)) {
          return NodeFilter.FILTER_REJECT
        }
        // Skip special containers (Monaco / xterm) - handled separately
        if (parent.closest('.monaco-container') || parent.closest('.monaco-wrapper') || parent.closest('.terminal-output')) {
          return NodeFilter.FILTER_REJECT
        }
        return NodeFilter.FILTER_ACCEPT
      }
    })

    let textNode: Text | null
    while ((textNode = walker.nextNode() as Text | null)) {
      const text = textNode.textContent?.toLowerCase() || ''
      let startIdx = 0
      while (true) {
        const idx = text.indexOf(lowerTerm, startIdx)
        if (idx === -1) break
        const range = document.createRange()
        range.setStart(textNode, idx)
        range.setEnd(textNode, idx + term.length)
        ranges.push(range)
        startIdx = idx + 1
      }
    }
    return ranges
  }

  /**
   * Find matches inside special containers (Monaco editors, xterm terminals).
   * Returns ContainerMatch entries for containers that have matches.
   */
  function findContainerMatches(root: HTMLElement, term: string): ContainerMatch[] {
    const containerMatches: ContainerMatch[] = []
    if (!term) return containerMatches

    // Search Monaco editors
    root.querySelectorAll('.monaco-container').forEach((el) => {
      const text = getContainerText(el as HTMLElement)
      const count = countOccurrences(text, term)
      if (count > 0) {
        containerMatches.push({ type: 'container', container: el as HTMLElement, count })
      }
    })

    // Search xterm terminal outputs
    root.querySelectorAll('.terminal-output').forEach((el) => {
      const text = getContainerText(el as HTMLElement)
      const count = countOccurrences(text, term)
      if (count > 0) {
        containerMatches.push({ type: 'container', container: el as HTMLElement, count })
      }
    })

    return containerMatches
  }

  /**
   * Wrap matched ranges with <mark> elements.
   * Processes in reverse order to avoid invalidating earlier ranges.
   */
  function highlightRanges(ranges: Range[]): TextNodeMatch[] {
    const textMatches: TextNodeMatch[] = []
    // Process in reverse order to preserve earlier range positions
    for (let i = ranges.length - 1; i >= 0; i--) {
      const range = ranges[i]
      try {
        const mark = document.createElement('mark')
        mark.className = MARK_CLASS
        range.surroundContents(mark)
        textMatches.unshift({ type: 'textNode', markElement: mark })
      } catch {
        // surroundContents can fail if range crosses element boundaries; skip this match
      }
    }
    return textMatches
  }

  /**
   * Build the flat matches array by interleaving text node matches and container matches
   * in document order. Container matches expand into N entries (one per occurrence) so
   * that match count and navigation indices are correct.
   */
  function buildMatchList(textMatches: TextNodeMatch[], containerMatches: ContainerMatch[]): SearchMatch[] {
    const allItems: Array<{ element: HTMLElement; match: SearchMatch; expandCount: number }> = []

    for (const tm of textMatches) {
      if (tm.markElement) {
        allItems.push({ element: tm.markElement, match: tm, expandCount: 1 })
      }
    }

    for (const cm of containerMatches) {
      // Add highlight class to the container
      cm.container.classList.add(CONTAINER_HIGHLIGHT_CLASS)
      // Expand into N entries for navigation
      for (let i = 0; i < cm.count; i++) {
        allItems.push({ element: cm.container, match: cm, expandCount: 1 })
      }
    }

    // Sort by document position
    allItems.sort((a, b) => {
      const pos = a.element.compareDocumentPosition(b.element)
      if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1
      if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1
      return 0
    })

    return allItems.map((item) => item.match)
  }

  /**
   * Set the active highlight on the match at the given index (0-based).
   */
  function setActiveHighlight(index: number) {
    // Remove active class from all marks and containers
    const root = chatResponseRef.value
    if (root) {
      root.querySelectorAll(`mark.${MARK_CLASS_ACTIVE}`).forEach((el) => {
        el.classList.remove(MARK_CLASS_ACTIVE)
      })
      root.querySelectorAll(`.${CONTAINER_HIGHLIGHT_ACTIVE_CLASS}`).forEach((el) => {
        el.classList.remove(CONTAINER_HIGHLIGHT_ACTIVE_CLASS)
      })
    }

    if (index >= 0 && index < matches.length) {
      const match = matches[index]
      if (match.type === 'textNode' && match.markElement) {
        match.markElement.classList.add(MARK_CLASS_ACTIVE)
        match.markElement.scrollIntoView({ behavior: 'smooth', block: 'center' })
      } else if (match.type === 'container') {
        match.container.classList.add(CONTAINER_HIGHLIGHT_ACTIVE_CLASS)
        match.container.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    }
  }

  /**
   * Execute the search: clear old highlights, find matches, create new highlights.
   */
  function executeSearch() {
    const root = chatResponseRef.value
    if (!root) {
      matchCount.value = 0
      currentMatchIndex.value = 0
      matches = []
      return
    }

    clearHighlights(root)

    const term = searchTerm.value.trim()
    if (!term) {
      matchCount.value = 0
      currentMatchIndex.value = 0
      matches = []
      return
    }

    // Find matches in normal text nodes
    const ranges = findTextNodeMatches(root, term)
    const textMatches = highlightRanges(ranges)

    // Find matches in special containers (Monaco / xterm)
    const containerMatches = findContainerMatches(root, term)

    // Build ordered match list
    matches = buildMatchList(textMatches, containerMatches)
    matchCount.value = matches.length

    if (matches.length > 0) {
      currentMatchIndex.value = 1
      setActiveHighlight(0)
    } else {
      currentMatchIndex.value = 0
    }
  }

  function findNext() {
    if (matches.length === 0) return
    let nextIndex = currentMatchIndex.value // currentMatchIndex is 1-based
    if (nextIndex >= matches.length) {
      nextIndex = 0
    }
    currentMatchIndex.value = nextIndex + 1
    setActiveHighlight(nextIndex)
  }

  function findPrevious() {
    if (matches.length === 0) return
    let prevIndex = currentMatchIndex.value - 2 // currentMatchIndex is 1-based
    if (prevIndex < 0) {
      prevIndex = matches.length - 1
    }
    currentMatchIndex.value = prevIndex + 1
    setActiveHighlight(prevIndex)
  }

  function clearSearch() {
    searchTerm.value = ''
    matchCount.value = 0
    currentMatchIndex.value = 0
    clearHighlights(chatResponseRef.value)
    matches = []
  }

  function openSearch() {
    isSearchOpen.value = true
    shouldStickToBottom.value = false
  }

  function closeSearch() {
    clearSearch()
    isSearchOpen.value = false
  }

  // Debounced watch on search term
  watch(searchTerm, () => {
    if (debounceTimer) {
      clearTimeout(debounceTimer)
    }
    debounceTimer = setTimeout(() => {
      executeSearch()
      debounceTimer = null
    }, SEARCH_DEBOUNCE_MS)
  })

  // Clear search when the chat response element changes (tab switch)
  watch(chatResponseRef, () => {
    if (isSearchOpen.value) {
      closeSearch()
    }
  })

  onBeforeUnmount(() => {
    if (debounceTimer) {
      clearTimeout(debounceTimer)
    }
    clearHighlights(chatResponseRef.value)
  })

  return {
    isSearchOpen,
    searchTerm,
    matchCount,
    currentMatchIndex,
    openSearch,
    closeSearch,
    findNext,
    findPrevious,
    clearSearch
  }
}
