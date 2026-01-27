import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock markdownRenderer to prevent monaco-editor from loading in jsdom
vi.mock('../../components/format/markdownRenderer.vue', () => ({ default: {} }))

import { ref } from 'vue'

vi.mock('vue', async (importOriginal) => {
  const actual = await importOriginal<typeof import('vue')>()
  return {
    ...actual,
    onMounted: vi.fn((cb) => cb()),
    onUnmounted: vi.fn()
  }
})
import { useContext } from '../useContext'
import { useHostState } from '../useHostState'
import type { Host, HostOption } from '../../types'
import type { ContentPart, ContextDocRef } from '@shared/WebviewMessage'
import eventBus from '@/utils/eventBus'
import { Notice } from '@/views/components/Notice/index'

// Create shared refs for state
const hosts = ref<Host[]>([])
const chatTypeValue = ref('agent')
const autoUpdateHost = ref(true)
const chatInputParts = ref<ContentPart[]>([])
const currentChatId = ref('test-tab-id')

// Mock dependencies
vi.mock('../useSessionState', () => ({
  useSessionState: () => ({
    hosts,
    chatTypeValue,
    autoUpdateHost,
    chatInputParts,
    currentChatId
  })
}))

vi.mock('../useTabManagement', () => ({
  focusChatInput: vi.fn()
}))

