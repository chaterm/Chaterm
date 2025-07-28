<template>
  <div class="term_host_list">
    <div class="term_host_header">
      <div style="display: flex; align-items: center; justify-content: space-around; width: 100%">
        <div
          v-for="(item, index) in workspaceData"
          :key="index"
          style="display: flex; align-items: center; gap: 10px"
        >
          <p
            style="display: inline-block; font-size: 14px; margin: 0"
            :class="item.key == company ? 'active-text' : 'no-active-text'"
            @click="companyChange(item)"
          >
            {{ t(item.label) }}
          </p>
        </div>
      </div>

      <!-- 资产管理 -->
      <div style="width: 100%; margin-top: 10px">
        <div class="manage">
          <a-input
            v-model:value="searchValue"
            class="transparent-Input"
            :placeholder="t('common.search')"
            :style="isPersonalWorkspace ? 'width: 70%' : 'width: 100%'"
            allow-clear
            @input="onSearchInput"
          >
            <template #suffix>
              <search-outlined />
            </template>
          </a-input>
          <a-button
            type="primary"
            size="small"
            class="workspace-button"
            @click="assetManagement"
          >
            <template #icon><laptop-outlined /></template>{{ t('personal.host') }}
          </a-button>
        </div>

        <div class="tree-container">
          <div v-show="company === 'personal_user_id'">
            <a-tree
              v-model:selected-keys="selectedKeys"
              v-model:expanded-keys="expandedKeys"
              :tree-data="assetTreeData"
              :field-names="{ children: 'children', title: 'title', key: 'key' }"
              :default-expand-all="true"
              class="dark-tree"
              @select="handleSelect"
            >
              <template #title="{ title, dataRef }">
                <div
                  class="custom-tree-node"
                  @click="handleClick(dataRef)"
                  @dblclick="handleDblClick(dataRef)"
                >
                  <span
                    v-if="!isSecondLevel(dataRef)"
                    class="title-with-icon"
                  >
                    <span v-if="editingNode !== dataRef.key">{{ title }}</span>
                  </span>
                  <span
                    v-else
                    class="title-with-icon"
                  >
                    <laptop-outlined class="computer-icon" />
                    <span v-if="editingNode !== dataRef.key">{{ title }}</span>
                    <span
                      v-else
                      class="edit-container"
                    >
                      <a-input
                        v-model:value="editingTitle"
                        size="small"
                      />
                      <check-outlined
                        class="confirm-icon"
                        @click.stop="confirmEdit(dataRef)"
                      />
                    </span>
                  </span>
                  <edit-outlined
                    v-if="isSecondLevel(dataRef) && editingNode !== dataRef.key"
                    class="edit-icon"
                    @click.stop="handleEdit(dataRef)"
                  />
                  <span
                    v-if="
                      dataRef &&
                      dataRef.favorite !== undefined &&
                      !dataRef.key.startsWith('common_') &&
                      editingNode !== dataRef.key &&
                      !(dataRef.asset_type === 'organization' && dataRef.children)
                    "
                    class="favorite-icon"
                    @click.stop="handleFavoriteClick(dataRef)"
                  >
                    <star-filled
                      v-if="dataRef.favorite"
                      class="favorite-filled"
                    />
                    <star-outlined
                      v-else
                      class="favorite-outlined"
                    />
                  </span>
                </div>
              </template>
            </a-tree>
          </div>
          <div v-show="company !== 'personal_user_id'">
            <a-tree
              v-model:selected-keys="selectedKeys"
              v-model:expanded-keys="expandedKeys"
              :tree-data="enterpriseData"
              :field-names="{ children: 'children', title: 'title', key: 'key' }"
              :default-expand-all="true"
              class="dark-tree"
              @select="handleSelect"
            >
              <template #title="{ title, dataRef }">
                <div
                  class="custom-tree-node"
                  @click="handleClick(dataRef)"
                  @dblclick="handleDblClick(dataRef)"
                >
                  <span
                    v-if="!isSecondLevel(dataRef)"
                    class="title-with-icon"
                  >
                    <span v-if="editingNode !== dataRef.key">{{ title }}</span>
                  </span>
                  <span
                    v-else
                    class="title-with-icon"
                  >
                    <laptop-outlined class="computer-icon" />
                    <span v-if="editingNode !== dataRef.key">{{ title }}</span>
                    <span
                      v-else
                      class="edit-container"
                    >
                      <a-input
                        v-model:value="editingTitle"
                        size="small"
                      />
                      <check-outlined
                        class="confirm-icon"
                        @click.stop="confirmEdit(dataRef)"
                      />
                    </span>
                  </span>
                  <edit-outlined
                    v-if="isSecondLevel(dataRef) && editingNode !== dataRef.key"
                    class="edit-icon"
                    @click.stop="handleEdit(dataRef)"
                  />
                  <!-- 企业资产一级节点刷新按钮 -->
                  <reload-outlined
                    v-if="
                      !isSecondLevel(dataRef) &&
                      !dataRef.key.startsWith('common_') &&
                      editingNode !== dataRef.key &&
                      company !== 'personal_user_id' &&
                      dataRef.title !== '收藏栏'
                    "
                    :class="['refresh-icon', { 'refresh-icon-active': refreshingNode === dataRef.key }]"
                    @click.stop="handleRefresh(dataRef)"
                  />
                  <span
                    v-if="
                      dataRef &&
                      dataRef.favorite !== undefined &&
                      !dataRef.key.startsWith('common_') &&
                      editingNode !== dataRef.key &&
                      !(dataRef.asset_type === 'organization' && dataRef.children)
                    "
                    class="favorite-icon"
                    @click.stop="handleFavoriteClick(dataRef)"
                  >
                    <star-filled
                      v-if="dataRef.favorite"
                      class="favorite-filled"
                    />
                    <star-outlined
                      v-else
                      class="favorite-outlined"
                    />
                  </span>
                </div>
              </template>
            </a-tree>
          </div>
        </div>
      </div>
      <!-- 资产创建 -->
    </div>
    <div></div>
  </div>

  <!-- 二次验证弹窗组件 -->
  <OtpDialog />
