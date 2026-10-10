import { randomUUID } from 'node:crypto'
import type { ClientChannel } from 'ssh2'
import { StringDecoder } from 'node:string_decoder'
import { RemoteTerminalManager, type ConnectionInfo, type RemoteTerminalInfo } from '../../agent/integrations/remote-terminal'
import { jumpserverShellStreams } from '../../agent/integrations/remote-terminal/jumpserverHandle'
import { capabilityRegistry } from '../../ssh/capabilityRegistry'
import { remoteSshExecStructured } from '../../ssh/agentHandle'
import { MAX_COMMAND_OUTPUT_BYTES } from '../../ssh/structured-exec'
import type { RemoteCommandResult } from '../../../shared/external-mcp'

interface Connection {
  manager: RemoteTerminalManager
  terminal: RemoteTerminalInfo
  busy: boolean
  idleTimer?: NodeJS.Timeout
}

// A shell-only bastion cannot separate stdout/stderr. Report combined output explicitly.
export function executeShellCommand(stream: ClientChannel, command: string, timeoutMs: number, signal: AbortSignal): Promise<RemoteCommandResult> {
  return new Promise((resolve) => {
    const nonce = randomUUID().replaceAll('-', '')
    const start = `CHATERM_START_${nonce}`
    const end = `CHATERM_END_${nonce}`
    let started = false
    let finished = false
    let buffer = ''
    let bytes = 0
    const decoder = new StringDecoder('utf8')
    const result: RemoteCommandResult = {
      status: 'execution_unknown',
      stdout: '',
      stderr: '',
      exit_code: null,
      signal: null,
      truncated: false,
      output_mode: 'combined'
    }
    const finish = (reason?: string) => {
      if (finished) return
      finished = true
      clearTimeout(timer)
      signal.removeEventListener('abort', abort)
      stream.removeListener('data', onData)
      stream.removeListener('close', close)
      stream.removeListener('error', close)
      resolve({ ...result, reason })
    }
    const append = (text: string) => {
      const chunk = Buffer.from(text)
      const remaining = Math.max(0, MAX_COMMAND_OUTPUT_BYTES - bytes)
      bytes += Math.min(remaining, chunk.length)
      result.stdout += chunk.subarray(0, remaining).toString('utf8')
      if (chunk.length > remaining) result.truncated = true
    }
    const onData = (chunk: Buffer) => {
      buffer += decoder.write(chunk)
      if (!started) {
        const index = buffer.indexOf(`\n${start}\r\n`)
        const unixIndex = buffer.indexOf(`\n${start}\n`)
        const found = index >= 0 ? index : unixIndex
        if (found < 0) {
          buffer = buffer.slice(-512)
          return
        }
        buffer = buffer.slice(found + start.length + (index >= 0 ? 3 : 2))
        started = true
      }
      const marker = buffer.indexOf(`\n${end}:`)
      if (marker >= 0) {
        const match = buffer.slice(marker).match(new RegExp(`^\\n${end}:(\\d+)\\r?\\n`))
        if (match) {
          append(buffer.slice(0, marker))
          result.status = 'executed'
          result.exit_code = Number(match[1])
          finish()
          return
        }
      }
      // Keep only a small marker suffix even for output without newlines.
      if (buffer.length > 512) {
        append(buffer.slice(0, -512))
        buffer = buffer.slice(-512)
      }
    }
    const close = () => {
      if (started) append(buffer)
      finish('Shell closed before an exit marker was received')
    }
    const abort = () => {
      if (started) append(buffer)
      finish('Cancelled; remote termination is not confirmed')
      stream.write('\x03')
    }
    const timer = setTimeout(() => {
      if (started) append(buffer)
      finish('Command timed out; remote termination is not confirmed')
      stream.write('\x03')
    }, timeoutMs)
    stream.on('data', onData)
    stream.once('close', close)
    stream.once('error', close)
    signal.addEventListener('abort', abort, { once: true })
    if (signal.aborted) {
      result.status = 'execution_failed'
      finish('Cancelled before submission')
      return
    }
    const quoted = command.replaceAll("'", "'\\''")
    // Use a subshell so cd/exit cannot alter the pooled shell or suppress our marker.
    stream.write(`printf '\\n${start}\\n'; sh -c '${quoted}' </dev/null; printf '\\n${end}:%s\\n' "$?"\n`)
  })
}

export class RemoteExecutionService {
  private connections = new Map<string, Connection>()
  private connecting = new Set<string>()
  private disposed = false

  reset(): void {
    this.disposed = false
  }

  async execute(targetId: string, info: ConnectionInfo, command: string, timeoutMs: number, signal: AbortSignal): Promise<RemoteCommandResult> {
    if (this.disposed || signal.aborted) throw new Error('Execution cancelled')
    if (this.connecting.has(targetId) || this.connections.get(targetId)?.busy) throw new Error('target_busy')
    let entry = this.connections.get(targetId)
    if (!entry) {
      if (this.connections.size + this.connecting.size >= 16) throw new Error('connection_limit')
      this.connecting.add(targetId)
      const manager = new RemoteTerminalManager(true)
      try {
        manager.setConnectionInfo(info)
        const terminal = await manager.createTerminal()
        if (this.disposed || signal.aborted) throw new Error('Execution cancelled')
        entry = { manager, terminal, busy: false }
        this.connections.set(targetId, entry)
      } catch (error) {
        await manager.disposeAll()
        throw error
      } finally {
        this.connecting.delete(targetId)
      }
    }
    clearTimeout(entry.idleTimer)
    entry.busy = true
    try {
      const { sessionId, connectionInfo } = entry.terminal
      const type = connectionInfo.sshType || 'ssh'
      let result: RemoteCommandResult
      if (type === 'ssh') result = await remoteSshExecStructured(sessionId, command, timeoutMs, signal)
      else {
        const stream =
          type === 'jumpserver' ? jumpserverShellStreams.get(sessionId) : capabilityRegistry.getBastion(type)?.getShellStream?.(sessionId)
        if (!stream) throw new Error('interactive_not_supported: No command stream is available')
        result = await executeShellCommand(stream as ClientChannel, command, timeoutMs, signal)
      }
      if (result.status !== 'executed') await this.remove(targetId, entry)
      return result
    } catch (error) {
      await this.remove(targetId, entry)
      throw error
    } finally {
      entry.busy = false
      if (this.connections.get(targetId) === entry) {
        const idle = entry
        entry.idleTimer = setTimeout(() => {
          void this.remove(targetId, idle)
        }, 5 * 60_000)
        entry.idleTimer.unref()
      }
    }
  }

  private async remove(id: string, entry: Connection) {
    clearTimeout(entry.idleTimer)
    if (this.connections.get(id) === entry) this.connections.delete(id)
    await entry.manager.disposeAll()
  }

  async dispose() {
    this.disposed = true
    await Promise.all([...this.connections].map(([id, entry]) => this.remove(id, entry)))
  }
}
