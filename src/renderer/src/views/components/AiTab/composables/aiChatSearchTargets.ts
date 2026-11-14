import * as monaco from 'monaco-editor'
import type { IBufferCell, IBufferLine, IDecoration, IMarker, Terminal } from '@xterm/xterm'
import { getTerminalOutput } from './terminalOutputRegistry'

export const MONACO_MATCH_CLASS = 'ai-chat-search-monaco-match'
export const MONACO_ACTIVE_MATCH_CLASS = 'ai-chat-search-monaco-match-active'

// xterm only accepts #RRGGBB, so these are the opaque equivalents of the mark
// colors in index.less blended over a dark terminal background.
const TERMINAL_MATCH_COLORS = { background: '#786712', foreground: '#ffffff' }
const TERMINAL_ACTIVE_MATCH_COLORS = { background: '#a5600c', foreground: '#ffffff' }

export interface MonacoMatch {
  type: 'monaco'
  container: HTMLElement
  editor: monaco.editor.ICodeEditor
  range: monaco.IRange
}

export interface TerminalMatch {
  type: 'terminal'
  container: HTMLElement
  terminal: Terminal
  line: number
  column: number
  width: number
  marker?: IMarker
  decoration?: IDecoration
}

const monacoDecorations = new WeakMap<monaco.editor.ICodeEditor, monaco.editor.IEditorDecorationsCollection>()

/**
 * Find matches in the models of the Monaco editors rendered under root. Reading the
 * model rather than the rendered lines also covers collapsed and wrapped content.
 */
export function findMonacoMatches(root: HTMLElement, term: string): MonacoMatch[] {
  const matches: MonacoMatch[] = []
  for (const editor of monaco.editor.getEditors()) {
    const container = editor.getContainerDomNode()
    const model = editor.getModel()
    if (!model || !root.contains(container)) continue
    for (const found of model.findMatches(term, false, false, false, null, false, Number.MAX_SAFE_INTEGER)) {
      matches.push({ type: 'monaco', container, editor, range: found.range })
    }
  }
  return matches
}

/**
 * Paint every match of each editor, giving the active one its own class.
 */
export function paintMonacoMatches(matches: MonacoMatch[], active: MonacoMatch | null): void {
  const byEditor = new Map<monaco.editor.ICodeEditor, MonacoMatch[]>()
  for (const match of matches) {
    byEditor.set(match.editor, [...(byEditor.get(match.editor) ?? []), match])
  }
  for (const [editor, list] of byEditor) {
    const collection = monacoDecorations.get(editor) ?? editor.createDecorationsCollection()
    monacoDecorations.set(editor, collection)
    collection.set(
      list.map((match) => ({
        range: match.range,
        options: { inlineClassName: match === active ? `${MONACO_MATCH_CLASS} ${MONACO_ACTIVE_MATCH_CLASS}` : MONACO_MATCH_CLASS }
      }))
    )
  }
}

export function clearMonacoMatches(matches: MonacoMatch[]): void {
  for (const editor of new Set(matches.map((match) => match.editor))) {
    monacoDecorations.get(editor)?.clear()
  }
}

/**
 * Read a buffer line as text plus the start column of every UTF-16 unit, with one
 * trailing entry for the line end, so a text range maps back to terminal cells even
 * when the line contains double-width characters.
 */
function readLine(line: IBufferLine, scratch: IBufferCell): { text: string; columns: number[] } {
  let text = ''
  const columns: number[] = []
  for (let x = 0; x < line.length; x++) {
    const cell = line.getCell(x, scratch)
    if (!cell || cell.getWidth() === 0) continue
    const chars = cell.getChars() || ' '
    text += chars
    for (let i = 0; i < chars.length; i++) columns.push(x)
  }
  columns.push(line.length)
  return { text, columns }
}

/**
 * Lower-case text without changing its UTF-16 length. A few characters, such as the
 * dotted capital I, lower-case to more units, which would shift the offsets used to
 * map a match back to terminal cells.
 */
function foldCase(text: string): string {
  const lower = text.toLowerCase()
  if (lower.length === text.length) return lower
  return Array.from(text, (char) => {
    const folded = char.toLowerCase()
    return folded.length === char.length ? folded : char
  }).join('')
}

