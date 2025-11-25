<template>
  <a-watermark v-bind="watermarkContent">
    <div
      v-if="contextMenu.visible"
      ref="contextMenuRef"
      class="context-menu"
      :style="{ left: contextMenu.x + 'px', top: contextMenu.y + 'px' }"
      @click.stop
    >
      <div
        class="context-menu-item"
        @click="closeCurrentPanel"
      >
        <span>{{ $t('common.close') }}</span>
      </div>
      <div
        class="context-menu-item"
        @click="closeOtherPanelsAllGroups"
      >
        <span>{{ $t('common.closeOther') }}</span>
      </div>
      <div
        class="context-menu-item"
        @click="closeAllPanels"
      >
        <span>{{ $t('common.closeAll') }}</span>
      </div>
      <div
        class="context-menu-item"
        @click="renamePanelInline"
      >
        <span>{{ $t('common.rename') }}</span>
      </div>
      <div
        class="context-menu-item"
        @click="createNewPanel(true, 'within')"
      >
        <span>{{ $t('common.clone') }}</span>
      </div>
      <div
        class="context-menu-item"
        @click="createNewPanel(false, 'right')"
      >
        <span>{{ $t('common.splitRight') }}</span>
      </div>
      <div
        class="context-menu-item"
        @click="createNewPanel(false, 'below')"
      >
        <span>{{ $t('common.splitDown') }}</span>
      </div>
    </div>
    <div
      v-if="renaming"
      :style="{
        position: 'fixed',
        left: renameRect.x + 'px',
        top: renameRect.y + 'px',
        width: renameRect.width + 'px',
        height: renameRect.height + 'px',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'stretch'
      }"
    >
      <input
        ref="renameInputRef"
        v-model="renamingTitle"
        class="tab-title-input"
        style="width: 100%; height: 100%; box-sizing: border-box; padding: 0 6px"
        @blur="finishRename"
        @keyup.enter="finishRename"
        @keyup.esc="cancelRename"
      />
    </div>
    <div
      class="terminal-layout"
      :class="{ 'transparent-bg': isTransparent }"
    >
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
              <Workspace
                v-if="currentMenu == 'workspace'"
                :toggle-sidebar="toggleSideBar"
                @change-company="changeCompany"
                @current-click-server="currentClickServer"
                @open-user-tab="openUserTab"
              />
              <Extensions
                v-if="currentMenu == 'extensions'"
                ref="extensionsRef"
                :toggle-sidebar="toggleSideBar"
                @open-user-tab="openUserTab"
              />
            </pane>
            <pane :size="100 - leftPaneSize">
              <splitpanes @resize="onMainSplitResize">
                <!-- Main terminal area (including vertical split) -->
                <pane
                  :size="mainTerminalSize"
                  :min-size="30"
                >
                  <!-- Vertical split container, only affects main terminal area -->
                  <splitpanes
                    horizontal
                    @resize="onVerticalSplitResize"
                  >
                    <!-- Main terminal window -->
                    <pane
                      :size="mainVerticalSize"
                      :min-size="30"
                    >
                      <div
                        class="main-terminal-area"
                        @mousedown="handleMainPaneFocus"
                      >
                        <transition name="fade">
                          <div
                            v-if="!hasPanels"
                            class="dashboard-overlay"
                          >
                            <Dashboard />
                          </div>
                        </transition>
                        <DockviewVue
                          v-if="configLoaded"
                          ref="dockviewRef"
                          :class="currentTheme === 'light' ? 'dockview-theme-light' : 'dockview-theme-dark'"
                          :style="{
                            width: '100%',
                            height: '100%',
                            visibility: hasPanels ? 'visible' : 'hidden'
                          }"
                          @ready="onDockReady"
                        />
                      </div>
                    </pane>
                  </splitpanes>
                </pane>
                <!-- AI sidebar -->
                <pane
                  v-if="showAiSidebar"
                  :size="aiSidebarSize"
                >
                  <div
                    class="rigth-sidebar"
                    tabindex="0"
                  >
                    <AiTab
                      ref="aiTabRef"
                      :toggle-sidebar="toggleAiSidebar"
                      :saved-state="savedAiSidebarState || undefined"
                      @state-changed="handleAiTabStateChanged"
                    />
                  </div>
                </pane>
              </splitpanes>
            </pane>
          </splitpanes>
          <div
            v-if="isShowCommandBar"
            class="toolbar"
            :style="{ width: commandBarStyle.width + 'px', left: commandBarStyle.left + 'px' }"
          >
            <QuickCommandBar
              v-if="isShowQuickCommand"
              @send="sendQuickCommand"
            />
            <div
              v-if="isGlobalInput"
              class="globalInput"
            >
              <a-input
                v-model:value="globalInput"
                size="small"
                class="command-input"
                :placeholder="t('common.executeCommandToAllWindows')"
                allow-clear
                @press-enter="sendGlobalCommand"
              >
              </a-input>
            </div>
          </div>
        </div>
      </div>
    </div>
  </a-watermark>
</template>
<script setup lang="ts">
interface ResizeParams {
  prevPane: { size: number }
  nextPane: { size: number }
}
import { useI18n } from 'vue-i18n'
import { userConfigStore } from '@/services/userConfigStoreService'
import { userConfigStore as piniaUserConfigStore } from '@/store/userConfigStore'
import { ref, onMounted, nextTick, onUnmounted, watch, computed, onBeforeUnmount } from 'vue'
import { Splitpanes, Pane } from 'splitpanes'
import 'splitpanes/dist/splitpanes.css'
import AiTab from '@views/components/AiTab/index.vue'
import Header from '@views/components/Header/index.vue'
import LeftTab from '@views/components/LeftTab/index.vue'
import Workspace from '@views/components/Workspace/index.vue'
import Extensions from '@views/components/Extensions/index.vue'
import TabsPanel from './tabsPanel.vue'
import QuickCommandBar from '@/views/components/Ssh/quickCommandBar.vue'
import { reactive } from 'vue'
import { v4 as uuidv4 } from 'uuid'
import { userInfoStore } from '@/store'
import { aliasConfigStore } from '@/store/aliasConfigStore'
import eventBus from '@/utils/eventBus'
import { getActualTheme } from '@/utils/themeUtils'
import { Notice } from '../components/Notice'
import { isGlobalInput, isShowCommandBar, isShowQuickCommand } from '@renderer/views/components/Ssh/termInputManager'
import { inputManager } from '../components/Ssh/termInputManager'
import { useRouter } from 'vue-router'
import { shortcutService } from '@/services/shortcutService'
import { captureExtensionUsage, ExtensionNames, ExtensionStatus } from '@/utils/telemetry'
import Dashboard from '@views/components/Ssh/dashboard.vue'

