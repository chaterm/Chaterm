import { hasPasswordPrompt, hasPasswordError, detectDirectConnectionReason } from './navigator'
import { hasUserSelectionPrompt } from './parser'
import { OutputParser } from './executor'
import { jumpserverConnections, jumpserverExecStreams, deleteExecStreamPromise, getExecStreamPromise, setExecStreamPromise } from './state'
import { JUMPSERVER_CONSTANTS, type JumpServerNavigationPath } from './constants'

export async function navigateToJumpServerAsset(
  stream: any,
  targetIp: string,
  navigationPath: JumpServerNavigationPath,
  jumpserverUuid: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    let outputBuffer = ''
    let connectionPhase = 'connecting'
    let connectionEstablished = false

    const cleanup = () => {
      stream.removeListener('data', dataHandler)
      stream.removeListener('error', errorHandler)
      stream.removeListener('close', closeHandler)
    }

    const handleNavigationSuccess = (reason: string) => {
      if (connectionEstablished) return
      connectionEstablished = true
      console.log(`JumpServer exec stream navigation successful (${jumpserverUuid}): ${reason}`)
      connectionPhase = 'connected'
      outputBuffer = ''
      cleanup()
      resolve()
    }

    const dataHandler = (data: Buffer) => {
      const ansiRegex = /[\u001b\u009b][[()#;?]*.{0,2}(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nry=><]/g
      const chunk = data.toString().replace(ansiRegex, '')
      outputBuffer += chunk

      if (connectionPhase === 'connecting' && outputBuffer.includes('Opt>')) {
        console.log(`JumpServer exec stream: Menu detected, entering IP ${targetIp}`)
        connectionPhase = 'inputIp'
        outputBuffer = ''
        stream.write(targetIp + '\r')
        return
      }

      if (connectionPhase === 'inputIp') {
        if (hasUserSelectionPrompt(outputBuffer)) {
          if (navigationPath.selectedUserId !== undefined) {
            console.log(`JumpServer exec stream: User selection prompt detected, auto-selecting userId=${navigationPath.selectedUserId}`)
            connectionPhase = 'selectUser'
            outputBuffer = ''
            stream.write(navigationPath.selectedUserId.toString() + '\r')
          } else {
            cleanup()
            reject(new Error('JumpServer exec stream: Multiple user scenario detected but selectedUserId not provided'))
          }
          return
        }

        if (hasPasswordPrompt(outputBuffer)) {
          if (navigationPath.password) {
            console.log('JumpServer exec stream: Password prompt detected, using saved password')
            connectionPhase = 'inputPassword'
            outputBuffer = ''
            setTimeout(() => {
              stream.write(navigationPath.password + '\r')
            }, JUMPSERVER_CONSTANTS.PASSWORD_INPUT_DELAY)
          } else {
            const reason = detectDirectConnectionReason(outputBuffer)
            if (reason) {
              console.log(`JumpServer exec stream: Password prompt detected but no password, attempting direct connection (${reason})`)
              handleNavigationSuccess(`Direct connection without password - ${reason}`)
            } else {
              console.warn('JumpServer exec stream: Password required but main connection did not record password, waiting for further output...')
            }
          }
          return
        }

        const reason = detectDirectConnectionReason(outputBuffer)
        if (reason) {
          handleNavigationSuccess(`No password required - ${reason}`)
        }
        return
      }

      if (connectionPhase === 'selectUser') {
        if (hasPasswordPrompt(outputBuffer)) {
          if (navigationPath.password) {
            console.log('JumpServer exec stream: Password prompt detected after user selection, using saved password')
            connectionPhase = 'inputPassword'
            outputBuffer = ''
            setTimeout(() => {
              stream.write(navigationPath.password + '\r')
            }, JUMPSERVER_CONSTANTS.PASSWORD_INPUT_DELAY)
          } else {
            const reason = detectDirectConnectionReason(outputBuffer)
            if (reason) {
              console.log(
                `JumpServer exec stream: Password prompt detected after user selection but no password, attempting direct connection (${reason})`
              )
              handleNavigationSuccess(`Direct connection without password after user selection - ${reason}`)
            } else {
              console.warn(
                'JumpServer exec stream: Password required after user selection but main connection did not record password, waiting for further output...'
              )
            }
          }
          return
        }

        const reason = detectDirectConnectionReason(outputBuffer)
        if (reason) {
          handleNavigationSuccess(`After user selection - ${reason}`)
        }
        return
      }

      if (connectionPhase === 'inputPassword') {
        if (hasPasswordError(outputBuffer)) {
          cleanup()
          reject(new Error('JumpServer exec stream: Password authentication failed'))
          return
        }

        const reason = detectDirectConnectionReason(outputBuffer)
        if (reason) {
          handleNavigationSuccess(`After password verification - ${reason}`)
        }
      }
    }

    const errorHandler = (error: Error) => {
      console.error('JumpServer exec stream navigation error:', error)
      cleanup()
      clearTimeout(timeout)
      reject(error)
    }

    const closeHandler = () => {
      console.log('JumpServer exec stream closed during navigation')
      cleanup()
      if (connectionPhase !== 'connected') {
        clearTimeout(timeout)
        reject(new Error('exec stream closed before navigation completed'))
      }
    }

    stream.on('data', dataHandler)
    stream.on('error', errorHandler)
    stream.on('close', closeHandler)

    const timeout = setTimeout(() => {
      cleanup()
      reject(new Error('JumpServer exec stream navigation timeout'))
    }, JUMPSERVER_CONSTANTS.NAVIGATION_TIMEOUT)
    const clearNavigationTimeout = () => clearTimeout(timeout)

    const originalResolve = resolve
    resolve = (value?: any) => {
      clearNavigationTimeout()
      originalResolve(value)
    }

    const originalReject = reject
    reject = (reason?: any) => {
      clearNavigationTimeout()
      originalReject(reason)
    }
  })
}

