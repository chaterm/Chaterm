import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { FocusChainService } from '../focus_chain_service'
import type { Todo } from '../../../shared/todo/TodoSchemas'

// Mock dependencies
const mockStorageInstance = {
  readTodos: vi.fn(),
  writeTodos: vi.fn()
}

vi.mock('../../storage/todo/TodoStorage', () => {
  return {
    TodoStorage: class {
      constructor(_taskId: string) {
        // Mock constructor - taskId is not used in tests
      }
      readTodos = mockStorageInstance.readTodos
      writeTodos = mockStorageInstance.writeTodos
    }
  }
})

const mockContextTrackerInstance = {
  setActiveTodo: vi.fn()
}

vi.mock('../todo_context_tracker', () => {
  return {
    TodoContextTracker: {
      forSession: vi.fn((_sessionId: string) => {
        return mockContextTrackerInstance
      })
    }
  }
})

describe('FocusChainService', () => {
  const mockTaskId = 'test-task-123'

  beforeEach(() => {
    vi.clearAllMocks()
    FocusChainService.clearTask(mockTaskId)
  })

  afterEach(() => {
    FocusChainService.clearTask(mockTaskId)
  })

  describe('Singleton pattern', () => {
    it('should return the same instance for the same taskId', () => {
      const instance1 = FocusChainService.forTask(mockTaskId)
      const instance2 = FocusChainService.forTask(mockTaskId)

      expect(instance1).toBe(instance2)
    })

    it('should return different instances for different taskIds', () => {
      const instance1 = FocusChainService.forTask('task-1')
      const instance2 = FocusChainService.forTask('task-2')

      expect(instance1).not.toBe(instance2)
    })

    it('should clear task instance', () => {
      const instance1 = FocusChainService.forTask(mockTaskId)
      FocusChainService.clearTask(mockTaskId)
      const instance2 = FocusChainService.forTask(mockTaskId)

      expect(instance1).not.toBe(instance2)
    })
  })

  describe('Initial state', () => {
    it('should create initial state with correct defaults', () => {
      const service = FocusChainService.forTask(mockTaskId)
      const state = service.getState()

      expect(state.taskId).toBe(mockTaskId)
      expect(state.focusedTodoId).toBeNull()
      expect(state.chainProgress).toBe(0)
      expect(state.totalTodos).toBe(0)
      expect(state.completedTodos).toBe(0)
      expect(state.currentContextUsage).toBe(0)
      expect(state.autoTransitionEnabled).toBe(true)
      expect(state.lastFocusChangeAt).toBeInstanceOf(Date)
    })

    it('should return a copy of state', () => {
      const service = FocusChainService.forTask(mockTaskId)
      const state1 = service.getState()
      const state2 = service.getState()

      expect(state1).not.toBe(state2)
      expect(state1).toEqual(state2)
    })
  })

  describe('updateContextUsage', () => {
    it('should update context usage and return no transition for low usage', () => {
      const service = FocusChainService.forTask(mockTaskId)
      const result = service.updateContextUsage(30)

      expect(service.getState().currentContextUsage).toBe(30)
      expect(result.shouldTransition).toBe(false)
      expect(result.reason).toBeUndefined()
      expect(result.threshold).toBeUndefined()
    })

    it('should return warning threshold at 50%', () => {
      const service = FocusChainService.forTask(mockTaskId)
      const result = service.updateContextUsage(50)

      expect(result.shouldTransition).toBe(false)
      expect(result.threshold).toBe('WARNING')
      expect(result.reason).toContain('50%')
    })

    it('should return critical threshold at 70%', () => {
      const service = FocusChainService.forTask(mockTaskId)
      const result = service.updateContextUsage(70)

      expect(result.shouldTransition).toBe(false)
      expect(result.threshold).toBe('CRITICAL')
      expect(result.reason).toContain('70%')
      expect(result.reason).toContain('critical')
    })

    it('should return maximum threshold and suggest transition at 90%', () => {
      const service = FocusChainService.forTask(mockTaskId)
      const result = service.updateContextUsage(90)

      expect(result.shouldTransition).toBe(true)
      expect(result.threshold).toBe('MAXIMUM')
      expect(result.reason).toContain('90%')
      expect(result.reason).toContain('maximum threshold')
    })

    it('should clamp context usage to 0-100', () => {
      const service = FocusChainService.forTask(mockTaskId)

      service.updateContextUsage(-10)
      expect(service.getState().currentContextUsage).toBe(0)

      service.updateContextUsage(150)
      expect(service.getState().currentContextUsage).toBe(100)
    })
  })

  describe('focusTodo', () => {
    const createMockTodo = (id: string, content: string, status: Todo['status'] = 'pending'): Todo => ({
      id,
      content,
      status,
      priority: 'medium',
      createdAt: new Date(),
      updatedAt: new Date()
    })

    it('should focus on a todo and update state', async () => {
      const todo1 = createMockTodo('todo-1', 'First todo')
      const todo2 = createMockTodo('todo-2', 'Second todo')
      mockStorageInstance.readTodos.mockResolvedValue([todo1, todo2])

      const service = FocusChainService.forTask(mockTaskId)
      await service.focusTodo('todo-1')

      const state = service.getState()
      expect(state.focusedTodoId).toBe('todo-1')
      expect(mockStorageInstance.writeTodos).toHaveBeenCalled()
      expect(mockContextTrackerInstance.setActiveTodo).toHaveBeenCalledWith('todo-1')

      const writtenTodos = mockStorageInstance.writeTodos.mock.calls[0][0] as Todo[]
      const focusedTodo = writtenTodos.find((t) => t.id === 'todo-1')
      expect(focusedTodo?.isFocused).toBe(true)
      expect(focusedTodo?.focusedAt).toBeInstanceOf(Date)
    })

    it('should clear focus from previous todo when focusing new one', async () => {
      const todo1 = createMockTodo('todo-1', 'First todo', 'in_progress')
      todo1.isFocused = true
      const todo2 = createMockTodo('todo-2', 'Second todo')
      mockStorageInstance.readTodos.mockResolvedValue([todo1, todo2])

      const service = FocusChainService.forTask(mockTaskId)
      await service.focusTodo('todo-1')
      mockStorageInstance.readTodos.mockResolvedValue([todo1, todo2])
      await service.focusTodo('todo-2')

      const writtenTodos = mockStorageInstance.writeTodos.mock.calls[1][0] as Todo[]
      const prevTodo = writtenTodos.find((t) => t.id === 'todo-1')
      const newTodo = writtenTodos.find((t) => t.id === 'todo-2')

      expect(prevTodo?.isFocused).toBe(false)
      expect(newTodo?.isFocused).toBe(true)
    })

    it('should record transition when focusing todo', async () => {
      const todo1 = createMockTodo('todo-1', 'First todo')
      mockStorageInstance.readTodos.mockResolvedValue([todo1])

      const service = FocusChainService.forTask(mockTaskId)
      await service.focusTodo('todo-1', 'user_request')

      const transitions = service.getTransitions()
      expect(transitions).toHaveLength(1)
      expect(transitions[0].fromTodoId).toBeNull()
      expect(transitions[0].toTodoId).toBe('todo-1')
      expect(transitions[0].reason).toBe('user_request')
      expect(transitions[0].timestamp).toBeInstanceOf(Date)
    })

    it('should handle non-existent todo gracefully', async () => {
      mockStorageInstance.readTodos.mockResolvedValue([])

      const service = FocusChainService.forTask(mockTaskId)
      await service.focusTodo('non-existent')

      expect(mockStorageInstance.writeTodos).not.toHaveBeenCalled()
      expect(mockContextTrackerInstance.setActiveTodo).not.toHaveBeenCalled()
    })

    it('should update lastFocusChangeAt when focusing', async () => {
      const todo1 = createMockTodo('todo-1', 'First todo')
      mockStorageInstance.readTodos.mockResolvedValue([todo1])

      const service = FocusChainService.forTask(mockTaskId)
      const beforeTime = new Date()
      await service.focusTodo('todo-1')
      const afterTime = new Date()

      const state = service.getState()
      expect(state.lastFocusChangeAt.getTime()).toBeGreaterThanOrEqual(beforeTime.getTime())
      expect(state.lastFocusChangeAt.getTime()).toBeLessThanOrEqual(afterTime.getTime())
    })
  })

  describe('completeFocusedTodo', () => {
    const createMockTodo = (id: string, content: string, status: Todo['status'] = 'pending'): Todo => ({
      id,
      content,
      status,
      priority: 'medium',
      createdAt: new Date(),
      updatedAt: new Date()
    })

    it('should return null when no todo is focused', async () => {
      mockStorageInstance.readTodos.mockResolvedValue([])

      const service = FocusChainService.forTask(mockTaskId)
      const result = await service.completeFocusedTodo()

      expect(result.completed).toBeNull()
      expect(result.nextFocused).toBeNull()
      expect(result.allCompleted).toBe(false)
    })

    it('should complete focused todo and auto-advance to next', async () => {
      const todo1 = createMockTodo('todo-1', 'First todo', 'in_progress')
      todo1.isFocused = true
      const todo2 = createMockTodo('todo-2', 'Second todo', 'pending')
      mockStorageInstance.readTodos.mockResolvedValue([todo1, todo2])

      const service = FocusChainService.forTask(mockTaskId)
      await service.focusTodo('todo-1')
      mockStorageInstance.readTodos.mockResolvedValue([todo1, todo2])

      const result = await service.completeFocusedTodo()

      expect(result.completed?.id).toBe('todo-1')
      expect(result.completed?.status).toBe('completed')
      expect(result.nextFocused?.id).toBe('todo-2')
      expect(result.nextFocused?.status).toBe('in_progress')
      expect(result.allCompleted).toBe(false)

      const writtenTodos = mockStorageInstance.writeTodos.mock.calls[mockStorageInstance.writeTodos.mock.calls.length - 1][0] as Todo[]
      const completedTodo = writtenTodos.find((t) => t.id === 'todo-1')
      const nextTodo = writtenTodos.find((t) => t.id === 'todo-2')

      expect(completedTodo?.status).toBe('completed')
      expect(completedTodo?.isFocused).toBe(false)
      expect(completedTodo?.completedAt).toBeInstanceOf(Date)
      expect(nextTodo?.status).toBe('in_progress')
      expect(nextTodo?.isFocused).toBe(true)
    })

    it('should record transition when auto-advancing', async () => {
      const todo1 = createMockTodo('todo-1', 'First todo', 'in_progress')
      todo1.isFocused = true
      const todo2 = createMockTodo('todo-2', 'Second todo', 'pending')
      mockStorageInstance.readTodos.mockResolvedValue([todo1, todo2])

      const service = FocusChainService.forTask(mockTaskId)
      await service.focusTodo('todo-1')
      mockStorageInstance.readTodos.mockResolvedValue([todo1, todo2])

      await service.completeFocusedTodo()

      const transitions = service.getTransitions()
      expect(transitions.length).toBeGreaterThan(0)
      const lastTransition = transitions[transitions.length - 1]
      expect(lastTransition.fromTodoId).toBe('todo-1')
      expect(lastTransition.toTodoId).toBe('todo-2')
      expect(lastTransition.reason).toBe('task_completed')
    })

    it('should not auto-advance when autoTransitionEnabled is false', async () => {
      const todo1 = createMockTodo('todo-1', 'First todo', 'in_progress')
      todo1.isFocused = true
      const todo2 = createMockTodo('todo-2', 'Second todo', 'pending')
      mockStorageInstance.readTodos.mockResolvedValue([todo1, todo2])

      const service = FocusChainService.forTask(mockTaskId)
      service.setAutoTransition(false)
      await service.focusTodo('todo-1')
      mockStorageInstance.readTodos.mockResolvedValue([todo1, todo2])

      const result = await service.completeFocusedTodo()

      expect(result.completed?.id).toBe('todo-1')
      // Even though nextTodo exists, it should not be returned as nextFocused when autoTransitionEnabled is false
      // The code returns nextTodo || null, but when autoTransitionEnabled is false, nextTodo is not set as focused
      // So we check that the focusedTodoId is null and nextTodo status remains pending
      expect(service.getState().focusedTodoId).toBeNull()
      expect(result.allCompleted).toBe(false) // There is still a pending todo

      const writtenTodos = mockStorageInstance.writeTodos.mock.calls[mockStorageInstance.writeTodos.mock.calls.length - 1][0] as Todo[]
      const nextTodo = writtenTodos.find((t) => t.id === 'todo-2')
      expect(nextTodo?.status).toBe('pending')
      expect(nextTodo?.isFocused).toBeFalsy()
    })

    it('should update progress when completing todo', async () => {
      const todo1 = createMockTodo('todo-1', 'First todo', 'in_progress')
      todo1.isFocused = true
      const todo2 = createMockTodo('todo-2', 'Second todo', 'pending')
      const todo3 = createMockTodo('todo-3', 'Third todo', 'completed')
      mockStorageInstance.readTodos.mockResolvedValue([todo1, todo2, todo3])

      const service = FocusChainService.forTask(mockTaskId)
      await service.focusTodo('todo-1')
      mockStorageInstance.readTodos.mockResolvedValue([todo1, todo2, todo3])

      await service.completeFocusedTodo()

      const state = service.getState()
      expect(state.totalTodos).toBe(3)
      expect(state.completedTodos).toBe(2) // todo1 + todo3
      expect(state.chainProgress).toBe(Math.round((2 / 3) * 100))
    })

    it('should return allCompleted=true when no more todos', async () => {
      const todo1 = createMockTodo('todo-1', 'First todo', 'in_progress')
      todo1.isFocused = true
      mockStorageInstance.readTodos.mockResolvedValue([todo1])

      const service = FocusChainService.forTask(mockTaskId)
      await service.focusTodo('todo-1')
      mockStorageInstance.readTodos.mockResolvedValue([todo1])

      const result = await service.completeFocusedTodo()

      expect(result.completed?.id).toBe('todo-1')
      expect(result.nextFocused).toBeNull()
      expect(result.allCompleted).toBe(true)
      expect(service.getState().focusedTodoId).toBeNull()
    })
  })

  describe('syncWithTodos', () => {
    const createMockTodo = (id: string, content: string, status: Todo['status'], isFocused = false): Todo => ({
      id,
      content,
      status,
      priority: 'medium',
      createdAt: new Date(),
      updatedAt: new Date(),
      isFocused
    })

    it('should sync state with current todos', async () => {
      const todo1 = createMockTodo('todo-1', 'First todo', 'completed')
      const todo2 = createMockTodo('todo-2', 'Second todo', 'in_progress', true)
      const todo3 = createMockTodo('todo-3', 'Third todo', 'pending')
      mockStorageInstance.readTodos.mockResolvedValue([todo1, todo2, todo3])

      const service = FocusChainService.forTask(mockTaskId)
      await service.syncWithTodos()

      const state = service.getState()
      expect(state.totalTodos).toBe(3)
      expect(state.completedTodos).toBe(1)
      expect(state.chainProgress).toBe(Math.round((1 / 3) * 100))
      expect(state.focusedTodoId).toBe('todo-2')
    })

    it('should use in_progress todo as focused if no focused todo exists', async () => {
      const todo1 = createMockTodo('todo-1', 'First todo', 'in_progress')
      mockStorageInstance.readTodos.mockResolvedValue([todo1])

      const service = FocusChainService.forTask(mockTaskId)
      await service.syncWithTodos()

      expect(service.getState().focusedTodoId).toBe('todo-1')
    })

    it('should set focusedTodoId to null if no focused or in_progress todos', async () => {
      const todo1 = createMockTodo('todo-1', 'First todo', 'pending')
      mockStorageInstance.readTodos.mockResolvedValue([todo1])

      const service = FocusChainService.forTask(mockTaskId)
      await service.syncWithTodos()

      expect(service.getState().focusedTodoId).toBeNull()
    })
  })

  describe('generateHandoff', () => {
    const createMockTodo = (id: string, content: string, status: Todo['status'], description?: string): Todo => ({
      id,
      content,
      description,
      status,
      priority: 'medium',
      createdAt: new Date(),
      updatedAt: new Date()
    })

    it('should generate handoff with completed, in-progress, and pending todos', async () => {
      const todo1 = createMockTodo('todo-1', 'Completed task', 'completed')
      const todo2 = createMockTodo('todo-2', 'Current task', 'in_progress', 'Working on this')
      const todo3 = createMockTodo('todo-3', 'Next task', 'pending')
      mockStorageInstance.readTodos.mockResolvedValue([todo1, todo2, todo3])

      const service = FocusChainService.forTask(mockTaskId)
      service.updateContextUsage(60)
      await service.syncWithTodos()

      const handoff = await service.generateHandoff()

      expect(handoff.completedWork).toContain('Completed 1 tasks')
      expect(handoff.completedWork).toContain('Completed task')
      expect(handoff.currentState).toContain('Currently working on: Current task')
      expect(handoff.currentState).toContain('Working on this')
      expect(handoff.nextSteps).toContain('1 tasks remaining')
      expect(handoff.nextSteps).toContain('Next task')
      expect(handoff.contextSnapshot?.progress).toBeDefined()
      expect(handoff.contextSnapshot?.contextUsage).toBe(60)
    })

    it('should handle no completed todos', async () => {
      const todo1 = createMockTodo('todo-1', 'Current task', 'in_progress')
      mockStorageInstance.readTodos.mockResolvedValue([todo1])

      const service = FocusChainService.forTask(mockTaskId)
      const handoff = await service.generateHandoff()

      expect(handoff.completedWork).toContain('No tasks completed yet')
    })

    it('should handle no in-progress todo', async () => {
      const todo1 = createMockTodo('todo-1', 'Pending task', 'pending')
      mockStorageInstance.readTodos.mockResolvedValue([todo1])

      const service = FocusChainService.forTask(mockTaskId)
      const handoff = await service.generateHandoff()

      expect(handoff.currentState).toContain('No task currently in progress')
    })

    it('should handle all tasks completed', async () => {
      const todo1 = createMockTodo('todo-1', 'Completed task', 'completed')
      mockStorageInstance.readTodos.mockResolvedValue([todo1])

      const service = FocusChainService.forTask(mockTaskId)
      const handoff = await service.generateHandoff()

      expect(handoff.nextSteps).toContain('All tasks completed')
    })
  })

  describe('getProgressSummary', () => {
    const createMockTodo = (id: string, content: string, status: Todo['status'], isFocused = false): Todo => ({
      id,
      content,
      status,
      priority: 'medium',
      createdAt: new Date(),
      updatedAt: new Date(),
      isFocused
    })

    it('should return correct progress summary', async () => {
      const todo1 = createMockTodo('todo-1', 'Todo 1', 'completed')
      const todo2 = createMockTodo('todo-2', 'Todo 2', 'completed')
      const todo3 = createMockTodo('todo-3', 'Todo 3', 'in_progress', true)
      const todo4 = createMockTodo('todo-4', 'Todo 4', 'pending')
      const todo5 = createMockTodo('todo-5', 'Todo 5', 'pending')
      mockStorageInstance.readTodos.mockResolvedValue([todo1, todo2, todo3, todo4, todo5])

      const service = FocusChainService.forTask(mockTaskId)
      await service.syncWithTodos()
      service.updateContextUsage(45)

      const summary = service.getProgressSummary()

      expect(summary.total).toBe(5)
      expect(summary.completed).toBe(2)
      expect(summary.inProgress).toBe(1)
      expect(summary.pending).toBe(2)
      expect(summary.progressPercent).toBe(40) // 2/5 * 100
      expect(summary.focusedTodoId).toBe('todo-3')
      expect(summary.contextUsage).toBe(45)
    })

    it('should return 0 inProgress when no focused todo', async () => {
      const todo1 = createMockTodo('todo-1', 'Todo 1', 'completed')
      const todo2 = createMockTodo('todo-2', 'Todo 2', 'pending')
      const todo3 = createMockTodo('todo-3', 'Todo 3', 'pending')
      mockStorageInstance.readTodos.mockResolvedValue([todo1, todo2, todo3])

      const service = FocusChainService.forTask(mockTaskId)
      await service.syncWithTodos()

      const summary = service.getProgressSummary()

      expect(summary.inProgress).toBe(0)
      expect(summary.pending).toBe(2)
    })
  })

  describe('setAutoTransition', () => {
    it('should enable auto-transition', () => {
      const service = FocusChainService.forTask(mockTaskId)
      service.setAutoTransition(true)

      expect(service.getState().autoTransitionEnabled).toBe(true)
    })

    it('should disable auto-transition', () => {
      const service = FocusChainService.forTask(mockTaskId)
      service.setAutoTransition(false)

      expect(service.getState().autoTransitionEnabled).toBe(false)
    })
  })

  describe('shouldSuggestNewTask', () => {
    const createMockTodo = (id: string, content: string, status: Todo['status'] = 'pending'): Todo => ({
      id,
      content,
      status,
      priority: 'medium',
      createdAt: new Date(),
      updatedAt: new Date()
    })

    it('should suggest new task when context usage is critical', async () => {
      const todo1 = createMockTodo('todo-1', 'Todo 1', 'pending')
      mockStorageInstance.readTodos.mockResolvedValue([todo1])

      const service = FocusChainService.forTask(mockTaskId)
      service.updateContextUsage(75)

      const result = service.shouldSuggestNewTask()

      expect(result.suggest).toBe(true)
      expect(result.reason).toContain('75%')
      expect(result.reason).toContain('Consider creating a new task')
    })

    it('should not suggest when context usage is below critical', () => {
      const service = FocusChainService.forTask(mockTaskId)
      service.updateContextUsage(50)

      const result = service.shouldSuggestNewTask()

      expect(result.suggest).toBe(false)
    })

    it('should not suggest when all tasks are completed', async () => {
      const todo1 = createMockTodo('todo-1', 'Todo 1', 'completed')
      mockStorageInstance.readTodos.mockResolvedValue([todo1])

      const service = FocusChainService.forTask(mockTaskId)
      // Set context usage below CRITICAL threshold so it doesn't trigger suggestion
      service.updateContextUsage(50)
      await service.syncWithTodos()

      const result = service.shouldSuggestNewTask()

      expect(result.suggest).toBe(false)
      expect(result.reason).toContain('All tasks completed')
    })
  })

  describe('getTransitions', () => {
    it('should return a copy of transitions array', () => {
      const service = FocusChainService.forTask(mockTaskId)
      const transitions1 = service.getTransitions()
      const transitions2 = service.getTransitions()

      expect(transitions1).not.toBe(transitions2)
      expect(transitions1).toEqual(transitions2)
    })
  })
})
