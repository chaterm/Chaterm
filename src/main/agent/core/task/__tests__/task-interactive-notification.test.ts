import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('electron', () => ({
  app: { getAppPath: () => '' },
  BrowserWindow: { fromWebContents: () => null },
  ipcMain: { handle: vi.fn(), on: vi.fn(), once: vi.fn(), removeAllListeners: vi.fn() },
  dialog: { showOpenDialog: vi.fn(async () => ({ canceled: true, filePaths: [] })) }
}))

vi.mock('@storage/db/chaterm.service', () => ({
  ChatermDatabaseService: { getInstance: vi.fn(async () => ({})) }
}))
vi.mock('@storage/database', () => ({ connectAssetInfo: vi.fn(async () => undefined) }))
vi.mock('@integrations/remote-terminal', () => ({
  RemoteTerminalManager: class {
    disposeAll = vi.fn()
  }
}))
vi.mock('@integrations/local-terminal', () => ({
  LocalTerminalManager: class {},
  LocalCommandProcess: class {}
}))
vi.mock('@services/telemetry/TelemetryService', () => ({ telemetryService: { captureTaskFeedback: vi.fn() } }))
vi.mock('@api/index', () => ({
  ApiHandler: class {},
  buildApiHandler: vi.fn(() => ({}))
}))
vi.mock('@integrations/notifications', () => ({ showSystemNotification: vi.fn() }))
vi.mock('@core/storage/state', () => ({
  getGlobalState: vi.fn(async (key?: string) => {
    if (key === 'chatSettings') {
      return { mode: 'agent' }
    }
    if (key === 'autoApprovalSettings') {
      return {
        version: 1,
        enabled: false,
        actions: {
          readFiles: false,
          editFiles: false,
          executeSafeCommands: false,
          executeAllCommands: false,
          autoExecuteReadOnlyCommands: false
        },
        maxRequests: 3,
        enableNotifications: false,
        favorites: []
      }
    }
    return undefined
  }),
  getUserConfig: vi.fn(async () => ({ language: 'en-US' }))
}))
vi.mock('../../services/todo_tool_call_tracker', () => ({
  TodoToolCallTracker: { recordToolCall: vi.fn(async () => undefined) }
}))

import { Task } from '../index'

describe('Task interactive command notification', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('does not send interactive_command_notification for interactive commands', async () => {
    const task = Object.create((Task as unknown as { prototype: object }).prototype) as any

    task.taskId = 'task-1'
    task.messages = { interactiveCommandNotification: 'placeholder' }
    task.autoApprovalSettings = {
      version: 1,
      enabled: false,
      actions: {
        readFiles: false,
        editFiles: false,
        executeSafeCommands: false,
        executeAllCommands: false,
        autoExecuteReadOnlyCommands: false
      },
      maxRequests: 3,
      enableNotifications: false,
      favorites: []
    }
    task.readOnlyCommandsAutoApproved = false
    task.consecutiveAutoApprovedRequestsCount = 0
    task.consecutiveMistakeCount = 0

    task.getToolDescription = vi.fn(() => '[execute_command for test]')
    task.performCommandSecurityCheck = vi.fn(async () => ({
      needsSecurityApproval: false,
      securityMessage: '',
      shouldReturn: false
    }))
    task.shouldAutoApproveTool = vi.fn(() => true)
    task.removeLastPartialMessageIfExistsWithType = vi.fn()
    task.say = vi.fn(async () => undefined)
    task.askApproval = vi.fn(async () => true)
    task.executeCommandTool = vi.fn(async () => '')
    task.pushToolResult = vi.fn()
    task.addTodoStatusUpdateReminder = vi.fn(async () => undefined)
    task.saveCheckpoint = vi.fn(async () => undefined)
    task.showNotificationIfNeeded = vi.fn()

    const block = {
      name: 'execute_command',
      params: {
        command: 'ls',
        ip: '127.0.0.1',
        requires_approval: 'false',
        interactive: 'true'
      },
      partial: false
    }

    await task.handleExecuteCommandToolUse(block)

    const interactiveCalls = (task.say as unknown as { mock: { calls: unknown[][] } }).mock.calls.filter(
      (call) => call[0] === 'interactive_command_notification'
    )
    expect(interactiveCalls).toHaveLength(0)
  })
})
