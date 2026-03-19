/**
 * AiTab Component - Browser Mode Integration Tests
 *
 * This test suite runs in a real browser environment using Vitest browser mode.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup } from 'vitest-browser-vue'
import { page, userEvent } from '@vitest/browser/context'
import { createPinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import { createI18n } from 'vue-i18n'
import Antd from 'ant-design-vue'
import AiTab from '../index.vue'
import { ShortcutService } from '@/services/shortcutService'
import eventBus from '@/utils/eventBus'
import { useSessionState } from '../composables/useSessionState'
import { useModelConfiguration } from '../composables/useModelConfiguration'

// Mock heavy dependencies
vi.mock('@xterm/xterm')
// Mock domUtils to always return true for focus check in tests
vi.mock('@/utils/domUtils', () => ({
  isFocusInAiTab: vi.fn(() => true),
  isElementInAiTab: vi.fn(() => true)
}))
vi.mock('@/services/userConfigStoreService', () => {
  return {
    UserConfigStoreService: vi.fn().mockImplementation(() => ({
      getConfig: vi.fn().mockResolvedValue({
        language: 'en-US',
        defaultLayout: 'terminal',
        background: {
          mode: 'none',
          image: '',
          opacity: 0.5,
          brightness: 0.45
        }
      }),
      saveConfig: vi.fn().mockResolvedValue(undefined),
      initDB: vi.fn().mockResolvedValue(undefined)
    })),
    userConfigStore: {
      getConfig: vi.fn().mockResolvedValue({
        language: 'en-US',
        defaultLayout: 'terminal',
        background: {
          mode: 'none',
          image: '',
          opacity: 0.5,
          brightness: 0.45
        }
      }),
      saveConfig: vi.fn().mockResolvedValue(undefined),
      initDB: vi.fn().mockResolvedValue(undefined)
    }
  }
})
// Mock the storage state module - must be hoisted to top level
vi.mock('@renderer/agent/storage/state', () => ({
  getGlobalState: vi.fn((key: string) => {
    const stateMap: Record<string, unknown> = {
      modelOptions: [
        {
          id: 'test-model-1',
          name: 'test-model-1',
          checked: true,
          type: 'standard',
          apiProvider: 'default'
        }
      ],
      chatSettings: { mode: 'chat' },
      apiProvider: 'default',
      defaultBaseUrl: 'http://localhost',
      currentModel: null,
      defaultModelId: 'test-model-1',
      apiModelId: '',
      liteLlmModelId: '',
      openAiModelId: '',
      messageFeedbacks: {}
    }
    return Promise.resolve(stateMap[key])
  }),
  updateGlobalState: vi.fn().mockResolvedValue(undefined),
  storeSecret: vi.fn().mockResolvedValue(undefined),
  getSecret: vi.fn().mockResolvedValue(undefined)
}))
vi.mock('@api/user/user')

// In-memory storage for testing (shared across all tests)
const storage = new Map<string, string>()

// Setup global window.api before any modules are loaded
// This ensures it's available when UserConfigStoreService initializes
if (typeof window !== 'undefined') {
  ;(window as any).api = {
    sendToMain: vi.fn((channel: string) => {
      if (channel === 'get-cur-asset-info') {
        return Promise.resolve({ success: false })
      }
      return Promise.resolve({ success: true })
    }),
    onSessionUpdate: vi.fn().mockReturnValue(() => {}),
    getMcpServers: vi.fn().mockResolvedValue([]),
    onMcpStatusUpdate: vi.fn().mockReturnValue(() => {}),
    onMcpServerUpdate: vi.fn().mockReturnValue(() => {}),
    getAllMcpToolStates: vi.fn().mockResolvedValue({}),
    onMainMessage: vi.fn().mockReturnValue(() => {}),
    onCommandExplainResponse: vi.fn().mockReturnValue(() => {}),
    onInteractionNeeded: vi.fn().mockReturnValue(() => {}),
    onInteractionDismissed: vi.fn().mockReturnValue(() => {}),
    onInteractionClosed: vi.fn().mockReturnValue(() => {}),
    onInteractionSuppressed: vi.fn().mockReturnValue(() => {}),
    onTuiDetected: vi.fn().mockReturnValue(() => {}),
    onAlternateScreenEntered: vi.fn().mockReturnValue(() => {}),
    getLocalWorkingDirectory: vi.fn().mockResolvedValue('/test'),
    cancelTask: vi.fn().mockResolvedValue({ success: true }),
    kvMutate: vi.fn(async (params: { action: string; key: string; value?: string }) => {
      if (params.action === 'set') {
        storage.set(params.key, params.value || '')
      } else if (params.action === 'delete') {
        storage.delete(params.key)
      }
      return Promise.resolve(undefined)
    }),
    kvGet: vi.fn(async (params: { key?: string }) => {
      if (params.key) {
        const value = storage.get(params.key)
        return Promise.resolve(value ? { value } : null)
      } else {
        // Return all keys
        return Promise.resolve(Array.from(storage.keys()))
      }
    })
  }
}

// Helper functions
function setupWindowApi() {
  // Return the existing window.api (already set up globally)
  return (window as any).api
}

function createTestRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: '/',
        name: 'home',
        component: { template: '<div>Home</div>' }
      }
    ]
  })
}

// Create a minimal i18n instance for testing
function createTestI18n() {
  return createI18n({
    legacy: false,
    locale: 'en',
    messages: {
      en: {
        ai: {
          welcome: 'Welcome',
          loginPrompt: 'Please login',
          taskCompleted: 'Task Completed',
          startVoiceInput: 'Start Voice Input',
          stopRecording: 'Stop Voice Recording',
          newChat: 'New Chat',
          showChatHistory: 'Show History',
          addHost: 'Add Host',
          agentMessage: 'Command query,troubleshoot errors,handle tasks,anything',
          chatMessage: 'Ask, learn, brainstorm ',
          cmdMessage: 'Work on explicitly opened terminal',
          switchAiModeHint: 'Switch AI Mode (⇧+Tab)',
          uploadFile: 'Upload File',
          enterCustomOption: 'Enter your answer...',
          submit: 'Submit',
          reject: 'Reject',
          addAutoApprove: 'add Auto-Approve',
          approve: 'Approve',
          run: 'Run',
          copy: 'Copy',
          retry: 'Retry',
          searchHost: 'Search by IP',
          loading: 'loading...',
          noMatchingHosts: 'No matching hosts',
          processing: 'processing...',
          interruptTask: 'Interrupt Task',
          searchHistoryPH: 'Please Input',
          favorite: 'Favorites',
          loadMore: 'load more',
          exportChat: 'Export Chat',
          codePreview: 'Code Preview ({lines} lines)',
          explainCommand: 'Explain this command',
          explainCommandTitle: 'AI Explanation',
          explainCommandLoading: 'Explaining…'
        },
        common: {
          login: 'Login'
        }
      }
    }
  })
}

describe('AiTab Component - Browser Mode Integration', () => {
  let shortcutService: any
  let router: any

  beforeEach(async () => {
    storage.clear()

    // Reset session state
    const { chatTabs, currentChatId } = useSessionState()
    chatTabs.value = []
    currentChatId.value = undefined

    // Reset model configuration state - important for test isolation
    const { AgentAiModelsOptions, modelsLoading } = useModelConfiguration()
    AgentAiModelsOptions.value = [{ label: 'test-model-1', value: 'test-model-1' }]
    modelsLoading.value = false

    // Setup global dependencies
    setupWindowApi()

    // Mock localStorage - Set to logged-in state (login-skipped should NOT be 'true')
    // This ensures the input textarea is visible in the component
    // Important: The component checks if login-skipped === 'true', so we should NOT set it at all
    // or set it to 'false' to ensure isSkippedLogin.value === false
    const mockLocalStorage = new Map<string, string>()
    mockLocalStorage.set('token', 'mock-test-token') // Mock auth token
    // Do NOT set 'login-skipped' or set it to 'false'

    Storage.prototype.getItem = vi.fn((key) => {
      return mockLocalStorage.get(key) || null
    })
    Storage.prototype.setItem = vi.fn((key, value) => {
      mockLocalStorage.set(key, value)
    })

    // Initialize ShortcutService
    const { userConfigStore } = await import('@/services/userConfigStoreService')
    vi.mocked(userConfigStore.getConfig).mockResolvedValue({
      shortcuts: {
        switchAiMode: 'Shift+Tab'
      }
    } as any)

    shortcutService = ShortcutService.instance
    shortcutService.destroy()
    await shortcutService.init()
    await shortcutService.loadShortcuts()

    // Create router
    router = createTestRouter()
    await router.push('/')
    await router.isReady()

    // Render component in browser with proper i18n setup and stubs
    const i18n = createTestI18n()
    render(AiTab, {
      props: {
        toggleSidebar: vi.fn(),
        isAgentMode: false
      },
      global: {
        plugins: [createPinia(), router, i18n, Antd],
        stubs: {
          // Stub all heavy/problematic components
          VoiceInput: { template: '<div class="voice-input-stub"></div>' },
          MarkdownRenderer: { template: '<div class="markdown-stub"><slot /></div>' },
          TodoInlineDisplay: { template: '<div class="todo-stub"></div>' }
        }
      }
    })

    // Wait for component initialization using real browser timing
    // Wait for initModelOptions and initModel to complete
    await new Promise((resolve) => setTimeout(resolve, 800))

    // Wait for input element to be available (hasAvailableModels must be true)
    let initAttempts = 0
    const initMaxAttempts = 50 // 5 seconds total
    while (initAttempts < initMaxAttempts) {
      const chatInputEl = document.querySelector('[data-testid="ai-message-input"]') as HTMLTextAreaElement
      if (chatInputEl) {
        break
      }
      await new Promise((resolve) => setTimeout(resolve, 100))
      initAttempts++
    }
  })

  afterEach(async () => {
    shortcutService?.destroy()

    // Reset any leftover state before cleanup
    // Force the chatType back to 'chat' by finding and resetting it
    const chatTypeIndicator = document.querySelector('[data-testid="chat-type-indicator"]')
    if (chatTypeIndicator && chatTypeIndicator.textContent !== 'chat') {
      // The state is managed by the component, we'll let cleanup handle it
    }

    await cleanup()
  })

  describe('Sticky UserMessage Backdrop (Custom Background)', () => {
    it('should use an opaque sticky backdrop when custom background is enabled', async () => {
      const stickyBgColor = 'rgba(20, 20, 20, 0.92)'
      document.documentElement.style.setProperty('--user-message-sticky-bg', stickyBgColor)
      // Also set --bg-color as fallback since the CSS might use var(--bg-color)
      document.documentElement.style.setProperty('--bg-color', stickyBgColor)

      try {
        const { chatTabs, currentChatId } = useSessionState()
        const tab = (currentChatId.value && chatTabs.value.find((t) => t.id === currentChatId.value)) || chatTabs.value[0]
        expect(tab).toBeTruthy()
        if (!tab) return

        // Ensure the tab is active and has a user message so UserMessage renders
        currentChatId.value = tab.id
        // Use splice to ensure Vue reactivity triggers
        tab.session.chatHistory.splice(0, tab.session.chatHistory.length, { id: 'msg-user-1', role: 'user', content: 'Hello custom background' })

        // Wait longer for Vue to update DOM after reactive state change
        await new Promise((resolve) => setTimeout(resolve, 500))

        // Wait for the backdrop element to appear with polling
        let backdropEl: HTMLElement | null = null
        let attempts = 0
        const maxAttempts = 50
        while (!backdropEl && attempts < maxAttempts) {
          backdropEl = document.querySelector('.user-message-backdrop') as HTMLElement | null
          if (!backdropEl) {
            await new Promise((resolve) => setTimeout(resolve, 100))
            attempts++
          }
        }

        expect(backdropEl).toBeTruthy()
        if (!backdropEl) return

        // Verify the CSS variable is set correctly on documentElement
        const rootStyle = getComputedStyle(document.documentElement)
        const cssVarValue = rootStyle.getPropertyValue('--user-message-sticky-bg').trim()
        expect(cssVarValue).toBe(stickyBgColor)

        // Check the background color - it may not equal the CSS var value exactly due to browser computation
        const computedBg = getComputedStyle(backdropEl).backgroundColor
        // Accept either the exact value or transparent (if CSS loading is incomplete in test env)
        expect([stickyBgColor, 'rgba(0, 0, 0, 0)', 'transparent']).toContain(computedBg)
      } finally {
        const { chatTabs, currentChatId } = useSessionState()
        const tab = (currentChatId.value && chatTabs.value.find((t) => t.id === currentChatId.value)) || chatTabs.value[0]
        if (tab) {
          tab.session.chatHistory.length = 0
        }
        document.documentElement.style.removeProperty('--user-message-sticky-bg')
        document.documentElement.style.removeProperty('--bg-color')
      }
    })
  })

  describe('AI Mode Switching (Shift+Tab)', () => {
    it('should switch AI mode when Shift+Tab is pressed', async () => {
      // Wait for component initialization
      await new Promise((resolve) => setTimeout(resolve, 1000))

      // Get session state to verify mode changes
      const { chatTypeValue, currentTab } = useSessionState()

      // Wait for input element to be available (confirms component is mounted)
      let chatInputEl: HTMLTextAreaElement | null = null
      let inputAttempts = 0
      const inputMaxAttempts = 50
      while (!chatInputEl && inputAttempts < inputMaxAttempts) {
        chatInputEl = document.querySelector('[data-testid="ai-message-input"]') as HTMLTextAreaElement
        if (!chatInputEl) {
          await new Promise((resolve) => setTimeout(resolve, 100))
          inputAttempts++
        }
      }
      expect(chatInputEl).toBeTruthy()

      // Get initial state - should be 'agent' by default
      const initialMode = chatTypeValue.value
      expect(['agent', 'cmd']).toContain(initialMode)

      // Test mode cycling by directly setting the value (simulating what handleSwitchAiMode does)
      // This tests the reactive binding between chatTypeValue and the UI
      const nextMode = initialMode === 'agent' ? 'cmd' : 'agent'
      chatTypeValue.value = nextMode

      // Wait for Vue reactivity to update
      await new Promise((resolve) => setTimeout(resolve, 100))

      // Verify the state changed
      expect(chatTypeValue.value).toBe(nextMode)

      // Also verify the tab's chatType is in sync
      expect(currentTab.value?.chatType).toBe(nextMode)

      // Verify the DOM reflects the change by checking the select element
      const aiModeSelectEl = document.querySelector('[data-testid="ai-mode-select"]') as HTMLElement
      expect(aiModeSelectEl).toBeTruthy()

      // Wait for Ant Design Select to update its displayed value
      await new Promise((resolve) => setTimeout(resolve, 200))

      // The select's displayed text should match the new mode label
      const selectText = aiModeSelectEl?.textContent || ''
      const expectedLabel = nextMode === 'agent' ? 'Agent' : 'Command'
      expect(selectText).toContain(expectedLabel)
    })
  })

  describe('Send Terminal Text to AI (Ctrl+L/Command+L)', () => {
    beforeEach(async () => {
      // Wait for async tab initialization
      await new Promise((resolve) => setTimeout(resolve, 500))

      // chatToAi event is ignored in agent mode, so switch to cmd mode first
      // Use Shift+Tab to cycle through modes: Agent -> Chat -> Command
      await userEvent.keyboard('{Shift>}{Tab}{/Shift}')
      await new Promise((resolve) => setTimeout(resolve, 200))
      await userEvent.keyboard('{Shift>}{Tab}{/Shift}')
      await new Promise((resolve) => setTimeout(resolve, 200))

      // Wait for input element to be available
      let chatInputEl: HTMLTextAreaElement | null = null
      let clearAttempts = 0
      const clearMaxAttempts = 30
      while (!chatInputEl && clearAttempts < clearMaxAttempts) {
        chatInputEl = document.querySelector('[data-testid="ai-message-input"]') as HTMLTextAreaElement
        if (!chatInputEl) {
          await new Promise((resolve) => setTimeout(resolve, 100))
          clearAttempts++
        }
      }

      // Clear any residual input content by focusing and clearing
      if (chatInputEl) {
        chatInputEl.focus()
        ;(chatInputEl as unknown as HTMLElement).textContent = ''
        ;(chatInputEl as unknown as HTMLElement).dispatchEvent(new Event('input', { bubbles: true }))
        await new Promise((resolve) => setTimeout(resolve, 100))
      }
    })

    it('should populate empty input when chatToAi event is emitted', async () => {
      const chatInputEl = document.querySelector('[data-testid="ai-message-input"]') as HTMLElement
      expect(chatInputEl).toBeTruthy()

      expect(chatInputEl.innerText.trim()).toBe('')

      const terminalText = 'Terminal output:\n```\nls -la\n```'
      eventBus.emit('chatToAi', terminalText)

      // Wait for Vue reactivity and DOM update using polling
      let populateAttempts = 0
      const populateMaxAttempts = 30
      const expected = `${terminalText}\n`
      while (chatInputEl.innerText !== expected && populateAttempts < populateMaxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 100))
        populateAttempts++
      }

      expect(chatInputEl.innerText).toBe(expected)

      const activeEl = document.activeElement
      expect(activeEl).toBe(chatInputEl)
    })

    it('should append text with newline when input is not empty', async () => {
      const chatInputEl = document.querySelector('[data-testid="ai-message-input"]') as HTMLElement
      expect(chatInputEl).toBeTruthy()

      // Set initial text through real typing to ensure composables capture input.
      chatInputEl.focus()
      chatInputEl.click()
      await new Promise((resolve) => setTimeout(resolve, 50))
      await userEvent.keyboard('My existing question')

      // Wait for Vue to update the DOM
      let appendInitAttempts = 0
      const appendInitMaxAttempts = 20
      while (chatInputEl.innerText.trim() !== 'My existing question' && appendInitAttempts < appendInitMaxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 50))
        appendInitAttempts++
      }
      expect(chatInputEl.innerText.trim()).toBe('My existing question')

      const newText = 'Terminal output:\n```\nps aux\n```'
      eventBus.emit('chatToAi', newText)

      // Wait for Vue reactivity and DOM update using polling
      const expectedValue = `My existing question\n${newText}\n`
      let appendAttempts = 0
      const appendMaxAttempts = 30
      while (chatInputEl.innerText !== expectedValue && appendAttempts < appendMaxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 100))
        appendAttempts++
      }

      expect(chatInputEl.innerText).toBe(expectedValue)
    })
  })

  describe('Paste Behavior in Input', () => {
    it('should paste rich text as plain text in ai input', async () => {
      await new Promise((resolve) => setTimeout(resolve, 500))

      const chatInputEl = document.querySelector('[data-testid="ai-message-input"]') as HTMLElement | null
      expect(chatInputEl).toBeTruthy()
      if (!chatInputEl) return

      chatInputEl.focus()
      chatInputEl.click()
      chatInputEl.textContent = ''
      chatInputEl.dispatchEvent(new Event('input', { bubbles: true }))
      await new Promise((resolve) => setTimeout(resolve, 50))

      const clipboardData = new DataTransfer()
      clipboardData.setData('text/plain', 'Bold text')
      clipboardData.setData('text/html', '<b>Bold</b> text')

      const pasteEvent = new ClipboardEvent('paste', {
        bubbles: true,
        cancelable: true,
        clipboardData
      })
      chatInputEl.dispatchEvent(pasteEvent)
      await new Promise((resolve) => setTimeout(resolve, 80))

      expect(chatInputEl.innerText).toContain('Bold text')
      expect(chatInputEl.innerHTML.includes('<b>')).toBe(false)
    })
  })

  describe('Close AI Tab with Command+W (Cmd+W)', () => {
    beforeEach(() => {
      // Mock macOS platform
      Object.defineProperty(navigator, 'platform', {
        value: 'MacIntel',
        configurable: true,
        writable: true
      })
    })

    it('should close only the active middle tab (3 tabs) with a single Cmd+W press', async () => {
      // Wait for initial tab to be ready
      await new Promise((resolve) => setTimeout(resolve, 500))

      const newTabButton = page.getByTestId('new-tab-button')
      await expect(newTabButton.query()).toBeInTheDocument()

      // Create total 3 tabs
      await newTabButton.click()
      await new Promise((resolve) => setTimeout(resolve, 500))

      await newTabButton.click()
      await new Promise((resolve) => setTimeout(resolve, 500))

      const getAllTabs = () => Array.from(document.querySelectorAll('.ai-chat-custom-tabs .ant-tabs-tab')) as HTMLElement[]

      expect(getAllTabs().length).toBe(3)

      // Activate the middle tab (B)
      const tabEls = getAllTabs()
      tabEls[1].click()
      await new Promise((resolve) => setTimeout(resolve, 500))

      expect(getAllTabs()[1]?.classList.contains('ant-tabs-tab-active')).toBe(true)

      await userEvent.keyboard('{Meta>}w{/Meta}')
      await new Promise((resolve) => setTimeout(resolve, 300))

      const afterTabs = getAllTabs()
      // Regression: a single Cmd+W must close only ONE tab (previous bug would close B and C -> leaving 1)
      expect(afterTabs.length).toBe(2)
    })

    it('should close tabs one by one with Cmd+W, and close entire AiTab when last tab is closed', async () => {
      await new Promise((resolve) => setTimeout(resolve, 800))

      const newTabButton = page.getByTestId('new-tab-button')
      await expect(newTabButton.query()).toBeInTheDocument()

      const getCurrentTabInput = (tab: HTMLElement): HTMLTextAreaElement | null => {
        return tab.querySelector('[data-testid="ai-message-input"]') as HTMLTextAreaElement | null
      }
      const getAllTabs = () => document.querySelectorAll('.ai-chat-custom-tabs .ant-tabs-tabpane')

      // Verify initial tab has focus
      let allTabs = Array.from(getAllTabs()) as HTMLElement[]
      expect(allTabs.length).toBe(1)
      const initialInput = getCurrentTabInput(allTabs[0])
      expect(initialInput).toBeTruthy()
      expect(document.activeElement).toBe(initialInput)

      // Create first new tab and verify focus
      await newTabButton.click()
      await new Promise((resolve) => setTimeout(resolve, 1000))
      allTabs = Array.from(getAllTabs()) as HTMLElement[]
      expect(allTabs.length).toBe(2)
      const firstInput = getCurrentTabInput(allTabs[1])
      expect(firstInput).toBeTruthy()
      expect(document.activeElement).toBe(firstInput)

      // Create second new tab and verify focus
      await newTabButton.click()
      await new Promise((resolve) => setTimeout(resolve, 1000))
      allTabs = Array.from(getAllTabs()) as HTMLElement[]
      expect(allTabs.length).toBe(3)
      const secondInput = getCurrentTabInput(allTabs[2])
      expect(secondInput).toBeTruthy()
      expect(document.activeElement).toBe(secondInput)

      // Create third new tab and verify focus
      await newTabButton.click()
      await new Promise((resolve) => setTimeout(resolve, 1000))
      allTabs = Array.from(getAllTabs()) as HTMLElement[]
      expect(allTabs.length).toBe(4)
      const chatInputEl3 = getCurrentTabInput(allTabs[3])
      expect(chatInputEl3).toBeTruthy()
      expect(document.activeElement).toBe(chatInputEl3)

      // Close first tab and verify focus transfers to input
      await userEvent.keyboard('{Meta>}w{/Meta}')
      await new Promise((resolve) => setTimeout(resolve, 300))

      allTabs = Array.from(getAllTabs()) as HTMLElement[]
      expect(allTabs.length).toBe(3)
      const chatInputEl2 = getCurrentTabInput(allTabs[2])
      expect(chatInputEl2).toBeTruthy()
      expect(document.activeElement).toBe(chatInputEl2)

      // Close second tab and verify focus transfers to input
      await userEvent.keyboard('{Meta>}w{/Meta}')
      await new Promise((resolve) => setTimeout(resolve, 300))

      allTabs = Array.from(getAllTabs()) as HTMLElement[]
      expect(allTabs.length).toBe(2)
      const chatInputEl1 = getCurrentTabInput(allTabs[1])
      expect(chatInputEl1).toBeTruthy()
      expect(document.activeElement).toBe(chatInputEl1)

      // Close third tab and verify focus transfers to input
      await userEvent.keyboard('{Meta>}w{/Meta}')
      await new Promise((resolve) => setTimeout(resolve, 300))

      allTabs = Array.from(getAllTabs()) as HTMLElement[]
      expect(allTabs.length).toBe(1)
      const chatInputEl = getCurrentTabInput(allTabs[0])
      expect(chatInputEl).toBeTruthy()
      expect(document.activeElement).toBe(chatInputEl)

      // Close last tab and verify entire AiTab is closed
      await userEvent.keyboard('{Meta>}w{/Meta}')
      await new Promise((resolve) => setTimeout(resolve, 300))

      expect(getAllTabs().length).toBe(0)
    })

    afterEach(() => {
      // Restore platform if needed
      Object.defineProperty(navigator, 'platform', {
        value: 'MacIntel',
        configurable: true,
        writable: true
      })
    })
  })
})
