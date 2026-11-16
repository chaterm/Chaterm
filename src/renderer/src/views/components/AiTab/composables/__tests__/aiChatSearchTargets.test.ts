import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createFakeEditor, createFakeTerminal } from './aiChatSearchFakes'
import {
  MONACO_MATCH_CLASS,
  MONACO_ACTIVE_MATCH_CLASS,
  findMonacoMatches,
  paintMonacoMatches,
  clearMonacoMatches,
  findTerminalMatches,
  decorateTerminalMatch,
  clearTerminalMatches,
  expandCollapsedAncestors,
  revealMonacoMatch,
  revealTerminalMatch
} from '../aiChatSearchTargets'
import { registerTerminalOutput, unregisterTerminalOutput, getTerminalOutput } from '../terminalOutputRegistry'

const mocks = vi.hoisted(() => ({ editors: [] as unknown[] }))

vi.mock('monaco-editor', () => ({
  editor: { getEditors: () => mocks.editors }
}))

const asTerminal = (fake: ReturnType<typeof createFakeTerminal>) => fake as unknown as Parameters<typeof registerTerminalOutput>[1]

describe('aiChatSearchTargets', () => {
  let root: HTMLElement

  beforeEach(() => {
    root = document.createElement('div')
    document.body.appendChild(root)
    mocks.editors = []
    Element.prototype.scrollIntoView = vi.fn()
  })

  afterEach(() => {
    root.remove()
  })

  describe('terminalOutputRegistry', () => {
    it('returns the registered terminal until it is unregistered', () => {
      const element = document.createElement('div')
      const terminal = asTerminal(createFakeTerminal(['x']))

      registerTerminalOutput(element, terminal)
      expect(getTerminalOutput(element)).toBe(terminal)

      unregisterTerminalOutput(element)
      expect(getTerminalOutput(element)).toBeUndefined()
    })
  })

  describe('Monaco matches', () => {
    function addEditor(lines: string[], parent: HTMLElement = root) {
      const container = document.createElement('div')
      parent.appendChild(container)
      const editor = createFakeEditor(container, lines)
      mocks.editors.push(editor)
      return { container, editor }
    }

    it('finds every occurrence in the model, one match each', () => {
      addEditor(['test one test', 'two'])

      const matches = findMonacoMatches(root, 'test')

      expect(matches).toHaveLength(2)
      expect(matches[0].range).toMatchObject({ startLineNumber: 1, startColumn: 1, endColumn: 5 })
      expect(matches[1].range).toMatchObject({ startLineNumber: 1, startColumn: 10, endColumn: 14 })
    })

    it('ignores editors outside the search root and editors without a model', () => {
      const outside = document.createElement('div')
      document.body.appendChild(outside)
      const stray = createFakeEditor(outside, ['test'])
      const detached = createFakeEditor(root.appendChild(document.createElement('div')), ['test'])
      detached.getModel = () => null as never
      mocks.editors.push(stray, detached)

      expect(findMonacoMatches(root, 'test')).toHaveLength(0)
      outside.remove()
    })

    it('decorates all matches and gives only the active one the active class', () => {
      const { editor } = addEditor(['test test'])
      const matches = findMonacoMatches(root, 'test')

      paintMonacoMatches(matches, matches[1])

      const painted = editor.collection.set.mock.calls[0][0]
      expect(painted).toHaveLength(2)
      expect(painted[0].options.inlineClassName).toBe(MONACO_MATCH_CLASS)
      expect(painted[1].options.inlineClassName).toBe(`${MONACO_MATCH_CLASS} ${MONACO_ACTIVE_MATCH_CLASS}`)
    })

    it('reuses the decorations collection and paints every editor that has matches', () => {
      const first = addEditor(['test'])
      const second = addEditor(['test'])
      const matches = findMonacoMatches(root, 'test')

      paintMonacoMatches(matches, null)
      paintMonacoMatches(matches, matches[0])

      expect(first.editor.createDecorationsCollection).toHaveBeenCalledTimes(1)
      expect(second.editor.createDecorationsCollection).toHaveBeenCalledTimes(1)
      expect(first.editor.collection.set).toHaveBeenCalledTimes(2)
    })

    it('clears the decorations of the editors that were painted', () => {
      const { editor } = addEditor(['test test'])
      const matches = findMonacoMatches(root, 'test')
      paintMonacoMatches(matches, null)

      clearMonacoMatches(matches)

      expect(editor.collection.clear).toHaveBeenCalledTimes(1)
    })

    it('clearing editors that were never painted does nothing', () => {
      addEditor(['test'])
      expect(() => clearMonacoMatches(findMonacoMatches(root, 'test'))).not.toThrow()
    })

    it('reveals the range and scrolls the rendered active match into view', () => {
      const { container, editor } = addEditor(['test'])
      const rendered = document.createElement('span')
      rendered.className = MONACO_ACTIVE_MATCH_CLASS
      container.appendChild(rendered)
      const [match] = findMonacoMatches(root, 'test')

      revealMonacoMatch(match)

      expect(editor.revealRangeInCenterIfOutsideViewport).toHaveBeenCalledWith(match.range)
      expect(rendered.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' })
    })

    it('scrolls the container into view when the active match is not rendered yet', () => {
      const { container } = addEditor(['test'])
      const [match] = findMonacoMatches(root, 'test')

      revealMonacoMatch(match)

      expect(container.scrollIntoView).toHaveBeenCalled()
    })
  })

  describe('terminal matches', () => {
    function addTerminal(lines: Array<string | undefined>, options?: Parameters<typeof createFakeTerminal>[1]) {
      const container = document.createElement('div')
      container.className = 'terminal-output'
      root.appendChild(container)
      const terminal = createFakeTerminal(lines, options)
      registerTerminalOutput(container, asTerminal(terminal))
      return { container, terminal }
    }

    it('finds matches in every buffer line, not only the rendered rows', () => {
      addTerminal(['nothing here', 'a test b', 'TEST and test'])

      const matches = findTerminalMatches(root, 'test')

      expect(matches.map((m) => [m.line, m.column])).toEqual([
        [1, 2],
        [2, 0],
        [2, 9]
      ])
      expect(matches.every((m) => m.width === 4)).toBe(true)
    })

    it('maps text offsets to cells when the line has double-width characters', () => {
      addTerminal(['中文test'])

      const [match] = findTerminalMatches(root, 'test')

      expect(match).toMatchObject({ line: 0, column: 4, width: 4 })
    })

    it('keeps the cell mapping aligned after a character whose lower case is longer', () => {
      // "İ".toLowerCase() is two UTF-16 units, which would shift every later offset
      addTerminal(['İ test'])

      const [match] = findTerminalMatches(root, 'test')

      expect(match).toMatchObject({ line: 0, column: 2, width: 4 })
    })

    it('ignores output containers without a registered terminal', () => {
      const container = document.createElement('div')
      container.className = 'terminal-output'
      root.appendChild(container)

      expect(findTerminalMatches(root, 'test')).toHaveLength(0)
    })

    it('skips buffer lines and cells that are not available', () => {
      addTerminal(['x', undefined, 'ab test'], { missingCell: 0 })

      const matches = findTerminalMatches(root, 'test')

      expect(matches).toHaveLength(1)
      expect(matches[0]).toMatchObject({ line: 2, column: 3 })
    })

    it('decorates a match relative to the cursor and recolors the active one', () => {
      const { terminal } = addTerminal(['x', 'a test', 'y'])
      const [match] = findTerminalMatches(root, 'test')

      decorateTerminalMatch(match, false)
      decorateTerminalMatch(match, true)

      // cursor sits on the last line (2), the match on line 1
      expect(terminal.registerMarker).toHaveBeenCalledTimes(1)
      expect(terminal.registerMarker).toHaveBeenCalledWith(-1)
      expect(terminal.decorations[0].dispose).toHaveBeenCalled()
      const [normal, active] = terminal.decorations.map((d) => d.options)
      expect(normal).toMatchObject({ x: 2, width: 4 })
      expect(active).toMatchObject({ x: 2, width: 4 })
      expect(normal.backgroundColor).not.toBe(active.backgroundColor)
    })

    it('disposes decorations and markers on clear, including matches never decorated', () => {
      const { terminal } = addTerminal(['test', 'test'])
      const matches = findTerminalMatches(root, 'test')
      decorateTerminalMatch(matches[0], false)

      clearTerminalMatches(matches)

      expect(terminal.decorations[0].dispose).toHaveBeenCalled()
      expect(terminal.markers[0].dispose).toHaveBeenCalled()
    })

    it('scrolls the row of the match into view', () => {
      const { container } = addTerminal(['a', 'test'], { viewportY: 0 })
      container.innerHTML = '<div class="xterm-rows"><div></div><div></div></div>'
      const rows = container.querySelectorAll('.xterm-rows > div')
      const [match] = findTerminalMatches(root, 'test')

      revealTerminalMatch(match)

      expect(rows[1].scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' })
    })

    it('scrolls the container into view when the row is not rendered', () => {
      const { container } = addTerminal(['test'])
      const [match] = findTerminalMatches(root, 'test')

      revealTerminalMatch(match)

      expect(container.scrollIntoView).toHaveBeenCalled()
    })
  })

  describe('expandCollapsedAncestors', () => {
    function build(html: string) {
      root.innerHTML = html
      return root.querySelector<HTMLElement>('.target')!
    }

    it('opens a folded collapse panel through its header', () => {
      const target = build(
        '<div class="ant-collapse-item"><div class="ant-collapse-header"></div><div class="ant-collapse-content"><span class="target"></span></div></div>'
      )
      const click = vi.fn()
      root.querySelector('.ant-collapse-header')!.addEventListener('click', click)

      expect(expandCollapsedAncestors(target, root)).toBe(true)
      expect(click).toHaveBeenCalledTimes(1)
    })

    it('leaves open panels alone', () => {
      const target = build(
        '<div class="ant-collapse-item ant-collapse-item-active"><div class="ant-collapse-header"></div><span class="target"></span></div>'
      )
      const click = vi.fn()
      root.querySelector('.ant-collapse-header')!.addEventListener('click', click)

      expect(expandCollapsedAncestors(target, root)).toBe(false)
      expect(click).not.toHaveBeenCalled()
    })

    it('opens a folded output through its title section', () => {
      const target = build(
        '<div class="terminal-output-container"><div class="terminal-output-header"><div class="output-title-section"><span class="anticon-caret-right"></span></div></div><span class="target"></span></div>'
      )
      const click = vi.fn()
      root.querySelector('.output-title-section')!.addEventListener('click', click)

      expect(expandCollapsedAncestors(target, root)).toBe(true)
      expect(click).toHaveBeenCalledTimes(1)
    })

    it('does not touch an output that cannot be folded', () => {
      const target = build(
        '<div class="terminal-output-container"><div class="terminal-output-header"><div class="output-title-section"></div></div><span class="target"></span></div>'
      )

      expect(expandCollapsedAncestors(target, root)).toBe(false)
    })

    it('opens a folded command output through its header', () => {
      const target = build(
        '<div class="command-output-container"><div class="command-output-header"><span class="anticon-caret-right"></span></div><span class="target"></span></div>'
      )
      const click = vi.fn()
      root.querySelector('.command-output-header')!.addEventListener('click', click)

      expect(expandCollapsedAncestors(target, root)).toBe(true)
      expect(click).toHaveBeenCalledTimes(1)
    })

    it('opens nested regions from the outermost inward and stops at the boundary', () => {
      const target = build(
        '<div class="ant-collapse-item" id="above"><div class="ant-collapse-header"></div>' +
          '<div class="boundary"><div class="ant-collapse-item" id="outer"><div class="ant-collapse-header"></div>' +
          '<div class="ant-collapse-item" id="inner"><div class="ant-collapse-header"></div><span class="target"></span></div></div></div></div>'
      )
      const order: string[] = []
      root.querySelectorAll('.ant-collapse-item').forEach((item) => {
        item.querySelector(':scope > .ant-collapse-header')!.addEventListener('click', () => order.push(item.id))
      })

      expandCollapsedAncestors(target, root.querySelector('.boundary'))

      expect(order).toEqual(['outer', 'inner'])
    })

    it('reports an opened region even when it has no header to click', () => {
      const target = build('<div class="ant-collapse-item"><span class="target"></span></div>')

      expect(expandCollapsedAncestors(target, root)).toBe(true)
    })
  })
})
