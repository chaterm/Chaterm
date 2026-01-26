import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'
import { useHostState } from '../useHostState'
import type { Host } from '../../types'

// Shared refs for mocking useSessionState
const hosts = ref<Host[]>([])
const chatTypeValue = ref('agent')

// Mock useSessionState to provide controlled state
vi.mock('../useSessionState', () => ({
  useSessionState: () => ({
    hosts,
    chatTypeValue
  })
}))

// Mock isSwitchAssetType utility
vi.mock('../../utils', () => ({
  isSwitchAssetType: vi.fn()
}))

// Mock i18n
vi.mock('@/locales', () => ({
  default: {
    global: {
      t: vi.fn((key: string) => key)
    }
  }
}))

// Mock eventBus for getCurentTabAssetInfo
vi.mock('@/utils/eventBus', () => ({
  default: {
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn()
  }
}))

// Mock Notice component
vi.mock('@/views/components/Notice', () => ({
  Notice: {
    open: vi.fn()
  }
}))

// Mock getBastionHostType
vi.mock('../../LeftTab/utils/types', () => ({
  getBastionHostType: vi.fn((assetType: string | undefined) => {
    if (!assetType) return null
    if (assetType === 'organization') return 'jumpserver'
    if (assetType.startsWith('organization-')) {
      return assetType.substring('organization-'.length)
    }
    return null
  })
}))

describe('useHostState', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    hosts.value = []
    chatTypeValue.value = 'agent'
  })

  describe('updateHosts', () => {
    it('should clear hosts when chatTypeValue is chat', async () => {
      const { updateHosts } = useHostState()
      const { isSwitchAssetType } = await import('../../utils')

      chatTypeValue.value = 'chat'
      hosts.value = [{ host: '192.168.1.1', uuid: 'test-uuid', connection: 'personal' }]

      updateHosts({ ip: '10.0.0.1', uuid: 'new-uuid', connection: 'personal' })

      expect(hosts.value).toEqual([])
      expect(isSwitchAssetType).not.toHaveBeenCalled()
    })

    it('should switch to cmd mode and show notice when agent mode and isSwitchAssetType returns true', async () => {
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
      expect(Notice.open).toHaveBeenCalledWith({
        type: 'info',
        description: 'ai.switchNotSupportAgent',
        placement: 'bottomRight'
      })
      expect(hosts.value).toHaveLength(1)
    })

    it('should populate hosts correctly with provided HostInfo', async () => {
      const { updateHosts } = useHostState()
      const { isSwitchAssetType } = await import('../../utils')

      vi.mocked(isSwitchAssetType).mockReturnValue(false)
      chatTypeValue.value = 'agent'

      const hostInfo = {
        ip: '192.168.1.100',
        uuid: 'host-uuid-123',
        connection: 'jumpserver',
        assetType: 'organization'
      }

      updateHosts(hostInfo)

      expect(hosts.value).toHaveLength(1)
      expect(hosts.value[0]).toEqual({
        host: '192.168.1.100',
        uuid: 'host-uuid-123',
        connection: 'jumpserver',
        assetType: 'organization'
      })
    })

    it('should clear hosts when hostInfo is null', async () => {
      const { updateHosts } = useHostState()
      const { isSwitchAssetType } = await import('../../utils')

      vi.mocked(isSwitchAssetType).mockReturnValue(false)
      chatTypeValue.value = 'cmd'
      hosts.value = [{ host: '10.0.0.1', uuid: 'existing-uuid', connection: 'personal' }]

      updateHosts(null)

      expect(hosts.value).toEqual([])
    })

    it('should not switch mode when chatTypeValue is cmd even if isSwitchAssetType returns true', async () => {
      const { updateHosts } = useHostState()
      const { isSwitchAssetType } = await import('../../utils')
      const { Notice } = await import('@/views/components/Notice')

      vi.mocked(isSwitchAssetType).mockReturnValue(true)
      chatTypeValue.value = 'cmd'

      updateHosts({
        ip: '192.168.1.1',
        uuid: 'switch-uuid',
        connection: 'personal',
        assetType: 'person-switch-cisco'
      })

      expect(chatTypeValue.value).toBe('cmd')
      expect(Notice.open).not.toHaveBeenCalled()
      expect(hosts.value).toHaveLength(1)
    })
  })

  describe('updateHostsForCommandMode', () => {
    it('should call getCurentTabAssetInfo and populate hosts from returned asset', async () => {
      const eventBus = await import('@/utils/eventBus')
      const { updateHostsForCommandMode } = useHostState()

      const mockAssetInfo = {
        uuid: 'asset-uuid-1',
        title: 'Test Server',
        ip: '192.168.1.50',
        connection: 'personal',
        assetType: 'server'
      }

      vi.mocked(eventBus.default.on).mockImplementation((event: string, handler: unknown) => {
        if (event === 'assetInfoResult') {
          setTimeout(() => {
            ;(handler as (info: typeof mockAssetInfo) => void)(mockAssetInfo)
          }, 10)
        }
      })

      await updateHostsForCommandMode()

      expect(eventBus.default.emit).toHaveBeenCalledWith('getActiveTabAssetInfo')
      expect(hosts.value).toHaveLength(1)
      expect(hosts.value[0]).toEqual({
        host: '192.168.1.50',
        uuid: 'asset-uuid-1',
        connection: 'personal',
        assetType: 'server'
      })
    })

    it('should default connection to personal when asset connection is empty', async () => {
      const eventBus = await import('@/utils/eventBus')
      const { updateHostsForCommandMode } = useHostState()

      const mockAssetInfo = {
        uuid: 'asset-uuid-2',
        title: 'Test Server',
        ip: '10.0.0.5',
        connection: undefined,
        assetType: 'linux'
      }

      vi.mocked(eventBus.default.on).mockImplementation((event: string, handler: unknown) => {
        if (event === 'assetInfoResult') {
          setTimeout(() => {
            ;(handler as (info: typeof mockAssetInfo) => void)(mockAssetInfo)
          }, 10)
        }
      })

      await updateHostsForCommandMode()

      expect(hosts.value).toHaveLength(1)
      expect(hosts.value[0].connection).toBe('personal')
    })

    it('should clear hosts when getCurentTabAssetInfo returns null', async () => {
      const eventBus = await import('@/utils/eventBus')
      const { updateHostsForCommandMode } = useHostState()

      hosts.value = [{ host: '192.168.1.1', uuid: 'old-uuid', connection: 'personal' }]

      vi.mocked(eventBus.default.on).mockImplementation((event: string, handler: unknown) => {
        if (event === 'assetInfoResult') {
          setTimeout(() => {
            ;(handler as (info: null) => void)(null)
          }, 10)
        }
      })

      await updateHostsForCommandMode()

      expect(hosts.value).toEqual([])
    })

    it('should clear hosts when getCurentTabAssetInfo returns asset without ip', async () => {
      const eventBus = await import('@/utils/eventBus')
      const { updateHostsForCommandMode } = useHostState()

      hosts.value = [{ host: '192.168.1.1', uuid: 'old-uuid', connection: 'personal' }]

      const mockAssetInfoNoIp = {
        uuid: 'asset-uuid-3',
        title: 'Test Server',
        ip: '',
        connection: 'personal'
      }

      vi.mocked(eventBus.default.on).mockImplementation((event: string, handler: unknown) => {
        if (event === 'assetInfoResult') {
          setTimeout(() => {
            ;(handler as (info: typeof mockAssetInfoNoIp) => void)(mockAssetInfoNoIp)
          }, 10)
        }
      })

      await updateHostsForCommandMode()

      expect(hosts.value).toEqual([])
    })
  })
})
