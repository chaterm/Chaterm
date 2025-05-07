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
              />
              <div v-if="currentMenu == 'files'">{{ $t('common.files') }}</div>
              <Extensions
                v-if="currentMenu == 'extensions'"
                ref="extensionsRef"
                :toggle-sidebar="toggleSideBar"
                @open-user-tab="openUserTab"
              />
              <div v-if="currentMenu == 'monitor'">{{ $t('common.monitor') }}</div>
            </pane>
            <pane :size="100 - leftPaneSize">
              <splitpanes @resize="(params: ResizeParams) => (rightSize = params.nextPane.size)">
                <pane :size="100 - rightSize">
                  <TabsPanel
                    ref="allTabs"
                    :tabs="openedTabs"
                    :active-tab="activeTabId"
                    @close-tab="closeTab"
                    @change-tab="switchTab"
                    @update-tabs="updateTabs"
                  />
                </pane>
                <pane :size="rightSize">
                  <div class="rigth-sidebar">
                    <div class="rigth-bar">
                      <AiTab :toggle-sidebar="toggleSideBar" />
                    </div>
                  </div>
                </pane>
              </splitpanes>
            </pane>
          </splitpanes>
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

const rightSize = ref(0)
const leftPaneSize = ref(30)

onMounted(() => {
  nextTick(() => {
    updatePaneSize()
  })
  window.addEventListener('resize', updatePaneSize)
})
const timer = ref<number | null>(null)
watch(rightSize, () => {
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
      rightSize.value
        ? (rightSize.value = 0)
        : (rightSize.value = (DEFAULT_WIDTH_RIGHT_PX / containerWidth) * 100)
      break
    case 'left':
      {
        leftPaneSize.value
          ? (leftPaneSize.value = 0)
          : (leftPaneSize.value = (DEFAULT_WIDTH_PX / containerWidth) * 100)
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
      rightSize.value = (DEFAULT_WIDTH_RIGHT_PX / containerWidth) * 100
      headerRef.value?.switchIcon('right', true)
    }
  }
  const shrinkFn = (dir) => {
    if (dir == 'left') {
      leftPaneSize.value = 0
      headerRef.value?.switchIcon('left', false)
    } else {
      rightSize.value = 0
      headerRef.value?.switchIcon('right', false)
    }
  }
  if (params.menu == 'ai') {
    currentMenu.value = params.beforeActive
    rightSize.value == 0 ? expandFn('right') : shrinkFn('right')
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
}

// 已打开的标签页
const openedTabs = ref<TabItem[]>([])
// 选中的tab
const activeTabId = ref('')
// 点击服务器列表中的服务器
const currentClickServer = (item) => {
  console.log(item, 'item')
  // const existingTabIndex = openedTabs.value.findIndex((tab) => tab.id === item.title)
  if (item.children) return
  // if (existingTabIndex === -1) {
  const id_ = uuidv4()
  openedTabs.value.push({
    id: id_,
    // title: item.ip ? item.title : `${t('common.' + title)}`,
    title: item.title,
    // title: title,
    content: item.key,
    type: item.type ? item.type : 'term',
    organizationId: item.organizationId ? item.organizationId : '',
    ip: item.ip ? item.ip : ''
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
    // 如果关闭的是当前激活的标签页，则需要激活其他标签页
    if (activeTabId.value === tabId) {
      if (openedTabs.value.length > 0) {
        // 优先激活右侧标签页，如果没有则激活左侧标签页
        const newActiveIndex = index < openedTabs.value.length ? index : index - 1
        activeTabId.value = openedTabs.value[newActiveIndex].id
      } else {
        activeTabId.value = ''
      }
    }
    if (closedTab.type === 'extensions') {
      // 在数据更新后，通知插件页面更改active key
      extensionsRef.value?.handleExplorerActive(closedTab.content)
    }
  }
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
})
const openUserTab = function (value) {
  activeKey.value = value
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
</script>
<style lang="less">
.rigth-bar {
  padding: 2px;
}

.terminal-layout {
  height: 100vh;
  width: 100vw;
  display: flex;
  flex-direction: column;
  background: #1a1a1a;
  color: #e0e0e0;
  margin: 0;

  ::-webkit-scrollbar {
    width: 2px;
    /* 滚动条宽度 */
  }

  /* 滚动条轨道样式 */

  ::-webkit-scrollbar-track {
    background-color: #414141;
    /* 轨道颜色 */
    border-radius: 5px;
    /* 轨道圆角 */
  }

  /* 滚动条滑块样式 */

  ::-webkit-scrollbar-thumb {
    background-color: #414141;
    /* 滑块颜色 */
    border-radius: 5px;
    /* 滑块圆角 */
  }

  /* 滑块hover样式 */

  ::-webkit-scrollbar-thumb:hover {
    background-color: #414141;
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
      width: 50px;
      height: 100%;
      box-sizing: border-box;
    }

    .term_content {
      width: calc(100% - 50px);
      height: 100%;
      box-sizing: border-box;

      .termBoxs::-webkit-scrollbar {
        display: none;
      }

      .term_content_left {
        width: 190px;
      }

      .v-contextmenu-divider {
        width: 3px !important;
      }
    }
  }
}

.rigth-sidebar {
  width: 100%;
  background: #252525;
  // border-right: 1px solid #404040;
  transition: width 0.3s ease;
  position: relative;
}

.rigth-sidebar.collapsed {
  width: 0px;
}

.ant-input-group-wrapper {
  background-color: #414141 !important;

  .ant-input {
    background-color: #414141 !important;
    border: none;
    color: #fff !important;
  }

  .ant-input-group-addon {
    background-color: #414141 !important;
    border: none;
    color: #fff !important;

    button {
      background-color: #414141 !important;
      border: none;
      color: #fff !important;
    }
  }
}
</style>
<style lang="less">
.splitpanes__splitter {
  background-color: #414141;
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
