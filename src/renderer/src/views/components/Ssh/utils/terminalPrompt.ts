import { stripAnsiBasic } from './ansiUtils'

type PromptType = 'linux' | 'cisco' | 'huaweiUser' | 'huaweiSystem' | 'windows' | 'unknown'

type PromptMatchResult = {
  isPrompt: boolean
  type: PromptType
}

// Optional prefix pattern for conda/virtualenv environments like (base), (myenv), etc.
// Only allow zero or one space after the environment prefix (input is already trimmed)
const ENV_PREFIX = /(?:\([^)]+\) ?)?/
const ZSH_THEME_PROMPT_PATTERN = new RegExp(`^${ENV_PREFIX.source}[➜❯❮➤➔λ]\\s+\\S+(?:\\s+git:\\([^)]*\\))?(?:\\s+[✗✔✘!*+?-]+)?\\s*$`)

const PROMPT_PATTERNS: Array<{ type: PromptType; pattern: RegExp }> = [
  // Linux prompts with optional environment prefix (e.g., (base) [user@host]$)
  { type: 'linux', pattern: new RegExp(`^${ENV_PREFIX.source}\\[([^@\\]\\s]+)@([^\\]\\s]+)\\][#$]\\s*$`) },
  { type: 'linux', pattern: new RegExp(`^${ENV_PREFIX.source}([A-Za-z0-9._-]+)@([A-Za-z0-9._-]+):(?:[^$]*|\\s*~)\\s*[$#]\\s*$`) },
  { type: 'linux', pattern: new RegExp(`^${ENV_PREFIX.source}\\[([^@\\]\\s]+)@([^\\]\\s]+\\s+[^\\]]*)\\][#$]\\s*$`) },
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
  // Common zsh themes such as oh-my-zsh robbyrussell: "(base) ➜  ~"
  { type: 'linux', pattern: ZSH_THEME_PROMPT_PATTERN },
  // Fish shell format (e.g., user@host ~/path>, hostname ~>)
  { type: 'linux', pattern: new RegExp(`^${ENV_PREFIX.source}([^@]+@)?[^\\s]+\\s+[^\\s]*>\\s*$`) },
  { type: 'linux', pattern: new RegExp(`^${ENV_PREFIX.source}>\\s*$`) },
  // Git Bash specific patterns (e.g., user@host MINGW64 ~)
  { type: 'linux', pattern: /^([^@\s]+)@([^@\s]+)\s+(MINGW64|MINGW32|MSYS)\s+.*$/ },
  { type: 'cisco', pattern: /^[A-Za-z][A-Za-z0-9_-]*(?:\([A-Za-z0-9_-]+\))?[#>]\s*$/ },
  { type: 'huaweiUser', pattern: /^<[A-Za-z][A-Za-z0-9_-]*>\s*$/ },
  { type: 'huaweiSystem', pattern: /^\[[~*]*[A-Za-z][A-Za-z0-9_/-]*\]\s*$/ },
  // Windows PowerShell/CMD
  { type: 'windows', pattern: /^[A-Za-z]:[\\\/](?:(?:[^>\\\/]+[\\\/])*[^>\\\/]*)?>\s*$/ }, // C:\path>
  { type: 'windows', pattern: /^[A-Za-z]:[\\\/](?:(?:[^#\\\/]+[\\\/])*[^#\\\/]*)?#\s*$/ }, // C:\path#
  { type: 'windows', pattern: /^PS\s+[A-Za-z]:[\\\/](?:(?:[^>\\\/]+[\\\/])*[^>\\\/]*)?>\s*$/ }, // PS C:\path>
  { type: 'windows', pattern: /^PS\s+[A-Za-z]:[\\\/](?:(?:[^#\\\/]+[\\\/])*[^#\\\/]*)?#\s*$/ } // PS C:\path#
]

const cleanLineForPromptDetection = (line: string): string => stripAnsiBasic(line)

const extractTrailingPrompt = (line: string): string | null => {
  const trimmed = line.trimEnd()
  if (!trimmed) return null

  // Exact prompt line
  if (matchPrompt(trimmed).isPrompt) {
    return trimmed
  }

  // Fast-path for Windows prompts appended to output on the same line
  const windowsPromptMatch = trimmed.match(/(PS\s+[A-Za-z]:[\\\/][^>]*>|[A-Za-z]:[\\\/][^>]*>)\s*$/)
  if (windowsPromptMatch?.[1]) {
    return windowsPromptMatch[1]
  }

  // Generic suffix scan for no-newline cases:
  // output + prompt (e.g. ...][user@host ~]$)
  // Only scan the tail — prompts never exceed ~200 chars, so scanning the
  // entire line is wasteful for large outputs (O(n*m) per chunk).
  const maxPromptLen = 200
  const scanStart = Math.max(0, trimmed.length - maxPromptLen)
  for (let start = scanStart; start < trimmed.length; start += 1) {
    const candidateRaw = trimmed.slice(start)
    const candidate = candidateRaw.trimStart()
    if (!candidate) continue

    const candidateStart = trimmed.length - candidate.length
    const previousChar = candidateStart > 0 ? trimmed[candidateStart - 1] : ''
    const hasAlphaNumericBoundary = candidateStart > 0 && /[A-Za-z0-9]/.test(previousChar)
    const isLikelyUserHostPrompt = /@[^:\s]+:[^$#\s]*\s*[$#]\s*$/.test(candidate)
    const isLikelyZshThemePrompt = ZSH_THEME_PROMPT_PATTERN.test(candidate)

    if (isLikelyZshThemePrompt && candidateStart > 0) {
      continue
    }

    // Avoid matching inside ordinary words unless candidate clearly looks like a shell prompt.
    if (hasAlphaNumericBoundary && !isLikelyUserHostPrompt) {
      continue
    }

    if (!matchPrompt(candidate).isPrompt) {
      continue
    }

    // Single-char prompts are noisy when appended to normal output.
    if (/^[#$%>]$/.test(candidate) && !/\s/.test(previousChar)) {
      continue
    }

    return candidate
  }

  return null
}

export const getLastNonEmptyLine = (output: string): string => {
  if (!output) return ''
  const lines = output.replace(/\r\n|\r/g, '\n').split('\n')
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    let line = lines[i].trim()
    if (line) {
      line = cleanLineForPromptDetection(line).trim()

      if (line) {
        const trailingPrompt = extractTrailingPrompt(line)
        if (trailingPrompt) {
          return trailingPrompt
        }

        return line
      }
    }
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
