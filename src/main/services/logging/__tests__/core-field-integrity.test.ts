import { beforeEach, describe, expect, it, vi } from 'vitest'

const emitted: Array<{ method: string; entry: Record<string, unknown> }> = []
const ipcHandlers: Record<string, (...args: any[]) => any> = {}

const fakeLogger = {
  transports: {
    file: {} as Record<string, unknown>,
    console: { level: 'info' as string | false },
    ipc: { level: 'info' as string | false }
  },
  hooks: [] as unknown[],
  debug: vi.fn((entry: Record<string, unknown>) => emitted.push({ method: 'debug', entry })),
  info: vi.fn((entry: Record<string, unknown>) => emitted.push({ method: 'info', entry })),
  warn: vi.fn((entry: Record<string, unknown>) => emitted.push({ method: 'warn', entry })),
  error: vi.fn((entry: Record<string, unknown>) => emitted.push({ method: 'error', entry }))
}

vi.mock('electron-log/main', () => ({
  default: {
    create: vi.fn(() => fakeLogger)
  }
}))

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/tmp')
  },
  ipcMain: {
    handle: vi.fn((channel: string, handler: (...args: any[]) => any) => {
      ipcHandlers[channel] = handler
    })
  },
  shell: {
    openPath: vi.fn(async () => '')
  }
}))

describe('core field integrity', () => {
  beforeEach(() => {
    emitted.length = 0
    Object.keys(ipcHandlers).forEach((channel) => delete ipcHandlers[channel])
    vi.clearAllMocks()
    vi.resetModules()
  })

  it('createLogger prevents meta from overriding core fields', async () => {
    const logging = await import('../index')
    const logger = logging.createLogger('ssh')

    logger.info('safe-message', {
      level: 'error',
      process: 'renderer',
      channel: 'app',
      module: 'attacker',
      message: 'hijacked-message',
      timestamp: 'fake-ts',
      extra: 'kept'
    } as Record<string, unknown>)

    const record = emitted[0]
    expect(record.method).toBe('info')
    expect(record.entry.level).toBe('info')
    expect(record.entry.process).toBe('main')
    expect(record.entry.channel).toBe('terminal')
    expect(record.entry.module).toBe('ssh')
    expect(record.entry.message).toBe('safe-message')
    expect(record.entry.timestamp).not.toBe('fake-ts')
    expect(record.entry.extra).toBe('kept')
  })

  it('log:write handler prevents payload.meta from overriding core fields', async () => {
    const logging = await import('../index')
    logging.registerLogIpcHandler()

    const handler = ipcHandlers['log:write']
    expect(handler).toBeTypeOf('function')

    handler(
      {},
      {
        level: 'warn',
        process: 'renderer',
        module: 'router',
        message: 'safe-ipc-message',
        meta: {
          level: 'error',
          process: 'main',
          channel: 'terminal',
          module: 'attacker',
          message: 'hijacked-ipc-message',
          timestamp: 'fake-ipc-ts',
          extra: 'kept'
        }
      }
    )

    const record = emitted[0]
    expect(record.method).toBe('warn')
    expect(record.entry.level).toBe('warn')
    expect(record.entry.process).toBe('renderer')
    expect(record.entry.channel).toBe('app')
    expect(record.entry.module).toBe('router')
    expect(record.entry.message).toBe('safe-ipc-message')
    expect(record.entry.timestamp).not.toBe('fake-ipc-ts')
    expect(record.entry.extra).toBe('kept')
  })
})
