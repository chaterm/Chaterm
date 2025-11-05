<template>
  <a-watermark v-bind="watermarkContent">
    <div class="terminal-layout">
      <div class="term_header">
        <Header
          ref="headerRef"
          @toggle-sidebar="toggleSideBar"
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
                        <TabsPanel
                          ref="allTabs"
                          :tabs="openedTabs"
                          :active-tab="activeTabId"
                          :active-tab-id="activeTabId"
                          @close-tab="closeTab"
                          @create-tab="createTab"
                          @change-tab="switchTab"
                          @update-tabs="updateTabs"
                          @close-all-tabs="closeAllTabs"
                          @tab-moved-from-other-pane="handleTabMovedToMainPane"
                          @rename-tab="renameTab"
                        />
                      </div>
                    </pane>
                    <!-- Vertical split terminal -->
                    <pane
                      v-for="(vSplitPane, vIndex) in verticalSplitPanes"
                      :key="`v-${vIndex}`"
                      :size="vSplitPane.size"
                      :min-size="30"
                    >
                      <div
                        class="bottom-sidebar"
                        tabindex="0"
                        @mousedown.stop="handleVerticalSplitPaneFocus(vIndex)"
                      >
                        <TabsPanel
                          :tabs="vSplitPane.tabs"
                          :active-tab="vSplitPane.activeTabId"
                          :active-tab-id="vSplitPane.activeTabId"
                          @close-tab="(tabId) => closeVerticalTab(tabId, vIndex)"
                          @create-tab="(info) => createVerticalTab(info, vIndex)"
                          @change-tab="(tabId) => switchVerticalTab(tabId, vIndex)"
                          @update-tabs="(tabs) => updateVerticalTabs(tabs, vIndex)"
                          @close-all-tabs="() => closeAllVerticalTabs(vIndex)"
                          @tab-moved-from-other-pane="(evt) => handleTabMovedToVerticalSplitPane(evt, vIndex)"
                          @rename-tab="(payload) => renameVerticalTab(payload, vIndex)"
                        />
                      </div>
                    </pane>
                  </splitpanes>
                </pane>
                <!-- Horizontal split terminal -->
                <pane
                  v-for="(splitPane, index) in splitPanes"
                  :key="index"
                  :size="splitPane.size"
                  :min-size="30"
                >
                  <!-- Each right pane also supports vertical split -->
                  <splitpanes
                    horizontal
                    @resize="(params) => onRightPaneVerticalSplitResize(params, index)"
                  >
                    <!-- Right pane main window -->
                    <pane
                      :size="splitPane.mainVerticalSize || 100"
                      :min-size="30"
                    >
                      <div
                        class="rigth-sidebar"
                        tabindex="0"
                        @mousedown.stop="handleSplitPaneFocus(index)"
                      >
                        <TabsPanel
                          :tabs="splitPane.tabs"
                          :active-tab="splitPane.activeTabId"
                          :active-tab-id="splitPane.activeTabId"
                          @close-tab="(tabId) => closeRightTab(tabId, index)"
                          @create-tab="(info) => createRightTab(info, index)"
                          @change-tab="(tabId) => switchRightTab(tabId, index)"
                          @update-tabs="(tabs) => updateRightTabs(tabs, index)"
                          @close-all-tabs="() => closeAllRightTabs(index)"
                          @tab-moved-from-other-pane="(evt) => handleTabMovedToSplitPane(evt, index)"
                          @rename-tab="(payload) => renameRightTab(payload, index)"
                        />
                      </div>
                    </pane>
                    <!-- Right pane vertical split -->
                    <pane
                      v-for="(vSplitPane, vIndex) in splitPane.verticalSplitPanes || []"
                      :key="`r-v-${index}-${vIndex}`"
                      :size="vSplitPane.size"
                      :min-size="30"
                    >
                      <div
                        class="bottom-sidebar"
                        tabindex="0"
                        @mousedown.stop="handleRightPaneVerticalSplitFocus(index, vIndex)"
                      >
                        <TabsPanel
                          :tabs="vSplitPane.tabs"
                          :active-tab="vSplitPane.activeTabId"
                          :active-tab-id="vSplitPane.activeTabId"
                          @close-tab="(tabId) => closeRightVerticalTab(tabId, index, vIndex)"
                          @create-tab="(info) => createRightVerticalTab(info, index, vIndex)"
                          @change-tab="(tabId) => switchRightVerticalTab(tabId, index, vIndex)"
                          @update-tabs="(tabs) => updateRightVerticalTabs(tabs, index, vIndex)"
                          @close-all-tabs="() => closeAllRightVerticalTabs(index, vIndex)"
                          @tab-moved-from-other-pane="(evt) => handleTabMovedToRightVerticalSplitPane(evt, index, vIndex)"
                          @rename-tab="(payload) => renameRightVerticalTab(payload, index, vIndex)"
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
import { ref, onMounted, nextTick, onUnmounted, watch, computed } from 'vue'
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

