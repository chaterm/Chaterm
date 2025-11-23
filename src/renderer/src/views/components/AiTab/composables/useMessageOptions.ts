import { ref } from 'vue'
import type { ChatMessage } from '../types'
import { useSessionState } from './useSessionState'

/**
 * 消息选项交互功能的 composable
 * 负责处理 AI 提供的选项选择和自定义输入
 */
export function useMessageOptions() {
  const { currentSession, attachTabContext } = useSessionState()
  const messageOptionSelections = ref<Record<string, string>>({})

  const messageCustomInputs = ref<Record<string, string>>({})

  const handleOptionSelect = (message: ChatMessage, value: string) => {
    messageOptionSelections.value[message.id] = value
  }

  const getSelectedOption = (message: ChatMessage): string => {
    return messageOptionSelections.value[message.id] || ''
  }

  const handleCustomInputChange = (message: ChatMessage, value: string) => {
    messageCustomInputs.value[message.id] = value
  }

  const getCustomInput = (message: ChatMessage): string => {
    return messageCustomInputs.value[message.id] || ''
  }

  /**
   * 判断是否可以提交选项
   * 规则：
   * 1. 如果选择了预设选项，直接可提交
   * 2. 如果选择了自定义选项，需要检查输入内容不为空
   */
  const canSubmitOption = (message: ChatMessage): boolean => {
    const selected = messageOptionSelections.value[message.id]

    if (!selected) {
      return false
    }

    if (selected !== '__custom__') {
      return true
    }

    const customInput = messageCustomInputs.value[message.id] || ''
    return customInput.trim().length > 0
  }

  const handleOptionChoose = async (message: ChatMessage, option?: string) => {
    const session = currentSession.value
    if (!session) return

    try {
      if (option) {
        message.selectedOption = option
      }
      let messageRsp = {
        type: 'askResponse',
        askResponse: option || 'yesButtonClicked',
        text: ''
      }
      switch (message.ask) {
        case 'followup':
          messageRsp.askResponse = 'messageResponse'
          messageRsp.text = option || ''
          break
      }
      console.log('Send message to main process:', messageRsp)

      const response = await window.api.sendToMain(attachTabContext(messageRsp))
      console.log('Main process response:', response)

      session.responseLoading = true
    } catch (error) {
      console.error('Failed to send message to main process:', error)
    }
  }

  const handleOptionSubmit = async (message: ChatMessage) => {
    const selected = messageOptionSelections.value[message.id]
    if (!selected) {
      return
    }

    const content = selected === '__custom__' ? messageCustomInputs.value[message.id] : selected

    if (!content || content.trim().length === 0) {
      return
    }

    await handleOptionChoose(message, content.trim())
  }

  return {
    messageOptionSelections,
    messageCustomInputs,
    handleOptionSelect,
    getSelectedOption,
    handleCustomInputChange,
    getCustomInput,
    canSubmitOption,
    handleOptionSubmit
  }
}
