import { onMounted, watch, computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useVersionPromptStore } from '@/store/versionPromptStore'

const FETCH_DELAY_MS = 1200

export function useVersionPrompt() {
  const promptStore = useVersionPromptStore()
  const route = useRoute()
  const hasLoaded = ref(false)

  const isLoginPage = computed(() => route.path === '/login')

  const loadPromptWithDelay = async () => {
    await new Promise((resolve) => setTimeout(resolve, FETCH_DELAY_MS))
    try {
      await promptStore.loadPrompt()
      hasLoaded.value = true
    } catch (error) {
      console.error('[VersionPrompt] Failed to load, will retry on next navigation', error)
    }
  }

  watch(isLoginPage, (isLogin, wasLogin) => {
    if (isLogin && promptStore.modalVisible) {
      promptStore.clearPrompt()
    }

    if (wasLogin && !isLogin && !hasLoaded.value) {
      void loadPromptWithDelay()
    }
  })

  watch(
    () => promptStore.prompt,
    (prompt) => {
      if (!prompt?.shouldShow || isLoginPage.value) return
      promptStore.openModal()
    }
  )

  onMounted(() => {
    setTimeout(() => {
      if (route.path === '/login') return
      void loadPromptWithDelay()
    }, 0)
  })

  return { promptStore }
}
