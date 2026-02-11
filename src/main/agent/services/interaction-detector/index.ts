/**
 * InteractionDetector - Core detection logic for interactive command execution
 *
 * This module detects when a remote command is waiting for user input
 * and triggers appropriate UI interactions.
 *
 * Detection strategy:
 * 1. Quick rule matching (immediate) - for common patterns like password:, [Y/n]
 * 2. LLM intelligent detection (after timeout) - for complex cases
 *
 * Supported interaction types:
 * - confirm: Y/n, yes/no confirmations
 * - select: Numbered menu selections
 * - password: Password/passphrase input
 * - pager: less/more pagination controls
 * - enter: Press Enter to continue
 * - freeform: Generic text input
 */

import { EventEmitter } from 'events'
import stripAnsi from 'strip-ansi-cjs'
import { z } from 'zod'
import type { InteractionResult, InteractionRequest, QuickPattern, InteractionDetectorConfig, TuiCategory, InteractionDetectorEvents } from './types'

import { createLogger } from '@logging'

const logger = createLogger('agent')

// Re-export types
export * from './types'

// Zod schemas for LLM response validation
const ConfirmValuesSchema = z.object({
  yes: z.string().max(20),
  no: z.string().max(20),
  default: z.string().max(20).optional()
})

const InteractionResultSchema = z.object({
  needsInteraction: z.boolean(),
  interactionType: z.enum(['confirm', 'select', 'password', 'pager', 'enter', 'freeform']),
  promptHint: z.string().max(200),
  options: z.array(z.string().max(100)).max(10).optional(),
  optionValues: z.array(z.string().max(50)).max(10).optional(),
  confirmValues: ConfirmValuesSchema.optional(),
  exitKey: z.string().max(50).optional(),
  exitAppendNewline: z.boolean().optional()
})

/**
 * Default configuration values
 */
const DEFAULT_CONFIG: Required<InteractionDetectorConfig> = {
  initialTimeout: 5000,
  maxTimeout: 60000,
  maxLlmCalls: 3,
  maxLines: 20,
  lineBufferMaxLength: 2048,
  maxLlmContextLength: 4000,
  maxNetworkFails: 3,
  maxHashUnchangedCount: 3,
  maxSilentTimeout: 30000,
  pagerObservationTimeout: 2000,
  userLocale: 'en-US',
  tuiCancelSilenceMs: 1500,
  tuiHardTimeoutMs: 2000
}

/**
 * InteractionDetector class
 *
 * Monitors command output and detects when user interaction is needed.
 * Uses a combination of fast regex rules and LLM-based detection.
 */
export class InteractionDetector extends EventEmitter {
  // Typed event method overloads
  on<K extends keyof InteractionDetectorEvents>(event: K, listener: (...args: InteractionDetectorEvents[K]) => void): this
  on(event: string | symbol, listener: (...args: unknown[]) => void): this
  on(event: string | symbol, listener: (...args: unknown[]) => void): this {
    return super.on(event, listener)
  }

  emit<K extends keyof InteractionDetectorEvents>(event: K, ...args: InteractionDetectorEvents[K]): boolean
  emit(event: string | symbol, ...args: unknown[]): boolean
  emit(event: string | symbol, ...args: unknown[]): boolean {
    return super.emit(event, ...args)
  }

  private readonly command: string
  private readonly commandId: string
  private readonly taskId?: string
  private readonly config: Required<InteractionDetectorConfig>
  // Debug logging disabled by default in production, enable via CHATERM_DEBUG env or config
  private readonly debugEnabled: boolean

  // Timer management
  private timer: NodeJS.Timeout | null = null

  // Output buffering
  private outputBuffer: string[] = []
  private lineBuffer: string = ''
  private pausedOutputBuffer: string[] = []
  private pausedOutputSize: number = 0

  // State management
  private isPaused = false
  private isDetecting = false
  private lastOutputTime = 0
  private llmCallCount = 0
  private currentTimeout: number

  // Network error handling
  private networkFailCount = 0

  // Dismiss/suppress logic
  private dismissCount = 0
  private isSuppressed = false

  // Hash deduplication
  private lastOutputHash: string = ''
  private hashUnchangedCount: number = 0
  private lastHashChangeTime: number = Date.now()

  // Prompt debounce (to avoid false triggers)
  private promptDebounceTimer: NodeJS.Timeout | null = null
  private pendingPromptResult: InteractionResult | null = null
  private readonly PROMPT_DEBOUNCE_MS = 300

  // TUI detection
  private inAlternateScreen = false

  // TUI auto-cancel state
  private tuiCategory: TuiCategory = null
  private tuiSilenceTimer: NodeJS.Timeout | null = null
  private tuiHardTimeoutTimer: NodeJS.Timeout | null = null
  private lastOutputTimeForTui = 0

  // Pager state
  private isPager = false
  private pagerObservationMode = false
  private pagerObservationTimer: NodeJS.Timeout | null = null

  // Escape buffer for cross-chunk detection
  private escapeBuffer = ''
  private readonly ESCAPE_BUFFER_SIZE = 64

  // LLM caller function (injected dependency)
  private llmCaller: ((command: string, output: string, locale: string) => Promise<InteractionResult>) | null = null

  // Warning flag for missing LLM caller (one-time warning)
  private warnedMissingLlm = false

