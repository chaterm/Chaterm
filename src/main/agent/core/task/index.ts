import { Anthropic } from '@anthropic-ai/sdk'
import cloneDeep from 'clone-deep'
// import { setTimeout as setTimeoutPromise } from 'node:timers/promises'
import os from 'os'
import { v4 as uuidv4 } from 'uuid'
import { telemetryService } from '@services/telemetry/TelemetryService'
import pWaitFor from 'p-wait-for'
import { serializeError } from 'serialize-error'
import { ApiHandler, buildApiHandler } from '@api/index'
import { ApiStream } from '@api/transform/stream'
import { formatContentBlockToMarkdown } from '@integrations/misc/export-markdown'
import { showSystemNotification } from '@integrations/notifications'
import { ApiConfiguration } from '@shared/api'
import { findLast, findLastIndex, parsePartialArrayString } from '@shared/array'
import { AutoApprovalSettings } from '@shared/AutoApprovalSettings'
import { combineApiRequests } from '@shared/combineApiRequests'
import { combineCommandSequences } from '@shared/combineCommandSequences'
import {
  ChatermApiReqCancelReason,
  ChatermApiReqInfo,
  ChatermAsk,
  ChatermAskQuestion,
  ChatermMessage,
  ChatermSay,
  COMPLETION_RESULT_CHANGES_FLAG,
  ExtensionMessage
} from '@shared/ExtensionMessage'
import { getApiMetrics } from '@shared/getApiMetrics'
import { HistoryItem } from '@shared/HistoryItem'
import { DEFAULT_LANGUAGE_SETTINGS } from '@shared/Languages'
import { ChatermAskResponse } from '@shared/WebviewMessage'
import { calculateApiCostAnthropic } from '@utils/cost'
import { AssistantMessageContent, parseAssistantMessageV2, ToolParamName, ToolUseName, TextContent, ToolUse } from '@core/assistant-message'
import { RemoteTerminalManager, ConnectionInfo, RemoteTerminalInfo } from '../../integrations/remote-terminal'
import { formatResponse } from '@core/prompts/responses'
import { addUserInstructions, SYSTEM_PROMPT, SYSTEM_PROMPT_CHAT, SYSTEM_PROMPT_CN, SYSTEM_PROMPT_CHAT_CN } from '@core/prompts/system'
import { getContextWindowInfo } from '@core/context/context-management/context-window-utils'
import { ModelContextTracker } from '@core/context/context-tracking/ModelContextTracker'
import { ContextManager } from '@core/context/context-management/ContextManager'
import { getSavedApiConversationHistory, getChatermMessages, saveApiConversationHistory, saveChatermMessages } from '@core/storage/disk'

import { getGlobalState, getUserConfig } from '@core/storage/state'
import WorkspaceTracker from '@integrations/workspace/WorkspaceTracker'
import { connectAssetInfo } from '../../../storage/database'
import { getMessages, formatMessage, Messages } from './messages'

import type { Host } from '@shared/WebviewMessage'
import { encrypt } from '../../integrations/remote-terminal/ws'

type ToolResponse = string | Array<Anthropic.TextBlockParam | Anthropic.ImageBlockParam>
type UserContent = Array<Anthropic.ContentBlockParam>

export class Task {
  private workspaceTracker: WorkspaceTracker
  private updateTaskHistory: (historyItem: HistoryItem) => Promise<HistoryItem[]>
  private postStateToWebview: () => Promise<void>
  private postMessageToWebview: (message: ExtensionMessage) => Promise<void>
  private reinitExistingTaskFromId: (taskId: string) => Promise<void>

  readonly taskId: string
  hosts: Host[]
  cwd: Map<string, string> = new Map()
  private taskIsFavorited?: boolean
  api: ApiHandler
  contextManager: ContextManager
  private remoteTerminalManager: RemoteTerminalManager
  customInstructions?: string
  autoApprovalSettings: AutoApprovalSettings
  apiConversationHistory: Anthropic.MessageParam[] = []
  chatermMessages: ChatermMessage[] = []
  // private chatermIgnoreController: ChatermIgnoreController
  private askResponse?: ChatermAskResponse
  private askResponseText?: string
  private lastMessageTs?: number
  private lastAskType?: ChatermAsk
  private currentSessionId?: string
  private consecutiveAutoApprovedRequestsCount: number = 0
  private consecutiveMistakeCount: number = 0
  private abort: boolean = false
  didFinishAbortingStream = false
  abandoned = false
  checkpointTrackerErrorMessage?: string
  conversationHistoryDeletedRange?: [number, number]
  isInitialized = false

  // Metadata tracking
  private modelContextTracker: ModelContextTracker

  // Add system information cache
  private hostSystemInfoCache: Map<
    string,
    {
      osVersion: string
      defaultShell: string
      homeDir: string
      hostName: string
      userName: string
      sudoCheck: string
    }
  > = new Map()

  // streaming
  isWaitingForFirstChunk = false
  isStreaming = false
  private currentStreamingContentIndex = 0
  private assistantMessageContent: AssistantMessageContent[] = []
  private presentAssistantMessageLocked = false
  private presentAssistantMessageHasPendingUpdates = false
  private userMessageContent: (Anthropic.TextBlockParam | Anthropic.ImageBlockParam)[] = []
  private userMessageContentReady = false
  private didRejectTool = false
  private didAlreadyUseTool = false
  private didCompleteReadingStream = false
  // private didAutomaticallyRetryFailedApiRequest = false
  private isInsideThinkingBlock = false
  private messages: Messages = getMessages(DEFAULT_LANGUAGE_SETTINGS)

  constructor(
    workspaceTracker: WorkspaceTracker,
    updateTaskHistory: (historyItem: HistoryItem) => Promise<HistoryItem[]>,
    postStateToWebview: () => Promise<void>,
    postMessageToWebview: (message: ExtensionMessage) => Promise<void>,
    reinitExistingTaskFromId: (taskId: string) => Promise<void>,
    apiConfiguration: ApiConfiguration,
    autoApprovalSettings: AutoApprovalSettings,
    hosts: Host[],
    customInstructions?: string,
    task?: string,
    historyItem?: HistoryItem,
    cwd?: Map<string, string>
  ) {
    this.workspaceTracker = workspaceTracker
    this.updateTaskHistory = updateTaskHistory
    this.postStateToWebview = postStateToWebview
    this.postMessageToWebview = postMessageToWebview
    this.reinitExistingTaskFromId = reinitExistingTaskFromId
    this.remoteTerminalManager = new RemoteTerminalManager()
    this.contextManager = new ContextManager()
    this.customInstructions = customInstructions
    this.autoApprovalSettings = autoApprovalSettings
    this.hosts = hosts
    if (hosts) {
      for (const host of hosts) {
        this.cwd.set(host.host, cwd?.get(host.host) || '')
      }
    }

    this.updateMessagesLanguage()

    // Initialize taskId first
    if (historyItem) {
      this.taskId = historyItem.id
      this.taskIsFavorited = historyItem.isFavorited
      this.conversationHistoryDeletedRange = historyItem.conversationHistoryDeletedRange
    } else if (task) {
      this.taskId = Date.now().toString()
    } else {
      throw new Error('Either historyItem or task/images must be provided')
    }

    // Initialize file context tracker
    this.modelContextTracker = new ModelContextTracker(this.taskId)
    // Now that taskId is initialized, we can build the API handler
    this.api = buildApiHandler({
      ...apiConfiguration,
      taskId: this.taskId
    })

    // Continue with task initialization
    if (historyItem) {
      this.resumeTaskFromHistory()
    } else if (task) {
      this.startTask(task)
    }

    // initialize telemetry
    if (historyItem) {
      // Open task from history
      telemetryService.captureTaskRestarted(this.taskId, apiConfiguration.apiProvider)
    } else {
      // New task started
      telemetryService.captureTaskCreated(this.taskId, apiConfiguration.apiProvider)
    }
  }

  private async updateMessagesLanguage(): Promise<void> {
    try {
      const userConfig = await getUserConfig()
      const userLanguage = userConfig?.language || DEFAULT_LANGUAGE_SETTINGS
      this.messages = getMessages(userLanguage)
    } catch (error) {
      // If error, use default language
      this.messages = getMessages(DEFAULT_LANGUAGE_SETTINGS)
    }
  }

  private async executeCommandInRemoteServer(command: string, ip?: string, cwd?: string): Promise<string> {
    try {
      const terminalInfo = await this.connectTerminal(ip)
      if (!terminalInfo) {
        await this.ask('ssh_con_failed', this.messages.sshConnectionFailed, false)
        await this.abortTask()
        throw new Error('Failed to connect to terminal')
      }
      return new Promise<string>((resolve, reject) => {
        const outputLines: string[] = []
        const process = this.remoteTerminalManager.runCommand(terminalInfo, command, cwd)

        process.on('line', (line) => {
          outputLines.push(line)
        })

        process.on('error', (error) => {
          reject(new Error(`Command execution failed: ${error.message}`))
        })

        process.once('completed', () => {
          resolve(outputLines.join('\n'))
        })
      })
    } catch (err) {
      // Check if we're in chat or cmd mode, if so return empty string
      const chatSettings = await getGlobalState('chatSettings')
      if (chatSettings?.mode === 'chat' || chatSettings?.mode === 'cmd') {
        return ''
      }
      await this.ask('ssh_con_failed', err instanceof Error ? err.message : String(err), false)
      await this.abortTask()
      throw err
    }
  }

  private async connectTerminal(ip?: string) {
    if (!this.hosts) {
      console.log('Terminal UUID is not set')
      return
    }
    let terminalInfo: RemoteTerminalInfo | null = null
    if (this.hosts[0].connection === 'personal') {
      let terminalUuid = ip ? this.hosts.find((host) => host.host === ip)?.uuid : this.hosts[0].uuid
      if (!terminalUuid) {
        console.log('Terminal UUID is not set')
        return
      }
      const connectionInfo = await connectAssetInfo(terminalUuid)
      connectionInfo.type = 'ssh'
      this.remoteTerminalManager.setConnectionInfo(connectionInfo)
      terminalInfo = await this.remoteTerminalManager.createTerminal()
    } else {
      // websocket
      let authData = {
        user: 'test',
        email: 'test@gmail.com',
        ip: this.hosts[0].host,
        organizationId: this.hosts[0].organizationId,
        uid: 2000001,
        terminalId: ''
      }
      const dynamicTerminalId = `${authData.user}@${authData.ip}:remote:${uuidv4()}`
      authData.terminalId = dynamicTerminalId

      const auth = encrypt(authData)
      const wsUrl = 'ws://demo.chaterm.ai/v1/term-api/ws?&uuid=' + auth // Backend WebSocket address
      let connectionInfo: ConnectionInfo = {}
      connectionInfo.type = 'websocket'
      connectionInfo.wsUrl = wsUrl
      connectionInfo.terminalId = dynamicTerminalId
      connectionInfo.host = authData.ip
      connectionInfo.organizationId = authData.organizationId
      connectionInfo.uid = authData.uid
      this.remoteTerminalManager.setConnectionInfo(connectionInfo)
      terminalInfo = await this.remoteTerminalManager.createTerminal()
    }

    return terminalInfo
  }

  // Set remote connection information
  setRemoteConnectionInfo(connectionInfo: ConnectionInfo): void {
    this.remoteTerminalManager.setConnectionInfo(connectionInfo)
  }

  // Get terminal manager (public method)
  getTerminalManager() {
    return this.remoteTerminalManager
  }

  // Storing task to disk for history
  private async addToApiConversationHistory(message: Anthropic.MessageParam) {
    this.apiConversationHistory.push(message)
    await saveApiConversationHistory(this.taskId, this.apiConversationHistory)
  }

