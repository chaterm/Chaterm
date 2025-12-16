import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const { mockDeleteServerMcpToolStates, mockGetCurrentUserId, mockInitChatermDatabase } = vi.hoisted(() => {
  return {
    mockDeleteServerMcpToolStates: vi.fn(),
    mockGetCurrentUserId: vi.fn(() => 1),
    mockInitChatermDatabase: vi.fn(async () => ({ exec: vi.fn(), prepare: vi.fn() }))
  }
})

vi.mock('electron', () => ({
  app: { getAppPath: () => '' },
  BrowserWindow: { fromWebContents: () => null },
  dialog: {
    showOpenDialog: vi.fn(async () => ({ canceled: true, filePaths: [] })),
    showSaveDialog: vi.fn(async () => ({ canceled: true, filePath: '' }))
  },
  ipcMain: { handle: vi.fn(), on: vi.fn(), once: vi.fn(), removeAllListeners: vi.fn() }
}))

vi.mock('@storage/db/connection', () => ({
  getCurrentUserId: mockGetCurrentUserId,
  initChatermDatabase: mockInitChatermDatabase
}))

vi.mock('@storage/db/chaterm.service', () => {
  const mockDbServiceInstance = {
    deleteServerMcpToolStates: mockDeleteServerMcpToolStates,
    getUserId: () => 1
  }

  return {
    ChatermDatabaseService: {
      getInstance: vi.fn(async () => mockDbServiceInstance)
    }
  }
})

vi.mock('../../../../../ssh/sshHandle', () => ({}))

vi.mock('chokidar', () => ({
  default: { watch: vi.fn(() => ({ on: vi.fn(), close: vi.fn() })) },
  watch: vi.fn(() => ({ on: vi.fn(), close: vi.fn() }))
}))

vi.mock('fs/promises', () => {
  return {
    readFile: vi.fn(async () => JSON.stringify({ mcpServers: { a: {}, b: {}, c: {} } })),
    writeFile: vi.fn(async () => undefined)
  }
})

import { McpHub } from '../McpHub'
import { parseCommand } from '../McpHub'
import * as fsp from 'fs/promises'
import * as schemas from '../schemas'
import * as constants from '../constants'

describe('McpHub - Pure Function Tests', () => {
  const getPath = async () => '/tmp/mock'
  let hub: McpHub

  beforeEach(async () => {
    vi.clearAllMocks()
    // Mock empty configuration to prevent auto-initialization loading servers
    ;(fsp.readFile as any).mockResolvedValue(JSON.stringify({ mcpServers: {} }))
    hub = new McpHub(getPath, getPath, '1.0.0')
    // Wait for initialization in constructor to complete
    await new Promise((resolve) => setTimeout(resolve, 10))
  })

  describe('getSortedMcpServers', () => {
    beforeEach(() => {
      ;(hub as any).connections = [
        { server: { name: 'server-b', status: 'connected' } },
        { server: { name: 'server-c', status: 'disconnected' } },
        { server: { name: 'server-a', status: 'connecting' } }
      ]
    })

    it('should sort servers in given order', () => {
      const serverOrder = ['server-a', 'server-b', 'server-c']
      const sorted = hub.getSortedMcpServers(serverOrder)

      expect(sorted.map((s) => s.name)).toEqual(['server-a', 'server-b', 'server-c'])
    })

    it('empty serverOrder should return unsorted server list', () => {
      const sorted = hub.getSortedMcpServers([])
      expect(sorted).toHaveLength(3)
    })
  })

  describe('getActiveServers', () => {
    beforeEach(() => {
      ;(hub as any).connections = [
        { server: { name: 'enabled-1', disabled: false } },
        { server: { name: 'disabled-1', disabled: true } },
        { server: { name: 'enabled-2', disabled: false } },
        { server: { name: 'disabled-2', disabled: true } }
      ]
    })

    it('should return only enabled servers', () => {
      const active = hub.getActiveServers()

      expect(active).toHaveLength(2)
      expect(active.map((s) => s.name)).toEqual(['enabled-1', 'enabled-2'])
    })

    it('should return empty array when all servers are disabled', () => {
      ;(hub as any).connections = [{ server: { name: 'disabled-1', disabled: true } }, { server: { name: 'disabled-2', disabled: true } }]

      const active = hub.getActiveServers()
      expect(active).toEqual([])
    })
  })

  describe('getAllServers', () => {
    beforeEach(() => {
      ;(hub as any).connections = [
        { server: { name: 'server-1', disabled: false } },
        { server: { name: 'server-2', disabled: true } },
        { server: { name: 'server-3', disabled: false } }
      ]
    })

    it('should return all servers regardless of disabled status', () => {
      const all = hub.getAllServers()

      expect(all).toHaveLength(3)
      expect(all.map((s) => s.name)).toEqual(['server-1', 'server-2', 'server-3'])
    })

    it('should return empty array when no connections exist', () => {
      ;(hub as any).connections = []

      const all = hub.getAllServers()
      expect(all).toEqual([])
    })
  })

  describe('calculateReconnectDelay (private method)', () => {
    it('first reconnect should return initial delay', () => {
      const delay = (hub as any).calculateReconnectDelay(0)
      expect(delay).toBe(constants.INITIAL_RECONNECT_DELAY_MS)
    })

    it('should use exponential backoff strategy', () => {
      const delay1 = (hub as any).calculateReconnectDelay(1)
      const delay2 = (hub as any).calculateReconnectDelay(2)
      const delay3 = (hub as any).calculateReconnectDelay(3)

      expect(delay1).toBe(constants.INITIAL_RECONNECT_DELAY_MS * 2)
      expect(delay2).toBe(constants.INITIAL_RECONNECT_DELAY_MS * 4)
      expect(delay3).toBe(constants.INITIAL_RECONNECT_DELAY_MS * 8)
    })

    it('delay should not exceed maximum value', () => {
      const delay = (hub as any).calculateReconnectDelay(100)
      expect(delay).toBe(constants.MAX_RECONNECT_DELAY_MS)
    })
  })

  describe('appendErrorMessage (private method)', () => {
    it('should add new error to empty error message', () => {
      const connection: any = { server: { error: '' } }
      ;(hub as any).appendErrorMessage(connection, 'New error')

      expect(connection.server.error).toBe('New error')
    })

    it('should append new error to existing error message', () => {
      const connection: any = { server: { error: 'Old error' } }
      ;(hub as any).appendErrorMessage(connection, 'New error')

      expect(connection.server.error).toBe('Old error\nNew error')
    })
  })
})

