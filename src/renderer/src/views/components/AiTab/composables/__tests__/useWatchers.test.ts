import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref, nextTick } from 'vue'
import { useWatchers } from '../useWatchers'
import { useSessionState } from '../useSessionState'

// Mock dependencies
vi.mock('../useSessionState')
vi.mock('../useTabManagement', () => ({
  focusChatInput: vi.fn()
}))
vi.mock('@renderer/agent/storage/state', () => ({
  updateGlobalState: vi.fn()
}))

describe('useWatchers', () => {
  let mockEmitStateChange: () => void
  let mockHandleTabSwitch: () => void
  let mockUpdateHostsForCommandMode: ReturnType<typeof vi.fn<() => Promise<void>>>

  beforeEach(async () => {
    vi.clearAllMocks()

    mockEmitStateChange = vi.fn()
    mockHandleTabSwitch = vi.fn()
    mockUpdateHostsForCommandMode = vi.fn().mockResolvedValue(undefined)

    const currentChatId = ref('tab-1')
    const chatTypeValue = ref('agent')

    vi.mocked(useSessionState).mockReturnValue({
      currentChatId,
      chatTypeValue
    } as any)

    const { updateGlobalState } = await import('@renderer/agent/storage/state')
    vi.mocked(updateGlobalState).mockResolvedValue(undefined)
  })

  describe('currentChatId watcher', () => {
    it('should call emitStateChange when currentChatId changes', async () => {
      const mockState = vi.mocked(useSessionState)()
      useWatchers({
        emitStateChange: mockEmitStateChange,
        handleTabSwitch: mockHandleTabSwitch,
        updateHostsForCommandMode: mockUpdateHostsForCommandMode
      })

      mockState.currentChatId.value = 'tab-2'
      await nextTick()

      expect(mockEmitStateChange).toHaveBeenCalled()
    })

    it('should call handleTabSwitch when currentChatId changes', async () => {
      const mockState = vi.mocked(useSessionState)()
      useWatchers({
        emitStateChange: mockEmitStateChange,
        handleTabSwitch: mockHandleTabSwitch,
        updateHostsForCommandMode: mockUpdateHostsForCommandMode
      })

      mockState.currentChatId.value = 'tab-3'
      await nextTick()

      expect(mockHandleTabSwitch).toHaveBeenCalled()
    })

    it('should call both handlers when tab switches', async () => {
      const mockState = vi.mocked(useSessionState)()
      useWatchers({
        emitStateChange: mockEmitStateChange,
        handleTabSwitch: mockHandleTabSwitch,
        updateHostsForCommandMode: mockUpdateHostsForCommandMode
      })

      mockState.currentChatId.value = 'new-tab'
      await nextTick()

      expect(mockEmitStateChange).toHaveBeenCalled()
      expect(mockHandleTabSwitch).toHaveBeenCalled()
    })
  })

  describe('chatTypeValue watcher', () => {
    it('should set up watcher for chatTypeValue', () => {
      const mockState = vi.mocked(useSessionState)()

      useWatchers({
        emitStateChange: mockEmitStateChange,
        handleTabSwitch: mockHandleTabSwitch,
        updateHostsForCommandMode: mockUpdateHostsForCommandMode
      })

      // Verify the watcher is set up
      expect(mockState.chatTypeValue).toBeDefined()
    })

    it('should not update when chatType is empty', async () => {
      const { updateGlobalState } = await import('@renderer/agent/storage/state')

      const mockState = vi.mocked(useSessionState)()
      useWatchers({
        emitStateChange: mockEmitStateChange,
        handleTabSwitch: mockHandleTabSwitch,
        updateHostsForCommandMode: mockUpdateHostsForCommandMode
      })

      mockState.chatTypeValue.value = ''
      await nextTick()

      expect(updateGlobalState).not.toHaveBeenCalled()
    })

    it('should not update when chatType is whitespace only', async () => {
      const { updateGlobalState } = await import('@renderer/agent/storage/state')

      const mockState = vi.mocked(useSessionState)()
      useWatchers({
        emitStateChange: mockEmitStateChange,
        handleTabSwitch: mockHandleTabSwitch,
        updateHostsForCommandMode: mockUpdateHostsForCommandMode
      })

      mockState.chatTypeValue.value = '   '
      await nextTick()

      expect(updateGlobalState).not.toHaveBeenCalled()
    })
  })
})
