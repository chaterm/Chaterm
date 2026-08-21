import { describe, it, expect, vi, beforeEach } from 'vitest'

// Match the mock stack used by task-abort.test.ts so Task.prototype is
// importable without pulling in Electron's main bundle.
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
vi.mock('@core/storage/state', () => ({
  getGlobalState: vi.fn(async () => ({ mode: 'agent' })),
  getUserConfig: vi.fn(async () => ({ language: 'en-US' }))
}))

import { Task } from '../index'
import { getGlobalState, getUserConfig } from '@core/storage/state'

// ---------------------------------------------------------------------------
// shouldAutoApproveTool workspace branch (§9.5.1 hard rule)
//
// These are the contract-level guarantees we MUST preserve forever:
//   1. In workspace='database', AutoApprovalSettings is entirely ignored
//      (DB tools have their own hard safety boundary: read-only guard,
//      row caps, timeouts, workspace gate).
//   2. In workspace='server', existing behaviour is byte-identical to the
//      pre-DB-AI implementation — users with auto-approve-all enabled for
//      execute_command still get the `[safe, all]` tuple they always got.
// ---------------------------------------------------------------------------

interface MockAutoApprovalThis {
  workspace: 'server' | 'database'
  autoApprovalSettings: { enabled: boolean; actions: Record<string, boolean> }
}

describe('Task.shouldAutoApproveTool - workspace branch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns false for execute_command in workspace=database, even with auto-approve fully on', () => {
    const mockThis: MockAutoApprovalThis = {
      workspace: 'database',
      autoApprovalSettings: { enabled: true, actions: { executeSafeCommands: true, executeAllCommands: true } }
    }
    const result = Task.prototype.shouldAutoApproveTool.call(mockThis as unknown as Task, 'execute_command')
    expect(result).toBe(false)
  })

  it('returns false for DB tools in workspace=database (defensive)', () => {
    const mockThis: MockAutoApprovalThis = {
      workspace: 'database',
      autoApprovalSettings: { enabled: true, actions: { executeSafeCommands: true, executeAllCommands: true } }
    }
    for (const name of ['list_databases', 'sample_rows', 'explain_plan', 'suggest_indexes'] as const) {
      expect(Task.prototype.shouldAutoApproveTool.call(mockThis as unknown as Task, name)).toBe(false)
    }
  })

  it('preserves server auto-approve tuple for execute_command', () => {
    const mockThis: MockAutoApprovalThis = {
      workspace: 'server',
      autoApprovalSettings: { enabled: true, actions: { executeSafeCommands: true, executeAllCommands: true } }
    }
    const result = Task.prototype.shouldAutoApproveTool.call(mockThis as unknown as Task, 'execute_command')
    expect(result).toEqual([true, true])
  })

  it('returns false when auto-approve disabled in server workspace', () => {
    const mockThis: MockAutoApprovalThis = {
      workspace: 'server',
      autoApprovalSettings: { enabled: false, actions: {} }
    }
    expect(Task.prototype.shouldAutoApproveTool.call(mockThis as unknown as Task, 'execute_command')).toBe(false)
  })

  it('returns false for unlisted tools even when auto-approve on', () => {
    const mockThis: MockAutoApprovalThis = {
      workspace: 'server',
      autoApprovalSettings: { enabled: true, actions: { executeSafeCommands: true, executeAllCommands: true } }
    }
    expect(Task.prototype.shouldAutoApproveTool.call(mockThis as unknown as Task, 'ask_followup_question')).toBe(false)
  })

  it('workspace=database wins over every AutoApprovalSettings toggle combo', () => {
    const combos: Array<[boolean, boolean, boolean]> = [
      [true, true, true],
      [true, true, false],
      [true, false, true],
      [true, false, false],
      [false, true, true],
      [false, true, false],
      [false, false, true],
      [false, false, false]
    ]
    for (const [enabled, safe, all] of combos) {
      const mockThis: MockAutoApprovalThis = {
        workspace: 'database',
        autoApprovalSettings: { enabled, actions: { executeSafeCommands: safe, executeAllCommands: all } }
      }
      // All eight combinations MUST produce `false`.
      expect(Task.prototype.shouldAutoApproveTool.call(mockThis as unknown as Task, 'execute_command')).toBe(false)
    }
  })
})

// ---------------------------------------------------------------------------
// abortTask - sanity: the method runs on a minimal mock `this` without the
// production dependency tree. We don't assert that closeSessionsOwnedBy was
// called because mocking relative specifiers across `__tests__/` boundaries
// is brittle; integration coverage of the release path is covered by #20.
// ---------------------------------------------------------------------------

