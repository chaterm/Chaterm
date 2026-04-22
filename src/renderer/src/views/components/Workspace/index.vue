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
            ref="searchInputRef"
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
          <a-tooltip
            :title="showIpMode ? t('personal.showHostname') : t('personal.showIp')"
            placement="top"
          >
            <a-button
              type="primary"
              size="small"
              class="workspace-button"
              @click="toggleDisplayMode"
            >
              <swap-outlined />
            </a-button>
          </a-tooltip>
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

        <div
          ref="treeContainerRef"
          class="tree-container"
        >
          <div v-show="company === 'personal_user_id'">
            <a-tree
              v-model:selected-keys="selectedKeys"
              v-model:expanded-keys="expandedKeys"
              :tree-data="assetTreeData"
              :field-names="{ children: 'children', title: 'title', key: 'key' }"
              :virtual="true"
              :height="treeHeight"
              block-node
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
                    <span class="hostname-text">{{ getDisplayText(dataRef, title) }}</span>

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
                    <a-tooltip
                      v-if="hasTunnelConfig(dataRef)"
                      :title="isTunnelActive(dataRef) ? t('ssh.tunnelConnected') : t('ssh.tunnelCreated')"
                    >
                      <ApiOutlined
                        class="tunnel-icon"
                        :class="{ active: isTunnelActive(dataRef) }"
                      />
                    </a-tooltip>
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
              :virtual="true"
              :height="treeHeight"
              block-node
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
                    <span class="hostname-text">{{ getDisplayText(dataRef, title) }}</span>
                    <span
                      v-if="dataRef.comment"
                      class="comment-text"
                      :title="dataRef.comment"
                    >
                      ({{ dataRef.comment }})
                    </span>
                    <a-tooltip
                      v-if="hasTunnelConfig(dataRef)"
                      :title="isTunnelActive(dataRef) ? t('ssh.tunnelConnected') : t('ssh.tunnelCreated')"
                    >
                      <ApiOutlined
                        class="tunnel-icon"
                        :class="{ active: isTunnelActive(dataRef) }"
                      />
                    </a-tooltip>
                  </span>
                  <!-- Comment edit input -->
                  <span
                    v-else-if="commentNode === dataRef.key"
                    class="title-with-icon"
                  >
                    <laptop-outlined class="computer-icon" />
                    <span class="hostname-text">{{ getDisplayText(dataRef, title) }}</span>
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
                      dataRef.asset_type !== 'custom_folder' &&
                      dataRef.asset_type !== 'recent_connections' &&
                      !dataRef.isAssetGroup
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

  <!-- Create folder modal -->
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

  <Modal
    v-model:open="showTunnelListModal"
    :footer="null"
    @cancel="handleCloseTunnelListModal"
  >
    <template #title>
      <span class="tunnel-modal-title">
        <span>{{ t('ssh.tunnel') }}</span>
        <a-tooltip
          placement="right"
          overlay-class-name="tunnel-help-tooltip"
        >
          <template #title>
            <div class="tunnel-tooltip-content">
              <div class="tunnel-tooltip-title">{{ t('ssh.tunnelHelpTitle') }}</div>
              <div
                v-for="item in tunnelTypeHelpList"
                :key="item.type"
                class="tunnel-help-item"
              >
                <span class="tunnel-help-item-title">{{ item.label }}:</span>
                <span>{{ item.help }}</span>
              </div>
            </div>
          </template>
          <QuestionCircleOutlined class="tunnel-help-trigger" />
        </a-tooltip>
      </span>
    </template>
    <div class="tunnel-list-toolbar">
      <div class="tunnel-list-header-left">
        <span class="tunnel-list-title">{{ tunnelListAssetName }}</span>
      </div>
      <a-button
        type="primary"
        size="small"
        @click="handleCreateTunnelFromList"
      >
        {{ t('ssh.addTunnel') }}
      </a-button>
    </div>

    <div
      v-if="currentAssetTunnelConfigs.length === 0"
      class="tunnel-empty"
    >
      {{ t('ssh.noTunnelConfig') }}
    </div>
    <div
      v-else
      class="tunnel-list"
    >
      <div
        v-for="item in currentAssetTunnelConfigs"
        :key="item.id"
        class="tunnel-list-item"
      >
        <div class="tunnel-list-main">
          <span class="tunnel-list-type">{{ getTunnelTypeLabel(item.type) }}</span>
          <span class="tunnel-list-port">{{ formatTunnelPorts(item) }}</span>
          <span
            v-if="item.description"
            class="tunnel-list-desc"
          >
            {{ item.description }}
          </span>
        </div>
        <div class="tunnel-list-actions">
          <a-button
            type="link"
            size="small"
            @click="handleEditTunnelFromList(item.id)"
          >
            {{ t('ssh.edit') }}
          </a-button>
          <a-popconfirm
            :title="t('ssh.deleteTunnelConfirm')"
            :ok-text="t('ssh.delete')"
            :cancel-text="t('common.cancel')"
            @confirm="handleDeleteTunnelFromList(item.id)"
          >
            <a-button
              type="link"
              size="small"
              danger
            >
              {{ t('ssh.delete') }}
            </a-button>
          </a-popconfirm>
        </div>
      </div>
    </div>
  </Modal>

  <Modal
    v-model:open="showTunnelModal"
    :title="editingTunnelId ? t('ssh.editTunnel') : t('ssh.addTunnel')"
    @ok="handleSaveTunnelConfig"
    @cancel="handleCancelTunnelConfig"
  >
    <div class="tunnel-form-row">
      <label>{{ t('ssh.tunnelType') }}:</label>
      <a-select
        v-model:value="tunnelForm.type"
        :options="tunnelTypeOptions"
        @change="handleTunnelTypeChange"
      />
    </div>

    <template v-if="tunnelForm.type !== 'dynamic_socks'">
      <div class="tunnel-form-row">
        <label>{{ t('ssh.localPort') }}:</label>
        <a-auto-complete
          v-model:value="tunnelForm.localPort"
          :options="getTunnelPortPresetOptions('localPort')"
          @change="handleTunnelPortChange('localPort', $event)"
          @search="handleTunnelPortSearch('localPort', $event)"
          @select="handleTunnelPortPresetSelect"
          @focus="handleTunnelPortFocus('localPort')"
        />
      </div>
      <div class="tunnel-form-row">
        <label>{{ t('ssh.remotePort') }}:</label>
        <a-auto-complete
          v-model:value="tunnelForm.remotePort"
          :options="getTunnelPortPresetOptions('remotePort')"
          @change="handleTunnelPortChange('remotePort', $event)"
          @search="handleTunnelPortSearch('remotePort', $event)"
          @select="handleTunnelPortPresetSelect"
          @focus="handleTunnelPortFocus('remotePort')"
        />
      </div>
    </template>

    <div
      v-else
      class="tunnel-form-row"
    >
      <label>{{ t('ssh.localPort') }}:</label>
      <a-input
        v-model:value="tunnelForm.localPort"
        @input="handleSocksPortInput"
      />
    </div>

    <div class="tunnel-form-row">
      <label>{{ t('ssh.description') }}:</label>
      <a-input
        v-model:value="tunnelForm.description"
        :placeholder="t('ssh.optional')"
      />
    </div>
    <div class="tunnel-type-help">
      <span class="tunnel-type-help-title">{{ t('ssh.currentTypeHelp') }}:<br /></span>
      <span>{{ currentTunnelTypeHelp }}</span>
    </div>
  </Modal>

  <!-- Right-click menu -->
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
      v-if="isOrganizationAsset(contextMenuData.asset_type) && !contextMenuData.key.startsWith('common_')"
      class="context-menu-item"
      @click="handleContextMenuAction('comment')"
    >
      <EditOutlined class="menu-icon" />
      {{ contextMenuData.comment ? t('personal.editComment') : t('personal.addComment') }}
    </div>
    <div
      v-if="
        isOrganizationAsset(contextMenuData.asset_type) && !contextMenuData.key.startsWith('common_') && !contextMenuData.key.startsWith('folder_')
      "
      class="context-menu-item"
      @click="handleContextMenuAction('move')"
    >
      <FolderOutlined class="menu-icon" />
      {{ t('personal.moveToFolder') }}
    </div>
    <div
      v-if="canCreateTunnel(contextMenuData)"
      class="context-menu-item"
      @click="handleContextMenuAction('tunnel')"
    >
      <ApiOutlined class="menu-icon" />
      {{ t('ssh.tunnel') }}
    </div>
    <div
      v-if="isOrganizationAsset(contextMenuData.asset_type) && contextMenuData.key.startsWith('folder_') && contextMenuData.folderUuid"
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