export async function createJumpServerExecStream(connectionId: string): Promise<any> {
  if (jumpserverExecStreams.has(connectionId)) {
    console.log(`[JumpServer:ExecStream] Reusing existing stream: ${connectionId}`)
    return jumpserverExecStreams.get(connectionId)
  }

  const existingPromise = getExecStreamPromise(connectionId)
  if (existingPromise) {
    console.log(`[JumpServer:ExecStream] Waiting for stream being created: ${connectionId}`)
    return existingPromise
  }

  console.log(`[JumpServer:ExecStream] Starting to create new stream: ${connectionId}`)

  const creationPromise = (async () => {
    try {
      const connData = jumpserverConnections.get(connectionId)
      if (!connData) {
        console.error(`[JumpServer:ExecStream] Connection data not found!`)
        console.error(`[JumpServer:ExecStream] Available connection ID list:`, Array.from(jumpserverConnections.keys()))
        throw new Error(`JumpServer connection not found: ${connectionId}`)
      }

      const { conn, jumpserverUuid, targetIp, navigationPath } = connData

      if (!targetIp) {
        console.error(`[JumpServer:ExecStream] Target asset information missing: targetIp=${targetIp}`)
        throw new Error(`JumpServer unable to get target asset information: ${connectionId}`)
      }

      if (!navigationPath) {
        console.error(`[JumpServer] Navigation path not recorded`)
        throw new Error(`JumpServer connection missing navigation path: ${connectionId}`)
      }

      const execStream: any = await new Promise((resolve, reject) => {
        conn.shell({ term: 'xterm-256color' }, (err: Error | undefined, stream: any) => {
          if (err) {
            console.error(`[JumpServer] Exec stream creation failed:`, err)
            reject(err)
          } else {
            resolve(stream)
          }
        })
      })

      await navigateToJumpServerAsset(execStream, targetIp, navigationPath, jumpserverUuid)

      jumpserverExecStreams.set(connectionId, execStream)

      execStream.on('close', () => {
        jumpserverExecStreams.delete(connectionId)
        deleteExecStreamPromise(connectionId)
      })

      deleteExecStreamPromise(connectionId)
      return execStream
    } catch (error) {
      deleteExecStreamPromise(connectionId)
      throw error
    }
  })()

  setExecStreamPromise(connectionId, creationPromise)
  return creationPromise
}

export async function executeCommandOnJumpServerExec(
  execStream: any,
  cmd: string
): Promise<{
  success: boolean
  stdout?: string
  stderr?: string
  exitCode?: number
  error?: string
}> {
  return new Promise((resolve) => {
    const { marker, exitCodeMarker } = OutputParser.generateMarkers()

    let outputBuffer = ''
    let timeoutHandle: NodeJS.Timeout
    let commandSent = false

    const dataHandler = (data: Buffer) => {
      if (!commandSent) return

      const chunk = data.toString()
      outputBuffer += chunk

      const hasMarker = outputBuffer.includes(marker)
      const hasExitCode = new RegExp(`${exitCodeMarker}\\d+`).test(outputBuffer)

      if (hasMarker && hasExitCode) {
        setTimeout(() => {
          cleanup()

          try {
            const markerPattern = new RegExp(`[\\r\\n]${marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\r\\n]`)
            const markerMatch = outputBuffer.match(markerPattern)

            if (!markerMatch || markerMatch.index === undefined) {
              throw new Error('Marker not found or format incorrect')
            }

            const rawOutput = outputBuffer.substring(0, markerMatch.index + 1)
            const stdout = OutputParser.cleanCommandOutput(rawOutput)
            const exitCode = OutputParser.extractExitCode(outputBuffer, exitCodeMarker)

            resolve({
              success: exitCode === 0,
              stdout,
              stderr: '',
              exitCode
            })
          } catch (parseError) {
            console.error('[JumpServer] Command output parsing error:', parseError)
            resolve({
              success: false,
              error: `Failed to parse command output: ${parseError}`,
              stdout: outputBuffer,
              stderr: '',
              exitCode: undefined
            })
          }
        }, JUMPSERVER_CONSTANTS.DATA_SETTLE_DELAY)
      }
    }

    const cleanup = () => {
      execStream.removeListener('data', dataHandler)
      clearTimeout(timeoutHandle)
    }

    timeoutHandle = setTimeout(() => {
      console.warn(`[JumpServer] Command execution timeout (${JUMPSERVER_CONSTANTS.COMMAND_EXEC_TIMEOUT}ms)`)
      cleanup()
      resolve({
        success: false,
        error: 'Command execution timeout',
        stdout: outputBuffer,
        stderr: '',
        exitCode: undefined
      })
    }, JUMPSERVER_CONSTANTS.COMMAND_EXEC_TIMEOUT)

    execStream.on('data', dataHandler)

    const fullCommand = `${cmd}; echo "${marker}"; echo "${exitCodeMarker}$?"\r`
    execStream.write(fullCommand)

    setTimeout(() => {
      commandSent = true
    }, JUMPSERVER_CONSTANTS.DATA_COLLECTION_DELAY)
  })
}
