import { ipcMain } from 'electron'
import { Client, ConnectConfig } from 'ssh2'
import { ConnectionInfo } from '../agent/integrations/remote-terminal'
import { createProxySocket } from './proxy'
import { createProxyCommandSocket, getReusableSshConnection, registerReusableSshSession, releaseReusableSshSession } from './sshHandle'
import { LEGACY_ALGORITHMS } from './algorithms'
import net from 'net'
import tls from 'tls'
import { getUserConfigFromRenderer } from '../index'
import { createLogger } from '@logging'

const logger = createLogger('ssh')

// Store SSH connections
const remoteConnections = new Map<string, Client>()
// Store shell session streams
const remoteShellStreams = new Map()
const reusedRemoteSessions = new Map<string, { poolKey: string }>()

// Helper function to determine if an exit code represents a real system error
// We only treat very specific exit codes as actual errors that should interrupt the flow
function isSystemError(_command: string, exitCode: number | null): boolean {
  if (exitCode === null || exitCode === 0) {
    return false // null or 0 is always success
  }
  return false
}

export async function remoteSshConnect(connectionInfo: ConnectionInfo): Promise<{ id?: string; error?: string }> {
  const { host, port, username, password, privateKey, passphrase } = connectionInfo
  const connectionId = `ssh_${Date.now()}_${Math.random().toString(36).substr(2, 12)}`
  const normalizedHost = host ?? ''
  const normalizedUsername = username ?? ''
  const normalizedPort = port || 22

  if (normalizedHost && normalizedUsername) {
    const reusable = getReusableSshConnection(normalizedHost, normalizedPort, normalizedUsername)
    if (reusable) {
      remoteConnections.set(connectionId, reusable.conn)
      reusedRemoteSessions.set(connectionId, { poolKey: reusable.poolKey })
      registerReusableSshSession(reusable.poolKey, connectionId)
      logger.info('SSH connection reused via MFA pool', { event: 'ssh.reuse', connectionId, host: normalizedHost, username: normalizedUsername })
      return Promise.resolve({ id: connectionId })
    }
  }

  let sock: net.Socket | tls.TLSSocket

  if (connectionInfo.proxyCommand) {
    sock = await createProxyCommandSocket(connectionInfo.proxyCommand, connectionInfo.host || '', port || 22)
  } else if (connectionInfo.needProxy) {
    const cfg = await getUserConfigFromRenderer()
    if (connectionInfo.proxyName) {
      const proxyConfig = cfg.sshProxyConfigs.find((item) => item.name === connectionInfo.proxyName)
      sock = await createProxySocket(proxyConfig, connectionInfo.host || '', connectionInfo.port || 22)
    }
  }

  return new Promise((resolve) => {
    const conn = new Client()
    let secondAuthTriggered = false
    let resolved = false

    const safeResolve = (result: { id?: string; error?: string }) => {
      if (!resolved) {
        resolved = true
        resolve(result)
      }
    }

    conn.on('keyboard-interactive', () => {
      secondAuthTriggered = true
      conn.end()
      safeResolve({ error: 'Server requires second authentication (e.g., OTP/2FA), cannot connect.' })
    })

    conn.on('ready', () => {
      if (secondAuthTriggered) return
      remoteConnections.set(connectionId, conn)
      logger.info('SSH connection successful', { event: 'ssh.connect', connectionId })
      safeResolve({ id: connectionId })
    })

    conn.on('error', (err) => {
      if (secondAuthTriggered) return
      logger.error('SSH connection error', { event: 'ssh.error', error: err.message })
      conn.end()
      safeResolve({ error: err.message })
    })

    conn.on('close', () => {
      if (secondAuthTriggered) return
      // If the connection closes before the 'ready' event, and no 'error' event is triggered,
      // this usually means all authentication methods failed.
      safeResolve({ error: 'SSH connection closed, possibly authentication failed.' })
    })

    const connectConfig: ConnectConfig = {
      host,
      port: normalizedPort,
      username,
      keepaliveInterval: 10000, // Keep connection alive
      tryKeyboard: true, // Disable keyboard-interactive
      algorithms: LEGACY_ALGORITHMS
    }

    connectConfig.ident = connectionInfo.ident

    if (connectionInfo.needProxy || connectionInfo.proxyCommand) {
      connectConfig.sock = sock
    }

    try {
      if (privateKey) {
        connectConfig.privateKey = privateKey
        if (passphrase) {
          connectConfig.passphrase = passphrase
        }
      } else if (password) {
        connectConfig.password = password
      } else {
        safeResolve({ error: 'Missing password or private key' })
        return
      }
      conn.connect(connectConfig)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      logger.error('SSH connection configuration error', { event: 'ssh.config.error', error: errorMessage })
      safeResolve({ error: `Connection configuration error: ${errorMessage}` })
    }
  })
}

