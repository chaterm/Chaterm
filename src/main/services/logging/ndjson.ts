export interface NdjsonFormatInput {
  data: unknown[]
  level: string
}

const CORE_FIELDS = ['timestamp', 'level', 'process', 'channel', 'module', 'message'] as const
const CORE_FIELD_SET = new Set<string>(CORE_FIELDS)

function canonicalizeEntry(entry: Record<string, unknown>): Record<string, unknown> {
  const ordered: Record<string, unknown> = {}

  // Keep core fields in a stable order for easier human scanning and machine parsing.
  for (const key of CORE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(entry, key)) {
      ordered[key] = entry[key]
    }
  }

  // Preserve insertion order for extra fields (do not sort).
  for (const [key, value] of Object.entries(entry)) {
    if (!CORE_FIELD_SET.has(key)) {
      ordered[key] = value
    }
  }

  return ordered
}

/**
 * Returns a single-line NDJSON payload as a one-element array.
 * electron-log file transport's default transform chain expects array data.
 */
export function formatNdjsonLine({ data, level }: NdjsonFormatInput): string[] {
  const entry = data[0]

  if (typeof entry === 'object' && entry !== null) {
    try {
      return [JSON.stringify(canonicalizeEntry(entry as Record<string, unknown>))]
    } catch {
      return [JSON.stringify({ level, message: '[serialization error]', timestamp: new Date().toISOString() })]
    }
  }

  return [JSON.stringify({ level, message: String(entry), timestamp: new Date().toISOString() })]
}
