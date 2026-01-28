type PromptType = 'linux' | 'cisco' | 'huaweiUser' | 'huaweiSystem' | 'windows' | 'unknown'

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

export const getLastNonEmptyLine = (output: string): string => {
  if (!output) return ''
  const lines = output.replace(/\r\n|\r/g, '\n').split('\n')
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    let line = lines[i].trim()
    if (line) {
      // Clean ANSI sequences before processing
      line = line
        .replace(/\x1b\[[0-9;]*m/g, '') // Remove ANSI color codes
        .replace(/\x1b\[[0-9;]*[ABCDEFGJKST]/g, '') // Remove cursor control sequences
        .replace(/\x1b\[[0-9]*[XK]/g, '') // Remove erase sequences
        .replace(/\x1b\[[0-9;]*[Hf]/g, '') // Remove cursor position sequences
        .replace(/\x1b\[[?][0-9;]*[hl]/g, '') // Remove other ANSI sequences
        .replace(/\x1b\]0;[^\x07]*\x07/g, '') // Remove window title sequences
        .replace(/\x1b\]9;[^\x07]*\x07/g, '') // Remove PowerShell specific sequences
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // Remove remaining control characters
        .trim()

      if (line) {
        // Check if the line ends with a Windows prompt pattern
        // Look for patterns like "PS C:\path>" or "C:\path>" at the end of the line
        const windowsPromptMatch = line.match(/(PS\s+[A-Za-z]:[\\\/][^>]*>|[A-Za-z]:[\\\/][^>]*>)\s*$/)
        if (windowsPromptMatch) {
          return windowsPromptMatch[1]
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
