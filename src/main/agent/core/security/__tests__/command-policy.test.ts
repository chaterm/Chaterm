import { describe, expect, it } from 'vitest'
import { canAutoExecuteCommand, decideCommand } from '../command-policy'
import type { AutoApprovalSettings } from '../../../shared/AutoApprovalSettings'

const settings = (overrides: Partial<AutoApprovalSettings['actions']> = {}, enabled = false): AutoApprovalSettings => ({
  version: 3,
  enabled,
  actions: {
    readFiles: true,
    editFiles: false,
    executeSafeCommands: true,
    executeAllCommands: false,
    autoExecuteReadOnlyCommands: true,
    ...overrides
  },
  enableNotifications: true,
  favorites: []
})

describe('external command policy', () => {
  it('auto-executes read-only commands by default', () => {
    expect(canAutoExecuteCommand(settings(), false)).toBe(true)
  })

  it('requires approval for requested changes until execute-all is enabled', () => {
    expect(canAutoExecuteCommand(settings(), true)).toBe(false)
    expect(canAutoExecuteCommand(settings({ executeAllCommands: true }, true), true)).toBe(true)
  })

  it('keeps security blocks ahead of auto-approval', () => {
    expect(
      decideCommand({ isAllowed: false, requiresApproval: false, reason: 'blocked' }, settings({ executeAllCommands: true }, true), false)
    ).toEqual({
      action: 'block',
      reason: 'blocked'
    })
  })

  it('keeps security confirmation ahead of read-only auto-execution', () => {
    expect(decideCommand({ isAllowed: true, requiresApproval: true, reason: 'dangerous' }, settings(), false)).toEqual({
      action: 'ask',
      reason: 'dangerous'
    })
  })
})
