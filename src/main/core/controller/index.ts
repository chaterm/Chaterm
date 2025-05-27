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
import { fetchOpenGraphData } from '@integrations/misc/link-preview'
import WorkspaceTracker from '@integrations/workspace/WorkspaceTracker'
import { searchWorkspaceFiles } from '@services/search/file-search'
// import { ApiProvider, ModelInfo } from '@shared/api'
// import { ChatContent } from '@shared/ChatContent'
// import { ChatSettings } from '@shared/ChatSettings'
import { ExtensionMessage, ExtensionState, Invoke, Platform } from '@shared/ExtensionMessage'
import { HistoryItem } from '@shared/HistoryItem'
import { WebviewMessage } from '@shared/WebviewMessage'
import { fileExistsAtPath } from '@utils/fs'
import { getWorkspacePath } from '@utils/path'
import { getTotalTasksSize } from '@utils/storage'
import { GlobalFileNames } from '../storage/disk'
import {
  getAllExtensionState,
  getGlobalState,
  getSecret,
  getWorkspaceState,
  resetExtensionState,
  storeSecret,
  updateApiConfiguration,
  updateGlobalState
  // updateWorkspaceState
} from '../storage/state'
import { Task, cwd } from '../task'
import { ClineRulesToggles } from '@shared/cline-rules'
// import { NIL } from 'uuid'
// import { createRuleFile, deleteRuleFile, refreshClineRulesToggles } from "../context/instructions/user-instructions/cline-rules"

/*
https://github.com/microsoft/vscode-webview-ui-toolkit-samples/blob/main/default/weather-webview/src/providers/WeatherViewProvider.ts

https://github.com/KumarVariable/vscode-extension-sidebar-html/blob/master/src/customSidebarViewProvider.ts
*/

export class Controller {
  private postMessage: (message: ExtensionMessage) => Promise<boolean> | undefined

  private disposables: vscode.Disposable[] = []
  task?: Task
  workspaceTracker: WorkspaceTracker
  // accountService: ClineAccountService
  private latestAnnouncementId = 'april-18-2025_21:15::00' // update to some unique identifier when we add a new announcement

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

