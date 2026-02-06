import { describe, it, expect, vi } from 'vitest'
import { ref } from 'vue'
import { parseContextDragPayload, useEditableContent } from '../useEditableContent'
import { getImageMediaType, isImageFile } from '../../utils'
import type { ContentPart, ContextDocRef, ContextPastChatRef, ContextCommandRef } from '@shared/WebviewMessage'
import type { DocOption } from '../../types'

describe('useEditableContent', () => {
  const setup = (opts?: { handleShowCommandPopup?: (triggerEl?: HTMLElement | null) => void }) => {
    const editableRef = ref<HTMLDivElement | null>(document.createElement('div'))
    const chatInputParts = ref<ContentPart[]>([])
    const handleChipClick = vi.fn<(chipType: 'doc' | 'chat' | 'command', ref: ContextDocRef | ContextPastChatRef | ContextCommandRef) => void>()

    const api = useEditableContent({
      editableRef,
      chatInputParts,
      handleSendClick: vi.fn(),
      handleAddContextClick: vi.fn(),
      handleShowCommandPopup: opts?.handleShowCommandPopup,
      handleChipClick
    })
    return { ...api, editableRef, chatInputParts, handleChipClick }
  }

  it('should call handleChipClick for doc chip', () => {
    const { createChipElement, handleEditableClick, handleChipClick } = setup()
    const docRef: ContextDocRef = { absPath: '/kb/docs/a.md', name: 'a.md', type: 'file' }
    const chip = createChipElement('doc', docRef, 'a.md')

    handleEditableClick({ target: chip } as unknown as MouseEvent)

    expect(chip.getAttribute('title')).toBe('a.md')
    expect(handleChipClick).toHaveBeenCalledWith('doc', docRef)
  })

  it('should not send on Enter when blocked', () => {
    const editableRef = ref<HTMLDivElement | null>(document.createElement('div'))
    const chatInputParts = ref<ContentPart[]>([])
    const handleSendClick = vi.fn()

    const api = useEditableContent({
      editableRef,
      chatInputParts,
      handleSendClick,
      handleAddContextClick: vi.fn(),
      shouldBlockEnterSend: () => true
    })

    const preventDefault = vi.fn()
    const event = { key: 'Enter', shiftKey: false, isComposing: false, preventDefault } as unknown as KeyboardEvent

    api.handleEditableKeyDown(event)

    expect(preventDefault).toHaveBeenCalled()
    expect(handleSendClick).not.toHaveBeenCalled()
  })

  it('should call handleChipClick for chat chip', () => {
    const { createChipElement, handleEditableClick, handleChipClick } = setup()
    const chatRef: ContextPastChatRef = { taskId: 'task-1', title: 'Chat 1' }
    const chip = createChipElement('chat', chatRef, 'Chat 1')

    handleEditableClick({ target: chip } as unknown as MouseEvent)

    expect(handleChipClick).toHaveBeenCalledWith('chat', chatRef)
  })

  it('should remove chip when clicking remove button', () => {
    const { createChipElement, handleEditableClick, handleChipClick } = setup()
    const docRef: ContextDocRef = { absPath: '/kb/docs/a.md', name: 'a.md', type: 'file' }
    const chip = createChipElement('doc', docRef, 'a.md')
    const removeBtn = chip.querySelector('.mention-remove') as HTMLElement

    handleEditableClick({ target: removeBtn } as unknown as MouseEvent)

    expect(handleChipClick).not.toHaveBeenCalled()
  })

  it('should insert chip at end when selection is missing', () => {
    const { editableRef, insertChipAtCursor } = setup()
    const el = editableRef.value as HTMLDivElement
    el.textContent = 'hello'
    document.body.appendChild(el)

    window.getSelection()?.removeAllRanges()

    const doc: DocOption = { absPath: '/kb/docs/a.md', name: 'a.md', type: 'file' }
    insertChipAtCursor('doc', doc, doc.name)

    const chip = el.querySelector('.mention-chip') as HTMLElement | null
    expect(chip).not.toBeNull()
    expect(chip?.getAttribute('data-chip-type')).toBe('doc')

    const lastNode = el.lastChild as Text | null
    expect(lastNode?.nodeType).toBe(Node.TEXT_NODE)
    expect(lastNode?.textContent).toBe(' ')
    expect(chip?.nextSibling).toBe(lastNode)

    el.remove()
  })

  it('should insert image at cursor with data attributes', () => {
    const { editableRef, insertImageAtCursor } = setup()
    const el = editableRef.value as HTMLDivElement
    el.textContent = 'hello'
    document.body.appendChild(el)

    window.getSelection()?.removeAllRanges()

    insertImageAtCursor({
      type: 'image',
      mediaType: 'image/png',
      data: 'base64data'
    })

    const imageWrapper = el.querySelector('.image-preview-wrapper') as HTMLElement | null
    expect(imageWrapper).not.toBeNull()
    expect(imageWrapper?.getAttribute('data-image-type')).toBe('true')
    expect(imageWrapper?.getAttribute('data-media-type')).toBe('image/png')
    expect(imageWrapper?.getAttribute('data-image-data')).toBe('base64data')

    el.remove()
  })

  it('should parse doc drag payload from text/html carrier', () => {
    const encoded = encodeURIComponent(JSON.stringify({ contextType: 'doc', relPath: 'guide/intro.md', name: 'intro.md' }))
    const dataTransfer = {
      getData: (type: string) => {
        if (type === 'text/plain') return ''
        if (type === 'text/html') return `<span data-chaterm-context="${encoded}"></span>`
        return ''
      }
    } as unknown as DataTransfer

    expect(parseContextDragPayload(dataTransfer)).toEqual({
      contextType: 'doc',
      relPath: 'guide/intro.md',
      name: 'intro.md'
    })
  })

  it('should parse chat drag payload from text/html carrier', () => {
    const encoded = encodeURIComponent(JSON.stringify({ contextType: 'chat', id: 'chat-1', title: 'Chat 1' }))
    const dataTransfer = {
      getData: (type: string) => {
        if (type === 'text/plain') return ''
        if (type === 'text/html') return `<span data-chaterm-context="${encoded}"></span>`
        return ''
      }
    } as unknown as DataTransfer

    expect(parseContextDragPayload(dataTransfer)).toEqual({
      contextType: 'chat',
      id: 'chat-1',
      title: 'Chat 1'
    })
  })

  it('should parse image drag payload from text/html carrier', () => {
    const encoded = encodeURIComponent(JSON.stringify({ contextType: 'image', relPath: 'images/logo.svg', name: 'logo.svg' }))
    const dataTransfer = {
      getData: (type: string) => {
        if (type === 'text/plain') return ''
        if (type === 'text/html') return `<span data-chaterm-context="${encoded}"></span>`
        return ''
      }
    } as unknown as DataTransfer

    expect(parseContextDragPayload(dataTransfer)).toEqual({
      contextType: 'image',
      relPath: 'images/logo.svg',
      name: 'logo.svg'
    })
  })

  it('should parse host drag payload from text/html carrier', () => {
    const encoded = encodeURIComponent(
      JSON.stringify({
        contextType: 'host',
        uuid: 'host-1',
        label: 'server-1',
        connect: '10.0.0.1',
        assetType: 'linux',
        isLocalHost: false,
        organizationUuid: 'org-1'
      })
    )
    const dataTransfer = {
      getData: (type: string) => {
        if (type === 'text/plain') return ''
        if (type === 'text/html') return `<span data-chaterm-context="${encoded}"></span>`
        return ''
      }
    } as unknown as DataTransfer

    expect(parseContextDragPayload(dataTransfer)).toEqual({
      contextType: 'host',
      uuid: 'host-1',
      label: 'server-1',
      connect: '10.0.0.1',
      assetType: 'linux',
      isLocalHost: false,
      organizationUuid: 'org-1'
    })
  })

  it('should ignore non-context drag payload', () => {
    const dataTransfer = {
      getData: () => ''
    } as unknown as DataTransfer

    expect(parseContextDragPayload(dataTransfer)).toBeNull()
  })

  it('should parse context drag payload from text/html carrier', () => {
    const encoded = encodeURIComponent(JSON.stringify({ contextType: 'doc', relPath: 'mysql.md', name: 'mysql.md' }))
    const dataTransfer = {
      getData: (type: string) => {
        if (type === 'text/plain') return ''
        if (type === 'text/html') return `<span data-chaterm-context="${encoded}"></span>`
        return ''
      }
    } as unknown as DataTransfer

    expect(parseContextDragPayload(dataTransfer)).toEqual({
      contextType: 'doc',
      relPath: 'mysql.md',
      name: 'mysql.md'
    })
  })

  it('should recognize bmp and svg images for knowledge base actions', () => {
    expect(isImageFile('images/photo.bmp')).toBe(true)
    expect(isImageFile('icons/logo.svg')).toBe(true)
    expect(getImageMediaType('images/photo.bmp')).toBe('image/bmp')
    expect(getImageMediaType('icons/logo.svg')).toBe('image/svg+xml')
  })

  describe('command chip with path', () => {
    it('should create command chip with path attribute', () => {
      const { createChipElement } = setup()
      const cmdRef: ContextCommandRef = {
        command: '/my-command',
        label: 'My Command',
        path: '/path/to/commands/my-command.md'
      }
      const chip = createChipElement('command', cmdRef, 'My Command')

      expect(chip.getAttribute('data-chip-type')).toBe('command')
      expect(chip.getAttribute('data-command')).toBe('/my-command')
      expect(chip.getAttribute('data-label')).toBe('My Command')
      expect(chip.getAttribute('data-path')).toBe('/path/to/commands/my-command.md')
    })

    it('should create command chip without path when not provided', () => {
      const { createChipElement } = setup()
      const cmdRef: ContextCommandRef = {
        command: '/summary-to-doc',
        label: 'Summary to Doc'
      }
      const chip = createChipElement('command', cmdRef, 'Summary to Doc')

      expect(chip.getAttribute('data-chip-type')).toBe('command')
      expect(chip.getAttribute('data-command')).toBe('/summary-to-doc')
      expect(chip.getAttribute('data-label')).toBe('Summary to Doc')
      expect(chip.getAttribute('data-path')).toBeNull()
    })

    it('should parse command chip element with path', () => {
      const { createChipElement, editableRef, chatInputParts, syncDraftPartsFromEditable } = setup()
      const el = editableRef.value as HTMLDivElement
      document.body.appendChild(el)

      const cmdRef: ContextCommandRef = {
        command: '/custom-cmd',
        label: 'Custom Command',
        path: '/kb/commands/custom.md'
      }
      const chip = createChipElement('command', cmdRef, 'Custom Command')
      el.appendChild(chip)

      syncDraftPartsFromEditable()

      expect(chatInputParts.value).toHaveLength(1)
      expect(chatInputParts.value[0]).toEqual({
        type: 'chip',
        chipType: 'command',
        ref: {
          command: '/custom-cmd',
          label: 'Custom Command',
          path: '/kb/commands/custom.md'
        }
      })

      el.remove()
    })

    it('should insert command chip with path using insertCommandChipWithPath', () => {
      const { editableRef, chatInputParts, insertCommandChipWithPath } = setup()
      const el = editableRef.value as HTMLDivElement
      el.textContent = ''
      document.body.appendChild(el)

      window.getSelection()?.removeAllRanges()

      insertCommandChipWithPath('/test-cmd', 'Test Command', '/kb/commands/test.md')

      const chip = el.querySelector('.mention-chip') as HTMLElement | null
      expect(chip).not.toBeNull()
      expect(chip?.getAttribute('data-chip-type')).toBe('command')
      expect(chip?.getAttribute('data-command')).toBe('/test-cmd')
      expect(chip?.getAttribute('data-path')).toBe('/kb/commands/test.md')

      // chatInputParts includes chip + trailing spacer text
      expect(chatInputParts.value.length).toBeGreaterThanOrEqual(1)
      const chipPart = chatInputParts.value.find((p) => p.type === 'chip')
      expect(chipPart).toMatchObject({
        type: 'chip',
        chipType: 'command',
        ref: {
          command: '/test-cmd',
          label: 'Test Command',
          path: '/kb/commands/test.md'
        }
      })

      el.remove()
    })
  })

  describe('command popup trigger with IME', () => {
    it('should open command popup only when actual "/" is inserted', () => {
      vi.useFakeTimers()

      const handleShowCommandPopup = vi.fn()
      const { editableRef, handleEditableKeyDown } = setup({ handleShowCommandPopup })
      const el = editableRef.value as HTMLDivElement
      document.body.appendChild(el)
      el.textContent = 'hello'

      const textNode = el.firstChild as Text
      const range = document.createRange()
      range.setStart(textNode, textNode.data.length)
      range.collapse(true)
      const selection = window.getSelection()
      selection?.removeAllRanges()
      selection?.addRange(range)

      // Keydown reports '/', then browser inserts '/' before the scheduled handler runs.
      handleEditableKeyDown({ key: '/', shiftKey: false, isComposing: false } as unknown as KeyboardEvent, 'create')
      textNode.data = 'hello/'
      range.setStart(textNode, textNode.data.length)
      range.collapse(true)
      selection?.removeAllRanges()
      selection?.addRange(range)

      vi.runAllTimers()
      expect(handleShowCommandPopup).toHaveBeenCalledTimes(1)

      el.remove()
      vi.useRealTimers()
    })

    it('should not open command popup when IME inserts "、" for "/" key', () => {
      vi.useFakeTimers()

      const handleShowCommandPopup = vi.fn()
      const { editableRef, handleEditableKeyDown } = setup({ handleShowCommandPopup })
      const el = editableRef.value as HTMLDivElement
      document.body.appendChild(el)
      el.textContent = '中文'

      const textNode = el.firstChild as Text
      const range = document.createRange()
      range.setStart(textNode, textNode.data.length)
      range.collapse(true)
      const selection = window.getSelection()
      selection?.removeAllRanges()
      selection?.addRange(range)

      // Keydown reports '/', but the IME inserts '、' before the scheduled handler runs.
      handleEditableKeyDown({ key: '/', shiftKey: false, isComposing: false } as unknown as KeyboardEvent, 'create')
      textNode.data = '中文、'
      range.setStart(textNode, textNode.data.length)
      range.collapse(true)
      selection?.removeAllRanges()
      selection?.addRange(range)

      vi.runAllTimers()
      expect(handleShowCommandPopup).not.toHaveBeenCalled()

      el.remove()
      vi.useRealTimers()
    })
  })
})