vi.mock('@/locales', () => ({
  default: {
    global: {
      t: (key: string, params?: Record<string, unknown>) => {
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

describe('useContext', () => {
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
    type: 'bastion',
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
    chatInputParts.value = []
    // Mock KB APIs used by docs navigation
    window.api = {
      ...(window.api || {}),
      kbGetRoot: vi.fn().mockResolvedValue({ root: '/kb' }),
      kbListDir: vi.fn().mockResolvedValue([])
    }
  })

  describe('isHostSelected', () => {
    it('should return true when host is selected by uuid', () => {
      const { isHostSelected } = useContext()

      hosts.value = [{ host: 'server1.example.com', uuid: 'uuid-1', connection: 'ssh' }]

      expect(isHostSelected(mockHostOption)).toBe(true)
    })

    it('should return false when host is not selected', () => {
      const { isHostSelected } = useContext()

      hosts.value = []

      expect(isHostSelected(mockHostOption)).toBe(false)
    })

    it('should match by IP and connection type as fallback', () => {
      const { isHostSelected } = useContext()

      hosts.value = [{ host: 'server1.example.com', uuid: 'different-uuid', connection: 'ssh' }]

      expect(isHostSelected(mockHostOption)).toBe(true)
    })
  })

  describe('onHostClick', () => {
    it('should add host when not selected in agent mode', () => {
      const { onHostClick } = useContext()

      hosts.value = []
      chatTypeValue.value = 'agent'

      onHostClick(mockHostOption)

      expect(hosts.value).toHaveLength(1)
      expect(hosts.value[0].host).toBe('server1.example.com')
      expect(hosts.value[0].uuid).toBe('uuid-1')
    })

    it('should remove host when already selected in agent mode', () => {
      const { onHostClick } = useContext()

      hosts.value = [{ host: 'server1.example.com', uuid: 'uuid-1', connection: 'ssh' }]
      chatTypeValue.value = 'agent'

      onHostClick(mockHostOption)

      expect(hosts.value).toHaveLength(0)
    })

    it('should replace host in cmd mode', () => {
      const { onHostClick } = useContext()

      hosts.value = [{ host: 'old-server', uuid: 'old-uuid', connection: 'ssh' }]
      chatTypeValue.value = 'cmd'

      onHostClick(mockHostOption)

      expect(hosts.value).toHaveLength(1)
      expect(hosts.value[0].host).toBe('server1.example.com')
    })

    it('should prevent adding more than max hosts', () => {
      const { onHostClick } = useContext()

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
      const { onHostClick } = useContext()

      hosts.value = [{ host: '127.0.0.1', uuid: 'localhost-uuid', connection: 'localhost' }]
      chatTypeValue.value = 'agent'

      onHostClick(mockHostOption)

      expect(hosts.value).toHaveLength(1)
      expect(hosts.value[0].host).toBe('server1.example.com')
      expect(hosts.value.some((h) => h.host === '127.0.0.1')).toBe(false)
    })

    it('should toggle jumpserver expand/collapse', () => {
      const { onHostClick } = useContext()

      onHostClick(mockJumpserverOption)

      // Since jumpserver is not selectable, it should not be added to hosts
      expect(hosts.value).toHaveLength(0)
    })

    it('should set autoUpdateHost to false after selection', () => {
      const { onHostClick } = useContext()

      autoUpdateHost.value = true
      onHostClick(mockHostOption)

      expect(autoUpdateHost.value).toBe(false)
    })

    it('should switch to cmd mode when selecting switch host in agent mode', async () => {
      const { Notice } = await import('@/views/components/Notice')
      const { onHostClick } = useContext()

      const switchHostOption: HostOption = {
        label: 'switch-1',
        value: 'switch-1',
        key: 'switch-1',
        uuid: 'switch-uuid-1',
        connect: 'ssh',
        type: 'personal',
        selectable: true,
        level: 0,
        assetType: 'person-switch-cisco'
      }

      chatTypeValue.value = 'agent'

      onHostClick(switchHostOption)

      expect(chatTypeValue.value).toBe('cmd')
      expect(hosts.value).toHaveLength(1)
      expect(hosts.value[0].assetType).toBe('person-switch-cisco')
      expect(vi.mocked(Notice.open)).toHaveBeenCalledWith(
        expect.objectContaining({
          description: 'ai.switchNotSupportAgent'
        })
      )
    })
  })

  describe('openDocFromChip', () => {
    it('should emit openUserTab with relPath resolved from absPath', async () => {
      const { openDocFromChip } = useContext()
      const docRef: ContextDocRef = {
        absPath: '/kb/docs/readme.md',
        name: 'readme.md',
        type: 'file'
      }

      await openDocFromChip(docRef)

      expect(vi.mocked(eventBus.emit)).toHaveBeenCalledWith(
        'openUserTab',
        expect.objectContaining({
          key: 'KnowledgeCenterEditor',
          props: { relPath: 'docs/readme.md' }
        })
      )
    })
  })

  describe('removeHost', () => {
    it('should remove host by uuid', () => {
      const { removeHost } = useContext()

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
      const { removeHost } = useContext()

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
      const { removeHost } = useContext()

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
      const { toggleJumpserverExpand } = useContext()

      toggleJumpserverExpand('js-1')

      // Verify that the jumpserver was added to expanded set
      // This is internal state, so we verify through behavior
      toggleJumpserverExpand('js-1')
    })
  })

  describe('getCurentTabAssetInfo', () => {
    it('should return asset info for current tab', async () => {
      const { getCurentTabAssetInfo } = useHostState()
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

      const { getCurentTabAssetInfo } = useHostState()

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
      const { getCurentTabAssetInfo } = useHostState()
      const mockAssetInfo = {
        uuid: 'asset-1',
        title: 'Test Server',
        ip: '192.168.1.1',
        organizationId: 'org-123',
        assetType: 'organization',
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

  describe('onHostClick with @ handling', () => {
    it('should remove trailing @ when host is selected', () => {
      const { onHostClick } = useContext()

      chatInputParts.value = [{ type: 'text', text: 'hello @' }]
      chatTypeValue.value = 'agent'

      onHostClick(mockHostOption)

      expect(chatInputParts.value).toEqual([{ type: 'text', text: 'hello ' }])
      expect(hosts.value).toHaveLength(1)
    })

    it('should not modify input if no trailing @ when host is selected', () => {
      const { onHostClick } = useContext()

      chatInputParts.value = [{ type: 'text', text: 'hello world' }]
      chatTypeValue.value = 'agent'

      onHostClick(mockHostOption)

      expect(chatInputParts.value).toEqual([{ type: 'text', text: 'hello world' }])
      expect(hosts.value).toHaveLength(1)
    })

    it('should remove @ even with just @', () => {
      const { onHostClick } = useContext()

      chatInputParts.value = [{ type: 'text', text: '@' }]
      chatTypeValue.value = 'agent'

      onHostClick(mockHostOption)

      expect(chatInputParts.value).toEqual([])
      expect(hosts.value).toHaveLength(1)
    })
  })

  describe('handleAddContextClick', () => {
    it('should show host select popup', () => {
      const { handleAddContextClick, showContextPopup } = useContext()

      handleAddContextClick()

      expect(showContextPopup.value).toBe(true)
    })
  })

  describe('docs navigation', () => {
    it('should enter directory instead of selecting it', async () => {
      const { fetchDocsOptions, onDocClick, docsOptions } = useContext()

      vi.mocked(window.api.kbListDir).mockResolvedValueOnce([{ name: 'dirA', relPath: 'dirA', type: 'dir' }])
      await fetchDocsOptions('')

      vi.mocked(window.api.kbListDir).mockResolvedValueOnce([{ name: 'fileA.md', relPath: 'dirA/fileA.md', type: 'file' }])
      await onDocClick(docsOptions.value[0])

      expect(window.api.kbListDir).toHaveBeenLastCalledWith('dirA')
      expect(docsOptions.value[0].name).toBe('fileA.md')
      expect(docsOptions.value[0].type).toBe('file')
    })

    it('should go back to parent directory', async () => {
      const { goToLevel2, onDocClick, goBack, docsOptions } = useContext()

      vi.mocked(window.api.kbListDir).mockResolvedValueOnce([{ name: 'dirA', relPath: 'dirA', type: 'dir' }])
      await goToLevel2('docs')

      vi.mocked(window.api.kbListDir).mockResolvedValueOnce([{ name: 'fileA.md', relPath: 'dirA/fileA.md', type: 'file' }])
      await onDocClick(docsOptions.value[0])

      vi.mocked(window.api.kbListDir).mockResolvedValueOnce([
        { name: 'dirA', relPath: 'dirA', type: 'dir' },
        { name: 'dirB', relPath: 'dirB', type: 'dir' }
      ])
      await goBack()

      expect(window.api.kbListDir).toHaveBeenLastCalledWith('')
      expect(docsOptions.value).toHaveLength(2)
    })
  })

  describe('kb add doc to chat', () => {
    it('should insert doc chip when kbAddDocToChat emitted with single doc array', async () => {
      const handlers = new Map<string, (payload: any) => Promise<void> | void>()
      vi.mocked(eventBus.on).mockImplementation((event: string, handler: any) => {
        handlers.set(event, handler)
      })

      const focusInput = vi.fn()
      const { setChipInsertHandler } = useContext({ focusInput })
      const handler = vi.fn()
      setChipInsertHandler(handler)

      const eventHandler = handlers.get('kbAddDocToChat')
      await eventHandler?.([{ relPath: 'docs/guide.md', name: 'guide.md' }])

      expect(window.api.kbGetRoot).toHaveBeenCalled()
      expect(handler).toHaveBeenCalledWith('doc', { absPath: '/kb/docs/guide.md', name: 'guide.md', type: 'file' }, 'guide.md')
      expect(focusInput).toHaveBeenCalled()
    })

    it('should insert multiple doc chips when kbAddDocToChat emitted with array', async () => {
      const handlers = new Map<string, (payload: any) => Promise<void> | void>()
      vi.mocked(eventBus.on).mockImplementation((event: string, handler: any) => {
        handlers.set(event, handler)
      })

      const focusInput = vi.fn()
      const { setChipInsertHandler } = useContext({ focusInput })
      const handler = vi.fn()
      setChipInsertHandler(handler)

      const eventHandler = handlers.get('kbAddDocToChat')
      await eventHandler?.([
        { relPath: 'docs/guide.md', name: 'guide.md' },
        { relPath: 'docs/api.md', name: 'api.md' }
      ])

      expect(handler).toHaveBeenCalledTimes(2)
      expect(handler).toHaveBeenCalledWith('doc', { absPath: '/kb/docs/guide.md', name: 'guide.md', type: 'file' }, 'guide.md')
      expect(handler).toHaveBeenCalledWith('doc', { absPath: '/kb/docs/api.md', name: 'api.md', type: 'file' }, 'api.md')
      expect(focusInput).toHaveBeenCalledTimes(1)
    })
  })

  describe('duplicate selections', () => {
    it('should not insert duplicate doc and should close popup', async () => {
      const { handleAddContextClick, onDocClick, setChipInsertHandler, showContextPopup } = useContext()
      const handler = vi.fn()
      setChipInsertHandler(handler)

      const doc = { name: 'Doc A', absPath: '/kb/doc-a.md', type: 'file' } as const
      chatInputParts.value = [{ type: 'chip', chipType: 'doc', ref: { absPath: doc.absPath, name: doc.name, type: doc.type } }]

      handleAddContextClick()
      expect(showContextPopup.value).toBe(true)

      await onDocClick(doc)

      expect(handler).not.toHaveBeenCalled()
      expect(showContextPopup.value).toBe(false)
    })

    it('should not insert duplicate chat and should close popup', async () => {
      const { handleAddContextClick, onChatClick, setChipInsertHandler, showContextPopup } = useContext()
      const handler = vi.fn()
      setChipInsertHandler(handler)

      const chat = { id: 'chat-1', title: 'Chat 1', ts: 0 } as const
      chatInputParts.value = [{ type: 'chip', chipType: 'chat', ref: { taskId: chat.id, title: chat.title } }]

      handleAddContextClick()
      expect(showContextPopup.value).toBe(true)

      await onChatClick(chat)

      expect(handler).not.toHaveBeenCalled()
      expect(showContextPopup.value).toBe(false)
    })
  })
})
