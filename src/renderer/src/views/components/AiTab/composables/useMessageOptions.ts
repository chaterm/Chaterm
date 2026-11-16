import { ref } from 'vue'
import type { ChatMessage } from '../types'
import type { WebviewMessage } from '@shared/WebviewMessage'
import { useSessionState, type SessionState } from './useSessionState'

const logger = createRendererLogger('ai.messageOptions')

/**
 * Composable for follow-up question interaction.
 * A preset option is sent as soon as it is clicked; a custom answer is typed
 * into the input row and sent with Enter (Shift+Enter inserts a newline) or the
 * submit button. The same button reads "skip" while the input is empty.
 */
export function useMessageOptions() {
  const { currentSession, attachTabContext } = useSessionState()

  const messageCustomInputs = ref<Record<string, string>>({})

  const handleCustomInputChange = (message: ChatMessage, value: string) => {
    messageCustomInputs.value[message.id] = value
  }

  const getCustomInput = (message: ChatMessage): string => {
    return messageCustomInputs.value[message.id] || ''
  }

  const hasCustomInput = (message: ChatMessage): boolean => {
    return getCustomInput(message).trim().length > 0
  }

  const isOptionAnswered = (message: ChatMessage): boolean => {
    return !!message.selectedOption || !!message.skipped
  }

  const sendFollowupResponse = async (session: SessionState, message: ChatMessage, askResponse: WebviewMessage['askResponse'], text: string) => {
    try {
      const messageRsp: WebviewMessage = { type: 'askResponse', askResponse, text }
      logger.info('Send message to main process', { data: messageRsp })

      const response = await window.api.sendToMain(attachTabContext(messageRsp))
      logger.info('Main process response', { data: response })

      session.responseLoading = true
    } catch (error) {
      // The answer never reached the agent, so reopen the question
      message.selectedOption = undefined
      message.skipped = undefined
      logger.error('Failed to send message to main process', { error: error })
    }
  }

  const handleOptionChoose = async (message: ChatMessage, option: string) => {
    const session = currentSession.value
    if (!session || isOptionAnswered(message)) return

    message.selectedOption = option
    await sendFollowupResponse(session, message, 'optionResponse', option)
  }

  const handleOptionSubmit = async (message: ChatMessage) => {
    const content = getCustomInput(message).trim()
    if (!content) return

    await handleOptionChoose(message, content)
  }

  const handleOptionSkip = async (message: ChatMessage) => {
    const session = currentSession.value
    if (!session || isOptionAnswered(message)) return

    message.skipped = true
    await sendFollowupResponse(session, message, 'noButtonClicked', '')
  }

  const handleCustomInputKeydown = (message: ChatMessage, e: KeyboardEvent) => {
    if (e.key !== 'Enter' || e.shiftKey || e.isComposing) return

    e.preventDefault()
    handleOptionSubmit(message)
  }

  return {
    messageCustomInputs,
    handleCustomInputChange,
    getCustomInput,
    hasCustomInput,
    isOptionAnswered,
    handleOptionChoose,
    handleOptionSubmit,
    handleOptionSkip,
    handleCustomInputKeydown
  }
}