  async initTask(task?: string, historyItem?: HistoryItem) {
    await this.clearTask() // ensures that an existing task doesn't exist before starting a new one, although this shouldn't be possible since user must clear task before starting a new one
    const {
      apiConfiguration,
      customInstructions,
      autoApprovalSettings,
      // browserSettings,
      chatSettings
    } = await getAllExtensionState()

    if (autoApprovalSettings) {
      const updatedAutoApprovalSettings = {
        ...autoApprovalSettings,
        version: (autoApprovalSettings.version ?? 1) + 1
      }
      await updateGlobalState('autoApprovalSettings', updatedAutoApprovalSettings)
    }
    this.task = new Task(
      this.context,
      // this.mcpHub,
      this.workspaceTracker,
      (historyItem) => this.updateTaskHistory(historyItem),
      () => this.postStateToWebview(),
      (message) => this.postMessageToWebview(message),
      (taskId) => this.reinitExistingTaskFromId(taskId),
      () => this.cancelTask(),
      apiConfiguration,
      autoApprovalSettings,
      // browserSettings,
      chatSettings,
      30,
      customInstructions,
      task,
      // images,
      historyItem
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
    await this.postMessage(message)
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
        await this.initTask(message.text)
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
      // case 'togglePlanActMode':
      //   if (message.chatSettings) {
      //     await this.togglePlanActModeWithChatSettings(message.chatSettings, message.chatContent)
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
      // case 'requestVsCodeLmModels':
      //   const vsCodeLmModels = await this.getVsCodeLmModels()
      //   this.postMessageToWebview({ type: 'vsCodeLmModels', vsCodeLmModels })
      //   break
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
        await updateGlobalState(
          'planActSeparateModelsSetting',
          message.planActSeparateModelsSetting
        )

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

  // async togglePlanActModeWithChatSettings(chatSettings: ChatSettings, chatContent?: ChatContent) {
  //   const didSwitchToActMode = chatSettings.mode === 'act'

  //   // Get previous model info that we will revert to after saving current mode api info
  //   const {
  //     apiConfiguration,
  //     previousModeApiProvider: newApiProvider,
  //     previousModeModelId: newModelId,
  //     previousModeModelInfo: newModelInfo,
  //     previousModeVsCodeLmModelSelector: newVsCodeLmModelSelector,
  //     previousModeThinkingBudgetTokens: newThinkingBudgetTokens,
  //     previousModeReasoningEffort: newReasoningEffort,
  //     planActSeparateModelsSetting
  //   } = await getAllExtensionState(this.context)

  //   const shouldSwitchModel = planActSeparateModelsSetting === true

  //   if (shouldSwitchModel) {
  //     // Save the last model used in this mode
  //     await updateGlobalState(this.context, 'previousModeApiProvider', apiConfiguration.apiProvider)
  //     await updateGlobalState(
  //       this.context,
  //       'previousModeThinkingBudgetTokens',
  //       apiConfiguration.thinkingBudgetTokens
  //     )
  //     await updateGlobalState(
  //       this.context,
  //       'previousModeReasoningEffort',
  //       apiConfiguration.reasoningEffort
  //     )
  //     switch (apiConfiguration.apiProvider) {
  //       case 'anthropic':
  //       case 'bedrock':
  //       case 'vertex':
  //       case 'gemini':
  //       case 'asksage':
  //       case 'openai-native':
  //       case 'qwen':
  //       case 'deepseek':
  //       case 'xai':
  //         await updateGlobalState(this.context, 'previousModeModelId', apiConfiguration.apiModelId)
  //         break
  //       case 'openrouter':
  //       case 'cline':
  //         await updateGlobalState(
  //           this.context,
  //           'previousModeModelId',
  //           apiConfiguration.openRouterModelId
  //         )
  //         await updateGlobalState(
  //           this.context,
  //           'previousModeModelInfo',
  //           apiConfiguration.openRouterModelInfo
  //         )
  //         break
  //       case 'vscode-lm':
  //         // Important we don't set modelId to this, as it's an object not string (webview expects model id to be a string)
  //         await updateGlobalState(
  //           this.context,
  //           'previousModeVsCodeLmModelSelector',
  //           apiConfiguration.vsCodeLmModelSelector
  //         )
  //         break
  //       case 'openai':
  //         await updateGlobalState(
  //           this.context,
  //           'previousModeModelId',
  //           apiConfiguration.openAiModelId
  //         )
  //         await updateGlobalState(
  //           this.context,
  //           'previousModeModelInfo',
  //           apiConfiguration.openAiModelInfo
  //         )
  //         break
  //       case 'ollama':
  //         await updateGlobalState(
  //           this.context,
  //           'previousModeModelId',
  //           apiConfiguration.ollamaModelId
  //         )
  //         break
  //       case 'lmstudio':
  //         await updateGlobalState(
  //           this.context,
  //           'previousModeModelId',
  //           apiConfiguration.lmStudioModelId
  //         )
  //         break
  //       case 'litellm':
  //         await updateGlobalState(
  //           this.context,
  //           'previousModeModelId',
  //           apiConfiguration.liteLlmModelId
  //         )
  //         break
  //       case 'requesty':
  //         await updateGlobalState(
  //           this.context,
  //           'previousModeModelId',
  //           apiConfiguration.requestyModelId
  //         )
  //         await updateGlobalState(
  //           this.context,
  //           'previousModeModelInfo',
  //           apiConfiguration.requestyModelInfo
  //         )
  //         break
  //     }

  //     // Restore the model used in previous mode
  //     if (
  //       newApiProvider ||
  //       newModelId ||
  //       newThinkingBudgetTokens !== undefined ||
  //       newReasoningEffort ||
  //       newVsCodeLmModelSelector
  //     ) {
  //       await updateGlobalState(this.context, 'apiProvider', newApiProvider)
  //       await updateGlobalState(this.context, 'thinkingBudgetTokens', newThinkingBudgetTokens)
  //       await updateGlobalState(this.context, 'reasoningEffort', newReasoningEffort)
  //       switch (newApiProvider) {
  //         case 'anthropic':
  //         case 'bedrock':
  //         case 'vertex':
  //         case 'gemini':
  //         case 'asksage':
  //         case 'openai-native':
  //         case 'qwen':
  //         case 'deepseek':
  //         case 'xai':
  //           await updateGlobalState(this.context, 'apiModelId', newModelId)
  //           break
  //         case 'openrouter':
  //         case 'cline':
  //           await updateGlobalState(this.context, 'openRouterModelId', newModelId)
  //           await updateGlobalState(this.context, 'openRouterModelInfo', newModelInfo)
  //           break
  //         case 'vscode-lm':
  //           await updateGlobalState(this.context, 'vsCodeLmModelSelector', newVsCodeLmModelSelector)
  //           break
  //         case 'openai':
  //           await updateGlobalState(this.context, 'openAiModelId', newModelId)
  //           await updateGlobalState(this.context, 'openAiModelInfo', newModelInfo)
  //           break
  //         case 'ollama':
  //           await updateGlobalState(this.context, 'ollamaModelId', newModelId)
  //           break
  //         case 'lmstudio':
  //           await updateGlobalState(this.context, 'lmStudioModelId', newModelId)
  //           break
  //         case 'litellm':
  //           await updateGlobalState(this.context, 'liteLlmModelId', newModelId)
  //           break
  //         case 'requesty':
  //           await updateGlobalState(this.context, 'requestyModelId', newModelId)
  //           await updateGlobalState(this.context, 'requestyModelInfo', newModelInfo)
  //           break
  //       }

  //       if (this.task) {
  //         const { apiConfiguration: updatedApiConfiguration } = await getAllExtensionState(
  //           this.context
  //         )
  //         this.task.api = buildApiHandler(updatedApiConfiguration)
  //       }
  //     }
  //   }

  //   await updateGlobalState(this.context, 'chatSettings', chatSettings)
  //   await this.postStateToWebview()

  //   if (this.task) {
  //     this.task.chatSettings = chatSettings
  //     if (this.task.isAwaitingPlanResponse && didSwitchToActMode) {
  //       this.task.didRespondToPlanAskBySwitchingMode = true
  //       // Use chatContent if provided, otherwise use default message
  //       await this.postMessageToWebview({
  //         type: 'invoke',
  //         invoke: 'sendMessage',
  //         text: chatContent?.message || 'PLAN_MODE_TOGGLE_RESPONSE',
  //         images: chatContent?.images
  //       })
  //     } else {
  //       this.cancelTask()
  //     }
  //   }
  // }

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

  // VSCode LM API

  // private async getVsCodeLmModels() {
  //   try {
  //     const models = await vscode.lm.selectChatModels({})
  //     return models || []
  //   } catch (error) {
  //     console.error('Error fetching VS Code LM models:', error)
  //     return []
  //   }
  // }

  // Ollama

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

  // Account

  // async fetchUserCreditsData() {
  //   try {
  //     await Promise.all([
  //       this.accountService?.fetchBalance(),
  //       this.accountService?.fetchUsageTransactions(),
  //       this.accountService?.fetchPaymentTransactions()
  //     ])
  //   } catch (error) {
  //     console.error('Failed to fetch user credits data:', error)
  //   }
  // }

  // Auth

  public async validateAuthState(state: string | null): Promise<boolean> {
    const storedNonce = await getSecret('authNonce')
    if (!state || state !== storedNonce) {
      return false
    }
    await storeSecret('authNonce', undefined) // Clear after use
    return true
  }

  // async handleAuthCallback(customToken: string, apiKey: string) {
  //   try {
  //     // Store API key for API calls
  //     await storeSecret(this.context, 'clineApiKey', apiKey)

  //     // Send custom token to webview for Firebase auth
  //     await this.postMessageToWebview({
  //       type: 'authCallback',
  //       customToken
  //     })

  //     const clineProvider: ApiProvider = 'cline'
  //     await updateGlobalState(this.context, 'apiProvider', clineProvider)

  //     // Update API configuration with the new provider and API key
  //     const { apiConfiguration } = await getAllExtensionState(this.context)
  //     const updatedConfig = {
  //       ...apiConfiguration,
  //       apiProvider: clineProvider,
  //       clineApiKey: apiKey
  //     }

  //     if (this.task) {
  //       this.task.api = buildApiHandler(updatedConfig)
  //     }

  //     await this.postStateToWebview()
  //     // vscode.window.showInformationMessage("Successfully logged in to Cline")
  //   } catch (error) {
  //     console.error('Failed to handle auth callback:', error)
  //     vscode.window.showErrorMessage('Failed to log in to Cline')
  //     // Even on login failure, we preserve any existing tokens
  //     // Only clear tokens on explicit logout
  //   }
  // }

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

  // OpenRouter

  // async handleOpenRouterCallback(code: string) {
  //   let apiKey: string
  //   try {
  //     const response = await axios.post('https://openrouter.ai/api/v1/auth/keys', { code })
  //     if (response.data && response.data.key) {
  //       apiKey = response.data.key
  //     } else {
  //       throw new Error('Invalid response from OpenRouter API')
  //     }
  //   } catch (error) {
  //     console.error('Error exchanging code for API key:', error)
  //     throw error
  //   }

  //   const openrouter: ApiProvider = 'openrouter'
  //   await updateGlobalState(this.context, 'apiProvider', openrouter)
  //   await storeSecret(this.context, 'openRouterApiKey', apiKey)
  //   await this.postStateToWebview()
  //   if (this.task) {
  //     this.task.api = buildApiHandler({
  //       apiProvider: openrouter,
  //       openRouterApiKey: apiKey
  //     })
  //   }
  //   // await this.postMessageToWebview({ type: "action", action: "settingsButtonClicked" }) // bad ux if user is on welcome
  // }

  private async ensureCacheDirectoryExists(): Promise<string> {
    const cacheDir = path.join(this.context.globalStorageUri.fsPath, 'cache')
    await fs.mkdir(cacheDir, { recursive: true })
    return cacheDir
  }

  // async readOpenRouterModels(): Promise<Record<string, ModelInfo> | undefined> {
  //   const openRouterModelsFilePath = path.join(
  //     await this.ensureCacheDirectoryExists(),
  //     GlobalFileNames.openRouterModels
  //   )
  //   const fileExists = await fileExistsAtPath(openRouterModelsFilePath)
  //   if (fileExists) {
  //     const fileContents = await fs.readFile(openRouterModelsFilePath, 'utf8')
  //     return JSON.parse(fileContents)
  //   }
  //   return undefined
  // }

  // async refreshOpenRouterModels() {
  //   const openRouterModelsFilePath = path.join(
  //     await this.ensureCacheDirectoryExists(),
  //     GlobalFileNames.openRouterModels
  //   )

  //   let models: Record<string, ModelInfo> = {}
  //   try {
  //     const response = await axios.get('https://openrouter.ai/api/v1/models')
  //     /*
  // 		{
  // 			"id": "anthropic/claude-3.5-sonnet",
  // 			"name": "Anthropic: Claude 3.5 Sonnet",
  // 			"created": 1718841600,
  // 			"description": "Claude 3.5 Sonnet delivers better-than-Opus capabilities, faster-than-Sonnet speeds, at the same Sonnet prices. Sonnet is particularly good at:\n\n- Coding: Autonomously writes, edits, and runs code with reasoning and troubleshooting\n- Data science: Augments human data science expertise; navigates unstructured data while using multiple tools for insights\n- Visual processing: excelling at interpreting charts, graphs, and images, accurately transcribing text to derive insights beyond just the text alone\n- Agentic tasks: exceptional tool use, making it great at agentic tasks (i.e. complex, multi-step problem solving tasks that require engaging with other systems)\n\n#multimodal",
  // 			"context_length": 200000,
  // 			"architecture": {
  // 				"modality": "text+image-\u003Etext",
  // 				"tokenizer": "Claude",
  // 				"instruct_type": null
  // 			},
  // 			"pricing": {
  // 				"prompt": "0.000003",
  // 				"completion": "0.000015",
  // 				"image": "0.0048",
  // 				"request": "0"
  // 			},
  // 			"top_provider": {
  // 				"context_length": 200000,
  // 				"max_completion_tokens": 8192,
  // 				"is_moderated": true
  // 			},
  // 			"per_request_limits": null
  // 		},
  // 		*/
  //     if (response.data?.data) {
  //       const rawModels = response.data.data
  //       const parsePrice = (price: any) => {
  //         if (price) {
  //           return parseFloat(price) * 1_000_000
  //         }
  //         return undefined
  //       }
  //       for (const rawModel of rawModels) {
  //         const modelInfo: ModelInfo = {
  //           maxTokens: rawModel.top_provider?.max_completion_tokens,
  //           contextWindow: rawModel.context_length,
  //           supportsImages: rawModel.architecture?.modality?.includes('image'),
  //           supportsPromptCache: false,
  //           inputPrice: parsePrice(rawModel.pricing?.prompt),
  //           outputPrice: parsePrice(rawModel.pricing?.completion),
  //           description: rawModel.description
  //         }

  //         switch (rawModel.id) {
  //           case 'anthropic/claude-3-7-sonnet':
  //           case 'anthropic/claude-3-7-sonnet:beta':
  //           case 'anthropic/claude-3.7-sonnet':
  //           case 'anthropic/claude-3.7-sonnet:beta':
  //           case 'anthropic/claude-3.7-sonnet:thinking':
  //           case 'anthropic/claude-3.5-sonnet':
  //           case 'anthropic/claude-3.5-sonnet:beta':
  //             // NOTE: this needs to be synced with api.ts/openrouter default model info
  //             modelInfo.supportsPromptCache = true
  //             modelInfo.cacheWritesPrice = 3.75
  //             modelInfo.cacheReadsPrice = 0.3
  //             break
  //           case 'anthropic/claude-3.5-sonnet-20240620':
  //           case 'anthropic/claude-3.5-sonnet-20240620:beta':
  //             modelInfo.supportsPromptCache = true
  //             modelInfo.cacheWritesPrice = 3.75
  //             modelInfo.cacheReadsPrice = 0.3
  //             break
  //           case 'anthropic/claude-3-5-haiku':
  //           case 'anthropic/claude-3-5-haiku:beta':
  //           case 'anthropic/claude-3-5-haiku-20241022':
  //           case 'anthropic/claude-3-5-haiku-20241022:beta':
  //           case 'anthropic/claude-3.5-haiku':
  //           case 'anthropic/claude-3.5-haiku:beta':
  //           case 'anthropic/claude-3.5-haiku-20241022':
  //           case 'anthropic/claude-3.5-haiku-20241022:beta':
  //             modelInfo.supportsPromptCache = true
  //             modelInfo.cacheWritesPrice = 1.25
  //             modelInfo.cacheReadsPrice = 0.1
  //             break
  //           case 'anthropic/claude-3-opus':
  //           case 'anthropic/claude-3-opus:beta':
  //             modelInfo.supportsPromptCache = true
  //             modelInfo.cacheWritesPrice = 18.75
  //             modelInfo.cacheReadsPrice = 1.5
  //             break
  //           case 'anthropic/claude-3-haiku':
  //           case 'anthropic/claude-3-haiku:beta':
  //             modelInfo.supportsPromptCache = true
  //             modelInfo.cacheWritesPrice = 0.3
  //             modelInfo.cacheReadsPrice = 0.03
  //             break
  //           case 'deepseek/deepseek-chat':
  //             modelInfo.supportsPromptCache = true
  //             // see api.ts/deepSeekModels for more info
  //             modelInfo.inputPrice = 0
  //             modelInfo.cacheWritesPrice = 0.14
  //             modelInfo.cacheReadsPrice = 0.014
  //             break
  //           case 'google/gemini-2.5-pro-preview-03-25':
  //           case 'google/gemini-2.0-flash-001':
  //           case 'google/gemini-flash-1.5':
  //           case 'google/gemini-pro-1.5':
  //             modelInfo.supportsPromptCache = true
  //             modelInfo.cacheWritesPrice = parsePrice(rawModel.pricing?.input_cache_write)
  //             modelInfo.cacheReadsPrice = parsePrice(rawModel.pricing?.input_cache_read)
  //             break
  //         }

  //         models[rawModel.id] = modelInfo
  //       }
  //     } else {
  //       console.error('Invalid response from OpenRouter API')
  //     }
  //     await fs.writeFile(openRouterModelsFilePath, JSON.stringify(models))
  //     console.log('OpenRouter models fetched and saved', models)
  //   } catch (error) {
  //     console.error('Error fetching OpenRouter models:', error)
  //   }

  //   await this.postMessageToWebview({
  //     type: 'openRouterModels',
  //     openRouterModels: models
  //   })
  //   return models
  // }

  // async refreshRequestyModels() {
  //   const parsePrice = (price: any) => {
  //     if (price) {
  //       return parseFloat(price) * 1_000_000
  //     }
  //     return undefined
  //   }

  //   let models: Record<string, ModelInfo> = {}
  //   try {
  //     const apiKey = await getSecret('requestyApiKey')
  //     const headers = {
  //       Authorization: `Bearer ${apiKey}`
  //     }
  //     const response = await axios.get('https://router.requesty.ai/v1/models', { headers })
  //     if (response.data?.data) {
  //       for (const model of response.data.data) {
  //         const modelInfo: ModelInfo = {
  //           maxTokens: model.max_output_tokens || undefined,
  //           contextWindow: model.context_window,
  //           supportsImages: model.supports_vision || undefined,
  //           supportsPromptCache: model.supports_caching || undefined,
  //           inputPrice: parsePrice(model.input_price),
  //           outputPrice: parsePrice(model.output_price),
  //           cacheWritesPrice: parsePrice(model.caching_price),
  //           cacheReadsPrice: parsePrice(model.cached_price),
  //           description: model.description
  //         }
  //         models[model.id] = modelInfo
  //       }
  //       console.log('Requesty models fetched', models)
  //     } else {
  //       console.error('Invalid response from Requesty API')
  //     }
  //   } catch (error) {
  //     console.error('Error fetching Requesty models:', error)
  //   }

  //   await this.postMessageToWebview({
  //     type: 'requestyModels',
  //     requestyModels: models
  //   })
  //   return models
  // }

  // Context menus and code actions

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
    taskDirPath: string
    apiConversationHistoryFilePath: string
    uiMessagesFilePath: string
    contextHistoryFilePath: string
    taskMetadataFilePath: string
    apiConversationHistory: Anthropic.MessageParam[]
  }> {
    const history = ((await getGlobalState('taskHistory')) as HistoryItem[] | undefined) || []
    const historyItem = history.find((item) => item.id === id)
    if (historyItem) {
      const taskDirPath = path.join(this.context.globalStorageUri.fsPath, 'tasks', id)
      const apiConversationHistoryFilePath = path.join(
        taskDirPath,
        GlobalFileNames.apiConversationHistory
      )
      const uiMessagesFilePath = path.join(taskDirPath, GlobalFileNames.uiMessages)
      const contextHistoryFilePath = path.join(taskDirPath, GlobalFileNames.contextHistory)
      const taskMetadataFilePath = path.join(taskDirPath, GlobalFileNames.taskMetadata)
      const fileExists = await fileExistsAtPath(apiConversationHistoryFilePath)
      if (fileExists) {
        const apiConversationHistory = JSON.parse(
          await fs.readFile(apiConversationHistoryFilePath, 'utf8')
        )
        return {
          historyItem,
          taskDirPath,
          apiConversationHistoryFilePath,
          uiMessagesFilePath,
          contextHistoryFilePath,
          taskMetadataFilePath,
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

    try {
      if (id === this.task?.taskId) {
        await this.clearTask()
        console.debug('cleared task')
      }

      const {
        taskDirPath,
        apiConversationHistoryFilePath,
        uiMessagesFilePath,
        contextHistoryFilePath,
        taskMetadataFilePath
      } = await this.getTaskWithId(id)
      const legacyMessagesFilePath = path.join(taskDirPath, 'claude_messages.json')
      const updatedTaskHistory = await this.deleteTaskFromState(id)

      // Delete the task files
      for (const filePath of [
        apiConversationHistoryFilePath,
        uiMessagesFilePath,
        contextHistoryFilePath,
        taskMetadataFilePath,
        legacyMessagesFilePath
      ]) {
        const fileExists = await fileExistsAtPath(filePath)
        if (fileExists) {
          await fs.unlink(filePath)
        }
      }

      await fs.rmdir(taskDirPath) // succeeds if the dir is empty

      if (updatedTaskHistory.length === 0) {
        await this.deleteAllTaskHistory()
      }
    } catch (error) {
      console.debug(`Error deleting task:`, error)
    }

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

  // Caching mechanism to keep track of webview messages + API conversation history per provider instance

  /*
	Now that we use retainContextWhenHidden, we don't have to store a cache of cline messages in the user's state, but we could to reduce memory footprint in long conversations.

	- We have to be careful of what state is shared between ClineProvider instances since there could be multiple instances of the extension running at once. For example when we cached cline messages using the same key, two instances of the extension could end up using the same key and overwriting each other's messages.
	- Some state does need to be shared between the instances, i.e. the API key--however there doesn't seem to be a good way to notify the other instances that the API key has changed.

	We need to use a unique identifier for each ClineProvider instance's message cache since we could be running several instances of the extension outside of just the sidebar i.e. in editor panels.

	// conversation history to send in API requests

	/*
	It seems that some API messages do not comply with vscode state requirements. Either the Anthropic library is manipulating these values somehow in the backend in a way that's creating cyclic references, or the API returns a function or a Symbol as part of the message content.
	VSCode docs about state: "The value must be JSON-stringifyable ... value — A value. MUST not contain cyclic references."
	For now we'll store the conversation history in memory, and if we need to store in state directly we'd need to do a manual conversion to ensure proper json stringification.
	*/

  // getApiConversationHistory(): Anthropic.MessageParam[] {
  // 	// const history = (await this.getGlobalState(
  // 	// 	this.getApiConversationHistoryStateKey()
  // 	// )) as Anthropic.MessageParam[]
  // 	// return history || []
  // 	return this.apiConversationHistory
  // }

  // setApiConversationHistory(history: Anthropic.MessageParam[] | undefined) {
  // 	// await this.updateGlobalState(this.getApiConversationHistoryStateKey(), history)
  // 	this.apiConversationHistory = history || []
  // }

  // addMessageToApiConversationHistory(message: Anthropic.MessageParam): Anthropic.MessageParam[] {
  // 	// const history = await this.getApiConversationHistory()
  // 	// history.push(message)
  // 	// await this.setApiConversationHistory(history)
  // 	// return history
  // 	this.apiConversationHistory.push(message)
  // 	return this.apiConversationHistory
  // }

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

  // private async clearState() {
  // 	this.context.workspaceState.keys().forEach((key) => {
  // 		this.context.workspaceState.update(key, undefined)
  // 	})
  // 	this.context.globalState.keys().forEach((key) => {
  // 		this.context.globalState.update(key, undefined)
  // 	})
  // 	this.context.secrets.delete("apiKey")
  // }

  // secrets

  // Open Graph Data

  async fetchOpenGraphData(url: string) {
    try {
      // Use the fetchOpenGraphData function from link-preview.ts
      const ogData = await fetchOpenGraphData(url)

      // Send the data back to the webview
      await this.postMessageToWebview({
        type: 'openGraphData',
        openGraphData: ogData,
        url: url
      })
    } catch (error) {
      console.error(`Error fetching Open Graph data for ${url}:`, error)
      // Send an error response
      await this.postMessageToWebview({
        type: 'openGraphData',
        error: `Failed to fetch Open Graph data: ${error}`,
        url: url
      })
    }
  }

  // Check if a URL is an image
  // async checkIsImageUrl(url: string) {
  //   try {
  //     // Check if the URL is an image
  //     const isImage = await isImageUrl(url)

  //     // Send the result back to the webview
  //     await this.postMessageToWebview({
  //       type: 'isImageUrlResult',
  //       isImage,
  //       url
  //     })
  //   } catch (error) {
  //     console.error(`Error checking if URL is an image: ${url}`, error)
  //     // Send an error response
  //     await this.postMessageToWebview({
  //       type: 'isImageUrlResult',
  //       isImage: false,
  //       url
  //     })
  //   }
  // }

  // dev

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
