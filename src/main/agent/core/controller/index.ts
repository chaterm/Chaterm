import { Anthropic } from '@anthropic-ai/sdk'

import pWaitFor from 'p-wait-for'
import { buildApiHandler, ApiHandler } from '@api/index'
import { McpHub } from '@services/mcp/McpHub'
import { version as extensionVersion } from '../../../../../package.json'
import { TelemetrySetting } from '@shared/TelemetrySetting'
import { telemetryService } from '@services/telemetry/TelemetryService'
import { ExtensionMessage, Platform } from '@shared/ExtensionMessage'
import { HistoryItem } from '@shared/HistoryItem'
import { WebviewMessage } from '@shared/WebviewMessage'
import type { Host } from '@shared/WebviewMessage'
import { validateWebviewMessageContract } from '@shared/WebviewMessage'
import {
  ensureTaskExists,
  getSavedApiConversationHistory,
  deleteChatermHistoryByTaskId,
  getTaskMetadata,
  saveTaskMetadata,
  ensureMcpServersDirectoryExists
} from '../storage/disk'
import { getAllExtensionState, getGlobalState, updateApiConfiguration, updateGlobalState, getUserConfig, getModelOptions } from '../storage/state'
import { Task } from '../task'
import { ApiConfiguration, ApiProvider, PROVIDER_MODEL_KEY_MAP } from '@shared/api'
import { TITLE_GENERATION_PROMPT, TITLE_GENERATION_PROMPT_CN } from '../prompts/system'
import { DEFAULT_LANGUAGE_SETTINGS } from '@shared/Languages'

export class Controller {
  private postMessage: (message: ExtensionMessage) => Promise<boolean> | undefined

  private tasks: Map<string, Task> = new Map()
  mcpHub: McpHub

  constructor(postMessage: (message: ExtensionMessage) => Promise<boolean> | undefined, getMcpSettingsFilePath: () => Promise<string>) {
    console.log('Controller instantiated')
    this.postMessage = postMessage

    this.mcpHub = new McpHub(
      () => ensureMcpServersDirectoryExists(),
      getMcpSettingsFilePath,
      extensionVersion,
      (msg) => this.postMessageToWebview(msg)
    )
  }

  private getTaskFromId(tabId?: string): Task | undefined {
    if (!tabId) {
      return undefined
    }
    const task = this.tasks.get(tabId)
    return task
  }

  getAllTasks(): Task[] {
    return Array.from(this.tasks.values())
  }

  /**
   * Reload security config for all active tasks
   * Used for hot reloading security configuration
   */
  async reloadSecurityConfigForAllTasks(): Promise<void> {
    const tasks = this.getAllTasks()
    const promises = tasks.map(async (task) => {
      try {
        await task.reloadSecurityConfig()
      } catch (error) {
        console.warn(`[SecurityConfig] Failed to hot reload configuration in Task ${task.taskId}:`, error)
      }
    })
    await Promise.allSettled(promises)
  }

  async dispose() {
    // Release terminal resources for all tasks
    for (const task of this.tasks.values()) {
      const terminalManager = task.getTerminalManager()
      if (terminalManager) {
        terminalManager.disposeAll()
      }
    }

    await this.clearTask()
    this.mcpHub.dispose()
  }

  async setUserInfo(info?: { displayName: string | null; email: string | null; photoURL: string | null }) {
    await updateGlobalState('userInfo', info)
  }

