<template>
  <TerminalLayout v-if="currentMode === 'terminal'" />
  <AgentsLayout v-else-if="currentMode === 'agents'" />
</template>
<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import TerminalLayout from './content/TerminalLayout.vue'
import AgentsLayout from './content/AgentsLayout.vue'
import eventBus from '@/utils/eventBus'
import { userConfigStore } from '@/services/userConfigStoreService'

const currentMode = ref<'terminal' | 'agents'>('terminal')

const handleModeChange = (mode: 'terminal' | 'agents') => {
  currentMode.value = mode
}

onMounted(async () => {
  eventBus.on('switch-mode', handleModeChange)

  // Load default layout from user config
  try {
    const config = await userConfigStore.getConfig()
    const defaultLayout = config.defaultLayout || 'terminal'
    currentMode.value = defaultLayout
  } catch (error) {
    console.error('Failed to load default layout:', error)
    // Use default value 'terminal' if loading fails
    currentMode.value = 'terminal'
  }
})

onUnmounted(() => {
  eventBus.off('switch-mode', handleModeChange)
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
  overflow: hidden;
}
</style>
