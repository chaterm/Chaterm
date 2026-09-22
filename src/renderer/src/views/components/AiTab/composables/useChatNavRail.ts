import { ref, computed, watch, onBeforeUnmount, type Ref } from 'vue'
import { useSessionState, type UserAssistantPair } from './useSessionState'
import type { ChatMessage, MessageContent } from '../types'

/** One navigable point on the rail: a prompt the user sent. */
export interface ChatNavNode {
  /** Message timestamp. Identifies a turn across paging, unlike the render id. */
  ts: number
  label: string
  /** Index of the loaded pair holding this turn, or -1 when not paged in yet. */
  pairIndex: number
}

/** Stored message shape, narrowed to the fields the rail reads. */
export interface StoredNavMessage {
  ts?: number
  type?: string
  say?: string
  text?: string
}

const LABEL_MAX_LENGTH = 160
/** Show the rail once there is more than one prompt to move between. */
const MIN_MARKERS = 2
/** Distance from the container top that counts as "the turn you are reading". */
const ACTIVE_LINE_OFFSET = 80
/** Space kept above the target when jumping, so it is not flush against the edge. */
const JUMP_TOP_PADDING = 12
const RESIZE_DEBOUNCE_MS = 150
/** Upper bound on pages fetched while walking back to a turn that is not loaded. */
const MAX_JUMP_PAGES = 40
/** How long a jump keeps correcting for content loading in above the target. */
const JUMP_SETTLE_MS = 2000
/** Frames the target must hold its position before the jump is considered done. */
const JUMP_STABLE_FRAMES = 3

const nextFrame = (): Promise<void> =>
  new Promise((resolve) => {
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => resolve())
    else setTimeout(resolve, 16)
  })

/** Flatten message content into a preview label for the hover card. */
export function extractNavLabel(message: ChatMessage): string {
  const raw = typeof message.content === 'string' ? message.content : (message.content as MessageContent)?.question || ''
  return truncateLabel(raw)
}

/**
 * Drop a leading pasted terminal block. The opening turn of a conversation often
 * starts with "Terminal output:" followed by a fenced dump, with the actual
 * question after it; labelling that turn with the dump would show a command
 * instead of what the user asked.
 */
export function stripLeadingTerminalOutput(raw: string): string {
  if (!raw.startsWith('Terminal output:')) return raw
  const fenceEnd = raw.indexOf('```', raw.indexOf('```') + 3)
  if (fenceEnd === -1) return raw
  const rest = raw.slice(fenceEnd + 3).trim()
  return rest || raw
}

function truncateLabel(raw: string): string {
  const flat = stripLeadingTerminalOutput(raw).replace(/\s+/g, ' ').trim()
  return flat.length > LABEL_MAX_LENGTH ? `${flat.slice(0, LABEL_MAX_LENGTH)}...` : flat
}

/**
 * Whether a stored message is a prompt the user sent. Mirrors the role decision
 * in mapStoredMessagesToChatMessages (useTabManagement), which is the source of
 * truth for how history is attributed on restore.
 */
export function isStoredUserTurn(item: StoredNavMessage, index: number): boolean {
  if (item.say === 'user_feedback') {
    // Terminal output arrives as user_feedback but is re-attributed to the assistant.
    return !(typeof item.text === 'string' && item.text.startsWith('Terminal output:'))
  }
  return index === 0 && item.type === 'say' && item.say === 'text'
}

/** Pull the user turns out of a full stored conversation, oldest first. */
export function buildStoredNavNodes(messages: StoredNavMessage[]): ChatNavNode[] {
  const nodes: ChatNavNode[] = []
  messages.forEach((item, index) => {
    if (!isStoredUserTurn(item, index) || typeof item.ts !== 'number') return
    nodes.push({ ts: item.ts, label: truncateLabel(item.text || ''), pairIndex: -1 })
  })
  return nodes
}

/**
 * Merge the stored turn index with the turns currently rendered. The stored side
 * covers the whole conversation including pages not loaded yet; the rendered side
 * contributes live turns that are not persisted yet and supplies the pair index
 * used for the active highlight. Turns are keyed by timestamp.
 */