  async initTask(hosts: Host[], task?: string, historyItem?: HistoryItem, cwd?: Map<string, string>, taskId?: string) {
    console.log('initTask', task, historyItem, 'taskId:', taskId)
    const resolvedTaskId = taskId ?? historyItem?.id
    if (resolvedTaskId) {
      await this.clearTask(resolvedTaskId)
    }
    const { apiConfiguration, userRules, autoApprovalSettings } = await getAllExtensionState()
    const customInstructions = this.formatUserRulesToInstructions(userRules)

    // Create task immediately without waiting for title generation
    let newTask: Task
    const postState = () => this.postStateToWebview(newTask?.taskId ?? resolvedTaskId)
    const postMessage = (message: ExtensionMessage) => this.postMessageToWebview(message, newTask?.taskId ?? resolvedTaskId)

    newTask = new Task(
      (historyItem) => this.updateTaskHistory(historyItem),
      postState,
      postMessage,
      (taskId) => this.reinitExistingTaskFromId(taskId),
      apiConfiguration,
      autoApprovalSettings,
      hosts,
      this.mcpHub,
      customInstructions,
      task,
      historyItem,
      cwd,
      undefined, // Don't pass generated title initially
      taskId
    )

    this.tasks.set(newTask.taskId, newTask)

    // Generate chat title asynchronously for new tasks (non-blocking)
    if (task && taskId && !historyItem) {
      // Start title generation in background without awaiting
      this.generateChatTitle(task, taskId).catch((error) => {
        console.error('Failed to generate chat title:', error)
        // Title generation failure doesn't affect task execution
      })
    }
  }

  async reinitExistingTaskFromId(taskId: string) {
    const history = await this.getTaskWithId(taskId)
    if (history) {
      const existingTask = this.getTaskFromId(taskId)
      const hosts = existingTask?.hosts || []
      await this.initTask(hosts, undefined, history.historyItem, existingTask?.cwd, taskId)
    }
  }

  // Send any JSON serializable data to the react app
  async postMessageToWebview(message: ExtensionMessage, taskId?: string) {
    // Send a message to the webview here
    const payload = taskId
      ? {
          ...message,
          tabId: (message as ExtensionMessage & { tabId?: string }).tabId ?? taskId,
          taskId: (message as ExtensionMessage & { taskId?: string }).taskId ?? taskId
        }
      : message
    const safeMessage = removeSensitiveKeys(payload)
    await this.postMessage(safeMessage)
  }

  /**
   * Sets up an event listener to listen for messages passed from the webview context and
   * executes code based on the message that is received.
   *
   * @param webview A reference to the extension webview
   */
  async handleWebviewMessage(message: WebviewMessage) {
    if (process.env.NODE_ENV === 'test' || process.env.CHATERM_E2E === '1') {
      const check = validateWebviewMessageContract(message)
      if (!check.ok) {
        console.warn('[IPC Contract] Invalid WebviewMessage:', check.error)
      }
    }

    const targetTaskId = message.tabId ?? message.taskId
    const targetTask = targetTaskId ? this.getTaskFromId(targetTaskId) : undefined

    switch (message.type) {
      case 'newTask':
        await this.initTask(message.hosts!, message.text, undefined, message.cwd, message.taskId)
        if (message.taskId && message.hosts) {
          await updateTaskHosts(message.taskId, message.hosts)
        }
        break
      case 'condense':
        targetTask?.handleWebviewAskResponse('yesButtonClicked')
        break
      case 'apiConfiguration':
        if (message.apiConfiguration) {
          await updateApiConfiguration(message.apiConfiguration)
          // Update API configuration for all tasks
          for (const task of this.tasks.values()) {
            task.api = buildApiHandler(message.apiConfiguration)
          }
        }
        await this.postStateToWebview(targetTaskId)
        break

      case 'askResponse':
        console.log('askResponse', message)
        if (targetTask) {
          if (message.askResponse === 'messageResponse') {
            await targetTask.clearTodos('new_user_input')
          }
          await targetTask.handleWebviewAskResponse(message.askResponse!, message.text, message.cwd)
        }
        break
      case 'showTaskWithId':
        this.showTaskWithId(message.text!, message.hosts || [], message.cwd)
        break
      case 'deleteTaskWithId':
        this.deleteTaskWithId(message.text!)
        break
      case 'taskFeedback':
        if (message.feedbackType && targetTaskId) {
          telemetryService.captureTaskFeedback(targetTaskId, message.feedbackType)
        }
        break
      case 'interactiveCommandInput':
        if (message.input !== undefined && targetTask) {
          targetTask.handleInteractiveCommandInput(message.input)
        }
        break
      case 'commandGeneration':
        if (message.instruction) {
          await this.handleCommandGeneration(message.instruction, message.context, message.tabId, message.modelName)
        }
        break
      case 'telemetrySetting': {
        if (message.telemetrySetting) {
          await this.updateTelemetrySetting(message.telemetrySetting)
        }
        await this.postStateToWebview(targetTaskId)
        break
      }
    }
  }

