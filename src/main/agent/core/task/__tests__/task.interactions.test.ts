import { beforeEach, describe, expect, it, vi } from 'vitest'

const { telemetryMocks } = vi.hoisted(() => ({
  telemetryMocks: {
    captureTaskFeedback: vi.fn(),
    captureOptionSelected: vi.fn(),
    captureOptionsIgnored: vi.fn(),
    captureTaskCompleted: vi.fn()
  }
}))

const { experienceMocks } = vi.hoisted(() => ({
  experienceMocks: {
    extractFromCompletedTask: vi.fn().mockResolvedValue({ taskExperienceLedger: [], wroteAny: false }),
    createExperienceManager: vi.fn()
  }
}))

const { knowledgebaseMocks } = vi.hoisted(() => ({
  knowledgebaseMocks: {
    getKbSearchManager: vi.fn(),
    getKnowledgeBaseRoot: vi.fn(() => '/mock/knowledgebase')
  }
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
vi.mock('@services/telemetry/TelemetryService', () => ({ telemetryService: telemetryMocks }))
vi.mock('@api/index', () => ({
  ApiHandler: class {},
  buildApiHandler: vi.fn(() => ({}))
}))
vi.mock('@core/storage/state', () => ({
  getGlobalState: vi.fn(async () => ({})),
  getUserConfig: vi.fn(async () => ({ language: 'zh-CN' }))
}))
vi.mock('../../../../services/knowledgebase', () => ({
  getKbSearchManager: knowledgebaseMocks.getKbSearchManager,
  getKnowledgeBaseRoot: knowledgebaseMocks.getKnowledgeBaseRoot
}))
vi.mock('../../../services/experience', () => ({
  createExperienceManager: experienceMocks.createExperienceManager
}))
vi.mock('../../../storage/chat_sync/index', () => ({
  ChatSyncScheduler: {
    getInstance: vi.fn(() => ({
      triggerUploadSync: vi.fn()
    }))
  }
}))

import { Task } from '../index'

describe('Task interaction-heavy branches', () => {
  let task: any

  beforeEach(() => {
    vi.clearAllMocks()
    task = Object.create((Task as unknown as { prototype: object }).prototype) as any
    task.taskId = 'task-interactions'
    task.chatermMessages = []
    task.userMessageContent = []
    task.autoApprovalSettings = { enabled: false, enableNotifications: false }
    task.messages = { userProvidedFeedback: 'feedback: {feedback}' }
    task.getUserLocale = vi.fn().mockResolvedValue('zh-CN')

    task.getToolDescription = vi.fn(() => '[mock-tool]')
    task.removeClosingTag = vi.fn((_partial: boolean, _tag: string, text?: string) => text ?? '')
    task.ask = vi.fn().mockResolvedValue({ response: 'yesButtonClicked', text: '', contentParts: [] })
    task.say = vi.fn().mockResolvedValue(undefined)
    task.pushToolResult = vi.fn().mockResolvedValue(undefined)
    task.sayAndCreateMissingParamError = vi.fn(async (_tool: string, param: string) => `missing:${param}`)
    task.saveCheckpoint = vi.fn().mockResolvedValue(undefined)
    task.saveUserMessage = vi.fn().mockResolvedValue(undefined)
    task.saveChatermMessagesAndUpdateHistory = vi.fn().mockResolvedValue(undefined)
    task.handleToolError = vi.fn().mockResolvedValue(undefined)
    task.askApproval = vi.fn().mockResolvedValue(true)
    task.executeCommandTool = vi.fn().mockResolvedValue('cmd ok')
    task.completeAllInProgressTodos = vi.fn().mockResolvedValue(undefined)
    task.clearEphemeralToolResults = vi.fn().mockResolvedValue(undefined)
    task.doesLatestTaskCompletionHaveNewChanges = vi.fn().mockResolvedValue(false)
    task.performCommandSecurityCheck = vi.fn().mockResolvedValue({
      needsSecurityApproval: false,
      securityMessage: '',
      shouldReturn: false
    })
    task.handleMissingParam = vi.fn().mockResolvedValue(undefined)
    task.shouldAutoApproveTool = vi.fn().mockReturnValue(false)
    task.addTodoStatusUpdateReminder = vi.fn().mockResolvedValue(undefined)
    task.removeLastPartialMessageIfExistsWithType = vi.fn()
    task.showNotificationIfNeeded = vi.fn()
    task.responseFormatter = {
      toolError: (msg: string) => `[ERROR] ${msg}`,
      toolDenied: () => 'The user denied this operation.',
      toolResult: (msg: string) => msg,
      toolAlreadyUsed: (name: string) => `Tool [${name}] was already used.`,
      missingToolParameterError: (param: string) => `Missing parameter: ${param}`,
      noToolsUsed: () => 'No tools were used.',
      tooManyMistakes: (msg: string) => `Too many mistakes: ${msg}`,
      condense: () => 'Conversation condensed.'
    }
  })

  it('handleAskFollowupQuestionToolUse should ask directly in partial mode', async () => {
    await task.handleAskFollowupQuestionToolUse({
      name: 'ask_followup_question',
      params: { question: 'next?', options: '["A"]' },
      partial: true
    })

    expect(task.ask).toHaveBeenCalledWith('followup', expect.any(String), true)
    expect(task.pushToolResult).not.toHaveBeenCalled()
  })

  it('handleAskFollowupQuestionToolUse should handle missing question', async () => {
    task.consecutiveMistakeCount = 0
    await task.handleAskFollowupQuestionToolUse({
      name: 'ask_followup_question',
      params: { options: '["A"]' },
      partial: false
    })

    expect(task.consecutiveMistakeCount).toBe(1)
    expect(task.pushToolResult).toHaveBeenCalledWith('[mock-tool]', 'missing:question')
    expect(task.saveCheckpoint).toHaveBeenCalledTimes(1)
  })

  it('handleAskFollowupQuestionToolUse should record selected option path', async () => {
    task.chatermMessages = [{ ask: 'followup', text: '{}' }]
    task.ask = vi.fn().mockResolvedValue({ text: 'A', contentParts: [] })

    await task.handleAskFollowupQuestionToolUse({
      name: 'ask_followup_question',
      params: { question: 'Choose', options: '["A","B"]' },
      partial: false
    })

    expect(telemetryMocks.captureOptionSelected).toHaveBeenCalled()
    expect(task.saveUserMessage).not.toHaveBeenCalled()
    expect(task.pushToolResult).toHaveBeenCalledTimes(1)
  })

  it('handleAttemptCompletionToolUse should handle missing result', async () => {
    task.consecutiveMistakeCount = 0
    await task.handleAttemptCompletionToolUse({
      name: 'attempt_completion',
      params: {},
      partial: false
    })

    expect(task.consecutiveMistakeCount).toBe(1)
    expect(task.pushToolResult).toHaveBeenCalledWith('[mock-tool]', 'missing:result')
  })

  it('handleAttemptCompletionToolUse should return early when command approval denied', async () => {
    task.askApproval = vi.fn().mockResolvedValue(false)
    task.chatermMessages = [{ ask: 'not-command' }]

    await task.handleAttemptCompletionToolUse({
      name: 'attempt_completion',
      params: { result: 'done', command: 'ls', ip: '10.0.0.1' },
      partial: false
    })

    expect(task.askApproval).toHaveBeenCalledTimes(1)
    expect(task.executeCommandTool).not.toHaveBeenCalled()
    expect(task.saveCheckpoint).toHaveBeenCalled()
  })

  it('handleAttemptCompletionToolUse should push empty tool result on acceptance', async () => {
    task.ask = vi.fn().mockResolvedValue({ response: 'yesButtonClicked', text: '', contentParts: [] })

    await task.handleAttemptCompletionToolUse({
      name: 'attempt_completion',
      params: { result: 'all good' },
      partial: false
    })

    expect(task.completeAllInProgressTodos).toHaveBeenCalledTimes(1)
    expect(task.clearEphemeralToolResults).toHaveBeenCalledTimes(1)
    expect(task.pushToolResult).toHaveBeenCalledWith('[mock-tool]', '')
  })

  it('handleExecuteCommandToolUse should route missing params to handleMissingParam', async () => {
    await task.handleExecuteCommandToolUse({
      name: 'execute_command',
      params: { command: 'pwd' },
      partial: false
    })

    expect(task.handleMissingParam).toHaveBeenCalledWith('ip', '[mock-tool]', 'execute_command')
  })

  it('handleExecuteCommandToolUse should ask command in partial mode when not auto-approved', async () => {
    task.shouldAutoApproveTool = vi.fn().mockReturnValue(false)

    await task.handleExecuteCommandToolUse({
      name: 'execute_command',
      params: { command: 'pwd' },
      partial: true
    })

    expect(task.ask).toHaveBeenCalledWith('command', 'pwd', true)
  })

  it('handleKbSearchToolUse should send structured contentParts for kb results', async () => {
    knowledgebaseMocks.getKbSearchManager.mockReturnValue({
      search: vi.fn().mockResolvedValue([
        {
          path: 'rss2.md',
          startLine: 1,
          endLine: 3,
          score: 0.98,
          snippet: 'rss snippet'
        }
      ])
    })

    await task.handleKbSearchToolUse({
      name: 'kb_search',
      params: { query: 'rss', max_results: '5' },
      partial: false
    })

    expect(task.say).toHaveBeenCalledWith('text', expect.stringContaining('rss2.md L1-3'), false, undefined, [
      { type: 'text', text: '知识库检索:' },
      {
        type: 'chip',
        chipType: 'doc',
        ref: {
          absPath: '/mock/knowledgebase/rss2.md',
          relPath: 'rss2.md',
          name: 'rss2.md',
          type: 'file',
          startLine: 1,
          endLine: 3
        }
      }
    ])
    expect(task.pushToolResult).toHaveBeenCalledWith('[mock-tool]', expect.stringContaining('Found 1 results:'))
    expect(task.saveCheckpoint).toHaveBeenCalledTimes(1)
  })

  it('performKbSearch should send structured contentParts for automatic kb context', async () => {
    knowledgebaseMocks.getKbSearchManager.mockReturnValue({
      search: vi.fn().mockResolvedValue([
        {
          path: 'rss2.md',
          startLine: 1,
          endLine: 1,
          score: 0.88,
          snippet: 'rss snippet'
        }
      ])
    })

    const result = await task.performKbSearch([{ type: 'text', text: 'How to configure rss?' }] as any)

    expect(task.say).toHaveBeenCalledWith('text', expect.stringContaining('rss2.md L1-1'), false, undefined, [
      { type: 'text', text: '知识库检索:' },
      {
        type: 'chip',
        chipType: 'doc',
        ref: {
          absPath: '/mock/knowledgebase/rss2.md',
          relPath: 'rss2.md',
          name: 'rss2.md',
          type: 'file',
          startLine: 1,
          endLine: 1
        }
      }
    ])
    expect(result).toContain('<knowledge_base_context>')
    expect(result).toContain('[rss2.md:1-1]')
  })
})
