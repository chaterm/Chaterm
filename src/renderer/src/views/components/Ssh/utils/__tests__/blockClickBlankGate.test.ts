import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest'

// Mirrors the block-click pieces of sshConnect.vue, whose state lives in the
// component closure (blockPointerDownAt / hadSelectionAtPointerDown /
// pendingBlockSelection). Same approach as termInputRegistration.test.ts: the
// bodies are mirrored here so they can be covered without moving the state
// machine out of the component.
//
// What is under test is the blank-space gate. xterm dispatches word selection
// from the second mousedown of a double click (SelectionService
// `event.detail === 2`), so the first mouseup can never tell which gesture it
// belongs to. Rather than wait out a settle window, block selection only fires
// on blank cells, where double click has nothing worth selecting -- so the two
// gestures never compete for the same pixel and a single click stays instant.

const BLOCK_CLICK_DRAG_TOLERANCE_PX = 3

interface FakeCell {
  getChars: () => string
  getWidth: () => number
}

interface FakeLine {
  length: number
  getCell: (column: number) => FakeCell | undefined
}

// Builds a buffer line from text, where a character wider than one cell owns the
// following zero-width cell, exactly as xterm stores wide characters.
const line = (text: string, wideAt: number[] = []): FakeLine => {
  const cells: FakeCell[] = []
  for (let i = 0; i < text.length; i++) {
    const wide = wideAt.includes(i)
    cells.push({ getChars: () => text[i], getWidth: () => (wide ? 2 : 1) })
    if (wide) cells.push({ getChars: () => '', getWidth: () => 0 })
  }
  return { length: cells.length, getCell: (column: number) => cells[column] }
}

const isBlankAtColumn = (target: FakeLine, column: number, cols: number): boolean => {
  if (column >= Math.min(target.length, cols)) return true
  const chars = target.getCell(column)?.getChars() ?? ''
  if (chars.length === 0 && column > 0) {
    const owner = target.getCell(column - 1)
    if ((owner?.getWidth() ?? 1) === 2) return (owner?.getChars() ?? '').trim().length === 0
  }
  return chars.trim().length === 0
}

interface FakeTerminal {
  hasSelection: () => boolean
  clearSelection: () => void
}

const createHandlers = (terminal: FakeTerminal, selectBlockAtPointer: (clientX: number, clientY: number) => void) => {
  let blockPointerDownAt: { x: number; y: number } | null = null
  let hadSelectionAtPointerDown = false
  let pendingBlockSelection: ReturnType<typeof setTimeout> | null = null

  const cancelPendingBlockSelection = () => {
    if (pendingBlockSelection === null) return
    clearTimeout(pendingBlockSelection)
    pendingBlockSelection = null
  }

  const onPointerDown = (event: MouseEvent) => {
    cancelPendingBlockSelection()
    blockPointerDownAt = event.button === 0 ? { x: event.clientX, y: event.clientY } : null
    hadSelectionAtPointerDown = terminal.hasSelection()
  }

  const onPointerUp = (event: MouseEvent) => {
    const downAt = blockPointerDownAt
    blockPointerDownAt = null

    if (!downAt || event.button !== 0) return
    if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return
    if (event.detail > 1) return
    if (Math.abs(event.clientX - downAt.x) > BLOCK_CLICK_DRAG_TOLERANCE_PX) return
    if (Math.abs(event.clientY - downAt.y) > BLOCK_CLICK_DRAG_TOLERANCE_PX) return

    const { clientX, clientY } = event

    if (hadSelectionAtPointerDown) {
      setTimeout(() => terminal.clearSelection(), 0)
      return
    }

    pendingBlockSelection = setTimeout(() => {
      pendingBlockSelection = null
      selectBlockAtPointer(clientX, clientY)
    }, 0)
  }

  return { onPointerDown, onPointerUp, cancelPendingBlockSelection }
}

const mouse = (overrides: Partial<MouseEvent> = {}): MouseEvent =>
  ({
    button: 0,
    detail: 1,
    clientX: 100,
    clientY: 200,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    ...overrides
  }) as MouseEvent

