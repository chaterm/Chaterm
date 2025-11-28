import { onMounted, onUnmounted } from 'vue'
import eventBus from '@/utils/eventBus'
import { useSessionState } from './useSessionState'
import { focusChatInput } from './useTabManagement'
import type { AssetInfo } from '../types'

interface UseEventBusListenersParams {
  sendMessageWithContent: (content: string, sendType: string, tabId?: string) => Promise<void>
  initModel: () => Promise<void>
  getCurentTabAssetInfo: () => Promise<AssetInfo | null>
  updateHosts: (hostInfo: { ip: string; uuid: string; connection: string } | null) => void
  isAgentMode?: boolean
}

interface TabInfo {
  ip?: string
  data?: {
    uuid: string
  }
  connection?: string
}

/**
 * Composable for event bus listener management
 * Centralizes all eventBus-related listener registration and cleanup
 */
export function useEventBusListeners(params: UseEventBusListenersParams) {
  const { sendMessageWithContent, initModel, getCurentTabAssetInfo, updateHosts, isAgentMode = false } = params
  const { chatTabs, chatInputValue, currentSession, autoUpdateHost } = useSessionState()

  // Initialize asset information
  const initAssetInfo = async () => {
    const session = currentSession.value
    if (!autoUpdateHost.value || (session && session.chatHistory.length > 0)) {
      return
    }
    const assetInfo = await getCurentTabAssetInfo()
    if (assetInfo) {
      updateHosts({
        ip: assetInfo.ip,
        uuid: assetInfo.uuid,
        connection: assetInfo.connection ? assetInfo.connection : 'personal'
      })
    } else {
      updateHosts(null)
    }
  }

  const handleSendMessageToAi = async (payload: { content: string; tabId?: string }) => {
    if (isAgentMode) {
      console.log('Ignoring sendMessageToAi event in agent mode')
      return
    }

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
    if (isAgentMode) {
      console.log('Ignoring chatToAi event in agent mode')
      return
    }
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
