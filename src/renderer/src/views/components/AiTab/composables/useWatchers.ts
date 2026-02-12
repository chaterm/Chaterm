import { watch } from 'vue'
import { useSessionState } from './useSessionState'
import { focusChatInput } from './useTabManagement'
import { updateGlobalState } from '@renderer/agent/storage/state'

const logger = createRendererLogger('aitab.watchers')

interface WatcherDeps {
  emitStateChange: () => void
  handleTabSwitch: () => void
  updateHostsForCommandMode: () => Promise<void>
}
/**
 * Cross-composable watch orchestration → placed in useWatchers.ts
 * Side effects within a single composable → placed inside respective composables
 * For example:
 * useStateSnapshot internally watches currentChatId and handles emitStateChange
 * This maintains autonomy of each composable while avoiding bloating the component layer.
 */
export function useWatchers(deps: WatcherDeps) {
  const { currentChatId, chatTypeValue, hosts, chatTabs } = useSessionState()

  watch(currentChatId, () => {
    deps.emitStateChange()
    deps.handleTabSwitch()
  })

  watch(
    () => chatTypeValue.value,
    async (newValue, oldValue) => {
      if (!newValue || newValue.trim() === '') {
        return
      }
      const currentTab = chatTabs.value.find((tab) => tab.id === currentChatId.value)
      if (!currentTab) {
        return
      }

      if (newValue === 'chat') {
        if (oldValue === 'agent' && hosts.value.length > 0) {
          currentTab.agentHosts = [...hosts.value]
        }
        hosts.value = []
      } else if (newValue === 'cmd') {
        if (oldValue === 'agent' && hosts.value.length > 0) {
          currentTab.agentHosts = [...hosts.value]
        }
        await deps.updateHostsForCommandMode()
      } else {
        if (currentTab.agentHosts && currentTab.agentHosts.length > 0) {
          hosts.value = [...currentTab.agentHosts]
        }
      }
      try {
        await updateGlobalState('chatSettings', {
          mode: newValue
        })
        logger.debug('Updated chatSettings')

        deps.emitStateChange()
      } catch (error) {
        logger.error('Failed to update chatSettings', { error: error })
      }
      focusChatInput()
    }
  )
}
