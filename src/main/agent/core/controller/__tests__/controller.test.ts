import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { WebviewMessage } from '@shared/WebviewMessage'

const { mockUpdateApiConfiguration, mockGetAllExtensionState, mockBuildApiHandler, mockGetGlobalState, mockUpdateGlobalState } = vi.hoisted(() => {
  return {
    mockUpdateApiConfiguration: vi.fn(),
    mockGetAllExtensionState: vi.fn(async () => ({
      apiConfiguration: { apiProvider: 'default', defaultModelId: 'mock', defaultBaseUrl: 'http://mock', defaultApiKey: 'mock' },
      userRules: [],
      autoApprovalSettings: {}
    })),
    mockBuildApiHandler: vi.fn(() => ({
      createMessage: () =>
        (async function* () {
          yield { type: 'text', text: '' }
        })()
    })),
    mockGetGlobalState: vi.fn(async () => undefined as unknown),
    mockUpdateGlobalState: vi.fn(async () => undefined)
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
    getUserConfig: vi.fn(async () => ({ language: 'zh-CN' }))
  }
})

vi.mock('@core/storage/disk', () => {
  return {
    ensureTaskExists: vi.fn(async () => 'task-id'),
    getSavedApiConversationHistory: vi.fn(async () => []),
    deleteChatermHistoryByTaskId: vi.fn(async () => undefined),
    getTaskMetadata: vi.fn(async () => ({})),
    saveTaskMetadata: vi.fn(async () => undefined),
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
      taskId: string
      api: unknown = null
      hosts: unknown[] = []
      cwd: Map<string, string> = new Map()
      abandoned = false
      didFinishAbortingStream = false
      isStreaming = false
      isWaitingForFirstChunk = false
      chatTitle = ''

      constructor(
        _updateTaskHistory: unknown,
        _postStateToWebview: unknown,
        _postMessageToWebview: unknown,
        _reinitExistingTaskFromId: unknown,
        _apiConfiguration: unknown,
        _autoApprovalSettings: unknown,
        hosts: unknown[],
        _mcpHub: unknown,
        _customInstructions?: unknown,
        _task?: unknown,
        historyItem?: { id: string },
        cwd?: Map<string, string>,
        chatTitle?: string,
        taskId?: string
      ) {
        this.taskId = historyItem?.id ?? taskId ?? 'mock-task'
        this.hosts = hosts
        this.cwd = cwd ?? new Map()
        this.chatTitle = chatTitle ?? ''
      }

      getTerminalManager() {
        return null
      }
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

  it('handleWebviewMessage(apiConfiguration) should update api handlers for all tasks', async () => {
    const controller = new Controller(
      async () => true,
      async () => '/tmp/mcp_settings.json'
    )

    await controller.initTask([createMockHost('1')], 'task 1', undefined, undefined, 't1')
    await controller.initTask([createMockHost('2')], 'task 2', undefined, undefined, 't2')

    const apiConfiguration = {
      apiProvider: 'default',
      defaultModelId: 'mock',
      defaultBaseUrl: 'http://mock',
      defaultApiKey: 'mock'
    }

    const tasksBefore = controller.getAllTasks()
    const apisBefore = tasksBefore.map((t) => t.api)

    await controller.handleWebviewMessage({ type: 'apiConfiguration', apiConfiguration } as any)

    expect(mockUpdateApiConfiguration).toHaveBeenCalledWith(apiConfiguration)
    expect(mockBuildApiHandler).toHaveBeenCalled()
    const tasksAfter = controller.getAllTasks()
    tasksAfter.forEach((task, index) => {
      expect(task.api).not.toBe(apisBefore[index])
    })
  })

  it('getAllTasks should return all tasks as an array', async () => {
    const controller = new Controller(
      async () => true,
      async () => '/tmp/mcp_settings.json'
    )

    await controller.initTask([createMockHost('1')], 'task 1', undefined, undefined, 'task-1')
    await controller.initTask([createMockHost('2')], 'task 2', undefined, undefined, 'task-2')

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

    await controller.initTask([createMockHost('1')], 'task 1', undefined, undefined, 'task-1')
    await controller.initTask([createMockHost('2')], 'task 2', undefined, undefined, 'task-2')

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

    await controller.initTask([createMockHost('1')], 'task 1', undefined, undefined, 'task-1')
    await controller.initTask([createMockHost('2')], 'task 2', undefined, undefined, 'task-2')

    expect(controller.getAllTasks()).toHaveLength(2)

    await controller.clearTask()

    expect(controller.getAllTasks()).toHaveLength(0)
  })

  it('updateTaskHistory should update existing history item', async () => {
    const existingHistory = [{ id: 'task-1', task: 'old task', chatTitle: 'Old Title', ts: 123, tokensIn: 10, tokensOut: 20, totalCost: 0.5 }]
    mockGetGlobalState.mockResolvedValueOnce(existingHistory as never)

    const controller = new Controller(
      async () => true,
      async () => '/tmp/mcp_settings.json'
    )

    await controller.updateTaskHistory({ id: 'task-1', chatTitle: 'New Title' })

    expect(mockUpdateGlobalState).toHaveBeenCalledWith(
      'taskHistory',
      expect.arrayContaining([
        expect.objectContaining({
          id: 'task-1',
          chatTitle: 'New Title',
          task: 'old task'
        })
      ])
    )
  })

  it('updateTaskHistory should not override chatTitle if new title is empty', async () => {
    const existingHistory = [{ id: 'task-1', task: 'old task', chatTitle: 'Old Title', ts: 123, tokensIn: 10, tokensOut: 20, totalCost: 0.5 }]
    mockGetGlobalState.mockResolvedValueOnce(existingHistory as never)

    const controller = new Controller(
      async () => true,
      async () => '/tmp/mcp_settings.json'
    )

    await controller.updateTaskHistory({ id: 'task-1', chatTitle: '  ' })

    expect(mockUpdateGlobalState).toHaveBeenCalledWith(
      'taskHistory',
      expect.arrayContaining([
        expect.objectContaining({
          id: 'task-1',
          chatTitle: 'Old Title'
        })
      ])
    )
  })

  it('updateTaskHistory should throw error when adding new item without required fields', async () => {
    mockGetGlobalState.mockResolvedValueOnce([] as never)

    const controller = new Controller(
      async () => true,
      async () => '/tmp/mcp_settings.json'
    )

    await expect(controller.updateTaskHistory({ id: 'new-task' })).rejects.toThrow('New history item must include all required fields')
  })

  it('deleteTaskFromState should remove task from history', async () => {
    const existingHistory = [
      { id: 'task-1', task: 'task 1' },
      { id: 'task-2', task: 'task 2' }
    ]
    mockGetGlobalState.mockResolvedValueOnce(existingHistory as never)

    const controller = new Controller(
      async () => true,
      async () => '/tmp/mcp_settings.json'
    )

    const result = await controller.deleteTaskFromState('task-1')

    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('task-2')
    expect(mockUpdateGlobalState).toHaveBeenCalledWith('taskHistory', result)
  })

  it('handleWebviewMessage(askResponse) should handle ask response for task', async () => {
    const controller = new Controller(
      async () => true,
      async () => '/tmp/mcp_settings.json'
    )

    await controller.initTask([createMockHost('1')], 'task 1', undefined, undefined, 'task-1')

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
    expect(handleResponseSpy).toHaveBeenCalledWith('messageResponse', 'response text', undefined)
  })

  it('reloadSecurityConfigForAllTasks should reload config for all tasks', async () => {
    const controller = new Controller(
      async () => true,
      async () => '/tmp/mcp_settings.json'
    )

    await controller.initTask([createMockHost('1')], 'task 1', undefined, undefined, 'task-1')
    await controller.initTask([createMockHost('2')], 'task 2', undefined, undefined, 'task-2')

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

    await controller.initTask([createMockHost('1')], 'task 1', undefined, undefined, 'task-1')
    await controller.initTask([createMockHost('2')], 'task 2', undefined, undefined, 'task-2')

    const tasks = controller.getAllTasks()
    const spy1 = vi.spyOn(tasks[0], 'reloadSecurityConfig').mockRejectedValue(new Error('Reload failed'))
    const spy2 = vi.spyOn(tasks[1], 'reloadSecurityConfig')

    await controller.reloadSecurityConfigForAllTasks()

    expect(spy1).toHaveBeenCalled()
    expect(spy2).toHaveBeenCalled()
  })
})