describe('parseCommand', () => {
  it('standard format: command with single argument', () => {
    const r = parseCommand('uvx package@latest')
    expect(r).toEqual({ command: 'uvx', args: ['package@latest'] })
  })

  it('with multiple arguments', () => {
    const r = parseCommand('npx -y package')
    expect(r).toEqual({ command: 'npx', args: ['-y', 'package'] })
  })

  it('quoted arguments should preserve integrity', () => {
    const r = parseCommand('python -m "my module"')
    expect(r).toEqual({ command: 'python', args: ['-m', 'my module'] })
  })

  it('should trim excess whitespace', () => {
    const r = parseCommand('  uvx  package  ')
    expect(r).toEqual({ command: 'uvx', args: ['package'] })
  })

  it('empty string should throw error', () => {
    expect(() => parseCommand('   ')).toThrow()
  })
})

describe('McpHub - Notification System Tests', () => {
  const getPath = async () => '/tmp/mock'
  let hub: McpHub

  beforeEach(async () => {
    vi.clearAllMocks()
    ;(fsp.readFile as any).mockResolvedValue(JSON.stringify({ mcpServers: {} }))
    hub = new McpHub(getPath, getPath, '1.0.0')
    await new Promise((resolve) => setTimeout(resolve, 10))
  })

  describe('getPendingNotifications', () => {
    it('should return all pending notifications', () => {
      ;(hub as any).pendingNotifications = [
        { serverName: 'server-1', level: 'info', message: 'msg1', timestamp: 1000 },
        { serverName: 'server-2', level: 'error', message: 'msg2', timestamp: 2000 }
      ]

      const notifications = hub.getPendingNotifications()

      expect(notifications).toHaveLength(2)
      expect(notifications[0].message).toBe('msg1')
      expect(notifications[1].message).toBe('msg2')
    })

    it('should clear notification list after retrieval', () => {
      ;(hub as any).pendingNotifications = [{ serverName: 'server-1', level: 'info', message: 'msg1', timestamp: 1000 }]

      hub.getPendingNotifications()
      const secondCall = hub.getPendingNotifications()

      expect(secondCall).toEqual([])
    })

    it('should return empty array when no notifications exist', () => {
      const notifications = hub.getPendingNotifications()
      expect(notifications).toEqual([])
    })
  })

  describe('setNotificationCallback', () => {
    it('should set notification callback function', () => {
      const callback = vi.fn()
      hub.setNotificationCallback(callback)

      expect((hub as any).notificationCallback).toBe(callback)
    })
  })

  describe('clearNotificationCallback', () => {
    it('should clear notification callback function', () => {
      const callback = vi.fn()
      hub.setNotificationCallback(callback)
      hub.clearNotificationCallback()

      expect((hub as any).notificationCallback).toBeUndefined()
    })
  })
})