const logger = createRendererLogger('workspace')
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
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
  AppstoreAddOutlined,
  SwapOutlined,
  ApiOutlined,
  QuestionCircleOutlined
} from '@ant-design/icons-vue'
import eventBus from '@/utils/eventBus'
import i18n from '@/locales'
import { refreshOrganizationAssetFromWorkspace } from '../LeftTab/components/refreshOrganizationAssets'
import { isOrganizationAsset } from '../LeftTab/utils/types'
import { userConfigStore } from '@/services/userConfigStoreService'
import { message, Modal, Input, Button } from 'ant-design-vue'

const { t } = i18n.global
const emit = defineEmits(['currentClickServer', 'change-company', 'open-user-tab'])

const company = ref('personal_user_id')
const selectedKeys = ref<string[]>([])
const expandedKeys = ref<string[]>([])
const searchValue = ref('')
const searchInputRef = ref()
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
const showIpMode = ref(false)
const showTunnelListModal = ref(false)
const showTunnelModal = ref(false)

type TunnelType = 'local_forward' | 'remote_forward' | 'dynamic_socks'

interface TunnelConfig {
  id: string
  type: TunnelType
  localPort: number
  remotePort?: number
  description?: string
}

interface TunnelRuntime {
  active: boolean
  runtimeKey: string
  assetKey: string
  configId: string
  tunnelId: string
  connectionId: string
  command: string
  targetIp: string
}

interface TunnelFormState {
  type: TunnelType
  localPort: string
  remotePort: string
  description: string
}

const tunnelTypeOptions = computed(() => [
  { label: t('ssh.tunnelTypeLocalForward'), value: 'local_forward' },
  { label: t('ssh.tunnelTypeRemoteForward'), value: 'remote_forward' },
  { label: t('ssh.tunnelTypeDynamicSocks'), value: 'dynamic_socks' }
])

const tunnelTypeHelpMap = computed<Record<TunnelType, string>>(() => ({
  local_forward: t('ssh.tunnelTypeLocalForwardHelp'),
  remote_forward: t('ssh.tunnelTypeRemoteForwardHelp'),
  dynamic_socks: t('ssh.tunnelTypeDynamicSocksHelp')
}))

const tunnelTypeHelpList = computed(() =>
  tunnelTypeOptions.value.map((item) => ({
    type: item.value as TunnelType,
    label: item.label,
    help: tunnelTypeHelpMap.value[item.value as TunnelType]
  }))
)

const tunnelPortPresetOptions = [
  { label: 'OpenClaw (18789)', value: 'OpenClaw (18789)' },
  { label: 'MySQL (3306)', value: 'MySQL (3306)' },
  { label: 'Redis (6379)', value: 'Redis (6379)' },
  { label: 'PostgreSQL (5432)', value: 'PostgreSQL (5432)' },
  { label: 'MongoDB (27017)', value: 'MongoDB (27017)' },
  { label: 'Elasticsearch (9200)', value: 'Elasticsearch (9200)' },
  { label: 'RabbitMQ (5672)', value: 'RabbitMQ (5672)' },
  { label: 'Kafka (9092)', value: 'Kafka (9092)' }
]

const tunnelPortPresetLookup = new Map(tunnelPortPresetOptions.map((item) => [item.value, item]))
const tunnelPortPresetValueByPort = new Map(
  tunnelPortPresetOptions
    .map((item) => {
      const match = item.label.match(/\((\d+)\)/)
      return match ? [Number(match[1]), item.value] : null
    })
    .filter((item): item is [number, string] => !!item)
)

const tunnelForm = ref<TunnelFormState>({
  type: 'local_forward',
  localPort: '',
  remotePort: '',
  description: ''
})
const editingTunnelId = ref<string | null>(null)
const tunnelTargetAsset = ref<any>(null)
const tunnelListAsset = ref<any>(null)
const tunnelConfigMap = ref<Record<string, TunnelConfig[]>>({})
const tunnelRuntimeMap = ref<Record<string, TunnelRuntime>>({})
let tunnelHostPollTimer: number | undefined
const tunnelStartQueue = new Set<string>()
const tunnelKeyDelimiter = '::'

const tunnelListAssetName = computed(() => {
  const asset = tunnelListAsset.value
  if (!asset) return t('ssh.currentAsset')
  return asset.title || asset.ip || t('ssh.currentAsset')
})

const currentTunnelTypeHelp = computed(() => {
  return tunnelTypeHelpMap.value[tunnelForm.value.type] || ''
})

const currentAssetTunnelConfigs = computed<TunnelConfig[]>(() => {
  const asset = tunnelListAsset.value
  if (!asset) return []
  const assetKey = getAssetTunnelKey(asset)
  if (!assetKey) return []
  return tunnelConfigMap.value[assetKey] || []
})

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
const treeContainerRef = ref<HTMLElement | null>(null)
const treeHeight = ref(600)
const treeHeightUpdaterRef = ref<(() => void) | null>(null)
const childrenCountMap = ref(new Map<string, number>())
interface MachineOption {
  value: any
  label: string
}

const machines = ref<MachineOption | null>(null)

