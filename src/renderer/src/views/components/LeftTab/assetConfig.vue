<template>
  <div class="asset-config-container">
    <div class="split-layout">
      <div class="left-section">
        <!-- 搜索框 -->
        <div class="search-container">
          <a-input
            v-model:value="searchValue"
            :placeholder="t('common.search')"
            class="search-input"
            @input="handleSearch"
          >
            <template #suffix>
              <search-outlined />
            </template>
          </a-input>
          <div
            class="toggle-btn"
            @click="openNewPanel"
          >
            <a-button
              type="primary"
              size="small"
              class="workspace-button"
            >
              <template #icon><DatabaseOutlined /></template>{{ t('personal.newHost') }}
            </a-button>
          </div>
        </div>

        <!-- 资产列表 -->
        <div class="asset-list-container">
          <!-- 遍历每个组 -->
          <template
            v-for="group in filteredAssetGroups"
            :key="group.key"
          >
            <!-- 组标题 -->
            <div class="group-title">{{ group.title }}</div>

            <!-- 组内主机卡片列表 -->
            <div
              class="host-cards"
              :class="{ 'wide-layout': !isRightSectionVisible }"
            >
              <!-- 主机列表卡片 -->
              <div
                v-for="host in group.children"
                :key="host.key"
                class="card-wrapper"
              >
                <a-card
                  class="host-card"
                  :bordered="false"
                  @contextmenu.prevent="showContextMenu($event, host, group)"
                  @click="handleCardClick(host)"
                  @dblclick="handleConnect(host)"
                >
                  <div class="host-card-content">
                    <div class="host-icon">
                      <DatabaseOutlined style="font-size: 24px" />
                    </div>
                    <div class="host-info">
                      <div class="host-name">{{ host.title }}</div>
                      <div class="host-type">
                        {{ t('personal.hostType') }}{{ host.username ? ', ' + host.username : '' }}
                      </div>
                    </div>
                    <div
                      class="edit-icon"
                      @click.stop="handleEdit(host)"
                    >
                      <EditOutlined />
                    </div>
                  </div>
                </a-card>
              </div>

              <!-- 右键菜单 -->
              <div
                v-if="contextMenuVisible"
                class="context-menu"
                :style="{ top: contextMenuPosition.y + 'px', left: contextMenuPosition.x + 'px' }"
                @click="contextMenuVisible = false"
              >
                <div
                  class="context-menu-item"
                  @click="handleConnect(selectedHost)"
                >
                  <div class="context-menu-icon"><ApiOutlined /></div>
                  <div>{{ t('common.connect') }}</div>
                </div>
                <div
                  class="context-menu-item"
                  @click="handleEdit(selectedHost)"
                >
                  <div class="context-menu-icon"><EditOutlined /></div>
                  <div>{{ t('common.edit') }}</div>
                </div>
                <div
                  class="context-menu-item delete"
                  @click="handleRemove(selectedHost)"
                >
                  <div class="context-menu-icon"><DeleteOutlined /></div>
                  <div>{{ t('common.remove') }}</div>
                </div>
              </div>
            </div>
          </template>
        </div>
      </div>
      <div
        class="right-section"
        :class="{ collapsed: !isRightSectionVisible }"
      >
        <div class="right-section-header">
          <div style="font-size: 14px; font-weight: bold">
            <h3>{{ isEditMode ? t('personal.editHost') : t('personal.newHost') }}</h3>
          </div>
          <ToTopOutlined
            style="font-size: 20px; transform: rotate(90deg); cursor: pointer"
            class="top-icon"
            @click="isRightSectionVisible = false"
          />
        </div>

        <div class="right-section-content">
          <a-form
            :label-col="{ span: 27 }"
            :wrapper-col="{ span: 27 }"
            layout="vertical"
            class="custom-form"
          >
            <div class="formTitle">
              <div class="titleHeader"></div>
              {{ t('personal.address') }}</div
            >
            <a-form-item :label="t('personal.processor')">
              <a-input
                v-model:value="createFrom.ip"
                :placeholder="t('personal.pleaseInput')"
              />
            </a-form-item>

            <div class="formTitle">
              <div class="titleHeader"></div>
              {{ t('personal.general') }}</div
            >
            <a-form-item :label="t('personal.alias')">
              <a-input
                v-model:value="createFrom.label"
                :placeholder="t('personal.pleaseInput')"
              />
            </a-form-item>
            <a-form-item
              :label="t('personal.general')"
              class="general-group"
            >
              <a-select
                v-model:value="createFrom.group_name"
                mode="tags"
                :placeholder="t('personal.pleaseSelect')"
                :max-tag-count="2"
                style="width: 100%"
                @change="(val) => (createFrom.group_name = val.slice(-1))"
              >
                <a-select-option
                  v-for="item1 in defaultGroups"
                  :key="item1"
                  :value="item1"
                >
                  {{ item1 }}
                </a-select-option>
              </a-select>
            </a-form-item>

            <div class="formTitle">
              <div class="titleHeader"></div>
              SSH</div
            >
            <a-form-item :label="t('personal.command')">
              <a-input
                v-model:value="createFrom.port"
                :min="20"
                :max="65536"
                :placeholder="t('personal.pleaseInput')"
                style="width: 100%"
              />
            </a-form-item>
            <a-form-item :label="t('personal.verificationMethod')">
              <a-radio-group
                v-model:value="createFrom.auth_type"
                button-style="solid"
                style="width: 100%"
                @change="authChange"
              >
                <a-radio-button value="password">{{ t('personal.passWord') }}</a-radio-button>
                <a-radio-button value="keyBased">{{ t('personal.key') }}</a-radio-button>
              </a-radio-group>
            </a-form-item>
            <a-form-item :label="t('personal.userName')">
              <a-input
                v-model:value="createFrom.username"
                :placeholder="t('personal.pleaseInput')"
              />
            </a-form-item>
            <a-form-item
              v-if="createFrom.auth_type == 'password'"
              :label="t('personal.passWord')"
            >
              <a-input-password
                v-model:value="createFrom.password"
                :placeholder="t('personal.pleaseInput')"
              />
            </a-form-item>
            <a-form-item
              v-else
              :label="t('personal.key')"
            >
              <a-select
                v-model:value="createFrom.keyChain"
                placeholder="KeyChain"
                style="width: 100%"
                show-search
                :max-tag-count="4"
                :options="keyChainOptions"
                :option-filter-prop="'label'"
                :field-names="{ value: 'key', label: 'label' }"
                :allow-clear="true"
              />
            </a-form-item>
          </a-form>
        </div>

        <div class="connect-button-container">
          <a-button
            type="primary"
            class="connect-button"
            @click="isEditMode ? handleSaveAsset() : handleCreateAsset()"
          >
            {{ isEditMode ? t('personal.saveAsset') : t('personal.createAsset') }}
          </a-button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Modal, message } from 'ant-design-vue' // ← 引入 Modal

