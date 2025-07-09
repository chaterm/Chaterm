<template>
  <a-watermark
    v-if="showWatermark"
    v-bind="watermarkContent"
  >
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
          <splitpanes @resize="(params: ResizeParams) => (leftPaneSize = params.prevPane.size)">
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
              <div v-if="currentMenu == 'monitor'">{{ $t('common.monitor') }}</div>
            </pane>
            <pane :size="100 - leftPaneSize">
              <splitpanes @resize="onMainSplitResize">
                <pane
                  :size="mainTerminalSize"
                  :min-size="30"
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
                  />
                </pane>
                <!-- 分屏终端 -->
                <pane
                  v-for="(splitPane, index) in splitPanes"
                  :key="index"
                  :size="splitPane.size"
                  :min-size="30"
                >
                  <div class="rigth-sidebar">
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
                    />
                  </div>
                </pane>
                <!-- AI侧边栏 -->
                <pane
                  v-if="showAiSidebar"
                  :size="aiSidebarSize"
                >
                  <div class="rigth-sidebar">
                    <AiTab :toggle-sidebar="toggleAiSidebar" />
                  </div>
                </pane>
              </splitpanes>
            </pane>
          </splitpanes>
          <div
            v-if="isGlobalInput"
            :style="{ width: globalInputWidth + 'px', left: leftPaneSize + '%' }"
            class="globalInput"
          >
            <a-input
              v-model:value="globalInput"
              size="small"
              class="command-input"
              allow-clear
              @press-enter="sendGlobalCommand"
            >
            </a-input>
            <a-button
              size="small"
              class="menu-action-btn"
              :wave="false"
              @click="sendGlobalCommand"
            >
              {{ $t('common.allExecuted') }}
            </a-button>
            <a-button
              size="small"
              class="menu-action-btn"
              @click="isGlobalInput = false"
            >
              {{ $t('common.close') }}
            </a-button>
          </div>
        </div>
      </div>
    </div>
  </a-watermark>
  <div
    v-else
    class="terminal-layout"
  >
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
        <splitpanes @resize="(params: ResizeParams) => (leftPaneSize = params.prevPane.size)">
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
            <div v-if="currentMenu == 'monitor'">{{ $t('common.monitor') }}</div>
          </pane>
          <pane :size="100 - leftPaneSize">
            <splitpanes @resize="onMainSplitResize">
              <pane
                :size="mainTerminalSize"
                :min-size="30"
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
                />
              </pane>
              <!-- 分屏终端 -->
              <pane
                v-for="(splitPane, index) in splitPanes"
                :key="index"
                :size="splitPane.size"
                :min-size="30"
              >
                <div class="rigth-sidebar">
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
                  />
                </div>
              </pane>
              <!-- AI侧边栏 -->
              <pane
                v-if="showAiSidebar"
                :size="aiSidebarSize"
              >
                <div class="rigth-sidebar">
                  <AiTab :toggle-sidebar="toggleAiSidebar" />
                </div>
              </pane>
            </splitpanes>
          </pane>
        </splitpanes>
      </div>
    </div>
  </div>
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
import { reactive } from 'vue'
import { v4 as uuidv4 } from 'uuid'
import { userInfoStore } from '@/store'
import { aliasConfigStore } from '@/store/aliasConfigStore'
import eventBus from '@/utils/eventBus'
import { Notice } from '../components/Notice'
import '@/assets/theme.less'
import { isGlobalInput } from '@renderer/views/components/Ssh/termInputManager'
import { inputManager } from '../components/Ssh/termInputManager'
import { useRouter } from 'vue-router'

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
    return [userInfoStore().userInfo.name, userInfoStore().userInfo.email]
  }),
  font: {
    fontSize: 12,
    color: computed(() => (currentTheme.value === 'dark' ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)'))
  },
  rotate: -22,
  gap: [150, 100] as [number, number]
})

