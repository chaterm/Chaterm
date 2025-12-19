export class TodoContextTracker {
  private static instances = new Map<string, TodoContextTracker>()
  private activeTodoId: string | null = null

  private constructor(_sessionId: string) {
    // sessionId parameter is reserved for future use in session-scoped operations
  }

  static forSession(sessionId: string): TodoContextTracker {
    if (!this.instances.has(sessionId)) {
      this.instances.set(sessionId, new TodoContextTracker(sessionId))
    }
    return this.instances.get(sessionId)!
  }

  setActiveTodo(todoId: string | null): void {
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

  // Clear session instance (optional, for memory management)
  static clearSession(sessionId: string): void {
    this.instances.delete(sessionId)
  }
}
