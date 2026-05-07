import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'
import { useHostState } from '../useHostState'
import type { Host } from '../../types'

// Shared refs for mocking useSessionState
const hosts = ref<Host[]>([])
const chatTypeValue = ref('agent')

vi.mock('../useSessionState', () => ({
  useSessionState: () => ({
    hosts,
    chatTypeValue
  })
}))

vi.mock('../../utils', () => ({
  isSwitchAssetType: vi.fn()
}))

vi.mock('@/locales', () => ({
  default: {
    global: {
      t: vi.fn((key: string) => key)
    }
  }
}))

vi.mock('@/utils/eventBus', () => ({
  default: {
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn()
  }
}))

vi.mock('@/views/components/Notice', () => ({
  Notice: {
    open: vi.fn()
  }
}))

vi.mock('../../LeftTab/utils/types', () => ({
  getBastionHostType: vi.fn(() => null)
}))

describe('useHostState — workspace gating', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    hosts.value = []
    chatTypeValue.value = 'agent'
  })

  describe("workspace='database'", () => {
    it('getCurentTabAssetInfo returns null synchronously without touching event bus', async () => {
      const eventBus = await import('@/utils/eventBus')
      const { getCurentTabAssetInfo } = useHostState('database')

      const result = await getCurentTabAssetInfo()

      expect(result).toBeNull()
      expect(eventBus.default.on).not.toHaveBeenCalled()
      expect(eventBus.default.emit).not.toHaveBeenCalled()
    })

    it('updateHosts does NOT flip chatTypeValue even for switch assets', async () => {
      const { updateHosts } = useHostState('database')
      const { isSwitchAssetType } = await import('../../utils')
      const { Notice } = await import('@/views/components/Notice')

      vi.mocked(isSwitchAssetType).mockReturnValue(true)
      chatTypeValue.value = 'agent'

      updateHosts({
        ip: '192.168.1.1',
        uuid: 'switch-uuid',
        connection: 'personal',
        assetType: 'person-switch-cisco'
      })

      // Mode stays 'agent' — DB workspace locks chat mode.
      expect(chatTypeValue.value).toBe('agent')
      expect(Notice.open).not.toHaveBeenCalled()
      // Hosts array still populated with the asset.
      expect(hosts.value).toHaveLength(1)
    })

    it('updateHosts(null) still clears hosts', () => {
      const { updateHosts } = useHostState('database')
      hosts.value = [{ host: '10.0.0.1', uuid: 'u', connection: 'personal' }]

      updateHosts(null)

      expect(hosts.value).toEqual([])
    })
  })

  describe("workspace='terminal' (default)", () => {
    it('default call still flips mode on switch asset (regression guard)', async () => {
      const { updateHosts } = useHostState()
      const { isSwitchAssetType } = await import('../../utils')
      const { Notice } = await import('@/views/components/Notice')

      vi.mocked(isSwitchAssetType).mockReturnValue(true)
      chatTypeValue.value = 'agent'

      updateHosts({
        ip: '192.168.1.1',
        uuid: 'switch-uuid',
        connection: 'personal',
        assetType: 'person-switch-cisco'
      })

      expect(chatTypeValue.value).toBe('cmd')
      expect(Notice.open).toHaveBeenCalledTimes(1)
    })

    it("explicit workspace='terminal' behaves identically to the default", async () => {
      const { updateHosts } = useHostState('terminal')
      const { isSwitchAssetType } = await import('../../utils')
      const { Notice } = await import('@/views/components/Notice')

      vi.mocked(isSwitchAssetType).mockReturnValue(true)
      chatTypeValue.value = 'agent'

      updateHosts({
        ip: '192.168.1.1',
        uuid: 'switch-uuid',
        connection: 'personal',
        assetType: 'person-switch-cisco'
      })

      expect(chatTypeValue.value).toBe('cmd')
      expect(Notice.open).toHaveBeenCalledTimes(1)
    })
  })
})
