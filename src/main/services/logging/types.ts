// Unified logging system type definitions

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'
export type LogProcess = 'main' | 'preload' | 'renderer'
export type LogChannel = 'app' | 'terminal'

export interface LogWritePayload {
  level: LogLevel
  process: LogProcess
  module: string
  message: string
  meta?: Record<string, unknown>
}

export interface LoggerLike {
  debug(message: string, meta?: Record<string, unknown>): void
  info(message: string, meta?: Record<string, unknown>): void
  warn(message: string, meta?: Record<string, unknown>): void
  error(message: string, meta?: Record<string, unknown>): void
}

export interface LoggingConfig {
  level: LogLevel
  retentionDays: number
  maxFileSizeMB: number
  maxTotalSizeMB: number
  enabled: boolean
  updatedAt: number
}

// Minimal audit events that are always written even when enabled=false
export const AUDIT_EVENTS: ReadonlySet<string> = new Set([
  'app.startup',
  'app.shutdown',
  'renderer.crash',
  'auth.fail',
  'db.migration.fail'
])

// Module prefixes that map to the 'terminal' channel
export const TERMINAL_MODULE_PREFIXES = ['ssh', 'jumpserver', 'remote-terminal', 'terminal'] as const

// Maximum message length before truncation
export const MAX_MESSAGE_LENGTH = 10240

export const DEFAULT_CONFIG: LoggingConfig = {
  level: 'info',
  retentionDays: 30,
  maxFileSizeMB: 20,
  maxTotalSizeMB: 500,
  enabled: true,
  updatedAt: Date.now()
}

export function getDefaultLogLevelForEnvironment(nodeEnv: string | undefined): LogLevel {
  // return nodeEnv === 'development' ? 'error' : 'info'
  return nodeEnv === 'development' ? 'info' : 'info'
}

export function resolveChannel(module: string): LogChannel {
  return TERMINAL_MODULE_PREFIXES.some((prefix) => module.startsWith(prefix))
    ? 'terminal'
    : 'app'
}
