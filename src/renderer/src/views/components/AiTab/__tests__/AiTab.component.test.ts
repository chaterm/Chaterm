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
    getLocalWorkingDirectory: vi.fn().mockResolvedValue('/test')
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
    await new Promise((resolve) => setTimeout(resolve, 300))
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
      const chatInput = page.getByTestId('ai-message-input')
      await (expect as any).element(chatInput).toBeInTheDocument()

      await chatInput.click()

      const aiModeSelect = page.getByTestId('ai-mode-select')
      await (expect as any).element(aiModeSelect).toBeInTheDocument()

      const getSelectLabel = () => {
        const element = aiModeSelect.element()
        const titleElement = element.querySelector('.ant-select-selection-item')
        return titleElement?.textContent?.trim() || ''
      }

      // Verify initial state displays 'Chat' (label for value 'chat')
      expect(getSelectLabel()).toBe('Chat')

      await userEvent.keyboard('{Shift>}{Tab}{/Shift}')
      expect(getSelectLabel()).toBe('Command')

      // Press Shift+Tab again to switch mode: cmd → agent
      await userEvent.keyboard('{Shift>}{Tab}{/Shift}')
      expect(getSelectLabel()).toBe('Agent')

      // Press Shift+Tab again to switch mode: agent → chat (cycle back)
      await userEvent.keyboard('{Shift>}{Tab}{/Shift}')
      expect(getSelectLabel()).toBe('Chat')
    })
  })

  describe('Send Terminal Text to AI (Ctrl+L/Command+L)', () => {
    beforeEach(async () => {
      // Clear any residual input value by clicking to focus and clearing
      const chatInput = page.getByTestId('ai-message-input')
      if (await chatInput.query()) {
        await chatInput.click()
        await chatInput.fill('')
      }
    })

    it('should populate empty input when chatToAi event is emitted', async () => {
      const chatInput = page.getByTestId('ai-message-input')
      await (expect as any).element(chatInput).toBeInTheDocument()

      expect((chatInput.element() as HTMLTextAreaElement).value).toBe('')

      const terminalText = 'Terminal output:\n```\nls -la\n```'
      eventBus.emit('chatToAi', terminalText)

      await new Promise((resolve) => setTimeout(resolve, 150))

      expect((chatInput.element() as HTMLTextAreaElement).value).toBe(terminalText)

      const activeEl = document.activeElement
      if (activeEl && activeEl.classList.contains('chat-textarea')) {
        expect(activeEl).toBe(chatInput.element())
      }
    })

    it('should append text with newline when input is not empty', async () => {
      const chatInput = page.getByTestId('ai-message-input')
      await (expect as any).element(chatInput).toBeInTheDocument()

      await chatInput.fill('My existing question')
      expect((chatInput.element() as HTMLTextAreaElement).value).toBe('My existing question')

      const newText = 'Terminal output:\n```\nps aux\n```'
      eventBus.emit('chatToAi', newText)

      await new Promise((resolve) => setTimeout(resolve, 150))

      const expectedValue = 'My existing question\n' + newText
      expect((chatInput.element() as HTMLTextAreaElement).value).toBe(expectedValue)
    })
  })
})