describe('readAndValidateMcpSettingsFile', () => {
  const getPath = async () => '/tmp/mock'
  let hub: McpHub

  beforeEach(async () => {
    vi.clearAllMocks()
    ;(fsp.readFile as any).mockResolvedValue(JSON.stringify({ mcpServers: {} }))
    hub = new McpHub(getPath, getPath, '1.0.0')
    await new Promise((resolve) => setTimeout(resolve, 10))
  })

  it('valid JSON with passing schema should return config object', async () => {
    ;(fsp.readFile as any).mockResolvedValueOnce(JSON.stringify({ mcpServers: { a: { command: 'uvx' } } }))

    const res = await (hub as any).readAndValidateMcpSettingsFile()
    expect(res).toMatchObject({ mcpServers: { a: { command: 'uvx', type: 'stdio' } } })
  })

  it('should return undefined when JSON parsing fails', async () => {
    ;(fsp.readFile as any).mockResolvedValueOnce('not json')

    const res = await (hub as any).readAndValidateMcpSettingsFile()
    expect(res).toBeUndefined()
  })

  it('should return undefined when schema validation fails', async () => {
    ;(fsp.readFile as any).mockResolvedValueOnce(JSON.stringify({ mcpServers: { a: { type: 'stdio' } } }))

    const original = (schemas as any).McpSettingsSchema.safeParse
    ;(schemas as any).McpSettingsSchema.safeParse = vi.fn(() => ({ success: false }))

    const res = await (hub as any).readAndValidateMcpSettingsFile()
    expect(res).toBeUndefined()
    ;(schemas as any).McpSettingsSchema.safeParse = original
  })

  it('should return undefined when file read exception occurs', async () => {
    ;(fsp.readFile as any).mockRejectedValueOnce(new Error('read fail'))

    const res = await (hub as any).readAndValidateMcpSettingsFile()
    expect(res).toBeUndefined()
  })

  it('empty object should pass validation', async () => {
    ;(fsp.readFile as any).mockResolvedValueOnce(JSON.stringify({ mcpServers: {} }))

    const res = await (hub as any).readAndValidateMcpSettingsFile()
    expect(res).toMatchObject({ mcpServers: {} })
  })

  it('should return undefined when mcpServers field is missing', async () => {
    ;(fsp.readFile as any).mockResolvedValueOnce(JSON.stringify({}))

    const res = await (hub as any).readAndValidateMcpSettingsFile()
    expect(res).toBeUndefined()
  })

  it('should return undefined when mcpServers is not object (array)', async () => {
    ;(fsp.readFile as any).mockResolvedValueOnce(JSON.stringify({ mcpServers: [] }))

    const res = await (hub as any).readAndValidateMcpSettingsFile()
    expect(res).toBeUndefined()
  })

  it('should return undefined when mcpServers is not object (string)', async () => {
    ;(fsp.readFile as any).mockResolvedValueOnce(JSON.stringify({ mcpServers: 'invalid' }))

    const res = await (hub as any).readAndValidateMcpSettingsFile()
    expect(res).toBeUndefined()
  })

  it('should return undefined when stdio type lacks required command field', async () => {
    ;(fsp.readFile as any).mockResolvedValueOnce(JSON.stringify({ mcpServers: { server1: { type: 'stdio', args: ['--help'] } } }))

    const res = await (hub as any).readAndValidateMcpSettingsFile()
    expect(res).toBeUndefined()
  })

  it('should return undefined when command is not string', async () => {
    ;(fsp.readFile as any).mockResolvedValueOnce(JSON.stringify({ mcpServers: { server1: { command: 123 } } }))

    const res = await (hub as any).readAndValidateMcpSettingsFile()
    expect(res).toBeUndefined()
  })

  it('should return undefined when args is not array', async () => {
    ;(fsp.readFile as any).mockResolvedValueOnce(JSON.stringify({ mcpServers: { server1: { command: 'uvx', args: 'not-array' } } }))

    const res = await (hub as any).readAndValidateMcpSettingsFile()
    expect(res).toBeUndefined()
  })

  it('should return undefined when args contains non-string elements', async () => {
    ;(fsp.readFile as any).mockResolvedValueOnce(JSON.stringify({ mcpServers: { server1: { command: 'uvx', args: [1, 2, 3] } } }))

    const res = await (hub as any).readAndValidateMcpSettingsFile()
    expect(res).toBeUndefined()
  })

  it('should return undefined when env is not object', async () => {
    ;(fsp.readFile as any).mockResolvedValueOnce(JSON.stringify({ mcpServers: { server1: { command: 'uvx', env: 'not-object' } } }))

    const res = await (hub as any).readAndValidateMcpSettingsFile()
    expect(res).toBeUndefined()
  })

  it('should return undefined when env value is not string', async () => {
    ;(fsp.readFile as any).mockResolvedValueOnce(JSON.stringify({ mcpServers: { server1: { command: 'uvx', env: { KEY: 123 } } } }))

    const res = await (hub as any).readAndValidateMcpSettingsFile()
    expect(res).toBeUndefined()
  })

  it('should return undefined when http type lacks required url field', async () => {
    ;(fsp.readFile as any).mockResolvedValueOnce(JSON.stringify({ mcpServers: { server1: { type: 'http', headers: {} } } }))

    const res = await (hub as any).readAndValidateMcpSettingsFile()
    expect(res).toBeUndefined()
  })

  it('should return undefined when url format is invalid', async () => {
    ;(fsp.readFile as any).mockResolvedValueOnce(JSON.stringify({ mcpServers: { server1: { type: 'http', url: 'not-a-valid-url' } } }))

    const res = await (hub as any).readAndValidateMcpSettingsFile()
    expect(res).toBeUndefined()
  })

  it('should return undefined when headers is not object', async () => {
    ;(fsp.readFile as any).mockResolvedValueOnce(
      JSON.stringify({ mcpServers: { server1: { type: 'http', url: 'http://example.com', headers: 'invalid' } } })
    )

    const res = await (hub as any).readAndValidateMcpSettingsFile()
    expect(res).toBeUndefined()
  })

  it('should return undefined when timeout is below minimum value', async () => {
    ;(fsp.readFile as any).mockResolvedValueOnce(JSON.stringify({ mcpServers: { server1: { command: 'uvx', timeout: 0 } } }))

    const res = await (hub as any).readAndValidateMcpSettingsFile()
    expect(res).toBeUndefined()
  })

  it('should return undefined when disabled is not boolean', async () => {
    ;(fsp.readFile as any).mockResolvedValueOnce(JSON.stringify({ mcpServers: { server1: { command: 'uvx', disabled: 'yes' } } }))

    const res = await (hub as any).readAndValidateMcpSettingsFile()
    expect(res).toBeUndefined()
  })

  it('should return undefined when autoApprove is not array', async () => {
    ;(fsp.readFile as any).mockResolvedValueOnce(JSON.stringify({ mcpServers: { server1: { command: 'uvx', autoApprove: 'string' } } }))

    const res = await (hub as any).readAndValidateMcpSettingsFile()
    expect(res).toBeUndefined()
  })

  it('should return undefined when autoApprove contains non-string elements', async () => {
    ;(fsp.readFile as any).mockResolvedValueOnce(JSON.stringify({ mcpServers: { server1: { command: 'uvx', autoApprove: [1, 2, 3] } } }))

    const res = await (hub as any).readAndValidateMcpSettingsFile()
    expect(res).toBeUndefined()
  })

  it('complete valid stdio configuration should pass validation', async () => {
    ;(fsp.readFile as any).mockResolvedValueOnce(
      JSON.stringify({
        mcpServers: {
          server1: {
            command: 'uvx',
            args: ['mcp-server-fetch'],
            env: { NODE_ENV: 'production' },
            cwd: '/home/user',
            timeout: 60,
            disabled: false,
            autoApprove: ['fetch']
          }
        }
      })
    )

    const res = await (hub as any).readAndValidateMcpSettingsFile()
    expect(res).toBeDefined()
    expect(res?.mcpServers.server1).toMatchObject({
      command: 'uvx',
      args: ['mcp-server-fetch'],
      env: { NODE_ENV: 'production' },
      type: 'stdio'
    })
  })

  it('complete valid http configuration should pass validation', async () => {
    ;(fsp.readFile as any).mockResolvedValueOnce(
      JSON.stringify({
        mcpServers: {
          server1: {
            type: 'http',
            url: 'http://localhost:3000',
            headers: { Authorization: 'Bearer token' },
            timeout: 30
          }
        }
      })
    )

    const res = await (hub as any).readAndValidateMcpSettingsFile()
    expect(res).toBeDefined()
    expect(res?.mcpServers.server1).toMatchObject({
      type: 'http',
      url: 'http://localhost:3000',
      headers: { Authorization: 'Bearer token' }
    })
  })

  it('should return undefined when multiple server configs have partial validity', async () => {
    ;(fsp.readFile as any).mockResolvedValueOnce(
      JSON.stringify({
        mcpServers: {
          validServer: { command: 'uvx' },
          invalidServer: { type: 'stdio' }
        }
      })
    )

    const res = await (hub as any).readAndValidateMcpSettingsFile()
    expect(res).toBeUndefined()
  })

  it('multiple valid server configurations should pass validation', async () => {
    ;(fsp.readFile as any).mockResolvedValueOnce(
      JSON.stringify({
        mcpServers: {
          server1: { command: 'uvx', args: ['mcp-server-fetch'] },
          server2: { type: 'http', url: 'http://localhost:3000' },
          server3: { command: 'node', args: ['server.js'], disabled: true }
        }
      })
    )

    const res = await (hub as any).readAndValidateMcpSettingsFile()
    expect(res).toBeDefined()
    expect(Object.keys(res?.mcpServers || {})).toHaveLength(3)
  })
})

