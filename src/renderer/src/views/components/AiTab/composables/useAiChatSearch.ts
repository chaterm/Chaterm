import { ref, watch, onBeforeUnmount, type Ref } from 'vue'
import { useSessionState } from './useSessionState'
import {
  type MonacoMatch,
  type TerminalMatch,
  findMonacoMatches,
  paintMonacoMatches,
  clearMonacoMatches,
  findTerminalMatches,
  decorateTerminalMatch,
  clearTerminalMatches,
  expandCollapsedAncestors,
  revealMonacoMatch,
  revealTerminalMatch
} from './aiChatSearchTargets'

const MARK_CLASS = 'ai-chat-search-highlight'
const MARK_CLASS_ACTIVE = 'ai-chat-search-highlight-active'
const SEARCH_DEBOUNCE_MS = 200
// Opening a folded region animates its height, so reveal only after it settles.
const EXPAND_SETTLE_MS = 300
// Monaco and xterm paint their decorations on the next frame.
const DECORATION_RENDER_MS = 50

/** A match that lives inside a normal DOM text node and is wrapped with <mark>. */
interface TextNodeMatch {
  type: 'textNode'
  markElement: HTMLElement
}

type SearchMatch = TextNodeMatch | MonacoMatch | TerminalMatch

const isMonacoMatch = (match: SearchMatch): match is MonacoMatch => match.type === 'monaco'
const isTerminalMatch = (match: SearchMatch): match is TerminalMatch => match.type === 'terminal'
const anchorOf = (match: SearchMatch): HTMLElement => (match.type === 'textNode' ? match.markElement : match.container)

/**
 * Composable for AI chat content search.
 * Text in the normal DOM is wrapped with <mark>; Monaco editors and xterm outputs are
 * searched through their own model and buffer and highlighted with decorations, so
 * every match gets the same current / other distinction.
 */
export function useAiChatSearch(chatResponseRef: Ref<HTMLElement | null>) {
  const { shouldStickToBottom } = useSessionState()

  const isSearchOpen = ref(false)
  const searchTerm = ref('')
  const matchCount = ref(0)
  const currentMatchIndex = ref(0)
  // Bumped on every openSearch so an already open bar can take focus again.
  const searchFocusToken = ref(0)

  let matches: SearchMatch[] = []
  let activeMatch: SearchMatch | null = null
  let debounceTimer: ReturnType<typeof setTimeout> | null = null
  let revealTimer: ReturnType<typeof setTimeout> | null = null

  /**
   * Remove every highlight: <mark> wrappers, Monaco and xterm decorations.
   */
  function clearHighlights(root: HTMLElement | null) {
    if (revealTimer) {
      clearTimeout(revealTimer)
      revealTimer = null
    }
    clearMonacoMatches(matches.filter(isMonacoMatch))
    clearTerminalMatches(matches.filter(isTerminalMatch))
    matches = []
    activeMatch = null
    if (!root) return
    root.querySelectorAll(`mark.${MARK_CLASS}`).forEach((mark) => {
      const parent = mark.parentNode
      if (parent) {
        parent.replaceChild(document.createTextNode(mark.textContent || ''), mark)
        parent.normalize()
      }
    })
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
        // Skip special containers (Monaco / xterm) - handled through their own APIs
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
   * Wrap matched ranges with <mark> elements.
   * Processes in reverse order to avoid invalidating earlier ranges.
   */
  function highlightRanges(ranges: Range[]): TextNodeMatch[] {
    const textMatches: TextNodeMatch[] = []
    // Process in reverse order to preserve earlier range positions
    for (let i = ranges.length - 1; i >= 0; i--) {
      try {
        const mark = document.createElement('mark')
        mark.className = MARK_CLASS
        ranges[i].surroundContents(mark)
        textMatches.unshift({ type: 'textNode', markElement: mark })
      } catch {
        // surroundContents can fail if range crosses element boundaries; skip this match
      }
    }
    return textMatches
  }

  /**
   * Merge the matches of every kind into document order. The sort is stable, so
   * matches inside one editor or terminal keep their in-content order.
   */
  function buildMatchList(...groups: SearchMatch[][]): SearchMatch[] {
    return groups.flat().sort((a, b) => {
      const pos = anchorOf(a).compareDocumentPosition(anchorOf(b))
      if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1
      if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1
      return 0
    })
  }

  function reveal(match: SearchMatch) {
    if (match.type === 'textNode') {
      match.markElement.scrollIntoView({ behavior: 'smooth', block: 'center' })
    } else if (match.type === 'monaco') {
      revealMonacoMatch(match)
    } else {
      revealTerminalMatch(match)
    }
  }

  /**
   * Make the match at the given index (0-based) the current one: open any folded
   * region around it, switch the highlight to it and scroll it into view.
   */
  function setActiveHighlight(index: number) {
    if (revealTimer) clearTimeout(revealTimer)

    const previous = activeMatch
    const match = matches[index]
    activeMatch = match
    if (previous?.type === 'textNode') previous.markElement.classList.remove(MARK_CLASS_ACTIVE)

    const expanded = expandCollapsedAncestors(anchorOf(match), chatResponseRef.value)

    if (match.type === 'textNode') match.markElement.classList.add(MARK_CLASS_ACTIVE)
    paintMonacoMatches(matches.filter(isMonacoMatch), isMonacoMatch(match) ? match : null)
    if (previous && isTerminalMatch(previous)) decorateTerminalMatch(previous, false)
    if (isTerminalMatch(match)) decorateTerminalMatch(match, true)

    if (expanded || match.type !== 'textNode') {
      revealTimer = setTimeout(() => reveal(match), expanded ? EXPAND_SETTLE_MS : DECORATION_RENDER_MS)
    } else {
      reveal(match)
    }
  }

  /**
   * Execute the search: clear old highlights, find matches, create new highlights.
   */
  function executeSearch() {
    const root = chatResponseRef.value
    clearHighlights(root)

    const term = searchTerm.value.trim()
    if (!root || !term) {
      matchCount.value = 0
      currentMatchIndex.value = 0
      return
    }

    const textMatches = highlightRanges(findTextNodeMatches(root, term))
    const monacoMatches = findMonacoMatches(root, term)
    const terminalMatches = findTerminalMatches(root, term)
    terminalMatches.forEach((match) => decorateTerminalMatch(match, false))

    matches = buildMatchList(textMatches, monacoMatches, terminalMatches)
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
  }

  function openSearch() {
    isSearchOpen.value = true
    shouldStickToBottom.value = false
    searchFocusToken.value++
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
    searchFocusToken,
    openSearch,
    closeSearch,
    findNext,
    findPrevious,
    clearSearch
  }
}
