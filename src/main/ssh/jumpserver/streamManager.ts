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
      console.log(`JumpServer exec 流导航成功 (${jumpserverUuid}): ${reason}`)
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
        console.log(`JumpServer exec 流：检测到菜单，输入 IP ${targetIp}`)
        connectionPhase = 'inputIp'
        outputBuffer = ''
        stream.write(targetIp + '\r')
        return
      }

      if (connectionPhase === 'inputIp') {
        if (hasUserSelectionPrompt(outputBuffer)) {
          if (navigationPath.selectedUserId !== undefined) {
            console.log(`JumpServer exec 流：检测到用户选择提示，自动选择 userId=${navigationPath.selectedUserId}`)
            connectionPhase = 'selectUser'
            outputBuffer = ''
            stream.write(navigationPath.selectedUserId.toString() + '\r')
          } else {
            cleanup()
            reject(new Error('JumpServer exec 流：检测到多用户场景但未提供 selectedUserId'))
          }
          return
        }

        if (hasPasswordPrompt(outputBuffer)) {
          if (navigationPath.password) {
            console.log('JumpServer exec 流：检测到密码提示，使用保存的密码')
            connectionPhase = 'inputPassword'
            outputBuffer = ''
            setTimeout(() => {
              stream.write(navigationPath.password + '\r')
            }, JUMPSERVER_CONSTANTS.PASSWORD_INPUT_DELAY)
          } else {
            const reason = detectDirectConnectionReason(outputBuffer)
            if (reason) {
              console.log(`JumpServer exec 流：检测到密码提示但无密码，尝试直接连接（${reason}）`)
              handleNavigationSuccess(`无密码直接连接 - ${reason}`)
            } else {
              console.warn('JumpServer exec 流：需要密码但主连接未记录密码，等待进一步输出...')
            }
          }
          return
        }

        const reason = detectDirectConnectionReason(outputBuffer)
        if (reason) {
          handleNavigationSuccess(`无需密码 - ${reason}`)
        }
        return
      }

      if (connectionPhase === 'selectUser') {
        if (hasPasswordPrompt(outputBuffer)) {
          if (navigationPath.password) {
            console.log('JumpServer exec 流：用户选择后检测到密码提示，使用保存的密码')
            connectionPhase = 'inputPassword'
            outputBuffer = ''
            setTimeout(() => {
              stream.write(navigationPath.password + '\r')
            }, JUMPSERVER_CONSTANTS.PASSWORD_INPUT_DELAY)
          } else {
            const reason = detectDirectConnectionReason(outputBuffer)
            if (reason) {
              console.log(`JumpServer exec 流：用户选择后检测到密码提示但无密码，尝试直接连接（${reason}）`)
              handleNavigationSuccess(`用户选择后无密码直接连接 - ${reason}`)
            } else {
              console.warn('JumpServer exec 流：用户选择后需要密码但主连接未记录密码，等待进一步输出...')
            }
          }
          return
        }

        const reason = detectDirectConnectionReason(outputBuffer)
        if (reason) {
          handleNavigationSuccess(`用户选择后 - ${reason}`)
        }
        return
      }

      if (connectionPhase === 'inputPassword') {
        if (hasPasswordError(outputBuffer)) {
          cleanup()
          reject(new Error('JumpServer exec 流：密码认证失败'))
          return
        }

        const reason = detectDirectConnectionReason(outputBuffer)
        if (reason) {
          handleNavigationSuccess(`密码验证后 - ${reason}`)
        }
      }
    }

    const errorHandler = (error: Error) => {
      console.error('JumpServer exec 流导航错误:', error)
      cleanup()
      clearTimeout(timeout)
      reject(error)
    }

    const closeHandler = () => {
      console.log('JumpServer exec 流在导航过程中关闭')
      cleanup()
      if (connectionPhase !== 'connected') {
        clearTimeout(timeout)
        reject(new Error('exec 流在导航完成前被关闭'))
      }
    }

    stream.on('data', dataHandler)
    stream.on('error', errorHandler)
    stream.on('close', closeHandler)

    const timeout = setTimeout(() => {
      cleanup()
      reject(new Error('JumpServer exec 流导航超时'))
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
    console.log(`[JumpServer:ExecStream] 复用已有流: ${connectionId}`)
    return jumpserverExecStreams.get(connectionId)
  }

  const existingPromise = getExecStreamPromise(connectionId)
  if (existingPromise) {
    console.log(`[JumpServer:ExecStream] 等待正在创建的流: ${connectionId}`)
    return existingPromise
  }

  console.log(`[JumpServer:ExecStream] 开始创建新流: ${connectionId}`)

  const creationPromise = (async () => {
    try {
      const connData = jumpserverConnections.get(connectionId)
      if (!connData) {
        console.error(`[JumpServer:ExecStream] 连接数据未找到!`)
        console.error(`[JumpServer:ExecStream] 可用的连接ID列表:`, Array.from(jumpserverConnections.keys()))
        throw new Error(`JumpServer 连接未找到: ${connectionId}`)
      }

      const { conn, jumpserverUuid, targetIp, navigationPath } = connData

      if (!targetIp) {
        console.error(`[JumpServer:ExecStream] 目标资产信息缺失: targetIp=${targetIp}`)
        throw new Error(`JumpServer 无法获取目标资产信息: ${connectionId}`)
      }

      if (!navigationPath) {
        console.error(`[JumpServer] 导航路径未记录`)
        throw new Error(`JumpServer 连接缺少导航路径: ${connectionId}`)
      }

      const execStream: any = await new Promise((resolve, reject) => {
        conn.shell({ term: 'xterm-256color' }, (err: Error | undefined, stream: any) => {
          if (err) {
            console.error(`[JumpServer] Exec流创建失败:`, err)
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
              throw new Error('标记未找到或格式不正确')
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
            console.error('[JumpServer] 命令输出解析错误:', parseError)
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
      console.warn(`[JumpServer] 命令执行超时 (${JUMPSERVER_CONSTANTS.COMMAND_EXEC_TIMEOUT}ms)`)
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
