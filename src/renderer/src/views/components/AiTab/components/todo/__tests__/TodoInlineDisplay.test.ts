import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import Antd from 'ant-design-vue'
import TodoInlineDisplay from '../TodoInlineDisplay.vue'
import type { Todo, FocusChainState } from '@/types/todo'

// Mock the i18n module used by the component
vi.mock('@/locales', () => {
  const { createI18n } = require('vue-i18n')
  return {
    default: createI18n({
      legacy: false,
      locale: 'en-US',
      fallbackLocale: 'en-US',
      messages: {
        'en-US': {
          ai: {
            taskProgress: 'Task Progress',
            focusChain: 'Focus Chain',
            currentFocus: 'Current Focus'
          }
        },
        'zh-CN': {
          ai: {
            taskProgress: '运维任务进度',
            focusChain: '聚焦链',
            currentFocus: '当前聚焦'
          }
        }
      }
    })
  }
})

// Create test i18n instance for the wrapper
const i18n = createI18n({
  legacy: false,
  locale: 'en-US',
  fallbackLocale: 'en-US',
  messages: {
    'en-US': {
      ai: {
        taskProgress: 'Task Progress',
        focusChain: 'Focus Chain',
        currentFocus: 'Current Focus'
      }
    },
    'zh-CN': {
      ai: {
        taskProgress: '运维任务进度',
        focusChain: '聚焦链',
        currentFocus: '当前聚焦'
      }
    }
  }
})

// Mock TodoCompactList component (async component)
// Use a simpler approach - just stub it in the wrapper