export function buildNavNodes(pairs: UserAssistantPair[], storedNodes: ChatNavNode[] = []): ChatNavNode[] {
  const byTs = new Map<number, ChatNavNode>()

  storedNodes.forEach((node) => byTs.set(node.ts, { ...node }))

  pairs.forEach((pair, pairIndex) => {
    const user = pair.user?.message
    if (!user) return
    // A turn with no timestamp cannot collide with a stored one; key it uniquely.
    const ts = typeof user.ts === 'number' ? user.ts : -(pairIndex + 1)
    byTs.set(ts, { ts, label: extractNavLabel(user), pairIndex })
  })

  return Array.from(byTs.values()).sort((a, b) => a.ts - b.ts)
}

/**
 * Index of the pair the reader is currently on: the last pair whose top has
 * passed the active line. Returns -1 before anything has been measured.
 */
export function resolveActivePairIndex(pairTops: number[], scrollTop: number): number {
  const line = scrollTop + ACTIVE_LINE_OFFSET
  let active = -1
  for (let i = 0; i < pairTops.length; i++) {
    if (pairTops[i] <= line) active = i
    else break
  }
  return active === -1 && pairTops.length > 0 ? 0 : active
}

export interface ChatNavRailOptions {
  /** Id of the conversation whose stored turns should be indexed. */
  getTaskId: () => string | null
  /** Page one batch of older messages into the tab. Resolves when rendered. */
  loadOlder: (container: HTMLElement) => Promise<void>
  /** Whether more pages remain before the start of the conversation. */
  hasOlder: () => boolean
}

/**
 * Read-only navigation rail for the AI chat. One marker per prompt the user sent,
 * spaced evenly rather than mapped to scroll offsets: the rail is a compact
 * outline of the conversation, not a second scrollbar.
 *
 * Markers come from the stored conversation, not only from the messages on
 * screen. Restoring a tab from history loads just the newest page, which can
 * hold no prompt at all, and a rail built from that would be empty until the
 * reader scrolled far enough back.
 */
