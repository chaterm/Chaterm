import { ref, reactive } from 'vue'
import type { Todo, TodoUpdateEvent, TodoDisplayPreference, TodoWebviewMessage } from '../types/todo'

class TodoService {
  // 响应式状态
  public currentTodos = ref<Todo[]>([])
  public displayPreference = ref<TodoDisplayPreference>('inline')

  // 事件监听器
  private messageHandler: ((message: any) => void) | null = null
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
    console.log('TodoService received message:', message.type, message)

    if (message.type === 'todoUpdated') {
      this.handleTodoUpdate(message as TodoWebviewMessage)
    }
  }

  /**
   * 处理 todo 更新事件
   */
  private handleTodoUpdate(message: TodoWebviewMessage) {
    this.currentTodos.value = message.todos || []
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
    if (this.displayPreference.value === 'hidden') return false
    if (this.currentTodos.value.length === 0) return false

    // 显示条件：
    // 1. Agent 消息包含 todo 更新
    // 2. 用户询问进度相关问题后的回复
    // 3. 重要任务状态变更
    return (
      message.role === 'assistant' &&
      (message.hasTodoUpdate ||
        message.content?.includes('任务列表') ||
        message.content?.includes('进度') ||
        message.content?.includes('下一步') ||
        message.content?.includes('todo') ||
        message.content?.includes('运维任务'))
    )
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