describe('McpHub - callTool Tests', () => {
  const getPath = async () => '/tmp/mock'
  let hub: McpHub

  beforeEach(async () => {
    vi.clearAllMocks()
    ;(fsp.readFile as any).mockResolvedValue(JSON.stringify({ mcpServers: {} }))
    hub = new McpHub(getPath, getPath, '1.0.0')
    await new Promise((resolve) => setTimeout(resolve, 10))
  })

  it('successfully call tool', async () => {
    const mockRequest = vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: 'result' }]
    })

    ;(hub as any).connections = [
      {
        server: {
          name: 'test-server',
          disabled: false,
          config: JSON.stringify({ timeout: 60, type: 'stdio' })
        },
        client: { request: mockRequest }
      }
    ]

    const result = await hub.callTool('test-server', 'test-tool', { arg: 'value' }, 'ulid-123')

    expect(result.content).toEqual([{ type: 'text', text: 'result' }])
    expect(mockRequest).toHaveBeenCalledWith(
      {
        method: 'tools/call',
        params: {
          name: 'test-tool',
          arguments: { arg: 'value' }
        }
      },
      expect.any(Object),
      { timeout: 60000 }
    )
  })

  it('should throw error when server does not exist', async () => {
    ;(hub as any).connections = []

    await expect(hub.callTool('non-existent', 'tool', {}, 'ulid')).rejects.toThrow(
      "No connection found for server: non-existent. Please make sure to use MCP servers available under 'Connected MCP Servers'."
    )
  })

  it('should throw error when server is disabled', async () => {
    ;(hub as any).connections = [
      {
        server: { name: 'disabled-server', disabled: true },
        client: {}
      }
    ]

    await expect(hub.callTool('disabled-server', 'tool', {}, 'ulid')).rejects.toThrow('Server "disabled-server" is disabled and cannot be used')
  })

  it('should work normally when toolArguments is not provided', async () => {
    const mockRequest = vi.fn().mockResolvedValue({ content: [] })

    ;(hub as any).connections = [
      {
        server: {
          name: 'test-server',
          disabled: false,
          config: JSON.stringify({ timeout: 30, type: 'stdio' })
        },
        client: { request: mockRequest }
      }
    ]

    await hub.callTool('test-server', 'test-tool', undefined, 'ulid')

    expect(mockRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        params: { name: 'test-tool', arguments: undefined }
      }),
      expect.any(Object),
      expect.any(Object)
    )
  })
})

