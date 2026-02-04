import { describe, it, expect, vi } from 'vitest'
import { ref, nextTick } from 'vue'
import { useAiSidebarModelRefresh } from '../composables/useAiSidebarModelRefresh'

describe('useAiSidebarModelRefresh', () => {
  it('calls refreshModelOptions when showAiSidebar opens', async () => {
    const showAiSidebar = ref(false)
    const refreshModelOptions = vi.fn()
    const aiTabRef = ref<{ refreshModelOptions?: () => void } | null>({ refreshModelOptions })

    const stop = useAiSidebarModelRefresh(showAiSidebar, aiTabRef)

    showAiSidebar.value = true
    await nextTick()
    await Promise.resolve()

    expect(refreshModelOptions).toHaveBeenCalledTimes(1)
    stop()
  })
})
