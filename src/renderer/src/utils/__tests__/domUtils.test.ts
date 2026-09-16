import { describe, it, expect, afterEach } from 'vitest'
import { placeCaretAtEnd } from '../domUtils'

describe('placeCaretAtEnd', () => {
  const created: HTMLElement[] = []

  const createEditable = (buildContent: (el: HTMLDivElement) => void): HTMLDivElement => {
    const el = document.createElement('div')
    el.contentEditable = 'true'
    buildContent(el)
    document.body.appendChild(el)
    created.push(el)
    return el
  }

  afterEach(() => {
    created.splice(0).forEach((el) => el.remove())
    window.getSelection()?.removeAllRanges()
  })

  it('places the caret inside the trailing text node instead of at an element offset', () => {
    const el = createEditable((root) => {
      const p = document.createElement('p')
      p.appendChild(document.createTextNode('Terminal output:'))
      root.appendChild(p)
    })

    placeCaretAtEnd(el)

    const selection = window.getSelection()
    expect(selection?.rangeCount).toBe(1)
    expect(selection?.anchorNode?.nodeType).toBe(Node.TEXT_NODE)
    expect(selection?.anchorOffset).toBe('Terminal output:'.length)
    expect(selection?.isCollapsed).toBe(true)
  })

  it('anchors before a trailing newline, which has no rendered caret position', () => {
    const text = 'Terminal output:\n```\nls -la\n```\n\n'
    const el = createEditable((root) => {
      const p = document.createElement('p')
      p.appendChild(document.createTextNode(text))
      root.appendChild(p)
    })

    placeCaretAtEnd(el)

    const selection = window.getSelection()
    expect(selection?.anchorNode?.nodeType).toBe(Node.TEXT_NODE)
    expect(selection?.anchorOffset).toBe(text.length - 1)
    expect(selection?.isCollapsed).toBe(true)
  })

  it('skips contenteditable="false" subtrees and lands on the following text node', () => {
    const el = createEditable((root) => {
      const p = document.createElement('p')
      p.appendChild(document.createTextNode('before '))

      const chip = document.createElement('span')
      chip.contentEditable = 'false'
      chip.setAttribute('data-chip-type', 'doc')
      chip.appendChild(document.createTextNode('chip label'))
      p.appendChild(chip)

      p.appendChild(document.createTextNode(' '))
      root.appendChild(p)
    })

    placeCaretAtEnd(el)

    const selection = window.getSelection()
    expect(selection?.anchorNode?.nodeType).toBe(Node.TEXT_NODE)
    expect((selection?.anchorNode as Text).data).toBe(' ')
    expect(selection?.anchorOffset).toBe(1)
  })

  it('does not place the caret inside a chip when the chip is the last node', () => {
    const el = createEditable((root) => {
      const chip = document.createElement('span')
      chip.contentEditable = 'false'
      chip.appendChild(document.createTextNode('chip label'))

      root.appendChild(document.createTextNode('text '))
      root.appendChild(chip)
    })

    placeCaretAtEnd(el)

    const selection = window.getSelection()
    expect((selection?.anchorNode as Text).data).toBe('text ')
  })

  it('falls back to the element-level end when there is no text node', () => {
    const el = createEditable(() => {})

    placeCaretAtEnd(el)

    const selection = window.getSelection()
    expect(selection?.rangeCount).toBe(1)
    expect(selection?.anchorNode).toBe(el)
    expect(selection?.isCollapsed).toBe(true)
  })
})
