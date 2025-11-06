/**
 * JumpServer 导航辅助函数
 * 提取通用的连接检测和状态判断逻辑
 */

/**
 * 检测输出中是否包含密码提示
 */
export const hasPasswordPrompt = (text: string): boolean => {
  return text.includes('Password:') || text.includes('password:')
}

/**
 * 检测输出中是否包含密码错误信息
 */
export const hasPasswordError = (text: string): boolean => {
  return text.includes('password auth error') || text.includes('[Host]>')
}

/**
 * 检测是否已成功连接到目标服务器
 * @returns 如果检测到连接成功的标志，返回原因描述；否则返回 null
 */
export const detectDirectConnectionReason = (text: string): string | null => {
  if (!text) return null

  // 关键字检测
  const indicators = ['Connecting to', '连接到', 'Last login:', 'Last failed login:']

  for (const indicator of indicators) {
    if (text.includes(indicator)) {
      return `关键字 ${indicator.trim()}`
    }
  }

  // Shell 提示符检测
  const lines = text.split(/\r?\n/)
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue
    if (trimmed === '[Host]>' || trimmed.endsWith('Opt>')) continue

    const isPrompt =
      (trimmed.endsWith('$') || trimmed.endsWith('#') || trimmed.endsWith(']$') || trimmed.endsWith(']#') || trimmed.endsWith('>$')) &&
      (trimmed.includes('@') || trimmed.includes(':~') || trimmed.startsWith('['))

    if (isPrompt) {
      return `提示符 ${trimmed}`
    }
  }

  return null
}
