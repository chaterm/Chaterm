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
import type { ContentPart } from '@shared/WebviewMessage'
import type { Anthropic } from '@anthropic-ai/sdk'

describe('processContentParts', () => {
  let task: any

  beforeEach(() => {
    vi.clearAllMocks()

    task = Object.create((Task as unknown as { prototype: object }).prototype) as any

    // Do not alter userContent in this test
    task.processSlashCommands = vi.fn().mockResolvedValue(undefined)

    // Only provide doc refs, no past chats
    task.buildContextRefsFromContentParts = vi.fn((_parts: ContentPart[]) => ({
      docs: [
        {
          absPath: '/path/to/doc.md',
          type: 'file'
        }
      ],
      pastChats: []
    }))

    // Stub readFile to avoid real filesystem access
    task.readFile = vi.fn(async () => ({
      content: 'fake content of doc',
      meta: { mtimeMs: 0, bytes: 123, truncated: false }
    }))
  })

  it('should not build context-prefetch block when only doc chips are present', async () => {
    const userContent: Anthropic.ContentBlockParam[] = []
    const contentParts: ContentPart[] = [
      {
        type: 'chip',
        chipType: 'doc',
        // Actual structure is irrelevant because buildContextRefsFromContentParts is mocked
        ref: { absPath: '/path/to/doc.md', type: 'file' } as any
      }
    ]

    const blocks = await task.processContentParts(userContent, contentParts)

    expect(blocks).toEqual([])
    expect(task.processSlashCommands).toHaveBeenCalled()
    expect(task.buildContextRefsFromContentParts).toHaveBeenCalledWith(contentParts)
  })
})
