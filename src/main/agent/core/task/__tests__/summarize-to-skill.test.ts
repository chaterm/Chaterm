//  Copyright (c) 2025-present, chaterm.ai  All rights reserved.
//  This source code is licensed under the GPL-3.0

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
vi.mock('@core/storage/state', () => ({
  getGlobalState: vi.fn(async () => ({})),
  getUserConfig: vi.fn(async () => ({}))
}))

import { Task } from '../index'
import type { ToolUse } from '../../assistant-message'
import { getGlobalState, getUserConfig } from '@core/storage/state'

describe('handleSummarizeToSkillToolUse', () => {
  let task: any
  let sayMock: ReturnType<typeof vi.fn>
  let pushToolResultMock: ReturnType<typeof vi.fn>
  let getToolDescriptionMock: ReturnType<typeof vi.fn>
  let handleMissingParamMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()

    vi.mocked(getGlobalState).mockResolvedValue({ mode: 'agent' })

    sayMock = vi.fn().mockResolvedValue(undefined)
    pushToolResultMock = vi.fn()
    getToolDescriptionMock = vi.fn().mockReturnValue('[summarize_to_skill]')
    handleMissingParamMock = vi.fn().mockResolvedValue(undefined)

    task = Object.create((Task as unknown as { prototype: object }).prototype) as any
    task.say = sayMock
    task.pushToolResult = pushToolResultMock
    task.getToolDescription = getToolDescriptionMock
    task.handleMissingParam = handleMissingParamMock
    task.saveCheckpoint = vi.fn().mockResolvedValue(undefined)
    task.addTodoStatusUpdateReminder = vi.fn().mockResolvedValue(undefined)
    task.userMessageContent = []
    task.didRejectTool = false
    task.didAlreadyUseTool = false
    task.chatermMessages = []
    task.removeClosingTag = vi.fn((_partial: boolean, _tag: string, value?: string) => value ?? '')
  })

  it('should send skill_summary message with skill_name, description, and content', async () => {
    const block: ToolUse = {
      type: 'tool_use',
      name: 'summarize_to_skill',
      params: {
        skill_name: 'deploy-docker-app',
        description: 'Deploy a Docker application to production',
        content: '# Deploy Docker App\n\n## Steps\n1. Build image\n2. Push to registry'
      },
      partial: false
    }

    await task.handleSummarizeToSkillToolUse(block)

    expect(sayMock).toHaveBeenCalledWith('skill_summary', expect.stringContaining('deploy-docker-app'), false)

    const callArg = sayMock.mock.calls[0][1]
    const parsed = JSON.parse(callArg)
    expect(parsed.skillName).toBe('deploy-docker-app')
    expect(parsed.description).toBe('Deploy a Docker application to production')
    expect(parsed.content).toContain('# Deploy Docker App')
  })

  it('should call pushToolResult with success message', async () => {
    const block: ToolUse = {
      type: 'tool_use',
      name: 'summarize_to_skill',
      params: {
        skill_name: 'test-skill',
        description: 'A test skill',
        content: 'Test content'
      },
      partial: false
    }

    await task.handleSummarizeToSkillToolUse(block)

    expect(pushToolResultMock).toHaveBeenCalled()
    const resultArg = pushToolResultMock.mock.calls[0][1]
    expect(resultArg).toContain('test-skill')
  })

  it('should handle missing skill_name parameter', async () => {
    const block: ToolUse = {
      type: 'tool_use',
      name: 'summarize_to_skill',
      params: {
        description: 'A skill without name',
        content: 'Content without skill name'
      },
      partial: false
    }

    await task.handleSummarizeToSkillToolUse(block)

    expect(handleMissingParamMock).toHaveBeenCalledWith('skill_name', expect.any(String), 'summarize_to_skill')
    expect(sayMock).not.toHaveBeenCalledWith('skill_summary', expect.anything(), expect.anything())
  })

  it('should handle missing description parameter', async () => {
    const block: ToolUse = {
      type: 'tool_use',
      name: 'summarize_to_skill',
      params: {
        skill_name: 'test-skill',
        content: 'Content without description'
      },
      partial: false
    }

    await task.handleSummarizeToSkillToolUse(block)

    expect(handleMissingParamMock).toHaveBeenCalledWith('description', expect.any(String), 'summarize_to_skill')
    expect(sayMock).not.toHaveBeenCalledWith('skill_summary', expect.anything(), expect.anything())
  })

  it('should handle missing content parameter', async () => {
    const block: ToolUse = {
      type: 'tool_use',
      name: 'summarize_to_skill',
      params: {
        skill_name: 'test-skill',
        description: 'A test skill'
      },
      partial: false
    }

    await task.handleSummarizeToSkillToolUse(block)

    expect(handleMissingParamMock).toHaveBeenCalledWith('content', expect.any(String), 'summarize_to_skill')
    expect(sayMock).not.toHaveBeenCalledWith('skill_summary', expect.anything(), expect.anything())
  })

  it('should stream skill_summary when tool is partial', async () => {
    const block: ToolUse = {
      type: 'tool_use',
      name: 'summarize_to_skill',
      params: {
        skill_name: 'partial-skill',
        description: 'Partial description',
        content: '# Part 1'
      },
      partial: true
    }

    await task.handleToolUse(block)

    expect(sayMock).toHaveBeenCalledWith('skill_summary', expect.any(String), true)
    const callArg = sayMock.mock.calls[0][1]
    const parsed = JSON.parse(callArg)
    expect(parsed.skillName).toBe('partial-skill')
    expect(parsed.description).toBe('Partial description')
    expect(parsed.content).toContain('# Part 1')
  })

  it('should handle partial block with incomplete parameters', async () => {
    const block: ToolUse = {
      type: 'tool_use',
      name: 'summarize_to_skill',
      params: {
        skill_name: 'partial-skill'
      },
      partial: true
    }

    await task.handleSummarizeToSkillToolUse(block)

    expect(sayMock).toHaveBeenCalledWith('skill_summary', expect.any(String), true)
    expect(handleMissingParamMock).not.toHaveBeenCalled()
    const callArg = sayMock.mock.calls[0][1]
    const parsed = JSON.parse(callArg)
    expect(parsed.skillName).toBe('partial-skill')
    expect(parsed.description).toBe('')
    expect(parsed.content).toBe('')
  })

  it('should handle partial block with no parameters', async () => {
    const block: ToolUse = {
      type: 'tool_use',
      name: 'summarize_to_skill',
      params: {},
      partial: true
    }

    await task.handleSummarizeToSkillToolUse(block)

    expect(sayMock).toHaveBeenCalledWith('skill_summary', expect.any(String), true)
    expect(handleMissingParamMock).not.toHaveBeenCalled()
    const callArg = sayMock.mock.calls[0][1]
    const parsed = JSON.parse(callArg)
    expect(parsed.skillName).toBe('')
    expect(parsed.description).toBe('')
    expect(parsed.content).toBe('')
  })
})

