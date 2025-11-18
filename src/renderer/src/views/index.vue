<template>
  <TerminalLayout v-if="currentMode === 'terminal'" />
  <AgentsLayout v-else-if="currentMode === 'agents'" />
</template>
<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import TerminalLayout from './content/TerminalLayout.vue'
import AgentsLayout from './content/AgentsLayout.vue'
import eventBus from '@/utils/eventBus'

const currentMode = ref<'terminal' | 'agents'>('terminal')

const handleModeChange = (mode: 'terminal' | 'agents') => {
  currentMode.value = mode
}

onMounted(() => {
  eventBus.on('switch-mode', handleModeChange)
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