  async updateTelemetrySetting(telemetrySetting: TelemetrySetting) {
    try {
      await updateGlobalState('telemetrySetting', telemetrySetting)
    } catch (error) {}
    const isOptedIn = telemetrySetting === 'enabled'
    telemetryService.updateTelemetryState(isOptedIn)
  }

  async cancelTask(tabId?: string) {
    const currentTask = this.getTaskFromId(tabId)
    if (!currentTask) {
      return
    }
    const { historyItem } = await this.getTaskWithId(currentTask.taskId)
    try {
      await currentTask.abortTask()
    } catch (error) {
      console.error('Failed to abort task', error)
    }
    await pWaitFor(() => currentTask.isStreaming === false || currentTask.didFinishAbortingStream || currentTask.isWaitingForFirstChunk, {
      timeout: 3_000
    }).catch(() => {
      console.error('Failed to abort task')
    })

    try {
      await currentTask.clearTodos('user_cancelled')
    } catch (error) {
      console.error('Failed to clear todos during cancelTask', error)
    }

    currentTask.abandoned = true
    await this.initTask(currentTask.hosts, undefined, historyItem, currentTask.cwd, currentTask.taskId)
  }

  async gracefulCancelTask(tabId?: string) {
    const currentTask = this.getTaskFromId(tabId)
    if (!currentTask) {
      return
    }

    try {
      await currentTask.gracefulAbortTask()
    } catch (error) {
      console.error('Failed to gracefully abort task', error)
    }
    try {
      await currentTask.clearTodos('user_cancelled')
    } catch (error) {
      console.error('Failed to clear todos during gracefulCancelTask', error)
    }
  }

  async getTaskWithId(id: string): Promise<{
    historyItem: HistoryItem
    taskId: string
    apiConversationHistory: Anthropic.MessageParam[]
  }> {
    const history = ((await getGlobalState('taskHistory')) as HistoryItem[] | undefined) || []
    const historyItem = history.find((item) => item.id === id)
    if (historyItem) {
      const taskId = await ensureTaskExists(id)
      if (taskId) {
        const apiConversationHistory = await getSavedApiConversationHistory(taskId)

        return {
          historyItem,
          taskId,
          apiConversationHistory
        }
      }
    }
    // if we tried to get a task that doesn't exist, remove it from state
    // FIXME: this seems to happen sometimes when the json file doesn't save to disk for some reason
    await this.deleteTaskFromState(id)
    throw new Error('Task not found')
  }

  async showTaskWithId(id: string, hosts: Host[], cwd?: Map<string, string>) {
    const existingTask = this.tasks.get(id)
    if (existingTask) {
      // Task already exists, no need to reinitialize
      return
    }

    const { historyItem } = await this.getTaskWithId(id)
    await this.initTask(hosts, undefined, historyItem, cwd, id)
  }

  async deleteTaskWithId(id: string) {
    console.info('deleteTaskWithId: ', id)
    await deleteChatermHistoryByTaskId(id)
    await this.clearTask(id)
  }

  async deleteTaskFromState(id: string) {
    // Remove the task from history
    const taskHistory = ((await getGlobalState('taskHistory')) as HistoryItem[] | undefined) || []
    const updatedTaskHistory = taskHistory.filter((task) => task.id !== id)
    await updateGlobalState('taskHistory', updatedTaskHistory)

    // Notify the webview that the task has been deleted
    await this.postStateToWebview()

    return updatedTaskHistory
  }

