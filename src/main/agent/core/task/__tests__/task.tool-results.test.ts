import { beforeEach, describe, expect, it, vi } from 'vitest'

const { shouldOffloadMock, writeToolOutputMock, saveApiConversationHistoryMock } = vi.hoisted(() => ({
  shouldOffloadMock: vi.fn(() => false),
  writeToolOutputMock: vi.fn(async () => ({ relativePath: 'tool/out.txt', size: 128 })),
  saveApiConversationHistoryMock: vi.fn(async () => undefined)
}))

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
vi.mock('../../../../ssh/agentHandle', () => ({
  remoteSshConnect: vi.fn(),
  remoteSshDisconnect: vi.fn(),
  isWakeupSession: vi.fn().mockReturnValue(false),
  openWakeupShell: vi.fn(),
  findWakeupConnectionInfoByHost: vi.fn().mockReturnValue(null)
}))
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
vi.mock('@core/storage/disk', () => ({
  getSavedApiConversationHistory: vi.fn(async () => []),
  getChatermMessages: vi.fn(async () => []),
  saveApiConversationHistory: saveApiConversationHistoryMock,
  saveChatermMessages: vi.fn(async () => undefined),
  touchTaskUpdatedAt: vi.fn(async () => undefined)
}))
vi.mock('../../offload', () => ({
  getOffloadDir: vi.fn(() => '/tmp/offload'),
  shouldOffload: shouldOffloadMock,
  writeToolOutput: writeToolOutputMock
}))

import { Task } from '../index'

