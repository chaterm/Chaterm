type PromptType = 'linux' | 'cisco' | 'huaweiUser' | 'huaweiSystem' | 'unknown'

type PromptMatchResult = {
  isPrompt: boolean
  type: PromptType
}

const PROMPT_PATTERNS: Array<{ type: PromptType; pattern: RegExp }> = [
  { type: 'linux', pattern: /^\[([^@]+)@([^\]]+)\][#$]\s*$/ },
  { type: 'linux', pattern: /^([^@]+)@([^:]+):(?:[^$]*|\s*~)\s*[$#]\s*$/ },
  { type: 'linux', pattern: /^\[([^@]+)@([^\]]+)\s+[^\]]*\][#$]\s*$/ },
  { type: 'linux', pattern: /^[$#]\s*$/ },
  { type: 'cisco', pattern: /^[A-Za-z][A-Za-z0-9_-]*(?:\([A-Za-z0-9_-]+\))?[#>]\s*$/ },
  { type: 'huaweiUser', pattern: /^<[A-Za-z][A-Za-z0-9_-]*>\s*$/ },
  { type: 'huaweiSystem', pattern: /^\[[~*]*[A-Za-z][A-Za-z0-9_/-]*\]\s*$/ }
]

export const getLastNonEmptyLine = (output: string): string => {
  if (!output) return ''
  const lines = output.replace(/\r\n|\r/g, '\n').split('\n')
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i].trim()
    if (line) return line
  }
  return ''
}

export const matchPrompt = (line: string): PromptMatchResult => {
  const trimmed = (line || '').trim()
  if (!trimmed) {
    return { isPrompt: false, type: 'unknown' }
  }

  for (const entry of PROMPT_PATTERNS) {
    if (entry.pattern.test(trimmed)) {
      return { isPrompt: true, type: entry.type }
    }
  }

  return { isPrompt: false, type: 'unknown' }
}

export const isTerminalPromptLine = (line: string): boolean => matchPrompt(line).isPrompt
