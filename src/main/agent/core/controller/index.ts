import { Anthropic } from '@anthropic-ai/sdk'
import axios from 'axios'
import type { AxiosRequestConfig } from 'axios'

import fs from 'fs/promises'
import { setTimeout as setTimeoutPromise } from 'node:timers/promises'
import pWaitFor from 'p-wait-for'
import * as path from 'path'
import * as vscode from 'vscode'
import { buildApiHandler } from '@api/index'

import { cleanupLegacyCheckpoints } from '@integrations/checkpoints/CheckpointMigration'
import { downloadTask } from '@integrations/misc/export-markdown'
import WorkspaceTracker from '@integrations/workspace/WorkspaceTracker'
import { TelemetrySetting } from '@shared/TelemetrySetting'
import { telemetryService } from '@services/telemetry/TelemetryService'
import { ExtensionMessage, ExtensionState, Invoke, Platform } from '@shared/ExtensionMessage'
import { HistoryItem } from '@shared/HistoryItem'
import { WebviewMessage } from '@shared/WebviewMessage'
import { fileExistsAtPath } from '@utils/fs'
import { getTotalTasksSize } from '@utils/storage'
import type { Host } from '@shared/WebviewMessage'
import { ensureTaskExists, getSavedApiConversationHistory, deleteChatermHistoryByTaskId, getTaskMetadata, saveTaskMetadata } from '../storage/disk'
import {
  getAllExtensionState,
  getGlobalState,
  resetExtensionState,
  storeSecret,
  updateApiConfiguration,
  updateGlobalState,
  getUserConfig
} from '../storage/state'
import { Task } from '../task'
import { ApiConfiguration } from '@shared/api'
import { TITLE_GENERATION_PROMPT, TITLE_GENERATION_PROMPT_CN } from '../prompts/system'
import { DEFAULT_LANGUAGE_SETTINGS } from '@shared/Languages'

export class Controller {
  private postMessage: (message: ExtensionMessage) => Promise<boolean> | undefined

  private disposables: vscode.Disposable[] = []
  task?: Task
  workspaceTracker: WorkspaceTracker

  constructor(
    readonly context: vscode.ExtensionContext,
    private readonly outputChannel: vscode.OutputChannel,
    postMessage: (message: ExtensionMessage) => Promise<boolean> | undefined
  ) {
    console.log('Controller instantiated')
    this.outputChannel.appendLine('ClineProvider instantiated')
    this.postMessage = postMessage

    this.workspaceTracker = new WorkspaceTracker((msg) => this.postMessageToWebview(msg))

    // Clean up legacy checkpoints
    cleanupLegacyCheckpoints(this.context.globalStorageUri.fsPath, this.outputChannel).catch((error) => {
      console.error('Failed to cleanup legacy checkpoints:', error)
    })
  }

  async dispose() {
    this.outputChannel.appendLine('Disposing ClineProvider...')

    // Release terminal resources
    if (this.task) {
      const terminalManager = this.task.getTerminalManager()

      if (terminalManager) {
        terminalManager.disposeAll()
      }
    }

    await this.clearTask()
    this.outputChannel.appendLine('Cleared task')
    while (this.disposables.length) {
      const x = this.disposables.pop()
      if (x) {
        x.dispose()
      }
    }
    this.workspaceTracker.dispose()
    this.outputChannel.appendLine('Disposed all disposables')
  }

  // Auth methods
  async handleSignOut() {
    try {
      await storeSecret('clineApiKey', undefined)
      await updateGlobalState('userInfo', undefined)
      await updateGlobalState('apiProvider', 'openrouter')
      await this.postStateToWebview()
      vscode.window.showInformationMessage('Successfully logged out of Cline')
    } catch (error) {
      vscode.window.showErrorMessage('Logout failed')
    }
  }

  async setUserInfo(info?: { displayName: string | null; email: string | null; photoURL: string | null }) {
    await updateGlobalState('userInfo', info)
  }

