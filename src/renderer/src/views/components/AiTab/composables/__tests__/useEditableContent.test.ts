import { describe, it, expect, vi } from 'vitest'
import { ref } from 'vue'
import { parseContextDragPayload, useEditableContent } from '../useEditableContent'
import type { ContentPart, ContextDocRef, ContextPastChatRef } from '@shared/WebviewMessage'
import type { DocOption } from '../../types'

describe('useEditableContent', () => {
  const setup = () => {
    const editableRef = ref<HTMLDivElement | null>(document.createElement('div'))
    const chatInputParts = ref<ContentPart[]>([])
    const handleChipClick = vi.fn<(chipType: 'doc' | 'chat', ref: ContextDocRef | ContextPastChatRef) => void>()

    const api = useEditableContent({
      editableRef,
      chatInputParts,
      handleSendClick: vi.fn(),
      handleAddContextClick: vi.fn(),
      handleChipClick
    })
    return { ...api, editableRef, handleChipClick }
  }

  it('should call handleChipClick for doc chip', () => {
    const { createChipElement, handleEditableClick, handleChipClick } = setup()
    const docRef: ContextDocRef = { absPath: '/kb/docs/a.md', name: 'a.md', type: 'file' }
    const chip = createChipElement('doc', docRef, 'a.md')

    handleEditableClick({ target: chip } as unknown as MouseEvent)

    expect(chip.getAttribute('title')).toBe('a.md')
    expect(handleChipClick).toHaveBeenCalledWith('doc', docRef)
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

  it('should parse doc drag payload', () => {
    const dataTransfer = {
      getData: (type: string) => {
        if (type !== 'application/x-chaterm-context') return ''
        return JSON.stringify({ contextType: 'doc', relPath: 'guide/intro.md', name: 'intro.md' })
      }
    } as unknown as DataTransfer

    expect(parseContextDragPayload(dataTransfer)).toEqual({
      contextType: 'doc',
      relPath: 'guide/intro.md',
      name: 'intro.md'
    })
  })

  it('should parse chat drag payload', () => {
    const dataTransfer = {
      getData: (type: string) => {
        if (type !== 'application/x-chaterm-context') return ''
        return JSON.stringify({ contextType: 'chat', id: 'chat-1', title: 'Chat 1' })
      }
    } as unknown as DataTransfer

    expect(parseContextDragPayload(dataTransfer)).toEqual({
      contextType: 'chat',
      id: 'chat-1',
      title: 'Chat 1'
    })
  })

  it('should parse host drag payload', () => {
    const dataTransfer = {
      getData: (type: string) => {
        if (type !== 'application/x-chaterm-context') return ''
        return JSON.stringify({
          contextType: 'host',
          uuid: 'host-1',
          label: 'server-1',
          connect: '10.0.0.1',
          assetType: 'linux',
          isLocalHost: false,
          organizationUuid: 'org-1'
        })
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

  it('should parse payload from text fallback', () => {
    const dataTransfer = {
      getData: (type: string) => {
        if (type === 'application/x-chaterm-context') return ''
        if (type !== 'text/plain') return ''
        return 'chaterm-context:{"contextType":"chat","id":"chat-2","title":"Chat 2"}'
      }
    } as unknown as DataTransfer

    expect(parseContextDragPayload(dataTransfer)).toEqual({
      contextType: 'chat',
      id: 'chat-2',
      title: 'Chat 2'
    })
  })
})
