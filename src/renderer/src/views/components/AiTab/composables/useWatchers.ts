import { watch } from 'vue'
import { useSessionState } from './useSessionState'
import { focusChatInput } from './useTabManagement'
import { updateGlobalState } from '@renderer/agent/storage/state'

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
  const { currentChatId, chatTypeValue, hosts } = useSessionState()

  watch(currentChatId, () => {
    deps.emitStateChange()
    deps.handleTabSwitch()
  })

  watch(
    () => chatTypeValue.value,
    async (newValue) => {
      if (!newValue || newValue.trim() === '') {
        return
      }
      if (newValue === 'chat') {
        hosts.value = []
      } else if (newValue === 'cmd') {
        await deps.updateHostsForCommandMode()
      }
      try {
        await updateGlobalState('chatSettings', {
          mode: newValue
        })
        console.log('Updated chatSettings:', newValue)

        deps.emitStateChange()
      } catch (error) {
        console.error('Failed to update chatSettings:', error)
      }
      focusChatInput()
    }
  )
}
