// Log sanitizer - redacts sensitive fields and protects against complex objects

import type Logger from 'electron-log'

const REDACTED = '[REDACTED]'

// Credential key substrings (case-insensitive substring match).
// A field name like "anthropicApiKey" will match because it contains "apikey".
const SENSITIVE_KEY_SUBSTRINGS = [
  // Auth & credentials
  'password',
  'privatekey',
  'passphrase',
  'secret',
  'apikey',
  'accesskey',
  'authorization',
  'cookie',
  'credential',
  'sessiontoken',
  'refreshtoken',
  'bearer',
  // Connection identifiers
  'username',
  'proxyurl',
  'proxypass',
  'proxyuser',
  // Device identifiers
  'mac_address',
  'macaddress',
  // Encryption
  'encryptionkey'
]

// Short keywords that require exact match to avoid false positives
// (e.g. "token" would match "tokenizer", "key" would match "keyboard",
//        "host" would match "ghostwriter")
const SENSITIVE_KEY_EXACT = new Set(['token', 'jwt', 'key'])

// Keys whose string values get partial masking instead of full [REDACTED].
// Keeps debuggability (e.g. "192.168.1.***", "prod-server.***") while hiding details.
const PARTIAL_MASK_KEYS = new Set(['host', 'hostname'])

// Value patterns for detecting credentials in string values
const VALUE_PATTERNS = [
  /-----BEGIN.*PRIVATE KEY-----/, // PEM private keys
  /eyJ[A-Za-z0-9_-]+\.eyJ/, // JWT tokens
  /AKIA[0-9A-Z]{16}/, // AWS access keys
  /sk-ant-[a-zA-Z0-9_-]{20,}/, // Anthropic API keys
  /sk-(?:proj-)?[a-zA-Z0-9]{20,}/, // OpenAI API keys (sk-... or sk-proj-...)
  /\w+:\/\/[^/\s]+:[^/\s]+@/ // URL credentials (proto://user:pass@host)
]

// -- PII partial-masking patterns (order matters: more specific patterns first) --

function maskEmail(email: string): string {
  const at = email.indexOf('@')
  if (at < 0) return email
  const local = email.slice(0, at)
  const domain = email.slice(at)
  if (local.length <= 2) return '*'.repeat(local.length) + domain
  return local[0] + '***' + domain
}

