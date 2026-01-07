<template>
  <div class="term_host_list">
    <div class="term_host_header">
      <span class="vs-title">{{ viewTitle }}</span>
    </div>

    <div
      v-if="!showWelcome"
      style="width: 100%; margin-top: 4px"
    >
      <div class="manage">
        <a-input
          ref="searchInputRef"
          v-model:value="searchValue"
          class="transparent-Input"
          allow-clear
        >
          <template #suffix>
            <search-outlined />
          </template>
        </a-input>
        <a-tooltip
          v-for="menu in toolbarMenus"
          :key="menu.command"
          :title="menu.title"
        >
          <a-button
            type="text"
            class="vs-toolbar-btn"
            @click="handleAction(menu.command)"
          >
            <template #icon><component :is="getIconComponent(menu.icon)" /></template>
          </a-button>
        </a-tooltip>
      </div>
    </div>

    <div class="vs-content">
      <div
        v-if="showWelcome"
        class="vs-welcome-box"
      >
        <div
          class="vs-welcome-text"
          v-html="renderMarkdown(activeWelcomes[0]?.contents)"
        ></div>
      </div>
      <a-tree
        v-if="filteredTreeData.length > 0"
        :tree-data="filteredTreeData"
        :load-data="onLoadData"
        block-node
        class="dark-tree"
        :expanded-keys="expandedKeys"
        :slots="{ icon: 'icon' }"
        @expand="onExpand"
      >
        <template #title="{ title, dataRef }">
          <div
            class="vs-node-row"
            @click="handleNodeRowClick(dataRef)"
          >
            <component
              :is="iconMap[dataRef.icon]"
              v-if="dataRef.isLeaf && dataRef.icon"
              class="vs-node-icon"
            />
            <div class="vs-node-label">
              <span
                class="vs-node-text"
                :class="{ 'vs-match': searchValue && title.toLowerCase().includes(searchValue.toLowerCase()) }"
              >
                {{ title }}
              </span>
            </div>
            <div
              v-if="getItemMenus(dataRef).length > 0"
              class="vs-node-actions"
            >
              <template
                v-for="m in getItemMenus(dataRef)"
                :key="m.command"
              >
                <a-tooltip :title="m.title">
                  <a-button
                    type="text"
                    size="small"
                    class="vs-node-inner-btn"
                    @click.stop="handleAction(m.command, dataRef)"
                  >
                    <template #icon><component :is="getIconComponent(m.icon)" /></template>
                  </a-button>
                </a-tooltip>
              </template>
            </div>
          </div>
        </template>
      </a-tree>
      <a-empty
        v-else
        :description="searchValue ? 'Not Found' : 'No Data'"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
const api = (window as any).api
import eventBus from '@/utils/eventBus'
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
const props = defineProps<{
  viewId: string
}>()
const loading = ref(false)
const treeData = ref([])
const contexts = ref({})
const searchValue = ref('')
const expandedKeys = ref<string[]>([])
interface ViewMetadata {
  name?: string
  menus?: {
    'view/item/context'?: Array<{
      command: string
      title: string
      when?: string
      icon?: string
    }>
  }
  welcomes?: Array<{
    when?: string
    contents?: string
    [key: string]: any
  }>
}
const viewMetadata = ref<ViewMetadata | null>(null)
import {
  PlusOutlined,
  ReloadOutlined,
  SettingOutlined,
  DatabaseOutlined,
  CloudServerOutlined,
  SearchOutlined,
  DesktopOutlined,
  QuestionOutlined
} from '@ant-design/icons-vue'

const iconMap = {
  PlusOutlined: PlusOutlined,
  ReloadOutlined: ReloadOutlined,
  SettingOutlined: SettingOutlined,
  DatabaseOutlined: DatabaseOutlined,
  CloudServerOutlined: CloudServerOutlined,
  SearchOutlined: SearchOutlined,
  DesktopOutlined: DesktopOutlined,
  QuestionOutlined: QuestionOutlined
}

const getIconComponent = (name) => {
  if (!name) return QuestionOutlined
  return typeof name === 'string' ? iconMap[name] || QuestionOutlined : name
}

const filteredTreeData = computed(() => {
  if (!searchValue.value) return treeData.value
  const s = searchValue.value.toLowerCase()

  const filterNodes = (nodes) => {
    return nodes.reduce((acc, node) => {
      const isMatch = node.title.toLowerCase().includes(s)
      if (node.children && node.children.length > 0) {
        const childMatches = filterNodes(node.children)
        if (childMatches.length > 0 || isMatch) {
          acc.push({ ...node, children: childMatches })
        }
      } else if (isMatch) {
        acc.push(node)
      }
      return acc
    }, [])
  }
  return filterNodes(treeData.value)
})

