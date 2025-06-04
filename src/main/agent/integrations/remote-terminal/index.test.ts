/// <reference types="jest" />

import { RemoteTerminalManager, ConnectionInfo, RemoteTerminalInfo } from './index'

describe('RemoteTerminalManager', () => {
  let manager: RemoteTerminalManager
  const connectionInfo: ConnectionInfo = {
    host: '49.235.159.86',
    port: 22,
    username: 'test',
    password: 'HsAyC3AT'
  }

  beforeEach(() => {
    manager = new RemoteTerminalManager()
  })

  describe('runCommand', () => {
    let terminalInfo: RemoteTerminalInfo
    // 可以正常执行/usr/bin/下的命令
    // const command1 = 'pwd'
    // const command2 = 'ls -la /home/test'
    // const command3 = 'ps'
    // const command = 'netstat'

    // /usr/sbin下的命令需要指定命令的路径
    // const command = "/usr/sbin/ifconfig | grep -E 'inet (address)' | awk '{print $2}'"
    // const command = '/usr/sbin/ip addr show'
    const command = '/usr/sbin/lsof -i:8080'

    const cwd = '/home/test'

    beforeEach(async () => {
      manager.setConnectionInfo(connectionInfo)
      terminalInfo = await manager.createTerminal()
    })

    it('should execute real remote command', async () => {
      const process = manager.runCommand(terminalInfo, command, cwd)
      expect(terminalInfo.busy).toBe(true)
      expect(terminalInfo.lastCommand).toBe(command)

      let output = ''
      process.on('line', (line) => {
        output += line + '\n'
        console.log('收到输出行:', line)
      })
      process.on('completed', () => {
        console.log('命令执行完成')
      })
      process.on('error', (error) => {
        console.error('命令执行出错:', error)
      })

      await process
      console.log('完整输出:', output)
    })

    afterAll(async () => {
      // 清理所有连接
      await manager.disposeAll()
    })
  })
})
