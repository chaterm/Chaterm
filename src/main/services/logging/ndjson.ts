export interface NdjsonFormatInput {
  data: unknown[]
  level: string
}

/**
 * Returns a single-line NDJSON payload as a one-element array.
 * electron-log file transport's default transform chain expects array data.
 */
export function formatNdjsonLine({ data, level }: NdjsonFormatInput): string[] {
  const entry = data[0]

  if (typeof entry === 'object' && entry !== null) {
    try {
      return [JSON.stringify(entry)]
    } catch {
      return [JSON.stringify({ level, message: '[serialization error]', timestamp: new Date().toISOString() })]
    }
  }

  return [JSON.stringify({ level, message: String(entry), timestamp: new Date().toISOString() })]
}