const viewTitle = computed(() => viewMetadata.value?.name || props.viewId.toUpperCase())
const toolbarMenus = computed(() => viewMetadata.value?.menus?.['view/title'] || [])
const getItemMenus = (node) => {
  const allMenus = viewMetadata.value?.menus?.['view/item/context'] || []

  return allMenus.filter((m) => {
    if (!m.when) return true

    // Check whether it belongs to the current view
    if (m.when.includes('view ==') && !m.when.includes(`view == ${props.viewId}`)) {
      return false
    }

    // Check whether it matches the contextValue of the current node
    if (m.when.includes('viewItem ==')) {
      return m.when.includes(`viewItem == ${node.contextValue}`)
    }

    return false
  })
}
const activeWelcomes = computed(() =>
  (viewMetadata.value?.welcomes || []).filter((w) => {
    if (!w.when) return true
    const [k, v] = w.when.split('==').map((s) => s.trim())
    return String(contexts.value[k]) === v
  })
)

const showWelcome = computed(() => treeData.value.length === 0 && activeWelcomes.value.length > 0)

const handleNodeClick = (node) => {
  if (node.command) {
    handleAction(node.command, node)
  }
}
const handleNodeRowClick = (dataRef: any) => {
  if (dataRef.isLeaf) {
    handleNodeClick(dataRef)
  } else {
    const index = expandedKeys.value.indexOf(dataRef.key)
    if (index > -1) {
      expandedKeys.value.splice(index, 1)
    } else {
      expandedKeys.value.push(dataRef.key)
    }
  }
}
const handleAction = async (cmd, data = null) => {
  try {
    const cleanData = data !== null ? JSON.parse(JSON.stringify(data)) : null
    await api.executeCommand(cmd, cleanData)
  } catch (err) {}
}

const openPluginConfigTab = (params: any) => {
  const tabArg = {
    id: `editor_${params.pluginId}`,
    title: params.title || 'Config',
    content: 'CommonConfigEditor',
    type: 'config',
    props: {
      filePath: params.filePath,
      pluginId: params.pluginId,
      initialContent: params.content,
      language: 'json'
    }
  }
  eventBus.emit('open-user-tab', tabArg)
}
const refresh = async () => {
  loading.value = true
  try {
    const roots = await api.getTreeNodes({ viewId: props.viewId })

    treeData.value = roots.map((node) => ({
      ...node,
      isLeaf: false,
      children: undefined
    }))

    await nextTick()

    const restoreExpansion = async (nodes: any[]) => {
      const promises: Promise<void>[] = []
      for (const node of nodes) {
        if (expandedKeys.value.includes(node.key)) {
          // Load child nodes
          const promise = onLoadData({ dataRef: node }).then(async () => {
            if (node.children && node.children.length > 0) {
              // Recursively load child nodes(like Account -> Endpoint -> Instance)
              await restoreExpansion(node.children)
            }
          })
          promises.push(promise)
        }
      }
      await Promise.all(promises)
    }

    await restoreExpansion(treeData.value)
  } finally {
    loading.value = false
  }
}

const onLoadData = async (treeNode: any) => {
  const { dataRef } = treeNode

  if (dataRef.children && dataRef.children.length > 0) {
    return
  }

  try {
    const children = await api.getTreeNodes({
      viewId: props.viewId,
      element: JSON.parse(JSON.stringify(dataRef))
    })

    dataRef.children = children.map((c) => ({
      ...c,
      title: c.title,
      key: c.key,
      isLeaf: c.isLeaf,
      children: c.isLeaf ? undefined : []
    }))

    treeData.value = [...treeData.value]
  } catch (err) {
    console.error('Failed to load tree data:', err)
  }
}

const onExpand = (keys) => {
  expandedKeys.value = keys
}

const renderMarkdown = (t) => t?.replace(/\[(.*?)\]\(command:(.*?)\)/g, '<a href="javascript:void(0)" class="vs-link" data-cmd="$2">$1</a>')

const handleGlobalClick = (e) => {
  const link = e.target.closest('.vs-link')
  if (link) handleAction(link.dataset.cmd)
}

const refreshMetadata = async () => {
  viewMetadata.value = await api.getViewMetadata(props.viewId)
}
const disposables = ref<(() => void)[]>([])