const router = useRouter()
const api = window.api as any
const { t } = useI18n()
const aliasConfig = aliasConfigStore()
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
  chatInputValue: string
  chatHistory: any[]
  currentChatId: string | null
  hosts: any[]
  chatTypeValue: string
  chatAiModelValue: string
}

const savedAiSidebarState = ref<AiSidebarState | null>(null)
const aiTabRef = ref<InstanceType<typeof AiTab> | null>(null)

const handleAiTabStateChanged = (state: AiSidebarState) => {
  savedAiSidebarState.value = state
}

const saveAiSidebarState = () => {
  if (aiTabRef.value) {
    try {
      const currentState = aiTabRef.value.getCurrentState?.() || savedAiSidebarState.value
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
      } else {
        savedAiSidebarState.value = {
          size: aiSidebarSize.value,
          chatInputValue: '',
          chatHistory: [],
          currentChatId: null,
          hosts: [],
          chatTypeValue: 'agent',
          chatAiModelValue: ''
        }
      }
    }
  } else {
    if (savedAiSidebarState.value) {
      savedAiSidebarState.value.size = aiSidebarSize.value
    } else {
      savedAiSidebarState.value = {
        size: aiSidebarSize.value,
        chatInputValue: '',
        chatHistory: [],
        currentChatId: null,
        hosts: [],
        chatTypeValue: 'agent',
        chatAiModelValue: ''
      }
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
  if (openedTabs.value.length <= 1) return

  const currentIndex = openedTabs.value.findIndex((tab) => tab.id === activeTabId.value)
  if (currentIndex !== -1) {
    const nextIndex = (currentIndex + 1) % openedTabs.value.length
    const nextTab = openedTabs.value[nextIndex]
    if (nextTab) {
      switchTab(nextTab.id)
    }
  }
}

const switchToPrevTab = () => {
  if (openedTabs.value.length <= 1) return

  const currentIndex = openedTabs.value.findIndex((tab) => tab.id === activeTabId.value)
  if (currentIndex !== -1) {
    const prevIndex = (currentIndex - 1 + openedTabs.value.length) % openedTabs.value.length
    const prevTab = openedTabs.value[prevIndex]
    if (prevTab) {
      switchTab(prevTab.id)
    }
  }
}

const switchToSpecificTab = (tabNumber: number) => {
  if (tabNumber < 1 || tabNumber > 9) return

  // Focus the main panel first
  if (focusedPane.value.type !== 'main') {
    focusedPane.value = { type: 'main' }
    focusedSplitPaneIndex.value = null
  }

  // Switch to the specified tab (1-based index)
  if (openedTabs.value.length >= tabNumber) {
    const targetTab = openedTabs.value[tabNumber - 1]
    if (targetTab) {
      switchTab(targetTab.id)
    }
  }
}

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
    }
  })
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
    openedTabs.value.push(newTab)
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

const closeTab = (tabId) => {
  const index = openedTabs.value.findIndex((tab) => tab.id === tabId)
  const closedTab = openedTabs.value[index]
  let activeTabType = ''
  if (index !== -1) {
    openedTabs.value.splice(index, 1)
    if (activeTabId.value === tabId) {
      if (openedTabs.value.length > 0) {
        const newActiveIndex = Math.max(0, index - 1)
        activeTabId.value = openedTabs.value[newActiveIndex].id
        activeTabType = openedTabs.value[newActiveIndex].type
      } else {
        activeTabId.value = ''
        eventBus.emit('activeTabChanged', null)
      }
      checkActiveTab(activeTabType)
    }
    if (closedTab.type === 'extensions' && extensionsRef.value && closedTab.data?.key) {
      extensionsRef.value.handleExplorerActive(closedTab.data.key)
    }
  }
}

