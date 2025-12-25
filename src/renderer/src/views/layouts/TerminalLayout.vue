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
        @click="() => closeCurrentPanel()"
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
      :class="{ 'transparent-bg': isTransparent, 'agents-mode': props.currentMode === 'agents' }"
    >
      <div class="term_header">
        <Header
          ref="headerRef"
          @toggle-sidebar="toggleSideBar"
          @mode-change="handleModeChange"
        ></Header>
      </div>
      <div class="term_body">
        <!-- Agents Mode Layout -->
        <div
          class="agents-mode-layout"
          :style="getLayoutStyle('agents')"
        >
          <div class="term_content">
            <splitpanes
              class="left-sidebar-container"
              @resize="(params: ResizeParams) => handleLeftPaneResize(params)"
            >
              <pane
                class="agents_content_left"
                :class="{ collapsed: agentsLeftPaneSize <= 0 }"
                :size="agentsLeftPaneSize"
                :min-size="leftMinSize"
              >
                <AgentsSidebar
                  @conversation-select="handleConversationSelect"
                  @new-chat="handleNewChat"
                  @conversation-delete="handleConversationDelete"
                />
              </pane>
              <pane
                :size="100 - agentsLeftPaneSize"
                :min-size="aiMinSize"
              >
                <div class="agents-chat-container">
                  <AiTab
                    ref="aiTabRef"
                    :toggle-sidebar="() => {}"
                    :saved-state="savedAiSidebarState || undefined"
                    :is-agent-mode="true"
                    @state-changed="handleAiTabStateChanged"
                  />
                </div>
              </pane>
            </splitpanes>
          </div>
        </div>
        <!-- Terminal Mode Layout -->
        <div
          class="terminal-mode-layout"
          :style="getLayoutStyle('terminal')"
        >
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
                :class="{ collapsed: leftPaneSize <= 0 }"
                :size="leftPaneSize"
                :min-size="leftMinSize"
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
                  :toggle-sidebar="toggleSideBar"
                  @open-user-tab="openUserTab"
                />
                <Snippets v-if="currentMenu == 'snippets'" />
              </pane>
              <pane :size="100 - leftPaneSize">
                <splitpanes
                  class="main-split-container"
                  @resize="onMainSplitResize"
                >
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
                    :min-size="aiMinSize"
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
              <div
                v-if="isGlobalInput"
                class="globalInput"
              >
                <div class="broadcast-indicator">
                  <span class="broadcast-icon">&#128226;</span>
                  <span class="broadcast-text">{{ t('common.broadcastTo', { count: terminalCount }) }}</span>
                </div>
                <a-input
                  v-model:value="globalInput"
                  size="small"
                  class="command-input"
                  :placeholder="t('common.executeCommandToAllWindows')"
                  allow-clear
                  @press-enter="sendGlobalCommand"
                >
                </a-input>
                <button
                  class="close-btn"
                  :title="t('common.close')"
                  @click="closeGlobalInput"
                >
                  &times;
                </button>
              </div>
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
import { computed, nextTick, onBeforeUnmount, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { Pane, Splitpanes } from 'splitpanes'
import 'splitpanes/dist/splitpanes.css'
import AiTab from '@views/components/AiTab/index.vue'
import Header from '@views/components/Header/index.vue'
import LeftTab from '@views/components/LeftTab/index.vue'
import Workspace from '@views/components/Workspace/index.vue'
import Extensions from '@views/components/Extensions/index.vue'
import Snippets from '@views/components/LeftTab/config/snippets.vue'
import AgentsSidebar from '@views/components/AgentsSidebar/index.vue'
import TabsPanel from './tabsPanel.vue'
import tabsPanel from './tabsPanel.vue'
import { v4 as uuidv4 } from 'uuid'
import { userInfoStore } from '@/store'
import { aliasConfigStore } from '@/store/aliasConfigStore'
import eventBus from '@/utils/eventBus'
import { getActualTheme, initializeThemeFromDatabase } from '@/utils/themeUtils'
import { componentInstances, inputManager, isGlobalInput, isShowCommandBar } from '@renderer/views/components/Ssh/utils/termInputManager'
import { shortcutService } from '@/services/shortcutService'
import { captureExtensionUsage, ExtensionNames, ExtensionStatus } from '@/utils/telemetry'
import Dashboard from '@renderer/views/components/Ssh/components/dashboard.vue'
import { getGlobalState } from '@/agent/storage/state'
import 'dockview-vue/dist/styles/dockview.css'
import { type DockviewReadyEvent, DockviewVue } from 'dockview-vue'

const props = defineProps<{
  currentMode: 'terminal' | 'agents'
}>()

const { t } = useI18n()

// Computed styles for layout visibility
const getLayoutStyle = (
  mode: 'terminal' | 'agents'
): {
  visibility: 'visible' | 'hidden'
  opacity: number
  pointerEvents: 'auto' | 'none'
} => {
  const isVisible = props.currentMode === mode
  return {
    visibility: isVisible ? 'visible' : 'hidden',
    opacity: isVisible ? 1 : 0,
    pointerEvents: isVisible ? 'auto' : 'none'
  }
}
const aliasConfig = aliasConfigStore()
const configStore = piniaUserConfigStore()
const isTransparent = computed(() => !!configStore.getUserConfig.background.image)
const headerRef = ref<InstanceType<typeof Header> | null>(null)
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
const agentsLeftPaneSize = ref(27)
const mainTerminalSize = ref(100)
const showWatermark = ref(true)
const currentTheme = ref('dark')
const aiSidebarSize = ref(0)
const aiMinSize = ref(0) // AI sidebar minimum size percentage
const isDraggingSplitter = ref(false) // Whether the splitter is being dragged
// Left sidebar state variables
const leftMinSize = ref(0) // Left sidebar minimum size percentage
const isDraggingLeftSplitter = ref(false) // Whether the left splitter is being dragged
const savedLeftSidebarState = ref<LeftSidebarState | null>(null) // Saved left sidebar state
const isQuickClosing = ref(false) // Flag to prevent resize events during quick close
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
const verticalSplitPanes = ref<{ size: number; tabs: TabItem[]; activeTabId: string }[]>([])
const mainVerticalSize = ref(100)
const globalInput = ref('')
const focusedSplitPaneIndex = ref<number | null>(null)
const focusedPane = ref<{
  type: 'main' | 'horizontal' | 'vertical' | 'rightVertical'
  index?: number
  rightPaneIndex?: number
}>({ type: 'main' })
const lastFocusedElement = ref<HTMLElement | null>(null)

interface AiSidebarState {
  size: number
  currentChatId: string | null
  chatTabs: Array<{
    id: string
    title: string
    hosts: any[]
    chatType: string
    modelValue: string
    autoUpdateHost: boolean
    inputValue: string
    session: {
      chatHistory: any[]
      lastChatMessageId: string
      responseLoading: boolean
      showSendButton: boolean
      buttonsDisabled: boolean
      resumeDisabled: boolean
      isExecutingCommand: boolean
      showRetryButton: boolean
      showNewTaskButton: boolean
      messageFeedbacks: Record<string, 'like' | 'dislike'>
    }
  }>
}

interface LeftSidebarState {
  size: number
  currentMenu: string
  isExpanded: boolean
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

// Left sidebar unified management functions
const getLeftSidebarSize = () => {
  return props.currentMode === 'agents' ? agentsLeftPaneSize.value : leftPaneSize.value
}

const setLeftSidebarSize = (size: number) => {
  if (props.currentMode === 'agents') {
    agentsLeftPaneSize.value = size
  } else {
    leftPaneSize.value = size
  }
}

// Detect if splitter was clicked
const handleMouseDown = (e: MouseEvent) => {
  const target = e.target as HTMLElement
  if (target.classList.contains('splitpanes__splitter') && target.closest('.main-split-container')) {
    isDraggingSplitter.value = true
  }
  // Detect left sidebar splitter
  if (target.classList.contains('splitpanes__splitter') && target.closest('.left-sidebar-container')) {
    isDraggingLeftSplitter.value = true
  }
}

// Global mouse move listener
const handleGlobalMouseMove = (e: MouseEvent) => {
  // Skip if already quick closing
  if (isQuickClosing.value) {
    return
  }

  // AI sidebar quick close logic
  if (isDraggingSplitter.value && showAiSidebar.value) {
    // In Agents mode, do not execute quick close logic
    if (props.currentMode === 'agents') {
      return
    }

    const distFromRight = window.innerWidth - e.clientX
    // Close threshold: 50px (only in Terminal mode)
    if (distFromRight < 50) {
      isQuickClosing.value = true

      // Force end the drag by triggering mouseup on document
      const mouseUpEvent = new MouseEvent('mouseup', {
        bubbles: true,
        cancelable: true,
        view: window
      })
      document.dispatchEvent(mouseUpEvent)

      // Execute close after a short delay to let splitpanes finish its mouseup handling
      setTimeout(() => {
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
        isDraggingSplitter.value = false

        // Reset flag
        setTimeout(() => {
          isQuickClosing.value = false
        }, 100)
      }, 10)
    }
  }

  // Left sidebar sticky resistance and quick close logic
  if (isDraggingLeftSplitter.value && getLeftSidebarSize() > 0) {
    const distFromLeft = e.clientX
    const container = document.querySelector('.left-sidebar-container') as HTMLElement
    if (!container) return

    // Sticky resistance controlled by CSS min-width
    // Quick close: < 50px
    if (distFromLeft < LEFT_QUICK_CLOSE_THRESHOLD_PX) {
      isQuickClosing.value = true

      // Force end the drag by triggering mouseup on document
      const mouseUpEvent = new MouseEvent('mouseup', {
        bubbles: true,
        cancelable: true,
        view: window
      })
      document.dispatchEvent(mouseUpEvent)

      // Execute close after a short delay to let splitpanes finish its mouseup handling
      setTimeout(() => {
        saveLeftSidebarState()
        setLeftSidebarSize(0)
        const iconKey = props.currentMode === 'agents' ? 'agentsLeft' : 'left'
        headerRef.value?.switchIcon(iconKey, false)
        isDraggingLeftSplitter.value = false

        // Reset flag
        setTimeout(() => {
          isQuickClosing.value = false
        }, 100)
      }, 10)
    }
  }
}

// Release mouse
const handleGlobalMouseUp = () => {
  isDraggingSplitter.value = false
  isDraggingLeftSplitter.value = false
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

  // Get all panels
  const panels = dockApi.panels

  if (panels.length <= 1) {
    return
  }

  // Get the currently active panel
  const activePanel = dockApi.activePanel

  if (!activePanel) {
    if (panels.length > 0) {
      panels[0].api.setActive()
    }
    return
  }

  // Find the index of the currently active panel
  const currentIndex = panels.findIndex((panel) => panel.id === activePanel.id)

  if (currentIndex === -1) {
    return
  }

  // Calculate the next index (circular)
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
    if (dockApi) {
      applyTheme()
    }
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
    currentTheme.value = getActualTheme(config.theme || 'auto')

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
    currentTheme.value = getActualTheme('auto')
    nextTick(() => {
      showWatermark.value = true
    })
  }
  nextTick(() => {
    updateLeftSidebarMinSize()
    if (props.currentMode === 'terminal') {
      updatePaneSize()
      if (headerRef.value) {
        headerRef.value.switchIcon('right', showAiSidebar.value)
        headerRef.value.switchIcon('left', leftPaneSize.value > 0)
        headerRef.value.setMode(props.currentMode)
      }
    } else {
      if (headerRef.value) {
        headerRef.value.switchIcon('agentsLeft', agentsLeftPaneSize.value > 0)
        headerRef.value.setMode(props.currentMode)
      }
      // In Agents mode, also need to initialize AI sidebar min-size
      updateAiSidebarMinSize()
    }
  })

  // Restore AI state (unified function since both modes use the same aiTabRef)
  const restoreAiTabState = async () => {
    try {
      const savedStateStr = localStorage.getItem('sharedAiTabState')
      if (savedStateStr && aiTabRef.value && aiTabRef.value.restoreState) {
        const savedState = JSON.parse(savedStateStr)
        // Update savedAiSidebarState to match
        savedAiSidebarState.value = savedState
        // Restore state to the unified AiTab instance
        await nextTick()
        await aiTabRef.value.restoreState(savedState)
        // Clear the shared state after restoring to avoid restoring again
        localStorage.removeItem('sharedAiTabState')
        return true
      }
    } catch (error) {
      console.warn('Failed to restore AI Tab state:', error)
      // Clear invalid state
      localStorage.removeItem('sharedAiTabState')
    }
    return false
  }

  // Watch currentMode changes and sync to Header, also restore AI state when switching modes
  watch(
    () => props.currentMode,
    async (newMode, oldMode) => {
      if (headerRef.value) {
        headerRef.value.setMode(newMode)
      }

      // When switching from agents to terminal, reset layout state
      if (newMode === 'terminal' && oldMode === 'agents') {
        await nextTick()
        // Wait for element to become visible before recalculating
        setTimeout(async () => {
          // Reset layout state to ensure proper display
          const container = document.querySelector('.terminal-mode-layout .splitpanes') as HTMLElement
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
            // Force resize of terminal components
            if (allTabs.value) {
              allTabs.value.resizeTerm()
            }
          }
        }, 50)
      } else if (newMode === 'agents' && oldMode === 'terminal') {
        await nextTick()
        // Initialize agents left pane state
        if (headerRef.value) {
          headerRef.value.switchIcon('agentsLeft', agentsLeftPaneSize.value > 0)
        }
        // When switching to Agents mode, recalculate AI sidebar min-size
        updateAiSidebarMinSize()
        // Update left sidebar min-size
        updateLeftSidebarMinSize()
      }

      // Restore AI state after mode switch (unified for both directions since same aiTabRef)
      // Wait a bit for aiTabRef to be ready after DOM update
      setTimeout(async () => {
        await restoreAiTabState()
        if (newMode === 'agents') {
          await nextTick()
          const textarea = document.querySelector('[data-testid="ai-message-input"]') as HTMLTextAreaElement
          if (textarea) {
            textarea.scrollTop = textarea.scrollHeight
            textarea.focus({ preventScroll: true })
          }
        }
      }, 200)
    },
    { immediate: false }
  )
  window.addEventListener('resize', updatePaneSize)
  window.addEventListener('resize', updateAiSidebarMinSize)
  window.addEventListener('resize', updateLeftSidebarMinSize)

  // Register global mouse event listeners for sticky resizing
  document.addEventListener('mousedown', handleMouseDown)
  document.addEventListener('mouseup', handleGlobalMouseUp)
  document.addEventListener('mousemove', handleGlobalMouseMove)

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
  eventBus.on('searchHost', handleSearchHost)
  eventBus.on('save-state-before-switch', () => {
    // Save AI state before layout switch (unified since same aiTabRef)
    if (aiTabRef.value) {
      try {
        const currentState = aiTabRef.value.getCurrentState?.()
        if (currentState) {
          localStorage.setItem('sharedAiTabState', JSON.stringify(currentState))
          // Also update savedAiSidebarState for immediate use
          savedAiSidebarState.value = currentState
        }
      } catch (error) {
        console.warn('Failed to save AI state before layout switch:', error)
      }
    }
  })

  // Try to restore state on initial mount (unified for both modes)
  nextTick(async () => {
    if (!(await restoreAiTabState())) {
      // If not restored yet, wait a bit more and try again
      setTimeout(async () => {
        await restoreAiTabState()
        if (props.currentMode === 'agents') {
          await nextTick()
          const textarea = document.querySelector('[data-testid="ai-message-input"]') as HTMLTextAreaElement
          if (textarea) {
            textarea.scrollTop = textarea.scrollHeight
            textarea.focus({ preventScroll: true })
          }
        }
      }, 200)
    } else {
      if (props.currentMode === 'agents') {
        setTimeout(async () => {
          await nextTick()
          const textarea = document.querySelector('[data-testid="ai-message-input"]') as HTMLTextAreaElement
          if (textarea) {
            textarea.scrollTop = textarea.scrollHeight
            textarea.focus({ preventScroll: true })
          }
        }, 200)
      }
    }
  })

  nextTick(async () => {
    await initializeThemeFromDatabase()
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
const terminalCount = computed(() => componentInstances.value.length)
const closeGlobalInput = () => {
  isGlobalInput.value = false
}
const DEFAULT_WIDTH_PX = 250
const DEFAULT_WIDTH_RIGHT_PX = 350
const MIN_AI_SIDEBAR_WIDTH_PX = 350 // AI sidebar minimum usable width
const SNAP_THRESHOLD_PX = 200 // Sticky resistance threshold
// Left sidebar constants
const MIN_LEFT_SIDEBAR_WIDTH_PX = 200 // Left sidebar minimum usable width
const LEFT_QUICK_CLOSE_THRESHOLD_PX = 50 // Left sidebar quick close threshold
const currentMenu = ref('workspace')
const updatePaneSize = () => {
  const container = document.querySelector('.splitpanes') as HTMLElement
  if (container) {
    // Only update left pane size if it's expanded and we're in terminal mode
    if (leftPaneSize.value > 0 && props.currentMode === 'terminal') {
      const containerWidth = container.offsetWidth
      const currentWidthPx = (leftPaneSize.value / 100) * containerWidth
      // Only adjust if current width is significantly different from default
      if (Math.abs(currentWidthPx - DEFAULT_WIDTH_PX) > 50) {
        leftPaneSize.value = (DEFAULT_WIDTH_PX / containerWidth) * 100
      }
    }
    // Update AI sidebar min-size
    updateAiSidebarMinSize()
    // Update left sidebar min-size
    updateLeftSidebarMinSize()
  }
}

// Calculate AI sidebar min-size percentage
const updateAiSidebarMinSize = () => {
  // In Agents mode, AI sidebar uses different container and stricter minimum width
  if (props.currentMode === 'agents') {
    const container = document.querySelector('.left-sidebar-container') as HTMLElement
    if (container) {
      const containerWidth = container.offsetWidth
      // In Agents mode, AI sidebar occupies right panel with stricter minimum width limit
      aiMinSize.value = (SNAP_THRESHOLD_PX / containerWidth) * 100
    }
    return
  }

  // Terminal mode logic remains unchanged
  const mainContainer = document.querySelector('.main-split-container') as HTMLElement
  if (mainContainer) {
    const mainWidth = mainContainer.offsetWidth
    // Convert sticky resistance threshold to percentage relative to main container
    aiMinSize.value = (SNAP_THRESHOLD_PX / mainWidth) * 100
  } else {
    // Fallback to using entire splitpanes container
    const container = document.querySelector('.splitpanes') as HTMLElement
    if (container) {
      const containerWidth = container.offsetWidth
      // Consider left sidebar width
      const availableWidth = (containerWidth * (100 - leftPaneSize.value)) / 100
      aiMinSize.value = (SNAP_THRESHOLD_PX / availableWidth) * 100
    }
  }
}

// Calculate left sidebar min-size percentage
const updateLeftSidebarMinSize = () => {
  // Left sidebar does not use minSize limit, sticky resistance controlled by logic
  leftMinSize.value = 0
}

// Save left sidebar state
const saveLeftSidebarState = () => {
  savedLeftSidebarState.value = {
    size: getLeftSidebarSize(),
    currentMenu: currentMenu.value,
    isExpanded: getLeftSidebarSize() > 0
  }
}

// Restore left sidebar state
const restoreLeftSidebarState = () => {
  if (savedLeftSidebarState.value) {
    const container = document.querySelector('.left-sidebar-container') as HTMLElement
    if (container && container.offsetWidth > 0) {
      const containerWidth = container.offsetWidth
      const minSizePercent = (MIN_LEFT_SIDEBAR_WIDTH_PX / containerWidth) * 100

      // Ensure restored width is not less than minimum usable width
      let restoredSize = savedLeftSidebarState.value.size
      if ((restoredSize / 100) * containerWidth < MIN_LEFT_SIDEBAR_WIDTH_PX) {
        restoredSize = minSizePercent
      }

      setLeftSidebarSize(restoredSize)
      currentMenu.value = savedLeftSidebarState.value.currentMenu
      const iconKey = props.currentMode === 'agents' ? 'agentsLeft' : 'left'
      headerRef.value?.switchIcon(iconKey, true)
    }
  }
}

// Handle left pane resize
const handleLeftPaneResize = (params: ResizeParams) => {
  // Skip resize handling during quick close
  if (isQuickClosing.value) {
    return
  }

  const container = document.querySelector('.left-sidebar-container') as HTMLElement
  const containerWidth = container ? container.offsetWidth : 1000
  const sizePx = (params.prevPane.size / 100) * containerWidth

  // Normal size update
  if (props.currentMode === 'agents') {
    agentsLeftPaneSize.value = params.prevPane.size
    updateAiSidebarMinSize()
    updateLeftSidebarMinSize()

    // Sync icon state (use threshold to avoid conflict)
    if (sizePx >= LEFT_QUICK_CLOSE_THRESHOLD_PX) {
      headerRef.value?.switchIcon('agentsLeft', true)
    } else {
      headerRef.value?.switchIcon('agentsLeft', false)
    }
  } else {
    leftPaneSize.value = params.prevPane.size
    updateAiSidebarMinSize()
    updateLeftSidebarMinSize()

    // Sync icon state (use threshold to avoid conflict)
    if (sizePx >= LEFT_QUICK_CLOSE_THRESHOLD_PX) {
      headerRef.value?.switchIcon('left', true)
    } else {
      headerRef.value?.switchIcon('left', false)
    }
  }
}

// AI sidebar debounced auto-close
let aiResizeTimeout: number | null = null
const debouncedAiResizeCheck = () => {
  if (aiResizeTimeout) {
    clearTimeout(aiResizeTimeout)
  }

  aiResizeTimeout = window.setTimeout(() => {
    // In Agents mode, do not execute auto-close logic
    if (props.currentMode === 'agents') {
      aiResizeTimeout = null
      return
    }

    // Skip if we're in the middle of dragging (quick close will be handled by mouseup)
    if (isDraggingSplitter.value) {
      aiResizeTimeout = null
      return
    }

    const container = (document.querySelector('.main-split-container') as HTMLElement) || (document.querySelector('.splitpanes') as HTMLElement)
    if (container) {
      const containerWidth = container.offsetWidth
      const currentAiSidebarSize = aiSidebarSize.value
      const aiSidebarWidthPx = (currentAiSidebarSize / 100) * containerWidth

      // Auto-close if width < 50px (only in Terminal mode, and not during drag)
      if (aiSidebarWidthPx < 50 && currentAiSidebarSize > 0) {
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
    }
    aiResizeTimeout = null
  }, 50) // 50ms debounce
}

const toggleSideBar = (value: string) => {
  const container = (document.querySelector('.main-split-container') as HTMLElement) || (document.querySelector('.splitpanes') as HTMLElement)
  const containerWidth = container ? container.offsetWidth : 1000

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
        // Calculate minimum percentage
        const minSizePercent = (MIN_AI_SIDEBAR_WIDTH_PX / containerWidth) * 100
        // Try to restore saved width, otherwise use default width
        let restoredSize = savedAiSidebarState.value?.size || (DEFAULT_WIDTH_RIGHT_PX / containerWidth) * 100
        // Ensure restored width is not less than minimum usable width
        if ((restoredSize / 100) * containerWidth < MIN_AI_SIDEBAR_WIDTH_PX) {
          restoredSize = minSizePercent
        }
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
    case 'agentsLeft':
      {
        const currentSize = getLeftSidebarSize()
        if (currentSize > 0) {
          // Close sidebar
          saveLeftSidebarState()
          setLeftSidebarSize(0)
          const iconKey = props.currentMode === 'agents' ? 'agentsLeft' : 'left'
          headerRef.value?.switchIcon(iconKey, false)
        } else {
          // Open sidebar
          const leftContainer = document.querySelector('.left-sidebar-container') as HTMLElement
          const leftContainerWidth = leftContainer ? leftContainer.offsetWidth : containerWidth
          const minSizePercent = (MIN_LEFT_SIDEBAR_WIDTH_PX / leftContainerWidth) * 100

          // Try to restore saved state, otherwise use default width
          if (savedLeftSidebarState.value) {
            restoreLeftSidebarState()
          } else {
            let defaultSize = props.currentMode === 'agents' ? 27 : (DEFAULT_WIDTH_PX / leftContainerWidth) * 100

            // Ensure default width is not less than minimum usable width
            if ((defaultSize / 100) * leftContainerWidth < MIN_LEFT_SIDEBAR_WIDTH_PX) {
              defaultSize = minSizePercent
            }

            setLeftSidebarSize(defaultSize)
            const iconKey = props.currentMode === 'agents' ? 'agentsLeft' : 'left'
            headerRef.value?.switchIcon(iconKey, true)
          }
        }
      }
      break
  }
}

// Handle host search shortcut
const handleSearchHost = () => {
  const needsMenuSwitch = currentMenu.value !== 'workspace'
  const needsSidebarOpen = getLeftSidebarSize() === 0

  // Ensure left sidebar is open
  if (needsSidebarOpen) {
    // Use the unified toggle function to open the sidebar
    toggleSideBar('left')
  }

  // Switch to workspace menu if not already
  if (needsMenuSwitch) {
    currentMenu.value = 'workspace'
  }

  // Calculate delay based on what needs to happen
  // If menu switch or sidebar open is needed, wait longer for DOM to be ready
  const delay = needsMenuSwitch || needsSidebarOpen ? 200 : 50

  // Focus search input after appropriate delay to ensure DOM is ready
  nextTick(() => {
    setTimeout(() => {
      eventBus.emit('focusHostSearch')
    }, delay)
  })
}

const toggleMenu = function (params) {
  const type = params?.type
  const container = document.querySelector('.splitpanes') as HTMLElement
  const containerWidth = container.offsetWidth
  const expandFn = (dir) => {
    if (dir == 'left') {
      // Use unified function to set left sidebar size
      const leftContainer = document.querySelector('.left-sidebar-container') as HTMLElement
      const leftContainerWidth = leftContainer ? leftContainer.offsetWidth : containerWidth
      const minSizePercent = (MIN_LEFT_SIDEBAR_WIDTH_PX / leftContainerWidth) * 100
      let defaultSize = (DEFAULT_WIDTH_PX / leftContainerWidth) * 100

      if ((defaultSize / 100) * leftContainerWidth < MIN_LEFT_SIDEBAR_WIDTH_PX) {
        defaultSize = minSizePercent
      }

      setLeftSidebarSize(defaultSize)
      const iconKey = props.currentMode === 'agents' ? 'agentsLeft' : 'left'
      headerRef.value?.switchIcon(iconKey, true)
    } else {
      showAiSidebar.value = true
      // Calculate minimum percentage
      const minSizePercent = (MIN_AI_SIDEBAR_WIDTH_PX / containerWidth) * 100
      // Try to restore saved width, otherwise use default width
      let restoredSize = savedAiSidebarState.value?.size || (DEFAULT_WIDTH_RIGHT_PX / containerWidth) * 100
      // Ensure restored width is not less than minimum usable width
      if ((restoredSize / 100) * containerWidth < MIN_AI_SIDEBAR_WIDTH_PX) {
        restoredSize = minSizePercent
      }
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
      setLeftSidebarSize(0)
      const iconKey = props.currentMode === 'agents' ? 'agentsLeft' : 'left'
      headerRef.value?.switchIcon(iconKey, false)
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
      const container = (document.querySelector('.main-split-container') as HTMLElement) || (document.querySelector('.splitpanes') as HTMLElement)
      if (container) {
        const containerWidth = container.offsetWidth
        showAiSidebar.value = true
        // Calculate minimum percentage
        const minSizePercent = (MIN_AI_SIDEBAR_WIDTH_PX / containerWidth) * 100
        // Try to restore saved width, otherwise use default width
        let restoredSize = savedAiSidebarState.value?.size || (DEFAULT_WIDTH_RIGHT_PX / containerWidth) * 100
        // Ensure restored width is not less than minimum usable width
        if ((restoredSize / 100) * containerWidth < MIN_AI_SIDEBAR_WIDTH_PX) {
          restoredSize = minSizePercent
        }
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
  if (item.children) return

  const id_ = uuidv4()
  const newTab = {
    id: id_,
    title: item.title,
    content: item.key,
    type: item.type ? item.type : 'term',
    organizationId: item.organizationId ? item.organizationId : '',
    ip: item.ip ? item.ip : '',
    data: item,
    props: item?.props
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
  if (panelType === 'term' || panelType === 'ssh') {
    nextTick(() => {
      handleActivePanelChange()
    })
  }
  checkActiveTab(panelType)
}

onUnmounted(() => {
  eventBus.off('save-state-before-switch')
  shortcutService.destroy()
  window.removeEventListener('resize', updatePaneSize)
  window.removeEventListener('resize', updateAiSidebarMinSize)
  window.removeEventListener('resize', updateLeftSidebarMinSize)

  // Unregister global mouse event listeners
  document.removeEventListener('mousedown', handleMouseDown)
  document.removeEventListener('mouseup', handleGlobalMouseUp)
  document.removeEventListener('mousemove', handleGlobalMouseMove)

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
  eventBus.off('searchHost', handleSearchHost)
})

type OpenUserTabArg =
  | string
  | {
      key: string
      fromLocal?: boolean
      pluginId?: string
    }
const openUserTab = async function (arg: OpenUserTabArg) {
  const value = typeof arg === 'string' ? arg : arg.key

  if (
    value === 'assetConfig' ||
    value === 'keyChainConfig' ||
    value === 'userInfo' ||
    value === 'userConfig' ||
    value === 'mcpConfigEditor' ||
    value === 'securityConfigEditor' ||
    value.startsWith('plugins:')
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
    type: value,
    props: {}
  }
  switch (value) {
    case 'aliasConfig':
      p.title = 'alias'
      p.type = 'extensions'
      break
    case 'securityConfigEditor': {
      // Get config file path and extract file name
      try {
        const { securityConfigService } = await import('@/services/securityConfigService')
        const configPath = await securityConfigService.getConfigPath()
        // Extract file name (compatible with Windows and Unix paths)
        const fileName = configPath.split(/[/\\]/).pop() || 'chaterm-security.json'
        p.title = fileName
      } catch (error) {
        console.error('Failed to get security config path:', error)
        p.title = 'chaterm-security.json' // Default file name
      }
      break
    }
  }
  if (value.startsWith('plugins:')) {
    const fromLocal = typeof arg === 'string' ? true : (arg.fromLocal ?? true)
    p.title = value.split(':')[1]
    const pluginId = typeof arg === 'string' ? p.title : (arg.pluginId ?? p.title)
    p.type = 'extensions'
    p.key = value
    p.props = {
      fromLocal,
      pluginId
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
    ip: params.data?.ip || params.ip,
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
  const container = (document.querySelector('.main-split-container') as HTMLElement) || (document.querySelector('.splitpanes') as HTMLElement)
  if (container) {
    const containerWidth = container.offsetWidth
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
      // Calculate minimum percentage
      const minSizePercent = (MIN_AI_SIDEBAR_WIDTH_PX / containerWidth) * 100
      // Try to restore saved width, otherwise use default width
      let restoredSize = savedAiSidebarState.value?.size || (DEFAULT_WIDTH_RIGHT_PX / containerWidth) * 100
      // Ensure restored width is not less than minimum usable width
      if ((restoredSize / 100) * containerWidth < MIN_AI_SIDEBAR_WIDTH_PX) {
        restoredSize = minSizePercent
      }
      aiSidebarSize.value = restoredSize
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
  // Skip resize handling during quick close
  if (isQuickClosing.value) {
    return
  }

  mainTerminalSize.value = params.prevPane.size
  if (showAiSidebar.value) {
    aiSidebarSize.value = params.panes[params.panes.length - 1].size
    debouncedAiResizeCheck()
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
  if (!dockApi || !dockApi.activePanel) {
    toggleSideBar('right')
    return
  }
  const activePanel = dockApi.activePanel
  const params = activePanel.params
  if (params && params.organizationId && params.organizationId !== '') {
    const currentActiveTabId = params.id
    if (currentActiveTabId) {
      eventBus.emit('sendOrToggleAiFromTerminalForTab', currentActiveTabId)
      return
    }
  }
  toggleSideBar('right')
}

const handleModeChange = (mode: 'terminal' | 'agents') => {
  // Save AI state before switching modes (unified since same aiTabRef)
  if (aiTabRef.value) {
    try {
      const currentState = aiTabRef.value.getCurrentState?.()
      if (currentState) {
        // Save state to localStorage for persistence across mode switches
        localStorage.setItem('sharedAiTabState', JSON.stringify(currentState))
        // Also update savedAiSidebarState for immediate use
        savedAiSidebarState.value = currentState
      }
    } catch (error) {
      console.warn('Failed to save AI state before mode switch:', error)
    }
  }
  eventBus.emit('switch-mode', mode)
}

// Agents mode handlers
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

const handleActivePanelChange = async () => {
  if (!dockApi) {
    return
  }

  const activePanel = dockApi.activePanel
  if (!activePanel) {
    return
  }

  const params = activePanel.params
  if (!params) {
    return
  }

  const panelType = params.type || params.data?.type
  if (panelType !== 'term' && panelType !== 'ssh') {
    return
  }

  const ip = params.data?.ip || params.ip
  const uuid = params.data?.uuid || params.uuid

  if (ip && uuid) {
    eventBus.emit('activeTabChanged', {
      ip,
      data: {
        uuid
      },
      connection: params.data?.connection || 'personal',
      title: activePanel.api.title || params.title,
      organizationId: params.organizationId || params.data?.organizationId,
      type: panelType
    })
  }
}

const onDockReady = (event: DockviewReadyEvent) => {
  dockApi = event.api

  dockApi.onDidAddPanel(() => {
    panelCount.value = dockApi.panels.length
  })

  dockApi.onDidRemovePanel(() => {
    panelCount.value = dockApi.panels.length
  })

  dockApi.onDidActivePanelChange(() => {
    handleActivePanelChange()
  })

  panelCount.value = dockApi.panels.length
  nextTick(() => {
    applyTheme()
    setupTabContextMenu()
    handleActivePanelChange()
  })
}
const addDockPanel = (params) => {
  if (!dockApi) return

  const id = 'panel_' + params.id
  let displayTitle
  if (params.ip || params.content.startsWith('plugins:')) {
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
  // Listen to dockview container
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
  if (!targetPanelId || typeof panelId !== 'string') {
    targetPanelId = contextMenu.value.panelId || undefined
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

  &.agents-mode {
    .term_body {
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
    background-color: var(--bg-color-secondary) !important;
    border-radius: 5px;
  }

  ::-webkit-scrollbar-thumb {
    background-color: var(--bg-color-secondary) !important;
    border-radius: 5px;
  }

  ::-webkit-scrollbar-thumb:hover {
    background-color: var(--bg-color-secondary) !important;
  }

  .term_header {
    width: 100%;
    height: 28px;
  }

  .term_body {
    width: 100%;
    height: calc(100% - 29px);
    position: relative;

    .agents-mode-layout,
    .terminal-mode-layout {
      width: 100%;
      height: 100%;
      position: absolute;
      top: 0;
      left: 0;
      transition: opacity 0.2s ease;
    }

    .agents-mode-layout {
      .term_content {
        width: 100%;
        height: 100%;
        box-sizing: border-box;
      }
    }

    .terminal-mode-layout {
      display: flex;
    }

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
        min-width: 200px;

        &.collapsed {
          min-width: 0 !important;
        }
      }

      .agents_content_left {
        min-width: 200px;

        &.collapsed {
          min-width: 0 !important;
        }
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
  gap: 8px;

  .ant-input {
    background-color: transparent;
    color: var(--text-color);

    &::placeholder {
      color: var(--text-color-tertiary);
    }
  }

  .ant-input-affix-wrapper {
    background-color: var(--globalInput-bg-color);
    border-color: var(--border-color-light);

    &:hover,
    &:focus,
    &:active {
      border-color: var(--primary-color, #1677ff) !important;
      box-shadow: none !important;
    }
  }
}

.broadcast-indicator {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  background: var(--primary-color-light, rgba(22, 119, 255, 0.1));
  border: 1px solid var(--primary-color, #1677ff);
  border-radius: 4px;
  white-space: nowrap;
  font-size: 12px;
  color: var(--primary-color, #1677ff);
}

.broadcast-icon {
  font-size: 10px;
}

.broadcast-text {
  font-weight: 500;
}

.close-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--text-color-secondary);
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
  border-radius: 4px;
  transition: all 0.2s;

  &:hover {
    background: var(--hover-bg-color);
    color: var(--text-color);
  }
}

.command-input {
  background: var(--globalInput-bg-color);
  border: 1px solid var(--border-color-light);
  height: 30px;
  flex: 1;
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
