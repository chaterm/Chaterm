<template>
  <div class="tabs-panel">
    <template v-if="tabs && tabs.length">
      <draggable
        v-model="localTabs"
        class="tabs-bar"
        :animation="150"
        handle=".tab-title"
        item-key="id"
        :group="{ name: 'tabs', pull: true, put: true }"
        @end="onDragEnd"
        @add="onDragAdd"
      >
        <template #item="{ element: tab }">
          <div
            :class="{ 'tab-item': true, active: tab.id === activeTab }"
            @contextmenu.prevent="showContextMenu($event, tab)"
          >
            <input
              v-if="editingTabId === tab.id"
              ref="renameInputRef"
              v-model="editingTabTitle"
              class="tab-title-input"
              @blur="finishRename(tab.id)"
              @keydown.enter="finishRename(tab.id)"
              @keydown.esc="cancelRename"
              @click.stop
            />
            <span
              v-else
              class="tab-title"
              @click="$emit('change-tab', tab.id)"
              >{{ tab.ip ? tab.title : tab.title === 'mcpConfigEditor' ? $t('mcp.configEditor') : $t(`common.${tab.title}`, tab.title) }}</span
            >
            <button
              class="close-btn"
              @click.stop="$emit('close-tab', tab.id)"
              >&times;</button
            >
          </div>
        </template>
      </draggable>

      <!-- 右键菜单 -->
      <div
        v-if="contextMenu.visible"
        class="context-menu"
        :style="{ left: contextMenu.x + 'px', top: contextMenu.y + 'px' }"
        @click.stop
      >
        <div
          class="context-menu-item"
          @click="closeCurrentTab"
        >
          <span>{{ $t('common.close') }}</span>
        </div>
        <div
          class="context-menu-item"
          @click="closeOtherTabs"
        >
          <span>{{ $t('common.closeOther') }}</span>
        </div>
        <div
          class="context-menu-item"
          @click="closeAllTabs"
        >
          <span>{{ $t('common.closeAll') }}</span>
        </div>
        <div
          class="context-menu-item"
          @click="renameTab"
        >
          <span>{{ $t('common.rename') }}</span>
        </div>
        <div
          class="context-menu-item"
          @click="cloneTab"
        >
          <span>{{ $t('common.clone') }}</span>
        </div>
        <div
          class="context-menu-item"
          @click="splitRight"
        >
          <span>{{ $t('common.splitRight') }}</span>
        </div>
        <div
          class="context-menu-item"
          @click="splitDown"
        >
          <span>{{ $t('common.splitDown') }}</span>
        </div>
        <div
          class="context-menu-item"
          @click="splitRightInner"
        >
          <span>{{ $t('common.splitRightInner') }}</span>
        </div>
        <div
          class="context-menu-item"
          @click="splitDownInner"
        >
          <span>{{ $t('common.splitDownInner') }}</span>
        </div>
      </div>

      <div class="tabs-content">
        <div
          v-for="tab in tabs"
          :id="`${tab.id}-box`"
          :key="tab.id"
          :class="{ 'tab-content': true, active: tab.id === activeTab }"
        >
          <!-- Terminal tabs with inner split support -->
          <template v-if="tab.organizationId !== ''">
            <!-- Always use splitpanes structure to keep component instance stable -->
            <!-- This ensures the original terminal component is never destroyed -->
            <splitpanes
              :horizontal="getInnerSplitState(tab.id)?.direction === 'vertical' || false"
              @resize="(params) => handleInnerSplitResize(tab.id, params)"
            >
              <!-- Original terminal pane - always present, never destroyed -->
              <pane :size="getInnerSplitState(tab.id)?.mainSize || 100">
                <div class="inner-split-pane">
                  <sshConnect
                    :key="`main-terminal-${tab.id}`"
                    :ref="(el) => setSshConnectRef(el, tab.id)"
                    :server-info="tab"
                    :connect-data="tab.data"
                    :active-tab-id="activeTabId"
                    :current-connection-id="tab.id"
                    @close-tab-in-term="closeTab"
                    @create-new-term="createNewTerm"
                  />
                </div>
              </pane>
              <!-- Inner split panes - only shown when inner split exists -->
              <template v-if="getInnerSplitState(tab.id) && getInnerSplitState(tab.id)!.panes.length > 0">
                <pane
                  v-for="(innerPane, innerIndex) in getInnerSplitState(tab.id)!.panes"
                  :key="`inner-pane-${innerPane.id}`"
                  :size="innerPane.size"
                >
                  <div class="inner-split-pane">
                    <!-- Close button for inner split pane -->
                    <button
                      class="inner-split-close-btn"
                      :title="$t('common.close')"
                      @click.stop="closeInnerSplitPane(tab.id, innerIndex)"
                    >
                      &times;
                    </button>
                    <sshConnect
                      :key="`inner-terminal-${innerPane.id}`"
                      :ref="(el) => setSshConnectRef(el, innerPane.id)"
                      :server-info="innerPane.tab"
                      :connect-data="innerPane.tab.data"
                      :active-tab-id="activeTabId"
                      :current-connection-id="innerPane.id"
                      @close-tab-in-term="closeInnerSplitPane(tab.id, innerIndex)"
                      @create-new-term="createNewTerm"
                    />
                  </div>
                </pane>
              </template>
            </splitpanes>
          </template>
          <!-- Non-terminal tabs -->
          <template v-else>
            <UserInfo v-if="tab.content === 'userInfo'" />
            <userConfig v-if="tab.content === 'userConfig'" />
            <Files v-if="tab.content === 'files'" />
            <aliasConfig v-if="tab.content === 'aliasConfig'" />
            <assetConfig v-if="tab.content === 'assetConfig'" />
            <keyChainConfig v-if="tab.content === 'keyChainConfig'" />
            <McpConfigEditor v-if="tab.content === 'mcpConfigEditor'" />
            <SecurityConfigEditor v-if="tab.content === 'securityConfigEditor'" />
          </template>
        </div>
      </div>
    </template>
    <template v-else>
      <Dashboard />
    </template>
  </div>