  private async overwriteApiConversationHistory(newHistory: Anthropic.MessageParam[]) {
    this.apiConversationHistory = newHistory
    await saveApiConversationHistory(this.taskId, this.apiConversationHistory)
  }

  private async addToChatermMessages(message: ChatermMessage) {
    message.conversationHistoryIndex = this.apiConversationHistory.length - 1 // NOTE: this is the index of the last added message which is the user message, and once the chatermmessages have been presented we update the apiconversationhistory with the completed assistant message. This means when resetting to a message, we need to +1 this index to get the correct assistant message that this tool use corresponds to
    message.conversationHistoryDeletedRange = this.conversationHistoryDeletedRange
    this.chatermMessages.push(message)
    await this.saveChatermMessagesAndUpdateHistory()
  }

  private async overwriteChatermMessages(newMessages: ChatermMessage[]) {
    this.chatermMessages = newMessages
    await this.saveChatermMessagesAndUpdateHistory()
  }

  private async saveChatermMessagesAndUpdateHistory() {
    try {
      await saveChatermMessages(this.taskId, this.chatermMessages)

      // combined as they are in ChatView
      const apiMetrics = getApiMetrics(combineApiRequests(combineCommandSequences(this.chatermMessages.slice(1))))
      const taskMessage = this.chatermMessages[0] // first message is always the task say
      const lastRelevantMessage =
        this.chatermMessages[findLastIndex(this.chatermMessages, (m) => !(m.ask === 'resume_task' || m.ask === 'resume_completed_task'))]

      await this.updateTaskHistory({
        id: this.taskId,
        ts: lastRelevantMessage.ts,
        task: taskMessage.text ?? '',
        tokensIn: apiMetrics.totalTokensIn,
        tokensOut: apiMetrics.totalTokensOut,
        cacheWrites: apiMetrics.totalCacheWrites,
        cacheReads: apiMetrics.totalCacheReads,
        totalCost: apiMetrics.totalCost,
        size: 0, // TODO: temporarily set to 0, consider changing or removing later
        //shadowGitConfigWorkTree: await this.checkpointTracker?.getShadowGitConfigWorkTree(),
        conversationHistoryDeletedRange: this.conversationHistoryDeletedRange,
        isFavorited: this.taskIsFavorited
      })
    } catch (error) {
      console.error('Failed to save chaterm messages:', error)
    }
  }

  async doesLatestTaskCompletionHaveNewChanges() {
    const messageIndex = findLastIndex(this.chatermMessages, (m) => m.say === 'completion_result')
    const message = this.chatermMessages[messageIndex]
    if (!message) {
      console.error('Completion message not found')
      return false
    }
    const hash = message.lastCheckpointHash
    if (!hash) {
      console.error('No checkpoint hash found')
      return false
    }

    // Get last task completed
    const lastTaskCompletedMessage = findLast(this.chatermMessages.slice(0, messageIndex), (m) => m.say === 'completion_result')

    try {
      // Get last task completed
      const lastTaskCompletedMessageCheckpointHash = lastTaskCompletedMessage?.lastCheckpointHash // ask is only used to relinquish control, its the last say we care about
      // if undefined, then we get diff from beginning of git
      // if (!lastTaskCompletedMessage) {
      // 	console.error("No previous task completion message found")
      // 	return
      // }
      // This value *should* always exist
      const firstCheckpointMessageCheckpointHash = this.chatermMessages.find((m) => m.say === 'checkpoint_created')?.lastCheckpointHash

      const previousCheckpointHash = lastTaskCompletedMessageCheckpointHash || firstCheckpointMessageCheckpointHash // either use the diff between the first checkpoint and the task completion, or the diff between the latest two task completions

      if (!previousCheckpointHash) {
        return false
      }
    } catch (error) {
      console.error('Failed to get diff set:', error)
      return false
    }

    return false
  }

  // Communicate with webview
  // partial has three valid states true (partial message), false (completion of partial message), undefined (individual complete message)
  async ask(
    type: ChatermAsk,
    text?: string,
    partial?: boolean
  ): Promise<{
    response: ChatermAskResponse
    text?: string
  }> {
    if (this.abort) {
      throw new Error('Chaterm instance aborted')
    }

    // Set last ask type for interactive command handling
    this.lastAskType = type

    let askTsRef = { value: Date.now() }
    this.lastMessageTs = askTsRef.value

    if (partial !== undefined) {
      await this.handleAskPartialMessage(type, askTsRef, text, partial)
      if (partial) {
        throw new Error('Current ask promise was ignored')
      }
    } else {
      this.resetAskState()
      await this.addToChatermMessages({
        ts: askTsRef.value,
        type: 'ask',
        ask: type,
        text
      })
      await this.postStateToWebview()
    }

    await pWaitFor(() => this.askResponse !== undefined || this.lastMessageTs !== askTsRef.value, {
      interval: 100
    })

    if (this.lastMessageTs !== askTsRef.value) {
      throw new Error('Current ask promise was ignored')
    }

    const result = {
      response: this.askResponse!,
      text: this.askResponseText
    }
    this.resetAskState()
    return result
  }

  private resetAskState(): void {
    this.askResponse = undefined
    this.askResponseText = undefined
  }

  private async handleAskPartialMessage(type: ChatermAsk, askTsRef: { value: number }, text?: string, isPartial?: boolean): Promise<void> {
    const lastMessage = this.chatermMessages.at(-1)
    const isUpdatingPreviousPartial = lastMessage && lastMessage.partial && lastMessage.type === 'ask' && lastMessage.ask === type

    if (isPartial) {
      if (isUpdatingPreviousPartial) {
        askTsRef.value = lastMessage.ts
        this.lastMessageTs = lastMessage.ts
        lastMessage.text = text
        lastMessage.partial = isPartial
        await this.postMessageToWebview({
          type: 'partialMessage',
          partialMessage: lastMessage
        })
      } else {
        // Add new partial message
        askTsRef.value = Date.now()
        this.lastMessageTs = askTsRef.value
        await this.addToChatermMessages({
          ts: askTsRef.value,
          type: 'ask',
          ask: type,
          text,
          partial: isPartial
        })
        await this.postStateToWebview()
      }
    } else {
      // Complete partial message
      this.resetAskState()

      if (isUpdatingPreviousPartial) {
        // Update to complete version
        askTsRef.value = lastMessage.ts
        this.lastMessageTs = lastMessage.ts
        lastMessage.text = text
        lastMessage.partial = false
        await this.saveChatermMessagesAndUpdateHistory()
        await this.postMessageToWebview({
          type: 'partialMessage',
          partialMessage: lastMessage
        })
      } else {
        // Add new complete message
        askTsRef.value = Date.now()
        this.lastMessageTs = askTsRef.value
        const newMessage: ChatermMessage = {
          ts: askTsRef.value,
          type: 'ask',
          ask: type,
          text
        }
        await this.postMessageToWebview({
          type: 'partialMessage',
          partialMessage: newMessage
        })
      }
    }
  }

  async handleWebviewAskResponse(askResponse: ChatermAskResponse, text?: string, cwd?: Map<string, string>) {
    this.askResponse = askResponse
    this.askResponseText = text
    if (!cwd) return
    for (const [key, value] of cwd.entries()) {
      if (this.cwd.has(key)) {
        this.cwd.set(key, value)
      }
    }

    // Handle interactive command input
    if (askResponse === 'messageResponse' && text && this.lastAskType === 'interactive_command') {
      // Send input directly to SSH stream
      if (this.currentSessionId) {
        try {
          const { remoteSshSendInput } = await import('../../../ssh/agentHandle')
          const result = await remoteSshSendInput(this.currentSessionId, text)
          if (!result.success) {
            console.error('Failed to send interactive input:', result.error)
          } else {
            console.log('Interactive input sent successfully to session:', this.currentSessionId)
          }
        } catch (error) {
          console.error('Failed to send interactive input:', error)
        }
      } else {
        console.error('No current session ID available for interactive input')
      }
    }

    // Handle converted command confirmation
    if (askResponse === 'yesButtonClicked' && this.lastAskType === 'command') {
      // Check if the last message contains a converted command
      const lastMessage = this.chatermMessages.at(-1)
      if (lastMessage && lastMessage.text && lastMessage.text.includes('转换后命令:')) {
        // Extract the converted command from the message
        const convertedCommandMatch = lastMessage.text.match(/转换后命令: (.+?)(?:\n|$)/)
        if (convertedCommandMatch) {
          const convertedCommand = convertedCommandMatch[1].trim()
          console.log('Executing converted command:', convertedCommand)

          // Execute the converted command directly without going through the conversion logic again
          const ipList = this.hosts.map((h) => h.host)
          let result = ''
          for (const ip of ipList) {
            result += `\n\n# Executing converted command on ${ip}:`
            // Use a direct execution method to avoid the conversion loop
            result += await this.executeConvertedCommand(convertedCommand, ip)
          }

          // Add the result to the conversation
          this.pushToolResult(`[execute_command for converted command '${convertedCommand}']`, result)
          await this.saveCheckpoint()
        }
      }
    }
  }

  async say(type: ChatermSay, text?: string, partial?: boolean): Promise<undefined> {
    if (this.abort) {
      throw new Error('Chaterm instance aborted')
    }
    if (text === undefined || text === '') {
      console.warn('Chaterm say called with empty text, ignoring')
      return
    }

    if (partial !== undefined) {
      await this.handleSayPartialMessage(type, text, partial)
    } else {
      // this is a new non-partial message, so add it like normal
      const sayTs = Date.now()
      this.lastMessageTs = sayTs
      await this.addToChatermMessages({
        ts: sayTs,
        type: 'say',
        say: type,
        text
      })
      await this.postStateToWebview()
    }
  }

  private async handleSayPartialMessage(type: ChatermSay, text?: string, partial?: boolean): Promise<void> {
    const lastMessage = this.chatermMessages.at(-1)
    const isUpdatingPreviousPartial = lastMessage && lastMessage.partial && lastMessage.type === 'say' && lastMessage.say === type
    if (partial) {
      if (isUpdatingPreviousPartial) {
        // if (lastMessage.text && lastMessage.type === 'say' && lastMessage.say === 'command_output') {
        // if (lastMessage.text) {
        //   lastMessage.text += '\n' + text
        // } else {

        // }
        lastMessage.text = text
        lastMessage.partial = partial
        await this.postMessageToWebview({
          type: 'partialMessage',
          partialMessage: lastMessage
        })
      } else {
        // this is a new partial message, so add it with partial state
        const sayTs = Date.now()
        this.lastMessageTs = sayTs
        await this.addToChatermMessages({
          ts: sayTs,
          type: 'say',
          say: type,
          text,
          partial
        })
        await this.postStateToWebview()
        if (type === 'command_output') {
          const newMsg = this.chatermMessages.at(-1)!
          await this.postMessageToWebview({
            type: 'partialMessage',
            partialMessage: newMsg
          })
        }
      }
    } else {
      // partial=false means its a complete version of a previously partial message
      if (isUpdatingPreviousPartial) {
        // this is the complete version of a previously partial message, so replace the partial with the complete version
        this.lastMessageTs = lastMessage.ts
        lastMessage.text = text
        lastMessage.partial = false

        // instead of streaming partialMessage events, we do a save and post like normal to persist to disk
        await this.saveChatermMessagesAndUpdateHistory()
        await this.postMessageToWebview({
          type: 'partialMessage',
          partialMessage: lastMessage
        }) // more performant than an entire postStateToWebview
      } else {
        // this is a new partial=false message, so add it like normal
        const sayTs = Date.now()
        this.lastMessageTs = sayTs
        const newMessage: ChatermMessage = {
          ts: sayTs,
          type: 'say',
          say: type,
          text
        }
        await this.addToChatermMessages(newMessage)
        await this.postMessageToWebview({
          type: 'partialMessage',
          partialMessage: newMessage
        })
      }
    }
  }

