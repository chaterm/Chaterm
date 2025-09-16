// Internationalization message utilities
export interface Messages {
  // SSH connection related
  sshConnectionFailed: string
  sshConnectionFailedDetails: string
  sshConnectionStarting: string
  sshConnectionProgress: string
  sshConnectionSuccess: string

  // Error messages
  consecutiveMistakesError: string
  consecutiveMistakesErrorClaude: string
  consecutiveMistakesErrorOther: string
  autoApprovalMaxRequests: string

  // Environment information
  currentTime: string
  currentHosts: string
  hostSystemInfo: string
  contextWindowUsage: string

  // Tool execution related
  commandExecuted: string
  commandRunning: string
  commandOutput: string

  // System information labels
  osVersion: string
  defaultShell: string
  homeDirectory: string
  currentWorkingDirectory: string
  hostname: string
  user: string
  sudoAccess: string

  // Notification messages
  errorNotification: string
  maxRequestsNotification: string
  commandRunningNotification: string
  taskCompletedNotification: string
  condenseNotification: string
  githubIssueNotification: string
  followupQuestionNotification: string
  interactiveCommandNotification: string

  // Tool related messages
  toolExecutionFailed: string
  missingParameter: string

  // Security related messages
  commandBlocked: string
  dangerousCommandDetected: string
  securityReason: string
  securityDegree: string
  securityConfirmationRequired: string
  securitySettingsLink: string
  userRejectedCommand: string

  // Security error descriptions
  securityErrorCommandTooLong: string
  securityErrorNotInWhitelist: string
  securityErrorDangerousOperation: string
  securityErrorBlacklistPattern: string

  // Task related
  taskInterrupted: string

  // Time format
  timeAgo: {
    days: (count: number) => string
    hours: (count: number) => string
    minutes: (count: number) => string
    justNow: string
  }

  // System information titles
  systemInformationTitle: string
  noHostsConfigured: string
  unableToRetrieve: string
  unknown: string

  // Language settings description
  languageSettingsTitle: string
  defaultLanguage: string
  languageRules: string

  // Command execution output
  commandExecutedOutput: string
  commandStillRunning: string
  commandHereIsOutput: string
  commandUpdateFuture: string

  // Output truncation
  outputTruncatedChars: string
  outputTruncatedLines: string

  // Auto approval
  autoApprovalMaxRequestsMessage: string

  // Response interruption
  responseInterruptedUserFeedback: string
  responseInterruptedToolUse: string
  responseInterruptedApiError: string
  responseInterruptedUser: string

  // API errors
  unexpectedApiResponse: string
  failureNoResponse: string

  // Environment details
  currentTimeTitle: string
  currentHostsTitle: string
  hostWorkingDirectory: string
  contextWindowUsageTitle: string
  tokensUsed: string
  moreFilesNotShown: string

  // User feedback
  userProvidedFeedback: string

  // User custom instructions
  userCustomInstructionsTitle: string
  userCustomInstructionsDescription: string
}

