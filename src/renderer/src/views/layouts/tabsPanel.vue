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
        <template v-if="localTab.organizationId && localTab.organizationId !== ''">
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
          <KnowledgeCenterEditor
            v-if="localTab.content === 'KnowledgeCenterEditor' && localTab.props"
            :rel-path="localTab.props.relPath || ''"
            :mode="localTab.mode"
          />
          <Kubernetes v-if="localTab.content === 'kubernetes'" />
          <AliasConfig v-if="localTab.content === 'aliasConfig'" />
          <jumpserverSupport v-if="localTab.content === 'jumpserverSupport'" />
          <AssetConfig v-if="localTab.content === 'assetConfig'" />
          <KeyManagement v-if="localTab.content === 'keyManagement'" />
          <McpConfigEditor v-if="localTab.content === 'mcpConfigEditor'" />
          <CommonConfigEditor
            v-if="localTab.content === 'CommonConfigEditor' && localTab.props"
            :file-path="localTab.props.filePath || ''"
            :plugin-id="localTab.props.pluginId || ''"
            :initial-content="localTab.props.initialContent || ''"
          />
          <SecurityConfigEditor v-if="localTab.content === 'securityConfigEditor'" />
          <KeywordHighlightEditor v-if="localTab.content === 'keywordHighlightEditor'" />
          <!-- prettier-ignore -->
          <PluginDetail
            v-if="localTab.content.startsWith('plugins:') && localTab.props"
            :plugin-info="(localTab as any)"
            @uninstall-plugin="uninstallPlugin"
          />
        </template>
      </div>
    </template>
  </div>
</template>
<script setup lang="ts">
import { computed, ref, ComponentPublicInstance, onMounted, watch, nextTick } from 'vue'
import { userConfigStore } from '@/store/userConfigStore'
import 'splitpanes/dist/splitpanes.css'
import UserInfo from '@views/components/LeftTab/config/userInfo.vue'
import UserConfig from '@views/components/LeftTab/config/userConfig.vue'
import AssetConfig from '@views/components/LeftTab/config/assetConfig.vue'
import AliasConfig from '@views/components/Extensions/aliasConfig.vue'
import jumpserverSupport from '@views/components/Extensions/jumpserverSupport.vue'
import KeyManagement from '@views/components/LeftTab/config/keyManagement.vue'
import SshConnect from '@views/components/Ssh/sshConnect.vue'
import Files from '@views/components/Files/index.vue'
import KnowledgeCenterEditor from '@views/components/Editors/KnowledgeCenterEditor.vue'
import Kubernetes from '@views/components/Kubernetes/index.vue'
import McpConfigEditor from '@views/components/Editors/McpConfigEditor.vue'
import CommonConfigEditor from '@views/components/Editors/CommonConfigEditor.vue'
import SecurityConfigEditor from '@views/components/Editors/SecurityConfigEditor.vue'
import KeywordHighlightEditor from '@views/components/Editors/KeywordHighlightEditor.vue'
import PluginDetail from '@views/components/Extensions/pluginDetail.vue'
import type { IDockviewPanelProps } from 'dockview-vue'

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
    filePath?: string
    initialContent?: string
    relPath?: string
  }
  mode?: 'editor' | 'preview'
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
    border-bottom-color: var(--border-color);

    .tab-item {
      background-color: var(--bg-color-secondary);
      color: var(--text-color);
      border-right-color: var(--border-color);

      &.active {
        background-color: var(--bg-color-tertiary);
        color: var(--text-color);
        border-top-color: #007acc;
      }

      .tab-title {
        color: inherit;
      }

      .close-btn {
        color: var(--text-color-tertiary);
        &:hover {
          color: var(--text-color);
          background-color: var(--hover-bg-color);
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
  border-radius: 8px;
  padding: 4px;
  z-index: 1000;
  box-shadow:
    0 4px 20px rgba(0, 0, 0, 0.15),
    0 2px 8px rgba(0, 0, 0, 0.1);
  min-width: 180px;
  font-size: 13px;
  backdrop-filter: blur(10px);
}

.context-menu-item {
  padding: 6px 12px;
  margin: 1px 0;
  cursor: pointer;
  color: var(--text-color);
  border-radius: 6px;
  font-weight: 500;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  user-select: none;
}

.context-menu-item:hover {
  background-color: var(--hover-bg-color);
  transform: translateX(2px);
}

.context-menu-item:active {
  background-color: var(--active-bg-color);
  transform: translateX(2px) scale(0.98);
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
