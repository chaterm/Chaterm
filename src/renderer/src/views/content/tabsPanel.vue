<template>
  <div class="tabs-panel">
    <template v-if="localTab && localTab.id !== ''">
      <draggable
        v-model="localTab"
        class="tabs-bar"
        :animation="150"
        handle=".tab-title"
        item-key="id"
        :group="{ name: 'tabs', pull: true, put: true }"
      >
        <template #item="{ element: tab }">
          <div
            :class="{ 'tab-item': true, active: isActive }"
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
      <div class="tabs-content">
        <!-- Terminal tabs with inner split support -->
        <template v-if="localTab.organizationId !== ''">
          <!-- Always use splitpanes structure to keep component instance stable -->
          <!-- This ensures the original terminal component is never destroyed -->
          <sshConnect
            :key="`main-terminal-${localTab.id}`"
            :ref="(el) => setSshConnectRef(el, localTab.id)"
            :server-info="localTab"
            :connect-data="localTab.data"
            :active-tab-id="localTab.id"
            :current-connection-id="localTab.id"
            @close-tab-in-term="closeTab"
            @create-new-term="createNewTerm"
          />
        </template>
        <!-- Non-terminal tabs -->
        <template v-else>
          <UserInfo v-if="localTab.content === 'userInfo'" />
          <userConfig v-if="localTab.content === 'userConfig'" />
          <Files v-if="localTab.content === 'files'" />
          <aliasConfig v-if="localTab.content === 'aliasConfig'" />
          <assetConfig v-if="localTab.content === 'assetConfig'" />
          <keyChainConfig v-if="localTab.content === 'keyChainConfig'" />
          <McpConfigEditor v-if="localTab.content === 'mcpConfigEditor'" />
          <SecurityConfigEditor v-if="localTab.content === 'securityConfigEditor'" />
        </template>
      </div>
    </template>
  </div>
</template>
<script setup lang="ts">
import { computed, ref, ComponentPublicInstance, onMounted, onUnmounted } from 'vue'
import 'splitpanes/dist/splitpanes.css'
import UserInfo from '@views/components/LeftTab/userInfo.vue'
import userConfig from '@views/components/LeftTab/userConfig.vue'
import assetConfig from '@views/components/LeftTab/assetConfig.vue'
import aliasConfig from '@views/components/Extensions/aliasConfig.vue'
import keyChainConfig from '@views/components/LeftTab/keyChainConfig.vue'
import sshConnect from '@views/components/Ssh/sshConnect.vue'
import Files from '@views/components/Files/index.vue'
import McpConfigEditor from '@views/components/McpConfigEditor/index.vue'
import SecurityConfigEditor from '@views/components/SecurityConfigEditor/index.vue'
import type { IDockviewPanelProps } from 'dockview-vue'

interface TabItem {
  id: string
  title: string
  content: string
  type?: string
  organizationId?: string
  ip?: string
  data?: any
}

const props = defineProps<{
  params: IDockviewPanelProps
}>()

const localTab = computed(() => props.params.params as TabItem)

const closeTab = () => {
  if (localTab.value?.closeCurrentPanel) {
    localTab.value.closeCurrentPanel()
  }
}

const createNewTerm = () => {
  if (localTab.value?.createNewPanel) {
    localTab.value.createNewPanel(true, 'within')
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

const isActive = ref(!!props.params?.api?.isActive)

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

onMounted(() => {
  isActive.value = !!props.params?.api?.isActive
  props.params?.api?.onDidActiveChange?.((event) => {
    isActive.value = event.isActive
  })
})

onUnmounted(() => {})

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