export const messagesEN: Messages = {
  // SSH connection related
  sshConnectionFailed: 'Unable to connect to the remote server',
  sshConnectionFailedDetails: 'Please check your network settings and server configuration',
  sshConnectionStarting: 'Connecting to remote server...',
  sshConnectionProgress: 'Establishing secure connection...',
  sshConnectionSuccess: 'Successfully connected to server, please wait...',

  // Error messages
  consecutiveMistakesError: 'Chaterm is having trouble. Would you like to continue the task?',
  consecutiveMistakesErrorClaude:
    'This may indicate a failure in his thought process or inability to use a tool properly, which can be mitigated with some user guidance (e.g. "Try breaking down the task into smaller steps").',
  consecutiveMistakesErrorOther:
    "Chaterm uses complex prompts and iterative task execution that may be challenging for less capable models. For best results, it's recommended to use Claude 3.7 Sonnet for its advanced agentic coding capabilities.",
  autoApprovalMaxRequests: 'Chaterm has auto-approved {{count}} API requests. Would you like to reset the count and proceed with the task?',

  // Environment information
  currentTime: 'Current Time',
  currentHosts: 'Current Hosts',
  hostSystemInfo: 'Host {{host}} - Current Working Directory ({{cwd}}) Files',
  contextWindowUsage: 'Context Window Usage',

  // Tool execution related
  commandExecuted: 'Command executed.{{output}}',
  commandRunning:
    "Command is still running in the user's terminal.{{output}}\n\nYou will be updated on the terminal status and new output in the future.",
  commandOutput: 'Output',

  // System information labels
  osVersion: 'Operating System',
  defaultShell: 'Default Shell',
  homeDirectory: 'Home Directory',
  currentWorkingDirectory: 'Current Working Directory',
  hostname: 'Hostname',
  user: 'User',
  sudoAccess: 'Sudo Access',

  // Notification messages
  errorNotification: 'Error',
  maxRequestsNotification: 'Max Requests Reached',
  commandRunningNotification: 'Command is still running',
  taskCompletedNotification: 'Task Completed',
  condenseNotification: 'Chaterm wants to condense the conversation...',
  githubIssueNotification: 'Chaterm wants to create a github issue...',
  followupQuestionNotification: 'Chaterm has a question...',
  interactiveCommandNotification: 'The command may be executed interactively. Please type instructions as prompted.',

  // Tool related messages
  toolExecutionFailed: 'Error {{action}}',
  missingParameter: "Chaterm tried to use {{toolName}}{{path}} without value for required parameter '{{paramName}}'. Retrying...",

  // Security related messages
  commandBlocked: '🚫 The command is blocked by the security mechanism: {{command}}\nReason: {{reason}}',
  dangerousCommandDetected: '⚠️ Dangerous command detected',
  securityReason: 'Reason: {{reason}}',
  securityDegree: 'Degree: {{severity}}',
  securityConfirmationRequired: 'Please confirm whether to execute the command',
  securitySettingsLink: 'To modify security settings, go to: Settings -> AI Preferences -> Security Configuration',
  userRejectedCommand: '🚫 The user rejected the dangerous command: {{command}}',

  // Security error descriptions
  securityErrorCommandTooLong: 'The command length exceeds the limit ({{limit}} characters)',
  securityErrorNotInWhitelist: 'The command is not in the whitelist (strict mode)',
  securityErrorDangerousOperation: 'The command contains dangerous operations: {{command}}',
  securityErrorBlacklistPattern: 'Command matching blacklist pattern: {{pattern}}',

  // Task related
  taskInterrupted: 'The task was interrupted {{ago}}. {{details}}',

  // Time format
  timeAgo: {
    days: (count: number) => `${count} day${count > 1 ? 's' : ''} ago`,
    hours: (count: number) => `${count} hour${count > 1 ? 's' : ''} ago`,
    minutes: (count: number) => `${count} minute${count > 1 ? 's' : ''} ago`,
    justNow: 'just now'
  },

  // System information titles
  systemInformationTitle: 'SYSTEM INFORMATION',
  noHostsConfigured: 'No hosts configured.',
  unableToRetrieve: 'Unable to retrieve',
  unknown: 'Unknown',

  // Language settings description
  languageSettingsTitle: 'Language Settings',
  defaultLanguage: 'Default language : {{language}}.',
  languageRules:
    "rules:1.You should response based on the user's question language 2.This applies to ALL parts of your response, including thinking sections, explanations, and any other text content.",

  // Command execution output
  commandExecutedOutput: 'Command executed.',
  commandStillRunning: "Command is still running in the user's terminal.",
  commandHereIsOutput: "\nHere's the output so far:\n",
  commandUpdateFuture: '\n\nYou will be updated on the terminal status and new output in the future.',

  // Output truncation
  outputTruncatedChars: '[... Output truncated, omitted {{count}} characters ...]',
  outputTruncatedLines: '[... Output truncated, omitted {{count}} lines ...]',

  // Auto approval
  autoApprovalMaxRequestsMessage: 'Chaterm has auto-approved {{count}} API requests. Would you like to reset the count and proceed with the task?',

  // Response interruption
  responseInterruptedUserFeedback: '\n\n[Response interrupted by user feedback]',
  responseInterruptedToolUse:
    '\n\n[Response interrupted by a tool use result. Only one tool may be used at a time and should be placed at the end of the message.]',
  responseInterruptedApiError: 'Response interrupted by API Error',
  responseInterruptedUser: 'Response interrupted by user',

  // API errors
  unexpectedApiResponse:
    "Unexpected API Response: The language model did not provide any assistant messages. This may indicate an issue with the API or the model's output.",
  failureNoResponse: 'Failure: I did not provide a response.',

  // Environment details
  currentTimeTitle: 'Current Time',
  currentHostsTitle: 'Current Hosts',
  hostWorkingDirectory: 'Host {{host}} - Current Working Directory ({{cwd}}) Files',
  contextWindowUsageTitle: 'Context Window Usage',
  tokensUsed: '{{used}} / {{total}}K tokens used ({{percentage}}%)',
  moreFilesNotShown: '\n... ({{count}} more files not shown)',

  // User feedback
  userProvidedFeedback: 'The user provided the following feedback:\n<feedback>\n{{feedback}}\n</feedback>',

  // User custom instructions
  userCustomInstructionsTitle: "USER'S CUSTOM INSTRUCTIONS",
  userCustomInstructionsDescription:
    'The following additional instructions are provided by the user, and should be followed to the best of your ability without interfering with the TOOL USE guidelines.'
}

