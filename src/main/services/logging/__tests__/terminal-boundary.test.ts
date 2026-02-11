import { describe, it, expect } from 'vitest'
import { sanitize } from '../sanitizer'
import { resolveChannel } from '../types'

/**
 * Terminal boundary tests.
 *
 * These tests verify that:
 * 1. Raw terminal output (stdout, stderr, chunk data) is never passed to the logger.
 *    This is enforced by code convention: logger calls must use metadata like
 *    { size: data.length } instead of logging raw data content.
 *
 * 2. Credential fields (password, privateKey, passphrase) are always redacted
 *    by the sanitizer when passed as metadata values.
 *
 * 3. Connection lifecycle events are properly structured with expected fields.
 */
describe('terminal-boundary', () => {
  describe('credential redaction in terminal context', () => {
    it('redacts password field in SSH connection metadata', () => {
      const meta = {
        event: 'ssh.connect',
        host: '192.168.1.1',
        port: 22,
        username: 'admin',
        password: 'my-secret-password'
      }
      const result = sanitize(meta) as Record<string, unknown>
      expect(result.password).toBe('[REDACTED]')
      expect(result.host).toBe('192.168.1.1')
      expect(result.username).toBe('admin')
    })

    it('redacts privateKey field in SSH connection metadata', () => {
      const meta = {
        event: 'ssh.connect',
        host: '192.168.1.1',
        privateKey: '-----BEGIN RSA PRIVATE KEY-----\nMIIE...'
      }
      const result = sanitize(meta) as Record<string, unknown>
      expect(result.privateKey).toBe('[REDACTED]')
    })

    it('redacts passphrase field in SSH connection metadata', () => {
      const meta = {
        event: 'ssh.connect',
        passphrase: 'key-passphrase-here'
      }
      const result = sanitize(meta) as Record<string, unknown>
      expect(result.passphrase).toBe('[REDACTED]')
    })

    it('redacts nested credential fields in connection config', () => {
      const meta = {
        event: 'ssh.connect',
        config: {
          host: '10.0.0.1',
          password: 'nested-secret',
          privateKey: 'nested-key-data'
        }
      }
      const result = sanitize(meta) as Record<string, unknown>
      const config = result.config as Record<string, unknown>
      expect(config.password).toBe('[REDACTED]')
      expect(config.privateKey).toBe('[REDACTED]')
      expect(config.host).toBe('10.0.0.1')
    })

    it('redacts PEM key content even in non-key-named fields', () => {
      const meta = {
        event: 'ssh.connect',
        data: '-----BEGIN OPENSSH PRIVATE KEY-----\nAAAA...'
      }
      const result = sanitize(meta) as Record<string, unknown>
      expect(result.data).toBe('[REDACTED]')
    })
  })

  describe('terminal data boundary enforcement', () => {
    // These tests verify that the sanitizer handles terminal-like data correctly.
    // The actual enforcement is done at the call site: loggers must never receive
    // raw terminal output. These tests document what WOULD happen if raw data leaked.

    it('truncates long strings that resemble terminal output', () => {
      // Simulate raw terminal output accidentally passed to logger
      const rawTerminalOutput = 'user@host:~$ ls -la\n' + 'drwxr-xr-x '.repeat(500)
      const meta = {
        event: 'terminal.data',
        output: rawTerminalOutput
      }
      const result = sanitize(meta) as Record<string, unknown>
      // Sanitizer truncates strings > 4096 chars
      if (rawTerminalOutput.length > 4096) {
        expect((result.output as string).length).toBeLessThan(rawTerminalOutput.length)
        expect(result.output as string).toContain('[truncated')
      }
    })

    it('preserves size metadata without logging content', () => {
      // This is the correct pattern: log size, not content
      const meta = {
        event: 'terminal.data',
        size: 1024
      }
      const result = sanitize(meta) as Record<string, unknown>
      expect(result.size).toBe(1024)
      expect(result.event).toBe('terminal.data')
    })

    it('preserves connection lifecycle events with safe metadata', () => {
      const connectMeta = {
        event: 'ssh.connect',
        host: '10.0.0.1',
        port: 22,
        username: 'deploy',
        authMethod: 'privateKey'
      }
      const result = sanitize(connectMeta) as Record<string, unknown>
      expect(result.event).toBe('ssh.connect')
      expect(result.host).toBe('10.0.0.1')
      expect(result.port).toBe(22)
      expect(result.username).toBe('deploy')
      expect(result.authMethod).toBe('privateKey')
    })

    it('preserves disconnect event metadata', () => {
      const disconnectMeta = {
        event: 'ssh.disconnect',
        sessionId: 'sess-123',
        reason: 'user-initiated'
      }
      const result = sanitize(disconnectMeta) as Record<string, unknown>
      expect(result.event).toBe('ssh.disconnect')
      expect(result.sessionId).toBe('sess-123')
    })

    it('preserves error event metadata without raw output', () => {
      const errorMeta = {
        event: 'ssh.error',
        error: 'Connection refused',
        host: '10.0.0.1',
        port: 22
      }
      const result = sanitize(errorMeta) as Record<string, unknown>
      expect(result.event).toBe('ssh.error')
      expect(result.error).toBe('Connection refused')
    })
  })

  describe('JumpServer credential handling', () => {
    it('redacts password in JumpServer connection metadata', () => {
      const meta = {
        event: 'jumpserver.connect',
        connectionId: 'js-001',
        host: '10.0.0.1',
        username: 'admin',
        password: 'jump-server-pwd'
      }
      const result = sanitize(meta) as Record<string, unknown>
      expect(result.password).toBe('[REDACTED]')
      expect(result.connectionId).toBe('js-001')
    })

    it('redacts token values that look like JWT', () => {
      const meta = {
        event: 'jumpserver.auth',
        data: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkw.signature'
      }
      const result = sanitize(meta) as Record<string, unknown>
      expect(result.data).toBe('[REDACTED]')
    })
  })

  describe('smoke test: createLogger output structure', () => {
    it('logger module with terminal channel produces correct metadata', () => {
      // Verify that terminal-related modules resolve to the terminal channel
      expect(resolveChannel('ssh')).toBe('terminal')
      expect(resolveChannel('terminal')).toBe('terminal')
      expect(resolveChannel('jumpserver')).toBe('terminal')
      expect(resolveChannel('remote-terminal')).toBe('terminal')
    })

    it('non-terminal modules resolve to app channel', () => {
      expect(resolveChannel('storage')).toBe('app')
      expect(resolveChannel('plugin')).toBe('app')
      expect(resolveChannel('updater')).toBe('app')
    })
  })
})