  // Quick pattern rules for immediate detection
  private readonly QUICK_PATTERNS: QuickPattern[] = [
    // Password prompts - immediate response
    { pattern: /password\s*:/i, type: 'password' },
    { pattern: /passphrase\s*:/i, type: 'password' },
    { pattern: /口令\s*:/i, type: 'password' },
    { pattern: /密码\s*[:：]/i, type: 'password' },
    { pattern: /\[sudo\]\s*password\s+for/i, type: 'password' },

    // Confirm prompts - extract actual values
    {
      pattern: /\[Y\/n\]/i,
      type: 'confirm',
      confirmValues: { yes: 'Y', no: 'n', default: 'Y' }
    },
    {
      pattern: /\[y\/N\]/i,
      type: 'confirm',
      confirmValues: { yes: 'y', no: 'N', default: 'N' }
    },
    {
      pattern: /\(yes\/no\)/i,
      type: 'confirm',
      confirmValues: { yes: 'yes', no: 'no' }
    },
    {
      pattern: /\[是\/否\]/i,
      type: 'confirm',
      confirmValues: { yes: '是', no: '否' }
    },
    {
      pattern: /\(y\/n\)/i,
      type: 'confirm',
      confirmValues: { yes: 'y', no: 'n' }
    },

    // Enter to continue
    { pattern: /press enter/i, type: 'enter' },
    { pattern: /按.*回车/i, type: 'enter' },
    { pattern: /continue\?/i, type: 'enter' },
    { pattern: /press any key/i, type: 'enter' },

    // Pager strong patterns (must be at end of line)
    { pattern: /--More--\s*$/i, type: 'pager' },
    { pattern: /\(END\)\s*$/i, type: 'pager' },
    { pattern: /^lines\s+\d+-\d+(?:\/\d+)?(?:\s*\(END\))?\s*$/i, type: 'pager' },
    { pattern: /^\s*:\s*$/, type: 'pager' }
  ]

  // Prompt suffix pattern for colon/question mark detection
  private readonly PROMPT_SUFFIX_PATTERN = /[:?：？]\s*$/

  // Prompt keywords whitelist
  private readonly PROMPT_KEYWORDS = [
    /password/i,
    /passwd/i,
    /密码/,
    /口令/,
    /username/i,
    /user\s*name/i,
    /用户名/,
    /login/i,
    /登录/,
    /enter/i,
    /input/i,
    /输入/,
    /请输入/,
    /continue/i,
    /proceed/i,
    /继续/,
    /confirm/i,
    /确认/,
    /passphrase/i,
    /token/i,
    /key/i,
    /secret/i,
    /verification/i,
    /code/i,
    /验证码/,
    /answer/i,
    /回答/,
    /choice/i,
    /select/i,
    /选择/,
    /value/i,
    /值/,
    /name/i,
    /名称/,
    /path/i,
    /路径/,
    /host/i,
    /主机/,
    /port/i,
    /端口/
  ]

  // Keywords that usually indicate a yes/no confirmation when ending with '?'
  private readonly CONFIRM_KEYWORDS = [
    /remove/i,
    /delete/i,
    /overwrite/i,
    /replace/i,
    /discard/i,
    /erase/i,
    /确认/,
    /删除/,
    /移除/,
    /覆盖/,
    /替换/,
    /丢弃/
  ]