describe('McpHub - toggleServerDisabled Tests', () => {
  const getPath = async () => '/tmp/mock'
  let hub: McpHub

  beforeEach(async () => {
    vi.clearAllMocks()
    ;(fsp.readFile as any).mockResolvedValue(JSON.stringify({ mcpServers: {} }))
    hub = new McpHub(getPath, getPath, '1.0.0')
    await new Promise((resolve) => setTimeout(resolve, 10))
    ;(fsp.readFile as any).mockResolvedValue(
      JSON.stringify({
        mcpServers: {
          'test-server': { command: 'test', type: 'stdio', disabled: false }
        }
      })
    )
  })

  it('disabling server should disconnect and update config', async () => {
    const mockClose = vi.fn().mockResolvedValue(undefined)
    ;(hub as any).connections = [
      {
        server: {
          name: 'test-server',
          disabled: false,
          config: JSON.stringify({ command: 'test', type: 'stdio' })
        },
        client: { close: mockClose },
        transport: { close: mockClose }
      }
    ]

    await hub.toggleServerDisabled('test-server', true)

    expect(fsp.writeFile as any).toHaveBeenCalled()
    expect((hub as any).skipNextFileWatcherChange).toBe(true)
    const connection = (hub as any).connections.find((c: any) => c.server.name === 'test-server')
    expect(connection).toBeDefined()
    expect(connection.server.disabled).toBe(true)
    expect(mockClose).toHaveBeenCalled()
  })

  it('enabling server should reconnect', async () => {
    // Mock connectToServer to avoid real connection logic
    const originalConnectToServer = (hub as any).connectToServer
    ;(hub as any).connectToServer = vi.fn().mockImplementation(async (name: string, config: any) => {
      // Simulate successful connection
      const idx = (hub as any).connections.findIndex((c: any) => c.server.name === name)
      if (idx >= 0) {
        ;(hub as any).connections[idx] = {
          server: {
            name,
            disabled: false,
            config: JSON.stringify(config)
          },
          client: { close: vi.fn() },
          transport: { close: vi.fn() }
        }
      }
    })
    ;(hub as any).connections = [
      {
        server: {
          name: 'test-server',
          disabled: true,
          config: JSON.stringify({ command: 'test', type: 'stdio', disabled: true })
        },
        client: null,
        transport: null
      }
    ]

    await hub.toggleServerDisabled('test-server', false)

    expect(fsp.writeFile as any).toHaveBeenCalled()
    expect((hub as any).skipNextFileWatcherChange).toBe(true)
    ;(hub as any).connectToServer = originalConnectToServer
  })

  it('should throw error when server does not exist', async () => {
    ;(hub as any).connections = []

    await expect(hub.toggleServerDisabled('non-existent', true)).rejects.toThrow('Server "non-existent" not found')
  })

  it('should rollback state when error occurs', async () => {
    ;(hub as any).connections = [
      {
        server: { name: 'test-server', disabled: false, config: '{}' },
        client: {},
        transport: {}
      }
    ]
    ;(fsp.writeFile as any).mockRejectedValueOnce(new Error('write error'))

    await expect(hub.toggleServerDisabled('test-server', true)).rejects.toThrow()

    const connection = (hub as any).connections.find((c: any) => c.server.name === 'test-server')
    expect(connection.server.disabled).toBe(false)
  })
})

describe('McpHub - deleteServer Tests', () => {
  const getPath = async () => '/tmp/mock'
  let hub: McpHub

  beforeEach(async () => {
    vi.clearAllMocks()
    mockDeleteServerMcpToolStates.mockClear()
    ;(fsp.readFile as any).mockResolvedValue(JSON.stringify({ mcpServers: {} }))
    hub = new McpHub(getPath, getPath, '1.0.0')
    await new Promise((resolve) => setTimeout(resolve, 10))
    ;(fsp.readFile as any).mockResolvedValue(
      JSON.stringify({
        mcpServers: {
          'test-server': { command: 'test', type: 'stdio' },
          'other-server': { command: 'other', type: 'stdio' }
        }
      })
    )
  })

  it('should delete server connection and update config file', async () => {
    const mockClose = vi.fn()
    ;(hub as any).connections = [
      {
        server: { name: 'test-server' },
        client: { close: mockClose },
        transport: { close: mockClose }
      },
      {
        server: { name: 'other-server' },
        client: { close: vi.fn() },
        transport: { close: vi.fn() }
      }
    ]

    await hub.deleteServer('test-server')

    expect(mockClose).toHaveBeenCalledTimes(2)
    expect(fsp.writeFile as any).toHaveBeenCalled()
    expect((hub as any).skipNextFileWatcherChange).toBe(true)
    expect((hub as any).connections).toHaveLength(1)
    expect((hub as any).connections[0].server.name).toBe('other-server')
  })

  it('should clean up related database records', async () => {
    ;(hub as any).connections = [
      {
        server: { name: 'test-server' },
        client: { close: vi.fn() },
        transport: { close: vi.fn() }
      }
    ]

    await hub.deleteServer('test-server')

    expect(mockDeleteServerMcpToolStates).toHaveBeenCalledWith('test-server')
  })

  it('should throw error when server does not exist', async () => {
    ;(hub as any).connections = []

    await expect(hub.deleteServer('non-existent')).rejects.toThrow('Server "non-existent" not found')
  })

  it('should propagate error when deletion fails', async () => {
    ;(hub as any).connections = [
      {
        server: { name: 'test-server' },
        client: { close: vi.fn() },
        transport: { close: vi.fn() }
      }
    ]
    ;(fsp.writeFile as any).mockRejectedValueOnce(new Error('write error'))

    await expect(hub.deleteServer('test-server')).rejects.toThrow('write error')
  })
})