import { ref, onMounted, onBeforeUnmount, reactive, computed, watch } from 'vue'
import 'xterm/css/xterm.css'
import { deepClone } from '@/utils/util'
import {
  ToTopOutlined,
  DatabaseOutlined,
  EditOutlined,
  ApiOutlined,
  DeleteOutlined,
  SearchOutlined
} from '@ant-design/icons-vue'

import eventBus from '@/utils/eventBus'
import i18n from '@/locales'
const { t } = i18n.global

const isEditMode = ref(false)
const editingAssetUUID = ref<string | null>(null)
// 资产列表数据
interface AssetNode {
  key: string
  title: string
  favorite?: boolean
  ip?: string
  uuid?: string
  children?: AssetNode[]
  [key: string]: any
}

const assetGroups = ref<AssetNode[]>([])
const searchValue = ref('')

const defaultGroups = ref(['development', 'production', 'staging', 'testing', 'database'])

interface CreateForm {
  username: string
  password: string
  ip: string
  label: string
  group_name: string
  auth_type: string
  keyChain?: number
  port: number
}

const createFrom = reactive<CreateForm>({
  username: '',
  password: '',
  ip: '',
  label: '',
  group_name: t('personal.defaultGroup'),
  auth_type: 'password',
  keyChain: undefined,
  port: 22
})

