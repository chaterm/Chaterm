import { afterEach, describe, expect, it, vi } from 'vitest'
import { classifyAgentCommand, enterpriseUsageStatsService } from '../enterpriseUsageStatsService'

const authMock = vi.hoisted(() => ({
  getAuthToken: vi.fn(),
  getCurrentUserId: vi.fn()
}))

vi.mock('@logging/index', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn()
  })
}))

vi.mock('../config/edition', () => ({
  getApiBaseUrl: () => 'https://api.example.test'
}))

vi.mock('../storage/data_sync/envelope_encryption/services/auth', () => ({
  chatermAuthAdapter: authMock
}))

describe('enterpriseUsageStatsService', () => {
  const oldEnabled = process.env.CHATERM_ENTERPRISE_STATS_ENABLED
  const oldFetch = globalThis.fetch

  afterEach(() => {
    if (oldEnabled === undefined) {
      delete process.env.CHATERM_ENTERPRISE_STATS_ENABLED
    } else {
      process.env.CHATERM_ENTERPRISE_STATS_ENABLED = oldEnabled
    }
    globalThis.fetch = oldFetch
    vi.clearAllMocks()
  })

  it.each([
    ['ps -ef', 'inspect'],
    ['top -n 1', 'inspect'],
    ['powershell -Command "(Get-Process).Count"', 'inspect'],
    ['mysql -u root -proot -e "SELECT user, host FROM mysql.user"', 'inspect'],
    ['psql -c "UPDATE users SET status=\'active\' WHERE id=1"', 'change'],
    ['apt-get update -qq && apt-get install -y nginx', 'change'],
    ['journalctl -u nginx --since today | grep error', 'diagnose'],
    ['cd /tmp && systemctl restart nginx', 'change'],
    ['unknown-tool --flag', 'unknown']
  ])('classifies %s as %s', (command, expected) => {
    expect(classifyAgentCommand(command)).toBe(expected)
  })

  it.each([
    [undefined, false],
    ['', false],
    ['true', true],
    ['1', true],
    ['yes', true],
    ['on', true],
    ['false', false],
    ['0', false],
    ['no', false],
    ['off', false],
    ['unexpected', false]
  ])('enables reporting only for explicit truthy policy value %s', (raw, expected) => {
    if (raw === undefined) {
      delete process.env.CHATERM_ENTERPRISE_STATS_ENABLED
    } else {
      process.env.CHATERM_ENTERPRISE_STATS_ENABLED = raw
    }

    expect(enterpriseUsageStatsService.isEnabled()).toBe(expected)
  })

  it('skips upload when the feature flag is disabled', async () => {
    process.env.CHATERM_ENTERPRISE_STATS_ENABLED = ''
    globalThis.fetch = vi.fn()

    await expect(enterpriseUsageStatsService.captureEvent({ eventType: 'client_active' })).resolves.toEqual({
      success: false,
      skipped: 'disabled'
    })
    expect(authMock.getAuthToken).not.toHaveBeenCalled()
    expect(authMock.getCurrentUserId).not.toHaveBeenCalled()
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('skips upload when the user is not authenticated', async () => {
    process.env.CHATERM_ENTERPRISE_STATS_ENABLED = 'true'
    globalThis.fetch = vi.fn()
    authMock.getAuthToken.mockResolvedValue('guest_token')
    authMock.getCurrentUserId.mockResolvedValue('guest_user')

    await expect(enterpriseUsageStatsService.captureEvent({ eventType: 'client_active' })).resolves.toEqual({
      success: false,
      skipped: 'unauthenticated'
    })
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })
})
