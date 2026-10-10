import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Terminal } from '@xterm/xterm'
import { alignPromptRedraw, createPtyResizeSync, fitAndClearStaleSelection, fitKeepingCursorInLine } from '../terminalResize'

// Captured from bash 5.1 after a SIGWINCH: the prompt is redrawn with the row
// break readline computed for 89 columns, joined by CRLF.
const PROMPT_ROW_1 = 'user@host-001:/usr/share/doc/ca-certificates/examples/ca-certificat'
const PROMPT_ROW_2 = 'es-local/debian$ '
const REDRAW =
  '\r\x1b[K\x1b[A\x1b]0;user@host-001: /usr/share/doc\x07\x1b[01;32muser@host-001\x1b[00m:' +
  '\x1b[01;34m/usr/share/doc/ca-certificates/examples/ca-certificat\r\n\res-local/debian\x1b[00m$ '

type Row = [text: string, wrapped: boolean]

const clearDown = (rows: number) => '\x1b[B\x1b[2K'.repeat(rows)

const makeBuffer = (rows: Row[], { baseY = 0, type = 'normal' } = {}) => ({
  buffer: {
    active: {
      type,
      baseY,
      // the cursor sits on the last row
      cursorY: rows.length - 1 - baseY,
      getLine: (y: number) => (y < rows.length ? { isWrapped: rows[y][1], translateToString: () => rows[y][0].trimEnd() } : undefined)
    }
  }
})

