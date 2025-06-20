<template>
  <div class="tabs-panel">
    <template v-if="tabs && tabs.length">
      <draggable
        v-model="localTabs"
        class="tabs-bar"
        :animation="150"
        handle=".tab-title"
        item-key="id"
        @end="onDragEnd"
      >
        <template #item="{ element: tab }">
          <div :class="{ 'tab-item': true, active: tab.id === activeTab }">
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
      <div class="tabs-content">
        <div
          :id="`${tab.id}-box`"
          v-for="tab in tabs"
          :key="tab.id"
          :class="{ 'tab-content': true, active: tab.id === activeTab }"
        >
          <Term
            v-if="tab.type === 'term' && tab.organizationId !== 'personal'"
            :ref="(el) => setTermRef(el, tab.id)"
            :server-info="tab"
            @close-tab-in-term="closeTab"
            @create-new-term="createNewTerm"
          />
          <SshConnect
            v-if="tab.content === 'demo' || tab.organizationId === 'personal'"
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
import { computed, ref, defineExpose, ComponentPublicInstance, PropType, watch, nextTick } from 'vue'
import draggable from 'vuedraggable'
import Term from '@views/components/Term/index.vue'
import Dashboard from '@views/components/Term/dashboard.vue'
import UserInfo from '@views/components/LeftTab/userInfo.vue'
import userConfig from '@views/components/LeftTab/userConfig.vue'
import assetConfig from '@views/components/LeftTab/assetConfig.vue'
import aliasConfig from '@views/components/Extensions/aliasConfig.vue'
import keyChainConfig from '@views/components/LeftTab/keyChainConfig.vue'
import SshConnect from '@views/components/sshConnect/sshConnect.vue'
import Files from '@views/components/Files/index.vue'
import eventBus from '@/utils/eventBus'

// Define an interface for the tab items
interface TabItem {
  id: string
  title: string
  content: string // Corresponds to v-if conditions like 'demo', 'userInfo', etc.
  type?: string // e.g., 'term'
  organizationId?: string // e.g., 'personal'
  ip?: string
  data?: any // Data passed to SshConnect or Term
  // Add other properties if they exist on tab objects
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
const emit = defineEmits(['close-tab', 'change-tab', 'update-tabs', 'create-tab'])
const localTabs = computed({
  get: () => props.tabs,
  set: (value) => {
    emit('update-tabs', value)
  }
})

// 监听标签页变化
watch(
  () => props.activeTab,
  (newTabId) => {
    if (newTabId) {
      const activeTab = props.tabs.find((tab) => tab.id === newTabId)
      if (activeTab) {
        // 使用 eventBus 发送事件
        eventBus.emit('activeTabChanged', activeTab)
        // 自动聚焦到终端
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
  console.log(id, 'iddd')
  emit('close-tab', id)
}
const onDragEnd = () => {}
const termRefMap = ref<Record<string, any>>({})
const sshConnectRefMap = ref<Record<string, any>>({})

const setTermRef = (el: Element | ComponentPublicInstance | null, tabId: string) => {
  if (el && '$props' in el) {
    // Check if el is a ComponentPublicInstance
    termRefMap.value[tabId] = el as ComponentPublicInstance & {
      handleResize: () => void
      autoExecuteCode: (cmd: string) => void
      getTerminalBufferContent?: () => string | null
    }
  } else {
    delete termRefMap.value[tabId]
  }
}

const setSshConnectRef = (el: Element | ComponentPublicInstance | null, tabId: string) => {
  if (el && '$props' in el) {
    // Check if el is a ComponentPublicInstance
    sshConnectRefMap.value[tabId] = el as ComponentPublicInstance & {
      getTerminalBufferContent: () => string | null
    }
  } else {
    delete sshConnectRefMap.value[tabId]
  }
}

const resizeTerm = (termid: string = '') => {
  // Added type for termid
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
      console.error(`Error getting terminal output from SshConnect for tab ${tabId}:`, error)
      return 'Error retrieving output from SshConnect component.'
    }
  } else {
    const termInstance = termRefMap.value[tabId]
    if (termInstance && typeof termInstance.getTerminalBufferContent === 'function') {
      try {
        const output = await termInstance.getTerminalBufferContent()
        return output
      } catch (error: any) {
        console.error(`Error getting terminal output from Term for tab ${tabId}:`, error)
        return 'Error retrieving output from Term component.'
      }
    }
    console.warn(`Component instance not found or method getTerminalBufferContent missing for tabId: ${tabId}`)
    return `Instance for tab ${tabId} not found or method missing.`
  }
}

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
  background-color: #141414;
  border-bottom: 1px solid #202020;
  overflow-x: auto;
  user-select: none;
  height: 26px;
}

.tabs-bar::-webkit-scrollbar {
  height: 3px;
  background: transparent;
}

.tabs-bar::-webkit-scrollbar-thumb {
  background: #333;
  border-radius: 2px;
}

.tabs-bar::-webkit-scrollbar-thumb:hover {
  background: #555;
}

.tab-item {
  display: flex;
  align-items: center;
  padding: 0 4px;
  border-right: 1px solid #202020;
  background-color: #141414;
  width: 120px;
}

.tab-item.active {
  background-color: #202020;
  border-top: 2px solid #007acc;
}

.tab-title {
  flex: 1;
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: pointer;
}

.close-btn {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 12px;
  margin-left: 8px;
  padding: 0 4px;
  color: #666;
}

.close-btn:hover {
  background-color: rgba(0, 0, 0, 0.1);
  border-radius: 4px;
}

.tabs-content {
  flex: 1;
  overflow: auto;
  background-color: #141414;
  padding: 4px;
}

.tab-content {
  display: none;
  height: 100%;
}

.tab-content.active {
  display: block;
}

/* 拖拽时的样式 */
.sortable-chosen {
  opacity: 0.8;
  background-color: #e0e0e0 !important;
}

.sortable-ghost {
  opacity: 0.4;
  background-color: #ccc !important;
}
</style>
