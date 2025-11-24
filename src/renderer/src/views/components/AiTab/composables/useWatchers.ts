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
 * 跨 composable watch 编排 → 放在 useWatchers.ts
 * 单个 composable 内部的副作用 → 放在各自的 composable 内部
 * 例如：
 * useStateSnapshot 内部自己监听 currentChatId 并处理 emitStateChange
 * 这样既保持了各 composable 的自治性，又避免了组件层的臃肿。
 */
export function useWatchers(deps: WatcherDeps) {
  const { currentChatId, chatTypeValue } = useSessionState()

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
      if (newValue === 'cmd') {
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
