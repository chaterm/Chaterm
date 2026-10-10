import type { AutoApprovalSettings } from '../../shared/AutoApprovalSettings'
import type { CommandSecurityResult } from './types/SecurityTypes'

export type CommandDecision = { action: 'allow' | 'ask' | 'block'; reason: string }

export function canAutoExecuteCommand(settings: AutoApprovalSettings, requiresApproval: boolean, sessionReadOnly = false): boolean {
  const actions = settings.actions
  if (settings.enabled && actions.executeSafeCommands && (!requiresApproval || actions.executeAllCommands)) return true
  return !requiresApproval && ((actions.autoExecuteReadOnlyCommands ?? true) || sessionReadOnly)
}

export function decideCommand(security: CommandSecurityResult, settings: AutoApprovalSettings, requiresApproval: boolean): CommandDecision {
  if (!security.isAllowed && !security.requiresApproval) return { action: 'block', reason: security.reason || 'Blocked by security configuration' }
  if (security.requiresApproval) return { action: 'ask', reason: security.reason || 'Security confirmation required' }
  return canAutoExecuteCommand(settings, requiresApproval)
    ? { action: 'allow', reason: 'Global auto-execution settings' }
    : { action: 'ask', reason: 'Command requires user approval' }
}