describe('processSlashCommands for summary-to-skill', () => {
  let task: any

  beforeEach(async () => {
    vi.clearAllMocks()

    vi.mocked(getUserConfig).mockResolvedValue({ language: 'en-US' })

    task = Object.create((Task as unknown as { prototype: object }).prototype) as any
    task.summarizeUpToTs = undefined
    task.chatermMessages = [
      { ts: 1000, conversationHistoryIndex: 0 },
      { ts: 2000, conversationHistoryIndex: 1 },
      { ts: 3000, conversationHistoryIndex: 2 }
    ]
  })

  it('should extract summarizeUpToTs from skill command chip', async () => {
    const userContent: any[] = [{ type: 'text', text: '/summary-to-skill' }]
    const contentParts: any[] = [
      {
        type: 'chip',
        chipType: 'command',
        ref: {
          command: '/summary-to-skill',
          label: '/Summary to Skill',
          summarizeUpToTs: 2500
        }
      }
    ]

    await task.processSlashCommands(userContent, contentParts)

    expect(task.summarizeUpToTs).toBe(2500)
  })

  it('should replace slash command with full skill prompt', async () => {
    const userContent: any[] = [{ type: 'text', text: '/summary-to-skill' }]
    const contentParts: any[] = [
      {
        type: 'chip',
        chipType: 'command',
        ref: {
          command: '/summary-to-skill',
          label: '/Summary to Skill',
          summarizeUpToTs: 2000
        }
      }
    ]

    await task.processSlashCommands(userContent, contentParts)

    expect(userContent[0].text).toContain('summarize_to_skill')
    expect(userContent[0].text).toContain('ONLY use summarize_to_skill')
  })
})