  // Exclusion list for log prefixes and URLs
  private readonly PROMPT_EXCLUSIONS = [
    /^\s*\[?(INFO|DEBUG|WARN|WARNING|ERROR|TRACE|FATAL)\]?\s*:/i,
    /^\s*(INFO|DEBUG|WARN|WARNING|ERROR|TRACE|FATAL)\s+\d/i,
    /^\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}/,
    /^\d{2}:\d{2}:\d{2}/,
    /https?:\/\//i,
    /:\d{2,5}\/?$/,
    /^\/[\w\-\.\/]+:/,
    /^[A-Z]:\\[\w\-\.\\]+:/i,
    /^\s*"[\w\-]+"\s*:/,
    /^\s*[\w\-]+\s*=\s*/,
    /^\s*\w+\s+\|\s+/,
    /^\s*<[\w\-]+>/
  ]

  // Always-TUI: Programs that are always interactive
  private readonly ALWAYS_TUI_COMMANDS = [/^vim?\b/i, /^vi\b/i, /^nano\b/i, /^emacs\b/i, /^tmux\b/i, /^screen\b/i, /^mc\b/i, /^nnn\b/i, /^ranger\b/i]

  // Conditional-TUI: Programs that may be non-interactive with specific arguments
  private readonly CONDITIONAL_TUI_COMMANDS: Array<{
    pattern: RegExp
    nonInteractiveArgs: RegExp[]
  }> = [
    { pattern: /^top\b/i, nonInteractiveArgs: [/-n\s*\d+/, /-b\b/] },
    { pattern: /^htop\b/i, nonInteractiveArgs: [] },
    { pattern: /^btop\b/i, nonInteractiveArgs: [] },
    { pattern: /^mysql\b/i, nonInteractiveArgs: [/-e\s/, /--execute\b/, /--batch\b/, /--silent\b/] },
    { pattern: /^psql\b/i, nonInteractiveArgs: [/-c\s/, /--command\b/, /-t\b/, /-A\b/] },
    { pattern: /^redis-cli\b/i, nonInteractiveArgs: [/--raw\b/, /\s+\w+\s*$/] },
    { pattern: /^ssh\b/i, nonInteractiveArgs: [/-T\b/, /-o\s*BatchMode=yes/i, /\s+['"]?[^-]/] },
    { pattern: /^sftp\b/i, nonInteractiveArgs: [/-b\b/] },
    { pattern: /^ftp\b/i, nonInteractiveArgs: [/-n\b/] },
    { pattern: /^mongo\b/i, nonInteractiveArgs: [/--eval\b/, /-e\s/] }
  ]

  // Pager command whitelist (higher priority than TUI)
  private readonly PAGER_COMMANDS = [
    /^less\b/i,
    /^more\b/i,
    /^most\b/i,
    /^pg\b/i,
    /^view\b/i,
    /^man\b/i, // man pages
    /^git\s+log\b/i, // git log
    /^git\s+diff\b/i, // git diff
    /^journalctl\b/i, // journalctl
    /^systemctl\s+status\b/i, // systemctl status
    /\|\s*less\b/i, // piped to less
    /\|\s*more\b/i // piped to more
  ]

  // Pager output patterns (strong features)
  private readonly PAGER_OUTPUT_PATTERNS = [
    /\(END\)\s*$/,
    /--More--\s*$/i,
    /^lines\s+\d+-\d+(?:\/\d+)?(?:\s*\(END\))?\s*$/i,
    /^\s*:\s*$/,
    /Manual page\s+/i, // man page indicator
    /^NAME\s*$/i, // man page section
    /^SYNOPSIS\s*$/i // man page section
    // Note: "Press q to quit" is intentionally NOT here - it's an exit key hint,
    // not a pager indicator. Non-pager programs may also show this hint.
  ]

  // Pager weak patterns (only used as confirmation)
  private readonly PAGER_WEAK_PATTERNS = [/\d+%\s*$/]

  // Exit key detection patterns (strong rules)
  private readonly EXIT_KEY_PATTERNS: Array<{
    pattern: RegExp
    exitKey: string
    exitAppendNewline: boolean
  }> = [
    // Press q to quit/exit patterns
    { pattern: /press\s+q\s+to\s+quit/i, exitKey: 'q', exitAppendNewline: false },
    { pattern: /press\s+q\s+to\s+exit/i, exitKey: 'q', exitAppendNewline: false },
    { pattern: /press\s+'q'\s+to\s+quit/i, exitKey: 'q', exitAppendNewline: false },
    { pattern: /press\s+'q'\s+to\s+exit/i, exitKey: 'q', exitAppendNewline: false },
    { pattern: /\(q\s+to\s+quit\)/i, exitKey: 'q', exitAppendNewline: false },
    { pattern: /\[q\]\s*quit/i, exitKey: 'q', exitAppendNewline: false },
    // Type quit/exit patterns
    { pattern: /type\s+quit\s+to\s+exit/i, exitKey: 'quit', exitAppendNewline: true },
    { pattern: /type\s+exit\s+to\s+exit/i, exitKey: 'exit', exitAppendNewline: true },
    { pattern: /type\s+'quit'\s+to\s+exit/i, exitKey: 'quit', exitAppendNewline: true },
    { pattern: /type\s+'exit'\s+to\s+exit/i, exitKey: 'exit', exitAppendNewline: true },
    // Enter quit/exit patterns
    { pattern: /enter\s+quit\s+to\s+exit/i, exitKey: 'quit', exitAppendNewline: true },
    { pattern: /enter\s+exit\s+to\s+exit/i, exitKey: 'exit', exitAppendNewline: true },
    // Chinese patterns
    { pattern: /按\s*q\s*退出/i, exitKey: 'q', exitAppendNewline: false },
    { pattern: /输入\s*quit\s*退出/i, exitKey: 'quit', exitAppendNewline: true },
    { pattern: /输入\s*exit\s*退出/i, exitKey: 'exit', exitAppendNewline: true }
  ]

  // Alternate screen control sequences
  private readonly ALTERNATE_SCREEN_ENTER = ['\x1b[?1049h', '\x1b[?47h', '\x1b[?1047h']
  private readonly ALTERNATE_SCREEN_EXIT = ['\x1b[?1049l', '\x1b[?47l', '\x1b[?1047l']

  constructor(command: string, commandId: string, config?: InteractionDetectorConfig, taskId?: string) {
    super()

    this.command = command
    this.commandId = commandId
    this.taskId = taskId
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.currentTimeout = this.config.initialTimeout

    // Enable debug logging in development or via CHATERM_DEBUG env
    this.debugEnabled = process.env.NODE_ENV !== 'production' || process.env.CHATERM_DEBUG === '1'

    // Classify command type on initialization (but don't trigger auto-cancel immediately)
    const isPagerCommand = this.isPagerCommand()
    this.tuiCategory = this.classifyTuiCommand()

    this.debug('init', {
      command: this.command,
      commandId: this.commandId,
      userLocale: this.config.userLocale,
      isPagerCommand,
      tuiCategory: this.tuiCategory
    })

    // Note: TUI auto-cancel is now triggered only after alternate screen entry + silence
    // This prevents false positives and allows proper pager detection
    if (this.tuiCategory === 'always' || this.tuiCategory === 'conditional') {
      this.startTuiHardTimeout()
    }
  }

  /**
   * Set the LLM caller function for intelligent detection
   */
  setLlmCaller(caller: (command: string, output: string, locale: string) => Promise<InteractionResult>): void {
    this.llmCaller = caller
  }

  /**
   * Process incoming output data
   */
  onOutput(data: string): void {
    this.lastOutputTime = Date.now()

    // Cross-chunk escape sequence detection
    const combined = this.escapeBuffer + data
    this.escapeBuffer = combined.slice(-this.ESCAPE_BUFFER_SIZE)

    // Normalize CR and strip ANSI once for all subsequent processing
    const normalizedData = this.normalizeCR(data)
    const cleanData = stripAnsi(normalizedData)

    // 1. Check for pager output features first (highest priority)
    if (this.checkPagerOutput(cleanData)) {
      const lastLine = cleanData.trim().split('\n').pop() || ''
      this.debug('pager-output-detected', { lastLine: this.preview(lastLine) })
      this.isPager = true
      this.cancelPagerObservation()
      if (!this.isPaused) {
        this.pause()
        this.emitInteractionNeeded({
          commandId: this.commandId,
          interactionType: 'pager',
          promptHint: this.getLocalizedMessage('pagerMode')
        })
      }
      return
    }

    // 2. Detect alternate screen entry/exit
    // IMPORTANT: Check exit FIRST because combined buffer may contain both sequences
    // e.g., when user sends enter then exit in quick succession
    let hasExitSeq = false
    let hasEnterSeq = false

    for (const seq of this.ALTERNATE_SCREEN_EXIT) {
      if (combined.includes(seq)) {
        hasExitSeq = true
        break
      }
    }

    for (const seq of this.ALTERNATE_SCREEN_ENTER) {
      if (combined.includes(seq)) {
        hasEnterSeq = true
        break
      }
    }

    // Handle exit - takes priority if both are present (exit is the final state)
    if (hasExitSeq) {
      this.inAlternateScreen = false
      this.isPager = false
      this.cancelPagerObservation()
      this.cancelTuiSilenceTimer()
      this.resume()
      this.debug('alternate-screen-exit', { commandId: this.commandId })
      return
    }

    // Handle enter
    if (hasEnterSeq) {
      this.inAlternateScreen = true
      this.lastOutputTimeForTui = Date.now()
      this.debug('alternate-screen-enter', { commandId: this.commandId, tuiCategory: this.tuiCategory })

      // Pager command entering alternate screen -> pager UI
      if (this.isPagerCommand()) {
        this.isPager = true
        this.cancelTuiSilenceTimer()
        this.pause()
        this.emitInteractionNeeded({
          commandId: this.commandId,
          interactionType: 'pager',
          promptHint: this.getLocalizedMessage('pagerMode')
        })
        return
      }

      // Start pager observation window for all commands
      this.startPagerObservation()

      // Handle TUI based on category
      if (this.tuiCategory === 'always' || this.tuiCategory === 'conditional') {
        // Blacklist TUI commands: start silence timer for conditional auto-cancel
        this.startTuiSilenceTimer()
        this.emit('alternate-screen-entered', { commandId: this.commandId, taskId: this.taskId, autoCancel: true })
      } else {
        // Non-blacklist commands: just notify, no auto-cancel
        this.emit('alternate-screen-entered', { commandId: this.commandId, taskId: this.taskId, autoCancel: false })
      }
      return
    }

    // Reset TUI silence timer on new output while in alternate screen
    if (this.inAlternateScreen && !this.isPager) {
      this.lastOutputTimeForTui = Date.now()
      // Restart silence timer
      if (this.tuiCategory === 'always' || this.tuiCategory === 'conditional') {
        this.startTuiSilenceTimer()
      }
    }

    // Continue detection during pager observation
    if (!this.pagerObservationMode && this.inAlternateScreen && !this.isPager) {
      return
    }

    // cleanData already computed above, reuse it
    if (this.isPaused) {
      this.appendToPausedBuffer(cleanData)
      return
    }

    // Reset backoff on new output
    this.currentTimeout = this.config.initialTimeout
    this.llmCallCount = 0
    this.networkFailCount = 0
    this.hashUnchangedCount = 0
    this.lastHashChangeTime = Date.now()

    // Cancel pending prompt debounce on new output to prevent false triggers
    this.clearPromptDebounce()

    // Process with line buffering (with length limit)
    this.processOutputForDetection(cleanData)

    // Quick rule matching (immediate response)
    const quickResult = this.tryQuickMatch(this.getFullOutput())
    if (quickResult) {
      this.debug('quick-match', {
        type: quickResult.interactionType,
        promptHint: this.preview(quickResult.promptHint)
      })
      this.pause()
      this.emitInteractionNeeded({
        commandId: this.commandId,
        ...quickResult
      })
      return
    }

    this.resetTimer()
  }

  /**
   * Pause detection (when UI is shown)
   */
  pause(): void {
    this.isPaused = true
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
  }

  /**
   * Resume detection (after user responds)
   */
  resume(): void {
    // Merge paused buffer back to detection buffer
    if (this.pausedOutputBuffer.length > 0) {
      const pausedData = this.pausedOutputBuffer.join('')

      this.lineBuffer += pausedData
      const lines = this.lineBuffer.split('\n')
      this.lineBuffer = lines.pop() || ''

      for (const line of lines) {
        const trimmedLine = line.trim()
        if (trimmedLine) {
          this.outputBuffer.push(trimmedLine)
          while (this.outputBuffer.length > this.config.maxLines) {
            this.outputBuffer.shift()
          }
        }
      }

      // Clear paused buffer
      this.pausedOutputBuffer = []
      this.pausedOutputSize = 0
    }

    this.isPaused = false
    this.resetTimer()
  }

  /**
   * Clear prompt buffers after user input submission to avoid re-triggering the same prompt.
   */
  onInteractionSubmitted(): void {
    this.clearPromptDebounce()
    this.outputBuffer = []
    this.lineBuffer = ''
    this.pausedOutputBuffer = []
    this.pausedOutputSize = 0
    this.escapeBuffer = ''
    this.lastOutputHash = ''
    this.hashUnchangedCount = 0
    this.lastHashChangeTime = Date.now()
  }

  /**
   * Handle dismiss action (close UI but continue detection)
   */
  onDismiss(): void {
    this.dismissCount++

    // Auto-suppress after 3 dismisses
    if (this.dismissCount >= 3) {
      this.doSuppress()
      this.emit('interaction-suppressed', { commandId: this.commandId })
      return
    }

    // Switch to long polling after 2 dismisses
    if (this.dismissCount >= 2) {
      this.currentTimeout = this.config.maxTimeout
    }

    // Resume detection
    this.resume()
  }

  /**
   * Suppress detection (user explicitly requests)
   */
  suppress(): void {
    this.doSuppress()
    this.emit('interaction-suppressed', { commandId: this.commandId })
  }

  /**
   * Unsuppress and resume detection
   */
  unsuppress(): void {
    this.isSuppressed = false
    this.dismissCount = 0
    this.currentTimeout = this.config.initialTimeout
    this.resume()
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    this.cancelPagerObservation()
    this.clearPromptDebounce()
    this.cancelTuiSilenceTimer()
    this.cancelTuiHardTimeout()
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    this.isSuppressed = false
    this.dismissCount = 0
    this.removeAllListeners()
  }

  /**
   * Get current detection state
   */
  getState(): {
    isPaused: boolean
    isSuppressed: boolean
    isPager: boolean
    inAlternateScreen: boolean
  } {
    return {
      isPaused: this.isPaused,
      isSuppressed: this.isSuppressed,
      isPager: this.isPager,
      inAlternateScreen: this.inAlternateScreen
    }
  }

  // ============================================================================
  // Private methods
  // ============================================================================

  private isPagerCommand(): boolean {
    return this.PAGER_COMMANDS.some((p) => p.test(this.command.trim()))
  }

  /**
   * Classify command into TUI category for conditional auto-cancel
   */
  private classifyTuiCommand(): TuiCategory {
    const cmd = this.command.trim()

    // Pager commands are not TUI
    if (this.isPagerCommand()) return null

    // Check Always-TUI commands
    if (this.ALWAYS_TUI_COMMANDS.some((p) => p.test(cmd))) {
      return 'always'
    }

    // Check Conditional-TUI commands with non-interactive argument detection
    for (const entry of this.CONDITIONAL_TUI_COMMANDS) {
      if (entry.pattern.test(cmd)) {
        // Check if non-interactive arguments are present
        if (entry.nonInteractiveArgs.some((arg) => arg.test(cmd))) {
          return null // Has non-interactive args, treat as normal command
        }
        return 'conditional'
      }
    }

    return 'non-blacklist'
  }

  private checkPagerOutput(output: string): boolean {
    const lastLine = output.trim().split('\n').pop() || ''

    // Strong pattern matching
    if (this.PAGER_OUTPUT_PATTERNS.some((p) => p.test(lastLine))) {
      return true
    }

    // Weak patterns only during observation or for pager commands
    if (this.pagerObservationMode || this.isPagerCommand()) {
      if (this.PAGER_WEAK_PATTERNS.some((p) => p.test(lastLine))) {
        return true
      }
    }

    return false
  }

  /**
   * Detect exit key from output using rule-based matching
   * Returns exitKey and exitAppendNewline if found, otherwise undefined
   */
  private detectExitKeyFromOutput(output: string): { exitKey: string; exitAppendNewline: boolean } | undefined {
    // Search through all output lines for exit key patterns
    const lines = output.split('\n')
    for (const line of lines) {
      for (const rule of this.EXIT_KEY_PATTERNS) {
        if (rule.pattern.test(line)) {
          this.debug('exit-key-detected', { exitKey: rule.exitKey, line: this.preview(line) })
          return { exitKey: rule.exitKey, exitAppendNewline: rule.exitAppendNewline }
        }
      }
    }
    return undefined
  }

  /**
   * Resolve exit key with priority: rule > LLM > undefined
   * @param interactionType - The interaction type
   * @param output - The command output
   * @param llmExitKey - Exit key from LLM (if any)
   * @param llmExitAppendNewline - Exit append newline from LLM (if any)
   */
  private resolveExitKey(
    interactionType: string,
    output: string,
    llmExitKey?: string,
    llmExitAppendNewline?: boolean
  ): { exitKey?: string; exitAppendNewline?: boolean } {
    // 1. Rule-based detection (highest priority)
    // Pager type: always 'q' without newline
    if (interactionType === 'pager') {
      return { exitKey: 'q', exitAppendNewline: false }
    }

    // Check output for explicit exit key hints
    const ruleResult = this.detectExitKeyFromOutput(output)
    if (ruleResult) {
      return ruleResult
    }

    // 2. LLM fallback
    if (llmExitKey) {
      return { exitKey: llmExitKey, exitAppendNewline: llmExitAppendNewline ?? true }
    }

    // 3. No exit key detected (UI will default to Ctrl+C)
    return {}
  }

  private startPagerObservation(): void {
    this.pagerObservationMode = true

    this.pagerObservationTimer = setTimeout(() => {
      if (this.pagerObservationMode && this.inAlternateScreen && !this.isPager) {
        this.pagerObservationMode = false
        this.pause()
        const autoCancel = this.tuiCategory === 'always' || this.tuiCategory === 'conditional'
        this.emit('alternate-screen-entered', { commandId: this.commandId, taskId: this.taskId, autoCancel })
      }
    }, this.config.pagerObservationTimeout)
  }

  private cancelPagerObservation(): void {
    this.pagerObservationMode = false
    if (this.pagerObservationTimer) {
      clearTimeout(this.pagerObservationTimer)
      this.pagerObservationTimer = null
    }
  }

  /**
   * Start TUI silence timer - triggers auto-cancel after silence period
   */
  private startTuiSilenceTimer(): void {
    this.cancelTuiSilenceTimer()
    this.tuiSilenceTimer = setTimeout(() => {
      this.tuiSilenceTimer = null
      if (this.inAlternateScreen && !this.isPager) {
        // Check if there was output since we started the timer
        const silenceDuration = Date.now() - this.lastOutputTimeForTui
        if (silenceDuration >= this.config.tuiCancelSilenceMs) {
          this.debug('tui-silence-expired', { commandId: this.commandId })
          this.isSuppressed = true
          this.cancelTuiHardTimeout()
          this.emit('tui-detected', {
            commandId: this.commandId,
            taskId: this.taskId,
            message: this.getLocalizedMessage('tuiDetected')
          })
        } else {
          // Output arrived during timer, restart
          this.startTuiSilenceTimer()
        }
      }
    }, this.config.tuiCancelSilenceMs)
  }

  /**
   * Cancel TUI silence timer
   */
  private cancelTuiSilenceTimer(): void {
    if (this.tuiSilenceTimer) {
      clearTimeout(this.tuiSilenceTimer)
      this.tuiSilenceTimer = null
    }
  }

  /**
   * Start hard timeout for blacklisted TUI commands
   */
  private startTuiHardTimeout(): void {
    if (!this.config.tuiHardTimeoutMs || this.config.tuiHardTimeoutMs <= 0) {
      return
    }
    this.cancelTuiHardTimeout()
    this.tuiHardTimeoutTimer = setTimeout(() => {
      this.tuiHardTimeoutTimer = null
      if (this.isSuppressed) return
      this.debug('tui-hard-timeout', { commandId: this.commandId })
      this.isSuppressed = true
      this.cancelTuiSilenceTimer()
      this.emit('tui-detected', {
        commandId: this.commandId,
        taskId: this.taskId,
        message: this.getLocalizedMessage('tuiDetected')
      })
    }, this.config.tuiHardTimeoutMs)
  }

  /**
   * Cancel hard timeout timer
   */
  private cancelTuiHardTimeout(): void {
    if (this.tuiHardTimeoutTimer) {
      clearTimeout(this.tuiHardTimeoutTimer)
      this.tuiHardTimeoutTimer = null
    }
  }

  private normalizeCR(data: string): string {
    // Step 1: Normalize \r\n -> \n
    let normalized = data.replace(/\r\n/g, '\n')

    // Step 2: Handle standalone \r (line overwrite)
    const lines = normalized.split('\n')
    const processedLines = lines.map((line) => {
      if (!line.includes('\r')) return line
      const segments = line.split('\r')
      return segments[segments.length - 1]
    })

    return processedLines.join('\n')
  }

  private processOutputForDetection(data: string): void {
    this.lineBuffer += data

    // Line buffer length limit
    if (this.lineBuffer.length > this.config.lineBufferMaxLength) {
      const cutPoint = this.lineBuffer.length - this.config.lineBufferMaxLength
      const nearestNewline = this.lineBuffer.indexOf('\n', cutPoint)
      if (nearestNewline !== -1 && nearestNewline < cutPoint + 100) {
        this.lineBuffer = this.lineBuffer.slice(nearestNewline + 1)
      } else {
        this.lineBuffer = this.lineBuffer.slice(-this.config.lineBufferMaxLength)
      }
    }

    const lines = this.lineBuffer.split('\n')
    this.lineBuffer = lines.pop() || ''

    for (const line of lines) {
      const trimmedLine = line.trim()
      if (trimmedLine) {
        this.outputBuffer.push(trimmedLine)
        while (this.outputBuffer.length > this.config.maxLines) {
          this.outputBuffer.shift()
        }
      }
    }
  }

  private tryQuickMatch(output: string): InteractionResult | null {
    const lastCompleteLine = output.trim().split('\n').pop() || ''
    const candidates = [lastCompleteLine]

    // Include line buffer for prompts without newline
    if (this.lineBuffer.trim()) {
      candidates.push(this.lineBuffer.trim())
    }

    for (const candidate of candidates) {
      // 1. Check quick patterns (immediate, no debounce)
      for (const rule of this.QUICK_PATTERNS) {
        if (rule.pattern.test(candidate)) {
          // Clear any pending debounce
          this.clearPromptDebounce()
          return {
            needsInteraction: true,
            interactionType: rule.type,
            promptHint: candidate.slice(0, 100),
            confirmValues: rule.confirmValues
          }
        }
      }

      // 1.5 Common confirmation prompts ending with '?'
      if (this.isLikelyConfirmPrompt(candidate)) {
        this.clearPromptDebounce()
        return {
          needsInteraction: true,
          interactionType: 'confirm',
          promptHint: candidate.slice(0, 100),
          confirmValues: { yes: 'y', no: 'n' }
        }
      }

      // 2. Colon/question mark rules with whitelist (apply debounce)
      if (this.shouldTriggerPromptRule(candidate)) {
        const result: InteractionResult = /password|passwd|passphrase|密码|口令/i.test(candidate)
          ? {
              needsInteraction: true,
              interactionType: 'password',
              promptHint: candidate
            }
          : {
              needsInteraction: true,
              interactionType: 'freeform',
              promptHint: candidate
            }

        // Start debounce timer
        this.schedulePromptDebounce(result)
        return null // Don't return immediately, wait for debounce
      }
    }

    return null
  }

  /**
   * Schedule a debounced prompt trigger
   */
  private schedulePromptDebounce(result: InteractionResult): void {
    // Clear existing debounce timer
    this.clearPromptDebounce()

    this.pendingPromptResult = result
    this.debug('prompt-debounce-scheduled', {
      type: result.interactionType,
      promptHint: this.preview(result.promptHint)
    })
    this.promptDebounceTimer = setTimeout(() => {
      if (this.pendingPromptResult && !this.isPaused && !this.isSuppressed) {
        this.pause()
        this.emitInteractionNeeded({
          commandId: this.commandId,
          ...this.pendingPromptResult
        })
      }
      this.pendingPromptResult = null
      this.promptDebounceTimer = null
    }, this.PROMPT_DEBOUNCE_MS)
  }

  /**
   * Clear pending prompt debounce
   */
  private clearPromptDebounce(): void {
    if (this.promptDebounceTimer) {
      clearTimeout(this.promptDebounceTimer)
      this.promptDebounceTimer = null
    }
    this.pendingPromptResult = null
  }

  private shouldTriggerPromptRule(text: string): boolean {
    if (!this.PROMPT_SUFFIX_PATTERN.test(text) || text.length > 150) {
      return false
    }

    // Check exclusions
    for (const exclusion of this.PROMPT_EXCLUSIONS) {
      if (exclusion.test(text)) {
        return false
      }
    }

    // Check whitelist keywords
    for (const keyword of this.PROMPT_KEYWORDS) {
      if (keyword.test(text)) {
        return true
      }
    }

    return false
  }

  private isLikelyConfirmPrompt(text: string): boolean {
    if (!text.trim().endsWith('?')) {
      return false
    }
    for (const keyword of this.CONFIRM_KEYWORDS) {
      if (keyword.test(text)) {
        return true
      }
    }
    return false
  }

  private resetTimer(): void {
    if (this.timer) {
      clearTimeout(this.timer)
    }
    this.timer = setTimeout(() => this.onTimeout(), this.currentTimeout)
  }

  private async onTimeout(): Promise<void> {
    if (this.isPaused || this.isDetecting || this.isSuppressed) return

    // Hash deduplication with silent timeout fallback
    const currentOutput = this.getFullOutput()
    const currentHash = this.hashOutput(currentOutput)
    this.debug('timeout', {
      outputLength: currentOutput.length,
      hash: currentHash,
      lastHash: this.lastOutputHash,
      unchangedCount: this.hashUnchangedCount,
      currentTimeout: this.currentTimeout,
      hasLlmCaller: Boolean(this.llmCaller)
    })

    if (currentHash === this.lastOutputHash) {
      this.hashUnchangedCount++

      const silentDuration = Date.now() - this.lastHashChangeTime
      this.debug('hash-unchanged', { silentDuration, unchangedCount: this.hashUnchangedCount })

      if (silentDuration >= this.config.maxSilentTimeout || this.hashUnchangedCount >= this.config.maxHashUnchangedCount) {
        // Force popup manual input after long silence
        this.debug('long-silence-popup', { silentDuration, unchangedCount: this.hashUnchangedCount })
        this.pause()
        this.emitInteractionNeeded({
          commandId: this.commandId,
          interactionType: 'freeform',
          promptHint: this.getLocalizedMessage('longSilence')
        })
        return
      }

      // Apply backoff
      this.applyBackoff()
      this.resetTimer()
      return
    }

    // Hash changed, reset counters
    this.lastOutputHash = currentHash
    this.hashUnchangedCount = 0
    this.lastHashChangeTime = Date.now()

    const startTime = this.lastOutputTime
    this.isDetecting = true

    try {
      const result = await this.detectInteraction()

      // Check if new output arrived during detection
      if (this.lastOutputTime !== startTime) {
        this.resetTimer()
        return
      }

      if (result.needsInteraction) {
        this.debug('llm-detected', {
          type: result.interactionType,
          promptHint: this.preview(result.promptHint)
        })
        this.pause()
        this.emitInteractionNeeded({
          commandId: this.commandId,
          ...result
        })
      } else {
        this.applyBackoff()
        this.resetTimer()
      }
    } catch (error) {
      this.handleDetectionError(error)
    } finally {
      this.isDetecting = false
    }
  }

  private hashOutput(output: string): string {
    const tail = output.slice(-500)
    let hash = 0
    for (let i = 0; i < tail.length; i++) {
      hash = ((hash << 5) - hash + tail.charCodeAt(i)) | 0
    }
    return hash.toString(16)
  }

  private applyBackoff(): void {
    this.llmCallCount++
    if (this.llmCallCount >= this.config.maxLlmCalls) {
      this.currentTimeout = this.config.maxTimeout
    } else {
      this.currentTimeout = Math.min(this.currentTimeout * 2, this.config.maxTimeout)
    }
  }

  private handleDetectionError(error: unknown): void {
    const isNetworkError =
      error instanceof Error && (error.message.includes('network') || error.message.includes('timeout') || error.message.includes('ECONNREFUSED'))

    if (isNetworkError) {
      this.networkFailCount++
      if (this.networkFailCount >= this.config.maxNetworkFails) {
        this.pause()
        this.emitInteractionNeeded({
          commandId: this.commandId,
          interactionType: 'freeform',
          promptHint: this.getLocalizedMessage('serviceUnavailable')
        })
      } else {
        this.applyBackoff()
        this.resetTimer()
      }
    } else {
      // Parse error - degrade to freeform
      this.pause()
      this.emitInteractionNeeded({
        commandId: this.commandId,
        interactionType: 'freeform',
        promptHint: this.getLocalizedMessage('mayNeedInput')
      })
    }
  }

  private async detectInteraction(): Promise<InteractionResult> {
    if (this.isSuppressed) {
      return { needsInteraction: false, interactionType: 'freeform', promptHint: '' }
    }

    // Check if LLM call limit reached - stop calling LLM
    if (this.llmCallCount >= this.config.maxLlmCalls) {
      logger.info(`[InteractionDetector] LLM call limit reached (${this.llmCallCount}/${this.config.maxLlmCalls}), degrading to freeform`)
      return {
        needsInteraction: true,
        interactionType: 'freeform',
        promptHint: this.getLocalizedMessage('mayNeedInput')
      }
    }

    let output = this.outputBuffer.join('\n')
    if (this.lineBuffer.trim()) {
      const truncatedLineBuffer = this.lineBuffer.length > 500 ? this.lineBuffer.slice(-500) : this.lineBuffer
      output += '\n' + truncatedLineBuffer.trim()
    }

    // Total context length limit
    if (output.length > this.config.maxLlmContextLength) {
      output = output.slice(-this.config.maxLlmContextLength)
    }

    if (this.debugEnabled) {
      const lastLine = output.trim().split('\n').pop() || ''
      this.debug('llm-input-preview', {
        outputLength: output.length,
        lastLine: this.preview(lastLine),
        tail: this.preview(output.slice(-400), 400)
      })
    }

    // Call LLM if available
    if (this.llmCaller) {
      try {
        this.debug('llm-call', { outputLength: output.length, llmCallCount: this.llmCallCount })
        const rawResult = await this.llmCaller(this.command, output, this.config.userLocale)
        this.debug('llm-result', { result: rawResult })
        return this.validateResult(rawResult)
      } catch (error) {
        logger.warn('[InteractionDetector] LLM call failed', { error: error instanceof Error ? error.message : String(error) })
        throw error
      }
    }

    // No LLM caller - return no interaction needed
    if (!this.warnedMissingLlm) {
      logger.warn('[InteractionDetector] llmCaller not configured; LLM detection disabled')
      this.warnedMissingLlm = true
    }
    this.debug('llm-missing', { message: 'no llmCaller configured' })
    return { needsInteraction: false, interactionType: 'freeform', promptHint: '' }
  }

  private validateResult(raw: unknown): InteractionResult {
    try {
      const normalized = this.normalizeRawResult(raw)
      const parsed = InteractionResultSchema.safeParse(normalized)
      if (!parsed.success) {
        this.debug('llm-parse-failed', {
          issues: parsed.error.issues,
          raw: normalized
        })
        return {
          needsInteraction: true,
          interactionType: 'freeform',
          promptHint: this.getLocalizedMessage('parseError')
        }
      }
      const result = parsed.data

      // Ensure confirmValues matches interactionType
      if (result.interactionType !== 'confirm') {
        delete result.confirmValues
      }

      return result
    } catch {
      return {
        needsInteraction: true,
        interactionType: 'freeform',
        promptHint: this.getLocalizedMessage('parseError')
      }
    }
  }

  private normalizeRawResult(raw: unknown): unknown {
    if (!raw || typeof raw !== 'object') {
      return raw
    }

    const result: Record<string, any> = { ...(raw as Record<string, any>) }

    if (result.interactionType == null) {
      result.interactionType = 'freeform'
    }

    if (result.promptHint == null) {
      result.promptHint = ''
    }

    if (result.options == null) {
      delete result.options
    }
    if (result.optionValues == null) {
      delete result.optionValues
    }
    if (result.confirmValues == null) {
      delete result.confirmValues
    } else if (typeof result.confirmValues === 'object') {
      const confirmValues: Record<string, any> = { ...result.confirmValues }
      if (confirmValues.default == null) {
        delete confirmValues.default
      }
      if (typeof confirmValues.yes !== 'string' || typeof confirmValues.no !== 'string') {
        delete result.confirmValues
      } else {
        result.confirmValues = confirmValues
      }
    }

    // Handle exitKey and exitAppendNewline
    if (result.exitKey == null || typeof result.exitKey !== 'string') {
      delete result.exitKey
    }
    if (result.exitAppendNewline == null || typeof result.exitAppendNewline !== 'boolean') {
      delete result.exitAppendNewline
    }

    return result
  }

  private doSuppress(): void {
    this.isSuppressed = true
  }

  private getFullOutput(): string {
    let output = this.outputBuffer.join('\n')
    if (this.lineBuffer.trim()) {
      output += '\n' + this.lineBuffer.trim()
    }
    return output
  }

  private appendToPausedBuffer(data: string): void {
    const dataSize = Buffer.byteLength(data, 'utf8')
    const maxPausedBytes = 10240
    const maxPausedLines = 100

    // Single data too large - truncate
    if (dataSize > maxPausedBytes) {
      this.pausedOutputBuffer = [data.slice(-maxPausedBytes)]
      this.pausedOutputSize = maxPausedBytes
      return
    }

    this.pausedOutputBuffer.push(data)
    this.pausedOutputSize += dataSize

    // FIFO overflow handling
    while (this.pausedOutputSize > maxPausedBytes && this.pausedOutputBuffer.length > 1) {
      const removed = this.pausedOutputBuffer.shift()!
      this.pausedOutputSize -= Buffer.byteLength(removed, 'utf8')
    }

    while (this.pausedOutputBuffer.length > maxPausedLines) {
      const removed = this.pausedOutputBuffer.shift()!
      this.pausedOutputSize -= Buffer.byteLength(removed, 'utf8')
    }
  }

  private emitInteractionNeeded(request: InteractionRequest): void {
    // Resolve exit key with priority: rule > LLM > undefined
    const output = this.getFullOutput()
    const exitKeyInfo = this.resolveExitKey(request.interactionType, output, request.exitKey, request.exitAppendNewline)

    // Merge exit key info into request
    const enrichedRequest: InteractionRequest = {
      ...request,
      taskId: this.taskId ?? request.taskId,
      ...exitKeyInfo
    }

    this.emit('interaction-needed', enrichedRequest)
  }

  private debug(message: string, data?: Record<string, unknown>): void {
    if (!this.debugEnabled) return
    if (!data) {
      logger.info(`[InteractionDetector] ${message}`)
      return
    }
    logger.info(`[InteractionDetector] ${message} ${this.safeStringify(data)}`)
  }

  private safeStringify(data: Record<string, unknown>): string {
    try {
      return JSON.stringify(data, (_key, value) => {
        if (typeof value === 'string' && value.length > 300) {
          return value.slice(0, 300) + '...'
        }
        return value
      })
    } catch {
      return '[unserializable]'
    }
  }

  private preview(text: string, max = 200): string {
    const compact = text.replace(/\s+/g, ' ').trim()
    if (!compact) return ''
    return compact.length > max ? compact.slice(0, max) + '...' : compact
  }

  private getLocalizedMessage(key: string): string {
    const isZh = this.config.userLocale.startsWith('zh')

    const messages: Record<string, { zh: string; en: string }> = {
      tuiDetected: {
        zh: '检测到全屏程序，已自动发送 Ctrl+C 终止。如需继续请重新执行命令',
        en: 'Full-screen program detected; Ctrl+C was sent to stop it. Re-run the command if needed.'
      },
      pagerMode: {
        zh: '翻页浏览中',
        en: 'Paging mode'
      },
      longSilence: {
        zh: '命令长时间无响应，如需输入请在此操作',
        en: 'Command silent for too long, enter input here if needed'
      },
      serviceUnavailable: {
        zh: '检测服务不可用，如需输入请手动操作',
        en: 'Detection service unavailable, enter input manually if needed'
      },
      mayNeedInput: {
        zh: '命令可能在等待输入',
        en: 'Command may be waiting for input'
      },
      parseError: {
        zh: '无法解析响应，请手动判断',
        en: 'Unable to parse response, please judge manually'
      },
      tuiNoticeNoAutoCancel: {
        zh: '检测到全屏程序，请在终端中直接交互',
        en: 'Full-screen program detected, please interact directly in terminal'
      }
    }

    const msg = messages[key]
    if (!msg) return key
    return isZh ? msg.zh : msg.en
  }
}