const closeAllTabs = () => {
  openedTabs.value = []
  activeTabId.value = ''
  eventBus.emit('activeTabChanged', null)
}

const createTab = (infos) => {
  const id_ = uuidv4()
  openedTabs.value.push({
    id: id_,
    title: infos.title,
    content: infos.content,
    type: infos.type,
    organizationId: infos.organizationId,
    ip: infos.ip,
    data: infos.data
  })
  activeTabId.value = id_
  checkActiveTab(infos.type)
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

const adjustRightPaneVerticalSplitToEqualHeight = (rightPaneIndex: number) => {
  const rightPane = splitPanes.value[rightPaneIndex]
  if (rightPane && rightPane.verticalSplitPanes && rightPane.verticalSplitPanes.length > 0) {
    const paneCount = rightPane.verticalSplitPanes.length + 1
    const equalSize = 100 / paneCount

    rightPane.mainVerticalSize = equalSize
    rightPane.verticalSplitPanes.forEach((pane) => {
      pane.size = equalSize
    })
  }
}

const adjustVerticalSplitPaneToEqualHeight = () => {
  if (showVerticalSplitPane.value) {
    const paneCount = verticalSplitPanes.value.length + 1
    const equalSize = 100 / paneCount

    mainVerticalSize.value = equalSize
    verticalSplitPanes.value.forEach((pane) => {
      pane.size = equalSize
    })
  }
}

const handleCreateSplitTab = (tabInfo) => {
  const id_ = uuidv4()
  const newTab = {
    ...tabInfo,
    id: id_
  }

  if (splitPanes.value.length === 0) {
    splitPanes.value.push({
      size: 0,
      tabs: [newTab],
      activeTabId: id_,
      mainVerticalSize: 100,
      verticalSplitPanes: []
    })
    showSplitPane.value = true
    adjustSplitPaneToEqualWidth()
  } else {
    splitPanes.value.push({
      size: 0,
      tabs: [newTab],
      activeTabId: id_,
      mainVerticalSize: 100,
      verticalSplitPanes: []
    })
    adjustSplitPaneToEqualWidth()
  }

  checkActiveTab(tabInfo.type)
}

const handleCreateVerticalSplitTab = (tabInfo) => {
  const id_ = uuidv4()
  const newTab = {
    ...tabInfo,
    id: id_
  }

  if (focusedPane.value.type === 'horizontal' && focusedPane.value.index !== undefined && focusedPane.value.index < splitPanes.value.length) {
    const rightPane = splitPanes.value[focusedPane.value.index]
    if (!rightPane.verticalSplitPanes) {
      rightPane.verticalSplitPanes = []
    }

    if (rightPane.verticalSplitPanes.length === 0) {
      rightPane.verticalSplitPanes.push({
        size: 0,
        tabs: [newTab],
        activeTabId: id_
      })
      adjustRightPaneVerticalSplitToEqualHeight(focusedPane.value.index)
    } else {
      rightPane.verticalSplitPanes.push({
        size: 0,
        tabs: [newTab],
        activeTabId: id_
      })
      adjustRightPaneVerticalSplitToEqualHeight(focusedPane.value.index)
    }
  } else {
    if (verticalSplitPanes.value.length === 0) {
      verticalSplitPanes.value.push({
        size: 0,
        tabs: [newTab],
        activeTabId: id_
      })
      showVerticalSplitPane.value = true
      adjustVerticalSplitPaneToEqualHeight()
    } else {
      verticalSplitPanes.value.push({
        size: 0,
        tabs: [newTab],
        activeTabId: id_
      })
      adjustVerticalSplitPaneToEqualHeight()
    }
  }

  checkActiveTab(tabInfo.type)
}

const handleCreateNewTerminal = () => {
  // Get current active tab info to create new terminal with same configuration
  const activeTab = openedTabs.value.find((tab) => tab.id === activeTabId.value)

  if (activeTab) {
    // Create new terminal with same configuration as current active tab
    const newTerminalInfo = {
      title: activeTab.title,
      content: activeTab.content,
      type: activeTab.type,
      organizationId: activeTab.organizationId,
      ip: activeTab.ip,
      data: activeTab.data
    }

    // Create new tab in main terminal area
    createTab(newTerminalInfo)
  } else {
    // If no active tab, open settings page instead of creating default terminal
    openUserTab('userConfig')
  }
}

const switchTab = (tabId) => {
  activeTabId.value = tabId
  allTabs.value?.resizeTerm(tabId)
  openedTabs.value.forEach((tab) => {
    if (tab.id === tabId) {
      checkActiveTab(tab.type)
    }
  })
}

const updateTabs = (newTabs) => {
  openedTabs.value = newTabs
}

const renameTab = (payload: { id: string; title: string }) => {
  const tab = openedTabs.value.find((t) => t.id === payload.id)
  if (tab) {
    tab.title = payload.title
  }
}

const renameVerticalTab = (payload: { id: string; title: string }, vIndex: number) => {
  const pane = verticalSplitPanes.value[vIndex]
  if (pane) {
    const tab = pane.tabs.find((t) => t.id === payload.id)
    if (tab) {
      tab.title = payload.title
    }
  }
}

const renameRightTab = (payload: { id: string; title: string }, index: number) => {
  const pane = splitPanes.value[index]
  if (pane) {
    const tab = pane.tabs.find((t) => t.id === payload.id)
    if (tab) {
      tab.title = payload.title
    }
  }
}

const renameRightVerticalTab = (payload: { id: string; title: string }, index: number, vIndex: number) => {
  const pane = splitPanes.value[index]
  if (pane && pane.verticalSplitPanes) {
    const vPane = pane.verticalSplitPanes[vIndex]
    if (vPane) {
      const tab = vPane.tabs.find((t) => t.id === payload.id)
      if (tab) {
        tab.title = payload.title
      }
    }
  }
}
onUnmounted(() => {
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
    const existTab = openedTabs.value.find((tab) => tab.content === value)
    if (existTab) {
      activeTabId.value = existTab.id
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
  if (!activeTabId.value) {
    return null
  }
  const activeTab = openedTabs.value.find((tab) => tab.id === activeTabId.value)
  if (!activeTab) {
    return null
  }

  const ip = activeTab.data?.ip
  if (!ip) {
    return null
  }

  let outputContext = 'Output context not applicable for this tab type.'

  const uuid = activeTab.data?.uuid
  return {
    uuid: uuid,
    title: activeTab.title,
    ip: activeTab.ip,
    organizationId: activeTab.organizationId,
    type: activeTab.type,
    outputContext: outputContext,
    tabSessionId: activeTabId.value
  }
}

const handleGetActiveTabAssetInfo = async () => {
  const assetInfo = await getActiveTabAssetInfo()
  eventBus.emit('assetInfoResult', assetInfo)
}

const closeRightTab = (tabId, paneIndex) => {
  const pane = splitPanes.value[paneIndex]
  if (!pane) return

  const index = pane.tabs.findIndex((tab) => tab.id === tabId)
  if (index !== -1) {
    pane.tabs.splice(index, 1)
    if (pane.activeTabId === tabId) {
      if (pane.tabs.length > 0) {
        const newActiveIndex = Math.max(0, index - 1)
        pane.activeTabId = pane.tabs[newActiveIndex].id
      } else {
        pane.activeTabId = ''
      }
    }
    if (pane.tabs.length === 0) {
      splitPanes.value.splice(paneIndex, 1)
      if (splitPanes.value.length === 0) {
        showSplitPane.value = false
        mainTerminalSize.value = 100 - (showAiSidebar.value ? aiSidebarSize.value : 0)
      } else {
        adjustSplitPaneToEqualWidth()
      }
    }
  }
}

const createRightTab = (infos, paneIndex) => {
  const id_ = uuidv4()
  const newTab = {
    ...infos,
    id: id_
  }

  const pane = splitPanes.value[paneIndex]
  if (pane) {
    pane.tabs.push(newTab)
    pane.activeTabId = id_
  }
  checkActiveTab(infos.type)
}

const switchRightTab = (tabId, paneIndex) => {
  const pane = splitPanes.value[paneIndex]
  if (pane) {
    pane.activeTabId = tabId
    pane.tabs.forEach((tab) => {
      if (tab.id === tabId) {
        checkActiveTab(tab.type)
      }
    })
  }
}

const updateRightTabs = (newTabs, paneIndex) => {
  const pane = splitPanes.value[paneIndex]
  if (pane) {
    pane.tabs = newTabs
    if (newTabs.length === 0) {
      splitPanes.value.splice(paneIndex, 1)
      if (splitPanes.value.length === 0) {
        showSplitPane.value = false
        mainTerminalSize.value = 100 - (showAiSidebar.value ? aiSidebarSize.value : 0)
      } else {
        adjustSplitPaneToEqualWidth()
      }
    }
  }
}

const closeAllRightTabs = (paneIndex) => {
  splitPanes.value.splice(paneIndex, 1)
  if (splitPanes.value.length === 0) {
    showSplitPane.value = false
    mainTerminalSize.value = 100 - (showAiSidebar.value ? aiSidebarSize.value : 0)
  } else {
    adjustSplitPaneToEqualWidth()
  }
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

const handleTabMovedToMainPane = (evt) => {
  const { tab, fromElement } = evt
  let fromPaneIndex = -1
  const rightSidebars = document.querySelectorAll('.rigth-sidebar')
  for (let i = 0; i < rightSidebars.length; i++) {
    if (rightSidebars[i].contains(fromElement)) {
      fromPaneIndex = i
      break
    }
  }
  if (fromPaneIndex !== -1) {
    const fromPane = splitPanes.value[fromPaneIndex]
    if (fromPane) {
      if (fromPane.activeTabId === tab.id && fromPane.tabs.length > 0) {
        fromPane.activeTabId = fromPane.tabs[fromPane.tabs.length - 1].id
        nextTick(() => {
          eventBus.emit('resizeTerminal', fromPane.activeTabId)
        })
      }
    }
  }
}

const handleTabMovedToSplitPane = (evt, toPaneIndex) => {
  const { tab, fromElement } = evt
  const mainTabsElement = allTabs.value?.$el.querySelector('.tabs-bar')
  if (mainTabsElement && mainTabsElement.contains(fromElement)) {
    activeTabId.value = openedTabs.value[openedTabs.value.length - 1].id
  } else {
    let fromPaneIndex = -1
    const rightSidebars = document.querySelectorAll('.rigth-sidebar')

    for (let i = 0; i < rightSidebars.length; i++) {
      if (rightSidebars[i].contains(fromElement)) {
        fromPaneIndex = i
        break
      }
    }

    if (fromPaneIndex !== -1 && fromPaneIndex !== toPaneIndex) {
      const fromPane = splitPanes.value[fromPaneIndex]
      if (fromPane) {
        const tabIndex = fromPane.tabs.findIndex((t) => t.id === tab.id)
        if (tabIndex !== -1) {
          fromPane.tabs.splice(tabIndex, 1)
          if (fromPane.tabs.length === 0) {
            splitPanes.value.splice(fromPaneIndex, 1)
            if (splitPanes.value.length === 0) {
              showSplitPane.value = false
              mainTerminalSize.value = 100 - (showAiSidebar.value ? aiSidebarSize.value : 0)
            } else {
              adjustSplitPaneToEqualWidth()
            }
          }
        }
      }
    }
  }
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

const closeVerticalTab = (tabId, paneIndex) => {
  const pane = verticalSplitPanes.value[paneIndex]
  if (!pane) return

  const index = pane.tabs.findIndex((tab) => tab.id === tabId)
  if (index !== -1) {
    pane.tabs.splice(index, 1)
    if (pane.activeTabId === tabId) {
      if (pane.tabs.length > 0) {
        const newActiveIndex = Math.max(0, index - 1)
        pane.activeTabId = pane.tabs[newActiveIndex].id
      } else {
        pane.activeTabId = ''
      }
    }
    if (pane.tabs.length === 0) {
      verticalSplitPanes.value.splice(paneIndex, 1)
      if (verticalSplitPanes.value.length === 0) {
        showVerticalSplitPane.value = false
        mainVerticalSize.value = 100
      } else {
        adjustVerticalSplitPaneToEqualHeight()
      }
    }
  }
}

const createVerticalTab = (infos, paneIndex) => {
  const id_ = uuidv4()
  const newTab = {
    ...infos,
    id: id_
  }

  const pane = verticalSplitPanes.value[paneIndex]
  if (pane) {
    pane.tabs.push(newTab)
    pane.activeTabId = id_
  }
  checkActiveTab(infos.type)
}

const switchVerticalTab = (tabId, paneIndex) => {
  const pane = verticalSplitPanes.value[paneIndex]
  if (pane) {
    pane.activeTabId = tabId
    pane.tabs.forEach((tab) => {
      if (tab.id === tabId) {
        checkActiveTab(tab.type)
      }
    })
  }
}

const updateVerticalTabs = (newTabs, paneIndex) => {
  const pane = verticalSplitPanes.value[paneIndex]
  if (pane) {
    pane.tabs = newTabs
    if (newTabs.length === 0) {
      verticalSplitPanes.value.splice(paneIndex, 1)
      if (verticalSplitPanes.value.length === 0) {
        showVerticalSplitPane.value = false
        mainVerticalSize.value = 100
      } else {
        adjustVerticalSplitPaneToEqualHeight()
      }
    }
  }
}

const closeAllVerticalTabs = (paneIndex) => {
  verticalSplitPanes.value.splice(paneIndex, 1)
  if (verticalSplitPanes.value.length === 0) {
    showVerticalSplitPane.value = false
    mainVerticalSize.value = 100
  } else {
    adjustVerticalSplitPaneToEqualHeight()
  }
}

const handleVerticalSplitPaneFocus = (paneIndex: number) => {
  focusedPane.value = { type: 'vertical', index: paneIndex }
  focusedSplitPaneIndex.value = null
}

const handleTabMovedToVerticalSplitPane = (evt, toPaneIndex) => {
  console.log('Tab moved to vertical split pane:', toPaneIndex)
}

const handleSplitPaneFocus = (paneIndex: number) => {
  const rightPane = splitPanes.value[paneIndex]
  if (rightPane && !rightPane.verticalSplitPanes) {
    rightPane.verticalSplitPanes = []
    rightPane.mainVerticalSize = 100
  }
  focusedPane.value = { type: 'horizontal', index: paneIndex }
  focusedSplitPaneIndex.value = paneIndex
}

const handleMainPaneFocus = () => {
  focusedPane.value = { type: 'main' }
  focusedSplitPaneIndex.value = null
}

const onRightPaneVerticalSplitResize = (params, rightPaneIndex: number) => {
  const rightPane = splitPanes.value[rightPaneIndex]
  if (rightPane) {
    rightPane.mainVerticalSize = params.prevPane.size
    if (rightPane.verticalSplitPanes && rightPane.verticalSplitPanes.length > 0) {
      const startIndex = 1
      const endIndex = params.panes.length - 1
      for (let i = startIndex; i <= endIndex; i++) {
        if (rightPane.verticalSplitPanes[i - 1]) {
          rightPane.verticalSplitPanes[i - 1].size = params.panes[i].size
        }
      }
    }
  }
}

const handleRightPaneVerticalSplitFocus = (rightPaneIndex: number, vPaneIndex: number) => {
  focusedPane.value = { type: 'rightVertical', index: vPaneIndex, rightPaneIndex: rightPaneIndex }
  focusedSplitPaneIndex.value = rightPaneIndex
}

const closeRightVerticalTab = (tabId: string, rightPaneIndex: number, vPaneIndex: number) => {
  const rightPane = splitPanes.value[rightPaneIndex]
  if (!rightPane || !rightPane.verticalSplitPanes) return

  const vPane = rightPane.verticalSplitPanes[vPaneIndex]
  if (!vPane) return

  const index = vPane.tabs.findIndex((tab) => tab.id === tabId)
  if (index !== -1) {
    vPane.tabs.splice(index, 1)
    if (vPane.activeTabId === tabId) {
      if (vPane.tabs.length > 0) {
        const newActiveIndex = Math.max(0, index - 1)
        vPane.activeTabId = vPane.tabs[newActiveIndex].id
      } else {
        vPane.activeTabId = ''
      }
    }
    if (vPane.tabs.length === 0) {
      rightPane.verticalSplitPanes.splice(vPaneIndex, 1)
      if (rightPane.verticalSplitPanes.length === 0) {
        rightPane.mainVerticalSize = 100
        rightPane.verticalSplitPanes = undefined
      } else {
        adjustRightPaneVerticalSplitToEqualHeight(rightPaneIndex)
      }
    }
  }
}

const createRightVerticalTab = (infos: any, rightPaneIndex: number, vPaneIndex: number) => {
  const id_ = uuidv4()
  const newTab = {
    ...infos,
    id: id_
  }

  const rightPane = splitPanes.value[rightPaneIndex]
  if (rightPane && rightPane.verticalSplitPanes) {
    const vPane = rightPane.verticalSplitPanes[vPaneIndex]
    if (vPane) {
      vPane.tabs.push(newTab)
      vPane.activeTabId = id_
    }
  }
  checkActiveTab(infos.type)
}

const switchRightVerticalTab = (tabId: string, rightPaneIndex: number, vPaneIndex: number) => {
  const rightPane = splitPanes.value[rightPaneIndex]
  if (rightPane && rightPane.verticalSplitPanes) {
    const vPane = rightPane.verticalSplitPanes[vPaneIndex]
    if (vPane) {
      vPane.activeTabId = tabId
      vPane.tabs.forEach((tab) => {
        if (tab.id === tabId) {
          checkActiveTab(tab.type)
        }
      })
    }
  }
}

const updateRightVerticalTabs = (newTabs: TabItem[], rightPaneIndex: number, vPaneIndex: number) => {
  const rightPane = splitPanes.value[rightPaneIndex]
  if (rightPane && rightPane.verticalSplitPanes) {
    const vPane = rightPane.verticalSplitPanes[vPaneIndex]
    if (vPane) {
      vPane.tabs = newTabs
      if (newTabs.length === 0) {
        rightPane.verticalSplitPanes.splice(vPaneIndex, 1)
        if (rightPane.verticalSplitPanes.length === 0) {
          rightPane.mainVerticalSize = 100
          rightPane.verticalSplitPanes = undefined
        } else {
          adjustRightPaneVerticalSplitToEqualHeight(rightPaneIndex)
        }
      }
    }
  }
}

const closeAllRightVerticalTabs = (rightPaneIndex: number, vPaneIndex: number) => {
  const rightPane = splitPanes.value[rightPaneIndex]
  if (rightPane && rightPane.verticalSplitPanes) {
    rightPane.verticalSplitPanes.splice(vPaneIndex, 1)
    if (rightPane.verticalSplitPanes.length === 0) {
      rightPane.mainVerticalSize = 100
      rightPane.verticalSplitPanes = undefined
    } else {
      adjustRightPaneVerticalSplitToEqualHeight(rightPaneIndex)
    }
  }
}

const handleTabMovedToRightVerticalSplitPane = (evt: any, rightPaneIndex: number, vPaneIndex: number) => {
  console.log('Tab moved to right pane vertical split:', rightPaneIndex, vPaneIndex)
}

const handleSendOrToggleAiFromTerminal = () => {
  const currentActiveTabId = getCurrentActiveTabId()
  if (currentActiveTabId) {
    eventBus.emit('sendOrToggleAiFromTerminalForTab', currentActiveTabId)
  } else {
    toggleSideBar('right')
  }
}

const getCurrentActiveTabId = (): string | null => {
  // Active tab in main panel
  if (activeTabId.value && openedTabs.value.some((tab) => tab.id === activeTabId.value)) {
    return activeTabId.value
  }

  // Check horizontal split panels
  for (const pane of splitPanes.value) {
    if (pane.activeTabId && pane.tabs.length > 0) {
      return pane.activeTabId
    }
  }

  // Check vertical split panels
  for (const pane of verticalSplitPanes.value) {
    if (pane.activeTabId && pane.tabs.length > 0) {
      return pane.activeTabId
    }
  }

  // Check vertical split panels in right panes
  for (const rightPane of splitPanes.value) {
    if (rightPane.verticalSplitPanes) {
      for (const vPane of rightPane.verticalSplitPanes) {
        if (vPane.activeTabId && vPane.tabs.length > 0) {
          return vPane.activeTabId
        }
      }
    }
  }

  return null
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
</style>
