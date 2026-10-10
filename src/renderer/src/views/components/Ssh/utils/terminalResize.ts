type SelectableTerminal = {
  cols: number
  hasSelection: () => boolean
  select: (column: number, row: number, length: number) => void
}

/**
 * Fit the grid and drop a selection the fit would misplace.
 *
 * xterm stores the selection as absolute buffer coordinates and only clears it
 * when the row count changes. A width change reflows wrapped lines underneath
 * those coordinates, so the highlight lands on different text than the user
 * selected. Drop it instead, matching what xterm does for a height change.
 *
 * clearSelection() is not enough here: the DOM renderer (used when a background
 * image disables WebGL) skips updating its cached selection when handed an
 * empty one, and replays that cache on its next resize, so the highlight comes
 * back on the following fit. An empty select() reaches the renderer as a
 * zero-length range, which does reset that cache.
 */
export const fitAndClearStaleSelection = (terminal: SelectableTerminal, fit: () => void): void => {
  const colsBefore = terminal.cols
  fit()
  if (terminal.cols !== colsBefore && terminal.hasSelection()) {
    terminal.select(0, 0, 0)
  }
}

type CursorTerminal = {
  cols: number
  rows: number
  buffer: {
    active: {
      type: string
      baseY: number
      cursorX: number
      cursorY: number
      getLine: (y: number) => { isWrapped: boolean } | undefined
    }
  }
  registerMarker: (cursorYOffset?: number) => { line: number; dispose: () => void } | undefined
}

// Where the cursor was left after a fit, so the next fit of the same drag can
// reuse its offset instead of reading it back from the reflowed buffer.
export type CursorAnchor = { offset: number; x: number; y: number }

/**
 * Fit the grid and work out where the cursor belongs in its reflowed line.
 *
 * With reflowCursorLine xterm re-wraps the cursor's line and moves the cursor to
 * the right row, but keeps its column. Until the shell redraws, which it never
 * does when a drag ends at the width it started from, the next echoed key lands
 * at that stale column in the middle of the prompt.
 *
 * The offset is read once and carried through the rest of the drag in the
 * returned anchor: a cursor parked past the last column (a prompt that exactly
 * fills a row) is clamped by every resize, so reading it back each time would
 * lose a column per fit. Returns undefined when the line cannot be tracked.
 */
export const fitKeepingCursorInLine = (terminal: CursorTerminal, fit: () => void, previous?: CursorAnchor): CursorAnchor | undefined => {
  const buffer = terminal.buffer.active
  if (buffer.type !== 'normal') {
    fit()
    return undefined
  }

  const cursorRow = buffer.baseY + buffer.cursorY
  let firstRow = cursorRow
  while (firstRow > 0 && buffer.getLine(firstRow)?.isWrapped) firstRow--
  // Nothing has moved the cursor since the last fit placed it, so its offset still holds
  const reuse = previous && previous.x === buffer.cursorX && previous.y === buffer.cursorY
  const offset = reuse ? previous.offset : (cursorRow - firstRow) * terminal.cols + buffer.cursorX
  // A marker follows the line through reflow and scrollback trimming
  const marker = terminal.registerMarker(firstRow - cursorRow)

  fit()

  const line = marker?.line ?? -1
  marker?.dispose()
  if (line < 0) return undefined
  // An offset on a row boundary stays parked past the end of the previous row, as xterm keeps it
  const rowsDown = offset > 0 && offset % terminal.cols === 0 ? offset / terminal.cols - 1 : Math.floor(offset / terminal.cols)
  const y = line + rowsDown - buffer.baseY
  if (y < 0 || y >= terminal.rows) return undefined
  return { offset, x: offset - rowsDown * terminal.cols, y }
}

type PromptBufferTerminal = {
  buffer: {
    active: {
      type: string
      baseY: number
      cursorY: number
      getLine: (y: number) => { isWrapped: boolean; translateToString: (trimRight?: boolean) => string } | undefined
    }
  }
}

