import { describe, it, expect, vi } from 'vitest'
import { ref } from 'vue'
import { useEditableContent } from '../useEditableContent'
import type { ContentPart, ContextDocRef, ContextPastChatRef } from '@shared/WebviewMessage'

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
    return { ...api, handleChipClick }
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
})
