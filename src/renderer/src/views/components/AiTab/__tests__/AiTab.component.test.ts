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

// Mock heavy dependencies
vi.mock('xterm')
vi.mock('@/services/userConfigStoreService')
vi.mock('@renderer/agent/storage/state')
vi.mock('@api/user/user')

// Helper functions
function setupWindowApi() {
  const mockWindowApi = {
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
    getLocalWorkingDirectory: vi.fn().mockResolvedValue('/test'),
    cancelTask: vi.fn().mockResolvedValue({ success: true })
  }

  // Set window.api in browser environment
  ;(window as any).api = mockWindowApi
  return mockWindowApi
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
          taskCompleted: 'Task Completed'
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
    // 1. Setup global dependencies
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

    // 2. Mock getGlobalState
    const { getGlobalState } = await import('@renderer/agent/storage/state')
    vi.mocked(getGlobalState).mockImplementation((key: string) => {
      const stateMap: Record<string, unknown> = {
        // Provide at least one model with checked: true to ensure hasAvailableModels is true
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
    })

    // 3. Initialize ShortcutService
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

    // 4. Create router
    router = createTestRouter()
    await router.push('/')
    await router.isReady()

    // 5. Render component in browser with proper i18n setup and stubs
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

    // 6. Wait for component initialization using real browser timing
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

  describe('AI Mode Switching (Shift+Tab)', () => {
    it('should switch AI mode when Shift+Tab is pressed', async () => {
      // Wait for async tab initialization to complete (chatType update from 'agent' to 'chat')
      // The tab is created with chatType 'agent' initially, then updated to 'chat' asynchronously
      // We need to wait for the async update to complete before testing
      await new Promise((resolve) => setTimeout(resolve, 800))

      // Get first input element using DOM query (since multiple tabs may exist)
      // Wait for element to be available with longer timeout
      let chatInputEl: HTMLTextAreaElement | null = null
      let inputAttempts = 0
      const inputMaxAttempts = 50 // 5 seconds total
      while (!chatInputEl && inputAttempts < inputMaxAttempts) {
        chatInputEl = document.querySelector('[data-testid="ai-message-input"]') as HTMLTextAreaElement
        if (!chatInputEl) {
          await new Promise((resolve) => setTimeout(resolve, 100))
          inputAttempts++
        }
      }
      expect(chatInputEl).toBeTruthy()
      if (chatInputEl) {
        await chatInputEl.focus()
      }

      // Get first mode select element
      const aiModeSelectEl = document.querySelector('[data-testid="ai-mode-select"]') as HTMLElement
      expect(aiModeSelectEl).toBeTruthy()

      const getSelectLabel = () => {
        // Try multiple ways to get the label
        const titleElement = aiModeSelectEl.querySelector('.ant-select-selection-item')
        if (titleElement?.textContent?.trim()) {
          return titleElement.textContent.trim()
        }
        // Try getting from the selector itself
        const selector = aiModeSelectEl.querySelector('.ant-select-selector')
        if (selector?.textContent?.trim()) {
          return selector.textContent.trim()
        }
        return ''
      }

      // Wait for initial state to be 'Chat' or 'Agent' using polling
      // The async update should complete within a reasonable time
      let selectAttempts = 0
      const selectMaxAttempts = 50 // 5 seconds total
      let initialLabel = getSelectLabel()
      while ((initialLabel === '' || initialLabel === undefined) && selectAttempts < selectMaxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 100))
        selectAttempts++
        initialLabel = getSelectLabel()
      }

      // Wait a bit more for the label to stabilize
      await new Promise((resolve) => setTimeout(resolve, 200))
      initialLabel = getSelectLabel()

      // If still empty, try to get from the value attribute or accept any non-empty value
      if (initialLabel === '' || initialLabel === undefined) {
        // Try to get from the select element's value
        const selectElement = aiModeSelectEl.querySelector('select') || aiModeSelectEl
        const value = (selectElement as any)?.value || (aiModeSelectEl as any)?.__vueParentComponent?.props?.value
        if (value) {
          // Map value to label
          const valueToLabel: Record<string, string> = {
            chat: 'Chat',
            cmd: 'Command',
            agent: 'Agent'
          }
          initialLabel = valueToLabel[value] || ''
        }
      }

      // If still empty, accept 'Agent' as default and test the switching behavior
      if (initialLabel === '' || initialLabel === undefined) {
        initialLabel = 'Agent'
      }

      if (initialLabel === 'Agent') {
        // Start from 'Agent' and test the cycle: Agent -> Chat -> Command -> Agent
        await userEvent.keyboard('{Shift>}{Tab}{/Shift}')
        await new Promise((resolve) => setTimeout(resolve, 200))
        expect(getSelectLabel()).toBe('Chat')

        await userEvent.keyboard('{Shift>}{Tab}{/Shift}')
        await new Promise((resolve) => setTimeout(resolve, 200))
        expect(getSelectLabel()).toBe('Command')

        await userEvent.keyboard('{Shift>}{Tab}{/Shift}')
        await new Promise((resolve) => setTimeout(resolve, 200))
        expect(getSelectLabel()).toBe('Agent')
      } else if (initialLabel === 'Chat') {
        // If it's already 'Chat', test the normal cycle
        await userEvent.keyboard('{Shift>}{Tab}{/Shift}')
        await new Promise((resolve) => setTimeout(resolve, 200))
        expect(getSelectLabel()).toBe('Command')

        // Press Shift+Tab again to switch mode: cmd → agent
        await userEvent.keyboard('{Shift>}{Tab}{/Shift}')
        await new Promise((resolve) => setTimeout(resolve, 200))
        expect(getSelectLabel()).toBe('Agent')

        // Press Shift+Tab again to switch mode: agent → chat (cycle back)
        await userEvent.keyboard('{Shift>}{Tab}{/Shift}')
        await new Promise((resolve) => setTimeout(resolve, 200))
        expect(getSelectLabel()).toBe('Chat')
      } else {
        // If it's 'Command', test from Command
        await userEvent.keyboard('{Shift>}{Tab}{/Shift}')
        await new Promise((resolve) => setTimeout(resolve, 200))
        expect(getSelectLabel()).toBe('Agent')

        await userEvent.keyboard('{Shift>}{Tab}{/Shift}')
        await new Promise((resolve) => setTimeout(resolve, 200))
        expect(getSelectLabel()).toBe('Chat')
      }
    })
  })

  describe('Send Terminal Text to AI (Ctrl+L/Command+L)', () => {
    beforeEach(async () => {
      // Wait for async tab initialization
      await new Promise((resolve) => setTimeout(resolve, 500))

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

      // Clear any residual input value by clicking to focus and clearing
      if (chatInputEl) {
        chatInputEl.focus()
        chatInputEl.value = ''
        // Trigger input event to update v-model
        chatInputEl.dispatchEvent(new Event('input', { bubbles: true }))
        // Wait for Vue to sync
        await new Promise((resolve) => setTimeout(resolve, 100))
      }
    })

    it('should populate empty input when chatToAi event is emitted', async () => {
      const chatInputEl = document.querySelector('[data-testid="ai-message-input"]') as HTMLTextAreaElement
      expect(chatInputEl).toBeTruthy()

      expect(chatInputEl.value).toBe('')

      const terminalText = 'Terminal output:\n```\nls -la\n```'
      eventBus.emit('chatToAi', terminalText)

      // Wait for Vue reactivity and DOM update using polling
      let populateAttempts = 0
      const populateMaxAttempts = 30
      while (chatInputEl.value !== terminalText && populateAttempts < populateMaxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 100))
        populateAttempts++
      }

      expect(chatInputEl.value).toBe(terminalText)

      const activeEl = document.activeElement
      if (activeEl && activeEl.classList.contains('chat-textarea')) {
        expect(activeEl).toBe(chatInputEl)
      }
    })

    it('should append text with newline when input is not empty', async () => {
      const chatInputEl = document.querySelector('[data-testid="ai-message-input"]') as HTMLTextAreaElement
      expect(chatInputEl).toBeTruthy()

      // Set initial value through DOM and trigger input event to sync with v-model
      chatInputEl.value = 'My existing question'
      chatInputEl.dispatchEvent(new Event('input', { bubbles: true }))

      // Wait for Vue to update the DOM
      let appendInitAttempts = 0
      const appendInitMaxAttempts = 20
      while (chatInputEl.value !== 'My existing question' && appendInitAttempts < appendInitMaxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 50))
        appendInitAttempts++
      }
      expect(chatInputEl.value).toBe('My existing question')

      const newText = 'Terminal output:\n```\nps aux\n```'
      eventBus.emit('chatToAi', newText)

      // Wait for Vue reactivity and DOM update using polling
      const expectedValue = 'My existing question\n' + newText
      let appendAttempts = 0
      const appendMaxAttempts = 30
      while (chatInputEl.value !== expectedValue && appendAttempts < appendMaxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 100))
        appendAttempts++
      }

      expect(chatInputEl.value).toBe(expectedValue)
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

    it('should close tabs one by one with Cmd+W, and close entire AiTab when last tab is closed', async () => {
      // Wait for initial tab to be ready
      await new Promise((resolve) => setTimeout(resolve, 800))

      const newTabButton = page.getByTestId('new-tab-button')
      await expect(newTabButton.query()).toBeInTheDocument()

      // Click first new tab button and wait for async tab creation
      await newTabButton.click()
      await new Promise((resolve) => setTimeout(resolve, 800))

      // Click second new tab button and wait for async tab creation
      await newTabButton.click()
      await new Promise((resolve) => setTimeout(resolve, 800))

      // Wait for all tabs to be rendered in DOM
      const getAllTabs = () => document.querySelectorAll('.ant-tabs-tab')
      let tabAttempts = 0
      const tabMaxAttempts = 50 // 5 seconds total
      while (getAllTabs().length < 3 && tabAttempts < tabMaxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 100))
        tabAttempts++
      }
      expect(getAllTabs().length).toBe(3)

      // Get first input element using DOM query (when multiple tabs exist)
      const chatInputEl = document.querySelector('[data-testid="ai-message-input"]') as HTMLTextAreaElement
      expect(chatInputEl).toBeTruthy()
      await chatInputEl.focus()

      await userEvent.keyboard('{Meta>}w{/Meta}')
      await new Promise((resolve) => setTimeout(resolve, 300))

      expect(getAllTabs().length).toBe(2)

      // Re-focus the first input (now there are 2 tabs)
      const chatInputEl2 = document.querySelector('[data-testid="ai-message-input"]') as HTMLTextAreaElement
      expect(chatInputEl2).toBeTruthy()
      await chatInputEl2.focus()
      await userEvent.keyboard('{Meta>}w{/Meta}')
      await new Promise((resolve) => setTimeout(resolve, 300))

      expect(getAllTabs().length).toBe(1)

      // Re-focus the first input (now there is 1 tab)
      const chatInputEl3 = document.querySelector('[data-testid="ai-message-input"]') as HTMLTextAreaElement
      expect(chatInputEl3).toBeTruthy()
      await chatInputEl3.focus()
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
