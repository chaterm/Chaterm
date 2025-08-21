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
            <span
              class="tab-title"
              @click="$emit('change-tab', tab.id)"
              >{{ tab.ip ? tab.title : $t(`common.${tab.title}`) }}</span
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
      </div>

      <div class="tabs-content">
        <div
          v-for="tab in tabs"
          :id="`${tab.id}-box`"
          :key="tab.id"
          :class="{ 'tab-content': true, active: tab.id === activeTab }"
        >
          <sshConnect
            v-if="tab.organizationId !== ''"
            :ref="(el) => setSshConnectRef(el, tab.id)"
            :server-info="tab"
            :connect-data="tab.data"
            :active-tab-id="activeTabId"
            :current-connection-id="tab.id"
            @close-tab-in-term="closeTab"
            @create-new-term="createNewTerm"
          />
          <UserInfo v-if="tab.content === 'userInfo'" />
          <userConfig v-if="tab.content === 'userConfig'" />
          <Files v-if="tab.content === 'files'" />
          <aliasConfig v-if="tab.content === 'aliasConfig'" />
          <assetConfig v-if="tab.content === 'assetConfig'" />
          <keyChainConfig v-if="tab.content === 'keyChainConfig'" />
        </div>
      </div>
    </template>
    <template v-else>
      <Dashboard />
    </template>
  </div>
</template>
<script setup lang="ts">
import { computed, ref, defineExpose, ComponentPublicInstance, PropType, watch, nextTick, onMounted, onUnmounted } from 'vue'
import draggable from 'vuedraggable'
import Dashboard from '@views/components/Term/dashboard.vue'
import UserInfo from '@views/components/LeftTab/userInfo.vue'
import userConfig from '@views/components/LeftTab/userConfig.vue'
import assetConfig from '@views/components/LeftTab/assetConfig.vue'
import aliasConfig from '@views/components/Extensions/aliasConfig.vue'
import keyChainConfig from '@views/components/LeftTab/keyChainConfig.vue'
import sshConnect from '@views/components/Ssh/sshConnect.vue'
import Files from '@views/components/Files/index.vue'
import eventBus from '@/utils/eventBus'

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
const emit = defineEmits(['close-tab', 'change-tab', 'update-tabs', 'create-tab', 'close-all-tabs', 'tab-moved-from-other-pane'])
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

const handleKeyDown = (event: KeyboardEvent) => {
  if ((event.metaKey || event.ctrlKey) && event.key === 'w') {
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
  height: 26px;
}

.tabs-bar::-webkit-scrollbar {
  height: 3px;
  background: transparent;
}

.tabs-bar::-webkit-scrollbar-thumb {
  background: var(--border-color);
  border-radius: 2px;
}

.tabs-bar::-webkit-scrollbar-thumb:hover {
  background: var(--border-color-light);
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
</style>
