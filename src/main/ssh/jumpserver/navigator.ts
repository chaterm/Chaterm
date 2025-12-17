/**
 * JumpServer navigation helper functions
 * Extract common connection detection and state judgment logic
 */

/**
 * Detect if output contains password prompt
 */
export const hasPasswordPrompt = (text: string): boolean => {
  return text.includes('Password:') || text.includes('password:')
}

/**
 * Detect if output contains password error information
 */
export const hasPasswordError = (text: string): boolean => {
  return text.includes('password auth error') || text.includes('[Host]>')
}

/**
 * Detect if successfully connected to target server
 * @returns If connection success indicator is detected, returns reason description; otherwise returns null
 */
export const detectDirectConnectionReason = (text: string): string | null => {
  if (!text) return null

  // Keyword detection
  const indicators = ['Connecting to', '连接到', 'Last login:', 'Last failed login:']

  for (const indicator of indicators) {
    if (text.includes(indicator)) {
      return `Keyword ${indicator.trim()}`
    }
  }

  // Shell prompt detection
  const lines = text.split(/\r?\n/)
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue
    if (trimmed === '[Host]>' || trimmed.endsWith('Opt>')) continue

    const isPrompt =
      (trimmed.endsWith('$') || trimmed.endsWith('#') || trimmed.endsWith(']$') || trimmed.endsWith(']#') || trimmed.endsWith('>$')) &&
      (trimmed.includes('@') || trimmed.includes(':~') || trimmed.startsWith('['))

    if (isPrompt) {
      return `Prompt ${trimmed}`
    }
  }

  return null
}
