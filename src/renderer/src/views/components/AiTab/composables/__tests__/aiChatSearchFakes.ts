import { vi } from 'vitest'

interface FakeRange {
  startLineNumber: number
  startColumn: number
  endLineNumber: number
  endColumn: number
}

/**
 * Minimal Monaco editor: a model made of plain lines plus a decorations collection.
 */
export function createFakeEditor(container: HTMLElement, lines: string[]) {
  const collection = { set: vi.fn(), clear: vi.fn() }
  return {
    collection,
    getContainerDomNode: () => container,
    getModel: () => ({
      findMatches: (term: string): Array<{ range: FakeRange }> => {
        const lowerTerm = term.toLowerCase()
        const found: Array<{ range: FakeRange }> = []
        lines.forEach((line, index) => {
          let from = 0
          while (true) {
            const at = line.toLowerCase().indexOf(lowerTerm, from)
            if (at === -1) break
            found.push({
              range: { startLineNumber: index + 1, startColumn: at + 1, endLineNumber: index + 1, endColumn: at + 1 + term.length }
            })
            from = at + term.length
          }
        })
        return found
      }
    }),
    createDecorationsCollection: vi.fn(() => collection),
    revealRangeInCenterIfOutsideViewport: vi.fn()
  }
}

const isWide = (char: string) => /[一-鿿]/.test(char)

/**
 * One buffer line. A double-width character takes two cells; the second one is empty
 * and reports width 0, like xterm does. `missingCell` makes getCell return undefined.
 */
function createFakeLine(text: string, missingCell = -1) {
  const cells: Array<{ chars: string; width: number }> = []
  for (const char of text) {
    // xterm reports an unwritten cell, which is what a space is here, as empty chars.
    cells.push({ chars: char === ' ' ? '' : char, width: isWide(char) ? 2 : 1 })
    if (isWide(char)) cells.push({ chars: '', width: 0 })
  }
  return {
    length: cells.length,
    translateToString: () => text.trimEnd(),
    getCell: (x: number) => (x === missingCell ? undefined : { getChars: () => cells[x].chars, getWidth: () => cells[x].width })
  }
}

/**
 * Minimal xterm Terminal: a buffer of text lines (undefined = line not available),
 * markers and decorations that record how they were registered.
 */
export function createFakeTerminal(lines: Array<string | undefined>, options: { viewportY?: number; missingCell?: number } = {}) {
  const markers: Array<{ offset: number; dispose: ReturnType<typeof vi.fn> }> = []
  const decorations: Array<{ options: Record<string, unknown>; dispose: ReturnType<typeof vi.fn> }> = []
  return {
    markers,
    decorations,
    buffer: {
      active: {
        length: lines.length,
        baseY: 0,
        cursorY: lines.length - 1,
        viewportY: options.viewportY ?? 0,
        getNullCell: () => ({}),
        getLine: (y: number) => (lines[y] === undefined ? undefined : createFakeLine(lines[y], options.missingCell))
      }
    },
    registerMarker: vi.fn((offset: number) => {
      const marker = { offset, dispose: vi.fn() }
      markers.push(marker)
      return marker
    }),
    registerDecoration: vi.fn((decorationOptions: Record<string, unknown>) => {
      const decoration = { options: decorationOptions, dispose: vi.fn() }
      decorations.push(decoration)
      return decoration
    })
  }
}
