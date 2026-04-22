import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { WebviewMessage } from '@shared/WebviewMessage'

/** Mock api handler shape used in tests; getModel is a vi.fn() so we can mockReturnValue. */
type MockTaskApi = { createMessage: unknown; getModel: ReturnType<typeof vi.fn> }

function getMockGetModel(task: { api: unknown }): ReturnType<typeof vi.fn> {
  return (task.api as MockTaskApi).getModel
}

const {
  mockUpdateApiConfiguration,
  mockGetAllExtensionState,
  mockBuildApiHandler,
  mockGetGlobalState,
  mockUpdateGlobalState,
  mockGetUserConfig,
  mockGetModelOptions
} = vi.hoisted(() => {
  const createMockApiHandler = (modelId: string) => ({
    createMessage: () =>
      (async function* () {
        yield { type: 'text', text: '' }
      })(),
    getModel: vi.fn(() => ({ id: modelId }))
  })
  return {
    mockUpdateApiConfiguration: vi.fn(),
    mockGetAllExtensionState: vi.fn(async () => ({
      apiConfiguration: { apiProvider: 'default', defaultModelId: 'mock', defaultBaseUrl: 'http://mock', defaultApiKey: 'mock' },
      userRules: [],
      autoApprovalSettings: {}
    })),
    mockBuildApiHandler: vi.fn(() => createMockApiHandler('mock')),
    mockGetGlobalState: vi.fn(async () => undefined as unknown),
    mockUpdateGlobalState: vi.fn(async () => undefined),
    mockGetUserConfig: vi.fn(async () => ({ language: 'zh-CN' })),
    mockGetModelOptions: vi.fn(async () => [
      { id: 'm1', name: 'model-A', checked: true, type: 'chat', apiProvider: 'anthropic' },
      { id: 'm2', name: 'model-B', checked: true, type: 'chat', apiProvider: 'anthropic' },
      { id: 'm3', name: 'model-C', checked: true, type: 'chat', apiProvider: 'openai' }
    ])
  }
})

// Mock McpHub to avoid filesystem/network side-effects in Controller constructor
vi.mock('@services/mcp/McpHub', () => {
  return {
    McpHub: class {
      dispose = vi.fn()
    }
  }
})

vi.mock('@services/telemetry/TelemetryService', () => {
  return {
    telemetryService: {
      captureTaskFeedback: vi.fn(),
      updateTelemetryState: vi.fn(),
      captureAppFirstLaunch: vi.fn(),
      captureAppStarted: vi.fn()
    }
  }
})

vi.mock('@core/storage/state', () => {
  return {
    getAllExtensionState: mockGetAllExtensionState,
    getGlobalState: mockGetGlobalState,
    updateApiConfiguration: mockUpdateApiConfiguration,
    updateGlobalState: mockUpdateGlobalState,
    getUserConfig: mockGetUserConfig,
    getModelOptions: mockGetModelOptions
  }
})

vi.mock('@core/storage/disk', () => {
  return {
    ensureTaskExists: vi.fn(async () => 'task-id'),
    getSavedApiConversationHistory: vi.fn(async () => []),
    deleteChatermHistoryByTaskId: vi.fn(async () => undefined),
    getTaskMetadata: vi.fn(async () => ({})),
    saveTaskMetadata: vi.fn(async () => undefined),
    saveTaskTitle: vi.fn(async () => undefined),
    ensureTaskMetadataExists: vi.fn(async () => undefined),
    ensureMcpServersDirectoryExists: vi.fn(async () => undefined)
  }
})

vi.mock('@api/index', async () => {
  const actual = await vi.importActual('@api/index')
  return {
    ...actual,
    buildApiHandler: mockBuildApiHandler
  }
})

