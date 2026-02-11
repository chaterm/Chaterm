import { notification } from 'ant-design-vue'
import type { Ref } from 'vue'
import eventBus from '@/utils/eventBus'
import type { MessageContent, AssetInfo } from '../types'
import type { WebviewMessage } from '@shared/WebviewMessage'
import { useSessionState } from './useSessionState'
import i18n from '@/locales'

const logger = createRendererLogger('ai.commandInteraction')

interface CommandInteractionOptions {
  getCurentTabAssetInfo: () => Promise<AssetInfo | null>
  markdownRendererRefs: Ref<any[]>
  currentTodos: Ref<any[]>
  clearTodoState: (chatHistory: any[]) => void
  scrollToBottom: (force?: boolean) => void
}

/**
 * Composable for command interaction
 * Handles command approval, rejection, application, copying and other operations
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
      let messageRsp: WebviewMessage = {
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
      logger.info('Send message to main process', { data: messageRsp })
      const response = await window.api.sendToMain(attachTabContext(messageRsp))
      session.buttonsDisabled = true
      logger.info('Main process response', { data: response })
      session.responseLoading = true
      params.scrollToBottom(true)
    } catch (error) {
      logger.error('Failed to send message to main process', { error: error instanceof Error ? error.message : String(error) })
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
      let messageRsp: WebviewMessage = {
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

      logger.info('Send message to main process', { data: messageRsp })
      const response = await window.api.sendToMain(attachTabContext(messageRsp))
      session.buttonsDisabled = true
      logger.info('Main process response', { data: response })
      session.responseLoading = true
      params.scrollToBottom(true)
    } catch (error) {
      logger.error('Failed to send message to main process', { error: error instanceof Error ? error.message : String(error) })
    }
  }

  /**
   * Approve command and enable session-level auto-approval for read-only commands
   * After clicking this button, subsequent read-only commands (requires_approval=false) will be auto-executed
   */
  const handleApproveAndAutoApproveReadOnly = async (): Promise<void> => {
    const session = currentSession.value
    if (!session) return

    const message = session.chatHistory.at(-1)
    if (!message) {
      return
    }

    if (message.ask !== 'command') {
      return
    }

    try {
      let messageRsp: WebviewMessage = {
        type: 'askResponse',
        askResponse: 'autoApproveReadOnlyClicked',
        text: ''
      }

      message.action = 'approved'
      session.isExecutingCommand = true

      logger.info('Send message to main process (auto-approve read-only)', { data: messageRsp })
      const response = await window.api.sendToMain(attachTabContext(messageRsp))
      session.buttonsDisabled = true
      logger.info('Main process response', { data: response })
      session.responseLoading = true
      params.scrollToBottom(true)
    } catch (error) {
      logger.error('Failed to approve and enable read-only auto-approval', { error: error instanceof Error ? error.message : String(error) })
    }
  }

  /**
   * Approve and set auto-approval (for MCP tool calls)
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
      logger.info(`Set auto-approve for ${serverName}/${toolName}`)

      let messageRsp: WebviewMessage = {
        type: 'askResponse',
        askResponse: 'yesButtonClicked',
        text: ''
      }
      message.action = 'approved'

      logger.info('Send message to main process', { data: messageRsp })
      const response = await window.api.sendToMain(attachTabContext(messageRsp))
      session.buttonsDisabled = true
      logger.info('Main process response', { data: response })
      session.responseLoading = true
      params.scrollToBottom(true)
    } catch (error) {
      logger.error('Failed to approve and set auto-approve', { error: error instanceof Error ? error.message : String(error) })
    }
  }

  const handleCancel = async (mode: 'auto' | 'force' = 'auto') => {
    logger.info('handleCancel: cancel')

    const session = currentSession.value
    if (!session) return

    session.responseLoading = false
    session.showSendButton = true
    session.lastChatMessageId = ''
    const wasExecutingCommand = session.isExecutingCommand
    session.isExecutingCommand = false
    session.isCancelled = true

    const lastMessageIndex = filteredChatHistory.value.length - 1
    if (lastMessageIndex >= 0 && params.markdownRendererRefs.value[lastMessageIndex]) {
      params.markdownRendererRefs.value[lastMessageIndex].setThinkingLoading(false)
    }

    if (params.currentTodos.value.length > 0) {
      params.clearTodoState(session.chatHistory)
    }

    try {
      if (wasExecutingCommand && mode !== 'force') {
        const response = await window.api.gracefulCancelTask(currentChatId.value ?? undefined)
        logger.info('Main process graceful cancel response', { data: response })
        return
      }

      const response = await window.api.cancelTask(currentChatId.value ?? undefined)
      logger.info('Main process cancel response', { data: response })
    } catch (error) {
      logger.error('Failed to send cancel request', { error: error instanceof Error ? error.message : String(error) })
    }
  }

  const handleRetry = async () => {
    const session = currentSession.value
    if (!session) return

    logger.info('handleRetry: retry')
    session.isCancelled = false
    const messageRsp: WebviewMessage = {
      type: 'askResponse',
      askResponse: 'yesButtonClicked'
    }
    logger.info('Send message to main process', { data: messageRsp })
    const response = await window.api.sendToMain(attachTabContext(messageRsp))
    logger.info('Main process response', { data: response })
    session.showRetryButton = false
  }

  return {
    handleMessageOperation,
    handleApplyCommand,
    handleCopyContent,
    handleRejectContent,
    handleApproveCommand,
    handleApproveAndAutoApproveReadOnly,
    handleApproveAndAutoApprove,
    handleCancel,
    handleRetry
  }
}