const resetForm = () => {
  Object.assign(createFrom, {
    username: '',
    password: '',
    ip: '',
    label: '',
    group_name: t('personal.defaultGroup'),
    auth_type: 'password',
    keyChain: undefined,
    port: 22
  })
}

interface KeyChainItem {
  key: number
  label: string
}

const keyChainOptions = ref<KeyChainItem[]>([])
const isRightSectionVisible = ref(false)
const contextMenuVisible = ref(false)
const contextMenuPosition = reactive({ x: 0, y: 0 })
const selectedHost = ref<AssetNode | null>(null)
const selectedGroup = ref<AssetNode | null>(null)

// 切换右侧面板
const openNewPanel = () => {
  isEditMode.value = false
  editingAssetUUID.value = null
  resetForm()
  getAssetGroup()
  isRightSectionVisible.value = true
}

// 显示右键菜单
const showContextMenu = (event: MouseEvent, host: AssetNode, group: AssetNode) => {
  event.preventDefault()
  contextMenuPosition.x = event.clientX
  contextMenuPosition.y = event.clientY
  selectedHost.value = host
  selectedGroup.value = group
  contextMenuVisible.value = true

  // 点击其他区域关闭菜单
  const closeMenu = () => {
    contextMenuVisible.value = false
    document.removeEventListener('click', closeMenu)
  }

  setTimeout(() => {
    document.addEventListener('click', closeMenu)
  }, 0)
}

// 处理卡片点击
const handleCardClick = (host: AssetNode) => {
  console.log('Card clicked:', host)
  // 这里可以添加连接逻辑
}

// 处理连接
const handleConnect = (item) => {
  console.log('连接资产:', item)
  eventBus.emit('currentClickServer', item)
}

// 处理编辑
const handleEdit = (host: AssetNode | null) => {
  if (!host) return
  isEditMode.value = true
  editingAssetUUID.value = host.uuid || null

  let keyChain = host.key_chain_id
  console.log('keyChain: ', keyChain)
  if (keyChain === 0) {
    keyChain = undefined
  }

  // 填充表单
  Object.assign(createFrom, {
    username: host.username || '',
    password: host.password || '',
    ip: host.ip || '',
    label: host.title || '',
    group_name: host.group_name || 'Hosts',
    auth_type: host.auth_type || 'password',
    keyChain: keyChain,
    port: host.port || 22
  })

  getAssetGroup()
  // 显示右侧面板
  isRightSectionVisible.value = true
}

// 处理删除
const handleRemove = (host: AssetNode | null) => {
  if (!host || !host.uuid) return

  // 确认删除
  Modal.confirm({
    title: t('personal.deleteConfirm'),
    content: t('personal.deleteConfirmContent', { name: host.title }),
    okText: t('common.delete'),
    okType: 'danger',
    cancelText: t('common.cancel'),
    maskClosable: true,
    onOk: async () => {
      try {
        const api = window.api as any
        const res = await api.deleteAsset({ uuid: host.uuid })
        if (res?.data?.message === 'success') {
          message.success(t('personal.deleteSuccess', { name: host.title }))
          getAssetList()
        } else {
          message.error(t('personal.deleteFailure'))
        }
      } catch (err: any) {
        message.error(t('personal.deleteError', { error: err.message || '未知错误' }))
      }
    }
  })
}

const authChange = () => {
  getkeyChainData()
  if (createFrom.auth_type === 'password') {
    createFrom.keyChain = undefined
  } else {
    createFrom.password = ''
  }
}

const getkeyChainData = () => {
  const api = window.api as any

  api.getKeyChainSelect().then((res) => {
    keyChainOptions.value = res.data.keyChain
  })
}