</template>

<script setup lang="ts">
import { deepClone } from '@/utils/util'
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { StarFilled, StarOutlined, LaptopOutlined, SearchOutlined, EditOutlined, CheckOutlined, ReloadOutlined } from '@ant-design/icons-vue'
import eventBus from '@/utils/eventBus'
import i18n from '@/locales'
import { refreshOrganizationAssetFromWorkspace } from '../LeftTab/components/refreshOrganizationAssets'
import OtpDialog from '../LeftTab/components/OtpDialog.vue'

const { t } = i18n.global
const emit = defineEmits(['currentClickServer', 'change-company', 'open-user-tab'])

// 添加缺失的变量声明
const company = ref('personal_user_id')
const selectedKeys = ref<string[]>([])
const expandedKeys = ref<string[]>([])
const searchValue = ref('')
const editingNode = ref(null)
const editingTitle = ref('')
const refreshingNode = ref(null)

interface WorkspaceItem {
  key: string
  label: string
  type: string
}
const workspaceData = ref<WorkspaceItem[]>([
  {
    key: 'personal_user_id',
    label: 'personal.personal',
    type: 'personal'
  },
  {
    key: 'remote',
    label: 'personal.enterprise',
    type: 'organization'
  }
])

interface AssetNode {
  key: string
  title: string
  favorite?: boolean
  children?: AssetNode[]
  [key: string]: any
}
const originalTreeData = ref<AssetNode[]>([])
const assetTreeData = ref<AssetNode[]>([])
const enterpriseData = ref<AssetNode[]>([])
interface MachineOption {
  value: any
  label: string
}

const machines = ref<MachineOption | null>(null)

const companyChange = (item) => {
  company.value = item.key
  // 重置树相关状态
  selectedKeys.value = []
  expandedKeys.value = []
  searchValue.value = ''
  editingNode.value = null
  editingTitle.value = ''
  if (isPersonalWorkspace.value) {
    getLocalAssetMenu()
  } else {
    getUserAssetMenu()
  }
}

