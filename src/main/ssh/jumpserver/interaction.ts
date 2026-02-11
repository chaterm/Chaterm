import { BrowserWindow } from 'electron'
import type { Client } from 'ssh2'
import type { JumpServerConnectionInfo, JumpServerNavigationPath } from './constants'
import { jumpserverConnections, jumpserverShellStreams, jumpserverConnectionStatus, jumpserverLastCommand, jumpserverInputBuffer } from './state'
import { createJumpServerExecStream, executeCommandOnJumpServerExec } from './streamManager'
import { parseJumpServerUsers, hasUserSelectionPrompt } from './parser'
import { handleJumpServerUserSelectionWithEvent } from './userSelection'
import { hasPasswordPrompt, hasPasswordError, detectDirectConnectionReason, hasNoAssetsPrompt, createNoAssetsError } from './navigator'
import { JUMPSERVER_CONSTANTS } from './constants'
import { createLogger } from '@logging'

const logger = createLogger('jumpserver')

const sendPasswordToStream = (stream: any, password: string, navigationPath: JumpServerNavigationPath, context: string = '') => {
  const actualPassword = password || ''
  navigationPath.needsPassword = !!actualPassword
  navigationPath.password = actualPassword

  setTimeout(() => {
    logger.debug('Sending password to JumpServer', { event: 'jumpserver.auth.password', context })
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
  sendStatusUpdate: (
    message: string,
    type: 'info' | 'success' | 'warning' | 'error',
    messageKey?: string,
    messageParams?: Record<string, string | number>
  ) => void,
  resolve: (value: { status: string; message: string }) => void,
  reject: (reason: Error) => void
) => {
  let outputBuffer = ''
  let connectionPhase: 'connecting' | 'inputIp' | 'selectUser' | 'inputPassword' | 'connected' = 'connecting'
  let connectionEstablished = false
  let connectionFailed = false

  const navigationPath: JumpServerNavigationPath = {
    needsPassword: false
  }

  const handleConnectionSuccess = (reason: string) => {
    if (connectionEstablished) return
    connectionEstablished = true
    sendStatusUpdate('Successfully connected to target server, you can start operating', 'success', 'ssh.jumpserver.connectedToTarget')
    connectionPhase = 'connected'
    outputBuffer = ''

    logger.info('JumpServer connection successful', { event: 'jumpserver.connect.success', connectionId, targetIp: connectionInfo.targetIp, reason })
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
              logger.warn('Command list is empty', { event: 'jumpserver.commandlist.empty' })
            }
          } else if (commandListResult.status === 'fulfilled') {
            logger.error('Failed to get command list', { event: 'jumpserver.commandlist.error', error: commandListResult.value.error })
          }

          if (sudoCheckResult.status === 'fulfilled' && sudoCheckResult.value.success) {
            readyResult.hasSudo = (sudoCheckResult.value.stdout || '').trim() === 'true'
          }
        } catch (error) {
          logger.error('Error getting command list', {
            event: 'jumpserver.commandlist.error',
            error: error instanceof Error ? error.message : String(error)
          })
        }

        const mainWindow = BrowserWindow.getAllWindows()[0]
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send(`ssh:connect:data:${connectionId}`, readyResult)
        }
      })
      .catch((error) => {
        logger.error('JumpServer exec stream creation failed', {
          event: 'jumpserver.exec.create.error',
          connectionId,
          error: error instanceof Error ? error.message : String(error)
        })

        const mainWindow = BrowserWindow.getAllWindows()[0]
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send(`ssh:connect:data:${connectionId}`, {
            hasSudo: false,
            commandList: []
          })
          logger.debug('Sent empty command list to frontend (exec stream creation failed)', {
            event: 'jumpserver.commandlist.fallback',
            connectionId
          })
        } else {
          logger.error('Cannot send empty command list: window does not exist or is destroyed', { event: 'jumpserver.window.notfound', connectionId })
        }
      })

    resolve({ status: 'connected', message: 'Connection successful' })
  }

  stream.on('data', (data: Buffer) => {
    const ansiRegex = /[\u001b\u009b][[()#;?]*.{0,2}(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nry=><]/g
    const chunk = data.toString().replace(ansiRegex, '')
    outputBuffer += chunk

    if (connectionPhase === 'connecting' && outputBuffer.includes('Opt>')) {
      logger.debug('JumpServer menu detected, entering target IP', { event: 'jumpserver.menu.detected', connectionId })
      sendStatusUpdate('Connecting to target server...', 'info', 'ssh.jumpserver.connectingToTarget')
      connectionPhase = 'inputIp'
      outputBuffer = ''
      stream.write(connectionInfo.targetIp + '\r')
      return
    }

    if (connectionPhase === 'inputIp') {
      if (hasNoAssetsPrompt(outputBuffer)) {
        logger.warn('JumpServer asset not found for target IP', {
          event: 'jumpserver.asset.notfound',
          connectionId,
          targetIp: connectionInfo.targetIp
        })
        connectionFailed = true
        outputBuffer = ''
        stream.end()

        const hasOtherSessions = Array.from(jumpserverConnections.values()).some((item) => item.conn === conn)
        if (!hasOtherSessions) {
          conn.end()
        }

        reject(createNoAssetsError())
        return
      }

      if (hasUserSelectionPrompt(outputBuffer)) {
        logger.debug('Multiple user prompt detected, user selection required', { event: 'jumpserver.user.selection', connectionId })
        sendStatusUpdate('Multiple user accounts detected, please select...', 'info', 'ssh.jumpserver.multipleUsersDetected')
        connectionPhase = 'selectUser'
        const users = parseJumpServerUsers(outputBuffer)
        logger.debug('Parsed user list', { event: 'jumpserver.user.parsed', connectionId, userCount: users.length })

        if (users.length === 0) {
          logger.error('Failed to parse user list', { event: 'jumpserver.user.parse.error', connectionId })
          conn.end()
          reject(new Error('Failed to parse user list'))
          return
        }

        outputBuffer = ''

        if (!event) {
          logger.error('JumpServer user selection requires event object', { event: 'jumpserver.user.event.missing', connectionId })
          conn.end()
          reject(new Error('User selection requires event object'))
          return
        }

        handleJumpServerUserSelectionWithEvent(event, connectionId, users)
          .then((selectedUserId) => {
            logger.debug('User selected account', { event: 'jumpserver.user.selected', connectionId, selectedUserId })
            sendStatusUpdate('Connecting with selected account...', 'info', 'ssh.jumpserver.connectingWithSelectedAccount')
            connectionPhase = 'inputPassword'

            navigationPath.selectedUserId = selectedUserId

            stream.write(selectedUserId.toString() + '\r')
          })
          .catch((err) => {
            logger.error('User selection failed', {
              event: 'jumpserver.user.selection.error',
              connectionId,
              error: err instanceof Error ? err.message : String(err)
            })
            sendStatusUpdate('User selection cancelled', 'error', 'ssh.jumpserver.userSelectionCanceled')
            conn.end()
            reject(err)
          })
        return
      }

      if (hasPasswordPrompt(outputBuffer)) {
        sendStatusUpdate('Authenticating...', 'info', 'ssh.jumpserver.authenticating')
        connectionPhase = 'inputPassword'
        outputBuffer = ''
        sendPasswordToStream(stream, connectionInfo.password || '', navigationPath, 'After IP input')
        return
      }

      const reason = detectDirectConnectionReason(outputBuffer)
      if (reason) {
        logger.debug('JumpServer target asset requires no password, direct connection', { event: 'jumpserver.connect.direct', connectionId, reason })
        handleConnectionSuccess(`No password required - ${reason}`)
      } else {
        logger.debug('JumpServer inputIp phase waiting for more output', { event: 'jumpserver.inputIp.waiting', connectionId })
      }
      return
    }

    if (connectionPhase === 'selectUser') {
      if (hasPasswordPrompt(outputBuffer)) {
        sendStatusUpdate('Authenticating...', 'info', 'ssh.jumpserver.authenticating')
        connectionPhase = 'inputPassword'
        outputBuffer = ''
        sendPasswordToStream(stream, connectionInfo.password || '', navigationPath, 'After user selection')
        return
      }

      const reason = detectDirectConnectionReason(outputBuffer)
      if (reason) {
        logger.debug('JumpServer direct connection after user selection', { event: 'jumpserver.connect.direct', connectionId, reason })
        handleConnectionSuccess(`User selection - ${reason}`)
      }
      return
    }

    if (connectionPhase === 'inputPassword') {
      if (hasPasswordError(outputBuffer)) {
        logger.warn('JumpServer password authentication failed', { event: 'jumpserver.auth.failed', connectionId })

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
        logger.debug('JumpServer entered target server after password verification', { event: 'jumpserver.auth.success', connectionId, reason })
        handleConnectionSuccess(`After password verification - ${reason}`)
      }
    }
  })

  stream.stderr.on('data', (data: Buffer) => {
    logger.debug('JumpServer stderr received', { event: 'jumpserver.stderr', connectionId, size: data.length })
  })

  stream.on('close', () => {
    logger.debug('JumpServer stream closed', { event: 'jumpserver.stream.close', connectionId })

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
        logger.info('All sessions closed, releasing underlying connection', { event: 'jumpserver.disconnect', connectionId })
        connToClose.end()
      } else {
        logger.debug('Session closed, underlying connection still in use', { event: 'jumpserver.disconnect.partial', connectionId })
      }
    }

    // Clean up session data
    jumpserverShellStreams.delete(connectionId)
    jumpserverConnections.delete(connectionId)
    jumpserverConnectionStatus.delete(connectionId)
    jumpserverLastCommand.delete(connectionId)
    jumpserverInputBuffer.delete(connectionId)

    if (connectionPhase !== 'connected' && !connectionFailed) {
      reject(new Error('Connection closed before completion'))
    }
  })

  stream.on('error', (error: Error) => {
    logger.error('JumpServer stream error', { event: 'jumpserver.stream.error', connectionId, error: error.message })
    reject(error)
  })
}
