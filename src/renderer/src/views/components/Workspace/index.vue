<template>
  <div class="term_host_list">
    <div class="term_host_header">
      <div class="workspace-tabs-container">
        <a-tabs
          v-model:active-key="company"
          type="card"
          size="small"
          class="workspace-tabs"
          @change="handleTabChange"
        >
          <a-tab-pane
            v-for="item in workspaceData"
            :key="item.key"
            :tab="t(item.label)"
          />
        </a-tabs>
      </div>

      <div style="width: 100%; margin-top: 4px">
        <div class="manage">
          <a-input
            v-model:value="searchValue"
            class="transparent-Input"
            :placeholder="t('common.search')"
            allow-clear
            @input="onSearchInput"
          >
            <template #suffix>
              <search-outlined />
            </template>
          </a-input>
          <a-dropdown
            v-if="!isPersonalWorkspace"
            :trigger="['click']"
            placement="bottomRight"
          >
            <a-button
              type="primary"
              size="small"
              class="workspace-button"
            >
              <appstore-add-outlined />
            </a-button>
            <template #overlay>
              <a-menu @click="handleMenuClick">
                <a-menu-item key="customFolders">
                  <folder-outlined />
                  {{ t('personal.customFolders') }}
                </a-menu-item>
                <a-menu-item key="host">
                  <laptop-outlined />
                  {{ t('personal.host') }}
                </a-menu-item>
              </a-menu>
            </template>
          </a-dropdown>
          <a-tooltip
            v-else
            :title="t('personal.host')"
            placement="top"
          >
            <a-button
              type="primary"
              size="small"
              class="workspace-button"
              @click="assetManagement"
            >
              <laptop-outlined />
            </a-button>
          </a-tooltip>
        </div>

        <div class="tree-container">
          <div v-show="company === 'personal_user_id'">
            <a-tree
              v-model:selected-keys="selectedKeys"
              v-model:expanded-keys="expandedKeys"
              :tree-data="assetTreeData"
              :field-names="{ children: 'children', title: 'title', key: 'key' }"
              class="dark-tree"
              @select="handleSelect"
              @expand="onTreeExpand"
            >
              <template #title="{ title, dataRef }">
                <div class="custom-tree-node">
                  <span
                    v-if="!isSecondLevel(dataRef)"
                    class="title-with-icon"
                    @click="handleFolderRowClick($event, dataRef)"
                  >
                    <span v-if="editingNode !== dataRef.key">
                      {{ title }}
                      <span
                        v-if="!isSecondLevel(dataRef) && getOriginalChildrenCount(dataRef) > 0"
                        class="child-count"
                      >
                        ({{ getOriginalChildrenCount(dataRef) }})
                      </span>
                    </span>
                  </span>
                  <span
                    v-else-if="editingNode !== dataRef.key && commentNode !== dataRef.key"
                    class="title-with-icon"
                    :class="{ selected: selectedKeys.includes(dataRef.key) }"
                    @click="handleClick(dataRef)"
                    @dblclick="handleDblClick(dataRef)"
                    @contextmenu="handleContextMenu($event, dataRef)"
                  >
                    <laptop-outlined class="computer-icon" />
                    <span class="hostname-text">{{ title }}</span>

                    <div
                      v-if="commentNode === dataRef.key"
                      class="comment-edit-container"
                    >
                      <a-input
                        v-model:value="editingComment"
                        :placeholder="t('personal.commentPlaceholder')"
                        size="small"
                        @keyup.enter="saveComment(dataRef)"
                        @keyup.esc="cancelComment"
                      />
                      <CheckOutlined
                        class="confirm-icon"
                        @click="saveComment(dataRef)"
                      />
                      <CloseOutlined
                        class="cancel-icon"
                        @click="cancelComment"
                      />
                    </div>
                    <span
                      v-if="dataRef.comment && editingNode !== dataRef.key && commentNode !== dataRef.key"
                      class="comment-text"
                      :title="dataRef.comment"
                    >
                      ({{ dataRef.comment }})
                    </span>
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
              class="dark-tree"
              @select="handleSelect"
              @expand="onTreeExpand"
            >
              <template #title="{ title, dataRef }">
                <div class="custom-tree-node">
                  <span
                    v-if="!isSecondLevel(dataRef)"
                    class="title-with-icon"
                    @click="handleFolderRowClick($event, dataRef)"
                    @contextmenu="handleContextMenu($event, dataRef)"
                  >
                    <span v-if="editingNode !== dataRef.key">
                      {{ title }}
                      <span
                        v-if="!isSecondLevel(dataRef) && getOriginalChildrenCount(dataRef) > 0"
                        class="child-count"
                      >
                        ({{ getOriginalChildrenCount(dataRef) }})
                      </span>
                    </span>
                  </span>
                  <span
                    v-else-if="editingNode !== dataRef.key && commentNode !== dataRef.key"
                    class="title-with-icon"
                    :class="{ selected: selectedKeys.includes(dataRef.key) }"
                    @click="handleClick(dataRef)"
                    @dblclick="handleDblClick(dataRef)"
                    @contextmenu="handleContextMenu($event, dataRef)"
                  >
                    <laptop-outlined class="computer-icon" />
                    <span class="hostname-text">{{ title }}</span>
                    <!-- 备注显示 -->
                    <span
                      v-if="dataRef.comment"
                      class="comment-text"
                      :title="dataRef.comment"
                    >
                      ({{ dataRef.comment }})
                    </span>
                  </span>
                  <!-- 备注编辑输入框 -->
                  <span
                    v-else-if="commentNode === dataRef.key"
                    class="title-with-icon"
                  >
                    <laptop-outlined class="computer-icon" />
                    <span class="hostname-text">{{ title }}</span>
                    <div class="comment-edit-container">
                      <a-input
                        v-model:value="editingComment"
                        :placeholder="t('personal.commentPlaceholder')"
                        size="small"
                        @keyup.enter="saveComment(dataRef)"
                        @keyup.esc="cancelComment"
                      />
                      <CheckOutlined
                        class="confirm-icon"
                        @click="saveComment(dataRef)"
                      />
                      <CloseOutlined
                        class="cancel-icon"
                        @click="cancelComment"
                      />
                    </div>
                  </span>
                  <div
                    v-if="
                      !isSecondLevel(dataRef) &&
                      !dataRef.key.startsWith('common_') &&
                      editingNode !== dataRef.key &&
                      company !== 'personal_user_id' &&
                      dataRef.title !== t('common.favoriteBar') &&
                      dataRef.asset_type !== 'custom_folder'
                    "
                    class="refresh-icon"
                  >
                    <a-tooltip :title="$t('common.refresh')">
                      <a-button
                        type="primary"
                        size="small"
                        ghost
                        class="refresh-button"
                        :loading="refreshingNode === dataRef.key"
                        @click="handleRefresh(dataRef)"
                      >
                        <template #icon>
                          <RedoOutlined />
                        </template>
                      </a-button>
                    </a-tooltip>
                  </div>
                </div>
              </template>
            </a-tree>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- 创建文件夹模态框 -->
  <Modal
    v-model:open="showCreateFolderModal"
    :title="t('personal.createFolder')"
    @ok="handleCreateFolder"
    @cancel="showCreateFolderModal = false"
  >
    <div style="margin-bottom: 16px">
      <label>{{ t('personal.folderName') }} *</label>
      <Input
        v-model:value="createFolderForm.name"
        :placeholder="t('personal.pleaseInputFolderName')"
        style="margin-top: 8px"
      />
    </div>
    <div>
      <label>{{ t('personal.folderDescription') }}</label>
      <Input.TextArea
        v-model:value="createFolderForm.description"
        :placeholder="t('personal.pleaseInputFolderDescription')"
        :rows="3"
        style="margin-top: 8px"
      />
    </div>
  </Modal>

  <Modal
    v-model:open="showEditFolderModal"
    :title="t('personal.editFolder')"
    @ok="handleUpdateFolder"
    @cancel="showEditFolderModal = false"
  >
    <div style="margin-bottom: 16px">
      <label>{{ t('personal.folderName') }} *</label>
      <Input
        v-model:value="editFolderForm.name"
        :placeholder="t('personal.pleaseInputFolderName')"
        style="margin-top: 8px"
      />
    </div>
    <div>
      <label>{{ t('personal.folderDescription') }}</label>
      <Input.TextArea
        v-model:value="editFolderForm.description"
        :placeholder="t('personal.pleaseInputFolderDescription')"
        :rows="3"
        style="margin-top: 8px"
      />
    </div>
  </Modal>

  <Modal
    v-model:open="showMoveToFolderModal"
    :title="t('personal.moveToFolder')"
    :footer="null"
    @cancel="showMoveToFolderModal = false"
  >
    <div
      v-if="customFolders.length === 0"
      style="text-align: center; padding: 20px"
    >
      <p>{{ t('personal.noFolders') }}</p>
      <Button
        type="primary"
        @click="handleCreateFolderFromMoveModal"
      >
        {{ t('personal.createFolder') }}
      </Button>
    </div>
    <div v-else>
      <p style="margin-bottom: 16px">{{ t('personal.selectFolder') }}:</p>
      <div style="max-height: 300px; overflow-y: auto">
        <div
          v-for="folder in customFolders"
          :key="folder.uuid"
          style="padding: 12px; border: 1px solid #d9d9d9; border-radius: 6px; margin-bottom: 8px; cursor: pointer; transition: all 0.2s"
          @click="handleMoveAssetToFolder(folder.uuid)"
          @mouseenter="handleFolderMouseEnter"
          @mouseleave="handleFolderMouseLeave"
        >
          <div style="font-weight: 500; margin-bottom: 4px">{{ folder.name }}</div>
          <div
            v-if="folder.description"
            style="color: #666; font-size: 12px"
          >
            {{ folder.description }}
          </div>
        </div>
      </div>
    </div>
  </Modal>

  <!-- 右键菜单 -->
  <div
    v-if="contextMenuVisible && contextMenuData"
    class="context-menu"
    :style="contextMenuStyle"
    @click.stop
  >
    <div
      v-if="contextMenuData.favorite !== undefined"
      class="context-menu-item"
      @click="handleContextMenuAction('favorite')"
    >
      <star-filled
        v-if="contextMenuData.favorite"
        class="menu-icon"
      />
      <star-outlined
        v-else
        class="menu-icon"
      />
      {{ contextMenuData.favorite ? t('personal.removeFromFavorites') : t('personal.addToFavorites') }}
    </div>
    <div
      v-if="contextMenuData.asset_type === 'organization' && !contextMenuData.key.startsWith('common_')"
      class="context-menu-item"
      @click="handleContextMenuAction('comment')"
    >
      <EditOutlined class="menu-icon" />
      {{ contextMenuData.comment ? t('personal.editComment') : t('personal.addComment') }}
    </div>
    <div
      v-if="contextMenuData.asset_type === 'organization' && !contextMenuData.key.startsWith('common_') && !contextMenuData.key.startsWith('folder_')"
      class="context-menu-item"
      @click="handleContextMenuAction('move')"
    >
      <FolderOutlined class="menu-icon" />
      {{ t('personal.moveToFolder') }}
    </div>
    <div
      v-if="contextMenuData.asset_type === 'organization' && contextMenuData.key.startsWith('folder_') && contextMenuData.folderUuid"
      class="context-menu-item"
      @click="handleContextMenuAction('remove')"
    >
      <DeleteOutlined class="menu-icon" />
      {{ t('personal.removeFromFolder') }}
    </div>
    <div
      v-if="contextMenuData.asset_type === 'custom_folder' && !contextMenuData.key.startsWith('common_')"
      class="context-menu-item"
      @click="handleContextMenuAction('editFolder')"
    >
      <EditOutlined class="menu-icon" />
      {{ t('personal.editFolder') }}
    </div>
    <div
      v-if="contextMenuData.asset_type === 'custom_folder' && !contextMenuData.key.startsWith('common_')"
      class="context-menu-item"
      @click="handleContextMenuAction('deleteFolder')"
    >
      <DeleteOutlined class="menu-icon" />
      {{ t('personal.deleteFolder') }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { deepClone } from '@/utils/util'
import { ref, computed, onMounted, onUnmounted } from 'vue'
import {
  StarFilled,
  StarOutlined,
  LaptopOutlined,
  SearchOutlined,
  RedoOutlined,
  EditOutlined,
  CheckOutlined,
  CloseOutlined,
  FolderOutlined,
  DeleteOutlined,
  AppstoreAddOutlined
} from '@ant-design/icons-vue'
import eventBus from '@/utils/eventBus'
import i18n from '@/locales'
import { refreshOrganizationAssetFromWorkspace } from '../LeftTab/components/refreshOrganizationAssets'
import { userConfigStore } from '@/services/userConfigStoreService'
import { message, Modal, Input, Button } from 'ant-design-vue'

const { t } = i18n.global
const emit = defineEmits(['currentClickServer', 'change-company', 'open-user-tab'])
const company = ref('personal_user_id')
const selectedKeys = ref<string[]>([])
const expandedKeys = ref<string[]>([])
const searchValue = ref('')
const editingNode = ref(null)
const editingTitle = ref('')
const refreshingNode = ref(null)
const editingComment = ref('')
const commentNode = ref(null)
const showCreateFolderModal = ref(false)
const showEditFolderModal = ref(false)
const showMoveToFolderModal = ref(false)
const createFolderForm = ref({
  name: '',
  description: ''
})
const editFolderForm = ref({
  uuid: '',
  name: '',
  description: ''
})
const customFolders = ref<any[]>([])
const selectedAssetForMove = ref<any>(null)
const contextMenuVisible = ref(false)
const contextMenuData = ref<any>(null)
const contextMenuStyle = ref({})

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
  // Close context menu when changing workspace
  contextMenuVisible.value = false
  contextMenuData.value = null
  if (isPersonalWorkspace.value) {
    getLocalAssetMenu()
  } else {
    loadCustomFolders()
    getUserAssetMenu()
  }
}

