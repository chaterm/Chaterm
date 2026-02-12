//  Copyright (c) 2025-present, chaterm.ai  All rights reserved.
//  This source code is licensed under the GPL-3.0
//
// Copyright (c) 2025 cline Authors, All rights reserved.
// Licensed under the Apache License, Version 2.0

import { Anthropic } from '@anthropic-ai/sdk'
import cloneDeep from 'clone-deep'
import os from 'os'
import path from 'path'
import * as fs from 'fs/promises'
import { telemetryService } from '@services/telemetry/TelemetryService'
import pWaitFor from 'p-wait-for'
import { serializeError } from 'serialize-error'
import { ApiHandler, buildApiHandler } from '@api/index'
import { ApiStream, ApiStreamUsageChunk, ApiStreamReasoningChunk, ApiStreamTextChunk } from '@api/transform/stream'
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
  ExtensionMessage,
  HostInfo
} from '@shared/ExtensionMessage'
import { getApiMetrics } from '@shared/getApiMetrics'
import { HistoryItem } from '@shared/HistoryItem'
import { DEFAULT_LANGUAGE_SETTINGS } from '@shared/Languages'
import { ChatermAskResponse } from '@shared/WebviewMessage'
import { calculateApiCostAnthropic } from '@utils/cost'
import { TodoWriteTool, TodoWriteParams } from './todo-tools/todo_write_tool'
import { TodoReadTool, TodoReadParams } from './todo-tools/todo_read_tool'
import { Todo } from '../../shared/todo/TodoSchemas'
import { SmartTaskDetector, TODO_SYSTEM_MESSAGES } from './todo-tools/todo-prompts'
import { TodoContextTracker } from '../services/todo_context_tracker'
import { TodoToolCallTracker } from '../services/todo_tool_call_tracker'
import { globSearch } from '../../services/glob/list-files'
import { regexSearchMatches as localGrepSearch } from '../../services/grep/index'
import { buildRemoteGlobCommand, parseRemoteGlobOutput, buildRemoteGrepCommand, parseRemoteGrepOutput } from '../../services/search/remote'
import { broadcastInteractionClosed } from '../../services/interaction-detector/ipc-handlers'

interface StreamMetrics {
  didReceiveUsageChunk?: boolean
  inputTokens: number
  outputTokens: number
  cacheWriteTokens: number
  cacheReadTokens: number
  totalCost?: number
}

interface MessageUpdater {
  updateApiReqMsg: (cancelReason?: ChatermApiReqCancelReason, streamingFailedMessage?: string) => void
}

import { AssistantMessageContent, parseAssistantMessageV2, ToolParamName, ToolUseName, TextContent, ToolUse } from '@core/assistant-message'
import { RemoteTerminalManager, ConnectionInfo, RemoteTerminalInfo, RemoteTerminalProcessResultPromise } from '../../integrations/remote-terminal'
import { LocalTerminalManager, LocalCommandProcess } from '../../integrations/local-terminal'
import { createLlmCaller } from '../../services/interaction-detector/llm-caller'
import type { InteractionResult } from '../../services/interaction-detector/types'
import { formatResponse } from '@core/prompts/responses'
import { addUserInstructions, SYSTEM_PROMPT, SYSTEM_PROMPT_CHAT, SYSTEM_PROMPT_CN, SYSTEM_PROMPT_CHAT_CN } from '@core/prompts/system'
import { getSwitchPromptByAssetType } from '@core/prompts/switch-prompts'
import { SLASH_COMMANDS, getSummaryToDocPrompt } from '@core/prompts/slash-commands'
import { CommandSecurityManager } from '../security/CommandSecurityManager'
import { getContextWindowInfo } from '@core/context/context-management/context-window-utils'
import { ModelContextTracker } from '@core/context/context-tracking/ModelContextTracker'
import { ContextManager } from '@core/context/context-management/ContextManager'
import { getSavedApiConversationHistory, getChatermMessages, saveApiConversationHistory, saveChatermMessages } from '@core/storage/disk'

import { getGlobalState, getUserConfig } from '@core/storage/state'
import { connectAssetInfo } from '../../../storage/database'
import { getMessages, formatMessage, Messages } from './messages'
import { decodeHtmlEntities } from '@utils/decodeHtmlEntities'
import { McpHub } from '@services/mcp/McpHub'
import { SkillsManager } from '@services/skills'
import { ChatermDatabaseService } from '../../../storage/db/chaterm.service'
import type { McpTool } from '@shared/mcp'

import type { ContentPart, ContextDocRef, ContextPastChatRef, ContextRefs, Host } from '@shared/WebviewMessage'
import { ExternalAssetCache } from '../../../plugin/pluginIpc'
import type { InteractionType } from '../../services/interaction-detector/types'
const logger = createLogger('agent')

type ToolResponse = string | Array<Anthropic.TextBlockParam | Anthropic.ImageBlockParam>
type UserContent = Array<Anthropic.ContentBlockParam>

/**
 * Check if a tool allows partial block execution
 */
function isAllowPartialTool(toolName: string): boolean {
  return toolName === 'summarize_to_knowledge' || toolName === 'attempt_completion'
}
export interface CommandContext {
  /** Command identifier */
  commandId: string
  /** Task ID this command belongs to */
  taskId: string
  /** Function to send input to the command */
  sendInput: (input: string) => Promise<import('../../services/interaction-detector/types').SendInputResult>
  /** Function to cancel the command (async, may throw) */
  cancel?: () => Promise<void> | void
  /** Function to force terminate the process and resolve/reject its Promise */
  forceTerminate?: () => void
  /** Function called when interaction is dismissed */
  onDismiss?: () => void
  /** Function called when interaction is suppressed */
  onSuppress?: () => void
  /** Function called when interaction detection is resumed */
  onUnsuppress?: () => void
  /** Function called to resume detection after user input */
  onResume?: () => void
  /** Function called after successful input to clear prompt buffers */
  onInteractionSubmitted?: (interactionType: InteractionType) => void
}

export class Task {
  // ============================================================================
  // Static members for active command context management
  // ============================================================================

  /**
   * Global registry of active command contexts, keyed by commandId
   * Used by IPC handlers to route interaction responses to the correct command
   */
  private static activeTasks = new Map<string, CommandContext>()

  /**
   * Register a command context for interaction handling
   */
  static registerCommandContext(context: CommandContext): void {
    Task.activeTasks.set(context.commandId, context)
    logger.info(`[Task] Registered command context: ${context.commandId} for task: ${context.taskId}`)
  }

  /**
   * Unregister a command context
   */
  static unregisterCommandContext(commandId: string): void {
    Task.activeTasks.delete(commandId)
    logger.info(`[Task] Unregistered command context: ${commandId}`)
  }

  /**
   * Get a command context by ID
   */
  static getCommandContext(commandId: string): CommandContext | undefined {
    return Task.activeTasks.get(commandId)
  }

  /**
   * Clear all command contexts for a specific task
   */
  static clearCommandContextsForTask(taskId: string): void {
    logger.info(`[Task] clearCommandContextsForTask called for task: ${taskId}, activeTasks count: ${Task.activeTasks.size}`)
    for (const [commandId, context] of Task.activeTasks.entries()) {
      logger.info(`[Task] Checking command context: ${commandId}, taskId: ${context.taskId}`)
      if (context.taskId === taskId) {
        // Send Ctrl+C to cancel the command
        if (context.cancel) {
          logger.info(`[Task] Calling cancel for command: ${commandId}`)
          const result = context.cancel()
          if (result instanceof Promise) {
            result.catch((e) => logger.warn('[Task] Cancel failed', { error: e instanceof Error ? e.message : String(e) }))
          }
        }
        // Force terminate the process to unblock awaiting code
        if (context.forceTerminate) {
          logger.info(`[Task] Calling forceTerminate for command: ${commandId}`)
          context.forceTerminate()
        }
        // Broadcast interaction closed event to notify renderer process to close UI
        logger.info(`[Task] Broadcasting interaction-closed for command: ${commandId}`)
        broadcastInteractionClosed(commandId)
        // Remove from registry
        Task.activeTasks.delete(commandId)
        logger.info(`[Task] Cleared command context: ${commandId} for task: ${taskId}`)
      }
    }
    logger.info(`[Task] clearCommandContextsForTask completed, remaining activeTasks count: ${Task.activeTasks.size}`)
  }

  // ============================================================================
  // Instance members
  // ============================================================================

  private updateTaskHistory: (historyItem: HistoryItem) => Promise<HistoryItem[]>
  private postStateToWebview: () => Promise<void>
  private postMessageToWebview: (message: ExtensionMessage) => Promise<void>
  private reinitExistingTaskFromId: (taskId: string) => Promise<void>
  mcpHub: McpHub
  skillsManager?: SkillsManager

