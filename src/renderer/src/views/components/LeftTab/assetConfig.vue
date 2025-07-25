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
                      <div
                        v-if="host.asset_type === 'organization'"
                        class="enterprise-indicator"
                      >
                        <ApiOutlined />
                      </div>
                    </div>
                    <div class="host-info">
                      <div class="host-name">{{ host.title }}</div>
                      <div class="host-type">{{ t('personal.hostType') }}{{ host.username ? ', ' + host.username : '' }}</div>
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
                  v-if="selectedHost?.asset_type !== 'organization'"
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
                  v-if="selectedHost?.asset_type === 'organization'"
                  class="context-menu-item"
                  @click="handleRefreshOrganizationAssets(selectedHost)"
                >
                  <div class="context-menu-icon"><ReloadOutlined /></div>
                  <div>{{ t('personal.refreshAssets') }}</div>
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
            <a-form-item v-if="!isEditMode">
              <a-radio-group
                v-model:value="createFrom.asset_type"
                button-style="solid"
                style="width: 100%"
              >
                <a-radio-button value="person">{{ t('personal.personalAsset') }}</a-radio-button>
                <a-radio-button value="organization">
                  <a-tooltip :title="t('personal.organizationTip')">
                    {{ t('personal.enterpriseAsset') }}
                  </a-tooltip>
                </a-radio-button>
              </a-radio-group>
            </a-form-item>
            <div class="formTitle">
              <div class="titleHeader"></div>
              {{ t('personal.address') }}</div
            >
            <a-form-item :label="t('personal.remoteHost')">
              <a-input
                v-model:value="createFrom.ip"
                :placeholder="t('personal.pleaseInputRemoteHost')"
              />
            </a-form-item>
            <a-form-item :label="t('personal.port')">
              <a-input
                v-model:value="createFrom.port"
                :min="20"
                :max="65536"
                :placeholder="t('personal.pleaseInputPort')"
                style="width: 100%"
              />
            </a-form-item>
            <a-form-item
              v-if="createFrom.asset_type === 'person'"
              :label="t('personal.verificationMethod')"
            >
              <a-radio-group
                v-model:value="createFrom.auth_type"
                button-style="solid"
                style="width: 100%"
                @change="authChange"
              >
                <a-radio-button value="password">{{ t('personal.password') }}</a-radio-button>
                <a-radio-button value="keyBased">{{ t('personal.key') }}</a-radio-button>
              </a-radio-group>
            </a-form-item>
            <a-form-item :label="t('personal.username')">
              <a-input
                v-model:value="createFrom.username"
                :placeholder="t('personal.pleaseInputUsername')"
              />
            </a-form-item>
            <a-form-item
              v-if="createFrom.auth_type == 'password'"
              :label="t('personal.password')"
            >
              <a-input-password
                v-model:value="createFrom.password"
                :placeholder="t('personal.pleaseInputPassword')"
              />
            </a-form-item>
            <template v-if="createFrom.auth_type === 'keyBased'">
              <a-form-item :label="t('personal.key')">
                <a-select
                  v-model:value="createFrom.keyChain"
                  :placeholder="t('personal.pleaseSelectKeychain')"
                  style="width: 100%"
                  show-search
                  :max-tag-count="4"
                  :options="keyChainOptions"
                  :option-filter-prop="'label'"
                  :field-names="{ value: 'key', label: 'label' }"
                  :allow-clear="true"
                >
                  <template #notFoundContent>
                    <div style="text-align: center; width: 100%">
                      <a-button
                        type="link"
                        @click="addKeychain"
                        >{{ t('keyChain.newKey') }}</a-button
                      >
                    </div>
                  </template>
                </a-select>
              </a-form-item>
              <a-form-item
                v-if="createFrom.asset_type === 'organization'"
                :label="t('personal.password')"
              >
                <a-input-password
                  v-model:value="createFrom.password"
                  :placeholder="t('personal.pleaseInputPassword')"
                />
              </a-form-item>
            </template>

            <div class="formTitle">
              <div class="titleHeader"></div>
              {{ t('personal.general') }}</div
            >
            <a-form-item :label="t('personal.alias')">
              <a-input
                v-model:value="createFrom.label"
                :placeholder="t('personal.pleaseInputAlias')"
              />
            </a-form-item>
            <a-form-item
              :label="t('personal.group')"
              class="general-group"
            >
              <a-select
                v-model:value="createFrom.group_name"
                mode="tags"
                :placeholder="t('personal.pleaseSelectGroup')"
                :max-tag-count="2"
                style="width: 100%"
                @change="(val: SelectValue) => (createFrom.group_name = Array.isArray(val) && val.length > 0 ? String(val[val.length - 1]) : '')"
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

  <!-- 二次验证弹窗 -->
  <a-modal
    v-model:visible="showOtpDialog"
    title="二次验证"
    width="30%"
    :mask-closable="false"
    :keyboard="false"
  >
    <div>
      <p>{{ otpPrompt || '请输入验证码' }}</p>
      <a-input-password
        v-model:value="otpCode"
        placeholder="验证码"
        :visibility-toggle="false"
        @press-enter="submitOtpCode"
      />
      <span
        v-show="showOtpDialogErr"
        style="color: red"
        >验证码错误</span
      >
      <span
        v-show="showOtpDialogCheckErr"
        style="color: red"
        >请输入验证码</span
      >
    </div>
    <template #footer>
      <a-button
        key="submit"
        @click="cancelOtp"
        >取消</a-button
      >
      <a-button
        type="primary"
        @click="submitOtpCode"
        >确认
      </a-button>
    </template>
  </a-modal>