const companyChange = (item) => {
  company.value = item.key
  // Reset tree-related state
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
    logger.error('Failed to save workspace expanded keys', { error: error })
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
    // Load display mode preference
    if (config.workspaceShowIpMode !== undefined) {
      showIpMode.value = config.workspaceShowIpMode
    }
  } catch (error) {
    logger.error('Failed to load saved expand state', { error: error })
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
  // Check if necessary fields exist
  if (!dataRef) {
    logger.error('dataRef is empty')
    return
  }

  if (dataRef.favorite === undefined) {
    logger.error('dataRef.favorite is undefined')
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
        originalTreeData.value = data as AssetNode[]
        childrenCountMap.value = buildChildrenCountMap(data as AssetNode[])
        assetTreeData.value = deepClone(data) as AssetNode[]
        const localShell = await window.api.getShellsLocal()
        const isExist = assetTreeData.value.some((node) => node.key === 'localTerm')
        if (!isExist && localShell) {
          assetTreeData.value.push(localShell)
        }
        setTimeout(async () => {
          await expandDefaultNodes()
        }, 200)
      }
    })
    .catch((err) => logger.error('Failed to get local asset menu', { error: err }))
}

const getUserAssetMenu = () => {
  window.api
    .getLocalAssetRoute({ searchType: 'tree', params: ['organization'] })
    .then((res) => {
      if (res && res.data) {
        const data = res.data.routers || []
        originalTreeData.value = data as AssetNode[]
        childrenCountMap.value = buildChildrenCountMap(data as AssetNode[])
        enterpriseData.value = deepClone(data) as AssetNode[]
        setTimeout(async () => {
          await expandDefaultNodes()
        }, 200)
      }
    })
    .catch((err) => logger.error('Failed to get user asset menu', { error: err }))
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

  return filterNodes(originalTreeData.value)
}

// Only collect top-level keys (depth=1) to avoid expanding thousands of nodes at once
const getTopLevelKeys = (nodes: AssetNode[]): string[] => {
  return nodes.map((n) => n.key)
}

let searchDebounceTimer: ReturnType<typeof setTimeout> | null = null

const onSearchInput = () => {
  // Close context menu when searching
  contextMenuVisible.value = false
  contextMenuData.value = null

  if (searchDebounceTimer !== null) {
    clearTimeout(searchDebounceTimer)
  }

  searchDebounceTimer = setTimeout(() => {
    searchDebounceTimer = null
    if (isPersonalWorkspace.value) {
      assetTreeData.value = filterTreeNodes(searchValue.value)
      expandedKeys.value = getTopLevelKeys(assetTreeData.value)
    } else {
      enterpriseData.value = filterTreeNodes(searchValue.value)
      expandedKeys.value = getTopLevelKeys(enterpriseData.value)
    }
  }, 300)
}

