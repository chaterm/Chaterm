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
            v-if="isPersonalWorkspace"
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
                  @click="clickServer(dataRef)"
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
                    <a-tooltip
                      v-if="editingNode !== dataRef.key"
                      :title="t('workspace.connectToServer', { ip: dataRef.ip })"
                    >
                      <span v-if="editingNode !== dataRef.key">{{ title }}</span>
                    </a-tooltip>
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
                    v-if="dataRef && dataRef.favorite !== undefined && !dataRef.key.startsWith('common_') && editingNode !== dataRef.key"
                    class="favorite-icon"
                    @click.stop="toggleFavorite(dataRef)"
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
                  @click="clickServer(dataRef)"
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
                    <a-tooltip
                      v-if="editingNode !== dataRef.key"
                      :title="t('workspace.connectToServer', { ip: dataRef.ip })"
                    >
                      <span v-if="editingNode !== dataRef.key">{{ title }}</span>
                    </a-tooltip>
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
                    v-if="dataRef && dataRef.favorite !== undefined && !dataRef.key.startsWith('common_') && editingNode !== dataRef.key"
                    class="favorite-icon"
                    @click.stop="toggleFavorite(dataRef)"
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
</template>

<script setup lang="ts">
interface ApiType {
  insertCommand: (data: { command: string; ip: string }) => Promise<any>
  getLocalAssetRoute: (data: { searchType: string; params?: any[] }) => Promise<any>
  updateLocalAssetLabel: (data: { uuid: string; label: string }) => Promise<any>
  updateLocalAsseFavorite: (data: { uuid: string; status: number }) => Promise<any>
}
declare global {
  interface Window {
    api: ApiType
  }
}
import { getassetMenu, setUserfavorite, getUserWorkSpace, setAlias } from '@/api/asset/asset'
import { deepClone } from '@/utils/util'
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { StarFilled, StarOutlined, LaptopOutlined, SearchOutlined, EditOutlined, CheckOutlined } from '@ant-design/icons-vue'
import eventBus from '@/utils/eventBus'
import i18n from '@/locales'
const { t } = i18n.global

const searchValue = ref('')
const editingNode = ref(null)
const editingTitle = ref('')
const selectedKeys = ref([])
const expandedKeys = ref<string[]>([])
const company = ref('personal_user_id')

const emit = defineEmits(['currentClickServer', 'change-company', 'open-user-tab'])

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

const remoteWorkSpace = ref<WorkspaceItem[]>([])

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
  // emit('change-company')
}

const isPersonalWorkspace = computed(() => {
  const currentWorkspace = workspaceData.value.find((item) => item.key === company.value)
  return currentWorkspace?.type === 'personal'
})
const keyChainConfig = () => {
  emit('open-user-tab', 'keyChainConfig')
}

const getLocalAssetMenu = () => {
  window.api
    .getLocalAssetRoute({ searchType: 'tree', params: [] })
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
  getassetMenu({ organizationId: remoteWorkSpace.value[0]?.key || '' })
    .then((res) => {
      const data = res.data.routers || []
      originalTreeData.value = deepClone(data) as AssetNode[]
      enterpriseData.value = deepClone(data) as AssetNode[]
      expandDefaultNodes(enterpriseData.value)
    })
    .catch((err) => console.error(err))
}

