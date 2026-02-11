import { Todo, FocusChainState, FocusChainTransition, FocusChainHandoff } from '../../shared/todo/TodoSchemas'
import { TodoStorage } from '../storage/todo/TodoStorage'
import { TodoContextTracker } from './todo_context_tracker'

import { createLogger } from '@logging'

const logger = createLogger('agent')

// Context usage thresholds that trigger notifications
const CONTEXT_THRESHOLDS = {
  WARNING: 50, // 50% - show warning
  CRITICAL: 70, // 70% - suggest task transition
  MAXIMUM: 90 // 90% - force task transition
} as const

export class FocusChainService {
  private static instances = new Map<string, FocusChainService>()
  private state: FocusChainState
  private transitions: FocusChainTransition[] = []
  private readonly taskId: string

  private constructor(taskId: string) {
    this.taskId = taskId
    this.state = this.createInitialState(taskId)
  }

  static forTask(taskId: string): FocusChainService {
    if (!this.instances.has(taskId)) {
      this.instances.set(taskId, new FocusChainService(taskId))
    }
    return this.instances.get(taskId)!
  }

  static clearTask(taskId: string): void {
    this.instances.delete(taskId)
  }

  private createInitialState(taskId: string): FocusChainState {
    return {
      taskId,
      focusedTodoId: null,
      chainProgress: 0,
      totalTodos: 0,
      completedTodos: 0,
      currentContextUsage: 0,
      lastFocusChangeAt: new Date(),
      autoTransitionEnabled: true
    }
  }

  /**
   * Get current focus chain state
   */
  getState(): FocusChainState {
    return { ...this.state }
  }

  /**
   * Get transition history
   */
  getTransitions(): FocusChainTransition[] {
    return [...this.transitions]
  }

  /**
   * Update context usage percentage
   */
  updateContextUsage(usagePercent: number): {
    shouldTransition: boolean
    reason?: string
    threshold?: keyof typeof CONTEXT_THRESHOLDS
  } {
    this.state.currentContextUsage = Math.min(100, Math.max(0, usagePercent))

    if (usagePercent >= CONTEXT_THRESHOLDS.MAXIMUM) {
      return {
        shouldTransition: true,
        reason: `Context usage at ${usagePercent}% exceeds maximum threshold. Consider creating a new task to continue.`,
        threshold: 'MAXIMUM'
      }
    }

    if (usagePercent >= CONTEXT_THRESHOLDS.CRITICAL) {
      return {
        shouldTransition: false,
        reason: `Context usage at ${usagePercent}% is critical. Plan to wrap up current work soon.`,
        threshold: 'CRITICAL'
      }
    }

    if (usagePercent >= CONTEXT_THRESHOLDS.WARNING) {
      return {
        shouldTransition: false,
        reason: `Context usage at ${usagePercent}%. Monitor usage as you continue.`,
        threshold: 'WARNING'
      }
    }

    return { shouldTransition: false }
  }

  /**
   * Focus on a specific todo
   */
  async focusTodo(todoId: string, reason: FocusChainTransition['reason'] = 'user_request'): Promise<void> {
    const storage = new TodoStorage(this.taskId)
    const todos = await storage.readTodos()
    const todo = todos.find((t) => t.id === todoId)

    if (!todo) {
      logger.warn(`[FocusChainService] Todo ${todoId} not found`)
      return
    }

    // Record transition
    const transition: FocusChainTransition = {
      fromTodoId: this.state.focusedTodoId,
      toTodoId: todoId,
      reason,
      timestamp: new Date(),
      contextUsageAtTransition: this.state.currentContextUsage
    }
    this.transitions.push(transition)

    // Update state
    const previousFocusedId = this.state.focusedTodoId
    this.state.focusedTodoId = todoId
    this.state.lastFocusChangeAt = new Date()

    // Update todos with focus state
    const now = new Date()
    const updatedTodos = todos.map((t) => ({
      ...t,
      isFocused: t.id === todoId,
      focusedAt: t.id === todoId ? now : t.focusedAt,
      // Clear focus from previous todo
      ...(t.id === previousFocusedId && t.id !== todoId ? { isFocused: false } : {})
    }))

    await storage.writeTodos(updatedTodos)

    // Update context tracker
    const contextTracker = TodoContextTracker.forSession(this.taskId)
    contextTracker.setActiveTodo(todoId)

    logger.info(`[FocusChainService] Focused on todo: ${todo.content}`)
  }

