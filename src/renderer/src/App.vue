<template>
  <router-view></router-view>
  <VersionPromptModal :store="promptStore" />
  <MfaDialog />
  <UserSelectionDialog />
</template>
<script setup lang="ts">
import { onMounted } from 'vue'
import { MfaDialog, setupGlobalMfaListeners } from './components/global/mfa'
import { UserSelectionDialog, setupGlobalUserSelectionListeners } from './components/global/user-selection'
import { useNotificationListener } from './composables/useNotificationListener'
import VersionPromptModal from './components/global/version-prompt/VersionPromptModal.vue'
import { useVersionPrompt } from './composables/useVersionPrompt'

// Setup notification listener
useNotificationListener()
const { promptStore } = useVersionPrompt()

onMounted(() => {
  setupGlobalMfaListeners()
  setupGlobalUserSelectionListeners()
})
</script>
<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

#app {
  height: 100vh;
  width: 100%;
  overflow: hidden;
  margin: 0;
}
</style>
