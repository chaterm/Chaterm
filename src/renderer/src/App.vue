<template>
  <div id="app">
    <div
      class="global-background"
      :style="backgroundStyle"
    ></div>
    <router-view></router-view>
    <VersionPromptModal :store="promptStore" />
    <MfaDialog />
    <UserSelectionDialog />
  </div>
</template>
<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { MfaDialog, setupGlobalMfaListeners } from './components/global/mfa'
import { UserSelectionDialog, setupGlobalUserSelectionListeners } from './components/global/user-selection'
import { useNotificationListener } from './composables/useNotificationListener'
import { useBackgroundManager } from './composables/useBackgroundManager'
import VersionPromptModal from './components/global/version-prompt/VersionPromptModal.vue'
import { useVersionPrompt } from './composables/useVersionPrompt'
import { dataSyncService } from './services/dataSyncService'
import { removeToken } from './utils/permission'
import { TOKEN_EXPIRED_EVENT } from './utils/authEvents'
import './styles/app.less'

const logger = createRendererLogger('app')

// Setup notification listener
useNotificationListener()
const { promptStore } = useVersionPrompt()

// Setup background manager
const { backgroundStyle } = useBackgroundManager()

const router = useRouter()
let unsubscribeTokenExpired: (() => void) | undefined
let isHandlingTokenExpired = false

const handleTokenExpired = async () => {
  if (isHandlingTokenExpired) {
    return
  }

  isHandlingTokenExpired = true
  logger.warn('Received token-expired notification, stopping sync and redirecting to login')
  try {
    try {
      await dataSyncService.disableDataSync()
    } catch (e) {
      logger.error('Failed to disable data sync on token expiry', { error: e })
    }
    dataSyncService.reset()
    removeToken()
    await router.replace('/login')
  } finally {
    isHandlingTokenExpired = false
  }
}

onMounted(() => {
  setupGlobalMfaListeners()
  setupGlobalUserSelectionListeners()

  if (window.api?.onTokenExpired) {
    unsubscribeTokenExpired = window.api.onTokenExpired(handleTokenExpired)
  }
  window.addEventListener(TOKEN_EXPIRED_EVENT, handleTokenExpired)
})

onUnmounted(() => {
  unsubscribeTokenExpired?.()
  window.removeEventListener(TOKEN_EXPIRED_EVENT, handleTokenExpired)
})
</script>