  readonly taskId: string
  hosts: Host[]
  private taskIsFavorited?: boolean
  chatTitle?: string // Store the LLM-generated chat title
  api: ApiHandler
  contextManager: ContextManager
  private remoteTerminalManager: RemoteTerminalManager
  private localTerminalManager: LocalTerminalManager
  customInstructions?: string
  autoApprovalSettings: AutoApprovalSettings
  apiConversationHistory: Anthropic.MessageParam[] = []
  chatermMessages: ChatermMessage[] = []
  private commandSecurityManager: CommandSecurityManager
  private askResponsePayload?: { response: ChatermAskResponse; text?: string; contentParts?: ContentPart[] }
  private nextUserInputContentParts?: ContentPart[]
  private lastMessageTs?: number
  private consecutiveAutoApprovedRequestsCount: number = 0
  private consecutiveMistakeCount: number = 0
  private abort: boolean = false
  didFinishAbortingStream = false
  abandoned = false
  private gracefulCancel: boolean = false
  checkpointTrackerErrorMessage?: string
  conversationHistoryDeletedRange?: [number, number]
  isInitialized = false
  summarizeUpToTs?: number // Limit conversation history for current API request only

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
    }
  > = new Map()

  // Host color cache for consistent multi-host display
  private hostColorMap: Map<string, string> = new Map()

  // SSH connection status tracking - tracks all connected hosts in this session
  private connectedHosts: Set<string> = new Set()

  // Session-level flag for auto-approving read-only commands after first user confirmation
  // Once user approves a read-only command (requires_approval=false), subsequent read-only commands
  // in this session will be auto-approved to reduce user interaction
  private readOnlyCommandsAutoApproved: boolean = false

  // Interactive command input handling
  private currentRunningProcess:
    | (LocalCommandProcess & { sendInput?: (input: string) => Promise<import('../../services/interaction-detector/types').SendInputResult> })
    | RemoteTerminalProcessResultPromise
    | null = null

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

  private setNextUserInputContentParts(parts?: ContentPart[]): void {
    this.nextUserInputContentParts = parts && parts.length > 0 ? parts : undefined
  }

  private consumeNextUserInputContentParts(): ContentPart[] | undefined {
    const parts = this.nextUserInputContentParts
    this.nextUserInputContentParts = undefined
    return parts
  }

  private buildContextRefsFromContentParts(parts?: ContentPart[]): ContextRefs | undefined {
    if (!parts || parts.length === 0) return undefined

    const docs: ContextDocRef[] = []
    const pastChats: ContextPastChatRef[] = []

    for (const part of parts) {
      if (part.type !== 'chip') continue
      if (part.chipType === 'doc') {
        docs.push(part.ref)
      } else if (part.chipType === 'chat') {
        pastChats.push(part.ref)
      }
    }

    if (docs.length === 0 && pastChats.length === 0) return undefined
    return {
      ...(docs.length > 0 ? { docs } : {}),
      ...(pastChats.length > 0 ? { pastChats } : {})
    }
  }

  private async sayUserFeedback(text: string, contentParts?: ContentPart[]): Promise<void> {
    await this.say('user_feedback', text, undefined, undefined, contentParts)
  }

  /**
   * Process all content parts and build context blocks.
   * Handles: images, doc chips, chat chips, command chips .
   */
  private async processContentParts(userContent: UserContent, parts?: ContentPart[]): Promise<Anthropic.ContentBlockParam[]> {
    if (!parts || parts.length === 0) return []

    const blocks: Anthropic.ContentBlockParam[] = []

    // 1. Extract images from content parts
    const imageParts = parts.filter((p) => p.type === 'image')
    const MAX_IMAGES = 5
    for (const imgPart of imageParts.slice(0, MAX_IMAGES)) {
      if (imgPart.type === 'image') {
        blocks.push({
          type: 'image',
          source: {
            type: 'base64',
            media_type: imgPart.mediaType,
            data: imgPart.data
          }
        } as Anthropic.ImageBlockParam)
      }
    }

    // 2. Process command chips (built-in commands and knowledge base commands)
    const cmdLines = await this.processSlashCommands(userContent, parts)

    // 3. Process doc and chat context refs
    const refs = this.buildContextRefsFromContentParts(parts)
    const docs = refs?.docs ?? []
    const pastChats = refs?.pastChats ?? []

    const hasContextData = docs.length > 0 || pastChats.length > 0 || cmdLines.length > 0
    if (!hasContextData) return blocks

    const MAX_DOCS = 5
    const MAX_DOC_BYTES = 256 * 1024
    const MAX_PAST_CHATS = 2
    const MAX_PAST_CHAT_CHARS = 24000

    const docLines: string[] = []

    const selectedDocs = docs.slice(0, MAX_DOCS).sort((a, b) => a.absPath.localeCompare(b.absPath))

    for (const doc of selectedDocs) {
      try {
        if (doc.type === 'dir') {
          docLines.push(`- DIR: ${doc.absPath}`)
          continue
        }
        const { content, meta } = await this.readFile(doc.absPath, MAX_DOC_BYTES)
        docLines.push(`- FILE: ${doc.absPath}${meta ? ` (mtimeMs=${meta.mtimeMs}, bytes=${meta.bytes}, truncated=${meta.truncated})` : ''}`)
        docLines.push(content)
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        docLines.push(`- CONTEXT_READ_ERROR: ${doc.absPath}: ${msg}`)
      }
    }

    const chatLines: string[] = []
    const selectedChats = pastChats.slice(0, MAX_PAST_CHATS).sort((a, b) => a.taskId.localeCompare(b.taskId))
    for (const c of selectedChats) {
      try {
        const history = await getSavedApiConversationHistory(c.taskId)
        const text = this.formatPastChatHistory(history, MAX_PAST_CHAT_CHARS)
        chatLines.push(`- PAST_CHAT: ${c.taskId}${c.title ? ` (${c.title})` : ''}`)
        chatLines.push(text)
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        chatLines.push(`- PAST_CHAT_READ_ERROR: ${c.taskId}: ${msg}`)
      }
    }

    // 4. Build final context block
    blocks.push({
      type: 'text',
      text: [
        '<context-prefetch>',
        docLines.length > 0 ? ['<docs>', ...docLines, '</docs>'].join('\n') : '<docs />',
        chatLines.length > 0 ? ['<past-chats>', ...chatLines, '</past-chats>'].join('\n') : '<past-chats />',
        cmdLines.length > 0 ? ['<commands>', ...cmdLines, '</commands>'].join('\n') : '<commands />',
        '</context-prefetch>'
      ].join('\n')
    })

    return blocks
  }

  private async readFile(
    absPath: string,
    maxBytes: number
  ): Promise<{ content: string; meta?: { mtimeMs: number; bytes: number; truncated: boolean } }> {
    if (!path.isAbsolute(absPath)) {
      throw new Error('Path must be absolute')
    }
    const stat = await fs.stat(absPath)
    if (!stat.isFile()) {
      throw new Error('Path is not a file')
    }

    if (stat.size > maxBytes) {
      // Read only the first maxBytes to avoid loading huge files into memory.
      const handle = await fs.open(absPath, 'r')
      let slice: Buffer
      try {
        const buf = Buffer.allocUnsafe(maxBytes)
        const { bytesRead } = await handle.read(buf, 0, maxBytes, 0)
        slice = buf.subarray(0, bytesRead)
      } finally {
        await handle.close()
      }
      return {
        content: slice.toString('utf-8'),
        meta: { mtimeMs: stat.mtimeMs, bytes: stat.size, truncated: true }
      }
    }

    const content = await fs.readFile(absPath, 'utf-8')
    return { content, meta: { mtimeMs: stat.mtimeMs, bytes: stat.size, truncated: false } }
  }

  private formatPastChatHistory(history: Anthropic.MessageParam[], maxChars: number): string {
    const tail = history.slice(-6)
    const lines = tail.map((m) => {
      const role = m.role
      const content =
        typeof m.content === 'string'
          ? m.content
          : Array.isArray(m.content)
            ? m.content.map((b) => (b.type === 'text' ? b.text : `[${b.type}]`)).join('\n')
            : ''
      return `${role}:\n${content}`.trim()
    })
    const joined = lines.join('\n\n')
    if (joined.length <= maxChars) return joined
    return `${joined.slice(0, maxChars)}\n\n[TRUNCATED: past chat exceeded char limit]`
  }

  constructor(
    updateTaskHistory: (historyItem: HistoryItem) => Promise<HistoryItem[]>,
    postStateToWebview: () => Promise<void>,
    postMessageToWebview: (message: ExtensionMessage) => Promise<void>,
    reinitExistingTaskFromId: (taskId: string) => Promise<void>,
    apiConfiguration: ApiConfiguration,
    autoApprovalSettings: AutoApprovalSettings,
    hosts: Host[],
    mcpHub: McpHub,
    skillsManager?: SkillsManager,
    customInstructions?: string,
    task?: string,
    historyItem?: HistoryItem,
    chatTitle?: string,
    taskId?: string,
    initialUserContentParts?: ContentPart[]
  ) {
    this.updateTaskHistory = updateTaskHistory
    this.postStateToWebview = postStateToWebview
    this.postMessageToWebview = postMessageToWebview
    this.reinitExistingTaskFromId = reinitExistingTaskFromId
    this.mcpHub = mcpHub
    this.skillsManager = skillsManager
    this.remoteTerminalManager = new RemoteTerminalManager()
    this.localTerminalManager = LocalTerminalManager.getInstance()
    this.contextManager = new ContextManager()
    this.customInstructions = customInstructions
    this.autoApprovalSettings = autoApprovalSettings
    logger.info('[Task Init] AutoApprovalSettings initialized', { value: JSON.stringify(autoApprovalSettings, null, 2) })
    this.hosts = hosts
    this.chatTitle = chatTitle
    this.updateMessagesLanguage()

    // Set up MCP notification callback for real-time notifications
    // this.mcpHub.setNotificationCallback(async (serverName: string, _level: string, message: string) => {
    //   // Display notification in chat immediately
    //   await this.say('mcp_notification', `[${serverName}] ${message}`)
    // })

    // Initialize taskId first
    if (historyItem) {
      this.taskId = historyItem.id
      this.taskIsFavorited = historyItem.isFavorited
      this.conversationHistoryDeletedRange = historyItem.conversationHistoryDeletedRange
    } else if (task && taskId) {
      this.taskId = taskId
      logger.info(`[Task Init] New task created with ID: ${this.taskId}`)
      this.setNextUserInputContentParts(initialUserContentParts)
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

    // Initialize CommandSecurityManager for security
    this.commandSecurityManager = new CommandSecurityManager()
    this.commandSecurityManager.initialize()

    // Continue with task initialization
    if (historyItem) {
      this.resumeTaskFromHistory()
    } else if (task) {
      this.startTask(task, initialUserContentParts)
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

  /**
   * Create an LLM caller for interaction detection
   * Uses the current API handler to send messages to the LLM
   */
  private createInteractionLlmCaller(): (command: string, output: string, locale: string) => Promise<InteractionResult> {
    return createLlmCaller(async (systemPrompt: string, userPrompt: string): Promise<string> => {
      if (process.env.CHATERM_INTERACTION_DEBUG === '1') {
        const provider = (await getGlobalState('apiProvider')) as string
        const modelId = this.api.getModel().id
        logger.info('LLM request meta', {
          provider,
          modelId,
          systemLength: systemPrompt.length,
          userLength: userPrompt.length
        })
      }
      const messages: Anthropic.MessageParam[] = [{ role: 'user', content: userPrompt }]
      const stream = this.api.createMessage(systemPrompt, messages)
      let responseText = ''
      for await (const chunk of stream) {
        if (chunk.type === 'text') {
          responseText += chunk.text
        }
      }
      return responseText
    })
  }

  /**
   * Get user locale for interaction detection
   */
  private async getUserLocale(): Promise<string> {
    try {
      const userConfig = await getUserConfig()
      return userConfig?.language || 'en-US'
    } catch {
      return 'en-US'
    }
  }

  /**
   * Check if the given IP is a local host
   */
  private isLocalHost(ip?: string): boolean {
    if (!ip) return false
    return ip === '127.0.0.1' || ip === 'localhost' || ip === '::1'
  }

  /**
   * Execute command in local host
   */
  private async executeCommandInLocalHost(command: string, cwd?: string): Promise<string> {
    try {
      const result = await this.localTerminalManager.executeCommand(command, cwd)
      if (result.success) {
        return result.output || ''
      } else {
        throw new Error(result.error || 'Local command execution failed')
      }
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

  private async executeCommandInRemoteServer(command: string, ip?: string, cwd?: string): Promise<string> {
    // If it's local host, use local execution
    if (this.isLocalHost(ip)) {
      return this.executeCommandInLocalHost(command, cwd)
    }
    try {
      const terminalInfo = await this.connectTerminal(ip)
      if (!terminalInfo) {
        const hostLabel = ip || 'unknown'
        const failedMsg = this.messages.sshConnectionFailed
          ? formatMessage(this.messages.sshConnectionFailed, { host: hostLabel })
          : `服务器连接失败(${hostLabel})`
        await this.ask('ssh_con_failed', failedMsg, false)
        await this.abortTask()
        throw new Error('Failed to connect to terminal')
      }
      const userLocale = await this.getUserLocale()
      return new Promise<string>((resolve, reject) => {
        const outputLines: string[] = []
        let isCompleted = false
        const process = this.remoteTerminalManager.runCommand(terminalInfo, command, cwd, {
          taskId: this.taskId,
          enableInteraction: true,
          llmCaller: this.createInteractionLlmCaller(),
          userLocale
        })
        const timeout = setTimeout(() => {
          if (!isCompleted) {
            isCompleted = true
            const result = outputLines.join('\n')
            resolve(result)
          }
        }, 10000)
        process.on('line', (line) => {
          outputLines.push(line)
        })

        process.on('error', (error) => {
          reject(new Error(`Command execution failed: ${error.message}`))
          clearTimeout(timeout)
          if (!isCompleted) {
            isCompleted = true
            resolve('')
          }
        })

        process.once('completed', () => {
          clearTimeout(timeout)
          setTimeout(() => {
            if (!isCompleted) {
              isCompleted = true
              const result = outputLines.join('\n')
              resolve(result)
            }
          }, 100)
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

  /**
   * Get a stable color (hex) for a host. Different hostId -> different palette slot.
   */
  private getHostColor(hostId: string): string {
    const existing = this.hostColorMap.get(hostId)
    if (existing) return existing

    const palette = ['#3B82F6', '#10B981', '#F97316', '#EF4444', '#8B5CF6', '#14B8A6', '#EAB308', '#06B6D4', '#F59E0B', '#6366F1']

    // djb2 hash for stable distribution
    let hash = 5381
    for (let i = 0; i < hostId.length; i++) {
      hash = (hash * 33) ^ hostId.charCodeAt(i)
    }
    const color = palette[Math.abs(hash) % palette.length]
    this.hostColorMap.set(hostId, color)
    return color
  }

  private buildHostInfo(hostId: string): HostInfo {
    return {
      hostId,
      hostName: hostId,
      colorTag: this.getHostColor(hostId)
    }
  }

  private isSameHost(message: ChatermMessage | undefined, hostInfo?: HostInfo): boolean {
    if (!hostInfo) return true
    return message?.hostId === hostInfo.hostId
  }

  private async connectTerminal(ip?: string) {
    if (!this.hosts) {
      logger.info('Terminal UUID is not set')
      return
    }
    let terminalInfo: RemoteTerminalInfo | null = null
    const targetHost = ip ? this.hosts.find((host) => host.host === ip) : this.hosts[0]
    if (!targetHost || !targetHost.uuid) {
      logger.info('Terminal UUID is not set')
      return
    }
    const terminalUuid = targetHost.uuid
    try {
      let connectionInfo = await connectAssetInfo(terminalUuid)
      if (!connectionInfo) {
        connectionInfo = ExternalAssetCache.get(terminalUuid)
      }
      this.remoteTerminalManager.setConnectionInfo(connectionInfo)

      const hostLabel = connectionInfo?.host || targetHost.host || ip || 'unknown'
      // Create a unique connection identifier
      const currentConnectionId = `${connectionInfo.host}:${connectionInfo.port}:${connectionInfo.username}`
      const isNewConnection = !this.connectedHosts.has(currentConnectionId)

      // Check if this is an agent mode + local connection scenario that will fail
      const chatSettings = await getGlobalState('chatSettings')
      const isLocalConnection =
        targetHost.connection?.toLowerCase?.() === 'localhost' || targetHost.uuid === 'localhost' || this.isLocalHost(targetHost.host)
      const shouldSkipConnectionMessages = chatSettings?.mode === 'agent' && isLocalConnection

      if (isNewConnection && !shouldSkipConnectionMessages) {
        // Send connection start message only for new connections
        await this.postMessageToWebview({
          type: 'partialMessage',
          partialMessage: {
            ts: Date.now(),
            type: 'say',
            say: 'sshInfo',
            text: this.messages.sshConnectionStarting
              ? formatMessage(this.messages.sshConnectionStarting, { host: hostLabel })
              : ` Connecting to server (${hostLabel})...`,
            partial: false
          }
        })
      }

      terminalInfo = await this.remoteTerminalManager.createTerminal()

      if (terminalInfo && isNewConnection) {
        if (!shouldSkipConnectionMessages) {
          // Send connection success message only for new connections
          await this.postMessageToWebview({
            type: 'partialMessage',
            partialMessage: {
              ts: Date.now(),
              type: 'say',
              say: 'sshInfo',
              text: this.messages.sshConnectionSuccess
                ? formatMessage(this.messages.sshConnectionSuccess, { host: hostLabel })
                : `Server connected successfully (${hostLabel})`,
              partial: false
            }
          })
        }

        // Mark this host as connected
        this.connectedHosts.add(currentConnectionId)
      }

      return terminalInfo
    } catch (error) {
      // Send connection failed message
      const hostLabel = ip || targetHost?.host || 'unknown'
      await this.postMessageToWebview({
        type: 'partialMessage',
        partialMessage: {
          ts: Date.now(),
          type: 'say',
          say: 'sshInfo',
          text: this.messages.sshConnectionFailed
            ? formatMessage(this.messages.sshConnectionFailed, { host: hostLabel })
            : `Server connection failed (${hostLabel}): ${error instanceof Error ? error.message : String(error)}`,
          partial: false
        }
      })
      throw error
    }
  }

  // Set remote connection information
  setRemoteConnectionInfo(connectionInfo: ConnectionInfo): void {
    this.remoteTerminalManager.setConnectionInfo(connectionInfo)
  }

  // Get terminal manager (public method)
  /**
   * Reload security configuration (for immediate effect after config file update)
   */
  async reloadSecurityConfig(): Promise<void> {
    if (this.commandSecurityManager) {
      await this.commandSecurityManager.reloadConfig()
    }
  }

  getTerminalManager() {
    return this.remoteTerminalManager
  }

  // Storing task to disk for history
  private async addToApiConversationHistory(message: Anthropic.MessageParam) {
    this.apiConversationHistory.push(message)
    await saveApiConversationHistory(this.taskId, this.apiConversationHistory)
  }

  private async addToChatermMessages(message: ChatermMessage) {
    message.conversationHistoryIndex = this.apiConversationHistory.length
    message.conversationHistoryDeletedRange = this.conversationHistoryDeletedRange
    this.chatermMessages.push(message)
    await this.saveChatermMessagesAndUpdateHistory()
  }

  private async overwriteChatermMessages(newMessages: ChatermMessage[]) {
    this.chatermMessages = newMessages
    await this.saveChatermMessagesAndUpdateHistory()
  }

  /**
   * Truncate chatermMessages and apiConversationHistory at the given timestamp.
   * Messages with ts >= the given timestamp will be removed.
   */
  private async truncateHistoryAtTimestamp(ts: number): Promise<void> {
    // logger.info('Truncating history at timestamp', { value: ts })
    const msgIndex = this.chatermMessages.findIndex((m) => m.ts >= ts)
    if (msgIndex <= 0) return

    const targetMsg = this.chatermMessages[msgIndex]
    const apiIndex = targetMsg.conversationHistoryIndex

    this.chatermMessages = this.chatermMessages.slice(0, msgIndex)

    if (apiIndex !== undefined && apiIndex >= 0) {
      this.apiConversationHistory = this.apiConversationHistory.slice(0, apiIndex)
      await saveApiConversationHistory(this.taskId, this.apiConversationHistory)
    }

    await this.saveChatermMessagesAndUpdateHistory()
    await this.postStateToWebview()
  }

  private async saveChatermMessagesAndUpdateHistory() {
    try {
      await saveChatermMessages(this.taskId, this.chatermMessages)

      // combined as they are in ChatView
      const apiMetrics = getApiMetrics(combineApiRequests(combineCommandSequences(this.chatermMessages.slice(1))))
      const taskMessage = this.chatermMessages[0] // first message is always the task say
      const lastRelevantMessage = this.chatermMessages.at(-1)
      if (!lastRelevantMessage) return

      await this.updateTaskHistory({
        id: this.taskId,
        ts: lastRelevantMessage.ts,
        task: taskMessage.text ?? '',
        chatTitle: this.chatTitle,
        tokensIn: apiMetrics.totalTokensIn,
        tokensOut: apiMetrics.totalTokensOut,
        cacheWrites: apiMetrics.totalCacheWrites,
        cacheReads: apiMetrics.totalCacheReads,
        totalCost: apiMetrics.totalCost,
        size: 0, // TODO: temporarily set to 0, consider changing or removing later
        conversationHistoryDeletedRange: this.conversationHistoryDeletedRange,
        isFavorited: this.taskIsFavorited
      })
    } catch (error) {
      logger.error('Failed to save chaterm messages', { error: error instanceof Error ? error.message : String(error) })
    }
  }

  async doesLatestTaskCompletionHaveNewChanges() {
    const messageIndex = findLastIndex(this.chatermMessages, (m) => m.say === 'completion_result')
    const message = this.chatermMessages[messageIndex]
    if (!message) {
      logger.error('Completion message not found')
      return false
    }
    const hash = message.lastCheckpointHash
    if (!hash) {
      logger.error('No checkpoint hash found')
      return false
    }

    // Get last task completed
    const lastTaskCompletedMessage = findLast(this.chatermMessages.slice(0, messageIndex), (m) => m.say === 'completion_result')

    try {
      // Get last task completed
      const lastTaskCompletedMessageCheckpointHash = lastTaskCompletedMessage?.lastCheckpointHash // ask is only used to relinquish control, its the last say we care about
      // if undefined, then we get diff from beginning of git
      // if (!lastTaskCompletedMessage) {
      // 	logger.error("No previous task completion message found")
      // 	return
      // }
      // This value *should* always exist
      const firstCheckpointMessageCheckpointHash = this.chatermMessages.find((m) => m.say === 'checkpoint_created')?.lastCheckpointHash

      const previousCheckpointHash = lastTaskCompletedMessageCheckpointHash || firstCheckpointMessageCheckpointHash // either use the diff between the first checkpoint and the task completion, or the diff between the latest two task completions

      if (!previousCheckpointHash) {
        return false
      }
    } catch (error) {
      logger.error('Failed to get diff set', { error: error instanceof Error ? error.message : String(error) })
      return false
    }

    return false
  }

  // Communicate with webview
  // partial has three valid states true (partial message), false (completion of partial message), undefined (individual complete message)
  async ask(
    type: ChatermAsk,
    text?: string,
    partial?: boolean,
    mcpToolCall?: { serverName: string; toolName: string; arguments: Record<string, unknown> }
  ): Promise<{
    response: ChatermAskResponse
    text?: string
    contentParts?: ContentPart[]
  }> {
    if (this.abort) {
      throw new Error('Chaterm instance aborted')
    }

    if (this.askResponsePayload) {
      const payload = this.askResponsePayload
      this.resetAskState()
      return payload
    }

    let askTsRef = { value: Date.now() }
    this.lastMessageTs = askTsRef.value

    if (partial !== undefined) {
      await this.handleAskPartialMessage(type, askTsRef, text, partial, mcpToolCall)
      if (partial) {
        throw new Error('Current ask promise was ignored')
      }
    } else {
      this.resetAskState()
      await this.addToChatermMessages({
        ts: askTsRef.value,
        type: 'ask',
        ask: type,
        text,
        mcpToolCall
      })
      await this.postStateToWebview()
    }

    await pWaitFor(() => this.askResponsePayload !== undefined || this.lastMessageTs !== askTsRef.value, {
      interval: 100
    })

    if (this.lastMessageTs !== askTsRef.value) {
      throw new Error('Current ask promise was ignored')
    }

    const payload = this.askResponsePayload
    if (!payload) {
      throw new Error('Unexpected: ask response payload is missing')
    }
    this.resetAskState()
    return payload
  }

  private resetAskState(): void {
    this.askResponsePayload = undefined
  }

  private async handleAskPartialMessage(
    type: ChatermAsk,
    askTsRef: {
      value: number
    },
    text?: string,
    isPartial?: boolean,
    mcpToolCall?: { serverName: string; toolName: string; arguments: Record<string, unknown> }
  ): Promise<void> {
    const lastMessage = this.chatermMessages.at(-1)
    const isUpdatingPreviousPartial = lastMessage && lastMessage.partial && lastMessage.type === 'ask' && lastMessage.ask === type

    if (isPartial) {
      if (isUpdatingPreviousPartial) {
        askTsRef.value = lastMessage.ts
        this.lastMessageTs = lastMessage.ts
        lastMessage.text = text
        lastMessage.partial = isPartial
        if (mcpToolCall) {
          lastMessage.mcpToolCall = mcpToolCall
        }
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
          partial: isPartial,
          mcpToolCall
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
        if (mcpToolCall) {
          lastMessage.mcpToolCall = mcpToolCall
        }
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
          text,
          mcpToolCall
        }
        await this.addToChatermMessages(newMessage)
        await this.postMessageToWebview({
          type: 'partialMessage',
          partialMessage: newMessage
        })
      }
    }
  }

  async handleWebviewAskResponse(askResponse: ChatermAskResponse, text?: string, truncateAtMessageTs?: number, contentParts?: ContentPart[]) {
    logger.info(`[Task] handleWebviewAskResponse called with askResponse: ${askResponse}, taskId: ${this.taskId}`)
    if (truncateAtMessageTs !== undefined) {
      await this.truncateHistoryAtTimestamp(truncateAtMessageTs)
    }

    // Consume by the next API request only (prevents repeated doc/chat reads within the same round).
    this.setNextUserInputContentParts(contentParts)
    this.askResponsePayload = {
      response: askResponse,
      text,
      contentParts
    }
  }

  async say(type: ChatermSay, text?: string, partial?: boolean, hostInfo?: HostInfo, contentParts?: ContentPart[]): Promise<undefined> {
    if (this.abort) {
      throw new Error('Chaterm instance aborted')
    }
    const hasContentParts = (contentParts?.length ?? 0) > 0
    if ((text === undefined || text === '') && !hasContentParts) {
      // logger.warn('Chaterm say called with empty text, ignoring')
      return
    }

    if (partial !== undefined) {
      await this.handleSayPartialMessage(type, text, partial, hostInfo)
    } else {
      // this is a new non-partial message, so add it like normal
      const sayTs = Date.now()
      this.lastMessageTs = sayTs
      await this.addToChatermMessages({
        ts: sayTs,
        type: 'say',
        say: type,
        text,
        contentParts,
        ...(hostInfo ?? {})
      })
      await this.postStateToWebview()
    }
  }

  private async handleSayPartialMessage(type: ChatermSay, text?: string, partial?: boolean, hostInfo?: HostInfo): Promise<void> {
    const lastMessage = this.chatermMessages.at(-1)
    // Check if updating previous partial message with same type AND same host
    const isUpdatingPreviousPartial =
      lastMessage && lastMessage.partial && lastMessage.type === 'say' && lastMessage.say === type && this.isSameHost(lastMessage, hostInfo)
    if (partial) {
      if (isUpdatingPreviousPartial) {
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
          partial,
          ...(hostInfo ?? {})
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
          text,
          ...(hostInfo ?? {})
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

  private async startTask(task?: string, initialUserContentParts?: ContentPart[]): Promise<void> {
    this.chatermMessages = []
    this.apiConversationHistory = []
    this.connectedHosts.clear()

    await this.postStateToWebview()

    await this.say('text', task, undefined, undefined, initialUserContentParts)

    this.isInitialized = true

    // Build initial user content
    let initialUserContent: UserContent = [
      {
        type: 'text',
        text: `<task>\n${task}\n</task>`
      }
    ]
    // Smart detection: check if todo needs to be created
    if (task) {
      await this.checkAndCreateTodoIfNeeded(task)
      // Include system messages added by smart detection into initial user content
      if (this.userMessageContent.length > 0) {
        initialUserContent.push(...this.userMessageContent)
      }
    }

    // Check if there are system reminders that need to be included in initial request
    if (this.apiConversationHistory.length > 0) {
      const lastMessage = this.apiConversationHistory[this.apiConversationHistory.length - 1]
      if (lastMessage.role === 'user') {
        const lastContent: Anthropic.ContentBlockParam[] = Array.isArray(lastMessage.content)
          ? lastMessage.content
          : [{ type: 'text' as const, text: lastMessage.content }]
        const hasSystemCommand = lastContent.some(
          (content) => content.type === 'text' && (content.text.includes('<system-command>') || content.text.includes('<system-reminder>'))
        )

        if (hasSystemCommand) {
          // Add system reminder to initial user content
          initialUserContent.push(...lastContent)
          // Remove from conversation history to avoid duplication
          this.apiConversationHistory.pop()
        }
      }
    }

    // let imageBlocks: Anthropic.ImageBlockParam[] = formatResponse.imageBlocks(images)
    await this.initiateTaskLoop(initialUserContent)
  }

  private async resumeTaskFromHistory() {
    const modifiedChatermMessages = await getChatermMessages(this.taskId)

    // Remove incomplete api_req_started (no cost and no cancel reason indicates interrupted request)
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
    await this.contextManager.initializeContextHistory(this.taskId)

    this.isInitialized = true

    // Wait for user to send a message to continue
    const { text, contentParts } = await this.ask('resume_task', '', false)

    // TODO:support only chip or image input
    if (text) {
      await this.sayUserFeedback(text, contentParts)

      // If last API message is user, remove it (API requires user/assistant alternation)
      let userContent: UserContent = [{ type: 'text', text }]

      await this.initiateTaskLoop(userContent)
    }
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
    // Clean up command contexts to prevent stale IPC references
    Task.clearCommandContextsForTask(this.taskId)
  }

  async gracefulAbortTask() {
    this.gracefulCancel = true
    // Don't set abort = true, so the main loop continues
    // Just stop the current process
    if (this.currentRunningProcess) {
      // Stop the current process but don't terminate the entire task
      this.remoteTerminalManager.disposeAll()
      // Clean up command contexts for this task
      Task.clearCommandContextsForTask(this.taskId)
    }
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

  /**
   * Execute command tool on local host
   */
  async executeLocalCommandTool(command: string): Promise<ToolResponse> {
    let result = ''
    let chunkTimer: NodeJS.Timeout | null = null

    // Get host info for local host (127.0.0.1) for multi-host identification
    const hostInfo = this.buildHostInfo('127.0.0.1')

    try {
      const terminal = await this.localTerminalManager.createTerminal()
      const process = this.localTerminalManager.runCommand(terminal, command)

      // Store the current running process so it can receive interactive input
      this.currentRunningProcess = process

      // Chunked terminal output buffering
      const CHUNK_LINE_COUNT = 20
      const CHUNK_BYTE_SIZE = 2048 // 2KB
      const CHUNK_DEBOUNCE_MS = 100

      let outputBuffer: string[] = []
      let outputBufferSize: number = 0
      let chunkEnroute = false

      const flushBuffer = async (force = false) => {
        if (!force && (chunkEnroute || outputBuffer.length === 0)) {
          return
        }
        outputBuffer = []
        outputBufferSize = 0
        chunkEnroute = true
        try {
          // Send the complete output up to now, for the frontend to replace entirely
          // Include host info for multi-host identification
          await this.say('command_output', result, true, hostInfo)
        } catch (error) {
          logger.error('Error while saying for command output', { error: error instanceof Error ? error.message : String(error) }) // Log error
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

      process.on('line', async (line) => {
        result += line
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
        this.currentRunningProcess = null

        // Clear the timer and flush any remaining buffer
        if (chunkTimer) {
          clearTimeout(chunkTimer)
          chunkTimer = null
        }
        await flushBuffer(true)
      })

      process.on('error', async (error) => {
        completed = true
        this.currentRunningProcess = null
        result += `\nError: ${error.message}`

        // Clear the timer and flush any remaining buffer
        if (chunkTimer) {
          clearTimeout(chunkTimer)
          chunkTimer = null
        }
        await flushBuffer(true)
      })

      // Wait for completion
      await new Promise<void>((resolve) => {
        const checkCompletion = () => {
          if (completed) {
            resolve()
          } else {
            setTimeout(checkCompletion, 100)
          }
        }
        checkCompletion()
      })

      // Wait for a short delay to ensure all messages are sent to the webview
      // This delay allows time for non-awaited promises to be created and
      // for their associated messages to be sent to the webview, maintaining
      // the correct order of messages
      await new Promise((resolve) => setTimeout(resolve, 100))

      const lastMessage = this.chatermMessages.at(-1)
      if (lastMessage?.say === 'command_output') {
        await this.say('command_output', lastMessage.text, false, hostInfo)
      }

      const truncatedResult = this.truncateCommandOutput(result)

      if (completed) {
        return `${this.messages.commandExecutedOutput}${truncatedResult.length > 0 ? `\nOutput:\n${truncatedResult}` : ''}`
      } else {
        return `${this.messages.commandStillRunning}${
          truncatedResult.length > 0 ? `${this.messages.commandHereIsOutput}${truncatedResult}` : ''
        }${this.messages.commandUpdateFuture}`
      }
    } catch (error) {
      logger.error('Error executing local command', { error: error instanceof Error ? error.message : String(error) })
      this.currentRunningProcess = null
      return `Local command execution failed: ${error instanceof Error ? error.message : String(error)}`
    }
  }

  async executeCommandTool(command: string, ip: string): Promise<ToolResponse> {
    // If it's local host, use local execution
    if (this.isLocalHost(ip)) {
      return this.executeLocalCommandTool(command)
    }

    let result = ''
    let chunkTimer: NodeJS.Timeout | null = null

    // Get host info for multi-host identification (assign stable color per host)
    const hostInfo = this.buildHostInfo(ip)

    try {
      const terminalInfo = await this.connectTerminal(ip)
      if (!terminalInfo) {
        const hostLabel = ip || 'unknown'
        const failedMsg = this.messages.sshConnectionFailed
          ? formatMessage(this.messages.sshConnectionFailed, { host: hostLabel })
          : `服务器连接失败(${hostLabel})`
        await this.ask('ssh_con_failed', failedMsg, false)
        await this.abortTask()
        return 'Failed to connect to terminal'
      }
      terminalInfo.terminal.show()
      const userLocale = await this.getUserLocale()
      const process = this.remoteTerminalManager.runCommand(terminalInfo, command, undefined, {
        taskId: this.taskId,
        enableInteraction: true,
        llmCaller: this.createInteractionLlmCaller(),
        userLocale
      })

      // Store the current running process so it can receive interactive input
      this.currentRunningProcess = process

      // Chunked terminal output buffering
      const CHUNK_LINE_COUNT = 20
      const CHUNK_BYTE_SIZE = 2048 // 2KB
      const CHUNK_DEBOUNCE_MS = 100

      let outputBuffer: string[] = []
      let outputBufferSize: number = 0
      let chunkEnroute = false

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
          // Include host info for multi-host identification
          await this.say('command_output', result, true, hostInfo)
        } catch (error) {
          logger.error('Error while saying for command output', { error: error instanceof Error ? error.message : String(error) }) // Log error
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

        // Clear the current running process reference
        this.currentRunningProcess = null

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

      logger.info(`[Task] executeCommandTool: waiting for process to complete, taskId: ${this.taskId}`)
      await process
      logger.info(`[Task] executeCommandTool: process completed, taskId: ${this.taskId}`)

      // Wait for a short delay to ensure all messages are sent to the webview
      // This delay allows time for non-awaited promises to be created and
      // for their associated messages to be sent to the webview, maintaining
      // the correct order of messages
      await new Promise((resolve) => setTimeout(resolve, 100))

      const lastMessage = this.chatermMessages.at(-1)
      if (lastMessage?.say === 'command_output') {
        await this.say('command_output', lastMessage.text, false, hostInfo)
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
      // Clear the current running process reference on error
      this.currentRunningProcess = null

      // Clear any pending timer to prevent additional command_output messages
      if (chunkTimer) {
        clearTimeout(chunkTimer)
        chunkTimer = null
      }

      // Check if this is a graceful cancel with partial output
      if (this.gracefulCancel && result && result.trim()) {
        const truncatedResult = this.truncateCommandOutput(result)
        return `Command was gracefully cancelled with partial output.${truncatedResult.length > 0 ? `\nPartial Output:\n${truncatedResult}` : ''}`
      }

      // Original error handling logic
      await this.ask('ssh_con_failed', err instanceof Error ? err.message : String(err), false)
      await this.abortTask()
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
          logger.info(`[AutoApproval] Tool ${toolName} not in auto-approval list, returning false`)
          break
      }
    } else {
      logger.info(`[AutoApproval] Auto-approval disabled, returning false`)
    }
    return false
  }

  private formatErrorWithStatusCode(error: unknown): string {
    const errorObj = error as { status?: number; statusCode?: number; response?: { status?: number }; message?: string }
    const statusCode = errorObj?.status || errorObj?.statusCode || (errorObj?.response && errorObj.response.status)
    const message = errorObj?.message ?? JSON.stringify(serializeError(error), null, 2)

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

    // Apply summarizeUpToTs filter if specified
    let conversationHistory = contextManagementMetadata.truncatedConversationHistory
    if (this.summarizeUpToTs !== undefined) {
      conversationHistory = this.contextManager.filterConversationHistoryByTimestamp(conversationHistory, this.chatermMessages, this.summarizeUpToTs)
      this.summarizeUpToTs = undefined
    }

    let stream = this.api.createMessage(systemPrompt, conversationHistory)

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

    // Check if user input needs todo creation (for subsequent conversations)
    await this.checkUserContentForTodo(userContent)

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

    const { response, text, contentParts } = await this.ask('mistake_limit_reached', errorMessage)

    if (response === 'messageResponse') {
      await this.sayUserFeedback(text ?? '', contentParts)
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
    const userInputParts = this.consumeNextUserInputContentParts()

    // Process all content parts: images, docs, chats, and command chips
    const ephemeralBlocks = await this.processContentParts(userContent, userInputParts)
    if (ephemeralBlocks.length > 0) {
      userContent.push(...ephemeralBlocks)
    }

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

  /**
   * Process slash commands in user content and content parts.
   * Handles both built-in commands (e.g., /summary-to-doc) and knowledge base commands.
   * Returns cmdLines for knowledge base command content.
   */
  private async processSlashCommands(userContent: UserContent, contentParts?: ContentPart[]): Promise<string[]> {
    const MAX_COMMANDS = 5
    const cmdLines: string[] = []
    if (!contentParts) return cmdLines

    this.summarizeUpToTs = undefined

    const commandChips = contentParts.filter((p) => p.type === 'chip' && p.chipType === 'command').slice(0, MAX_COMMANDS)
    if (commandChips.length === 0) return cmdLines

    try {
      const userConfig = await getUserConfig()
      const isChinese = userConfig?.language === 'zh-CN'

      const MAX_DOC_BYTES = 256 * 1024

      for (const chip of commandChips) {
        const { command, path, summarizeUpToTs } = chip.ref

        if (path) {
          try {
            const { content } = await this.readFile(path, MAX_DOC_BYTES)
            cmdLines.push(content)
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e)
            cmdLines.push(`- COMMAND_READ_ERROR: ${command}: ${msg}`)
            logger.error(`[Task] Failed to read command file for "${command}"`, { error: msg })
          }
        } else {
          // Built-in command: handle by command type
          if (command === SLASH_COMMANDS.SUMMARY_TO_DOC) {
            if (summarizeUpToTs) {
              this.summarizeUpToTs = summarizeUpToTs
            }

            // Replace text content with full prompt
            for (const block of userContent) {
              if (block.type === 'text' && block.text.trim() === command) {
                block.text = getSummaryToDocPrompt(isChinese)
              }
            }
          }
        }
      }
    } catch (error) {
      logger.error('[Task] Failed to process slash commands', { error: error instanceof Error ? error.message : String(error) })
    }
    return cmdLines
  }

  private async handleFirstRequestCheckpoint(): Promise<void> {
    const isFirstRequest = this.chatermMessages.filter((m) => m.say === 'api_req_started').length === 0
    if (!isFirstRequest) return

    await this.say('checkpoint_created')

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

  private createMessageUpdater(streamMetrics: StreamMetrics): MessageUpdater {
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

  private async processStream(stream: ApiStream, streamMetrics: StreamMetrics, messageUpdater: MessageUpdater): Promise<string> {
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

  private handleUsageChunk(chunk: ApiStreamUsageChunk, streamMetrics: StreamMetrics): void {
    streamMetrics.didReceiveUsageChunk = true
    streamMetrics.inputTokens += chunk.inputTokens
    streamMetrics.outputTokens += chunk.outputTokens
    streamMetrics.cacheWriteTokens += chunk.cacheWriteTokens ?? 0
    streamMetrics.cacheReadTokens += chunk.cacheReadTokens ?? 0
    streamMetrics.totalCost = chunk.totalCost
  }

  private async handleReasoningChunk(chunk: ApiStreamReasoningChunk, reasoningMessage: string): Promise<string> {
    reasoningMessage += chunk.reasoning
    if (!this.abort) {
      await this.say('reasoning', reasoningMessage, true)
    }
    return reasoningMessage
  }

  private async handleTextChunk(chunk: ApiStreamTextChunk, assistantMessage: string, reasoningMessage: string): Promise<string> {
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
      logger.info('aborting stream...')
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
    messageUpdater: MessageUpdater
  ): Promise<void> {
    const lastMessage = this.chatermMessages.at(-1)
    if (lastMessage && lastMessage.partial) {
      lastMessage.partial = false
      logger.info('updating partial message', { value: lastMessage })
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
    error: unknown,
    abortStream: (cancelReason: ChatermApiReqCancelReason, streamingFailedMessage?: string) => Promise<void>
  ): Promise<void> {
    this.abortTask()
    const errorMessage = this.formatErrorWithStatusCode(error)
    await abortStream('streaming_failed', errorMessage)
    await this.reinitExistingTaskFromId(this.taskId)
  }

  private async handleStreamUsageUpdate(streamMetrics: StreamMetrics, messageUpdater: MessageUpdater): Promise<void> {
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
        if (host.assetType?.startsWith('person-switch-')) {
          continue
        }

        details += `\n\n# ${formatMessage(this.messages.hostWorkingDirectory, { host: host.host })}:\n`

        const res = await this.executeCommandInRemoteServer('ls -al', host.host)

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
    // Note: interactive parameter parsed but reserved for future use
    void block.params.interactive

    try {
      if (block.partial) {
        const shouldAutoApprove = this.shouldAutoApproveTool(block.name)
        logger.info(`[Command Execution] Partial command, shouldAutoApprove: ${shouldAutoApprove}`)
        if (!shouldAutoApprove) {
          logger.info(`[Command Execution] Asking for partial command approval`)
          await this.ask('command', this.removeClosingTag(block.partial, 'command', command), block.partial).catch(() => {})
        } else {
          logger.info(`[Command Execution] Auto-approving partial command`)
        }
        return
      } else {
        if (!command) return this.handleMissingParam('command', toolDescription, 'execute_command')
        if (!ip) return this.handleMissingParam('ip', toolDescription, 'execute_command')
        if (!requiresApprovalRaw) return this.handleMissingParam('requires_approval', toolDescription, 'execute_command')
        command = decodeHtmlEntities(command)
        // Perform security check
        const securityCheck = await this.performCommandSecurityCheck(command, toolDescription)
        if (securityCheck.shouldReturn) {
          return
        }
        const { needsSecurityApproval, securityMessage } = securityCheck

        this.consecutiveMistakeCount = 0
        let didAutoApprove = false
        const chatSettings = await getGlobalState('chatSettings')

        if (chatSettings?.mode === 'cmd' || needsSecurityApproval) {
          // If security confirmation needed, show security warning first
          if (needsSecurityApproval) {
            this.removeLastPartialMessageIfExistsWithType('ask', 'command')
            await this.say('error', securityMessage, false)
          }

          // Unified user confirmation (including security confirmation and command execution confirmation)
          const didApprove = await this.askApproval(toolDescription, 'command', command)
          if (!didApprove) {
            if (needsSecurityApproval) {
              await this.say('error', formatMessage(this.messages.userRejectedCommand, { command }), false)
            }
            await this.saveCheckpoint()
            return
          }

          // Only cmd mode returns directly, wait for frontend to execute command
          if (chatSettings?.mode === 'cmd') {
            // Wait for frontend to execute command and return result
            return
          }
          // In agent mode, continue executing subsequent logic
        }

        const autoApproveResult = this.shouldAutoApproveTool(block.name)
        let [autoApproveSafe, autoApproveAll] = Array.isArray(autoApproveResult) ? autoApproveResult : [autoApproveResult, false]

        // If security confirmation already passed, skip auto-approval logic
        if (
          !needsSecurityApproval &&
          ((!requiresApprovalPerLLM && autoApproveSafe) || (requiresApprovalPerLLM && autoApproveSafe && autoApproveAll))
        ) {
          // In auto-approval mode, commands without security risks execute directly
          this.removeLastPartialMessageIfExistsWithType('ask', 'command')
          await this.say('command', command, false)
          this.consecutiveAutoApprovedRequestsCount++
          didAutoApprove = true
        } else if (!needsSecurityApproval) {
          // Check if read-only commands can be auto-approved:
          // 1. Global setting: autoExecuteReadOnlyCommands enabled in preferences (read latest from global state)
          // 2. Session setting: user clicked "auto-approve read-only" button in this session
          const latestAutoApprovalSettings = await getGlobalState('autoApprovalSettings')
          const globalAutoExecuteReadOnly = latestAutoApprovalSettings?.actions?.autoExecuteReadOnlyCommands ?? false
          if (!requiresApprovalPerLLM && (globalAutoExecuteReadOnly || this.readOnlyCommandsAutoApproved)) {
            // Auto-approve read-only command
            const reason = globalAutoExecuteReadOnly ? 'global setting' : 'session auto-approval'
            logger.info(`[Command Execution] Auto-approving read-only command (${reason} enabled)`)
            this.removeLastPartialMessageIfExistsWithType('ask', 'command')
            await this.say('command', command, false)
            this.consecutiveAutoApprovedRequestsCount++
            didAutoApprove = true
          } else {
            this.showNotificationIfNeeded(`Chaterm wants to execute a command: ${command}`)
            const didApprove = await this.askApproval(toolDescription, 'command', command)
            logger.info(`[Command Execution] User approval result: ${didApprove}`)
            if (!didApprove) {
              await this.saveCheckpoint()
              return
            }
            // Note: Session auto-approval is now triggered by the "autoApproveReadOnlyClicked" response
            // which is handled in askApproval method
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

        this.pushToolResult(toolDescription, result)

        // Record tool call to active todo
        try {
          await TodoToolCallTracker.recordToolCall(this.taskId, 'execute_command', {
            command: command!,
            ip: ip!
          })
        } catch (error) {
          logger.error('Failed to track tool call', { error: error instanceof Error ? error.message : String(error) })
          // Don't affect main functionality, only log error
        }

        // Add todo status update reminder
        await this.addTodoStatusUpdateReminder(result)

        await this.saveCheckpoint()
      }
    } catch (error) {
      await this.handleToolError(toolDescription, 'executing command', error as Error)
      await this.saveCheckpoint()
    }
  }

  private async handleMissingParam(paramName: string, toolDescription: string, toolName: ToolUseName): Promise<void> {
    this.consecutiveMistakeCount++
    this.pushToolResult(toolDescription, await this.sayAndCreateMissingParamError(toolName, paramName))
    return this.saveCheckpoint()
  }
  /**
   * Perform command security check
   * @param command Command to check
   * @param toolDescription Tool description, used for error reporting
   * @returns Security check result
   */
  private async performCommandSecurityCheck(
    command: string,
    toolDescription: string
  ): Promise<{
    needsSecurityApproval: boolean
    securityMessage: string
    shouldReturn: boolean
  }> {
    logger.info('commandSecurityManager.getSecurityConfig()', { value: this.commandSecurityManager.getSecurityConfig() })

    // Security check: verify if command is in blacklist
    const securityResult = this.commandSecurityManager.validateCommandSecurity(command)
    logger.info('securityResult', { value: securityResult })

    // Identify if security confirmation is needed
    let needsSecurityApproval = false
    let securityMessage = ''

    if (!securityResult.isAllowed) {
      if (securityResult.requiresApproval) {
        // Dangerous command requiring user confirmation
        needsSecurityApproval = true
        securityMessage = `${this.messages.dangerousCommandDetected}\n${formatMessage(this.messages.securityReason, { reason: securityResult.reason })}\n${formatMessage(this.messages.securityDegree, { severity: securityResult.severity })}\n${this.messages.securityConfirmationRequired}\n\n${this.messages.securitySettingsLink}`
      } else {
        // Command that is directly blocked
        const blockedMessage = formatMessage(this.messages.commandBlocked, {
          command: command,
          reason: securityResult.reason
        })
        const fullBlockedMessage = `${blockedMessage}\n\n${this.messages.securitySettingsLink}`
        await this.say('command_blocked', fullBlockedMessage, false)
        // Return tool execution blocked result to LLM, use keyword to trigger security stop mechanism
        this.pushToolResult(toolDescription, `command_blocked! ${blockedMessage}`)
        await this.saveCheckpoint()
        return { needsSecurityApproval: false, securityMessage: '', shouldReturn: true }
      }
    } else if (securityResult.requiresApproval) {
      // Command is allowed but requires user confirmation
      needsSecurityApproval = true
      securityMessage = `${this.messages.dangerousCommandDetected}\n${formatMessage(this.messages.securityReason, { reason: securityResult.reason })}\n${formatMessage(this.messages.securityDegree, { severity: securityResult.severity })}\n${this.messages.securityConfirmationRequired}\n\n${this.messages.securitySettingsLink}`
    }

    return { needsSecurityApproval, securityMessage, shouldReturn: false }
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
      case 'use_mcp_tool':
        return `[${block.name} - ${block.params.server_name}/${block.params.tool_name}]`
      case 'access_mcp_resource':
        return `[${block.name} - ${block.params.server_name}:${block.params.uri}]`
      default:
        return `[${block.name}]`
    }
  }

  private pushToolResult(toolDescription: string, content: ToolResponse, options?: { dontLock?: boolean }): void {
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
    // For todo tools, we allow combining with one additional tool in the same message.
    // When options.dontLock is true, do not mark that a tool has been used yet.
    if (!options?.dontLock) {
      this.didAlreadyUseTool = true
    }
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
    const { response, text, contentParts } = await this.ask(type, partialMessage, false)
    const approved = response === 'yesButtonClicked' || response === 'autoApproveReadOnlyClicked'

    // If user clicked "auto-approve read-only" button, enable session-level auto-approval for subsequent read-only commands
    if (response === 'autoApproveReadOnlyClicked') {
      this.readOnlyCommandsAutoApproved = true
      logger.info(`[Command Execution] User enabled session auto-approval for read-only commands`)
    }

    if (!approved) {
      this.pushToolResult(toolDescription, formatResponse.toolDenied())
      if (text) {
        this.pushAdditionalToolFeedback(text)
        await this.sayUserFeedback(text, contentParts)
        await this.saveCheckpoint()
      }
      this.didRejectTool = true
    } else if (text) {
      this.pushAdditionalToolFeedback(text)
      await this.sayUserFeedback(text, contentParts)
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
      logger.info('Ignoring error since task was abandoned')
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

      const { text, contentParts } = await this.ask('followup', JSON.stringify(sharedMessage), false)

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
        await this.sayUserFeedback(text ?? '', contentParts)
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

      const { response, text, contentParts } = await this.ask('completion_result', '', false)
      if (response === 'yesButtonClicked') {
        this.pushToolResult(toolDescription, '')
        return
      }
      await this.sayUserFeedback(text ?? '', contentParts)
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

      const { text, contentParts } = await this.ask('condense', context, false)

      if (text) {
        await this.sayUserFeedback(text ?? '', contentParts)
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

      const requiredCheck = async (val: unknown, name: string): Promise<boolean> => {
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

      const { text, contentParts } = await this.ask('report_bug', bugReportData, false)
      if (text) {
        await this.sayUserFeedback(text ?? '', contentParts)
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

    // In chat mode, tools are not allowed - this is a pure conversation mode
    const chatSettings = await getGlobalState('chatSettings')
    if (chatSettings?.mode === 'chat') {
      this.userMessageContent.push({
        type: 'text',
        text: formatResponse.toolError('Chat mode does not support tool execution. This mode is for conversation, learning, and brainstorming only.')
      })
      await this.say('error', 'Chat mode does not support tool execution. This mode is for conversation, learning, and brainstorming only.', false)
      await this.saveCheckpoint()
      return
    }

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
      // Allow todo tools to run even after another tool has been used
      if (block.name !== 'todo_write' && block.name !== 'todo_read') {
        this.userMessageContent.push({
          type: 'text',
          text: formatResponse.toolAlreadyUsed(block.name)
        })
        return
      }
    }

    // Handle incomplete tool calls
    if (block.partial && !isAllowPartialTool(block.name)) {
      // For incomplete tool calls, we don't execute, wait for complete call
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
      case 'todo_write':
        await this.handleTodoWriteToolUse(block)
        break
      case 'todo_read':
        await this.handleTodoReadToolUse(block)
        break
      case 'glob_search':
        await this.handleGlobSearchToolUse(block)
        break
      case 'grep_search':
        await this.handleGrepSearchToolUse(block)
        break
      case 'use_mcp_tool':
        await this.handleUseMcpToolUse(block)
        break
      case 'access_mcp_resource':
        await this.handleAccessMcpResourceUse(block)
        break
      case 'use_skill':
        await this.handleUseSkillToolUse(block)
        break
      case 'summarize_to_knowledge':
        await this.handleSummarizeToKnowledgeToolUse(block)
        break
      default:
        logger.error(`[Task] Unknown tool name: ${block.name}`)
    }
    if (!block.name.startsWith('todo_') && block.name !== 'ask_followup_question' && block.name !== 'attempt_completion') {
      await this.addTodoStatusUpdateReminder('')
    }
  }

  private async handleGlobSearchToolUse(block: ToolUse): Promise<void> {
    const toolDescription = this.getToolDescription(block)
    try {
      const pattern = block.params.pattern || block.params.file_pattern
      const relPath = block.params.path || '.'
      const ip = block.params.ip
      const limitStr = block.params.limit
      const sort = (block.params.sort as 'path' | 'none') || 'path'
      if (!pattern) {
        await this.handleMissingParam('pattern', toolDescription, 'glob_search')
        return
      }

      const limit = limitStr ? Number.parseInt(limitStr, 10) : 2000

      let summary = ''
      if (ip && !this.isLocalHost(ip)) {
        // Remote: build command, execute, parse
        const cmd = buildRemoteGlobCommand({ pattern, path: relPath, limit, sort })
        const output = await this.executeCommandInRemoteServer(cmd, ip, undefined)
        const parsed = parseRemoteGlobOutput(output, sort, limit)
        const count = parsed.total
        summary += `Found ${count} files matching "${pattern}" in ${relPath} (sorted by ${sort}).\n`
        const list = parsed.files
          .map((f) => f.path)
          .slice(0, Math.min(count, 200))
          .join('\n')
        if (list) summary += list
      } else {
        // Local
        const res = await globSearch(process.cwd(), { pattern, path: relPath, limit, sort })
        const count = res.total
        summary += `Found ${count} files matching "${pattern}" in ${relPath} (sorted by ${sort}).\n`
        const list = res.files
          .map((f) => f.path)
          .slice(0, Math.min(count, 200))
          .join('\n')
        if (list) summary += list
      }

      // Show search results in UI immediately
      await this.say('search_result', summary.trim(), false)
      // Also push to LLM as tool result for context
      this.pushToolResult(toolDescription, summary.trim())
      await this.saveCheckpoint()
    } catch (error) {
      await this.handleToolError(toolDescription, 'glob search', error as Error)
      await this.saveCheckpoint()
    }
  }

  private async handleGrepSearchToolUse(block: ToolUse): Promise<void> {
    const toolDescription = this.getToolDescription(block)
    try {
      const pattern = block.params.pattern || block.params.regex
      const relPath = block.params.path || '.'
      const ip = block.params.ip
      const include = block.params.include || block.params.file_pattern
      const csRaw = block.params.case_sensitive
      const caseSensitive = csRaw ? csRaw.toLowerCase() === 'true' : false
      const ctx = block.params.context_lines ? Number.parseInt(block.params.context_lines, 10) : 0
      const max = block.params.max_matches ? Number.parseInt(block.params.max_matches, 10) : 500
      if (!pattern) {
        await this.handleMissingParam('pattern', toolDescription, 'grep_search')
        return
      }

      let matchesCount = 0
      let summary = ''
      if (ip && !this.isLocalHost(ip)) {
        const cmd = buildRemoteGrepCommand({ pattern, path: relPath, include, case_sensitive: caseSensitive, context_lines: ctx, max_matches: max })
        const output = await this.executeCommandInRemoteServer(cmd, ip, undefined)
        const matches = parseRemoteGrepOutput(output, relPath)
        matchesCount = matches.length
        summary += `Found ${matchesCount} match(es) for /${pattern}/ in ${relPath}${include ? ` (filter: "${include}")` : ''}.\n---\n`
        const grouped: Record<string, { line: number; text: string }[]> = {}
        for (const m of matches.slice(0, Math.min(matches.length, max))) {
          ;(grouped[m.file] ||= []).push({ line: m.line, text: m.text })
        }
        for (const file of Object.keys(grouped)) {
          summary += `File: ${file}\n`
          grouped[file]
            .sort((a, b) => a.line - b.line)
            .forEach((m) => {
              summary += `L${m.line}: ${m.text.trim()}\n`
            })
          summary += '---\n'
        }
      } else {
        const res = await localGrepSearch(process.cwd(), relPath, pattern, include, max, ctx, caseSensitive)
        matchesCount = res.total
        summary += `Found ${matchesCount} match(es) for /${pattern}/ in ${relPath}${include ? ` (filter: "${include}")` : ''}.\n---\n`
        const grouped: Record<string, { line: number; text: string }[]> = {}
        for (const m of res.matches.slice(0, Math.min(res.matches.length, max))) {
          ;(grouped[m.file] ||= []).push({ line: m.line, text: m.text })
        }
        for (const file of Object.keys(grouped)) {
          summary += `File: ${file}\n`
          grouped[file]
            .sort((a, b) => a.line - b.line)
            .forEach((m) => {
              summary += `L${m.line}: ${m.text.trim()}\n`
            })
          summary += '---\n'
        }
      }

      // Show search results in UI immediately
      await this.say('search_result', summary.trim(), false)
      // Also push to LLM as tool result for context
      this.pushToolResult(toolDescription, summary.trim())
      await this.saveCheckpoint()
    } catch (error) {
      await this.handleToolError(toolDescription, 'grep search', error as Error)
      await this.saveCheckpoint()
    }
  }

  private async handleUseMcpToolUse(block: ToolUse): Promise<void> {
    const toolDescription = this.getToolDescription(block)
    try {
      const serverName: string | undefined = block.params.server_name
      const toolName: string | undefined = block.params.tool_name
      const argumentsStr: string | undefined = block.params.arguments

      if (block.partial) {
        const partialServerName = serverName || ''
        const partialToolName = toolName || ''

        let partialArgumentsObj: Record<string, unknown> = {}
        if (argumentsStr) {
          try {
            partialArgumentsObj = JSON.parse(argumentsStr)
          } catch {
            partialArgumentsObj = {}
          }
        }

        // Check if needs to display (only non-auto-approved tools display)
        const autoApproveResult = this.shouldAutoApproveMcpTool(partialServerName, partialToolName)
        if (!autoApproveResult) {
          await this.ask('mcp_tool_call', '', block.partial, {
            serverName: partialServerName,
            toolName: partialToolName,
            arguments: partialArgumentsObj
          }).catch(() => {})
        }
        return
      }

      if (!serverName) return this.handleMissingParam('server_name', toolDescription, 'use_mcp_tool')
      if (!toolName) return this.handleMissingParam('tool_name', toolDescription, 'use_mcp_tool')
      if (!argumentsStr) return this.handleMissingParam('arguments', toolDescription, 'use_mcp_tool')

      let argumentsObj: Record<string, unknown>
      try {
        argumentsObj = JSON.parse(argumentsStr)
      } catch (parseError) {
        this.consecutiveMistakeCount++
        await this.say('error', this.messages.mcpInvalidArguments || `Invalid MCP tool arguments format: ${parseError}`)
        this.pushToolResult(
          toolDescription,
          formatResponse.toolError(`Invalid JSON format for arguments: ${parseError instanceof Error ? parseError.message : String(parseError)}`)
        )
        await this.saveCheckpoint()
        return
      }

      const mcpServers = this.mcpHub.getAllServers()
      const server = mcpServers.find((s) => s.name === serverName)

      if (!server || server.disabled || server.status !== 'connected') {
        let errorMsg: string
        if (!server) {
          errorMsg = formatMessage(this.messages.mcpServerNotFound || `MCP server "${serverName}" not found`, { server: serverName })
        } else if (server.disabled) {
          errorMsg = formatMessage(this.messages.mcpServerDisabled || `MCP server "${serverName}" is disabled`, { server: serverName })
        } else {
          errorMsg = `MCP server "${serverName}" is not connected (status: ${server.status})`
        }
        await this.say('error', errorMsg)
        this.pushToolResult(toolDescription, formatResponse.toolError(errorMsg))
        await this.saveCheckpoint()
        return
      }

      const tool = server.tools?.find((t) => t.name === toolName)
      if (!tool) {
        const errorMsg = formatMessage(this.messages.mcpToolNotFound || `MCP tool "${toolName}" not found in server "${serverName}"`, {
          tool: toolName
        })
        await this.say('error', errorMsg)
        this.pushToolResult(toolDescription, formatResponse.toolError(errorMsg))
        await this.saveCheckpoint()
        return
      }

      const dbService = await ChatermDatabaseService.getInstance()
      const allToolStates = dbService.getAllMcpToolStates()
      const toolKey = `${serverName}:${toolName}`
      // 如果数据库中有记录，使用记录的值；否则默认为启用
      const isToolEnabled = allToolStates[toolKey] !== undefined ? allToolStates[toolKey] : true

      if (!isToolEnabled) {
        const errorMsg = formatMessage(this.messages.mcpToolDisabled || `MCP tool "${toolName}" in server "${serverName}" is disabled`, {
          tool: toolName
        })
        await this.say('error', errorMsg)
        this.pushToolResult(toolDescription, formatResponse.toolError(errorMsg))
        await this.saveCheckpoint()
        return
      }

      this.consecutiveMistakeCount = 0
      const autoApprove = (server.autoApprove || []).includes(toolName)

      if (!autoApprove) {
        // Requires user approval
        const { response, text, contentParts } = await this.ask('mcp_tool_call', '', false, {
          serverName,
          toolName,
          arguments: argumentsObj
        })
        const approved = response === 'yesButtonClicked'
        if (!approved) {
          this.pushToolResult(toolDescription, formatResponse.toolDenied())
          if (text) {
            this.pushAdditionalToolFeedback(text)
            await this.sayUserFeedback(text, contentParts)
            await this.saveCheckpoint()
          }
          this.didRejectTool = true
          await this.saveCheckpoint()
          return
        } else if (text) {
          this.pushAdditionalToolFeedback(text)
          await this.sayUserFeedback(text, contentParts)
          await this.saveCheckpoint()
        }
      } else {
        // Auto approve - remove possible partial mcp_tool_call message
        this.removeLastPartialMessageIfExistsWithType('ask', 'mcp_tool_call')
      }

      const ulid = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
      const result = await this.mcpHub.callTool(serverName, toolName, argumentsObj, ulid)

      const resultText = this.formatMcpToolCallResponse(result)
      this.pushToolResult(toolDescription, resultText)

      // Send tool execution result to frontend
      await this.say('command_output', resultText, false)

      await this.saveCheckpoint()
    } catch (error) {
      await this.handleToolError(toolDescription, 'calling MCP tool', error as Error)
      await this.saveCheckpoint()
    }
  }

  // TODO：robustness Check
  private async handleAccessMcpResourceUse(block: ToolUse): Promise<void> {
    const toolDescription = this.getToolDescription(block)
    try {
      const serverName: string | undefined = block.params.server_name
      const uri: string | undefined = block.params.uri

      if (!serverName) return this.handleMissingParam('server_name', toolDescription, 'access_mcp_resource')
      if (!uri) return this.handleMissingParam('uri', toolDescription, 'access_mcp_resource')

      const mcpServers = this.mcpHub.getAllServers()
      const server = mcpServers.find((s) => s.name === serverName)

      if (!server || server.disabled || server.status !== 'connected') {
        let errorMsg: string
        if (!server) {
          errorMsg = formatMessage(this.messages.mcpServerNotFound || `MCP server "${serverName}" not found`, { server: serverName })
        } else if (server.disabled) {
          errorMsg = formatMessage(this.messages.mcpServerDisabled || `MCP server "${serverName}" is disabled`, { server: serverName })
        } else {
          errorMsg = `MCP server "${serverName}" is not connected (status: ${server.status})`
        }
        await this.say('error', errorMsg)
        this.pushToolResult(toolDescription, formatResponse.toolError(errorMsg))
        await this.saveCheckpoint()
        return
      }

      const resourceResponse = await this.mcpHub.readResource(serverName, uri)

      // 6. Handle return result
      const resultText = this.formatMcpResourceResponse(resourceResponse)
      this.pushToolResult(toolDescription, resultText)

      // Send resource access result to frontend
      await this.say('command_output', resultText, false)

      await this.saveCheckpoint()
    } catch (error) {
      await this.handleToolError(toolDescription, 'accessing MCP resource', error as Error)
      await this.saveCheckpoint()
    }
  }

  /**
   * Handle use_skill tool - activates an on-demand skill and returns its full instructions
   */
  private async handleUseSkillToolUse(block: ToolUse): Promise<void> {
    const toolDescription = this.getToolDescription(block)
    try {
      const skillName: string | undefined = block.params.name

      if (!skillName) {
        return this.handleMissingParam('name', toolDescription, 'use_skill')
      }

      if (!this.skillsManager) {
        const errorMsg = 'Skills manager is not available'
        await this.say('error', errorMsg)
        this.pushToolResult(toolDescription, formatResponse.toolError(errorMsg))
        await this.saveCheckpoint()
        return
      }

      const skill = this.skillsManager.getSkill(skillName)

      if (!skill) {
        const errorMsg = `Skill "${skillName}" not found. Please check the available skills list.`
        await this.say('error', errorMsg)
        this.pushToolResult(toolDescription, formatResponse.toolError(errorMsg))
        await this.saveCheckpoint()
        return
      }

      if (!skill.enabled) {
        const errorMsg = `Skill "${skillName}" is disabled. Please enable it in settings first.`
        await this.say('error', errorMsg)
        this.pushToolResult(toolDescription, formatResponse.toolError(errorMsg))
        await this.saveCheckpoint()
        return
      }

      // Build skill instructions response
      let resultText = `# Skill Activated: ${skill.metadata.name}\n\n`
      resultText += `**Description:** ${skill.metadata.description}\n\n`
      resultText += `## Instructions\n\n`
      resultText += skill.content
      resultText += '\n\n'

      // Include resource files content if available
      if (skill.resources && skill.resources.length > 0) {
        const resourcesWithContent = skill.resources.filter((r) => r.content)
        if (resourcesWithContent.length > 0) {
          resultText += `## Available Resources\n\n`
          resultText += `The following resource files are available for this skill:\n\n`

          for (const resource of resourcesWithContent) {
            resultText += `### ${resource.name} (${resource.type})\n\n`
            resultText += '```\n'
            resultText += resource.content
            resultText += '\n```\n\n'
          }
        }
      }

      this.pushToolResult(toolDescription, resultText)

      // Optionally show activation message in UI
      await this.say('text', `Activated Skill: ${skill.metadata.name}`, false)

      await this.saveCheckpoint()
    } catch (error) {
      await this.handleToolError(toolDescription, 'activating skill', error as Error)
      await this.saveCheckpoint()
    }
  }

  /**
   * Check if MCP tool should be auto-approved
   */
  private shouldAutoApproveMcpTool(serverName: string, toolName: string): boolean {
    const mcpServers = this.mcpHub.getActiveServers()
    const server = mcpServers.find((s) => s.name === serverName)
    if (!server || server.disabled || server.status !== 'connected') {
      return false
    }
    return (server.autoApprove || []).includes(toolName)
  }

  /**
   * Format MCP tool call response
   */
  private formatMcpToolCallResponse(response: import('@shared/mcp').McpToolCallResponse): string {
    if (response.isError) {
      return `Error: ${JSON.stringify(response.content)}`
    }

    const parts: string[] = []
    for (const item of response.content) {
      if (item.type === 'text') {
        parts.push(item.text)
      } else if (item.type === 'image') {
        parts.push(`[Image: ${item.mimeType}]`)
      } else if (item.type === 'audio') {
        parts.push(`[Audio: ${item.mimeType}]`)
      } else if (item.type === 'resource') {
        parts.push(`[Resource: ${item.resource.uri}]\n${item.resource.text || ''}`)
      }
    }

    return parts.join('\n\n') || '(No output)'
  }

  /**
   * Format MCP resource response
   */
  private formatMcpResourceResponse(response: import('@shared/mcp').McpResourceResponse): string {
    const parts: string[] = []
    for (const content of response.contents) {
      if (content.text) {
        parts.push(content.text)
      } else if (content.blob) {
        parts.push(`[Binary data: ${content.mimeType || 'unknown'}]`)
      }
    }

    return parts.join('\n\n') || '(No content)'
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
      const { response, text, contentParts } = await this.ask('completion_result', '', false)

      if (response === 'yesButtonClicked') {
        return
      }

      if (text) {
        await this.sayUserFeedback(text, contentParts)
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
    let systemPrompt: string

    // Check if connected host is a network switch - use switch-specific prompt with language support
    const switchPrompt = this.hosts && this.hosts.length > 0 ? getSwitchPromptByAssetType(this.hosts[0].assetType, userLanguage) : null
    if (switchPrompt) {
      // Use switch-specific prompt (switch only supports Command mode)
      systemPrompt = switchPrompt
    } else if (userLanguage === 'zh-CN') {
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

    // In chat mode, skip system information collection (no server operations)
    if (chatSettings?.mode === 'chat') {
      systemInformation +=
        'Chat mode: No server connection or system information available. This mode is for conversation, learning, and brainstorming only.\n'
    } else if (!this.hosts || this.hosts.length === 0) {
      logger.warn('No hosts configured, skipping system information collection')
      systemInformation += this.messages.noHostsConfigured + '\n'
    } else {
      logger.info(`Collecting system information for ${this.hosts.length} host(s)`)

      for (const host of this.hosts) {
        try {
          if (host.assetType?.startsWith('person-switch-')) {
            continue
          }
          // Check cache, if no cache, get system info and cache it
          let hostInfo = this.hostSystemInfoCache.get(host.host)
          if (!hostInfo) {
            logger.info(`Fetching system information for host: ${host.host}`)

            let systemInfoOutput: string

            // If it's local host, directly get system information
            if (this.isLocalHost(host.host)) {
              const localSystemInfo = await this.localTerminalManager.getSystemInfo()
              systemInfoOutput = `OS_VERSION:${localSystemInfo.osVersion}
DEFAULT_SHELL:${localSystemInfo.defaultShell}
HOME_DIR:${localSystemInfo.homeDir}
HOSTNAME:${localSystemInfo.hostName}
USERNAME:${localSystemInfo.userName}`
            } else {
              // Optimization: Get all system information at once to avoid multiple network requests
              // Simplified script to avoid complex quoting issues in JumpServer environment
              const systemInfoScript = `uname -a | sed 's/^/OS_VERSION:/' && echo "DEFAULT_SHELL:$SHELL" && echo "HOME_DIR:$HOME" && hostname | sed 's/^/HOSTNAME:/' && whoami | sed 's/^/USERNAME:/'`
              systemInfoOutput = await this.executeCommandInRemoteServer(systemInfoScript, host.host)
            }

            logger.info(`System info output for ${host.host}`, { value: systemInfoOutput })

            if (!systemInfoOutput || systemInfoOutput.trim() === '') {
              throw new Error('Failed to get system information: connection failed or no output received')
            }

            // Parse output result
            const parseSystemInfo = (
              output: string
            ): {
              osVersion: string
              defaultShell: string
              homeDir: string
              hostName: string
              userName: string
            } => {
              const lines = output.split('\n').filter((line) => line.trim())
              const info = {
                osVersion: '',
                defaultShell: '',
                homeDir: '',
                hostName: '',
                userName: ''
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
                }
              })

              return info
            }

            hostInfo = parseSystemInfo(systemInfoOutput)
            logger.info(`Parsed system info for ${host.host}`, { value: hostInfo })

            // Cache system information
            this.hostSystemInfoCache.set(host.host, hostInfo)
          } else {
            logger.info(`Using cached system information for host: ${host.host}`)
          }

          systemInformation += `
            ## Host: ${host.host}
            ${this.messages.osVersion}: ${hostInfo.osVersion}
            ${this.messages.defaultShell}: ${hostInfo.defaultShell}
            ${this.messages.homeDirectory}: ${hostInfo.homeDir.toPosix()}
            ${this.messages.hostname}: ${hostInfo.hostName}
            ${this.messages.user}: ${hostInfo.userName}
            ====
          `
        } catch (error) {
          logger.error(`Failed to get system information for host ${host.host}`, { error: error instanceof Error ? error.message : String(error) })
          const chatSettings = await getGlobalState('chatSettings')
          const isLocalConnection = host.connection?.toLowerCase?.() === 'localhost' || this.isLocalHost(host.host) || host.uuid === 'localhost'

          if (chatSettings?.mode === 'agent' && isLocalConnection) {
            const errorMessage = 'Error: Cannot connect to local target machine in Agent mode, please create a new task and select Command mode.'
            await this.ask('ssh_con_failed', errorMessage, false)
            await this.abortTask()
          }
          // Even if getting system information fails, add basic information
          systemInformation += `
            ## Host: ${host.host}
            ${this.messages.osVersion}: ${this.messages.unableToRetrieve} (${error instanceof Error ? error.message : this.messages.unknown})
            ${this.messages.defaultShell}: ${this.messages.unableToRetrieve}
            ${this.messages.homeDirectory}: ${this.messages.unableToRetrieve}
            ${this.messages.hostname}: ${this.messages.unableToRetrieve}
            ${this.messages.user}: ${this.messages.unableToRetrieve}
            ====
          `
        }
      }
    }

    logger.info('Final system information section', { value: systemInformation })
    systemPrompt += systemInformation

    // Build MCP Tools and Resources section
    const mcpSection = await this.buildMcpToolsSection(userLanguage)
    if (mcpSection) {
      systemPrompt += '\n\n' + mcpSection
    }

    // Build Skills section
    const skillsSection = this.buildSkillsSection()
    if (skillsSection) {
      systemPrompt += '\n\n' + skillsSection
    }

    const settingsCustomInstructions = this.customInstructions?.trim()

    const preferredLanguageInstructions = `# ${this.messages.languageSettingsTitle}:\n\n${formatMessage(this.messages.defaultLanguage, { language: userLanguage })}\n\n${this.messages.languageRules}`
    if (settingsCustomInstructions || preferredLanguageInstructions) {
      const userInstructions = addUserInstructions(userLanguage, settingsCustomInstructions, preferredLanguageInstructions)
      systemPrompt += userInstructions
    }

    return systemPrompt
  }

  /**
   * Build MCP tools and resources system prompt section
   */
  private async buildMcpToolsSection(userLanguage: string): Promise<string | null> {
    try {
      const mcpServers = this.mcpHub.getActiveServers()

      const enabledServers = mcpServers.filter((server) => !server.disabled && server.status === 'connected')

      if (enabledServers.length === 0) {
        return null
      }

      const dbService = await ChatermDatabaseService.getInstance()
      const allToolStates = dbService.getAllMcpToolStates() // Record<string, boolean>
      // Key 格式: "serverName:toolName", Value: true/false

      const isToolEnabled = (serverName: string, toolName: string): boolean => {
        const key = `${serverName}:${toolName}`
        // 如果数据库中有记录，使用记录的值；否则默认为启用
        return allToolStates[key] !== undefined ? allToolStates[key] : true
      }

      const formatToolParameters = (tool: McpTool): string => {
        if (!tool.inputSchema || !tool.inputSchema.properties) {
          return 'No parameters required'
        }

        const params: string[] = []
        const requiredParams = tool.inputSchema.required || []

        for (const [paramName, paramSchema] of Object.entries(tool.inputSchema.properties)) {
          const isRequired = requiredParams.includes(paramName)
          const paramType = paramSchema.type || 'unknown'
          const paramDesc = paramSchema.description || ''
          const requiredMark = isRequired ? 'required' : 'optional'
          params.push(`       - ${paramName} (${paramType}, ${requiredMark}): ${paramDesc}`.trim())
        }

        return params.length > 0 ? params.join('\n') : 'No parameters required'
      }

      const serverDescriptions: string[] = []
      const isChinese = userLanguage === 'zh-CN'

      for (const server of enabledServers) {
        const enabledTools = (server.tools || []).filter((tool) => isToolEnabled(server.name, tool.name))
        const resources = server.resources || []
        const resourceTemplates = server.resourceTemplates || []

        if (enabledTools.length === 0 && resources.length === 0 && resourceTemplates.length === 0) {
          continue
        }

        let serverDesc = `### Server: ${server.name}\n`

        // Add tools list
        if (enabledTools.length > 0) {
          const toolsLabel = isChinese ? '工具' : 'Tools'
          serverDesc += `- **${toolsLabel}** (${enabledTools.length} available):\n`
          enabledTools.forEach((tool, index) => {
            serverDesc += `  ${index + 1}. ${tool.name}\n`
            if (tool.description) {
              serverDesc += `     ${isChinese ? '描述' : 'Description'}: ${tool.description}\n`
            }
            const paramsDesc = formatToolParameters(tool)
            if (paramsDesc !== 'No parameters required') {
              serverDesc += `     ${isChinese ? '参数' : 'Parameters'}:\n${paramsDesc}\n`
            }
          })
        }

        // Add resources list
        if (resources.length > 0 || resourceTemplates.length > 0) {
          const resourcesLabel = isChinese ? '资源' : 'Resources'
          serverDesc += `- **${resourcesLabel}** (${resources.length + resourceTemplates.length} available):\n`
          resources.forEach((resource) => {
            const resourceDesc = resource.description ? ` - ${resource.description}` : ''
            serverDesc += `  - ${resource.uri}${resourceDesc}\n`
          })
          resourceTemplates.forEach((template) => {
            const templateDesc = template.description ? ` - ${template.description}` : ''
            serverDesc += `  - ${template.uriTemplate}${templateDesc}\n`
          })
        }

        serverDescriptions.push(serverDesc)
      }

      if (serverDescriptions.length === 0) {
        return null
      }

      const sectionTitle = isChinese ? '# MCP 工具和资源' : '# MCP Tools and Resources'
      const sectionHeader = isChinese
        ? '## 可用 MCP 服务器\n\n您可以使用以下 MCP 服务器及其工具：'
        : '## Available MCP Servers\n\nYou have access to the following MCP servers and their tools:'

      return `${sectionTitle}\n\n${sectionHeader}\n\n${serverDescriptions.join('\n')}`
    } catch (error) {
      logger.error('Failed to build MCP tools section', { error: error instanceof Error ? error.message : String(error) })
      return null
    }
  }

  /**
   * Build skills section for system prompt
   */
  private buildSkillsSection(): string | null {
    logger.info('[Skills] buildSkillsSection called, skillsManager exists', { value: !!this.skillsManager })

    if (!this.skillsManager) {
      logger.info('[Skills] No skillsManager available')
      return null
    }

    try {
      const skillsPrompt = this.skillsManager.buildSkillsPrompt()
      logger.info('[Skills] Skills prompt length', { value: skillsPrompt?.length || 0 })

      if (skillsPrompt && skillsPrompt.trim()) {
        return skillsPrompt
      }
      return null
    } catch (error) {
      logger.error('Failed to build skills section', { error: error instanceof Error ? error.message : String(error) })
      return null
    }
  }

  // Todo tool handling methods
  private async handleTodoWriteToolUse(block: ToolUse): Promise<void> {
    try {
      const todosParam = (block as { params?: { todos?: unknown } }).params?.todos

      if (todosParam === undefined || todosParam === null) {
        this.pushToolResult(this.getToolDescription(block), 'Todo write failed: missing todos parameter', { dontLock: true })
        return
      }

      let todos: Todo[]
      // Support both string (JSON text) and structured array/object forms
      if (typeof todosParam === 'string') {
        try {
          todos = JSON.parse(todosParam) as Todo[]
        } catch (parseError) {
          this.pushToolResult(this.getToolDescription(block), `Todo write failed: JSON parse error - ${parseError}`, { dontLock: true })
          return
        }
      } else if (Array.isArray(todosParam)) {
        todos = todosParam as Todo[]
      } else if (typeof todosParam === 'object') {
        // Some models/parsers may directly pass objects (e.g., { todos: [...] }), handle compatibility here
        // If the object itself looks like a wrapper for todos array, try to extract
        if (Array.isArray((todosParam as { todos?: unknown[] }).todos)) {
          todos = (todosParam as { todos: Todo[] }).todos
        } else {
          // Could also be a single todo object directly, wrap uniformly as array
          todos = [todosParam as Todo]
        }
      } else {
        logger.error(`[Task] Unsupported todos parameter type: ${typeof todosParam}`)
        this.pushToolResult(this.getToolDescription(block), 'Todo write failed: todos parameter type not supported', { dontLock: true })
        return
      }

      const params: TodoWriteParams = { todos }
      const result = await TodoWriteTool.execute(params, this.taskId)

      // Allow todo_write to be combined with another tool in the same message
      this.pushToolResult(this.getToolDescription(block), result, { dontLock: true })

      // Send todo update event to renderer process
      await this.postMessageToWebview({
        type: 'todoUpdated',
        todos: todos,
        sessionId: this.taskId,
        taskId: this.taskId,
        changeType: 'updated',
        triggerReason: 'agent_update'
      })
    } catch (error) {
      logger.error(`[Task] todo_write tool call handling failed`, { error: error instanceof Error ? error.message : String(error) })
      this.pushToolResult(this.getToolDescription(block), `Todo write failed: ${error instanceof Error ? error.message : String(error)}`, {
        dontLock: true
      })
    }
  }

  private async handleTodoReadToolUse(block: ToolUse): Promise<void> {
    try {
      const params: TodoReadParams = {} // TodoRead doesn't need parameters
      const result = await TodoReadTool.execute(params, this.taskId)
      // Allow todo_read to be combined with another tool in the same message
      this.pushToolResult(this.getToolDescription(block), result, { dontLock: true })
    } catch (error) {
      this.pushToolResult(this.getToolDescription(block), `Todo 读取失败: ${error instanceof Error ? error.message : String(error)}`, {
        dontLock: true
      })
    }
  }

  /**
   * Handle summarize_to_knowledge tool: sends knowledge summary to frontend for file creation.
   * The frontend is responsible for creating the file and opening the editor tab.
   */
  private async handleSummarizeToKnowledgeToolUse(block: ToolUse): Promise<void> {
    const toolDescription = this.getToolDescription(block)
    const fileName = block.params.file_name
    const summary = block.params.summary

    try {
      // Handle partial streaming (parameters may be incomplete)
      if (block.partial) {
        await this.say(
          'knowledge_summary',
          JSON.stringify({
            fileName: fileName || '',
            summary: summary || ''
          }),
          true
        )
        return
      }

      // Only validate required parameters when streaming is complete
      if (!fileName) {
        await this.handleMissingParam('file_name', toolDescription, 'summarize_to_knowledge')
        return
      }

      if (!summary) {
        await this.handleMissingParam('summary', toolDescription, 'summarize_to_knowledge')
        return
      }

      // Send final message with complete parameters
      await this.say(
        'knowledge_summary',
        JSON.stringify({
          fileName,
          summary
        }),
        false
      )

      this.pushToolResult(toolDescription, `Knowledge summary has been sent to knowledge base. File: ${fileName}.md`)

      await this.saveCheckpoint()
    } catch (error) {
      logger.error('[Task] summarize_to_knowledge failed', { error: error instanceof Error ? error.message : String(error) })
      this.pushToolResult(toolDescription, `Failed to save knowledge: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  async clearTodos(trigger: 'user_cancelled' | 'new_user_input'): Promise<void> {
    try {
      const { TodoStorage } = await import('../storage/todo/TodoStorage')
      const storage = new TodoStorage(this.taskId)
      const existingTodos = await storage.readTodos()

      if (existingTodos.length === 0) {
        TodoContextTracker.forSession(this.taskId).clearActiveTodo()
        return
      }

      await storage.deleteTodos()
      TodoContextTracker.forSession(this.taskId).clearActiveTodo()

      await this.postMessageToWebview({
        type: 'todoUpdated',
        todos: [],
        sessionId: this.taskId,
        taskId: this.taskId,
        changeType: 'updated',
        triggerReason: 'user_request'
      })

      logger.info(`[Task] Cleared todos due to ${trigger} for task ${this.taskId}`)
    } catch (error) {
      logger.error(`[Task] Failed to clear todos (${trigger}) for task ${this.taskId}`, {
        error: error instanceof Error ? error.message : String(error)
      })
    }
  }

  // 检查用户内容是否需要创建 todo（用于后续对话）
  private async checkUserContentForTodo(userContent: UserContent): Promise<void> {
    try {
      // 提取用户消息文本
      const userMessage = userContent
        .filter((content) => content.type === 'text')
        .map((content) => (content as { text: string }).text)
        .join(' ')
        .trim()

      if (userMessage && !userMessage.includes('<system-reminder>') && !userMessage.includes('<feedback>')) {
        logger.info(`[Smart Todo] Checking user content for todo creation: "${userMessage}"`)
        await this.checkAndCreateTodoIfNeeded(userMessage)
      }
    } catch (error) {
      logger.error('[Smart Todo] Failed to check user content for todo', { error: error instanceof Error ? error.message : String(error) })
    }
  }

  // 智能检测相关方法 - 使用优化后的检测逻辑
  private async checkAndCreateTodoIfNeeded(userMessage: string): Promise<void> {
    try {
      logger.info(`[Smart Todo] Analyzing message: "${userMessage}"`)

      const shouldCreate = SmartTaskDetector.shouldCreateTodo(userMessage)
      logger.info(`[Smart Todo] Should create todo: ${shouldCreate}`)

      if (shouldCreate) {
        // 获取用户语言设置
        let isChineseMode = false
        try {
          const userConfig = await getUserConfig()
          isChineseMode = userConfig?.language === 'zh-CN'
        } catch (error) {
          logger.info(`[Smart Todo] 获取用户语言设置失败，使用默认语言`)
        }

        // 发送简化的核心系统消息给 Agent
        const coreMessage = TODO_SYSTEM_MESSAGES.complexTaskSystemMessage('', isChineseMode, userMessage)

        // 将提醒添加到用户消息内容中，而不是作为单独的消息
        this.userMessageContent.push({
          type: 'text',
          text: coreMessage
        })
      } else {
        logger.info(`[Smart Todo] Task not complex enough for todo creation`)
      }
    } catch (error) {
      logger.error('[Smart Todo] Failed to check and create todo if needed', { error: error instanceof Error ? error.message : String(error) })
      // 不影响主要功能，只记录错误
    }
  }

  // 添加 todo 状态更新提醒
  private async addTodoStatusUpdateReminder(_commandResult: string): Promise<void> {
    try {
      const { TodoStorage } = await import('../storage/todo/TodoStorage')
      const storage = new TodoStorage(this.taskId)
      const todos = await storage.readTodos()

      if (todos.length === 0) {
        return
      }

      // 检查是否有活跃的 todo 任务
      const activeTodos = todos.filter((todo) => todo.status === 'in_progress')
      const pendingTodos = todos.filter((todo) => todo.status === 'pending')

      let reminderMessage = ''

      if (activeTodos.length > 0) {
        // 有进行中的任务，提醒完成
        const activeTodo = activeTodos[0]
        reminderMessage = `\n\n<todo-status-reminder>\n⚠️ 重要提醒：命令执行完成。如果任务 "${activeTodo.content}" 已完成，你必须立即使用 todo_write 工具将其状态更新为 "completed"。这是强制性的任务跟踪要求。\n\n如果任务尚未完成，请继续执行相关命令，完成后再更新状态。\n</todo-status-reminder>`
      } else if (pendingTodos.length > 0) {
        // 有待处理的任务，提醒开始
        const nextTodo = pendingTodos[0]
        reminderMessage = `\n\n<todo-status-reminder>\n⚠️ 重要提醒：准备开始任务 "${nextTodo.content}"。在执行任何相关命令之前，你必须先使用 todo_write 工具将其状态更新为 "in_progress"。这是强制性的任务跟踪要求。\n</todo-status-reminder>`
      }

      if (reminderMessage) {
        // 将提醒添加到用户消息内容中
        this.userMessageContent.push({
          type: 'text',
          text: reminderMessage
        })
      }
    } catch (error) {
      logger.error('[Task] 添加 todo 状态更新提醒失败', { error: error instanceof Error ? error.message : String(error) })
    }
  }
}