export async function remoteSshExec(
  sessionId: string,
  command: string,
  timeoutMs: number = 30 * 60 * 1000
): Promise<{ success?: boolean; output?: string; error?: string }> {
  const conn = remoteConnections.get(sessionId)

  if (!conn) {
    logger.error('SSH connection does not exist', { event: 'ssh.exec.notfound', sessionId })
    return { success: false, error: 'Not connected to remote server' }
  }
  logger.debug('Starting SSH command', { event: 'ssh.exec', sessionId })

  const base64Command = Buffer.from(command, 'utf-8').toString('base64')
  const shellCommand = `CHATERM_COMMAND_B64='${base64Command}' exec bash -l -c 'eval "$(echo $CHATERM_COMMAND_B64 | base64 -d)"'`

  return new Promise((resolve) => {
    let timeoutHandler: NodeJS.Timeout
    let finished = false

    function safeResolve(result: { success?: boolean; output?: string; error?: string }) {
      if (!finished) {
        finished = true
        clearTimeout(timeoutHandler)
        resolve(result)
      }
    }

    conn.exec(shellCommand, { pty: true }, (err, stream) => {
      if (err) {
        safeResolve({ success: false, error: err.message })
        return
      }

      let output = ''

      stream.on('data', (data: Buffer) => {
        output += data.toString()
      })

      stream.stderr.on('data', (data: Buffer) => {
        output += data.toString()
      })

      stream.on('close', (code: number | null) => {
        const isError = isSystemError(command, code)
        let finalOutput = output

        // Add exit code information to output for AI model to interpret
        if (code !== null && code !== 0) {
          finalOutput += `\n[Exit Code: ${code}]`
        }

        // Add command not found message for exit code 127
        if (code === 127) {
          finalOutput += "\nCommand not found. Please check if the command exists in the remote server's PATH."
        }

        safeResolve({
          success: !isError,
          output: finalOutput,
          error: isError ? `Command failed with exit code: ${code}` : undefined
        })
      })

      // Set timeout
      timeoutHandler = setTimeout(() => {
        // stream termination
        try {
          stream.close()
        } catch {}
        safeResolve({
          success: false,
          output: output,
          error: `Command execution timed out (${timeoutMs}ms)`
        })
      }, timeoutMs)
    })
  })
}