  async postStateToWebview(taskId?: string) {
    const { apiConfiguration, customInstructions, autoApprovalSettings, chatSettings, userInfo, mcpMarketplaceEnabled } = await getAllExtensionState()

    const activeTask = this.getTaskFromId(taskId)

    const state = {
      version: extensionVersion,
      apiConfiguration,
      customInstructions,
      checkpointTrackerErrorMessage: activeTask?.checkpointTrackerErrorMessage,
      chatermMessages: activeTask?.chatermMessages || [],
      shouldShowAnnouncement: false,
      platform: process.platform as Platform,
      autoApprovalSettings,
      chatSettings,
      userInfo,
      mcpMarketplaceEnabled,
      shellIntegrationTimeout: 30,
      isNewUser: true
    }

    this.postMessageToWebview({ type: 'state', state }, taskId)
  }

  async clearTask(tabId?: string) {
    const disposeTask = async (task: Task) => {
      try {
        await task.abortTask()
      } catch (error) {
        console.error('Failed to abort task during clearTask', error)
      }

      const terminalManager = task.getTerminalManager()
      if (terminalManager) {
        terminalManager.disposeAll()
      }
    }

    if (tabId) {
      const task = this.tasks.get(tabId)
      if (task) {
        await disposeTask(task)
        this.tasks.delete(tabId)
      }
      return
    }

    for (const task of this.tasks.values()) {
      await disposeTask(task)
    }
    this.tasks.clear()
  }
  async updateTaskHistory(item: Partial<HistoryItem> & { id: string }): Promise<HistoryItem[]> {
    const history = ((await getGlobalState('taskHistory')) as HistoryItem[]) || []
    const idx = history.findIndex((h) => h.id === item.id)
    if (idx !== -1) {
      const existing = history[idx]
      history[idx] = {
        ...existing,
        ...item,
        task: existing.task || item.task || '',
        // Use new chatTitle if provided and not empty, otherwise keep existing
        chatTitle: item.chatTitle && item.chatTitle.trim() ? item.chatTitle : existing.chatTitle
      }
    } else {
      // For new items, ensure required fields are present
      if (!item.ts || !item.task || item.tokensIn === undefined || item.tokensOut === undefined || item.totalCost === undefined) {
        throw new Error('New history item must include all required fields: ts, task, tokensIn, tokensOut, totalCost')
      }
      history.push(item as HistoryItem)
    }
    await updateGlobalState('taskHistory', history)
    // Notify renderer process that taskHistory has been updated
    await this.postMessageToWebview({
      type: 'taskHistoryUpdated',
      taskId: item.id
    })
    return history
  }

  async validateApiKey(configuration: ApiConfiguration): Promise<{ isValid: boolean; error?: string }> {
    // For LiteLLM, use createSync for synchronous initialization
    let api: ApiHandler
    if (configuration.apiProvider === 'litellm' || configuration.apiProvider === 'default') {
      const { LiteLlmHandler } = await import('@api/providers/litellm')
      const options =
        configuration.apiProvider === 'default'
          ? {
              ...configuration,
              liteLlmModelId: configuration.defaultModelId,
              liteLlmBaseUrl: configuration.defaultBaseUrl,
              liteLlmApiKey: configuration.defaultApiKey
            }
          : configuration
      api = LiteLlmHandler.createSync(options)
    } else {
      api = buildApiHandler(configuration)
    }
    return await api.validateApiKey()
  }
  /**
   * Handle command generation request from webview
   * Converts natural language instruction to executable terminal command
   */
  async handleCommandGeneration(instruction: string, context?: { cwd: string; platform: string; shell: string }, tabId?: string, modelName?: string) {
    try {
      // Get API configuration
      const { apiConfiguration } = await getAllExtensionState()
      if (!apiConfiguration) {
        throw new Error('API configuration not found')
      }

      // Build API configuration based on selected model
      let commandApiConfiguration: ApiConfiguration

      if (modelName) {
        // Get model options to find the selected model's provider (exclude thinking models)
        const modelOptions = await getModelOptions(true)
        const selectedModel = modelOptions.find((m) => m.name === modelName)

        if (selectedModel && selectedModel.apiProvider) {
          const modelKey = PROVIDER_MODEL_KEY_MAP[selectedModel.apiProvider] || 'defaultModelId'

          commandApiConfiguration = {
            ...apiConfiguration,
            apiProvider: selectedModel.apiProvider as ApiProvider,
            [modelKey]: selectedModel.name
          }
        } else {
          // Fallback to current user configuration if model not found
          commandApiConfiguration = apiConfiguration
        }
      } else {
        // No model specified, use current configuration (backwards compatibility)
        commandApiConfiguration = apiConfiguration
      }

      const api = buildApiHandler(commandApiConfiguration)

      // Build system prompt for command generation
      const systemPrompt = this.buildCommandGenerationPrompt(context)

      // Create conversation with user instruction
      const conversation: Anthropic.MessageParam[] = [
        {
          role: 'user' as const,
          content: instruction
        }
      ]

      // Call AI API to generate command
      const stream = api.createMessage(systemPrompt, conversation)
      let generatedCommand = ''

      try {
        for await (const chunk of stream) {
          if (chunk.type === 'text') {
            generatedCommand += chunk.text
          }
        }

        // Clean up the generated command (remove markdown formatting if present)
        const cleanedCommand = this.extractCommandFromResponse(generatedCommand)

        // Send response back to webview with tabId for proper routing
        await this.postMessageToWebview({
          type: 'commandGenerationResponse',
          command: cleanedCommand,
          tabId: tabId
        })
      } catch (streamError) {
        console.error('Error processing AI stream:', streamError)
        throw streamError
      }
    } catch (error) {
      console.error('Command generation failed:', error)

      // Send error response back to webview with tabId for proper routing
      await this.postMessageToWebview({
        type: 'commandGenerationResponse',
        error: error instanceof Error ? error.message : 'Command generation failed',
        tabId: tabId
      })
    }
  }