describe('alignPromptRedraw', () => {
  it('removes a single-line prompt reflowed over two rows before readline redraws it', async () => {
    const terminal = new Terminal({ cols: 89, rows: 12 })
    const write = (data: string) => new Promise<void>((resolve) => terminal.write(data, resolve))
    const prompt = `${PROMPT_ROW_1}${PROMPT_ROW_2}`

    await write(prompt)
    terminal.resize(54, 12)
    const redraw = `\r\x1b[K${prompt}`
    await write(alignPromptRedraw(terminal, redraw) + redraw)

    const screen = Array.from({ length: terminal.rows }, (_, row) => terminal.buffer.active.getLine(row)?.translateToString(true) ?? '').join('')
    expect(screen.split('user@host-001').length - 1).toBe(1)
    terminal.dispose()
  })

  it('leaves a single prompt in xterm after a narrower grid triggers a redraw', async () => {
    const terminal = new Terminal({ cols: 89, rows: 12 })
    const write = (data: string) => new Promise<void>((resolve) => terminal.write(data, resolve))

    await write(`${PROMPT_ROW_1}\r\n${PROMPT_ROW_2}`)
    terminal.resize(54, 12)
    await write(alignPromptRedraw(terminal, REDRAW) + REDRAW)

    const screen = Array.from({ length: terminal.rows }, (_, row) => terminal.buffer.active.getLine(row)?.translateToString(true) ?? '').join('')
    expect(screen.split('user@host-001').length - 1).toBe(1)
    expect(screen).toContain('es-local/debian$ ')
    terminal.dispose()
  })

  it('deletes the rows xterm added when it reflowed the first prompt row', () => {
    // 89 -> 54 columns: the first readline row now spans two rows, so CUU 1 lands on its second half
    const terminal = makeBuffer([
      ['output', false],
      [PROMPT_ROW_1.slice(0, 54), false],
      [PROMPT_ROW_1.slice(54), true],
      [PROMPT_ROW_2, false]
    ])
    expect(alignPromptRedraw(terminal, REDRAW)).toBe('\x1b[2A\x1b[2K' + clearDown(2) + '\x1b[1M\x1b[1A')
  })

  it('handles a prompt drawn on one row that xterm kept wrapped', () => {
    // Captured on the bastion host: the prompt was drawn at 53 columns, so it autowrapped.
    // Widening does not unwrap the cursor's line and readline redraws without CUU.
    const prompt = 'user@host-4810115:/data/langfuse/packages/in-app-agent-sandbox-runtime$ '
    const terminal = makeBuffer([
      ['-rw-r--r-- 1 root root 127 Sep 21 17:07 vitest.config.ts', false],
      [prompt.slice(0, 53), false],
      [prompt.slice(53), true]
    ])
    const redraw =
      '\r\x1b[K\x1b]0;user@host: /data\x07\x1b[01;32muser@host-4810115\x1b[00m:\x1b[01;34m/data/langfuse/packages/in-app-agent-sandbox-runtime\x1b[00m$ '
    expect(alignPromptRedraw(terminal, redraw)).toBe('\x1b[1A\x1b[2K' + clearDown(1) + '\x1b[1M\x1b[1A')
  })

  it('does nothing for a one-row redraw when the cursor line is not wrapped', () => {
    const terminal = makeBuffer([
      ['output', false],
      [PROMPT_ROW_2, false]
    ])
    expect(alignPromptRedraw(terminal, '\r\x1b[K' + PROMPT_ROW_2)).toBe('')
  })

  it('leaves a wrapped progress line alone when the redraw is different text', () => {
    const terminal = makeBuffer([
      ['downloading 10% ##########', false],
      ['##########', true]
    ])
    expect(alignPromptRedraw(terminal, '\r\x1b[Kdownloading 11% ###########')).toBe('')
  })

  it('handles a row reflowed over more than two rows', () => {
    const terminal = makeBuffer([
      [PROMPT_ROW_1.slice(0, 30), false],
      [PROMPT_ROW_1.slice(30, 60), true],
      [PROMPT_ROW_1.slice(60), true],
      [PROMPT_ROW_2, false]
    ])
    expect(alignPromptRedraw(terminal, REDRAW)).toBe('\x1b[3A\x1b[2K' + clearDown(3) + '\x1b[1A\x1b[2M\x1b[1A')
  })

  it('only clears the old rows when readline already lands on the first row', () => {
    // widening: the redraw is shorter per row than what is on screen, so the tails must go
    const terminal = makeBuffer([
      ['output', false],
      [PROMPT_ROW_1, false],
      [PROMPT_ROW_2 + 'echo typed', false]
    ])
    expect(alignPromptRedraw(terminal, REDRAW + 'echo typed')).toBe('\x1b[1A\x1b[2K' + clearDown(1))
  })

  it('never deletes rows that are not the prompt being redrawn', () => {
    const terminal = makeBuffer([
      ['some earlier output that ', false],
      ['happens to wrap', true],
      [PROMPT_ROW_2, false]
    ])
    expect(alignPromptRedraw(terminal, REDRAW)).toBe('')
  })

  it('handles the zsh redraw, which moves up after a double CR and clears with ED', () => {
    // Captured from local zsh at 52 columns: the prompt was drawn on one row and reflowed into two
    const prompt = '(base) \u279c  ' + 'x'.repeat(52) + ' '
    const terminal = makeBuffer([
      ['lrwxr-xr-x@ 1 root  wheel  11 Aug  4  2024 /tmp -> p', false],
      [prompt.slice(0, 52), false],
      [prompt.slice(52), true]
    ])
    const redraw = '\r\r\x1b[0m\x1b[27m\x1b[24m\x1b[J(base) \x1b[01;32m\u279c  \x1b[36m' + 'x'.repeat(52) + '\x1b[00m '
    expect(alignPromptRedraw(terminal, redraw)).toBe('\x1b[1A\x1b[2K' + clearDown(1) + '\x1b[1M\x1b[1A')
  })

  it('ignores output that is not a readline redraw', () => {
    const terminal = makeBuffer([
      [PROMPT_ROW_1.slice(0, 54), false],
      [PROMPT_ROW_1.slice(54), true],
      [PROMPT_ROW_2, false]
    ])
    expect(alignPromptRedraw(terminal, '\r\x1b[Kprogress 50%')).toBe('')
  })

  it('leaves full-screen programs on the alternate buffer alone', () => {
    const terminal = makeBuffer(
      [
        [PROMPT_ROW_1.slice(0, 54), false],
        [PROMPT_ROW_1.slice(54), true],
        [PROMPT_ROW_2, false]
      ],
      { type: 'alternate' }
    )
    expect(alignPromptRedraw(terminal, REDRAW)).toBe('')
  })

  it('does nothing when the prompt starts above the viewport', () => {
    const terminal = makeBuffer(
      [
        [PROMPT_ROW_1.slice(0, 54), false],
        [PROMPT_ROW_1.slice(54), true],
        [PROMPT_ROW_2, false]
      ],
      { baseY: 1 }
    )
    expect(alignPromptRedraw(terminal, REDRAW)).toBe('')
  })

  it('sums several cursor-up moves', () => {
    // readline drew three rows; xterm reflowed the first into two
    const redraw = '\r\x1b[K\x1b[A\x1b[Aaaaabbbb\r\n\rcccc\r\n\rdd$ '
    const terminal = makeBuffer([
      ['aaaa', false],
      ['bbbb', true],
      ['cccc', false],
      ['dd$ ', false]
    ])
    expect(alignPromptRedraw(terminal, redraw)).toBe('\x1b[3A\x1b[2K' + clearDown(3) + '\x1b[1M\x1b[1A')
  })

  it('takes the highest matching row for a prompt at the top of the buffer', () => {
    const terminal = makeBuffer([
      ['aa', false],
      ['aa', true]
    ])
    expect(alignPromptRedraw(terminal, '\r\x1b[K\x1b[Aaaaa')).toBe('\x1b[1A\x1b[2K' + clearDown(1))
  })

  it('keeps the output above when xterm joined the rows readline drew separately', () => {
    // Captured on 001: with reflowCursorLine the CRLF-joined rows became one wrapped line,
    // so readline's CUU 1 would land on the ls output above the prompt
    const prompt = PROMPT_ROW_1 + PROMPT_ROW_2
    const terminal = makeBuffer([
      ['drwxr-xr-x 2 root root 4096 Jun 19  2025 source', false],
      [prompt.slice(0, 68), false],
      [prompt.slice(68), true]
    ])
    expect(alignPromptRedraw(terminal, REDRAW)).toBe('\x1b[1A\x1b[2K' + clearDown(1))
  })

  it('moves down when readline expects more rows than the prompt now has', () => {
    const terminal = makeBuffer([
      ['output', false],
      [PROMPT_ROW_1 + PROMPT_ROW_2, false]
    ])
    expect(alignPromptRedraw(terminal, REDRAW)).toBe('\x1b[2K\n')
  })

  it('stops at a blank row above the prompt', () => {
    const terminal = makeBuffer([
      ['', false],
      [PROMPT_ROW_1, false],
      [PROMPT_ROW_2, false]
    ])
    expect(alignPromptRedraw(terminal, REDRAW)).toBe('\x1b[1A\x1b[2K' + clearDown(1))
  })
})

