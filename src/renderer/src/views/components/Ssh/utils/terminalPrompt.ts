type PromptType = 'linux' | 'cisco' | 'huaweiUser' | 'huaweiSystem' | 'unknown'

type PromptMatchResult = {
  isPrompt: boolean
  type: PromptType
}

// Optional prefix pattern for conda/virtualenv environments like (base), (myenv), etc.
// Only allow zero or one space after the environment prefix (input is already trimmed)
const ENV_PREFIX = /(?:\([^)]+\) ?)?/

const PROMPT_PATTERNS: Array<{ type: PromptType; pattern: RegExp }> = [
  // Linux prompts with optional environment prefix (e.g., (base) [user@host]$)
  { type: 'linux', pattern: new RegExp(`^${ENV_PREFIX.source}\\[([^@]+)@([^\\]]+)\\][#$]\\s*$`) },
  { type: 'linux', pattern: new RegExp(`^${ENV_PREFIX.source}([^@]+)@([^:]+):(?:[^$]*|\\s*~)\\s*[$#]\\s*$`) },
  { type: 'linux', pattern: new RegExp(`^${ENV_PREFIX.source}\\[([^@]+)@([^\\]]+)\\s+[^\\]]*\\][#$]\\s*$`) },
  { type: 'linux', pattern: new RegExp(`^${ENV_PREFIX.source}[$#]\\s*$`) },
  { type: 'linux', pattern: new RegExp(`^${ENV_PREFIX.source}([^@]+)@([^\\s]+)\\s+(?:[^\\s]+\\s+)?[%$#]\\s*$`) },
  { type: 'linux', pattern: new RegExp(`^${ENV_PREFIX.source}[^\\s]+@[^\\s]+\\s+[%$#]\\s*$`) },
  { type: 'linux', pattern: new RegExp(`^${ENV_PREFIX.source}[%$#]\\s*$`) },
  // Shell name with version prompt (e.g., bash-5.1$, sh-4.4#, zsh-5.8$)
  { type: 'linux', pattern: new RegExp(`^${ENV_PREFIX.source}[a-z]+-[0-9]+\\.[0-9]+[$#]\\s*$`) },
  // Hostname only format (e.g., hostname:~$, myserver:/var/log#)
  { type: 'linux', pattern: new RegExp(`^${ENV_PREFIX.source}[a-zA-Z][a-zA-Z0-9_-]*:[^\\s]*[$#]\\s*$`) },
  // Path only format (e.g., ~/projects $, /var/log #, ~ $)
  { type: 'linux', pattern: new RegExp(`^${ENV_PREFIX.source}[~./][^\\s]*\\s+[$#]\\s*$`) },
  // Fish shell format (e.g., user@host ~/path>, hostname ~>)
  { type: 'linux', pattern: new RegExp(`^${ENV_PREFIX.source}([^@]+@)?[^\\s]+\\s+[^\\s]*>\\s*$`) },
  { type: 'linux', pattern: new RegExp(`^${ENV_PREFIX.source}>\\s*$`) },
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
