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
    console.log(`[JumpServer] Sending password${context ? ` (${context})` : ''}`)
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
    sendStatusUpdate('Successfully connected to target server, you can start operating', 'success')
    connectionPhase = 'connected'
    outputBuffer = ''

    console.log(`[JumpServer] Connection successful: ${connectionId} -> ${connectionInfo.targetIp} (${reason})`)
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
            'sh -c \'if command -v bash >/dev/null 2>&1; then bash -lc "compgen -A builtin; compgen -A command"; bash -ic "compgen -A alias" 2>/dev/null; else IFS=:; for d in $PATH; do [ -d "$d" ] || continue; for f in "$d"/*; do [ -x "$f" ] && printf "%s\\n" "${f##*/}"; done; done; fi\' | sort -u'
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
              console.warn(`[JumpServer] Warning: Command list is empty`)
            }
          } else if (commandListResult.status === 'fulfilled') {
            console.error('[JumpServer] Failed to get command list:', commandListResult.value.error)
          }

          if (sudoCheckResult.status === 'fulfilled' && sudoCheckResult.value.success) {
            readyResult.hasSudo = (sudoCheckResult.value.stdout || '').trim() === 'true'
          }
        } catch (error) {
          console.error('[JumpServer] Error getting command list:', error)
        }

        const mainWindow = BrowserWindow.getAllWindows()[0]
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send(`ssh:connect:data:${connectionId}`, readyResult)
        }
      })
      .catch((error) => {
        console.error(`[JumpServer:ExecStream] Creation failed: ${connectionId}`, error)

        const mainWindow = BrowserWindow.getAllWindows()[0]
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send(`ssh:connect:data:${connectionId}`, {
            hasSudo: false,
            commandList: []
          })
          console.log(`[JumpServer:Connect] Sent empty command list to frontend (exec stream creation failed)`)
        } else {
          console.error('[JumpServer:Connect] Cannot send empty command list: window does not exist or is destroyed')
        }
      })

    resolve({ status: 'connected', message: 'Connection successful' })
  }

  stream.on('data', (data: Buffer) => {
    const ansiRegex = /[\u001b\u009b][[()#;?]*.{0,2}(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nry=><]/g
    const chunk = data.toString().replace(ansiRegex, '')
    outputBuffer += chunk

    if (connectionPhase === 'connecting' && outputBuffer.includes('Opt>')) {
      console.log('JumpServer menu detected, entering target IP')
      sendStatusUpdate(`Connecting to target server...`, 'info')
      connectionPhase = 'inputIp'
      outputBuffer = ''
      stream.write(connectionInfo.targetIp + '\r')
      return
    }

    if (connectionPhase === 'inputIp') {
      if (hasUserSelectionPrompt(outputBuffer)) {
        console.log('Multiple user prompt detected, user selection required')
        sendStatusUpdate('Multiple user accounts detected, please select...', 'info')
        connectionPhase = 'selectUser'
        const users = parseJumpServerUsers(outputBuffer)
        console.log('Parsed user list:', users)

        if (users.length === 0) {
          console.error('Failed to parse user list, buffer content:', outputBuffer)
          conn.end()
          reject(new Error('Failed to parse user list'))
          return
        }

        outputBuffer = ''

        if (!event) {
          console.error('JumpServer user selection requires event object')
          conn.end()
          reject(new Error('User selection requires event object'))
          return
        }

        handleJumpServerUserSelectionWithEvent(event, connectionId, users)
          .then((selectedUserId) => {
            console.log('User selected account ID:', selectedUserId)
            sendStatusUpdate('Connecting with selected account...', 'info')
            connectionPhase = 'inputPassword'

            navigationPath.selectedUserId = selectedUserId

            stream.write(selectedUserId.toString() + '\r')
          })
          .catch((err) => {
            console.error('User selection failed:', err)
            sendStatusUpdate('User selection cancelled', 'error')
            conn.end()
            reject(err)
          })
        return
      }

      if (hasPasswordPrompt(outputBuffer)) {
        sendStatusUpdate('Authenticating...', 'info')
        connectionPhase = 'inputPassword'
        outputBuffer = ''
        sendPasswordToStream(stream, connectionInfo.password || '', navigationPath, 'After IP input')
        return
      }

      const reason = detectDirectConnectionReason(outputBuffer)
      if (reason) {
        console.log(`JumpServer target asset requires no password, establishing direct connection (${reason})`)
        handleConnectionSuccess(`No password required - ${reason}`)
      } else {
        const preview = outputBuffer.slice(-200).replace(/\r?\n/g, '\\n')
        console.log(`JumpServer inputIp phase output preview: "${preview}"`)
      }
      return
    }

    if (connectionPhase === 'selectUser') {
      if (hasPasswordPrompt(outputBuffer)) {
        sendStatusUpdate('Authenticating...', 'info')
        connectionPhase = 'inputPassword'
        outputBuffer = ''
        sendPasswordToStream(stream, connectionInfo.password || '', navigationPath, 'After user selection')
        return
      }

      const reason = detectDirectConnectionReason(outputBuffer)
      if (reason) {
        console.log(`JumpServer established direct connection after user selection (${reason})`)
        handleConnectionSuccess(`User selection - ${reason}`)
      }
      return
    }

    if (connectionPhase === 'inputPassword') {
      if (hasPasswordError(outputBuffer)) {
        console.log('JumpServer password authentication failed')

        if (event) {
          event.sender.send('ssh:keyboard-interactive-result', {
            id: connectionId,
            status: 'failed'
          })
        }

        conn.end()
        reject(new Error('JumpServer password authentication failed, please check if password is correct'))
        return
      }

      const reason = detectDirectConnectionReason(outputBuffer)
      if (reason) {
        console.log(`JumpServer successfully entered target server after password verification (${reason})`)
        handleConnectionSuccess(`After password verification - ${reason}`)
      }
    }
  })

  stream.stderr.on('data', (data: Buffer) => {
    console.error('JumpServer stderr:', data.toString())
  })

  stream.on('close', () => {
    console.log(`JumpServer stream closed for connection ${connectionId}`)

    // Check if underlying SSH connection needs to be closed
    const connData = jumpserverConnections.get(connectionId)
    if (connData) {
      const connToClose = connData.conn

      // Check if other sessions are still using the same connection
      let isConnStillInUse = false
      for (const [otherId, otherData] of jumpserverConnections.entries()) {
        if (otherId !== connectionId && otherData.conn === connToClose) {
          isConnStillInUse = true
          break
        }
      }

      // Only close underlying connection when no other sessions are using it
      if (!isConnStillInUse) {
        console.log(`[Bastion Host] All sessions closed, releasing underlying connection: ${connectionId}`)
        connToClose.end()
      } else {
        console.log(`[Bastion Host] Session closed, but underlying connection still in use by other sessions: ${connectionId}`)
      }
    }

    // Clean up session data
    jumpserverShellStreams.delete(connectionId)
    jumpserverConnections.delete(connectionId)
    jumpserverConnectionStatus.delete(connectionId)
    jumpserverLastCommand.delete(connectionId)
    jumpserverInputBuffer.delete(connectionId)

    if (connectionPhase !== 'connected') {
      reject(new Error('Connection closed before completion'))
    }
  })

  stream.on('error', (error: Error) => {
    console.error('JumpServer stream error:', error)
    reject(error)
  })
}