const makeTerminal = (cols: number, selected: boolean) => ({
  cols,
  hasSelection: vi.fn(() => selected),
  select: vi.fn()
})

describe('fitAndClearStaleSelection', () => {
  it('clears the selection when the fit changes the column count', () => {
    const terminal = makeTerminal(93, true)
    fitAndClearStaleSelection(terminal, () => (terminal.cols = 41))
    expect(terminal.select).toHaveBeenCalledWith(0, 0, 0)
  })

  it('keeps the selection when the column count is unchanged', () => {
    const terminal = makeTerminal(93, true)
    const fit = vi.fn()
    fitAndClearStaleSelection(terminal, fit)
    expect(fit).toHaveBeenCalledTimes(1)
    expect(terminal.select).not.toHaveBeenCalled()
  })

  it('does nothing extra when there is no selection', () => {
    const terminal = makeTerminal(93, false)
    fitAndClearStaleSelection(terminal, () => (terminal.cols = 41))
    expect(terminal.select).not.toHaveBeenCalled()
  })
})

type CursorState = { cols: number; rows?: number; baseY?: number; cursorX: number; cursorY: number; wrapped: boolean[]; markerLine?: number }

// A terminal whose fit() switches from `before` to `after`, the way xterm reflows
const makeCursorTerminal = (before: CursorState, after: CursorState, { type = 'normal', marker = true } = {}) => {
  let state = before
  const terminal = {
    get cols() {
      return state.cols
    },
    get rows() {
      return state.rows ?? 60
    },
    buffer: {
      active: {
        type,
        get baseY() {
          return state.baseY ?? 0
        },
        get cursorX() {
          return state.cursorX
        },
        get cursorY() {
          return state.cursorY
        },
        getLine: (y: number) => (y < state.wrapped.length ? { isWrapped: state.wrapped[y] } : undefined)
      }
    },
    registered: [] as number[],
    disposed: 0,
    registerMarker(offset = 0) {
      if (!marker) return undefined
      terminal.registered.push(offset)
      return {
        get line() {
          return state.markerLine ?? -1
        },
        dispose: () => terminal.disposed++
      }
    }
  }
  const fit = vi.fn(() => {
    state = after
  })
  return { terminal, fit }
}