/**
 * Find matches in the full buffer of the output terminals rendered under root. A
 * collapsed output only renders a few rows, but its buffer still holds every line.
 */
export function findTerminalMatches(root: HTMLElement, term: string): TerminalMatch[] {
  const matches: TerminalMatch[] = []
  const lowerTerm = foldCase(term)
  root.querySelectorAll<HTMLElement>('.terminal-output').forEach((container) => {
    const terminal = getTerminalOutput(container)
    if (!terminal) return
    const buffer = terminal.buffer.active
    const scratch = buffer.getNullCell()
    for (let y = 0; y < buffer.length; y++) {
      const line = buffer.getLine(y)
      if (!line || !foldCase(line.translateToString(true)).includes(lowerTerm)) continue
      const { text, columns } = readLine(line, scratch)
      const lowerText = foldCase(text)
      let from = 0
      while (true) {
        const index = lowerText.indexOf(lowerTerm, from)
        if (index === -1) break
        const column = columns[index]
        matches.push({ type: 'terminal', container, terminal, line: y, column, width: columns[index + lowerTerm.length] - column })
        from = index + lowerTerm.length
      }
    }
  })
  return matches
}

export function decorateTerminalMatch(match: TerminalMatch, active: boolean): void {
  match.decoration?.dispose()
  const buffer = match.terminal.buffer.active
  match.marker ??= match.terminal.registerMarker(match.line - (buffer.baseY + buffer.cursorY))
  const colors = active ? TERMINAL_ACTIVE_MATCH_COLORS : TERMINAL_MATCH_COLORS
  match.decoration = match.terminal.registerDecoration({
    marker: match.marker,
    x: match.column,
    width: match.width,
    backgroundColor: colors.background,
    foregroundColor: colors.foreground
  })
}

export function clearTerminalMatches(matches: TerminalMatch[]): void {
  for (const match of matches) {
    match.decoration?.dispose()
    match.marker?.dispose()
  }
}

// Regions the user can fold. `trigger` is the element whose click toggles the region.
const COLLAPSIBLE_REGIONS = [
  {
    region: '.ant-collapse-item',
    trigger: ':scope > .ant-collapse-header',
    isCollapsed: (el: HTMLElement) => !el.classList.contains('ant-collapse-item-active')
  },
  {
    region: '.terminal-output-container',
    trigger: '.terminal-output-header .output-title-section',
    isCollapsed: (el: HTMLElement) => !!el.querySelector('.terminal-output-header .anticon-caret-right')
  },
  {
    region: '.command-output-container',
    trigger: '.command-output-header',
    isCollapsed: (el: HTMLElement) => !!el.querySelector('.command-output-header .anticon-caret-right')
  }
]

/**
 * Open every folded region between target and boundary, outermost first, by clicking
 * its header the way the user would. Returns whether anything was opened.
 */
export function expandCollapsedAncestors(target: HTMLElement, boundary: HTMLElement | null): boolean {
  const collapsed: Array<{ el: HTMLElement; trigger: string }> = []
  for (let el = target.parentElement; el && el !== boundary; el = el.parentElement) {
    for (const { region, trigger, isCollapsed } of COLLAPSIBLE_REGIONS) {
      if (el.matches(region) && isCollapsed(el)) collapsed.unshift({ el, trigger })
    }
  }
  for (const { el, trigger } of collapsed) {
    el.querySelector<HTMLElement>(trigger)?.click()
  }
  return collapsed.length > 0
}

export function revealMonacoMatch(match: MonacoMatch): void {
  match.editor.revealRangeInCenterIfOutsideViewport(match.range)
  const rendered = match.container.querySelector<HTMLElement>(`.${MONACO_ACTIVE_MATCH_CLASS}`)
  ;(rendered ?? match.container).scrollIntoView({ behavior: 'smooth', block: 'center' })
}

export function revealTerminalMatch(match: TerminalMatch): void {
  const rows = match.container.querySelectorAll<HTMLElement>('.xterm-rows > div')
  const row = rows[match.line - match.terminal.buffer.active.viewportY]
  ;(row ?? match.container).scrollIntoView({ behavior: 'smooth', block: 'center' })
}
