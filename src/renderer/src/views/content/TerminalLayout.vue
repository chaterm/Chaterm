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
              <splitpanes @resize="(params: ResizeParams) => (mainTerminalSize = params.prevPane.size)">
                <pane :size="mainTerminalSize">
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
                  />
                </pane>
                <!-- 分屏终端 - 在主终端旁边 -->
                <pane
                  v-if="showSplitPane"
                  :size="splitPaneSize"
                >
                  <div class="rigth-sidebar">
                    <TabsPanel
                      ref="rightTabsPanel"
                      :tabs="rightTabs"
                      :active-tab="rightActiveTabId"
                      :active-tab-id="rightActiveTabId"
                      @close-tab="closeRightTab"
                      @create-tab="createRightTab"
                      @change-tab="switchRightTab"
                      @update-tabs="updateRightTabs"
                      @close-all-tabs="closeAllRightTabs"
                    />
                  </div>
                </pane>
                <!-- AI侧边栏 - 在最右侧 -->
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
            <splitpanes @resize="(params: ResizeParams) => (mainTerminalSize = params.prevPane.size)">
              <pane :size="mainTerminalSize">
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
                />
              </pane>
              <!-- 分屏终端 - 在主终端旁边 -->
              <pane
                v-if="showSplitPane"
                :size="splitPaneSize"
              >
                <div class="rigth-sidebar">
                  <TabsPanel
                    ref="rightTabsPanel"
                    :tabs="rightTabs"
                    :active-tab="rightActiveTabId"
                    :active-tab-id="rightActiveTabId"
                    @close-tab="closeRightTab"
                    @create-tab="createRightTab"
                    @change-tab="switchRightTab"
                    @update-tabs="updateRightTabs"
                    @close-all-tabs="closeAllRightTabs"
                  />
                </div>
              </pane>
              <!-- AI侧边栏 - 在最右侧 -->
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
import { userConfigStore } from '@/services/userConfigStoreService'
import { ref, onMounted, nextTick, onUnmounted, watch } from 'vue'
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

const aliasConfig = aliasConfigStore()
const headerRef = ref<InstanceType<typeof Header> | null>(null)
const extensionsRef = ref<InstanceType<typeof Extensions> | null>(null)
const allTabs = ref<InstanceType<typeof TabsPanel> | null>(null)
const watermarkContent = reactive({
  content: [userInfoStore().userInfo.name, userInfoStore().userInfo.email],
  font: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.15)'
  },
  rotate: -22,
  gap: [150, 100] as [number, number]
})

const leftPaneSize = ref(30)
const mainTerminalSize = ref(100) // 主终端面板的大小
const showWatermark = ref(true)

// 右侧面板显示模式：''(隐藏), 'split'(分屏), 'ai'(AI侧边栏)
const rightPaneMode = ref('')

// 独立管理AI侧边栏和分屏的状态
const aiSidebarSize = ref(0) // AI侧边栏的宽度
const splitPaneSize = ref(0) // 分屏的宽度
const showAiSidebar = ref(false) // 是否显示AI侧边栏
const showSplitPane = ref(false) // 是否显示分屏