const PII_PATTERNS: Array<{ pattern: RegExp; mask: (...args: string[]) => string }> = [
  // Inline credential labels in error messages: "apikey: xxx", "token: xxx", "password: xxx"
  // Captures the label + value so the label stays visible but the credential is masked
  {
    pattern: /\b(api[-_]?key|token|password|secret|authorization|bearer)(?::?\s+)([^\s"',]{8,})/gi,
    mask: (_m, label: string, value: string) => `${label}: ${value.slice(0, 4)}***${value.slice(-4)}`
  },
  // Chinese mainland phone: 1xx-xxxx-xxxx (with optional +86/86 prefix, optional separators)
  // Uses (?<!\d) lookbehind to avoid matching within longer digit sequences (e.g. ID cards)
  {
    pattern: /(?<!\d)(?:\+?86[-\s]?)?1[3-9]\d[-\s]?\d{4}[-\s]?\d{4}(?!\d)/g,
    mask: (m) => {
      const digits = m.replace(/[-\s]/g, '')
      const suffix = digits.slice(-4)
      const prefix = digits.slice(0, digits.length - 8)
      return prefix + '****' + suffix
    }
  },
  // International phone: +<country_code> <number> (7-15 digits total)
  {
    pattern: /\+\d{1,3}[-\s]\d[\d\-\s]{5,13}\d/g,
    mask: (m) => {
      const clean = m.replace(/[-\s]/g, '')
      if (clean.length < 8) return m
      return clean.slice(0, 4) + '****' + clean.slice(-4)
    }
  },
  // Email address
  {
    pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
    mask: maskEmail
  },
  // Chinese ID card (18 chars: 6-digit area + 8-digit birth + 3-digit seq + check digit, last may be X)
  // Must be before credit card to avoid false matches on 18-digit sequences
  {
    pattern: /\b[1-9]\d{5}(?:19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{3}[\dXx]\b/g,
    mask: (m) => m.slice(0, 6) + '********' + m.slice(-4)
  },
  // Credit card number (13-19 digits with optional space/dash separators)
  {
    pattern: /\b\d(?:[\d \-]{11,22})\d\b/g,
    mask: (m) => {
      const digits = m.replace(/[\s-]/g, '')
      if (digits.length < 13 || digits.length > 19) return m
      return digits.slice(0, 4) + ' **** **** ' + digits.slice(-4)
    }
  },
  // IPv4 address
  {
    pattern: /\b(?:(?:25[0-5]|2[0-4]\d|1?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|1?\d\d?)\b/g,
    mask: (m) => m.replace(/\.\d+$/, '.***')
  },
  // MAC address (AA:BB:CC:DD:EE:FF or AA-BB-CC-DD-EE-FF, case-insensitive)
  {
    pattern: /\b[0-9A-Fa-f]{2}(?:[-:][0-9A-Fa-f]{2}){5}\b/g,
    mask: (m) => {
      const sep = m.includes(':') ? ':' : '-'
      const parts = m.split(/[-:]/)
      return parts[0] + sep + parts[1] + sep + parts[2] + sep + '**' + sep + '**' + sep + '**'
    }
  },
  // IPv6 address (full form, compressed ::, and mixed IPv4-mapped)
  // Alternation ordered longest-first so greedy match captures full addresses
  {
    pattern:
      /(?:(?:[0-9A-Fa-f]{1,4}:){7}[0-9A-Fa-f]{1,4}|(?:[0-9A-Fa-f]{1,4}:){1,6}:[0-9A-Fa-f]{1,4}|(?:[0-9A-Fa-f]{1,4}:){1,5}(?::[0-9A-Fa-f]{1,4}){1,2}|(?:[0-9A-Fa-f]{1,4}:){1,4}(?::[0-9A-Fa-f]{1,4}){1,3}|(?:[0-9A-Fa-f]{1,4}:){1,3}(?::[0-9A-Fa-f]{1,4}){1,4}|(?:[0-9A-Fa-f]{1,4}:){1,2}(?::[0-9A-Fa-f]{1,4}){1,5}|[0-9A-Fa-f]{1,4}:(?::[0-9A-Fa-f]{1,4}){1,6}|:(?::[0-9A-Fa-f]{1,4}){1,7}|(?:[0-9A-Fa-f]{1,4}:){1,7}:|::)/g,
    mask: (m) => {
      // Show first segment, mask the rest
      const idx = m.indexOf(':')
      if (idx < 0) return '***'
      return m.slice(0, idx) + ':***'
    }
  }
]

function maskPiiInString(value: string): string {
  let result = value
  for (const { pattern, mask } of PII_PATTERNS) {
    // Create fresh regex to reset lastIndex
    result = result.replace(new RegExp(pattern.source, pattern.flags), mask)
  }
  return result
}

// Partial-mask a hostname/IP for debuggability: "prod.db.example.com" → "prod.db.***"
function maskHost(value: string): string {
  if (typeof value !== 'string' || value.length === 0) return value
  // If it looks like an IP, mask last octet
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(value)) {
    return value.replace(/\.\d+$/, '.***')
  }
  // For hostnames, mask last segment: "db.example.com" → "db.example.***"
  const dot = value.lastIndexOf('.')
  if (dot > 0) return value.slice(0, dot) + '.***'
  // Single-label host (no dots): mask the second half
  if (value.length <= 4) return '***'
  return value.slice(0, Math.ceil(value.length / 2)) + '***'
}

const MAX_DEPTH = 4
const MAX_WIDTH = 32
const MAX_STRING_LENGTH = 4096

function isSensitiveKey(key: string): boolean {
  const lower = key.toLowerCase()
  if (SENSITIVE_KEY_EXACT.has(lower)) return true
  return SENSITIVE_KEY_SUBSTRINGS.some((sub) => lower.includes(sub))
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
    return truncateString(maskPiiInString(value))
  }

  if (typeof value === 'number' || typeof value === 'boolean') return value

  if (typeof value !== 'object') return String(value)

  if (seen.has(value as object)) return '[CIRCULAR]'
  seen.add(value as object)

  if (value instanceof Error) {
    return {
      name: value.name,
      message: sanitizeValue(value.message, depth + 1, seen),
      stack: sanitizeValue(value.stack, depth + 1, seen)
    }
  }

  if (Array.isArray(value)) {
    return value.slice(0, MAX_WIDTH).map((item) => sanitizeValue(item, depth + 1, seen))
  }

  const result: Record<string, unknown> = {}
  const keys = Object.keys(value as Record<string, unknown>)
  const limitedKeys = keys.slice(0, MAX_WIDTH)

  for (const k of limitedKeys) {
    const v = (value as Record<string, unknown>)[k]
    const lower = k.toLowerCase()
    if (PARTIAL_MASK_KEYS.has(lower)) {
      // host/hostname: partial mask for debuggability
      result[k] = typeof v === 'string' ? maskHost(v) : sanitizeValue(v, depth + 1, seen)
    } else if (isSensitiveKey(k)) {
      // For 'key' alone, only redact if value is a long string (likely a credential)
      if (lower === 'key' && (typeof v !== 'string' || v.length < 20)) {
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
