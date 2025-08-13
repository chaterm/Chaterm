import { describe, it, expect, beforeEach, afterEach } from '@jest/globals'
import { v4 as uuidv4 } from 'uuid'
import CryptoJS from 'crypto-js'
import { RemoteTerminalManager } from './index'
import type { ConnectionInfo } from './index'

// This helper function is copied from ws.test.ts for test setup.
function encrypt(authData: any) {
  const keyStr = 'CtmKeyNY@D96^qza'
  const ivStr = keyStr
  const key = CryptoJS.enc.Utf8.parse(keyStr)
  const iv = CryptoJS.enc.Utf8.parse(ivStr)
  const srcs = CryptoJS.enc.Utf8.parse(JSON.stringify(authData))
  const encrypted = CryptoJS.AES.encrypt(srcs, key, {
    iv,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7
  })
  return encodeURIComponent(encrypted.toString())
}

describe('RemoteTerminalManager', () => {
  let manager: RemoteTerminalManager
  let connectionInfo: ConnectionInfo

  beforeEach(() => {
    manager = new RemoteTerminalManager()

    const host = '172.31.64.249'
    const organizationId = 'firm-0001'
    const uid = 2000001
    const dynamicTerminalId = `test@${host}:remote:${uuidv4()}`

    const authData = {
      email: 'test@gmail.com',
      ip: host,
      organizationId: organizationId,
      terminalId: dynamicTerminalId,
      uid: uid
    }

    const auth = encrypt(authData)
    const wsUrl = `ws://demo.chaterm.ai/v1/term-api/ws?&uuid=${auth}`

    connectionInfo = {
      type: 'websocket',
      host: host,
      wsUrl: wsUrl,
      terminalId: dynamicTerminalId,
      organizationId: organizationId,
      uid: uid,
      email: 'test@gmail.com'
    }
  })

  afterEach(async () => {
    await manager.disposeAll()
  })

  it('should create a new WebSocket terminal successfully', async () => {
    manager.setConnectionInfo(connectionInfo)
    const terminalInfo = await manager.createTerminal()

    expect(terminalInfo).toBeDefined()
    expect(terminalInfo.sessionId).toBeDefined()
    expect(manager.isConnected()).toBe(true)
  }, 30000)

  it('should reuse an existing WebSocket connection for the same user', async () => {
    manager.setConnectionInfo(connectionInfo)

    // Create the first terminal
    const terminalInfo1 = await manager.createTerminal()
    expect(terminalInfo1).toBeDefined()
    expect(manager.getTerminals(false).length).toBe(1)

    // Attempt to create a second terminal with the same connection info
    const terminalInfo2 = await manager.createTerminal()
    expect(terminalInfo2).toBeDefined()

    // It should return the same terminal info
    expect(terminalInfo2.id).toBe(terminalInfo1.id)
    expect(terminalInfo2.sessionId).toBe(terminalInfo1.sessionId)

    // Verify that no new terminal was actually created
    expect(manager.getTerminals(false).length).toBe(1)
  }, 30000)

  it('should execute a command on a WebSocket terminal', async () => {
    manager.setConnectionInfo(connectionInfo)
    const terminalInfo = await manager.createTerminal()

    const command = 'ip addr show'
    const process = manager.runCommand(terminalInfo, command)

    const lines: string[] = []
    process.on('line', (line) => {
      lines.push(line)
    })

    // Wait for the command to complete
    await process

    const output = lines.join('\n')
    console.log('out222put', output)
    expect(output).toContain('Hello from RemoteTerminalManager')
  }, 30000)

  it('should execute a command after a 10-second delay to test keep-alive', async () => {
    manager.setConnectionInfo(connectionInfo)
    const terminalInfo = await manager.createTerminal()

    console.log('Connection established. Waiting for 10 seconds...')
    await new Promise((resolve) => setTimeout(resolve, 10000))
    console.log('10 seconds passed. Executing command now.')

    const command = 'echo "Hello after delay"'
    const process = manager.runCommand(terminalInfo, command)

    const lines: string[] = []
    process.on('line', (line) => {
      lines.push(line)
    })

    await process

    const output = lines.join('\n')
    expect(output).toContain('Hello after delay')
  }, 40000)

  it('should disconnect a specific terminal and clean up resources', async () => {
    manager.setConnectionInfo(connectionInfo)
    const terminalInfo = await manager.createTerminal()

    expect(manager.isConnected()).toBe(true)

    await manager.disconnectTerminal(terminalInfo.id)

    expect(manager.isConnected()).toBe(false)
    expect(manager.getTerminals(false).length).toBe(0)
    expect(manager.getTerminals(true).length).toBe(0)
  }, 30000)
})
