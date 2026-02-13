import { v4 as uuidv4 } from 'uuid'
import { ref, nextTick, onMounted, onUnmounted } from 'vue'
import { Modal } from 'ant-design-vue'

import { useI18n } from 'vue-i18n'
const logger = createRendererLogger('ai.tabManagement')
import type { HistoryItem, Host, AssetInfo, ChatMessage, TaskHistoryItem } from '../types'
import type { ChatTab, SessionState } from './useSessionState'
import { useSessionState } from './useSessionState'
import { getGlobalState, updateGlobalState } from '@renderer/agent/storage/state'
import { ChatermMessage } from '@/types/ChatermMessage'
import { PROVIDER_MODEL_KEY_MAP } from './useModelConfiguration'
import eventBus from '@/utils/eventBus'

interface TabManagementOptions {
  getCurentTabAssetInfo: () => Promise<AssetInfo | null>
  emitStateChange?: () => void
  isFocusInAiTab?: (event?: KeyboardEvent) => boolean
  toggleSidebar: () => void
}

export const focusChatInput = () => {
  const { chatTextareaRef } = useSessionState()

  nextTick(() => {
    const el = (chatTextareaRef.value as unknown as HTMLElement | null) ?? null
    if (!el) return

    if (chatTextareaRef.value) {
      el.focus({ preventScroll: true })

      const selection = window.getSelection()
      if (!selection) return
      const range = document.createRange()
      range.selectNodeContents(el)
      range.collapse(false)
      selection.removeAllRanges()
      selection.addRange(range)

      // Keep the visible viewport scrolled to the newest content.
      el.scrollTop = el.scrollHeight
    }
  })
}

/**
 * Default localhost host configuration
 */
// const DEFAULT_LOCALHOST_HOST: Host = {
//   host: '127.0.0.1',
//   uuid: 'localhost',
//   connection: 'localhost'
// }

const normalizeChatType = (mode?: string): 'agent' | 'cmd' => {
  // return mode === 'chat' ? 'chat' : mode === 'cmd' ? 'cmd' : 'agent'
  return mode === 'cmd' ? 'cmd' : 'agent'
}

/**
 * Composable for Tab management
 * Handles Tab creation, deletion, switching, history restoration and other operations
 */
