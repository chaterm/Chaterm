/**
 * AgentsSidebar Component Unit Tests
 *
 * Tests for the AgentsSidebar component including:
 * - Component mounting and initialization
 * - Search functionality
 * - Pagination and lazy loading
 * - Conversation selection
 * - New chat creation
 * - Conversation deletion
 * - IP address loading
 * - Time formatting
 * - Event listeners (visibility, focus, eventBus, main process)
 * - Empty state display
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import AgentsSidebar from '../index.vue'
import eventBus from '@/utils/eventBus'

// Mock i18n
const mockTranslations: Record<string, string> = {
  'common.search': 'Search',
  'common.noData': 'No Data',
  'ai.loading': 'Loading...',
  'ai.loadMore': 'Load More',
  'common.daysAgo': ' days ago'
}

const mockT = (key: string) => {
  return mockTranslations[key] || key
}

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    locale: { value: 'zh-CN' },
    t: mockT
  })
}))

// Mock eventBus
vi.mock('@/utils/eventBus', () => ({
  default: {
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn()
  }
}))

// Mock window.api
const mockGetTaskMetadata = vi.fn()
const mockGetTaskList = vi.fn()
const mockSendToMain = vi.fn()
const mockOnMainMessage = vi.fn()

const mockWindowApi = {
  getTaskMetadata: mockGetTaskMetadata,
  getTaskList: mockGetTaskList,
  sendToMain: mockSendToMain,
  onMainMessage: mockOnMainMessage
}

describe('AgentsSidebar Component', () => {
  let wrapper: VueWrapper<any>
  let removeMainMessageListener: (() => void) | undefined

  const createWrapper = (options = {}) => {
    return mount(AgentsSidebar, {
      global: {
        stubs: {
          'a-input': {
            template: `
              <div class="a-input">
                <slot name="prefix" />
                <input
                  :value="value"
                  @input="$emit('update:value', $event.target.value)"
                  :placeholder="placeholder"
                  class="ant-input"
                />
                <slot name="suffix" />
              </div>
            `,
            props: ['value', 'placeholder', 'allowClear', 'size']
          },
          'a-button': {
            template: `
              <button
                class="a-button"
                :class="{ 'ant-btn-block': block, 'ant-btn-sm': size === 'small' }"
                @click="$emit('click', $event)"
              >
                <slot name="icon" />
                <slot />
              </button>
            `,
            props: ['type', 'size', 'block']
          },
          SearchOutlined: { template: '<span class="search-icon" />' },
          PlusOutlined: { template: '<span class="plus-icon" />' },
          DeleteOutlined: { template: '<span class="delete-icon" />' }
        },
        mocks: {
          $t: mockT
        }
      },
      ...options
    })
  }

  // Create mock task list data in the format returned by window.api.getTaskList()
  const createMockTaskList = (count: number) => {
    const now = Date.now()
    return Array.from({ length: count }, (_, i) => ({
      id: `task-${i}`,
      title: `Conversation ${i}`,
      favorite: false,
      createdAt: now - i * 1000 * 60 * 60,
      updatedAt: now - i * 1000 * 60 * 60 // 1 hour apart
    }))
  }

  // Helper to wrap task list data in the API response format
  const mockTaskListResponse = (data: Array<{ id: string; title: string | null; favorite: boolean; createdAt: number; updatedAt: number }>) => ({
    success: true,
    data
  })

  beforeEach(() => {
    // Setup window.api mock
    global.window = global.window || ({} as Window & typeof globalThis)
    ;(global.window as unknown as { api: typeof mockWindowApi }).api = mockWindowApi

    // Setup document visibility API
    Object.defineProperty(document, 'hidden', {
      writable: true,
      configurable: true,
      value: false
    })

    // Mock document.addEventListener and window.addEventListener
    vi.spyOn(document, 'addEventListener').mockImplementation(() => {})
    vi.spyOn(document, 'removeEventListener').mockImplementation(() => {})
    vi.spyOn(window, 'addEventListener').mockImplementation(() => {})
    vi.spyOn(window, 'removeEventListener').mockImplementation(() => {})

    // Reset all mocks
    vi.clearAllMocks()

    // Setup default mock return values
    mockGetTaskList.mockResolvedValue({ success: true, data: [] })
    mockGetTaskMetadata.mockResolvedValue({
      success: true,
      data: {
        hosts: [{ host: '192.168.1.1', uuid: 'uuid-1', connection: 'ssh' }]
      }
    })
    mockSendToMain.mockResolvedValue(undefined)
    mockOnMainMessage.mockImplementation((_callback: (message: any) => void) => {
      removeMainMessageListener = () => {}
      return removeMainMessageListener
    })

    // Clear console output for cleaner test results

    vi.spyOn(console, 'error').mockImplementation(() => {})

    vi.spyOn(console, 'debug').mockImplementation(() => {})
  })

  afterEach(() => {
    wrapper?.unmount()
    vi.clearAllMocks()
    vi.restoreAllMocks()
    removeMainMessageListener = undefined
  })

  describe('Component Mounting', () => {
    it('should mount successfully', async () => {
      wrapper = createWrapper()
      await nextTick()

      expect(wrapper.exists()).toBe(true)
      expect(wrapper.find('.agents-workspace').exists()).toBe(true)
    })

    it('should load conversations on mount', async () => {
      const mockData = createMockTaskList(5)
      mockGetTaskList.mockResolvedValueOnce(mockTaskListResponse(mockData))

      wrapper = createWrapper()
      await nextTick()
      await nextTick()

      expect(mockGetTaskList).toHaveBeenCalled()
    })

    it('should setup event listeners on mount', async () => {
      wrapper = createWrapper()
      await nextTick()

      expect(eventBus.on).toHaveBeenCalledWith('create-new-empty-tab', expect.any(Function))
      expect(eventBus.on).toHaveBeenCalledWith('restore-history-tab', expect.any(Function))
      expect(mockOnMainMessage).toHaveBeenCalled()
    })

    it('should setup visibility and focus listeners on mount', async () => {
      const addEventListenerSpy = vi.spyOn(document, 'addEventListener')
      const windowAddEventListenerSpy = vi.spyOn(window, 'addEventListener')

      wrapper = createWrapper()
      await nextTick()

      expect(addEventListenerSpy).toHaveBeenCalledWith('visibilitychange', expect.any(Function))
      expect(windowAddEventListenerSpy).toHaveBeenCalledWith('focus', expect.any(Function))
    })

    it('should cleanup event listeners on unmount', async () => {
      const removeEventListenerSpy = vi.spyOn(document, 'removeEventListener')
      const windowRemoveEventListenerSpy = vi.spyOn(window, 'removeEventListener')

      wrapper = createWrapper()
      await nextTick()
      wrapper.unmount()

      expect(removeEventListenerSpy).toHaveBeenCalledWith('visibilitychange', expect.any(Function))
      expect(windowRemoveEventListenerSpy).toHaveBeenCalledWith('focus', expect.any(Function))
      expect(eventBus.off).toHaveBeenCalledWith('create-new-empty-tab', expect.any(Function))
      expect(eventBus.off).toHaveBeenCalledWith('restore-history-tab', expect.any(Function))
    })
  })

  describe('Search Functionality', () => {
    it('should display search input', async () => {
      wrapper = createWrapper()
      await nextTick()

      const searchInput = wrapper.find('.search-input input')
      expect(searchInput.exists()).toBe(true)
      expect(searchInput.attributes('placeholder')).toBe('Search')
    })

    it('should filter conversations by title', async () => {
      const mockData = createMockTaskList(10)
      mockData[0].title = 'Test Conversation'
      mockData[1].title = 'Another Test'
      mockData[2].title = 'Different Title'
      mockGetTaskList.mockResolvedValueOnce(mockTaskListResponse(mockData))

      wrapper = createWrapper()
      await nextTick()
      await nextTick()
      await new Promise((resolve) => setTimeout(resolve, 100)) // Wait for async operations

      const searchInput = wrapper.find('.search-input input')
      await searchInput.setValue('Test')
      await nextTick()

      const conversationItems = wrapper.findAll('.conversation-item')
      expect(conversationItems.length).toBe(2)
    })

    it('should filter conversations by id', async () => {
      const mockData = createMockTaskList(5)
      mockGetTaskList.mockResolvedValueOnce(mockTaskListResponse(mockData))

      wrapper = createWrapper()
      await nextTick()
      await nextTick()

      const searchInput = wrapper.find('.search-input input')
      await searchInput.setValue('task-1')
      await nextTick()

      const conversationItems = wrapper.findAll('.conversation-item')
      expect(conversationItems.length).toBe(1)
    })

    it('should reset pagination when search value changes', async () => {
      const mockData = createMockTaskList(25)
      mockGetTaskList.mockResolvedValueOnce(mockTaskListResponse(mockData))

      wrapper = createWrapper()
      await nextTick()
      await nextTick()

      // Load more conversations first
      const loadMoreBtn = wrapper.find('.load-more-btn')
      if (loadMoreBtn.exists()) {
        await loadMoreBtn.trigger('click')
        await nextTick()
      }

      // Then search
      const searchInput = wrapper.find('.search-input input')
      await searchInput.setValue('test')
      await nextTick()

      // Pagination should be reset, only first page should be shown
      const conversationItems = wrapper.findAll('.conversation-item')
      expect(conversationItems.length).toBeLessThanOrEqual(20)
    })
  })

  describe('Conversation Display', () => {
    it('should display empty state when no conversations', async () => {
      mockGetTaskList.mockResolvedValueOnce({ success: true, data: [] })

      wrapper = createWrapper()
      await nextTick()
      await nextTick()

      expect(wrapper.find('.empty-state').exists()).toBe(true)
      expect(wrapper.find('.empty-text').text()).toBe('No Data')
    })

    it('should display conversation list', async () => {
      const mockData = createMockTaskList(5)
      mockGetTaskList.mockResolvedValueOnce(mockTaskListResponse(mockData))

      wrapper = createWrapper()
      await nextTick()
      await nextTick()
      await new Promise((resolve) => setTimeout(resolve, 100)) // Wait for async operations

      const conversationItems = wrapper.findAll('.conversation-item')
      expect(conversationItems.length).toBe(5)
    })

    it('should display conversation title', async () => {
      const mockData = createMockTaskList(1)
      mockData[0].title = 'My Test Conversation'
      mockGetTaskList.mockResolvedValueOnce(mockTaskListResponse(mockData))

      wrapper = createWrapper()
      await nextTick()
      await nextTick()
      await new Promise((resolve) => setTimeout(resolve, 100)) // Wait for async operations

      const title = wrapper.find('.conversation-title')
      expect(title.text()).toBe('My Test Conversation')
    })

    it('should display conversation time', async () => {
      const now = Date.now()
      const mockData = [
        {
          id: 'task-1',
          title: 'Test',
          favorite: false,
          createdAt: now,
          updatedAt: now
        }
      ]
      mockGetTaskList.mockResolvedValueOnce(mockTaskListResponse(mockData))

      wrapper = createWrapper()
      await nextTick()
      await nextTick()
      await new Promise((resolve) => setTimeout(resolve, 100)) // Wait for async operations

      const timeElement = wrapper.find('.conversation-time')
      expect(timeElement.exists()).toBe(true)
      expect(timeElement.text()).toBeTruthy()
    })

    it('should display IP address when available', async () => {
      const now = Date.now()
      const mockData = [
        {
          id: 'task-1',
          title: 'Test',
          favorite: false,
          createdAt: now,
          updatedAt: now,
          hosts: [{ host: '192.168.1.1', uuid: 'uuid-1', connection: 'ssh' }]
        }
      ]
      mockGetTaskList.mockResolvedValueOnce(mockTaskListResponse(mockData))

      wrapper = createWrapper()
      await nextTick()
      await nextTick()
      await new Promise((resolve) => setTimeout(resolve, 200))

      const ipElement = wrapper.find('.conversation-ip')
      expect(ipElement.exists()).toBe(true)
      expect(ipElement.text()).toBe('192.168.1.1')
    })

    it('should highlight active conversation', async () => {
      const mockData = createMockTaskList(3)
      mockGetTaskList.mockResolvedValueOnce(mockTaskListResponse(mockData))

      wrapper = createWrapper()
      await nextTick()
      await nextTick()
      await new Promise((resolve) => setTimeout(resolve, 100)) // Wait for async operations

      const conversationItems = wrapper.findAll('.conversation-item')
      expect(conversationItems.length).toBeGreaterThan(0)
      expect(conversationItems[0].classes()).not.toContain('active')

      await conversationItems[0].trigger('click')
      await nextTick()

      expect(conversationItems[0].classes()).toContain('active')
    })
  })

  describe('Pagination and Lazy Loading', () => {
    it('should display first page of conversations (20 items)', async () => {
      const mockData = createMockTaskList(25)
      mockGetTaskList.mockResolvedValueOnce(mockTaskListResponse(mockData))

      wrapper = createWrapper()
      await nextTick()
      await nextTick()
      await new Promise((resolve) => setTimeout(resolve, 100)) // Wait for async operations

      const conversationItems = wrapper.findAll('.conversation-item')
      expect(conversationItems.length).toBe(20)
    })

    it('should show load more button when there are more conversations', async () => {
      const mockData = createMockTaskList(25)
      mockGetTaskList.mockResolvedValueOnce(mockTaskListResponse(mockData))

      wrapper = createWrapper()
      await nextTick()
      await nextTick()
      await new Promise((resolve) => setTimeout(resolve, 100)) // Wait for async operations

      const loadMoreBtn = wrapper.find('.load-more-btn')
      expect(loadMoreBtn.exists()).toBe(true)
      expect(loadMoreBtn.text()).toBe('Load More')
    })

    it('should not show load more button when all conversations are displayed', async () => {
      const mockData = createMockTaskList(10)
      mockGetTaskList.mockResolvedValueOnce(mockTaskListResponse(mockData))

      wrapper = createWrapper()
      await nextTick()
      await nextTick()

      const loadMoreBtn = wrapper.find('.load-more-btn')
      expect(loadMoreBtn.exists()).toBe(false)
    })

    it('should load more conversations when load more button is clicked', async () => {
      const mockData = createMockTaskList(25)
      mockGetTaskList.mockResolvedValueOnce(mockTaskListResponse(mockData))

      wrapper = createWrapper()
      await nextTick()
      await nextTick()
      await new Promise((resolve) => setTimeout(resolve, 100)) // Wait for async operations

      const loadMoreBtn = wrapper.find('.load-more-btn')
      expect(loadMoreBtn.exists()).toBe(true)
      await loadMoreBtn.trigger('click')
      await nextTick()
      await new Promise((resolve) => setTimeout(resolve, 350))

      const conversationItems = wrapper.findAll('.conversation-item')
      expect(conversationItems.length).toBe(25)
    })

    it('should show loading state when loading more', async () => {
      const mockData = createMockTaskList(25)
      mockGetTaskList.mockResolvedValueOnce(mockTaskListResponse(mockData))

      wrapper = createWrapper()
      await nextTick()
      await nextTick()
      await new Promise((resolve) => setTimeout(resolve, 100)) // Wait for async operations

      const loadMoreBtn = wrapper.find('.load-more-btn')
      expect(loadMoreBtn.exists()).toBe(true)
      await loadMoreBtn.trigger('click')
      await nextTick()

      // During loading, button should show loading text
      expect(loadMoreBtn.text()).toBe('Loading...')
    })

    it('should load IP addresses for newly displayed conversations', async () => {
      const mockData = createMockTaskList(25)
      mockGetTaskList.mockResolvedValueOnce(mockTaskListResponse(mockData))

      wrapper = createWrapper()
      await nextTick()
      await nextTick()
      await new Promise((resolve) => setTimeout(resolve, 100))

      // Load more to show items 20-24
      const loadMoreBtn = wrapper.find('.load-more-btn')
      expect(loadMoreBtn.exists()).toBe(true)
      await loadMoreBtn.trigger('click')
      await nextTick()
      await new Promise((resolve) => setTimeout(resolve, 350))

      // IP addresses are now included in getTaskList response, no per-item getTaskMetadata needed
      const conversationItems = wrapper.findAll('.conversation-item')
      expect(conversationItems.length).toBeGreaterThan(20)
    })
  })

  describe('New Chat Functionality', () => {
    it('should display new chat button', async () => {
      wrapper = createWrapper()
      await nextTick()

      const newChatBtn = wrapper.find('.new-chat-btn')
      expect(newChatBtn.exists()).toBe(true)
      expect(newChatBtn.text()).toContain('New Chat')
    })

    it('should emit new-chat event when new chat button is clicked', async () => {
      mockGetTaskList.mockResolvedValueOnce({ success: true, data: [] })

      wrapper = createWrapper()
      await nextTick()
      await nextTick()

      const newChatBtn = wrapper.find('.new-chat-btn')
      await newChatBtn.trigger('click')
      await nextTick()

      expect(wrapper.emitted('new-chat')).toBeTruthy()
      expect(wrapper.emitted('new-chat')?.length).toBeGreaterThanOrEqual(1)
    })

    it('should clear active conversation when new chat is created', async () => {
      const mockData = createMockTaskList(3)
      mockGetTaskList.mockResolvedValueOnce(mockTaskListResponse(mockData))

      wrapper = createWrapper()
      await nextTick()
      await nextTick()
      await new Promise((resolve) => setTimeout(resolve, 100)) // Wait for async operations

      // Select a conversation first
      const conversationItems = wrapper.findAll('.conversation-item')
      expect(conversationItems.length).toBeGreaterThan(0)
      await conversationItems[0].trigger('click')
      await nextTick()

      // Then click new chat
      const newChatBtn = wrapper.find('.new-chat-btn')
      await newChatBtn.trigger('click')
      await nextTick()

      // Active conversation should be cleared
      expect(conversationItems[0].classes()).not.toContain('active')
    })

    it('should refresh conversations when new chat is created via eventBus', async () => {
      const mockData = createMockTaskList(5)
      mockGetTaskList.mockResolvedValue(mockTaskListResponse(mockData))

      wrapper = createWrapper()
      await nextTick()
      await nextTick()
      await new Promise((resolve) => setTimeout(resolve, 100)) // Wait for initial load to complete

      const initialCallCount = mockGetTaskList.mock.calls.length

      // Get the event handler
      const eventHandlers = (eventBus.on as ReturnType<typeof vi.fn>).mock.calls
      const newChatHandler = eventHandlers.find((call: any[]) => call[0] === 'create-new-empty-tab')?.[1]

      expect(newChatHandler).toBeDefined()

      // Trigger the event
      if (newChatHandler) {
        newChatHandler()
        await nextTick()
        await nextTick()
        await new Promise((resolve) => setTimeout(resolve, 100)) // Wait for refresh

        // Should reload conversations
        expect(mockGetTaskList.mock.calls.length).toBeGreaterThan(initialCallCount)
      }
    })
  })

  describe('Conversation Selection', () => {
    it('should emit conversation-select event when conversation is clicked', async () => {
      const mockData = createMockTaskList(3)
      mockGetTaskList.mockResolvedValueOnce(mockTaskListResponse(mockData))

      wrapper = createWrapper()
      await nextTick()
      await nextTick()
      await new Promise((resolve) => setTimeout(resolve, 100)) // Wait for async operations

      const conversationItems = wrapper.findAll('.conversation-item')
      expect(conversationItems.length).toBeGreaterThan(0)
      await conversationItems[0].trigger('click')
      await nextTick()

      expect(wrapper.emitted('conversation-select')).toBeTruthy()
      const emitted = wrapper.emitted('conversation-select')?.[0]?.[0] as any
      expect(emitted).toBeDefined()
      expect(emitted.id).toBe('task-0')
    })

    it('should set active conversation when clicked', async () => {
      const mockData = createMockTaskList(3)
      mockGetTaskList.mockResolvedValueOnce(mockTaskListResponse(mockData))

      wrapper = createWrapper()
      await nextTick()
      await nextTick()
      await new Promise((resolve) => setTimeout(resolve, 100)) // Wait for async operations

      const conversationItems = wrapper.findAll('.conversation-item')
      expect(conversationItems.length).toBeGreaterThan(1)
      await conversationItems[1].trigger('click')
      await nextTick()

      expect(conversationItems[1].classes()).toContain('active')
      expect(conversationItems[0].classes()).not.toContain('active')
    })

    it('should support setActiveConversation method via expose', async () => {
      const mockData = createMockTaskList(3)
      mockGetTaskList.mockResolvedValueOnce(mockTaskListResponse(mockData))

      wrapper = createWrapper()
      await nextTick()
      await nextTick()

      const vm = wrapper.vm as any
      vm.setActiveConversation('task-1')
      await nextTick()

      const conversationItems = wrapper.findAll('.conversation-item')
      expect(conversationItems[1].classes()).toContain('active')
    })
  })

  describe('Conversation Deletion', () => {
    it('should show delete button on hover', async () => {
      const mockData = createMockTaskList(3)
      mockGetTaskList.mockResolvedValueOnce(mockTaskListResponse(mockData))

      wrapper = createWrapper()
      await nextTick()
      await nextTick()
      await new Promise((resolve) => setTimeout(resolve, 100)) // Wait for async operations

      const conversationItems = wrapper.findAll('.conversation-item')
      expect(conversationItems.length).toBeGreaterThan(0)
      const deleteBtn = conversationItems[0].find('.delete-btn')

      // Delete button should exist but may be hidden initially
      expect(deleteBtn.exists()).toBe(true)
    })

    it('should emit conversation-delete event when delete button is clicked', async () => {
      const mockData = createMockTaskList(3)
      mockGetTaskList.mockResolvedValueOnce(mockTaskListResponse(mockData))

      wrapper = createWrapper()
      await nextTick()
      await nextTick()
      await new Promise((resolve) => setTimeout(resolve, 100)) // Wait for async operations

      const conversationItems = wrapper.findAll('.conversation-item')
      expect(conversationItems.length).toBeGreaterThan(0)
      const deleteBtn = conversationItems[0].find('.delete-btn')
      await deleteBtn.trigger('click')
      await nextTick()

      expect(wrapper.emitted('conversation-delete')).toBeTruthy()
      expect(wrapper.emitted('conversation-delete')?.[0]).toEqual(['task-0'])
    })

    it('should remove conversation from list when deleted', async () => {
      const mockData = createMockTaskList(3)
      mockGetTaskList.mockResolvedValueOnce(mockTaskListResponse(mockData))

      wrapper = createWrapper()
      await nextTick()
      await nextTick()
      await new Promise((resolve) => setTimeout(resolve, 100)) // Wait for async operations

      const conversationItems = wrapper.findAll('.conversation-item')
      expect(conversationItems.length).toBe(3)

      const deleteBtn = conversationItems[0].find('.delete-btn')
      await deleteBtn.trigger('click')
      await nextTick()

      const updatedItems = wrapper.findAll('.conversation-item')
      expect(updatedItems.length).toBe(2)
    })

    it('should send delete message to main process', async () => {
      const mockData = createMockTaskList(3)
      mockGetTaskList.mockResolvedValueOnce(mockTaskListResponse(mockData))

      wrapper = createWrapper()
      await nextTick()
      await nextTick()
      await new Promise((resolve) => setTimeout(resolve, 100)) // Wait for async operations

      const conversationItems = wrapper.findAll('.conversation-item')
      expect(conversationItems.length).toBeGreaterThan(0)
      const deleteBtn = conversationItems[0].find('.delete-btn')
      await deleteBtn.trigger('click')
      await nextTick()

      expect(mockSendToMain).toHaveBeenCalledWith({
        type: 'deleteTaskWithId',
        text: 'task-0',
        taskId: 'task-0'
      })
    })

    it('should clear active conversation if deleted conversation is active', async () => {
      const mockData = createMockTaskList(3)
      mockGetTaskList.mockResolvedValueOnce(mockTaskListResponse(mockData))

      wrapper = createWrapper()
      await nextTick()
      await nextTick()
      await new Promise((resolve) => setTimeout(resolve, 100)) // Wait for async operations

      // Select first conversation
      const conversationItems = wrapper.findAll('.conversation-item')
      expect(conversationItems.length).toBeGreaterThan(0)
      await conversationItems[0].trigger('click')
      await nextTick()

      // Delete it
      const deleteBtn = conversationItems[0].find('.delete-btn')
      await deleteBtn.trigger('click')
      await nextTick()

      // Active state should be cleared
      const updatedItems = wrapper.findAll('.conversation-item')
      if (updatedItems.length > 0) {
        expect(updatedItems[0].classes()).not.toContain('active')
      }
    })

    it('should prevent click propagation when delete button is clicked', async () => {
      const mockData = createMockTaskList(3)
      mockGetTaskList.mockResolvedValueOnce(mockTaskListResponse(mockData))

      wrapper = createWrapper()
      await nextTick()
      await nextTick()
      await new Promise((resolve) => setTimeout(resolve, 100)) // Wait for async operations

      const conversationItems = wrapper.findAll('.conversation-item')
      expect(conversationItems.length).toBeGreaterThan(0)
      const deleteBtn = conversationItems[0].find('.delete-btn')

      // Click delete button
      await deleteBtn.trigger('click')
      await nextTick()

      // Should not trigger conversation-select event (only conversation-delete)
      const selectEvents = wrapper.emitted('conversation-select')
      if (selectEvents) {
        expect(selectEvents.length).toBe(0)
      }
    })
  })

  describe('IP Address Loading', () => {
    it('should derive IP addresses from getTaskList hosts field', async () => {
      const now = Date.now()
      const mockData = [
        {
          id: 'task-1',
          title: 'Test',
          favorite: false,
          createdAt: now,
          updatedAt: now,
          hosts: [{ host: '10.0.0.1', uuid: 'uuid-1', connection: 'ssh' }]
        },
        {
          id: 'task-2',
          title: 'Test 2',
          favorite: false,
          createdAt: now,
          updatedAt: now,
          hosts: []
        }
      ]
      mockGetTaskList.mockResolvedValueOnce(mockTaskListResponse(mockData))

      wrapper = createWrapper()
      await nextTick()
      await nextTick()
      await new Promise((resolve) => setTimeout(resolve, 200))

      const vm = wrapper.vm as any
      // task-1 should have IP derived from hosts
      expect(vm.allConversations[0]?.ipAddress).toBe('10.0.0.1')
      // task-2 has no hosts, should have no IP
      expect(vm.allConversations[1]?.ipAddress).toBeUndefined()
      // No per-item getTaskMetadata calls needed
      expect(mockGetTaskMetadata).not.toHaveBeenCalled()
    })

    it('should handle single IP address', async () => {
      const now = Date.now()
      const mockData = [
        {
          id: 'task-1',
          title: 'Test',
          favorite: false,
          createdAt: now,
          updatedAt: now,
          hosts: [{ host: '192.168.1.1', uuid: 'uuid-1', connection: 'ssh' }]
        }
      ]
      mockGetTaskList.mockResolvedValueOnce(mockTaskListResponse(mockData))

      wrapper = createWrapper()
      await nextTick()
      await nextTick()
      await new Promise((resolve) => setTimeout(resolve, 200))

      const ipElement = wrapper.find('.conversation-ip')
      expect(ipElement.exists()).toBe(true)
      expect(ipElement.text()).toBe('192.168.1.1')
    })

    it('should handle multiple IP addresses', async () => {
      const now = Date.now()
      const mockData = [
        {
          id: 'task-1',
          title: 'Test',
          favorite: false,
          createdAt: now,
          updatedAt: now,
          hosts: [
            { host: '192.168.1.1', uuid: 'uuid-1', connection: 'ssh' },
            { host: '192.168.1.2', uuid: 'uuid-2', connection: 'ssh' },
            { host: '192.168.1.3', uuid: 'uuid-3', connection: 'ssh' }
          ]
        }
      ]
      mockGetTaskList.mockResolvedValueOnce(mockTaskListResponse(mockData))

      wrapper = createWrapper()
      await nextTick()
      await nextTick()
      await new Promise((resolve) => setTimeout(resolve, 200))

      const ipElement = wrapper.find('.conversation-ip')
      expect(ipElement.exists()).toBe(true)
      expect(ipElement.text()).toContain('192.168.1.1')
      expect(ipElement.text()).toContain('+2')
    })

    it('should handle IP loading errors gracefully', async () => {
      const now = Date.now()
      const mockData = [
        {
          id: 'task-1',
          title: 'Test',
          favorite: false,
          createdAt: now,
          updatedAt: now
        }
      ]
      mockGetTaskList.mockResolvedValueOnce(mockTaskListResponse(mockData))

      mockGetTaskMetadata.mockRejectedValueOnce(new Error('Failed to load'))

      wrapper = createWrapper()
      await nextTick()
      await nextTick()
      await new Promise((resolve) => setTimeout(resolve, 200)) // Wait for IP loading

      // Should not crash - logger routes through window.api.log
      // The component handles errors gracefully
    })
  })

  describe('Time Formatting', () => {
    it('should format time for today as time only', async () => {
      const now = Date.now()
      const mockData = [
        {
          id: 'task-1',
          title: 'Test',
          favorite: false,
          createdAt: now,
          updatedAt: now
        }
      ]
      mockGetTaskList.mockResolvedValueOnce(mockTaskListResponse(mockData))

      wrapper = createWrapper()
      await nextTick()
      await nextTick()
      await new Promise((resolve) => setTimeout(resolve, 100)) // Wait for async operations

      const timeElement = wrapper.find('.conversation-time')
      const timeText = timeElement.text()
      // Should be in HH:MM format
      expect(timeText).toMatch(/\d{2}:\d{2}/)
    })

    it('should format time for recent days as days ago', async () => {
      const now = Date.now()
      const threeDaysAgo = now - 3 * 24 * 60 * 60 * 1000
      const mockData = [
        {
          id: 'task-1',
          title: 'Test',
          favorite: false,
          createdAt: threeDaysAgo,
          updatedAt: threeDaysAgo
        }
      ]
      mockGetTaskList.mockResolvedValueOnce(mockTaskListResponse(mockData))

      wrapper = createWrapper()
      await nextTick()
      await nextTick()
      await new Promise((resolve) => setTimeout(resolve, 100)) // Wait for async operations

      const timeElement = wrapper.find('.conversation-time')
      expect(timeElement.text()).toContain('3')
      expect(timeElement.text()).toContain('days ago')
    })

    it('should format time for older dates as date only', async () => {
      const now = Date.now()
      const tenDaysAgo = now - 10 * 24 * 60 * 60 * 1000
      const mockData = [
        {
          id: 'task-1',
          title: 'Test',
          favorite: false,
          createdAt: tenDaysAgo,
          updatedAt: tenDaysAgo
        }
      ]
      mockGetTaskList.mockResolvedValueOnce(mockTaskListResponse(mockData))

      wrapper = createWrapper()
      await nextTick()
      await nextTick()
      await new Promise((resolve) => setTimeout(resolve, 100)) // Wait for async operations

      const timeElement = wrapper.find('.conversation-time')
      // Should be in MM/DD format
      expect(timeElement.text()).toMatch(/\d{2}\/\d{2}/)
    })
  })

  describe('Event Listeners', () => {
    it('should refresh conversations on visibility change', async () => {
      const mockData = createMockTaskList(5)
      mockGetTaskList.mockResolvedValue(mockTaskListResponse(mockData))

      wrapper = createWrapper()
      await nextTick()
      await nextTick()
      await new Promise((resolve) => setTimeout(resolve, 200)) // Wait for initial load to complete (isLoading = false)

      const initialCallCount = mockGetTaskList.mock.calls.length

      // Get the visibility change handler
      const addEventListenerCalls = (document.addEventListener as ReturnType<typeof vi.fn>).mock.calls
      const visibilityHandler = addEventListenerCalls.find((call: any[]) => call[0] === 'visibilitychange')?.[1]

      expect(visibilityHandler).toBeDefined()

      // Simulate visibility change (document not hidden)
      Object.defineProperty(document, 'hidden', {
        writable: true,
        configurable: true,
        value: false
      })

      if (visibilityHandler) {
        visibilityHandler()
        await nextTick()
        await nextTick()
        await new Promise((resolve) => setTimeout(resolve, 200)) // Wait for refresh

        // Should reload conversations
        expect(mockGetTaskList.mock.calls.length).toBeGreaterThan(initialCallCount)
      }
    })

    it('should refresh conversations on window focus', async () => {
      const mockData = createMockTaskList(5)
      mockGetTaskList.mockResolvedValue(mockTaskListResponse(mockData))

      wrapper = createWrapper()
      await nextTick()
      await nextTick()
      await new Promise((resolve) => setTimeout(resolve, 200)) // Wait for initial load to complete

      const initialCallCount = mockGetTaskList.mock.calls.length

      // Get the focus handler
      const addEventListenerCalls = (window.addEventListener as ReturnType<typeof vi.fn>).mock.calls
      const focusHandler = addEventListenerCalls.find((call: any[]) => call[0] === 'focus')?.[1]

      expect(focusHandler).toBeDefined()

      if (focusHandler) {
        focusHandler()
        await nextTick()
        await nextTick()
        await new Promise((resolve) => setTimeout(resolve, 200)) // Wait for refresh

        // Should reload conversations
        expect(mockGetTaskList.mock.calls.length).toBeGreaterThan(initialCallCount)
      }
    })

    it('should not refresh conversations for other message types', async () => {
      const mockData = createMockTaskList(5)
      mockGetTaskList.mockResolvedValue(mockTaskListResponse(mockData))

      wrapper = createWrapper()
      await nextTick()
      await nextTick()

      const initialCallCount = mockGetTaskList.mock.calls.length

      // Get the message handler
      const messageHandler = mockOnMainMessage.mock.calls[0]?.[0]

      if (messageHandler) {
        messageHandler({ type: 'otherMessage' })
        await nextTick()
        await nextTick()

        // Should not reload conversations
        expect(mockGetTaskList.mock.calls.length).toBe(initialCallCount)
      }
    })

    it('should refresh conversations when tab is restored', async () => {
      const mockData = createMockTaskList(5)
      mockGetTaskList.mockResolvedValue(mockTaskListResponse(mockData))

      wrapper = createWrapper()
      await nextTick()
      await nextTick()
      await new Promise((resolve) => setTimeout(resolve, 200)) // Wait for initial load to complete

      const initialCallCount = mockGetTaskList.mock.calls.length

      // Get the event handler
      const eventHandlers = (eventBus.on as ReturnType<typeof vi.fn>).mock.calls
      const restoreHandler = eventHandlers.find((call: any[]) => call[0] === 'restore-history-tab')?.[1]

      expect(restoreHandler).toBeDefined()

      if (restoreHandler) {
        restoreHandler()
        await nextTick()
        await nextTick()
        await new Promise((resolve) => setTimeout(resolve, 200)) // Wait for refresh

        // Should reload conversations
        expect(mockGetTaskList.mock.calls.length).toBeGreaterThan(initialCallCount)
      }
    })
  })

  describe('Error Handling', () => {
    it('should handle loadConversations errors gracefully', async () => {
      mockGetTaskList.mockRejectedValueOnce(new Error('Load failed'))

      wrapper = createWrapper()
      await nextTick()
      await nextTick()

      // Should not crash - logger routes through window.api.log
      // The component handles errors gracefully
    })

    it('should handle deleteConversation errors gracefully', async () => {
      const mockData = createMockTaskList(3)
      mockGetTaskList.mockResolvedValueOnce(mockTaskListResponse(mockData))
      mockSendToMain.mockRejectedValueOnce(new Error('Delete failed'))

      wrapper = createWrapper()
      await nextTick()
      await nextTick()
      await new Promise((resolve) => setTimeout(resolve, 100)) // Wait for async operations

      const conversationItems = wrapper.findAll('.conversation-item')
      expect(conversationItems.length).toBeGreaterThan(0)
      const deleteBtn = conversationItems[0].find('.delete-btn')
      await deleteBtn.trigger('click')
      await nextTick()

      // Should not crash - logger routes through window.api.log
      // The component handles errors gracefully
    })
  })

  describe('Exposed Methods', () => {
    it('should expose loadConversations method', async () => {
      wrapper = createWrapper()
      await nextTick()

      const vm = wrapper.vm as any
      expect(typeof vm.loadConversations).toBe('function')
    })

    it('should expose setActiveConversation method', async () => {
      wrapper = createWrapper()
      await nextTick()

      const vm = wrapper.vm as any
      expect(typeof vm.setActiveConversation).toBe('function')
    })

    it('should allow manual refresh via loadConversations', async () => {
      const mockData = createMockTaskList(5)
      mockGetTaskList.mockResolvedValue(mockTaskListResponse(mockData))

      wrapper = createWrapper()
      await nextTick()
      await nextTick()
      await new Promise((resolve) => setTimeout(resolve, 200)) // Wait for initial load to complete

      const initialCallCount = mockGetTaskList.mock.calls.length

      const vm = wrapper.vm as any
      await vm.loadConversations()
      await nextTick()
      await new Promise((resolve) => setTimeout(resolve, 200)) // Wait for refresh

      // Should reload conversations
      expect(mockGetTaskList.mock.calls.length).toBeGreaterThan(initialCallCount)
    })
  })

  describe('Conversation Sorting', () => {
    it('should sort conversations by timestamp (newest first)', async () => {
      const now = Date.now()
      const mockData = [
        {
          id: 'task-1',
          title: 'Oldest',
          favorite: false,
          createdAt: now - 10000,
          updatedAt: now - 10000
        },
        {
          id: 'task-2',
          title: 'Newest',
          favorite: false,
          createdAt: now,
          updatedAt: now
        },
        {
          id: 'task-3',
          title: 'Middle',
          favorite: false,
          createdAt: now - 5000,
          updatedAt: now - 5000
        }
      ]
      mockGetTaskList.mockResolvedValueOnce(mockTaskListResponse(mockData))

      wrapper = createWrapper()
      await nextTick()
      await nextTick()
      await new Promise((resolve) => setTimeout(resolve, 100)) // Wait for async operations

      const conversationItems = wrapper.findAll('.conversation-item')
      expect(conversationItems.length).toBe(3)

      // First item should be newest
      const firstTitle = conversationItems[0].find('.conversation-title').text()
      expect(firstTitle).toBe('Newest')
    })
  })
})
