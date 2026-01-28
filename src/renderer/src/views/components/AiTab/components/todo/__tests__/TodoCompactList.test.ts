import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import TodoCompactList from '../TodoCompactList.vue'
import type { Todo } from '@/types/todo'

// Helper to create test todos
const createTodo = (id: string, content: string, status: Todo['status'] = 'pending', options: Partial<Todo> = {}): Todo => ({
  id,
  content,
  status,
  priority: 'medium',
  createdAt: new Date(),
  updatedAt: new Date(),
  ...options
})

const createWrapper = (props: Record<string, any> = {}) => {
  return mount(TodoCompactList, {
    props: {
      todos: [],
      ...props
    },
    global: {
      stubs: {
        LoadingOutlined: {
          template: '<span class="loading-icon" />'
        },
        BorderOutlined: {
          template: '<span class="border-icon" />'
        },
        MinusOutlined: {
          template: '<span class="minus-icon" />'
        },
        ThunderboltFilled: {
          template: '<span class="thunderbolt-filled-icon" />'
        },
        CheckOutlined: {
          template: '<span class="check-icon" />'
        }
      }
    }
  })
}

describe('TodoCompactList', () => {
  describe('Rendering', () => {
    it('renders todos in order with index numbers', () => {
      const todos = [createTodo('1', 'Task 1'), createTodo('2', 'Task 2'), createTodo('3', 'Task 3')]

      const wrapper = createWrapper({ todos })
      const items = wrapper.findAll('.todo-item')

      expect(items.length).toBe(3)
      expect(items[0].find('.todo-index').text()).toBe('1.')
      expect(items[1].find('.todo-index').text()).toBe('2.')
      expect(items[2].find('.todo-index').text()).toBe('3.')

      expect(items[0].find('.todo-text').text()).toContain('Task 1')
      expect(items[1].find('.todo-text').text()).toContain('Task 2')
      expect(items[2].find('.todo-text').text()).toContain('Task 3')
    })

    it('applies has-description class when description exists', () => {
      const todos = [createTodo('1', 'Task 1', 'pending', { description: 'Desc 1' }), createTodo('2', 'Task 2')]

      const wrapper = createWrapper({ todos })
      const items = wrapper.findAll('.todo-item')

      expect(items[0].classes()).toContain('has-description')
      expect(items[1].classes()).not.toContain('has-description')
    })
  })

  describe('maxItems and visibleTodos', () => {
    it('limits visible todos based on maxItems', () => {
      const todos = [createTodo('1', 'Task 1'), createTodo('2', 'Task 2'), createTodo('3', 'Task 3')]

      const wrapper = createWrapper({
        todos,
        maxItems: 2
      })

      const items = wrapper.findAll('.todo-item')
      expect(items.length).toBe(2)
      expect(items[0].find('.todo-text').text()).toContain('Task 1')
      expect(items[1].find('.todo-text').text()).toContain('Task 2')
    })
  })

  describe('Status classes and icons', () => {
    it('applies correct status classes', () => {
      const todos = [
        createTodo('1', 'Pending Task', 'pending'),
        createTodo('2', 'In Progress Task', 'in_progress'),
        createTodo('3', 'Completed Task', 'completed')
      ]

      const wrapper = createWrapper({ todos })
      const items = wrapper.findAll('.todo-item')

      expect(items[0].classes()).toContain('pending')
      expect(items[1].classes()).toContain('in-progress')
      expect(items[2].classes()).toContain('completed')
    })

    it('uses correct icon component for each status', () => {
      const todos = [
        createTodo('1', 'Pending Task', 'pending'),
        createTodo('2', 'In Progress Task', 'in_progress'),
        createTodo('3', 'Completed Task', 'completed')
      ]

      const wrapper = createWrapper({ todos })

      const pendingIcon = wrapper.findAll('.todo-item')[0].find('.border-icon')
      const inProgressIcon = wrapper.findAll('.todo-item')[1].find('.loading-icon')
      const completedIcon = wrapper.findAll('.todo-item')[2].find('.check-icon')

      expect(pendingIcon.exists()).toBe(true)
      expect(inProgressIcon.exists()).toBe(true)
      expect(completedIcon.exists()).toBe(true)
    })
  })

  describe('Focus logic', () => {
    it('marks todo as focused when focusedTodoId matches', () => {
      const todos = [createTodo('1', 'Task 1'), createTodo('2', 'Task 2')]

      const wrapper = createWrapper({
        todos,
        focusedTodoId: '2'
      })

      const items = wrapper.findAll('.todo-item')
      expect(items[1].classes()).toContain('is-focused')
      expect(items[1].find('.focus-badge').exists()).toBe(true)
      expect(items[1].find('.status-icon.focused-icon').exists()).toBe(true)
    })

    it('marks todo as focused when todo has isFocused flag and no explicit focusedTodoId', () => {
      const todos = [createTodo('1', 'Task 1'), createTodo('2', 'Task 2', 'pending', { isFocused: true })]

      const wrapper = createWrapper({ todos })
      const items = wrapper.findAll('.todo-item')

      expect(items[1].classes()).toContain('is-focused')
      expect(items[1].find('.focus-badge').exists()).toBe(true)
    })

    it('falls back to in_progress status as focused when no explicit focus and no isFocused flag', () => {
      const todos = [createTodo('1', 'Task 1', 'pending'), createTodo('2', 'Task 2', 'in_progress'), createTodo('3', 'Task 3', 'completed')]

      const wrapper = createWrapper({ todos })
      const items = wrapper.findAll('.todo-item')

      expect(items[1].classes()).toContain('is-focused')
      expect(items[1].find('.focus-badge').exists()).toBe(true)
    })

    it('does not treat in_progress as focused when focusedTodoId is set but does not match', () => {
      const todos = [createTodo('1', 'Task 1', 'in_progress'), createTodo('2', 'Task 2', 'pending')]

      const wrapper = createWrapper({
        todos,
        focusedTodoId: 'non-existing-id'
      })

      const items = wrapper.findAll('.todo-item')
      expect(items[0].classes()).not.toContain('is-focused')
      expect(items[0].find('.focus-badge').exists()).toBe(false)
    })
  })

  describe('Subtasks rendering', () => {
    it('renders subtasks when showSubtasks is true', () => {
      const todos = [
        createTodo('1', 'Task 1', 'pending', {
          subtasks: [
            {
              id: 's1',
              content: 'Subtask 1',
              description: 'Subtask 1 desc',
              toolCalls: []
              // Type cast for Date fields not required on Subtask
            }
          ]
        })
      ]

      const wrapper = createWrapper({
        todos,
        showSubtasks: true
      })

      const subtasksContainer = wrapper.find('.subtasks')
      expect(subtasksContainer.exists()).toBe(true)

      const subtaskItems = subtasksContainer.findAll('.subtask-item')
      expect(subtaskItems.length).toBe(1)
      expect(subtaskItems[0].text()).toContain('Subtask 1')
      expect(subtaskItems[0].text()).toContain('Subtask 1 desc')
      expect(subtaskItems[0].find('.minus-icon').exists()).toBe(true)
    })

    it('does not render subtasks when showSubtasks is false', () => {
      const todos = [
        createTodo('1', 'Task 1', 'pending', {
          subtasks: [
            {
              id: 's1',
              content: 'Subtask 1'
            }
          ]
        })
      ]

      const wrapper = createWrapper({
        todos,
        showSubtasks: false
      })

      expect(wrapper.find('.subtasks').exists()).toBe(false)
    })
  })
})