// Define props
const props = defineProps<{
  currentMode: 'terminal' | 'agents'
}>()

const router = useRouter()
const api = window.api as any
const { t } = useI18n()
const aliasConfig = aliasConfigStore()
const configStore = piniaUserConfigStore()
const isTransparent = computed(() => !!configStore.getUserConfig.background.image)
const headerRef = ref<InstanceType<typeof Header> | null>(null)
const extensionsRef = ref<InstanceType<typeof Extensions> | null>(null)
const allTabs = ref<InstanceType<typeof TabsPanel> | null>(null)
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
const mainTerminalSize = ref(100)
const showWatermark = ref(true)
const currentTheme = ref('dark')
const aiSidebarSize = ref(0)
interface SplitPaneItem {
  size: number
  tabs: TabItem[]
  activeTabId: string
  verticalSplitPanes?: { size: number; tabs: TabItem[]; activeTabId: string }[]
  mainVerticalSize?: number
}
const splitPanes = ref<SplitPaneItem[]>([])
const showAiSidebar = ref(false)
const showSplitPane = ref(false)
const showVerticalSplitPane = ref(false)
const verticalSplitPanes = ref<{ size: number; tabs: TabItem[]; activeTabId: string }[]>([])
const mainVerticalSize = ref(100)
const globalInput = ref('')
const focusedSplitPaneIndex = ref<number | null>(null)
const focusedPane = ref<{ type: 'main' | 'horizontal' | 'vertical' | 'rightVertical'; index?: number; rightPaneIndex?: number }>({ type: 'main' })
const lastFocusedElement = ref<HTMLElement | null>(null)

interface AiSidebarState {
  size: number
  currentChatId: string | null
  chatTabs: Array<{
    id: string
    title: string
    hosts: any[]
    chatType: string
    autoUpdateHost: boolean
    inputValue: string
    session: {
      chatHistory: any[]
      lastChatMessageId: string
      responseLoading: boolean
      showCancelButton: boolean
      showSendButton: boolean
      buttonsDisabled: boolean
      resumeDisabled: boolean
      isExecutingCommand: boolean
      showRetryButton: boolean
      showNewTaskButton: boolean
      messageFeedbacks: Record<string, 'like' | 'dislike'>
    }
  }>
  chatAiModelValue?: string
}

const savedAiSidebarState = ref<AiSidebarState | null>(null)
const aiTabRef = ref<InstanceType<typeof AiTab> | null>(null)

const handleAiTabStateChanged = (state: AiSidebarState) => {
  savedAiSidebarState.value = state
}

const saveAiSidebarState = () => {
  if (aiTabRef.value) {
    try {
      const currentState = aiTabRef.value.getCurrentState?.()
      if (currentState) {
        savedAiSidebarState.value = {
          ...currentState,
          size: aiSidebarSize.value
        }
      } else if (savedAiSidebarState.value) {
        savedAiSidebarState.value.size = aiSidebarSize.value
      }
    } catch (error) {
      console.warn('Failed to get AI Tab state:', error)
      if (savedAiSidebarState.value) {
        savedAiSidebarState.value.size = aiSidebarSize.value
      }
    }
  } else {
    if (savedAiSidebarState.value) {
      savedAiSidebarState.value.size = aiSidebarSize.value
    }
  }
}

const savePreviousFocus = () => {
  const activeElement = document.activeElement as HTMLElement
  if (activeElement && activeElement !== document.body) {
    lastFocusedElement.value = activeElement
  }
}

const restorePreviousFocus = () => {
  if (lastFocusedElement.value) {
    nextTick(() => {
      try {
        lastFocusedElement.value?.focus()
      } catch (error) {
        console.warn('Failed to restore focus:', error)
      }
    })
  }
}

const focusRightSidebar = () => {
  nextTick(() => {
    const chatTextarea = document.querySelector('.rigth-sidebar .chat-textarea')
    if (chatTextarea) {
      ;(chatTextarea as HTMLElement).focus()
    }
  })
}

const switchToNextTab = () => {
  if (!dockApi) {
    return
  }

  // 获取所有 panels
  const panels = dockApi.panels

  if (panels.length <= 1) {
    return
  }

  // 获取当前活跃的 panel
  const activePanel = dockApi.activePanel

  if (!activePanel) {
    if (panels.length > 0) {
      panels[0].api.setActive()
    }
    return
  }

  // 寻找当前活跃 panel 的索引
  const currentIndex = panels.findIndex((panel) => panel.id === activePanel.id)

  if (currentIndex === -1) {
    return
  }

  // 计算下一个索引（循环）
  const nextIndex = (currentIndex + 1) % panels.length
  const nextPanel = panels[nextIndex]

  if (nextPanel) {
    nextPanel.api.setActive()
  }
}

const switchToPrevTab = () => {
  if (!dockApi) {
    return
  }

  const panels = dockApi.panels

  if (panels.length <= 1) {
    return
  }

  const activePanel = dockApi.activePanel

  if (!activePanel) {
    if (panels.length > 0) {
      panels[panels.length - 1].api.setActive()
    }
    return
  }

  const currentIndex = panels.findIndex((panel) => panel.id === activePanel.id)

  if (currentIndex === -1) {
    return
  }

  const previousIndex = (currentIndex - 1 + panels.length) % panels.length
  const previousPanel = panels[previousIndex]

  if (previousPanel) {
    previousPanel.api.setActive()
  }
}

const switchToSpecificTab = (tabNumber: number) => {
  if (!dockApi) {
    return
  }

  if (tabNumber < 1 || tabNumber > 9) {
    return
  }

  if (focusedPane.value.type !== 'main') {
    focusedPane.value = { type: 'main' }
    focusedSplitPaneIndex.value = null
  }

  const panels = dockApi.panels

  if (panels.length < tabNumber) {
    return
  }

  const targetIndex = tabNumber - 1
  const targetPanel = panels[targetIndex]

  if (targetPanel) {
    switchTab(targetPanel.id)
  }
}

const configLoaded = ref(false)