export const messagesCN: Messages = {
  // SSH连接相关
  sshConnectionFailed: '无法连接到远程服务器',
  sshConnectionFailedDetails: '请检查网络设置和服务器配置',
  sshConnectionStarting: '正在连接到远程服务器...',
  sshConnectionProgress: '正在建立安全连接...',
  sshConnectionSuccess: '已成功连接到服务器，请稍等...',

  // 错误消息
  consecutiveMistakesError: 'Chaterm遇到了问题。您是否希望继续这个任务？',
  consecutiveMistakesErrorClaude: '这可能表明思维过程失败或无法正确使用工具，可以通过一些用户指导来缓解（例如"尝试将任务分解为更小的步骤"）。',
  consecutiveMistakesErrorOther:
    'Chaterm使用复杂的提示和迭代任务执行，这对于能力较弱的模型来说可能具有挑战性。为了获得最佳结果，建议使用Claude 3.7 Sonnet，因为它具有先进的代理编程能力。',
  autoApprovalMaxRequests: 'Chaterm已自动批准了{{count}}个API请求。您是否希望重置计数并继续任务？',

  // 环境信息
  currentTime: '当前时间',
  currentHosts: '当前主机',
  hostSystemInfo: '主机 {{host}} - 当前工作目录 ({{cwd}}) 文件',
  contextWindowUsage: '上下文窗口使用情况',

  // 工具执行相关
  commandExecuted: '命令已执行。{{output}}',
  commandRunning: '命令仍在用户终端中运行。{{output}}\n\n您将获得有关终端状态和新输出的更新。',
  commandOutput: '输出',

  // 系统信息标签
  osVersion: '操作系统',
  defaultShell: '默认Shell',
  homeDirectory: '主目录',
  currentWorkingDirectory: '当前工作目录',
  hostname: '主机名',
  user: '用户',
  sudoAccess: 'Sudo权限',

  // 通知消息
  errorNotification: '错误',
  maxRequestsNotification: '已达到最大请求数',
  commandRunningNotification: '命令仍在运行',
  taskCompletedNotification: '任务完成',
  condenseNotification: 'Chaterm想要压缩对话...',
  githubIssueNotification: 'Chaterm想要创建github问题...',
  followupQuestionNotification: 'Chaterm有一个问题...',
  interactiveCommandNotification: '命令可能为交互式，请按提示键入指令或取消(等价Ctrl+C)',

  // 工具相关消息
  toolExecutionFailed: '执行{{action}}时出错',
  missingParameter: "Chaterm尝试使用{{toolName}}{{path}}，但缺少必需参数'{{paramName}}'的值。正在重试...",

  // 安全相关消息
  commandBlocked: '🚫 命令被安全机制阻止: {{command}}\n原因: {{reason}}',
  dangerousCommandDetected: '⚠️ 检测到危险命令',
  securityReason: '原因: {{reason}}',
  securityDegree: '危险程度: {{severity}}',
  securityConfirmationRequired: '请确认是否执行该命令',
  securitySettingsLink: '要修改安全设置，请前往: 设置 -> AI偏好 -> 安全配置',
  userRejectedCommand: '🚫 用户拒绝了危险命令: {{command}}',

  // 安全错误描述
  securityErrorCommandTooLong: '命令长度超过限制 ({{limit}} 字符)',
  securityErrorNotInWhitelist: '该命令不在白名单中（严格模式）',
  securityErrorDangerousOperation: '该命令包含危险操作: {{command}}',
  securityErrorBlacklistPattern: '命令匹配黑名单模式: {{pattern}}',

  // 任务相关
  taskInterrupted: '任务在{{ago}}被中断。{{details}}',

  // 时间格式
  timeAgo: {
    days: (count: number) => `${count}天前`,
    hours: (count: number) => `${count}小时前`,
    minutes: (count: number) => `${count}分钟前`,
    justNow: '刚刚'
  },

  // 系统信息标题
  systemInformationTitle: '系统信息',
  noHostsConfigured: '未配置主机。',
  unableToRetrieve: '无法获取',
  unknown: '未知',

  // 语言设置说明
  languageSettingsTitle: '语言设置',
  defaultLanguage: '默认语言：{{language}}。',
  languageRules: '规则：1.您应该根据用户的问题语言进行回应 2.这适用于回应的所有部分，包括思考部分、解释和任何其他文本内容。',

  // 命令执行输出
  commandExecutedOutput: '命令已执行。',
  commandStillRunning: '命令仍在用户终端中运行。',
  commandHereIsOutput: '\n到目前为止的输出：\n',
  commandUpdateFuture: '\n\n您将获得有关终端状态和新输出的更新。',

  // 输出截断
  outputTruncatedChars: '[... 输出已截断，省略了{{count}}个字符 ...]',
  outputTruncatedLines: '[... 输出已截断，省略了{{count}}行 ...]',

  // 自动批准
  autoApprovalMaxRequestsMessage: 'Chaterm已自动批准了{{count}}个API请求。您是否希望重置计数并继续任务？',

  // 响应中断
  responseInterruptedUserFeedback: '\n\n[回应被用户反馈中断]',
  responseInterruptedToolUse: '\n\n[回应被工具使用结果中断。一次只能使用一个工具，且应放在消息末尾。]',
  responseInterruptedApiError: '回应被API错误中断',
  responseInterruptedUser: '回应被用户中断',

  // API 错误
  unexpectedApiResponse: '意外的API响应：语言模型没有提供任何助手消息。这可能表明API或模型输出存在问题。',
  failureNoResponse: '失败：我没有提供回应。',

  // 环境详情
  currentTimeTitle: '当前时间',
  currentHostsTitle: '当前主机',
  hostWorkingDirectory: '主机 {{host}} - 当前工作目录 ({{cwd}}) 文件',
  contextWindowUsageTitle: '上下文窗口使用情况',
  tokensUsed: '{{used}} / {{total}}K 令牌已使用 ({{percentage}}%)',
  moreFilesNotShown: '\n... (还有{{count}}个文件未显示)',

  // 用户反馈
  userProvidedFeedback: '用户提供了以下反馈：\n<feedback>\n{{feedback}}\n</feedback>',

  // 用户自定义指令
  userCustomInstructionsTitle: '用户自定义指令',
  userCustomInstructionsDescription: '以下是用户提供的附加指令，应尽力遵循，但不得干扰工具使用指南。'
}

export function formatMessage(template: string, params: Record<string, any>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return params[key] !== undefined ? params[key] : match
  })
}

export function getMessages(language: string): Messages {
  return language === 'zh-CN' ? messagesCN : messagesEN
}