const leftPaneSize = ref(30)
const mainTerminalSize = ref(100)
const showWatermark = ref(true)
const currentTheme = ref('dark')
const rightPaneMode = ref('')
const aiSidebarSize = ref(0)
const splitPanes = ref<{ size: number; tabs: TabItem[]; activeTabId: string }[]>([])
const showAiSidebar = ref(false)
const showSplitPane = ref(false)
const globalInput = ref('')
onMounted(async () => {
  const store = piniaUserConfigStore()
  eventBus.on('updateWatermark', (watermark) => {
    showWatermark.value = watermark !== 'close'
  })
  eventBus.on('updateTheme', (theme) => {
    currentTheme.value = theme
    document.body.className = `theme-${theme}`
    nextTick(() => {
      showWatermark.value = true
    })
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
    document.body.className = `theme-${currentTheme.value}`
    nextTick(() => {
      showWatermark.value = config.watermark !== 'close'
      api.updateTheme(currentTheme.value)
    })
  } catch (e) {
    currentTheme.value = 'dark'
    document.body.className = 'theme-dark'
    nextTick(() => {
      showWatermark.value = true
      api.updateTheme('dark')
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
  eventBus.on('currentClickServer', currentClickServer)
  eventBus.on('getActiveTabAssetInfo', handleGetActiveTabAssetInfo)
  eventBus.on('toggleSideBar', toggleSideBar)
  eventBus.on('createSplitTab', handleCreateSplitTab)
  eventBus.on('switchRightPaneMode', handleSwitchRightPaneMode)
  eventBus.on('adjustSplitPaneToEqual', adjustSplitPaneToEqualWidth)

  checkVersion()
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
const globalInputWidth = computed(() => {
  const container = document.querySelector('.splitpanes') as HTMLElement
  const containerWidth = container?.offsetWidth
  const width = ((100 - leftPaneSize.value) * containerWidth * (100 - aiSidebarSize.value)) / 10000 - 60
  return isGlobalInput.value ? width : 0
})
const DEFAULT_WIDTH_PX = 240
const DEFAULT_WIDTH_RIGHT_PX = 400
const currentMenu = ref('workspace')
const activeKey = ref('mainTerminal')
const updatePaneSize = () => {
  const container = document.querySelector('.splitpanes') as HTMLElement
  if (container) {
    const containerWidth = container.offsetWidth
    leftPaneSize.value = (DEFAULT_WIDTH_PX / containerWidth) * 100
  }
}

const toggleSideBar = (value: string) => {
  const container = document.querySelector('.splitpanes') as HTMLElement
  const containerWidth = container.offsetWidth
  switch (value) {
    case 'right':
      if (showAiSidebar.value) {
        showAiSidebar.value = false
        aiSidebarSize.value = 0
        headerRef.value?.switchIcon('right', false)
        if (showSplitPane.value) {
          adjustSplitPaneToEqualWidth()
        } else {
          mainTerminalSize.value = 100
        }
      } else {
        showAiSidebar.value = true
        aiSidebarSize.value = (DEFAULT_WIDTH_RIGHT_PX / containerWidth) * 100
        headerRef.value?.switchIcon('right', true)
        if (showSplitPane.value) {
          adjustSplitPaneToEqualWidth()
        } else {
          mainTerminalSize.value = 100 - aiSidebarSize.value
        }
      }
      break
    case 'left':
      {
        leftPaneSize.value ? (leftPaneSize.value = 0) : (leftPaneSize.value = (DEFAULT_WIDTH_PX / containerWidth) * 100)
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
      aiSidebarSize.value = (DEFAULT_WIDTH_RIGHT_PX / containerWidth) * 100
      mainTerminalSize.value =
        100 - aiSidebarSize.value - (splitPanes.value.length > 0 ? splitPanes.value.reduce((acc, pane) => acc + pane.size, 0) : 0)
      headerRef.value?.switchIcon('right', true)
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
      const container = document.querySelector('.splitpanes') as HTMLElement
      if (container) {
        const containerWidth = container.offsetWidth
        showAiSidebar.value = true
        aiSidebarSize.value = (DEFAULT_WIDTH_RIGHT_PX / containerWidth) * 100
        headerRef.value?.switchIcon('right', true)
        if (showSplitPane.value) {
          adjustSplitPaneToEqualWidth()
        } else {
          mainTerminalSize.value = 100 - aiSidebarSize.value
        }
      }
    } else {
      showAiSidebar.value = false
      aiSidebarSize.value = 0
      headerRef.value?.switchIcon('right', false)
      if (showSplitPane.value) {
        adjustSplitPaneToEqualWidth()
      } else {
        mainTerminalSize.value = 100
      }
    }
  } else if (params.menu == 'openAiRight') {
    currentMenu.value = params.beforeActive
    if (!showAiSidebar.value) {
      const container = document.querySelector('.splitpanes') as HTMLElement
      if (container) {
        const containerWidth = container.offsetWidth
        showAiSidebar.value = true
        aiSidebarSize.value = (DEFAULT_WIDTH_RIGHT_PX / containerWidth) * 100
        headerRef.value?.switchIcon('right', true)
        if (showSplitPane.value) {
          adjustSplitPaneToEqualWidth()
        } else {
          mainTerminalSize.value = 100 - aiSidebarSize.value
        }
      }
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
const rightTabs = ref<TabItem[]>([])
const rightActiveTabId = ref('')
const currentClickServer = async (item) => {
  // 如果是跳过登录的用户，检查是否需要登录的功能
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
  openedTabs.value.push({
    id: id_,
    title: item.title,
    content: item.key,
    type: item.type ? item.type : 'term',
    organizationId: item.organizationId ? item.organizationId : '',
    ip: item.ip ? item.ip : '',
    data: item
  })
  activeTabId.value = id_
  checkActiveTab(item.type || 'term')
}

const needsAuth = (item) => {
  const authRequiredTypes = ['extensions', 'monitor']
  if (item.type === 'term' && item.data?.type === 'ssh') {
    return false
  }
  return authRequiredTypes.includes(item.type || 'term')
}

const closeTab = (tabId) => {
  const index = openedTabs.value.findIndex((tab) => tab.id === tabId)
  const closedTab = openedTabs.value[index]
  if (index !== -1) {
    openedTabs.value.splice(index, 1)
    if (activeTabId.value === tabId) {
      if (openedTabs.value.length > 0) {
        const newActiveIndex = Math.max(0, index - 1)
        activeTabId.value = openedTabs.value[newActiveIndex].id
      } else {
        activeTabId.value = ''
        eventBus.emit('activeTabChanged', null)
      }
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
    const paneCount = splitPanes.value.length + 1 // +1 for main terminal
    const equalSize = availableSpace / paneCount

    mainTerminalSize.value = equalSize
    splitPanes.value.forEach((pane, index) => {
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

  // 如果是第一次分屏
  if (splitPanes.value.length === 0) {
    splitPanes.value.push({
      size: 0,
      tabs: [newTab],
      activeTabId: id_
    })
    showSplitPane.value = true
    adjustSplitPaneToEqualWidth()
  }
  // 如果已经有分屏，添加新的分屏
  else {
    splitPanes.value.push({
      size: 0,
      tabs: [newTab],
      activeTabId: id_
    })
    adjustSplitPaneToEqualWidth()
  }

  checkActiveTab(tabInfo.type)
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
onUnmounted(() => {
  window.removeEventListener('resize', updatePaneSize)
  eventBus.off('currentClickServer', currentClickServer)
  eventBus.off('getActiveTabAssetInfo', handleGetActiveTabAssetInfo)
  eventBus.off('toggleSideBar', toggleSideBar)
  eventBus.off('createSplitTab', handleCreateSplitTab)
  eventBus.off('switchRightPaneMode', handleSwitchRightPaneMode)
  eventBus.off('adjustSplitPaneToEqual', adjustSplitPaneToEqualWidth)
})
const openUserTab = function (value) {
  activeKey.value = value
  if (value === 'assetConfig' || value === 'keyChainConfig' || value === 'userInfo' || value === 'userConfig') {
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
  }
  currentClickServer(p)
}

const changeCompany = () => {
  openedTabs.value = []
}

const getActiveTabAssetInfo = async () => {
  if (!activeTabId.value) {
    console.warn('No active tab selected.')
    return null
  }
  const activeTab = openedTabs.value.find((tab) => tab.id === activeTabId.value)
  if (!activeTab) {
    console.warn('Active tab not found in openedTabs.')
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

    // 检查更新后分屏是否为空
    if (newTabs.length === 0) {
      // 如果分屏没有标签页了，移除这个分屏
      splitPanes.value.splice(paneIndex, 1)

      // 重新调整剩余分屏的大小
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

const handleSwitchRightPaneMode = (mode: 'ai' | 'split') => {
  if (!showAiSidebar.value) {
    const container = document.querySelector('.splitpanes') as HTMLElement
    if (container) {
      const containerWidth = container.offsetWidth
      showAiSidebar.value = true
      aiSidebarSize.value = (DEFAULT_WIDTH_RIGHT_PX / containerWidth) * 100
      mainTerminalSize.value =
        100 - aiSidebarSize.value - (splitPanes.value.length > 0 ? splitPanes.value.reduce((acc, pane) => acc + pane.size, 0) : 0)
    }
  }
  rightPaneMode.value = mode
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
    } else {
      showAiSidebar.value = true
      aiSidebarSize.value = (DEFAULT_WIDTH_RIGHT_PX / containerWidth) * 100
      headerRef.value?.switchIcon('right', true)
      if (showSplitPane.value) {
        adjustSplitPaneToEqualWidth()
      } else {
        mainTerminalSize.value = 100 - aiSidebarSize.value
      }
    }
  }
}
const checkVersion = async () => {
  const api = window.api as any
  const info = await api.checkUpdate()
  if (info?.isUpdateAvailable)
    Notice.open({
      id: 'update-notice',
      type: 'info',
      duration: 300,
      description: t('update.available'),
      btns: [
        {
          text: t('update.update'),
          action: () => {
            Download()
            Notice.close('update-notice')
          }
        },
        { text: t('update.later'), class: 'notice-btn-withe', action: () => Notice.close('update-notice') }
      ]
    })

  const Download = () => {
    api.download()
    api.autoUpdate((params) => {
      if (params.status == 4) {
        Notice.open({
          id: 'update-download-complete',
          type: 'success',
          duration: 1800,
          description: t('update.complete'),
          btns: [
            {
              text: t('update.install'),
              action: () => {
                api.quitAndInstall()
                Notice.close('update-download-complete')
              }
            },
            { text: t('update.later'), class: 'notice-btn-withe', action: () => Notice.close('update-download-complete') }
          ]
        })
      }
    })
  }
}
const onMainSplitResize = (params) => {
  mainTerminalSize.value = params.prevPane.size
  if (showAiSidebar.value) {
    aiSidebarSize.value = params.panes[params.panes.length - 1].size
  }

  // 更新分屏大小
  if (splitPanes.value.length > 0) {
    const startIndex = 1 // 主终端是第一个
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
  if (isGlobalInput.value && type !== 'term') {
    isGlobalInput.value = false
  }
}

// 处理标签页移动到主窗口
const handleTabMovedToMainPane = (evt) => {
  const { tab, fromElement } = evt

  // 找到来源分屏的索引 - 使用更可靠的方法
  let fromPaneIndex = -1
  const rightSidebars = document.querySelectorAll('.rigth-sidebar')

  for (let i = 0; i < rightSidebars.length; i++) {
    if (rightSidebars[i].contains(fromElement)) {
      fromPaneIndex = i
      break
    }
  }

  if (fromPaneIndex !== -1) {
    // 从分屏移动到主窗口
    const fromPane = splitPanes.value[fromPaneIndex]
    if (fromPane) {
      // 如果移动的是当前活动的标签页，需要激活最后一个标签页
      if (fromPane.activeTabId === tab.id && fromPane.tabs.length > 0) {
        fromPane.activeTabId = fromPane.tabs[fromPane.tabs.length - 1].id
        // 通知事件总线更新终端大小
        nextTick(() => {
          eventBus.emit('resizeTerminal', fromPane.activeTabId)
        })
      }
      // 从源分屏移除标签页
      // const tabIndex = fromPane.tabs.findIndex((t) => t.id === tab.id)
      // if (tabIndex !== -1) {
      //   fromPane.tabs.splice(tabIndex, 1)

      //   // 检查移除标签页后分屏是否为空
      //   if (fromPane.tabs.length === 0) {
      //     // 如果分屏没有标签页了，移除这个分屏
      //     splitPanes.value.splice(fromPaneIndex, 1)

      //     // 重新调整剩余分屏的大小
      //     if (splitPanes.value.length === 0) {
      //       showSplitPane.value = false
      //       mainTerminalSize.value = 100 - (showAiSidebar.value ? aiSidebarSize.value : 0)
      //     } else {
      //       adjustSplitPaneToEqualWidth()
      //     }
      //   }
      // }
    }
  }
}

// 处理标签页移动到分屏
const handleTabMovedToSplitPane = (evt, toPaneIndex) => {
  const { tab, fromElement } = evt

  // 检查是否从主窗口移动
  const mainTabsElement = allTabs.value?.$el.querySelector('.tabs-bar')
  if (mainTabsElement && mainTabsElement.contains(fromElement)) {
    activeTabId.value = openedTabs.value[openedTabs.value.length - 1].id
    // 从主窗口移动到分屏
    // const tabIndex = openedTabs.value.findIndex((t) => t.id === tab.id)
    // if (tabIndex !== -1) {
    //   openedTabs.value.splice(tabIndex, 1)
    //   if (activeTabId.value === tab.id) {
    //     if (openedTabs.value.length > 0) {
    //       // 修改为激活最后一个标签页
    //       activeTabId.value = openedTabs.value[openedTabs.value.length - 1].id
    //       // 确保重新调整终端大小
    //       nextTick(() => {
    //         allTabs.value?.resizeTerm(activeTabId.value)
    //       })
    //     } else {
    //       activeTabId.value = ''
    //       eventBus.emit('activeTabChanged', null)
    //     }
    //   }
    // }
  } else {
    // 从其他分屏移动 - 使用更可靠的方法查找源分屏索引
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
        // 从源分屏移除标签页
        const tabIndex = fromPane.tabs.findIndex((t) => t.id === tab.id)
        if (tabIndex !== -1) {
          fromPane.tabs.splice(tabIndex, 1)

          // 检查移除标签页后分屏是否为空
          if (fromPane.tabs.length === 0) {
            // 如果分屏没有标签页了，移除这个分屏
            splitPanes.value.splice(fromPaneIndex, 1)

            // 重新调整剩余分屏的大小
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
    /* 滚动条宽度 */
  }

  /* 滚动条轨道样式 */

  ::-webkit-scrollbar-track {
    background-color: #202020;
    /* 轨道颜色 */
    border-radius: 5px;
    /* 轨道圆角 */
  }

  /* 滚动条滑块样式 */

  ::-webkit-scrollbar-thumb {
    background-color: #202020;
    /* 滑块颜色 */
    border-radius: 5px;
    /* 滑块圆角 */
  }

  /* 滑块hover样式 */

  ::-webkit-scrollbar-thumb:hover {
    background-color: #202020;
    /* hover时滑块颜色 */
  }

  .term_header {
    width: 100%;
    height: 28px;
  }

  .term_body {
    width: 100%;
    height: calc(100% - 34px);
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
        width: 190px;
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
}

.rigth-sidebar.collapsed {
  width: 0px;
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
.globalInput {
  position: absolute;
  bottom: 10px;
  left: 0;
  color: var(--text-color);
  width: 100%;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-left: 40px;
  .ant-input {
    background-color: transparent;
    color: var(--text-color);
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
  height: 32px;
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
  background-color: #202020;
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
</style>
