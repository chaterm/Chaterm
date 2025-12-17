// Detection thresholds (centralized for easy tuning)
const MIN_MESSAGE_LENGTH = 10 // messages shorter than this are ignored
const MIN_STEPS_FOR_TODO = 3 // require at least this many concrete steps to create todos
const MIN_SIGNALS_FOR_COMPLEX = 2 // number of heuristic signals to consider task complex

// Domain-intent heuristics: single-sentence but inherently multi-step ops
const COMPLEX_ACTIONS = [
  /(部署|安装|搭建|配置|上线|发布|迁移|备份|恢复|初始化|扩容|缩容|集群|加固|监控)/, // Chinese verbs
  /(deploy|install|setup|configure|provision|migrate|backup|restore|initialize|bootstrap|scale|harden|monitor)/i // en verbs
]

const COMPLEX_RESOURCES = [
  /(mysql|postgres|postgresql|redis|mongodb|kafka|zookeeper|nginx|elasticsearch|rabbitmq|consul|etcd|vault|istio|traefik|haproxy|keepalived)/i,
  /(docker|compose|kubernetes|k8s|helm|jenkins|gitlab|harbor|prometheus|grafana)/i,
  /(ssl|tls|证书|防火墙|iptables|vpn|wireguard|openvpn|域名|dns|负载均衡|lb)/i,
  /(数据库|消息队列|缓存|搜索|网关|代理|服务发现)/ // Chinese generic resources
]

const COMPLEX_CONTEXT_HINTS = [
  /(生产|线上|环境|集群|多节点|高可用|容灾|灾备|灰度|回滚)/, // Chinese
  /(production|cluster|multi-?node|high\s*availability|dr|disaster\s*recovery|canary|rollback)/i // en
]

function isHighComplexityIntent(text: string): boolean {
  // Action + Resource within one sentence or strong context hint
  const actionHit = COMPLEX_ACTIONS.some((re) => re.test(text))
  const resourceHit = COMPLEX_RESOURCES.some((re) => re.test(text))
  const contextHit = COMPLEX_CONTEXT_HINTS.some((re) => re.test(text))
  return (actionHit && resourceHit) || (resourceHit && contextHit) || (actionHit && contextHit)
}

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
- 保持任务列表结构化和实用
- 仅当至少包含三个明确步骤时才使用 todo_write。若只有 1-2 个明确步骤，切勿创建清单；请直接执行并报告结果。`,

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
- Use todo_write only when there are at least three concrete steps. If there are only 1–2 steps, do not create a list; act directly and report the outcome.
- For system operations, monitoring, and troubleshooting tasks, todo lists are essential`
    }

    return `<system-reminder>\n${templates[isChineseMode ? 'zh' : 'en']}\n</system-reminder>`
  },

  // Smart reminder - simplified version
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

// Simplified detector
export class SmartTaskDetector {
  static shouldCreateTodo(message: string): boolean {
    // console.log('[Todo Debug] SmartTaskDetector analyzing message:', message)

    if (message.length <= MIN_MESSAGE_LENGTH) {
      // console.log('[Todo Debug] Message too short, skipping todo creation')
      return false // Adjust threshold, Chinese expressions are more concise
    }

    const lowerMessage = message.toLowerCase()
    // console.log('[Todo Debug] Lowercase message:', lowerMessage)

    // Early exit: single-sentence but clearly multi-step ops (e.g., "部署一个 MySQL 数据库")
    if (isHighComplexityIntent(lowerMessage)) {
      // console.log('[Todo Debug] High-complexity intent detected by domain heuristics')
      return true
    }

    const patterns = [
      // Chinese detection patterns
      /[第一二三四五六七八九十]\s*[步阶段项]/, // Step pattern
      /(首先|然后|接下来|最后|依次)/, // Sequence words
      /[1-9]\.|[一二三四五六七八九十]、/, // List format
      /(排查|优化|部署|升级|迁移|维护|分析|监控).*(问题|故障|性能|异常|日志)/, // Extended ops + issues
      /(批量|全部|所有).*(服务器|应用|数据库|系统|配置)/, // Batch operations
      /(查看|检查|分析|监控).*(分析|检查|查看)/, // Multi-action tasks
      /(系统|应用|服务).*(监控|分析|日志|资源|异常)/, // System diagnosis tasks

      // English detection patterns - enhanced
      /(first|then|next|finally|step\s*[1-9]|step\s*one)/i, // Sequence words
      /[1-9]\.\s/, // List format
      /(check|analyze|examine|monitor|troubleshoot|deploy|optimize|migrate).*(and|then|\s+\w+\s+(and|then))/i, // Multi-action tasks
      /(system|application|server|database|service).*(monitor|analyze|log|resource|error|issue|anomaly)/i, // System diagnosis
      /(batch|all|multiple).*(server|application|database|system|config)/i, // Batch operations
      /(troubleshoot|diagnose|investigate).*(problem|issue|error|failure|performance)/i, // Troubleshooting
      /(deploy|migrate|backup|restore|upgrade).*(server|application|database|system|production)/i, // Deployment and maintenance tasks

      // New: broader English detection patterns
      /(check|analyze|examine|monitor).*(system|application|server|database|log|resource)/i, // Basic system checks
      /(which|what).*(application|process|service).*(consume|using|占用)/i, // Resource usage queries
      /(examine|analyze|check).*(log|file|error|anomaly)/i // Log analysis
    ]

    // Rules:
    // 1) Explicitly listed numbered/sequence items reaching 3 or more ⇒ directly determine todo needed
    // 2) Otherwise count matching signal quantity (different pattern matches), consider complex task only when reaching 2 or more
    const countMatches = (regex: RegExp, text: string): number => (text.match(regex) || []).length

    const numberedListCount = countMatches(/(?:^|\s)(?:[1-9])[\.]\s/g, lowerMessage)
    const cnEnumerateCount = countMatches(/[一二三四五六七八九十]、/g, lowerMessage)
    const cnSeqCount = countMatches(/(首先|然后|接下来|最后|依次)/g, lowerMessage)
    const enSeqCount = countMatches(/\b(first|then|next|finally)\b/g, lowerMessage)

    if (
      numberedListCount >= MIN_STEPS_FOR_TODO ||
      cnEnumerateCount >= MIN_STEPS_FOR_TODO ||
      cnSeqCount >= MIN_STEPS_FOR_TODO ||
      enSeqCount >= MIN_STEPS_FOR_TODO
    ) {
      return true
    }

    let signals = 0
    for (let i = 0; i < patterns.length; i++) {
      const pattern = patterns[i]
      if (pattern.test(lowerMessage)) signals++
    }
    return signals >= MIN_SIGNALS_FOR_COMPLEX
  }
}

// For backward compatibility, maintain original export interface
export const TODO_SYSTEM_MESSAGES = {
  // Use new optimized logic to replace original complexTaskSystemMessage
  complexTaskSystemMessage: (_suggestion: string, isChineseMode: boolean = false, _userMessage: string = '') => {
    return TODO_PROMPTS_OPTIMIZED.coreSystemMessage(isChineseMode)
  }
}
