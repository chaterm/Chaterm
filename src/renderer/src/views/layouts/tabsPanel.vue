<template>
  <div class="tabs-panel">
    <template v-if="localTab && localTab.id !== ''">
      <draggable
        v-model="localTab"
        class="tabs-bar"
        :class="{ 'transparent-bg': isTransparent }"
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
              @click="emit('change-tab', tab.id)"
              >{{ tab.ip ? tab.title : $t(`common.${tab.title}`) }}</span
            >
            <button
              class="close-btn"
              @click.stop="emit('close-tab', tab.id)"
              >&times;</button
            >
          </div>
        </template>
      </draggable>
      <div
        class="tabs-content"
        :class="{ 'transparent-bg': isTransparent }"
      >
        <template v-if="localTab.organizationId !== ''">
          <sshConnect
            :key="`main-terminal-${localTab.id}`"
            :ref="(el) => setSshConnectRef(el, localTab.id)"
            :server-info="localTab"
            :connect-data="localTab.data"
            :active-tab-id="localTab.id"
            :current-connection-id="localTab.id"
            :is-active="isActive"
            @close-tab-in-term="closeTab"
            @create-new-term="createNewTerm"
          />
        </template>
        <template v-else>
          <UserInfo v-if="localTab.content === 'userInfo'" />
          <UserConfig v-if="localTab.content === 'userConfig'" />
          <Files v-if="localTab.content === 'files'" />
          <AliasConfig v-if="localTab.content === 'aliasConfig'" />
          <AssetConfig v-if="localTab.content === 'assetConfig'" />
          <KeyChainConfig v-if="localTab.content === 'keyChainConfig'" />
          <McpConfigEditor v-if="localTab.content === 'mcpConfigEditor'" />
          <SecurityConfigEditor v-if="localTab.content === 'securityConfigEditor'" />
          <PluginDetail
            v-if="localTab.content.startsWith('plugins:') && localTab.props"
            :plugin-info="localTab as TabItem & { props: { pluginId: string; fromLocal?: boolean } }"
            @uninstall-plugin="uninstallPlugin"
          />
        </template>
      </div>
    </template>
  </div>
</template>
<script setup lang="ts">
import { computed, ref, ComponentPublicInstance, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { userConfigStore } from '@/store/userConfigStore'
import 'splitpanes/dist/splitpanes.css'
import UserInfo from '@views/components/LeftTab/config/userInfo.vue'
import UserConfig from '@views/components/LeftTab/config/userConfig.vue'
import AssetConfig from '@views/components/LeftTab/config/assetConfig.vue'
import AliasConfig from '@views/components/Extensions/aliasConfig.vue'
import KeyChainConfig from '@views/components/LeftTab/config/keyChainConfig.vue'
import SshConnect from '@views/components/Ssh/sshConnect.vue'
import Files from '@views/components/Files/index.vue'
import McpConfigEditor from '@views/components/McpConfigEditor/index.vue'
import SecurityConfigEditor from '@views/components/SecurityConfigEditor/index.vue'
import PluginDetail from '@views/components/Extensions/pluginDetail.vue'
import type { IDockviewPanelProps } from 'dockview-vue'
import { isFocusInAiTab } from '@/utils/domUtils'

interface TabItem {
  id: string
  title: string
  content: string
  type?: string
  organizationId?: string
  ip?: string
  data?: any
  props?: {
    pluginId: string
    fromLocal?: boolean
  }
  closeCurrentPanel?: (panelId?: string) => void
  createNewPanel?: (isClone: boolean, direction: string, panelId?: string) => void
}

const props = defineProps<{
  params: IDockviewPanelProps
}>()

const emit = defineEmits<{
  'change-tab': [tabId: string]
  'close-tab': [tabId: string]
}>()

const localTab = computed(() => props.params.params as TabItem)
const configStore = userConfigStore()
const isTransparent = computed(() => !!configStore.getUserConfig.background.image)

const closeTab = (value) => {
  if (localTab.value?.closeCurrentPanel) {
    localTab.value.closeCurrentPanel('panel_' + value)
  }
}

const uninstallPlugin = (value) => {
  if (localTab.value?.closeCurrentPanel) {
    localTab.value.closeCurrentPanel('panel_' + value)
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
      focus: () => void
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

const isFocusInTerminal = (event: KeyboardEvent): boolean => {
  const target = event.target as HTMLElement
  const activeElement = document.activeElement as HTMLElement
  const terminalContainer = target.closest('.terminal-container') || activeElement?.closest('.terminal-container')
  const xtermElement = target.closest('.xterm') || activeElement?.closest('.xterm')

  return !!(terminalContainer || xtermElement)
}

const handleCloseTabKeyDown = (event: KeyboardEvent) => {
  if (!isActive.value) {
    return
  }

  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0
  const isCloseShortcut = (isMac && event.metaKey && event.key === 'w') || (!isMac && event.ctrlKey && event.shiftKey && event.key === 'W')

  if (!isCloseShortcut) {
    return
  }

  if (isFocusInAiTab(event)) {
    return
  }

  if (isFocusInTerminal(event) && localTab.value?.organizationId !== '') {
    return
  }

  const CLOSE_DEBOUNCE_TIME = 100
  const currentTime = Date.now()
  if (currentTime - ((window as any).lastCloseTime || 0) < CLOSE_DEBOUNCE_TIME) {
    event.preventDefault()
    event.stopPropagation()
    return
  }

  ;(window as any).lastCloseTime = currentTime
  event.preventDefault()
  event.stopPropagation()

  if (localTab.value?.closeCurrentPanel) {
    localTab.value.closeCurrentPanel('panel_' + localTab.value.id)
  }
}

watch(
  () => [isActive.value, localTab.value?.id],
  ([newIsActive, tabId]) => {
    if (newIsActive && localTab.value?.organizationId !== '' && tabId && typeof tabId === 'string') {
      nextTick(() => {
        nextTick(() => {
          const sshConnectInstance = sshConnectRefMap.value[tabId]
          if (sshConnectInstance && typeof sshConnectInstance.focus === 'function') {
            setTimeout(() => {
              sshConnectInstance.focus()
            }, 50)
          }
        })
      })
    }
  },
  { immediate: false }
)

onMounted(() => {
  isActive.value = !!props.params?.api?.isActive
  props.params?.api?.onDidActiveChange?.((event) => {
    isActive.value = event.isActive
  })

  window.addEventListener('keydown', handleCloseTabKeyDown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleCloseTabKeyDown)
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
  scrollbar-width: thin;
  scrollbar-color: var(--border-color-light) transparent;

  &.transparent-bg {
    background-color: transparent !important;
    border-bottom-color: rgba(255, 255, 255, 0.1);

    .tab-item {
      background-color: rgba(0, 0, 0, 0.2);
      color: rgba(255, 255, 255, 0.8);
      border-right-color: rgba(255, 255, 255, 0.1);

      &.active {
        background-color: rgba(255, 255, 255, 0.15);
        color: #fff;
        border-top-color: #007acc;
      }

      .tab-title {
        color: inherit;
      }

      .close-btn {
        color: rgba(255, 255, 255, 0.6);
        &:hover {
          color: #fff;
          background-color: rgba(255, 255, 255, 0.2);
        }
      }
    }
  }
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

  &.transparent-bg {
    background-color: transparent !important;
  }
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