export function useTabManagement(options: TabManagementOptions) {
  const { chatTabs, currentChatId, currentTab, createEmptySessionState, chatInputParts, cleanupTabPairsCache } = useSessionState()

  const { getCurentTabAssetInfo, emitStateChange, isFocusInAiTab, toggleSidebar } = options

  // Get i18n instance
  const { t, locale, messages } = useI18n()

  /**
   * Generate a random welcome tip from i18n messages
   */
  const generateRandomWelcomeTip = (): string => {
    const currentMessages = messages.value[locale.value] as any
    const tips = currentMessages?.ai?.welcomeTips

    if (Array.isArray(tips) && tips.length > 0) {
      const randomIndex = Math.floor(Math.random() * tips.length)
      return tips[randomIndex]
    }
    return (t('ai.welcome') as string) || ''
  }

  const createNewEmptyTab = async (): Promise<string> => {
    // console.log('createNewEmptyTab   begin')
    const newChatId = uuidv4()

    const defaultChatType = currentTab.value?.chatType || 'agent'
    const defaultHosts = currentTab.value?.hosts || []
    const defaultModelValue = currentTab.value?.modelValue || ''
    const currentInputParts = chatInputParts.value || []

    const placeholderTab: ChatTab = {
      id: newChatId,
      title: 'New chat',
      autoUpdateHost: true,
      session: createEmptySessionState(),
      chatInputParts: currentInputParts,
      welcomeTip: generateRandomWelcomeTip(),
      chatType: defaultChatType,
      hosts: defaultHosts,
      modelValue: defaultModelValue
    }

    chatTabs.value.push(placeholderTab)

    // Set currentChatId immediately so input box can display right away
    currentChatId.value = newChatId

    const [chatSetting, assetInfo, apiProvider] = await Promise.all([
      getGlobalState('chatSettings').catch(() => ({ mode: 'agent' })),
      getCurentTabAssetInfo().catch(() => null),
      getGlobalState('apiProvider').catch(() => 'default')
    ])

    const chatType = normalizeChatType((chatSetting as { mode?: string })?.mode)
    // Keep previous chat host branch commented for quick rollback.
    // const hosts: Host[] =
    //   chatType === 'chat'
    //     ? []
    //     : assetInfo && assetInfo.ip
    //       ? [{ host: assetInfo.ip, uuid: assetInfo.uuid, connection: assetInfo.connection || 'personal', ...(assetInfo.assetType ? { assetType: assetInfo.assetType } : {}) }]
    //       : [DEFAULT_LOCALHOST_HOST]
    const hosts: Host[] =
      assetInfo && assetInfo.ip
        ? [
            {
              host: assetInfo.ip,
              uuid: assetInfo.uuid,
              connection: assetInfo.connection || 'personal',
              ...(assetInfo.assetType ? { assetType: assetInfo.assetType } : {})
            }
          ]
        : []

    // Get currently selected model as default value for new Tab
    const key = PROVIDER_MODEL_KEY_MAP[(apiProvider as string) || 'default'] || 'defaultModelId'
    const currentModelValue = (await getGlobalState(key).catch(() => '')) as string

    // Update actual data of placeholder tab only if different from defaults
    const tab = chatTabs.value.find((t) => t.id === newChatId)
    if (tab) {
      if (tab.chatType !== chatType) {
        tab.chatType = chatType
      }
      if (JSON.stringify(tab.hosts) !== JSON.stringify(hosts)) {
        tab.hosts = hosts
      }
      if (tab.modelValue !== currentModelValue) {
        tab.modelValue = currentModelValue || ''
      }
    }

    emitStateChange?.()

    focusChatInput()
    // console.log('createNewEmptyTab   end')

    return newChatId
  }

  const isStringContent = (content: unknown): content is string => {
    return typeof content === 'string'
  }

  const restoreHistoryTab = async (history: HistoryItem, options?: { forceNewTab?: boolean }) => {
    try {
      const existingTabIndex = chatTabs.value.findIndex((tab) => tab.id === history.id)
      if (existingTabIndex !== -1) {
        currentChatId.value = history.id
        return
      }

      let loadedHosts: Host[] = []
      let savedChatType = normalizeChatType(history.chatType)
      let savedModelValue = ''
      try {
        const metadataResult = await window.api.getTaskMetadata(history.id)
        logger.info('Metadata', { data: metadataResult })
        if (metadataResult.success && metadataResult.data) {
          if (metadataResult.data.hosts?.length > 0) {
            loadedHosts = metadataResult.data.hosts.map((item: Host) => ({
              host: item.host,
              uuid: item.uuid || '',
              connection: item.connection,
              ...(item.assetType ? { assetType: item.assetType } : {})
            }))
          }

          if (metadataResult.data.model_usage?.length > 0) {
            const lastModelUsage = metadataResult.data.model_usage[metadataResult.data.model_usage.length - 1]
            savedChatType = normalizeChatType(lastModelUsage.mode) || savedChatType
            savedModelValue = lastModelUsage.model_id || ''
          }
        }
      } catch (e) {
        logger.error('Failed to get metadata', { error: e })
      }

      const result = await window.api.chatermGetChatermMessages({
        taskId: history.id
      })
      const conversationHistory = result as ChatermMessage[]

      const historyChatMessages: ChatMessage[] = []
      let lastItem: ChatermMessage | null = null
      conversationHistory.forEach((item, index) => {
        const isDuplicate =
          lastItem && item.text === lastItem.text && item.ask === lastItem.ask && item.say === lastItem.say && item.type === lastItem.type

        if (
          !isDuplicate &&
          (item.ask === 'followup' ||
            item.ask === 'command' ||
            item.ask === 'mcp_tool_call' ||
            item.say === 'command' ||
            item.say === 'command_output' ||
            item.say === 'completion_result' ||
            item.say === 'search_result' ||
            item.say === 'text' ||
            item.say === 'reasoning' ||
            item.say === 'user_feedback' ||
            item.say === 'sshInfo')
        ) {
          let role: 'assistant' | 'user' = 'assistant'
          if (index === 0 || item.say === 'user_feedback') {
            role = 'user'
          }
          const userMessage: ChatMessage = {
            id: uuidv4(),
            role: role,
            content: item.text || '',
            contentParts: item.contentParts,
            type: item.type,
            ask: item.ask,
            say: item.say,
            ts: item.ts
          }

          if (item.mcpToolCall) {
            userMessage.mcpToolCall = item.mcpToolCall
          }

          if (userMessage.say === 'user_feedback' && isStringContent(userMessage.content) && userMessage.content.startsWith('Terminal output:')) {
            userMessage.say = 'command_output'
            userMessage.role = 'assistant'
          }

          if (!item.partial && item.type === 'ask' && item.text) {
            try {
              let contentJson = JSON.parse(item.text)
              if (item.ask === 'followup') {
                userMessage.content = contentJson
                userMessage.selectedOption = contentJson?.selected
              } else {
                userMessage.content = contentJson?.question
              }
            } catch (e) {
              userMessage.content = item.text
            }
          }
          historyChatMessages.push(userMessage)
          lastItem = item
        }
      })

      const historySession: SessionState = {
        chatHistory: historyChatMessages,
        lastChatMessageId: '',
        responseLoading: false,
        showRetryButton: false,
        showSendButton: true,
        buttonsDisabled: false,
        isExecutingCommand: false,
        lastStreamMessage: null,
        lastPartialMessage: null,
        shouldStickToBottom: true,
        isCancelled: false
      }

      const finalHosts = loadedHosts.length > 0 ? loadedHosts : (currentTab.value?.hosts ?? [])

      const historyTab: ChatTab = {
        id: history.id,
        title: history.chatTitle,
        hosts: finalHosts,
        chatType: savedChatType,
        autoUpdateHost: false,
        session: historySession,
        chatInputParts: [],
        modelValue: savedModelValue || currentTab.value?.modelValue || '',
        welcomeTip: ''
      }

      const hasUserInput = currentTab.value?.chatInputParts && currentTab.value.chatInputParts.length > 0
      const isCurrentNewTab =
        currentTab.value && currentTab.value.title === 'New chat' && currentTab.value.session.chatHistory.length === 0 && !hasUserInput
      if (isCurrentNewTab && !options?.forceNewTab) {
        const currentTabIndex = chatTabs.value.findIndex((tab) => tab.id === currentTab.value!.id)
        if (currentTabIndex !== -1) {
          chatTabs.value[currentTabIndex] = historyTab
        }
      } else {
        chatTabs.value.push(historyTab)
      }
      currentChatId.value = history.id

      await window.api.sendToMain({
        type: 'showTaskWithId',
        text: history.id,
        hosts: finalHosts.map((h) => ({
          host: h.host,
          uuid: h.uuid,
          connection: h.connection,
          ...(h.assetType ? { assetType: h.assetType } : {})
        }))
      })

      focusChatInput()
    } catch (err) {
      logger.error('Failed to restore history tab', { error: err })
    }
  }

  const handleTabRemove = async (tabId: string, skipConfirm: boolean = false) => {
    const tabIndex = chatTabs.value.findIndex((tab) => tab.id === tabId)
    if (tabIndex === -1) return

    const targetTab = chatTabs.value[tabIndex]
    const isExecuting = targetTab.session.responseLoading

    if (isExecuting && !skipConfirm) {
      Modal.confirm({
        title: t('common.closeTabConfirm'),
        content: t('common.closeTabWithTaskRunning'),
        okText: t('common.forceClose'),
        okType: 'danger',
        cancelText: `${t('common.cancel')} (ESC)`,
        maskClosable: true,
        onOk: async () => {
          // After user confirms, recursively call with skipConfirm=true
          await handleTabRemove(tabId, true)
        }
      })
      return
    }

    await window.api.cancelTask(tabId)

    // Clean up computed cache before removing tab
    cleanupTabPairsCache(tabId)

    chatTabs.value.splice(tabIndex, 1)

    if (chatTabs.value.length === 0) {
      currentChatId.value = undefined
      emitStateChange?.()
      // handleClose?.()
      toggleSidebar()
      eventBus.emit('updateRightIcon', false)
      return
    }

    const newActiveIndex = Math.min(tabIndex, chatTabs.value.length - 1)
    const newActiveTab = chatTabs.value[newActiveIndex]

    currentChatId.value = newActiveTab.id
  }

  const renameTab = async (tabId: string, title: string) => {
    // Update tab title if tab is currently open
    const targetTab = chatTabs.value.find((tab) => tab.id === tabId)
    if (targetTab) {
      targetTab.title = title
    }

    try {
      const taskHistory = ((await getGlobalState('taskHistory')) as TaskHistoryItem[]) || []
      const targetHistory = taskHistory.find((item) => item.id === tabId)
      if (targetHistory) {
        targetHistory.chatTitle = title
        await updateGlobalState('taskHistory', taskHistory)
      }
    } catch (err) {
      logger.error('Failed to persist tab title', { error: err })
    }

    emitStateChange?.()
  }

  const closeTabs = async (tabsToClose: ChatTab[]) => {
    if (tabsToClose.length === 0) return

    await Promise.all(tabsToClose.map((tab) => window.api.cancelTask(tab.id)))

    tabsToClose.forEach((tab) => cleanupTabPairsCache(tab.id))

    const tabIdsToClose = new Set(tabsToClose.map((tab) => tab.id))

    const isCurrentTabClosed = currentChatId.value && tabIdsToClose.has(currentChatId.value)

    chatTabs.value = chatTabs.value.filter((tab) => !tabIdsToClose.has(tab.id))

    if (chatTabs.value.length === 0) {
      currentChatId.value = undefined
      emitStateChange?.()
      toggleSidebar()
      eventBus.emit('updateRightIcon', false)
      return
    }

    if (isCurrentTabClosed) {
      currentChatId.value = chatTabs.value[0].id
    }
  }

  const confirmAndCloseTabs = async (tabsToClose: ChatTab[]) => {
    if (tabsToClose.length === 0) return
    const hasRunningTask = tabsToClose.some((tab) => tab.session.responseLoading)
    if (!hasRunningTask) {
      await closeTabs(tabsToClose)
      return
    }
    Modal.confirm({
      title: t('ai.closeTabsConfirm'),
      content: t('ai.closeTabsWithTaskRunning'),
      okText: t('common.forceClose'),
      okType: 'danger',
      cancelText: `${t('common.cancel')} (ESC)`,
      maskClosable: true,
      onOk: async () => {
        await closeTabs(tabsToClose)
      }
    })
  }

  const closeOtherTabs = async (tabId: string) => {
    const tabsToClose = chatTabs.value.filter((tab) => tab.id !== tabId)
    await confirmAndCloseTabs(tabsToClose)
  }

  const closeAllTabs = async () => {
    const tabsToClose = [...chatTabs.value]
    await confirmAndCloseTabs(tabsToClose)
  }

  // Tab rename state and methods
  const editingTabId = ref<string | null>(null)
  const editingTitle = ref('')

  const startTabRename = (tab: ChatTab) => {
    editingTabId.value = tab.id
    editingTitle.value = tab.title || ''
  }

  const cancelTabRename = () => {
    editingTabId.value = null
    editingTitle.value = ''
  }

  const saveTabRename = (tabId: string) => {
    const nextTitle = editingTitle.value.trim()
    if (!nextTitle) {
      cancelTabRename()
      return
    }
    renameTab(tabId, nextTitle)
    cancelTabRename()
  }

  const handleRenameKeydown = (event: KeyboardEvent, tabId: string) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      saveTabRename(tabId)
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      cancelTabRename()
    }
  }

  const handleTabMenuClick = async (key: string, tab: ChatTab) => {
    if (key === 'rename') {
      startTabRename(tab)
      return
    }
    if (key === 'close') {
      await handleTabRemove(tab.id)
      return
    }
    if (key === 'closeOthers') {
      await closeOtherTabs(tab.id)
      return
    }
    if (key === 'closeAll') {
      await closeAllTabs()
    }
  }

  const handleCloseTabKeyDown = (event: KeyboardEvent) => {
    const isWindows = navigator.platform.toLowerCase().includes('win')
    if (!isWindows && (event.metaKey || event.ctrlKey) && event.key === 'w') {
      if (isFocusInAiTab && !isFocusInAiTab(event)) {
        return
      }

      if (!chatTabs.value || chatTabs.value.length === 0) {
        return
      }
      if (!currentChatId.value) {
        return
      }
      event.preventDefault()
      event.stopPropagation()
      handleTabRemove(currentChatId.value)
    }
  }
  onMounted(() => {
    window.addEventListener('keydown', handleCloseTabKeyDown)
  })

  onUnmounted(() => {
    window.removeEventListener('keydown', handleCloseTabKeyDown)
  })

  return {
    createNewEmptyTab,
    restoreHistoryTab,
    handleTabRemove,
    renameTab,
    closeOtherTabs,
    closeAllTabs,
    editingTabId,
    editingTitle,
    startTabRename,
    cancelTabRename,
    saveTabRename,
    handleRenameKeydown,
    handleTabMenuClick,
    handleCloseTabKeyDown
  }
}