const focusSearchInput = async () => {
  let retries = 0
  const maxRetries = 10

  const tryFocus = async () => {
    await nextTick()
    let inputElement: HTMLInputElement | null = null
    if (searchInputRef.value) {
      inputElement =
        (searchInputRef.value.$el?.querySelector('input') as HTMLInputElement) ||
        (searchInputRef.value.input as HTMLInputElement) ||
        (searchInputRef.value.$el?.querySelector('.ant-input') as HTMLInputElement) ||
        null
    }

    if (inputElement && inputElement.offsetParent !== null) {
      inputElement.focus()
      inputElement.select()
      return true
    }

    return false
  }

  const attemptFocus = async () => {
    const success = await tryFocus()
    if (!success && retries < maxRetries) {
      retries++
      setTimeout(attemptFocus, 50 * retries)
    }
  }

  await attemptFocus()
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

const getAssetTunnelKey = (asset: any): string => {
  if (!asset) return ''
  if (asset.uuid) return `uuid:${asset.uuid}`
  if (asset.organizationId && asset.ip) return `org:${asset.organizationId}:${asset.ip}`
  if (asset.ip) return `ip:${asset.ip}`
  return `key:${asset.key || asset.title || ''}`
}

const canCreateTunnel = (node: any): boolean => {
  return isSecondLevel(node) && !!node?.ip && node?.asset_type === 'person'
}

const getTunnelConfigsByAssetKey = (assetKey: string): TunnelConfig[] => {
  if (!assetKey) return []
  return tunnelConfigMap.value[assetKey] || []
}

const getActiveTunnelRuntimesByAssetKey = (assetKey: string): TunnelRuntime[] => {
  if (!assetKey) return []
  return Object.values(tunnelRuntimeMap.value).filter((runtime) => runtime.assetKey === assetKey && runtime.active)
}

const hasTunnelConfig = (node: any): boolean => {
  const assetKey = getAssetTunnelKey(node)
  return getTunnelConfigsByAssetKey(assetKey).length > 0
}

const isTunnelActive = (node: any): boolean => {
  const assetKey = getAssetTunnelKey(node)
  const nodeIp = String(node?.ip || '')
  if (getActiveTunnelRuntimesByAssetKey(assetKey).length > 0) {
    return true
  }
  if (!nodeIp) {
    return false
  }
  return Object.values(tunnelRuntimeMap.value).some((runtime) => runtime.active && runtime.targetIp === nodeIp)
}

const getTunnelPresetPort = (value: string): number | null => {
  const matched = tunnelPortPresetLookup.get(value)
  if (!matched) return null
  const portMatch = matched.label.match(/\((\d+)\)/)
  return portMatch ? Number(portMatch[1]) : null
}

const getTunnelPortPresetOptions = (field: 'localPort' | 'remotePort') => {
  const currentValue = String(tunnelForm.value[field] || '')
  if (!currentValue) {
    return tunnelPortPresetOptions
  }

  if (/^\d+$/.test(currentValue)) {
    const matchedPresetOptions = tunnelPortPresetOptions.filter((item) => {
      const presetPort = getTunnelPresetPort(item.value)
      return presetPort !== null && String(presetPort).includes(currentValue)
    })
    if (matchedPresetOptions.length > 0) {
      return matchedPresetOptions
    }
    return [
      {
        value: currentValue,
        label: currentValue
      }
    ]
  }

  const keyword = currentValue.toLowerCase()
  return tunnelPortPresetOptions.filter((item) => item.label.toLowerCase().includes(keyword))
}

const sanitizeTunnelPortInput = (value: string): string => {
  if (!value) return ''
  if (tunnelPortPresetLookup.has(value)) return value
  return value.replace(/[^\d]/g, '')
}

const parseTunnelPort = (value: string): number | null => {
  if (!value) return null
  const presetPort = getTunnelPresetPort(value)
  if (presetPort) return presetPort
  const numeric = value.replace(/[^\d]/g, '')
  if (!numeric) return null
  return Number(numeric)
}

const formatTunnelPortDisplayValue = (port?: number): string => {
  if (!isValidTunnelPort(port)) return ''
  return tunnelPortPresetValueByPort.get(port as number) || String(port)
}

const isValidTunnelPort = (port: number | undefined): boolean => {
  return !!port && Number.isInteger(port) && port > 0 && port <= 65535
}

const buildTunnelConfigId = (): string => {
  return `cfg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

const buildTunnelRuntimeKey = (assetKey: string, configId: string): string => {
  return `${assetKey}${tunnelKeyDelimiter}${configId}`
}

const buildTunnelId = (assetKey: string, configId: string): string => {
  return `asset-tunnel:${assetKey}:${configId}`
}

const buildTunnelConnectionId = (assetKey: string, configId: string): string => {
  return `tunnel-conn:${assetKey}:${configId}:${Date.now()}`
}

const getTunnelTypeLabel = (type: TunnelType): string => {
  if (type === 'local_forward') return t('ssh.tunnelTypeLocalForward')
  if (type === 'remote_forward') return t('ssh.tunnelTypeRemoteForward')
  return t('ssh.tunnelTypeDynamicSocks')
}

const formatTunnelPorts = (config: TunnelConfig): string => {
  if (config.type === 'dynamic_socks') {
    return t('ssh.localPortWithValue', { port: config.localPort })
  }
  return t('ssh.localRemotePortWithValue', { localPort: config.localPort, remotePort: config.remotePort })
}

const normalizeTunnelConfig = (rawConfig: any, fallbackId: string): TunnelConfig | null => {
  if (!rawConfig || typeof rawConfig !== 'object') return null
  const type = rawConfig.type as TunnelType
  const localPort = Number(rawConfig.localPort)
  const remotePort = rawConfig.remotePort === undefined ? undefined : Number(rawConfig.remotePort)

  if (!['local_forward', 'remote_forward', 'dynamic_socks'].includes(type)) return null
  if (!isValidTunnelPort(localPort)) return null
  if (type !== 'dynamic_socks' && !isValidTunnelPort(remotePort)) return null

  const configId = typeof rawConfig.id === 'string' && rawConfig.id ? rawConfig.id : fallbackId

  return {
    id: configId,
    type,
    localPort,
    remotePort,
    description: typeof rawConfig.description === 'string' ? rawConfig.description : ''
  }
}

const normalizeTunnelConfigList = (rawConfig: unknown, assetKey: string): TunnelConfig[] => {
  const sourceList = Array.isArray(rawConfig) ? rawConfig : rawConfig && typeof rawConfig === 'object' ? [rawConfig] : []
  const normalized: TunnelConfig[] = []
  const idSet = new Set<string>()

  sourceList.forEach((item, index) => {
    const fallbackId = `${assetKey}-${index}-${Date.now()}`
    const parsed = normalizeTunnelConfig(item, fallbackId)
    if (!parsed) return

    if (idSet.has(parsed.id)) {
      parsed.id = `${parsed.id}-${index}`
    }
    idSet.add(parsed.id)
    normalized.push(parsed)
  })

  return normalized
}

const loadTunnelConfigsFromStorage = async (): Promise<void> => {
  try {
    const currentConfig = await userConfigStore.getConfig()
    const rawConfigs = currentConfig.workspaceTunnelConfigs
    if (!rawConfigs || typeof rawConfigs !== 'object') {
      tunnelConfigMap.value = {}
      return
    }

    const nextMap: Record<string, TunnelConfig[]> = {}
    for (const [assetKey, rawConfig] of Object.entries(rawConfigs)) {
      const parsedList = normalizeTunnelConfigList(rawConfig, assetKey)
      if (parsedList.length === 0) continue
      nextMap[assetKey] = parsedList
    }
    tunnelConfigMap.value = nextMap
    requestOpenedHosts()
  } catch (error) {
    logger.error('Failed to load tunnel configs', { error: error })
  }
}

const persistTunnelConfigsToStorage = async (): Promise<void> => {
  try {
    const currentConfig = await userConfigStore.getConfig()
    await userConfigStore.saveConfig({
      ...currentConfig,
      workspaceTunnelConfigs: tunnelConfigMap.value
    })
  } catch (error) {
    logger.error('Failed to persist tunnel configs', { error: error })
  }
}

const getTunnelApi = () => {
  const api = window.api as any
  if (typeof api?.startSshTunnel !== 'function' || typeof api?.stopSshTunnel !== 'function') {
    return null
  }
  return api
}

const buildTunnelCommand = (
  config: { type: TunnelType; localPort: number; remotePort?: number },
  targetIp: string,
  targetUsername: string = 'root',
  targetPort: number = 22
): string => {
  const userHost = `${targetUsername}@${targetIp}`
  const portArg = targetPort && targetPort !== 22 ? ` -p ${targetPort}` : ''
  if (config.type === 'local_forward') {
    return `ssh -L ${config.localPort}:localhost:${config.remotePort} ${userHost}${portArg}`
  }
  if (config.type === 'remote_forward') {
    return `ssh -R ${config.remotePort}:localhost:${config.localPort} ${userHost}${portArg}`
  }
  return `ssh -D ${config.localPort} ${userHost}${portArg}`
}

const resolveTunnelConnectionPayload = async (asset: any, assetKey: string, configId: string): Promise<any | null> => {
  if (!asset?.uuid) return null

  const assetInfo = await window.api.connectAssetInfo({ uuid: asset.uuid })
  if (!assetInfo) return null

  const sshType = assetInfo?.sshType || 'ssh'
  if (sshType !== 'ssh') {
    return {
      unsupported: true,
      reason: `sshType=${sshType}`
    }
  }

  const host = assetInfo?.asset_ip || assetInfo?.host || asset?.ip
  const port = Number(assetInfo?.port || asset?.port || 22)
  const username = assetInfo?.username || asset?.username || 'root'
  const authType = assetInfo?.auth_type || assetInfo?.authType || 'password'

  if (!host || !username || !Number.isInteger(port) || port <= 0 || port > 65535) {
    return null
  }

  const tunnelConnectionId = buildTunnelConnectionId(assetKey, configId)
  const payload: any = {
    id: tunnelConnectionId,
    host,
    port,
    username,
    password: authType === 'password' ? assetInfo?.password || '' : '',
    privateKey: authType === 'keyBased' ? assetInfo?.privateKey || '' : '',
    passphrase: assetInfo?.passphrase || '',
    sshType: 'ssh',
    terminalType: 'xterm',
    agentForward: false,
    isOfficeDevice: false,
    connIdentToken: '',
    asset_type: assetInfo?.asset_type || asset?.asset_type || '',
    proxyCommand: assetInfo?.proxyCommand || asset?.proxyCommand || '',
    disablePostConnectProbe: true
  }

  payload.needProxy = assetInfo?.needProxy === true || assetInfo?.need_proxy === 1
  if (payload.needProxy) {
    const currentConfig = await userConfigStore.getConfig()
    payload.proxyConfig = currentConfig.sshProxyConfigs?.find((item) => item.name === (assetInfo?.proxyName || assetInfo?.proxy_name))
  }

  return {
    tunnelConnectionId,
    connectPayload: payload,
    targetIp: host,
    targetUsername: username,
    targetPort: port
  }
}

const stopTunnelByRuntimeKey = async (runtimeKey: string): Promise<void> => {
  const runtime = tunnelRuntimeMap.value[runtimeKey]
  if (!runtime || !runtime.active) return

  try {
    const tunnelApi = getTunnelApi()
    if (tunnelApi) {
      await tunnelApi.stopSshTunnel({
        tunnelId: runtime.tunnelId
      })
    }
  } catch (error) {
    logger.warn('Failed to stop tunnel', { runtimeKey, error: error })
  } finally {
    if (runtime.connectionId) {
      try {
        await window.api.disconnect({ id: runtime.connectionId })
      } catch (error) {
        logger.warn('Failed to disconnect tunnel connection', { runtimeKey, error: error })
      }
    }
    const nextRuntimeMap = { ...tunnelRuntimeMap.value }
    delete nextRuntimeMap[runtimeKey]
    tunnelRuntimeMap.value = nextRuntimeMap
  }
}

const stopTunnelsByAssetKey = async (assetKey: string, configId?: string): Promise<void> => {
  const runtimeKeys = Object.keys(tunnelRuntimeMap.value).filter((runtimeKey) => {
    const runtime = tunnelRuntimeMap.value[runtimeKey]
    if (!runtime?.active) return false
    if (runtime.assetKey !== assetKey) return false
    if (configId && runtime.configId !== configId) return false
    return true
  })

  for (const runtimeKey of runtimeKeys) {
    await stopTunnelByRuntimeKey(runtimeKey)
  }
}

const stopAllTunnelProcesses = async (): Promise<void> => {
  const activeRuntimeKeys = Object.keys(tunnelRuntimeMap.value).filter((key) => tunnelRuntimeMap.value[key]?.active)
  for (const runtimeKey of activeRuntimeKeys) {
    await stopTunnelByRuntimeKey(runtimeKey)
  }
}

const getCandidateTunnelAssetKeysByHost = (host: any): string[] => {
  const keys = new Set<string>()
  const hostAssetKey = getAssetTunnelKey(host)
  if (hostAssetKey && getTunnelConfigsByAssetKey(hostAssetKey).length > 0) {
    keys.add(hostAssetKey)
  }

  const hostIp = String(host?.ip || '')
  if (!hostIp) {
    return [...keys]
  }

  for (const assetKey of Object.keys(tunnelConfigMap.value)) {
    if (assetKey === `ip:${hostIp}` || assetKey.endsWith(`:${hostIp}`)) {
      keys.add(assetKey)
    }
  }

  return [...keys]
}

const startTunnelByConfig = async (assetKey: string, asset: any, config: TunnelConfig, options?: { silent?: boolean }): Promise<void> => {
  const silent = options?.silent !== false
  const runtimeKey = buildTunnelRuntimeKey(assetKey, config.id)
  const runtime = tunnelRuntimeMap.value[runtimeKey]
  if (runtime?.active) return

  if (tunnelStartQueue.has(runtimeKey)) return

  const tunnelApi = getTunnelApi()
  if (!tunnelApi) {
    if (!silent) {
      message.error(t('ssh.tunnelUnsupportedInVersion'))
    }
    return
  }

  tunnelStartQueue.add(runtimeKey)
  const tunnelId = buildTunnelId(assetKey, config.id)
  let tunnelConnectionId = ''
  let targetIp = String(asset?.ip || '')
  let targetUsername = asset?.username || 'root'
  let targetPort = Number(asset?.port || 22)

  try {
    const connectionPayload = await resolveTunnelConnectionPayload(asset, assetKey, config.id)
    if (!connectionPayload) {
      if (!silent) {
        message.error(t('ssh.tunnelStartFailedNoConfig'))
      }
      return
    }
    if (connectionPayload.unsupported) {
      if (!silent) {
        message.error(t('ssh.tunnelUnsupportedAssetType'))
      }
      logger.warn('Tunnel unsupported for asset', {
        assetKey,
        reason: connectionPayload.reason
      })
      return
    }

    tunnelConnectionId = connectionPayload.tunnelConnectionId
    const resolvedTargetIp = String(connectionPayload.targetIp || '')
    targetIp = String(asset?.ip || resolvedTargetIp)
    targetUsername = connectionPayload.targetUsername
    targetPort = connectionPayload.targetPort

    const connectResult = await window.api.connect(connectionPayload.connectPayload)
    if (connectResult?.status !== 'connected') {
      if (!silent) {
        message.error(t('ssh.tunnelStartFailedWithReason', { reason: connectResult?.message || t('ssh.sshConnectionFailed') }))
      }
      return
    }

    const result = await tunnelApi.startSshTunnel({
      connectionId: tunnelConnectionId,
      tunnelId,
      type: config.type,
      localPort: config.localPort,
      remotePort: config.remotePort
    })
    if (!result?.success) {
      if (!silent) {
        message.error(t('ssh.tunnelStartFailedWithReason', { reason: result?.error || t('ssh.unknownError') }))
      }
      try {
        await window.api.disconnect({ id: tunnelConnectionId })
      } catch (error) {
        logger.warn('Failed to disconnect after tunnel start failure', { runtimeKey, error: error })
      }
      return
    }
  } finally {
    tunnelStartQueue.delete(runtimeKey)
  }

  tunnelRuntimeMap.value[runtimeKey] = {
    active: true,
    runtimeKey,
    assetKey,
    configId: config.id,
    tunnelId,
    connectionId: tunnelConnectionId,
    command: buildTunnelCommand(config, targetIp, targetUsername, targetPort),
    targetIp: String(asset?.ip || targetIp)
  }
}

const ensureOpenedHostTunnels = async (hosts: any[]): Promise<void> => {
  if (!Array.isArray(hosts)) return
  for (const host of hosts) {
    const candidateKeys = getCandidateTunnelAssetKeysByHost(host)
    for (const assetKey of candidateKeys) {
      const configs = getTunnelConfigsByAssetKey(assetKey)
      for (const config of configs) {
        await startTunnelByConfig(assetKey, host, config, { silent: true })
      }
    }
  }
}

const resetTunnelForm = (): void => {
  tunnelForm.value = {
    type: 'local_forward',
    localPort: '',
    remotePort: '',
    description: ''
  }
}

const openTunnelListModal = (asset: any): void => {
  tunnelListAsset.value = asset
  showTunnelListModal.value = true
}

const handleCloseTunnelListModal = (): void => {
  showTunnelListModal.value = false
  tunnelListAsset.value = null
}

const handleCreateTunnelFromList = (): void => {
  if (!tunnelListAsset.value) return
  tunnelTargetAsset.value = tunnelListAsset.value
  editingTunnelId.value = null
  resetTunnelForm()
  showTunnelModal.value = true
}

const handleEditTunnelFromList = (configId: string): void => {
  const asset = tunnelListAsset.value
  if (!asset) return
  const assetKey = getAssetTunnelKey(asset)
  if (!assetKey) return

  const config = getTunnelConfigsByAssetKey(assetKey).find((item) => item.id === configId)
  if (!config) return

  tunnelTargetAsset.value = asset
  editingTunnelId.value = config.id
  tunnelForm.value = {
    type: config.type,
    localPort: formatTunnelPortDisplayValue(config.localPort),
    remotePort: formatTunnelPortDisplayValue(config.remotePort),
    description: config.description || ''
  }
  showTunnelModal.value = true
}

const handleDeleteTunnelFromList = async (configId: string): Promise<void> => {
  const asset = tunnelListAsset.value
  if (!asset || !asset.ip) {
    message.error(t('ssh.targetAssetNotFound'))
    return
  }

  const assetKey = getAssetTunnelKey(asset)
  if (!assetKey) {
    message.error(t('ssh.tunnelDeleteFailedInvalidAssetKey'))
    return
  }

  await stopTunnelsByAssetKey(assetKey, configId)

  const nextList = getTunnelConfigsByAssetKey(assetKey).filter((item) => item.id !== configId)
  if (nextList.length > 0) {
    tunnelConfigMap.value[assetKey] = nextList
  } else {
    const nextMap = { ...tunnelConfigMap.value }
    delete nextMap[assetKey]
    tunnelConfigMap.value = nextMap
  }

  await persistTunnelConfigsToStorage()
  requestOpenedHosts()
  message.success(t('ssh.tunnelConfigDeleted'))
}

const handleTunnelTypeChange = (value: TunnelType): void => {
  tunnelForm.value.type = value
  if (value === 'dynamic_socks') {
    tunnelForm.value.localPort = '1080'
    tunnelForm.value.remotePort = ''
    return
  }
  if (!tunnelForm.value.localPort) {
    tunnelForm.value.localPort = 'OpenClaw (18789)'
  }
  if (!tunnelForm.value.remotePort) {
    tunnelForm.value.remotePort = 'OpenClaw (18789)'
  }
}

const handleTunnelPortFocus = (field: 'localPort' | 'remotePort'): void => {
  const value = tunnelForm.value[field]
  const presetPort = getTunnelPresetPort(value)
  if (presetPort) {
    tunnelForm.value[field] = String(presetPort)
  }
}

const handleTunnelPortPresetSelect = (value: string): void => {
  const selectedValue = String(value || '')
  if (!tunnelPortPresetLookup.has(selectedValue)) return
  tunnelForm.value.localPort = selectedValue
  tunnelForm.value.remotePort = selectedValue
}

const handleTunnelPortChange = (field: 'localPort' | 'remotePort', value: string): void => {
  const inputValue = sanitizeTunnelPortInput(String(value || ''))
  tunnelForm.value[field] = inputValue
  if (tunnelPortPresetLookup.has(inputValue)) {
    tunnelForm.value.localPort = inputValue
    tunnelForm.value.remotePort = inputValue
  }
}

const handleTunnelPortSearch = (field: 'localPort' | 'remotePort', value: string): void => {
  const inputValue = sanitizeTunnelPortInput(String(value || ''))
  tunnelForm.value[field] = inputValue
}

const handleSocksPortInput = (event: Event): void => {
  const target = event.target as HTMLInputElement
  tunnelForm.value.localPort = sanitizeTunnelPortInput(target?.value || '')
}

const handleCancelTunnelConfig = (): void => {
  showTunnelModal.value = false
  editingTunnelId.value = null
  tunnelTargetAsset.value = null
}

const handleSaveTunnelConfig = async (): Promise<void> => {
  const targetAsset = tunnelTargetAsset.value
  if (!targetAsset || !targetAsset.ip) {
    message.error(t('ssh.targetAssetNotFound'))
    return
  }

  const assetKey = getAssetTunnelKey(targetAsset)
  if (!assetKey) {
    message.error(t('ssh.tunnelSaveFailedInvalidAssetKey'))
    return
  }

  const localPort = parseTunnelPort(tunnelForm.value.localPort)
  if (!isValidTunnelPort(localPort || undefined)) {
    message.error(t('ssh.invalidLocalPort'))
    return
  }

  let remotePort: number | undefined
  if (tunnelForm.value.type !== 'dynamic_socks') {
    const parsedRemotePort = parseTunnelPort(tunnelForm.value.remotePort || '')
    remotePort = parsedRemotePort === null ? undefined : parsedRemotePort
    if (!isValidTunnelPort(remotePort)) {
      message.error(t('ssh.invalidRemotePort'))
      return
    }
  }

  const configId = editingTunnelId.value || buildTunnelConfigId()
  const nextConfig: TunnelConfig = {
    id: configId,
    type: tunnelForm.value.type,
    localPort: Number(localPort),
    remotePort,
    description: tunnelForm.value.description?.trim() || ''
  }

  if (editingTunnelId.value) {
    await stopTunnelsByAssetKey(assetKey, configId)
  }

  const existingList = getTunnelConfigsByAssetKey(assetKey)
  const existingIndex = existingList.findIndex((item) => item.id === configId)
  const nextList = [...existingList]

  if (existingIndex >= 0) {
    nextList[existingIndex] = nextConfig
  } else {
    nextList.push(nextConfig)
  }

  tunnelConfigMap.value[assetKey] = nextList
  await persistTunnelConfigsToStorage()

  requestOpenedHosts()

  showTunnelModal.value = false
  editingTunnelId.value = null
  tunnelTargetAsset.value = null
  message.success(t('ssh.tunnelConfigSaved'))
}
const getOriginalChildrenCount = (dataRef: any): number => {
  if (!dataRef || !dataRef.key) return 0
  return childrenCountMap.value.get(dataRef.key) ?? 0
}

// Build a key->childCount map from the original tree data.
// For qizhi org nodes that have group children, dedup leaf IPs.
// This runs once when data loads (O(n)) instead of per-render (O(n^2)).
const buildChildrenCountMap = (nodes: AssetNode[]): Map<string, number> => {
  const map = new Map<string, number>()

  const collectLeafIps = (node: AssetNode, ips: Set<string>): void => {
    if (!node.children || node.children.length === 0) {
      ips.add((node as any).ip || node.key)
      return
    }
    for (const child of node.children) {
      collectLeafIps(child, ips)
    }
  }

  const traverse = (items: AssetNode[]): void => {
    for (const item of items) {
      if (item.children && item.children.length > 0) {
        const hasGroupChildren = item.children.some((c: any) => c.isAssetGroup)
        if (hasGroupChildren) {
          // Dedup leaf IPs across groups
          const ips = new Set<string>()
          for (const child of item.children) {
            collectLeafIps(child, ips)
          }
          map.set(item.key, ips.size)
        } else if ((item as any).isAssetGroup) {
          // Intermediate group node: count direct children
          map.set(item.key, item.children.length)
        } else {
          map.set(item.key, item.children.length)
        }
        traverse(item.children)
      }
    }
  }

  traverse(nodes)
  return map
}

const toggleFavorite = (dataRef: any): void => {
  if (isPersonalWorkspace.value) {
    logger.debug('Executing personal asset favorite logic')
    window.api
      .updateLocalAsseFavorite({ uuid: dataRef.uuid, status: dataRef.favorite ? 2 : 1 })
      .then((res) => {
        logger.debug('Personal asset favorite response', { result: String(res) })
        if (res.data.message === 'success') {
          dataRef.favorite = !dataRef.favorite
          getLocalAssetMenu()
        }
      })
      .catch((err) => logger.error('Personal asset favorite error', { error: err }))
  } else {
    logger.debug('Executing organization asset favorite logic')
    if (isOrganizationAsset(dataRef.asset_type) && !dataRef.organizationId) {
      logger.debug('Updating organization itself favorite status')
      window.api
        .updateLocalAsseFavorite({ uuid: dataRef.uuid, status: dataRef.favorite ? 2 : 1 })
        .then((res) => {
          logger.debug('Organization itself favorite response', { result: String(res) })
          if (res.data.message === 'success') {
            dataRef.favorite = !dataRef.favorite
            getUserAssetMenu()
          }
        })
        .catch((err) => logger.error('Organization asset favorite error', { error: err }))
    } else {
      logger.debug('Updating organization sub-asset favorite status', {
        organizationUuid: dataRef.organizationId,
        host: dataRef.ip,
        status: dataRef.favorite ? 2 : 1
      })

      if (!window.api.updateOrganizationAssetFavorite) {
        logger.error('updateOrganizationAssetFavorite method not found')
        return
      }

      window.api
        .updateOrganizationAssetFavorite({
          organizationUuid: dataRef.organizationId,
          host: dataRef.ip,
          status: dataRef.favorite ? 2 : 1
        })
        .then((res) => {
          logger.debug('updateOrganizationAssetFavorite response', { result: String(res) })
          if (res && res.data && res.data.message === 'success') {
            logger.debug('Favorite status updated successfully, refreshing menu')
            dataRef.favorite = !dataRef.favorite
            getUserAssetMenu()
          } else {
            logger.error('Favorite status update failed', { result: String(res) })
          }
        })
        .catch((err) => {
          logger.error('Update organization asset favorite error', { error: err })
        })
    }
  }
  logger.debug('toggleFavorite end')
}

const clickServer = (item) => {
  emit('currentClickServer', item)
  requestOpenedHosts()
}

const assetManagement = () => {
  emit('open-user-tab', 'assetConfig')
}

const toggleDisplayMode = async () => {
  showIpMode.value = !showIpMode.value
  // Save preference to user config
  try {
    const currentConfig = await userConfigStore.getConfig()
    await userConfigStore.saveConfig({
      ...currentConfig,
      workspaceShowIpMode: showIpMode.value
    })
  } catch (error) {
    logger.error('Failed to save display mode preference', { error: error })
  }
}

const getDisplayText = (dataRef: any, title: string): string => {
  if (showIpMode.value && dataRef.ip) {
    return dataRef.ip
  }
  return title
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
  logger.debug('Refreshing organization asset node', { key: dataRef.key })
  refreshingNode.value = dataRef.key

  try {
    await refreshOrganizationAssetFromWorkspace(dataRef, () => {
      getUserAssetMenu()
    })
  } catch (error) {
    logger.error('Refresh failed', { error: error })
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
      logger.error('updateOrganizationAssetComment method does not exist')
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
      // Refresh menu to show updates
      getUserAssetMenu()
    } else {
      logger.error('Comment save failed', { result: String(result) })
    }
  } catch (error) {
    logger.error('Save comment error', { error: error })
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
    logger.error('Failed to load custom folders', { error: error })
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
    logger.error('Failed to create folder', { error: error })
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
    logger.error('Failed to update folder', { error: error })
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
        logger.error('Failed to delete folder', { error: error })
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
    logger.error('Failed to move asset', { error: error })
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
    logger.error('Failed to remove asset from folder', { error: error })
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
  const hasCommentOption = isOrganizationAsset(dataRef.asset_type) && !dataRef.key.startsWith('common_')
  const hasMoveOption = isOrganizationAsset(dataRef.asset_type) && !dataRef.key.startsWith('common_') && !dataRef.key.startsWith('folder_')
  const hasTunnelOption = canCreateTunnel(dataRef)
  const hasRemoveOption = isOrganizationAsset(dataRef.asset_type) && dataRef.key.startsWith('folder_') && dataRef.folderUuid
  const hasEditFolderOption = dataRef.asset_type === 'custom_folder' && !dataRef.key.startsWith('common_')
  const hasDeleteFolderOption = dataRef.asset_type === 'custom_folder' && !dataRef.key.startsWith('common_')

  // If no menu options are available, don't show the context menu
  if (
    !hasFavoriteOption &&
    !hasCommentOption &&
    !hasMoveOption &&
    !hasTunnelOption &&
    !hasRemoveOption &&
    !hasEditFolderOption &&
    !hasDeleteFolderOption
  ) {
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

  // Calculate the number of menu items that will be shown
  const menuItemCount = [
    hasFavoriteOption,
    hasCommentOption,
    hasMoveOption,
    hasTunnelOption,
    hasRemoveOption,
    hasEditFolderOption,
    hasDeleteFolderOption
  ].filter(Boolean).length

  // Estimate menu dimensions based on CSS styles
  const menuItemHeight = 25 // approximate height per menu item (12px font * 1.4 line-height + 8px padding)
  const menuPadding = 4 // top + bottom padding (2px each)
  const menuBorder = 2 // border width
  const menuWidth = 160 // approximate menu width
  const estimatedMenuHeight = menuPadding + menuBorder + menuItemCount * menuItemHeight

  // Get viewport dimensions
  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight

  // Calculate position with overflow handling
  let left = event.clientX
  let top = event.clientY

  // Check horizontal overflow
  if (left + menuWidth > viewportWidth) {
    left = viewportWidth - menuWidth - 5
  }

  // Check vertical overflow - if menu would extend below viewport, show above cursor
  if (top + estimatedMenuHeight > viewportHeight) {
    top = event.clientY - estimatedMenuHeight
    // Ensure menu doesn't go above viewport
    if (top < 0) {
      top = 5
    }
  }

  contextMenuData.value = dataRef
  contextMenuStyle.value = {
    position: 'fixed',
    left: left + 'px',
    top: top + 'px',
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
    case 'tunnel':
      openTunnelListModal(contextMenuData.value)
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

const handleAllOpenedHostsResult = (hosts: any[]) => {
  if (!Array.isArray(hosts)) return

  const openedAssetKeys = new Set<string>()
  const openedIps = new Set<string>()
  for (const host of hosts) {
    const assetKey = getAssetTunnelKey(host)
    if (!assetKey) continue
    openedAssetKeys.add(assetKey)
    if (host?.ip) {
      openedIps.add(String(host.ip))
    }
  }

  void ensureOpenedHostTunnels(hosts)

  const activeRuntimeKeys = Object.keys(tunnelRuntimeMap.value).filter((key) => tunnelRuntimeMap.value[key]?.active)
  for (const runtimeKey of activeRuntimeKeys) {
    const runtime = tunnelRuntimeMap.value[runtimeKey]
    const sameServerStillOpen = !!runtime?.targetIp && openedIps.has(runtime.targetIp)
    if (!openedAssetKeys.has(runtime.assetKey) && !sameServerStillOpen) {
      void stopTunnelByRuntimeKey(runtimeKey)
    }
  }

  if (hosts.length === 0) {
    void stopAllTunnelProcesses()
  }
}

const requestOpenedHosts = () => {
  eventBus.emit('getAllOpenedHosts')
}

const handleDocumentClick = () => {
  contextMenuVisible.value = false
  contextMenuData.value = null
}

onMounted(() => {
  eventBus.on('LocalAssetMenu', refreshAssetMenu)
  // Listen for language change event, reload asset data
  eventBus.on('languageChanged', () => {
    logger.info('Language changed, refreshing asset menu')
    refreshAssetMenu()
  })
  // Listen for host search focus event
  eventBus.on('focusHostSearch', focusSearchInput)
  eventBus.on('allOpenedHostsResult', handleAllOpenedHostsResult)
  loadCustomFolders()
  void loadTunnelConfigsFromStorage()

  requestOpenedHosts()
  tunnelHostPollTimer = window.setInterval(() => {
    requestOpenedHosts()
  }, 3000)

  // Add click outside listener to close context menu
  document.addEventListener('click', handleDocumentClick)

  // Track tree container height for virtual scroll
  const updateTreeHeight = () => {
    if (treeContainerRef.value) {
      treeHeight.value = treeContainerRef.value.clientHeight || 600
    }
  }
  nextTick(() => {
    updateTreeHeight()
    window.addEventListener('resize', updateTreeHeight)
    treeHeightUpdaterRef.value = updateTreeHeight
  })
})
onUnmounted(() => {
  eventBus.off('LocalAssetMenu', refreshAssetMenu)
  eventBus.off('languageChanged')
  eventBus.off('focusHostSearch', focusSearchInput)
  eventBus.off('allOpenedHostsResult', handleAllOpenedHostsResult)
  document.removeEventListener('click', handleDocumentClick)
  if (searchDebounceTimer !== null) {
    clearTimeout(searchDebounceTimer)
  }
  if (treeHeightUpdaterRef.value) {
    window.removeEventListener('resize', treeHeightUpdaterRef.value)
  }
  if (tunnelHostPollTimer) {
    clearInterval(tunnelHostPollTimer)
    tunnelHostPollTimer = undefined
  }
  void stopAllTunnelProcesses()
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
  overflow: hidden;

  .term_host_header {
    width: 100%;
    height: auto;
    overflow: hidden;
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
  overflow: hidden;
  border-radius: 2px;
  background-color: transparent;
  height: calc(100vh - 140px);

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
  min-width: 0;

  // Virtual list: avoid horizontal scrollbar when row content is long (flex-start uses intrinsic width).
  .ant-tree-list-holder {
    overflow-x: hidden !important;
  }

  .ant-tree-node-content-wrapper,
  .ant-tree-title,
  .ant-tree-switcher,
  .ant-tree-node-selected {
    color: var(--text-color) !important;
  }

  .ant-tree-node-content-wrapper {
    display: flex;
    align-items: center;
    width: 100%;
    min-width: 0;
    flex: 1 1 auto;
  }

  .ant-tree-title {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
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
    max-width: 100%;
    min-width: 0;
    box-sizing: border-box;
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
    color: var(--text-color) !important;
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
      color: var(--text-color) !important;
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

  .tunnel-icon {
    margin-left: 6px;
    color: #8c8c8c;
    font-size: 13px;
    flex-shrink: 0;
    transition: color 0.2s ease;

    &.active {
      color: #52c41a;
    }
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
      color: var(--text-color) !important;
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
    color: var(--text-color) !important;
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

.tunnel-modal-title {
  display: flex;
  align-items: center;
  gap: 6px;
}
.tunnel-help-item {
  color: var(--text-color-secondary);
  font-size: 12px;
  line-height: 1.5;
}

.tunnel-help-item + .tunnel-help-item {
  margin-top: 4px;
}

.tunnel-help-item-title {
  color: var(--text-color);
}

.tunnel-list-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
  gap: 12px;
}

.tunnel-list-header-left {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.tunnel-list-title {
  color: var(--text-color);
  font-size: 13px;
  line-height: 1.4;
  word-break: break-all;
}

.tunnel-help-trigger {
  color: var(--text-color-tertiary);
  font-size: 14px;
  cursor: pointer;
  flex-shrink: 0;

  &:hover {
    color: var(--text-color) !important;
  }
}

.tunnel-tooltip-content {
  max-width: 360px;
}

.tunnel-tooltip-title {
  color: var(--text-color);
  font-size: 12px;
  margin-bottom: 6px;
}

.tunnel-empty {
  color: var(--text-color-tertiary);
  font-size: 13px;
  text-align: center;
  padding: 18px 0;
}

.tunnel-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 360px;
  overflow-y: auto;
}

.tunnel-list-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 10px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
}

.tunnel-list-main {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  flex: 1;
}

.tunnel-list-type {
  color: var(--text-color);
  font-size: 12px;
  white-space: nowrap;
}

.tunnel-list-port {
  color: var(--text-color-secondary);
  font-size: 12px;
  white-space: nowrap;
}

.tunnel-list-desc {
  color: var(--text-color-tertiary);
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tunnel-list-actions {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.tunnel-type-help {
  margin: 2px 0 0;
  color: var(--text-color-secondary);
  font-size: 12px;
  line-height: 1.5;
}

.tunnel-type-help-title {
  color: var(--text-color);
}

:global(.tunnel-help-tooltip .ant-tooltip-inner) {
  background-color: var(--bg-color-secondary) !important;
  color: var(--text-color-secondary) !important;
  border: 1px solid var(--border-color) !important;
  box-shadow: 0 4px 12px var(--hover-bg-color) !important;
}

:global(.tunnel-help-tooltip .ant-tooltip-arrow::before) {
  background-color: var(--bg-color-secondary) !important;
  border: 1px solid var(--border-color) !important;
}

.tunnel-form-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;

  label {
    width: 76px;
    color: var(--text-color) !important;
    flex-shrink: 0;
  }

  .ant-select,
  .ant-input {
    flex: 1;
    color: var(--text-color) !important;
    background-color: var(--bg-color-secondary) !important;
  }

  :deep(.ant-input),
  :deep(.ant-input-affix-wrapper),
  :deep(.ant-select-selector) {
    background-color: var(--bg-color-secondary) !important;
    border-color: var(--border-color) !important;
    color: var(--text-color) !important;
  }

  :deep(.ant-input::placeholder) {
    color: var(--text-color-tertiary) !important;
  }

  :deep(.ant-input:hover),
  :deep(.ant-input-affix-wrapper:hover),
  :deep(.ant-select-selector:hover) {
    border-color: var(--border-color-light) !important;
  }

  :deep(.ant-input:focus),
  :deep(.ant-input-focused),
  :deep(.ant-input-affix-wrapper-focused),
  :deep(.ant-select-focused .ant-select-selector),
  :deep(.ant-select-open .ant-select-selector) {
    border-color: var(--border-color-light) !important;
    box-shadow: 0 0 0 2px var(--hover-bg-color) !important;
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
    color: var(--text-color) !important;
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
    border-bottom: 1px solid var(--border-color);
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
    background-color: rgba(255, 255, 255, 0.06);
    border: none;
    border-radius: 6px 6px 0 0;
    margin: 0 2px;
    margin-bottom: -1px;
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
      color: var(--text-color) !important;
      background-color: var(--hover-bg-color);
    }

    &:active {
      transform: translateY(0);
    }
  }

  :deep(.ant-tabs-tab-active) {
    background-color: var(--bg-color);
    border: 1px solid var(--border-color);
    border-bottom-color: var(--bg-color);
    color: #1890ff;
    font-weight: 500;

    &:hover {
      background-color: var(--bg-color);
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
    color: var(--text-color) !important;
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
