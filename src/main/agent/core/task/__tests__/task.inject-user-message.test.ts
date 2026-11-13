import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { getAppPath: () => '' },
  BrowserWindow: { fromWebContents: () => null },
  ipcMain: { handle: vi.fn(), on: vi.fn(), once: vi.fn(), removeAllListeners: vi.fn() },
  dialog: { showOpenDialog: vi.fn(async () => ({ canceled: true, filePaths: [] })) }
}))
vi.mock('@storage/db/chaterm.service', () => ({
  ChatermDatabaseService: { getInstance: vi.fn(async () => ({})) }
}))
vi.mock('@storage/database', () => ({ connectAssetInfo: vi.fn(async () => undefined) }))
vi.mock('../../../../ssh/agentHandle', () => ({
  remoteSshConnect: vi.fn(),
  remoteSshDisconnect: vi.fn(),
  isWakeupSession: vi.fn().mockReturnValue(false),
  openWakeupShell: vi.fn(),
  findWakeupConnectionInfoByHost: vi.fn().mockReturnValue(null)
}))
vi.mock('@integrations/remote-terminal', () => ({
  RemoteTerminalManager: class {
    disposeAll = vi.fn()
  }
}))
vi.mock('@integrations/local-terminal', () => ({
  LocalTerminalManager: class {},
  LocalCommandProcess: class {}
}))
vi.mock('@services/telemetry/TelemetryService', () => ({ telemetryService: { captureTaskFeedback: vi.fn() } }))
vi.mock('@api/index', () => ({
  ApiHandler: class {},
  buildApiHandler: vi.fn(() => ({}))
}))

import { Task } from '../index'
import { messagesEN } from '../messages'

type Pending = { id: string; text: string; contentParts?: unknown[] }

const createTask = () => {
  const task = Object.create((Task as unknown as { prototype: object }).prototype) as any
  task.taskId = 'task-1'
  task.abort = false
  task.pendingInjectedMessages = [] as Pending[]
  task.isAwaitingCompletionAsk = false
  task.askResponsePayload = undefined
  task.nextUserInputContentParts = undefined
  task.messages = messagesEN
  task.remoteTerminalManager = { disposeAll: vi.fn() }
  task.postMessageToWebview = vi.fn().mockResolvedValue(undefined)
  task.clearTodos = vi.fn().mockResolvedValue(undefined)
  task.saveUserMessage = vi.fn().mockResolvedValue(undefined)
  return task
}