const isPersonalWorkspace = computed(() => {
  const currentWorkspace = workspaceData.value.find((item) => item.key === company.value)
  return currentWorkspace?.type === 'personal'
})
const handleFavoriteClick = (dataRef: any) => {
  // 检查是否有必要的字段
  if (!dataRef) {
    console.error('dataRef 为空')
    return
  }

  if (dataRef.favorite === undefined) {
    console.error('dataRef.favorite 未定义')
    return
  }

  toggleFavorite(dataRef)
}
const getLocalAssetMenu = () => {
  window.api
    .getLocalAssetRoute({ searchType: 'tree', params: ['person'] })
    .then((res) => {
      if (res && res.data) {
        const data = res.data.routers || []
        originalTreeData.value = deepClone(data) as AssetNode[]
        assetTreeData.value = deepClone(data) as AssetNode[]
        setTimeout(() => {
          expandDefaultNodes(assetTreeData.value)
        }, 200)
      }
    })
    .catch((err) => console.error(err))
}

const getUserAssetMenu = () => {
  window.api
    .getLocalAssetRoute({ searchType: 'tree', params: ['organization'] })
    .then((res) => {
      if (res && res.data) {
        const data = res.data.routers || []
        originalTreeData.value = deepClone(data) as AssetNode[]
        enterpriseData.value = deepClone(data) as AssetNode[]
        setTimeout(() => {
          expandDefaultNodes(enterpriseData.value)
        }, 200)
      }
    })
    .catch((err) => console.error(err))
}

const expandDefaultNodes = (data) => {
  // Expand all parent nodes by default
  const keys: string[] = []
  const traverseTree = (nodes: AssetNode[]) => {
    if (!nodes) return
    nodes.forEach((node) => {
      if (node.children && node.children.length > 0) {
        keys.push(node.key)
        traverseTree(node.children)
      }
    })
  }
  traverseTree(data)
  expandedKeys.value = keys
}

const filterTreeNodes = (inputValue: string): AssetNode[] => {
  if (!inputValue.trim()) return deepClone(originalTreeData.value) as AssetNode[]

  const lowerCaseInput = inputValue.toLowerCase()

  const filterNodes = (nodes: AssetNode[]): AssetNode[] => {
    return nodes
      .map((node) => {
        // 检查标题或IP是否匹配
        const titleMatch = node.title.toLowerCase().includes(lowerCaseInput)
        const ipMatch = node.ip && node.ip.toLowerCase().includes(lowerCaseInput)

        if (titleMatch || ipMatch) {
          return { ...node }
        }

        if (node.children) {
          const filteredChildren = filterNodes(node.children)
          if (filteredChildren.length > 0) {
            return {
              ...node,
              children: filteredChildren
            }
          }
        }

        return null
      })
      .filter(Boolean) as AssetNode[]
  }

  return filterNodes(deepClone(originalTreeData.value) as AssetNode[])
}

const onSearchInput = () => {
  if (isPersonalWorkspace.value) {
    assetTreeData.value = filterTreeNodes(searchValue.value)
    expandedKeys.value = getAllKeys(assetTreeData.value)
  } else {
    enterpriseData.value = filterTreeNodes(searchValue.value)
    expandedKeys.value = getAllKeys(enterpriseData.value)
  }
}

const getAllKeys = (nodes: AssetNode[]): string[] => {
  const keys: string[] = []
  const traverse = (items: AssetNode[]) => {
    if (!items) return
    items.forEach((item) => {
      keys.push(item.key)
      if (item.children) {
        traverse(item.children)
      }
    })
  }
  traverse(nodes)
  return keys
}

const handleSelect = (_, { selected, selectedNodes }) => {
  if (selected && selectedNodes.length > 0) {
    machines.value = {
      value: selectedNodes[0].key,
      label: selectedNodes[0].title
    }
  } else {
    machines.value = null
  }
}

const isSecondLevel = (node) => {
  return node && node.children === undefined
}