</template>
<script setup lang="ts">
import { computed, ref, ComponentPublicInstance, PropType, watch, nextTick, onMounted, onUnmounted } from 'vue'
import draggable from 'vuedraggable'
import { Splitpanes, Pane } from 'splitpanes'
import 'splitpanes/dist/splitpanes.css'
import Dashboard from '@views/components/Term/dashboard.vue'
import UserInfo from '@views/components/LeftTab/userInfo.vue'
import userConfig from '@views/components/LeftTab/userConfig.vue'
import assetConfig from '@views/components/LeftTab/assetConfig.vue'
import aliasConfig from '@views/components/Extensions/aliasConfig.vue'
import keyChainConfig from '@views/components/LeftTab/keyChainConfig.vue'
import sshConnect from '@views/components/Ssh/sshConnect.vue'
import Files from '@views/components/Files/index.vue'
import McpConfigEditor from '@views/components/McpConfigEditor/index.vue'
import SecurityConfigEditor from '@views/components/SecurityConfigEditor/index.vue'
import eventBus from '@/utils/eventBus'
import { v4 as uuidv4 } from 'uuid'
import { isFocusInAiTab } from '@/utils/domUtils'

interface TabItem {
  id: string
  title: string
  content: string
  type?: string
  organizationId?: string
  ip?: string
  data?: any
}

const props = defineProps({
  tabs: {
    type: Array as PropType<TabItem[]>,
    required: true
  },
  activeTab: {
    type: String as PropType<string>,
    default: ''
  },
  activeTabId: {
    type: String as PropType<string>,
    default: ''
  }
})
const emit = defineEmits(['close-tab', 'change-tab', 'update-tabs', 'create-tab', 'close-all-tabs', 'tab-moved-from-other-pane', 'rename-tab'])
const localTabs = computed({
  get: () => props.tabs,
  set: (value) => {
    emit('update-tabs', value)
  }
})

