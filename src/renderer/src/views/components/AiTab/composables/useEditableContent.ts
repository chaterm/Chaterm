import { ref, nextTick, type Ref } from 'vue'
import type { ContentPart, ContextDocRef, ContextPastChatRef, ImageContentPart, ContextCommandRef } from '@shared/WebviewMessage'
import type { ChatOption, DocOption } from '../types'
import { getChipLabel } from '../utils'
import FileTextOutlinedSvg from '@ant-design/icons-svg/es/asn/FileTextOutlined'
import MessageOutlinedSvg from '@ant-design/icons-svg/es/asn/MessageOutlined'

// ============================================================================
// Types
// ============================================================================

type IconNode = { tag: string; attrs?: Record<string, string>; children?: IconNode[] }
type IconDefinitionLike = { icon: IconNode | ((primaryColor: string, secondaryColor: string) => IconNode) }

const CONTEXT_DRAG_HTML_ATTR = 'data-chaterm-context'

export type ContextDragPayload =
  | { contextType: 'doc'; relPath: string; name: string }
  | { contextType: 'chat'; id: string; title: string }
  | {
      contextType: 'host'
      uuid: string
      label: string
      connect: string
      assetType?: string
      isLocalHost?: boolean
      organizationUuid?: string
    }

export const parseContextDragPayload = (dataTransfer: DataTransfer | null): ContextDragPayload | null => {
  if (!dataTransfer) return null

  // Only accept our drag data carried in text/html. This avoids relying on custom MIME types
  // which may not be preserved by some drag-and-drop sources in Chromium/Electron.
  const html = dataTransfer.getData('text/html')
  let payloadRaw = ''
  if (html) {
    const re = new RegExp(`${CONTEXT_DRAG_HTML_ATTR}="([^"]+)"`)
    const m = html.match(re)
    if (m?.[1]) {
      try {
        payloadRaw = decodeURIComponent(m[1])
      } catch {
        payloadRaw = ''
      }
    }
  }

  if (!payloadRaw) return null

  let parsed: unknown = null
  try {
    parsed = JSON.parse(payloadRaw)
  } catch {
    return null
  }

  if (!parsed || typeof parsed !== 'object') return null
  const payload = parsed as Record<string, unknown>
  const contextType = payload.contextType

  if (contextType === 'doc' && typeof payload.relPath === 'string' && typeof payload.name === 'string') {
    return { contextType: 'doc', relPath: payload.relPath, name: payload.name }
  }

  if (contextType === 'chat' && typeof payload.id === 'string' && typeof payload.title === 'string') {
    return { contextType: 'chat', id: payload.id, title: payload.title }
  }

  if (contextType === 'host' && typeof payload.uuid === 'string' && typeof payload.label === 'string' && typeof payload.connect === 'string') {
    return {
      contextType: 'host',
      uuid: payload.uuid,
      label: payload.label,
      connect: payload.connect,
      assetType: typeof payload.assetType === 'string' ? payload.assetType : undefined,
      isLocalHost: typeof payload.isLocalHost === 'boolean' ? payload.isLocalHost : undefined,
      organizationUuid: typeof payload.organizationUuid === 'string' ? payload.organizationUuid : undefined
    }
  }

  return null
}

// ============================================================================
// Composable
// ============================================================================

export interface UseEditableContentOptions {
  editableRef: Ref<HTMLDivElement | null>
  chatInputParts: Ref<ContentPart[]>
  handleSendClick: (type: string) => void
  handleAddContextClick: (triggerEl?: HTMLElement | null, mode?: 'create' | 'edit') => void
  handleShowCommandPopup?: (triggerEl?: HTMLElement | null) => void
  handleChipClick?: (chipType: 'doc' | 'chat' | 'command', ref: ContextDocRef | ContextPastChatRef | ContextCommandRef) => void
}

