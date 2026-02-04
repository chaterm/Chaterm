import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useInteractiveInput } from '@/composables/useInteractiveInput'

type InteractionType = 'confirm' | 'password' | 'enter' | 'freeform' | 'select' | 'pager'
type InteractionErrorCode = 'timeout' | 'closed' | 'not-writable' | 'write-failed'

type InteractionSubmitResult = {
  success: boolean
  error?: string
  code?: InteractionErrorCode
}

const createDeferred = <T>() => {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const createDefaultState = () => ({
  visible: true,
  commandId: 'cmd-1',
  taskId: undefined as string | undefined,
  interactionType: 'confirm' as InteractionType,
  promptHint: 'confirm?',
  options: [],
  optionValues: [],
  confirmValues: undefined,
  isSuppressed: false,
  tuiDetected: false,
  tuiMessage: '',
  errorMessage: '',
  isSubmitting: false
})

const createState = (overrides: Partial<ReturnType<typeof createDefaultState>> = {}) => ({
  ...createDefaultState(),
  ...overrides
})

describe('useInteractiveInput', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    globalThis.window = {
      api: {
        submitInteraction: vi.fn()
      }
    } as any
  })

  it('closes non-pager interaction immediately after submit', async () => {
    const deferred = createDeferred<InteractionSubmitResult>()
    const submitInteractionMock = vi.mocked(globalThis.window.api.submitInteraction)
    submitInteractionMock.mockReturnValue(deferred.promise)

    const { interactionState, submitInteraction } = useInteractiveInput()
    interactionState.value = createState({ interactionType: 'confirm', visible: true })

    const submitPromise = submitInteraction('cmd-1', 'y', true, 'confirm')

    expect(interactionState.value.visible).toBe(false)

    deferred.resolve({ success: false, error: 'write-failed' })
    await submitPromise
  })

  it('returns interaction state scoped to a tab id', () => {
    const hook = useInteractiveInput() as any

    const stateA = createState({ commandId: 'cmd_tab-a_1710000000000_abcd12', taskId: 'tab-a', visible: true })

    // Set the interactionState directly (single state model)
    hook.interactionState.value = stateA

    expect(hook.getInteractionStateForTab('tab-a')?.commandId).toBe(stateA.commandId)
    expect(hook.getInteractionStateForTab('tab-b')).toBeUndefined()
    expect(hook.getInteractionStateForTab('tab-c')).toBeUndefined()
  })

  it('does not infer taskId from commandId', () => {
    const hook = useInteractiveInput() as any

    const stateA = createState({ commandId: 'cmd_tab-a_1710000000000_abcd12', visible: true })
    // No taskId set in state
    hook.interactionState.value = stateA

    expect(hook.getInteractionStateForTab('tab-a')).toBeUndefined()
  })
})