describe('Task tool result helpers', () => {
  let task: any

  beforeEach(() => {
    vi.clearAllMocks()
    shouldOffloadMock.mockReturnValue(false)
    writeToolOutputMock.mockResolvedValue({ relativePath: 'tool/out.txt', size: 128 })

    task = Object.create((Task as unknown as { prototype: object }).prototype) as any
    task.taskId = 'task-tool-result'
    task.pendingToolResults = []
    task.apiConversationHistory = []
    task.chatermMessages = []
    task.userMessageContent = []
    task.messages = { userProvidedFeedback: 'feedback: {feedback}' }
    task.truncateCommandOutput = vi.fn((s: string) => s.trim())
    task.responseFormatter = {
      toolError: (msg: string) => `[ERROR] ${msg}`,
      toolDenied: () => 'The user denied this operation.',
      toolResult: (msg: string) => msg,
      toolAlreadyUsed: (name: string) => `Tool [${name}] was already used.`
    }
  })

  it('pushToolResult should store inline string result and lineCount', async () => {
    await task.pushToolResult('[grep_search]', 'line1\nline2')

    expect(task.pendingToolResults).toHaveLength(1)
    expect(task.pendingToolResults[0]).toEqual(
      expect.objectContaining({
        toolDescription: '[grep_search]',
        taskId: 'task-tool-result',
        result: 'line1\nline2',
        lineCount: 2,
        docPath: undefined
      })
    )
    expect(task.didAlreadyUseTool).toBe(true)
  })

  it('pushToolResult should offload large output when shouldOffload=true', async () => {
    shouldOffloadMock.mockReturnValue(true)

    await task.pushToolResult('[read_file]', 'a very long content')

    expect(writeToolOutputMock).toHaveBeenCalledWith('task-tool-result', '[read_file]', 'a very long content')
    expect(task.pendingToolResults[0]).toEqual(
      expect.objectContaining({
        docPath: '@offload/tool/out.txt',
        size: 128,
        result: 'Offloaded output to @offload/tool/out.txt'
      })
    )
  })

  it('pushToolResult should support content block array', async () => {
    await task.pushToolResult('[tool]', [
      { type: 'text', text: 'alpha' },
      { type: 'text', text: 'beta' }
    ])

    expect(task.pendingToolResults[0].result).toBe('alpha\nbeta')
    expect(task.pendingToolResults[0].lineCount).toBe(2)
  })

  it('clearEphemeralToolResults should replace ephemeral content and persist', async () => {
    task.apiConversationHistory = [
      {
        role: 'user',
        content: [
          {
            type: 'tool_result',
            content: JSON.stringify({
              toolName: 'read_file',
              toolDescription: '[read_file]',
              taskId: 'task-tool-result',
              timestamp: 1,
              ephemeral: true,
              result: 'secret'
            })
          }
        ]
      }
    ]

    await task.clearEphemeralToolResults()

    const updated = JSON.parse(task.apiConversationHistory[0].content[0].content)
    expect(updated.result).toBe('(expired)')
    expect(saveApiConversationHistoryMock).toHaveBeenCalledWith('task-tool-result', task.apiConversationHistory)
  })

  it('askApproval should mark didRejectTool and keep user feedback when denied', async () => {
    task.ask = vi.fn().mockResolvedValue({
      response: 'noButtonClicked',
      text: 'deny reason',
      contentParts: [{ type: 'text', text: 'deny' }]
    })
    task.pushToolResult = vi.fn().mockResolvedValue(undefined)
    task.pushAdditionalToolFeedback = vi.fn().mockResolvedValue(undefined)
    task.saveUserMessage = vi.fn().mockResolvedValue(undefined)
    task.saveCheckpoint = vi.fn().mockResolvedValue(undefined)

    const approved = await task.askApproval('[execute_command]', 'command', 'ls')

    expect(approved).toBe(false)
    expect(task.didRejectTool).toBe(true)
    expect(task.pushToolResult).toHaveBeenCalledTimes(1)
    expect(task.pushAdditionalToolFeedback).toHaveBeenCalledWith('deny reason')
    expect(task.saveUserMessage).toHaveBeenCalledWith('deny reason', [{ type: 'text', text: 'deny' }])
    expect(task.saveCheckpoint).toHaveBeenCalledTimes(1)
  })

  it('askApproval should enable readOnly auto-approve when requested', async () => {
    task.ask = vi.fn().mockResolvedValue({
      response: 'autoApproveReadOnlyClicked',
      text: 'continue',
      contentParts: [{ type: 'text', text: 'continue' }]
    })
    task.pushToolResult = vi.fn().mockResolvedValue(undefined)
    task.pushAdditionalToolFeedback = vi.fn().mockResolvedValue(undefined)
    task.saveUserMessage = vi.fn().mockResolvedValue(undefined)
    task.saveCheckpoint = vi.fn().mockResolvedValue(undefined)

    const approved = await task.askApproval('[read_file]', 'command', 'cat')

    expect(approved).toBe(true)
    expect(task.readOnlyCommandsAutoApproved).toBe(true)
    expect(task.pushToolResult).not.toHaveBeenCalled()
    expect(task.pushAdditionalToolFeedback).toHaveBeenCalledWith('continue')
    expect(task.saveUserMessage).toHaveBeenCalledWith('continue', [{ type: 'text', text: 'continue' }])
  })

  it('askApproval should convert command tool results into structured tool_result payloads', async () => {
    task.ask = vi.fn().mockResolvedValue({
      response: 'yesButtonClicked',
      text: 'Terminal output:\n```\nls output\n```',
      toolResult: {
        output: 'ls output',
        toolName: 'execute_command'
      }
    })
    task.hosts = [{ host: '10.0.0.8', uuid: 'host-1', connection: 'ssh' }]
    task.pushToolResult = vi.fn().mockResolvedValue(undefined)
    task.pushAdditionalToolFeedback = vi.fn().mockResolvedValue(undefined)
    task.saveUserMessage = vi.fn().mockResolvedValue(undefined)
    task.saveCheckpoint = vi.fn().mockResolvedValue(undefined)

    const approved = await task.askApproval('[execute_command]', 'command', 'ls')

    expect(approved).toBe(true)
    expect(task.pushToolResult).toHaveBeenCalledWith(
      '[execute_command]',
      'ls output',
      expect.objectContaining({
        toolName: 'execute_command',
        hosts: task.hosts,
        isError: undefined
      })
    )
    expect(task.pushAdditionalToolFeedback).not.toHaveBeenCalled()
    expect(task.saveUserMessage).toHaveBeenCalledWith('ls output', undefined, 'command_output')
    expect(task.saveCheckpoint).toHaveBeenCalledTimes(1)
  })

  it('askApproval should enqueue command tool results for tool_result persistence', async () => {
    task.ask = vi.fn().mockResolvedValue({
      response: 'yesButtonClicked',
      toolResult: {
        output: 'ls output',
        toolName: 'execute_command'
      }
    })
    task.hosts = [{ host: '10.0.0.8', uuid: 'host-1', connection: 'ssh' }]
    task.addToApiConversationHistory = vi.fn().mockResolvedValue(undefined)
    task.saveCheckpoint = vi.fn().mockResolvedValue(undefined)

    const approved = await task.askApproval('[execute_command]', 'command', 'ls')

    expect(approved).toBe(true)
    expect(task.pendingToolResults).toHaveLength(1)
    expect(task.pendingToolResults[0]).toEqual(
      expect.objectContaining({
        toolName: 'execute_command',
        toolDescription: '[execute_command]',
        hosts: task.hosts,
        result: 'ls output'
      })
    )
    expect(task.chatermMessages[0]).toEqual(
      expect.objectContaining({
        type: 'say',
        say: 'command_output',
        text: 'ls output',
        hosts: task.hosts
      })
    )

    await task.flushPendingToolResults()

    expect(task.addToApiConversationHistory).toHaveBeenCalledWith(
      expect.objectContaining({
        role: 'user',
        content: [
          expect.objectContaining({
            type: 'tool_result'
          })
        ]
      })
    )
    expect(task.pendingToolResults).toHaveLength(0)
  })

  it('handleToolError should short-circuit when task is abandoned', async () => {
    task.abandoned = true
    task.say = vi.fn().mockResolvedValue(undefined)
    task.pushToolResult = vi.fn().mockResolvedValue(undefined)

    await task.handleToolError('[tool]', 'reading file', new Error('boom'))

    expect(task.say).not.toHaveBeenCalled()
    expect(task.pushToolResult).not.toHaveBeenCalled()
  })

  it('handleToolError should emit say and push tool error when active', async () => {
    task.abandoned = false
    task.say = vi.fn().mockResolvedValue(undefined)
    task.pushToolResult = vi.fn().mockResolvedValue(undefined)

    await task.handleToolError('[tool]', 'reading file', new Error('boom'))

    expect(task.say).toHaveBeenCalledTimes(1)
    expect(task.say.mock.calls[0][0]).toBe('error')
    expect(task.say.mock.calls[0][1]).toContain('Error reading file')
    expect(task.pushToolResult).toHaveBeenCalledTimes(1)
  })

  it('normalizeToolResultsForApi should flatten structured tool_result block', () => {
    const normalized = task.normalizeToolResultsForApi([
      {
        role: 'user',
        content: [
          {
            type: 'tool_result',
            content: JSON.stringify({
              toolDescription: '[grep_search]',
              toolName: 'grep_search',
              ip: '10.0.0.8',
              size: 222,
              lineCount: 3,
              isError: false,
              result: 'match lines'
            })
          }
        ]
      }
    ])

    const text = (normalized[0].content[0] as any).text
    expect((normalized[0].content[0] as any).type).toBe('text')
    expect(text).toContain('Tool [grep_search]')
    expect(text).toContain('on 10.0.0.8')
    expect(text).toContain('completed successfully')
    expect(text).toContain('result: match lines')
  })

  it('normalizeToolResultsForApi should return empty text when tool_result is invalid json', () => {
    const normalized = task.normalizeToolResultsForApi([
      {
        role: 'user',
        content: [
          {
            type: 'tool_result',
            content: 'not-json'
          }
        ]
      }
    ])

    expect((normalized[0].content[0] as any).type).toBe('text')
    expect((normalized[0].content[0] as any).text).toBe('')
  })

  it('getToolDescription should format known and unknown tool names', () => {
    expect(task.getToolDescription({ name: 'execute_command', params: { command: 'ls -al' } })).toBe("[execute_command 'ls -al']")
    expect(task.getToolDescription({ name: 'use_mcp_tool', params: { server_name: 's1', tool_name: 't1' } })).toBe('[use_mcp_tool - s1/t1]')
    expect(task.getToolDescription({ name: 'unknown_tool', params: {} })).toBe('[unknown_tool]')
  })

  it('isLocalHost should recognize localhost variations', () => {
    expect(task.isLocalHost('127.0.0.1')).toBe(true)
    expect(task.isLocalHost('localhost')).toBe(true)
    expect(task.isLocalHost('::1')).toBe(true)
    expect(task.isLocalHost('10.0.0.1')).toBe(false)
  })

  it('removeClosingTag should strip trailing partial XML-like marker', () => {
    const output = task.removeClosingTag(true, 'command', 'ls -al </com')
    expect(output).toBe('ls -al')
  })

  it('removeClosingTag should return original text when not partial', () => {
    expect(task.removeClosingTag(false, 'command', 'ls </com')).toBe('ls </com')
  })
})
