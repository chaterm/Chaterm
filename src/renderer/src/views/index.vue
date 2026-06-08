<template>
  <TerminalLayout :current-mode="currentMode" />
</template>
<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick } from 'vue'
import TerminalLayout from './layouts/TerminalLayout.vue'
import eventBus from '@/utils/eventBus'
import { userConfigStore } from '@/services/userConfigStoreService'
import { mark } from '@/utils/perf'

const logger = createRendererLogger('views.index')

const currentMode = ref<'terminal' | 'agents'>('terminal')

const handleModeChange = (mode: 'terminal' | 'agents') => {
  currentMode.value = mode
}

const handleToggleLayout = async () => {
  const targetMode = currentMode.value === 'terminal' ? 'agents' : 'terminal'
  eventBus.emit('save-state-before-switch', {
    from: currentMode.value,
    to: targetMode
  })
  await nextTick()
  currentMode.value = targetMode

  try {
    await userConfigStore.saveConfig({ defaultLayout: targetMode })
    eventBus.emit('defaultLayoutChanged', targetMode)
  } catch (error) {
    logger.error('Failed to update default layout', { error: error })
  }
}

onMounted(async () => {
  mark('chaterm/renderer/homeMounted')
  eventBus.on('switch-mode', handleModeChange)
  eventBus.on('toggle-layout', handleToggleLayout)

  // Load default layout from user config
  try {
    mark('chaterm/renderer/willLoadDefaultLayout')
    const config = await userConfigStore.getConfig()
    const defaultLayout = config.defaultLayout || 'terminal'
    currentMode.value = defaultLayout
    mark('chaterm/renderer/didLoadDefaultLayout')
  } catch (error) {
    mark('chaterm/renderer/didFailLoadDefaultLayout')
    logger.error('Failed to load default layout', { error: error })
    // Use default value 'terminal' if loading fails
    currentMode.value = 'terminal'
  }
})

onUnmounted(() => {
  eventBus.off('switch-mode', handleModeChange)
  eventBus.off('toggle-layout', handleToggleLayout)
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