const toggleFavorite = (dataRef: any): void => {
  if (isPersonalWorkspace.value) {
    console.log('执行个人资产收藏逻辑')
    window.api
      .updateLocalAsseFavorite({ uuid: dataRef.uuid, status: dataRef.favorite ? 2 : 1 })
      .then((res) => {
        console.log('个人资产收藏响应:', res)
        if (res.data.message === 'success') {
          dataRef.favorite = !dataRef.favorite
          getLocalAssetMenu()
        }
      })
      .catch((err) => console.error('个人资产收藏错误:', err))
  } else {
    console.log('执行企业资产收藏逻辑')
    // 企业资产需要区分是组织本身还是组织下的子资产
    if (dataRef.asset_type === 'organization' && !dataRef.organizationId) {
      console.log('更新组织本身收藏状态')
      // 组织本身，修改 t_assets
      window.api
        .updateLocalAsseFavorite({ uuid: dataRef.uuid, status: dataRef.favorite ? 2 : 1 })
        .then((res) => {
          console.log('组织本身收藏响应:', res)
          if (res.data.message === 'success') {
            dataRef.favorite = !dataRef.favorite
            getUserAssetMenu()
          }
        })
        .catch((err) => console.error('组织本身收藏错误:', err))
    } else {
      console.log('更新组织子资产收藏状态:', {
        organizationUuid: dataRef.organizationId,
        host: dataRef.ip,
        status: dataRef.favorite ? 2 : 1
      })

      // 检查 API 方法是否存在
      if (!window.api.updateOrganizationAssetFavorite) {
        console.error('window.api.updateOrganizationAssetFavorite 方法不存在!')
        return
      }

      // 组织下的子资产，修改 t_organization_assets
      window.api
        .updateOrganizationAssetFavorite({
          organizationUuid: dataRef.organizationId,
          host: dataRef.ip,
          status: dataRef.favorite ? 2 : 1
        })
        .then((res) => {
          console.log('updateOrganizationAssetFavorite 响应:', res)
          if (res && res.data && res.data.message === 'success') {
            console.log('收藏状态更新成功，刷新菜单')
            dataRef.favorite = !dataRef.favorite
            getUserAssetMenu()
          } else {
            console.error('收藏状态更新失败:', res)
          }
        })
        .catch((err) => {
          console.error('updateOrganizationAssetFavorite 错误:', err)
        })
    }
  }
  console.log('=== toggleFavorite 结束 ===')
}
const handleEdit = (dataRef) => {
  editingNode.value = dataRef.key
  editingTitle.value = dataRef.title
}

const confirmEdit = (dataRef) => {
  if (!editingTitle.value.trim()) {
    return
  }
  dataRef.title = editingTitle.value
  editingNode.value = null
  editingTitle.value = ''

  if (isPersonalWorkspace.value) {
    window.api
      .updateLocalAssetLabel({ uuid: dataRef.uuid, label: dataRef.title })
      .then((res) => {
        if (res.data.message === 'success') {
          getLocalAssetMenu()
        }
      })
      .catch((err) => console.error(err))
  } else {
    window.api
      .updateLocalAssetLabel({ uuid: dataRef.uuid, label: dataRef.title })
      .then((res) => {
        if (res.data.message === 'success') {
          getUserAssetMenu()
        }
      })
      .catch((err) => console.error(err))
  }
}
const clickServer = (item) => {
  emit('currentClickServer', item)
}

const assetManagement = () => {
  emit('open-user-tab', 'assetConfig')
}

let clickTimer: any = null
const handleClick = (dataRef: any) => {
  if (clickTimer) clearTimeout(clickTimer)
  clickTimer = setTimeout(() => {
    clickServer(dataRef)
    clickTimer = null
  }, 500)
}
const handleDblClick = (dataRef: any) => {
  if (clickTimer) {
    clearTimeout(clickTimer)
    clickTimer = null
  }
  clickServer(dataRef)
}

const handleRefresh = async (dataRef: any) => {
  console.log('刷新企业资产节点:', dataRef)
  // 设置刷新状态
  refreshingNode.value = dataRef.key

  try {
    // 使用共享的刷新功能，支持二次验证
    await refreshOrganizationAssetFromWorkspace(dataRef, () => {
      // 刷新成功后的回调
      getUserAssetMenu()
    })
  } catch (error) {
    console.error('刷新失败:', error)
    // 即使失败也要刷新菜单，以防有部分数据更新
    getUserAssetMenu()
  } finally {
    // 延迟清除刷新状态，给用户视觉反馈
    setTimeout(() => {
      refreshingNode.value = null
    }, 800)
  }
}

getLocalAssetMenu()

const refreshAssetMenu = () => {
  if (isPersonalWorkspace.value) {
    getLocalAssetMenu()
  } else {
    getUserAssetMenu()
  }
}

onMounted(() => {
  eventBus.on('LocalAssetMenu', refreshAssetMenu)
})
onUnmounted(() => {
  eventBus.off('LocalAssetMenu', refreshAssetMenu)
})
</script>