  /**
   * Mark current focused todo as completed and auto-advance to next
   */
  async completeFocusedTodo(): Promise<{
    completed: Todo | null
    nextFocused: Todo | null
    allCompleted: boolean
  }> {
    if (!this.state.focusedTodoId) {
      return { completed: null, nextFocused: null, allCompleted: false }
    }

    const storage = new TodoStorage(this.taskId)
    const todos = await storage.readTodos()
    const contextTracker = TodoContextTracker.forSession(this.taskId)

    const completedTodo = todos.find((t) => t.id === this.state.focusedTodoId)
    if (!completedTodo) {
      return { completed: null, nextFocused: null, allCompleted: false }
    }

    // Mark as completed
    const now = new Date()
    completedTodo.status = 'completed'
    completedTodo.completedAt = now
    completedTodo.updatedAt = now
    completedTodo.isFocused = false

    // Find next pending todo
    const nextTodo = todos.find((t) => t.id !== completedTodo.id && t.status === 'pending')

    if (nextTodo && this.state.autoTransitionEnabled) {
      nextTodo.status = 'in_progress'
      nextTodo.isFocused = true
      nextTodo.focusedAt = now
      nextTodo.updatedAt = now

      // Record transition
      this.transitions.push({
        fromTodoId: completedTodo.id,
        toTodoId: nextTodo.id,
        reason: 'task_completed',
        timestamp: now,
        contextUsageAtTransition: this.state.currentContextUsage
      })

      this.state.focusedTodoId = nextTodo.id
      contextTracker.setActiveTodo(nextTodo.id)
    } else {
      this.state.focusedTodoId = null
      contextTracker.setActiveTodo(null)
    }

    // Update progress
    const completed = todos.filter((t) => t.status === 'completed').length
    this.state.completedTodos = completed
    this.state.totalTodos = todos.length
    this.state.chainProgress = todos.length > 0 ? Math.round((completed / todos.length) * 100) : 0
    this.state.lastFocusChangeAt = now

    await storage.writeTodos(todos)

    return {
      completed: completedTodo,
      nextFocused: nextTodo || null,
      allCompleted: !nextTodo
    }
  }

  /**
   * Sync state with current todos
   */
  async syncWithTodos(): Promise<void> {
    const storage = new TodoStorage(this.taskId)
    const todos = await storage.readTodos()

    const completed = todos.filter((t) => t.status === 'completed').length
    const inProgress = todos.find((t) => t.status === 'in_progress')
    const focused = todos.find((t) => t.isFocused)

    this.state.totalTodos = todos.length
    this.state.completedTodos = completed
    this.state.chainProgress = todos.length > 0 ? Math.round((completed / todos.length) * 100) : 0
    this.state.focusedTodoId = focused?.id || inProgress?.id || null
  }

  /**
   * Generate handoff context for creating a new task
   */
  async generateHandoff(): Promise<FocusChainHandoff> {
    const storage = new TodoStorage(this.taskId)
    const todos = await storage.readTodos()

    const completed = todos.filter((t) => t.status === 'completed')
    const inProgress = todos.find((t) => t.status === 'in_progress')
    const pending = todos.filter((t) => t.status === 'pending')

    const completedWork =
      completed.length > 0 ? `Completed ${completed.length} tasks:\n${completed.map((t) => `- ${t.content}`).join('\n')}` : 'No tasks completed yet.'

    const currentState = inProgress
      ? `Currently working on: ${inProgress.content}${inProgress.description ? `\nDetails: ${inProgress.description}` : ''}`
      : 'No task currently in progress.'

    const nextSteps =
      pending.length > 0 ? `${pending.length} tasks remaining:\n${pending.map((t) => `- ${t.content}`).join('\n')}` : 'All tasks completed.'

    return {
      completedWork,
      currentState,
      nextSteps,
      contextSnapshot: {
        progress: this.state.chainProgress,
        contextUsage: this.state.currentContextUsage,
        totalTodos: this.state.totalTodos,
        completedTodos: this.state.completedTodos
      }
    }
  }

  /**
   * Get progress summary for display
   */
  getProgressSummary(): {
    total: number
    completed: number
    inProgress: number
    pending: number
    progressPercent: number
    focusedTodoId: string | null
    contextUsage: number
  } {
    return {
      total: this.state.totalTodos,
      completed: this.state.completedTodos,
      inProgress: this.state.focusedTodoId ? 1 : 0,
      pending: this.state.totalTodos - this.state.completedTodos - (this.state.focusedTodoId ? 1 : 0),
      progressPercent: this.state.chainProgress,
      focusedTodoId: this.state.focusedTodoId,
      contextUsage: this.state.currentContextUsage
    }
  }

  /**
   * Set auto-transition enabled/disabled
   */
  setAutoTransition(enabled: boolean): void {
    this.state.autoTransitionEnabled = enabled
  }

  /**
   * Check if should suggest creating a new task
   */
  shouldSuggestNewTask(): { suggest: boolean; reason?: string } {
    if (this.state.currentContextUsage >= CONTEXT_THRESHOLDS.CRITICAL) {
      return {
        suggest: true,
        reason: `Context usage at ${this.state.currentContextUsage}%. Consider creating a new task to continue with remaining work.`
      }
    }

    if (this.state.chainProgress >= 100) {
      return {
        suggest: false,
        reason: 'All tasks completed.'
      }
    }

    return { suggest: false }
  }
}
