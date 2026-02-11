// Main process vendor console capture
// Intercepts console.* calls from third-party libraries and routes them to the unified logger.
// Logger internal diagnostics MUST use RAW_CONSOLE to prevent recursion.

import { inspect } from 'util'
import type { LoggerLike } from './types'

// Preserve original console methods before any patching
export const RAW_CONSOLE = {
  log: console.log.bind(console),
  info: console.info.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
  debug: console.debug.bind(console)
} as const

let vendorLogger: LoggerLike | null = null
let isCapturing = false
let isInsideLogger = false // recursion guard

function safeStringify(value: unknown): string {
  const seen = new WeakSet<object>()

  return JSON.stringify(value, (_key, currentValue) => {
    if (currentValue instanceof Error) {
      return {
        name: currentValue.name,
        message: currentValue.message,
        stack: currentValue.stack
      }
    }

    if (typeof currentValue === 'bigint') {
      return `${currentValue.toString()}n`
    }

    if (typeof currentValue === 'function') {
      return `[Function ${currentValue.name || 'anonymous'}]`
    }

    if (typeof currentValue === 'object' && currentValue !== null) {
      if (seen.has(currentValue)) {
        return '[Circular]'
      }
      seen.add(currentValue)
    }

    return currentValue
  })
}

function serializeConsoleArg(value: unknown): string {
  if (typeof value === 'string') return value

  if (value instanceof Error) {
    return `${value.name}: ${value.message}`
  }

  try {
    return safeStringify(value)
  } catch {
    try {
      return inspect(value, { depth: 6, breakLength: 120, maxArrayLength: 100 })
    } catch {
      return '[Unserializable value]'
    }
  }
}

function extractErrorMeta(args: unknown[]): Record<string, unknown> {
  const firstError = args.find((arg): arg is Error => arg instanceof Error)

  if (!firstError) return {}

  return {
    errorName: firstError.name,
    errorMessage: firstError.message,
    errorStack: firstError.stack
  }
}

function buildMessage(args: unknown[]): string {
  const firstError = args.find((arg): arg is Error => arg instanceof Error)
  const nonErrorParts = args
    .filter((arg) => !(arg instanceof Error))
    .map((arg) => serializeConsoleArg(arg))

  if (!firstError) {
    return nonErrorParts.join(' ')
  }

  if (nonErrorParts.length === 0) {
    return `${firstError.name}: ${firstError.message}`
  }

  return `${nonErrorParts.join(' ')} ${firstError.message}`
}

/**
 * Enable console capture. All console.* calls will be forwarded to the vendor logger.
 * Must be called after logging system is initialized.
 */
export function enableCapture(logger: LoggerLike): void {
  if (isCapturing) return
  vendorLogger = logger
  isCapturing = true

  const methods = ['log', 'info', 'warn', 'error', 'debug'] as const
  const levelMap: Record<string, keyof LoggerLike> = {
    log: 'info',
    info: 'info',
    warn: 'warn',
    error: 'error',
    debug: 'debug'
  }

  for (const method of methods) {
    console[method] = (...args: unknown[]) => {
      // Recursion guard: if we're already inside the logger, use raw console
      if (isInsideLogger || !vendorLogger) {
        RAW_CONSOLE[method](...args)
        return
      }

      isInsideLogger = true
      try {
        const level = levelMap[method]
        const message = buildMessage(args)
        vendorLogger[level](message, { source: 'console', originalMethod: method, ...extractErrorMeta(args) })
      } catch {
        RAW_CONSOLE[method](...args)
      } finally {
        isInsideLogger = false
      }

      // Also output to original console in development
      if (process.env.NODE_ENV === 'development') {
        RAW_CONSOLE[method](...args)
      }
    }
  }
}

/**
 * Disable console capture, restoring original console methods.
 */
export function disableCapture(): void {
  if (!isCapturing) return
  isCapturing = false
  vendorLogger = null

  console.log = RAW_CONSOLE.log
  console.info = RAW_CONSOLE.info
  console.warn = RAW_CONSOLE.warn
  console.error = RAW_CONSOLE.error
  console.debug = RAW_CONSOLE.debug
}
