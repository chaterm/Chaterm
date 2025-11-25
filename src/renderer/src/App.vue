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
import { onMounted } from 'vue'
import { MfaDialog, setupGlobalMfaListeners } from './components/global/mfa'
import { UserSelectionDialog, setupGlobalUserSelectionListeners } from './components/global/user-selection'
import { useNotificationListener } from './composables/useNotificationListener'
import { useBackgroundManager } from './composables/useBackgroundManager'
import VersionPromptModal from './components/global/version-prompt/VersionPromptModal.vue'
import { useVersionPrompt } from './composables/useVersionPrompt'
import './styles/app.less'

// Setup notification listener
useNotificationListener()
const { promptStore } = useVersionPrompt()

// Setup background manager
const { backgroundStyle } = useBackgroundManager()

onMounted(() => {
  setupGlobalMfaListeners()
  setupGlobalUserSelectionListeners()
})
</script>
