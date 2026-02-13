// Log sanitizer - redacts sensitive fields and protects against complex objects

import type Logger from 'electron-log'

const REDACTED = '[REDACTED]'

// 16 credential key patterns (case-insensitive match)
const SENSITIVE_KEYS = new Set([
  'password',
  'privatekey',
  'passphrase',
  'token',
  'secret',
  'apikey',
  'accesskey',
  'authorization',
  'cookie',
  'credential',
  'jwt',
  'bearer',
  'key',
  'secretkey',
  'sessiontoken',
  'refreshtoken'
])

// 3 value patterns for detecting credentials in string values
const VALUE_PATTERNS = [/-----BEGIN.*PRIVATE KEY-----/, /eyJ[A-Za-z0-9_-]+\.eyJ/, /AKIA[0-9A-Z]{16}/]

const MAX_DEPTH = 4
const MAX_WIDTH = 32
const MAX_STRING_LENGTH = 4096

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEYS.has(key.toLowerCase())
}

function containsSensitiveValue(value: string): boolean {
  return VALUE_PATTERNS.some((pattern) => pattern.test(value))
}

function truncateString(value: string): string {
  if (value.length <= MAX_STRING_LENGTH) return value
  return value.slice(0, MAX_STRING_LENGTH) + `...[truncated, total ${value.length}]`
}

function sanitizeValue(value: unknown, depth: number, seen: WeakSet<object>): unknown {
  if (depth > MAX_DEPTH) return '[MAX_DEPTH]'

  if (value === null || value === undefined) return value

  if (typeof value === 'string') {
    if (containsSensitiveValue(value)) return REDACTED
    return truncateString(value)
  }

  if (typeof value === 'number' || typeof value === 'boolean') return value

  if (typeof value !== 'object') return String(value)

  if (seen.has(value as object)) return '[CIRCULAR]'
  seen.add(value as object)

  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack }
  }

  if (Array.isArray(value)) {
    return value.slice(0, MAX_WIDTH).map((item) => sanitizeValue(item, depth + 1, seen))
  }

  const result: Record<string, unknown> = {}
  const keys = Object.keys(value as Record<string, unknown>)
  const limitedKeys = keys.slice(0, MAX_WIDTH)

  for (const k of limitedKeys) {
    const v = (value as Record<string, unknown>)[k]
    if (isSensitiveKey(k)) {
      // For 'key' alone, only redact if value is a long string (likely a credential)
      if (k.toLowerCase() === 'key' && (typeof v !== 'string' || v.length < 20)) {
        result[k] = sanitizeValue(v, depth + 1, seen)
      } else {
        result[k] = REDACTED
      }
    } else {
      result[k] = sanitizeValue(v, depth + 1, seen)
    }
  }

  if (keys.length > MAX_WIDTH) {
    result['__truncated__'] = `${keys.length - MAX_WIDTH} more keys`
  }

  return result
}

/**
 * Sanitize a log entry object. Redacts sensitive fields, handles circular refs,
 * and enforces depth/width/string length limits.
 */
export function sanitize(obj: unknown): unknown {
  return sanitizeValue(obj, 0, new WeakSet())
}

/**
 * electron-log hook function for sanitizing log data.
 * Conforms to the Logger.Hook signature:
 *   (message: LogMessage, transport?, transportName?) => LogMessage | false
 */
export function sanitizeHook(message: Logger.LogMessage, _transport?: Logger.Transport, _transportName?: string): Logger.LogMessage | false {
  message.data = message.data.map((item) => sanitize(item))
  return message
}
