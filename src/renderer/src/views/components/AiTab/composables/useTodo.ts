import { computed, onMounted, onUnmounted } from 'vue'
import { todoService } from '../../../../services/todoService'
import type { Todo, TodoDisplayPreference } from '../../../../types/todo'

/**
 * Todo 功能的 composable
 */
export function useTodo() {
  // 响应式状态
  const currentTodos = computed(() => todoService.currentTodos.value)
  const displayPreference = computed(() => todoService.displayPreference.value)

  // 方法
  const setDisplayPreference = (preference: TodoDisplayPreference) => {
    todoService.setDisplayPreference(preference)
  }

  const shouldShowTodoAfterMessage = (message: any): boolean => {
    return todoService.shouldShowTodoAfterMessage(message)
  }

  const getTodosForMessage = (message: any): Todo[] => {
    return todoService.getTodosForMessage(message)
  }

  const markLatestMessageWithTodoUpdate = todoService.getMarkLatestMessageWithTodoUpdate()

  // 生命周期
  onMounted(async () => {
    await todoService.initializeTodos()
  })

  onUnmounted(() => {
    // todoService 是单例，不需要在这里销毁
  })

  return {
    // 状态
    currentTodos,
    displayPreference,

    // 方法
    setDisplayPreference,
    shouldShowTodoAfterMessage,
    getTodosForMessage,
    markLatestMessageWithTodoUpdate
  }
}

/**
 * 用于标记消息包含 todo 更新的辅助函数
 */
export function markMessageWithTodoUpdate(message: any, todos: Todo[]) {
  message.hasTodoUpdate = true
  message.relatedTodos = todos
}

/**
 * 检查消息是否包含 todo 相关内容的辅助函数
 */
export function isMessageTodoRelated(content: string): boolean {
  const todoKeywords = [
    // 中文关键词
    '任务列表',
    '进度',
    '下一步',
    '运维任务',
    '执行',
    '完成',
    '待办',
    '清单',
    '查看',
    '检查',
    '分析',
    '监控',
    '系统',
    '应用',
    '服务器',
    '资源',
    '排查',
    '调查',
    '步骤',
    '流程',
    '过程',
    '程序',
    '部署',
    '优化',
    '维护',
    '备份',
    '恢复',
    '升级',
    '迁移',
    '异常',
    '故障',
    '问题',
    '错误',
    '日志',
    '状态',
    // 英文关键词
    'todo',
    'TODO',
    'task',
    'tasks',
    'check',
    'analyze',
    'monitor',
    'examine',
    'system',
    'application',
    'server',
    'resources',
    'troubleshoot',
    'investigate',
    'step',
    'steps',
    'process',
    'procedure',
    'checklist',
    'progress',
    'status',
    'deploy',
    'optimize',
    'maintain',
    'backup',
    'restore',
    'upgrade',
    'migrate',
    'anomaly',
    'issue',
    'problem',
    'error',
    'log',
    'logs'
  ]

  return todoKeywords.some((keyword) => content.toLowerCase().includes(keyword.toLowerCase()))
}