const getAssetGroup = () => {
  const api = window.api as any

  api.getAssetGroup().then((res) => {
    defaultGroups.value = res.data.groups
  })
}

const handleCreateAsset = async () => {
  try {
    let groupName = createFrom.group_name
    if (Array.isArray(groupName) && groupName.length > 0) {
      groupName = groupName[0]
    }

    const keyChainValue: number | undefined = createFrom.keyChain

    const cleanForm = {
      username: createFrom.username,
      password: createFrom.password,
      ip: createFrom.ip,
      label: createFrom.label || createFrom.ip,
      group_name: groupName,
      auth_type: createFrom.auth_type,
      keyChain: keyChainValue,
      port: createFrom.port
    }
    const api = window.api as any
    const result = await api.createAsset({ form: cleanForm })
    if (result && result.data && result.data.message === 'success') {
      // Reset form after successful creation
      Object.assign(createFrom, {
        username: '',
        password: '',
        ip: '',
        label: '',
        group_name: 'Hosts',
        auth_type: 'password',
        keyChain: undefined,
        port: 22
      })

      isRightSectionVisible.value = false
      message.success(t('personal.createSuccess'))
      resetForm()
      isRightSectionVisible.value = false
      getAssetList()
    } else {
      throw new Error('Failed to create asset')
    }
  } catch (error) {
    console.error('创建资产出错:', error)
  }
}

const handleSaveAsset = async () => {
  if (!editingAssetUUID.value) return message.error('缺少资产 ID')

  // 处理group_name可能是数组的情况
  let groupName = createFrom.group_name
  if (Array.isArray(groupName) && groupName.length > 0) {
    groupName = groupName[0]
  }

  // 处理keyChain可能为空的情况
  const keyChainValue: number | undefined = createFrom.keyChain

  const cleanForm = {
    uuid: editingAssetUUID.value,
    username: createFrom.username,
    password: createFrom.password,
    ip: createFrom.ip,
    label: createFrom.label || createFrom.ip,
    group_name: groupName,
    auth_type: createFrom.auth_type,
    keyChain: keyChainValue,
    port: createFrom.port
  }
  console.log(cleanForm)

  try {
    const api = window.api as any

    const res = await api.updateAsset({ form: cleanForm })
    if (res?.data?.message === 'success') {
      message.success(t('personal.saveSuccess'))
      isRightSectionVisible.value = false
      getAssetList()
    } else {
      throw new Error('保存失败')
    }
  } catch (e: any) {
    message.error(e.message || t('personal.saveError'))
  }
}

// 获取资产列表
const getAssetList = () => {
  window.api
    .getLocalAssetRoute({ searchType: 'assetConfig', params: [] })
    .then((res) => {
      if (res && res.data) {
        const data = res.data.routers || []
        assetGroups.value = deepClone(data) as AssetNode[]
      } else {
        assetGroups.value = []
      }
    })
    .catch((err) => console.error(err))
}

// 过滤资产列表
const filteredAssetGroups = computed(() => {
  if (!searchValue.value.trim()) return assetGroups.value

  const lowerCaseInput = searchValue.value.toLowerCase()

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

  return filterNodes(deepClone(assetGroups.value) as AssetNode[])
})

// 搜索处理
const handleSearch = () => {
  // 搜索逻辑已通过计算属性 filteredAssetGroups 实现
}

// 点击页面关闭右键菜单
const handleDocumentClick = () => {
  if (contextMenuVisible.value) {
    contextMenuVisible.value = false
  }
}

onMounted(() => {
  getAssetList()
  getkeyChainData()

  // 添加全局点击事件监听
  document.addEventListener('click', handleDocumentClick)
})

onBeforeUnmount(() => {
  // 移除全局事件监听
  document.removeEventListener('click', handleDocumentClick)
  document.removeEventListener('contextmenu', () => {
    contextMenuVisible.value = false
  })
})

watch(isRightSectionVisible, (val) => {
  if (!val) {
    resetForm()
    isEditMode.value = false
    editingAssetUUID.value = null
  }
})
</script>

