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
import { HostResolutionError } from '../host-resolver'
import { ChatermDatabaseService } from '@storage/db/chaterm.service'
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
    task.hostColorMap = new Map()
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

  describe('command card target host', () => {
    const hostInfo = expect.objectContaining({ hostId: '10.0.0.2', hostName: '10.0.0.2', colorTag: expect.any(String) })
    const block = (requiresApproval: string) => ({
      name: 'execute_command',
      params: { command: 'uptime', ip: '10.0.0.2', requires_approval: requiresApproval },
      partial: false
    })

    beforeEach(() => {
      task.captureExecuteCommandUsage = vi.fn()
    })

    it('names the host on an auto-approved command in agent mode', async () => {
      vi.mocked(getGlobalState).mockImplementation(async (key: string) => (key === 'chatSettings' ? { mode: 'agent' } : {}))
      task.autoApprovalSettings = { enabled: true, enableNotifications: false, actions: { executeSafeCommands: true } }
      task.shouldAutoApproveTool = vi.fn().mockReturnValue([true, true])

      await task.handleExecuteCommandToolUse(block('false'))

      expect(task.say).toHaveBeenCalledWith('command', 'uptime', false, hostInfo)
    })

    it('names the host on a read-only command that runs without approval', async () => {
      vi.mocked(getGlobalState).mockImplementation(async (key: string) => (key === 'chatSettings' ? { mode: 'agent' } : {}))

      await task.handleExecuteCommandToolUse(block('false'))

      expect(task.askApproval).not.toHaveBeenCalled()
      expect(task.say).toHaveBeenCalledWith('command', 'uptime', false, hostInfo)
    })

    it('names the host on the approval card in agent mode', async () => {
      vi.mocked(getGlobalState).mockImplementation(async (key: string) => (key === 'chatSettings' ? { mode: 'agent' } : {}))

      await task.handleExecuteCommandToolUse(block('true'))

      expect(task.askApproval).toHaveBeenCalledWith(
        '[mock-tool]',
        'command',
        'uptime',
        { command: 'uptime', targetHosts: '10.0.0.2', toolName: 'execute_command' },
        hostInfo
      )
    })

    it('names the host on the security approval card in agent mode', async () => {
      vi.mocked(getGlobalState).mockImplementation(async (key: string) => (key === 'chatSettings' ? { mode: 'agent' } : {}))
      task.performCommandSecurityCheck.mockResolvedValue({ needsSecurityApproval: true, securityMessage: 'risky', shouldReturn: false })

      await task.handleExecuteCommandToolUse(block('false'))

      expect(task.askApproval).toHaveBeenCalledWith(
        '[mock-tool]',
        'command',
        'uptime',
        { command: 'uptime', targetHosts: '10.0.0.2', toolName: 'execute_command' },
        hostInfo
      )
    })

    it('leaves the cmd mode card without a host', async () => {
      vi.mocked(getGlobalState).mockImplementation(async (key: string) => (key === 'chatSettings' ? { mode: 'cmd' } : {}))

      await task.handleExecuteCommandToolUse(block('false'))

      expect(task.askApproval).toHaveBeenCalledWith(
        '[mock-tool]',
        'command',
        'uptime',
        { command: 'uptime', targetHosts: '10.0.0.2', toolName: 'execute_command' },
        undefined
      )
    })
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

describe('Task access to hosts that were not @-selected', () => {
  let task: any
  const managed = (overrides: Record<string, unknown> = {}) => ({
    target_id: 'asset-9',
    name: 'db',
    host: '10.0.0.9',
    port: 22,
    connection_type: 'ssh',
    group: null,
    ...overrides
  })
  const useManaged = (targets: unknown[]) => {
    const dbService = { findMcpTargetsByHost: vi.fn(() => targets), listMcpTargets: vi.fn(() => targets) }
    vi.mocked(ChatermDatabaseService.getInstance).mockResolvedValue(dbService as any)
    return dbService
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getGlobalState).mockResolvedValue({})
    task = Object.create((Task as unknown as { prototype: object }).prototype) as any
    task.taskId = 'task-host-access'
    task.hosts = [{ host: '10.0.0.1', uuid: 'asset-1', connection: 'ssh' }]
    task.hostColorMap = new Map()
    task.chatermMessages = []
    task.say = vi.fn().mockResolvedValue(undefined)
    task.ask = vi.fn().mockResolvedValue({ response: 'yesButtonClicked' })
    task.abortTask = vi.fn().mockResolvedValue(undefined)
    task.pushToolResult = vi.fn().mockResolvedValue(undefined)
    task.saveCheckpoint = vi.fn().mockResolvedValue(undefined)
    task.handleToolError = vi.fn().mockResolvedValue(undefined)
    task.getToolDescription = vi.fn(() => '[mock-tool]')
    task.isK8sHost = vi.fn().mockReturnValue(false)
    task.messages = { sshConnectionFailed: 'failed: {host}' }
    task.responseFormatter = { toolError: (msg: string) => `[ERROR] ${msg}` }
  })

  describe('resolveTargetHost', () => {
    it('uses the @-selected host without querying managed hosts', async () => {
      const dbService = useManaged([])
      await expect(task.resolveTargetHost('10.0.0.1')).resolves.toBe(task.hosts[0])
      expect(dbService.findMcpTargetsByHost).not.toHaveBeenCalled()
    })

    it('defaults to the first @-selected host when no address is given', async () => {
      await expect(task.resolveTargetHost(undefined)).resolves.toBe(task.hosts[0])
      task.hosts = undefined
      await expect(task.resolveTargetHost(undefined)).resolves.toBeUndefined()
    })

    it('resolves any other address to the managed host it names', async () => {
      const dbService = useManaged([managed({ connection_type: 'jumpserver' })])
      await expect(task.resolveTargetHost(' 10.0.0.9 ')).resolves.toEqual({ host: '10.0.0.9', uuid: 'asset-9', connection: 'jumpserver' })
      expect(dbService.findMcpTargetsByHost).toHaveBeenCalledWith('10.0.0.9')
    })

    it('looks up managed hosts when the task has no @-selected hosts at all', async () => {
      task.hosts = undefined
      useManaged([managed()])
      await expect(task.resolveTargetHost('10.0.0.9')).resolves.toMatchObject({ uuid: 'asset-9' })
    })

    it('rejects an address that no managed host uses and one that several share', async () => {
      useManaged([])
      await expect(task.resolveTargetHost('10.9.9.9')).rejects.toBeInstanceOf(HostResolutionError)
      useManaged([managed(), managed({ target_id: 'asset-10', group: 'bastion' })])
      await expect(task.resolveTargetHost('10.0.0.9')).rejects.toThrow(/matches 2 managed hosts/)
    })
  })

  describe('executeCommandTool', () => {
    it('reports an unresolvable host to the model and keeps the task running', async () => {
      task.connectTerminal = vi.fn().mockRejectedValue(new HostResolutionError('Host "10.9.9.9" is not managed'))

      const result = await task.executeCommandTool('uptime', '10.9.9.9')

      expect(result).toBe('[ERROR] Host "10.9.9.9" is not managed')
      expect(task.ask).not.toHaveBeenCalled()
      expect(task.abortTask).not.toHaveBeenCalled()
    })

    it('still aborts the task when connecting to a resolved host fails', async () => {
      task.connectTerminal = vi.fn().mockRejectedValue(new Error('auth failed'))

      const result = await task.executeCommandTool('uptime', '10.0.0.1')

      expect(task.ask).toHaveBeenCalledWith('ssh_con_failed', 'auth failed', false)
      expect(task.abortTask).toHaveBeenCalled()
      expect(result).toBe('SSH connection failed: auth failed')
    })
  })

  describe('executeCommandInRemoteServer', () => {
    it('rethrows an unresolvable host for the calling tool to report', async () => {
      const error = new HostResolutionError('Host "10.9.9.9" is not managed')
      task.connectTerminal = vi.fn().mockRejectedValue(error)

      await expect(task.executeCommandInRemoteServer('ls', '10.9.9.9')).rejects.toBe(error)
      expect(task.ask).not.toHaveBeenCalled()
      expect(task.abortTask).not.toHaveBeenCalled()
    })

    it('still aborts the task when connecting to a resolved host fails', async () => {
      task.connectTerminal = vi.fn().mockRejectedValue(new Error('auth failed'))

      await expect(task.executeCommandInRemoteServer('ls', '10.0.0.1')).rejects.toThrow('auth failed')
      expect(task.ask).toHaveBeenCalledWith('ssh_con_failed', 'auth failed', false)
      expect(task.abortTask).toHaveBeenCalled()
    })

    it('returns empty output in cmd mode instead of aborting', async () => {
      vi.mocked(getGlobalState).mockResolvedValue({ mode: 'cmd' })
      task.connectTerminal = vi.fn().mockRejectedValue(new Error('auth failed'))

      await expect(task.executeCommandInRemoteServer('ls', '10.0.0.1')).resolves.toBe('')
      expect(task.abortTask).not.toHaveBeenCalled()
    })
  })

  describe('handleListHostsToolUse', () => {
    const run = (params: Record<string, string>) => task.handleListHostsToolUse({ name: 'list_hosts', params, partial: false })

    it('lists managed hosts to the user and the model', async () => {
      const dbService = useManaged([managed({ group: 'prod' })])

      await run({ search: 'db', limit: '500', offset: '-3' })

      expect(dbService.listMcpTargets).toHaveBeenCalledWith('db', 200, 0)
      const summary = task.pushToolResult.mock.calls[0][1] as string
      expect(summary).toContain('- host: 10.0.0.9 | name: db | port: 22 | type: ssh | group: prod')
      expect(task.say).toHaveBeenCalledWith('search_result', summary, false)
      expect(task.saveCheckpoint).toHaveBeenCalled()
    })

    it('applies defaults when no filter is given', async () => {
      const dbService = useManaged([])

      await run({})

      expect(dbService.listMcpTargets).toHaveBeenCalledWith('', 50, 0)
      expect(task.pushToolResult).toHaveBeenCalledWith('[mock-tool]', 'No managed hosts found.')
    })

    it('reports a failed lookup as a tool error', async () => {
      const failure = new Error('database locked')
      vi.mocked(ChatermDatabaseService.getInstance).mockRejectedValue(failure)

      await run({})

      expect(task.handleToolError).toHaveBeenCalledWith('[mock-tool]', 'listing hosts', failure)
      expect(task.saveCheckpoint).toHaveBeenCalled()
    })
  })

  describe('ask with host info', () => {
    const hostInfo = { hostId: '10.0.0.9', hostName: '10.0.0.9', colorTag: '#3B82F6' }

    beforeEach(() => {
      task.ask = (Task as unknown as { prototype: { ask: unknown } }).prototype.ask
      task.addToChatermMessages = vi.fn(async (message: any) => {
        task.chatermMessages.push(message)
        task.askResponsePayload = { response: 'yesButtonClicked' }
      })
      task.postStateToWebview = vi.fn().mockResolvedValue(undefined)
      task.postMessageToWebview = vi.fn().mockResolvedValue(undefined)
      task.saveChatermMessagesAndUpdateHistory = vi.fn().mockResolvedValue(undefined)
    })

    it('stores the host on a directly asked message', async () => {
      await task.ask('command', 'uptime', undefined, undefined, hostInfo)
      expect(task.addToChatermMessages).toHaveBeenCalledWith(expect.objectContaining({ ask: 'command', ...hostInfo }))
    })

    it('carries the host through an ask that completes a partial message', async () => {
      await task.ask('command', 'uptime', false, undefined, hostInfo)
      expect(task.addToChatermMessages).toHaveBeenCalledWith(expect.objectContaining({ ask: 'command', text: 'uptime', ...hostInfo }))
    })

    it('stores no host fields when none is given', async () => {
      await task.ask('command', 'uptime')
      expect(task.addToChatermMessages.mock.calls[0][0]).not.toHaveProperty('hostId')
    })

    it.each([
      { label: 'with a host', info: hostInfo, expected: hostInfo },
      { label: 'without a host', info: undefined, expected: {} }
    ])('adds a new partial and a new completed ask $label', async ({ info, expected }) => {
      const askTsRef = { value: 0 }

      await task.handleAskPartialMessage('command', askTsRef, 'up', true, undefined, info)
      expect(task.addToChatermMessages).toHaveBeenLastCalledWith(expect.objectContaining({ partial: true, ...expected }))

      task.chatermMessages = []
      await task.handleAskPartialMessage('command', askTsRef, 'uptime', false, undefined, info)
      expect(task.addToChatermMessages).toHaveBeenLastCalledWith(expect.objectContaining({ text: 'uptime', ...expected }))
      expect(task.postMessageToWebview).toHaveBeenLastCalledWith({ type: 'partialMessage', partialMessage: expect.objectContaining(expected) })
    })

    it('puts the host on a partial ask that is updated and then completed', async () => {
      const askTsRef = { value: 0 }
      task.chatermMessages = [{ ts: 7, type: 'ask', ask: 'command', text: 'up', partial: true }]

      await task.handleAskPartialMessage('command', askTsRef, 'upt', true, undefined, hostInfo)
      expect(task.chatermMessages[0]).toMatchObject({ text: 'upt', partial: true, ...hostInfo })

      await task.handleAskPartialMessage('command', askTsRef, 'uptime', false, undefined, hostInfo)
      expect(task.chatermMessages[0]).toMatchObject({ text: 'uptime', partial: false, ...hostInfo })
      expect(task.saveChatermMessagesAndUpdateHistory).toHaveBeenCalled()
    })
  })
})