watch(
  () => props.activeTab,
  (newTabId) => {
    if (newTabId) {
      const activeTab = props.tabs.find((tab) => tab.id === newTabId)
      if (activeTab) {
        eventBus.emit('activeTabChanged', activeTab)
        nextTick(() => {
          const termInstance = termRefMap.value[newTabId]
          const sshInstance = sshConnectRefMap.value[newTabId]
          if (termInstance) {
            termInstance.focus()
          } else if (sshInstance) {
            sshInstance.focus()
          }
        })
      }
    }
  }
)

const createNewTerm = (infos) => {
  emit('create-tab', infos)
}
const closeTab = (id) => {
  // Clean up inner split state when closing tab
  if (innerSplitStates.value[id]) {
    delete innerSplitStates.value[id]
  }
  emit('close-tab', id)
}

const onDragEnd = (evt) => {
  if (evt.from === evt.to) {
    emit('update-tabs', localTabs.value)
    const draggedTab = localTabs.value[evt.newIndex]
    if (draggedTab) {
      emit('change-tab', draggedTab.id)
    }
  }
}

const onDragAdd = (evt) => {
  const movedTab = evt.item.__draggable_context.element
  emit('tab-moved-from-other-pane', {
    tab: movedTab,
    fromElement: evt.from,
    toElement: evt.to
  })
  if (movedTab) {
    emit('change-tab', movedTab.id)
  }
}

const termRefMap = ref<Record<string, any>>({})
const sshConnectRefMap = ref<Record<string, any>>({})

// Inner split state management
interface InnerSplitPane {
  id: string
  tab: TabItem
  size: number
}

interface InnerSplitState {
  direction: 'horizontal' | 'vertical'
  mainSize: number
  panes: InnerSplitPane[]
}

const innerSplitStates = ref<Record<string, InnerSplitState>>({})

const setSshConnectRef = (el: Element | ComponentPublicInstance | null, tabId: string) => {
  if (el && '$props' in el) {
    sshConnectRefMap.value[tabId] = el as ComponentPublicInstance & {
      getTerminalBufferContent: () => string | null
    }
  } else {
    delete sshConnectRefMap.value[tabId]
  }
}

const resizeTerm = (termid: string = '') => {
  if (termid) {
    setTimeout(() => {
      if (termRefMap.value[termid]) {
        termRefMap.value[termid].handleResize()
      }
    })
  } else {
    const keys = Object.keys(termRefMap.value)
    if (keys.length == 0) return
    for (let i = 0; i < keys.length; i++) {
      termRefMap.value[keys[i]].handleResize()
    }
  }
}

async function getTerminalOutputContent(tabId: string): Promise<string | null> {
  const sshConnectInstance = sshConnectRefMap.value[tabId]
  if (sshConnectInstance && typeof sshConnectInstance.getTerminalBufferContent === 'function') {
    try {
      const output = await sshConnectInstance.getTerminalBufferContent()
      return output
    } catch (error: any) {
      return 'Error retrieving output from sshConnect component.'
    }
  } else {
    const termInstance = termRefMap.value[tabId]
    if (termInstance && typeof termInstance.getTerminalBufferContent === 'function') {
      try {
        const output = await termInstance.getTerminalBufferContent()
        return output
      } catch (error: any) {
        return 'Error retrieving output from Term component.'
      }
    }
    return `Instance for tab ${tabId} not found or method missing.`
  }
}

const contextMenu = ref({
  visible: false,
  x: 0,
  y: 0,
  targetTab: null as TabItem | null
})

