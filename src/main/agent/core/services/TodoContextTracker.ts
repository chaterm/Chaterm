export class TodoContextTracker {
  private static instances = new Map<string, TodoContextTracker>()
  private activeTodoId: string | null = null

  private constructor(private readonly sessionId: string) {}

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

  // 清理会话实例（可选，用于内存管理）
  static clearSession(sessionId: string): void {
    this.instances.delete(sessionId)
  }

  // 获取所有活跃会话（用于调试）
  static getActiveSessions(): string[] {
    return Array.from(this.instances.keys())
  }
}
