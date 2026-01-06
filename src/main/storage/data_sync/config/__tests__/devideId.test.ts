import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('child_process', () => ({
  execSync: vi.fn()
}))

vi.mock('os', () => ({
  platform: vi.fn(),
  arch: vi.fn(),
  hostname: vi.fn(),
  userInfo: vi.fn()
}))

import * as os from 'os'
import { execSync } from 'child_process'
import { getDeviceId } from '../devideId'

const execSyncMock = vi.mocked(execSync)
const osMock = vi.mocked(os)

const computeFallbackId = (combined: string): string => {
  let hash = 0
  for (let i = 0; i < combined.length; i++) {
    hash = (hash << 5) - hash + combined.charCodeAt(i)
    hash |= 0
  }
  const hashStr = Math.abs(hash).toString(16).padStart(8, '0')
  return `device-fallback-${hashStr}`
}

describe('getDeviceId', () => {
  beforeEach(() => {
    execSyncMock.mockReset()
    osMock.platform.mockReturnValue('linux')
    osMock.arch.mockReturnValue('x64')
    osMock.hostname.mockReturnValue('test-host')
    osMock.userInfo.mockReturnValue({
      username: 'tester',
      uid: 1000,
      gid: 1000,
      shell: '/bin/bash',
      homedir: '/home/tester'
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('uses /etc/machine-id and formats to UUID on linux', () => {
    execSyncMock.mockImplementation((cmd: string) => {
      if (cmd === 'cat /etc/machine-id') {
        return '00112233445566778899aabbccddeeff\n'
      }
      throw new Error(`unexpected command: ${cmd}`)
    })

    const deviceId = getDeviceId()
    expect(deviceId).toBe('device-00112233-4455-6677-8899-aabbccddeeff')
  })

  it('uses /var/lib/dbus/machine-id when /etc/machine-id is unavailable', () => {
    execSyncMock.mockImplementation((cmd: string) => {
      if (cmd === 'cat /etc/machine-id') {
        throw new Error('permission denied')
      }
      if (cmd === 'cat /var/lib/dbus/machine-id') {
        return '0123456789abcdef0123456789abcdef\n'
      }
      throw new Error(`unexpected command: ${cmd}`)
    })

    const deviceId = getDeviceId()
    expect(deviceId).toBe('device-01234567-89ab-cdef-0123-456789abcdef')
  })

  it('falls back to deterministic device id when system UUID is unavailable', () => {
    execSyncMock.mockImplementation(() => {
      throw new Error('unavailable')
    })

    const deviceId = getDeviceId()
    const combined = 'linux-x64-test-host-tester'
    expect(deviceId).toBe(computeFallbackId(combined))
  })
})