const showContextMenu = (event: MouseEvent, tab: TabItem) => {
  event.preventDefault()
  const menuWidth = 120
  const menuHeight = 200
  const screenWidth = window.innerWidth
  const screenHeight = window.innerHeight

  let x = event.clientX
  let y = event.clientY
  if (x + menuWidth > screenWidth) {
    x = screenWidth - menuWidth - 10
  }
  if (y + menuHeight > screenHeight) {
    y = screenHeight - menuHeight - 10
  }

  contextMenu.value.visible = true
  contextMenu.value.x = x
  contextMenu.value.y = y
  contextMenu.value.targetTab = tab

  setTimeout(() => {
    document.addEventListener('click', hideContextMenu, { once: true })
  }, 0)
}

const hideContextMenu = () => {
  contextMenu.value.visible = false
}

const closeCurrentTab = () => {
  if (contextMenu.value.targetTab) {
    closeTab(contextMenu.value.targetTab.id)
  }
  hideContextMenu()
}

const closeOtherTabs = () => {
  if (!contextMenu.value.targetTab) return
  const tabsToClose = props.tabs.filter((tab) => tab.id !== contextMenu.value.targetTab?.id)
  tabsToClose.forEach((tab) => {
    emit('close-tab', tab.id)
  })
  hideContextMenu()
}

const closeAllTabs = () => {
  emit('close-all-tabs')
  hideContextMenu()
}

const splitRight = () => {
  const currentTab = contextMenu.value.targetTab
  if (!currentTab) {
    hideContextMenu()
    return
  }

  const newTabInfo = {
    title: `${currentTab.title}`,
    content: currentTab.content,
    type: currentTab.type,
    organizationId: currentTab.organizationId,
    ip: currentTab.ip,
    data: currentTab.data
  }

  eventBus.emit('createSplitTab', newTabInfo)
  hideContextMenu()
}

const splitDown = () => {
  const currentTab = contextMenu.value.targetTab
  if (!currentTab) {
    hideContextMenu()
    return
  }

  const newTabInfo = {
    title: `${currentTab.title}`,
    content: currentTab.content,
    type: currentTab.type,
    organizationId: currentTab.organizationId,
    ip: currentTab.ip,
    data: currentTab.data
  }

  eventBus.emit('createVerticalSplitTab', newTabInfo)
  hideContextMenu()
}

// Inner split functions
const getInnerSplitState = (tabId: string): InnerSplitState | null => {
  return innerSplitStates.value[tabId] || null
}

const splitRightInner = () => {
  const currentTab = contextMenu.value.targetTab
  if (!currentTab || !currentTab.organizationId) {
    hideContextMenu()
    return
  }

  const tabId = currentTab.id
  const newPaneId = uuidv4()
  const newTabInfo = {
    ...currentTab,
    id: newPaneId
  }

  if (!innerSplitStates.value[tabId]) {
    innerSplitStates.value[tabId] = {
      direction: 'horizontal',
      mainSize: 50,
      panes: []
    }
  }

  const state = innerSplitStates.value[tabId]
  state.direction = 'horizontal'
  state.panes.push({
    id: newPaneId,
    tab: newTabInfo,
    size: 50
  })

  // Adjust sizes
  const paneCount = state.panes.length + 1
  const equalSize = 100 / paneCount
  state.mainSize = equalSize
  state.panes.forEach((pane) => {
    pane.size = equalSize
  })

  // Trigger resize after creating inner split
  nextTick(() => {
    if (sshConnectRefMap.value[tabId]) {
      const instance = sshConnectRefMap.value[tabId]
      if (instance && typeof instance.resize === 'function') {
        instance.resize()
      }
    }
  })

  hideContextMenu()
}

