import { notification } from 'ant-design-vue'
import type { Ref } from 'vue'
import eventBus from '@/utils/eventBus'
import type { MessageContent, AssetInfo } from '../types'
import { useSessionState } from './useSessionState'
import i18n from '@/locales'

interface CommandInteractionOptions {
  getCurentTabAssetInfo: () => Promise<AssetInfo | null>
  markdownRendererRefs: Ref<any[]>
  currentTodos: Ref<any[]>
  clearTodoState: (chatHistory: any[]) => void
}

/**
 * 命令交互的 composable
 * 负责处理命令的批准、拒绝、应用、复制等操作
 */
export function useCommandInteraction(params: CommandInteractionOptions) {
  const { t } = i18n.global

  const { currentSession, attachTabContext, currentChatId, chatTypeValue, hosts, filteredChatHistory } = useSessionState()

  const handleMessageOperation = async (operation: 'copy' | 'apply') => {
    const session = currentSession.value
    if (!session) return

    const lastMessage = session.chatHistory.at(-1)
    if (!lastMessage) {
      notification.error({
        message: t('ai.operationFailed'),
        description: t('ai.noOperableMessage'),
        duration: 2,
        placement: 'topRight'
      })
      return
    }

    let content = ''
    if (typeof lastMessage.content === 'string') {
      content = lastMessage.content
    } else if (lastMessage.content && 'question' in lastMessage.content) {
      content = (lastMessage.content as MessageContent).question || ''
    }

    lastMessage.actioned = true

    if (operation === 'apply' && content) {
      lastMessage.executedCommand = content
    }

    if (chatTypeValue.value === 'cmd' && hosts.value.length > 0) {
      const targetHost = hosts.value[0]
      const currentAssetInfo = await params.getCurentTabAssetInfo()

      if (!currentAssetInfo || currentAssetInfo.ip !== targetHost.host) {
        notification.warning({
          message: t('ai.cannotExecuteCommand'),
          description: t('ai.wrongServerWindow', {
            targetServer: targetHost.host,
            currentWindow: currentAssetInfo?.ip || t('ai.nonTerminalWindow')
          }),
          duration: 5,
          placement: 'topRight'
        })
        return
      }
    }

    if (operation === 'copy') {
      eventBus.emit('executeTerminalCommand', {
        command: content,
        tabId: currentChatId.value ?? undefined
      })
    } else if (operation === 'apply') {
      eventBus.emit('executeTerminalCommand', {
        command: content + '\n',
        tabId: currentChatId.value ?? undefined
      })
      session.responseLoading = true
    }

    session.lastChatMessageId = ''
  }

  const handleApplyCommand = () => handleMessageOperation('apply')

  const handleCopyContent = () => handleMessageOperation('copy')

  const handleRejectContent = async (): Promise<void> => {
    const session = currentSession.value
    if (!session) return

    const message = session.chatHistory.at(-1)
    if (!message) {
      return
    }

    try {
      let messageRsp = {
        type: 'askResponse',
        askResponse: 'noButtonClicked',
        text: ''
      }

      switch (message.ask) {
        case 'followup':
          messageRsp.askResponse = 'messageResponse'
          messageRsp.text =
            typeof message.content === 'object' && 'options' in message.content ? (message.content as MessageContent).options?.[1] || '' : ''
          break
        case 'api_req_failed':
        case 'ssh_con_failed':
          messageRsp.askResponse = 'noButtonClicked'
          break
        case 'completion_result':
          messageRsp.askResponse = 'messageResponse'
          messageRsp.text = 'Task completed failed.'
          break
        case 'auto_approval_max_req_reached':
          messageRsp.askResponse = 'noButtonClicked'
          break
        case 'mcp_tool_call':
          messageRsp.askResponse = 'noButtonClicked'
          break
      }

      message.action = 'rejected'
      console.log('Send message to main process:', messageRsp)
      const response = await window.api.sendToMain(attachTabContext(messageRsp))
      session.buttonsDisabled = true
      console.log('Main process response:', response)
      session.responseLoading = true
    } catch (error) {
      console.error('Failed to send message to main process:', error)
    }
  }

  const handleApproveCommand = async (): Promise<void> => {
    const session = currentSession.value
    if (!session) return

    const message = session.chatHistory.at(-1)
    if (!message) {
      return
    }

    try {
      let messageRsp = {
        type: 'askResponse',
        askResponse: 'yesButtonClicked',
        text: ''
      }

      switch (message.ask) {
        case 'followup':
          messageRsp.askResponse = 'messageResponse'
          messageRsp.text =
            typeof message.content === 'object' && 'options' in message.content ? (message.content as MessageContent).options?.[0] || '' : ''
          break
        case 'api_req_failed':
        case 'ssh_con_failed':
          messageRsp.askResponse = 'yesButtonClicked'
          break
        case 'completion_result':
          messageRsp.askResponse = 'messageResponse'
          messageRsp.text = 'Task completed successfully.'
          break
        case 'auto_approval_max_req_reached':
          messageRsp.askResponse = 'yesButtonClicked'
          break
        case 'mcp_tool_call':
          messageRsp.askResponse = 'yesButtonClicked'
          break
      }

      message.action = 'approved'

      if (message.ask === 'command') {
        session.isExecutingCommand = true
      }

      console.log('Send message to main process:', messageRsp)
      const response = await window.api.sendToMain(attachTabContext(messageRsp))
      session.buttonsDisabled = true
      console.log('Main process response:', response)
      session.responseLoading = true
    } catch (error) {
      console.error('Failed to send message to main process:', error)
    }
  }

  /**
   * 批准并设置自动批准（用于 MCP 工具调用）
   */
  const handleApproveAndAutoApprove = async (): Promise<void> => {
    const session = currentSession.value
    if (!session) return

    const message = session.chatHistory.at(-1)
    if (!message) {
      return
    }

    if (message.ask !== 'mcp_tool_call' || !message.mcpToolCall) {
      return
    }

    try {
      const { serverName, toolName } = message.mcpToolCall

      await window.api.setMcpToolAutoApprove(serverName, toolName, true)
      console.log(`Set auto-approve for ${serverName}/${toolName}`)

      let messageRsp = {
        type: 'askResponse',
        askResponse: 'yesButtonClicked',
        text: ''
      }
      message.action = 'approved'

      console.log('Send message to main process:', messageRsp)
      const response = await window.api.sendToMain(attachTabContext(messageRsp))
      session.buttonsDisabled = true
      console.log('Main process response:', response)
      session.responseLoading = true
    } catch (error) {
      console.error('Failed to approve and set auto-approve:', error)
    }
  }

  const handleCancel = async () => {
    console.log('handleCancel: cancel')

    const session = currentSession.value
    if (!session) return

    session.responseLoading = false
    session.showCancelButton = false
    session.showSendButton = true
    session.lastChatMessageId = ''
    const wasExecutingCommand = session.isExecutingCommand
    session.isExecutingCommand = false

    const lastMessageIndex = filteredChatHistory.value.length - 1
    if (lastMessageIndex >= 0 && params.markdownRendererRefs.value[lastMessageIndex]) {
      params.markdownRendererRefs.value[lastMessageIndex].setThinkingLoading(false)
    }

    if (params.currentTodos.value.length > 0) {
      params.clearTodoState(session.chatHistory)
    }

    try {
      if (wasExecutingCommand) {
        window.api
          .gracefulCancelTask(currentChatId.value ?? undefined)
          .then((response) => {
            console.log('Main process graceful cancel response:', response)
          })
          .catch((error) => {
            console.error('Graceful cancel failed:', error)
          })
      } else {
        window.api
          .cancelTask(currentChatId.value ?? undefined)
          .then((response) => {
            console.log('Main process cancel response:', response)
          })
          .catch((error) => {
            console.error('Cancel task failed:', error)
          })
      }
    } catch (error) {
      console.error('Failed to send cancel request:', error)
    }
  }

  const handleResume = async (): Promise<void> => {
    const session = currentSession.value
    if (!session) return

    let message = session.chatHistory.at(-1)
    if (!message) {
      return
    }
    console.log('handleResume: resume')
    const messageRsp = {
      type: 'askResponse',
      askResponse: 'yesButtonClicked'
    }
    console.log('Send message to main process:', messageRsp)
    const response = await window.api.sendToMain(attachTabContext(messageRsp))
    console.log('Main process response:', response)
    session.resumeDisabled = true
    session.responseLoading = true
  }

  const handleRetry = async () => {
    const session = currentSession.value
    if (!session) return

    console.log('handleRetry: retry')
    const messageRsp = {
      type: 'askResponse',
      askResponse: 'yesButtonClicked'
    }
    console.log('Send message to main process:', messageRsp)
    const response = await window.api.sendToMain(attachTabContext(messageRsp))
    console.log('Main process response:', response)
    session.showRetryButton = false
  }

  return {
    handleMessageOperation,
    handleApplyCommand,
    handleCopyContent,
    handleRejectContent,
    handleApproveCommand,
    handleApproveAndAutoApprove,
    handleCancel,
    handleResume,
    handleRetry
  }
}