  async sayAndCreateMissingParamError(toolName: ToolUseName, paramName: string, relPath?: string) {
    await this.say(
      'error',
      `Chaterm tried to use ${toolName}${
        relPath ? ` for '${relPath.toPosix()}'` : ''
      } without value for required parameter '${paramName}'. Retrying...`
    )
    return formatResponse.toolError(formatResponse.missingToolParameterError(paramName))
  }

  async removeLastPartialMessageIfExistsWithType(type: 'ask' | 'say', askOrSay: ChatermAsk | ChatermSay) {
    const lastMessage = this.chatermMessages.at(-1)
    if (lastMessage?.partial && lastMessage.type === type && (lastMessage.ask === askOrSay || lastMessage.say === askOrSay)) {
      this.chatermMessages.pop()
      await this.saveChatermMessagesAndUpdateHistory()
      await this.postStateToWebview()
    }
  }

  // Task lifecycle

  private async startTask(task?: string): Promise<void> {
    this.chatermMessages = []
    this.apiConversationHistory = []

    await this.postStateToWebview()

    await this.say('text', task)

    this.isInitialized = true

    // let imageBlocks: Anthropic.ImageBlockParam[] = formatResponse.imageBlocks(images)
    await this.initiateTaskLoop([
      {
        type: 'text',
        text: `<task>\n${task}\n</task>`
      }
      // ...imageBlocks,
    ])
  }

  private async resumeTaskFromHistory() {
    const modifiedChatermMessages = await getChatermMessages(this.taskId)

    // Remove any resume messages that may have been added before
    const lastRelevantMessageIndex = findLastIndex(modifiedChatermMessages, (m) => !(m.ask === 'resume_task' || m.ask === 'resume_completed_task'))
    if (lastRelevantMessageIndex !== -1) {
      modifiedChatermMessages.splice(lastRelevantMessageIndex + 1)
    }

    // since we don't use api_req_finished anymore, we need to check if the last api_req_started has a cost value, if it doesn't and no cancellation reason to present, then we remove it since it indicates an api request without any partial content streamed
    const lastApiReqStartedIndex = findLastIndex(modifiedChatermMessages, (m) => m.type === 'say' && m.say === 'api_req_started')
    if (lastApiReqStartedIndex !== -1) {
      const lastApiReqStarted = modifiedChatermMessages[lastApiReqStartedIndex]
      const { cost, cancelReason }: ChatermApiReqInfo = JSON.parse(lastApiReqStarted.text || '{}')
      if (cost === undefined && cancelReason === undefined) {
        modifiedChatermMessages.splice(lastApiReqStartedIndex, 1)
      }
    }

    await this.overwriteChatermMessages(modifiedChatermMessages)
    this.chatermMessages = await getChatermMessages(this.taskId)

    this.apiConversationHistory = await getSavedApiConversationHistory(this.taskId)

    // load the context history state
    await this.contextManager.initializeContextHistory(this.taskId) // TODO:fixme

    const lastChatermMessage = this.chatermMessages.at(-1)

    let askType: ChatermAsk
    if (lastChatermMessage?.ask === 'completion_result') {
      askType = 'resume_completed_task'
    } else {
      askType = 'resume_task'
    }

    this.isInitialized = true

    const { response, text } = await this.ask(askType) // calls poststatetowebview
    let responseText: string | undefined
    if (response === 'messageResponse') {
      await this.say('user_feedback', text)
      responseText = text
    }

    const existingApiConversationHistory: Anthropic.Messages.MessageParam[] = await getSavedApiConversationHistory(this.taskId)

    // Remove the last user message so we can update it with the resume message
    let modifiedOldUserContent: UserContent // either the last message if its user message, or the user message before the last (assistant) message
    let modifiedApiConversationHistory: Anthropic.Messages.MessageParam[] // need to remove the last user message to replace with new modified user message
    if (existingApiConversationHistory.length > 0) {
      const lastMessage = existingApiConversationHistory[existingApiConversationHistory.length - 1]
      if (lastMessage.role === 'assistant') {
        modifiedApiConversationHistory = [...existingApiConversationHistory]
        modifiedOldUserContent = []
      } else if (lastMessage.role === 'user') {
        const existingUserContent: UserContent = Array.isArray(lastMessage.content)
          ? lastMessage.content
          : [{ type: 'text', text: lastMessage.content }]
        modifiedApiConversationHistory = existingApiConversationHistory.slice(0, -1)
        modifiedOldUserContent = [...existingUserContent]
      } else {
        throw new Error('Unexpected: Last message is not a user or assistant message')
      }
    } else {
      throw new Error('Unexpected: No existing API conversation history')
    }

    let newUserContent: UserContent = [...modifiedOldUserContent]

    const agoText = (() => {
      const timestamp = lastChatermMessage?.ts ?? Date.now()
      const now = Date.now()
      const diff = now - timestamp
      const minutes = Math.floor(diff / 60000)
      const hours = Math.floor(minutes / 60)
      const days = Math.floor(hours / 24)

      if (days > 0) {
        return `${days} day${days > 1 ? 's' : ''} ago`
      }
      if (hours > 0) {
        return `${hours} hour${hours > 1 ? 's' : ''} ago`
      }
      if (minutes > 0) {
        return `${minutes} minute${minutes > 1 ? 's' : ''} ago`
      }
      return 'just now'
    })()

    const wasRecent = lastChatermMessage?.ts && Date.now() - lastChatermMessage.ts < 30_000
    const chatSettings = await getGlobalState('chatSettings')

    const [taskResumptionMessage, userResponseMessage] = formatResponse.taskResumption(chatSettings?.mode, agoText, wasRecent, responseText)

    if (taskResumptionMessage !== '') {
      newUserContent.push({
        type: 'text',
        text: taskResumptionMessage
      })
    }

    if (userResponseMessage !== '') {
      newUserContent.push({
        type: 'text',
        text: userResponseMessage
      })
    }

    await this.overwriteApiConversationHistory(modifiedApiConversationHistory)
    await this.initiateTaskLoop(newUserContent)
  }

  private async initiateTaskLoop(userContent: UserContent): Promise<void> {
    let nextUserContent = userContent
    let includeHostDetails = true
    while (!this.abort) {
      const didEndLoop = await this.recursivelyMakeChatermRequests(nextUserContent, includeHostDetails)
      includeHostDetails = false // we only need file details the first time

      //const totalCost = this.calculateApiCost(totalInputTokens, totalOutputTokens)
      if (didEndLoop) {
        // For now a task never 'completes'. This will only happen if the user hits max requests and denies resetting the count.
        //this.say("task_completed", `Task completed. Total API usage cost: ${totalCost}`)
        break
      } else {
        nextUserContent = [
          {
            type: 'text',
            text: formatResponse.noToolsUsed()
          }
        ]
        this.consecutiveMistakeCount++
      }
    }
  }

  async abortTask() {
    this.abort = true // will stop any autonomously running promises
    this.remoteTerminalManager.disposeAll()
  }

  // Checkpoints

  async saveCheckpoint(isAttemptCompletionMessage: boolean = false) {
    // Set isCheckpointCheckedOut to false for all checkpoint_created messages
    this.chatermMessages.forEach((message) => {
      if (message.say === 'checkpoint_created') {
        message.isCheckpointCheckedOut = false
      }
    })

    if (!isAttemptCompletionMessage) {
      // ensure we aren't creating a duplicate checkpoint
      const lastMessage = this.chatermMessages.at(-1)
      if (lastMessage?.say === 'checkpoint_created') {
        return
      }
    } else {
      // attempt completion requires checkpoint to be sync so that we can present button after attempt_completion
      // const commitHash = await this.checkpointTracker?.commit()
      // For attempt_completion, find the last completion_result message and set its checkpoint hash. This will be used to present the 'see new changes' button
      const lastCompletionResultMessage = findLast(this.chatermMessages, (m) => m.say === 'completion_result' || m.ask === 'completion_result')
      if (lastCompletionResultMessage) {
        // lastCompletionResultMessage.lastCheckpointHash = commitHash
        await this.saveChatermMessagesAndUpdateHistory()
      }
    }
  }

  private truncateCommandOutput(output: string): string {
    const MAX_OUTPUT_LENGTH = 8000
    const HEAD_LENGTH = 2000
    const TAIL_LENGTH = 6000
    const headLines = 50
    const tailLines = 150

    if (output.length <= MAX_OUTPUT_LENGTH) {
      return output
    }

    const lines = output.split('\n')
    const totalLines = lines.length

    if (totalLines <= headLines + tailLines) {
      const headPart = output.substring(0, HEAD_LENGTH)
      const tailPart = output.substring(output.length - TAIL_LENGTH)
      const truncatedBytes = output.length - HEAD_LENGTH - TAIL_LENGTH
      return `${headPart}\n\n${formatMessage(this.messages.outputTruncatedChars, { count: truncatedBytes })}\n\n${tailPart}`
    }

    const headPart = lines.slice(0, headLines).join('\n')
    const tailPart = lines.slice(-tailLines).join('\n')
    const truncatedLines = totalLines - headLines - tailLines

    return `${headPart}\n\n${formatMessage(this.messages.outputTruncatedLines, { count: truncatedLines })}\n\n${tailPart}`
  }

