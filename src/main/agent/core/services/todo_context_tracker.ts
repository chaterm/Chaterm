const logger = createLogger('agent')

// Context tracking thresholds
const CONTEXT_THRESHOLDS = {
  WARNING: 50,
  CRITICAL: 70,
  MAXIMUM: 90
} as const

export type ContextThresholdLevel = 'normal' | 'warning' | 'critical' | 'maximum'

export interface ContextUsageSnapshot {
  timestamp: Date
  usagePercent: number
  todoId: string | null
  tokenCount?: number
  maxTokens?: number
}

export class TodoContextTracker {
  private static instances = new Map<string, TodoContextTracker>()
  private activeTodoId: string | null = null
  private readonly sessionId: string

  // Focus Chain enhancements
  private contextUsagePercent: number = 0
  private contextSnapshots: ContextUsageSnapshot[] = []
  private maxContextTokens: number = 128000 // Default, can be updated based on model
  private currentTokenCount: number = 0
  private lastContextUpdate: Date = new Date()
  private contextWarningCallbacks: ((level: ContextThresholdLevel, percent: number) => void)[] = []

  private constructor(sessionId: string) {
    this.sessionId = sessionId
  }

  static forSession(sessionId: string): TodoContextTracker {
    if (!this.instances.has(sessionId)) {
      this.instances.set(sessionId, new TodoContextTracker(sessionId))
    }
    return this.instances.get(sessionId)!
  }

  setActiveTodo(todoId: string | null): void {
    const previousTodoId = this.activeTodoId

    // Record context snapshot when switching todos
    if (todoId !== previousTodoId) {
      // We want to attribute the snapshot to the previous todo,
      // since it represents the context state *before* the switch.
      this.recordContextSnapshot(previousTodoId)
    }

    this.activeTodoId = todoId
  }

  getActiveTodoId(): string | null {
    return this.activeTodoId
  }

  clearActiveTodo(): void {
    this.activeTodoId = null
  }

  hasActiveTodo(): boolean {
    return this.activeTodoId !== null
  }

  // Focus Chain: Update context usage
  updateContextUsage(tokenCount: number, maxTokens?: number): ContextThresholdLevel {
    if (maxTokens) {
      this.maxContextTokens = maxTokens
    }

    this.currentTokenCount = tokenCount
    this.contextUsagePercent = Math.min(100, Math.round((tokenCount / this.maxContextTokens) * 100))
    this.lastContextUpdate = new Date()

    const level = this.getContextLevel()

    // Notify callbacks if threshold crossed
    if (level !== 'normal') {
      this.notifyContextWarning(level)
    }

    return level
  }

  // Get current context usage percentage
  getContextUsagePercent(): number {
    return this.contextUsagePercent
  }

  // Get current context level
  getContextLevel(): ContextThresholdLevel {
    if (this.contextUsagePercent >= CONTEXT_THRESHOLDS.MAXIMUM) {
      return 'maximum'
    }
    if (this.contextUsagePercent >= CONTEXT_THRESHOLDS.CRITICAL) {
      return 'critical'
    }
    if (this.contextUsagePercent >= CONTEXT_THRESHOLDS.WARNING) {
      return 'warning'
    }
    return 'normal'
  }

  // Get context info for display
  getContextInfo(): {
    usagePercent: number
    level: ContextThresholdLevel
    tokenCount: number
    maxTokens: number
    lastUpdate: Date
  } {
    return {
      usagePercent: this.contextUsagePercent,
      level: this.getContextLevel(),
      tokenCount: this.currentTokenCount,
      maxTokens: this.maxContextTokens,
      lastUpdate: this.lastContextUpdate
    }
  }

  // Record a context snapshot
  private recordContextSnapshot(todoId: string | null = this.activeTodoId): void {
    const snapshot: ContextUsageSnapshot = {
      timestamp: new Date(),
      usagePercent: this.contextUsagePercent,
      todoId,
      tokenCount: this.currentTokenCount,
      maxTokens: this.maxContextTokens
    }

    this.contextSnapshots.push(snapshot)

    // Keep only last 50 snapshots
    if (this.contextSnapshots.length > 50) {
      this.contextSnapshots = this.contextSnapshots.slice(-50)
    }
  }

  // Get context history for current session
  getContextHistory(): ContextUsageSnapshot[] {
    return [...this.contextSnapshots]
  }

  // Register callback for context warnings
  onContextWarning(callback: (level: ContextThresholdLevel, percent: number) => void): () => void {
    this.contextWarningCallbacks.push(callback)
    return () => {
      const index = this.contextWarningCallbacks.indexOf(callback)
      if (index > -1) {
        this.contextWarningCallbacks.splice(index, 1)
      }
    }
  }

  private notifyContextWarning(level: ContextThresholdLevel): void {
    this.contextWarningCallbacks.forEach((callback) => {
      try {
        callback(level, this.contextUsagePercent)
      } catch (error) {
        logger.error('[TodoContextTracker] Context warning callback error', { error: error instanceof Error ? error.message : String(error) })
      }
    })
  }

  // Check if context usage suggests creating a new task
  shouldSuggestNewTask(): { suggest: boolean; reason?: string } {
    if (this.contextUsagePercent >= CONTEXT_THRESHOLDS.CRITICAL) {
      return {
        suggest: true,
        reason: `Context usage at ${this.contextUsagePercent}% (${this.currentTokenCount}/${this.maxContextTokens} tokens). Consider creating a new task to preserve context.`
      }
    }
    return { suggest: false }
  }

  // Get context usage at specific todo
  getContextUsageAtTodo(todoId: string): number | null {
    const snapshot = this.contextSnapshots.find((s) => s.todoId === todoId)
    return snapshot?.usagePercent ?? null
  }

  // Set max context tokens (based on model)
  setMaxContextTokens(maxTokens: number): void {
    this.maxContextTokens = maxTokens
  }

  // Clear session instance (optional, for memory management)
  static clearSession(sessionId: string): void {
    this.instances.delete(sessionId)
  }

  // Get session ID
  getSessionId(): string {
    return this.sessionId
  }
}