onMounted(async () => {
  const store = piniaUserConfigStore()
  await shortcutService.loadShortcuts()
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
    if (!config.feature || config.feature < 1.0) {
      config.autoCompleteStatus = 1
      config.feature = 1.0
      await userConfigStore.saveConfig(config)
    }
    store.setUserConfig(config)
    configLoaded.value = true
    currentTheme.value = config.theme || 'dark'

    // Delay of 2 seconds to wait for the main thread to complete initializeTelemetrySetting
    setTimeout(async () => {
      const extensionStates = [
        { name: ExtensionNames.AUTO_COMPLETE, enabled: config.autoCompleteStatus === 1 },
        { name: ExtensionNames.VIM_EDITOR, enabled: config.quickVimStatus === 1 },
        { name: ExtensionNames.ALIAS, enabled: config.aliasStatus === 1 },
        { name: ExtensionNames.HIGHLIGHT, enabled: config.highlightStatus === 1 }
      ]

      for (const extension of extensionStates) {
        const status = extension.enabled ? ExtensionStatus.ENABLED : ExtensionStatus.DISABLED
        await captureExtensionUsage(extension.name, status, { trigger: 'app_startup' })
      }
    }, 2000)

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
      headerRef.value.switchIcon('right', showAiSidebar.value)
      headerRef.value.setMode(props.currentMode)
    }
  })

  // Restore AI state from agents mode if available
  const restoreStateFromAgents = async () => {
    try {
      const savedStateStr = localStorage.getItem('sharedAiTabState')
      if (savedStateStr) {
        const savedState = JSON.parse(savedStateStr)
        savedAiSidebarState.value = savedState

        if (showAiSidebar.value && aiTabRef.value && aiTabRef.value.restoreState) {
          await nextTick()
          await aiTabRef.value.restoreState(savedState)
        }

        localStorage.removeItem('sharedAiTabState')
        return true
      }
    } catch (error) {
      console.warn('Failed to restore AI state from agents mode:', error)
      // Clear invalid state
      localStorage.removeItem('sharedAiTabState')
    }
    return false
  }

  // Watch currentMode changes and sync to Header, also restore AI state when switching to terminal
  watch(
    () => props.currentMode,
    async (newMode, oldMode) => {
      if (headerRef.value) {
        headerRef.value.setMode(newMode)
      }
      // When switching from agents to terminal, restore AI state and reset layout
      if (newMode === 'terminal' && oldMode === 'agents') {
        await nextTick()
        // Reset layout state to ensure proper display
        const container = document.querySelector('.splitpanes') as HTMLElement
        if (container) {
          const containerWidth = container.offsetWidth
          // Preserve left pane collapsed state, only recalculate if expanded
          const wasCollapsed = leftPaneSize.value === 0
          if (!wasCollapsed) {
            // Reset left pane size to default only if it was expanded
            leftPaneSize.value = (DEFAULT_WIDTH_PX / containerWidth) * 100
            // Update pane size to ensure correct layout
            updatePaneSize()
          }
          // Update header icon state to match left pane state
          if (headerRef.value) {
            headerRef.value.switchIcon('left', !wasCollapsed)
          }
          // Reset main terminal size based on split panes and AI sidebar state
          if (showSplitPane.value) {
            // If there are split panes, adjust them to equal width
            adjustSplitPaneToEqualWidth()
          } else {
            // Otherwise, set main terminal size based on AI sidebar
            if (showAiSidebar.value) {
              mainTerminalSize.value = 100 - aiSidebarSize.value
            } else {
              mainTerminalSize.value = 100
            }
          }
        }
        // Wait a bit for aiTabRef to be ready
        setTimeout(async () => {
          await restoreStateFromAgents()
        }, 200)
      }
    },
    { immediate: false }
  )
  window.addEventListener('resize', updatePaneSize)
  aliasConfig.initialize()

  // Initialize shortcut service
  shortcutService.init()

  eventBus.on('currentClickServer', currentClickServer)
  eventBus.on('getActiveTabAssetInfo', handleGetActiveTabAssetInfo)
  eventBus.on('toggleSideBar', toggleSideBar)
  eventBus.on('createSplitTab', handleCreateSplitTab)
  eventBus.on('createVerticalSplitTab', handleCreateVerticalSplitTab)
  eventBus.on('adjustSplitPaneToEqual', adjustSplitPaneToEqualWidth)
  eventBus.on('sendOrToggleAiFromTerminal', handleSendOrToggleAiFromTerminal)
  eventBus.on('switchToNextTab', switchToNextTab)
  eventBus.on('switchToPrevTab', switchToPrevTab)
  eventBus.on('switchToSpecificTab', switchToSpecificTab)
  eventBus.on('createNewTerminal', handleCreateNewTerminal)
  eventBus.on('open-user-tab', openUserTab)
  eventBus.on('save-state-before-switch', (params: { from: string; to: string }) => {
    if (params.from === 'terminal' && params.to === 'agents' && aiTabRef.value) {
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

  nextTick(async () => {
    if (!(await restoreStateFromAgents())) {
      setTimeout(async () => {
        await restoreStateFromAgents()
      }, 200)
    }
  })

  nextTick(() => {
    let theme = localStorage.getItem('theme') || 'auto'
    api.mainWindowInit(theme)
    api.mainWindowShow()
  })
})
const timer = ref<number | null>(null)
watch(mainTerminalSize, () => {
  if (allTabs.value != null) {
    if (timer.value) {
      return
    } else {
      timer.value = window.setTimeout(() => {
        allTabs.value?.resizeTerm()
        timer.value = null
      }, 200)
    }
  }
})
watch(leftPaneSize, () => {
  if (allTabs.value != null) {
    if (timer.value) {
      return
    } else {
      timer.value = window.setTimeout(() => {
        allTabs.value?.resizeTerm()
        timer.value = null
      }, 200)
    }
  }
})
watch(showAiSidebar, (newValue) => {
  if (headerRef.value) {
    headerRef.value.switchIcon('right', newValue)
  }
})
const commandBarStyle = computed(() => {
  const container = document.querySelector('.splitpanes') as HTMLElement
  const containerWidth = container?.offsetWidth
  const width = ((100 - leftPaneSize.value) * containerWidth * (100 - aiSidebarSize.value)) / 10000 - 10
  const left = (leftPaneSize.value * containerWidth) / 100 + 45
  return { width, left }
})
const DEFAULT_WIDTH_PX = 250
const DEFAULT_WIDTH_RIGHT_PX = 500
const currentMenu = ref('workspace')
const updatePaneSize = () => {
  const container = document.querySelector('.splitpanes') as HTMLElement
  if (container) {
    if (leftPaneSize.value > 0) {
      const containerWidth = container.offsetWidth
      leftPaneSize.value = (DEFAULT_WIDTH_PX / containerWidth) * 100
    }
  }
}

// Handle left pane resize and auto-hide when width is less than 160px
const handleLeftPaneResize = (params: ResizeParams) => {
  // Always update the size first
  leftPaneSize.value = params.prevPane.size

  // Then check if we need to auto-hide with debouncing
  debouncedResizeCheck()
}

// Add debounced monitoring for smooth resize
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

      // Auto-hide if width is less than 120px
      if (leftPaneWidthPx < 120 && currentLeftPaneSize > 0) {
        leftPaneSize.value = 0
        headerRef.value?.switchIcon('left', false)
      }
    }
    resizeTimeout = null
  }, 50) // Debounce for 50ms to avoid flickering
}