// Mock Task to avoid pulling in the full Task implementation
vi.mock('@core/task', () => {
  return {
    Task: class {
      static clearCommandContextsForTask = vi.fn()

      taskId: string
      api: { createMessage: () => AsyncGenerator; getModel: () => { id: string } } = null!
      hosts: unknown[] = []
      cwd: Map<string, string> = new Map()
      abandoned = false
      didFinishAbortingStream = false
      isStreaming = false
      isWaitingForFirstChunk = false
      chatTitle = ''

      constructor(
        _postStateToWebview: unknown,
        _postMessageToWebview: unknown,
        _reinitExistingTaskFromId: unknown,
        _apiConfiguration: unknown,
        _autoApprovalSettings: unknown,
        hosts: unknown[],
        _mcpHub: unknown,
        _skillsManager?: unknown,
        _customInstructions?: unknown,
        _task?: unknown,
        chatTitle?: string,
        taskId?: string
      ) {
        this.taskId = taskId ?? 'mock-task'
        this.hosts = hosts
        this.chatTitle = chatTitle ?? ''
        // api is set by Controller after construction via buildApiHandler
        this.api = {
          createMessage: () =>
            (async function* () {
              yield { type: 'text', text: '' }
            })(),
          getModel: vi.fn(() => ({ id: 'mock' }))
        }
      }

      getTerminalManager() {
        return null
      }
      setApiProvider = vi.fn()
      abortTask = vi.fn(async () => undefined)
      gracefulAbortTask = vi.fn(async () => undefined)
      clearTodos = vi.fn(async () => undefined)
      reloadSecurityConfig = vi.fn(async () => undefined)
      handleWebviewAskResponse = vi.fn(async () => undefined)
    }
  }
})

import { Controller } from '../index'
import type { Host } from '@shared/WebviewMessage'

// Test helper: 创建测试用的 Host 对象
// 当 Host 类型定义变更时，只需修改这个函数
function createMockHost(id: string): Host {
  return {
    host: `host-${id}`,
    uuid: `uuid-${id}`,
    connection: 'test-connection'
  }
}