interface MockAbortThis {
  abort: boolean
  workspace: 'server' | 'database'
  taskId: string
  dbAiSession: unknown
  remoteTerminalManager: { disposeAll: ReturnType<typeof vi.fn> }
}

describe('Task.abortTask - workspace-conditional cleanup', () => {
  beforeEach(() => {
    vi.spyOn(Task, 'clearCommandContextsForTask').mockImplementation(() => undefined)
  })

  it('always disposes remote terminals + clears command contexts', async () => {
    const disposeAll = vi.fn()
    const mockThis: MockAbortThis = {
      abort: false,
      workspace: 'server',
      taskId: 'task-1',
      dbAiSession: undefined,
      remoteTerminalManager: { disposeAll }
    }
    await Task.prototype.abortTask.call(mockThis as unknown as Task)
    expect(mockThis.abort).toBe(true)
    expect(disposeAll).toHaveBeenCalledTimes(1)
    expect(Task.clearCommandContextsForTask).toHaveBeenCalledWith('task-1')
  })

  it('clears dbAiSession on abort when workspace=database', async () => {
    const mockThis: MockAbortThis = {
      abort: false,
      workspace: 'database',
      taskId: 'task-2',
      dbAiSession: { sessionId: 'sess-1' },
      remoteTerminalManager: { disposeAll: vi.fn() }
    }
    await Task.prototype.abortTask.call(mockThis as unknown as Task)
    expect(mockThis.abort).toBe(true)
    // The module-scoped `dbAiSession` field is nulled so subsequent tool
    // calls trigger a fresh session open.
    expect(mockThis.dbAiSession).toBeUndefined()
  })

  it('does NOT touch dbAiSession state when workspace=server (forward-compat)', async () => {
    // A server Task should never have a dbAiSession in practice, but we
    // assert defensively that the abort path does not mutate it.
    const opaque = { shouldNotBeTouched: true }
    const mockThis: MockAbortThis = {
      abort: false,
      workspace: 'server',
      taskId: 'task-3',
      dbAiSession: opaque,
      remoteTerminalManager: { disposeAll: vi.fn() }
    }
    await Task.prototype.abortTask.call(mockThis as unknown as Task)
    expect(mockThis.dbAiSession).toBe(opaque)
  })
})

interface MockBuildSystemPromptThis {
  workspace: 'server' | 'database'
  hosts?: Array<{ host: string }>
  messages: {
    systemInformationTitle: string
    languageSettingsTitle: string
    defaultLanguage: string
    languageRules: string
  }
  customInstructions?: string
  dbContext?: { assetId?: string; dbType?: 'mysql' | 'postgresql' | 'sqlite' | 'oracle'; databaseName?: string; schemaName?: string }
  buildMcpToolsSection: (userLanguage: string) => Promise<string | null>
  buildSkillsSection: () => string | null
}

describe('Task.buildSystemPrompt - workspace-aware system information suffix', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('workspace=database does not append generic system information block', async () => {
    vi.mocked(getGlobalState).mockResolvedValue({ mode: 'agent' } as any)
    vi.mocked(getUserConfig).mockResolvedValue({ language: 'en-US' } as any)

    const mockThis: MockBuildSystemPromptThis = {
      workspace: 'database',
      hosts: [{ host: '10.0.0.1' }],
      messages: {
        systemInformationTitle: 'SYSTEM INFORMATION',
        languageSettingsTitle: 'Language Settings',
        defaultLanguage: 'Default language: {{language}}',
        languageRules: 'Always answer in the user language.'
      },
      dbContext: { assetId: 'ast-1', dbType: 'postgresql', databaseName: 'app_prod', schemaName: 'public' },
      buildMcpToolsSection: vi.fn(async () => null),
      buildSkillsSection: vi.fn(() => null)
    }

    const prompt = await Task.prototype['buildSystemPrompt'].call(mockThis as unknown as Task)

    expect(prompt).toContain('Chaterm DB-AI')
    expect(prompt).not.toContain('# SYSTEM INFORMATION')
    expect(prompt).not.toContain('## Host:')
  })
})

// ---------------------------------------------------------------------------
// handleDbWriteToolUse - classification precedes the approval prompt
//
// The user's approval is the last human checkpoint before a write runs, so it
// must only be requested for SQL that can actually execute. Asking first and
// classifying second trains the user to click through prompts.
// ---------------------------------------------------------------------------

