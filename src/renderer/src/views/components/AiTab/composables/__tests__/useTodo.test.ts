import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useTodo } from '../useTodo'
import { todoService } from '@renderer/services/todoService'
import type { Todo, TodoDisplayPreference } from '@renderer/types/todo'

// Mock todoService
vi.mock('@renderer/services/todoService', () => {
  const { ref } = require('vue')
  return {
    todoService: {
      currentTodos: ref([]),
      displayPreference: ref('inline' as TodoDisplayPreference),
      setDisplayPreference: vi.fn(),
      shouldShowTodoAfterMessage: vi.fn(),
      getTodosForMessage: vi.fn(),
      getMarkLatestMessageWithTodoUpdate: vi.fn(),
      clearTodoState: vi.fn(),
      initializeTodos: vi.fn().mockResolvedValue(undefined)
    }
  }
})

describe('useTodo', () => {
  // Helper to create test todos
  const createTodo = (id: string, content: string, status: 'pending' | 'in_progress' | 'completed' = 'pending'): Todo => ({
    id,
    content,
    status,
    priority: 'medium',
    createdAt: new Date(),
    updatedAt: new Date()
  })

  beforeEach(() => {
    vi.clearAllMocks()
    // Reset todoService values
    todoService.currentTodos.value = []
    todoService.displayPreference.value = 'inline'
  })

  describe('currentTodos', () => {
    it('should return current todos from todoService', () => {
      const todos: Todo[] = [createTodo('1', 'Task 1', 'pending'), createTodo('2', 'Task 2', 'in_progress')]
      todoService.currentTodos.value = todos

      const { currentTodos } = useTodo()

      expect(currentTodos.value).toEqual(todos)
    })
  })

  describe('displayPreference', () => {
    it('should return display preference from todoService', () => {
      todoService.displayPreference.value = 'floating'

      const { displayPreference } = useTodo()

      expect(displayPreference.value).toBe('floating')
    })
  })

  describe('setDisplayPreference', () => {
    it('should call todoService.setDisplayPreference with correct preference', () => {
      const { setDisplayPreference } = useTodo()

      setDisplayPreference('floating')

      expect(todoService.setDisplayPreference).toHaveBeenCalledWith('floating')
    })

    it('should update display preference for all valid values', () => {
      const { setDisplayPreference } = useTodo()
      const preferences: TodoDisplayPreference[] = ['inline', 'floating', 'hidden']

      preferences.forEach((pref) => {
        setDisplayPreference(pref)
        expect(todoService.setDisplayPreference).toHaveBeenCalledWith(pref)
      })

      expect(todoService.setDisplayPreference).toHaveBeenCalledTimes(3)
    })
  })

  describe('shouldShowTodoAfterMessage', () => {
    it('should call todoService.shouldShowTodoAfterMessage with message', () => {
      const message = { role: 'assistant', hasTodoUpdate: true }
      vi.mocked(todoService.shouldShowTodoAfterMessage).mockReturnValue(true)

      const { shouldShowTodoAfterMessage } = useTodo()
      const result = shouldShowTodoAfterMessage(message)

      expect(todoService.shouldShowTodoAfterMessage).toHaveBeenCalledWith(message)
      expect(result).toBe(true)
    })

    it('should return false when display preference is hidden', () => {
      const message = { role: 'assistant', hasTodoUpdate: true }
      vi.mocked(todoService.shouldShowTodoAfterMessage).mockReturnValue(false)

      const { shouldShowTodoAfterMessage } = useTodo()
      const result = shouldShowTodoAfterMessage(message)

      expect(result).toBe(false)
    })

    it('should return false when message does not have todo update', () => {
      const message = { role: 'assistant', hasTodoUpdate: false }
      vi.mocked(todoService.shouldShowTodoAfterMessage).mockReturnValue(false)

      const { shouldShowTodoAfterMessage } = useTodo()
      const result = shouldShowTodoAfterMessage(message)

      expect(result).toBe(false)
    })
  })

  describe('getTodosForMessage', () => {
    it('should call todoService.getTodosForMessage with message', () => {
      const todos: Todo[] = [createTodo('1', 'Task')]
      const message = { role: 'assistant', relatedTodos: todos }
      vi.mocked(todoService.getTodosForMessage).mockReturnValue(todos)

      const { getTodosForMessage } = useTodo()
      const result = getTodosForMessage(message)

      expect(todoService.getTodosForMessage).toHaveBeenCalledWith(message)
      expect(result).toEqual(todos)
    })

    it('should return current todos when message has no related todos', () => {
      const currentTodos: Todo[] = [createTodo('1', 'Current Task')]
      const message = { role: 'assistant' }
      vi.mocked(todoService.getTodosForMessage).mockReturnValue(currentTodos)

      const { getTodosForMessage } = useTodo()
      const result = getTodosForMessage(message)

      expect(result).toEqual(currentTodos)
    })
  })

  describe('markLatestMessageWithTodoUpdate', () => {
    it('should return the bound method from todoService', () => {
      const mockMarkFunction = vi.fn()
      vi.mocked(todoService.getMarkLatestMessageWithTodoUpdate).mockReturnValue(mockMarkFunction)

      const { markLatestMessageWithTodoUpdate } = useTodo()

      expect(todoService.getMarkLatestMessageWithTodoUpdate).toHaveBeenCalled()
      expect(markLatestMessageWithTodoUpdate).toBe(mockMarkFunction)
    })

    it('should mark the latest message correctly', () => {
      const messages = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi' },
        { role: 'assistant', content: 'How can I help?' }
      ]
      const todos: Todo[] = [createTodo('1', 'Task')]

      const mockMarkFunction = vi.fn()
      vi.mocked(todoService.getMarkLatestMessageWithTodoUpdate).mockReturnValue(mockMarkFunction)

      const { markLatestMessageWithTodoUpdate } = useTodo()
      markLatestMessageWithTodoUpdate(messages, todos)

      expect(mockMarkFunction).toHaveBeenCalledWith(messages, todos)
    })
  })

  describe('clearTodoState', () => {
    it('should call todoService.clearTodoState', () => {
      const { clearTodoState } = useTodo()

      clearTodoState()

      expect(todoService.clearTodoState).toHaveBeenCalledWith(undefined)
    })

    it('should call todoService.clearTodoState with messages', () => {
      const messages = [{ role: 'assistant', hasTodoUpdate: true, relatedTodos: [] }]

      const { clearTodoState } = useTodo()
      clearTodoState(messages)

      expect(todoService.clearTodoState).toHaveBeenCalledWith(messages)
    })

    it('should clear todo markers from messages', () => {
      const messages = [{ role: 'assistant', hasTodoUpdate: true, relatedTodos: [createTodo('1', 'Task')] }]

      vi.mocked(todoService.clearTodoState).mockImplementation((msgs) => {
        if (Array.isArray(msgs)) {
          msgs.forEach((msg) => {
            if (msg.hasTodoUpdate) {
              msg.hasTodoUpdate = false
              delete msg.relatedTodos
            }
          })
        }
      })

      const { clearTodoState } = useTodo()
      clearTodoState(messages)

      expect(messages[0].hasTodoUpdate).toBe(false)
      expect(messages[0].relatedTodos).toBeUndefined()
    })
  })
})
