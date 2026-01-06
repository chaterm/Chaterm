import { onMounted, onUnmounted } from 'vue'
import eventBus from '@/utils/eventBus'
import { useSessionState } from './useSessionState'
import { focusChatInput } from './useTabManagement'
import { isFocusInAiTab } from '@/utils/domUtils'
import type { AssetInfo } from '../types'
import { isSwitchAssetType } from '../utils'
import i18n from '@/locales'
import { Notice } from '@/views/components/Notice'

interface UseEventBusListenersParams {
  sendMessageWithContent: (content: string, sendType: string, tabId?: string) => Promise<void>
  initModel: () => Promise<void>
  getCurentTabAssetInfo: () => Promise<AssetInfo | null>
  updateHosts: (hostInfo: { ip: string; uuid: string; connection: string; assetType?: string } | null) => void
  isAgentMode?: boolean
}

export const AiTypeOptions = [
  { label: 'Chat', value: 'chat' },
  { label: 'Command', value: 'cmd' },
  { label: 'Agent', value: 'agent' }
]

interface TabInfo {
  ip?: string
  data?: {
    uuid: string
    asset_type?: string
  }
  connection?: string
}

/**
 * Composable for event bus listener management
 * Centralizes all eventBus-related listener registration and cleanup
 */
export function useEventBusListeners(params: UseEventBusListenersParams) {
  const { t } = i18n.global
  const { sendMessageWithContent, initModel, getCurentTabAssetInfo, updateHosts, isAgentMode = false } = params
  const { chatTabs, chatInputValue, currentSession, autoUpdateHost, chatTypeValue } = useSessionState()

  // Check and handle network switch device mode restriction
  const checkAndHandleSwitchMode = async (): Promise<boolean> => {
    if (chatTypeValue.value !== 'agent') {
      return true // Not in agent mode, proceed normally
    }

    const assetInfo = await getCurentTabAssetInfo()
    if (assetInfo && isSwitchAssetType(assetInfo.assetType)) {
      chatTypeValue.value = 'cmd'
      Notice.open({
        type: 'info',
        description: t('ai.switchNotSupportAgent'),
        placement: 'bottomRight'
      })
      return false // Mode was switched, caller should handle accordingly
    }
    return true // Continue with agent mode
  }

  // Initialize asset information
  const initAssetInfo = async () => {
    // Skip host initialization in chat mode
    if (chatTypeValue.value === 'chat') {
      return
    }

    // Always check for switch mode restriction first
    await checkAndHandleSwitchMode()

    const session = currentSession.value
    if (!autoUpdateHost.value || (session && session.chatHistory.length > 0)) {
      return
    }
    const assetInfo = await getCurentTabAssetInfo()
    if (assetInfo) {
      updateHosts({
        ip: assetInfo.ip,
        uuid: assetInfo.uuid,
        connection: assetInfo.connection ? assetInfo.connection : 'personal',
        assetType: assetInfo.assetType
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
    // Skip host update in chat mode
    if (chatTypeValue.value === 'chat') {
      return
    }
    const session = currentSession.value
    if (!autoUpdateHost.value || (session && session.chatHistory.length > 0)) {
      return
    }
    if (tabInfo && tabInfo.ip && tabInfo.data?.uuid) {
      updateHosts({
        ip: tabInfo.ip,
        uuid: tabInfo.data.uuid,
        connection: tabInfo.connection || 'personal',
        assetType: tabInfo.data.asset_type
      })
    } else {
      updateHosts(null)
    }
  }

  const handleSettingModelOptionsChanged = async () => {
    await initModel()
  }

  const handleSwitchAiMode = async () => {
    if (!isFocusInAiTab()) {
      return
    }

    const currentIndex = AiTypeOptions.findIndex((option) => option.value === chatTypeValue.value)
    let nextIndex = (currentIndex + 1) % AiTypeOptions.length

    // Check if current host is a network switch device, skip Agent mode if so
    const assetInfo = await getCurentTabAssetInfo()
    if (assetInfo && isSwitchAssetType(assetInfo.assetType)) {
      while (AiTypeOptions[nextIndex].value === 'agent') {
        nextIndex = (nextIndex + 1) % AiTypeOptions.length
      }
    }

    chatTypeValue.value = AiTypeOptions[nextIndex].value
  }

  onMounted(async () => {
    eventBus.on('sendMessageToAi', handleSendMessageToAi)
    eventBus.on('chatToAi', handleChatToAi)
    eventBus.on('activeTabChanged', handleActiveTabChanged)
    eventBus.on('SettingModelOptionsChanged', handleSettingModelOptionsChanged)
    eventBus.on('switchAiMode', handleSwitchAiMode)
    await initAssetInfo()
  })

  onUnmounted(() => {
    eventBus.off('sendMessageToAi', handleSendMessageToAi)
    eventBus.off('chatToAi', handleChatToAi)
    eventBus.off('activeTabChanged', handleActiveTabChanged)
    eventBus.off('SettingModelOptionsChanged', handleSettingModelOptionsChanged)
    eventBus.off('switchAiMode', handleSwitchAiMode)
  })
}