<style lang="less" scoped>
.workspace-button {
  font-size: 14px;
  height: 30px;
  display: flex;
  align-items: center;
  background-color: #1677ff;
  border-color: #1677ff;

  &:hover {
    background-color: #398bff;
    border-color: #398bff;
  }

  &:active {
    background-color: rgb(130, 134, 155);
    border-color: rgb(130, 134, 155);
  }
}

.asset-config-container {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.split-layout {
  display: flex;
  width: 100%;
  height: 100%;
  position: relative;
  flex: 1;
  overflow: hidden;
  justify-content: flex-start;
}

.left-section {
  flex: 1 1 auto;
  position: relative;
  transition: all 0.3s ease;
  padding: 10px;
  overflow-y: auto;
  background-color: #141414;
  width: 100%; /* 确保左侧部分占满可用空间 */
}

.search-container {
  margin-bottom: 20px;
  display: flex;
  width: 60%;
}

.search-input {
  background-color: #2c2c2c;
  border-color: #2c2c2c;
  color: white;
  :deep(.ant-input) {
    background-color: #2c2c2c;
    color: white;

    &::placeholder {
      color: rgba(255, 255, 255, 0.5);
    }
  }

  :deep(.ant-input-prefix) {
    color: rgba(255, 255, 255, 0.7);
    margin-right: 8px;
  }
}

.toggle-btn {
  margin-left: 0.5em;
}

.asset-list-container {
  width: 100%;
}

.group-title {
  font-size: 16px;
  font-weight: bold;
  color: white;
  margin-bottom: 12px;
  margin-top: 20px;
}

.group-cards,
.host-cards {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 20px;
}

/* 当右侧面板关闭时，显示更多卡片 */
.host-cards.wide-layout {
  .card-wrapper {
    width: calc(33.33% - 8px); /* 一行显示3个 */
  }
}

/* 当右侧面板打开时，显示较少卡片 */
.host-cards:not(.wide-layout) {
  .card-wrapper {
    width: calc(50% - 6px); /* 一行显示2个 */
  }
}

/* 卡片包装器，用于控制宽度 */
.card-wrapper {
  margin-bottom: 0;
  transition: width 0.3s ease;
}

/* 移动端适配 */
@media (max-width: 768px) {
  .host-cards {
    .card-wrapper {
      width: 100% !important; /* 小屏幕一行显示1个 */
    }
  }
}

.group-card,
.host-card {
  position: relative;
  padding-right: 36px;
  background-color: #2c2c2c;
  border-radius: 8px;
  overflow: hidden;
  cursor: pointer;
  transition: all 0.3s ease;

  &:hover {
    background-color: #383838;
  }

  :deep(.ant-card-body) {
    padding: 12px;
  }
}
.edit-icon {
  position: absolute;
  top: 50%;
  right: 24px;
  transform: translateY(-50%);
  color: rgba(255, 255, 255, 0.6);
  font-size: 22px;
  opacity: 0;
  pointer-events: none;
  transition:
    opacity 0.2s ease,
    color 0.2s ease;
}

.host-card:hover .edit-icon {
  opacity: 1;
  pointer-events: auto; // 允许点击
}

.edit-icon:hover {
  color: #1890ff;
}

.group-card-content,
.host-card-content {
  display: flex;
  align-items: center;
  min-height: 60px; /* 确保卡片有最小高度 */
}

.group-icon,
.host-icon {
  width: 40px;
  height: 40px;
  min-width: 40px; /* 确保图标不会被压缩 */
  display: flex;
  align-items: center;
  justify-content: center;
  color: #1890ff;
  margin-right: 12px;
}

.group-info,
.host-info {
  flex: 1;
  overflow: hidden; /* 防止内容溢出 */
}

.group-name,
.host-name {
  font-size: 14px;
  font-weight: bold;
  color: white;
  margin-bottom: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis; /* 文本过长时显示省略号 */
}

.group-count,
.host-type {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.6);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis; /* 文本过长时显示省略号 */
}

