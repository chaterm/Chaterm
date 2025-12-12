<template>
  <a-watermark v-bind="watermarkContent">
    <div class="agents-layout">
      <div class="term_header">
        <Header
          ref="headerRef"
          @toggle-sidebar="toggleSideBar"
          @mode-change="handleModeChange"
        ></Header>
      </div>
      <div class="term_body">
        <div class="term_content">
          <splitpanes
            class="left-sidebar-container"
            @resize="(params: ResizeParams) => handleLeftPaneResize(params)"
          >
            <pane :size="leftPaneSize">
              <AgentsSidebar
                @conversation-select="handleConversationSelect"
                @new-chat="handleNewChat"
                @conversation-delete="handleConversationDelete"
              />
            </pane>
            <pane :size="100 - leftPaneSize">
              <div class="agents-chat-container">
                <AiTab
                  ref="aiTabRef"
                  :toggle-sidebar="() => {}"
                  :saved-state="savedAiTabState || undefined"
                  :is-agent-mode="true"
                  @state-changed="handleAiTabStateChanged"
                />
              </div>
            </pane>
          </splitpanes>
        </div>
      </div>
    </div>
  </a-watermark>
</template>

<script setup lang="ts">
import { userConfigStore } from '@/services/userConfigStoreService'
import { userConfigStore as piniaUserConfigStore } from '@/store/userConfigStore'
import { ref, onMounted, nextTick, onUnmounted, computed, reactive, watch } from 'vue'
import { Splitpanes, Pane } from 'splitpanes'
import 'splitpanes/dist/splitpanes.css'
import AiTab from '@views/components/AiTab/index.vue'
import AgentsSidebar from '@views/components/AgentsSidebar/index.vue'
import Header from '@views/components/Header/index.vue'
import { userInfoStore } from '@/store'
import eventBus from '@/utils/eventBus'
import { initializeThemeFromDatabase, getActualTheme } from '@/utils/themeUtils'
import { getGlobalState } from '@/agent/storage/state'

interface ResizeParams {
  prevPane: { size: number }
  nextPane: { size: number }
}

// Define props
const props = defineProps<{
  currentMode: 'terminal' | 'agents'
}>()

const api = window.api as any
const headerRef = ref<InstanceType<typeof Header> | null>(null)
const aiTabRef = ref<InstanceType<typeof AiTab> | null>(null)

const isSkippedLogin = computed(() => {
  return localStorage.getItem('login-skipped') === 'true'
})

