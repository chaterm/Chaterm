import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'
import { useChatMessages } from '../useChatMessages'
import { useSessionState } from '../useSessionState'
import type { ChatMessage, Host } from '../../types'
import type { Todo } from '@/types/todo'

// Mock shared deps the same way useChatMessages.test.ts does.
vi.mock('../useSessionState')
vi.mock('@/utils/eventBus', () => ({
  default: {
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn()
  }
}))
vi.mock('@/store/currentCwdStore', () => ({
  useCurrentCwdStore: vi.fn(() => ({
    keyValueMap: {}
  }))
}))
vi.mock('@renderer/agent/storage/state', () => ({
  getGlobalState: vi.fn(),
  updateGlobalState: vi.fn()
}))
vi.mock('@/locales', () => ({
  default: {
    global: {
      t: (key: string) => key
    }
  }
}))
vi.mock('ant-design-vue', () => ({
  notification: {
    error: vi.fn(),
    success: vi.fn(),
    warning: vi.fn()
  }
}))
vi.mock('@/views/components/Notice', () => ({
  Notice: {
    open: vi.fn()
  }
}))

const mockSendToMain = vi.fn()
global.window = {
  api: {
    sendToMain: mockSendToMain,
    onMainMessage: vi.fn(),
    getLocalWorkingDirectory: vi.fn(),
    kbCreateFile: vi.fn(),
    kbWriteFile: vi.fn()
  }
} as any

// Shared test scaffolding — one tab with an empty session so the next send
// follows the `newTask` branch, which is where Stage 1 stamps workspace.
function setupEmptyTab() {
  const session = {
    chatHistory: [] as ChatMessage[],
    lastChatMessageId: '',
    responseLoading: false,
    showRetryButton: false,
    showSendButton: true,
    buttonsDisabled: false,
    isExecutingCommand: false,
    lastStreamMessage: null,
    lastPartialMessage: null,
    lastStateChatermMessages: null,
    shouldStickToBottom: true,
    isCancelled: false
  }
  const tab = {
    id: 'tab-db-1',
    title: 'Test',
    hosts: [] as Host[],
    chatType: 'agent' as const,
    autoUpdateHost: true,
    session,
    inputValue: '',
    modelValue: ''
  }
  const chatTabs = ref([tab])
  const currentChatId = ref('tab-db-1')
  const hosts = ref<Host[]>([])
  const chatTypeValue = ref('agent')

  vi.mocked(useSessionState).mockReturnValue({
    chatTabs,
    currentChatId,
    currentTab: ref(tab),
    currentSession: ref(session),
    chatInputParts: ref([]),
    hosts,
    chatTypeValue,
    messageFeedbacks: ref<Record<string, 'like' | 'dislike'>>({})
  } as any)

  return { tab, session }
}

const mockCheckModelConfig = vi.fn().mockResolvedValue({ success: true })
const noop = () => {}
const noop2 = () => {}
const noopTodos = () => {}

function makeInstance(workspaceContext?: Parameters<typeof useChatMessages>[5]): ReturnType<typeof useChatMessages> {
  return useChatMessages(noop, noop2, noopTodos as (m: ChatMessage[], t: Todo[]) => void, ref([]), mockCheckModelConfig, workspaceContext)
}

describe('useChatMessages — workspace stamping', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSendToMain.mockResolvedValue({ success: true })
  })

  describe("workspace='terminal' (default)", () => {
    it('does NOT stamp workspace/dbContext on newTask — byte-identical to pre-#18', async () => {
      setupEmptyTab()
      const { sendMessageWithContent } = makeInstance()

      await sendMessageWithContent('hello', 'chatSend')

      expect(mockSendToMain).toHaveBeenCalledTimes(1)
      const payload = mockSendToMain.mock.calls[0][0]
      expect(payload.type).toBe('newTask')
      expect(payload).not.toHaveProperty('workspace')
      expect(payload).not.toHaveProperty('dbContext')
    })

    it('explicit workspace=terminal behaves identically', async () => {
      setupEmptyTab()
      const { sendMessageWithContent } = makeInstance({ workspace: 'terminal' })

      await sendMessageWithContent('hello', 'chatSend')

      const payload = mockSendToMain.mock.calls[0][0]
      expect(payload).not.toHaveProperty('workspace')
      expect(payload).not.toHaveProperty('dbContext')
    })
  })

  describe("workspace='database'", () => {
    it('stamps workspace=database on newTask even when dbContext is undefined', async () => {
      setupEmptyTab()
      const { sendMessageWithContent } = makeInstance({ workspace: 'database' })

      await sendMessageWithContent('run explain for orders', 'chatSend')

      const payload = mockSendToMain.mock.calls[0][0]
      expect(payload.workspace).toBe('database')
      expect(payload).not.toHaveProperty('dbContext')
    })

    it('stamps both workspace and dbContext when provided', async () => {
      setupEmptyTab()
      const dbContext = vi.fn(() => ({
        assetId: 'asset-42',
        dbType: 'postgresql' as const,
        databaseName: 'prod',
        schemaName: 'public',
        assetName: 'pg-prod'
      }))
      const { sendMessageWithContent } = makeInstance({ workspace: 'database', dbContext })

      await sendMessageWithContent('Why is the index unused?', 'chatSend')

      const payload = mockSendToMain.mock.calls[0][0]
      expect(payload.workspace).toBe('database')
      expect(payload.dbContext).toEqual({
        assetId: 'asset-42',
        dbType: 'postgresql',
        databaseName: 'prod',
        schemaName: 'public',
        assetName: 'pg-prod'
      })
      // dbContext getter is called at send-time, not at instance creation,
      // so it reflects the currently-focused Database tab.
      expect(dbContext).toHaveBeenCalledTimes(1)
    })

    it('re-reads dbContext on each send (no stale closure)', async () => {
      setupEmptyTab()
      let current = {
        assetId: 'asset-1',
        dbType: 'mysql' as const
      }
      const { sendMessageWithContent } = makeInstance({
        workspace: 'database',
        dbContext: () => current
      })

      await sendMessageWithContent('first question', 'chatSend')
      expect(mockSendToMain.mock.calls[0][0].dbContext.assetId).toBe('asset-1')

      // Simulate the user switching to a different DB tab between sends.
      current = { assetId: 'asset-2', dbType: 'mysql' as const }
      await sendMessageWithContent('second question', 'chatSend')
      expect(mockSendToMain.mock.calls[1][0].dbContext.assetId).toBe('asset-2')
    })

    it('omits dbContext field when the getter returns null', async () => {
      setupEmptyTab()
      const { sendMessageWithContent } = makeInstance({
        workspace: 'database',
        dbContext: () => null
      })

      await sendMessageWithContent('ask', 'chatSend')
      const payload = mockSendToMain.mock.calls[0][0]
      expect(payload.workspace).toBe('database')
      expect(payload).not.toHaveProperty('dbContext')
    })
  })
})
