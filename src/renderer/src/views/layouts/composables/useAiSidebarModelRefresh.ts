import { watch, nextTick, type Ref } from 'vue'

type AiTabRefreshTarget = {
  refreshModelOptions?: () => Promise<void> | void
}

export const useAiSidebarModelRefresh = (showAiSidebar: Ref<boolean>, aiTabRef: Ref<AiTabRefreshTarget | null>) => {
  return watch(showAiSidebar, async (newValue, oldValue) => {
    if (newValue && !oldValue) {
      await nextTick()
      await aiTabRef.value?.refreshModelOptions?.()
    }
  })
}