describe('McpHub - toggleToolAutoApprove Tests', () => {
  const getPath = async () => '/tmp/mock'
  let hub: McpHub

  beforeEach(async () => {
    vi.clearAllMocks()
    ;(fsp.readFile as any).mockResolvedValue(JSON.stringify({ mcpServers: {} }))
    hub = new McpHub(getPath, getPath, '1.0.0')
    await new Promise((resolve) => setTimeout(resolve, 10))
  })

  it('should add tool to autoApprove list', async () => {
    ;(fsp.readFile as any).mockResolvedValue(
      JSON.stringify({
        mcpServers: {
          'test-server': {
            command: 'test',
            type: 'stdio',
            autoApprove: []
          }
        }
      })
    )
    ;(hub as any).connections = [
      {
        server: {
          name: 'test-server',
          tools: [
            { name: 'tool-1', autoApprove: false },
            { name: 'tool-2', autoApprove: false }
          ]
        }
      }
    ]

    await hub.toggleToolAutoApprove('test-server', ['tool-1'], true)

    expect(fsp.writeFile as any).toHaveBeenCalled()
    const writeCall = (fsp.writeFile as any).mock.calls[0]
    const writtenConfig = JSON.parse(writeCall[1])
    expect(writtenConfig.mcpServers['test-server'].autoApprove).toContain('tool-1')
  })

  it('should remove tool from autoApprove list', async () => {
    ;(fsp.readFile as any).mockResolvedValue(
      JSON.stringify({
        mcpServers: {
          'test-server': {
            command: 'test',
            type: 'stdio',
            autoApprove: ['tool-1', 'tool-2']
          }
        }
      })
    )
    ;(hub as any).connections = [
      {
        server: {
          name: 'test-server',
          tools: [
            { name: 'tool-1', autoApprove: true },
            { name: 'tool-2', autoApprove: true }
          ]
        }
      }
    ]

    await hub.toggleToolAutoApprove('test-server', ['tool-1'], false)

    const writeCall = (fsp.writeFile as any).mock.calls[0]
    const writtenConfig = JSON.parse(writeCall[1])
    expect(writtenConfig.mcpServers['test-server'].autoApprove).not.toContain('tool-1')
    expect(writtenConfig.mcpServers['test-server'].autoApprove).toContain('tool-2')
  })

  it('should handle batch update of multiple tools', async () => {
    ;(fsp.readFile as any).mockResolvedValue(
      JSON.stringify({
        mcpServers: {
          'test-server': {
            command: 'test',
            type: 'stdio',
            autoApprove: []
          }
        }
      })
    )
    ;(hub as any).connections = [
      {
        server: {
          name: 'test-server',
          tools: [
            { name: 'tool-1', autoApprove: false },
            { name: 'tool-2', autoApprove: false },
            { name: 'tool-3', autoApprove: false }
          ]
        }
      }
    ]

    await hub.toggleToolAutoApprove('test-server', ['tool-1', 'tool-2'], true)

    const writeCall = (fsp.writeFile as any).mock.calls[0]
    const writtenConfig = JSON.parse(writeCall[1])
    expect(writtenConfig.mcpServers['test-server'].autoApprove).toContain('tool-1')
    expect(writtenConfig.mcpServers['test-server'].autoApprove).toContain('tool-2')
    expect(writtenConfig.mcpServers['test-server'].autoApprove).not.toContain('tool-3')
  })

  it('should initialize autoApprove as empty array when it does not exist', async () => {
    ;(fsp.readFile as any).mockResolvedValue(
      JSON.stringify({
        mcpServers: {
          'test-server': {
            command: 'test',
            type: 'stdio'
          }
        }
      })
    )
    ;(hub as any).connections = [
      {
        server: {
          name: 'test-server',
          tools: [{ name: 'tool-1', autoApprove: false }]
        }
      }
    ]

    await hub.toggleToolAutoApprove('test-server', ['tool-1'], true)

    const writeCall = (fsp.writeFile as any).mock.calls[0]
    const writtenConfig = JSON.parse(writeCall[1])
    expect(Array.isArray(writtenConfig.mcpServers['test-server'].autoApprove)).toBe(true)
    expect(writtenConfig.mcpServers['test-server'].autoApprove).toContain('tool-1')
  })

  it('should throw error when update fails', async () => {
    ;(fsp.readFile as any).mockRejectedValueOnce(new Error('read error'))
    ;(hub as any).connections = [{ server: { name: 'test-server', tools: [] } }]

    await expect(hub.toggleToolAutoApprove('test-server', ['tool-1'], true)).rejects.toThrow()
  })
})