</template>

<script setup lang="ts">
import { Modal, message } from 'ant-design-vue'
import type { SelectValue } from 'ant-design-vue/es/select'
import { ref, onMounted, onBeforeUnmount, reactive, computed, watch } from 'vue'
import 'xterm/css/xterm.css'
import { deepClone } from '@/utils/util'
import { ToTopOutlined, DatabaseOutlined, EditOutlined, ApiOutlined, DeleteOutlined, SearchOutlined, ReloadOutlined } from '@ant-design/icons-vue'
import eventBus from '@/utils/eventBus'
import i18n from '@/locales'
const { t } = i18n.global

const isEditMode = ref(false)
const editingAssetUUID = ref<string | null>(null)
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
  asset_type: string
}

const createFrom = reactive<CreateForm>({
  username: '',
  password: '',
  ip: '',
  label: '',
  group_name: t('personal.defaultGroup'),
  auth_type: 'password',
  keyChain: undefined,
  port: 22,
  asset_type: 'person'
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
    port: 22,
    asset_type: 'person'
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

// 二次验证相关变量
const showOtpDialog = ref(false)
const showOtpDialogErr = ref(false)
const showOtpDialogCheckErr = ref(false)
const otpPrompt = ref('')
const otpCode = ref('')
const currentOtpId = ref<string | null>(null)
const otpAttempts = ref(0)
const MAX_OTP_ATTEMPTS = 5

// 二次验证监听器
let removeOtpRequestListener = (): void => {}
let removeOtpTimeoutListener = (): void => {}
let removeOtpResultListener = (): void => {}

const openNewPanel = () => {
  isEditMode.value = false
  editingAssetUUID.value = null
  resetForm()
  getAssetGroup()
  if (createFrom.auth_type === 'keyBased') {
    getkeyChainData()
  }
  // 在打开新面板时重置二次验证状态
  resetOtpConnection()
  isRightSectionVisible.value = true
}

const showContextMenu = (event: MouseEvent, host: AssetNode, group: AssetNode) => {
  event.preventDefault()
  contextMenuPosition.x = event.clientX
  contextMenuPosition.y = event.clientY
  selectedHost.value = host
  selectedGroup.value = group
  contextMenuVisible.value = true

  const closeMenu = () => {
    contextMenuVisible.value = false
    document.removeEventListener('click', closeMenu)
  }

  setTimeout(() => {
    document.addEventListener('click', closeMenu)
  }, 0)
}

const handleCardClick = (host: AssetNode) => {
  console.log('Card clicked:', host)
}

const handleConnect = (item) => {
  console.log('连接资产:', item)
  // 在连接前重置二次验证状态，确保每次连接都是全新的
  resetOtpConnection()
  eventBus.emit('currentClickServer', item)
}

const handleEdit = (host: AssetNode | null) => {
  if (!host) return
  isEditMode.value = true
  editingAssetUUID.value = host.uuid || null

  let keyChain = host.key_chain_id
  console.log('keyChain: ', keyChain)
  if (keyChain === 0) {
    keyChain = undefined
  }

  Object.assign(createFrom, {
    username: host.username || '',
    password: host.password || '',
    ip: host.ip || '',
    label: host.title || '',
    group_name: host.group_name || 'Hosts',
    auth_type: host.auth_type || 'password',
    keyChain: keyChain,
    port: host.port || 22,
    asset_type: host.asset_type || 'person'
  })

  getAssetGroup()
  if (createFrom.auth_type === 'keyBased') {
    getkeyChainData()
  }
  // 在编辑时重置二次验证状态
  resetOtpConnection()
  isRightSectionVisible.value = true
}

const handleRemove = (host: AssetNode | null) => {
  if (!host || !host.uuid) return
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
          eventBus.emit('LocalAssetMenu')
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
  if (createFrom.auth_type === 'keyBased') {
    getkeyChainData()
  }
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
      port: createFrom.port,
      asset_type: createFrom.asset_type
    }
    const api = window.api as any
    const result = await api.createAsset({ form: cleanForm })
    if (result && result.data && result.data.message === 'success') {
      Object.assign(createFrom, {
        username: '',
        password: '',
        ip: '',
        label: '',
        group_name: 'Hosts',
        auth_type: 'password',
        keyChain: undefined,
        port: 22,
        asset_type: 'person'
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
  eventBus.emit('LocalAssetMenu')
}

const handleSaveAsset = async () => {
  if (!editingAssetUUID.value) return message.error('缺少资产 ID')

  let groupName = createFrom.group_name
  if (Array.isArray(groupName) && groupName.length > 0) {
    groupName = groupName[0]
  }

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
    port: createFrom.port,
    asset_type: createFrom.asset_type
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
  eventBus.emit('LocalAssetMenu')
}

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

const handleSearch = () => {}

const handleDocumentClick = () => {
  if (contextMenuVisible.value) {
    contextMenuVisible.value = false
  }
}

const addKeychain = () => {
  eventBus.emit('openUserTab', 'keyChainConfig')
}

onMounted(() => {
  getAssetList()
  getkeyChainData()
  document.addEventListener('click', handleDocumentClick)
  eventBus.on('keyChainUpdated', () => {
    getkeyChainData()
  })

  // 设置二次验证监听器
  const api = window.api as any
  removeOtpRequestListener = api.onKeyboardInteractiveRequest(handleOtpRequest)
  removeOtpTimeoutListener = api.onKeyboardInteractiveTimeout(handleOtpTimeout)
  removeOtpResultListener = api.onKeyboardInteractiveResult(handleOtpError)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', handleDocumentClick)
  eventBus.off('keyChainUpdated')

  // 清理二次验证监听器
  if (typeof removeOtpRequestListener === 'function') removeOtpRequestListener()
  if (typeof removeOtpTimeoutListener === 'function') removeOtpTimeoutListener()
  if (typeof removeOtpResultListener === 'function') removeOtpResultListener()
})

watch(isRightSectionVisible, (val) => {
  if (!val) {
    resetForm()
    isEditMode.value = false
    editingAssetUUID.value = null
  }
})

watch(
  () => createFrom.auth_type,
  (newAuthType) => {
    if (newAuthType === 'keyBased') {
      getkeyChainData()
    }
  }
)

watch(
  () => createFrom.asset_type,
  (newAssetType) => {
    if (newAssetType === 'organization') {
      createFrom.auth_type = 'keyBased'
    } else {
      createFrom.auth_type = 'password'
    }
  }
)

watch(
  [isEditMode, () => createFrom.asset_type],
  ([editing, assetType]) => {
    if (editing && assetType === 'organization') {
      createFrom.auth_type = 'keyBased'
    }
  },
  { immediate: true }
)

// 刷新企业资产函数
const handleRefreshOrganizationAssets = async (host: AssetNode | null) => {
  if (!host || host.asset_type !== 'organization') return

  // 在开始刷新前，先清理之前的二次验证监听器和状态
  resetOtpConnection()

  const hide = message.loading(t('personal.refreshingAssets'), 0)

  try {
    const api = window.api as any
    const result = await api.refreshOrganizationAssets({
      organizationUuid: host.uuid,
      jumpServerConfig: {
        host: host.ip,
        port: host.port || 22,
        username: host.username,
        password: host.password,
        keyChain: host.key_chain_id
      }
    })
    console.log('刷新企业资产结果:', result)
    if (result?.data?.message === 'success') {
      hide() // 只隐藏加载消息
      message.success(t('personal.refreshSuccess'))
      getAssetList() // 刷新资产列表
      eventBus.emit('LocalAssetMenu')
    } else {
      throw new Error('刷新失败')
    }
  } catch (error) {
    console.error('刷新企业资产失败:', error)
    hide() // 隐藏加载消息
    message.error(t('personal.refreshError'))
  }

  contextMenuVisible.value = false
}

// 二次验证处理方法
const handleOtpRequest = (data: any) => {
  currentOtpId.value = data.id
  otpPrompt.value = data.prompts.join('\n')
  showOtpDialog.value = true
  showOtpDialogErr.value = false
  showOtpDialogCheckErr.value = false
  otpAttempts.value = 0
}

const handleOtpError = (data: any) => {
  if (data.id === currentOtpId.value) {
    if (data.status === 'success') {
      closeOtp()
    } else {
      showOtpDialogErr.value = true
      otpAttempts.value += 1
      otpCode.value = ''
      if (otpAttempts.value >= MAX_OTP_ATTEMPTS) {
        showOtpDialog.value = false
        cancelOtp()
      }
    }
  }
}

const submitOtpCode = () => {
  showOtpDialogCheckErr.value = false
  showOtpDialogErr.value = false
  if (otpCode.value && currentOtpId.value) {
    const api = window.api as any
    api.submitKeyboardInteractiveResponse(currentOtpId.value, otpCode.value)
  } else {
    showOtpDialogCheckErr.value = true
  }
}

const cancelOtp = () => {
  if (currentOtpId.value) {
    const api = window.api as any
    api.cancelKeyboardInteractive(currentOtpId.value)
    if (typeof removeOtpRequestListener === 'function') removeOtpRequestListener()
    if (typeof removeOtpTimeoutListener === 'function') removeOtpTimeoutListener()
    if (typeof removeOtpResultListener === 'function') removeOtpResultListener()
    resetOtpDialog()
  }
}

const closeOtp = () => {
  if (currentOtpId.value) {
    if (typeof removeOtpRequestListener === 'function') removeOtpRequestListener()
    if (typeof removeOtpTimeoutListener === 'function') removeOtpTimeoutListener()
    if (typeof removeOtpResultListener === 'function') removeOtpResultListener()
    resetOtpDialog()
  }
}

const resetOtpDialog = () => {
  showOtpDialog.value = false
  showOtpDialogErr.value = false
  showOtpDialogCheckErr.value = false
  otpPrompt.value = ''
  otpCode.value = ''
  currentOtpId.value = null
}

// 重置二次验证连接状态
const resetOtpConnection = () => {
  // 先清理现有的监听器
  if (typeof removeOtpRequestListener === 'function') removeOtpRequestListener()
  if (typeof removeOtpTimeoutListener === 'function') removeOtpTimeoutListener()
  if (typeof removeOtpResultListener === 'function') removeOtpResultListener()

  // 重置二次验证相关状态
  resetOtpDialog()

  // 重新设置监听器
  const api = window.api as any
  removeOtpRequestListener = api.onKeyboardInteractiveRequest(handleOtpRequest)
  removeOtpTimeoutListener = api.onKeyboardInteractiveTimeout(handleOtpTimeout)
  removeOtpResultListener = api.onKeyboardInteractiveResult(handleOtpError)
}

const handleOtpTimeout = (data: any) => {
  if (data.id === currentOtpId.value && showOtpDialog.value) {
    resetOtpDialog()
  }
}
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
  background-color: var(--bg-color);
  width: 100%; /* 确保左侧部分占满可用空间 */
}

.search-container {
  margin-bottom: 12px;
  display: flex;
  width: 60%;
}

.search-input {
  background-color: var(--bg-color-secondary);
  border-color: var(--border-color);
  color: var(--text-color);
  :deep(.ant-input) {
    background-color: var(--bg-color-secondary);
    color: var(--text-color);
    height: 20px;

    &::placeholder {
      color: var(--text-color-tertiary);
    }
  }

  :deep(.ant-input-prefix) {
    color: var(--text-color-secondary);
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
  font-size: 14px;
  font-weight: bold;
  color: var(--text-color);
  margin-bottom: 8px;
  margin-top: 16px;
}

.group-cards,
.host-cards {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 16px;
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

.host-card {
  position: relative;
  padding-right: 36px;
  background-color: var(--bg-color-secondary);
  border-radius: 6px;
  overflow: hidden;
  cursor: pointer;
  transition: all 0.3s ease;

  &:hover {
    background-color: var(--hover-bg-color);
  }

  :deep(.ant-card-body) {
    padding: 8px 12px;
  }
}
.edit-icon {
  position: absolute;
  top: 50%;
  right: 24px;
  transform: translateY(-50%);
  color: var(--text-color-tertiary);
  font-size: 22px;
  opacity: 0;
  pointer-events: none;
  transition:
    opacity 0.2s ease,
    color 0.2s ease;
}

.host-card:hover .edit-icon {
  opacity: 1;
  pointer-events: auto;
}

.edit-icon:hover {
  color: #1890ff;
}

.group-card-content,
.host-card-content {
  display: flex;
  align-items: center;
  min-height: 48px;
}

.group-icon,
.host-icon {
  width: 32px;
  height: 32px;
  min-width: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #1890ff;
  margin-right: 8px;
  position: relative;
}

.enterprise-indicator {
  position: absolute;
  top: -6px;
  left: -6px;
  width: 14px;
  height: 14px;
  background-color: #1890ff;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--bg-color);

  :deep(.anticon) {
    font-size: 8px;
    color: white;
  }
}

.group-info,
.host-info {
  flex: 1;
  overflow: hidden; /* 防止内容溢出 */
}

.group-name,
.host-name {
  font-size: 13px;
  font-weight: bold;
  color: var(--text-color);
  margin-bottom: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.group-count,
.host-type {
  font-size: 12px;
  color: var(--text-color-tertiary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.search-card {
  border: 1px dashed var(--border-color);
  background-color: var(--bg-color-secondary);

  .host-name {
    color: var(--text-color-tertiary);
  }
}

.right-section {
  flex: 0 0 30%;
  background: var(--bg-color);
  transition: all 0.3s ease;
  height: 100%;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  padding: 0;
  overflow: hidden;
  max-width: 30%;
  min-width: 300px;
}

.right-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 12px 16px 0 16px;
  flex-shrink: 0;
}

.right-section-content {
  color: var(--text-color);
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 12px 16px 0 16px;
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
  padding: 12px 16px;
  margin-top: auto;
  flex-shrink: 0;
  position: sticky;
  bottom: 0;
}

.connect-button {
  width: 100%;
  height: 36px;
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
  background-color: var(--bg-color);
  border-radius: 4px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  min-width: 150px;
  padding: 5px 0;
}

.context-menu-item {
  display: flex;
  align-items: center;
  padding: 8px 16px;
  cursor: pointer;
  color: var(--text-color);
  transition: background-color 0.2s;

  &:hover {
    background-color: var(--hover-bg-color);
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
  color: var(--text-color);
  :deep(.ant-form-item) {
    margin-bottom: 12px;
  }
  :deep(.ant-form-item-label) {
    min-width: 250px;
    padding-bottom: 4px;
    > label {
      color: var(--text-color);
    }
  }
}
:deep(.ant-form-item) {
  color: var(--text-color-secondary);
}

:global(.light-theme) {
  .custom-form {
    :deep(.ant-form-item-label > label) {
      color: rgba(0, 0, 0, 0.85) !important;
    }
  }
}

.custom-form :deep(.ant-input),
.custom-form :deep(.ant-input-password),
.custom-form :deep(.ant-select-selector),
.custom-form :deep(.ant-input-number-input) {
  color: var(--text-color);
  background-color: var(--bg-color) !important;
  border-color: var(--border-color) !important;
  &::placeholder {
    color: var(--text-color-tertiary);
  }
}
.custom-form :deep(.ant-select-selection-placeholder) {
  color: var(--text-color-tertiary);
}
.custom-form :deep(.ant-radio-button-wrapper) {
  background: var(--bg-color) !important;
  color: var(--text-color);
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
  color: var(--text-color);
}
.general-group :deep(.ant-select-selection-item) {
  background-color: var(--hover-bg-color);
}
.formTitle {
  display: flex;
  flex-direction: row;
  align-items: center;
  margin-bottom: 0.5em;
  margin-top: 8px;
  .titleHeader {
    width: 2px;
    height: 12px;
    background: #1677ff;
    margin-right: 4px;
  }
}
</style>