const splitDownInner = () => {
  const currentTab = contextMenu.value.targetTab
  if (!currentTab || !currentTab.organizationId) {
    hideContextMenu()
    return
  }

  const tabId = currentTab.id
  const newPaneId = uuidv4()
  const newTabInfo = {
    ...currentTab,
    id: newPaneId
  }

  if (!innerSplitStates.value[tabId]) {
    innerSplitStates.value[tabId] = {
      direction: 'vertical',
      mainSize: 50,
      panes: []
    }
  }

  const state = innerSplitStates.value[tabId]
  state.direction = 'vertical'
  state.panes.push({
    id: newPaneId,
    tab: newTabInfo,
    size: 50
  })

  // Adjust sizes
  const paneCount = state.panes.length + 1
  const equalSize = 100 / paneCount
  state.mainSize = equalSize
  state.panes.forEach((pane) => {
    pane.size = equalSize
  })

  // Trigger resize after creating inner split
  nextTick(() => {
    if (sshConnectRefMap.value[tabId]) {
      const instance = sshConnectRefMap.value[tabId]
      if (instance && typeof instance.resize === 'function') {
        instance.resize()
      }
    }
  })

  hideContextMenu()
}

const closeInnerSplitPane = (tabId: string, paneIndex: number) => {
  const state = innerSplitStates.value[tabId]
  if (!state) return

  // Clean up the sshConnect ref for the closed pane
  const closedPane = state.panes[paneIndex]
  if (closedPane && sshConnectRefMap.value[closedPane.id]) {
    delete sshConnectRefMap.value[closedPane.id]
  }

  state.panes.splice(paneIndex, 1)

  if (state.panes.length === 0) {
    delete innerSplitStates.value[tabId]
  } else {
    // Adjust sizes after closing
    const paneCount = state.panes.length + 1
    const equalSize = 100 / paneCount
    state.mainSize = equalSize
    state.panes.forEach((pane) => {
      pane.size = equalSize
    })
  }

  // Trigger resize for remaining terminals
  nextTick(() => {
    if (sshConnectRefMap.value[tabId]) {
      const mainInstance = sshConnectRefMap.value[tabId]
      if (mainInstance && typeof mainInstance.resize === 'function') {
        mainInstance.resize()
      }
    }
    state.panes.forEach((pane) => {
      if (sshConnectRefMap.value[pane.id]) {
        const instance = sshConnectRefMap.value[pane.id]
        if (instance && typeof instance.resize === 'function') {
          instance.resize()
        }
      }
    })
  })
}

interface ResizeParams {
  prevPane: { size: number }
  panes: { size: number }[]
}

const handleInnerSplitResize = (tabId: string, params: ResizeParams) => {
  const state = innerSplitStates.value[tabId]
  if (!state) return

  state.mainSize = params.prevPane.size
  if (state.panes.length > 0) {
    const startIndex = 1
    const endIndex = params.panes.length - 1
    for (let i = startIndex; i <= endIndex; i++) {
      if (state.panes[i - 1]) {
        state.panes[i - 1].size = params.panes[i].size
      }
    }
  }
}

const cloneTab = () => {
  const currentTab = contextMenu.value.targetTab
  if (!currentTab) {
    hideContextMenu()
    return
  }

  const newTabInfo = {
    title: `${currentTab.title}`,
    content: currentTab.content,
    type: currentTab.type,
    organizationId: currentTab.organizationId,
    ip: currentTab.ip,
    data: currentTab.data
  }

  emit('create-tab', newTabInfo)
  hideContextMenu()
}

const editingTabId = ref<string | null>(null)
const editingTabTitle = ref<string>('')
const renameInputRef = ref<HTMLInputElement | null>(null)

const renameTab = () => {
  const currentTab = contextMenu.value.targetTab
  if (!currentTab) {
    hideContextMenu()
    return
  }

  editingTabId.value = currentTab.id
  editingTabTitle.value = currentTab.title
  hideContextMenu()

  nextTick(() => {
    const input = renameInputRef.value
    if (input) {
      input.focus()
      input.select()
    }
  })
}

const finishRename = (tabId: string) => {
  if (editingTabId.value === tabId && editingTabTitle.value.trim()) {
    emit('rename-tab', {
      id: tabId,
      title: editingTabTitle.value.trim()
    })
  }
  editingTabId.value = null
  editingTabTitle.value = ''
}

const cancelRename = () => {
  editingTabId.value = null
  editingTabTitle.value = ''
}

