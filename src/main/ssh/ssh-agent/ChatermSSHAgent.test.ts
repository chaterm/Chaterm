import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@logging/index', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  }))
}))

const requestIdentitiesMessage = Buffer.from([0, 0, 0, 1, 11])
const emptyIdentitiesResponse = Buffer.from([0, 0, 0, 5, 12, 0, 0, 0, 0])

describe('Chaterm SSHAgent transport security', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
    delete process.env.SSH_AUTH_SOCK
  })

  it('does not create a Windows named pipe for the built-in agent transport', async () => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('win32')
    const originalAuthSock = process.env.SSH_AUTH_SOCK

    const createServerMock = vi.fn()
    vi.doMock('net', async (importOriginal) => {
      const actual = await importOriginal<typeof import('net')>()
      return {
        ...actual,
        createServer: createServerMock
      }
    })

    const { SSHAgent } = await import('./ChatermSSHAgent')
    const agent = new SSHAgent()
    const authSock = await agent.start()

    expect(authSock).toBeNull()
    expect(process.env.SSH_AUTH_SOCK).toBe(originalAuthSock)
    expect(createServerMock).not.toHaveBeenCalled()

    const stream = await new Promise<NodeJS.ReadWriteStream>((resolve, reject) => {
      agent.getStream((err, agentStream) => {
        if (err || !agentStream) {
          reject(err)
          return
        }
        resolve(agentStream)
      })
    })

    const response = await new Promise<Buffer>((resolve) => {
      stream.once('data', (data) => {
        resolve(Buffer.from(data))
      })
      stream.write(requestIdentitiesMessage)
    })

    expect(response).toEqual(emptyIdentitiesResponse)
    await agent.stop()
  })

  it('creates Unix domain sockets with restricted IPC listen options', async () => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('linux')

    const socketPath = '/tmp/chaterm-agent-test.sock'
    const server = {
      on: vi.fn(),
      listen: vi.fn((_options, callback) => {
        callback()
        return server
      }),
      close: vi.fn((callback) => {
        callback()
      })
    }
    const createServerMock = vi.fn(() => server)

    vi.doMock('net', async (importOriginal) => {
      const actual = await importOriginal<typeof import('net')>()
      return {
        ...actual,
        createServer: createServerMock
      }
    })

    vi.doMock('fs/promises', () => ({
      default: {
        unlink: vi.fn(async () => undefined),
        chmod: vi.fn(async () => undefined)
      },
      unlink: vi.fn(async () => undefined),
      chmod: vi.fn(async () => undefined)
    }))

    const { SSHAgent } = await import('./ChatermSSHAgent')
    const agent = new SSHAgent(socketPath)
    const authSock = await agent.start()

    expect(authSock).toBe(socketPath)
    expect(server.listen).toHaveBeenCalledWith(
      {
        path: socketPath,
        exclusive: true,
        readableAll: false,
        writableAll: false
      },
      expect.any(Function)
    )

    await agent.stop()
  })
})