onMounted(async () => {
  eventBus.on('updateWatermark', (watermark) => {
    showWatermark.value = watermark !== 'close'
  })
  try {
    const config = await userConfigStore.getConfig()
    showWatermark.value = config.watermark !== 'close'
  } catch (e) {
    showWatermark.value = true
  }
  nextTick(() => {
    updatePaneSize()
    // 初始化Header图标状态
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
  // 监听分屏面板显示状态变化，自动调整为等宽
  eventBus.on('adjustSplitPaneToEqual', adjustSplitPaneToEqualWidth)
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
// 监听AI侧边栏状态变化，同步Header图标
watch(showAiSidebar, (newValue) => {
  if (headerRef.value) {
    headerRef.value.switchIcon('right', newValue)
  }
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
      // 只控制AI侧边栏，不影响分屏功能
      if (showAiSidebar.value) {
        showAiSidebar.value = false
        aiSidebarSize.value = 0
        // 更新Header图标状态
        headerRef.value?.switchIcon('right', false)
        // 如果分屏打开，调整为主终端和分屏等宽
        if (showSplitPane.value) {
          adjustSplitPaneToEqualWidth()
        } else {
          // 调整主终端面板大小
          mainTerminalSize.value = 100
        }
      } else {
        showAiSidebar.value = true
        aiSidebarSize.value = (DEFAULT_WIDTH_RIGHT_PX / containerWidth) * 100
        // 更新Header图标状态
        headerRef.value?.switchIcon('right', true)
        // 如果分屏打开，调整为主终端和分屏等宽
        if (showSplitPane.value) {
          adjustSplitPaneToEqualWidth()
        } else {
          // 调整主终端面板大小
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
      // 打开AI侧边栏
      showAiSidebar.value = true
      aiSidebarSize.value = (DEFAULT_WIDTH_RIGHT_PX / containerWidth) * 100
      mainTerminalSize.value = 100 - aiSidebarSize.value - (showSplitPane.value ? splitPaneSize.value : 0)
      headerRef.value?.switchIcon('right', true)
    }
  }
  const shrinkFn = (dir) => {
    if (dir == 'left') {
      leftPaneSize.value = 0
      headerRef.value?.switchIcon('left', false)
    } else {
      // 关闭AI侧边栏
      showAiSidebar.value = false
      aiSidebarSize.value = 0
      mainTerminalSize.value = 100 - (showSplitPane.value ? splitPaneSize.value : 0)
      headerRef.value?.switchIcon('right', false)
    }
  }
  if (params.menu == 'ai') {
    currentMenu.value = params.beforeActive
    if (!showAiSidebar.value) {
      // 打开AI侧边栏
      const container = document.querySelector('.splitpanes') as HTMLElement
      if (container) {
        const containerWidth = container.offsetWidth
        showAiSidebar.value = true
        aiSidebarSize.value = (DEFAULT_WIDTH_RIGHT_PX / containerWidth) * 100
        // 更新Header图标状态
        headerRef.value?.switchIcon('right', true)
        // 如果分屏打开，调整为主终端和分屏等宽
        if (showSplitPane.value) {
          adjustSplitPaneToEqualWidth()
        } else {
          // 调整主终端面板大小
          mainTerminalSize.value = 100 - aiSidebarSize.value
        }
      }
    } else {
      // 关闭AI侧边栏
      showAiSidebar.value = false
      aiSidebarSize.value = 0
      // 更新Header图标状态
      headerRef.value?.switchIcon('right', false)
      // 如果分屏打开，调整为主终端和分屏等宽
      if (showSplitPane.value) {
        adjustSplitPaneToEqualWidth()
      } else {
        // 调整主终端面板大小
        mainTerminalSize.value = 100
      }
    }
  } else if (params.menu == 'openAiRight') {
    currentMenu.value = params.beforeActive
    if (!showAiSidebar.value) {
      // 打开AI侧边栏
      const container = document.querySelector('.splitpanes') as HTMLElement
      if (container) {
        const containerWidth = container.offsetWidth
        showAiSidebar.value = true
        aiSidebarSize.value = (DEFAULT_WIDTH_RIGHT_PX / containerWidth) * 100
        // 更新Header图标状态
        headerRef.value?.switchIcon('right', true)
        // 如果分屏打开，调整为主终端和分屏等宽
        if (showSplitPane.value) {
          adjustSplitPaneToEqualWidth()
        } else {
          // 调整主终端面板大小
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
  type: string // 可选属性
  organizationId: string
  ip: string
  data: any // 改为 any 以容纳不同结构，或者使用联合类型
}

// 已打开的标签页
const openedTabs = ref<TabItem[]>([])
// 选中的tab
const activeTabId = ref('')

// 右侧分屏的标签页
const rightTabs = ref<TabItem[]>([])
// 右侧选中的tab
const rightActiveTabId = ref('')

// 点击服务器列表中的服务器
const currentClickServer = async (item) => {
  if (item.children) return

  const id_ = uuidv4()
  openedTabs.value.push({
    id: id_,
    // title: item.ip ? item.title : `${t('common.' + title)}`,
    title: item.title,
    // title: title,
    content: item.key,
    type: item.type ? item.type : 'term',
    organizationId: item.organizationId ? item.organizationId : '',
    ip: item.ip ? item.ip : '',
    data: item
  })
  // }
  // 激活点击的标签页
  activeTabId.value = id_
}

const closeTab = (tabId) => {
  const index = openedTabs.value.findIndex((tab) => tab.id === tabId)
  const closedTab = openedTabs.value[index]
  if (index !== -1) {
    openedTabs.value.splice(index, 1)
    if (activeTabId.value === tabId) {
      if (openedTabs.value.length > 0) {
        const newActiveIndex = Math.max(0, index - 1) // 确保索引不为负
        activeTabId.value = openedTabs.value[newActiveIndex].id
      } else {
        activeTabId.value = ''
        // 触发activeTabChanged事件，传递null表示没有活动标签页
        eventBus.emit('activeTabChanged', null)
      }
    }
    // 如果关闭的是扩展标签页，并且 extensionsRef 存在，则调用 handleExplorerActive
    if (closedTab.type === 'extensions' && extensionsRef.value && closedTab.data?.key) {
      extensionsRef.value.handleExplorerActive(closedTab.data.key)
    }
  }
}

const closeAllTabs = () => {
  // 清空所有标签页
  openedTabs.value = []
  activeTabId.value = ''
  // 触发activeTabChanged事件，传递null表示没有活动标签页
  eventBus.emit('activeTabChanged', null)
}

const createTab = (infos) => {
  const id_ = uuidv4()
  openedTabs.value.push({
    id: id_,
    // title: item.ip ? item.title : `${t('common.' + title)}`,
    title: infos.title,
    // title: title,
    content: infos.content,
    type: infos.type,
    organizationId: infos.organizationId,
    ip: infos.ip,
    data: infos.data
  })
  activeTabId.value = id_

  console.log(openedTabs.value, 'openedTabs.value')
}

// 调整分屏为等宽显示
const adjustSplitPaneToEqualWidth = () => {
  if (showSplitPane.value) {
    // 计算可用空间（排除AI侧边栏）
    const availableSpace = 100 - (showAiSidebar.value ? aiSidebarSize.value : 0)
    // 主终端和分屏终端各占50%
    mainTerminalSize.value = availableSpace / 2
    splitPaneSize.value = availableSpace / 2
  }
}

// 处理分屏创建新标签页
const handleCreateSplitTab = (tabInfo) => {
  // 创建新的标签页到右侧分屏
  const id_ = uuidv4()
  const newTab = {
    ...tabInfo,
    id: id_
  }
  rightTabs.value.push(newTab)
  rightActiveTabId.value = id_

  // 打开分屏面板，让分屏终端和主终端显示宽度一样
  showSplitPane.value = true
  adjustSplitPaneToEqualWidth()
}

// 切换标签页
const switchTab = (tabId) => {
  activeTabId.value = tabId
  allTabs.value?.resizeTerm(tabId)
}

// 更新标签页顺序 (由vuedraggable触发)
const updateTabs = (newTabs) => {
  openedTabs.value = newTabs
}
onUnmounted(() => {
  // 清理事件监听
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

// 新增函数：获取当前活动标签页的资产信息
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
    uuid: uuid, // May be undefined if not an asset-related tab, which is fine.
    title: activeTab.title,
    ip: activeTab.ip,
    organizationId: activeTab.organizationId,
    type: activeTab.type,
    outputContext: outputContext,
    tabSessionId: activeTabId.value
  }
}

// 处理eventBus的getActiveTabAssetInfo事件
const handleGetActiveTabAssetInfo = async () => {
  const assetInfo = await getActiveTabAssetInfo()
  eventBus.emit('assetInfoResult', assetInfo)
}

// 右侧tab相关事件
const closeRightTab = (tabId) => {
  const index = rightTabs.value.findIndex((tab) => tab.id === tabId)
  if (index !== -1) {
    rightTabs.value.splice(index, 1)
    if (rightActiveTabId.value === tabId) {
      if (rightTabs.value.length > 0) {
        const newActiveIndex = Math.max(0, index - 1)
        rightActiveTabId.value = rightTabs.value[newActiveIndex].id
      } else {
        rightActiveTabId.value = ''
      }
    }
    // 如果没有右侧tab了，关闭分屏面板
    if (rightTabs.value.length === 0) {
      showSplitPane.value = false
      splitPaneSize.value = 0
      // 调整主终端面板大小
      mainTerminalSize.value = 100 - (showAiSidebar.value ? aiSidebarSize.value : 0)
    }
  }
}
const createRightTab = (infos) => {
  const id_ = uuidv4()
  rightTabs.value.push({
    ...infos,
    id: id_
  })
  rightActiveTabId.value = id_
}
const switchRightTab = (tabId) => {
  rightActiveTabId.value = tabId
}
const updateRightTabs = (newTabs) => {
  rightTabs.value = newTabs
}
const closeAllRightTabs = () => {
  rightTabs.value = []
  rightActiveTabId.value = ''
  // 关闭分屏面板
  showSplitPane.value = false
  splitPaneSize.value = 0
  // 调整主终端面板大小
  mainTerminalSize.value = 100 - (showAiSidebar.value ? aiSidebarSize.value : 0)
}

// 处理切换右侧面板模式（AI/分屏）
const handleSwitchRightPaneMode = (mode: 'ai' | 'split') => {
  // 如果AI侧边栏未打开，先打开它
  if (!showAiSidebar.value) {
    const container = document.querySelector('.splitpanes') as HTMLElement
    if (container) {
      const containerWidth = container.offsetWidth
      showAiSidebar.value = true
      aiSidebarSize.value = (DEFAULT_WIDTH_RIGHT_PX / containerWidth) * 100
      mainTerminalSize.value = 100 - aiSidebarSize.value - (showSplitPane.value ? splitPaneSize.value : 0)
    }
  }

  // 切换到指定模式
  rightPaneMode.value = mode
}

// 独立控制AI侧边栏
const toggleAiSidebar = () => {
  const container = document.querySelector('.splitpanes') as HTMLElement
  if (container) {
    const containerWidth = container.offsetWidth
    if (showAiSidebar.value) {
      // 关闭AI侧边栏
      showAiSidebar.value = false
      aiSidebarSize.value = 0
      // 更新Header图标状态
      headerRef.value?.switchIcon('right', false)
      // 如果分屏打开，调整为主终端和分屏等宽
      if (showSplitPane.value) {
        adjustSplitPaneToEqualWidth()
      } else {
        // 调整主终端面板大小
        mainTerminalSize.value = 100
      }
    } else {
      // 打开AI侧边栏
      showAiSidebar.value = true
      aiSidebarSize.value = (DEFAULT_WIDTH_RIGHT_PX / containerWidth) * 100
      // 更新Header图标状态
      headerRef.value?.switchIcon('right', true)
      // 如果分屏打开，调整为主终端和分屏等宽
      if (showSplitPane.value) {
        adjustSplitPaneToEqualWidth()
      } else {
        // 调整主终端面板大小
        mainTerminalSize.value = 100 - aiSidebarSize.value
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
  background: #141414;
  color: #e0e0e0;
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
  background: #252525;
  // border-right: 1px solid #404040;
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
  left: -10px;
  right: -10px;
  height: 100%;
}

.splitpanes--horizontal > .splitpanes__splitter:before {
  left: -10px;
  right: -10px;
  height: 100%;
}
</style>