const watermarkContent = reactive({
  content: computed(() => {
    if (isSkippedLogin.value) {
      return ['Guest User']
    }
    return showWatermark.value ? [userInfoStore().userInfo.name, userInfoStore().userInfo.email] : ['']
  }),
  font: {
    fontSize: 12,
    color: computed(() => (currentTheme.value === 'dark' ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)'))
  },
  rotate: -22,
  gap: [150, 100] as [number, number]
})

const leftPaneSize = ref(27)
const showWatermark = ref(true)
const currentTheme = ref('dark')

interface AiTabState {
  size: number
  currentChatId: string | null
  chatTabs: any[]
}

const savedAiTabState = ref<AiTabState | null>(null)

const handleAiTabStateChanged = (state: AiTabState) => {
  savedAiTabState.value = state
}

const updatePaneSize = () => {
  const container = document.querySelector('.splitpanes') as HTMLElement
  if (container) {
    if (leftPaneSize.value > 0) {
      leftPaneSize.value = 27
    }
  }
}

const handleLeftPaneResize = (params: ResizeParams) => {
  leftPaneSize.value = params.prevPane.size
}

const toggleSideBar = (value: string) => {
  switch (value) {
    case 'agentsLeft':
      {
        if (leftPaneSize.value) {
          leftPaneSize.value = 0
          headerRef.value?.switchIcon('agentsLeft', true)
        } else {
          leftPaneSize.value = 27
          headerRef.value?.switchIcon('agentsLeft', false)
        }
      }
      break
  }
}

const handleModeChange = (mode: 'terminal' | 'agents') => {
  // Save AI state before switching to terminal mode
  if (mode === 'terminal' && aiTabRef.value) {
    try {
      const currentState = aiTabRef.value.getCurrentState?.()
      if (currentState) {
        // Save state to localStorage for persistence across mode switches
        localStorage.setItem('sharedAiTabState', JSON.stringify(currentState))
      }
    } catch (error) {
      console.warn('Failed to save AI state before mode switch:', error)
    }
  }
  eventBus.emit('switch-mode', mode)
}

const handleConversationSelect = async (conversationId: string) => {
  if (aiTabRef.value) {
    try {
      const taskHistory = ((await getGlobalState('taskHistory')) as any[]) || []
      const task = taskHistory.find((h) => h.id === conversationId)

      if (task) {
        // Convert TaskHistoryItem to HistoryItem format to ensure chatTitle is present
        const history = {
          id: task.id,
          chatTitle: task?.chatTitle || task?.task || 'New Chat',
          chatType: task.chatType || 'agent',
          chatContent: [],
          isFavorite: task.isFavorite || false,
          ts: task.ts
        }

        const aiTabInstance = aiTabRef.value as any
        if (aiTabInstance && typeof aiTabInstance.restoreHistoryTab === 'function') {
          await aiTabInstance.restoreHistoryTab(history)
        } else {
          eventBus.emit('restore-history-tab', history)
        }
      }
    } catch (error) {
      console.error('Failed to select conversation:', error)
    }
  }
}

const handleNewChat = async () => {
  if (aiTabRef.value) {
    try {
      const aiTabInstance = aiTabRef.value as any
      if (aiTabInstance && typeof aiTabInstance.createNewEmptyTab === 'function') {
        await aiTabInstance.createNewEmptyTab()
      } else {
        eventBus.emit('create-new-empty-tab')
      }
    } catch (error) {
      console.error('Failed to create new chat:', error)
    }
  }
}

const handleConversationDelete = async (conversationId: string) => {
  if (aiTabRef.value) {
    try {
      const aiTabInstance = aiTabRef.value as any
      if (aiTabInstance && typeof aiTabInstance.handleTabRemove === 'function') {
        await aiTabInstance.handleTabRemove(conversationId)
      } else {
        eventBus.emit('remove-tab', conversationId)
      }
    } catch (error) {
      console.error('Failed to delete conversation tab:', error)
    }
  }
}

const openUserTab = async function (value: string) {
  // TODO: Implement user tab opening in agents mode
  console.log('Open user tab:', value)
}

onMounted(async () => {
  const store = piniaUserConfigStore()
  eventBus.on('updateWatermark', (watermark) => {
    showWatermark.value = watermark !== 'close'
  })
  eventBus.on('updateTheme', (theme) => {
    const actualTheme = getActualTheme(theme)
    currentTheme.value = actualTheme
    document.documentElement.className = `theme-${actualTheme}`
  })
  try {
    let config = await userConfigStore.getConfig()
    store.setUserConfig(config)
    currentTheme.value = config.theme || 'dark'

    nextTick(() => {
      showWatermark.value = config.watermark !== 'close'
    })
  } catch (e) {
    currentTheme.value = 'dark'
    nextTick(() => {
      showWatermark.value = true
    })
  }
  nextTick(() => {
    updatePaneSize()
    if (headerRef.value) {
      headerRef.value.setMode(props.currentMode)
      // Initialize left sidebar icon state (default is expanded, so true means expanded)
      headerRef.value.switchIcon('agentsLeft', leftPaneSize.value > 0)
    }
  })

  // Restore AI state from terminal mode if available
  // Use a watcher to ensure aiTabRef is ready before restoring
  const restoreStateFromTerminal = async () => {
    try {
      const savedStateStr = localStorage.getItem('sharedAiTabState')
      if (savedStateStr && aiTabRef.value && aiTabRef.value.restoreState) {
        const savedState = JSON.parse(savedStateStr)
        // Restore state to agent mode's AiTab
        await aiTabRef.value.restoreState(savedState)
        // Update savedAiTabState to match
        savedAiTabState.value = savedState
        // Clear the shared state after restoring to avoid restoring again
        localStorage.removeItem('sharedAiTabState')
        return true
      }
    } catch (error) {
      console.warn('Failed to restore AI state from terminal mode:', error)
      // Clear invalid state
      localStorage.removeItem('sharedAiTabState')
    }
    return false
  }

  // Watch currentMode changes and sync to Header, also restore AI state when switching to agents
  watch(
    () => props.currentMode,
    async (newMode, oldMode) => {
      if (headerRef.value) {
        headerRef.value.setMode(newMode)
      }
      if (newMode === 'agents' && oldMode === 'terminal') {
        await nextTick()
        setTimeout(async () => {
          await restoreStateFromTerminal()
          if (aiTabRef.value && typeof aiTabRef.value.updateHostsForCommandMode === 'function') {
            await aiTabRef.value.updateHostsForCommandMode()
          }
        }, 100)
      }
    },
    { immediate: false }
  )
  window.addEventListener('resize', updatePaneSize)

  eventBus.on('toggleSideBar', toggleSideBar)
  eventBus.on('open-user-tab', openUserTab)
  eventBus.on('save-state-before-switch', (params: { from: string; to: string }) => {
    if (params.from === 'agents' && params.to === 'terminal' && aiTabRef.value) {
      try {
        const currentState = aiTabRef.value.getCurrentState?.()
        if (currentState) {
          localStorage.setItem('sharedAiTabState', JSON.stringify(currentState))
        }
      } catch (error) {
        console.warn('Failed to save AI state before layout switch:', error)
      }
    }
  })

  // Try to restore immediately on mount (for initial load)
  nextTick(async () => {
    if (!(await restoreStateFromTerminal())) {
      // If not restored yet, wait a bit more and try again
      setTimeout(async () => {
        await restoreStateFromTerminal()
      }, 100)
    }
  })

  nextTick(async () => {
    await initializeThemeFromDatabase()
  })
})

onUnmounted(() => {
  window.removeEventListener('resize', updatePaneSize)
  eventBus.off('toggleSideBar', toggleSideBar)
  eventBus.off('open-user-tab', openUserTab)
  eventBus.off('save-state-before-switch')
})
</script>

<style lang="less">
.agents-layout {
  height: 100vh;
  width: 100vw;
  display: flex;
  flex-direction: column;
  background: var(--bg-color);
  color: var(--text-color);
  margin: 0;

  ::-webkit-scrollbar {
    width: 2px;
  }

  ::-webkit-scrollbar-track {
    background-color: #202020;
    border-radius: 5px;
  }

  ::-webkit-scrollbar-thumb {
    background-color: #202020;
    border-radius: 5px;
  }

  ::-webkit-scrollbar-thumb:hover {
    background-color: #202020;
  }

  .term_header {
    width: 100%;
    height: 28px;
  }

  .term_body {
    width: 100%;
    height: calc(100% - 29px);
    display: flex;

    .term_content {
      width: 100%;
      height: 100%;
      box-sizing: border-box;

      .agents-chat-container {
        width: 100%;
        height: 100%;
        background: var(--bg-color);
      }
    }
  }
}

.splitpanes__splitter {
  background-color: var(--border-color);
  position: relative;
}

.splitpanes__splitter:before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  transition: opacity 0.4s;
  background-color: rgba(77, 77, 77, 0.3);
  opacity: 0;
  z-index: 1;
}

.splitpanes__splitter:hover:before {
  opacity: 1;
}

.splitpanes--vertical > .splitpanes__splitter:before {
  left: -8px;
  right: -8px;
  height: 100%;
}

.left-sidebar-container .splitpanes__pane {
  transition: none !important;
  animation: none !important;
}
</style>
