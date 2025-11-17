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
        <div class="term_left_menu">
          <LeftTab
            @toggle-menu="toggleMenu"
            @open-user-tab="openUserTab"
          ></LeftTab>
        </div>
        <div class="term_content">
          <splitpanes
            class="left-sidebar-container"
            @resize="(params: ResizeParams) => handleLeftPaneResize(params)"
          >
            <pane
              class="term_content_left"
              :size="leftPaneSize"
            >
              <AgentsWorkspace
                v-if="currentMenu == 'workspace'"
                ref="agentsWorkspaceRef"
                @conversation-select="handleConversationSelect"
                @new-chat="handleNewChat"
                @conversation-delete="handleConversationDelete"
              />
              <Extensions
                v-if="currentMenu == 'extensions'"
                ref="extensionsRef"
                :toggle-sidebar="toggleSideBar"
                @open-user-tab="openUserTab"
              />
            </pane>
            <pane :size="100 - leftPaneSize">
              <div class="agents-chat-container">
                <AiTab
                  ref="aiTabRef"
                  :toggle-sidebar="() => {}"
                  :saved-state="savedAiTabState || undefined"
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
import { ref, onMounted, nextTick, onUnmounted, computed, reactive } from 'vue'
import { Splitpanes, Pane } from 'splitpanes'
import 'splitpanes/dist/splitpanes.css'
import AiTab from '@views/components/AiTab/index.vue'
import AgentsWorkspace from '@views/components/AgentsWorkspace/index.vue'
import Header from '@views/components/Header/index.vue'
import LeftTab from '@views/components/LeftTab/index.vue'
import Extensions from '@views/components/Extensions/index.vue'
import { userInfoStore } from '@/store'
import eventBus from '@/utils/eventBus'
import { getActualTheme } from '@/utils/themeUtils'
import { getGlobalState } from '@/agent/storage/state'

interface ResizeParams {
  prevPane: { size: number }
  nextPane: { size: number }
}

const api = window.api as any
const headerRef = ref<InstanceType<typeof Header> | null>(null)
const agentsWorkspaceRef = ref<InstanceType<typeof AgentsWorkspace> | null>(null)
const aiTabRef = ref<InstanceType<typeof AiTab> | null>(null)
const extensionsRef = ref<InstanceType<typeof Extensions> | null>(null)

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

const leftPaneSize = ref(21.097)
const showWatermark = ref(true)
const currentTheme = ref('dark')
const currentMenu = ref('workspace')

interface AiTabState {
  size: number
  currentChatId: string | null
  chatTabs: any[]
  chatAiModelValue?: string
}

const savedAiTabState = ref<AiTabState | null>(null)

const handleAiTabStateChanged = (state: AiTabState) => {
  savedAiTabState.value = state
}

const DEFAULT_WIDTH_PX = 250

const updatePaneSize = () => {
  const container = document.querySelector('.splitpanes') as HTMLElement
  if (container) {
    if (leftPaneSize.value > 0) {
      const containerWidth = container.offsetWidth
      leftPaneSize.value = (DEFAULT_WIDTH_PX / containerWidth) * 100
    }
  }
}

const handleLeftPaneResize = (params: ResizeParams) => {
  leftPaneSize.value = params.prevPane.size
  debouncedResizeCheck()
}

let resizeTimeout: number | null = null
const debouncedResizeCheck = () => {
  if (resizeTimeout) {
    clearTimeout(resizeTimeout)
  }

  resizeTimeout = window.setTimeout(() => {
    const container = document.querySelector('.splitpanes') as HTMLElement
    if (container) {
      const containerWidth = container.offsetWidth
      const currentLeftPaneSize = leftPaneSize.value
      const leftPaneWidthPx = (currentLeftPaneSize / 100) * containerWidth

      if (leftPaneWidthPx < 120 && currentLeftPaneSize > 0) {
        leftPaneSize.value = 0
        headerRef.value?.switchIcon('left', false)
      }
    }
    resizeTimeout = null
  }, 50)
}