  async initTask(hosts: Host[], task?: string, historyItem?: HistoryItem, cwd?: Map<string, string>, taskId?: string) {
    console.log('initTask', task, historyItem, 'taskId:', taskId)
    await this.clearTask() // ensures that an existing task doesn't exist before starting a new one, although this shouldn't be possible since user must clear task before starting a new one
    const { apiConfiguration, userRules, autoApprovalSettings } = await getAllExtensionState()
    const customInstructions = this.formatUserRulesToInstructions(userRules)

    // Create task immediately without waiting for title generation
    this.task = new Task(
      this.workspaceTracker,
      (historyItem) => this.updateTaskHistory(historyItem),
      () => this.postStateToWebview(),
      (message) => this.postMessageToWebview(message),
      (taskId) => this.reinitExistingTaskFromId(taskId),
      apiConfiguration,
      autoApprovalSettings,
      hosts,
      customInstructions,
      task,
      historyItem,
      cwd,
      undefined, // Don't pass generated title initially
      taskId
    )

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
      await this.initTask(this.task?.hosts || [], undefined, history.historyItem)
    }
  }

  // Send any JSON serializable data to the react app
  async postMessageToWebview(message: ExtensionMessage) {
    // Send a message to the webview here
    const safeMessage = removeSensitiveKeys(message)
    await this.postMessage(safeMessage)
  }

  /**
   * Sets up an event listener to listen for messages passed from the webview context and
   * executes code based on the message that is received.
   *
   * @param webview A reference to the extension webview
   */
  async handleWebviewMessage(message: WebviewMessage) {
    switch (message.type) {
      case 'authStateChanged':
        // await this.setUserInfo(message.user || undefined)
        await this.setUserInfo(undefined)
        await this.postStateToWebview()
        break

      case 'newTask':
        await this.initTask(message.hosts!, message.text, undefined, message.cwd, message.taskId)
        if (this.task?.taskId && message.hosts) {
          await updateTaskHosts(this.task.taskId, message.hosts)
        }
        break
      case 'condense':
        this.task?.handleWebviewAskResponse('yesButtonClicked')
        break
      case 'apiConfiguration':
        if (message.apiConfiguration) {
          await updateApiConfiguration(message.apiConfiguration)
          if (this.task) {
            this.task.api = buildApiHandler(message.apiConfiguration)
          }
        }
        await this.postStateToWebview()
        break
      case 'optionsResponse':
        await this.postMessageToWebview({
          type: 'invoke',
          invoke: 'sendMessage',
          text: message.text
        })
        break
      case 'askResponse':
        console.log('askResponse', message)
        if (this.task) {
          if (message.askResponse === 'messageResponse') {
            await this.task.clearTodos('new_user_input')
          }
          await this.task.handleWebviewAskResponse(message.askResponse!, message.text, message.cwd)
        }
        break
      case 'showTaskWithId':
        this.showTaskWithId(message.text!, message.hosts || [], message.cwd)
        break
      case 'deleteTaskWithId':
        this.deleteTaskWithId(message.text!)
        break
      case 'requestTotalTasksSize': {
        this.refreshTotalTasksSize()
        break
      }
      case 'taskFeedback':
        if (message.feedbackType && this.task?.taskId) {
          telemetryService.captureTaskFeedback(this.task.taskId, message.feedbackType)
        }
        break
      case 'interactiveCommandInput':
        if (message.input !== undefined && this.task) {
          this.task.handleInteractiveCommandInput(message.input)
        }
        break
      case 'commandGeneration':
        if (message.instruction) {
          await this.handleCommandGeneration(message.instruction, message.context, message.tabId)
        }
        break
      case 'invoke': {
        if (message.text) {
          await this.postMessageToWebview({
            type: 'invoke',
            invoke: message.text as Invoke
          })
        }
        break
      }
      case 'updateSettings': {
        // api config
        if (message.apiConfiguration) {
          await updateApiConfiguration(message.apiConfiguration)
          if (this.task) {
            this.task.api = buildApiHandler(message.apiConfiguration)
          }
        }

        // telemetry setting
        if (message.telemetrySetting) {
          await this.updateTelemetrySetting(message.telemetrySetting)
        }

        // after settings are updated, post state to webview
        await this.postStateToWebview()

        await this.postMessageToWebview({ type: 'didUpdateSettings' })
        break
      }
      case 'clearAllTaskHistory': {
        await this.deleteAllTaskHistory()
        await this.postStateToWebview()
        this.refreshTotalTasksSize()
        this.postMessageToWebview({ type: 'relinquishControl' })
        break
      }
      case 'telemetrySetting': {
        if (message.telemetrySetting) {
          await this.updateTelemetrySetting(message.telemetrySetting)
        }
        await this.postStateToWebview()
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

  async cancelTask() {
    if (this.task) {
      const currentTask = this.task
      const { historyItem } = await this.getTaskWithId(currentTask.taskId)
      try {
        await currentTask.abortTask()
      } catch (error) {
        console.error('Failed to abort task', error)
      }
      await pWaitFor(
        () => this.task === undefined || this.task.isStreaming === false || this.task.didFinishAbortingStream || this.task.isWaitingForFirstChunk, // if only first chunk is processed, then there's no need to wait for graceful abort (closes edits, browser, etc)
        {
          timeout: 3_000
        }
      ).catch(() => {
        console.error('Failed to abort task')
      })
      try {
        await currentTask.clearTodos('user_cancelled')
      } catch (error) {
        console.error('Failed to clear todos during cancelTask', error)
      }
      // 'abandoned' will prevent this cline instance from affecting future cline instance gui. this may happen if its hanging on a streaming request
      currentTask.abandoned = true
      await this.initTask(currentTask.hosts, undefined, historyItem) // clears task again, so we need to abortTask manually above
      // await this.postStateToWebview() // new Cline instance will post state when it's ready. having this here sent an empty messages array to webview leading to virtuoso having to reload the entire list
    }
  }

  async gracefulCancelTask() {
    if (this.task) {
      try {
        await this.task.gracefulAbortTask()
      } catch (error) {
        console.error('Failed to gracefully abort task', error)
      }
      try {
        await this.task.clearTodos('user_cancelled')
      } catch (error) {
        console.error('Failed to clear todos during gracefulCancelTask', error)
      }
    }
  }

  async getOllamaModels(baseUrl?: string) {
    try {
      if (!baseUrl) {
        baseUrl = 'http://localhost:11434'
      }
      if (!URL.canParse(baseUrl)) {
        return []
      }
      const response = await axios.get(`${baseUrl}/api/tags`)
      const modelsArray = response.data?.models?.map((model: any) => model.name) || []
      const models = [...new Set<string>(modelsArray)]
      return models
    } catch (error) {
      return []
    }
  }

  // LM Studio

  async getLmStudioModels(baseUrl?: string) {
    try {
      if (!baseUrl) {
        baseUrl = 'http://localhost:1234'
      }
      if (!URL.canParse(baseUrl)) {
        return []
      }
      const response = await axios.get(`${baseUrl}/v1/models`)
      const modelsArray = response.data?.data?.map((model: any) => model.id) || []
      const models = [...new Set<string>(modelsArray)]
      return models
    } catch (error) {
      return []
    }
  }

  async getOpenAiModels(baseUrl?: string, apiKey?: string) {
    try {
      if (!baseUrl) {
        return []
      }

      if (!URL.canParse(baseUrl)) {
        return []
      }

      const config: AxiosRequestConfig = {}
      if (apiKey) {
        config['headers'] = { Authorization: `Bearer ${apiKey}` }
      }

      const response = await axios.get(`${baseUrl}/models`, config)
      const modelsArray = response.data?.data?.map((model: any) => model.id) || []
      const models = [...new Set<string>(modelsArray)]
      return models
    } catch (error) {
      return []
    }
  }

  getFileMentionFromPath(filePath: string) {
    const cwd = vscode.workspace.workspaceFolders?.map((folder) => folder.uri.fsPath).at(0)
    if (!cwd) {
      return '@/' + filePath
    }
    const relativePath = path.relative(cwd, filePath)
    return '@/' + relativePath
  }

  // 'Add to Cline' context menu in editor and code action
  async addSelectedCodeToChat(code: string, filePath: string, languageId: string, diagnostics?: vscode.Diagnostic[]) {
    // Ensure the sidebar view is visible
    await vscode.commands.executeCommand('claude-dev.SidebarProvider.focus')
    await setTimeoutPromise(100)

    // Post message to webview with the selected code
    const fileMention = this.getFileMentionFromPath(filePath)

    let input = `${fileMention}\n\`\`\`\n${code}\n\`\`\``
    if (diagnostics) {
      const problemsString = this.convertDiagnosticsToProblemsString(diagnostics)
      input += `\nProblems:\n${problemsString}`
    }

    await this.postMessageToWebview({
      type: 'addToInput',
      text: input
    })

    console.log('addSelectedCodeToChat', code, filePath, languageId)
  }

  // 'Add to Cline' context menu in Terminal
  async addSelectedTerminalOutputToChat(output: string, terminalName: string) {
    // Ensure the sidebar view is visible
    await vscode.commands.executeCommand('claude-dev.SidebarProvider.focus')
    await setTimeoutPromise(100)

    // Post message to webview with the selected terminal output
    // await this.postMessageToWebview({
    //     type: "addSelectedTerminalOutput",
    //     output,
    //     terminalName
    // })

    await this.postMessageToWebview({
      type: 'addToInput',
      text: `Terminal output:\n\`\`\`\n${output}\n\`\`\``
    })

    console.log('addSelectedTerminalOutputToChat', output, terminalName)
  }

  convertDiagnosticsToProblemsString(diagnostics: vscode.Diagnostic[]) {
    let problemsString = ''
    for (const diagnostic of diagnostics) {
      let label: string
      switch (diagnostic.severity) {
        case vscode.DiagnosticSeverity.Error:
          label = 'Error'
          break
        case vscode.DiagnosticSeverity.Warning:
          label = 'Warning'
          break
        case vscode.DiagnosticSeverity.Information:
          label = 'Information'
          break
        case vscode.DiagnosticSeverity.Hint:
          label = 'Hint'
          break
        default:
          label = 'Diagnostic'
      }
      const line = diagnostic.range.start.line + 1 // VSCode lines are 0-indexed
      const source = diagnostic.source ? `${diagnostic.source} ` : ''
      problemsString += `\n- [${source}${label}] Line ${line}: ${diagnostic.message}`
    }
    problemsString = problemsString.trim()
    return problemsString
  }

  // Task history

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
    if (id !== this.task?.taskId) {
      // non-current task
      const { historyItem } = await this.getTaskWithId(id)
      await this.initTask(hosts, undefined, historyItem, cwd) // clears existing task
    }
  }

  async exportTaskWithId(id: string) {
    const { historyItem, apiConversationHistory } = await this.getTaskWithId(id)
    await downloadTask(historyItem.ts, apiConversationHistory)
  }

  async deleteAllTaskHistory() {
    await this.clearTask()
    await updateGlobalState('taskHistory', undefined)
    try {
      // Remove all contents of tasks directory
      const taskDirPath = path.join(this.context.globalStorageUri.fsPath, 'tasks')
      if (await fileExistsAtPath(taskDirPath)) {
        await fs.rm(taskDirPath, { recursive: true, force: true })
      }
      // Remove checkpoints directory contents
      const checkpointsDirPath = path.join(this.context.globalStorageUri.fsPath, 'checkpoints')
      if (await fileExistsAtPath(checkpointsDirPath)) {
        await fs.rm(checkpointsDirPath, { recursive: true, force: true })
      }
    } catch (error) {
      vscode.window.showErrorMessage(
        `Encountered error while deleting task history, there may be some files left behind. Error: ${error instanceof Error ? error.message : String(error)}`
      )
    }
    await this.postStateToWebview()
  }

  async refreshTotalTasksSize() {
    getTotalTasksSize(this.context.globalStorageUri.fsPath)
      .then((newTotalSize) => {
        this.postMessageToWebview({
          type: 'totalTasksSize',
          totalTasksSize: newTotalSize
        })
      })
      .catch((error) => {
        console.error('Error calculating total tasks size:', error)
      })
  }

  async deleteTaskWithId(id: string) {
    console.info('deleteTaskWithId: ', id)
    await deleteChatermHistoryByTaskId(id)
    this.refreshTotalTasksSize()
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

  async postStateToWebview() {
    const state = await this.getStateToPostToWebview()
    this.postMessageToWebview({ type: 'state', state })
  }

  async getStateToPostToWebview(): Promise<ExtensionState> {
    const {
      apiConfiguration,
      // lastShownAnnouncementId,
      customInstructions,
      // taskHistory,
      autoApprovalSettings,
      // browserSettings,
      chatSettings,
      userInfo,
      mcpMarketplaceEnabled
      // telemetrySetting,
      // planActSeparateModelsSetting,
    } = await getAllExtensionState()

    return {
      version: this.context.extension?.packageJSON?.version ?? '',
      apiConfiguration,
      customInstructions,
      uriScheme: vscode.env.uriScheme,
      // currentTaskItem: this.task?.taskId
      //   ? (taskHistory || []).find((item) => item.id === this.task?.taskId)
      //   : undefined,
      checkpointTrackerErrorMessage: this.task?.checkpointTrackerErrorMessage,
      chatermMessages: this.task?.chatermMessages || [],
      // taskHistory: (taskHistory || [])
      //   .filter((item) => item.ts && item.task)
      //   .sort((a, b) => b.ts - a.ts)
      //   .slice(0, 100), // for now we're only getting the latest 100 tasks, but a better solution here is to only pass in 3 for recent task history, and then get the full task history on demand when going to the task history view (maybe with pagination?)
      // shouldShowAnnouncement: lastShownAnnouncementId !== this.latestAnnouncementId,
      shouldShowAnnouncement: false,

      platform: process.platform as Platform,
      autoApprovalSettings,
      // browserSettings,
      chatSettings,
      userInfo,
      mcpMarketplaceEnabled,
      // telemetrySetting,
      // planActSeparateModelsSetting,
      vscMachineId: vscode.env.machineId,
      shellIntegrationTimeout: 30,
      isNewUser: true
    }
  }

  async clearTask() {
    this.task?.abortTask()
    this.task = undefined // removes reference to it, so once promises end it will be garbage collected
  }
  async updateTaskHistory(item: HistoryItem): Promise<HistoryItem[]> {
    const history = ((await getGlobalState('taskHistory')) as HistoryItem[]) || []
    const idx = history.findIndex((h) => h.id === item.id)
    if (idx !== -1) {
      const existing = history[idx]
      history[idx] = {
        ...existing,
        ...item,
        task: existing.task || item.task,
        // chatTitle: item.chatTitle !== undefined ? item.chatTitle : existing.chatTitle
        chatTitle: existing.chatTitle
      }
    } else {
      history.push(item)
    }
    await updateGlobalState('taskHistory', history)
    return history
  }

  async resetState() {
    vscode.window.showInformationMessage('Resetting state...')
    await resetExtensionState()
    if (this.task) {
      this.task.abortTask()
      this.task = undefined
    }
    vscode.window.showInformationMessage('State reset')
    await this.postStateToWebview()
  }

  async validateApiKey(configuration: ApiConfiguration): Promise<{ isValid: boolean; error?: string }> {
    const api = buildApiHandler(configuration)
    return await api.validateApiKey()
  }
  /**
   * Handle command generation request from webview
   * Converts natural language instruction to executable terminal command
   */
  async handleCommandGeneration(instruction: string, context?: { cwd: string; platform: string; shell: string }, tabId?: string) {
    try {
      // Get API configuration
      const { apiConfiguration } = await getAllExtensionState()
      if (!apiConfiguration) {
        throw new Error('API configuration not found')
      }

      // Build a new API configuration for command generation
      const commandApiConfiguration = {
        ...apiConfiguration,
        apiProvider: 'default' as const,
        defaultModelId: 'Qwen-Plus'
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
        .trim()
        .replace(/^["']|["']$/g, '') // Remove leading/trailing quotes
        .replace(/\n/g, ' ') // Replace newlines with spaces
        .replace(/\s+/g, ' ') // Normalize multiple spaces
        .substring(0, 100) // Limit to 100 characters

      if (cleanedTitle) {
        console.log('Generated chat title:', cleanedTitle)

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
        key.toLowerCase().includes('awsProfile')
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