describe('fitKeepingCursorInLine', () => {
  // Measured on the bastion host: a 96 column prompt wrapped at 51 columns, then widened to 105.
  // xterm merged the line back into row 13 but left the cursor at column 33.
  const narrow: CursorState = { cols: 51, cursorX: 45, cursorY: 19, wrapped: [...Array(19).fill(false), true] }

  it('moves the cursor to its offset in the reflowed line', () => {
    const { terminal, fit } = makeCursorTerminal(narrow, { cols: 105, cursorX: 33, cursorY: 13, wrapped: [], markerLine: 13 })
    expect(fitKeepingCursorInLine(terminal, fit)).toEqual({ offset: 96, x: 96, y: 13 })
    expect(fit).toHaveBeenCalledTimes(1)
    // The marker is anchored at the first row of the line and released afterwards
    expect(terminal.registered).toEqual([-1])
    expect(terminal.disposed).toBe(1)
  })

  it('places the cursor on the right row when narrowing wraps the line', () => {
    const wide: CursorState = { cols: 105, cursorX: 96, cursorY: 13, wrapped: [] }
    const { terminal, fit } = makeCursorTerminal(wide, { cols: 51, cursorX: 50, cursorY: 14, wrapped: [], markerLine: 13 })
    expect(fitKeepingCursorInLine(terminal, fit)).toEqual({ offset: 96, x: 45, y: 14 })
  })

  it('keeps a cursor on a row boundary parked past the end of the row', () => {
    // A 96 column prompt at 96 columns leaves the cursor at x = 96 on its only row
    const exact: CursorState = { cols: 104, cursorX: 96, cursorY: 13, wrapped: [] }
    const { terminal, fit } = makeCursorTerminal(exact, { cols: 96, cursorX: 95, cursorY: 13, wrapped: [], markerLine: 13 })
    expect(fitKeepingCursorInLine(terminal, fit)).toEqual({ offset: 96, x: 96, y: 13 })
  })

  it('reuses the offset of the previous fit while nothing has moved the cursor', () => {
    // xterm clamped the parked cursor to 95 on the next resize; the anchor still knows it was 96
    const clamped: CursorState = { cols: 96, cursorX: 96, cursorY: 13, wrapped: [] }
    const { terminal, fit } = makeCursorTerminal(clamped, { cols: 94, cursorX: 93, cursorY: 13, wrapped: [], markerLine: 13 })
    expect(fitKeepingCursorInLine(terminal, fit, { offset: 96, x: 96, y: 13 })).toEqual({ offset: 96, x: 2, y: 14 })
  })

  it('reads the offset again once something else moved the cursor', () => {
    const typed: CursorState = { cols: 105, cursorX: 98, cursorY: 13, wrapped: [] }
    const { terminal, fit } = makeCursorTerminal(typed, { cols: 105, cursorX: 98, cursorY: 13, wrapped: [], markerLine: 13 })
    expect(fitKeepingCursorInLine(terminal, fit, { offset: 96, x: 96, y: 13 })).toEqual({ offset: 98, x: 98, y: 13 })
  })

  it('keeps the start of a line at column 0', () => {
    const empty: CursorState = { cols: 105, cursorX: 0, cursorY: 14, wrapped: [] }
    const { terminal, fit } = makeCursorTerminal(empty, { cols: 51, cursorX: 0, cursorY: 14, wrapped: [], markerLine: 14 })
    expect(fitKeepingCursorInLine(terminal, fit)).toEqual({ offset: 0, x: 0, y: 14 })
  })

  it('gives up when the line was trimmed from the scrollback', () => {
    const { terminal, fit } = makeCursorTerminal(narrow, { cols: 105, cursorX: 33, cursorY: 13, wrapped: [] })
    expect(fitKeepingCursorInLine(terminal, fit)).toBeUndefined()
  })

  it('gives up when no marker can be registered', () => {
    const { terminal, fit } = makeCursorTerminal(narrow, { cols: 105, cursorX: 33, cursorY: 13, wrapped: [], markerLine: 13 }, { marker: false })
    expect(fitKeepingCursorInLine(terminal, fit)).toBeUndefined()
    expect(fit).toHaveBeenCalledTimes(1)
  })

  it('gives up when the target row is outside the viewport', () => {
    const { terminal, fit } = makeCursorTerminal(narrow, { cols: 105, baseY: 20, cursorX: 33, cursorY: 0, wrapped: [], markerLine: 13 })
    expect(fitKeepingCursorInLine(terminal, fit)).toBeUndefined()
  })

  it('only fits full-screen programs on the alternate buffer', () => {
    const { terminal, fit } = makeCursorTerminal(narrow, { cols: 105, cursorX: 33, cursorY: 13, wrapped: [], markerLine: 13 }, { type: 'alternate' })
    expect(fitKeepingCursorInLine(terminal, fit)).toBeUndefined()
    expect(fit).toHaveBeenCalledTimes(1)
    expect(terminal.registered).toEqual([])
  })
})

