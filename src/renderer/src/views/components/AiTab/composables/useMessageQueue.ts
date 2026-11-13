import { isProxy, toRaw } from 'vue'
import { v4 as uuidv4 } from 'uuid'
import type { ContentPart } from '@shared/WebviewMessage'
import type { ChatMessage } from '../types'
import { useSessionState, type ChatTab, type QueuedMessage } from './useSessionState'

const logger = createRendererLogger('ai.messageQueue')

export interface UseMessageQueueOptions {
  sendMessageWithContent: (
    userContent: string,
    sendType: string,
    tabId?: string,
    truncateAtMessageTs?: number,
    contentParts?: ContentPart[]
  ) => Promise<unknown>
  clearTodoState: (messages: ChatMessage[]) => void
  currentTodos: { value: unknown[] }
  scrollToBottom: (force?: boolean) => void
}

const toRawParts = (parts: ContentPart[]): ContentPart[] => parts.map((part) => (isProxy(part) ? (toRaw(part) as ContentPart) : part))

/**
 * Messages typed while the agent is running wait here instead of interrupting it.
 * They are sent when the turn completes, or merged into the next LLM request when
 * the user chooses to send them immediately.
 */
export function useMessageQueue(options: UseMessageQueueOptions) {
  const { sendMessageWithContent, clearTodoState, currentTodos, scrollToBottom } = options
  const { chatTabs, currentChatId, currentSession, chatInputParts } = useSessionState()

  const findTab = (tabId: string): ChatTab | undefined => chatTabs.value.find((tab) => tab.id === tabId)

  const enqueue = (content: string, contentParts: ContentPart[]) => {
    currentSession.value?.messageQueue.push({ id: uuidv4(), content, contentParts, injecting: false })
  }

  const remove = (id: string) => {
    const queue = currentSession.value?.messageQueue
    const index = queue?.findIndex((item) => item.id === id) ?? -1
    if (queue && index !== -1 && !queue[index].injecting) {
      queue.splice(index, 1)
    }
  }

  const move = (fromId: string, toId: string) => {
    const queue = currentSession.value?.messageQueue
    if (!queue || fromId === toId) return
    const from = queue.findIndex((item) => item.id === fromId)
    const to = queue.findIndex((item) => item.id === toId)
    if (from === -1 || to === -1 || queue[from].injecting) return
    const [item] = queue.splice(from, 1)
    queue.splice(to, 0, item)
  }

  /** Move a queued message back into the input box for editing. */
  const edit = (id: string) => {
    const queue = currentSession.value?.messageQueue
    const item = queue?.find((entry) => entry.id === id)
    if (!queue || !item || item.injecting) return
    const draft = chatInputParts.value
    const needsSeparator = draft.length > 0 && item.contentParts.some((part) => part.type !== 'image')
    chatInputParts.value = [...draft, ...(needsSeparator ? [{ type: 'text' as const, text: ' ' }] : []), ...item.contentParts]
    remove(id)
  }

  const sendQueued = async (tabId: string, item: QueuedMessage) => {
    const tab = findTab(tabId)
    if (tab && tabId === currentChatId.value && currentTodos.value.length > 0) {
      clearTodoState(tab.session.chatHistory)
    }
    await sendMessageWithContent(item.content, 'send', tabId, undefined, item.contentParts)
  }

  /**
   * Send a queued message now. While the agent runs it is handed to the main
   * process and joins the next LLM request without interrupting the run.
   */
  const sendNow = async (id: string) => {
    const tabId = currentChatId.value
    const session = currentSession.value
    const item = session?.messageQueue.find((entry) => entry.id === id)
    if (!tabId || !session || !item || item.injecting) return

    if (!session.responseLoading) {
      session.messageQueue.splice(session.messageQueue.indexOf(item), 1)
      await sendQueued(tabId, item)
      return
    }

    item.injecting = true
    try {
      await window.api.sendToMain({
        type: 'injectUserMessage',
        text: item.content,
        contentParts: toRawParts(item.contentParts),
        queuedMessageId: item.id,
        tabId,
        taskId: tabId
      })
    } catch (error) {
      item.injecting = false
      logger.error('Failed to inject queued message', { error })
    }
  }

  /** Send the next queued message once the agent turn of `tabId` has completed. */
  const drainNext = async (tabId: string) => {
    const session = findTab(tabId)?.session
    if (!session || session.responseLoading || session.messageQueue.length === 0) return
    if (session.messageQueue.some((item) => item.injecting)) return
    const [item] = session.messageQueue.splice(0, 1)
    await sendQueued(tabId, item)
  }

  /** The main process merged a queued message into the conversation. */
  const handleInjected = (tabId: string, queuedMessageId: string) => {
    const tab = findTab(tabId)
    if (!tab) return
    const { session } = tab
    const index = session.messageQueue.findIndex((item) => item.id === queuedMessageId)
    if (index === -1) return
    const [item] = session.messageQueue.splice(index, 1)

    session.chatHistory.push({
      id: uuidv4(),
      role: 'user',
      content: item.content,
      contentParts: toRawParts(item.contentParts),
      type: 'message',
      ask: '',
      say: '',
      ts: 0,
      ...(tab.hosts.length > 0 ? { hosts: tab.hosts } : {})
    })
    if (!session.isCancelled) {
      session.responseLoading = true
    }
    if (tabId === currentChatId.value) {
      scrollToBottom(true)
    }
  }

  return { enqueue, remove, move, edit, sendNow, drainNext, handleInjected }
}
