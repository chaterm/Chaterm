import { describe, it, expect, vi } from 'vitest'
import { CommandSecurityManager } from '@core/security/CommandSecurityManager'

let config = {
  enableCommandSecurity: true,
  enableStrictMode: true,
  blacklistPatterns: ['rm *'],
  whitelistPatterns: ['ls *'],
  dangerousCommands: ['rm', 'sudo'],
  maxCommandLength: 20,
  securityPolicy: {
    blockCritical: true,
    askForMedium: true,
    askForHigh: true,
    askForBlacklist: false
  }
}

vi.mock('@core/security/SecurityConfig', () => {
  return {
    SecurityConfigManager: class {
      getConfig() {
        return config
      }
      async loadConfig() {
        // 模拟异步加载配置，直接返回当前 config
        return config
      }
      updateConfig(updates: any) {
        config = { ...config, ...updates }
      }
    }
  }
})

describe('CommandSecurityManager', () => {
  it('超过最大长度的命令应被阻止', () => {
    config.maxCommandLength = 5
    const mgr = new CommandSecurityManager()
    const res = mgr.validateCommandSecurity('echo verylong')
    expect(res.isAllowed).toBe(false)
    expect(res.category).toBe('permission')
  })

  it('黑名单命中应直接阻止且不需要确认', () => {
    config.maxCommandLength = 100
    config.blacklistPatterns = ['rm *']
    config.securityPolicy.askForBlacklist = false
    const mgr = new CommandSecurityManager()
    const res = mgr.validateCommandSecurity('rm -rf /tmp')
    expect(res.isAllowed).toBe(false)
    expect(res.category).toBe('blacklist')
    expect(res.action).toBe('block')
    expect(res.requiresApproval).toBe(false)
  })

  it('危险命令 critical 级别应要求确认', () => {
    config.maxCommandLength = 100
    config.blacklistPatterns = []
    config.dangerousCommands = ['rm']
    config.securityPolicy.askForHigh = false
    const mgr = new CommandSecurityManager()
    const res = mgr.validateCommandSecurity('rm /etc/passwd')
    expect(res.category).toBe('dangerous')
    expect(res.severity).toBe('critical')
    expect(res.isAllowed).toBe(true)
    expect(res.action).toBe('ask')
    expect(res.requiresApproval).toBe(true)
  })

  it('严格模式下不在白名单的命令被阻止', () => {
    config.maxCommandLength = 100
    config.enableStrictMode = true
    config.whitelistPatterns = ['ls *']
    const mgr = new CommandSecurityManager()
    const res = mgr.validateCommandSecurity('cat /etc/passwd')
    expect(res.isAllowed).toBe(false)
    expect(res.category).toBe('whitelist')
  })
})