describe('block click blank-cell gate', () => {
  const cols = 80

  it('treats a cell holding a character as not blank', () => {
    expect(isBlankAtColumn(line('npm run dev'), 0, cols)).toBe(false)
    expect(isBlankAtColumn(line('npm run dev'), 10, cols)).toBe(false)
  })

  it('treats a space between words as blank', () => {
    expect(isBlankAtColumn(line('npm run dev'), 3, cols)).toBe(true)
  })

  it('treats the empty right margin past the end of the row as blank', () => {
    expect(isBlankAtColumn(line('npm'), 40, cols)).toBe(true)
  })

  it('treats the trailing half of a wide character as not blank', () => {
    // A click on the right half of a full-width character must not read as blank,
    // even though that cell carries no chars of its own.
    const target = line('中文', [0, 1])
    expect(isBlankAtColumn(target, 0, cols)).toBe(false)
    expect(isBlankAtColumn(target, 1, cols)).toBe(false)
    expect(isBlankAtColumn(target, 2, cols)).toBe(false)
    expect(isBlankAtColumn(target, 3, cols)).toBe(false)
  })

  it('treats a column past cols as blank even when the line is longer', () => {
    expect(isBlankAtColumn(line('x'.repeat(100)), 90, 80)).toBe(true)
  })
})

describe('sshConnect block click handlers', () => {
  let selectBlock: Mock<(clientX: number, clientY: number) => void>
  let clearSelection: Mock<() => void>
  let selected: boolean
  let handlers: ReturnType<typeof createHandlers>

  beforeEach(() => {
    vi.useFakeTimers()
    selectBlock = vi.fn<(clientX: number, clientY: number) => void>()
    clearSelection = vi.fn<() => void>()
    selected = false
    handlers = createHandlers({ hasSelection: () => selected, clearSelection }, selectBlock)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  const click = (detail: number, overrides: Partial<MouseEvent> = {}) => {
    handlers.onPointerDown(mouse({ detail, ...overrides }))
    handlers.onPointerUp(mouse({ detail, ...overrides }))
  }

  it('selects the block on the next tick, with no settle window', () => {
    click(1)
    // Deferred only to land after xterm's own mouseup handling, not to wait out a
    // double click: zero delay keeps the click feeling immediate.
    vi.advanceTimersByTime(0)
    expect(selectBlock).toHaveBeenCalledTimes(1)
  })

  it('passes both click coordinates through so the cell can be resolved', () => {
    click(1, { clientX: 321, clientY: 654 })
    vi.advanceTimersByTime(0)
    expect(selectBlock).toHaveBeenCalledWith(321, 654)
  })

  it('leaves a double click to xterm', () => {
    click(2)
    vi.runAllTimers()
    expect(selectBlock).not.toHaveBeenCalled()
  })

  it('leaves a triple click to xterm', () => {
    click(3)
    vi.runAllTimers()
    expect(selectBlock).not.toHaveBeenCalled()
  })

  it('dismisses an existing selection instead of selecting a block', () => {
    selected = true
    click(1)

    vi.advanceTimersByTime(0)
    expect(clearSelection).toHaveBeenCalledTimes(1)
    expect(selectBlock).not.toHaveBeenCalled()
  })

  it('ignores a drag that moved beyond the tolerance', () => {
    handlers.onPointerDown(mouse())
    handlers.onPointerUp(mouse({ clientX: 400 }))

    vi.runAllTimers()
    expect(selectBlock).not.toHaveBeenCalled()
  })

  it('ignores a modified click, which opens links instead', () => {
    click(1, { metaKey: true })
    vi.runAllTimers()
    expect(selectBlock).not.toHaveBeenCalled()
  })

  it('cancels a pending selection on unmount', () => {
    click(1)
    handlers.cancelPendingBlockSelection()

    vi.runAllTimers()
    expect(selectBlock).not.toHaveBeenCalled()
  })
})