describe('createPtyResizeSync', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('sends only the final size after a burst of resizes', () => {
    const send = vi.fn()
    const sync = createPtyResizeSync(send, 150)
    for (let cols = 93; cols >= 41; cols -= 4) {
      sync.schedule(cols, 49)
      vi.advanceTimersByTime(60)
    }
    sync.schedule(41, 49)
    expect(send).not.toHaveBeenCalled()

    vi.advanceTimersByTime(150)
    expect(send).toHaveBeenCalledTimes(1)
    expect(send).toHaveBeenCalledWith(41, 49)
  })

  it('sends each size when resizes are spaced beyond the wait', () => {
    const send = vi.fn()
    const sync = createPtyResizeSync(send, 150)
    sync.schedule(80, 24)
    vi.advanceTimersByTime(150)
    sync.schedule(100, 30)
    vi.advanceTimersByTime(150)
    expect(send.mock.calls).toEqual([
      [80, 24],
      [100, 30]
    ])
  })

  it('drops a pending size on cancel', () => {
    const send = vi.fn()
    const sync = createPtyResizeSync(send, 150)
    sync.schedule(80, 24)
    sync.cancel()
    vi.advanceTimersByTime(1000)
    expect(send).not.toHaveBeenCalled()
    sync.cancel()
  })
})
