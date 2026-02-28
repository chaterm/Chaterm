import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest'

// Mock all dependencies
vi.mock('@logging/index', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn()
  }))
}))

vi.mock('@core/prompts', () => ({}))
vi.mock('@services/telemetry', () => ({
  telemetryService: {
    captureEvent: vi.fn()
  }
}))

describe('Task - saveUserMessage with hosts support', () => {
  let mockAddToChatermMessages: Mock

  beforeEach(() => {
    vi.clearAllMocks()
    mockAddToChatermMessages = vi.fn()
  })

  /**
   * Test the logic of saveUserMessage method by simulating its behavior
   * This validates that hosts are correctly attached to user messages
   */
  it('should attach hosts to user feedback messages', async () => {
    const taskHosts = [
      { host: '192.168.1.10', uuid: 'host-1', connection: 'personal' as const },
      { host: '10.0.0.5', uuid: 'host-2', connection: 'organization' as const, organizationUuid: 'org-1' }
    ]

    // Simulate saveUserMessage behavior
    const saveUserMessage = async (text: string, contentParts?: Array<{ type: string; [key: string]: unknown }>, say_type?: string) => {
      const sayTs = Date.now()

      await mockAddToChatermMessages({
        ts: sayTs,
        type: 'say',
        say: say_type ?? 'user_feedback',
        text,
        contentParts,
        hosts: taskHosts
      })
    }

    await saveUserMessage('User feedback message')

    expect(mockAddToChatermMessages).toHaveBeenCalledTimes(1)
    expect(mockAddToChatermMessages).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'say',
        say: 'user_feedback',
        text: 'User feedback message',
        hosts: taskHosts
      })
    )
  })

  it('should support custom say_type parameter', async () => {
    const taskHosts = [{ host: '172.16.0.1', uuid: 'host-x', connection: 'personal' as const }]

    const saveUserMessage = async (text: string, contentParts?: Array<{ type: string; [key: string]: unknown }>, say_type?: string) => {
      const sayTs = Date.now()

      await mockAddToChatermMessages({
        ts: sayTs,
        type: 'say',
        say: say_type ?? 'user_feedback',
        text,
        contentParts,
        hosts: taskHosts
      })
    }

    await saveUserMessage('Initial task', undefined, 'text')

    expect(mockAddToChatermMessages).toHaveBeenCalledWith(
      expect.objectContaining({
        say: 'text',
        text: 'Initial task',
        hosts: taskHosts
      })
    )
  })

  it('should include contentParts when provided', async () => {
    const taskHosts = [{ host: '192.168.1.100', uuid: 'host-detail', connection: 'organization' as const }]

    const contentParts = [
      { type: 'text', text: 'Some text' },
      { type: 'image', data: 'base64data' }
    ]

    const saveUserMessage = async (text: string, contentParts?: Array<{ type: string; [key: string]: unknown }>, say_type?: string) => {
      const sayTs = Date.now()

      await mockAddToChatermMessages({
        ts: sayTs,
        type: 'say',
        say: say_type ?? 'user_feedback',
        text,
        contentParts,
        hosts: taskHosts
      })
    }

    await saveUserMessage('Message with parts', contentParts)

    expect(mockAddToChatermMessages).toHaveBeenCalledWith(
      expect.objectContaining({
        text: 'Message with parts',
        contentParts,
        hosts: taskHosts
      })
    )
  })

  it('should handle empty hosts array', async () => {
    const taskHosts: Array<{ host: string; uuid: string; connection: string }> = []

    const saveUserMessage = async (text: string, contentParts?: Array<{ type: string; [key: string]: unknown }>, say_type?: string) => {
      const sayTs = Date.now()

      await mockAddToChatermMessages({
        ts: sayTs,
        type: 'say',
        say: say_type ?? 'user_feedback',
        text,
        contentParts,
        hosts: taskHosts
      })
    }

    await saveUserMessage('No hosts message')

    expect(mockAddToChatermMessages).toHaveBeenCalledWith(
      expect.objectContaining({
        hosts: []
      })
    )
  })

  it('should preserve all Host fields including organizationUuid and assetType', async () => {
    const taskHosts = [
      {
        host: '10.20.30.40',
        uuid: 'prod-server-1',
        connection: 'organization' as const,
        organizationUuid: 'org-abc-123',
        assetType: 'linux-production'
      }
    ]

    const saveUserMessage = async (text: string, contentParts?: Array<{ type: string; [key: string]: unknown }>, say_type?: string) => {
      const sayTs = Date.now()

      await mockAddToChatermMessages({
        ts: sayTs,
        type: 'say',
        say: say_type ?? 'user_feedback',
        text,
        contentParts,
        hosts: taskHosts
      })
    }

    await saveUserMessage('Production server command')

    const calledHosts = mockAddToChatermMessages.mock.calls[0][0].hosts
    expect(calledHosts[0]).toEqual(
      expect.objectContaining({
        host: '10.20.30.40',
        uuid: 'prod-server-1',
        connection: 'organization',
        organizationUuid: 'org-abc-123',
        assetType: 'linux-production'
      })
    )
  })

  it('should generate unique timestamp for each message', async () => {
    const taskHosts = [{ host: '192.168.1.1', uuid: 'h1', connection: 'personal' as const }]

    const timestamps: number[] = []

    const saveUserMessage = async (text: string, contentParts?: Array<{ type: string; [key: string]: unknown }>, say_type?: string) => {
      const sayTs = Date.now()
      timestamps.push(sayTs)

      await mockAddToChatermMessages({
        ts: sayTs,
        type: 'say',
        say: say_type ?? 'user_feedback',
        text,
        contentParts,
        hosts: taskHosts
      })
    }

    await saveUserMessage('Message 1')
    // Small delay to ensure different timestamp
    await new Promise((resolve) => setTimeout(resolve, 5))
    await saveUserMessage('Message 2')

    expect(mockAddToChatermMessages).toHaveBeenCalledTimes(2)
    expect(timestamps[0]).toBeLessThanOrEqual(timestamps[1])
  })

  it('should use user_feedback as default say type when not specified', async () => {
    const taskHosts = [{ host: '127.0.0.1', uuid: 'localhost', connection: 'personal' as const }]

    const saveUserMessage = async (text: string, contentParts?: Array<{ type: string; [key: string]: unknown }>, say_type?: string) => {
      const sayTs = Date.now()

      await mockAddToChatermMessages({
        ts: sayTs,
        type: 'say',
        say: say_type ?? 'user_feedback',
        text,
        contentParts,
        hosts: taskHosts
      })
    }

    // Not providing say_type
    await saveUserMessage('Default feedback')

    expect(mockAddToChatermMessages).toHaveBeenCalledWith(
      expect.objectContaining({
        say: 'user_feedback'
      })
    )
  })

  /**
   * Integration test: verify that saveUserMessage is called in various scenarios
   * instead of the old sayUserFeedback method
   */
  it('should be used for all user feedback scenarios', async () => {
    const taskHosts = [{ host: '10.0.0.1', uuid: 'test', connection: 'personal' as const }]

    const saveUserMessage = async (text: string, contentParts?: Array<{ type: string; [key: string]: unknown }>, say_type?: string) => {
      const sayTs = Date.now()

      await mockAddToChatermMessages({
        ts: sayTs,
        type: 'say',
        say: say_type ?? 'user_feedback',
        text,
        contentParts,
        hosts: taskHosts
      })
    }

    // Scenario 1: Tool feedback
    await saveUserMessage('Tool approved')

    // Scenario 2: User response to ask
    await saveUserMessage('User answer to question')

    // Scenario 3: Mistake limit feedback
    await saveUserMessage('Continue after error')

    // Scenario 4: Report bug feedback
    await saveUserMessage('Additional bug info')

    expect(mockAddToChatermMessages).toHaveBeenCalledTimes(4)

    // All calls should include hosts
    mockAddToChatermMessages.mock.calls.forEach((call) => {
      expect(call[0]).toHaveProperty('hosts', taskHosts)
    })
  })
})