// A shell's SIGWINCH redraw: back to column 0, move up to where it thinks the
// line starts (not at all when it drew a single row), then reprint prompt and
// input. readline sends \r\e[K\e[A..., zsh sends \r\r\e[A... and clears with \e[J.
const PROMPT_REDRAW_RE = /^\r+(?:\x1b\[K)?((?:\x1b\[\d*A)*)/
const CURSOR_UP_RE = /\x1b\[(\d*)A/g
const CONTROL_SEQUENCE_RE = /\x1b\[[0-?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|[\r\n]/g

// CUU treats a count of 0 as 1, so a zero move must be omitted entirely
const cursorUp = (rows: number): string => (rows > 0 ? `\x1b[${rows}A` : '')

// Visible text only, ignoring wrap points and trailing padding.
const visibleText = (text: string): string => text.replace(CONTROL_SEQUENCE_RE, '').replace(/\s+/g, '')

/**
 * Sequence to prepend to a shell's post-resize prompt redraw so it starts on
 * the first row of the prompt line.
 *
 * The shell moves up by the row count it last drew, not the count xterm now
 * has: xterm reflows the rows on every width change, splitting a row into
 * several or joining rows readline separated with CRLF. The redraw then starts
 * partway down the old prompt, leaving the rows above it on screen as a stale
 * copy, or above it, overwriting the output before the prompt.
 *
 * The old prompt is found by its text rather than its row layout: the rows
 * above the cursor that, joined, are exactly the start of what readline is
 * about to print. They are cleared, so a row now drawn shorter keeps no tail,
 * and the cursor is moved to where the shell's own CUU lands on the first of them.
 *
 * Returns '' unless the data is that redraw and the cursor's line holds the
 * same text it is about to print, so other output is never touched.
 */
export const alignPromptRedraw = (terminal: PromptBufferTerminal, data: string): string => {
  const match = PROMPT_REDRAW_RE.exec(data)
  if (!match) return ''
  const buffer = terminal.buffer.active
  if (buffer.type !== 'normal') return ''

  let rowsUp = 0
  for (const [, count] of match[1].matchAll(CURSOR_UP_RE)) rowsUp += Number(count || 1)

  const redrawn = visibleText(data.slice(match[0].length))
  const rowText = (row: number) => visibleText(buffer.getLine(row)?.translateToString(true) ?? '')
  const cursorRow = buffer.baseY + buffer.cursorY

  // Scan up from the cursor for the highest row from which the rows read as the
  // start of the redraw. A blank row ends the prompt, and rows already scrolled
  // out of the viewport cannot be reached with CUU.
  let firstRow = -1
  let stale = ''
  for (let row = cursorRow; row >= buffer.baseY && stale.length <= redrawn.length; row--) {
    const text = rowText(row)
    if (!text && row < cursorRow) break
    stale = text + stale
    if (stale && redrawn.startsWith(stale)) firstRow = row
  }
  if (firstRow < 0) return ''

  const oldRows = cursorRow - firstRow
  if (oldRows === 0 && rowsUp === 0) return ''

  // Clear every row of the old prompt, ending on its last row
  let sequence = cursorUp(oldRows) + '\x1b[2K' + '\x1b[B\x1b[2K'.repeat(oldRows)
  if (oldRows > rowsUp) {
    // Drop the rows the shell no longer knows about
    sequence += cursorUp(oldRows - rowsUp - 1) + `\x1b[${oldRows - rowsUp}M` + cursorUp(1)
  } else if (oldRows < rowsUp) {
    // LF scrolls when the prompt is at the bottom, where CUD would stop
    sequence += '\n'.repeat(rowsUp - oldRows)
  }
  // The cursor now sits rowsUp below firstRow, where the shell's own CUU expects it
  return sequence
}

/**
 * Trailing debounce for the pty size sync.
 *
 * Every pty resize sends SIGWINCH to the remote shell, which redraws its prompt
 * relative to the rows on screen. During a splitter drag the local grid keeps
 * reflowing while those redraws are in flight, so a redraw can land on a layout
 * that has already changed again. Sending only the settled size gives the shell
 * one redraw per drag, against a grid that is no longer moving. The grid itself
 * still follows the drag.
 */
export const createPtyResizeSync = (send: (cols: number, rows: number) => void, wait: number) => {
  let timer: ReturnType<typeof setTimeout> | undefined

  return {
    schedule(cols: number, rows: number) {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        timer = undefined
        send(cols, rows)
      }, wait)
    },
    cancel() {
      if (timer) clearTimeout(timer)
      timer = undefined
    }
  }
}