// Handle expand/collapse state changes and save to user config
const handleExpandChange = async (expandedKeys: any[]) => {
  try {
    const currentConfig = await userConfigStore.getConfig()
    await userConfigStore.saveConfig({
      ...currentConfig,
      workspaceExpandedKeys: expandedKeys.map((key) => String(key))
    })
  } catch (error) {
    console.error('Failed to save workspace expanded keys:', error)
  }
}

// Wrapper function for Ant Design Vue tree expand event
const onTreeExpand = async (expandedKeys: any[]) => {
  await handleExpandChange(expandedKeys)
}

// Load saved expand state from user config
const loadSavedExpandState = async () => {
  try {
    const config = await userConfigStore.getConfig()
    if (config.workspaceExpandedKeys && config.workspaceExpandedKeys.length > 0) {
      expandedKeys.value = config.workspaceExpandedKeys
    }
  } catch (error) {
    console.error('Failed to load saved expand state:', error)
  }
}

const handleTabChange = (activeKey: string | number) => {
  // Close context menu when switching tabs
  contextMenuVisible.value = false
  contextMenuData.value = null

  const item = workspaceData.value.find((item) => item.key === activeKey)
  if (item) {
    companyChange(item)
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
    .then(async (res) => {
      if (res && res.data) {
        const data = res.data.routers || []
        originalTreeData.value = deepClone(data) as AssetNode[]
        assetTreeData.value = deepClone(data) as AssetNode[]
        const localShell = await window.api.getShellsLocal()
        assetTreeData.value.push(localShell)
        setTimeout(async () => {
          await expandDefaultNodes()
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
        setTimeout(async () => {
          await expandDefaultNodes()
        }, 200)
      }
    })
    .catch((err) => console.error(err))
}

const expandDefaultNodes = async () => {
  // Load saved expand state instead of expanding all nodes
  await loadSavedExpandState()
}

const filterTreeNodes = (inputValue: string): AssetNode[] => {
  if (!inputValue.trim()) return deepClone(originalTreeData.value) as AssetNode[]

  const lowerCaseInput = inputValue.toLowerCase()

  const filterNodes = (nodes: AssetNode[]): AssetNode[] => {
    return nodes
      .map((node) => {
        const titleMatch = node.title.toLowerCase().includes(lowerCaseInput)
        const ipMatch = node.ip && node.ip.toLowerCase().includes(lowerCaseInput)
        const commentMatch = node.comment && node.comment.toLowerCase().includes(lowerCaseInput)

        if (titleMatch || ipMatch || commentMatch) {
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
  // Close context menu when searching
  contextMenuVisible.value = false
  contextMenuData.value = null

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

const getOriginalChildrenCount = (dataRef: any): number => {
  if (!dataRef || !dataRef.key) return 0

  // 在原始数据中查找对应的节点
  const findNodeInOriginal = (nodes: AssetNode[], targetKey: string): AssetNode | null => {
    if (!nodes) return null

    for (const node of nodes) {
      if (node.key === targetKey) {
        return node
      }
      if (node.children) {
        const found = findNodeInOriginal(node.children, targetKey)
        if (found) return found
      }
    }
    return null
  }

  const originalNode = findNodeInOriginal(originalTreeData.value, dataRef.key)
  return originalNode?.children?.length || 0
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
      .catch((err) => console.error(t('common.personalAssetFavoriteError'), err))
  } else {
    console.log('执行企业资产收藏逻辑')
    if (dataRef.asset_type === 'organization' && !dataRef.organizationId) {
      console.log('更新组织本身收藏状态')
      window.api
        .updateLocalAsseFavorite({ uuid: dataRef.uuid, status: dataRef.favorite ? 2 : 1 })
        .then((res) => {
          console.log('组织本身收藏响应:', res)
          if (res.data.message === 'success') {
            dataRef.favorite = !dataRef.favorite
            getUserAssetMenu()
          }
        })
        .catch((err) => console.error(t('common.organizationAssetFavoriteError'), err))
    } else {
      console.log('更新组织子资产收藏状态:', {
        organizationUuid: dataRef.organizationId,
        host: dataRef.ip,
        status: dataRef.favorite ? 2 : 1
      })

      if (!window.api.updateOrganizationAssetFavorite) {
        console.error(t('common.updateOrganizationAssetFavoriteMethodNotFound'))
        return
      }

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
            console.error(t('common.favoriteStatusUpdateFailed'), res)
          }
        })
        .catch((err) => {
          console.error(t('common.updateOrganizationAssetFavoriteError'), err)
        })
    }
  }
  console.log('=== toggleFavorite 结束 ===')
}

const clickServer = (item) => {
  emit('currentClickServer', item)
}

const assetManagement = () => {
  emit('open-user-tab', 'assetConfig')
}

const handleMenuClick = ({ key }) => {
  switch (key) {
    case 'customFolders':
      showCreateFolderModal.value = true
      break
    case 'host':
      assetManagement()
      break
  }
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
  refreshingNode.value = dataRef.key

  try {
    await refreshOrganizationAssetFromWorkspace(dataRef, () => {
      getUserAssetMenu()
    })
  } catch (error) {
    console.error(t('common.refreshFailed'), error)
    getUserAssetMenu()
  } finally {
    setTimeout(() => {
      refreshingNode.value = null
    }, 800)
  }
}

const handleCommentClick = (dataRef: any) => {
  commentNode.value = dataRef.key
  editingComment.value = dataRef.comment || ''
}

const saveComment = async (dataRef: any) => {
  try {
    if (!window.api.updateOrganizationAssetComment) {
      console.error('window.api.updateOrganizationAssetComment 方法不存在!')
      return
    }

    const result = await window.api.updateOrganizationAssetComment({
      organizationUuid: dataRef.organizationId,
      host: dataRef.ip,
      comment: editingComment.value
    })

    if (result && result.data && result.data.message === 'success') {
      dataRef.comment = editingComment.value
      commentNode.value = null
      editingComment.value = ''
      // 刷新菜单以显示更新
      getUserAssetMenu()
    } else {
      console.error('备注保存失败:', result)
    }
  } catch (error) {
    console.error('保存备注错误:', error)
  }
}

const cancelComment = () => {
  commentNode.value = null
  editingComment.value = ''
}

const loadCustomFolders = async () => {
  try {
    const result = await window.api.getCustomFolders()
    if (result && result.data && result.data.message === 'success') {
      customFolders.value = result.data.folders || []
    }
  } catch (error) {
    console.error('加载自定义文件夹失败:', error)
  }
}

const handleCreateFolder = async () => {
  try {
    if (!createFolderForm.value.name.trim()) {
      message.error(t('personal.pleaseInputFolderName'))
      return
    }

    const result = await window.api.createCustomFolder({
      name: createFolderForm.value.name.trim(),
      description: createFolderForm.value.description.trim()
    })

    if (result && result.data && result.data.message === 'success') {
      message.success(t('personal.folderCreated'))
      showCreateFolderModal.value = false
      createFolderForm.value = { name: '', description: '' }
      await loadCustomFolders()
      getUserAssetMenu()
    } else {
      message.error(t('personal.folderCreateFailed'))
    }
  } catch (error) {
    console.error('创建文件夹失败:', error)
    message.error(t('personal.folderCreateFailed'))
  }
}

const handleEditFolder = (dataRef: any) => {
  editFolderForm.value = {
    uuid: dataRef.folderUuid,
    name: dataRef.title,
    description: dataRef.description || ''
  }
  showEditFolderModal.value = true
}

const handleUpdateFolder = async () => {
  try {
    if (!editFolderForm.value.name.trim()) {
      message.error(t('personal.pleaseInputFolderName'))
      return
    }

    const result = await window.api.updateCustomFolder({
      folderUuid: editFolderForm.value.uuid,
      name: editFolderForm.value.name.trim(),
      description: editFolderForm.value.description.trim()
    })

    if (result && result.data && result.data.message === 'success') {
      message.success(t('personal.folderUpdated'))
      showEditFolderModal.value = false
      editFolderForm.value = { uuid: '', name: '', description: '' }
      await loadCustomFolders()
      getUserAssetMenu()
    } else {
      message.error(t('personal.folderUpdateFailed'))
    }
  } catch (error) {
    console.error('更新文件夹失败:', error)
    message.error(t('personal.folderUpdateFailed'))
  }
}

const handleDeleteFolder = (dataRef: any) => {
  const assetCount = dataRef.children ? dataRef.children.length : 0
  const confirmContent =
    assetCount > 0
      ? t('personal.folderDeleteConfirmWithAssets', { name: dataRef.title, count: assetCount })
      : t('personal.folderDeleteConfirmContent', { name: dataRef.title })

  Modal.confirm({
    title: t('personal.folderDeleteConfirm'),
    content: confirmContent,
    onOk: async () => {
      try {
        const result = await window.api.deleteCustomFolder({
          folderUuid: dataRef.folderUuid
        })

        if (result && result.data && result.data.message === 'success') {
          message.success(t('personal.folderDeleted'))
          await loadCustomFolders()
          getUserAssetMenu()
        } else {
          message.error(t('personal.folderDeleteFailed'))
        }
      } catch (error) {
        console.error('删除文件夹失败:', error)
        message.error(t('personal.folderDeleteFailed'))
      }
    }
  })
}

const handleMoveToFolder = (dataRef: any) => {
  selectedAssetForMove.value = dataRef
  showMoveToFolderModal.value = true
}

const handleMoveAssetToFolder = async (folderUuid: string) => {
  try {
    if (!selectedAssetForMove.value) return

    const result = await window.api.moveAssetToFolder({
      folderUuid: folderUuid,
      organizationUuid: selectedAssetForMove.value.organizationId,
      assetHost: selectedAssetForMove.value.ip
    })

    if (result && result.data && result.data.message === 'success') {
      message.success(t('personal.assetMoved'))
      showMoveToFolderModal.value = false
      selectedAssetForMove.value = null
      getUserAssetMenu()
    } else {
      message.error(t('personal.assetMoveFailed'))
    }
  } catch (error) {
    console.error('移动资产失败:', error)
    message.error(t('personal.assetMoveFailed'))
  }
}

const handleRemoveFromFolder = async (dataRef: any) => {
  try {
    const result = await window.api.removeAssetFromFolder({
      folderUuid: dataRef.folderUuid,
      organizationUuid: dataRef.organizationId,
      assetHost: dataRef.ip
    })

    if (result && result.data && result.data.message === 'success') {
      message.success(t('personal.assetRemoved'))
      getUserAssetMenu()
    } else {
      message.error(t('personal.assetRemoveFailed'))
    }
  } catch (error) {
    console.error('从文件夹移除资产失败:', error)
    message.error(t('personal.assetRemoveFailed'))
  }
}

const handleCreateFolderFromMoveModal = () => {
  showCreateFolderModal.value = true
  showMoveToFolderModal.value = false
}

const handleFolderMouseEnter = (e: Event) => {
  const target = e.target as HTMLElement
  if (target) target.style.backgroundColor = '#f5f5f5'
}

const handleFolderMouseLeave = (e: Event) => {
  const target = e.target as HTMLElement
  if (target) target.style.backgroundColor = 'transparent'
}

const handleContextMenu = (event: MouseEvent, dataRef: any) => {
  event.preventDefault()
  event.stopPropagation()

  // Check if the node has any available menu options
  const hasFavoriteOption = dataRef.favorite !== undefined
  const hasCommentOption = dataRef.asset_type === 'organization' && !dataRef.key.startsWith('common_')
  const hasMoveOption = dataRef.asset_type === 'organization' && !dataRef.key.startsWith('common_') && !dataRef.key.startsWith('folder_')
  const hasRemoveOption = dataRef.asset_type === 'organization' && dataRef.key.startsWith('folder_') && dataRef.folderUuid
  const hasEditFolderOption = dataRef.asset_type === 'custom_folder' && !dataRef.key.startsWith('common_')
  const hasDeleteFolderOption = dataRef.asset_type === 'custom_folder' && !dataRef.key.startsWith('common_')

  // If no menu options are available, don't show the context menu
  if (!hasFavoriteOption && !hasCommentOption && !hasMoveOption && !hasRemoveOption && !hasEditFolderOption && !hasDeleteFolderOption) {
    return
  }

  // Select the host when right-clicking to show selection state
  if (isSecondLevel(dataRef)) {
    selectedKeys.value = [dataRef.key]
    // Update machines value to reflect the selection
    machines.value = {
      value: dataRef.key,
      label: dataRef.title
    }
  }

  contextMenuData.value = dataRef
  contextMenuStyle.value = {
    position: 'fixed',
    left: event.clientX + 'px',
    top: event.clientY + 'px',
    zIndex: 9999
  }
  contextMenuVisible.value = true
}

const handleContextMenuAction = (action: string) => {
  if (!contextMenuData.value) return

  switch (action) {
    case 'favorite':
      handleFavoriteClick(contextMenuData.value)
      break
    case 'comment':
      handleCommentClick(contextMenuData.value)
      break
    case 'move':
      handleMoveToFolder(contextMenuData.value)
      break
    case 'remove':
      handleRemoveFromFolder(contextMenuData.value)
      break
    case 'editFolder':
      handleEditFolder(contextMenuData.value)
      break
    case 'deleteFolder':
      handleDeleteFolder(contextMenuData.value)
      break
  }

  contextMenuVisible.value = false
  contextMenuData.value = null
}

// Handle folder row click for expand/collapse
const handleFolderRowClick = async (event: MouseEvent, dataRef: any) => {
  // Check if the click is on the refresh button or its children
  const target = event.target as HTMLElement
  if (target.closest('.refresh-icon') || target.closest('.ant-btn')) {
    return // Don't handle expand/collapse if clicking on refresh button
  }
  // Only handle expand/collapse for folder nodes (not leaf nodes)
  if (dataRef.children && dataRef.children.length > 0) {
    const isExpanded = expandedKeys.value.includes(dataRef.key)
    if (isExpanded) {
      // Collapse the folder
      expandedKeys.value = expandedKeys.value.filter((key) => key !== dataRef.key)
    } else {
      // Expand the folder
      expandedKeys.value = [...expandedKeys.value, dataRef.key]
    }
    // Save the new expand state
    await handleExpandChange(expandedKeys.value)
  }
}

getLocalAssetMenu()

const getSSHAgentStatus = async () => {
  const savedConfig = await userConfigStore.getConfig()
  if (savedConfig && savedConfig.sshAgentsStatus == 1) {
    window.api.agentEnableAndConfigure({ enabled: true }).then((res) => {
      if (res.success) {
        const sshAgentMaps = savedConfig.sshAgentsMap ? JSON.parse(savedConfig.sshAgentsMap) : {}
        for (const keyId in sshAgentMaps) {
          loadKey(sshAgentMaps[keyId])
        }
      }
    })
  }
}

const loadKey = (keyId) => {
  window.api.getKeyChainInfo({ id: keyId }).then((res) => {
    window.api.addKey({
      keyData: res.private_key,
      comment: res.chain_name,
      passphrase: res.passphrase
    })
  })
}

getSSHAgentStatus()

const refreshAssetMenu = () => {
  if (isPersonalWorkspace.value) {
    getLocalAssetMenu()
  } else {
    getUserAssetMenu()
  }
}

onMounted(() => {
  eventBus.on('LocalAssetMenu', refreshAssetMenu)
  // 监听语言变更事件，重新加载资产数据
  eventBus.on('languageChanged', () => {
    console.log('Language changed, refreshing asset menu...')
    refreshAssetMenu()
  })
  loadCustomFolders()

  // Add click outside listener to close context menu
  document.addEventListener('click', () => {
    contextMenuVisible.value = false
    contextMenuData.value = null
  })
})
onUnmounted(() => {
  eventBus.off('LocalAssetMenu', refreshAssetMenu)
  eventBus.off('languageChanged')
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
.tree-container {
  margin-top: 8px;
  overflow-y: auto;
  border-radius: 2px;
  background-color: transparent;
  max-height: calc(100vh - 120px);
  height: auto;

  /* 滚动条样式 */
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

  /* Firefox 滚动条样式 */
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
    background-color: rgba(24, 144, 255, 0.15) !important;
    border: 1px solid #1890ff !important;
    border-radius: 4px !important;
    box-shadow: 0 0 0 2px rgba(24, 144, 255, 0.2) !important;
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
      background-color: rgba(24, 144, 255, 0.15) !important;
      border: 1px solid #1890ff !important;
      box-shadow: 0 0 0 2px rgba(24, 144, 255, 0.2) !important;
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
</style>
