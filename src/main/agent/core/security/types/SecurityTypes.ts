/**
 * Security mechanism related type definitions
 */

// Command security validation result
export interface CommandSecurityResult {
  isAllowed: boolean
  reason?: string
  category?: 'blacklist' | 'whitelist' | 'dangerous' | 'permission'
  severity?: 'low' | 'medium' | 'high' | 'critical'
  action?: 'block' | 'ask' | 'allow' // New: action to take
  requiresApproval?: boolean // New: whether user confirmation is required
}

// Security configuration interface
export interface SecurityConfig {
  enableCommandSecurity: boolean
  enableStrictMode: boolean // Whether to enable strict mode (whitelist mode)
  blacklistPatterns: string[]
  whitelistPatterns: string[]
  dangerousCommands: string[]
  maxCommandLength: number
  // Security policy configuration
  securityPolicy: {
    blockCritical: boolean // Whether to directly block critical dangerous commands
    askForMedium: boolean // Whether to ask for medium danger commands
    askForHigh: boolean // Whether to ask for high danger commands
    askForBlacklist: boolean // Whether to ask for blacklist commands
  }
}