const handleKeyDown = (event: KeyboardEvent) => {
  // 只在非Windows系统上处理 ctrl+w，Windows系统由preload脚本处理
  const isWindows = navigator.platform.toLowerCase().includes('win')
  if (!isWindows && (event.metaKey || event.ctrlKey) && event.key === 'w') {
    // 检查焦点是否在终端 Tab 区域，避免与 AITab 的快捷键冲突
    if (isFocusInAiTab(event)) {
      return
    }

    if (!props.tabs || props.tabs.length === 0) {
      return
    }
    event.preventDefault()
    if (props.activeTab) {
      closeTab(props.activeTab)
    }
  }
}

// Focus the active terminal
const focusActiveTerminal = () => {
  const termInstance = termRefMap.value[props.activeTab]
  const sshInstance = sshConnectRefMap.value[props.activeTab]
  if (termInstance) {
    termInstance.focus()
  } else if (sshInstance) {
    sshInstance.focus()
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeyDown)
  eventBus.on('focusActiveTerminal', focusActiveTerminal)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown)
  eventBus.off('focusActiveTerminal', focusActiveTerminal)
})

defineExpose({
  resizeTerm,
  getTerminalOutputContent
})
</script>

<style scoped>
.tabs-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.tabs-bar {
  display: flex;
  background-color: var(--bg-color);
  border-bottom: 1px solid var(--border-color);
  overflow-x: auto;
  user-select: none;
  height: 36px;
  scrollbar-width: thin;
  scrollbar-color: var(--border-color-light) transparent;
}

.tabs-bar::-webkit-scrollbar {
  height: 3px;
}

.tabs-bar::-webkit-scrollbar-track {
  background: transparent;
}

.tabs-bar::-webkit-scrollbar-thumb {
  background-color: var(--border-color-light);
  border-radius: 3px;
}

.tabs-bar::-webkit-scrollbar-thumb:hover {
  background-color: var(--text-color-tertiary);
}

.tab-item {
  display: flex;
  align-items: center;
  padding: 0 4px;
  border-right: 1px solid var(--border-color);
  background-color: var(--bg-color);
  width: 120px;
  color: var(--text-color);
}

.tab-item.active {
  background-color: var(--bg-color-secondary);
  border-top: 2px solid #007acc;
}

.tab-title {
  flex: 1;
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: pointer;
  color: var(--text-color);
}

.close-btn {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 12px;
  margin-left: 8px;
  padding: 0 4px;
  color: var(--text-color-tertiary);
}

.close-btn:hover {
  background-color: var(--hover-bg-color);
  border-radius: 4px;
  color: var(--text-color);
}

.tabs-content {
  flex: 1;
  overflow: auto;
  background-color: var(--bg-color);
}

.tab-content {
  display: none;
  height: 100%;
}

.tab-content.active {
  display: block;
}

.inner-split-pane {
  width: 100%;
  height: 100%;
  overflow: hidden;
  position: relative;
}

.inner-split-close-btn {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 10;
  background: var(--bg-color);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  cursor: pointer;
  font-size: 18px;
  line-height: 1;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-color-tertiary);
  transition: all 0.2s ease;
  padding: 0;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.inner-split-close-btn:hover {
  background: var(--hover-bg-color);
  color: var(--text-color);
  border-color: var(--border-color);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}

.inner-split-close-btn:active {
  transform: scale(0.95);
}

.sortable-chosen {
  opacity: 0.8;
  background-color: var(--hover-bg-color) !important;
}

.sortable-ghost {
  opacity: 0.4;
  background-color: var(--bg-color-secondary) !important;
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
  font-size: 12px;
  border: 1px solid #007acc;
  border-radius: 2px;
  padding: 2px 4px;
  background-color: var(--bg-color);
  color: var(--text-color);
  outline: none;
  min-width: 0;
}

.tab-title-input:focus {
  border-color: #007acc;
  box-shadow: 0 0 0 1px #007acc;
}
</style>
