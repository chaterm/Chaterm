import { afterEach, describe, expect, it, vi } from 'vitest'
import { getDevelopmentUserId, getSkipLoginUserId } from '../devUser'

describe('dev user selection', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('uses the configured user only in development mode', () => {
    vi.stubEnv('DEV', true)
    vi.stubEnv('MODE', 'development.cn')
    vi.stubEnv('RENDERER_DEV_USER_ID', '2000823')

    expect(getDevelopmentUserId()).toBe(2000823)
    expect(getSkipLoginUserId()).toBe(2000823)
  })

  it('falls back to the guest database outside development mode', () => {
    vi.stubEnv('DEV', false)
    vi.stubEnv('MODE', 'production.cn')
    vi.stubEnv('RENDERER_DEV_USER_ID', '2000823')

    expect(getDevelopmentUserId()).toBeNull()
    expect(getSkipLoginUserId()).toBe(999999999)
  })

  it('rejects malformed user IDs', () => {
    vi.stubEnv('DEV', true)
    vi.stubEnv('MODE', 'development.cn')
    vi.stubEnv('RENDERER_DEV_USER_ID', '2000823x')

    expect(getDevelopmentUserId()).toBeNull()
  })
})
