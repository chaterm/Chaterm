/**
 * 安全机制相关类型定义
 */

// 命令安全验证结果
export interface CommandSecurityResult {
  isAllowed: boolean
  reason?: string
  category?: 'blacklist' | 'whitelist' | 'dangerous' | 'permission'
  severity?: 'low' | 'medium' | 'high' | 'critical'
  action?: 'block' | 'ask' | 'allow' // 新增：处理动作
  requiresApproval?: boolean // 新增：是否需要用户确认
}

// 安全配置接口
export interface SecurityConfig {
  enableCommandSecurity: boolean
  enableStrictMode: boolean // 是否启用严格模式（白名单模式）
  blacklistPatterns: string[]
  whitelistPatterns: string[]
  dangerousCommands: string[]
  maxCommandLength: number
  // 安全策略配置
  securityPolicy: {
    blockCritical: boolean // 是否直接阻止严重危险命令
    askForMedium: boolean // 中等危险命令是否询问
    askForHigh: boolean // 高危险命令是否询问
    askForBlacklist: boolean // 黑名单命令是否询问
  }
}
