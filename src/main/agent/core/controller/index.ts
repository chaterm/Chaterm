import { Anthropic } from '@anthropic-ai/sdk'
import axios from 'axios'
import type { AxiosRequestConfig } from 'axios'

import fs from 'fs/promises'
import { setTimeout as setTimeoutPromise } from 'node:timers/promises'
import pWaitFor from 'p-wait-for'
import * as path from 'path'
import * as vscode from 'vscode'
import { handleGrpcRequest } from './grpc-handler'
import { buildApiHandler } from '@api/index'
import { cleanupLegacyCheckpoints } from '@integrations/checkpoints/CheckpointMigration'
import { downloadTask } from '@integrations/misc/export-markdown'
// import { fetchOpenGraphData } from '@integrations/misc/link-preview'
import WorkspaceTracker from '@integrations/workspace/WorkspaceTracker'
import { searchWorkspaceFiles } from '@services/search/file-search'
import { ExtensionMessage, ExtensionState, Invoke, Platform } from '@shared/ExtensionMessage'
import { HistoryItem } from '@shared/HistoryItem'
import { WebviewMessage } from '@shared/WebviewMessage'
import { fileExistsAtPath } from '@utils/fs'
import { getWorkspacePath } from '@utils/path'
import { getTotalTasksSize } from '@utils/storage'
import {
  ensureTaskExists,
  getSavedApiConversationHistory,
  deleteChatermHistoryByTaskId
} from '../storage/disk'
import {
  getAllExtensionState,
  getGlobalState,
  getSecret,
  resetExtensionState,
  storeSecret,
  updateApiConfiguration,
  updateGlobalState
  // updateWorkspaceState
} from '../storage/state'
import { Task } from '../task'

