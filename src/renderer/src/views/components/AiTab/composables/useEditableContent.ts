import { ref, nextTick, type Ref } from 'vue'
import type { ContentPart, ContextDocRef, ContextPastChatRef } from '@shared/WebviewMessage'
import type { ChatOption, DocOption } from '../types'
import { getChipLabel } from '../utils'
import FileTextOutlinedSvg from '@ant-design/icons-svg/es/asn/FileTextOutlined'
import MessageOutlinedSvg from '@ant-design/icons-svg/es/asn/MessageOutlined'

// ============================================================================
// Types
// ============================================================================

type IconNode = { tag: string; attrs?: Record<string, string>; children?: IconNode[] }
type IconDefinitionLike = { icon: IconNode | ((primaryColor: string, secondaryColor: string) => IconNode) }

export const CONTEXT_DRAG_MIME = 'application/x-chaterm-context'
export const CONTEXT_DRAG_TEXT_PREFIX = 'chaterm-context:'

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

  // Only accept our custom drag data.
  const raw = dataTransfer.getData(CONTEXT_DRAG_MIME)
  const textFallback = dataTransfer.getData('text/plain')
  const payloadRaw = raw || (textFallback.startsWith(CONTEXT_DRAG_TEXT_PREFIX) ? textFallback.slice(CONTEXT_DRAG_TEXT_PREFIX.length) : '')
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
  handleChipClick?: (chipType: 'doc' | 'chat', ref: ContextDocRef | ContextPastChatRef) => void
}

export function useEditableContent(options: UseEditableContentOptions) {
  const { editableRef, chatInputParts, handleSendClick, handleAddContextClick, handleChipClick } = options

  const isEditableEmpty = ref(true)
  const savedSelection = ref<Range | null>(null)
  const isSyncingFromEditable = ref(false)

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

  const createChipElement = (chipType: 'doc' | 'chat', chipRef: ContextDocRef | ContextPastChatRef, label: string): HTMLElement => {
    const chip = document.createElement('span')
    chip.className = `mention-chip mention-chip-${chipType}`
    chip.contentEditable = 'false'
    chip.setAttribute('data-chip-type', chipType)
    chip.setAttribute('title', label)

    // Set chip-type-specific data attributes
    if (chipType === 'doc') {
      setKbChipAttributes(chip, chipRef as ContextDocRef)
    } else {
      setChatChipAttributes(chip, chipRef as ContextPastChatRef)
    }

    // Create icon element
    const iconSpan = document.createElement('span')
    iconSpan.className = 'mention-icon'
    const iconSvg = chipType === 'doc' ? createIconSvg(FileTextOutlinedSvg) : createIconSvg(MessageOutlinedSvg)
    iconSpan.appendChild(iconSvg)

    // Create label element
    const labelSpan = document.createElement('span')
    labelSpan.className = 'mention-label'
    labelSpan.textContent = label

    // Create remove button
    const removeBtn = document.createElement('span')
    removeBtn.className = 'mention-remove'
    removeBtn.setAttribute('data-mention-remove', 'true')
    removeBtn.textContent = '×'

    chip.appendChild(iconSpan)
    chip.appendChild(labelSpan)
    chip.appendChild(removeBtn)
    return chip
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

  const parseChipElement = (el: HTMLElement, parts: ContentPart[]) => {
    if (el.dataset.chipType === 'doc') {
      parts.push({ type: 'chip', chipType: 'doc', ref: parseKbChipElement(el) })
    } else if (el.dataset.chipType === 'chat') {
      parts.push({ type: 'chip', chipType: 'chat', ref: parseChatChipElement(el) })
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

  const insertChipAtCursor = (chipType: 'doc' | 'chat', ref: DocOption | ChatOption, label: string) => {
    if (!editableRef.value) return
    restoreSelection()

    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0) return

    const range = selection.getRangeAt(0)
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
        syncDraftPartsFromEditable()
        handleAddContextClick(editableRef.value, mode)
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

    const chip = target?.closest('.mention-chip') as HTMLElement | null
    if (!chip) return

    if (chip.dataset.chipType === 'doc') {
      handleChipClick?.('doc', parseKbChipElement(chip))
      return
    }
    if (chip.dataset.chipType === 'chat') {
      handleChipClick?.('chat', parseChatChipElement(chip))
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

    // DOM creation (exposed for potential external use)
    createChipElement,
    handleEditableKeyDown,
    handleEditableInput,
    handleEditableClick
  }
}