onMounted(async () => {
  await refreshMetadata()
  contexts.value = await api.getAllContexts()
  // Listen to context updates
  if (api.onContextUpdate) {
    const unbind = api.onContextUpdate(({ key, value }) => {
      contexts.value[key] = value
    })
    disposables.value.push(unbind)
  }

  // Monitor and open the editor
  if (api.onOpenEditorRequest) {
    const unbind = api.onOpenEditorRequest((params) => {
      openPluginConfigTab(params)
    })
    disposables.value.push(unbind)
  }

  // Monitor tab opening
  if (api.onOpenUserTabRequest) {
    const unbind = api.onOpenUserTabRequest((params) => {
      eventBus.emit('currentClickServer', params)
    })
    disposables.value.push(unbind)
  }

  api.onRefreshView(props.viewId, refresh)
  window.addEventListener('click', handleGlobalClick)
  refresh()
})

onUnmounted(() => {
  window.removeEventListener('click', handleGlobalClick)
  disposables.value.forEach((unsubscribe) => {
    if (typeof unsubscribe === 'function') unsubscribe()
  })
})
</script>

<style lang="less" scoped>
.term_host_list {
  width: 100%;
  height: 100%;
  padding: 4px;
  flex-direction: column;
  justify-content: space-between;
  flex-wrap: wrap;
  background-color: var(--bg-color);
  color: var(--text-color);
  overflow: hidden;

  .term_host_header {
    width: 100%;
    height: auto;
    padding: 11px 16px 0px 6px;
    flex-shrink: 0;
    overflow: hidden;
    .vs-title {
      font-size: 14px;
      font-weight: 600;
      color: var(--ant-text-color);
    }
  }

  .manage {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px;

    .transparent-Input {
      background-color: var(--bg-color-secondary) !important;
      border: 1px solid var(--border-color) !important;

      :deep(.ant-input) {
        background-color: var(--bg-color-secondary) !important;
        color: var(--text-color) !important;
        &::placeholder {
          color: var(--text-color-tertiary) !important;
        }
      }

      :deep(.ant-input-suffix) {
        color: var(--text-color-tertiary) !important;
      }
    }

    .workspace-button {
      background-color: var(--bg-color-secondary) !important;
      border: 1px solid var(--border-color) !important;
      color: var(--text-color) !important;

      &:hover {
        color: #1890ff !important;
        border-color: #1890ff !important;
      }
    }
  }
}
.vs-view-container {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #f3f3f3;
  color: #616161;
}
.vs-header {
  padding: 8px 12px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.vs-title {
  font-size: 11px;
  font-weight: bold;
  text-transform: uppercase;
}
.tree-container {
  margin-top: 8px;
  overflow-y: auto;
  overflow-x: hidden;
  border-radius: 2px;
  background-color: transparent;
  max-height: calc(100vh - 120px);
  height: auto;

  /* Scrollbar styles */
  &::-webkit-scrollbar {
    width: 6px;
  }

  &::-webkit-scrollbar-track {
    background: transparent;
  }

  &::-webkit-scrollbar-thumb {
    background-color: var(--border-color-light);
    border-radius: 3px;
  }

  &::-webkit-scrollbar-thumb:hover {
    background-color: var(--text-color-tertiary);
  }

  /* Firefox scrollbar styles */
  scrollbar-width: thin;
  scrollbar-color: var(--border-color-light) transparent;
}

:deep(.dark-tree) {
  background-color: transparent;
  height: auto !important;
  .ant-tree-node-content-wrapper,
  .ant-tree-title,
  .ant-tree-switcher,
  .ant-tree-node-selected {
    color: var(--text-color) !important;
  }

  .ant-tree-node-content-wrapper {
    width: 100%;
  }

  .ant-tree-switcher {
    color: var(--text-color-tertiary) !important;
  }

  .ant-tree-node-selected {
    background-color: transparent;
  }

  // Enhanced selection state for right-clicked hosts
  .ant-tree-node-selected .title-with-icon {
    border: 1px solid #1890ff !important;
    // border-radius: 4px !important;
    // box-shadow: 0 0 0 2px rgba(24, 144, 255, 0.2) !important;
  }

  .ant-tree-treenode {
    width: 100%;
    &:hover {
      background-color: var(--hover-bg-color);
    }
  }

  .ant-tree-indent {
    display: none !important;
  }
}

.custom-tree-node {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  position: relative;
  padding-right: 4px;
  min-width: 0;
  overflow: hidden;

  .title-with-icon {
    display: flex;
    align-items: center;
    color: var(--text-color);
    flex: 1;
    min-width: 0;
    overflow: hidden;
    cursor: pointer;
    border-radius: 4px;
    padding: 2px 4px;
    transition: all 0.2s ease;
    border: 1px solid transparent;

    &:hover {
      background-color: transparent;
    }

    // Selection state for right-clicked hosts
    &.selected {
      // border: 1px solid #1890ff !important;
      // box-shadow: 0 0 0 2px rgba(24, 144, 255, 0.2) !important;
      color: #1890ff !important;
    }

    .computer-icon {
      margin-right: 6px;
      font-size: 14px;
      color: var(--text-color);
      flex-shrink: 0;
    }

    // Host name text style - Display in one line, ellipsis displayed when exceeding the limit
    .hostname-text {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      word-break: break-all;
    }
  }

  .action-buttons {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
  }

  .edit-icon {
    display: none;
    cursor: pointer;
    color: var(--text-color-tertiary);
    font-size: 14px;
    &:hover {
      color: #1890ff;
    }
  }

  .refresh-icon {
    margin-right: 3px;
  }

  .refresh-button {
    background-color: var(--bg-color) !important;
    border-color: var(--bg-color) !important;
    color: var(--text-color-tertiary) !important;
    transition: all 0.2s ease !important;

    &:hover {
      background-color: #1890ff !important;
      border-color: #1890ff !important;
      color: #ffffff !important;
    }

    &:focus {
      background-color: #1890ff !important;
      border-color: #1890ff !important;
      color: #ffffff !important;
    }

    &:active {
      background-color: #096dd9 !important;
      border-color: #096dd9 !important;
      color: #ffffff !important;
    }
  }

  .comment-text {
    color: var(--text-color-tertiary);
    font-size: 12px;
    opacity: 0.8;
    max-width: 120px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .comment-edit-container {
    display: flex;
    align-items: center;
    flex-grow: 1;
    width: 100%;
    margin-left: 6px;
    max-width: 200px;

    .ant-input {
      background-color: var(--bg-color-secondary);
      border-color: var(--border-color);
      color: var(--text-color);
      flex: 1;
      min-width: 60px;
      max-width: 120px;
      height: 24px;
      padding: 0 4px;
      font-size: 12px;

      &::placeholder {
        color: var(--text-color-tertiary) !important;
      }
    }

    .confirm-icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      margin-left: 2px;
      cursor: pointer;
      color: #52c41a;
      min-width: 14px;
      height: 24px;
      flex-shrink: 0;
      &:hover {
        color: #73d13d;
      }
    }

    .cancel-icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      margin-left: 2px;
      cursor: pointer;
      color: #ff4d4f;
      min-width: 14px;
      height: 24px;
      flex-shrink: 0;
      &:hover {
        color: #ff7875;
      }
    }
  }
}

