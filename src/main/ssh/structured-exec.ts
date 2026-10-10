import type { Client, ClientChannel } from 'ssh2'
import { StringDecoder } from 'node:string_decoder'
import type { RemoteCommandResult } from '../../shared/external-mcp'

export const MAX_COMMAND_OUTPUT_BYTES = 256 * 1024

export function executeSshCommand(conn: Client, command: string, timeoutMs: number, signal: AbortSignal): Promise<RemoteCommandResult> {
  return new Promise((resolve) => {
    let stream: ClientChannel | undefined
    let finished = false
    let submitted = false
    let bytes = 0
    const outDecoder = new StringDecoder('utf8')
    const errDecoder = new StringDecoder('utf8')
    const result: RemoteCommandResult = {
      status: 'execution_failed',
      stdout: '',
      stderr: '',
      exit_code: null,
      signal: null,
      truncated: false,
      output_mode: 'separate'
    }
    const finish = (status: RemoteCommandResult['status'], reason?: string) => {
      if (finished) return
      finished = true
      clearTimeout(timer)
      signal.removeEventListener('abort', abort)
      conn.removeListener('close', disconnected)
      result.stdout += outDecoder.end()
      result.stderr += errDecoder.end()
      resolve({ ...result, status, reason })
    }
    const stop = (reason: string) => {
      finish(submitted ? 'execution_unknown' : 'execution_failed', reason)
      // Closing a channel does not prove that the remote process stopped.
      try {
        stream?.signal('TERM')
        stream?.close()
      } catch {
        /* connection already gone */
      }
    }
    const abort = () => stop('Cancelled; remote termination is not confirmed')
    const disconnected = () => stop('SSH disconnected before a command result was received')
    const timer = setTimeout(() => stop('Command timed out; remote termination is not confirmed'), timeoutMs)
    signal.addEventListener('abort', abort, { once: true })
    conn.once('close', disconnected)
    if (signal.aborted) return abort()

    const collect = (field: 'stdout' | 'stderr', chunk: Buffer) => {
      if (finished) return
      const remaining = Math.max(0, MAX_COMMAND_OUTPUT_BYTES - bytes)
      const kept = chunk.subarray(0, remaining)
      bytes += kept.length
      if (kept.length < chunk.length) result.truncated = true
      result[field] += (field === 'stdout' ? outDecoder : errDecoder).write(kept)
    }
    try {
      submitted = true
      conn.exec(command, { pty: false }, (error, channel) => {
        if (error) return finish('execution_failed', 'SSH rejected the command')
        stream = channel
        if (finished) {
          channel.close()
          return
        }
        channel.on('data', (chunk: Buffer) => collect('stdout', chunk))
        channel.stderr.on('data', (chunk: Buffer) => collect('stderr', chunk))
        channel.on('exit', (code: number | null, exitSignal?: string) => {
          result.exit_code = code ?? null
          result.signal = exitSignal || null
        })
        channel.on('error', () => stop('SSH command channel failed'))
        channel.on('close', (code?: number, exitSignal?: string) => {
          result.exit_code ??= code ?? null
          result.signal ??= exitSignal || null
          finish(result.exit_code !== null || result.signal !== null ? 'executed' : 'execution_unknown')
        })
        // This tool is non-interactive. Programs waiting for stdin receive EOF.
        channel.end()
      })
    } catch {
      stop('SSH command submission failed')
    }
  })
}
