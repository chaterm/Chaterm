export const TODO_PROMPTS_OPTIMIZED = {
  coreSystemMessage: (isChineseMode: boolean = false) => {
    const templates = {
      zh: `你是一个智能运维助手。当检测到复杂或多步骤任务时，主动使用 todo_write 工具创建任务列表来跟踪执行进度。

关键原则：
- 自动识别需要拆分的复杂任务
- 为每个任务设置合适的优先级和状态
- 执行任务时及时更新状态
- 每个任务必须包含 content（任务标题）和 description（详细描述）两个字段
- content 应该简洁明了，description 应该包含具体的执行步骤或详细说明
- 保持任务列表结构化和实用`,

      en: `You are an intelligent operations assistant. For complex or multi-step tasks, you MUST proactively use the todo_write tool to create structured task lists for tracking execution progress.

IMPORTANT: When you detect system monitoring, analysis, troubleshooting, or multi-step operations, immediately create a todo list using the todo_write tool.

Key principles:
- ALWAYS use todo_write for complex tasks that involve multiple steps
- Automatically identify tasks that need breakdown into manageable steps
- Set appropriate priority (high/medium/low) and status (pending/in_progress/completed) for each task
- Update task status promptly when executing tasks
- Each task MUST include both content (task title) and description (detailed explanation) fields
- content should be concise and clear, description should contain specific execution steps or detailed instructions
- Keep task lists structured and practical
- For system operations, monitoring, and troubleshooting tasks, todo lists are essential`
    }

    return `<system-reminder>\n${templates[isChineseMode ? 'zh' : 'en']}\n</system-reminder>`
  },

  // 智能提醒 - 简化版
  smartReminder: (taskType: string, isChineseMode: boolean = false) => {
    const hints = {
      zh: {
        complex: '💡 检测到复杂任务，建议创建任务列表跟踪进度',
        network: '🔗 网络相关操作，建议分步执行',
        system: '⚙️ 系统运维任务，建议使用任务管理',
        troubleshoot: '🔧 问题排查任务，建议创建检查清单',
        default: '📋 多步骤任务，建议创建待办列表'
      },
      en: {
        complex: '💡 Complex task detected, suggest creating task list',
        network: '🔗 Network operation, suggest step-by-step execution',
        system: '⚙️ System maintenance task, suggest using task management',
        troubleshoot: '🔧 Troubleshooting task, suggest creating checklist',
        default: '📋 Multi-step task, suggest creating todo list'
      }
    }

    const lang = isChineseMode ? 'zh' : 'en'
    return hints[lang][taskType] || hints[lang].default
  }
}

// 简化的检测器
export class SmartTaskDetector {
  static shouldCreateTodo(message: string): boolean {
    console.log('[Todo Debug] SmartTaskDetector analyzing message:', message)

    if (message.length <= 10) {
      console.log('[Todo Debug] Message too short, skipping todo creation')
      return false // 调整阈值，中文表达更简洁
    }

    const lowerMessage = message.toLowerCase()
    console.log('[Todo Debug] Lowercase message:', lowerMessage)

    const patterns = [
      // 中文检测模式
      /[第一二三四五六七八九十]\s*[步阶段项]/, // 步骤模式
      /(首先|然后|接下来|最后|依次)/, // 序列词
      /[1-9]\.|[一二三四五六七八九十]、/, // 列表格式
      /(排查|优化|部署|升级|迁移|维护|分析|监控).*(问题|故障|性能|异常|日志)/, // 扩展运维+问题
      /(批量|全部|所有).*(服务器|应用|数据库|系统|配置)/, // 批量操作
      /(查看|检查|分析|监控).*(分析|检查|查看)/, // 多动作任务
      /(系统|应用|服务).*(监控|分析|日志|资源|异常)/, // 系统诊断任务

      // 英文检测模式 - 增强版
      /(first|then|next|finally|step\s*[1-9]|step\s*one)/i, // 序列词
      /[1-9]\.\s/, // 列表格式
      /(check|analyze|examine|monitor|troubleshoot|deploy|optimize|migrate).*(and|then|\s+\w+\s+(and|then))/i, // 多动作任务
      /(system|application|server|database|service).*(monitor|analyze|log|resource|error|issue|anomaly)/i, // 系统诊断
      /(batch|all|multiple).*(server|application|database|system|config)/i, // 批量操作
      /(troubleshoot|diagnose|investigate).*(problem|issue|error|failure|performance)/i, // 故障排查
      /(deploy|migrate|backup|restore|upgrade).*(server|application|database|system|production)/i, // 部署和维护任务

      // 新增：更宽泛的英文检测模式
      /(check|analyze|examine|monitor).*(system|application|server|database|log|resource)/i, // 基础系统检查
      /(which|what).*(application|process|service).*(consume|using|占用)/i, // 资源占用查询
      /(examine|analyze|check).*(log|file|error|anomaly)/i // 日志分析
    ]

    for (let i = 0; i < patterns.length; i++) {
      const pattern = patterns[i]
      const matches = pattern.test(lowerMessage)
      if (matches) {
        return true
      }
    }

    return false
  }

  // 简化的任务类型识别
  static getTaskType(message: string): string {
    console.log('[Todo Debug] Identifying task type for message:', message)
    const msg = message.toLowerCase()

    let taskType = 'complex'
    if (/(mac|ip|网络|连接|network|connection)/.test(msg)) taskType = 'network'
    else if (/(cpu|内存|磁盘|性能|memory|disk|performance|resource)/.test(msg)) taskType = 'system'
    else if (/(排查|故障|异常|troubleshoot|error|issue|problem)/.test(msg)) taskType = 'troubleshoot'

    console.log('[Todo Debug] Task type identified:', taskType)
    return taskType
  }
}

// 使用示例 - 集成到现有系统
export function getOptimizedTodoReminder(userMessage: string, isChineseMode: boolean = false): string | null {
  if (!SmartTaskDetector.shouldCreateTodo(userMessage)) {
    return null
  }

  const taskType = SmartTaskDetector.getTaskType(userMessage)
  return TODO_PROMPTS_OPTIMIZED.smartReminder(taskType, isChineseMode)
}

// 为了向后兼容，保持原有的导出接口
export const TODO_SYSTEM_MESSAGES = {
  // 使用新的优化逻辑替代原有的complexTaskSystemMessage
  complexTaskSystemMessage: (suggestion: string, isChineseMode: boolean = false, userMessage: string = '') => {
    return TODO_PROMPTS_OPTIMIZED.coreSystemMessage(isChineseMode)
  }
}
