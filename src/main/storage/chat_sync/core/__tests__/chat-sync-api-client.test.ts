import { afterEach, describe, expect, it, vi } from 'vitest'
import { ChatSyncApiClient } from '../ChatSyncApiClient'

describe('ChatSyncApiClient', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should include device metadata in delete task snapshot requests', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({
          data: {
            task_id: 'task-1',
            server_revision: 2,
            global_revision: 10,
            op: 'delete',
            deduplicated: false,
            task_deleted: true
          }
        })
    })
    vi.stubGlobal('fetch', fetchMock)

    const client = new ChatSyncApiClient({
      baseUrl: 'https://sync.example.com',
      getAuthToken: async () => 'token-1',
      deviceId: 'device-123',
      platform: 'desktop'
    })

    await client.deleteTaskSnapshot('task-1')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://sync.example.com/v1/chat-sync/tasks/task-1?device_id=device-123&platform=desktop'
    )
  })
})
