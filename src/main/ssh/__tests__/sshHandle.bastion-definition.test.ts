import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { ipcMain } from 'electron'

const { appMock, ipcMainMock } = vi.hoisted(() => ({
  appMock: { getAppPath: () => process.cwd() },
  ipcMainMock: { handle: vi.fn(), on: vi.fn() }
}))

vi.mock('electron', () => ({
  app: appMock,
  ipcMain: ipcMainMock,
  default: {
    app: appMock,
    ipcMain: ipcMainMock
  }
}))

vi.mock('../capabilityRegistry', () => ({
  capabilityRegistry: {
    getBastionDefinition: vi.fn(),
    getBastion: vi.fn()
  }
}))

describe('ssh:connect bastion definition checks', () => {
  let handlers: Map<string, (...args: any[]) => any>
  let registerSSHHandlers: typeof import('../sshHandle').registerSSHHandlers
  let capabilityRegistry: typeof import('../capabilityRegistry').capabilityRegistry

  beforeEach(async () => {
    vi.clearAllMocks()
    handlers = new Map()

    ;(ipcMain.handle as any).mockImplementation((channel: string, handler: (...args: any[]) => any) => {
      handlers.set(channel, handler)
    })

    ;({ registerSSHHandlers } = await import('../sshHandle'))
    ;({ capabilityRegistry } = await import('../capabilityRegistry'))
    registerSSHHandlers()
  })

  afterEach(() => {
    handlers.clear()
  })

  it('blocks connection when bastion definition is missing even if capability exists', async () => {
    const connect = vi.fn().mockResolvedValue({ status: 'connected', sessionId: 's1' })

    ;(capabilityRegistry.getBastionDefinition as any).mockReturnValue(undefined)
    ;(capabilityRegistry.getBastion as any).mockReturnValue({ connect })

    const handler = handlers.get('ssh:connect')!
    const result = await handler({}, { sshType: 'qizhi', id: 's1' })

    expect(result.status).toBe('error')
    expect(connect).not.toHaveBeenCalled()
  })
})
