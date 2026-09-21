import { nextTick } from 'vue'
import { useSessionState } from './useSessionState'
import { placeCaretAtEnd, appendTextViaEditingPipeline } from '@/utils/domUtils'

/**
 * Focus the chat input and park the caret at its end.
 *
 * Lives here rather than in useTabManagement so that appending text does not
 * pull that module's dependency graph (uuid, Modal, i18n, global state) into
 * every caller. useTabManagement re-exports it for existing importers.
 */
export const focusChatInput = () => {
  const { chatTextareaRef } = useSessionState()

  nextTick(() => {
    const el = (chatTextareaRef.value as unknown as HTMLElement | null) ?? null
    if (!el) return

    el.focus({ preventScroll: true })

    placeCaretAtEnd(el)

    // Keep the visible viewport scrolled to the newest content.
    el.scrollTop = el.scrollHeight
  })
}

/**
 * Append text to the chat input, preferring the editing pipeline so the
 * insertion lands on the native undo stack.
 *
 * Writing to `chatInputParts` instead makes the parts watcher re-render the
 * editable via `replaceChildren`, which the undo stack never sees: Cmd+Z then
 * cannot reach the appended text, nor anything typed before it. The parts
 * write stays as a fallback for the case where the editable is not mounted
 * yet (the AI panel was just opened), where losing the text would be worse
 * than losing undo fidelity.
 *
 * @param text - Text to append
 * @param prefix - Separator inserted when the input is not empty
 * @param suffix - Text appended after `text`
 */
export const appendTextToChatInput = async (text: string, prefix: string = ' ', suffix: string = '') => {
  const { chatTextareaRef, chatInputParts, appendTextToInputParts } = useSessionState()

  // The editable is created when the AI panel mounts, which can be in the same
  // tick as the append. Wait one tick before giving up on the pipeline.
  await nextTick()

  const el = (chatTextareaRef?.value as unknown as HTMLElement | null) ?? null
  if (el) {
    const body = chatInputParts.value.length > 0 ? `${prefix}${text}${suffix}` : `${text}${suffix}`
    if (appendTextViaEditingPipeline(el, body)) {
      // Keep the visible viewport scrolled to the newest content.
      el.scrollTop = el.scrollHeight
      return
    }
  }

  appendTextToInputParts(text, prefix, suffix)
  focusChatInput()
}