export function useEditableContent(options: UseEditableContentOptions) {
  const { editableRef, chatInputParts, handleSendClick, handleAddContextClick, handleShowCommandPopup, handleChipClick } = options

  const isEditableEmpty = ref(true)
  const savedSelection = ref<Range | null>(null)
  const isSyncingFromEditable = ref(false)

  /**
   * Get the character immediately before the caret.
   * Some IMEs report a different key (e.g. '/') than the actual inserted character (e.g. '、'),
   * so we must validate the real inserted character before triggering popups.
   */
  const getCharBeforeCaret = (): string | null => {
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0) return null
    const range = selection.getRangeAt(0)
    const editableEl = editableRef.value
    if (!editableEl || !editableEl.contains(range.startContainer)) return null

    const container = range.startContainer
    const offset = range.startOffset

    if (container.nodeType === Node.TEXT_NODE) {
      const text = (container as Text).data
      if (offset <= 0 || offset > text.length) return null
      return text[offset - 1] ?? null
    }

    if (container.nodeType === Node.ELEMENT_NODE) {
      const el = container as Element
      const prevNode = el.childNodes[offset - 1]
      if (!prevNode) return null
      if (prevNode.nodeType === Node.TEXT_NODE) {
        const text = (prevNode as Text).data
        return text.length > 0 ? text[text.length - 1] : null
      }
      const text = (prevNode as HTMLElement).textContent ?? ''
      return text.length > 0 ? text[text.length - 1] : null
    }

    return null
  }

  // ============================================================================
  // Selection Management
  // ============================================================================

  const saveSelection = () => {
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0) return
    const range = selection.getRangeAt(0)
    if (!editableRef.value || !editableRef.value.contains(range.startContainer)) return
    savedSelection.value = range.cloneRange()
  }

  const restoreSelection = () => {
    const selection = window.getSelection()
    if (!selection || !savedSelection.value) return
    selection.removeAllRanges()
    selection.addRange(savedSelection.value)
  }

  const moveCaretToEnd = () => {
    const el = editableRef.value
    if (!el) return

    // In edit mode we want a deterministic caret position after rendering.
    // Using a collapsed range at the end avoids the browser defaulting to the line start.
    el.focus()
    const selection = window.getSelection()
    if (!selection) return

    const range = document.createRange()
    range.selectNodeContents(el)
    range.collapse(false)

    selection.removeAllRanges()
    selection.addRange(range)
    saveSelection()
  }

  // ============================================================================
  // SVG Icon Creation (for chip icons)
  // ============================================================================

  const createSvgElement = (node: IconNode): SVGElement => {
    const el = document.createElementNS('http://www.w3.org/2000/svg', node.tag)
    if (node.attrs) {
      for (const [key, value] of Object.entries(node.attrs)) {
        el.setAttribute(key, value)
      }
    }
    if (node.children) {
      for (const child of node.children) {
        el.appendChild(createSvgElement(child))
      }
    }
    return el
  }

  const createIconSvg = (iconDef: IconDefinitionLike): SVGElement => {
    const iconNode = typeof iconDef.icon === 'function' ? iconDef.icon('currentColor', 'currentColor') : iconDef.icon
    const svg = createSvgElement(iconNode)
    svg.setAttribute('width', '12')
    svg.setAttribute('height', '12')
    svg.setAttribute('fill', 'currentColor')
    svg.setAttribute('aria-hidden', 'true')
    svg.setAttribute('focusable', 'false')
    return svg
  }

  // ============================================================================
  // Chip DOM Element Creation
  // ============================================================================

  const setKbChipAttributes = (chip: HTMLElement, doc: ContextDocRef) => {
    chip.setAttribute('data-abs-path', doc.absPath)
    if (doc.name) {
      chip.setAttribute('data-name', doc.name)
    }
    if (doc.type) {
      chip.setAttribute('data-doc-type', doc.type)
    }
  }

  const setChatChipAttributes = (chip: HTMLElement, chat: ContextPastChatRef) => {
    chip.setAttribute('data-chat-id', chat.taskId)
    if (chat.title) {
      chip.setAttribute('data-title', chat.title)
    }
  }

  const setCommandChipAttributes = (chip: HTMLElement, cmd: ContextCommandRef) => {
    chip.setAttribute('data-command', cmd.command)
    if (cmd.label) {
      chip.setAttribute('data-label', cmd.label)
    }
    if (cmd.path) {
      chip.setAttribute('data-path', cmd.path)
    }
  }

  const createChipElement = (
    chipType: 'doc' | 'chat' | 'command',
    chipRef: ContextDocRef | ContextPastChatRef | ContextCommandRef,
    label: string
  ): HTMLElement => {
    const chip = document.createElement('span')
    chip.className = `mention-chip mention-chip-${chipType}`
    chip.contentEditable = 'false'
    chip.setAttribute('data-chip-type', chipType)
    chip.setAttribute('title', label)

    // Set chip-type-specific data attributes
    if (chipType === 'doc') {
      setKbChipAttributes(chip, chipRef as ContextDocRef)
    } else if (chipType === 'chat') {
      setChatChipAttributes(chip, chipRef as ContextPastChatRef)
    } else if (chipType === 'command') {
      setCommandChipAttributes(chip, chipRef as ContextCommandRef)
    }

    // Create icon element (only for doc and chat chips, command chips display text only)
    if (chipType === 'doc' || chipType === 'chat') {
      const iconSpan = document.createElement('span')
      iconSpan.className = 'mention-icon'
      const iconSvg = createIconSvg(chipType === 'doc' ? FileTextOutlinedSvg : MessageOutlinedSvg)
      iconSpan.appendChild(iconSvg)
      chip.appendChild(iconSpan)
    }

    // Create label element
    const labelSpan = document.createElement('span')
    labelSpan.className = 'mention-label'
    labelSpan.textContent = label

    // Create remove button
    const removeBtn = document.createElement('span')
    removeBtn.className = 'mention-remove'
    removeBtn.setAttribute('data-mention-remove', 'true')
    removeBtn.textContent = '×'

    chip.appendChild(labelSpan)
    chip.appendChild(removeBtn)
    return chip
  }

  // ============================================================================
  // Image Element Creation
  // ============================================================================

  const createImageElement = (imagePart: ImageContentPart): HTMLElement => {
    const wrapper = document.createElement('span')
    wrapper.className = 'image-preview-wrapper'
    wrapper.contentEditable = 'false'
    wrapper.setAttribute('data-image-type', 'true')
    wrapper.setAttribute('data-media-type', imagePart.mediaType)
    wrapper.setAttribute('data-image-data', imagePart.data)

    const img = document.createElement('img')
    img.src = `data:${imagePart.mediaType};base64,${imagePart.data}`
    img.className = 'image-preview-thumbnail'
    img.alt = 'Uploaded image'

    // Create remove button
    const removeBtn = document.createElement('span')
    removeBtn.className = 'image-remove'
    removeBtn.setAttribute('data-image-remove', 'true')
    removeBtn.textContent = '×'

    wrapper.appendChild(img)
    wrapper.appendChild(removeBtn)
    return wrapper
  }

  const parseImageElement = (el: HTMLElement): ImageContentPart | null => {
    const mediaType = el.dataset.mediaType as ImageContentPart['mediaType']
    const data = el.dataset.imageData
    if (!mediaType || !data) return null
    return { type: 'image', mediaType, data }
  }

  // ============================================================================
  // Content Extraction
  // ============================================================================

  const parseTextNode = (node: Node, parts: ContentPart[]) => {
    const text = node.textContent ?? ''
    if (text) {
      parts.push({ type: 'text', text })
    }
  }

  const parseKbChipElement = (el: HTMLElement): ContextDocRef => {
    return {
      absPath: el.dataset.absPath || '',
      name: el.dataset.name || undefined,
      type: (el.dataset.docType as 'file' | 'dir' | undefined) || undefined
    }
  }

  const parseChatChipElement = (el: HTMLElement): ContextPastChatRef => {
    return {
      taskId: el.dataset.chatId || '',
      title: el.dataset.title || undefined
    }
  }

  const parseCommandChipElement = (el: HTMLElement): ContextCommandRef => {
    return {
      command: el.dataset.command || '',
      label: el.dataset.label || undefined,
      path: el.dataset.path || undefined
    }
  }

  const parseChipElement = (el: HTMLElement, parts: ContentPart[]) => {
    if (el.dataset.chipType === 'doc') {
      parts.push({ type: 'chip', chipType: 'doc', ref: parseKbChipElement(el) })
    } else if (el.dataset.chipType === 'chat') {
      parts.push({ type: 'chip', chipType: 'chat', ref: parseChatChipElement(el) })
    } else if (el.dataset.chipType === 'command') {
      parts.push({ type: 'chip', chipType: 'command', ref: parseCommandChipElement(el) })
    }
  }

  const walkNode = (node: Node, parts: ContentPart[]) => {
    if (node.nodeType === Node.TEXT_NODE) {
      parseTextNode(node, parts)
      return
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return
    const el = node as HTMLElement

    if (el.dataset?.chipType) {
      parseChipElement(el, parts)
      return
    }

    // Handle image elements
    if (el.dataset?.imageType) {
      const imagePart = parseImageElement(el)
      if (imagePart) {
        parts.push(imagePart)
      }
      return
    }

    if (el.tagName === 'BR') {
      parts.push({ type: 'text', text: '\n' })
      return
    }

    for (const child of Array.from(node.childNodes)) {
      walkNode(child, parts)
    }
  }

  const extractContentParts = (): ContentPart[] => {
    const parts: ContentPart[] = []
    if (!editableRef.value) return parts

    for (const child of Array.from(editableRef.value.childNodes)) {
      walkNode(child, parts)
    }
    return parts
  }

  const extractPlainTextFromParts = (parts: ContentPart[]): string => {
    return parts
      .filter((part): part is ContentPart & { type: 'text' } => part.type === 'text')
      .map((part) => part.text)
      .join('')
  }

  // ============================================================================
  // State Management
  // ============================================================================

  const updateEditableEmptyState = (parts: ContentPart[]) => {
    isEditableEmpty.value = parts.length === 0 || parts.every((part) => part.type === 'text' && part.text.trim() === '')
  }

  // ============================================================================
  // Content Rendering
  // ============================================================================

  const renderFromParts = (parts: ContentPart[]) => {
    if (!editableRef.value) return

    const container = document.createElement('p')
    container.className = 'editable-line'

    for (const part of parts) {
      if (part.type === 'text') {
        container.appendChild(document.createTextNode(part.text))
      } else if (part.type === 'image') {
        const imageEl = createImageElement(part)
        container.appendChild(imageEl)
        container.appendChild(document.createTextNode(' '))
      } else {
        const label = getChipLabel(part)
        const chip = createChipElement(part.chipType, part.ref, label)
        container.appendChild(chip)
        container.appendChild(document.createTextNode(' '))
      }
    }

    editableRef.value.replaceChildren(container)
    updateEditableEmptyState(parts)
  }

  // ============================================================================
  // Sync & Insertion
  // ============================================================================

  const syncDraftPartsFromEditable = () => {
    const parts = extractContentParts()
    chatInputParts.value = parts
    updateEditableEmptyState(parts)

    // Clean up residual DOM elements (e.g. <br>, empty <p>) and chatInputParts when content is empty.
    // This prevents the cursor from appearing below the placeholder after select-all delete,
    // and also prevents residual newlines from being preserved in chatInputParts.
    if (isEditableEmpty.value) {
      if (editableRef.value) {
        editableRef.value.innerHTML = ''
      }
      chatInputParts.value = []
    }

    isSyncingFromEditable.value = true
    nextTick(() => {
      isSyncingFromEditable.value = false
    })
  }

  const removeAtSymbolBeforeCursor = (range: Range) => {
    if (range.startContainer.nodeType !== Node.TEXT_NODE) return

    const textNode = range.startContainer as Text
    const offset = range.startOffset
    if (offset > 0 && textNode.data[offset - 1] === '@') {
      textNode.data = textNode.data.slice(0, offset - 1) + textNode.data.slice(offset)
      range.setStart(textNode, offset - 1)
      range.collapse(true)
    }
  }

  const buildChipRef = (chipType: 'doc' | 'chat', ref: DocOption | ChatOption): ContextDocRef | ContextPastChatRef => {
    if (chipType === 'doc') {
      const doc = ref as DocOption
      return { absPath: doc.absPath, name: doc.name, type: doc.type }
    }
    const chat = ref as ChatOption
    return { taskId: chat.id, title: chat.title }
  }

  const getEditableRange = (): Range | null => {
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0) return null
    const range = selection.getRangeAt(0)
    if (!editableRef.value || !editableRef.value.contains(range.startContainer)) return null
    return range
  }

  const insertChipAtCursor = (chipType: 'doc' | 'chat', ref: DocOption | ChatOption, label: string) => {
    if (!editableRef.value) return
    restoreSelection()

    let range = getEditableRange()
    if (!range) {
      // Ensure a deterministic fallback when selection is missing (mouse path).
      moveCaretToEnd()
      range = getEditableRange()
    }
    if (!range) return

    const selection = window.getSelection()
    if (!selection) return
    removeAtSymbolBeforeCursor(range)

    const chipRef = buildChipRef(chipType, ref)
    const chip = createChipElement(chipType, chipRef, label)
    range.deleteContents()
    range.insertNode(chip)

    // Add spacer after chip and move cursor after it
    const spacer = document.createTextNode(' ')
    chip.after(spacer)

    const newRange = document.createRange()
    newRange.setStart(spacer, 1)
    newRange.collapse(true)
    selection.removeAllRanges()
    selection.addRange(newRange)

    saveSelection()
    syncDraftPartsFromEditable()
  }

  const insertImageAtCursor = (imagePart: ImageContentPart) => {
    if (!editableRef.value) return
    restoreSelection()

    let range = getEditableRange()
    if (!range) {
      moveCaretToEnd()
      range = getEditableRange()
    }
    if (!range) return

    const selection = window.getSelection()
    if (!selection) return

    const imageEl = createImageElement(imagePart)
    range.deleteContents()
    range.insertNode(imageEl)

    // Add spacer after image and move cursor after it
    const spacer = document.createTextNode(' ')
    imageEl.after(spacer)

    const newRange = document.createRange()
    newRange.setStart(spacer, 1)
    newRange.collapse(true)
    selection.removeAllRanges()
    selection.addRange(newRange)

    saveSelection()
    syncDraftPartsFromEditable()
  }

  /**
   * Insert a command chip (slash command) at the current cursor position.
   * @param command - The slash command string (e.g., '/summary-to-doc')
   * @param label - Display label for the chip
   */
  const insertCommandChip = (command: string, label: string) => {
    if (!editableRef.value) return
    restoreSelection()

    let range = getEditableRange()
    if (!range) {
      moveCaretToEnd()
      range = getEditableRange()
    }
    if (!range) return

    const selection = window.getSelection()
    if (!selection) return

    const chipRef: ContextCommandRef = { command, label }
    const chip = createChipElement('command', chipRef, label)
    range.deleteContents()
    range.insertNode(chip)

    // Add spacer after chip and move cursor after it
    const spacer = document.createTextNode(' ')
    chip.after(spacer)

    const newRange = document.createRange()
    newRange.setStart(spacer, 1)
    newRange.collapse(true)
    selection.removeAllRanges()
    selection.addRange(newRange)

    saveSelection()
    syncDraftPartsFromEditable()
  }

  /**
   * Insert a command chip with path (from knowledge base) at the current cursor position.
   * @param command - The slash command string (e.g., '/my-command')
   * @param label - Display label for the chip
   * @param path - Absolute path to the command file in knowledge base
   */
  const insertCommandChipWithPath = (command: string, label: string, path: string) => {
    if (!editableRef.value) return
    restoreSelection()

    let range = getEditableRange()
    if (!range) {
      moveCaretToEnd()
      range = getEditableRange()
    }
    if (!range) return

    const selection = window.getSelection()
    if (!selection) return

    // Remove trailing slash before cursor if present
    removeSlashBeforeCursor(range)

    const chipRef: ContextCommandRef = { command, label, path }
    const chip = createChipElement('command', chipRef, label)
    range.deleteContents()
    range.insertNode(chip)

    // Add spacer after chip and move cursor after it
    const spacer = document.createTextNode(' ')
    chip.after(spacer)

    const newRange = document.createRange()
    newRange.setStart(spacer, 1)
    newRange.collapse(true)
    selection.removeAllRanges()
    selection.addRange(newRange)

    saveSelection()
    syncDraftPartsFromEditable()
  }

  /**
   * Remove slash character before cursor position.
   */
  const removeSlashBeforeCursor = (range: Range) => {
    if (range.startContainer.nodeType !== Node.TEXT_NODE) return

    const textNode = range.startContainer as Text
    const offset = range.startOffset
    if (offset > 0 && textNode.data[offset - 1] === '/') {
      textNode.data = textNode.data.slice(0, offset - 1) + textNode.data.slice(offset)
      range.setStart(textNode, offset - 1)
      range.collapse(true)
    }
  }

  // New: Wrapper for handleInputChange to pass mode
  const handleEditableKeyDown = (e: KeyboardEvent, mode: 'create' | 'edit' = 'create') => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault()
      handleSendClick('send')
      return
    }

    if (e.key === '@' && !e.isComposing) {
      // Use setTimeout (macrotask) instead of nextTick (microtask)
      // so '@' is inserted into editable first, then focus switches to search input
      setTimeout(() => {
        saveSelection()
        handleAddContextClick(editableRef.value, mode)
      }, 0)
    }

    // Trigger command popup when '/' is pressed
    if (e.key === '/' && !e.isComposing && handleShowCommandPopup) {
      setTimeout(() => {
        // Only open when actual '/' was inserted (IME may insert '、' etc. for the same key).
        if (getCharBeforeCaret() !== '/') return
        saveSelection()
        handleShowCommandPopup(editableRef.value)
      }, 0)
    }
  }

  const handleEditableInput = () => {
    syncDraftPartsFromEditable()
  }

  const handleEditableClick = (e: MouseEvent) => {
    const target = e.target as HTMLElement
    if (target?.dataset?.mentionRemove) {
      const chip = target.closest('.mention-chip')
      if (chip) {
        chip.remove()
        syncDraftPartsFromEditable()
      }
      return
    }

    // Handle image removal
    if (target?.dataset?.imageRemove) {
      const wrapper = target.closest('.image-preview-wrapper')
      if (wrapper) {
        wrapper.remove()
        syncDraftPartsFromEditable()
      }
      return
    }

    const chip = target?.closest('.mention-chip') as HTMLElement | null
    if (!chip) return

    if (chip.dataset.chipType === 'doc') {
      handleChipClick?.('doc', parseKbChipElement(chip))
      return
    }
    if (chip.dataset.chipType === 'chat') {
      handleChipClick?.('chat', parseChatChipElement(chip))
      return
    }
    if (chip.dataset.chipType === 'command') {
      handleChipClick?.('command', parseCommandChipElement(chip))
    }
  }

  return {
    // State
    isEditableEmpty,
    savedSelection,
    isSyncingFromEditable,

    // Selection management
    saveSelection,
    restoreSelection,
    moveCaretToEnd,

    // Content extraction
    extractContentParts,
    extractPlainTextFromParts,

    // State management
    updateEditableEmptyState,

    // Rendering
    renderFromParts,

    // Sync & insertion
    syncDraftPartsFromEditable,
    insertChipAtCursor,
    insertImageAtCursor,
    insertCommandChip,
    insertCommandChipWithPath,

    // DOM creation (exposed for potential external use)
    createChipElement,
    createImageElement,
    handleEditableKeyDown,
    handleEditableInput,
    handleEditableClick
  }
}