describe('Controller', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetUserConfig.mockResolvedValue({ language: 'zh-CN' })
  })

  it('buildExplainCommandPrompt should return professional zh-CN prompt', async () => {
    const controller = new Controller(
      async () => true,
      async () => '/tmp/mcp_settings.json'
    )

    // Access private method for unit testing prompt content
    const prompt = (controller as any).buildExplainCommandPrompt('zh-CN') as string
    expect(prompt).toContain('命令行技术文档专家')
    expect(prompt).toContain('技术文档')
    expect(prompt).toContain('不要重复命令本身')
  })

  it('buildExplainCommandPrompt should return professional zh-TW prompt', async () => {
    const controller = new Controller(
      async () => true,
      async () => '/tmp/mcp_settings.json'
    )

    // Access private method for unit testing prompt content
    const prompt = (controller as any).buildExplainCommandPrompt('zh-TW') as string
    expect(prompt).toContain('命令行技術文檔專家')
    expect(prompt).toContain('技術文檔')
    expect(prompt).toContain('不要重複命令本身')
  })

  it('buildExplainCommandPrompt should return professional prompt for other languages', async () => {
    const controller = new Controller(
      async () => true,
      async () => '/tmp/mcp_settings.json'
    )

    // Access private method for unit testing prompt content
    const prompt = (controller as any).buildExplainCommandPrompt('en-US') as string
    expect(prompt).toContain('CLI technical documentation expert')
    expect(prompt).toContain('technical, accurate, and concise')
    expect(prompt).toContain('Do not repeat the command')
    expect(prompt).toContain('Answer in English')
  })

  it('postMessageToWebview should mask sensitive fields', async () => {
    const posted: unknown[] = []
    const postMessage = async (msg: unknown) => {
      posted.push(msg)
      return true
    }

    const controller = new Controller(postMessage, async () => '/tmp/mcp_settings.json')

    await controller.postMessageToWebview({
      type: 'state',
      state: {
        awsAccessKey: 'AKIAxxx',
        awsSecretKey: 'SECRET',
        endpoint: 'https://example.com',
        awsProfile: 'prod',
        nested: { awsSecretKey: 'SECRET2' },
        ok: 'keep'
      }
    } as any)

    expect(posted).toHaveLength(1)
    const payload = posted[0] as any
    expect(payload.state.ok).toBe('keep')
    expect(payload.state.awsAccessKey).toBeUndefined()
    expect(payload.state.awsSecretKey).toBeUndefined()
    expect(payload.state.endpoint).toBeUndefined()
    expect(payload.state.awsProfile).toBeUndefined()
    expect(payload.state.nested.awsSecretKey).toBeUndefined()
  })

  it('getAllTasks should return all tasks as an array', async () => {
    const controller = new Controller(
      async () => true,
      async () => '/tmp/mcp_settings.json'
    )

    await controller.initTask([createMockHost('1')], 'task 1', 'task-1')
    await controller.initTask([createMockHost('2')], 'task 2', 'task-2')

    const result = controller.getAllTasks()
    expect(result).toHaveLength(2)
    expect(result[0].taskId).toBe('task-1')
    expect(result[1].taskId).toBe('task-2')
  })

  it('clearTask should remove specific task when taskId is provided', async () => {
    const controller = new Controller(
      async () => true,
      async () => '/tmp/mcp_settings.json'
    )

    await controller.initTask([createMockHost('1')], 'task 1', 'task-1')
    await controller.initTask([createMockHost('2')], 'task 2', 'task-2')

    expect(controller.getAllTasks()).toHaveLength(2)

    await controller.clearTask('task-1')

    const remainingTasks = controller.getAllTasks()
    expect(remainingTasks).toHaveLength(1)
    expect(remainingTasks[0].taskId).toBe('task-2')
  })

  it('clearTask should remove all tasks when taskId is not provided', async () => {
    const controller = new Controller(
      async () => true,
      async () => '/tmp/mcp_settings.json'
    )

    await controller.initTask([createMockHost('1')], 'task 1', 'task-1')
    await controller.initTask([createMockHost('2')], 'task 2', 'task-2')

    expect(controller.getAllTasks()).toHaveLength(2)

    await controller.clearTask()

    expect(controller.getAllTasks()).toHaveLength(0)
  })

  // updateTaskHistory and deleteTaskFromState tests removed - methods retired in task metadata migration

  it('handleWebviewMessage(askResponse) should handle ask response for task', async () => {
    const controller = new Controller(
      async () => true,
      async () => '/tmp/mcp_settings.json'
    )

    await controller.initTask([createMockHost('1')], 'task 1', 'task-1')

    const tasks = controller.getAllTasks()
    const task = tasks.find((t) => t.taskId === 'task-1')
    expect(task).toBeDefined()

    const clearTodosSpy = vi.spyOn(task!, 'clearTodos')
    const handleResponseSpy = vi.spyOn(task!, 'handleWebviewAskResponse')

    await controller.handleWebviewMessage({
      type: 'askResponse',
      taskId: 'task-1',
      askResponse: 'messageResponse',
      text: 'response text'
    } as WebviewMessage)

    expect(clearTodosSpy).toHaveBeenCalledWith('new_user_input')
    expect(handleResponseSpy).toHaveBeenCalledWith('messageResponse', 'response text', undefined, undefined)
  })

  it('reloadSecurityConfigForAllTasks should reload config for all tasks', async () => {
    const controller = new Controller(
      async () => true,
      async () => '/tmp/mcp_settings.json'
    )

    await controller.initTask([createMockHost('1')], 'task 1', 'task-1')
    await controller.initTask([createMockHost('2')], 'task 2', 'task-2')

    const tasks = controller.getAllTasks()
    const spy1 = vi.spyOn(tasks[0], 'reloadSecurityConfig')
    const spy2 = vi.spyOn(tasks[1], 'reloadSecurityConfig')

    await controller.reloadSecurityConfigForAllTasks()

    expect(spy1).toHaveBeenCalled()
    expect(spy2).toHaveBeenCalled()
  })

  it('reloadSecurityConfigForAllTasks should continue even if one task fails', async () => {
    const controller = new Controller(
      async () => true,
      async () => '/tmp/mcp_settings.json'
    )

    await controller.initTask([createMockHost('1')], 'task 1', 'task-1')
    await controller.initTask([createMockHost('2')], 'task 2', 'task-2')

    const tasks = controller.getAllTasks()
    const spy1 = vi.spyOn(tasks[0], 'reloadSecurityConfig').mockRejectedValue(new Error('Reload failed'))
    const spy2 = vi.spyOn(tasks[1], 'reloadSecurityConfig')

    await controller.reloadSecurityConfigForAllTasks()

    expect(spy1).toHaveBeenCalled()
    expect(spy2).toHaveBeenCalled()
  })

  it('handleAiSuggestCommand should return command with Chinese explanation for zh clients', async () => {
    const createMessage = vi.fn().mockImplementationOnce(() =>
      (async function* () {
        yield { type: 'text', text: 'CMD: ls -la\nEXP: 列出目录详细信息（含隐藏文件）' }
      })()
    )

    mockBuildApiHandler.mockReturnValue({
      createMessage,
      getModel: vi.fn(() => ({ id: 'mock' }))
    })

    const controller = new Controller(
      async () => true,
      async () => '/tmp/mcp_settings.json'
    )

    const result = await controller.handleAiSuggestCommand('ls -')

    expect(result).toEqual({
      command: 'ls -la',
      explanation: '列出目录详细信息（含隐藏文件）'
    })
    expect(createMessage).toHaveBeenCalledTimes(1)
    expect(createMessage.mock.calls[0][0]).toContain('Chinese')
  })

  it('handleAiSuggestCommand should return command with English explanation for non-zh clients', async () => {
    mockGetUserConfig.mockResolvedValueOnce({ language: 'fr-FR' })
    const createMessage = vi.fn().mockImplementationOnce(() =>
      (async function* () {
        yield { type: 'text', text: 'CMD: find . -name *.log\nEXP: Find log files recursively' }
      })()
    )

    mockBuildApiHandler.mockReturnValue({
      createMessage,
      getModel: vi.fn(() => ({ id: 'mock' }))
    })

    const controller = new Controller(
      async () => true,
      async () => '/tmp/mcp_settings.json'
    )

    const result = await controller.handleAiSuggestCommand('find ')

    expect(result).toEqual({
      command: 'find . -name *.log',
      explanation: 'Find log files recursively'
    })
    expect(createMessage).toHaveBeenCalledTimes(1)
    expect(createMessage.mock.calls[0][0]).toContain('English')
  })

  it('handleAiSuggestCommand should truncate overly long explanation for compact UI display', async () => {
    mockGetUserConfig.mockResolvedValueOnce({ language: 'en-US' })
    const createMessage = vi.fn().mockImplementationOnce(() =>
      (async function* () {
        yield {
          type: 'text',
          text: 'CMD: grep -R "TODO" .\nEXP: Recursively searches all files under the current directory and prints every line that contains TODO for quick code review.'
        }
      })()
    )

    mockBuildApiHandler.mockReturnValue({
      createMessage,
      getModel: vi.fn(() => ({ id: 'mock' }))
    })

    const controller = new Controller(
      async () => true,
      async () => '/tmp/mcp_settings.json'
    )

    const result = await controller.handleAiSuggestCommand('grep ')

    expect(result?.command).toBe('grep -R "TODO" .')
    expect(result?.explanation.endsWith('...')).toBe(true)
    expect((result?.explanation ?? '').length).toBeLessThanOrEqual(63)
  })

  describe('handleWebviewMessage(askResponse) model switching', () => {
    it('should not call buildApiHandler when modelName is unchanged (short-circuit)', async () => {
      const controller = new Controller(
        async () => true,
        async () => '/tmp/mcp_settings.json'
      )
      await controller.initTask([createMockHost('1')], 'task 1', 'task-1')

      const tasks = controller.getAllTasks()
      const task = tasks.find((t) => t.taskId === 'task-1')!
      getMockGetModel(task).mockReturnValue({ id: 'model-A' })

      mockBuildApiHandler.mockClear()
      mockGetAllExtensionState.mockClear()

      await controller.handleWebviewMessage({
        type: 'askResponse',
        taskId: 'task-1',
        askResponse: 'messageResponse',
        modelName: 'model-A'
      } as WebviewMessage)

      expect(mockGetAllExtensionState).not.toHaveBeenCalled()
      expect(mockBuildApiHandler).not.toHaveBeenCalled()
    })

    it('should update only target task api when modelName changes in same task', async () => {
      const controller = new Controller(
        async () => true,
        async () => '/tmp/mcp_settings.json'
      )
      await controller.initTask([createMockHost('1')], 'task 1', 'task-1')

      const tasks = controller.getAllTasks()
      const task = tasks.find((t) => t.taskId === 'task-1')!
      getMockGetModel(task).mockReturnValue({ id: 'model-A' })

      const newHandler = {
        createMessage: vi.fn(),
        getModel: vi.fn(() => ({ id: 'model-B' }))
      }
      mockBuildApiHandler.mockReturnValue(newHandler)

      await controller.handleWebviewMessage({
        type: 'askResponse',
        taskId: 'task-1',
        askResponse: 'messageResponse',
        modelName: 'model-B'
      } as WebviewMessage)

      expect(mockGetAllExtensionState).toHaveBeenCalled()
      expect(mockGetModelOptions).toHaveBeenCalled()
      expect(mockBuildApiHandler).toHaveBeenCalled()
      expect(task.api).toBe(newHandler)
      expect(task.setApiProvider).toHaveBeenCalledWith('anthropic')
    })

    it('should not update api when modelName is empty or whitespace', async () => {
      const controller = new Controller(
        async () => true,
        async () => '/tmp/mcp_settings.json'
      )
      await controller.initTask([createMockHost('1')], 'task 1', 'task-1')

      const task = controller.getAllTasks().find((t) => t.taskId === 'task-1')!
      getMockGetModel(task).mockReturnValue({ id: 'model-A' })
      mockBuildApiHandler.mockClear()
      mockGetAllExtensionState.mockClear()

      await controller.handleWebviewMessage({
        type: 'askResponse',
        taskId: 'task-1',
        askResponse: 'messageResponse',
        modelName: ''
      } as WebviewMessage)

      await controller.handleWebviewMessage({
        type: 'askResponse',
        taskId: 'task-1',
        askResponse: 'messageResponse',
        modelName: '   '
      } as WebviewMessage)

      expect(mockGetAllExtensionState).not.toHaveBeenCalled()
      expect(mockBuildApiHandler).not.toHaveBeenCalled()
    })

    it('when targetTask.api.getModel() throws, error should propagate', async () => {
      const controller = new Controller(
        async () => true,
        async () => '/tmp/mcp_settings.json'
      )
      await controller.initTask([createMockHost('1')], 'task 1', 'task-1')

      const task = controller.getAllTasks().find((t) => t.taskId === 'task-1')!
      getMockGetModel(task).mockImplementation(() => {
        throw new Error('getModel failed')
      })

      await expect(
        controller.handleWebviewMessage({
          type: 'askResponse',
          taskId: 'task-1',
          askResponse: 'messageResponse',
          modelName: 'model-B'
        } as WebviewMessage)
      ).rejects.toThrow('getModel failed')
    })

    it('when getAllExtensionState returns no apiConfiguration, should not update task api', async () => {
      const controller = new Controller(
        async () => true,
        async () => '/tmp/mcp_settings.json'
      )
      await controller.initTask([createMockHost('1')], 'task 1', 'task-1')

      const task = controller.getAllTasks().find((t) => t.taskId === 'task-1')!
      getMockGetModel(task).mockReturnValue({ id: 'model-A' })
      const apiBefore = task.api
      mockBuildApiHandler.mockClear()
      // Second getAllExtensionState call is from askResponse; first was from initTask
      mockGetAllExtensionState.mockResolvedValueOnce({
        apiConfiguration: undefined,
        userRules: [],
        autoApprovalSettings: {}
      } as unknown as Awaited<ReturnType<typeof mockGetAllExtensionState>>)

      await controller.handleWebviewMessage({
        type: 'askResponse',
        taskId: 'task-1',
        askResponse: 'messageResponse',
        modelName: 'model-B'
      } as WebviewMessage)

      expect(mockBuildApiHandler).not.toHaveBeenCalled()
      expect(task.api).toBe(apiBefore)
    })

    it('when modelName not in model options, buildApiConfigurationForModel returns base and handler is still updated', async () => {
      mockGetModelOptions.mockResolvedValueOnce([{ id: 'm1', name: 'model-A', checked: true, type: 'chat', apiProvider: 'anthropic' }])
      const controller = new Controller(
        async () => true,
        async () => '/tmp/mcp_settings.json'
      )
      await controller.initTask([createMockHost('1')], 'task 1', 'task-1')

      const task = controller.getAllTasks().find((t) => t.taskId === 'task-1')!
      getMockGetModel(task).mockReturnValue({ id: 'model-A' })

      const baseConfig = { apiProvider: 'default', defaultModelId: 'mock', defaultBaseUrl: 'http://mock', defaultApiKey: 'mock' }
      mockGetAllExtensionState.mockResolvedValueOnce({
        apiConfiguration: baseConfig,
        userRules: [],
        autoApprovalSettings: {}
      })

      const newHandler = { createMessage: vi.fn(), getModel: vi.fn(() => ({ id: 'unknown' })) }
      mockBuildApiHandler.mockReturnValue(newHandler)

      await controller.handleWebviewMessage({
        type: 'askResponse',
        taskId: 'task-1',
        askResponse: 'messageResponse',
        modelName: 'non-existent-model'
      } as WebviewMessage)

      expect(mockBuildApiHandler).toHaveBeenCalledWith(baseConfig)
      expect(task.api).toBe(newHandler)
    })

    it('different tasks can have different models; askResponse only updates the target task', async () => {
      const controller = new Controller(
        async () => true,
        async () => '/tmp/mcp_settings.json'
      )
      await controller.initTask([createMockHost('1')], 'task 1', 'task-1')
      await controller.initTask([createMockHost('2')], 'task 2', 'task-2')

      const tasks = controller.getAllTasks()
      const task1 = tasks.find((t) => t.taskId === 'task-1')!
      const task2 = tasks.find((t) => t.taskId === 'task-2')!
      getMockGetModel(task1).mockReturnValue({ id: 'model-A' })
      getMockGetModel(task2).mockReturnValue({ id: 'model-B' })

      const newHandlerForTask1 = {
        createMessage: vi.fn(),
        getModel: vi.fn(() => ({ id: 'model-C' }))
      }
      mockBuildApiHandler.mockReturnValue(newHandlerForTask1)

      await controller.handleWebviewMessage({
        type: 'askResponse',
        taskId: 'task-1',
        askResponse: 'messageResponse',
        modelName: 'model-C'
      } as WebviewMessage)

      expect(task1.api).toBe(newHandlerForTask1)
      expect(task2.api).not.toBe(newHandlerForTask1)
      expect(task2.api.getModel()).toEqual({ id: 'model-B' })
    })

    it('multiple tasks in parallel: switching model in one task does not affect the other', async () => {
      const controller = new Controller(
        async () => true,
        async () => '/tmp/mcp_settings.json'
      )
      await controller.initTask([createMockHost('1')], 'task 1', 'task-1')
      await controller.initTask([createMockHost('2')], 'task 2', 'task-2')

      const tasks = controller.getAllTasks()
      const task1 = tasks.find((t) => t.taskId === 'task-1')!
      const task2 = tasks.find((t) => t.taskId === 'task-2')!
      const api2Before = task2.api
      getMockGetModel(task1).mockReturnValue({ id: 'model-A' })
      getMockGetModel(task2).mockReturnValue({ id: 'model-B' })

      mockBuildApiHandler.mockReturnValue({
        createMessage: vi.fn(),
        getModel: vi.fn(() => ({ id: 'model-C' }))
      })

      await controller.handleWebviewMessage({
        type: 'askResponse',
        taskId: 'task-1',
        askResponse: 'messageResponse',
        modelName: 'model-C'
      } as WebviewMessage)

      expect(task1.api.getModel()).toEqual({ id: 'model-C' })
      expect(task2.api).toBe(api2Before)
      expect(task2.api.getModel()).toEqual({ id: 'model-B' })
    })
  })
})