  /**
   * Generate chat title using LLM
   * Creates a concise, descriptive title for the chat session based on the user's task
   * @returns The generated title or empty string if generation fails
   */
  async generateChatTitle(userTask: string, taskId: string): Promise<string> {
    try {
      // Add timeout to prevent hanging (10 seconds)
      const timeoutPromise = new Promise<string>((_, reject) => {
        setTimeout(() => reject(new Error('Title generation timeout')), 10000)
      })

      const titleGenerationPromise = this._performTitleGeneration(userTask, taskId)

      return await Promise.race([titleGenerationPromise, timeoutPromise])
    } catch (error) {
      console.error('Chat title generation failed:', error)
      // Always return empty string to avoid disrupting task execution
      return ''
    }
  }

  /**
   * Internal method to perform the actual title generation
   */
  private async _performTitleGeneration(userTask: string, taskId: string): Promise<string> {
    const { apiConfiguration } = await getAllExtensionState()
    if (!apiConfiguration) {
      console.warn('API configuration not found, skipping title generation')
      return ''
    }

    const api = buildApiHandler(apiConfiguration)

    let userLanguage = DEFAULT_LANGUAGE_SETTINGS
    try {
      const userConfig = await getUserConfig()
      if (userConfig && userConfig.language) {
        userLanguage = userConfig.language
      }
    } catch (error) {
      // If we can't get user config, use default language
    }

    // Select system prompt based on language
    const systemPrompt = userLanguage === 'zh-CN' ? TITLE_GENERATION_PROMPT_CN : TITLE_GENERATION_PROMPT

    // Create conversation with user task
    const conversation: Anthropic.MessageParam[] = [
      {
        role: 'user' as const,
        content: `Generate a title for this task: ${userTask}`
      }
    ]

    // Call AI API to generate title
    const stream = api.createMessage(systemPrompt, conversation)
    let generatedTitle = ''

    try {
      for await (const chunk of stream) {
        if (chunk.type === 'text') {
          generatedTitle += chunk.text
        }
      }

      // Clean up the generated title (remove any extra whitespace, quotes, or newlines)
      const cleanedTitle = generatedTitle
        .replace(/<think>/g, '') // Remove GLM think tags
        .replace(/<\/think>/g, '')
        .trim()
        .replace(/^["']|["']$/g, '') // Remove leading/trailing quotes
        .replace(/\n/g, ' ') // Replace newlines with spaces
        .replace(/\s+/g, ' ') // Normalize multiple spaces
        .substring(0, 100) // Limit to 100 characters

      if (cleanedTitle) {
        console.log('Generated chat title:', cleanedTitle)

        // Update Task instance's chatTitle property
        const task = this.getTaskFromId(taskId)
        if (task) {
          task.chatTitle = cleanedTitle
          // Update history immediately with the new title
          await this.updateTaskHistory({
            id: taskId,
            chatTitle: cleanedTitle
          })
        }

        // Send the generated title to webview for immediate UI update
        await this.postMessageToWebview({
          type: 'chatTitleGenerated',
          chatTitle: cleanedTitle,
          taskId: taskId
        })

        return cleanedTitle
      }

      return ''
    } catch (streamError) {
      console.error('Error processing title generation stream:', streamError)
      return ''
    }
  }

  /**
   * Build system prompt for command generation
   */
  private buildCommandGenerationPrompt(context?): string {
    // Convert context object to string
    let contextString = 'No context provided'
    if (context && typeof context === 'object') {
      contextString = Object.entries(context)
        .map(([key, value]) => `${key}: ${value}`)
        .join('\n')
    } else if (context) {
      contextString = String(context)
    }

    return `You are a command-line expert assistant. Your job is to convert natural language instructions into precise, executable terminal commands.

Context:
${contextString}

Guidelines:
1. Generate ONLY the terminal command, without any explanation or markdown formatting
2. The command should be safe and commonly used
3. Use appropriate flags and options for the given OS and shell
4. If the instruction is unclear, provide the most reasonable interpretation
5. For complex operations, prefer single commands or simple pipelines
6. Use absolute paths when necessary for clarity

Examples:
Input: "list all javascript files"
Output: find . -name "*.js" -type f

Input: "show disk usage"
Output: df -h

Input: "find large files over 100MB"
Output: find . -type f -size +100M -exec ls -lh {} \\;

Now, convert the following instruction to a command:`
  }

  /**
   * Extract clean command from AI response
   * Removes markdown formatting and extra text
   */
  private extractCommandFromResponse(response: string): string {
    let command = response.trim()

    // Remove markdown code blocks
    command = command.replace(/^```(?:bash|sh|shell)?\s*\n?/gm, '')
    command = command.replace(/```\s*$/gm, '')

    // Remove common prefixes
    command = command.replace(/^(?:Command:|Output:|Result:)\s*/i, '')

    // Take only the first line if multiple lines
    const lines = command.split('\n').filter((line) => line.trim())
    if (lines.length > 0) {
      command = lines[0].trim()
    }

    // Remove leading/trailing quotes
    command = command.replace(/^["']|["']$/g, '')

    return command
  }

  private formatUserRulesToInstructions(
    userRules?: Array<{
      id: string
      content: string
      enabled: boolean
    }>
  ): string | undefined {
    if (!userRules || userRules.length === 0) {
      return undefined
    }

    // Filter enabled rules and format them as numbered list
    const enabledRules = userRules.filter((rule) => rule.enabled && rule.content.trim())
    if (enabledRules.length === 0) {
      return undefined
    }

    return enabledRules.map((rule, index) => `${index + 1}. ${rule.content.trim()}`).join('\n\n')
  }
}

function removeSensitiveKeys(obj: any): any {
  if (Array.isArray(obj)) {
    return obj.map(removeSensitiveKeys)
  } else if (obj && typeof obj === 'object') {
    const newObj: any = {}
    for (const key of Object.keys(obj)) {
      if (
        key.toLowerCase().includes('accesskey') ||
        key.toLowerCase().includes('secretkey') ||
        key.toLowerCase().includes('endpoint') ||
        key.toLowerCase().includes('awsprofile')
      ) {
        newObj[key] = undefined // or '***'
      } else {
        newObj[key] = removeSensitiveKeys(obj[key])
      }
    }
    return newObj
  }
  return obj
}

async function updateTaskHosts(taskId: string, hosts: Host[]) {
  const metadata = await getTaskMetadata(taskId)
  metadata.hosts = hosts || []

  await saveTaskMetadata(taskId, metadata)
}
