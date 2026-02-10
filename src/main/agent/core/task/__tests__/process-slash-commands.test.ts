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
  getUserConfig: vi.fn(async () => ({ language: 'zh-CN' }))
}))

import { Task } from '../index'
import type { ContentPart } from '@shared/WebviewMessage'
import type { Anthropic } from '@anthropic-ai/sdk'

describe('processSlashCommands', () => {
  let task: any
  let readFileMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()

    readFileMock = vi.fn(async (path: string) => {
      // Extract filename without extension for generating unique content
      const filename = path.split('/').pop()?.replace('.md', '') || 'unknown'
      return {
        content: `Content of ${filename} knowledge base file`,
        meta: { mtimeMs: 123456, bytes: 100, truncated: false }
      }
    })

    task = Object.create((Task as unknown as { prototype: object }).prototype) as any
    task.readFile = readFileMock
    task.summarizeUpToTs = undefined
  })

  describe('built-in commands', () => {
    it('should expand /summary-to-doc command in standalone block', async () => {
      const userContent: Anthropic.ContentBlockParam[] = [{ type: 'text', text: '/summary-to-doc' }]
      const contentParts: ContentPart[] = [
        {
          type: 'chip',
          chipType: 'command',
          ref: { command: '/summary-to-doc', label: '/Summary to Doc' }
        }
      ]

      await task.processSlashCommands(userContent, contentParts)

      expect(userContent).toHaveLength(1)
      expect(userContent[0].type).toBe('text')
      const text = (userContent[0] as Anthropic.TextBlockParam).text
      expect(text).not.toContain('/summary-to-doc')
      expect(text).toContain('分析对话')
      expect(text).toContain('summarize_to_knowledge')
    })

    it('should expand command in completion_result feedback scenario', async () => {
      const userContent: Anthropic.ContentBlockParam[] = [
        {
          type: 'text',
          text: `The user has provided feedback on the results. Consider their input to continue the task, and then attempt completion again.
<feedback>
/summary-to-doc
</feedback>`
        }
      ]
      const contentParts: ContentPart[] = [
        {
          type: 'chip',
          chipType: 'command',
          ref: { command: '/summary-to-doc', label: '/Summary to Doc' }
        }
      ]

      await task.processSlashCommands(userContent, contentParts)

      expect(userContent).toHaveLength(1)
      const text = (userContent[0] as Anthropic.TextBlockParam).text
      expect(text).not.toContain('/summary-to-doc')
      expect(text).toContain('<feedback>')
      expect(text).toContain('summarize_to_knowledge')
    })

    it('should expand command mixed with other text', async () => {
      const userContent: Anthropic.ContentBlockParam[] = [{ type: 'text', text: '帮我总结 /summary-to-doc 然后生成文档' }]
      const contentParts: ContentPart[] = [
        {
          type: 'chip',
          chipType: 'command',
          ref: { command: '/summary-to-doc', label: '/Summary to Doc' }
        }
      ]

      await task.processSlashCommands(userContent, contentParts)

      const text = (userContent[0] as Anthropic.TextBlockParam).text
      expect(text).toContain('帮我总结')
      expect(text).toContain('然后生成文档')
      expect(text).not.toContain('/summary-to-doc')
      expect(text).toContain('summarize_to_knowledge')
    })

    it('should set summarizeUpToTs when provided', async () => {
      const userContent: Anthropic.ContentBlockParam[] = [{ type: 'text', text: '/summary-to-doc' }]
      const contentParts: ContentPart[] = [
        {
          type: 'chip',
          chipType: 'command',
          ref: { command: '/summary-to-doc', label: '/Summary to Doc', summarizeUpToTs: 123456789 }
        }
      ]

      await task.processSlashCommands(userContent, contentParts)

      expect(task.summarizeUpToTs).toBe(123456789)
    })
  })

  describe('knowledge base commands', () => {
    it('should expand knowledge base command with file content', async () => {
      const userContent: Anthropic.ContentBlockParam[] = [{ type: 'text', text: '/deploy-guide' }]
      const contentParts: ContentPart[] = [
        {
          type: 'chip',
          chipType: 'command',
          ref: { command: '/deploy-guide', label: '/Deploy Guide', path: '/path/to/commands/deploy-guide.md' }
        }
      ]

      await task.processSlashCommands(userContent, contentParts)

      expect(readFileMock).toHaveBeenCalledWith('/path/to/commands/deploy-guide.md', 256 * 1024)
      const text = (userContent[0] as Anthropic.TextBlockParam).text
      expect(text).not.toContain('/deploy-guide')
      expect(text).toContain('Content of deploy-guide knowledge base file')
    })

    it('should handle file read error gracefully', async () => {
      readFileMock.mockRejectedValueOnce(new Error('File not found'))

      const userContent: Anthropic.ContentBlockParam[] = [{ type: 'text', text: '/missing-command' }]
      const contentParts: ContentPart[] = [
        {
          type: 'chip',
          chipType: 'command',
          ref: { command: '/missing-command', label: '/Missing Command', path: '/path/to/missing.md' }
        }
      ]

      await task.processSlashCommands(userContent, contentParts)

      const text = (userContent[0] as Anthropic.TextBlockParam).text
      expect(text).toContain('[Error: Failed to load command file /path/to/missing.md]')
    })

    it('should expand multiple knowledge base commands', async () => {
      const userContent: Anthropic.ContentBlockParam[] = [{ type: 'text', text: '/deploy-guide 和 /troubleshooting' }]
      const contentParts: ContentPart[] = [
        {
          type: 'chip',
          chipType: 'command',
          ref: { command: '/deploy-guide', label: '/Deploy Guide', path: '/path/to/deploy-guide.md' }
        },
        {
          type: 'chip',
          chipType: 'command',
          ref: { command: '/troubleshooting', label: '/Troubleshooting', path: '/path/to/troubleshooting.md' }
        }
      ]

      await task.processSlashCommands(userContent, contentParts)

      const text = (userContent[0] as Anthropic.TextBlockParam).text
      expect(text).not.toContain('/deploy-guide')
      expect(text).not.toContain('/troubleshooting')
      expect(text).toContain('Content of deploy-guide knowledge base file')
      expect(text).toContain('Content of troubleshooting knowledge base file')
    })
  })

  describe('edge cases', () => {
    it('should do nothing when no contentParts provided', async () => {
      const userContent: Anthropic.ContentBlockParam[] = [{ type: 'text', text: 'Hello' }]

      await task.processSlashCommands(userContent, undefined)

      expect(userContent[0]).toEqual({ type: 'text', text: 'Hello' })
    })

    it('should do nothing when no command chips in contentParts', async () => {
      const userContent: Anthropic.ContentBlockParam[] = [{ type: 'text', text: 'Hello' }]
      const contentParts: ContentPart[] = [{ type: 'chip', chipType: 'doc', ref: { absPath: '/path/to/doc.md' } }]

      await task.processSlashCommands(userContent, contentParts)

      expect(userContent[0]).toEqual({ type: 'text', text: 'Hello' })
    })

    it('should expand same command multiple times in text', async () => {
      const userContent: Anthropic.ContentBlockParam[] = [{ type: 'text', text: '先 /summary-to-doc 再 /summary-to-doc' }]
      const contentParts: ContentPart[] = [
        {
          type: 'chip',
          chipType: 'command',
          ref: { command: '/summary-to-doc', label: '/Summary to Doc' }
        }
      ]

      await task.processSlashCommands(userContent, contentParts)

      const text = (userContent[0] as Anthropic.TextBlockParam).text
      expect(text).not.toContain('/summary-to-doc')
      // Both occurrences should be replaced
      const matches = text.match(/summarize_to_knowledge/g)
      expect(matches).toHaveLength(2)
    })
  })
})