/*
https://github.com/microsoft/vscode-webview-ui-toolkit-samples/blob/main/default/weather-webview/src/providers/WeatherViewProvider.ts

https://github.com/KumarVariable/vscode-extension-sidebar-html/blob/master/src/customSidebarViewProvider.ts
*/

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
    cleanupLegacyCheckpoints(this.context.globalStorageUri.fsPath, this.outputChannel).catch(
      (error) => {
        console.error('Failed to cleanup legacy checkpoints:', error)
      }
    )
  }

  /*
	VSCode extensions use the disposable pattern to clean up resources when the sidebar/editor tab is closed by the user or system. This applies to event listening, commands, interacting with the UI, etc.
	- https://vscode-docs.readthedocs.io/en/stable/extensions/patterns-and-principles/
	- https://github.com/microsoft/vscode-extension-samples/blob/main/webview-sample/src/extension.ts
	*/
  async dispose() {
    this.outputChannel.appendLine('Disposing ClineProvider...')
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

    console.error('Controller disposed')
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

  async setUserInfo(info?: {
    displayName: string | null
    email: string | null
    photoURL: string | null
  }) {
    await updateGlobalState('userInfo', info)
  }

  async initTask(task?: string, historyItem?: HistoryItem, terminalUuid?: string, terminalOutput?: string) {
    console.log('initTask', task, historyItem)
    await this.clearTask() // ensures that an existing task doesn't exist before starting a new one, although this shouldn't be possible since user must clear task before starting a new one
    const { apiConfiguration, customInstructions, autoApprovalSettings, chatSettings } =
      await getAllExtensionState()

    if (autoApprovalSettings) {
      const updatedAutoApprovalSettings = {
        ...autoApprovalSettings,
        version: (autoApprovalSettings.version ?? 1) + 1
      }
      await updateGlobalState('autoApprovalSettings', updatedAutoApprovalSettings)
    }
    this.task = new Task(
      this.context,
      this.workspaceTracker,
      (historyItem) => this.updateTaskHistory(historyItem),
      () => this.postStateToWebview(),
      (message) => this.postMessageToWebview(message),
      (taskId) => this.reinitExistingTaskFromId(taskId),
      () => this.cancelTask(),
      apiConfiguration,
      autoApprovalSettings,
      chatSettings,
      30,
      customInstructions,
      task,
      historyItem,
      terminalUuid,
      terminalOutput
    )
  }

  async reinitExistingTaskFromId(taskId: string) {
    const history = await this.getTaskWithId(taskId)
    if (history) {
      await this.initTask(undefined, history.historyItem)
    }
  }

  // Send any JSON serializable data to the react app
  async postMessageToWebview(message: ExtensionMessage) {
    // 这里发送消息到 webview
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
      case 'showChatView': {
        this.postMessageToWebview({
          type: 'action',
          action: 'chatButtonClicked'
        })
        break
      }
      case 'newTask':
        // Code that should run in response to the hello message command
        //vscode.window.showInformationMessage(message.text!)

        // Send a message to our webview.
        // You can send any JSON serializable data.
        // Could also do this in extension .ts
        //this.postMessageToWebview({ type: "text", text: `Extension: ${Date.now()}` })
        // initializing new instance of Cline will make sure that any agentically running promises in old instance don't affect our new task. this essentially creates a fresh slate for the new task
        await this.initTask(message.text, undefined, message.terminalUuid, message.terminalOutput)
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
      // case 'autoApprovalSettings':
      //   if (message.autoApprovalSettings) {
      //     const currentSettings = (await getAllExtensionState(this.context)).autoApprovalSettings
      //     const incomingVersion = message.autoApprovalSettings.version ?? 1
      //     const currentVersion = currentSettings?.version ?? 1
      //     if (incomingVersion > currentVersion) {
      //       await updateGlobalState(
      //         this.context,
      //         'autoApprovalSettings',
      //         message.autoApprovalSettings
      //       )
      //       if (this.task) {
      //         this.task.autoApprovalSettings = message.autoApprovalSettings
      //       }
      //       await this.postStateToWebview()
      //     }
      //   }
      //   break
      case 'optionsResponse':
        await this.postMessageToWebview({
          type: 'invoke',
          invoke: 'sendMessage',
          text: message.text
        })
        break
      case 'askResponse':
        console.log('askResponse', message)
        this.task?.handleWebviewAskResponse(message.askResponse!, message.text)
        break
      case 'showTaskWithId':
        this.showTaskWithId(message.text!)
        break
      case 'deleteTaskWithId':
        this.deleteTaskWithId(message.text!)
        break
      case 'requestTotalTasksSize': {
        this.refreshTotalTasksSize()
        break
      }
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

        // custom instructions
        await this.updateCustomInstructions(message.customInstructionsSetting)

        // plan act setting
        // await updateGlobalState(
        //   'planActSeparateModelsSetting',
        //   message.planActSeparateModelsSetting
        // )

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
      case 'searchFiles': {
        const workspacePath = getWorkspacePath()

        if (!workspacePath) {
          // Handle case where workspace path is not available
          await this.postMessageToWebview({
            type: 'fileSearchResults',
            results: [],
            mentionsRequestId: message.mentionsRequestId,
            error: 'No workspace path available'
          })
          break
        }
        try {
          // Call file search service with query from message
          const results = await searchWorkspaceFiles(
            message.query || '',
            workspacePath,
            20 // Use default limit, as filtering is now done in the backend
          )

          // debug logging to be removed
          //console.log(`controller/index.ts: Search results: ${results.length}`)

          // Send results back to webview
          await this.postMessageToWebview({
            type: 'fileSearchResults',
            results,
            mentionsRequestId: message.mentionsRequestId
          })
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error)

          // Send error response to webview
          await this.postMessageToWebview({
            type: 'fileSearchResults',
            results: [],
            error: errorMessage,
            mentionsRequestId: message.mentionsRequestId
          })
        }
        break
      }
      case 'grpc_request': {
        // 什么时候调用到这里？——发起第一个任务时
        // 谁发起的grpc请求？
        if (message.grpc_request) {
          await handleGrpcRequest(this, message.grpc_request)
        }
        break
      }
      // Add more switch case statements here as more webview message commands
      // are created within the webview context (i.e. inside media/main.js)
    }
  }

  async cancelTask() {
    if (this.task) {
      const { historyItem } = await this.getTaskWithId(this.task.taskId)
      try {
        await this.task.abortTask()
      } catch (error) {
        console.error('Failed to abort task', error)
      }
      await pWaitFor(
        () =>
          this.task === undefined ||
          this.task.isStreaming === false ||
          this.task.didFinishAbortingStream ||
          this.task.isWaitingForFirstChunk, // if only first chunk is processed, then there's no need to wait for graceful abort (closes edits, browser, etc)
        {
          timeout: 3_000
        }
      ).catch(() => {
        console.error('Failed to abort task')
      })
      if (this.task) {
        // 'abandoned' will prevent this cline instance from affecting future cline instance gui. this may happen if its hanging on a streaming request
        this.task.abandoned = true
      }
      await this.initTask(undefined, historyItem) // clears task again, so we need to abortTask manually above
      // await this.postStateToWebview() // new Cline instance will post state when it's ready. having this here sent an empty messages array to webview leading to virtuoso having to reload the entire list
    }
  }

  async updateCustomInstructions(instructions?: string) {
    // User may be clearing the field
    await updateGlobalState('customInstructions', instructions || undefined)
    if (this.task) {
      this.task.customInstructions = instructions || undefined
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
  async addSelectedCodeToChat(
    code: string,
    filePath: string,
    languageId: string,
    diagnostics?: vscode.Diagnostic[]
  ) {
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

  // 'Fix with Cline' in code actions
  async fixWithCline(
    code: string,
    filePath: string,
    languageId: string,
    diagnostics: vscode.Diagnostic[]
  ) {
    // Ensure the sidebar view is visible
    await vscode.commands.executeCommand('claude-dev.SidebarProvider.focus')
    await setTimeoutPromise(100)

    const fileMention = this.getFileMentionFromPath(filePath)
    const problemsString = this.convertDiagnosticsToProblemsString(diagnostics)
    await this.initTask(
      `Fix the following code in ${fileMention}\n\`\`\`\n${code}\n\`\`\`\n\nProblems:\n${problemsString}`
    )

    console.log('fixWithCline', code, filePath, languageId, diagnostics, problemsString)
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

  async showTaskWithId(id: string) {
    if (id !== this.task?.taskId) {
      // non-current task
      const { historyItem } = await this.getTaskWithId(id)
      await this.initTask(undefined, historyItem) // clears existing task
    }
    await this.postMessageToWebview({
      type: 'action',
      action: 'chatButtonClicked'
    })
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
    // await this.postStateToWebview()
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
      // globalClineRulesToggles
    } = await getAllExtensionState()

    // const localClineRulesToggles =
    //   ((await getWorkspaceState('localClineRulesToggles')) as ClineRulesToggles) || {}

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
      // globalClineRulesToggles: globalClineRulesToggles || {},
      // localClineRulesToggles: localClineRulesToggles || {}
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
    const existingItemIndex = history.findIndex((h) => h.id === item.id)
    if (existingItemIndex !== -1) {
      history[existingItemIndex] = item
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
    await this.postMessageToWebview({
      type: 'action',
      action: 'chatButtonClicked'
    })
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
        newObj[key] = undefined // 或 '***'
      } else {
        newObj[key] = removeSensitiveKeys(obj[key])
      }
    }
    return newObj
  }
  return obj
}