describe('Task user message injection', () => {
  let task: any
  const imagePart = { type: 'image', mediaType: 'image/png', data: 'abc' }
  const textPart = { type: 'text', text: 'check disk' }

  beforeEach(() => {
    vi.clearAllMocks()
    task = createTask()
  })

  describe('injectUserMessage', () => {
    it('keeps the message pending while the agent works', async () => {
      await task.injectUserMessage('q1', 'check disk', [textPart])

      expect(task.pendingInjectedMessages).toEqual([{ id: 'q1', text: 'check disk', contentParts: [textPart] }])
      expect(task.askResponsePayload).toBeUndefined()
      expect(task.postMessageToWebview).not.toHaveBeenCalled()
    })

    it('answers the completion ask directly when the agent is already waiting on it', async () => {
      task.isAwaitingCompletionAsk = true
      await task.injectUserMessage('q1', 'check disk', [textPart])

      expect(task.askResponsePayload).toEqual({ response: 'messageResponse', text: 'check disk', contentParts: [textPart] })
      expect(task.nextUserInputContentParts).toEqual([textPart])
      expect(task.pendingInjectedMessages).toEqual([])
      expect(task.clearTodos).toHaveBeenCalledWith('new_user_input')
      expect(task.postMessageToWebview).toHaveBeenCalledWith({ type: 'userMessageInjected', queuedMessageId: 'q1' })
    })

    it('answers with the first message and keeps the rest pending', async () => {
      task.isAwaitingCompletionAsk = true
      await task.injectUserMessage('q1', 'first')
      await task.injectUserMessage('q2', 'second')

      expect(task.askResponsePayload.text).toBe('first')
      expect(task.pendingInjectedMessages.map((m: Pending) => m.id)).toEqual(['q2'])
      expect(task.postMessageToWebview).toHaveBeenCalledTimes(1)
    })
  })

  describe('ask(completion_result)', () => {
    const prepareAsk = (type: string) => {
      task.lastMessageTs = undefined
      task.handleAskPartialMessage = vi.fn(async (_type: string, ref: { value: number }) => {
        task.lastMessageTs = ref.value
      })
      task.resetAskState = () => {
        task.askResponsePayload = undefined
      }
      return task.ask(type, '', false)
    }

    it('consumes a message queued before the ask was reached', async () => {
      task.pendingInjectedMessages.push({ id: 'q1', text: 'check disk', contentParts: [textPart] })

      const reply = await prepareAsk('completion_result')

      expect(reply).toEqual({ response: 'messageResponse', text: 'check disk', contentParts: [textPart] })
      expect(task.postMessageToWebview).toHaveBeenCalledWith({ type: 'userMessageInjected', queuedMessageId: 'q1' })
      expect(task.isAwaitingCompletionAsk).toBe(false)
    })

    it('waits for the user when nothing is queued and clears the waiting flag afterwards', async () => {
      const pending = prepareAsk('completion_result')
      await vi.waitFor(() => expect(task.isAwaitingCompletionAsk).toBe(true))

      await task.injectUserMessage('q1', 'later')
      const reply = await pending

      expect(reply.text).toBe('later')
      expect(task.isAwaitingCompletionAsk).toBe(false)
    })

    it('does not consume queued messages for other asks', async () => {
      task.pendingInjectedMessages.push({ id: 'q1', text: 'check disk' })
      task.askResponsePayload = undefined
      const pending = prepareAsk('followup')
      await new Promise((resolve) => setTimeout(resolve, 20))

      expect(task.isAwaitingCompletionAsk).toBe(false)
      expect(task.pendingInjectedMessages).toHaveLength(1)

      task.askResponsePayload = { response: 'messageResponse', text: 'answer' }
      await expect(pending).resolves.toMatchObject({ text: 'answer' })
    })

    it('clears the waiting flag when the ask is superseded', async () => {
      const pending = prepareAsk('completion_result')
      const outcome = expect(pending).rejects.toThrow('Current ask promise was ignored')
      await vi.waitFor(() => expect(task.isAwaitingCompletionAsk).toBe(true))

      task.lastMessageTs = -1

      await outcome
      expect(task.isAwaitingCompletionAsk).toBe(false)
    })
  })

  describe('drainInjectedMessages', () => {
    it('leaves the content untouched when nothing is pending', async () => {
      const content: unknown[] = []
      await task.drainInjectedMessages(content)

      expect(content).toEqual([])
      expect(task.saveUserMessage).not.toHaveBeenCalled()
      expect(task.postMessageToWebview).not.toHaveBeenCalled()
    })

    it('saves each message, adds it to the request and confirms it to the renderer', async () => {
      task.pendingInjectedMessages.push({ id: 'q1', text: 'check disk', contentParts: [textPart] }, { id: 'q2', text: 'and memory' })
      const content: Array<{ type: string; text: string }> = []

      await task.drainInjectedMessages(content)

      expect(task.saveUserMessage.mock.calls).toEqual([
        ['check disk', [textPart]],
        ['and memory', undefined]
      ])
      expect(content).toHaveLength(2)
      expect(content[0].text).toContain('<user_message>\ncheck disk\n</user_message>')
      expect(content[1].text).toContain('<user_message>\nand memory\n</user_message>')
      expect(task.postMessageToWebview.mock.calls.map(([m]: [{ queuedMessageId: string }]) => m.queuedMessageId)).toEqual(['q1', 'q2'])
      expect(task.pendingInjectedMessages).toEqual([])
    })

    it('merges attachments with the parts already waiting for the next request', async () => {
      task.nextUserInputContentParts = [imagePart]
      task.pendingInjectedMessages.push({ id: 'q1', text: 'check disk', contentParts: [textPart] }, { id: 'q2', text: 'no attachments' })

      await task.drainInjectedMessages([])

      expect(task.nextUserInputContentParts).toEqual([imagePart, textPart])
    })

    it('clears the waiting parts when the drained messages carry none', async () => {
      task.pendingInjectedMessages.push({ id: 'q1', text: 'plain' })

      await task.drainInjectedMessages([])

      expect(task.nextUserInputContentParts).toBeUndefined()
    })
  })

  describe('abort', () => {
    it('drops pending messages on a hard abort', async () => {
      task.pendingInjectedMessages.push({ id: 'q1', text: 'x' })
      await task.abortTask()

      expect(task.pendingInjectedMessages).toEqual([])
    })

    it('drops pending messages on a graceful abort', async () => {
      task.pendingInjectedMessages.push({ id: 'q1', text: 'x' })
      await task.gracefulAbortTask()

      expect(task.pendingInjectedMessages).toEqual([])
      expect(task.abort).toBe(false)
    })
  })
})
