import { Anthropic } from '@anthropic-ai/sdk'
import cloneDeep from 'clone-deep'
import { setTimeout as setTimeoutPromise } from 'node:timers/promises'
import os from 'os'
import { v4 as uuidv4 } from 'uuid'

import pWaitFor from 'p-wait-for'
import { serializeError } from 'serialize-error'
import { ApiHandler, buildApiHandler } from '@api/index'
import { ApiStream } from '@api/transform/stream'
import { formatContentBlockToMarkdown } from '@integrations/misc/export-markdown'
import { showSystemNotification } from '@integrations/notifications'
import { ApiConfiguration } from '@shared/api'
import { findLast, findLastIndex, parsePartialArrayString } from '@shared/array'
import { AutoApprovalSettings } from '@shared/AutoApprovalSettings'
import { ChatSettings } from '@shared/ChatSettings'
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
import {
  AssistantMessageContent,
  parseAssistantMessageV2,
  ToolParamName,
  ToolUseName,
  TextContent,
  ToolUse
} from '@core/assistant-message'
import {
  RemoteTerminalManager,
  ConnectionInfo,
  RemoteTerminalInfo
} from '../../integrations/remote-terminal'
import { formatResponse } from '@core/prompts/responses'
import { addUserInstructions, SYSTEM_PROMPT } from '@core/prompts/system'
import { getContextWindowInfo } from '@core/context/context-management/context-window-utils'
import { ModelContextTracker } from '@core/context/context-tracking/ModelContextTracker'
import { ContextManager } from '@core/context/context-management/ContextManager'
import {
  getSavedApiConversationHistory,
  getChatermMessages,
  saveApiConversationHistory,
  saveChatermMessages
} from '@core/storage/disk'

