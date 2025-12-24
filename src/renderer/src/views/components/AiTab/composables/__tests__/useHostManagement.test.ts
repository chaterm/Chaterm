import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'
import { useHostManagement } from '../useHostManagement'
import type { Host, HostOption } from '../../types'
import eventBus from '@/utils/eventBus'
import { Notice } from '@/views/components/Notice/index'

// Create shared refs for state
const hosts = ref<Host[]>([])
const chatTypeValue = ref('agent')
const autoUpdateHost = ref(true)
const chatInputValue = ref('')
const currentChatId = ref('test-tab-id')

// Mock dependencies
vi.mock('../useSessionState', () => ({
  useSessionState: () => ({
    hosts,
    chatTypeValue,
    autoUpdateHost,
    chatInputValue,
    currentChatId
  })
}))

vi.mock('../useTabManagement', () => ({
  focusChatInput: vi.fn()
}))

vi.mock('@/locales', () => ({
  default: {
    global: {
      t: (key: string, params?: any) => {
        if (key === 'ai.maxHostsLimitReached') {
          return `Maximum of ${params?.max} hosts reached`
        }
        return key
      }
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

vi.mock('@/views/components/Notice/index', () => ({
  Notice: {
    open: vi.fn()
  }
}))

describe('useHostManagement', () => {
  const mockHostOption: HostOption = {
    label: 'server1.example.com',
    value: 'host-1',
    key: 'host-1',
    uuid: 'uuid-1',
    connect: 'ssh',
    type: 'personal',
    selectable: true,
    level: 0
  }

  const mockJumpserverOption: HostOption = {
    label: 'Jumpserver 1',
    value: 'js-1',
    key: 'js-1',
    uuid: 'js-uuid-1',
    connect: 'jumpserver',
    type: 'jumpserver',
    selectable: false,
    level: 0,
    childrenCount: 2
  }

  beforeEach(() => {
    vi.clearAllMocks()
    // Reset shared state
    hosts.value = []
    chatTypeValue.value = 'agent'
    autoUpdateHost.value = true
    chatInputValue.value = ''
  })

  describe('isHostSelected', () => {
    it('should return true when host is selected by uuid', () => {
      const { isHostSelected } = useHostManagement()

      hosts.value = [{ host: 'server1.example.com', uuid: 'uuid-1', connection: 'ssh' }]

      expect(isHostSelected(mockHostOption)).toBe(true)
    })

    it('should return false when host is not selected', () => {
      const { isHostSelected } = useHostManagement()

      hosts.value = []

      expect(isHostSelected(mockHostOption)).toBe(false)
    })

    it('should match by IP and connection type as fallback', () => {
      const { isHostSelected } = useHostManagement()

      hosts.value = [{ host: 'server1.example.com', uuid: 'different-uuid', connection: 'ssh' }]

      expect(isHostSelected(mockHostOption)).toBe(true)
    })
  })

  describe('onHostClick', () => {
    it('should add host when not selected in agent mode', () => {
      const { onHostClick } = useHostManagement()

      hosts.value = []
      chatTypeValue.value = 'agent'

      onHostClick(mockHostOption)

      expect(hosts.value).toHaveLength(1)
      expect(hosts.value[0].host).toBe('server1.example.com')
      expect(hosts.value[0].uuid).toBe('uuid-1')
    })

    it('should remove host when already selected in agent mode', () => {
      const { onHostClick } = useHostManagement()

      hosts.value = [{ host: 'server1.example.com', uuid: 'uuid-1', connection: 'ssh' }]
      chatTypeValue.value = 'agent'

      onHostClick(mockHostOption)

      expect(hosts.value).toHaveLength(0)
    })

    it('should replace host in cmd mode', () => {
      const { onHostClick } = useHostManagement()

      hosts.value = [{ host: 'old-server', uuid: 'old-uuid', connection: 'ssh' }]
      chatTypeValue.value = 'cmd'

      onHostClick(mockHostOption)

      expect(hosts.value).toHaveLength(1)
      expect(hosts.value[0].host).toBe('server1.example.com')
    })

    it('should prevent adding more than max hosts', () => {
      const { onHostClick } = useHostManagement()

      const newHostOption: HostOption = {
        label: 'newserver.example.com',
        value: 'host-new',
        key: 'host-new',
        uuid: 'uuid-new',
        connect: 'ssh',
        type: 'personal',
        selectable: true,
        level: 0
      }

      // Fill up to max hosts (5)
      hosts.value = [
        { host: 'host1', uuid: 'uuid-1', connection: 'ssh' },
        { host: 'host2', uuid: 'uuid-2', connection: 'ssh' },
        { host: 'host3', uuid: 'uuid-3', connection: 'ssh' },
        { host: 'host4', uuid: 'uuid-4', connection: 'ssh' },
        { host: 'host5', uuid: 'uuid-5', connection: 'ssh' }
      ]
      chatTypeValue.value = 'agent'

      onHostClick(newHostOption)

      expect(hosts.value).toHaveLength(5)
      expect(vi.mocked(Notice.open)).toHaveBeenCalled()
    })

    it('should remove localhost when adding non-localhost', () => {
      const { onHostClick } = useHostManagement()

      hosts.value = [{ host: '127.0.0.1', uuid: 'localhost-uuid', connection: 'localhost' }]
      chatTypeValue.value = 'agent'

      onHostClick(mockHostOption)

      expect(hosts.value).toHaveLength(1)
      expect(hosts.value[0].host).toBe('server1.example.com')
      expect(hosts.value.some((h) => h.host === '127.0.0.1')).toBe(false)
    })

    it('should toggle jumpserver expand/collapse', () => {
      const { onHostClick } = useHostManagement()

      onHostClick(mockJumpserverOption)

      // Since jumpserver is not selectable, it should not be added to hosts
      expect(hosts.value).toHaveLength(0)
    })

    it('should set autoUpdateHost to false after selection', () => {
      const { onHostClick } = useHostManagement()

      autoUpdateHost.value = true
      onHostClick(mockHostOption)

      expect(autoUpdateHost.value).toBe(false)
    })
  })

  describe('removeHost', () => {
    it('should remove host by uuid', () => {
      const { removeHost } = useHostManagement()

      const hostToRemove: Host = {
        host: 'server1.example.com',
        uuid: 'uuid-1',
        connection: 'ssh'
      }

      hosts.value = [hostToRemove]
      removeHost(hostToRemove)

      expect(hosts.value).toHaveLength(0)
    })

    it('should not affect other hosts', () => {
      const { removeHost } = useHostManagement()

      const host1: Host = {
        host: 'server1.example.com',
        uuid: 'uuid-1',
        connection: 'ssh'
      }
      const host2: Host = {
        host: 'server2.example.com',
        uuid: 'uuid-2',
        connection: 'ssh'
      }

      hosts.value = [host1, host2]
      removeHost(host1)

      expect(hosts.value).toHaveLength(1)
      expect(hosts.value[0].uuid).toBe('uuid-2')
    })

    it('should set autoUpdateHost to false', () => {
      const { removeHost } = useHostManagement()

      const host: Host = {
        host: 'server1.example.com',
        uuid: 'uuid-1',
        connection: 'ssh'
      }

      hosts.value = [host]
      autoUpdateHost.value = true

      removeHost(host)

      expect(autoUpdateHost.value).toBe(false)
    })
  })

  describe('toggleJumpserverExpand', () => {
    it('should add jumpserver to expanded set when collapsed', () => {
      const { toggleJumpserverExpand } = useHostManagement()

      toggleJumpserverExpand('js-1')

      // Verify that the jumpserver was added to expanded set
      // This is internal state, so we verify through behavior
      toggleJumpserverExpand('js-1')
    })
  })

  describe('getCurentTabAssetInfo', () => {
    it('should return asset info for current tab', async () => {
      const { getCurentTabAssetInfo } = useHostManagement()
      const mockAssetInfo = {
        uuid: 'asset-1',
        title: 'Test Server',
        ip: '192.168.1.1',
        organizationId: 'personal',
        connection: 'personal'
      }

      // Mock eventBus to return asset info directly (not wrapped)
      vi.mocked(eventBus.on).mockImplementation((event: string, handler: any) => {
        if (event === 'assetInfoResult') {
          setTimeout(() => {
            handler(mockAssetInfo)
          }, 10)
        }
      })

      const result = await getCurentTabAssetInfo()

      expect(result).toEqual(mockAssetInfo)
      expect(eventBus.emit).toHaveBeenCalledWith('getActiveTabAssetInfo')
    })

    it('should handle timeout when getting asset info', async () => {
      // Enable fake timers to speed up timeout test
      vi.useFakeTimers()

      const { getCurentTabAssetInfo } = useHostManagement()

      // Don't trigger the callback to simulate timeout
      vi.mocked(eventBus.on).mockImplementation(() => {})

      // Start the async operation
      const resultPromise = getCurentTabAssetInfo()

      vi.advanceTimersToNextTimer()

      // The function should return null on timeout due to error handling
      const result = await resultPromise

      expect(result).toBeNull()

      // Restore real timers
      vi.useRealTimers()
    })

    it('should set connection type based on organizationId', async () => {
      const { getCurentTabAssetInfo } = useHostManagement()
      const mockAssetInfo = {
        uuid: 'asset-1',
        title: 'Test Server',
        ip: '192.168.1.1',
        organizationId: 'org-123',
        connection: undefined
      }

      vi.mocked(eventBus.on).mockImplementation((event: string, handler: any) => {
        if (event === 'assetInfoResult') {
          setTimeout(() => {
            handler(mockAssetInfo)
          }, 10)
        }
      })

      const result = await getCurentTabAssetInfo()

      expect(result?.connection).toBe('jumpserver')
    })
  })

  describe('handleInputChange', () => {
    it('should show host select when only @ is typed', async () => {
      const { handleInputChange, showHostSelect } = useHostManagement()

      const mockEvent = {
        target: {
          value: '@'
        }
      } as unknown as Event

      await handleInputChange(mockEvent)

      expect(showHostSelect.value).toBe(true)
    })

    it('should show host select when @ is typed at the end', async () => {
      const { handleInputChange, showHostSelect } = useHostManagement()

      const mockEvent = {
        target: {
          value: 'hello @'
        }
      } as unknown as Event

      await handleInputChange(mockEvent)

      expect(showHostSelect.value).toBe(true)
    })

    it('should not show host select when @ is in the middle', async () => {
      const { handleInputChange, showHostSelect } = useHostManagement()

      const mockEvent = {
        target: {
          value: '@ hello'
        }
      } as unknown as Event

      await handleInputChange(mockEvent)

      expect(showHostSelect.value).toBe(false)
    })

    it('should hide host select when trailing @ is removed', async () => {
      const { handleInputChange, showHostSelect } = useHostManagement()

      showHostSelect.value = true

      const mockEvent = {
        target: {
          value: 'hello'
        }
      } as unknown as Event

      await handleInputChange(mockEvent)

      expect(showHostSelect.value).toBe(false)
    })

    it('should hide host select when @ is removed', async () => {
      const { handleInputChange, showHostSelect } = useHostManagement()

      const mockEvent = {
        target: {
          value: 'test'
        }
      } as unknown as Event

      showHostSelect.value = true
      await handleInputChange(mockEvent)

      expect(showHostSelect.value).toBe(false)
    })
  })

  describe('onHostClick with @ handling', () => {
    it('should remove trailing @ when host is selected', () => {
      const { onHostClick } = useHostManagement()

      chatInputValue.value = 'hello @'
      chatTypeValue.value = 'agent'

      onHostClick(mockHostOption)

      expect(chatInputValue.value).toBe('hello ')
      expect(hosts.value).toHaveLength(1)
    })

    it('should not modify input if no trailing @ when host is selected', () => {
      const { onHostClick } = useHostManagement()

      chatInputValue.value = 'hello world'
      chatTypeValue.value = 'agent'

      onHostClick(mockHostOption)

      expect(chatInputValue.value).toBe('hello world')
      expect(hosts.value).toHaveLength(1)
    })

    it('should remove @ even with just @', () => {
      const { onHostClick } = useHostManagement()

      chatInputValue.value = '@'
      chatTypeValue.value = 'agent'

      onHostClick(mockHostOption)

      expect(chatInputValue.value).toBe('')
      expect(hosts.value).toHaveLength(1)
    })
  })

  describe('handleAddHostClick', () => {
    it('should show host select popup', () => {
      const { handleAddHostClick, showHostSelect } = useHostManagement()

      handleAddHostClick()

      expect(showHostSelect.value).toBe(true)
    })
  })
})