.child-count {
  color: var(--text-color-tertiary);
  font-size: 12px;
  margin-left: 4px;
  opacity: 0.8;
}

.edit-container {
  display: flex;
  align-items: center;
  flex-grow: 1;
  width: 100%;

  .ant-input {
    background-color: var(--bg-color-secondary);
    border-color: var(--border-color);
    color: var(--text-color);
    flex: 1;
    min-width: 50px;
    height: 24px;
    padding: 0 4px;

    &::placeholder {
      color: var(--text-color-tertiary) !important;
    }
  }

  .confirm-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    margin-left: 10px;
    cursor: pointer;
    color: #1890ff;
    min-width: 10px;
    height: 24px;
    flex-shrink: 0;
    &:hover {
      color: #40a9ff;
    }
  }
}
.workspace-button {
  font-size: 14px;
  height: 30px;
  display: flex;
  align-items: center;
  background-color: rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 255, 255, 0.08);

  &:hover {
    background-color: rgb(110, 114, 135);
    border-color: rgb(110, 114, 135);
  }

  &:active {
    background-color: rgb(130, 134, 155);
    border-color: rgb(130, 134, 155);
  }
}

/* Enhanced dropdown menu styles for better theme adaptation */
.ant-dropdown-menu {
  width: 160px !important;
}

:deep(.ant-form-item-label > label) {
  color: var(--text-color) !important;
}
.top-icon {
  &:hover {
    color: #52c41a;
    transition: color 0.3s;
  }
}
:deep(.ant-card) {
  background-color: var(--bg-color-secondary);
  border: 1px solid var(--border-color);
}

