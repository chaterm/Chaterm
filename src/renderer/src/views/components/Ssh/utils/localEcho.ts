export type LocalEchoMode = 'none' | 'alternate' | 'ui'

export interface LocalEchoTerminal {
  write(data: string): void
}

export interface LocalEchoContext {
  isConnected: boolean
  terminalMode: LocalEchoMode
  isPaste?: boolean
  currentLine?: string
}

interface PendingEcho {
  alternatives: string[]
}

interface LocalEchoControllerOptions {
  enabled?: boolean
  maxPendingBytes?: number
}

const DEFAULT_MAX_PENDING_BYTES = 256
const MAX_PREDICTED_CODEPOINTS = 4
const BACKSPACE_REMOTE_ECHOES = ['\b \b', '\b\x1b[K', '\x1b[D \x1b[D']
const SENSITIVE_PROMPT_PATTERN =
  /(?:password|passphrase|passcode|verification\s*code|one[-\s]?time|otp|mfa|two[-\s]?factor|token|密码|口令|验证码|校验码)/i

function unique(values: string[]): string[] {
  return Array.from(new Set(values))
}

function containsControl(data: string): boolean {
  return /[\x00-\x1f\x7f]/.test(data)
}

function charDisplayWidth(char: string): number {
  const code = char.codePointAt(0) || 0
  return (code >= 0x3000 && code <= 0x9fff) ||
    (code >= 0xac00 && code <= 0xd7af) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xff00 && code <= 0xffef) ||
    (code >= 0x20000 && code <= 0x2fa1f)
    ? 2
    : 1
}

function isPrintablePrediction(data: string): boolean {
  if (!data) return false
  if (containsControl(data)) return false
  return Array.from(data).length <= MAX_PREDICTED_CODEPOINTS
}

function isBackspace(data: string): boolean {
  return data === '\x7f' || data === '\b'
}

function isLineSubmit(data: string): boolean {
  return data === '\r' || data === '\n'
}

function isSensitivePrompt(line?: string): boolean {
  return typeof line === 'string' && SENSITIVE_PROMPT_PATTERN.test(line)
}

export class LocalEchoController {
  private terminal: LocalEchoTerminal | null = null
  private enabled: boolean
  private maxPendingBytes: number
  private pending: PendingEcho[] = []
  private inputWidths: number[] = []

  constructor(options: LocalEchoControllerOptions = {}) {
    this.enabled = options.enabled === true
    this.maxPendingBytes = options.maxPendingBytes ?? DEFAULT_MAX_PENDING_BYTES
  }

  setTerminal(terminal: LocalEchoTerminal | null): void {
    this.terminal = terminal
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled
    if (!enabled) {
      this.reset()
    }
  }

  reset(): void {
    this.pending = []
    this.inputWidths = []
  }

  resetLine(): void {
    this.inputWidths = []
  }

  get pendingLength(): number {
    return this.pending.reduce((sum, entry) => sum + Math.max(...entry.alternatives.map((value) => value.length)), 0)
  }

  predict(data: string, context: LocalEchoContext): boolean {
    if (!this.enabled || !this.terminal || !context.isConnected || context.terminalMode !== 'none' || context.isPaste) {
      if (context.terminalMode !== 'none') {
        this.reset()
      }
      return false
    }

    if (isSensitivePrompt(context.currentLine)) {
      this.resetLine()
      return false
    }

    if (isLineSubmit(data)) {
      this.resetLine()
      return false
    }

    if (isBackspace(data)) {
      return this.predictBackspace()
    }

    if (!isPrintablePrediction(data)) {
      return false
    }

    if (this.pendingLength + data.length > this.maxPendingBytes) {
      this.reset()
      return false
    }

    this.terminal.write(data)
    this.pending.push({ alternatives: [data] })
    for (const char of Array.from(data)) {
      this.inputWidths.push(charDisplayWidth(char))
    }
    return true
  }

  reconcile(data: string): string {
    if (!this.enabled || this.pending.length === 0 || !data) {
      return data
    }

    const original = data
    let incoming = data

    while (incoming && this.pending.length > 0) {
      const entry = this.pending[0]
      const fullMatches = entry.alternatives.filter((expected) => incoming.startsWith(expected))

      if (fullMatches.length > 0) {
        const matched = fullMatches.sort((a, b) => b.length - a.length)[0]
        incoming = incoming.slice(matched.length)
        this.pending.shift()
        continue
      }

      const partialMatches = entry.alternatives.filter((expected) => expected.startsWith(incoming))
      if (partialMatches.length > 0) {
        entry.alternatives = unique(partialMatches.map((expected) => expected.slice(incoming.length)).filter(Boolean))
        if (entry.alternatives.length === 0) {
          this.pending.shift()
        }
        return ''
      }

      this.reset()
      return original
    }

    return incoming
  }

  private predictBackspace(): boolean {
    if (this.inputWidths.length === 0) {
      return false
    }

    const width = this.inputWidths[this.inputWidths.length - 1]
    if (width !== 1) {
      return false
    }

    if (this.pendingLength + BACKSPACE_REMOTE_ECHOES[0].length > this.maxPendingBytes) {
      this.reset()
      return false
    }

    this.inputWidths.pop()
    this.terminal?.write('\b \b')
    this.pending.push({ alternatives: BACKSPACE_REMOTE_ECHOES })
    return true
  }
}
