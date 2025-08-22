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

      <div style="width: 100%; margin-top: 10px">
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
          <a-button
            v-if="!isPersonalWorkspace"
            type="primary"
            size="small"
            class="workspace-button"
            @click="showCreateFolderModal = true"
          >
            <template #icon><folder-outlined /></template>{{ t('personal.folder') }}
          </a-button>
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
                <div class="custom-tree-node">
                  <span
                    v-if="!isSecondLevel(dataRef)"
                    class="title-with-icon"
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
                    v-else
                    class="title-with-icon"
                  >
                    <laptop-outlined class="computer-icon" />
                    <span
                      v-if="editingNode !== dataRef.key && commentNode !== dataRef.key"
                      @click="handleClick(dataRef)"
                      @dblclick="handleDblClick(dataRef)"
                      >{{ title }}</span
                    >

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
                <div class="custom-tree-node">
                  <span
                    v-if="!isSecondLevel(dataRef)"
                    class="title-with-icon"
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
                    v-else
                    class="title-with-icon"
                  >
                    <laptop-outlined class="computer-icon" />
                    <span
                      v-if="editingNode !== dataRef.key && commentNode !== dataRef.key"
                      @click="handleClick(dataRef)"
                      @dblclick="handleDblClick(dataRef)"
                      >{{ title }}</span
                    >
                    <!-- 备注编辑输入框 -->
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
                    <!-- 备注显示 -->
                    <span
                      v-if="dataRef.comment && editingNode !== dataRef.key && commentNode !== dataRef.key"
                      class="comment-text"
                      :title="dataRef.comment"
                    >
                      ({{ dataRef.comment }})
                    </span>
                  </span>
                  <!-- 备注编辑图标 -->
                  <span
                    v-if="
                      isSecondLevel(dataRef) &&
                      dataRef.asset_type === 'organization' &&
                      editingNode !== dataRef.key &&
                      commentNode !== dataRef.key &&
                      !dataRef.key.startsWith('common_')
                    "
                    class="comment-icon"
                    @click.stop="handleCommentClick(dataRef)"
                  >
                    <a-tooltip :title="dataRef.comment ? t('personal.editComment') : t('personal.addComment')">
                      <EditOutlined />
                    </a-tooltip>
                  </span>
                  <!-- 移动资产到文件夹按钮 -->
                  <span
                    v-if="
                      isSecondLevel(dataRef) &&
                      dataRef.asset_type === 'organization' &&
                      editingNode !== dataRef.key &&
                      commentNode !== dataRef.key &&
                      !dataRef.key.startsWith('common_') &&
                      !dataRef.key.startsWith('folder_')
                    "
                    class="move-icon"
                    @click.stop="handleMoveToFolder(dataRef)"
                  >
                    <a-tooltip :title="t('personal.moveToFolder')">
                      <FolderOutlined />
                    </a-tooltip>
                  </span>
                  <span
                    v-if="
                      isSecondLevel(dataRef) &&
                      dataRef.asset_type === 'organization' &&
                      editingNode !== dataRef.key &&
                      commentNode !== dataRef.key &&
                      dataRef.key.startsWith('folder_') &&
                      dataRef.folderUuid
                    "
                    class="remove-icon"
                    @click.stop="handleRemoveFromFolder(dataRef)"
                  >
                    <a-tooltip :title="t('personal.removeFromFolder')">
                      <DeleteOutlined />
                    </a-tooltip>
                  </span>
                  <div
                    v-if="
                      !isSecondLevel(dataRef) &&
                      !dataRef.key.startsWith('common_') &&
                      editingNode !== dataRef.key &&
                      company !== 'personal_user_id' &&
                      dataRef.title !== '收藏栏' &&
                      dataRef.asset_type === 'custom_folder'
                    "
                    class="folder-actions"
                  >
                    <a-tooltip :title="t('personal.editFolder')">
                      <EditOutlined
                        class="folder-action-icon"
                        @click="handleEditFolder(dataRef)"
                      />
                    </a-tooltip>
                    <a-tooltip :title="t('personal.deleteFolder')">
                      <DeleteOutlined
                        class="folder-action-icon"
                        @click="handleDeleteFolder(dataRef)"
                      />
                    </a-tooltip>
                  </div>
                  <div
                    v-if="
                      !isSecondLevel(dataRef) &&
                      !dataRef.key.startsWith('common_') &&
                      editingNode !== dataRef.key &&
                      company !== 'personal_user_id' &&
                      dataRef.title !== '收藏栏' &&
                      dataRef.asset_type !== 'custom_folder'
                    "
                    class="refresh-icon"
                  >
                    <a-tooltip :title="$t('common.refresh')">
                      <a-button
                        type="primary"
                        size="small"
                        ghost
                        @click="handleRefresh(dataRef)"
                      >
                        <template #icon>
                          <RedoOutlined />
                        </template>
                      </a-button>
                    </a-tooltip>
                  </div>
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
  DeleteOutlined
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
    loadCustomFolders()
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
      .catch((err) => console.error('个人资产收藏错误:', err))
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
        .catch((err) => console.error('组织本身收藏错误:', err))
    } else {
      console.log('更新组织子资产收藏状态:', {
        organizationUuid: dataRef.organizationId,
        host: dataRef.ip,
        status: dataRef.favorite ? 2 : 1
      })

      if (!window.api.updateOrganizationAssetFavorite) {
        console.error('window.api.updateOrganizationAssetFavorite 方法不存在!')
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
  refreshingNode.value = dataRef.key

  try {
    await refreshOrganizationAssetFromWorkspace(dataRef, () => {
      getUserAssetMenu()
    })
  } catch (error) {
    console.error('刷新失败:', error)
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
  loadCustomFolders()
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
    min-width: 320px;
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
    min-width: 280px;
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

  .ant-tree-indent {
    display: none !important;
  }
}

.custom-tree-node {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  min-width: 280px;
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
    margin-right: 8px;
    cursor: pointer;
    color: var(--text-color-tertiary);
    flex-shrink: 0;
    transition: all 0.2s ease;

    &:hover {
      transform: translateY(-0.5px);
      color: var(--text-color);
    }
  }

  .favorite-filled {
    color: #e6b800;
    opacity: 0.9;
    filter: drop-shadow(0 0 3px rgba(230, 184, 0, 0.4));
  }

  .favorite-outlined {
    color: var(--text-color-tertiary);
    opacity: 0.6;
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

  .comment-icon {
    display: flex;
    align-items: center;
    margin-right: 8px;
    cursor: pointer;
    color: var(--text-color-tertiary);
    flex-shrink: 0;
    transition: all 0.2s ease;

    &:hover {
      transform: translateY(-0.5px);
      color: var(--text-color);
    }
  }

  .move-icon {
    display: flex;
    align-items: center;
    margin-right: 8px;
    cursor: pointer;
    color: var(--text-color-tertiary);
    flex-shrink: 0;
    transition: all 0.2s ease;

    &:hover {
      transform: translateY(-0.5px);
      color: #1890ff;
    }
  }

  .remove-icon {
    display: flex;
    align-items: center;
    margin-right: 8px;
    cursor: pointer;
    color: var(--text-color-tertiary);
    flex-shrink: 0;
    transition: all 0.2s ease;

    &:hover {
      transform: translateY(-0.5px);
      color: #ff4d4f;
    }
  }

  .folder-actions {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-right: 8px;

    .folder-action-icon {
      font-size: 12px;
      color: var(--text-color-tertiary);
      cursor: pointer;
      transition: all 0.2s ease;

      &:hover {
        color: var(--text-color);
        transform: translateY(-0.5px);
      }
    }
  }

  .comment-text {
    color: var(--text-color-tertiary);
    font-size: 12px;
    margin-left: 4px;
    opacity: 0.8;
    max-width: 100px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .comment-edit-container {
    display: flex;
    align-items: center;
    flex-grow: 1;
    width: 100%;
    margin-left: 6px;

    .ant-input {
      background-color: var(--bg-color-secondary);
      border-color: var(--border-color);
      color: var(--text-color);
      flex: 1;
      min-width: 80px;
      height: 24px;
      padding: 0 4px;
      font-size: 12px;
    }

    .confirm-icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      margin-left: 4px;
      cursor: pointer;
      color: #52c41a;
      min-width: 16px;
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
      margin-left: 4px;
      cursor: pointer;
      color: #ff4d4f;
      min-width: 16px;
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
.active-text {
  border-bottom: 1px solid var(--text-color);
}
.no-active-text {
  border-bottom: 1px solid transparent;
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
</style>