<style lang="less" scoped>
.term_host_list {
  width: 100%;
  height: 100%;
  padding: 4px;
  display: flex;
  justify-content: space-between;
  flex-wrap: wrap;
  background-color: var(--bg-color);
  color: var(--text-color);

  .term_host_header {
    width: 100%;
    height: auto;
  }

  .active-text {
    color: #1890ff;
    cursor: pointer;
  }

  .no-active-text {
    color: var(--text-color-secondary);
    cursor: pointer;
    &:hover {
      color: #1890ff;
    }
  }

  .manage {
    display: flex;
    align-items: center;
    gap: 8px;
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
.tree-container {
  margin-top: 8px;
  overflow-y: auto;
  border-radius: 2px;
  background-color: transparent;
  max-height: calc(100vh - 120px);
  height: auto;
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

  .ant-tree-switcher {
    color: var(--text-color-tertiary) !important;
  }

  .ant-tree-node-selected {
    background-color: transparent;
  }

  .ant-tree-treenode {
    width: 100%;
    &:hover {
      background-color: var(--hover-bg-color);
    }
  }
}

.custom-tree-node {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  position: relative;
  padding-right: 4px;

  .title-with-icon {
    display: flex;
    align-items: center;
    color: var(--text-color);
    flex: 1;
    min-width: 0;
    overflow: hidden;

    .computer-icon {
      margin-right: 6px;
      font-size: 14px;
      color: var(--text-color);
      flex-shrink: 0;
    }
  }

  .action-buttons {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
  }

  .favorite-icon {
    display: flex;
    align-items: center;
    cursor: pointer;
    color: var(--text-color);
    flex-shrink: 0;
  }

  .favorite-filled {
    color: #faad14;
  }

  .favorite-outlined {
    color: var(--text-color-tertiary);
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
    display: flex;
    align-items: center;
    cursor: pointer;
    color: var(--text-color-tertiary);
    font-size: 14px;
    margin-left: 8px;
    flex-shrink: 0;
    transition: all 0.3s ease;
    &:hover {
      color: #1890ff;
      transform: scale(1.1);
    }
    &:active {
      color: #1890ff;
      transform: scale(0.95);
    }
  }

  .refresh-icon-active {
    color: #1890ff !important;
    transform: scale(1.2);
    animation: refresh-pulse 0.8s ease-in-out;
  }

  .refresh-icon-inline {
    cursor: pointer;
    color: var(--text-color-tertiary);
    font-size: 14px;
    margin-left: 8px;
    transition: color 0.3s;
    &:hover {
      color: #1890ff;
    }
    &:active {
      color: #1890ff;
    }
  }
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

.ant-dropdown-menu {
  width: 100px !important;
}

:deep(.ant-form-item-label > label) {
  color: #ffffff !important;
}
.top-icon {
  &:hover {
    color: #52c41a;
    transition: color 0.3s;
  }
}
:deep(.ant-card) {
  background-color: #f5f4f4; // 浅灰色背景
  border: 1px solid #333; // 稍深的边框色
}

/* 下拉菜单样式 */
:global(.ant-select-dropdown) {
  background-color: #333 !important;
  border-color: #444 !important;
}
:global(.ant-select-dropdown .ant-select-item) {
  color: #e0e0e0 !important;
}
:global(.ant-select-item-option-selected:not(.ant-select-item-option-disabled)) {
  background-color: #444 !important;
  color: #fff !important;
}
:global(.ant-select-item-option-active:not(.ant-select-item-option-disabled)) {
  background-color: #444 !important;
}
.manage {
  display: flex;
  gap: 10px;
  :deep(.ant-input-affix-wrapper) {
    background-color: transparent;
    border-color: rgba(255, 255, 255, 0.25);
    box-shadow: none;
  }
}
.active-text {
  border-bottom: 1px solid var(--text-color);
}
.no-active-text {
  border-bottom: 1px solid transparent;
}
.transparent-Input {
  background-color: transparent;
  color: rgba(255, 255, 255, 1);

  :deep(.ant-input) {
    background-color: transparent;
    color: rgba(255, 255, 255, 1);
    &::placeholder {
      color: rgba(255, 255, 255, 0.25);
    }
  }
}

@keyframes refresh-pulse {
  0% {
    transform: scale(1.2);
  }
  50% {
    transform: scale(1.3) rotate(180deg);
  }
  100% {
    transform: scale(1.2) rotate(360deg);
  }
}
</style>