import { getGlobalState } from '@core/storage/state'
import WorkspaceTracker from '@integrations/workspace/WorkspaceTracker'
import { connectAssetInfo } from '../../../storage/database'

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
  hosts?: Host[]
  terminalOutput?: string = ''
  cwd: string = ''
  private taskIsFavorited?: boolean
  api: ApiHandler
  contextManager: ContextManager
  private remoteTerminalManager: RemoteTerminalManager
  customInstructions?: string
  autoApprovalSettings: AutoApprovalSettings
  chatSettings: ChatSettings
  apiConversationHistory: Anthropic.MessageParam[] = []
  chatermMessages: ChatermMessage[] = []
  // private chatermIgnoreController: ChatermIgnoreController
  private askResponse?: ChatermAskResponse
  private askResponseText?: string
  private lastMessageTs?: number
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
  private didAutomaticallyRetryFailedApiRequest = false

  constructor(
    workspaceTracker: WorkspaceTracker,
    updateTaskHistory: (historyItem: HistoryItem) => Promise<HistoryItem[]>,
    postStateToWebview: () => Promise<void>,
    postMessageToWebview: (message: ExtensionMessage) => Promise<void>,
    reinitExistingTaskFromId: (taskId: string) => Promise<void>,
    apiConfiguration: ApiConfiguration,
    autoApprovalSettings: AutoApprovalSettings,
    chatSettings: ChatSettings,
    customInstructions?: string,
    task?: string,
    historyItem?: HistoryItem,
    hosts?: Host[],
    terminalOutput?: string,
    cwd?: string
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
    this.chatSettings = chatSettings
    this.hosts = hosts
    this.terminalOutput = terminalOutput
    this.cwd = cwd || ''
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
  }

  private async executeCommandInRemoteServer(command: string, cwd?: string): Promise<string> {
    const terminalInfo = await this.connectTerminal()
    if (!terminalInfo) {
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
      const apiMetrics = getApiMetrics(
        combineApiRequests(combineCommandSequences(this.chatermMessages.slice(1)))
      )
      const taskMessage = this.chatermMessages[0] // first message is always the task say
      const lastRelevantMessage =
        this.chatermMessages[
          findLastIndex(
            this.chatermMessages,
            (m) => !(m.ask === 'resume_task' || m.ask === 'resume_completed_task')
          )
        ]

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
    const lastTaskCompletedMessage = findLast(
      this.chatermMessages.slice(0, messageIndex),
      (m) => m.say === 'completion_result'
    )

    try {
      // Get last task completed
      const lastTaskCompletedMessageCheckpointHash = lastTaskCompletedMessage?.lastCheckpointHash // ask is only used to relinquish control, its the last say we care about
      // if undefined, then we get diff from beginning of git
      // if (!lastTaskCompletedMessage) {
      // 	console.error("No previous task completion message found")
      // 	return
      // }
      // This value *should* always exist
      const firstCheckpointMessageCheckpointHash = this.chatermMessages.find(
        (m) => m.say === 'checkpoint_created'
      )?.lastCheckpointHash

      const previousCheckpointHash =
        lastTaskCompletedMessageCheckpointHash || firstCheckpointMessageCheckpointHash // either use the diff between the first checkpoint and the task completion, or the diff between the latest two task completions

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

  private async handleAskPartialMessage(
    type: ChatermAsk,
    askTsRef: { value: number },
    text?: string,
    isPartial?: boolean
  ): Promise<void> {
    const lastMessage = this.chatermMessages.at(-1)
    const isUpdatingPreviousPartial =
      lastMessage && lastMessage.partial && lastMessage.type === 'ask' && lastMessage.ask === type

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
        // 添加新的部分消息
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
      // 完成部分消息
      this.resetAskState()

      if (isUpdatingPreviousPartial) {
        // 更新为完整版本
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
        // 添加新的完整消息
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

  async handleWebviewAskResponse(askResponse: ChatermAskResponse, text?: string, cwd?: string) {
    this.askResponse = askResponse
    this.askResponseText = text
    if (cwd) {
      this.cwd = cwd
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

  private async handleSayPartialMessage(
    type: ChatermSay,
    text?: string,
    partial?: boolean
  ): Promise<void> {
    const lastMessage = this.chatermMessages.at(-1)
    const isUpdatingPreviousPartial =
      lastMessage && lastMessage.partial && lastMessage.type === 'say' && lastMessage.say === type
    if (partial) {
      if (isUpdatingPreviousPartial) {
        // existing partial message, so update it
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

  async removeLastPartialMessageIfExistsWithType(
    type: 'ask' | 'say',
    askOrSay: ChatermAsk | ChatermSay
  ) {
    const lastMessage = this.chatermMessages.at(-1)
    if (
      lastMessage?.partial &&
      lastMessage.type === type &&
      (lastMessage.ask === askOrSay || lastMessage.say === askOrSay)
    ) {
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
    const lastRelevantMessageIndex = findLastIndex(
      modifiedChatermMessages,
      (m) => !(m.ask === 'resume_task' || m.ask === 'resume_completed_task')
    )
    if (lastRelevantMessageIndex !== -1) {
      modifiedChatermMessages.splice(lastRelevantMessageIndex + 1)
    }

    // since we don't use api_req_finished anymore, we need to check if the last api_req_started has a cost value, if it doesn't and no cancellation reason to present, then we remove it since it indicates an api request without any partial content streamed
    const lastApiReqStartedIndex = findLastIndex(
      modifiedChatermMessages,
      (m) => m.type === 'say' && m.say === 'api_req_started'
    )
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

    const existingApiConversationHistory: Anthropic.Messages.MessageParam[] =
      await getSavedApiConversationHistory(this.taskId)

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

    const [taskResumptionMessage, userResponseMessage] = formatResponse.taskResumption(
      this.chatSettings?.mode,
      agoText,
      this.cwd,
      wasRecent,
      responseText
    )

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
      const didEndLoop = await this.recursivelyMakeChatermRequests(
        nextUserContent,
        includeHostDetails
      )
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
      const lastCompletionResultMessage = findLast(
        this.chatermMessages,
        (m) => m.say === 'completion_result' || m.ask === 'completion_result'
      )
      if (lastCompletionResultMessage) {
        // lastCompletionResultMessage.lastCheckpointHash = commitHash
        await this.saveChatermMessagesAndUpdateHistory()
      }
    }
  }

  async executeCommandTool(command: string, ip: string): Promise<[boolean, ToolResponse]> {
    const terminalInfo = await this.connectTerminal(ip)
    if (!terminalInfo) {
      return [false, 'Failed to connect to terminal']
    }
    terminalInfo.terminal.show()
    const process = this.remoteTerminalManager.runCommand(terminalInfo, command, this.cwd)
    let execResult = ''
    process.on('line', async (line) => {
      execResult += line + '\n'
    })
    if (execResult.length == 0) {
      await this.say('command_output', 'chaterm command no output was returned.', true)
    }

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
      const chunk = outputBuffer.join('\n')
      outputBuffer = []
      outputBufferSize = 0
      chunkEnroute = true
      try {
        await this.say('command_output', chunk, true)
        process.continue()
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
    // the correct order of messages (although the webview is smart about
    // grouping command_output messages despite any gaps anyways)
    await setTimeoutPromise(50)

    const lastMessage = this.chatermMessages.at(-1)
    if (lastMessage?.say === 'command_output') {
      await this.say('command_output', lastMessage.text, false)
    }
    result = result.trim()

    if (completed) {
      return [false, `Command executed.${result.length > 0 ? `\nOutput:\n${result}` : ''}`]
    } else {
      return [
        false,
        `Command is still running in the user\'s terminal.${
          result.length > 0 ? `\nHere\'s the output so far:\n${result}` : ''
        }\n\nYou will be updated on the terminal status and new output in the future.`
      ]
    }
  }
  // Check if the tool should be auto-approved based on the settings
  // Returns bool for most tools, and tuple for tools with nested settings
  shouldAutoApproveTool(toolName: ToolUseName): boolean | [boolean, boolean] {
    if (this.autoApprovalSettings.enabled) {
      switch (toolName) {
        case 'execute_command':
          return [
            this.autoApprovalSettings.actions.executeSafeCommands ?? false,
            this.autoApprovalSettings.actions.executeAllCommands ?? false
          ]
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
    return statusCode && !message.includes(statusCode.toString())
      ? `${statusCode} - ${message}`
      : message
  }

  async *attemptApiRequest(previousApiReqIndex: number): ApiStream {
    const osVersion = await this.executeCommandInRemoteServer('uname -a')
    const defaultShell = await this.executeCommandInRemoteServer('echo $SHELL')
    const homeDir = await this.executeCommandInRemoteServer('echo $HOME')

    let systemPrompt = await SYSTEM_PROMPT(this.cwd)

    systemPrompt += `
      SYSTEM INFORMATION

      Operating System: ${osVersion}
      Default Shell: ${defaultShell}
      Home Directory: ${homeDir.toPosix()}
      Current Working Directory: ${this.cwd.toPosix()}
      ====
    `
    let settingsCustomInstructions = this.customInstructions?.trim()
    const preferredLanguageInstructions = `# Preferred Language\n\nSpeak in ${DEFAULT_LANGUAGE_SETTINGS}.`
    if (settingsCustomInstructions || preferredLanguageInstructions) {
      // altering the system prompt mid-task will break the prompt cache, but in the grand scheme this will not change often so it's better to not pollute user messages with it the way we have to with <potentially relevant details>
      const userInstructions = addUserInstructions(
        settingsCustomInstructions,
        preferredLanguageInstructions
      )
      systemPrompt += userInstructions
    }
    const contextManagementMetadata = await this.contextManager.getNewContextMessagesAndMetadata(
      this.apiConversationHistory,
      this.chatermMessages,
      this.api,
      this.conversationHistoryDeletedRange,
      previousApiReqIndex,
      this.taskId
    )

    if (contextManagementMetadata.updatedConversationHistoryDeletedRange) {
      this.conversationHistoryDeletedRange =
        contextManagementMetadata.conversationHistoryDeletedRange
      await this.saveChatermMessagesAndUpdateHistory() // saves task history item which we use to keep track of conversation history deleted range
    }

    // 加入当前的服务器的上下文信息
    // if (this.terminalOutput && this.terminalOutput.trim().length > 0) {
    //   systemPrompt += `

    //     # Current Session Terminal History:
    //     <terminal_history>
    //     ${this.terminalOutput}
    //     </terminal_history>`
    // }

    let stream = this.api.createMessage(
      systemPrompt,
      contextManagementMetadata.truncatedConversationHistory
    )

    const iterator = stream[Symbol.asyncIterator]()

    try {
      // awaiting first chunk to see if it will throw an error
      this.isWaitingForFirstChunk = true
      const firstChunk = await iterator.next()
      yield firstChunk.value
      this.isWaitingForFirstChunk = false
    } catch (error) {
      if (!this.didAutomaticallyRetryFailedApiRequest) {
        this.conversationHistoryDeletedRange = this.contextManager.getNextTruncationRange(
          this.apiConversationHistory,
          this.conversationHistoryDeletedRange,
          'quarter' // Force aggressive truncation
        )
        await this.saveChatermMessagesAndUpdateHistory()
        await this.contextManager.triggerApplyStandardContextTruncationNoticeChange(
          Date.now(),
          this.taskId
        )

        this.didAutomaticallyRetryFailedApiRequest = true
      } else {
        const errorMessage = this.formatErrorWithStatusCode(error)

        const { response } = await this.ask('api_req_failed', errorMessage) // TODO:this message is not sent to the webview

        if (response !== 'yesButtonClicked') {
          // this will never happen since if noButtonClicked, we will clear current task, aborting this instance
          throw new Error('API request failed')
        }

        await this.say('api_req_retried')
      }
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
      // console.log("no more content blocks to stream! this shouldn't happen?")
      this.presentAssistantMessageLocked = false
      return
      //throw new Error("No more content blocks to stream! This shouldn't happen...") // remove and just return after testing
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

    /*
		Seeing out of bounds is fine, it means that the next too call is being built up and ready to add to assistantMessageContent to present. 
		When you see the UI inactive during this, it means that a tool is breaking without presenting any UI. For example the write_to_file tool was breaking when relpath was undefined, and for invalid relpath it never presented UI.
		*/
    this.presentAssistantMessageLocked = false // this needs to be placed here, if not then calling this.presentAssistantMessage below would fail (sometimes) since it's locked
    // NOTE: when tool is rejected, iterator stream is interrupted and it waits for userMessageContentReady to be true. Future calls to present will skip execution since didRejectTool and iterate until contentIndex is set to message length and it sets userMessageContentReady to true itself (instead of preemptively doing it in iterator)
    if (!block.partial || this.didRejectTool || this.didAlreadyUseTool) {
      // block is finished streaming and executing
      if (this.currentStreamingContentIndex === this.assistantMessageContent.length - 1) {
        // its okay that we increment if !didCompleteReadingStream, it'll just return bc out of bounds and as streaming continues it will call presentAssistantMessage if a new block is ready. if streaming is finished then we set userMessageContentReady to true when out of bounds. This gracefully allows the stream to continue on and all potential content blocks be presented.
        // last block is complete and it is finished executing
        this.userMessageContentReady = true // will allow pwaitfor to continue
      }

      // call next block if it exists (if not then read stream will call it when its ready)
      this.currentStreamingContentIndex++ // need to increment regardless, so when read stream calls this function again it will be streaming the next block

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

  async recursivelyMakeChatermRequests(
    userContent: UserContent,
    includeHostDetails: boolean = false
  ): Promise<boolean> {
    if (this.abort) {
      throw new Error('Chaterm instance aborted')
    }

    // Used to know what models were used in the task if user wants to export metadata for error reporting purposes
    const currentProviderId = (await getGlobalState('apiProvider')) as string
    if (currentProviderId && this.api.getModel().id) {
      try {
        await this.modelContextTracker.recordModelUsage(
          currentProviderId,
          this.api.getModel().id,
          this.chatSettings.mode
        )
      } catch {}
    }

    if (this.consecutiveMistakeCount >= 3) {
      if (this.autoApprovalSettings.enabled && this.autoApprovalSettings.enableNotifications) {
        showSystemNotification({
          subtitle: 'Error',
          message: 'Chaterm is having trouble. Would you like to continue the task?'
        })
      }
      const { response, text } = await this.ask(
        'mistake_limit_reached',
        this.api.getModel().id.includes('claude')
          ? `This may indicate a failure in his thought process or inability to use a tool properly, which can be mitigated with some user guidance (e.g. "Try breaking down the task into smaller steps").`
          : "Chaterm uses complex prompts and iterative task execution that may be challenging for less capable models. For best results, it's recommended to use Claude 3.7 Sonnet for its advanced agentic coding capabilities."
      )
      if (response === 'messageResponse') {
        userContent.push(
          ...[
            {
              type: 'text',
              text: formatResponse.tooManyMistakes(text)
            } as Anthropic.Messages.TextBlockParam
            // ...formatResponse.imageBlocks(images),
          ]
        )
      }
      this.consecutiveMistakeCount = 0
    }

    if (
      this.autoApprovalSettings.enabled &&
      this.consecutiveAutoApprovedRequestsCount >= this.autoApprovalSettings.maxRequests
    ) {
      if (this.autoApprovalSettings.enableNotifications) {
        showSystemNotification({
          subtitle: 'Max Requests Reached',
          message: `Chaterm has auto-approved ${this.autoApprovalSettings.maxRequests.toString()} API requests.`
        })
      }
      await this.ask(
        'auto_approval_max_req_reached',
        `Chaterm has auto-approved ${this.autoApprovalSettings.maxRequests.toString()} API requests. Would you like to reset the count and proceed with the task?`
      )
      // if we get past the promise it means the user approved and did not start a new task
      this.consecutiveAutoApprovedRequestsCount = 0
    }

    // get previous api req's index to check token usage and determine if we need to truncate conversation history
    const previousApiReqIndex = findLastIndex(
      this.chatermMessages,
      (m) => m.say === 'api_req_started'
    )
    // console.log('this.chatermMessages', this.chatermMessages)
    // Save checkpoint if this is the first API request
    const isFirstRequest =
      this.chatermMessages.filter((m) => m.say === 'api_req_started').length === 0

    // getting verbose details is an expensive operation, it uses globby to top-down build file structure of project which for large projects can take a few seconds
    // for the best UX we show a placeholder api_req_started message with a loading spinner as this happens
    await this.say(
      'api_req_started',
      JSON.stringify({
        request:
          userContent.map((block) => formatContentBlockToMarkdown(block)).join('\n\n') +
          '\n\nLoading...'
      })
    )

    if (isFirstRequest) {
      await this.say('checkpoint_created') // no hash since we need to wait for CheckpointTracker to be initialized
    }

    // Now that checkpoint tracker is initialized, update the dummy checkpoint_created message with the commit hash. (This is necessary since we use the API request loading as an opportunity to initialize the checkpoint tracker, which can take some time)
    if (isFirstRequest) {
      //const commitHash = await this.checkpointTracker?.commit()
      const lastCheckpointMessage = findLast(
        this.chatermMessages,
        (m) => m.say === 'checkpoint_created'
      )
      if (lastCheckpointMessage) {
        //lastCheckpointMessage.lastCheckpointHash = commitHash
        await this.saveChatermMessagesAndUpdateHistory()
      }
    }

    const [parsedUserContent, environmentDetails] = await this.loadContext(
      userContent,
      includeHostDetails
    )

    userContent = parsedUserContent
    // add environment details as its own text block, separate from tool results
    userContent.push({ type: 'text', text: environmentDetails })

    await this.addToApiConversationHistory({
      role: 'user',
      content: userContent
    })

    //telemetryService.captureConversationTurnEvent(this.taskId, currentProviderId, this.api.getModel().id, "user", true)

    // since we sent off a placeholder api_req_started message to update the webview while waiting to actually start the API request (to load potential details for example), we need to update the text of that message
    const lastApiReqIndex = findLastIndex(this.chatermMessages, (m) => m.say === 'api_req_started')
    this.chatermMessages[lastApiReqIndex].text = JSON.stringify({
      request: userContent.map((block) => formatContentBlockToMarkdown(block)).join('\n\n')
    } satisfies ChatermApiReqInfo)
    await this.saveChatermMessagesAndUpdateHistory()
    await this.postStateToWebview()

    try {
      let cacheWriteTokens = 0
      let cacheReadTokens = 0
      let inputTokens = 0
      let outputTokens = 0
      let totalCost: number | undefined

      // update api_req_started. we can't use api_req_finished anymore since it's a unique case where it could come after a streaming message (ie in the middle of being updated or executed)
      // fortunately api_req_finished was always parsed out for the gui anyways, so it remains solely for legacy purposes to keep track of prices in tasks from history
      // (it's worth removing a few months from now)
      const updateApiReqMsg = (
        cancelReason?: ChatermApiReqCancelReason,
        streamingFailedMessage?: string
      ) => {
        this.chatermMessages[lastApiReqIndex].text = JSON.stringify({
          ...JSON.parse(this.chatermMessages[lastApiReqIndex].text || '{}'),
          tokensIn: inputTokens,
          tokensOut: outputTokens,
          cacheWrites: cacheWriteTokens,
          cacheReads: cacheReadTokens,
          cost:
            totalCost ??
            calculateApiCostAnthropic(
              this.api.getModel().info,
              inputTokens,
              outputTokens,
              cacheWriteTokens,
              cacheReadTokens
            ),
          cancelReason,
          streamingFailedMessage
        } satisfies ChatermApiReqInfo)
      }

      const abortStream = async (
        cancelReason: ChatermApiReqCancelReason,
        streamingFailedMessage?: string
      ) => {
        // if (this.diffViewProvider.isEditing) {
        // 	await this.diffViewProvider.revertChanges() // closes diff view
        // }

        // if last message is a partial we need to update and save it
        const lastMessage = this.chatermMessages.at(-1)
        if (lastMessage && lastMessage.partial) {
          // lastMessage.ts = Date.now() DO NOT update ts since it is used as a key for virtuoso list
          lastMessage.partial = false
          // instead of streaming partialMessage events, we do a save and post like normal to persist to disk
          console.log('updating partial message', lastMessage)
          // await this.saveChatermMessagesAndUpdateHistory()
        }

        // Let assistant know their response was interrupted for when task is resumed
        await this.addToApiConversationHistory({
          role: 'assistant',
          content: [
            {
              type: 'text',
              text:
                assistantMessage +
                `\n\n[${
                  cancelReason === 'streaming_failed'
                    ? 'Response interrupted by API Error'
                    : 'Response interrupted by user'
                }]`
            }
          ]
        })

        // update api_req_started to have cancelled and cost, so that we can display the cost of the partial stream
        updateApiReqMsg(cancelReason, streamingFailedMessage)
        await this.saveChatermMessagesAndUpdateHistory()

        // telemetryService.captureConversationTurnEvent(
        // 	this.taskId,
        // 	currentProviderId,
        // 	this.api.getModel().id,
        // 	"assistant",
        // 	true,
        // )

        // signals to provider that it can retrieve the saved messages from disk, as abortTask can not be awaited on in nature
        this.didFinishAbortingStream = true
      }

      // reset streaming state
      this.currentStreamingContentIndex = 0
      this.assistantMessageContent = []
      this.didCompleteReadingStream = false
      this.userMessageContent = []
      this.userMessageContentReady = false
      this.didRejectTool = false
      this.didAlreadyUseTool = false
      this.presentAssistantMessageLocked = false
      this.presentAssistantMessageHasPendingUpdates = false
      this.didAutomaticallyRetryFailedApiRequest = false
      // await this.diffViewProvider.reset()

      const stream = this.attemptApiRequest(previousApiReqIndex) // yields only if the first chunk is successful, otherwise will allow the user to retry the request (most likely due to rate limit error, which gets thrown on the first chunk)
      let assistantMessage = ''
      let reasoningMessage = ''
      this.isStreaming = true
      let didReceiveUsageChunk = false
      try {
        for await (const chunk of stream) {
          if (!chunk) {
            continue
          }
          switch (chunk.type) {
            case 'usage':
              didReceiveUsageChunk = true
              inputTokens += chunk.inputTokens
              outputTokens += chunk.outputTokens
              cacheWriteTokens += chunk.cacheWriteTokens ?? 0
              cacheReadTokens += chunk.cacheReadTokens ?? 0
              totalCost = chunk.totalCost
              break
            case 'reasoning':
              // reasoning will always come before assistant message
              reasoningMessage += chunk.reasoning
              // fixes bug where cancelling task > aborts task > for loop may be in middle of streaming reasoning > say function throws error before we get a chance to properly clean up and cancel the task.
              if (!this.abort) {
                await this.say('reasoning', reasoningMessage, true)
              }
              break
            case 'text':
              if (reasoningMessage && assistantMessage.length === 0) {
                // complete reasoning message
                await this.say('reasoning', reasoningMessage, false)
              }
              assistantMessage += chunk.text
              // parse raw assistant message into content blocks
              const prevLength = this.assistantMessageContent.length
              this.assistantMessageContent = parseAssistantMessageV2(assistantMessage)
              if (this.assistantMessageContent.length > prevLength) {
                this.userMessageContentReady = false // new content we need to present, reset to false in case previous content set this to true
              }
              // present content to user
              this.presentAssistantMessage()
              break
          }

          if (this.abort) {
            console.log('aborting stream...')
            if (!this.abandoned) {
              // only need to gracefully abort if this instance isn't abandoned (sometimes openrouter stream hangs, in which case this would affect future instances of Chaterm)
              await abortStream('user_cancelled')
            }
            break // aborts the stream
          }

          if (this.didRejectTool) {
            // userContent has a tool rejection, so interrupt the assistant's response to present the user's feedback
            assistantMessage += '\n\n[Response interrupted by user feedback]'
            // this.userMessageContentReady = true // instead of setting this preemptively, we allow the present iterator to finish and set userMessageContentReady when its ready
            break
          }

          // PREV: we need to let the request finish for openrouter to get generation details
          // UPDATE: it's better UX to interrupt the request at the cost of the api cost not being retrieved
          if (this.didAlreadyUseTool) {
            assistantMessage +=
              '\n\n[Response interrupted by a tool use result. Only one tool may be used at a time and should be placed at the end of the message.]'
            break
          }
        }
      } catch (error) {
        // abandoned happens when extension is no longer waiting for the chaterm instance to finish aborting (error is thrown here when any function in the for loop throws due to this.abort)
        if (!this.abandoned) {
          this.abortTask() // if the stream failed, there's various states the task could be in (i.e. could have streamed some tools the user may have executed), so we just resort to replicating a cancel task
          const errorMessage = this.formatErrorWithStatusCode(error)

          await abortStream('streaming_failed', errorMessage)
          await this.reinitExistingTaskFromId(this.taskId)
        }
      } finally {
        this.isStreaming = false
      }

      // OpenRouter/Chaterm may not return token usage as part of the stream (since it may abort early), so we fetch after the stream is finished
      // (updateApiReq below will update the api_req_started message with the usage details. we do this async so it updates the api_req_started message in the background)
      if (!didReceiveUsageChunk) {
        this.api.getApiStreamUsage?.().then(async (apiStreamUsage) => {
          if (apiStreamUsage) {
            inputTokens += apiStreamUsage.inputTokens
            outputTokens += apiStreamUsage.outputTokens
            cacheWriteTokens += apiStreamUsage.cacheWriteTokens ?? 0
            cacheReadTokens += apiStreamUsage.cacheReadTokens ?? 0
            totalCost = apiStreamUsage.totalCost
          }
          updateApiReqMsg()
          await this.saveChatermMessagesAndUpdateHistory()
          await this.postStateToWebview()
        })
      }

      // need to call here in case the stream was aborted
      if (this.abort) {
        throw new Error('Chaterm instance aborted')
      }

      this.didCompleteReadingStream = true

      // set any blocks to be complete to allow presentAssistantMessage to finish and set userMessageContentReady to true
      // (could be a text block that had no subsequent tool uses, or a text block at the very end, or an invalid tool use, etc. whatever the case, presentAssistantMessage relies on these blocks either to be completed or the user to reject a block in order to proceed and eventually set userMessageContentReady to true)
      const partialBlocks = this.assistantMessageContent.filter((block) => block.partial)
      partialBlocks.forEach((block) => {
        block.partial = false
      })
      // this.assistantMessageContent.forEach((e) => (e.partial = false)) // can't just do this bc a tool could be in the middle of executing ()
      if (partialBlocks.length > 0) {
        this.presentAssistantMessage() // if there is content to update then it will complete and update this.userMessageContentReady to true, which we pwaitfor before making the next request. all this is really doing is presenting the last partial message that we just set to complete
      }

      updateApiReqMsg()
      await this.saveChatermMessagesAndUpdateHistory()
      await this.postStateToWebview()

      // now add to apiconversationhistory
      // need to save assistant responses to file before proceeding to tool use since user can exit at any moment and we wouldn't be able to save the assistant's response
      let didEndLoop = false
      if (assistantMessage.length > 0) {
        await this.addToApiConversationHistory({
          role: 'assistant',
          content: [{ type: 'text', text: assistantMessage }]
        })

        // NOTE: this comment is here for future reference - this was a workaround for userMessageContent not getting set to true. It was due to it not recursively calling for partial blocks when didRejectTool, so it would get stuck waiting for a partial block to complete before it could continue.
        // in case the content blocks finished
        // it may be the api stream finished after the last parsed content block was executed, so  we are able to detect out of bounds and set userMessageContentReady to true (note you should not call presentAssistantMessage since if the last block is completed it will be presented again)
        // const completeBlocks = this.assistantMessageContent.filter((block) => !block.partial) // if there are any partial blocks after the stream ended we can consider them invalid
        // if (this.currentStreamingContentIndex >= completeBlocks.length) {
        // 	this.userMessageContentReady = true
        // }

        await pWaitFor(() => this.userMessageContentReady)

        // if the model did not tool use, then we need to tell it to either use a tool or attempt_completion
        const didToolUse = this.assistantMessageContent.some((block) => block.type === 'tool_use')

        if (!didToolUse) {
          // normal request where tool use is required
          this.userMessageContent.push({
            type: 'text',
            text: formatResponse.noToolsUsed()
          })
          this.consecutiveMistakeCount++
        }

        const recDidEndLoop = await this.recursivelyMakeChatermRequests(this.userMessageContent)
        didEndLoop = recDidEndLoop
      } else {
        // if there's no assistant_responses, that means we got no text or tool_use content blocks from API which we should assume is an error
        await this.say(
          'error',
          "Unexpected API Response: The language model did not provide any assistant messages. This may indicate an issue with the API or the model's output."
        )
        await this.addToApiConversationHistory({
          role: 'assistant',
          content: [
            {
              type: 'text',
              text: 'Failure: I did not provide a response.'
            }
          ]
        })
      }

      return didEndLoop // will always be false for now
    } catch (error) {
      // this should never happen since the only thing that can throw an error is the attemptApiRequest, which is wrapped in a try catch that sends an ask where if noButtonClicked, will clear current task and destroy this instance. However to avoid unhandled promise rejection, we will end this loop which will end execution of this instance (see startTask)
      return true // needs to be true so parent loop knows to end task
    }
  }

  async loadContext(
    userContent: UserContent,
    includeHostDetails: boolean = false
  ): Promise<[UserContent, string]> {
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
    const [processedUserContent, environmentDetails] = await Promise.all([
      processUserContent(),
      this.getEnvironmentDetails(includeHostDetails)
    ])

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
    details += `\n\n# Current Time\n${formatter.format(now)} (${timeZone}, UTC${timeZoneOffsetStr})`

    if (includeHostDetails) {
      details += `\n\n# Current Hosts\n${this.hosts?.map((h) => h.host).join(', ')}`

      details += `\n\n# Current Working Directory (${this.cwd.toPosix()}) Files\n`
      const res = await this.executeCommandInRemoteServer('ls -al', this.cwd)
      // TODO: add ignore files
      const processLsOutput = (output: string): string => {
        const lines = output.split('\n')
        const totalLine = lines[0]
        const fileLines = lines.slice(1).filter((line) => line.trim() !== '')
        const limitedLines = fileLines.slice(0, 200)
        let result = totalLine + '\n'
        result += limitedLines.join('\n')
        if (fileLines.length > 200) {
          result += `\n... (${fileLines.length - 200} more files not shown)`
        }
        return result
      }

      const processedOutput = processLsOutput(res)
      details += processedOutput

      details += res
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

    const modifiedMessages = combineApiRequests(
      combineCommandSequences(this.chatermMessages.slice(1))
    )
    const lastApiReqMessage = findLast(modifiedMessages, (msg) => {
      if (msg.say !== 'api_req_started') {
        return false
      }
      return getTotalTokensFromApiReqMessage(msg) > 0
    })

    const lastApiReqTotalTokens = lastApiReqMessage
      ? getTotalTokensFromApiReqMessage(lastApiReqMessage)
      : 0
    const usagePercentage = Math.round((lastApiReqTotalTokens / contextWindow) * 100)

    details += '\n\n# Context Window Usage'
    details += `\n${lastApiReqTotalTokens.toLocaleString()} / ${(contextWindow / 1000).toLocaleString()}K tokens used (${usagePercentage}%)`

    details += '\n\n# Current Mode'
    switch (this.chatSettings.mode) {
      case 'chat':
        details += '\nCHAT MODE\n' + formatResponse.planModeInstructions()
        break
      case 'cmd':
        details += '\CMD MODE'
        break
      case 'agent':
        details += '\nAGENT MODE'
        break
    }

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
          await this.ask(
            'command',
            this.removeClosingTag(block.partial, 'command', command),
            block.partial
          ).catch(() => {})
        }
        return
      } else {
        if (!command || !ip) {
          this.consecutiveMistakeCount++
          this.pushToolResult(
            toolDescription,
            await this.sayAndCreateMissingParamError('execute_command', 'command')
          )
          await this.saveCheckpoint()
          return
        }
        if (!requiresApprovalRaw) {
          this.consecutiveMistakeCount++
          this.pushToolResult(
            toolDescription,
            await this.sayAndCreateMissingParamError('execute_command', 'requires_approval')
          )
          await this.saveCheckpoint()
          return
        }
        this.consecutiveMistakeCount = 0
        let didAutoApprove = false

        // if (this.chatSettings.mode === 'cmd') {
        //   await this.askApprovalForCmdMode(toolDescription, command) // Wait for frontend to execute command and return result
        //   return
        // }

        const autoApproveResult = this.shouldAutoApproveTool(block.name)
        let [autoApproveSafe, autoApproveAll] = Array.isArray(autoApproveResult)
          ? autoApproveResult
          : [autoApproveResult, false]
        if (this.chatSettings.mode === 'cmd') {
          autoApproveSafe = false
          autoApproveAll = false
        } else if (this.chatSettings.mode === 'agent') {
          autoApproveSafe = true
          autoApproveAll = true
        }
        if (
          (!requiresApprovalPerLLM && autoApproveSafe) ||
          (requiresApprovalPerLLM && autoApproveSafe && autoApproveAll)
        ) {
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
              message:
                'An auto-approved command has been running for 30s, and may need your attention.'
            })
          }, 30_000)
        }

        const [userRejected, result] = await this.executeCommandTool(command!, ip!)
        if (timeoutId) {
          clearTimeout(timeoutId)
        }
        if (userRejected) {
          this.didRejectTool = true
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
    const content = formatResponse.toolResult(
      `The user provided the following feedback:\n<feedback>\n${feedback}\n</feedback>`
    )
    if (typeof content === 'string') {
      this.userMessageContent.push({ type: 'text', text: content })
    } else {
      this.userMessageContent.push(...content)
    }
  }

  private async askApproval(
    toolDescription: string,
    type: ChatermAsk,
    partialMessage?: string
  ): Promise<boolean> {
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

  private async askApprovalForCmdMode(toolDescription: string, command: string): Promise<boolean> {
    const { response, text } = await this.ask('command', command, false)
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
      // cmd 模式下 text 是命令执行结果
      this.pushToolResult(toolDescription, text)
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

  private async handleToolError(
    toolDescription: string,
    action: string,
    error: Error
  ): Promise<void> {
    if (this.abandoned) {
      console.log('Ignoring error since task was abandoned')
      return
    }
    const errorString = `Error ${action}: ${JSON.stringify(serializeError(error))}`
    await this.say(
      'error',
      `Error ${action}:\n${error.message ?? JSON.stringify(serializeError(error), null, 2)}`
    )
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
        this.pushToolResult(
          toolDescription,
          await this.sayAndCreateMissingParamError('ask_followup_question', 'question')
        )
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

      const { text } = await this.ask('followup', JSON.stringify(sharedMessage), false)

      if (optionsRaw && text && parsePartialArrayString(optionsRaw).includes(text)) {
        const lastFollowupMessage = findLast(this.chatermMessages, (m) => m.ask === 'followup')
        if (lastFollowupMessage) {
          lastFollowupMessage.text = JSON.stringify({
            ...sharedMessage,
            selected: text
          } as ChatermAskQuestion)
          await this.saveChatermMessagesAndUpdateHistory()
        }
      } else {
        await this.say('user_feedback', text ?? '')
      }

      this.pushToolResult(
        toolDescription,
        formatResponse.toolResult(`<answer>\n${text}\n</answer>`)
      )
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
      const lastCompletionResultMessage = findLast(
        this.chatermMessages,
        (m) => m.say === 'completion_result'
      )
      if (
        lastCompletionResultMessage &&
        hasNewChanges &&
        !lastCompletionResultMessage.text?.endsWith(COMPLETION_RESULT_CHANGES_FLAG)
      ) {
        lastCompletionResultMessage.text += COMPLETION_RESULT_CHANGES_FLAG
      }
      await this.saveChatermMessagesAndUpdateHistory()
    }

    try {
      const lastMessage = this.chatermMessages.at(-1)

      if (block.partial) {
        if (command) {
          if (lastMessage && lastMessage.ask === 'command') {
            await this.ask(
              'command',
              this.removeClosingTag(block.partial, 'command', command),
              block.partial
            ).catch(() => {})
          } else {
            await this.say(
              'completion_result',
              this.removeClosingTag(block.partial, 'result', result),
              false
            )
            await this.saveCheckpoint(true)
            await addNewChangesFlagToLastCompletionResultMessage()
            await this.ask(
              'command',
              this.removeClosingTag(block.partial, 'command', command),
              block.partial
            ).catch(() => {})
          }
        } else {
          await this.say(
            'completion_result',
            this.removeClosingTag(block.partial, 'result', result),
            block.partial
          )
        }
        return
      }

      if (!result) {
        this.consecutiveMistakeCount++
        this.pushToolResult(
          toolDescription,
          await this.sayAndCreateMissingParamError('attempt_completion', 'result')
        )
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
        } else {
          await this.saveCheckpoint(true)
        }

        const didApprove = await this.askApproval(toolDescription, 'command', command)
        if (!didApprove) {
          await this.saveCheckpoint()
          return
        }
        const [userRejected, execCommandResult] = await this.executeCommandTool(command!, ip!)
        if (userRejected) {
          this.didRejectTool = true
          this.pushToolResult(toolDescription, execCommandResult)
          await this.saveCheckpoint()
          return
        }
        commandResult = execCommandResult
      } else {
        await this.say('completion_result', result, false)
        await this.saveCheckpoint(true)
        await addNewChangesFlagToLastCompletionResultMessage()
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
        await this.ask(
          'condense',
          this.removeClosingTag(block.partial, 'context', context),
          block.partial
        ).catch(() => {})
        return
      }
      if (!context) {
        this.consecutiveMistakeCount++
        this.pushToolResult(
          toolDescription,
          await this.sayAndCreateMissingParamError('condense', 'context')
        )
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
          formatResponse.toolResult(
            `The user provided feedback on the condensed conversation summary:\n<feedback>\n${text}\n</feedback>`
          )
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
        await this.contextManager.triggerApplyStandardContextTruncationNoticeChange(
          Date.now(),
          this.taskId
        )
      }
      await this.saveCheckpoint()
    } catch (error) {
      await this.handleToolError(toolDescription, 'condensing context window', error as Error)
      await this.saveCheckpoint()
    }
  }

  private async handleReportBugToolUse(block: ToolUse): Promise<void> {
    const toolDescription = this.getToolDescription(block)
    const { title, what_happened, steps_to_reproduce, api_request_output, additional_context } =
      block.params

    try {
      if (block.partial) {
        await this.ask(
          'report_bug',
          JSON.stringify({
            title: this.removeClosingTag(block.partial, 'title', title),
            what_happened: this.removeClosingTag(block.partial, 'what_happened', what_happened),
            steps_to_reproduce: this.removeClosingTag(
              block.partial,
              'steps_to_reproduce',
              steps_to_reproduce
            ),
            api_request_output: this.removeClosingTag(
              block.partial,
              'api_request_output',
              api_request_output
            ),
            additional_context: this.removeClosingTag(
              block.partial,
              'additional_context',
              additional_context
            )
          }),
          block.partial
        ).catch(() => {})
        return
      }

      const requiredCheck = async (val: any, name: string): Promise<boolean> => {
        if (!val) {
          this.consecutiveMistakeCount++
          this.pushToolResult(
            toolDescription,
            await this.sayAndCreateMissingParamError('report_bug', name)
          )
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
        this.pushToolResult(
          toolDescription,
          formatResponse.toolResult('The user accepted the creation of the Github issue.')
        )
        // 可在此创建 issue 的逻辑
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
    // 若之前已拒绝或已执行工具，则忽略纯文本更新
    if (this.didRejectTool || this.didAlreadyUseTool) return

    let content = block.content
    if (content) {
      // 移除 <thinking> 标签
      content = content.replace(/<thinking>\s?/g, '')
      content = content.replace(/\s?<\/thinking>/g, '')

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

    // 对完整块清理可能附带的代码块结尾噪声
    if (!block.partial) {
      const match = content?.trimEnd().match(/```[a-zA-Z0-9_-]+$/)
      if (match) {
        content = content.trimEnd().slice(0, -match[0].length)
      }
    }

    await this.say('text', content, block.partial)
  }
}