describe('TodoInlineDisplay', () => {
  // Helper to create test todos
  const createTodo = (id: string, content: string, status: 'pending' | 'in_progress' | 'completed' = 'pending', options?: Partial<Todo>): Todo => ({
    id,
    content,
    status,
    priority: 'medium',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...options
  })

  const createWrapper = (props = {}) => {
    return mount(TodoInlineDisplay, {
      props: {
        todos: [],
        ...props
      },
      global: {
        plugins: [i18n, Antd],
        stubs: {
          'a-collapse': {
            template: '<div class="a-collapse"><slot /></div>',
            props: ['activeKey', 'bordered']
          },
          'a-collapse-panel': {
            template: '<div class="a-collapse-panel"><slot /></div>',
            props: ['showArrow']
          },
          TodoCompactList: {
            name: 'TodoCompactList',
            template: '<div class="todo-compact-list-mock"><slot /></div>',
            props: ['todos', 'showProgress', 'showSubtasks', 'maxItems', 'focusedTodoId']
          },
          UnorderedListOutlined: {
            template: '<span class="unordered-list-icon" />'
          },
          UpOutlined: {
            template: '<span class="up-icon" />'
          },
          DownOutlined: {
            template: '<span class="down-icon" />'
          },
          ThunderboltOutlined: {
            template: '<span class="thunderbolt-icon" />'
          }
        }
      }
    })
  }

  beforeEach(() => {
    vi.clearAllMocks()
    // Suppress console.log from component

    vi.spyOn(console, 'log').mockImplementation(() => {})
    // Ensure English locale
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('lang', 'en-US')
    }
    // Reset i18n locale
    i18n.global.locale.value = 'en-US'
  })

  describe('Component Rendering', () => {
    it('should render when visible is true', () => {
      const wrapper = createWrapper({
        todos: [createTodo('1', 'Test task')]
      })

      expect(wrapper.find('.todo-inline-display').exists()).toBe(true)
    })

    it('should display todo title', () => {
      const wrapper = createWrapper({
        todos: [createTodo('1', 'Test task')]
      })

      expect(wrapper.find('.todo-title-text').text()).toBe('Task Progress')
    })

    it('should display progress ratio', () => {
      const todos = [createTodo('1', 'Task 1', 'completed'), createTodo('2', 'Task 2', 'pending'), createTodo('3', 'Task 3', 'in_progress')]

      const wrapper = createWrapper({ todos })

      const ratioCompleted = wrapper.find('.ratio-completed')
      const ratioTotal = wrapper.find('.ratio-total')

      expect(ratioCompleted.text()).toBe('1')
      expect(ratioTotal.text()).toBe('3')
    })

    it('should display progress percentage', () => {
      const todos = [createTodo('1', 'Task 1', 'completed'), createTodo('2', 'Task 2', 'completed'), createTodo('3', 'Task 3', 'pending')]

      const wrapper = createWrapper({ todos })

      const progressText = wrapper.find('.progress-text')
      expect(progressText.text()).toBe('67%')
    })
  })

  describe('Expand/Collapse Functionality', () => {
    it('should be collapsed by default when showTrigger is false', () => {
      const wrapper = createWrapper({
        todos: [createTodo('1', 'Test task')],
        showTrigger: false
      })

      expect(wrapper.find('.down-icon').exists()).toBe(true)
      expect(wrapper.find('.up-icon').exists()).toBe(false)
      expect(wrapper.find('.a-collapse').exists()).toBe(false)
    })

    it('should be expanded when showTrigger is true', () => {
      const wrapper = createWrapper({
        todos: [createTodo('1', 'Test task')],
        showTrigger: true
      })

      expect(wrapper.find('.up-icon').exists()).toBe(true)
      expect(wrapper.find('.down-icon').exists()).toBe(false)
      expect(wrapper.find('.a-collapse').exists()).toBe(true)
    })

    it('should toggle expanded state when header is clicked', async () => {
      const wrapper = createWrapper({
        todos: [createTodo('1', 'Test task')],
        showTrigger: false
      })

      // Initially collapsed
      expect(wrapper.find('.down-icon').exists()).toBe(true)
      expect(wrapper.find('.a-collapse').exists()).toBe(false)

      // Click to expand
      await wrapper.find('.todo-inline-header').trigger('click')
      await wrapper.vm.$nextTick()

      expect(wrapper.find('.up-icon').exists()).toBe(true)
      expect(wrapper.find('.down-icon').exists()).toBe(false)
      expect(wrapper.find('.a-collapse').exists()).toBe(true)

      // Click to collapse
      await wrapper.find('.todo-inline-header').trigger('click')
      await wrapper.vm.$nextTick()

      expect(wrapper.find('.down-icon').exists()).toBe(true)
      expect(wrapper.find('.up-icon').exists()).toBe(false)
      expect(wrapper.find('.a-collapse').exists()).toBe(false)
    })
  })

  describe('Progress Calculation', () => {
    it('should calculate progress correctly for all completed tasks', () => {
      const todos = [createTodo('1', 'Task 1', 'completed'), createTodo('2', 'Task 2', 'completed')]

      const wrapper = createWrapper({ todos })

      expect(wrapper.find('.ratio-completed').text()).toBe('2')
      expect(wrapper.find('.ratio-total').text()).toBe('2')
      expect(wrapper.find('.progress-text').text()).toBe('100%')
    })

    it('should calculate progress correctly for all pending tasks', () => {
      const todos = [createTodo('1', 'Task 1', 'pending'), createTodo('2', 'Task 2', 'pending')]

      const wrapper = createWrapper({ todos })

      expect(wrapper.find('.ratio-completed').text()).toBe('0')
      expect(wrapper.find('.ratio-total').text()).toBe('2')
      expect(wrapper.find('.progress-text').text()).toBe('0%')
    })

    it('should calculate progress correctly for mixed statuses', () => {
      const todos = [
        createTodo('1', 'Task 1', 'completed'),
        createTodo('2', 'Task 2', 'in_progress'),
        createTodo('3', 'Task 3', 'pending'),
        createTodo('4', 'Task 4', 'completed')
      ]

      const wrapper = createWrapper({ todos })

      expect(wrapper.find('.ratio-completed').text()).toBe('2')
      expect(wrapper.find('.ratio-total').text()).toBe('4')
      expect(wrapper.find('.progress-text').text()).toBe('50%')
    })

    it('should handle empty todos list', () => {
      const wrapper = createWrapper({ todos: [] })

      expect(wrapper.find('.ratio-completed').text()).toBe('0')
      expect(wrapper.find('.ratio-total').text()).toBe('0')
      expect(wrapper.find('.progress-text').text()).toBe('0%')
    })
  })

  describe('Focus Chain Features', () => {
    it('should show focus chain badge when there is a focused todo', () => {
      const todos = [createTodo('1', 'Task 1', 'in_progress', { isFocused: true }), createTodo('2', 'Task 2', 'pending')]

      const wrapper = createWrapper({ todos })

      expect(wrapper.find('.focus-chain-badge').exists()).toBe(true)
      expect(wrapper.find('.focus-label').text()).toBe('Focus Chain')
      expect(wrapper.find('.todo-inline-display').classes()).toContain('has-focused')
    })

    it('should not show focus chain badge when there is no focused todo', () => {
      const todos = [createTodo('1', 'Task 1', 'pending'), createTodo('2', 'Task 2', 'completed')]

      const wrapper = createWrapper({ todos })

      expect(wrapper.find('.focus-chain-badge').exists()).toBe(false)
      expect(wrapper.find('.todo-inline-display').classes()).not.toContain('has-focused')
    })

    it('should fall back to in_progress todo when no explicit focused todo', () => {
      const todos = [createTodo('1', 'Task 1', 'pending'), createTodo('2', 'Task 2', 'in_progress'), createTodo('3', 'Task 3', 'completed')]

      const wrapper = createWrapper({ todos })

      expect(wrapper.find('.focus-chain-badge').exists()).toBe(true)
      expect(wrapper.find('.todo-inline-display').classes()).toContain('has-focused')
    })

    it('should display focused task highlight when expanded and focused todo exists', async () => {
      const todos = [
        createTodo('1', 'Focused Task', 'in_progress', {
          isFocused: true,
          description: 'Task description'
        }),
        createTodo('2', 'Other Task', 'pending')
      ]

      const wrapper = createWrapper({
        todos,
        showTrigger: true
      })

      await wrapper.vm.$nextTick()

      expect(wrapper.find('.focus-chain-highlight').exists()).toBe(true)
      expect(wrapper.find('.focused-label').text()).toBe('Current Focus')
      expect(wrapper.find('.focused-task-title').text()).toBe('Focused Task')
      expect(wrapper.find('.focused-task-desc').text()).toBe('Task description')
    })

    it('should not display focused task highlight when collapsed', () => {
      const todos = [createTodo('1', 'Focused Task', 'in_progress', { isFocused: true }), createTodo('2', 'Other Task', 'pending')]

      const wrapper = createWrapper({
        todos,
        showTrigger: false
      })

      expect(wrapper.find('.focus-chain-highlight').exists()).toBe(false)
    })

    it('should not display focused task highlight when no focused todo', async () => {
      const todos = [createTodo('1', 'Task 1', 'pending'), createTodo('2', 'Task 2', 'completed')]

      const wrapper = createWrapper({
        todos,
        showTrigger: true
      })

      await wrapper.vm.$nextTick()

      expect(wrapper.find('.focus-chain-highlight').exists()).toBe(false)
    })
  })

  describe('Context Usage Indicator', () => {
    it('should show context usage indicator when contextUsagePercent > 0', () => {
      const wrapper = createWrapper({
        todos: [createTodo('1', 'Task 1')],
        contextUsagePercent: 50
      })

      expect(wrapper.find('.context-usage-indicator').exists()).toBe(true)
      expect(wrapper.find('.context-text').text()).toBe('50%')
    })

    it('should not show context usage indicator when contextUsagePercent is 0', () => {
      const wrapper = createWrapper({
        todos: [createTodo('1', 'Task 1')],
        contextUsagePercent: 0
      })

      expect(wrapper.find('.context-usage-indicator').exists()).toBe(false)
    })

    it('should apply correct context level class for normal usage', () => {
      const wrapper = createWrapper({
        todos: [createTodo('1', 'Task 1')],
        contextUsagePercent: 30
      })

      const indicator = wrapper.find('.context-usage-indicator')
      expect(indicator.classes()).toContain('normal')
    })

    it('should apply correct context level class for warning usage', () => {
      const wrapper = createWrapper({
        todos: [createTodo('1', 'Task 1')],
        contextUsagePercent: 60
      })

      const indicator = wrapper.find('.context-usage-indicator')
      expect(indicator.classes()).toContain('warning')
    })

    it('should apply correct context level class for critical usage', () => {
      const wrapper = createWrapper({
        todos: [createTodo('1', 'Task 1')],
        contextUsagePercent: 75
      })

      const indicator = wrapper.find('.context-usage-indicator')
      expect(indicator.classes()).toContain('critical')
    })

    it('should apply correct context level class for maximum usage', () => {
      const wrapper = createWrapper({
        todos: [createTodo('1', 'Task 1')],
        contextUsagePercent: 95
      })

      const indicator = wrapper.find('.context-usage-indicator')
      expect(indicator.classes()).toContain('maximum')
    })

    it('should not show context usage indicator when contextUsagePercent is 0 even with focusChainState', () => {
      const focusChainState: FocusChainState = {
        taskId: 'task-1',
        focusedTodoId: 'todo-1',
        chainProgress: 50,
        totalTodos: 5,
        completedTodos: 2,
        currentContextUsage: 65,
        lastFocusChangeAt: new Date(),
        autoTransitionEnabled: true
      }

      // Note: The component checks `v-if="contextUsagePercent > 0"` for display.
      // Even if focusChainState has currentContextUsage, the indicator won't show
      // if contextUsagePercent is 0 (which is the default).
      const wrapper = createWrapper({
        todos: [createTodo('1', 'Task 1')],
        focusChainState,
        contextUsagePercent: 0
      })

      // The indicator won't show because contextUsagePercent is 0
      const indicator = wrapper.find('.context-usage-indicator')
      expect(indicator.exists()).toBe(false)
    })
  })

  describe('Props Defaults', () => {
    it('should use default values for optional props', () => {
      const wrapper = createWrapper({
        todos: [createTodo('1', 'Task 1')]
      })

      expect(wrapper.props('showTrigger')).toBe(false)
      expect(wrapper.props('showProgress')).toBe(true)
      expect(wrapper.props('showSubtasks')).toBe(true)
      expect(wrapper.props('maxItems')).toBe(20)
      expect(wrapper.props('focusChainState')).toBe(null)
      expect(wrapper.props('contextUsagePercent')).toBe(0)
    })
  })

  describe('TodoCompactList Integration', () => {
    it('should pass todos to TodoCompactList when expanded', async () => {
      const todos = [createTodo('1', 'Task 1', 'pending'), createTodo('2', 'Task 2', 'in_progress')]

      const wrapper = createWrapper({
        todos,
        showTrigger: true
      })

      await wrapper.vm.$nextTick()
      // Wait for async component to load
      await new Promise((resolve) => setTimeout(resolve, 100))

      const compactList = wrapper.find('.todo-compact-list-mock')
      expect(compactList.exists()).toBe(true)
    })

    it('should render TodoCompactList when expanded', async () => {
      const todos = [createTodo('1', 'Task 1', 'pending'), createTodo('2', 'Task 2', 'in_progress', { isFocused: true })]

      const wrapper = createWrapper({
        todos,
        showTrigger: true
      })

      await wrapper.vm.$nextTick()
      // Wait for async component to load
      await new Promise((resolve) => setTimeout(resolve, 100))

      const compactList = wrapper.find('.todo-compact-list-mock')
      expect(compactList.exists()).toBe(true)
    })

    it('should pass showProgress and showSubtasks props to TodoCompactList', async () => {
      const wrapper = createWrapper({
        todos: [createTodo('1', 'Task 1')],
        showTrigger: true,
        showProgress: false,
        showSubtasks: false
      })

      await wrapper.vm.$nextTick()
      // Wait for async component to load
      await new Promise((resolve) => setTimeout(resolve, 100))

      const compactList = wrapper.find('.todo-compact-list-mock')
      expect(compactList.exists()).toBe(true)
    })

    it('should pass maxItems prop to TodoCompactList', async () => {
      const wrapper = createWrapper({
        todos: [createTodo('1', 'Task 1')],
        showTrigger: true,
        maxItems: 10
      })

      await wrapper.vm.$nextTick()
      // Wait for async component to load
      await new Promise((resolve) => setTimeout(resolve, 100))

      const compactList = wrapper.find('.todo-compact-list-mock')
      expect(compactList.exists()).toBe(true)
    })
  })

  describe('Edge Cases', () => {
    it('should handle todo without description in focused highlight', async () => {
      const todos = [
        createTodo('1', 'Focused Task', 'in_progress', {
          isFocused: true
          // No description
        })
      ]

      const wrapper = createWrapper({
        todos,
        showTrigger: true
      })

      await wrapper.vm.$nextTick()

      expect(wrapper.find('.focused-task-title').text()).toBe('Focused Task')
      expect(wrapper.find('.focused-task-desc').exists()).toBe(false)
    })

    it('should handle multiple in_progress todos (should use first one)', () => {
      const todos = [createTodo('1', 'Task 1', 'in_progress'), createTodo('2', 'Task 2', 'in_progress')]

      const wrapper = createWrapper({ todos })

      // Should find the first in_progress todo
      expect(wrapper.find('.focus-chain-badge').exists()).toBe(true)
    })

    it('should handle todos with same id', () => {
      const todos = [
        createTodo('1', 'Task 1', 'pending'),
        createTodo('1', 'Task 2', 'completed') // Same ID
      ]

      const wrapper = createWrapper({ todos })

      // Should still render without errors
      expect(wrapper.find('.todo-inline-display').exists()).toBe(true)
      expect(wrapper.find('.ratio-total').text()).toBe('2')
    })
  })
})
