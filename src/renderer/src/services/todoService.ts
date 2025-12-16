import { ref } from 'vue'
import type { Todo, TodoDisplayPreference, TodoWebviewMessage } from '../types/todo'

class TodoService {
  // 响应式状态
  public currentTodos = ref<Todo[]>([])
  public displayPreference = ref<TodoDisplayPreference>('inline')

  // 跟踪最后一次 todo 更新的时间戳，确保只显示最新的
  private lastTodoUpdateTimestamp = ref<number>(0)

  // 事件监听器
  private unsubscribeFromMain: (() => void) | null = null

  constructor() {
    this.initializeMessageListener()
    this.loadUserPreferences()
  }

  /**
   * 初始化消息监听器
   */
  private initializeMessageListener() {
    if (window.api && window.api.onMainMessage) {
      this.unsubscribeFromMain = window.api.onMainMessage((message: any) => {
        this.handleMainMessage(message)
      })
    }
  }

  /**
   * 处理来自主进程的消息
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
   * 处理 todo 更新事件
   */
  private handleTodoUpdate(message: TodoWebviewMessage, _serviceId: string) {
    const timestamp = Date.now()

    // 更新当前 todos
    this.currentTodos.value = message.todos || []

    // 记录最新的更新时间戳，用于判断哪个消息应该显示 todo
    this.lastTodoUpdateTimestamp.value = timestamp

    // console.log(`[Todo Debug ${serviceId}] TodoService: Updated todos`, {
    //   todosCount: this.currentTodos.value.length,
    //   timestamp,
    //   sessionId: message.sessionId || message.taskId,
    //   currentTodos: this.currentTodos.value
    // })
  }

  /**
   * 加载用户偏好设置
   */
  private loadUserPreferences() {
    const savedPreference = localStorage.getItem('todo-display-preference')
    if (savedPreference && ['inline', 'floating', 'hidden'].includes(savedPreference)) {
      this.displayPreference.value = savedPreference as TodoDisplayPreference
    }
  }

  /**
   * 保存用户偏好设置
   */
  private saveUserPreferences() {
    localStorage.setItem('todo-display-preference', this.displayPreference.value)
  }

  /**
   * 设置显示偏好
   */
  public setDisplayPreference(preference: TodoDisplayPreference) {
    this.displayPreference.value = preference
    this.saveUserPreferences()
  }

  /**
   * 判断是否应该在消息后显示 todo
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

    // 只有明确标记了 hasTodoUpdate 的消息才显示 todo
    // 这样可以避免多个消息都显示 todo 的问题
    const shouldShow = isAssistant && hasTodoUpdate
    return shouldShow
  }

  /**
   * 标记消息包含 todo 更新
   * 这个方法应该在收到 todoUpdated 事件时调用，标记最新的 assistant 消息
   */
  public markLatestMessageWithTodoUpdate(messages: any[], todos: Todo[]) {
    // 找到最新的 assistant 消息
    const assistantMessages = messages.filter((m) => m.role === 'assistant')
    const latestAssistantMessage = assistantMessages.pop()

    if (latestAssistantMessage) {
      // 清除之前所有消息的 todo 标记，确保只有最新的消息显示 todo
      messages.forEach((msg) => {
        if (msg.hasTodoUpdate) {
          msg.hasTodoUpdate = false
          delete msg.relatedTodos
        }
      })

      // 标记最新的消息
      latestAssistantMessage.hasTodoUpdate = true
      latestAssistantMessage.relatedTodos = todos
    } else {
      // 如果没有找到 assistant 消息，等待下一个 assistant 消息
      console.warn('[Todo Debug] No assistant message found to attach todos')
    }
  }

  /**
   * 获取与消息相关的 todos
   */
  public getTodosForMessage(message: any): Todo[] {
    return message.relatedTodos || this.currentTodos.value
  }

  /**
   * 初始化获取当前 todos
   */
  public async initializeTodos() {
    // Todo 数据将通过 todoUpdated 消息自动更新
    // 这里不需要主动请求
  }

  /**
   * 获取标记消息的方法，供外部组件调用
   */
  public getMarkLatestMessageWithTodoUpdate() {
    return this.markLatestMessageWithTodoUpdate.bind(this)
  }

  /**
   * 重置 todo 状态，并可选清除消息上的 todo 标记
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
   * 清理资源
   */
  public destroy() {
    if (this.unsubscribeFromMain) {
      this.unsubscribeFromMain()
      this.unsubscribeFromMain = null
    }
  }
}

// 创建单例实例
export const todoService = new TodoService()

// 导出类型供其他地方使用
export type { TodoService }