interface MockDbWriteThis {
  workspace: 'server' | 'database'
  dbContext?: { assetId: string; dbType: 'mysql' | 'postgresql' | 'sqlite' | 'oracle' }
  didAlreadyUseTool: boolean
  askApproval: ReturnType<typeof vi.fn>
  getOrCreateDbAiSession: ReturnType<typeof vi.fn>
  pushToolResult: ReturnType<typeof vi.fn>
  say: ReturnType<typeof vi.fn>
  saveCheckpoint: ReturnType<typeof vi.fn>
  handleMissingParam: ReturnType<typeof vi.fn>
  getToolDescription: ReturnType<typeof vi.fn>
  responseFormatter: { toolError: (s: string) => string; toolResult: (s: string) => string }
}

function makeDbWriteThis(overrides: { approve?: boolean; executeQuery?: ReturnType<typeof vi.fn> } = {}) {
  const executeQuery = overrides.executeQuery ?? vi.fn(async () => ({ columns: [], rows: [], rowCount: 1, truncated: false, durationMs: 2 }))
  const mockThis: MockDbWriteThis = {
    workspace: 'database',
    dbContext: { assetId: 'a-1', dbType: 'mysql' },
    didAlreadyUseTool: false,
    askApproval: vi.fn(async () => overrides.approve ?? true),
    getOrCreateDbAiSession: vi.fn(async () => ({ dbType: 'mysql', executeQuery })),
    pushToolResult: vi.fn(async () => undefined),
    say: vi.fn(async () => undefined),
    saveCheckpoint: vi.fn(async () => undefined),
    handleMissingParam: vi.fn(async () => undefined),
    getToolDescription: vi.fn(() => 'execute_write_query'),
    responseFormatter: { toolError: (s: string) => s, toolResult: (s: string) => s }
  }
  return { mockThis, executeQuery }
}

async function runWrite(mockThis: MockDbWriteThis, sql: string) {
  await Task.prototype['handleDbWriteToolUse'].call(
    mockThis as unknown as Task,
    {
      type: 'tool_use',
      name: 'execute_write_query',
      params: { sql },
      partial: false
    } as never
  )
}

describe('Task.handleDbWriteToolUse - preflight before approval', () => {
  it('does not prompt, connect, or execute for read-only SQL', async () => {
    const { mockThis, executeQuery } = makeDbWriteThis()
    await runWrite(mockThis, 'SELECT 1')
    expect(mockThis.askApproval).not.toHaveBeenCalled()
    expect(mockThis.getOrCreateDbAiSession).not.toHaveBeenCalled()
    expect(executeQuery).not.toHaveBeenCalled()
  })

  it('does not prompt, connect, or execute for unverifiable SQL', async () => {
    for (const sql of ['SELECT 1; DROP TABLE users', "SELECT 1 /*! INTO OUTFILE '/tmp/x' */"]) {
      const { mockThis, executeQuery } = makeDbWriteThis()
      await runWrite(mockThis, sql)
      expect(mockThis.askApproval).not.toHaveBeenCalled()
      expect(mockThis.getOrCreateDbAiSession).not.toHaveBeenCalled()
      expect(executeQuery).not.toHaveBeenCalled()
    }
  })

  it('does not prompt for SQL past the complexity budget', async () => {
    let nested = 'SELECT 1'
    for (let i = 0; i < 400; i++) nested = `WITH c${i} AS (${nested}) SELECT * FROM c${i}`
    const { mockThis, executeQuery } = makeDbWriteThis()
    await runWrite(mockThis, nested)
    expect(mockThis.askApproval).not.toHaveBeenCalled()
    expect(executeQuery).not.toHaveBeenCalled()
  })

  it('prompts once and executes for ordinary write SQL', async () => {
    const { mockThis, executeQuery } = makeDbWriteThis()
    await runWrite(mockThis, 'UPDATE t SET a=1')
    expect(mockThis.askApproval).toHaveBeenCalledTimes(1)
    expect(executeQuery).toHaveBeenCalledTimes(1)
  })

  it('prompts but does not execute when the user declines', async () => {
    const { mockThis, executeQuery } = makeDbWriteThis({ approve: false })
    await runWrite(mockThis, 'UPDATE t SET a=1')
    expect(mockThis.askApproval).toHaveBeenCalledTimes(1)
    expect(executeQuery).not.toHaveBeenCalled()
  })

  it('fails closed without prompting when dbContext carries no dialect', async () => {
    const { mockThis, executeQuery } = makeDbWriteThis()
    mockThis.dbContext = { assetId: 'a-1', dbType: undefined as never }
    await runWrite(mockThis, 'UPDATE t SET a=1')
    expect(mockThis.askApproval).not.toHaveBeenCalled()
    expect(executeQuery).not.toHaveBeenCalled()
  })
})
