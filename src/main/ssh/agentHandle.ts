import { ipcMain } from 'electron'
import { Client, ConnectConfig } from 'ssh2'
import { ConnectionInfo } from '../agent/integrations/remote-terminal'

// Store SSH connections
const remoteConnections = new Map<string, Client>()
// Store shell session streams
const remoteShellStreams = new Map()

export async function remoteSshConnect(connectionInfo: ConnectionInfo): Promise<{ id?: string; error?: string }> {
  const { host, port, username, password, privateKey, passphrase } = connectionInfo
  const connectionId = `ssh_${Date.now()}_${Math.random().toString(36).substr(2, 12)}`

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
      console.log(`SSH connection successful: ${connectionId}`)
      safeResolve({ id: connectionId })
    })

    conn.on('error', (err) => {
      if (secondAuthTriggered) return
      console.error('SSH connection error:', err.message)
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
      port: port || 22,
      username,
      keepaliveInterval: 10000, // Keep connection alive
      tryKeyboard: true // Disable keyboard-interactive
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
      console.error('SSH connection configuration error:', errorMessage)
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
    console.error(`SSH connection does not exist: ${sessionId}`)
    return { success: false, error: 'Not connected to remote server' }
  }
  console.log(`Starting SSH command: ${command} (Session: ${sessionId})`)

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
        safeResolve({
          success: code === 0 || code === 127,
          output: code === 127 ? output + "\nCommand not found. Please check if the command exists in the remote server's PATH." : output,
          error: code !== 0 && code !== 127 ? `Command failed with exit code: ${code}` : undefined
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
    console.error(`SSH connection does not exist: ${sessionId}`)
    return { success: false, error: 'Not connected to remote server' }
  }

  console.log(`Starting SSH command (stream): ${command} (Session: ${sessionId})`)

  const base64Command = Buffer.from(command, 'utf-8').toString('base64')
  const shellCommand = `CHATERM_COMMAND_B64='${base64Command}' exec bash -l -c 'eval "$(echo $CHATERM_COMMAND_B64 | base64 -d)"'`

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
          console.error('remoteSshExecStream onData callback error:', cbErr)
        }
      })

      stream.stderr.on('data', (data: Buffer) => {
        try {
          onData(data.toString())
        } catch (cbErr) {
          console.error('remoteSshExecStream stderr onData callback error:', cbErr)
        }
      })

      stream.on('close', (code: number | null) => {
        // Clean up the stored stream when it closes
        remoteShellStreams.delete(sessionId)

        if (code === 127) {
          try {
            onData("\nCommand not found. Please check if the command exists in the remote server's PATH.")
          } catch (cbErr) {
            console.error('remoteSshExecStream onData callback error:', cbErr)
          }
        }

        safeResolve({
          success: code === 0 || code === 127,
          error: code !== 0 && code !== 127 ? `Command failed with exit code: ${code}` : undefined
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

  const conn = remoteConnections.get(sessionId)
  if (conn) {
    conn.end()
    remoteConnections.delete(sessionId)
    console.log(`SSH connection disconnected: ${sessionId}`)
    return { success: true }
  }

  console.warn(`Attempting to disconnect non-existent SSH connection: ${sessionId}`)
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