describe('McpHub - Integration Tests', () => {
  const getPath = async () => '/tmp/mock'

  describe('Reconnection Mechanism Tests', () => {
    let hub: McpHub

    beforeEach(async () => {
      vi.useFakeTimers()
      vi.clearAllMocks()
      ;(fsp.readFile as any).mockResolvedValue(JSON.stringify({ mcpServers: {} }))
      hub = new McpHub(getPath, getPath, '1.0.0')
      await vi.advanceTimersByTimeAsync(20)
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('should schedule reconnection after connection failure', async () => {
      const connection: any = {
        server: {
          name: 'http-server',
          disabled: false,
          status: 'disconnected'
        },
        reconnectState: {
          attempts: 0,
          isReconnecting: false
        }
      }
      ;(hub as any).connections = [connection]

      await (hub as any).scheduleReconnect('http-server', { type: 'http', url: 'http://test' }, 'internal')

      expect(connection.reconnectState.isReconnecting).toBe(true)
      expect(connection.reconnectState.attempts).toBe(1)
      expect(connection.reconnectState.timeoutId).toBeDefined()
    })

    it('should use exponential backoff delay', async () => {
      const connection: any = {
        server: { name: 'http-server', disabled: false },
        reconnectState: { attempts: 0, isReconnecting: false }
      }
      ;(hub as any).connections = [connection]

      await (hub as any).scheduleReconnect('http-server', { type: 'http', url: 'http://test' }, 'internal')
      const firstAttemptDelay = (hub as any).calculateReconnectDelay(0)

      vi.clearAllTimers()
      connection.reconnectState.attempts = 2
      await (hub as any).scheduleReconnect('http-server', { type: 'http', url: 'http://test' }, 'internal')
      const thirdAttemptDelay = (hub as any).calculateReconnectDelay(2)

      expect(thirdAttemptDelay).toBeGreaterThan(firstAttemptDelay)
    })

    it('should stop reconnecting after reaching maximum attempts', async () => {
      const connection: any = {
        server: { name: 'http-server', disabled: false },
        reconnectState: {
          attempts: constants.MAX_RECONNECT_ATTEMPTS,
          isReconnecting: false
        }
      }
      ;(hub as any).connections = [connection]

      await (hub as any).scheduleReconnect('http-server', { type: 'http', url: 'http://test' }, 'internal')

      expect(connection.reconnectState.timeoutId).toBeUndefined()
      expect(connection.server.status).toBe('disconnected')
    })

    it('should reset reconnection state after successful reconnection', () => {
      const connection: any = {
        server: { name: 'http-server' },
        reconnectState: {
          attempts: 3,
          isReconnecting: true,
          timeoutId: setTimeout(() => {}, 1000)
        }
      }

      ;(hub as any).resetReconnectState(connection)

      expect(connection.reconnectState.attempts).toBe(0)
      expect(connection.reconnectState.isReconnecting).toBe(false)
      expect(connection.reconnectState.lastSuccessfulConnection).toBeDefined()
    })
  })

  describe('Server Connection Update Flow', () => {
    let hub: McpHub

    beforeEach(async () => {
      vi.clearAllMocks()
      ;(fsp.readFile as any).mockResolvedValue(JSON.stringify({ mcpServers: {} }))
      hub = new McpHub(getPath, getPath, '1.0.0')
      await new Promise((resolve) => setTimeout(resolve, 10))
    })

    it('should identify and remove deleted servers', async () => {
      const mockClose = vi.fn().mockResolvedValue(undefined)
      const originalConnectToServer = (hub as any).connectToServer
      ;(hub as any).connectToServer = vi.fn().mockImplementation(async (name: string, config: any) => {
        const idx = (hub as any).connections.findIndex((c: any) => c.server.name === name)
        if (idx >= 0) {
          ;(hub as any).connections[idx] = {
            server: { name, config: JSON.stringify(config) },
            client: { close: vi.fn() },
            transport: { close: vi.fn() }
          }
        } else {
          ;(hub as any).connections.push({
            server: { name, config: JSON.stringify(config) },
            client: { close: vi.fn() },
            transport: { close: vi.fn() }
          })
        }
      })
      ;(hub as any).connections = [
        {
          server: { name: 'server-1', config: JSON.stringify({ command: 'cmd1', type: 'stdio' }) },
          client: { close: mockClose },
          transport: { close: mockClose }
        },
        {
          server: { name: 'server-2', config: JSON.stringify({ command: 'cmd2', type: 'stdio' }) },
          client: { close: vi.fn() },
          transport: { close: vi.fn() }
        }
      ]

      await hub.updateServerConnections({
        'server-2': { command: 'cmd', type: 'stdio', transportType: undefined, timeout: 60 }
      })

      expect((hub as any).connections).toHaveLength(1)
      expect((hub as any).connections[0].server.name).toBe('server-2')
      expect(mockClose).toHaveBeenCalled()
      ;(hub as any).connectToServer = originalConnectToServer
    })

    it('should detect configuration changes and reconnect', async () => {
      const mockClose = vi.fn().mockResolvedValue(undefined)
      ;(hub as any).connections = [
        {
          server: {
            name: 'server-1',
            config: JSON.stringify({ command: 'old-cmd', type: 'stdio' })
          },
          client: { close: mockClose },
          transport: { close: mockClose }
        }
      ]

      await hub.updateServerConnections({
        'server-1': { command: 'new-cmd', type: 'stdio', transportType: undefined, timeout: 60 }
      })

      expect(mockClose).toHaveBeenCalled()
    })

    it('should not reconnect when configuration has not changed', async () => {
      const mockClose = vi.fn()
      const config = { command: 'cmd', type: 'stdio' as const, transportType: undefined, timeout: 60 }
      ;(hub as any).connections = [
        {
          server: {
            name: 'server-1',
            config: JSON.stringify(config)
          },
          client: { close: mockClose },
          transport: { close: mockClose }
        }
      ]

      await hub.updateServerConnections({
        'server-1': config
      })

      expect(mockClose).not.toHaveBeenCalled()
    })
  })

  describe('Dispose Cleanup Process', () => {
    it('should close all connections and listeners', async () => {
      ;(fsp.readFile as any).mockResolvedValue(JSON.stringify({ mcpServers: {} }))
      const hub = new McpHub(getPath, getPath, '1.0.0')
      await new Promise((resolve) => setTimeout(resolve, 10))

      const mockClose = vi.fn().mockResolvedValue(undefined)
      const mockWatcherClose = vi.fn()

      ;(hub as any).connections = [
        {
          server: { name: 'server-1' },
          client: { close: mockClose },
          transport: { close: mockClose }
        },
        {
          server: { name: 'server-2' },
          client: { close: mockClose },
          transport: { close: mockClose }
        }
      ]
      ;(hub as any).settingsWatcher = { close: mockWatcherClose }
      ;(hub as any).fileWatchers = new Map([['watcher-1', { close: mockWatcherClose }]])

      await hub.dispose()

      expect(mockClose).toHaveBeenCalledTimes(4)
      expect(mockWatcherClose).toHaveBeenCalledTimes(2)
      expect((hub as any).connections).toEqual([])
    })

    it('single connection close failure should not affect other connections', async () => {
      ;(fsp.readFile as any).mockResolvedValue(JSON.stringify({ mcpServers: {} }))
      const hub = new McpHub(getPath, getPath, '1.0.0')
      await new Promise((resolve) => setTimeout(resolve, 10))

      const mockCloseSuccess = vi.fn().mockResolvedValue(undefined)
      const mockCloseError = vi.fn().mockRejectedValue(new Error('close error'))

      ;(hub as any).connections = [
        {
          server: { name: 'server-1' },
          client: { close: mockCloseError },
          transport: { close: mockCloseError }
        },
        {
          server: { name: 'server-2' },
          client: { close: mockCloseSuccess },
          transport: { close: mockCloseSuccess }
        }
      ]

      await hub.dispose()

      expect(mockCloseSuccess).toHaveBeenCalled()
      expect((hub as any).connections).toEqual([])
    })
  })

  describe('Notification Flow Integration Tests', () => {
    it('notifications should be sent directly when callback exists, stored when no callback', () => {
      const hub = new McpHub(getPath, getPath, '1.0.0')
      const mockCallback = vi.fn()

      hub.setNotificationCallback(mockCallback)
      ;(hub as any).pendingNotifications = []

      const mockNotification = {
        serverName: 'test-server',
        level: 'info',
        message: 'test message',
        timestamp: Date.now()
      }

      if ((hub as any).notificationCallback) {
        ;(hub as any).notificationCallback(mockNotification.serverName, mockNotification.level, mockNotification.message)
      }

      expect(mockCallback).toHaveBeenCalledWith('test-server', 'info', 'test message')
      expect((hub as any).pendingNotifications).toHaveLength(0)

      hub.clearNotificationCallback()
      ;(hub as any).pendingNotifications.push(mockNotification)
      expect((hub as any).pendingNotifications).toHaveLength(1)
    })
  })

  describe('Complete Connection Lifecycle', () => {
    it('initialization -> get tool list -> call tool -> disable -> delete', async () => {
      ;(fsp.readFile as any).mockResolvedValue(JSON.stringify({ mcpServers: {} }))
      const hub = new McpHub(getPath, getPath, '1.0.0')
      await new Promise((resolve) => setTimeout(resolve, 10))

      const mockRequest = vi
        .fn()
        .mockResolvedValueOnce({ tools: [{ name: 'test-tool', description: 'desc' }] })
        .mockResolvedValueOnce({ content: [{ type: 'text', text: 'result' }] })

      const mockClose = vi.fn().mockResolvedValue(undefined)

      ;(hub as any).connections = [
        {
          server: {
            name: 'test-server',
            disabled: false,
            config: JSON.stringify({ command: 'test', type: 'stdio', timeout: 30 }),
            tools: [{ name: 'test-tool', description: 'desc', autoApprove: false }]
          },
          client: { request: mockRequest, close: mockClose },
          transport: { close: mockClose }
        }
      ]

      // 1. Get active servers
      const activeServers = hub.getActiveServers()
      expect(activeServers).toHaveLength(1)
      expect(activeServers[0].tools?.[0].name).toBe('test-tool')

      // 2. Call tool
      const toolResult = await hub.callTool('test-server', 'test-tool', { arg: 'val' }, 'ulid')
      expect(toolResult.content).toBeDefined()

      // 3. Disable server
      ;(fsp.readFile as any).mockResolvedValue(
        JSON.stringify({
          mcpServers: {
            'test-server': { command: 'test', type: 'stdio', disabled: false }
          }
        })
      )

      await hub.toggleServerDisabled('test-server', true)
      const disabledServers = hub.getActiveServers()
      expect(disabledServers).toHaveLength(0)

      // 4. Delete server (ensure connection still exists)
      const connection = (hub as any).connections.find((c: any) => c.server.name === 'test-server')
      expect(connection).toBeDefined()

      await hub.deleteServer('test-server')
      expect((hub as any).connections).toHaveLength(0)
    })
  })
})