const toggleSideBar = (value: string) => {
  const container = document.querySelector('.splitpanes') as HTMLElement
  const containerWidth = container.offsetWidth
  switch (value) {
    case 'left':
      {
        if (leftPaneSize.value) {
          leftPaneSize.value = 0
          headerRef.value?.switchIcon('left', false)
        } else {
          leftPaneSize.value = (DEFAULT_WIDTH_PX / containerWidth) * 100
          headerRef.value?.switchIcon('left', true)
        }
      }
      break
  }
}

const toggleMenu = function (params) {
  const type = params?.type
  const container = document.querySelector('.splitpanes') as HTMLElement
  const containerWidth = container.offsetWidth
  const expandFn = (dir) => {
    if (dir == 'left') {
      leftPaneSize.value = (DEFAULT_WIDTH_PX / containerWidth) * 100
      headerRef.value?.switchIcon('left', true)
    }
  }
  const shrinkFn = (dir) => {
    if (dir == 'left') {
      leftPaneSize.value = 0
      headerRef.value?.switchIcon('left', false)
    }
  }
  if (params.menu == 'ai') {
    // In agents mode, AI menu should not toggle sidebar
    return
  } else {
    currentMenu.value = params.menu
    switch (type) {
      case 'same':
        leftPaneSize.value == 0 ? expandFn('left') : shrinkFn('left')
        break
      case 'dif':
        leftPaneSize.value == 0 ? expandFn('left') : ''
        break
    }
  }
}

const handleModeChange = (mode: 'terminal' | 'agents') => {
  eventBus.emit('switch-mode', mode)
}

const handleConversationSelect = async (conversationId: string) => {
  if (aiTabRef.value) {
    try {
      // Load conversation history
      const taskHistory = ((await getGlobalState('taskHistory')) as any[]) || []
      const history = taskHistory.find((h) => h.id === conversationId)

      if (history) {
        // Use the restoreHistoryTab method from AiTab
        // Access it through the component instance
        const aiTabInstance = aiTabRef.value as any
        if (aiTabInstance && typeof aiTabInstance.restoreHistoryTab === 'function') {
          await aiTabInstance.restoreHistoryTab(history)
        } else {
          // Fallback: emit event to AiTab to restore history
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
      // Create new empty tab
      const aiTabInstance = aiTabRef.value as any
      if (aiTabInstance && typeof aiTabInstance.createNewEmptyTab === 'function') {
        await aiTabInstance.createNewEmptyTab()
      } else {
        // Fallback: emit event to AiTab to create new tab
        eventBus.emit('create-new-empty-tab')
      }
    } catch (error) {
      console.error('Failed to create new chat:', error)
    }
  }
}

const handleConversationDelete = async (conversationId: string) => {
  // The sidebar already handles local deletion
  // We may need to notify the AiTab to remove the tab if it's open
  if (aiTabRef.value) {
    try {
      // Remove tab from AiTab if it exists
      const aiTabInstance = aiTabRef.value as any
      if (aiTabInstance && typeof aiTabInstance.handleTabRemove === 'function') {
        await aiTabInstance.handleTabRemove(conversationId)
      } else {
        // Fallback: emit event to AiTab to remove tab
        eventBus.emit('remove-tab', conversationId)
      }
    } catch (error) {
      console.error('Failed to delete conversation tab:', error)
    }
  }
}

const openUserTab = async function (value) {
  // Handle user tab opening
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
      headerRef.value.setMode('agents')
    }
  })
  window.addEventListener('resize', updatePaneSize)

  eventBus.on('toggleSideBar', toggleSideBar)
  eventBus.on('open-user-tab', openUserTab)

  nextTick(() => {
    let theme = localStorage.getItem('theme') || 'auto'
    api.mainWindowInit(theme)
    api.mainWindowShow()
  })
})

onUnmounted(() => {
  window.removeEventListener('resize', updatePaneSize)
  eventBus.off('toggleSideBar', toggleSideBar)
  eventBus.off('open-user-tab', openUserTab)
})

defineExpose({
  resizeTerm: () => {
    // No terminal to resize in agents mode
  }
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

    .term_left_menu {
      width: 40px;
      height: 100%;
      box-sizing: border-box;
    }

    .term_content {
      width: calc(100% - 40px);
      height: 100%;
      box-sizing: border-box;

      .term_content_left {
        width: 250px;
      }

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