.search-card {
  border: 1px dashed rgba(255, 255, 255, 0.2);
  background-color: rgba(44, 44, 44, 0.5);

  .host-name {
    color: rgba(255, 255, 255, 0.5);
  }
}

.right-section {
  flex: 0 0 30%;
  background: #141414;
  transition: all 0.3s ease;
  height: 100%;
  display: flex;
  flex-direction: column;
  box-sizing: border-box; /* 确保内边距不会增加元素的总尺寸 */
  padding: 0;
  overflow: hidden;
  max-width: 30%; /* 限制最大宽度 */
  min-width: 300px;
}

.right-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 16px 16px 0 16px;
  flex-shrink: 0;
}

.right-section-content {
  color: #ffffff;
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 16px 16px 0 16px;
  overflow: auto;
  height: calc(100% - 40px);
}

.right-section.collapsed {
  flex: 0 0 0 !important;
  width: 0 !important;
  max-width: 0 !important;
  min-width: 0 !important;
  flex: 0 !important;
  border-left: 0 !important;
  padding: 0;
  margin: 0;
  opacity: 0;
  visibility: hidden;
  overflow: hidden;
  pointer-events: none;
}

.top-icon {
  &:hover {
    color: #52c41a;
    transition: color 0.3s;
  }
}

.connect-button-container {
  width: 100%;
  padding: 16px;
  margin-top: auto;
  flex-shrink: 0;
  position: sticky;
  bottom: 0;
  // background-color: #2c2c2c;
  // border-top: 1px solid rgba(255, 255, 255, 0.1);
}

.connect-button {
  width: 100%;
  height: 40px;
  font-size: 16px;
  border-radius: 4px;
  background-color: #1890ff;
  border-color: #1890ff;

  &:hover {
    background-color: #40a9ff;
    border-color: #40a9ff;
  }
}

/* 右键菜单样式 */
.context-menu {
  position: fixed;
  z-index: 1000;
  background-color: #2c2c2c;
  border-radius: 4px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.5);
  min-width: 150px;
  padding: 5px 0;
}

.context-menu-item {
  display: flex;
  align-items: center;
  padding: 8px 16px;
  cursor: pointer;
  color: white;
  transition: background-color 0.2s;

  &:hover {
    background-color: #383838;
  }

  &.delete {
    color: #ff4d4f;

    &:hover {
      background-color: rgba(255, 77, 79, 0.15);
    }
  }
}

.context-menu-icon {
  margin-right: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
}
.custom-form {
  color: rgba(255, 255, 255, 0.85);
  :deep(.ant-form-item-label) {
    min-width: 250px;
  }
}
:deep(.ant-form-item) {
  color: rgba(255, 255, 255, 0.65);
}
.custom-form :deep(.ant-input),
.custom-form :deep(.ant-input-password),
.custom-form :deep(.ant-select-selector),
.custom-form :deep(.ant-input-number-input) {
  color: rgba(255, 255, 255, 0.85);
  background-color: transparent !important; /* 设置背景透明 */
  border-color: rgba(255, 255, 255, 0.2) !important;
  &::placeholder {
    color: rgba(255, 255, 255, 0.6);
  }
}
.custom-form :deep(.ant-radio-button-wrapper) {
  background: transparent !important;
  color: rgba(255, 255, 255, 0.85);
  .ant-radio-button-checked {
    border: #1677ff;
  }
}
.custom-form :deep(.ant-radio-button-wrapper-checked) {
  color: #1677ff;
}

.custom-form :deep(.ant-select-selector),
.custom-form :deep(.anticon.ant-input-password-icon),
.custom-form :deep(.ant-select-arrow) {
  color: rgba(255, 255, 255, 0.85);
}
.general-group :deep(.ant-select-selection-item) {
  background-color: rgba(255, 255, 255, 0.25);
}
.formTitle {
  display: flex;
  flex-direction: row;
  align-items: center;
  margin-bottom: 0.5em;
  .titleHeader {
    width: 2px;
    height: 14px;
    background: #1677ff;
    margin-right: 4px;
  }
}
</style>