// New: SSH command execution method supporting real-time streaming output
export async function remoteSshExecStream(
  sessionId: string,
  command: string,
  onData: (chunk: string) => void,
  timeoutMs: number = 30 * 60 * 1000
): Promise<{ success?: boolean; error?: string; stream?: any }> {
  const conn = remoteConnections.get(sessionId)
  if (!conn) {
    logger.error('SSH stream connection does not exist', { event: 'ssh.exec.stream.notfound', sessionId })
    return { success: false, error: 'Not connected to remote server' }
  }

  logger.debug('Starting SSH command (stream)', { event: 'ssh.exec.stream', sessionId })

  const shellCommand = `exec bash -l -c '${command.replace(/'/g, "'\\''")}'`

  return new Promise((resolve) => {
    let timeoutHandler: NodeJS.Timeout
    let finished = false

    function safeResolve(result: { success?: boolean; error?: string; stream?: any }) {
      if (!finished) {
        finished = true
        clearTimeout(timeoutHandler)
        resolve(result)
      }
    }

    conn.exec(shellCommand, { pty: true }, (err, stream) => {
      if (err) {
        safeResolve({ success: false, error: err.message })
        return
      }

      // Store the stream for later input operations
      remoteShellStreams.set(sessionId, stream)

      stream.on('data', (data: Buffer) => {
        try {
          onData(data.toString())
        } catch (cbErr) {
          logger.error('remoteSshExecStream onData callback error', { event: 'ssh.exec.stream.callback.error', error: cbErr instanceof Error ? cbErr.message : String(cbErr) })
        }
      })

      stream.stderr.on('data', (data: Buffer) => {
        try {
          onData(data.toString())
        } catch (cbErr) {
          logger.error('remoteSshExecStream stderr callback error', { event: 'ssh.exec.stream.callback.error', error: cbErr instanceof Error ? cbErr.message : String(cbErr) })
        }
      })

      stream.on('close', (code: number | null) => {
        // Clean up the stored stream when it closes
        remoteShellStreams.delete(sessionId)

        // Add exit code information for AI model to interpret
        if (code !== null && code !== 0) {
          try {
            onData(`\n[Exit Code: ${code}]`)
          } catch (cbErr) {
            logger.error('remoteSshExecStream onData callback error', { event: 'ssh.exec.stream.callback.error', error: cbErr instanceof Error ? cbErr.message : String(cbErr) })
          }
        }

        if (code === 127) {
          try {
            onData("\nCommand not found. Please check if the command exists in the remote server's PATH.")
          } catch (cbErr) {
            logger.error('remoteSshExecStream onData callback error', { event: 'ssh.exec.stream.callback.error', error: cbErr instanceof Error ? cbErr.message : String(cbErr) })
          }
        }

        const isError = isSystemError(command, code)
        safeResolve({
          success: !isError,
          error: isError ? `Command failed with exit code: ${code}` : undefined
        })
      })

      // Set timeout
      timeoutHandler = setTimeout(() => {
        try {
          stream.close()
        } catch {}
        // Clean up the stored stream on timeout
        remoteShellStreams.delete(sessionId)
        safeResolve({
          success: false,
          error: `Command execution timed out (${timeoutMs}ms)`
        })
      }, timeoutMs)
    })
  })
}

export async function remoteSshDisconnect(sessionId: string): Promise<{ success?: boolean; error?: string }> {
  const stream = remoteShellStreams.get(sessionId)
  if (stream) {
    stream.end()
    remoteShellStreams.delete(sessionId)
  }

  const reuseInfo = reusedRemoteSessions.get(sessionId)
  if (reuseInfo) {
    remoteConnections.delete(sessionId)
    reusedRemoteSessions.delete(sessionId)
    releaseReusableSshSession(reuseInfo.poolKey, sessionId)
    logger.info('SSH reused connection session released', { event: 'ssh.disconnect', sessionId })
    return { success: true }
  }

  const conn = remoteConnections.get(sessionId)
  if (conn) {
    conn.end()
    remoteConnections.delete(sessionId)
    logger.info('SSH connection disconnected', { event: 'ssh.disconnect', sessionId })
    return { success: true }
  }

  logger.warn('Attempting to disconnect non-existent SSH connection', { event: 'ssh.disconnect.notfound', sessionId })
  return { success: false, error: 'No active remote connection' }
}

// Export function for direct use in main process
export function handleRemoteExecInput(streamId: string, input: string): { success: boolean; error?: string } {
  const stream = remoteShellStreams.get(streamId)
  if (stream) {
    stream.write(input)
    return { success: true }
  }
  return { success: false, error: 'Stream not found' }
}

export const registerRemoteTerminalHandlers = () => {
  ipcMain.handle('ssh:remote-connect', async (_event, connectionInfo) => {
    try {
      return await remoteSshConnect(connectionInfo)
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('ssh:remote-exec', async (_event, sessionId, command) => {
    try {
      return await remoteSshExec(sessionId, command)
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  // Streaming execution is not exposed via IPC, keep it internal

  ipcMain.handle('ssh:remote-disconnect', async (_event, sessionId) => {
    try {
      return await remoteSshDisconnect(sessionId)
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })
}