:global(.ant-select-dropdown) {
  background-color: var(--bg-color-secondary) !important;
  border-color: var(--border-color) !important;
}
:global(.ant-select-dropdown .ant-select-item) {
  color: var(--text-color-secondary) !important;
}
:global(.ant-select-item-option-selected:not(.ant-select-item-option-disabled)) {
  background-color: var(--hover-bg-color) !important;
  color: var(--text-color) !important;
}
:global(.ant-select-item-option-active:not(.ant-select-item-option-disabled)) {
  background-color: var(--hover-bg-color) !important;
}
.manage {
  display: flex;
  gap: 10px;
  :deep(.ant-input-affix-wrapper) {
    background-color: transparent;
    border-color: var(--border-color);
    box-shadow: none;
  }
}
.transparent-Input {
  background-color: transparent;
  color: var(--text-color);

  :deep(.ant-input) {
    background-color: transparent;
    color: var(--text-color);
    &::placeholder {
      color: var(--text-color-tertiary);
    }
  }
}

:deep(.css-dev-only-do-not-override-1p3hq3p.ant-btn-primary.ant-btn-background-ghost) {
  border-color: transparent !important;
}

/* Override Ant Design primary button styles for workspace buttons */
:deep(.workspace-button.ant-btn-primary) {
  background-color: rgba(255, 255, 255, 0.08) !important;
  border-color: rgba(255, 255, 255, 0.08) !important;
  color: var(--text-color) !important;
  box-shadow: none !important;
}

/* Workspace tabs container */
.workspace-tabs-container {
  width: 100%;
  margin-bottom: 12px;
}

/* Workspace tabs styling */
.workspace-tabs {
  width: 100%;

  :deep(.ant-tabs-nav) {
    margin-bottom: 0;
    background-color: transparent;
    width: 100%;
  }

  :deep(.ant-tabs-nav-wrap) {
    width: 100%;
  }

  :deep(.ant-tabs-nav-list) {
    width: 100%;
    display: flex;
    justify-content: space-between;
  }

  :deep(.ant-tabs-tab) {
    flex: 1;
    background-color: var(--bg-color);
    border: none;
    border-radius: 6px;
    margin: 0 2px;
    padding: 6px 16px;
    color: var(--text-color-secondary);
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    text-align: center;
    font-size: 13px;
    font-weight: 400;
    position: relative;
    overflow: hidden;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;

    &:hover {
      color: var(--text-color);
      background-color: var(--hover-bg-color);
    }

    &:active {
      transform: translateY(0);
    }
  }

  :deep(.ant-tabs-tab-active) {
    background-color: rgba(24, 144, 255, 0.1);
    border: none;
    color: #1890ff;
    font-weight: 500;

    &:hover {
      background-color: rgba(24, 144, 255, 0.15);
      color: #1890ff;
    }
  }

  :deep(.ant-tabs-content-holder) {
    display: none;
  }

  :deep(.ant-tabs-ink-bar) {
    display: none;
  }

  :deep(.ant-tabs-tab-btn) {
    width: 100%;
    text-align: center;
  }
}

/* Context menu styles */
.context-menu {
  background: var(--bg-color-secondary);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
  padding: 2px 0;
  min-width: 140px;
  z-index: 9999;

  .context-menu-item {
    display: flex;
    align-items: center;
    padding: 4px 8px;
    cursor: pointer;
    color: var(--text-color);
    font-size: 12px;
    transition: background-color 0.15s;
    line-height: 1.4;

    &:hover {
      background-color: var(--hover-bg-color);
    }

    .menu-icon {
      margin-right: 6px;
      font-size: 12px;
      width: 14px;
      text-align: center;
      flex-shrink: 0;
    }
  }
}
.vs-node-actions {
  display: none; /* 默认隐藏按钮 */
  padding-right: 4px;
}

/* 让整行横向排列 */
.vs-node-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  gap: 8px;
}

.vs-node-label {
  flex: 1;
  overflow: hidden;
  display: flex;
  align-items: center;
}

.vs-node-text {
  display: inline-block;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 按钮容器 */
.vs-node-actions {
  display: none;
  flex-shrink: 0;
  align-items: center;
  gap: 4px;
  margin-left: auto;
}

.vs-node-row:hover .vs-node-actions {
  display: flex;
}

:deep(.ant-tree-node-content-wrapper:hover) .vs-node-actions {
  display: flex;
}

.vs-node-inner-btn {
  width: 22px;
  height: 22px;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.vs-node-icon {
  font-size: 13px;
  flex-shrink: 0;
}
.vs-toolbar-btn {
  color: var(--text-color);
}
.vs-node-inner-btn {
  color: var(--text-color);
}
</style>