const toggleSideBar = (value: string) => {
  const container = document.querySelector('.splitpanes') as HTMLElement
  const containerWidth = container.offsetWidth
  switch (value) {
    case 'right':
      if (showAiSidebar.value) {
        saveAiSidebarState()
        showAiSidebar.value = false
        aiSidebarSize.value = 0
        headerRef.value?.switchIcon('right', false)
        if (showSplitPane.value) {
          adjustSplitPaneToEqualWidth()
        } else {
          mainTerminalSize.value = 100
        }
        restorePreviousFocus()
      } else {
        savePreviousFocus()
        showAiSidebar.value = true
        const restoredSize = savedAiSidebarState.value?.size || (DEFAULT_WIDTH_RIGHT_PX / containerWidth) * 100
        aiSidebarSize.value = restoredSize
        headerRef.value?.switchIcon('right', true)
        if (showSplitPane.value) {
          adjustSplitPaneToEqualWidth()
        } else {
          mainTerminalSize.value = 100 - aiSidebarSize.value
        }
        nextTick(() => {
          if (aiTabRef.value && savedAiSidebarState.value) {
            aiTabRef.value.restoreState(savedAiSidebarState.value)
          }
        })
        focusRightSidebar()
      }
      break
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
    } else {
      showAiSidebar.value = true
      const restoredSize = savedAiSidebarState.value?.size || (DEFAULT_WIDTH_RIGHT_PX / containerWidth) * 100
      aiSidebarSize.value = restoredSize
      mainTerminalSize.value =
        100 - aiSidebarSize.value - (splitPanes.value.length > 0 ? splitPanes.value.reduce((acc, pane) => acc + pane.size, 0) : 0)
      headerRef.value?.switchIcon('right', true)
      nextTick(() => {
        if (aiTabRef.value && savedAiSidebarState.value) {
          aiTabRef.value.restoreState(savedAiSidebarState.value)
        }
      })
    }
  }
  const shrinkFn = (dir) => {
    if (dir == 'left') {
      leftPaneSize.value = 0
      headerRef.value?.switchIcon('left', false)
    } else {
      showAiSidebar.value = false
      aiSidebarSize.value = 0
      mainTerminalSize.value = 100 - (splitPanes.value.length > 0 ? splitPanes.value.reduce((acc, pane) => acc + pane.size, 0) : 0)
      headerRef.value?.switchIcon('right', false)
    }
  }
  if (params.menu == 'ai') {
    currentMenu.value = params.beforeActive
    if (!showAiSidebar.value) {
      savePreviousFocus()
      const container = document.querySelector('.splitpanes') as HTMLElement
      if (container) {
        const containerWidth = container.offsetWidth
        showAiSidebar.value = true
        const restoredSize = savedAiSidebarState.value?.size || (DEFAULT_WIDTH_RIGHT_PX / containerWidth) * 100
        aiSidebarSize.value = restoredSize
        headerRef.value?.switchIcon('right', true)
        if (showSplitPane.value) {
          adjustSplitPaneToEqualWidth()
        } else {
          mainTerminalSize.value = 100 - aiSidebarSize.value
        }
        nextTick(() => {
          if (aiTabRef.value && savedAiSidebarState.value) {
            aiTabRef.value.restoreState(savedAiSidebarState.value)
          }
        })
        focusRightSidebar()
      }
    } else {
      saveAiSidebarState()
      showAiSidebar.value = false
      aiSidebarSize.value = 0
      headerRef.value?.switchIcon('right', false)
      if (showSplitPane.value) {
        adjustSplitPaneToEqualWidth()
      } else {
        mainTerminalSize.value = 100
      }
      restorePreviousFocus()
    }
  } else if (params.menu == 'openAiRight') {
    currentMenu.value = params.beforeActive
    if (!showAiSidebar.value) {
      savePreviousFocus()
      expandFn('right')
      focusRightSidebar()
    }
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

interface TabItem {
  id: string
  title: string
  content: string
  type: string
  organizationId: string
  ip: string
  data: any
}
const openedTabs = ref<TabItem[]>([])
const activeTabId = ref('')
const currentClickServer = async (item) => {
  if (isSkippedLogin.value && needsAuth(item)) {
    Notice.open({
      type: 'warning',
      description: t('common.pleaseLoginFirst'),
      duration: 3,
      btns: [
        {
          text: t('common.login'),
          action: () => {
            router.push('/login')
          }
        }
      ]
    })
    return
  }

  if (item.children) return

  const id_ = uuidv4()
  const newTab = {
    id: id_,
    title: item.title,
    content: item.key,
    type: item.type ? item.type : 'term',
    organizationId: item.organizationId ? item.organizationId : '',
    ip: item.ip ? item.ip : '',
    data: item
  }
  if (focusedPane.value.type === 'rightVertical' && focusedPane.value.index !== undefined && focusedPane.value.rightPaneIndex !== undefined) {
    const rightPane = splitPanes.value[focusedPane.value.rightPaneIndex]
    if (rightPane && rightPane.verticalSplitPanes && focusedPane.value.index < rightPane.verticalSplitPanes.length) {
      const targetPane = rightPane.verticalSplitPanes[focusedPane.value.index]
      targetPane.tabs.push(newTab)
      targetPane.activeTabId = id_
    }
  } else if (
    focusedPane.value.type === 'vertical' &&
    focusedPane.value.index !== undefined &&
    focusedPane.value.index < verticalSplitPanes.value.length
  ) {
    const targetPane = verticalSplitPanes.value[focusedPane.value.index]
    targetPane.tabs.push(newTab)
    targetPane.activeTabId = id_
  } else if (focusedPane.value.type === 'horizontal' && focusedPane.value.index !== undefined && focusedPane.value.index < splitPanes.value.length) {
    const targetPane = splitPanes.value[focusedPane.value.index]
    targetPane.tabs.push(newTab)
    targetPane.activeTabId = id_
  } else {
    // openedTabs.value.push(newTab)
    addDockPanel(newTab)
    activeTabId.value = id_
  }

  checkActiveTab(item.type || 'term')
}

const needsAuth = (item) => {
  return false
  // const authRequiredTypes = ['extensions']
  // if (item.type === 'term' && item.data?.type === 'ssh') {
  //   return false
  // }
  // return authRequiredTypes.includes(item.type || 'term')
}

const createTab = (infos) => {
  const id_ = uuidv4()
  const tab = {
    id: id_,
    title: infos.title,
    content: infos.content,
    type: infos.type,
    organizationId: infos.organizationId,
    ip: infos.ip,
    data: infos.data
  }
  // openedTabs.value.push(tab)
  activeTabId.value = id_
  checkActiveTab(infos.type)
  addDockPanel(tab)
}

const adjustSplitPaneToEqualWidth = () => {
  if (showSplitPane.value) {
    const availableSpace = 100 - (showAiSidebar.value ? aiSidebarSize.value : 0)
    const paneCount = splitPanes.value.length + 1
    const equalSize = availableSpace / paneCount

    mainTerminalSize.value = equalSize
    splitPanes.value.forEach((pane) => {
      pane.size = equalSize
    })
  }
}

const handleCreateSplitTab = (info) => {
  createNewPanel(false, 'right', 'panel_' + info.id)
}

const handleCreateVerticalSplitTab = (info) => {
  createNewPanel(false, 'below', 'panel_' + info.id)
}

const handleCreateNewTerminal = () => {
  if (!dockApi) {
    return
  }
  const activePanel = dockApi.activePanel

  if (activePanel && activePanel.params) {
    const params = activePanel.params
    const data = params.data || {}

    const newTerminalInfo = {
      title: activePanel.api.title || params.title,
      content: params.content,
      type: params.type,
      organizationId: params.organizationId || data.organizationId,
      ip: params.ip || data.ip,
      data: data
    }

    createTab(newTerminalInfo)
  } else {
    openUserTab('userConfig')
  }
}

const switchTab = (panelId: string) => {
  if (!dockApi) {
    return
  }

  const panel = dockApi.getPanel(panelId)
  if (!panel) {
    return
  }
  panel.api.setActive()
  activeTabId.value = panelId
  const panelParams = panel.params
  const panelType = panelParams?.type
  // TODO
  if (panelType === 'term' || panelType === 'ssh') {
    nextTick(() => {})
  }
  checkActiveTab(panelType)
}

onUnmounted(() => {
  eventBus.off('save-state-before-switch')
  shortcutService.destroy()
  window.removeEventListener('resize', updatePaneSize)
  eventBus.off('currentClickServer', currentClickServer)
  eventBus.off('getActiveTabAssetInfo', handleGetActiveTabAssetInfo)
  eventBus.off('toggleSideBar', toggleSideBar)
  eventBus.off('createSplitTab', handleCreateSplitTab)
  eventBus.off('createVerticalSplitTab', handleCreateVerticalSplitTab)
  eventBus.off('adjustSplitPaneToEqual', adjustSplitPaneToEqualWidth)
  eventBus.off('switchToNextTab', switchToNextTab)
  eventBus.off('switchToPrevTab', switchToPrevTab)
  eventBus.off('switchToSpecificTab', switchToSpecificTab)
  eventBus.off('createNewTerminal', handleCreateNewTerminal)
  eventBus.off('open-user-tab', openUserTab)
})
const openUserTab = async function (value) {
  if (
    value === 'assetConfig' ||
    value === 'keyChainConfig' ||
    value === 'userInfo' ||
    value === 'userConfig' ||
    value === 'mcpConfigEditor' ||
    value === 'securityConfigEditor'
  ) {
    if (!dockApi) return

    const existingPanel = dockApi.panels.find((panel) => panel.params?.content === value || panel.params?.type === value)
    if (existingPanel) {
      existingPanel.api.setActive()
      return
    }
  }
  const p = {
    title: value,
    key: value,
    type: value
  }
  switch (value) {
    case 'aliasConfig':
      p.title = 'alias'
      p.type = 'extensions'
      break
    case 'securityConfigEditor': {
      // 获取配置文件路径并提取文件名
      try {
        const { securityConfigService } = await import('@/services/securityConfigService')
        const configPath = await securityConfigService.getConfigPath()
        // 提取文件名（兼容 Windows 和 Unix 路径）
        const fileName = configPath.split(/[/\\]/).pop() || 'chaterm-security.json'
        p.title = fileName
      } catch (error) {
        console.error('Failed to get security config path:', error)
        p.title = 'chaterm-security.json' // 默认文件名
      }
      break
    }
  }
  currentClickServer(p)
}

const changeCompany = () => {
  openedTabs.value = []
}

const getActiveTabAssetInfo = async () => {
  if (!dockApi) {
    return null
  }

  const activePanel = dockApi.activePanel
  if (!activePanel) {
    return null
  }

  const params = activePanel.params
  if (!params) {
    return null
  }

  const ip = params.data?.ip || params.ip
  if (!ip) {
    return null
  }

  let outputContext = 'Output context not applicable for this tab type.'

  const uuid = params.data?.uuid || params.uuid

  return {
    uuid: uuid,
    title: activePanel.api.title || params.title,
    ip: params.ip || params.data?.ip,
    organizationId: params.organizationId || params.data?.organizationId,
    type: params.type || params.data?.type,
    outputContext: outputContext,
    tabSessionId: activePanel.id
  }
}

const handleGetActiveTabAssetInfo = async () => {
  const assetInfo = await getActiveTabAssetInfo()
  eventBus.emit('assetInfoResult', assetInfo)
}

const toggleAiSidebar = () => {
  const container = document.querySelector('.splitpanes') as HTMLElement
  if (container) {
    const containerWidth = container.offsetWidth
    if (showAiSidebar.value) {
      showAiSidebar.value = false
      aiSidebarSize.value = 0
      headerRef.value?.switchIcon('right', false)
      if (showSplitPane.value) {
        adjustSplitPaneToEqualWidth()
      } else {
        mainTerminalSize.value = 100
      }
      restorePreviousFocus()
    } else {
      savePreviousFocus()
      showAiSidebar.value = true
      aiSidebarSize.value = (DEFAULT_WIDTH_RIGHT_PX / containerWidth) * 100
      headerRef.value?.switchIcon('right', true)
      if (showSplitPane.value) {
        adjustSplitPaneToEqualWidth()
      } else {
        mainTerminalSize.value = 100 - aiSidebarSize.value
      }
      focusRightSidebar()
    }
  }
}

const onMainSplitResize = (params) => {
  mainTerminalSize.value = params.prevPane.size
  if (showAiSidebar.value) {
    aiSidebarSize.value = params.panes[params.panes.length - 1].size
  }
  if (splitPanes.value.length > 0) {
    const startIndex = 1
    const endIndex = showAiSidebar.value ? params.panes.length - 2 : params.panes.length - 1
    for (let i = startIndex; i <= endIndex; i++) {
      if (splitPanes.value[i - 1]) {
        splitPanes.value[i - 1].size = params.panes[i].size
      }
    }
  }
}
const sendQuickCommand = (cmd: string) => {
  inputManager.sendToActiveTerm(cmd)
}
const sendGlobalCommand = () => {
  if (globalInput.value != '') {
    inputManager.globalSend(globalInput.value)
    inputManager.globalSend('\r')
    globalInput.value = ''
  }
}
const checkActiveTab = (type) => {
  isShowCommandBar.value = type == 'term' ? true : false
}

const onVerticalSplitResize = (params) => {
  mainVerticalSize.value = params.prevPane.size
  if (verticalSplitPanes.value.length > 0) {
    const startIndex = 1
    const endIndex = params.panes.length - 1
    for (let i = startIndex; i <= endIndex; i++) {
      if (verticalSplitPanes.value[i - 1]) {
        verticalSplitPanes.value[i - 1].size = params.panes[i].size
      }
    }
  }
}

const handleMainPaneFocus = () => {
  focusedPane.value = { type: 'main' }
  focusedSplitPaneIndex.value = null
}

const handleSendOrToggleAiFromTerminal = () => {
  const currentActiveTabId = getCurrentActiveTabId()
  if (currentActiveTabId) {
    eventBus.emit('sendOrToggleAiFromTerminalForTab', currentActiveTabId)
  } else {
    toggleSideBar('right')
  }
}

const handleModeChange = (mode: 'terminal' | 'agents') => {
  // Save AI state before switching to agents mode
  if (mode === 'agents' && aiTabRef.value) {
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

const getCurrentActiveTabId = (): string | null => {
  if (!dockApi) {
    return null
  }
  const activePanel = dockApi.activePanel
  return activePanel.params.id
}

import 'dockview-vue/dist/styles/dockview.css'
import { DockviewVue, type DockviewReadyEvent } from 'dockview-vue'

import tabsPanel from './tabsPanel.vue'
const dockviewRef = ref<InstanceType<typeof DockviewVue> | null>(null)
const panelCount = ref(0)
const hasPanels = computed(() => panelCount.value > 0)
let dockApi: any = null

defineOptions({
  components: {
    tabsPanel
  }
})

const applyTheme = () => {
  const updateContainerTheme = (container: Element | null) => {
    if (!container) return

    container.classList.remove('dockview-theme-abyss')

    if (currentTheme.value === 'light') {
      container.classList.remove('dockview-theme-dark')
      container.classList.add('dockview-theme-light')
    } else {
      container.classList.remove('dockview-theme-light')
      container.classList.add('dockview-theme-dark')
    }
  }

  updateContainerTheme(document.querySelector('.dockview-theme-abyss'))
  updateContainerTheme(document.querySelector('.dockview-theme-light'))
  updateContainerTheme(document.querySelector('.dockview-theme-dark'))
}
watch(currentTheme, () => {
  if (dockApi) {
    nextTick(() => {
      applyTheme()
    })
  }
})
const onDockReady = (event: DockviewReadyEvent) => {
  dockApi = event.api

  dockApi.onDidAddPanel(() => {
    panelCount.value = dockApi.panels.length
  })

  dockApi.onDidRemovePanel(() => {
    panelCount.value = dockApi.panels.length
  })
  panelCount.value = dockApi.panels.length
  nextTick(() => {
    applyTheme()
    setupTabContextMenu()
  })
}
const addDockPanel = (params) => {
  if (!dockApi) return

  const id = 'panel_' + params.id
  let displayTitle
  if (params.ip) {
    displayTitle = params.title
  } else if (params.title === 'mcpConfigEditor') {
    displayTitle = t('mcp.configEditor')
  } else {
    displayTitle = t(`common.${params.title}`)
  }
  dockApi.addPanel({
    id,
    component: 'tabsPanel',
    title: displayTitle,
    params: {
      ...params,
      closeCurrentPanel: (panelId?: string) => closeCurrentPanel(panelId || id),
      createNewPanel: (isClone: boolean, direction: string, panelId?: string) => createNewPanel(isClone, direction as any, panelId || id)
    }
  })
}

const contextMenu = ref({
  visible: false,
  x: 0,
  y: 0,
  panelId: null as string | null,
  tabEl: null as HTMLElement | null
})
const contextMenuRef = ref<HTMLElement | null>(null)

const hideContextMenu = () => {
  contextMenu.value.visible = false
}
const setupTabContextMenu = () => {
  // 监听dockview 容器
  const container = dockviewRef.value?.$el
  if (!container) return
  container.addEventListener('contextmenu', (e: MouseEvent) => {
    const target = e.target as HTMLElement
    const tabElement = target.closest('.dv-tab') as HTMLElement | null
    if (tabElement) {
      e.preventDefault()

      const panelId = findPanelIdFromTab(tabElement)
      contextMenu.value = {
        visible: true,
        x: e.clientX,
        y: e.clientY,
        panelId,
        tabEl: tabElement
      }
    } else {
      hideContextMenu()
    }
  })

  const handleMouseDown = (e: MouseEvent) => {
    if (!contextMenu.value.visible) return

    const target = e.target as HTMLElement

    const inMenu = contextMenuRef.value?.contains(target)
    const inTab = !!target.closest('.dv-tab')

    if (inMenu || inTab) return

    hideContextMenu()
  }

  document.addEventListener('mousedown', handleMouseDown)

  onBeforeUnmount(() => {
    document.removeEventListener('mousedown', handleMouseDown)
  })
}

const findPanelIdFromTab = (tabElement: HTMLElement): string | null => {
  try {
    if (dockApi) {
      for (const panel of dockApi.panels) {
        const panelGroup = panel.api.group
        if (panelGroup?.element?.contains(tabElement)) {
          panelGroup.element.querySelectorAll('.dv-tab')
          const tabTitle = tabElement.textContent?.trim()
          const panelTitle = panel.api.title
          if (tabTitle === panelTitle) {
            return panel.id
          }
        }
      }
    }
    return null
  } catch (error) {
    return null
  }
}

const createNewPanel = (isClone: boolean, direction: 'left' | 'right' | 'above' | 'below' | 'within', panelId?: string) => {
  const targetPanelId = panelId || contextMenu.value.panelId
  if (!dockApi || !targetPanelId) {
    hideContextMenu()
    return
  }

  const sourcePanel = dockApi.getPanel(targetPanelId)
  if (!sourcePanel) {
    hideContextMenu()
    return
  }

  const sourceTitle = sourcePanel.api.title ?? sourcePanel.id
  const sourceComponent = sourcePanel.api.component
  const rawParams = (sourcePanel as any).api?.panel?._params ?? (sourcePanel as any).panel?._params

  const newIdV4 = uuidv4()
  let newId = 'panel_' + newIdV4
  if (isClone) {
    newId = 'panel_' + rawParams.id + '_clone_' + +Date.now()
  }

  const params = {
    ...safeCloneParams(rawParams),
    currentPanelId: newId,
    closeCurrentPanel: (pid?: string) => closeCurrentPanel(pid || newId),
    createNewPanel: (isClone: boolean, direction: string, pid?: string) => createNewPanel(isClone, direction as any, pid || newId)
  }

  params.id = newIdV4
  dockApi.addPanel({
    id: newId,
    component: sourceComponent,
    title: sourceTitle,
    params: params,
    position: {
      referencePanel: sourcePanel,
      direction: direction
    }
  })

  hideContextMenu()
}

const closeCurrentPanel = (panelId?: string) => {
  let targetPanelId = panelId
  if (targetPanelId || typeof panelId !== 'string') {
    targetPanelId = contextMenu.value.panelId
  }
  if (!dockApi || !targetPanelId) {
    closeContextMenu()
    return
  }

  const panel = dockApi.getPanel(targetPanelId)

  if (panel) {
    panel.api.close()
  }

  closeContextMenu()
}

const renaming = ref(false)
const renamingPanelId = ref<string | null>(null)
const renamingTitle = ref('')
const renameInputRef = ref<HTMLInputElement | null>(null)
const renameRect = ref({
  x: 0,
  y: 0,
  width: 0,
  height: 0
})
const renamePanelInline = () => {
  if (!dockApi || !contextMenu.value.panelId || !contextMenu.value.tabEl) {
    hideContextMenu()
    return
  }

  const panelId = contextMenu.value.panelId
  const tabEl = contextMenu.value.tabEl
  const panel = dockApi.getPanel(panelId)

  if (!panel) {
    hideContextMenu()
    return
  }

  const currentTitle = panel.api.title ?? panel.id

  const rect = tabEl.getBoundingClientRect()
  renameRect.value = {
    x: rect.left,
    y: rect.top,
    width: rect.width,
    height: rect.height
  }

  renaming.value = true
  renamingPanelId.value = panelId
  renamingTitle.value = currentTitle

  hideContextMenu()

  nextTick(() => {
    const input = renameInputRef.value
    if (input) {
      input.focus()
      input.select()
    }
  })
}

const finishRename = () => {
  if (!dockApi || !renamingPanelId.value) {
    cancelRename()
    return
  }

  const title = renamingTitle.value.trim()
  if (!title) {
    cancelRename()
    return
  }

  const panel = dockApi.getPanel(renamingPanelId.value)
  if (!panel) {
    cancelRename()
    return
  }

  panel.api.setTitle(title)

  const rawParams = panel.params

  if (rawParams && typeof rawParams === 'object') {
    ;(rawParams as any).title = title
    panel.api.updateParameters?.({ ...rawParams })
  }

  renaming.value = false
  renamingPanelId.value = null
  renamingTitle.value = ''
}

const cancelRename = () => {
  renaming.value = false
  renamingPanelId.value = null
  renamingTitle.value = ''
}

const closeOtherPanelsAllGroups = () => {
  if (!dockApi || !contextMenu.value.panelId) {
    hideContextMenu()
    return
  }

  const currentId = contextMenu.value.panelId
  const panels = [...dockApi.panels]

  for (const panel of panels) {
    if (panel.id !== currentId) {
      panel.api.close()
    }
  }

  hideContextMenu()
}

const closeContextMenu = () => {
  contextMenu.value.visible = false
}

const closeAllPanels = () => {
  if (!dockApi || !contextMenu.value.panelId) {
    hideContextMenu()
    return
  }
  const panels = [...dockApi.panels]

  for (const panel of panels) {
    panel.api.close()
  }

  hideContextMenu()
}

function safeCloneParams<T>(value: T): T {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint' ||
    typeof value === 'symbol'
  ) {
    return value
  }

  if (Array.isArray(value)) {
    return value.map((item) => safeCloneParams(item)) as unknown as T
  }

  if (typeof value !== 'object') {
    return value
  }

  const proto = Object.getPrototypeOf(value)
  if (proto !== Object.prototype && proto !== null) {
    return value
  }

  const result: any = {}
  for (const [key, val] of Object.entries(value as any)) {
    result[key] = safeCloneParams(val as any)
  }
  return result as T
}

defineExpose({
  resizeTerm: () => {
    allTabs.value?.resizeTerm()
  },
  getActiveTabAssetInfo,
  adjustSplitPaneToEqualWidth
})
</script>
<style lang="less">
.terminal-layout {
  height: 100vh;
  width: 100vw;
  display: flex;
  flex-direction: column;
  background: var(--bg-color);
  color: var(--text-color);
  margin: 0;

  &.transparent-bg {
    background: transparent !important;

    .dockview-theme-dark,
    .dockview-theme-light {
      --dv-group-view-background-color: transparent !important;
      --dv-tabs-and-actions-container-background-color: transparent !important;
      --dv-activegroup-visiblepanel-tab-background-color: rgba(60, 60, 60, 0.3) !important;
      --dv-activegroup-hiddenpanel-tab-background-color: transparent !important;
      --dv-inactivegroup-visiblepanel-tab-background-color: transparent !important;
      --dv-inactivegroup-hiddenpanel-tab-background-color: transparent !important;
      --dv-paneview-header-border-color: rgba(255, 255, 255, 0.1) !important;
    }
  }

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

      .termBoxs::-webkit-scrollbar {
        display: none;
      }

      .term_content_left {
        width: 250px;
      }
    }
  }
}

