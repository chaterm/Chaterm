// Todo 功能的系统消息模板

export const TODO_REMINDER_TEMPLATES = {
  // 检测到复杂任务时的提醒
  complexTaskDetected: {
    en: '🔍 **Complex Operation Detected**: This appears to be a multi-step server operation. Consider using `todo_write` to create a structured task list for better tracking and execution.',
    cn: '🔍 **检测到复杂操作**：这似乎是一个多步骤的服务器操作。建议使用 `todo_write` 创建结构化任务列表，以便更好地跟踪和执行。'
  },

  // 建议创建任务列表
  suggestTodoCreation: {
    en: '💡 **Suggestion**: For systematic execution of this operation, I recommend creating a todo list. This will help ensure all steps are completed correctly and nothing is missed.',
    cn: '💡 **建议**：为了系统化地执行此操作，我建议创建一个任务列表。这将有助于确保所有步骤都正确完成，不会遗漏任何内容。'
  },

  // 任务列表为空时的提醒
  emptyTodoReminder: {
    en: '📝 **No active todos**: For complex server operations, consider using `todo_write` to create a structured task list.',
    cn: '📝 **暂无活跃任务**：对于复杂的服务器操作，建议使用 `todo_write` 创建结构化任务列表。'
  },

  // 任务进行中的状态提醒
  activeTaskReminder: {
    en: '⚡ **Active Task**: Currently working on todo items. Use `todo_read` to check progress or `todo_write` to update status.',
    cn: '⚡ **任务进行中**：当前正在处理任务项。使用 `todo_read` 检查进度或 `todo_write` 更新状态。'
  }
}

export const TODO_SYSTEM_MESSAGES = {
  // 系统检测到复杂任务时发送给 Agent 的消息
  complexTaskSystemMessage: (suggestion: string, isChineseMode: boolean = false, userMessage: string = '') => {
    // 动态生成具体的任务建议
    let specificTasks = []
    const message = userMessage.toLowerCase()

    // MAC 地址查询相关
    if (/(mac|地址)/.test(message) && /(查看|获取|显示)/.test(message)) {
      specificTasks = [
        { id: 'mac-1', content: '连接到目标服务器', description: '建立SSH连接到目标服务器，确保网络连通性', status: 'pending', priority: 'medium' },
        {
          id: 'mac-2',
          content: '执行网络接口查询命令',
          description: '使用ip link或ifconfig命令获取所有网络接口的详细信息',
          status: 'pending',
          priority: 'high'
        },
        {
          id: 'mac-3',
          content: '获取并显示 MAC 地址信息',
          description: '从网络接口信息中提取并格式化显示MAC地址',
          status: 'pending',
          priority: 'high'
        }
      ]
    }
    // 系统资源检查
    else if (/(资源|性能|cpu|内存|磁盘)/.test(message)) {
      specificTasks = [
        { id: 'sys-1', content: '检查 CPU 使用率', status: 'pending', priority: 'high' },
        { id: 'sys-2', content: '检查内存使用情况', status: 'pending', priority: 'high' },
        { id: 'sys-3', content: '检查磁盘空间', status: 'pending', priority: 'medium' }
      ]
    }
    // 服务状态检查
    else if (/(服务|进程|状态)/.test(message)) {
      specificTasks = [
        { id: 'svc-1', content: '连接到服务器', status: 'pending', priority: 'medium' },
        { id: 'svc-2', content: '检查服务运行状态', status: 'pending', priority: 'high' },
        { id: 'svc-3', content: '分析服务健康状况', status: 'pending', priority: 'medium' }
      ]
    }
    // 通用服务器操作
    else {
      specificTasks = [
        { id: 'task-1', content: '连接到目标服务器', description: '建立SSH连接到目标服务器，确保网络连通性', status: 'pending', priority: 'medium' },
        { id: 'task-2', content: '执行相关操作命令', description: '根据用户需求执行相应的系统命令或操作', status: 'pending', priority: 'high' },
        { id: 'task-3', content: '验证操作结果', description: '检查操作是否成功完成，确认结果符合预期', status: 'pending', priority: 'medium' }
      ]
    }

    // 简化的任务列表，避免复杂的 JSON 转义
    const taskList = specificTasks
      .map((task, index) => `${index + 1}. ${task.content} (优先级: ${task.priority})${task.description ? '\n   描述: ' + task.description : ''}`)
      .join('\n')

    const template = isChineseMode
      ? `<system-reminder>
🚨 检测到复杂服务器任务：${suggestion}

根据用户请求"${userMessage}"，建议的任务分解：
${taskList}

请立即使用 todo_write 工具创建任务列表。使用简单的 JSON 格式，例如：
[{"id":"task1","content":"连接服务器","status":"pending","priority":"medium"}]

创建后，记住：
- 执行每个任务前，使用 todo_write 将状态更新为 'in_progress'
- 完成每个任务后，使用 todo_write 将状态更新为 'completed'
- 这是强制性的，不得跳过状态更新

这将帮助确保所有步骤都被正确执行和跟踪。
</system-reminder>`
      : `<system-reminder>
🚨 Complex server task detected: ${suggestion}

Based on user request "${userMessage}", suggested task breakdown:
${taskList}

Please use todo_write tool immediately to create a task list. Use simple JSON format, for example:
[{"id":"task1","content":"Connect to server","description":"Establish SSH connection to target server","status":"pending","priority":"medium"}]

After creation, remember:
- Before executing each task, use todo_write to update status to 'in_progress'
- After completing each task, use todo_write to update status to 'completed'
- This is mandatory and status updates must not be skipped

This will help ensure all steps are properly executed and tracked.
</system-reminder>`

    return template
  },

  // 工具调用关联提醒
  toolCallAssociation: (toolName: string, todoContent: string, isChineseMode: boolean = false) => {
    const template = isChineseMode
      ? `<tool-association>\n工具调用 "${toolName}" 已关联到任务: ${todoContent}\n</tool-association>`
      : `<tool-association>\nTool call "${toolName}" associated with todo: ${todoContent}\n</tool-association>`

    return template
  }
}
