import { BrowserWindow } from 'electron'
import type { Client } from 'ssh2'
import type { JumpServerConnectionInfo, JumpServerNavigationPath } from './constants'
import { jumpserverConnections, jumpserverShellStreams, jumpserverConnectionStatus, jumpserverLastCommand, jumpserverInputBuffer } from './state'
import { createJumpServerExecStream, executeCommandOnJumpServerExec } from './streamManager'
import { parseJumpServerUsers, hasUserSelectionPrompt } from './parser'
import { handleJumpServerUserSelectionWithEvent } from './userSelection'
import { hasPasswordPrompt, hasPasswordError, detectDirectConnectionReason } from './navigator'
import { JUMPSERVER_CONSTANTS } from './constants'

const sendPasswordToStream = (stream: any, password: string, navigationPath: JumpServerNavigationPath, context: string = '') => {
  const actualPassword = password || ''
  navigationPath.needsPassword = !!actualPassword
  navigationPath.password = actualPassword

  setTimeout(() => {
    console.log(`[JumpServer] 发送密码${context ? ` (${context})` : ''}`)
    stream.write(actualPassword + '\r')
  }, JUMPSERVER_CONSTANTS.PASSWORD_INPUT_DELAY)
}

export const setupJumpServerInteraction = (
  stream: any,
  connectionInfo: JumpServerConnectionInfo,
  connectionId: string,
  jumpserverUuid: string,
  conn: Client,
  event: Electron.IpcMainInvokeEvent | undefined,
  sendStatusUpdate: (message: string, type: 'info' | 'success' | 'warning' | 'error') => void,
  resolve: (value: { status: string; message: string }) => void,
  reject: (reason: Error) => void
) => {
  let outputBuffer = ''
  let connectionPhase: 'connecting' | 'inputIp' | 'selectUser' | 'inputPassword' | 'connected' = 'connecting'
  let connectionEstablished = false

  const navigationPath: JumpServerNavigationPath = {
    needsPassword: false
  }

  const handleConnectionSuccess = (reason: string) => {
    if (connectionEstablished) return
    connectionEstablished = true
    sendStatusUpdate('已成功连接到目标服务器，请开始操作', 'success')
    connectionPhase = 'connected'
    outputBuffer = ''

    console.log(`[JumpServer] 连接成功: ${connectionId} -> ${connectionInfo.targetIp} (${reason})`)
    jumpserverConnections.set(connectionId, {
      conn,
      stream,
      jumpserverUuid,
      targetIp: connectionInfo.targetIp,
      navigationPath
    })
    jumpserverShellStreams.set(connectionId, stream)
    jumpserverConnectionStatus.set(connectionId, { isVerified: true })

    createJumpServerExecStream(connectionId)
      .then(async (execStream) => {
        const readyResult = {
          hasSudo: false,
          commandList: [] as string[]
        }

        try {
          const commandListResult = await executeCommandOnJumpServerExec(
            execStream,
            'ls /usr/bin/ /usr/local/bin/ /usr/sbin/ /usr/local/sbin/ /bin/ | sort | uniq'
          ).then(
            (value) => ({ status: 'fulfilled' as const, value }),
            (reason) => ({ status: 'rejected' as const, reason })
          )

          const sudoCheckResult = await executeCommandOnJumpServerExec(execStream, 'sudo -n true 2>/dev/null && echo true || echo false').then(
            (value) => ({ status: 'fulfilled' as const, value }),
            (reason) => ({ status: 'rejected' as const, reason })
          )

          if (commandListResult.status === 'fulfilled' && commandListResult.value.success) {
            const stdout = commandListResult.value.stdout || ''
            readyResult.commandList = stdout.split('\n').filter(Boolean)

            if (readyResult.commandList.length === 0) {
              console.warn(`[JumpServer] 警告: 命令列表为空`)
            }
          } else if (commandListResult.status === 'fulfilled') {
            console.error('[JumpServer] 命令列表获取失败:', commandListResult.value.error)
          }

          if (sudoCheckResult.status === 'fulfilled' && sudoCheckResult.value.success) {
            readyResult.hasSudo = (sudoCheckResult.value.stdout || '').trim() === 'true'
          }
        } catch (error) {
          console.error('[JumpServer] 获取命令列表时出错:', error)
        }

        const mainWindow = BrowserWindow.getAllWindows()[0]
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send(`ssh:connect:data:${connectionId}`, readyResult)
        }
      })
      .catch((error) => {
        console.error(`[JumpServer:ExecStream] 创建失败: ${connectionId}`, error)

        const mainWindow = BrowserWindow.getAllWindows()[0]
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send(`ssh:connect:data:${connectionId}`, {
            hasSudo: false,
            commandList: []
          })
          console.log(`[JumpServer:Connect] 已发送空命令列表到前端（exec 流创建失败）`)
        } else {
          console.error('[JumpServer:Connect] 无法发送空命令列表: 窗口不存在或已销毁')
        }
      })

    resolve({ status: 'connected', message: '连接成功' })
  }

  stream.on('data', (data: Buffer) => {
    const ansiRegex = /[\u001b\u009b][[()#;?]*.{0,2}(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nry=><]/g
    const chunk = data.toString().replace(ansiRegex, '')
    outputBuffer += chunk

    if (connectionPhase === 'connecting' && outputBuffer.includes('Opt>')) {
      console.log('检测到 JumpServer 菜单，输入目标 IP')
      sendStatusUpdate(`正在连接到目标服务器...`, 'info')
      connectionPhase = 'inputIp'
      outputBuffer = ''
      stream.write(connectionInfo.targetIp + '\r')
      return
    }

    if (connectionPhase === 'inputIp') {
      if (hasUserSelectionPrompt(outputBuffer)) {
        console.log('检测到多用户提示，需要用户选择账号')
        sendStatusUpdate('检测到多个用户账号，请选择...', 'info')
        connectionPhase = 'selectUser'
        const users = parseJumpServerUsers(outputBuffer)
        console.log('解析到的用户列表:', users)

        if (users.length === 0) {
          console.error('解析用户列表失败，缓冲区内容:', outputBuffer)
          conn.end()
          reject(new Error('Failed to parse user list'))
          return
        }

        outputBuffer = ''

        if (!event) {
          console.error('JumpServer 用户选择需要 event 对象')
          conn.end()
          reject(new Error('User selection requires event object'))
          return
        }

        handleJumpServerUserSelectionWithEvent(event, connectionId, users)
          .then((selectedUserId) => {
            console.log('用户选择了账号 ID:', selectedUserId)
            sendStatusUpdate('正在使用选择的账号连接...', 'info')
            connectionPhase = 'inputPassword'

            navigationPath.selectedUserId = selectedUserId

            stream.write(selectedUserId.toString() + '\r')
          })
          .catch((err) => {
            console.error('用户选择失败:', err)
            sendStatusUpdate('用户选择已取消', 'error')
            conn.end()
            reject(err)
          })
        return
      }

      if (hasPasswordPrompt(outputBuffer)) {
        sendStatusUpdate('正在进行身份验证...', 'info')
        connectionPhase = 'inputPassword'
        outputBuffer = ''
        sendPasswordToStream(stream, connectionInfo.password || '', navigationPath, 'IP输入后')
        return
      }

      const reason = detectDirectConnectionReason(outputBuffer)
      if (reason) {
        console.log(`JumpServer 目标资产无需密码，直接建立连接（${reason}）`)
        handleConnectionSuccess(`无需密码 - ${reason}`)
      } else {
        const preview = outputBuffer.slice(-200).replace(/\r?\n/g, '\\n')
        console.log(`JumpServer inputIp 阶段输出预览: "${preview}"`)
      }
      return
    }

    if (connectionPhase === 'selectUser') {
      if (hasPasswordPrompt(outputBuffer)) {
        sendStatusUpdate('正在进行身份验证...', 'info')
        connectionPhase = 'inputPassword'
        outputBuffer = ''
        sendPasswordToStream(stream, connectionInfo.password || '', navigationPath, '用户选择后')
        return
      }

      const reason = detectDirectConnectionReason(outputBuffer)
      if (reason) {
        console.log(`JumpServer 用户选择后直接建立连接（${reason}）`)
        handleConnectionSuccess(`用户选择 - ${reason}`)
      }
      return
    }

    if (connectionPhase === 'inputPassword') {
      if (hasPasswordError(outputBuffer)) {
        console.log('JumpServer 密码认证失败')

        if (event) {
          event.sender.send('ssh:keyboard-interactive-result', {
            id: connectionId,
            status: 'failed'
          })
        }

        conn.end()
        reject(new Error('JumpServer 密码认证失败，请检查密码是否正确'))
        return
      }

      const reason = detectDirectConnectionReason(outputBuffer)
      if (reason) {
        console.log(`JumpServer 密码验证后成功进入目标服务器（${reason}）`)
        handleConnectionSuccess(`密码验证后 - ${reason}`)
      }
    }
  })

  stream.stderr.on('data', (data: Buffer) => {
    console.error('JumpServer stderr:', data.toString())
  })

  stream.on('close', () => {
    console.log(`JumpServer stream closed for connection ${connectionId}`)
    jumpserverShellStreams.delete(connectionId)
    jumpserverConnections.delete(connectionId)
    jumpserverConnectionStatus.delete(connectionId)
    jumpserverLastCommand.delete(connectionId)
    jumpserverInputBuffer.delete(connectionId)

    if (connectionPhase !== 'connected') {
      reject(new Error('连接在完成前被关闭'))
    }
  })

  stream.on('error', (error: Error) => {
    console.error('JumpServer stream error:', error)
    reject(error)
  })
}
