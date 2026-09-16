/**
 * Check if an element is within the AITab component
 * @param element - The element to check
 * @returns true if the element is within AITab component, false otherwise
 */
export function isElementInAiTab(element: HTMLElement | null): boolean {
  if (!element) {
    return false
  }

  // Check if element is within right sidebar (terminal mode)
  const rightSidebar = document.querySelector('.rigth-sidebar')
  if (rightSidebar?.contains(element)) {
    return true
  }

  // Check if element is within agents chat container (agents mode)
  const agentsChatContainer = document.querySelector('.agents-chat-container')
  if (agentsChatContainer?.contains(element)) {
    return true
  }

  // Check if element is within AI chat tabs
  if (element.closest('.ai-chat-custom-tabs')) {
    return true
  }

  // Check if element is the chat textarea
  if (element.classList.contains('chat-textarea')) {
    return true
  }

  return false
}

/**
 * Whether an element opts out of editing via `contenteditable="false"`.
 * The attribute and the property are both checked because they are not
 * reflected onto each other in every DOM implementation.
 * @param el - The element to check
 * @returns true when the element is not editable
 */
function isNonEditableElement(el: HTMLElement): boolean {
  return el.getAttribute('contenteditable') === 'false' || el.contentEditable === 'false'
}

/**
 * Find the deepest trailing text node that the caret can be placed inside.
 * Subtrees marked `contenteditable="false"` (mention chips, image previews) are
 * skipped because a caret inside them is not a valid editing position.
 * @param root - The contenteditable root to search
 * @returns The last editable text node, or null when there is none
 */
function findLastEditableTextNode(root: Node): Text | null {
  const children = Array.from(root.childNodes)

  for (let i = children.length - 1; i >= 0; i--) {
    const node = children[i]

    if (node.nodeType === Node.TEXT_NODE) {
      return node as Text
    }

    if (node.nodeType !== Node.ELEMENT_NODE) continue
    if (isNonEditableElement(node as HTMLElement)) continue

    const found = findLastEditableTextNode(node)
    if (found) return found
  }

  return null
}

/**
 * Collapse the selection to the end of a contenteditable element, keeping the
 * caret inside a real text node.
 *
 * A caret parked at an element-level offset (what `selectNodeContents` +
 * `collapse(false)` produces) leaves Blink without a text node to attach the
 * IME preedit to, so the first composition after a programmatic focus is
 * dropped. Descending into the trailing text node avoids that.
 *
 * A trailing newline needs the same care. Under `white-space: pre-wrap` the
 * last newline of a block produces no line box, so the offset after it is not
 * a rendered caret position: Blink canonicalizes it back before the newline and
 * reports `TextInputType::None` until it does, which makes the first key of an
 * IME composition arrive as a literal character. Anchoring before the trailing
 * newline keeps the caret on a position that is already rendered.
 * @param el - The contenteditable element to place the caret in
 */
export function placeCaretAtEnd(el: HTMLElement): void {
  const selection = window.getSelection()
  if (!selection) return

  const range = document.createRange()
  const lastTextNode = findLastEditableTextNode(el)

  if (lastTextNode) {
    const { data } = lastTextNode
    const offset = data.endsWith('\n') ? data.length - 1 : data.length
    range.setStart(lastTextNode, offset)
    range.collapse(true)
  } else {
    // No text node yet (empty input): fall back to the element-level end.
    range.selectNodeContents(el)
    range.collapse(false)
  }

  selection.removeAllRanges()
  selection.addRange(range)
}

/**
 * Check if the focus is currently within the AITab component
 * @param event - The keyboard event (optional, may have null target for synthetic events)
 * @returns true if focus is within AITab component, false otherwise
 */
export function isFocusInAiTab(event?: KeyboardEvent): boolean {
  const target = event?.target as HTMLElement | null
  const activeElement = document.activeElement as HTMLElement | null

  // Check both event target and active element
  return isElementInAiTab(target) || isElementInAiTab(activeElement)
}
