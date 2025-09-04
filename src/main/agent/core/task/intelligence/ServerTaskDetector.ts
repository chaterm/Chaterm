export class ServerTaskDetector {
  private static readonly SERVER_TASK_INDICATORS = [
    // 系统运维关键词
    '排查',
    '优化',
    '部署',
    '升级',
    '迁移',
    '备份',
    '恢复',
    '监控',
    '巡检',
    '维护',
    '故障',
    '问题',
    '异常',
    '修复',

    // 多步骤指示词
    '步骤',
    '流程',
    '计划',
    '方案',
    '清单',
    '检查项',
    '首先',
    '然后',
    '接下来',
    '最后',
    '依次',
    '分别',

    // 服务相关
    '服务器',
    '数据库',
    '应用',
    '网络',
    '安全',
    '性能',
    'nginx',
    'apache',
    'mysql',
    'redis',
    'docker',
    'k8s',
    'linux',
    'ubuntu',
    'centos',
    '集群',
    '负载均衡',

    // 网络相关
    'mac',
    '地址',
    'ip',
    '连接',
    '通信',
    'ping',
    'telnet',
    'ssh',
    '端口',
    '防火墙',
    '路由',
    '交换机',

    // 数量指示
    '多个',
    '批量',
    '全部',
    '所有',
    '一系列',
    '整套'
  ]

  static shouldCreateTodoForServerTask(userMessage: string): boolean {
    const message = userMessage.toLowerCase()

    // 检测复杂任务模式
    const hasMultipleSteps = /[第一二三四五六七八九十]\s*[步阶段项]/.test(message)
    const hasSequentialWords = /(首先|然后|接下来|最后|依次|分别)/.test(message)
    const hasListFormat = /[1-9]\.|[一二三四五六七八九十]、/.test(message)

    // 检测服务端关键词
    const hasServerKeywords = this.SERVER_TASK_INDICATORS.some((keyword) => message.includes(keyword.toLowerCase()))

    // 检测多个关键词（表示复杂任务）
    const keywordCount = this.SERVER_TASK_INDICATORS.filter((keyword) => message.includes(keyword.toLowerCase())).length
    const hasMultipleKeywords = keywordCount >= 2

    // 检测问题描述关键词
    const hasProblemKeywords = /(问题|故障|异常|错误|失败|慢|卡|无法|不能)/.test(message)

    // 检测操作关键词 - 扩展更多常见的查询词
    const hasActionKeywords = /(需要|要|应该|必须|请|帮助|协助|查看|检查|获取|显示|看|找|搜索)/.test(message)

    // 降低复杂度阈值，让更多任务能触发todo创建
    const isComplexMessage = message.length > 10 && hasServerKeywords

    // 扩展网络相关检测 - 包括MAC地址查询
    const hasNetworkQuery = /(mac|地址|网络|连接|通信|ping|telnet|ssh|ip|接口|网卡)/.test(message)
    const hasQueryAction = /(查看|获取|显示|看|检查)/.test(message)

    // 系统信息查询检测
    const hasSystemQuery = /(系统|服务器|主机|机器|设备)/.test(message) && hasQueryAction

    console.log(`[ServerTaskDetector] Analyzing: "${userMessage}"`)
    console.log(`[ServerTaskDetector] hasMultipleSteps: ${hasMultipleSteps}`)
    console.log(`[ServerTaskDetector] hasSequentialWords: ${hasSequentialWords}`)
    console.log(`[ServerTaskDetector] hasListFormat: ${hasListFormat}`)
    console.log(`[ServerTaskDetector] hasServerKeywords: ${hasServerKeywords}`)
    console.log(`[ServerTaskDetector] hasMultipleKeywords: ${hasMultipleKeywords}`)
    console.log(`[ServerTaskDetector] hasProblemKeywords: ${hasProblemKeywords}`)
    console.log(`[ServerTaskDetector] hasActionKeywords: ${hasActionKeywords}`)
    console.log(`[ServerTaskDetector] isComplexMessage: ${isComplexMessage}`)
    console.log(`[ServerTaskDetector] hasNetworkQuery: ${hasNetworkQuery}`)
    console.log(`[ServerTaskDetector] hasSystemQuery: ${hasSystemQuery}`)

    const shouldCreate =
      hasMultipleSteps ||
      hasSequentialWords ||
      hasListFormat ||
      isComplexMessage ||
      hasMultipleKeywords ||
      (hasNetworkQuery && hasQueryAction) ||
      hasSystemQuery ||
      (hasServerKeywords && hasProblemKeywords && hasActionKeywords)

    console.log(`[ServerTaskDetector] Final decision: ${shouldCreate}`)
    return shouldCreate
  }

  static analyzeTaskComplexity(userMessage: string): 'simple' | 'moderate' | 'complex' {
    const message = userMessage.toLowerCase()
    let complexityScore = 0

    // 长度评分
    if (message.length > 50) complexityScore += 1
    if (message.length > 100) complexityScore += 1

    // 关键词密度评分
    const keywordCount = this.SERVER_TASK_INDICATORS.filter((keyword) => message.includes(keyword.toLowerCase())).length

    if (keywordCount >= 2) complexityScore += 1
    if (keywordCount >= 4) complexityScore += 1

    // 步骤指示评分
    const hasStepIndicators = /(步骤|流程|计划|方案)/.test(message)
    if (hasStepIndicators) complexityScore += 1

    // 多个操作对象评分
    const hasMultipleTargets = /(多个|批量|全部|所有)/.test(message)
    if (hasMultipleTargets) complexityScore += 1

    // 问题诊断评分
    const hasProblemKeywords = /(问题|故障|异常|错误|失败|慢|卡|无法|不能)/.test(message)
    if (hasProblemKeywords) complexityScore += 1

    // 网络相关问题评分
    const hasNetworkIssue = /(mac|地址|网络|连接|通信|ping|telnet|ssh)/.test(message) && hasProblemKeywords
    if (hasNetworkIssue) complexityScore += 1

    if (complexityScore >= 4) return 'complex'
    if (complexityScore >= 2) return 'moderate'
    return 'simple'
  }

  static generateTaskSuggestion(userMessage: string): string | null {
    // 如果 shouldCreateTodoForServerTask 认为应该创建 todo，就提供建议
    if (!this.shouldCreateTodoForServerTask(userMessage)) {
      return null
    }

    const complexity = this.analyzeTaskComplexity(userMessage)

    const suggestions = {
      simple: '检测到服务器运维任务，建议创建任务列表来确保操作的系统性和完整性。',
      moderate: '检测到中等复杂度的运维任务，建议创建任务列表来跟踪执行进度。',
      complex: '检测到复杂的多步骤运维任务，强烈建议使用 todo_write 工具创建详细的任务列表，确保所有关键步骤都被正确执行。'
    }

    return suggestions[complexity]
  }

  /**
   * 检测用户消息中是否包含明确的任务创建意图
   */
  static hasExplicitTodoIntent(userMessage: string): boolean {
    const message = userMessage.toLowerCase()
    const todoIntentKeywords = ['创建任务', '建立清单', '制定计划', '列出步骤', '任务列表', '待办事项', 'todo', '清单']

    return todoIntentKeywords.some((keyword) => message.includes(keyword))
  }

  /**
   * 提取用户消息中的潜在任务项
   */
  static extractPotentialTasks(userMessage: string): string[] {
    const tasks: string[] = []

    // 匹配编号列表格式 (1. 2. 3. 或 一、二、三、)
    const numberedMatches = userMessage.match(/(?:[1-9]\.|[一二三四五六七八九十]、)\s*([^\n\r]+)/g)
    if (numberedMatches) {
      tasks.push(...numberedMatches.map((match) => match.replace(/^(?:[1-9]\.|[一二三四五六七八九十]、)\s*/, '').trim()))
    }

    // 匹配步骤格式
    const stepMatches = userMessage.match(/(?:第[一二三四五六七八九十]步|步骤[1-9])[：:]\s*([^\n\r]+)/g)
    if (stepMatches) {
      tasks.push(...stepMatches.map((match) => match.replace(/^(?:第[一二三四五六七八九十]步|步骤[1-9])[：:]\s*/, '').trim()))
    }

    return tasks.filter((task) => task.length > 0)
  }

  /**
   * 根据用户消息生成具体的任务建议
   */
  static generateSpecificTasks(userMessage: string): Array<{ id: string; content: string; status: string; priority: string }> {
    const message = userMessage.toLowerCase()
    const tasks = []

    // MAC 地址查询相关
    if (/(mac|地址)/.test(message) && /(查看|获取|显示)/.test(message)) {
      tasks.push(
        { id: 'mac-1', content: '连接到目标服务器', status: 'pending', priority: 'medium' },
        { id: 'mac-2', content: '执行网络接口查询命令', status: 'pending', priority: 'high' },
        { id: 'mac-3', content: '获取并显示 MAC 地址信息', status: 'pending', priority: 'high' }
      )
    }
    // 系统资源检查
    else if (/(资源|性能|cpu|内存|磁盘)/.test(message)) {
      tasks.push(
        { id: 'sys-1', content: '检查 CPU 使用率', status: 'pending', priority: 'high' },
        { id: 'sys-2', content: '检查内存使用情况', status: 'pending', priority: 'high' },
        { id: 'sys-3', content: '检查磁盘空间', status: 'pending', priority: 'medium' }
      )
    }
    // 服务状态检查
    else if (/(服务|进程|状态)/.test(message)) {
      tasks.push(
        { id: 'svc-1', content: '连接到服务器', status: 'pending', priority: 'medium' },
        { id: 'svc-2', content: '检查服务运行状态', status: 'pending', priority: 'high' },
        { id: 'svc-3', content: '分析服务健康状况', status: 'pending', priority: 'medium' }
      )
    }
    // 通用服务器操作
    else {
      tasks.push(
        { id: 'task-1', content: '连接到目标服务器', status: 'pending', priority: 'medium' },
        { id: 'task-2', content: '执行相关操作命令', status: 'pending', priority: 'high' },
        { id: 'task-3', content: '验证操作结果', status: 'pending', priority: 'medium' }
      )
    }

    return tasks
  }

  /**
   * 根据消息内容生成建议的优先级
   */
  static suggestPriority(taskContent: string): 'high' | 'medium' | 'low' {
    const content = taskContent.toLowerCase()

    // 高优先级关键词
    const highPriorityKeywords = ['紧急', '故障', '异常', '修复', '恢复', '安全', '备份']
    if (highPriorityKeywords.some((keyword) => content.includes(keyword))) {
      return 'high'
    }

    // 中优先级关键词
    const mediumPriorityKeywords = ['部署', '升级', '优化', '监控', '检查']
    if (mediumPriorityKeywords.some((keyword) => content.includes(keyword))) {
      return 'medium'
    }

    return 'low'
  }
}
