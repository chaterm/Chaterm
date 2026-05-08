import { onMounted, onUnmounted } from 'vue'
import eventBus from '@/utils/eventBus'
import { useSessionState } from './useSessionState'
import { focusChatInput } from './useTabManagement'
import { isFocusInAiTab } from '@/utils/domUtils'
import type { AssetInfo, Host } from '../types'
import type { ContentPart, ToolResultPayload } from '@shared/WebviewMessage'
import { isSwitchAssetType } from '../utils'
import i18n from '@/locales'
import { Notice } from '@/views/components/Notice'
import { AI_TAB_DEFAULT_WORKSPACE, type AiTabWorkspace } from '../workspace'

const logger = createRendererLogger('aitab.eventBus')

interface UseEventBusListenersParams {
  sendMessageWithContent: (
    content: string,
    sendType: string,
    tabId?: string,
    truncateAtMessageTs?: number,
    contentParts?: ContentPart[],
    overrideHosts?: Host[],
    toolResult?: ToolResultPayload
  ) => Promise<void>
  initModel: () => Promise<void>
  getCurentTabAssetInfo: () => Promise<AssetInfo | null>
  updateHosts: (hostInfo: { ip: string; uuid: string; connection: string; assetType?: string } | null) => void
  isAgentMode?: boolean
  /**
   * AiTab workspace identifier. Defaults to `'terminal'` so legacy callers
   * see byte-for-byte identical behaviour. When `'database'`, all
   * terminal-only event bus side effects are short-circuited:
   *   - initAssetInfo() returns early (no host fetch, no mode flip)
   *   - activeTabChanged listener ignores SSH tab switches
   *   - switchAiMode (Cmd+/) ignores the keyboard shortcut
   *   - sendMessageToAi / chatToAi already guarded by isAgentMode, remain
   *     ignored (DB workspace always passes isAgentMode=true)
   * See docs/db-ai-aitab-mount-decision.md (Stage 1) for rationale.
   */
  workspace?: AiTabWorkspace
}

export const AiTypeOptions = [
  // { label: 'Chat', value: 'chat' },
  { label: 'Agent', value: 'agent' },
  { label: 'Command', value: 'cmd' }
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
  const { sendMessageWithContent, initModel, getCurentTabAssetInfo, updateHosts, isAgentMode = false, workspace = AI_TAB_DEFAULT_WORKSPACE } = params
  const { chatTabs, currentSession, autoUpdateHost, chatTypeValue, appendTextToInputParts } = useSessionState()
  const isDatabaseWorkspace = workspace === 'database'

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
    // if (chatTypeValue.value === 'chat') {
    //   return
    // }
    if (isDatabaseWorkspace) {
      // No SSH tab in Database workspace — bail before touching the
      // terminal event bus. Leaves `hosts` untouched so DB callers can
      // inject their own context downstream.
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

  const handleSendMessageToAi = async (payload: { content: string; tabId?: string; toolResult?: ToolResultPayload }) => {
    if (isAgentMode) {
      logger.debug('Ignoring sendMessageToAi event in agent mode')
      return
    }

    const { content, tabId, toolResult } = payload

    if (!content || content.trim() === '') {
      return
    }

    if (tabId) {
      const targetTab = chatTabs.value.find((tab) => tab.id === tabId)
      if (!targetTab) {
        logger.warn('sendMessageToAi: Tab not found', { tabId })
        return
      }
    }

    await initAssetInfo()
    await sendMessageWithContent(content.trim(), 'commandSend', tabId, undefined, undefined, undefined, toolResult)
  }

  const handleChatToAi = async (text: string) => {
    if (isAgentMode) {
      logger.debug('Ignoring chatToAi event in agent mode')
      return
    }
    appendTextToInputParts(text, '\n', '\n')
    await initAssetInfo()
    focusChatInput()
  }

  const handleActiveTabChanged = async (tabInfo: TabInfo) => {
    // if (chatTypeValue.value === 'chat') {
    //   return
    // }
    if (isDatabaseWorkspace) {
      // `activeTabChanged` is fired from the SSH tab bar. In the Database
      // workspace an SSH tab switch must not mutate the DB AI sidebar's
      // host context.
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
    if (isDatabaseWorkspace) {
      // DB workspace locks chat mode to `agent`; ignore the Cmd+/
      // keyboard shortcut entirely so the user cannot toggle between
      // agent and cmd inside a DB session.
      return
    }
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
    eventBus.on('SettingModelOptionsChanged', handleSettingModelOptionsChanged)
    if (!isDatabaseWorkspace) {
      eventBus.on('sendMessageToAi', handleSendMessageToAi)
      eventBus.on('chatToAi', handleChatToAi)
      eventBus.on('activeTabChanged', handleActiveTabChanged)
      eventBus.on('switchAiMode', handleSwitchAiMode)
      await initAssetInfo()
    }
  })

  onUnmounted(() => {
    eventBus.off('SettingModelOptionsChanged', handleSettingModelOptionsChanged)
    if (!isDatabaseWorkspace) {
      eventBus.off('sendMessageToAi', handleSendMessageToAi)
      eventBus.off('chatToAi', handleChatToAi)
      eventBus.off('activeTabChanged', handleActiveTabChanged)
      eventBus.off('switchAiMode', handleSwitchAiMode)
    }
  })
}
