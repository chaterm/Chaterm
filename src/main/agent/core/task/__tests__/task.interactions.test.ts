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

const { rerankMocks } = vi.hoisted(() => ({
  rerankMocks: {
    resolveKbRerankRuntime: vi.fn(async () => ({}))
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
vi.mock('../../../../services/knowledgebase/rerank', () => ({
  resolveKbRerankRuntime: rerankMocks.resolveKbRerankRuntime
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
import { getGlobalState } from '@core/storage/state'

describe('Task interaction-heavy branches', () => {
  let task: any

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getGlobalState).mockResolvedValue({})
    experienceMocks.createExperienceManager.mockReturnValue({
      extractFromCompletedTask: experienceMocks.extractFromCompletedTask
    })
    task = Object.create((Task as unknown as { prototype: object }).prototype) as any
    task.taskId = 'task-interactions'
    task.apiConversationHistory = [{ role: 'user', content: 'Fix SSH timeout on bastion' }]
    task.chatermMessages = []
    task.userMessageContent = []
    task.api = {
      createMessage: vi.fn(async function* () {
        yield { type: 'text', text: 'ok' }
      })
    }
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
    task.triggerExperienceExtraction = vi.fn().mockResolvedValue(undefined)
    task.enqueueExperienceExtraction = vi.fn()
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
      questionSkipped: () => 'The user skipped this question.',
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

  it('handleAskFollowupQuestionToolUse should send the title with the question', async () => {
    task.ask = vi.fn().mockResolvedValue({ response: 'messageResponse', text: 'free text', contentParts: [] })

    await task.handleAskFollowupQuestionToolUse({
      name: 'ask_followup_question',
      params: { title: 'Next step', question: 'Choose', options: '["A","B"]' },
      partial: false
    })

    expect(task.ask).toHaveBeenCalledWith('followup', JSON.stringify({ title: 'Next step', question: 'Choose', options: ['A', 'B'] }), false)
  })

  it('handleAskFollowupQuestionToolUse should keep a custom card answer on the question record', async () => {
    const question = JSON.stringify({ title: 'Next step', question: 'Choose', options: ['A', 'B'] })
    task.chatermMessages = [{ ask: 'followup', text: question }]
    task.ask = vi.fn().mockResolvedValue({ response: 'optionResponse', text: 'my own plan', contentParts: [] })

    await task.handleAskFollowupQuestionToolUse({
      name: 'ask_followup_question',
      params: { title: 'Next step', question: 'Choose', options: '["A","B"]' },
      partial: false
    })

    expect(JSON.parse(task.chatermMessages[0].text)).toEqual({ title: 'Next step', question: 'Choose', options: ['A', 'B'], selected: 'my own plan' })
    expect(task.saveChatermMessagesAndUpdateHistory).toHaveBeenCalledTimes(1)
    expect(task.saveUserMessage).not.toHaveBeenCalled()
    expect(telemetryMocks.captureOptionsIgnored).toHaveBeenCalledWith('task-interactions', 2, 'act')
    expect(task.pushToolResult).toHaveBeenCalledExactlyOnceWith('[mock-tool]', '<answer>\nmy own plan\n</answer>')
  })

  it('handleAskFollowupQuestionToolUse should save a typed answer as a user message', async () => {
    const question = JSON.stringify({ question: 'Choose', options: ['A', 'B'] })
    task.chatermMessages = [{ ask: 'followup', text: question }]
    task.ask = vi.fn().mockResolvedValue({ response: 'messageResponse', text: 'typed in the chat box', contentParts: [] })

    await task.handleAskFollowupQuestionToolUse({
      name: 'ask_followup_question',
      params: { question: 'Choose', options: '["A","B"]' },
      partial: false
    })

    expect(task.saveUserMessage).toHaveBeenCalledWith('typed in the chat box', [])
    expect(task.chatermMessages[0].text).toBe(question)
    expect(telemetryMocks.captureOptionsIgnored).toHaveBeenCalled()
  })

  it('handleAskFollowupQuestionToolUse should record the skip on the question', async () => {
    const question = JSON.stringify({ title: 'Backup', question: 'Choose', options: ['A', 'B'] })
    task.chatermMessages = [{ ask: 'followup', text: question }]
    task.ask = vi.fn().mockResolvedValue({ response: 'noButtonClicked', text: '' })

    await task.handleAskFollowupQuestionToolUse({
      name: 'ask_followup_question',
      params: { title: 'Backup', question: 'Choose', options: '["A","B"]' },
      partial: false
    })

    expect(JSON.parse(task.chatermMessages[0].text)).toEqual({ title: 'Backup', question: 'Choose', options: ['A', 'B'], skipped: true })
  })

  it('handleAskFollowupQuestionToolUse should still answer when no question record exists', async () => {
    task.chatermMessages = []
    task.ask = vi.fn().mockResolvedValue({ response: 'optionResponse', text: 'A', contentParts: [] })

    await task.handleAskFollowupQuestionToolUse({
      name: 'ask_followup_question',
      params: { question: 'Choose', options: '["A","B"]' },
      partial: false
    })

    expect(task.saveChatermMessagesAndUpdateHistory).not.toHaveBeenCalled()
    expect(task.pushToolResult).toHaveBeenCalledExactlyOnceWith('[mock-tool]', '<answer>\nA\n</answer>')
  })

  it('handleAskFollowupQuestionToolUse should report a skipped question without saving a user message', async () => {
    task.ask = vi.fn().mockResolvedValue({ response: 'noButtonClicked', text: '' })

    await task.handleAskFollowupQuestionToolUse({
      name: 'ask_followup_question',
      params: { title: 'Next step', question: 'Choose', options: '["A","B"]' },
      partial: false
    })

    expect(telemetryMocks.captureOptionsIgnored).toHaveBeenCalledWith('task-interactions', 2, 'act')
    expect(telemetryMocks.captureOptionSelected).not.toHaveBeenCalled()
    expect(task.saveUserMessage).not.toHaveBeenCalled()
    expect(task.pushToolResult).toHaveBeenCalledExactlyOnceWith('[mock-tool]', '<answer>\nThe user skipped this question.\n</answer>')
    expect(task.saveCheckpoint).toHaveBeenCalledTimes(1)
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
    expect(task.triggerExperienceExtraction).not.toHaveBeenCalled()
  })

  it('handleAttemptCompletionToolUse should push empty tool result on acceptance', async () => {
    task.ask = vi.fn().mockResolvedValue({ response: 'yesButtonClicked', text: '', contentParts: [] })

    await task.handleAttemptCompletionToolUse({
      name: 'attempt_completion',
      params: { result: 'all good', depositExperience: 'true' },
      partial: false
    })

    expect(task.completeAllInProgressTodos).toHaveBeenCalledTimes(1)
    expect(task.clearEphemeralToolResults).toHaveBeenCalledTimes(1)
    expect(task.pushToolResult).toHaveBeenCalledWith('[mock-tool]', '')
    expect(task.enqueueExperienceExtraction).toHaveBeenCalledWith()
  })

  it('handleAttemptCompletionToolUse should skip experience extraction when depositExperience is false', async () => {
    task.ask = vi.fn().mockResolvedValue({ response: 'yesButtonClicked', text: '', contentParts: [] })

    await task.handleAttemptCompletionToolUse({
      name: 'attempt_completion',
      params: { result: 'all good', depositExperience: 'false' },
      partial: false
    })

    expect(task.enqueueExperienceExtraction).not.toHaveBeenCalled()
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

  it.each([
    { enabled: true, all: true, securityApproval: false, approves: false },
    { enabled: false, all: false, securityApproval: false, approves: true },
    { enabled: true, all: false, securityApproval: false, approves: true },
    { enabled: true, all: true, securityApproval: true, approves: true }
  ])(
    'uses current preferences ($enabled, $all) while preserving security approval ($securityApproval)',
    async ({ enabled, all, securityApproval, approves }) => {
      task.autoApprovalSettings = {
        enabled: true,
        enableNotifications: false,
        actions: {
          executeSafeCommands: true,
          executeAllCommands: !all
        }
      }
      vi.mocked(getGlobalState).mockImplementation(async (key: string) => {
        if (key === 'chatSettings') return { mode: 'agent' }
        if (key === 'autoApprovalSettings') {
          return {
            enabled,
            enableNotifications: false,
            actions: {
              executeSafeCommands: true,
              executeAllCommands: all
            }
          }
        }
        return {}
      })
      task.shouldAutoApproveTool = Task.prototype.shouldAutoApproveTool.bind(task)
      task.performCommandSecurityCheck.mockResolvedValue({
        needsSecurityApproval: securityApproval,
        securityMessage: 'Approval required by security configuration',
        shouldReturn: false
      })
      task.consecutiveAutoApprovedRequestsCount = 0
      task.captureExecuteCommandUsage = vi.fn()

      await task.handleExecuteCommandToolUse({
        name: 'execute_command',
        params: { command: 'touch /tmp/chaterm-approval-test', ip: '127.0.0.1', requires_approval: 'true' },
        partial: false
      })

      expect(task.handleToolError).not.toHaveBeenCalled()
      expect(task.autoApprovalSettings.actions.executeAllCommands).toBe(all)
      expect(task.askApproval).toHaveBeenCalledTimes(approves ? 1 : 0)
      expect(task.executeCommandTool).toHaveBeenCalledWith('touch /tmp/chaterm-approval-test', '127.0.0.1')
    }
  )

  it('handleToolUse should add a single todo reminder after execute_command runs on multiple hosts', async () => {
    vi.mocked(getGlobalState).mockImplementation(async (key: string) => (key === 'chatSettings' ? { mode: 'agent' } : {}))
    task.autoApprovalSettings = { enabled: true, enableNotifications: false, actions: { executeSafeCommands: true } }
    task.shouldAutoApproveTool = vi.fn().mockReturnValue([true, true])
    task.captureExecuteCommandUsage = vi.fn()

    await task.handleToolUse({
      name: 'execute_command',
      params: { command: 'uptime', ip: '10.0.0.1,10.0.0.2', requires_approval: 'false' },
      partial: false
    })

    expect(task.executeCommandTool).toHaveBeenCalledTimes(2)
    expect(task.addTodoStatusUpdateReminder).toHaveBeenCalledTimes(1)
  })

  it('handleKbSearchToolUse should send structured contentParts for kb results', async () => {
    knowledgebaseMocks.getKbSearchManager.mockReturnValue({
      search: vi.fn().mockImplementation(async (_query, options) => {
        await options.onProgress({ phase: 'embedding', elapsedMs: 0 })
        await options.onProgress({ phase: 'completed', elapsedMs: 12, resultCount: 1, candidateCount: 1 })
        return [
          {
            path: 'rss2.md',
            startLine: 1,
            endLine: 3,
            score: 0.98,
            snippet: 'rss snippet'
          }
        ]
      })
    })

    await task.handleKbSearchToolUse({
      name: 'kb_search',
      params: { query: 'rss', max_results: '5' },
      partial: false
    })

    const expectedContentParts = [
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
    ]
    expect(task.pushToolResult).toHaveBeenCalledWith('[mock-tool]', expect.stringContaining('Found 1 results:'))
    expect(task.saveCheckpoint).toHaveBeenCalledTimes(1)
    const progressCalls = task.say.mock.calls.filter(([type]) => type === 'kb_search_progress')
    expect(progressCalls.map(([, payload]) => JSON.parse(payload).phase)).toEqual(['embedding', 'completed'])
    expect(progressCalls.map(([, , partial]) => partial)).toEqual([true, false])
    expect(progressCalls.at(-1)?.[4]).toEqual(expectedContentParts)
  })

  it('performKbSearch should send structured contentParts for automatic kb context', async () => {
    knowledgebaseMocks.getKbSearchManager.mockReturnValue({
      search: vi.fn().mockImplementation(async (_query, options) => {
        await options.onProgress({ phase: 'embedding', elapsedMs: 0 })
        await options.onProgress({ phase: 'completed', elapsedMs: 8, resultCount: 1, candidateCount: 1 })
        return [
          {
            path: 'rss2.md',
            startLine: 1,
            endLine: 1,
            score: 0.88,
            snippet: 'rss snippet'
          }
        ]
      })
    })

    const result = await task.performKbSearch([{ type: 'text', text: 'How to configure rss?' }] as any)

    const expectedContentParts = [
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
    ]
    expect(result).toContain('<knowledge_base_context>')
    expect(result).toContain('[rss2.md:1-1]')
    const progressCalls = task.say.mock.calls.filter(([type]) => type === 'kb_search_progress')
    expect(progressCalls.map(([, payload]) => JSON.parse(payload).phase)).toEqual(['embedding', 'completed'])
    expect(progressCalls.map(([, , partial]) => partial)).toEqual([true, false])
    expect(progressCalls.at(-1)?.[4]).toEqual(expectedContentParts)
  })
})