export function useChatNavRail(chatContainer: Ref<HTMLElement | null>, getPairs: () => UserAssistantPair[], options: ChatNavRailOptions) {
  const { shouldStickToBottom } = useSessionState()

  const pairTops = ref<number[]>([])
  const scrollTop = ref(0)
  const storedNodes = ref<ChatNavNode[]>([])

  let resizeObserver: ResizeObserver | null = null
  let observedContainer: HTMLElement | null = null
  let resizeTimer: ReturnType<typeof setTimeout> | null = null
  let scrollRafId: number | null = null
  let indexedTaskId: string | null = null

  const getElement = (refValue: unknown): HTMLElement | null => {
    if (!refValue) return null
    const candidate = Array.isArray(refValue) ? refValue[0] : refValue
    return candidate instanceof HTMLElement ? candidate : null
  }

  const markers = computed(() => buildNavNodes(getPairs(), storedNodes.value))

  const isVisible = computed(() => markers.value.length >= MIN_MARKERS)

  const activePairIndex = computed(() => resolveActivePairIndex(pairTops.value, scrollTop.value))

  /** Index the stored turns of a conversation once per tab. */
  const indexStoredTurns = async () => {
    const taskId = options.getTaskId()
    if (!taskId || taskId === indexedTaskId) return
    indexedTaskId = taskId
    storedNodes.value = []
    try {
      const result = await window.api.chatermGetChatermMessages({ taskId })
      // Ignore a response that lost the race with a tab switch.
      if (options.getTaskId() !== taskId) return
      const list: StoredNavMessage[] = Array.isArray(result) ? result : (result?.messages ?? [])
      storedNodes.value = buildStoredNavNodes(list)
    } catch {
      // Without the index the rail still works off the rendered turns.
      storedNodes.value = []
    }
  }

  /**
   * Re-read the vertical offset of every rendered pair. Pair elements are
   * measured instead of individual messages because content-visibility skips
   * the layout of off-screen children.
   */
  const measure = () => {
    const container = getElement(chatContainer.value)
    if (!container) {
      pairTops.value = []
      return
    }

    scrollTop.value = container.scrollTop

    const containerTop = container.getBoundingClientRect().top
    const pairElements = container.querySelectorAll<HTMLElement>('.user-assistant-pair-message')
    const nextTops: number[] = []

    pairElements.forEach((el) => {
      nextTops.push(el.getBoundingClientRect().top - containerTop + container.scrollTop)
    })

    pairTops.value = nextTops
  }

  const handleScroll = () => {
    if (scrollRafId !== null) return
    const raf = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : (cb: () => void) => setTimeout(cb, 16)
    scrollRafId = raf(() => {
      scrollRafId = null
      const container = getElement(chatContainer.value)
      if (!container) return
      scrollTop.value = container.scrollTop
    }) as unknown as number
  }

  const scheduleMeasure = () => {
    if (resizeTimer) clearTimeout(resizeTimer)
    resizeTimer = setTimeout(() => {
      resizeTimer = null
      measure()
    }, RESIZE_DEBOUNCE_MS)
  }

  /**
   * The anchor sits on the pair wrapper, not on the user message inside it:
   * content-visibility skips the layout of off-screen children, so a descendant
   * reports a rect that does not respond to scrolling.
   */
  const findTarget = (container: HTMLElement, ts: number): HTMLElement | null =>
    container.querySelector<HTMLElement>(`.user-assistant-pair-message[data-nav-ts="${ts}"]`)

  /**
   * Put the prompt behind a marker at the top of the view. Jumps are instant:
   * a smooth scroll across a long conversation is a long wait. Releases the
   * stick-to-bottom lock so auto-scroll does not drag the view back down.
   */
  const jumpTo = async (marker: ChatNavNode) => {
    const container = getElement(chatContainer.value)
    if (!container) return

    shouldStickToBottom.value = false

    let target = findTarget(container, marker.ts)
    // The turn may sit in a page that is not loaded yet; walk back until it is.
    for (let page = 0; !target && page < MAX_JUMP_PAGES && options.hasOlder(); page++) {
      await options.loadOlder(container)
      // The request above returns immediately when another load already holds the
      // pagination lock, so wait a frame before ruling the turn out.
      await nextFrame()
      target = findTarget(container, marker.ts)
    }
    if (!target) {
      // Every page is in and the turn still has no anchor: it is the opening
      // message, which the renderer only attributes to the user once the oldest
      // page has loaded. Land on the start of the conversation instead.
      if (!options.hasOlder()) container.scrollTop = 0
      return
    }

    // Paging keeps filling the viewport in the background, prepending content that
    // pushes the target away from the top. Re-anchor until it holds still. The
    // first correction lands on the current frame, so the jump stays instant.
    const deadline = Date.now() + JUMP_SETTLE_MS
    let stableFrames = 0
    while (stableFrames < JUMP_STABLE_FRAMES) {
      const drift = target.getBoundingClientRect().top - container.getBoundingClientRect().top - JUMP_TOP_PADDING
      // The first turn cannot take the padding: scrollTop 0 already is the top.
      if (container.scrollTop === 0 && drift < 0) break
      if (Math.abs(drift) <= 1) {
        stableFrames++
      } else {
        stableFrames = 0
        container.scrollTop = Math.max(0, container.scrollTop + drift)
      }
      if (Date.now() >= deadline) return
      await nextFrame()
    }
  }

  const teardown = () => {
    if (observedContainer) {
      observedContainer.removeEventListener('scroll', handleScroll)
      observedContainer = null
    }
    if (resizeObserver) {
      resizeObserver.disconnect()
      resizeObserver = null
    }
    if (resizeTimer) {
      clearTimeout(resizeTimer)
      resizeTimer = null
    }
    if (scrollRafId !== null) {
      if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(scrollRafId)
      else clearTimeout(scrollRafId)
      scrollRafId = null
    }
  }

  watch(
    () => chatContainer.value,
    () => {
      teardown()
      const container = getElement(chatContainer.value)
      if (!container) return

      observedContainer = container
      container.addEventListener('scroll', handleScroll, { passive: true })

      if (typeof ResizeObserver !== 'undefined') {
        resizeObserver = new ResizeObserver(scheduleMeasure)
        resizeObserver.observe(container)
        const response = container.querySelector<HTMLElement>('.chat-response')
        if (response) resizeObserver.observe(response)
      }

      measure()
    },
    { immediate: true, flush: 'post' }
  )

  watch(() => options.getTaskId(), indexStoredTurns, { immediate: true })

  // Any change to the node list - new messages, a tab switch, history paging -
  // invalidates the measured offsets. Watching the array identity rather than
  // its length also catches a switch between two tabs with the same node count;
  // the debounce inside scheduleMeasure collapses streaming bursts. Only the
  // active-marker highlight depends on this, never marker visibility.
  watch(markers, scheduleMeasure, { flush: 'post' })

  onBeforeUnmount(teardown)

  return {
    markers,
    isVisible,
    activePairIndex,
    jumpTo,
    measure
  }
}
