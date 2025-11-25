import { onMounted, onUnmounted } from 'vue'
import eventBus from '@/utils/eventBus'
import { useSessionState } from './useSessionState'
import { focusChatInput } from './useTabManagement'

interface UseEventBusListenersParams {
  initAssetInfo: () => Promise<void>
  sendMessageWithContent: (content: string, sendType: string, tabId?: string) => Promise<void>
  initModel: () => Promise<void>
  updateHosts: (hostInfo: { ip: string; uuid: string; connection: string } | null) => void
}

interface TabInfo {
  ip?: string
  data?: {
    uuid: string
  }
  connection?: string
}

/**
 * 事件总线监听器管理 composable
 * 集中管理所有 eventBus 相关的监听器注册和清理
 */
export function useEventBusListeners(params: UseEventBusListenersParams) {
  const { initAssetInfo, sendMessageWithContent, initModel, updateHosts } = params
  const { chatTabs, chatInputValue, currentSession, autoUpdateHost } = useSessionState()

  const handleSendMessageToAi = async (payload: { content: string; tabId?: string }) => {
    const { content, tabId } = payload

    if (!content || content.trim() === '') {
      return
    }

    if (tabId) {
      const targetTab = chatTabs.value.find((tab) => tab.id === tabId)
      if (!targetTab) {
        console.warn('sendMessageToAi: Tab not found:', tabId)
        return
      }
    }

    await initAssetInfo()
    await sendMessageWithContent(content.trim(), 'commandSend', tabId)
  }

  const handleChatToAi = async (text: string) => {
    console.log('before handleChatToAi:', text)
    console.log('current chatInputValue:', chatInputValue.value)
    if (chatInputValue.value.trim()) {
      chatInputValue.value = chatInputValue.value + '\n' + text
    } else {
      chatInputValue.value = text
    }
    console.log('after handleChatToAi:', chatInputValue.value)
    await initAssetInfo()
    focusChatInput()
  }

  const handleActiveTabChanged = async (tabInfo: TabInfo) => {
    const session = currentSession.value
    if (!autoUpdateHost.value || (session && session.chatHistory.length > 0)) {
      return
    }
    if (tabInfo && tabInfo.ip && tabInfo.data?.uuid) {
      updateHosts({
        ip: tabInfo.ip,
        uuid: tabInfo.data.uuid,
        connection: tabInfo.connection || 'personal'
      })
    } else {
      updateHosts(null)
    }
  }

  const handleSettingModelOptionsChanged = async () => {
    await initModel()
  }

  onMounted(() => {
    eventBus.on('sendMessageToAi', handleSendMessageToAi)
    eventBus.on('chatToAi', handleChatToAi)
    eventBus.on('activeTabChanged', handleActiveTabChanged)
    eventBus.on('SettingModelOptionsChanged', handleSettingModelOptionsChanged)
  })

  onUnmounted(() => {
    eventBus.off('sendMessageToAi', handleSendMessageToAi)
    eventBus.off('chatToAi', handleChatToAi)
    eventBus.off('activeTabChanged', handleActiveTabChanged)
    eventBus.off('SettingModelOptionsChanged', handleSettingModelOptionsChanged)
  })
}
