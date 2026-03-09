import { Readable } from 'stream'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Mock } from 'vitest'

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

vi.mock('../offload', () => ({
  getOffloadDir: vi.fn(() => '/offload/test-task'),
  shouldOffload: vi.fn(() => false),
  writeToolOutput: vi.fn()
}))

vi.mock('fs', () => ({
  createReadStream: vi.fn((path: string) => Readable.from([path.includes('knowledgebase') ? 'file content' : '']))
}))

vi.mock('@core/prompts/responses', () => ({
  formatResponse: {
    toolError: (msg: string) => `ERROR:${msg}`
  }
}))

import { createReadStream } from 'fs'
import { Task } from '../index'
import type { ToolUse } from '@core/assistant-message'

describe('handleReadFileToolUse', () => {
  let task: any

  beforeEach(() => {
    vi.clearAllMocks()
    task = Object.create((Task as unknown as { prototype: object }).prototype) as any
    task.taskId = 'test-task'
    task.say = vi.fn().mockResolvedValue(undefined)
    task.pushToolResult = vi.fn().mockResolvedValue(undefined)
    task.saveCheckpoint = vi.fn().mockResolvedValue(undefined)
    task.getToolDescription = vi.fn(() => '[read_file]')
  })

  it('allows reading files under knowledgebase directory', async () => {
    const block: ToolUse = {
      type: 'tool_use',
      name: 'read_file',
      params: {
        path: '/Users/test/Library/Application Support/chaterm/knowledgebase/测试方案.md',
        limit: '100',
        offset: '0'
      },
      partial: false
    }

    await task.handleReadFileToolUse(block)

    expect(createReadStream).toHaveBeenCalledTimes(1)
    const [calledPath] = (createReadStream as unknown as Mock).mock.calls[0]
    expect(String(calledPath)).toContain('knowledgebase')
    expect(task.pushToolResult).toHaveBeenCalledTimes(1)
    const contentArg = task.pushToolResult.mock.calls[0][1]
    expect(contentArg).toBe('file content')
  })

  it('denies reading files outside workspace, offload, and knowledgebase directories', async () => {
    const block: ToolUse = {
      type: 'tool_use',
      name: 'read_file',
      params: {
        path: '/etc/passwd',
        limit: '10',
        offset: '0'
      },
      partial: false
    }

    await task.handleReadFileToolUse(block)

    // Should not attempt to read the file
    expect(createReadStream).not.toHaveBeenCalled()
    expect(task.pushToolResult).toHaveBeenCalledTimes(1)
    const msg = task.pushToolResult.mock.calls[0][1] as string
    expect(msg).toContain('Access denied: file is outside workspace and offload directory')
  })
})