.rigth-sidebar {
  width: 100%;
  height: 100%;
  background: var(--bg-color) !important;
  transition: width 0.3s ease;
  position: relative;
  outline: none;
}

.rigth-sidebar:focus-within {
  box-shadow: inset 2px 0 0 var(--primary-color, #1890ff);
}

.rigth-sidebar.collapsed {
  width: 0px;
}

.bottom-sidebar {
  width: 100%;
  height: 100%;
  background: var(--bg-color) !important;
  transition: height 0.3s ease;
  position: relative;
  outline: none;
}

.bottom-sidebar:focus-within {
  box-shadow: inset 0 2px 0 var(--primary-color, #1890ff);
}

.main-terminal-area {
  width: 100%;
  height: 100%;
}

.ant-input-group-wrapper {
  background-color: #202020 !important;

  .ant-input {
    background-color: #202020 !important;
    border: none;
    color: #fff !important;
  }

  .ant-input-group-addon {
    background-color: #202020 !important;
    border: none;
    color: #fff !important;

    button {
      background-color: #202020 !important;
      border: none;
      color: #fff !important;
    }
  }
}
.toolbar {
  position: absolute;
  left: 0;
  bottom: 2px;
  color: var(--text-color);
  width: 100%;
  z-index: 10;
}
.globalInput {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  .ant-input {
    background-color: transparent;
    color: var(--text-color);
    &::placeholder {
      color: var(--text-color-tertiary);
    }
  }

  .ant-input-affix-wrapper {
    border-color: var(--border-color);
    &:hover,
    &:focus,
    &:active {
      border-color: var(--border-color) !important;
      box-shadow: none !important;
    }
  }
}

.command-input {
  background: var(--globalInput-bg-color);
  height: 30px;
}

.menu-action-btn {
  background: var(--globalInput-bg-color);
  border: none;
  color: var(--text-color);
  height: 32px !important;
  margin-left: 8px;
  &:hover,
  &:focus,
  &:active {
    background: var(--globalInput-bg-color);
    color: var(--text-color) !important;
    box-shadow: none !important;
  }
}
</style>
<style lang="less">
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

.splitpanes--horizontal > .splitpanes__splitter:before {
  left: -8px;
  right: -8px;
  height: 100%;
}

// Ensure left sidebar container and all its panes have no transitions
.left-sidebar-container .splitpanes__pane {
  transition: none !important;
  animation: none !important;
}

.context-menu {
  position: fixed;
  background-color: var(--bg-color);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  padding: 2px 0;
  z-index: 1000;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  min-width: 120px;
  font-size: 12px;
}

.context-menu-item {
  padding: 6px 12px;
  cursor: pointer;
  color: var(--text-color);
  transition: background-color 0.2s ease;
  user-select: none;
}

.context-menu-item:hover {
  background-color: var(--hover-bg-color);
}

.tab-title-input {
  flex: 1;
  font-size: 13px;
  border: 1px solid #007acc;
  border-radius: 2px;
  background-color: var(--bg-color);
  color: var(--text-color);
  outline: none;
}

.tab-title-input:focus {
  border-color: #007acc;
  box-shadow: 0 0 0 1px #007acc;
}
.dockview-theme-light {
  --dv-paneview-active-outline-color: dodgerblue;
  --dv-tabs-and-actions-container-font-size: 13px;
  --dv-tabs-and-actions-container-height: 35px;
  --dv-drag-over-background-color: rgba(83, 89, 93, 0.5);
  --dv-drag-over-border-color: transparent;
  --dv-tabs-container-scrollbar-color: #888;
  --dv-icon-hover-background-color: rgba(90, 93, 94, 0.31);
  --dv-floating-box-shadow: 8px 8px 8px 0px rgba(83, 89, 93, 0.5);
  --dv-overlay-z-index: 999;
  --dv-tab-font-size: inherit;
  --dv-border-radius: 0px;
  --dv-tab-margin: 0;
  --dv-sash-color: var(--bg-color-secondary);
  --dv-active-sash-color: transparent;
  --dv-active-sash-transition-duration: 0.1s;
  --dv-active-sash-transition-delay: 0.5s;
  --dv-group-view-background-color: white;
  --dv-tabs-and-actions-container-background-color: var(--bg-color);
  --dv-activegroup-visiblepanel-tab-background-color: var(--bg-color-tertiary);
  --dv-activegroup-hiddenpanel-tab-background-color: var(--bg-color);
  --dv-inactivegroup-visiblepanel-tab-background-color: white;
  --dv-inactivegroup-hiddenpanel-tab-background-color: var(--bg-color);
  --dv-tab-divider-color: white;
  --dv-activegroup-visiblepanel-tab-color: rgb(51, 51, 51);
  --dv-activegroup-hiddenpanel-tab-color: rgba(51, 51, 51, 0.7);
  --dv-inactivegroup-visiblepanel-tab-color: rgba(51, 51, 51, 0.7);
  --dv-inactivegroup-hiddenpanel-tab-color: rgba(51, 51, 51, 0.35);
  --dv-separator-border: rgba(128, 128, 128, 0.35);
  --dv-paneview-header-border-color: rgb(51, 51, 51);
  --dv-scrollbar-background-color: rgba(0, 0, 0, 0.25);
}
.dockview-theme-light .dv-drop-target-container .dv-drop-target-anchor.dv-drop-target-anchor-container-changed {
  opacity: 0;
  transition: none;
}

.dockview-theme-dark {
  --dv-paneview-active-outline-color: dodgerblue;
  --dv-tabs-and-actions-container-font-size: 13px;
  --dv-tabs-and-actions-container-height: 35px;
  --dv-drag-over-background-color: rgba(83, 89, 93, 0.5);
  --dv-drag-over-border-color: transparent;
  --dv-tabs-container-scrollbar-color: #888;
  --dv-icon-hover-background-color: rgba(90, 93, 94, 0.31);
  --dv-floating-box-shadow: 8px 8px 8px 0px rgba(83, 89, 93, 0.5);
  --dv-overlay-z-index: 999;
  --dv-tab-font-size: inherit;
  --dv-border-radius: 0px;
  --dv-tab-margin: 0;
  --dv-sash-color: var(--bg-color-secondary);
  --dv-active-sash-color: transparent;
  --dv-active-sash-transition-duration: 0.1s;
  --dv-active-sash-transition-delay: 0.5s;
  --dv-group-view-background-color: #1e1e1e;
  --dv-tabs-and-actions-container-background-color: var(--bg-color);
  --dv-activegroup-visiblepanel-tab-background-color: var(--bg-color-tertiary);
  --dv-activegroup-hiddenpanel-tab-background-color: var(--bg-color);
  --dv-inactivegroup-visiblepanel-tab-background-color: #1e1e1e;
  --dv-inactivegroup-hiddenpanel-tab-background-color: var(--bg-color);
  --dv-tab-divider-color: #1e1e1e;
  --dv-activegroup-visiblepanel-tab-color: white;
  --dv-activegroup-hiddenpanel-tab-color: #969696;
  --dv-inactivegroup-visiblepanel-tab-color: #8f8f8f;
  --dv-inactivegroup-hiddenpanel-tab-color: #626262;
  --dv-separator-border: rgb(68, 68, 68);
  --dv-paneview-header-border-color: rgba(204, 204, 204, 0.2);
}
.dockview-theme-dark .dv-drop-target-container .dv-drop-target-anchor.dv-drop-target-anchor-container-changed {
  opacity: 0;
  transition: none;
}
</style>