  async executeCommandTool(command: string, ip: string): Promise<ToolResponse> {
    try {
      const terminalInfo = await this.connectTerminal(ip)
      if (!terminalInfo) {
        await this.ask('ssh_con_failed', this.messages.sshConnectionFailed, false)
        await this.abortTask()
        return 'Failed to connect to terminal'
      }
      terminalInfo.terminal.show()
      const process = this.remoteTerminalManager.runCommand(terminalInfo, command, this.cwd.get(ip) || undefined)

      // Chunked terminal output buffering
      const CHUNK_LINE_COUNT = 20
      const CHUNK_BYTE_SIZE = 2048 // 2KB
      const CHUNK_DEBOUNCE_MS = 100

      let outputBuffer: string[] = []
      let outputBufferSize: number = 0
      let chunkTimer: NodeJS.Timeout | null = null
      let chunkEnroute = false
      let isInteractiveCommand = false
      let waitingForUserInput = false
      let isConvertedCommand = false
      this.currentSessionId = terminalInfo.sessionId

      // Check if command is interactive and convert to non-interactive
      const interactiveCommands = ['rm -i', 'rm -I', 'cp -i', 'mv -i', 'rmdir -i']
      isInteractiveCommand = interactiveCommands.some((cmd) => command.includes(cmd))

      // Convert interactive command to non-interactive version
      let nonInteractiveCommand = command
      if (isInteractiveCommand && !isConvertedCommand) {
        // Replace interactive flags with non-interactive equivalents
        nonInteractiveCommand = command
          .replace(/rm -i/g, 'rm -f')
          .replace(/rm -I/g, 'rm -f')
          .replace(/cp -i/g, 'cp -f')
          .replace(/mv -i/g, 'mv -f')
          .replace(/rmdir -i/g, 'rmdir')

        // Show the converted command to user for confirmation
        const confirmationMessage = `检测到交互式命令，已转换为非交互式命令供您确认：\n\n原始命令: ${command}\n转换后命令: ${nonInteractiveCommand}\n\n是否执行转换后的命令？`
        await this.ask('command', confirmationMessage, false)
        return 'Command converted to non-interactive version and awaiting user confirmation'
      }

      const flushBuffer = async (force = false) => {
        if (!force && (chunkEnroute || outputBuffer.length === 0)) {
          return
        }
        // const chunk = outputBuffer.join('\n')
        outputBuffer = []
        outputBufferSize = 0
        chunkEnroute = true
        try {
          // Send the complete output up to now, for the frontend to replace entirely
          await this.say('command_output', result, true)
        } catch (error) {
          console.error('Error while saying for command output:', error) // Log error
        } finally {
          chunkEnroute = false
          // If more output accumulated while chunkEnroute, flush again
          if (outputBuffer.length > 0) {
            await flushBuffer()
          }
        }
      }

      const scheduleFlush = () => {
        if (chunkTimer) {
          clearTimeout(chunkTimer)
        }
        chunkTimer = setTimeout(async () => await flushBuffer(), CHUNK_DEBOUNCE_MS)
      }

      let result = ''
      process.on('line', async (line) => {
        result += line + '\n'

        // Check for interactive prompts (this should not happen with converted commands)
        if (isInteractiveCommand && !waitingForUserInput) {
          const promptPatterns = [
            /^rm: remove regular file '([^']+)'\? /,
            /^rm: remove directory '([^']+)'\? /,
            /^overwrite '([^']+)'\? /,
            /^cp: overwrite '([^']+)'\? /,
            /^mv: overwrite '([^']+)'\? /,
            /^rmdir: remove directory '([^']+)'\? /,
            /^rm: remove regular file '([^']+)'\?$/,
            /^rm: remove directory '([^']+)'\?$/,
            /^overwrite '([^']+)'\?$/,
            /^cp: overwrite '([^']+)'\?$/,
            /^mv: overwrite '([^']+)'\?$/,
            /^rmdir: remove directory '([^']+)'\?$/
          ]

          for (const pattern of promptPatterns) {
            const match = line.match(pattern)
            if (match) {
              console.log('Interactive prompt detected:', line)
              waitingForUserInput = true
              // Send interactive prompt to frontend
              await this.ask('interactive_command', `Interactive command prompt: ${line}\nPlease respond with 'y' for yes or 'n' for no:`, false)
              return
            }
          }
        }

        outputBuffer.push(line)
        outputBufferSize += Buffer.byteLength(line, 'utf8')
        // Flush if buffer is large enough
        if (outputBuffer.length >= CHUNK_LINE_COUNT || outputBufferSize >= CHUNK_BYTE_SIZE) {
          await flushBuffer()
        } else {
          scheduleFlush()
        }
      })

      let completed = false
      process.once('completed', async () => {
        completed = true
        // Flush any remaining buffered output
        if (outputBuffer.length > 0) {
          if (chunkTimer) {
            clearTimeout(chunkTimer)
            chunkTimer = null
          }
          await flushBuffer(true)
        }
      })

      process.once('no_shell_integration', async () => {
        await this.say('shell_integration_warning')
      })

      await process

      // Wait for a short delay to ensure all messages are sent to the webview
      // This delay allows time for non-awaited promises to be created and
      // for their associated messages to be sent to the webview, maintaining
      // the correct order of messages
      await new Promise((resolve) => setTimeout(resolve, 100))

      const lastMessage = this.chatermMessages.at(-1)
      if (lastMessage?.say === 'command_output') {
        await this.say('command_output', lastMessage.text, false)
      }
      result = result.trim()

      const truncatedResult = this.truncateCommandOutput(result)

      if (completed) {
        return `${this.messages.commandExecutedOutput}${truncatedResult.length > 0 ? `\nOutput:\n${truncatedResult}` : ''}`
      } else {
        return `${this.messages.commandStillRunning}${
          truncatedResult.length > 0 ? `${this.messages.commandHereIsOutput}${truncatedResult}` : ''
        }${this.messages.commandUpdateFuture}`
      }
    } catch (err) {
      await this.ask('ssh_con_failed', err instanceof Error ? err.message : String(err), false)
      await this.abortTask()
      return `SSH connection failed: ${err instanceof Error ? err.message : String(err)}`
    }
  }

  // Direct execution method for converted commands to avoid conversion loop
  private async executeConvertedCommand(command: string, ip: string): Promise<ToolResponse> {
    try {
      const terminalInfo = await this.connectTerminal(ip)
      if (!terminalInfo) {
        return 'Failed to connect to terminal'
      }
      terminalInfo.terminal.show()
      const process = this.remoteTerminalManager.runCommand(terminalInfo, command, this.cwd.get(ip) || undefined)

      // Chunked terminal output buffering
      const CHUNK_LINE_COUNT = 20
      const CHUNK_BYTE_SIZE = 2048 // 2KB
      const CHUNK_DEBOUNCE_MS = 100

      let outputBuffer: string[] = []
      let outputBufferSize: number = 0
      let chunkTimer: NodeJS.Timeout | null = null
      let chunkEnroute = false

      const flushBuffer = async (force = false) => {
        if (!force && (chunkEnroute || outputBuffer.length === 0)) {
          return
        }
        outputBuffer = []
        outputBufferSize = 0
        chunkEnroute = true
        try {
          await this.say('command_output', result, true)
        } catch (error) {
          console.error('Error while saying for command output:', error)
        } finally {
          chunkEnroute = false
          if (outputBuffer.length > 0) {
            await flushBuffer()
          }
        }
      }

      const scheduleFlush = () => {
        if (chunkTimer) {
          clearTimeout(chunkTimer)
        }
        chunkTimer = setTimeout(async () => await flushBuffer(), CHUNK_DEBOUNCE_MS)
      }

      let result = ''
      process.on('line', async (line) => {
        result += line + '\n'
        outputBuffer.push(line)
        outputBufferSize += Buffer.byteLength(line, 'utf8')
        if (outputBuffer.length >= CHUNK_LINE_COUNT || outputBufferSize >= CHUNK_BYTE_SIZE) {
          await flushBuffer()
        } else {
          scheduleFlush()
        }
      })

      let completed = false
      process.once('completed', async () => {
        completed = true
        if (outputBuffer.length > 0) {
          if (chunkTimer) {
            clearTimeout(chunkTimer)
            chunkTimer = null
          }
          await flushBuffer(true)
        }
      })

      process.once('no_shell_integration', async () => {
        await this.say('shell_integration_warning')
      })

      await process

      await new Promise((resolve) => setTimeout(resolve, 100))

      const lastMessage = this.chatermMessages.at(-1)
      if (lastMessage?.say === 'command_output') {
        await this.say('command_output', lastMessage.text, false)
      }
      result = result.trim()

      const truncatedResult = this.truncateCommandOutput(result)

      if (completed) {
        return `${this.messages.commandExecutedOutput}${truncatedResult.length > 0 ? `\nOutput:\n${truncatedResult}` : ''}`
      } else {
        return `${this.messages.commandStillRunning}${
          truncatedResult.length > 0 ? `${this.messages.commandHereIsOutput}${truncatedResult}` : ''
        }${this.messages.commandUpdateFuture}`
      }
    } catch (err) {
      return `SSH connection failed: ${err instanceof Error ? err.message : String(err)}`
    }
  }

  // Check if the tool should be auto-approved based on the settings
  // Returns bool for most tools, and tuple for tools with nested settings
  shouldAutoApproveTool(toolName: ToolUseName): boolean | [boolean, boolean] {
    if (this.autoApprovalSettings.enabled) {
      switch (toolName) {
        case 'execute_command':
          return [this.autoApprovalSettings.actions.executeSafeCommands ?? false, this.autoApprovalSettings.actions.executeAllCommands ?? false]
        default:
          break
      }
    }
    return false
  }

  private formatErrorWithStatusCode(error: any): string {
    const statusCode = error.status || error.statusCode || (error.response && error.response.status)
    const message = error.message ?? JSON.stringify(serializeError(error), null, 2)

    // Only prepend the statusCode if it's not already part of the message
    return statusCode && !message.includes(statusCode.toString()) ? `${statusCode} - ${message}` : message
  }

  async *attemptApiRequest(previousApiReqIndex: number): ApiStream {
    // Build system prompt
    let systemPrompt = await this.buildSystemPrompt()

    const contextManagementMetadata = await this.contextManager.getNewContextMessagesAndMetadata(
      this.apiConversationHistory,
      this.chatermMessages,
      this.api,
      this.conversationHistoryDeletedRange,
      previousApiReqIndex,
      this.taskId
    )

    if (contextManagementMetadata.updatedConversationHistoryDeletedRange) {
      this.conversationHistoryDeletedRange = contextManagementMetadata.conversationHistoryDeletedRange
      await this.saveChatermMessagesAndUpdateHistory() // saves task history item which we use to keep track of conversation history deleted range
    }

    let stream = this.api.createMessage(systemPrompt, contextManagementMetadata.truncatedConversationHistory)

    const iterator = stream[Symbol.asyncIterator]()

    try {
      // awaiting first chunk to see if it will throw an error
      this.isWaitingForFirstChunk = true
      const firstChunk = await iterator.next()
      yield firstChunk.value
      this.isWaitingForFirstChunk = false
    } catch (error) {
      const errorMessage = this.formatErrorWithStatusCode(error)

      const { response } = await this.ask('api_req_failed', errorMessage, false)

      if (response !== 'yesButtonClicked') {
        // this will never happen since if noButtonClicked, we will clear current task, aborting this instance
        throw new Error('API request failed')
      }

      await this.say('api_req_retried')
      // delegate generator output from the recursive call
      yield* this.attemptApiRequest(previousApiReqIndex)
      return
    }

    // no error, so we can continue to yield all remaining chunks
    // (needs to be placed outside of try/catch since it we want caller to handle errors not with api_req_failed as that is reserved for first chunk failures only)
    // this delegates to another generator or iterable object. In this case, it's saying "yield all remaining values from this iterator". This effectively passes along all subsequent chunks from the original stream.
    yield* iterator
  }

  async presentAssistantMessage() {
    if (this.abort) {
      throw new Error('Chaterm instance aborted')
    }

    if (this.presentAssistantMessageLocked) {
      this.presentAssistantMessageHasPendingUpdates = true
      return
    }
    this.presentAssistantMessageLocked = true
    this.presentAssistantMessageHasPendingUpdates = false

    if (this.currentStreamingContentIndex >= this.assistantMessageContent.length) {
      // this may happen if the last content block was completed before streaming could finish. if streaming is finished, and we're out of bounds then this means we already presented/executed the last content block and are ready to continue to next request
      if (this.didCompleteReadingStream) {
        this.userMessageContentReady = true
      }
      this.presentAssistantMessageLocked = false
      return
    }

    const block = cloneDeep(this.assistantMessageContent[this.currentStreamingContentIndex]) // need to create copy bc while stream is updating the array, it could be updating the reference block properties too
    switch (block.type) {
      case 'text': {
        await this.handleTextBlock(block)
        break
      }
      case 'tool_use':
        await this.handleToolUse(block)
        break
    }

    this.presentAssistantMessageLocked = false // this needs to be placed here, if not then calling this.presentAssistantMessage below would fail (sometimes) since it's locked
    if (!block.partial || this.didRejectTool || this.didAlreadyUseTool) {
      if (this.currentStreamingContentIndex === this.assistantMessageContent.length - 1) {
        this.userMessageContentReady = true // will allow pwaitfor to continue
      }

      this.currentStreamingContentIndex++

      if (this.currentStreamingContentIndex < this.assistantMessageContent.length) {
        this.presentAssistantMessage()
        return
      }
    }
    // block is partial, but the read stream may have finished
    if (this.presentAssistantMessageHasPendingUpdates) {
      this.presentAssistantMessage()
    }
  }

  async recursivelyMakeChatermRequests(userContent: UserContent, includeHostDetails: boolean = false): Promise<boolean> {
    if (this.abort) {
      throw new Error('Chaterm instance aborted')
    }

    await this.recordModelUsage()
    await this.handleConsecutiveMistakes(userContent)
    await this.handleAutoApprovalLimits()

    await this.prepareApiRequest(userContent, includeHostDetails)

    try {
      return await this.processApiStreamAndResponse()
    } catch (error) {
      // this should never happen since the only thing that can throw an error is the attemptApiRequest,
      // which is wrapped in a try catch that sends an ask where if noButtonClicked, will clear current task and destroy this instance.
      //  However to avoid unhandled promise rejection, we will end this loop which will end execution of this instance (see startTask)
      return true // needs to be true so parent loop knows to end task
    }
  }

  private async recordModelUsage(): Promise<void> {
    const currentProviderId = (await getGlobalState('apiProvider')) as string
    if (currentProviderId && this.api.getModel().id) {
      try {
        const chatSettings = await getGlobalState('chatSettings')
        this.modelContextTracker.recordModelUsage(currentProviderId, this.api.getModel().id, chatSettings?.mode)
      } catch {}
    }
  }

  private async handleConsecutiveMistakes(userContent: UserContent): Promise<void> {
    if (this.consecutiveMistakeCount < 3) return

    if (this.autoApprovalSettings.enabled && this.autoApprovalSettings.enableNotifications) {
      showSystemNotification({
        subtitle: 'Error',
        message: 'Chaterm is having trouble. Would you like to continue the task?'
      })
    }

    const errorMessage = this.api.getModel().id.includes('claude')
      ? this.messages.consecutiveMistakesErrorClaude
      : this.messages.consecutiveMistakesErrorOther

    const { response, text } = await this.ask('mistake_limit_reached', errorMessage)

    if (response === 'messageResponse') {
      userContent.push({
        type: 'text',
        text: formatResponse.tooManyMistakes(text)
      } as Anthropic.Messages.TextBlockParam)
    }

    this.consecutiveMistakeCount = 0
  }

  private async handleAutoApprovalLimits(): Promise<void> {
    if (!this.autoApprovalSettings.enabled || this.consecutiveAutoApprovedRequestsCount < this.autoApprovalSettings.maxRequests) {
      return
    }

    if (this.autoApprovalSettings.enableNotifications) {
      showSystemNotification({
        subtitle: 'Max Requests Reached',
        message: formatMessage(this.messages.autoApprovalMaxRequestsMessage, { count: this.autoApprovalSettings.maxRequests.toString() })
      })
    }

    await this.ask(
      'auto_approval_max_req_reached',
      formatMessage(this.messages.autoApprovalMaxRequestsMessage, { count: this.autoApprovalSettings.maxRequests.toString() })
    )

    this.consecutiveAutoApprovedRequestsCount = 0
  }

  private async prepareApiRequest(userContent: UserContent, includeHostDetails: boolean): Promise<void> {
    await this.say(
      'api_req_started',
      JSON.stringify({
        request: userContent.map((block) => formatContentBlockToMarkdown(block)).join('\n\n') + '\n\nLoading...'
      })
    )

    await this.handleFirstRequestCheckpoint()

    const [parsedUserContent, environmentDetails] = await this.loadContext(userContent, includeHostDetails)
    userContent.length = 0
    userContent.push(...parsedUserContent)
    userContent.push({ type: 'text', text: environmentDetails })

    await this.addToApiConversationHistory({
      role: 'user',
      content: userContent
    })
    const chatSettings = await getGlobalState('chatSettings')
    telemetryService.captureApiRequestEvent(this.taskId, await getGlobalState('apiProvider'), this.api.getModel().id, 'user', chatSettings?.mode)
    // Update API request message
    await this.updateApiRequestMessage(userContent)
  }

  private async handleFirstRequestCheckpoint(): Promise<void> {
    const isFirstRequest = this.chatermMessages.filter((m) => m.say === 'api_req_started').length === 0
    if (!isFirstRequest) return

    await this.say('checkpoint_created')

    // Update checkpoint message (waiting for CheckpointTracker initialization)
    const lastCheckpointMessage = findLast(this.chatermMessages, (m) => m.say === 'checkpoint_created')
    if (lastCheckpointMessage) {
      await this.saveChatermMessagesAndUpdateHistory()
    }
  }

  private async updateApiRequestMessage(userContent: UserContent): Promise<void> {
    const lastApiReqIndex = findLastIndex(this.chatermMessages, (m) => m.say === 'api_req_started')
    this.chatermMessages[lastApiReqIndex].text = JSON.stringify({
      request: userContent.map((block) => formatContentBlockToMarkdown(block)).join('\n\n')
    } satisfies ChatermApiReqInfo)

    await this.saveChatermMessagesAndUpdateHistory()
    await this.postStateToWebview()
  }

  private async processApiStreamAndResponse(): Promise<boolean> {
    const streamMetrics = this.createStreamMetrics()
    const messageUpdater = this.createMessageUpdater(streamMetrics)

    this.resetStreamingState()

    const previousApiReqIndex = findLastIndex(this.chatermMessages, (m) => m.say === 'api_req_started')
    const stream = this.attemptApiRequest(previousApiReqIndex)

    const assistantMessage = await this.processStream(stream, streamMetrics, messageUpdater)

    await this.handleStreamUsageUpdate(streamMetrics, messageUpdater)

    return await this.processAssistantResponse(assistantMessage)
  }

  private createStreamMetrics() {
    return {
      cacheWriteTokens: 0,
      cacheReadTokens: 0,
      inputTokens: 0,
      outputTokens: 0,
      totalCost: undefined as number | undefined,
      didReceiveUsageChunk: false
    }
  }

  private createMessageUpdater(streamMetrics: any) {
    const lastApiReqIndex = findLastIndex(this.chatermMessages, (m) => m.say === 'api_req_started')

    return {
      updateApiReqMsg: (cancelReason?: ChatermApiReqCancelReason, streamingFailedMessage?: string) => {
        this.chatermMessages[lastApiReqIndex].text = JSON.stringify({
          ...JSON.parse(this.chatermMessages[lastApiReqIndex].text || '{}'),
          tokensIn: streamMetrics.inputTokens,
          tokensOut: streamMetrics.outputTokens,
          cacheWrites: streamMetrics.cacheWriteTokens,
          cacheReads: streamMetrics.cacheReadTokens,
          cost:
            streamMetrics.totalCost ??
            calculateApiCostAnthropic(
              this.api.getModel().info,
              streamMetrics.inputTokens,
              streamMetrics.outputTokens,
              streamMetrics.cacheWriteTokens,
              streamMetrics.cacheReadTokens
            ),
          cancelReason,
          streamingFailedMessage
        } satisfies ChatermApiReqInfo)
      }
    }
  }

  private resetStreamingState(): void {
    this.currentStreamingContentIndex = 0
    this.assistantMessageContent = []
    this.didCompleteReadingStream = false
    this.userMessageContent = []
    this.userMessageContentReady = false
    this.didRejectTool = false
    this.didAlreadyUseTool = false
    this.presentAssistantMessageLocked = false
    this.presentAssistantMessageHasPendingUpdates = false
    // this.didAutomaticallyRetryFailedApiRequest = false
    this.isInsideThinkingBlock = false
  }

  private async processStream(stream: any, streamMetrics: any, messageUpdater: any): Promise<string> {
    let assistantMessage = ''
    let reasoningMessage = ''
    this.isStreaming = true

    const abortStream = async (cancelReason: ChatermApiReqCancelReason, streamingFailedMessage?: string) => {
      await this.handleStreamAbort(assistantMessage, cancelReason, streamingFailedMessage, messageUpdater)
    }

    try {
      for await (const chunk of stream) {
        if (!chunk) continue

        switch (chunk.type) {
          case 'usage':
            this.handleUsageChunk(chunk, streamMetrics)
            break
          case 'reasoning':
            reasoningMessage = await this.handleReasoningChunk(chunk, reasoningMessage)
            break
          case 'text':
            assistantMessage = await this.handleTextChunk(chunk, assistantMessage, reasoningMessage)
            break
        }

        if (await this.shouldInterruptStream(assistantMessage, abortStream)) {
          break
        }
      }
    } catch (error) {
      if (!this.abandoned) {
        await this.handleStreamError(error, abortStream)
      }
    } finally {
      this.isStreaming = false
    }

    return assistantMessage
  }

  private handleUsageChunk(chunk: any, streamMetrics: any): void {
    streamMetrics.didReceiveUsageChunk = true
    streamMetrics.inputTokens += chunk.inputTokens
    streamMetrics.outputTokens += chunk.outputTokens
    streamMetrics.cacheWriteTokens += chunk.cacheWriteTokens ?? 0
    streamMetrics.cacheReadTokens += chunk.cacheReadTokens ?? 0
    streamMetrics.totalCost = chunk.totalCost
  }

  private async handleReasoningChunk(chunk: any, reasoningMessage: string): Promise<string> {
    reasoningMessage += chunk.reasoning
    if (!this.abort) {
      await this.say('reasoning', reasoningMessage, true)
    }
    return reasoningMessage
  }

  private async handleTextChunk(chunk: any, assistantMessage: string, reasoningMessage: string): Promise<string> {
    if (reasoningMessage && assistantMessage.length === 0) {
      await this.say('reasoning', reasoningMessage, false)
    }

    assistantMessage += chunk.text
    const prevLength = this.assistantMessageContent.length
    this.assistantMessageContent = parseAssistantMessageV2(assistantMessage)

    if (this.assistantMessageContent.length > prevLength) {
      this.userMessageContentReady = false
    }

    this.presentAssistantMessage()
    return assistantMessage
  }

  private async shouldInterruptStream(
    assistantMessage: string,
    abortStream: (cancelReason: ChatermApiReqCancelReason, streamingFailedMessage?: string) => Promise<void>
  ): Promise<boolean> {
    if (this.abort) {
      console.log('aborting stream...')
      if (!this.abandoned) {
        await abortStream('user_cancelled')
      }
      return true
    }

    if (this.didRejectTool) {
      assistantMessage += this.messages.responseInterruptedUserFeedback
      return true
    }

    if (this.didAlreadyUseTool) {
      assistantMessage += this.messages.responseInterruptedToolUse
      return true
    }

    return false
  }

  private async handleStreamAbort(
    assistantMessage: string,
    cancelReason: ChatermApiReqCancelReason,
    streamingFailedMessage: string | undefined,
    messageUpdater: any
  ): Promise<void> {
    const lastMessage = this.chatermMessages.at(-1)
    if (lastMessage && lastMessage.partial) {
      lastMessage.partial = false
      console.log('updating partial message', lastMessage)
    }

    await this.addToApiConversationHistory({
      role: 'assistant',
      content: [
        {
          type: 'text',
          text:
            assistantMessage +
            `\n\n[${cancelReason === 'streaming_failed' ? this.messages.responseInterruptedApiError : this.messages.responseInterruptedUser}]`
        }
      ]
    })

    messageUpdater.updateApiReqMsg(cancelReason, streamingFailedMessage)
    await this.saveChatermMessagesAndUpdateHistory()

    // telemetryService.captureConversationTurnEvent(this.taskId, await getGlobalState('apiProvider'), this.api.getModel().id, 'assistant')

    this.didFinishAbortingStream = true
  }

  private async handleStreamError(
    error: any,
    abortStream: (cancelReason: ChatermApiReqCancelReason, streamingFailedMessage?: string) => Promise<void>
  ): Promise<void> {
    this.abortTask()
    const errorMessage = this.formatErrorWithStatusCode(error)
    await abortStream('streaming_failed', errorMessage)
    await this.reinitExistingTaskFromId(this.taskId)
  }

  private async handleStreamUsageUpdate(streamMetrics: any, messageUpdater: any): Promise<void> {
    if (!streamMetrics.didReceiveUsageChunk) {
      // Asynchronously get usage statistics
      this.api.getApiStreamUsage?.().then(async (apiStreamUsage) => {
        if (apiStreamUsage) {
          streamMetrics.inputTokens += apiStreamUsage.inputTokens
          streamMetrics.outputTokens += apiStreamUsage.outputTokens
          streamMetrics.cacheWriteTokens += apiStreamUsage.cacheWriteTokens ?? 0
          streamMetrics.cacheReadTokens += apiStreamUsage.cacheReadTokens ?? 0
          streamMetrics.totalCost = apiStreamUsage.totalCost
        }
        messageUpdater.updateApiReqMsg()
        await this.saveChatermMessagesAndUpdateHistory()
        await this.postStateToWebview()
      })
    }

    if (this.abort) {
      throw new Error('Chaterm instance aborted')
    }

    this.didCompleteReadingStream = true
    this.finalizePartialBlocks()

    messageUpdater.updateApiReqMsg()
    await this.saveChatermMessagesAndUpdateHistory()
    await this.postStateToWebview()
  }

  private finalizePartialBlocks(): void {
    const partialBlocks = this.assistantMessageContent.filter((block) => block.partial)
    partialBlocks.forEach((block) => {
      block.partial = false
    })

    if (partialBlocks.length > 0) {
      this.presentAssistantMessage()
    }
  }

  private async processAssistantResponse(assistantMessage: string): Promise<boolean> {
    if (assistantMessage.length === 0) {
      return await this.handleEmptyAssistantResponse()
    }
    // telemetryService.captureConversationTurnEvent(this.taskId, await getGlobalState('apiProvider'), this.api.getModel().id, 'assistant')

    await this.addToApiConversationHistory({
      role: 'assistant',
      content: [{ type: 'text', text: assistantMessage }]
    })

    await pWaitFor(() => this.userMessageContentReady)

    return await this.recursivelyMakeChatermRequests(this.userMessageContent)
  }

  private async handleEmptyAssistantResponse(): Promise<boolean> {
    await this.say('error', this.messages.unexpectedApiResponse)

    await this.addToApiConversationHistory({
      role: 'assistant',
      content: [
        {
          type: 'text',
          text: this.messages.failureNoResponse
        }
      ]
    })

    return false
  }

  async loadContext(userContent: UserContent, includeHostDetails: boolean = false): Promise<[UserContent, string]> {
    const processUserContent = async () => {
      return await Promise.all(
        userContent.map(async (block) => {
          if (block.type === 'text') {
            // We need to ensure any user generated content is wrapped in one of these tags so that we know to parse mentions
            // FIXME: Only parse text in between these tags instead of the entire text block which may contain other tool results. This is part of a larger issue where we shouldn't be using regex to parse mentions in the first place (ie for cases where file paths have spaces)
            if (
              block.text.includes('<feedback>') ||
              block.text.includes('<answer>') ||
              block.text.includes('<task>') ||
              block.text.includes('<user_message>')
            ) {
              return {
                ...block
                //text: processedText,
              }
            }
          }
          return block
        })
      )
    }

    // Run initial promises in parallel
    const [processedUserContent, environmentDetails] = await Promise.all([processUserContent(), this.getEnvironmentDetails(includeHostDetails)])

    // Return all results
    return [processedUserContent, environmentDetails]
  }

  async getEnvironmentDetails(includeHostDetails: boolean = false) {
    let details = ''
    // Add current time information with timezone
    const now = new Date()
    const formatter = new Intl.DateTimeFormat(undefined, {
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      hour12: true
    })
    const timeZone = formatter.resolvedOptions().timeZone
    const timeZoneOffset = -now.getTimezoneOffset() / 60 // Convert to hours and invert sign to match conventional notation
    const timeZoneOffsetStr = `${timeZoneOffset >= 0 ? '+' : ''}${timeZoneOffset}:00`
    details += `\n\n# ${this.messages.currentTimeTitle}:\n${formatter.format(now)} (${timeZone}, UTC${timeZoneOffsetStr})`

    if (includeHostDetails && this.hosts && this.hosts.length > 0) {
      details += `\n\n# ${this.messages.currentHostsTitle}:\n${this.hosts.map((h) => h.host).join(', ')}`

      for (const host of this.hosts) {
        let currentCwd = this.cwd.get(host.host)
        if (!currentCwd) {
          currentCwd = (await this.executeCommandInRemoteServer('pwd', host.host))?.trim()
          this.cwd.set(host.host, currentCwd)
        }

        details += `\n\n# ${formatMessage(this.messages.hostWorkingDirectory, { host: host.host, cwd: currentCwd })}:\n`

        const res = await this.executeCommandInRemoteServer('ls -al', host.host, currentCwd)

        const processLsOutput = (output: string): string => {
          const lines = output.split('\n')
          const totalLine = lines[0]
          const fileLines = lines.slice(1).filter((line) => line.trim() !== '')
          const limitedLines = fileLines.slice(0, 200)
          let result = totalLine + '\n'
          result += limitedLines.join('\n')
          if (fileLines.length > 200) {
            result += formatMessage(this.messages.moreFilesNotShown, { count: fileLines.length - 200 })
          }
          return result
        }

        const processedOutput = processLsOutput(res)
        details += processedOutput
      }
    }

    // Add context window usage information
    const { contextWindow } = getContextWindowInfo(this.api)

    // Get the token count from the most recent API request to accurately reflect context management
    const getTotalTokensFromApiReqMessage = (msg: ChatermMessage) => {
      if (!msg.text) {
        return 0
      }
      try {
        const { tokensIn, tokensOut, cacheWrites, cacheReads } = JSON.parse(msg.text)
        return (tokensIn || 0) + (tokensOut || 0) + (cacheWrites || 0) + (cacheReads || 0)
      } catch (e) {
        return 0
      }
    }

    const modifiedMessages = combineApiRequests(combineCommandSequences(this.chatermMessages.slice(1)))
    const lastApiReqMessage = findLast(modifiedMessages, (msg) => {
      if (msg.say !== 'api_req_started') {
        return false
      }
      return getTotalTokensFromApiReqMessage(msg) > 0
    })

    const lastApiReqTotalTokens = lastApiReqMessage ? getTotalTokensFromApiReqMessage(lastApiReqMessage) : 0
    const usagePercentage = Math.round((lastApiReqTotalTokens / contextWindow) * 100)

    details += `\n\n# ${this.messages.contextWindowUsageTitle}:`
    details += `\n${formatMessage(this.messages.tokensUsed, {
      used: lastApiReqTotalTokens.toLocaleString(),
      total: (contextWindow / 1000).toLocaleString(),
      percentage: usagePercentage
    })}`

    return `<environment_details>\n${details.trim()}\n</environment_details>`
  }

  private async handleExecuteCommandToolUse(block: ToolUse) {
    let command: string | undefined = block.params.command
    let ip: string | undefined = block.params.ip
    const toolDescription = this.getToolDescription(block)
    const requiresApprovalRaw: string | undefined = block.params.requires_approval
    const requiresApprovalPerLLM = requiresApprovalRaw?.toLowerCase() === 'true'

    try {
      if (block.partial) {
        if (!this.shouldAutoApproveTool(block.name)) {
          await this.ask('command', this.removeClosingTag(block.partial, 'command', command), block.partial).catch(() => {})
        }
        return
      } else {
        if (!command) return this.handleMissingParam('command', toolDescription)
        if (!ip) return this.handleMissingParam('ip', toolDescription)
        if (!requiresApprovalRaw) return this.handleMissingParam('requires_approval', toolDescription)

        this.consecutiveMistakeCount = 0
        let didAutoApprove = false
        const chatSettings = await getGlobalState('chatSettings')

        if (chatSettings?.mode === 'cmd') {
          await this.askApproval(toolDescription, 'command', command) // Wait for frontend to execute command and return result
          return
        }

        const autoApproveResult = this.shouldAutoApproveTool(block.name)
        let [autoApproveSafe, autoApproveAll] = Array.isArray(autoApproveResult) ? autoApproveResult : [autoApproveResult, false]

        if ((!requiresApprovalPerLLM && autoApproveSafe) || (requiresApprovalPerLLM && autoApproveSafe && autoApproveAll)) {
          this.removeLastPartialMessageIfExistsWithType('ask', 'command')
          await this.say('command', command, false)
          this.consecutiveAutoApprovedRequestsCount++
          didAutoApprove = true
        } else {
          this.showNotificationIfNeeded(`Chaterm wants to execute a command: ${command}`)
          const didApprove = await this.askApproval(toolDescription, 'command', command)
          if (!didApprove) {
            await this.saveCheckpoint()
            return
          }
        }

        let timeoutId: NodeJS.Timeout | undefined
        if (didAutoApprove && this.autoApprovalSettings.enableNotifications) {
          timeoutId = setTimeout(() => {
            showSystemNotification({
              subtitle: 'Command is still running',
              message: 'An auto-approved command has been running for 30s, and may need your attention.'
            })
          }, 30_000)
        }
        const ipList = ip!.split(',')
        let result = ''
        for (const ip of ipList) {
          result += `\n\n# Executing result on ${ip}:`
          result += await this.executeCommandTool(command!, ip!)
        }
        if (timeoutId) {
          clearTimeout(timeoutId)
        }

        this.workspaceTracker.populateFilePaths()

        this.pushToolResult(toolDescription, result)

        await this.saveCheckpoint()
      }
    } catch (error) {
      await this.handleToolError(toolDescription, 'executing command', error as Error)
      await this.saveCheckpoint()
    }
  }
  private async handleMissingParam(paramName: string, toolDescription: string): Promise<void> {
    this.consecutiveMistakeCount++
    this.pushToolResult(toolDescription, await this.sayAndCreateMissingParamError('execute_command', paramName))
    return this.saveCheckpoint()
  }

  private getToolDescription(block: any): string {
    switch (block.name) {
      case 'execute_command':
        return `[${block.name} for '${block.params.command}']`
      case 'ask_followup_question':
        return `[${block.name} for '${block.params.question}']`
      case 'attempt_completion':
        return `[${block.name}]`
      case 'new_task':
        return `[${block.name} for creating a new task]`
      case 'condense':
        return `[${block.name}]`
      case 'report_bug':
        return `[${block.name}]`
      default:
        return `[${block.name}]`
    }
  }

  private pushToolResult(toolDescription: string, content: ToolResponse): void {
    this.userMessageContent.push({
      type: 'text',
      text: `${toolDescription} Result:`
    })
    if (typeof content === 'string') {
      this.userMessageContent.push({
        type: 'text',
        text: content || '(tool did not return anything)'
      })
    } else {
      this.userMessageContent.push(...content)
    }
    this.didAlreadyUseTool = true
  }

  private pushAdditionalToolFeedback(feedback?: string): void {
    if (!feedback) return
    const truncatedFeedback = this.truncateCommandOutput(feedback)
    const content = formatResponse.toolResult(formatMessage(this.messages.userProvidedFeedback, { feedback: truncatedFeedback }))
    if (typeof content === 'string') {
      this.userMessageContent.push({ type: 'text', text: content })
    } else {
      this.userMessageContent.push(...content)
    }
  }

  private async askApproval(toolDescription: string, type: ChatermAsk, partialMessage?: string): Promise<boolean> {
    const { response, text } = await this.ask(type, partialMessage, false)
    const approved = response === 'yesButtonClicked'
    if (!approved) {
      this.pushToolResult(toolDescription, formatResponse.toolDenied())
      if (text) {
        this.pushAdditionalToolFeedback(text)
        await this.say('user_feedback', text)
        await this.saveCheckpoint()
      }
      this.didRejectTool = true
    } else if (text) {
      this.pushAdditionalToolFeedback(text)
      await this.say('user_feedback', text)
      await this.saveCheckpoint()
    }
    return approved
  }

  private showNotificationIfNeeded(message: string): void {
    if (this.autoApprovalSettings.enabled && this.autoApprovalSettings.enableNotifications) {
      showSystemNotification({ subtitle: 'Approval Required', message })
    }
  }

  private removeClosingTag(isPartial: boolean, tag: ToolParamName, text?: string): string {
    if (!isPartial) return text || ''
    if (!text) return ''
    const tagRegex = new RegExp(
      `\\s?<\\/?${tag
        .split('')
        .map((c) => `(?:${c})?`)
        .join('')}$`,
      'g'
    )
    return text.replace(tagRegex, '')
  }

  private async handleToolError(toolDescription: string, action: string, error: Error): Promise<void> {
    if (this.abandoned) {
      console.log('Ignoring error since task was abandoned')
      return
    }
    const errorString = `Error ${action}: ${JSON.stringify(serializeError(error))}`
    await this.say('error', `Error ${action}:\n${error.message ?? JSON.stringify(serializeError(error), null, 2)}`)
    this.pushToolResult(toolDescription, formatResponse.toolError(errorString))
  }

  private async handleAskFollowupQuestionToolUse(block: ToolUse): Promise<void> {
    const toolDescription = this.getToolDescription(block)
    const question: string | undefined = block.params.question
    const optionsRaw: string | undefined = block.params.options

    const sharedMessage: ChatermAskQuestion = {
      question: this.removeClosingTag(block.partial, 'question', question),
      options: parsePartialArrayString(this.removeClosingTag(block.partial, 'options', optionsRaw))
    }

    try {
      if (block.partial) {
        await this.ask('followup', JSON.stringify(sharedMessage), block.partial).catch(() => {})
        return
      }

      if (!question) {
        this.consecutiveMistakeCount++
        this.pushToolResult(toolDescription, await this.sayAndCreateMissingParamError('ask_followup_question', 'question'))
        await this.saveCheckpoint()
        return
      }
      this.consecutiveMistakeCount = 0

      if (this.autoApprovalSettings.enabled && this.autoApprovalSettings.enableNotifications) {
        showSystemNotification({
          subtitle: 'Chaterm has a question...',
          message: question.replace(/\n/g, ' ')
        })
      }
      // Store the number of options for telemetry
      const options = parsePartialArrayString(optionsRaw || '[]')

      const { text } = await this.ask('followup', JSON.stringify(sharedMessage), false)

      if (optionsRaw && text && parsePartialArrayString(optionsRaw).includes(text)) {
        const lastFollowupMessage = findLast(this.chatermMessages, (m) => m.ask === 'followup')
        if (lastFollowupMessage) {
          lastFollowupMessage.text = JSON.stringify({
            ...sharedMessage,
            selected: text
          } as ChatermAskQuestion)
          await this.saveChatermMessagesAndUpdateHistory()
          telemetryService.captureOptionSelected(this.taskId, options.length, 'act')
        }
      } else {
        telemetryService.captureOptionsIgnored(this.taskId, options.length, 'act')
        await this.say('user_feedback', text ?? '')
      }

      this.pushToolResult(toolDescription, formatResponse.toolResult(`<answer>\n${text}\n</answer>`))
      await this.saveCheckpoint()
    } catch (error) {
      await this.handleToolError(toolDescription, 'asking question', error as Error)
      await this.saveCheckpoint()
    }
  }

  private async handleAttemptCompletionToolUse(block: ToolUse): Promise<void> {
    const toolDescription = this.getToolDescription(block)
    const result: string | undefined = block.params.result
    const command: string | undefined = block.params.command
    const ip: string | undefined = block.params.ip

    const addNewChangesFlagToLastCompletionResultMessage = async () => {
      const hasNewChanges = await this.doesLatestTaskCompletionHaveNewChanges()
      const lastCompletionResultMessage = findLast(this.chatermMessages, (m) => m.say === 'completion_result')
      if (lastCompletionResultMessage && hasNewChanges && !lastCompletionResultMessage.text?.endsWith(COMPLETION_RESULT_CHANGES_FLAG)) {
        lastCompletionResultMessage.text += COMPLETION_RESULT_CHANGES_FLAG
      }
      await this.saveChatermMessagesAndUpdateHistory()
    }

    try {
      const lastMessage = this.chatermMessages.at(-1)

      if (block.partial) {
        if (command) {
          if (lastMessage && lastMessage.ask === 'command') {
            await this.ask('command', this.removeClosingTag(block.partial, 'command', command), block.partial).catch(() => {})
          } else {
            await this.say('completion_result', this.removeClosingTag(block.partial, 'result', result), false)
            await this.saveCheckpoint(true)
            await addNewChangesFlagToLastCompletionResultMessage()
            await this.ask('command', this.removeClosingTag(block.partial, 'command', command), block.partial).catch(() => {})
          }
        } else {
          await this.say('completion_result', this.removeClosingTag(block.partial, 'result', result), block.partial)
        }
        return
      }

      if (!result) {
        this.consecutiveMistakeCount++
        this.pushToolResult(toolDescription, await this.sayAndCreateMissingParamError('attempt_completion', 'result'))
        return
      }
      this.consecutiveMistakeCount = 0

      if (this.autoApprovalSettings.enabled && this.autoApprovalSettings.enableNotifications) {
        showSystemNotification({ subtitle: 'Task Completed', message: result.replace(/\n/g, ' ') })
      }

      let commandResult: ToolResponse | undefined
      if (command) {
        if (lastMessage && lastMessage.ask !== 'command') {
          await this.say('completion_result', result, false)
          await this.saveCheckpoint(true)
          await addNewChangesFlagToLastCompletionResultMessage()
          telemetryService.captureTaskCompleted(this.taskId)
        } else {
          await this.saveCheckpoint(true)
        }

        const didApprove = await this.askApproval(toolDescription, 'command', command)
        if (!didApprove) {
          await this.saveCheckpoint()
          return
        }
        const execCommandResult = await this.executeCommandTool(command!, ip!)
        commandResult = execCommandResult
      } else {
        await this.say('completion_result', result, false)
        await this.saveCheckpoint(true)
        await addNewChangesFlagToLastCompletionResultMessage()
        telemetryService.captureTaskCompleted(this.taskId)
      }

      const { response, text } = await this.ask('completion_result', '', false)
      if (response === 'yesButtonClicked') {
        this.pushToolResult(toolDescription, '')
        return
      }
      await this.say('user_feedback', text ?? '')
      await this.saveCheckpoint()

      const toolResults: (Anthropic.TextBlockParam | Anthropic.ImageBlockParam)[] = []
      if (commandResult) {
        if (typeof commandResult === 'string') {
          toolResults.push({ type: 'text', text: commandResult })
        } else if (Array.isArray(commandResult)) {
          toolResults.push(...commandResult)
        }
      }
      toolResults.push({
        type: 'text',
        text: `The user has provided feedback on the results. Consider their input to continue the task, and then attempt completion again.\n<feedback>\n${text}\n</feedback>`
      })
      this.userMessageContent.push({ type: 'text', text: `${toolDescription} Result:` })
      this.userMessageContent.push(...toolResults)
    } catch (error) {
      await this.handleToolError(toolDescription, 'attempting completion', error as Error)
      await this.saveCheckpoint()
    }
  }

  private async handleCondenseToolUse(block: ToolUse): Promise<void> {
    const toolDescription = this.getToolDescription(block)
    const context: string | undefined = block.params.context
    try {
      if (block.partial) {
        await this.ask('condense', this.removeClosingTag(block.partial, 'context', context), block.partial).catch(() => {})
        return
      }
      if (!context) {
        this.consecutiveMistakeCount++
        this.pushToolResult(toolDescription, await this.sayAndCreateMissingParamError('condense', 'context'))
        await this.saveCheckpoint()
        return
      }
      this.consecutiveMistakeCount = 0

      if (this.autoApprovalSettings.enabled && this.autoApprovalSettings.enableNotifications) {
        showSystemNotification({
          subtitle: 'Chaterm wants to condense the conversation...',
          message: `Chaterm is suggesting to condense your conversation with: ${context}`
        })
      }

      const { text } = await this.ask('condense', context, false)

      if (text) {
        await this.say('user_feedback', text ?? '')
        this.pushToolResult(
          toolDescription,
          formatResponse.toolResult(`The user provided feedback on the condensed conversation summary:\n<feedback>\n${text}\n</feedback>`)
        )
      } else {
        this.pushToolResult(toolDescription, formatResponse.toolResult(formatResponse.condense()))

        const lastMessage = this.apiConversationHistory[this.apiConversationHistory.length - 1]
        const summaryAlreadyAppended = lastMessage && lastMessage.role === 'assistant'
        const keepStrategy = summaryAlreadyAppended ? 'lastTwo' : 'none'

        this.conversationHistoryDeletedRange = this.contextManager.getNextTruncationRange(
          this.apiConversationHistory,
          this.conversationHistoryDeletedRange,
          keepStrategy
        )
        await this.saveChatermMessagesAndUpdateHistory()
        await this.contextManager.triggerApplyStandardContextTruncationNoticeChange(Date.now(), this.taskId)
      }
      await this.saveCheckpoint()
    } catch (error) {
      await this.handleToolError(toolDescription, 'condensing context window', error as Error)
      await this.saveCheckpoint()
    }
  }

  private async handleReportBugToolUse(block: ToolUse): Promise<void> {
    const toolDescription = this.getToolDescription(block)
    const { title, what_happened, steps_to_reproduce, api_request_output, additional_context } = block.params

    try {
      if (block.partial) {
        await this.ask(
          'report_bug',
          JSON.stringify({
            title: this.removeClosingTag(block.partial, 'title', title),
            what_happened: this.removeClosingTag(block.partial, 'what_happened', what_happened),
            steps_to_reproduce: this.removeClosingTag(block.partial, 'steps_to_reproduce', steps_to_reproduce),
            api_request_output: this.removeClosingTag(block.partial, 'api_request_output', api_request_output),
            additional_context: this.removeClosingTag(block.partial, 'additional_context', additional_context)
          }),
          block.partial
        ).catch(() => {})
        return
      }

      const requiredCheck = async (val: any, name: string): Promise<boolean> => {
        if (!val) {
          this.consecutiveMistakeCount++
          this.pushToolResult(toolDescription, await this.sayAndCreateMissingParamError('report_bug', name))
          await this.saveCheckpoint()
          return false
        }
        return true
      }
      if (
        !(await requiredCheck(title, 'title')) ||
        !(await requiredCheck(what_happened, 'what_happened')) ||
        !(await requiredCheck(steps_to_reproduce, 'steps_to_reproduce')) ||
        !(await requiredCheck(api_request_output, 'api_request_output')) ||
        !(await requiredCheck(additional_context, 'additional_context'))
      ) {
        return
      }

      this.consecutiveMistakeCount = 0

      if (this.autoApprovalSettings.enabled && this.autoApprovalSettings.enableNotifications) {
        showSystemNotification({
          subtitle: 'Chaterm wants to create a github issue...',
          message: `Chaterm is suggesting to create a github issue with the title: ${title}`
        })
      }

      const operatingSystem = os.platform() + ' ' + os.release()
      const providerAndModel = `${(await getGlobalState('apiProvider')) as string} / ${this.api.getModel().id}`

      const bugReportData = JSON.stringify({
        title,
        what_happened,
        steps_to_reproduce,
        api_request_output,
        additional_context,
        provider_and_model: providerAndModel,
        operating_system: operatingSystem
      })

      const { text } = await this.ask('report_bug', bugReportData, false)
      if (text) {
        await this.say('user_feedback', text ?? '')
        this.pushToolResult(
          toolDescription,
          formatResponse.toolResult(
            `The user did not submit the bug, and provided feedback on the Github issue generated instead:\n<feedback>\n${text}\n</feedback>`
          )
        )
      } else {
        this.pushToolResult(toolDescription, formatResponse.toolResult('The user accepted the creation of the Github issue.'))
        // Logic to create an issue can be added here
      }
      await this.saveCheckpoint()
    } catch (error) {
      await this.handleToolError(toolDescription, 'reporting bug', error as Error)
      await this.saveCheckpoint()
    }
  }

  private async handleToolUse(block: ToolUse): Promise<void> {
    const toolDescription = this.getToolDescription(block)

    if (this.didRejectTool) {
      if (!block.partial) {
        this.userMessageContent.push({
          type: 'text',
          text: `Skipping tool ${toolDescription} due to user rejecting a previous tool.`
        })
      } else {
        this.userMessageContent.push({
          type: 'text',
          text: `Tool ${toolDescription} was interrupted and not executed due to user rejecting a previous tool.`
        })
      }
      return
    }

    if (this.didAlreadyUseTool) {
      this.userMessageContent.push({
        type: 'text',
        text: formatResponse.toolAlreadyUsed(block.name)
      })
      return
    }

    switch (block.name) {
      case 'execute_command':
        await this.handleExecuteCommandToolUse(block)
        break
      case 'ask_followup_question':
        await this.handleAskFollowupQuestionToolUse(block)
        break
      case 'condense':
        await this.handleCondenseToolUse(block)
        break
      case 'report_bug':
        await this.handleReportBugToolUse(block)
        break
      case 'attempt_completion':
        await this.handleAttemptCompletionToolUse(block)
        break
    }
  }

  private async handleTextBlock(block: TextContent): Promise<void> {
    // If previously rejected or tool executed, ignore plain text updates
    if (this.didRejectTool || this.didAlreadyUseTool) return

    let content = block.content
    if (content) {
      // Handle streaming <thinking> tags
      content = this.processThinkingTags(content)

      const lastOpenBracketIndex = content.lastIndexOf('<')
      if (lastOpenBracketIndex !== -1) {
        const possibleTag = content.slice(lastOpenBracketIndex)
        // Check if there's a '>' after the last '<' (i.e., if the tag is complete) (complete thinking and tool tags will have been removed by now)
        const hasCloseBracket = possibleTag.includes('>')
        if (!hasCloseBracket) {
          // Extract the potential tag name
          let tagContent: string
          if (possibleTag.startsWith('</')) {
            tagContent = possibleTag.slice(2).trim()
          } else {
            tagContent = possibleTag.slice(1).trim()
          }
          // Check if tagContent is likely an incomplete tag name (letters and underscores only)
          const isLikelyTagName = /^[a-zA-Z_]+$/.test(tagContent)
          // Preemptively remove < or </ to keep from these artifacts showing up in chat (also handles closing thinking tags)
          const isOpeningOrClosing = possibleTag === '<' || possibleTag === '</'
          // If the tag is incomplete and at the end, remove it from the content
          if (isOpeningOrClosing || isLikelyTagName) {
            content = content.slice(0, lastOpenBracketIndex).trim()
          }
        }
      }
    }

    // Clean up potential trailing noise from code blocks for the complete block
    if (!block.partial) {
      const match = content?.trimEnd().match(/```[a-zA-Z0-9_-]+$/)
      if (match) {
        content = content.trimEnd().slice(0, -match[0].length)
      }
    }

    await this.say('text', content, block.partial)

    // If this is a complete text block and the last content block, wait for user input
    if (!block.partial && this.currentStreamingContentIndex === this.assistantMessageContent.length - 1) {
      // Check if there is a tool call
      // const hasToolUse = this.assistantMessageContent.some((block) => block.type === 'tool_use')

      // if (!hasToolUse) {
      const { response, text } = await this.ask('followup', '', false)

      if (response === 'yesButtonClicked') {
        return
      }

      if (text) {
        await this.say('user_feedback', text)
        this.userMessageContent.push({
          type: 'text',
          text: `The user has provided feedback on the response. Consider their input to continue the conversation.\n<feedback>\n${text}\n</feedback>`
        })
      }

      this.didAlreadyUseTool = true
      // }
    }
  }

  private processThinkingTags(content: string): string {
    if (!content) return content

    // If currently inside a thinking block, check for an end tag
    if (this.isInsideThinkingBlock) {
      const endIndex = content.indexOf('</thinking>')
      if (endIndex !== -1) {
        // Found end tag, exit thinking block state, return content after end tag
        this.isInsideThinkingBlock = false
        return content.slice(endIndex + '</thinking>'.length)
      } else {
        // Still inside thinking block, remove all content
        return ''
      }
    }

    const startIndex = content.indexOf('<thinking>')
    if (startIndex !== -1) {
      // Found start tag
      const beforeThinking = content.slice(0, startIndex)
      const afterThinking = content.slice(startIndex + '<thinking>'.length)

      const endIndex = afterThinking.indexOf('</thinking>')
      if (endIndex !== -1) {
        const afterThinkingBlock = afterThinking.slice(endIndex + '</thinking>'.length)
        return beforeThinking + afterThinkingBlock
      } else {
        this.isInsideThinkingBlock = true
        return beforeThinking
      }
    }

    return content
  }

  private async buildSystemPrompt(): Promise<string> {
    const chatSettings = await getGlobalState('chatSettings')

    // Get user language setting from renderer process
    let userLanguage = DEFAULT_LANGUAGE_SETTINGS
    try {
      const userConfig = await getUserConfig()
      if (userConfig && userConfig.language) {
        userLanguage = userConfig.language
      }
    } catch (error) {}

    // Select system prompt based on language and mode
    let systemPrompt
    if (userLanguage === 'zh-CN') {
      if (chatSettings?.mode === 'chat') {
        systemPrompt = SYSTEM_PROMPT_CHAT_CN
      } else {
        systemPrompt = SYSTEM_PROMPT_CN
      }
    } else {
      if (chatSettings?.mode === 'chat') {
        systemPrompt = SYSTEM_PROMPT_CHAT
      } else {
        systemPrompt = SYSTEM_PROMPT
      }
    }
    // Update messages language before building system information

    let systemInformation = `# ${this.messages.systemInformationTitle}\n\n`

    // Check if hosts exist and are not empty
    if (!this.hosts || this.hosts.length === 0) {
      console.warn('No hosts configured, skipping system information collection')
      systemInformation += this.messages.noHostsConfigured + '\n'
    } else {
      console.log(`Collecting system information for ${this.hosts.length} host(s)`)

      for (const host of this.hosts) {
        try {
          // Check cache, if no cache, get system info and cache it
          let hostInfo = this.hostSystemInfoCache.get(host.host)
          if (!hostInfo) {
            console.log(`Fetching system information for host: ${host.host}`)

            // Optimization: Get all system information at once to avoid multiple network requests
            const systemInfoScript = `echo "OS_VERSION:$(uname -a)" && echo "DEFAULT_SHELL:$SHELL" && echo "HOME_DIR:$HOME" && echo "HOSTNAME:$HOSTNAME" && echo "USERNAME:$(whoami)" && echo "SUDO_CHECK:$(sudo -n true 2>/dev/null && echo 'has sudo permission' || echo 'no sudo permission')"`

            const systemInfoOutput = await this.executeCommandInRemoteServer(systemInfoScript, host.host)
            console.log(`System info output for ${host.host}:`, systemInfoOutput)

            // Parse output result
            const parseSystemInfo = (
              output: string
            ): {
              osVersion: string
              defaultShell: string
              homeDir: string
              hostName: string
              userName: string
              sudoCheck: string
            } => {
              const lines = output.split('\n').filter((line) => line.trim())
              const info = {
                osVersion: '',
                defaultShell: '',
                homeDir: '',
                hostName: '',
                userName: '',
                sudoCheck: ''
              }

              lines.forEach((line) => {
                const [key, ...valueParts] = line.split(':')
                const value = valueParts.join(':').trim()

                switch (key) {
                  case 'OS_VERSION':
                    info.osVersion = value
                    break
                  case 'DEFAULT_SHELL':
                    info.defaultShell = value
                    break
                  case 'HOME_DIR':
                    info.homeDir = value
                    break
                  case 'HOSTNAME':
                    info.hostName = value
                    break
                  case 'USERNAME':
                    info.userName = value
                    break
                  case 'SUDO_CHECK':
                    info.sudoCheck = value
                    break
                }
              })

              return info
            }

            hostInfo = parseSystemInfo(systemInfoOutput)
            console.log(`Parsed system info for ${host.host}:`, hostInfo)

            // Cache system information
            this.hostSystemInfoCache.set(host.host, hostInfo)
          } else {
            console.log(`Using cached system information for host: ${host.host}`)
          }

          systemInformation += `
            ## Host: ${host.host}
            ${this.messages.osVersion}: ${hostInfo.osVersion}
            ${this.messages.defaultShell}: ${hostInfo.defaultShell}
            ${this.messages.homeDirectory}: ${hostInfo.homeDir.toPosix()}
            ${this.messages.currentWorkingDirectory}: ${this.cwd.get(host.host) || hostInfo.homeDir}
            ${this.messages.hostname}: ${hostInfo.hostName}
            ${this.messages.user}: ${hostInfo.userName}
            ${this.messages.sudoAccess}: ${hostInfo.sudoCheck}
            ====
          `
        } catch (error) {
          console.error(`Failed to get system information for host ${host.host}:`, error)
          // Even if getting system information fails, add basic information
          systemInformation += `
            ## Host: ${host.host}
            ${this.messages.osVersion}: ${this.messages.unableToRetrieve} (${error instanceof Error ? error.message : this.messages.unknown})
            ${this.messages.defaultShell}: ${this.messages.unableToRetrieve}
            ${this.messages.homeDirectory}: ${this.messages.unableToRetrieve}
            ${this.messages.currentWorkingDirectory}: ${this.cwd.get(host.host) || this.messages.unknown}
            ${this.messages.hostname}: ${this.messages.unableToRetrieve}
            ${this.messages.user}: ${this.messages.unableToRetrieve}
            ${this.messages.sudoAccess}: ${this.messages.unableToRetrieve}
            ====
          `
        }
      }
    }

    console.log('Final system information section:', systemInformation)
    systemPrompt += systemInformation

    const settingsCustomInstructions = this.customInstructions?.trim()

    const preferredLanguageInstructions = `# ${this.messages.languageSettingsTitle}:\n\n${formatMessage(this.messages.defaultLanguage, { language: userLanguage })}\n\n${this.messages.languageRules}`
    if (settingsCustomInstructions || preferredLanguageInstructions) {
      const userInstructions = addUserInstructions(userLanguage, settingsCustomInstructions, preferredLanguageInstructions)
      systemPrompt += userInstructions
    }

    return systemPrompt
  }
}
