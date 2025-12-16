import { ref } from 'vue'
import type { Todo, TodoDisplayPreference, TodoWebviewMessage } from '../types/todo'

class TodoService {
  // Reactive state
  public currentTodos = ref<Todo[]>([])
  public displayPreference = ref<TodoDisplayPreference>('inline')

  // Track the timestamp of the last todo update to ensure only the latest is displayed
  private lastTodoUpdateTimestamp = ref<number>(0)

  // Event listener
  private unsubscribeFromMain: (() => void) | null = null

  constructor() {
    this.initializeMessageListener()
    this.loadUserPreferences()
  }

  /**
   * Initialize message listener
   */
  private initializeMessageListener() {
    if (window.api && window.api.onMainMessage) {
      this.unsubscribeFromMain = window.api.onMainMessage((message: any) => {
        this.handleMainMessage(message)
      })
    }
  }

  /**
   * Handle messages from main process
   */
  private handleMainMessage(message: any) {
    const serviceId = `SERVICE_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    if (message.type === 'todoUpdated') {
      this.handleTodoUpdate(message as TodoWebviewMessage, serviceId)
    } else {
      // console.log(`[Todo Debug ${serviceId}] Ignoring non-todoUpdated message:`, message.type)
    }
  }

  /**
   * Handle todo update event
   */
  private handleTodoUpdate(message: TodoWebviewMessage, _serviceId: string) {
    const timestamp = Date.now()

    // Update current todos
    this.currentTodos.value = message.todos || []

    // Record the latest update timestamp to determine which message should display todo
    this.lastTodoUpdateTimestamp.value = timestamp

    // console.log(`[Todo Debug ${serviceId}] TodoService: Updated todos`, {
    //   todosCount: this.currentTodos.value.length,
    //   timestamp,
    //   sessionId: message.sessionId || message.taskId,
    //   currentTodos: this.currentTodos.value
    // })
  }

  /**
   * Load user preferences
   */
  private loadUserPreferences() {
    const savedPreference = localStorage.getItem('todo-display-preference')
    if (savedPreference && ['inline', 'floating', 'hidden'].includes(savedPreference)) {
      this.displayPreference.value = savedPreference as TodoDisplayPreference
    }
  }

  /**
   * Save user preferences
   */
  private saveUserPreferences() {
    localStorage.setItem('todo-display-preference', this.displayPreference.value)
  }

  /**
   * Set display preference
   */
  public setDisplayPreference(preference: TodoDisplayPreference) {
    this.displayPreference.value = preference
    this.saveUserPreferences()
  }

  /**
   * Determine whether todo should be displayed after message
   */
  public shouldShowTodoAfterMessage(message: any): boolean {
    const displayHidden = this.displayPreference.value === 'hidden'
    const noTodos = this.currentTodos.value.length === 0
    const tooFewTodos = this.currentTodos.value.length > 0 && this.currentTodos.value.length < 3
    const isAssistant = message.role === 'assistant'
    const hasTodoUpdate = message.hasTodoUpdate === true
    if (displayHidden) {
      // console.log('[Todo Debug] Not showing todo: display preference is hidden')
      return false
    }
    if (noTodos) {
      // console.log('[Todo Debug] Not showing todo: no todos available')
      return false
    }
    if (tooFewTodos) {
      // console.log('[Todo Debug] Not showing todo: fewer than 3 todos — not a complex checklist')
      return false
    }

    // Only messages explicitly marked with hasTodoUpdate should display todo
    // This avoids the issue of multiple messages displaying todo
    const shouldShow = isAssistant && hasTodoUpdate
    return shouldShow
  }

  /**
   * Mark message containing todo update
   * This method should be called when receiving todoUpdated event to mark the latest assistant message
   */
  public markLatestMessageWithTodoUpdate(messages: any[], todos: Todo[]) {
    // Find the latest assistant message
    const assistantMessages = messages.filter((m) => m.role === 'assistant')
    const latestAssistantMessage = assistantMessages.pop()

    if (latestAssistantMessage) {
      // Clear todo markers from all previous messages to ensure only the latest message displays todo
      messages.forEach((msg) => {
        if (msg.hasTodoUpdate) {
          msg.hasTodoUpdate = false
          delete msg.relatedTodos
        }
      })

      // Mark the latest message
      latestAssistantMessage.hasTodoUpdate = true
      latestAssistantMessage.relatedTodos = todos
    } else {
      // If no assistant message is found, wait for the next assistant message
      console.warn('[Todo Debug] No assistant message found to attach todos')
    }
  }

  /**
   * Get todos related to message
   */
  public getTodosForMessage(message: any): Todo[] {
    return message.relatedTodos || this.currentTodos.value
  }

  /**
   * Initialize and get current todos
   */
  public async initializeTodos() {
    // Todo data will be automatically updated via todoUpdated messages
    // No need to actively request here
  }

  /**
   * Get method to mark message, for external component calls
   */
  public getMarkLatestMessageWithTodoUpdate() {
    return this.markLatestMessageWithTodoUpdate.bind(this)
  }

  /**
   * Reset todo state and optionally clear todo markers on messages
   */
  public clearTodoState(messages?: any[]) {
    this.currentTodos.value = []
    this.lastTodoUpdateTimestamp.value = Date.now()
    if (Array.isArray(messages)) {
      messages.forEach((msg) => {
        if (msg.hasTodoUpdate) {
          msg.hasTodoUpdate = false
          delete msg.relatedTodos
        }
      })
    }
    // console.log('[Todo Debug] Todo state cleared')
  }

  /**
   * Clean up resources
   */
  public destroy() {
    if (this.unsubscribeFromMain) {
      this.unsubscribeFromMain()
      this.unsubscribeFromMain = null
    }
  }
}

// Create singleton instance
export const todoService = new TodoService()

// Export type for use elsewhere
export type { TodoService }
