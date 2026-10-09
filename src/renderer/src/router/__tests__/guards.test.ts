import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { setUserInfo, getUserInfo, removeToken } = vi.hoisted(() => ({
  setUserInfo: vi.fn(),
  getUserInfo: vi.fn(),
  removeToken: vi.fn()
}))

vi.mock('@/utils/permission', () => ({ setUserInfo, getUserInfo, removeToken }))
vi.mock('@/services/dataSyncService', () => ({
  dataSyncService: { initialize: vi.fn(), disableDataSync: vi.fn(), reset: vi.fn() }
}))
vi.mock('@/utils/perf', () => ({ mark: vi.fn(), reportMarksToMainAsync: vi.fn() }))
vi.mock('@/config', () => ({ default: { api: 'http://localhost' } }))

import { beforeEach as routeGuard } from '../guards'

describe('router beforeEach dev user auto skip', () => {
  const initUserDatabase = vi.fn()

  beforeEach(() => {
    localStorage.clear()
    initUserDatabase.mockResolvedValue({ success: true })
    ;(window as any).api = { initUserDatabase }
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.clearAllMocks()
    localStorage.clear()
  })

  const stubDevUser = () => {
    vi.stubEnv('DEV', true)
    vi.stubEnv('MODE', 'development.cn')
    vi.stubEnv('RENDERER_DEV_USER_ID', '123456')
  }

  it('opens the configured local database without routing through the login page', async () => {
    stubDevUser()
    const next = vi.fn()

    await routeGuard({ path: '/' }, {}, next)

    expect(localStorage.getItem('login-skipped')).toBe('true')
    expect(localStorage.getItem('ctm-token')).toBe('guest_token')
    expect(setUserInfo).toHaveBeenCalledWith(expect.objectContaining({ uid: 123456, token: 'guest_token' }))
    expect(initUserDatabase).toHaveBeenCalledTimes(1)
    expect(initUserDatabase).toHaveBeenCalledWith({ uid: 123456 })
    expect(next).toHaveBeenCalledWith()
  })

  it('leaves an explicit login page visit alone', async () => {
    stubDevUser()
    const next = vi.fn()

    await routeGuard({ path: '/login' }, {}, next)

    expect(localStorage.getItem('ctm-token')).toBeNull()
    expect(initUserDatabase).not.toHaveBeenCalled()
    expect(next).toHaveBeenCalledWith()
  })

  it('redirects to the login page when the local database cannot initialize', async () => {
    stubDevUser()
    initUserDatabase.mockResolvedValueOnce({ success: false })
    const next = vi.fn()

    await routeGuard({ path: '/' }, {}, next)

    expect(next).toHaveBeenCalledWith('/login')
    expect(localStorage.getItem('ctm-token')).toBeNull()
  })

  it('does not auto skip in a production build with the same setting', async () => {
    vi.stubEnv('DEV', false)
    vi.stubEnv('MODE', 'production.cn')
    vi.stubEnv('RENDERER_DEV_USER_ID', '123456')
    const next = vi.fn()

    await routeGuard({ path: '/' }, {}, next)

    expect(setUserInfo).not.toHaveBeenCalled()
    expect(initUserDatabase).not.toHaveBeenCalled()
    expect(next).toHaveBeenCalledWith('/login')
  })
})