const GetUserWorkSpace = async () => {
  getUserWorkSpace()
    .then((res) => {
      const data = res.data.data
      const newData = deepClone(data) as WorkspaceItem[]
      remoteWorkSpace.value = [...newData]
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
        if (node.title.toLowerCase().includes(lowerCaseInput)) {
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
  assetTreeData.value = filterTreeNodes(searchValue.value)
  expandedKeys.value = getAllKeys(assetTreeData.value)
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
    window.api
      .updateLocalAsseFavorite({ uuid: dataRef.uuid, status: dataRef.favorite ? 2 : 1 })
      .then((res) => {
        if (res.data.message === 'success') {
          dataRef.favorite = !dataRef.favorite
          getLocalAssetMenu()
        }
      })
      .catch((err) => console.error(err))
  } else {
    const keyString = dataRef.key || ''
    const lastUnderscoreIndex = keyString.lastIndexOf('_')
    const ip = lastUnderscoreIndex !== -1 ? keyString.substring(lastUnderscoreIndex + 1) : keyString
    setUserfavorite({ assetIp: ip, action: dataRef.favorite ? 'unfavorite' : 'favorite' })
      .then((res) => {
        if (res.data.message === 'success') {
          dataRef.favorite = !dataRef.favorite
          getUserAssetMenu()
        }
      })
      .catch((err) => console.error(err))
  }
}
const handleEdit = (dataRef) => {
  editingNode.value = dataRef.key
  editingTitle.value = dataRef.title
}

const confirmEdit = (dataRef) => {
  // 这里判断传入是否为非空
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
    setAlias({ key: dataRef.key, alias: dataRef.title })
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
getLocalAssetMenu()
onMounted(async () => {
  await GetUserWorkSpace()

  eventBus.on('LocalAssetMenu', getLocalAssetMenu)
})
onUnmounted(() => {
  eventBus.off('LocalAssetMenu', getLocalAssetMenu)
})
</script>

<style lang="less" scoped>
.term_host_list {
  width: 100%;
  height: 100%;
  padding: 10px;
  display: flex;
  justify-content: space-between;
  flex-wrap: wrap;
  .term_host_header {
    width: 100%;
    height: auto;
  }
  .term_com_list {
    display: inline-block;
    float: right;
  }
  .term_com_list .ant-select-selection-item {
    color: #ccc !important;
  }
  .term_com_list .ant-select-selector {
    color: #ffffff !important;
  }
  .term_com_list .ant-select-single {
    color: #ffffff !important;
  }
  :deep(.term_com_list .ant-select-selector) {
    color: #fff !important;
    background-color: #333 !important;
    border-color: #444 !important;
  }
  :deep(.term_com_list .ant-select-arrow) {
    color: #ccc !important;
  }
}
.tree-container {
  margin-top: 8px;
  max-height: 77vh;
  overflow-y: auto;
  border-radius: 2px;
  padding: 5px;
  background-color: transparent;
}

:deep(.dark-tree) {
  background-color: transparent;
  height: 30% !important;
  .ant-tree-node-content-wrapper,
  .ant-tree-title,
  .ant-tree-switcher,
  .ant-tree-node-selected {
    color: white !important;
  }

  .ant-tree-switcher {
    color: #bbb !important;
  }

  .ant-tree-node-selected {
    background-color: transparent;
  }

  // .ant-tree-node-content-wrapper:hover {
  //   background-color: #434343 !important;
  // }

  .ant-tree-treenode {
    width: 100%;
    &:hover {
      background-color: #333;
    }
  }
}

.custom-tree-node {
  display: flex;
  justify-content: space-between; // 这确保内容分布在两端
  align-items: center;
  width: 100%;
  position: relative;
  padding-right: 24px;

  .title-with-icon {
    display: flex;
    align-items: center;
    color: white;
    flex-grow: 1;

    .computer-icon {
      margin-right: 6px;
      font-size: 14px;
      color: white;
    }
  }

  .favorite-icon {
    position: absolute; // 使用绝对定位
    right: 0; // 放在最右侧
    top: 50%; // 垂直居中
    transform: translateY(-50%); // 确保完全垂直居中
    cursor: pointer;
    color: white;
    margin-left: 8px;

    // &:hover {
    //   opacity: 0.8;
    // }
  }

  .favorite-filled {
    color: #faad14; // 黄色
  }

  .favorite-outlined {
    color: #d9d9d9; // 灰色
  }
  .edit-icon {
    display: none;
    cursor: pointer;
    color: #d9d9d9;
    font-size: 14px;
    margin-left: 6px;
    &:hover {
      color: #1890ff;
    }
  }
}
:deep(.ant-tree-node-content-wrapper:hover) {
  .edit-icon {
    display: inline-block;
  }
}

.edit-container {
  display: flex;
  align-items: center;
  flex-grow: 1;
  width: 100%;

  .ant-input {
    background-color: #1f1f1f;
    border-color: #434343;
    color: white;
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
  color: rgba(255, 255, 255, 1);
  border-bottom: 1px solid #ffffff;
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
</style>
