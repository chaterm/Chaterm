<template>
  <div
    ref="fileElement"
    class="tree-container"
    :class="{ 'is-transfer': uiMode === 'transfer' && treeData && treeData.length >= 1, 'is-resizing': isResizing }"
  >
    <div
      v-if="treeData && treeData.length >= 1"
      class="mode-switch"
    >
      <a-radio-group
        :value="uiModeView"
        size="small"
        button-style="solid"
        @update:value="onModeChange"
      >
        <a-radio-button
          class="mode-radio"
          value="transfer"
          >{{ t('files.dragTransferMode') }}</a-radio-button
        >
        <a-radio-button
          class="mode-radio"
          value="default"
          >{{ t('files.defaultMode') }}</a-radio-button
        >
      </a-radio-group>
    </div>

    <!--Transfer mode-->
    <template v-if="uiMode === 'transfer' && treeData">
      <div
        ref="transferLayoutRef"
        class="transfer-layout"
        :style="transferLayoutStyle"
      >
        <!--LEFT-->
        <div
          class="transfer-side"
          :class="sideDropClass('left')"
          @dragenter="(e) => onSideDragEnter(e, 'left')"
          @dragover="(e) => onSideDragOver(e, 'left')"
          @dragleave="(e) => onSideDragLeave(e, 'left')"
          @drop="(e) => onSideDrop(e, 'left')"
        >
          <div
            v-if="selectedLeftUuid"
            class="session-card session-card--single"
          >
            <div class="session-header session-header-static">
              <a-tooltip :title="isCollapsed(String(selectedLeftUuid)) ? t('files.treeExpand') : t('files.treeFoldUp')">
                <span
                  class="session-collapse"
                  @click.stop="toggleSession(String(selectedLeftUuid))"
                >
                  <RightOutlined v-if="isCollapsed(String(selectedLeftUuid))" />
                  <DownOutlined v-else />
                </span>
              </a-tooltip>
              <a-select
                v-model:value="selectedLeftUuid"
                class="session-select"
                size="middle"
                :options="leftSelectOptions"
                :dropdown-match-select-width="false"
                @change="onLeftSelectChange"
              >
                <template #option="{ value, label }">
                  <div class="session-select-option">
                    <span class="opt-label">{{ label }}</span>
                    <a-button
                      v-if="String(value) !== CREATE_FILE_CONN_VALUE && !isLocal(String(value))"
                      type="text"
                      size="small"
                      class="opt-close"
                      :disabled="sideLoading.left"
                      @mousedown.prevent.stop="closeSftpById(String(value))"
                    >
                      <CloseOutlined />
                    </a-button>
                  </div>
                </template>
              </a-select>
              <span
                v-if="selectedLeftNode?.errorMsg"
                class="session-error"
              >
                {{ t('files.sftpConnectFailed') }}：{{ selectedLeftNode.errorMsg }}
              </span>
              <a-tooltip :title="t('files.add')">
                <a-button
                  type="text"
                  size="small"
                  class="session-btn-first session-action-btn"
                  :disabled="sideLoading.left"
                  @click.stop="addLeftPanel"
                >
                  <PlusOutlined />
                </a-button>
              </a-tooltip>
              <a-tooltip :title="t('files.close')">
                <a-button
                  type="text"
                  size="small"
                  class="session-action-btn"
                  :disabled="sideLoading.left"
                  @click.stop="closeLeftPanel"
                >
                  <CloseOutlined />
                </a-button>
              </a-tooltip>
            </div>
            <a-spin
              :spinning="sideLoading.left"
              size="small"
              class="panel-spin"
            >
              <div
                v-show="!isCollapsed(String(selectedLeftUuid))"
                class="session-body session-body-fill"
              >
                <TermFileSystem
                  v-if="isOpened(String(selectedLeftUuid))"
                  :ref="fsRefFor(String(selectedLeftUuid))"
                  :key="String(selectedLeftUuid)"
                  :uuid="String(selectedLeftUuid)"
                  :current-directory-input="resolvePaths(String(selectedLeftUuid))"
                  :base-path="getBasePath(String(selectedLeftUuid))"
                  panel-side="left"
                  :cached-state="FS_CACHE.get(String(selectedLeftUuid))?.cache"
                  ui-mode="transfer"
                  @state-change="stateChange"
                  @open-file="openFile"
                  @cross-transfer="handleCrossTransfer"
                />
              </div>
            </a-spin>
          </div>

          <div
            v-else
            class="right-empty"
            :class="{ 'drop-active': emptyDragging.left }"
            @dragenter.prevent="(e) => handleEmptyDragEnter(e, 'left')"
            @dragover="(e) => handleEmptyDragOver(e, 'left')"
            @dragleave.prevent="(e) => handleEmptyDragLeave(e, 'left')"
            @drop.prevent.stop="(e) => handleEmptyDrop(e, 'left')"
            @click="openAddConnModal('left')"
          >
            <a-spin
              :spinning="sideLoading.left"
              size="small"
              class="panel-spin panel-spin-empty"
            >
              <div class="right-empty-inner">
                <div class="right-empty-plus-wrapper">
                  <PlusOutlined class="plus-icon" />
                  <span class="drag-hint-dot"></span>
                </div>

                <div class="right-empty-text"> {{ t('files.createOrDrag') }} </div>
                <div class="right-empty-sub"> {{ t('files.createOrDragTips') }} </div>
              </div>
            </a-spin>
          </div>
        </div>

        <div
          class="transfer-divider transfer-resizer"
          @mousedown="onTransferResizeMouseDown"
        />

        <!-- RIGHT -->
        <div
          class="transfer-side"
          :class="sideDropClass('right')"
          @dragenter="(e) => onSideDragEnter(e, 'right')"
          @dragover="(e) => onSideDragOver(e, 'right')"
          @dragleave="(e) => onSideDragLeave(e, 'right')"
          @drop="(e) => onSideDrop(e, 'right')"
        >
          <div
            v-if="selectedRightUuid"
            class="session-card session-card--single"
          >
            <div class="session-header session-header-static">
              <a-tooltip :title="isCollapsed(String(selectedRightUuid)) ? t('files.treeExpand') : t('files.treeFoldUp')">
                <span
                  class="session-collapse"
                  @click.stop="toggleSession(String(selectedRightUuid))"
                >
                  <RightOutlined v-if="isCollapsed(String(selectedRightUuid))" />
                  <DownOutlined v-else />
                </span>
              </a-tooltip>
              <a-select
                v-model:value="selectedRightUuid"
                class="session-select"
                size="middle"
                :options="rightSelectOptions"
                :dropdown-match-select-width="false"
                @change="onRightSelectChange"
              >
                <template #option="{ value, label }">
                  <div class="session-select-option">
                    <span class="opt-label">{{ label }}</span>
                    <a-button
                      v-if="String(value) !== CREATE_FILE_CONN_VALUE && !isLocal(String(value))"
                      type="text"
                      size="small"
                      class="opt-close"
                      :disabled="sideLoading.right"
                      @mousedown.prevent.stop="closeSftpById(String(value))"
                    >
                      <CloseOutlined />
                    </a-button>
                  </div>
                </template>
              </a-select>
              <span
                v-if="selectedRightNode?.errorMsg"
                class="session-error"
              >
                {{ t('files.sftpConnectFailed') }}：{{ selectedRightNode.errorMsg }}
              </span>
              <a-tooltip :title="t('files.add')">
                <a-button
                  type="text"
                  size="small"
                  class="session-btn-first session-action-btn"
                  :disabled="sideLoading.right"
                  @click.stop="addRightPanel"
                >
                  <PlusOutlined />
                </a-button>
              </a-tooltip>
              <a-tooltip :title="t('files.close')">
                <a-button
                  type="text"
                  size="small"
                  class="session-action-btn"
                  :disabled="sideLoading.right"
                  @click.stop="closeRightPanel"
                >
                  <CloseOutlined />
                </a-button>
              </a-tooltip>
            </div>
            <a-spin
              :spinning="sideLoading.right"
              size="small"
              class="panel-spin"
            >
              <div
                v-show="!isCollapsed(String(selectedRightUuid))"
                class="session-body session-body-fill"
              >
                <TermFileSystem
                  v-if="isOpened(String(selectedRightUuid))"
                  :ref="fsRefFor(String(selectedRightUuid))"
                  :key="String(selectedRightUuid)"
                  :uuid="String(selectedRightUuid)"
                  :current-directory-input="resolvePaths(String(selectedRightUuid))"
                  :base-path="getBasePath(String(selectedRightUuid))"
                  panel-side="right"
                  :cached-state="FS_CACHE.get(String(selectedRightUuid))?.cache"
                  ui-mode="transfer"
                  @state-change="stateChange"
                  @open-file="openFile"
                  @cross-transfer="handleCrossTransfer"
                />
              </div>
            </a-spin>
          </div>

          <div
            v-else
            class="right-empty"
            :class="{ 'drop-active': emptyDragging.right }"
            @dragenter.prevent="(e) => handleEmptyDragEnter(e, 'right')"
            @dragover="(e) => handleEmptyDragOver(e, 'right')"
            @dragleave.prevent="(e) => handleEmptyDragLeave(e, 'right')"
            @drop.prevent.stop="(e) => handleEmptyDrop(e, 'right')"
            @click="openAddConnModal('right')"
          >
            <a-spin
              :spinning="sideLoading.right"
              size="small"
              class="panel-spin panel-spin-empty"
            >
              <div class="right-empty-inner">
                <div class="right-empty-plus-wrapper">
                  <PlusOutlined class="plus-icon" />
                  <span class="drag-hint-dot"></span>
                </div>

                <div class="right-empty-text"> {{ t('files.createOrDrag') }} </div>
                <div class="right-empty-sub"> {{ t('files.createOrDragTips') }} </div>
              </div>
            </a-spin>
          </div>
        </div>
      </div>

      <!-- Add connection modal -->
    </template>

    <!-- Default mode -->
    <template v-else>
      <a-tree
        v-if="treeData && treeData.length"
        v-model:expanded-keys="expandedKeys"
        class="dark-tree"
        block-node
        :tree-data="treeData"
        :default-expand-all="true"
      >
        <template #title="{ dataRef }">
          <div>
            <span style="font-weight: bold; color: var(--text-color)">{{ dataRef.title }}</span>
            <span
              v-if="dataRef.errorMsg"
              style="color: red; margin-left: 10px; font-weight: bold"
            >
              {{ t('files.sftpConnectFailed') }}：{{ dataRef.errorMsg }}
            </span>
            <div v-if="dataRef.expanded || expandedKeys.includes(dataRef.key)">
              <TermFileSystem
                :uuid="dataRef.value"
                :current-directory-input="resolvePaths(dataRef.value)"
                :base-path="getBasePath(dataRef.value)"
                :cached-state="FS_CACHE.get(dataRef.value)?.cache"
                @open-file="openFile"
                @state-change="stateChange"
                @cross-transfer="handleCrossTransfer"
              />
            </div>
          </div>
        </template>
      </a-tree>

      <div
        v-else
        class="empty-state"
      >
        <div class="empty-icon">
          <img
            :src="fileIcon"
            alt="File Icon"
            style="width: 48px; height: 48px; opacity: 0.5"
          />
        </div>
        <div class="empty-text">
          {{ t('files.noDataAvailable') }}
        </div>
      </div>
    </template>
  </div>

  <div
    v-for="editor in openEditors"
    v-show="editor?.visible"
    :key="editor?.filePath"
  >
    <EditorCode
      :editor="editor"
      :is-active="editor.key === activeEditorKey"
      @close-vim-editor="closeVimEditor"
      @handle-save="handleSave"
      @focus-editor="() => handleFocusEditor(editor.key)"
    />
  </div>
  <a-modal
    v-model:open="addConnVisible"
    :title="t('files.addSftpConnection')"
    :footer="null"
    :destroy-on-close="true"
    width="720px"
  >
    <a-tabs
      v-model:active-key="addConnTab"
      size="small"
      class="add-model-switch"
    >
      <a-tab-pane
        key="active"
        :tab="t('files.activeConnection')"
      >
        <div class="add-conn-section add-conn-section-asset">
          <div class="select-list">
            <template
              v-for="item in activeSelectableOptions"
              :key="item.value"
            >
              <div
                class="select-item"
                :class="{
                  hovered: hoveredActive === item.value,
                  disabled: item.value === selectedLeftUuid || item.value === selectedRightUuid
                }"
                @mouseover="hoveredActive = item.value === selectedLeftUuid || item.value === selectedRightUuid ? null : item.value"
                @mouseleave="hoveredActive = null"
                @click="!(item.value === selectedLeftUuid || item.value === selectedRightUuid) && confirmPickActive(item.value)"
              >
                <span class="item-label">{{ item.label }}</span>

                <CheckOutlined
                  v-if="item.value === selectedLeftUuid || item.value === selectedRightUuid"
                  class="selected-icon"
                />
              </div>
            </template>

            <div
              v-if="activeSelectableOptions.length === 0"
              class="select-empty"
            >
              {{ t('files.noActiveConnection') }}
            </div>
          </div>

          <div class="add-conn-hint"> {{ t('files.selectSftpTips') }} </div>
        </div>
      </a-tab-pane>

      <a-tab-pane
        key="asset"
        :tab="t('files.addFromAsset')"
      >
        <div class="add-conn-section add-conn-section-asset">
          <div class="add-conn-row add-conn-row--asset-search">
            <a-input
              v-model:value="assetSearchValue"
              allow-clear
              class="transparent-Input"
              :placeholder="t('files.sftpSearchPlaceholder')"
              @keydown.down.prevent="moveKeyboard(1)"
              @keydown.up.prevent="moveKeyboard(-1)"
              @keydown.enter.prevent="confirmKeyboardSelect"
            />
          </div>

          <div class="select-list">
            <template
              v-for="(item, index) in filteredHostOptions"
              :key="item.value"
            >
              <div
                v-if="isBastionHostType(item.type)"
                class="select-item select-group"
                :class="{
                  hovered: hovered === item.value,
                  'keyboard-selected': keyboardSelectedIndex === index,
                  expanded: !!item.expanded,
                  disabled: item.value === selectedLeftUuid || item.value === selectedRightUuid
                }"
                @mouseover="handleMouseOver(item.value, index)"
                @mouseleave="hovered = null"
                @click="toggleJumpserverExpand(item.key)"
              >
                <span class="item-label group-label">{{ item.label }}</span>
                <span class="group-badge">{{ item.childrenCount || (item.children ? item.children.length : 0) }}</span>
                <span class="group-toggle">
                  <DownOutlined
                    v-if="item.expanded"
                    class="toggle-icon"
                  />
                  <RightOutlined
                    v-else
                    class="toggle-icon"
                  />
                </span>
              </div>

              <div
                v-else
                class="select-item"
                :class="{
                  hovered: hovered === item.value,
                  disabled: item.value === selectedLeftUuid || item.value === selectedRightUuid
                }"
                :style="{ paddingLeft: item.level === 1 ? '24px' : '6px' }"
                @mouseover="handleMouseOver(item.value, index)"
                @mouseleave="hovered = null"
                @click="onHostClick(item)"
              >
                <span class="item-label">{{ item.label }}</span>
                <CheckOutlined
                  v-if="item.value === selectedLeftUuid || item.value === selectedRightUuid"
                  class="selected-icon"
                />
              </div>
            </template>
          </div>

          <div class="add-conn-hint"> {{ t('files.selectAssetSftpTips') }} </div>
        </div>
      </a-tab-pane>
    </a-tabs>
  </a-modal>

  <TransferPanel />
</template>

<script lang="ts" setup>
import { computed, markRaw, nextTick, onBeforeUnmount, onMounted, reactive, ref, UnwrapRef, watch } from 'vue'
import type { TreeProps } from 'ant-design-vue/es/tree'
import TermFileSystem from './files.vue'
import { useI18n } from 'vue-i18n'
import EditorCode, { editorData } from '../Ssh/editors/dragEditor.vue'
import { message, Modal } from 'ant-design-vue'
import { LanguageMap } from '../Editors/base/languageMap'
import { Base64Util } from '@utils/base64'
import eventBus from '../../../utils/eventBus'
import { userConfigStore } from '@/services/userConfigStoreService'
import { initTransferListener } from './fileTransfer'
import TransferPanel from './fileTransferProgress.vue'
import fileIcon from '@/assets/menu/files.svg'
import { CheckOutlined, CloseOutlined, DownOutlined, PlusOutlined, RightOutlined } from '@ant-design/icons-vue'

const { t } = useI18n()

const logger = createRendererLogger('files')
type PanelCache = {
  path: string
  ts: number
}

type TermFsExpose = { refresh?: () => void | Promise<void> }

type FsEntry = {
  cache?: PanelCache
  inst?: TermFsExpose
}

const FS_CACHE = reactive(new Map<string, FsEntry>())

const getCurrentActiveTerminalInfo = async () => {
  try {
    const assetInfo = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        eventBus.off('assetInfoResult', handleResult)
        reject(new Error(t('common.timeoutGettingAssetInfo')))
      }, 5000)

      const handleResult = (result) => {
        clearTimeout(timeout)
        eventBus.off('assetInfoResult', handleResult)
        resolve(result)
      }
      eventBus.on('assetInfoResult', handleResult)
      eventBus.emit('getActiveTabAssetInfo')
    })
    return assetInfo
  } catch (error) {
    logger.error('Error getting asset info', { error: error })
    return null
  }
}

interface ActiveTerminalInfo {
  uuid?: string
  title?: string
  ip?: string
  organizationId?: string
  type?: string
  outputContext?: string
  tabSessionId?: string
}

const currentActiveTerminal = ref<ActiveTerminalInfo | null>(null)

const handleActiveTabChanged = async (tabInfo: ActiveTerminalInfo) => {
  if (tabInfo && tabInfo.ip) {
    currentActiveTerminal.value = tabInfo
    await listUserSessions()
  }
}

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max)

const resizeEditor = (ed: editorData, rect: DOMRect) => {
  if (!ed.userResized) {
    ed.vimEditorWidth = Math.round(rect.width * 0.7)
    ed.vimEditorHeight = Math.round(rect.height * 0.7)
  } else {
    const scale = Math.min(1, rect.width / Math.max(ed.vimEditorWidth, 1), rect.height / Math.max(ed.vimEditorHeight, 1))
    if (scale < 1) {
      // Passively reduced clearing user adjustment status
      ed.userResized = false
      ed.vimEditorWidth = Math.floor(ed.vimEditorWidth * scale)
      ed.vimEditorHeight = Math.floor(ed.vimEditorHeight * scale)
    }
  }
  // boundary clamping
  ed.vimEditorX = clamp(ed.vimEditorX, 0, Math.max(0, rect.width - ed.vimEditorWidth))
  ed.vimEditorY = clamp(ed.vimEditorY, 0, Math.max(0, rect.height - ed.vimEditorHeight))
}
const fileElement = ref<HTMLDivElement | null>(null)
const debounce = (func, wait, immediate = false) => {
  let timeout
  let isFirstCall = true
  let isDragging = false
  let lastCallTime = 0

  return function executedFunction(...args) {
    const now = Date.now()
    const timeSinceLastCall = now - lastCallTime
    lastCallTime = now
    isDragging = timeSinceLastCall < 50
    const later = () => {
      clearTimeout(timeout)
      timeout = null
      if (!immediate) func(...args)
      isDragging = false
    }
    const callNow = immediate && !timeout
    clearTimeout(timeout)
    let dynamicWait
    if (isDragging) {
      dynamicWait = 5
    } else if (isFirstCall) {
      dynamicWait = 0
    } else {
      dynamicWait = wait
    }

    timeout = setTimeout(later, dynamicWait)

    if (callNow) {
      func(...args)
      isFirstCall = false
    }
  }
}

const handleResize = () => {
  const el = fileElement.value
  if (!el) return
  try {
    const rect = el.getBoundingClientRect()
    if (rect && rect.width > 0 && rect.height > 0) {
      openEditors.forEach((ed) => resizeEditor(ed, rect))
    }
  } catch (error) {
    logger.error('Failed to resize terminal', { error: error })
  }
}

let resizeObserver: ResizeObserver | null = null
const debouncedUpdate = debounce(handleResize, 100)

// SFTP connect from TabIndex (click/drag)
const getSshUserConfig = async () => {
  try {
    return await userConfigStore.getConfig()
  } catch {
    return {} as any
  }
}

const buildSftpConnDataForFiles = async (node: any, side: PanelSide) => {
  const assetUuid = String(node?.uuid || '')
  const assetInfo = await api.connectAssetInfo({ uuid: assetUuid })

  const cfg: any = await getSshUserConfig()

  let password = ''
  let privateKey = ''
  let passphrase = ''

  if (assetInfo) {
    password = assetInfo.auth_type === 'password' ? assetInfo.password || '' : ''
    privateKey = assetInfo.auth_type === 'keyBased' ? assetInfo.privateKey || '' : ''
    passphrase = assetInfo.auth_type === 'keyBased' ? assetInfo.passphrase || '' : ''
  } else {
    password = node?.authType === 'password' ? node?.password || '' : node?.password || ''
    privateKey = node?.authType === 'privateKey' ? node?.privateKey || '' : node?.privateKey || ''
    passphrase = node?.passphrase || ''
  }

  const orgId = String(node?.organizationId || '')
  const connOrgType = orgId.includes('person') ? 'local' : 'local-team'

  const connConnectHost = assetInfo?.asset_ip || node?.host || node?.ip
  const connUsername = assetInfo?.username || node?.username
  const connAssetIp = assetInfo?.asset_ip || node?.host || node?.ip
  const connHostname = assetInfo?.hostname || node?.hostname || node?.title || node?.ip
  const connPort = assetInfo?.port || node?.port || 22
  const connHost = assetInfo?.host || node?.host || node?.ip
  const connComment = assetInfo?.comment || node?.comment || ''

  const connSshType = assetInfo?.sshType || node?.sshType || 'ssh'
  const connAssetType = assetInfo?.asset_type || node?.asset_type || ''

  const displayIp = node?.ip || assetInfo?.asset_ip || node?.host || ''
  const hostnameBase64 = orgId.includes('person')
    ? Base64Util.encode(String(connAssetIp || displayIp))
    : Base64Util.encode(String(connHostname || connAssetIp || displayIp))

  const sessionId = `files-${side}`
  const connId = `${connUsername}@${displayIp}:${connOrgType}:${hostnameBase64}:${sessionId}`

  const jmsToken = localStorage.getItem('jms-token') || ''
  const jumpserverUuid = assetInfo?.organization_uuid || assetUuid

  const connData: any = {
    id: connId,
    assetUuid: jumpserverUuid,
    host: connConnectHost,
    port: connPort,
    username: connUsername,
    password,
    privateKey,
    passphrase,
    targetIp: connHost,
    targetHostname: connHostname,
    targetAsset: connComment || connHost,
    comment: connComment,
    sshType: connSshType,
    terminalType: cfg?.terminalType || 'vt100',
    agentForward: cfg?.sshAgentsStatus === 1,
    isOfficeDevice: false,
    connIdentToken: jmsToken,
    asset_type: connAssetType,
    proxyCommand: node?.proxyCommand || ''
  }

  connData.needProxy = assetInfo?.need_proxy === 1 || false
  if (connData.needProxy && assetInfo?.proxy_name && Array.isArray(cfg?.sshProxyConfigs)) {
    connData.proxyConfig = cfg.sshProxyConfigs.find((item: any) => item?.name === assetInfo.proxy_name)
  }

  return connData
}

const connectSftpFromAssetNode = async (node: any, side: PanelSide) => {
  const uuid = String(node?.uuid || '')
  if (!uuid) return

  sideLoading[side] = true
  try {
    const connData = await buildSftpConnDataForFiles(node, side)
    const targetId = String(connData.id || '')
    const targetDisplayName = getConnDisplayName(String(connData.id || ''))

    // Check whether there is already a similar connection on both the left and right sides
    const leftDisplayName = getConnDisplayName(String(selectedLeftUuid.value || ''))
    const rightDisplayName = getConnDisplayName(String(selectedRightUuid.value || ''))
    if (targetDisplayName) {
      if (targetDisplayName === rightDisplayName) {
        message.info(t('files.openedOnRight'))
        return
      }
      if (targetDisplayName === leftDisplayName) {
        message.info(t('files.openedOnLeft'))
        return
      }
    }

    const res = await api.sftpConnect(connData)

    if (!res || res.status !== 'connected') {
      const msg = res?.messageKey ? t(res.messageKey, res.messageParams || {}) : res?.message || ''
      message.error(msg ? `${t('files.sftpConnectFailed')}：${msg}` : t('files.sftpConnectFailed'))
      return
    }

    // The current asset UUID corresponding to the side connection, used for drag-and-drop disablement judgment
    sideCurrentAssetKey[side] = uuid

    let found = false
    for (let i = 0; i < 6; i++) {
      await listUserSessions()
      found = sessionNodes.value.some((n: any) => String(n.value) === targetId)
      if (found) break
      await new Promise((r) => setTimeout(r, 150))
    }

    if (!targetId) return
    if (side === 'left') {
      selectedLeftUuid.value = targetId
      // The default setting should be kept as "Local"; if the same connection appears, revert to "Local" on the right side
      if (String(selectedRightUuid.value || '') === targetId) selectedRightUuid.value = LOCAL_ID
    } else {
      selectedRightUuid.value = targetId
      if (String(selectedLeftUuid.value || '') === targetId) selectedLeftUuid.value = ''
    }

    ensureSessionState(targetId)
    openSession(targetId)
    await refreshAfterSelect(targetId)
  } catch (e: any) {
    message.error(`${t('files.sftpConnectFailed')}：${e?.message || e}`)
  } finally {
    sideLoading[side] = false
  }
}

const handleOpenSftpByAssetNode = async (payload: any) => {
  let side = payload?.side as PanelSide | 'auto' | undefined
  if (side !== 'left' && side !== 'right') {
    const leftEmpty = !selectedLeftUuid.value
    const rightEmpty = !selectedRightUuid.value
    side = leftEmpty ? 'left' : rightEmpty ? 'right' : 'right'
  }

  const finalSide: PanelSide = side === 'left' ? 'left' : 'right'
  const node = payload?.node

  await connectSftpFromAssetNode(node, finalSide)
}

onMounted(async () => {
  initTransferListener()
  eventBus.on('files-open-sftp-by-asset-node', handleOpenSftpByAssetNode)
  const activeTerminal = await getCurrentActiveTerminalInfo()
  if (activeTerminal) {
    currentActiveTerminal.value = activeTerminal
  }
  await listUserSessions()

  if (uiMode.value === 'transfer' && selectedRightUuid.value === LOCAL_ID) {
    ensureSessionState(LOCAL_ID)
    collapsedState[LOCAL_ID] = false
    openSession(LOCAL_ID)
    await nextTick()
    await refreshAfterSelect(LOCAL_ID)
  }

  eventBus.on('activeTabChanged', handleActiveTabChanged)
  resizeObserver = new ResizeObserver(() => {
    debouncedUpdate()
  })

  if (fileElement.value) {
    resizeObserver.observe(fileElement.value)
  }
})

onBeforeUnmount(() => {
  eventBus.off('activeTabChanged', handleActiveTabChanged)
  eventBus.off('files-open-sftp-by-asset-node', handleOpenSftpByAssetNode)
  if (resizeObserver) {
    resizeObserver.disconnect()
  }
  cleanupSplitListeners()
})
const api = (window as any).api
const expandedKeys = ref<string[]>([])
// Editor binding
const activeEditorKey = ref(null)
const handleFocusEditor = (key) => {
  activeEditorKey.value = key
}

interface SftpConnectionInfo {
  id: string
  isSuccess: boolean
  sftp?: any
  error?: string
}

const LOCAL_ID = 'localhost@127.0.0.1:local:TG9jYWw='
const isLocalTeam = (id: string) => String(id || '').includes('local-team')
const isLocal = (id: string) => String(id || '').includes('localhost@127.0.0.1:local')

const getConnDisplayName = (id: string) => {
  const sid = String(id || '')
  const [, rest = ''] = sid.split('@')
  const parts = rest.split(':')
  let ip = parts[0] || ''

  if (isLocalTeam(sid)) {
    const hostnameBase64 = parts[2] || ''
    try {
      ip = Base64Util.decode(hostnameBase64)
    } catch {
      // ignore
    }
  }

  if (isLocal(sid)) {
    ip = 'Local'
  }

  return ip || sid
}

const listUserSessions = async () => {
  const sessionData: SftpConnectionInfo[] = await api.sftpConnList()

  if (!sessionData.some((s) => isLocal(String(s.id)))) {
    sessionData.unshift({
      id: LOCAL_ID,
      isSuccess: true
    } as SftpConnectionInfo)
  }

  const alive = new Set(sessionData.map((s) => String(s.id)))
  for (const k of Array.from(FS_CACHE.keys())) {
    if (!alive.has(k)) FS_CACHE.delete(k)
  }

  const sessionResult = sessionData.reduce<Record<string, SftpConnectionInfo>>((acc, item) => {
    const id = String(item.id || '')
    const [, rest = ''] = id.split('@')
    const parts = rest.split(':')

    let ip = parts[0] || 'Unknown'

    if (isLocalTeam(id)) {
      const hostnameBase64 = parts[2] || 'Unknown'
      try {
        ip = Base64Util.decode(hostnameBase64)
      } catch {
        ip = 'Unknown'
      }
    }

    if (isLocal(id)) {
      ip = 'Local'
    }

    if (!(ip in acc)) acc[ip] = item
    return acc
  }, {})

  updateTreeData({ ...sessionResult })
}

const objectToTreeData = (obj: object): any[] => {
  return Object.entries(obj).map(([key, value]) => {
    const keys: string[] = []
    const isActive = currentActiveTerminal.value && currentActiveTerminal.value.ip === key

    const node = {
      title: key,
      errorMsg: value.isSuccess ? null : (value.error ?? ''),
      key: key,
      draggable: true,
      value: String(value.id),
      isLeaf: false,
      class: isActive ? 'active-terminal' : ''
    }
    if (keys.length < 1) {
      keys.push(key)
      expandedKeys.value = keys
    }
    return node
  })
}

const treeData = ref<TreeProps['treeData']>([])

type UiMode = 'default' | 'transfer'
type PanelSide = 'left' | 'right'

const FILES_DRAG_MIME = 'application/x-asset-sftp'

const sideLoading = reactive<Record<PanelSide, boolean>>({
  left: false,
  right: false
})

type PendingConnect = { id: string; requestId: string }
const pendingConnect = reactive<Record<PanelSide, PendingConnect | null>>({
  left: null,
  right: null
})

const invokeIpc = (channel: string, payload?: any) => {
  try {
    if ((api as any)?.invoke) return (api as any).invoke(channel, payload)
    if ((api as any)?.ipcRenderer?.invoke) return (api as any).ipcRenderer.invoke(channel, payload)

    const w: any = window as any
    if (w?.ipcRenderer?.invoke) return w.ipcRenderer.invoke(channel, payload)
    if (w?.require) {
      const { ipcRenderer } = w.require('electron')
      if (ipcRenderer?.invoke) return ipcRenderer.invoke(channel, payload)
    }
  } catch {}
  return Promise.resolve(null)
}

const closeSftpById = async (id: string) => {
  const cid = String(id || '')
  if (!cid || cid === CREATE_FILE_CONN_VALUE || isLocal(cid)) return

  try {
    if (pendingConnect.left?.id === cid) await cancelConnect('left')
    if (pendingConnect.right?.id === cid) await cancelConnect('right')

    if ((api as any)?.sftpClose) {
      await (api as any).sftpClose({ id: cid })
    } else {
      await invokeIpc('ssh:sftp:close', { id: cid })
    }

    if (String(selectedLeftUuid.value || '') === cid) closeLeftPanel()
    if (String(selectedRightUuid.value || '') === cid) closeRightPanel()

    await listUserSessions()
    message.success(t('files.sftpClosed'))
  } catch (e: any) {
    message.error(`${t('files.sftpCloseFailed')}：${e?.message || e}`)
  }
}

const cancelConnect = async (side: PanelSide) => {
  const p = pendingConnect[side]
  if (!p) return

  try {
    if ((api as any)?.sftpCancel) {
      await (api as any).sftpCancel({ id: p.id, requestId: p.requestId })
    } else {
      await invokeIpc('ssh:sftp:cancel', { id: p.id, requestId: p.requestId })
    }
  } catch {}

  // loading
  pendingConnect[side] = null
  sideLoading[side] = false
  message.info(t('files.cancelSftpConnect'))
}

// drag-highlight state for empty placeholder areas
const emptyDragging = reactive<Record<PanelSide, boolean>>({
  left: false,
  right: false
})

const closeLeftPanel = () => {
  if (sideLoading.left) return
  selectedLeftUuid.value = ''
  sideCurrentAssetKey.left = ''
  emptyDragging.left = false
  if (dropHoverSide.value === 'left') dropHoverSide.value = ''
  if (dropForbiddenSide.value === 'left') dropForbiddenSide.value = ''
}

const closeRightPanel = () => {
  if (sideLoading.right) return
  selectedRightUuid.value = ''
  sideCurrentAssetKey.right = ''
  emptyDragging.right = false
  if (dropHoverSide.value === 'right') dropHoverSide.value = ''
  if (dropForbiddenSide.value === 'right') dropForbiddenSide.value = ''
}

const dropHoverSide = ref<PanelSide | ''>('')
const dropForbiddenSide = ref<PanelSide | ''>('')

const sideCurrentAssetKey = reactive<Record<PanelSide, string>>({
  left: '',
  right: ''
})

const sideDropClass = (side: PanelSide) => ({
  'panel-drop-hover': dropHoverSide.value === side,
  'panel-drop-forbidden': dropForbiddenSide.value === side
})

const readSftpDragPayload = (e: DragEvent) => {
  const raw = e.dataTransfer?.getData(FILES_DRAG_MIME)
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

const parseUserHost = (connId: string) => {
  const head = String(connId || '').split(':')[0] // username@ip
  const [user, host] = head.split('@')
  return { user: user || '', host: host || '' }
}

const isForbiddenDrop = (side: PanelSide, payload: any) => {
  if (!payload) return true

  const other: PanelSide = side === 'left' ? 'right' : 'left'

  if (payload.uuid) {
    if (sideCurrentAssetKey[side] && String(payload.uuid) === String(sideCurrentAssetKey[side])) return true
    if (sideCurrentAssetKey[other] && String(payload.uuid) === String(sideCurrentAssetKey[other])) return true
  }

  const curId = side === 'left' ? String(selectedLeftUuid.value || '') : String(selectedRightUuid.value || '')
  const otherId = other === 'left' ? String(selectedLeftUuid.value || '') : String(selectedRightUuid.value || '')
  const cur = parseUserHost(curId)
  const oth = parseUserHost(otherId)
  if (payload.username && payload.ip) {
    if (cur.user && cur.host && String(payload.username) === cur.user && String(payload.ip) === cur.host) return true
    if (oth.user && oth.host && String(payload.username) === oth.user && String(payload.ip) === oth.host) return true
  }

  return false
}

const onSideDragEnter = (e: DragEvent, side: PanelSide) => {
  const payload = readSftpDragPayload(e)
  if (!payload) return
  const forbidden = isForbiddenDrop(side, payload)
  dropForbiddenSide.value = forbidden ? side : ''
  dropHoverSide.value = forbidden ? '' : side
}

const onSideDragOver = (e: DragEvent, side: PanelSide) => {
  const payload = readSftpDragPayload(e)
  if (!payload) return

  const forbidden = isForbiddenDrop(side, payload)
  if (forbidden) {
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'none'
    dropForbiddenSide.value = side
    dropHoverSide.value = ''
    return
  }

  e.preventDefault()
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
  dropForbiddenSide.value = ''
  dropHoverSide.value = side
}

const onSideDragLeave = (_e: DragEvent, side: PanelSide) => {
  if (dropHoverSide.value === side) dropHoverSide.value = ''
  if (dropForbiddenSide.value === side) dropForbiddenSide.value = ''
}

const onSideDrop = async (e: DragEvent, side: PanelSide) => {
  const payload = readSftpDragPayload(e)
  if (!payload) return

  e.preventDefault()
  dropHoverSide.value = ''

  const forbidden = isForbiddenDrop(side, payload)
  dropForbiddenSide.value = forbidden ? side : ''
  if (forbidden) return

  await connectSftpFromAssetNode(payload, side)
  dropForbiddenSide.value = ''
}

// When the panel is empty, the placeholder layer will eat the DnD events.
const handleEmptyDragEnter = (e: DragEvent, side: PanelSide) => {
  const payload = readSftpDragPayload(e)
  if (payload) {
    onSideDragEnter(e, side)
    return
  }
  // OS files
  emptyDragging[side] = true
}

const handleEmptyDragOver = (e: DragEvent, side: PanelSide) => {
  const payload = readSftpDragPayload(e)
  if (payload) {
    onSideDragOver(e, side)
    return
  }
  // OS files
  e.preventDefault()
  emptyDragging[side] = true
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
}

const handleEmptyDragLeave = (e: DragEvent, side: PanelSide) => {
  const payload = readSftpDragPayload(e)
  if (payload) {
    onSideDragLeave(e, side)
    return
  }
  emptyDragging[side] = false
}

const normalizeFsPath = (p: string) => String(p || '').replace(/\\/g, '/')
const dirnameFsPath = (p: string) => {
  const s = normalizeFsPath(p)
  const idx = s.lastIndexOf('/')
  return idx > 0 ? s.slice(0, idx) : ''
}

const handleEmptyDrop = async (e: DragEvent, side: PanelSide) => {
  emptyDragging[side] = false

  const payload = readSftpDragPayload(e)
  if (payload) {
    // connection DnD
    await onSideDrop(e, side)
    return
  }

  // OS files -> move Local panel to this side and jump to file folder when possible
  const fileList = Array.from(e.dataTransfer?.files || [])
  if (!fileList.length) return

  // Local session is singleton: keep only one side showing Local.
  const other: PanelSide = side === 'left' ? 'right' : 'left'
  const otherUuid = other === 'left' ? String(selectedLeftUuid.value || '') : String(selectedRightUuid.value || '')
  if (isLocalId(otherUuid)) {
    if (other === 'left') closeLeftPanel()
    else closeRightPanel()
  }

  const fp = (fileList[0] as any)?.path ? String((fileList[0] as any).path) : ''
  const dir = fp ? dirnameFsPath(fp) : ''

  if (side === 'left') selectedLeftUuid.value = LOCAL_ID
  else selectedRightUuid.value = LOCAL_ID

  if (dir) {
    const entry = FS_CACHE.get(LOCAL_ID) || {}
    entry.cache = { path: dir, ts: Date.now() }
    FS_CACHE.set(LOCAL_ID, entry)
  }

  ensureSessionState(LOCAL_ID)
  openSession(LOCAL_ID)
  await refreshAfterSelect(LOCAL_ID)
}

const uiMode = ref<UiMode>('transfer')

const uiModeView = ref(uiMode.value)

const onModeChange = async (val: 'default' | 'transfer') => {
  uiModeView.value = val
  await nextTick()

  await new Promise<void>((r) => requestAnimationFrame(() => r()))

  uiMode.value = val
}

// Transfer mode: per-session collapse + lazy mount (avoid fetching for collapsed trees) ---
const collapsedState = reactive<Record<string, boolean>>({})
const openedState = reactive<Record<string, boolean>>({})

const isCollapsed = (uuid: string) => !!collapsedState[uuid]
const isOpened = (uuid: string) => !!openedState[uuid]

const openSession = (uuid: string) => {
  openedState[uuid] = true
  collapsedState[uuid] = false
}

const collapseSession = (uuid: string) => {
  collapsedState[uuid] = true
}

const toggleSession = (uuid: string) => {
  if (isCollapsed(uuid)) openSession(uuid)
  else collapseSession(uuid)
}

const ensureSessionState = (uuid: string) => {
  if (collapsedState[uuid] === undefined) collapsedState[uuid] = true
  if (openedState[uuid] === undefined) openedState[uuid] = false
}

// Split-pane resize (transfer mode only)
const transferLayoutRef = ref<HTMLElement | null>(null)
const splitRatio = ref(0.5) // left pane width ratio
const isResizing = ref(false)

const MIN_PANE_PX = 260
const MIN_RATIO = 0.2
const MAX_RATIO = 0.8

const transferLayoutStyle = computed(() => {
  // const left = Math.round(splitRatio.value * 10000) / 100
  // const right = Math.round((1 - splitRatio.value) * 10000) / 100
  return {
    gridTemplateColumns: `${splitRatio.value}fr 8px ${1 - splitRatio.value}fr`
  }
})

let splitMoveListener: ((e: MouseEvent) => void) | null = null
let splitUpListener: ((e: MouseEvent) => void) | null = null

const cleanupSplitListeners = () => {
  if (splitMoveListener) {
    window.removeEventListener('mousemove', splitMoveListener)
    splitMoveListener = null
  }
  if (splitUpListener) {
    window.removeEventListener('mouseup', splitUpListener)
    splitUpListener = null
  }
  isResizing.value = false
  document.body.style.cursor = ''
  document.body.style.userSelect = ''
}

const onTransferResizeMouseDown = (e: MouseEvent) => {
  if (uiMode.value !== 'transfer') return
  const el = transferLayoutRef.value
  if (!el) return

  e.preventDefault()
  isResizing.value = true
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'

  const rect = el.getBoundingClientRect()
  const total = Math.max(1, rect.width)
  const minRatioPx = MIN_PANE_PX / total

  let minRatio = Math.max(MIN_RATIO, minRatioPx)
  let maxRatio = Math.min(MAX_RATIO, 1 - minRatioPx)

  // If the container is too narrow, fall back to a fixed split.
  if (minRatio > maxRatio) {
    minRatio = 0.5
    maxRatio = 0.5
  }

  splitMoveListener = (ev: MouseEvent) => {
    const x = ev.clientX - rect.left
    splitRatio.value = clamp(x / total, minRatio, maxRatio)
  }

  splitUpListener = () => {
    cleanupSplitListeners()
  }

  window.addEventListener('mousemove', splitMoveListener)
  window.addEventListener('mouseup', splitUpListener, { once: true })
}

// Transfer mode: use single connection per side (no root cross-drag)
// Keep: per-session collapse/expand + file DnD transfer between panels via TermFileSystem @cross-transfer.
const sessionMap = computed(() => {
  const map = new Map<string, any>()
  ;((treeData.value as any[]) || []).forEach((n: any) => {
    map.set(String(n.value), n)
  })
  return map
})

const sessionNodes = computed(() => ((treeData.value as any[]) || []) as any[])

const selectedLeftUuid = ref<string>('')
const selectedRightUuid = ref<string>(LOCAL_ID)

const selectedLeftNode = computed(() => sessionMap.value.get(String(selectedLeftUuid.value)))
const selectedRightNode = computed(() => sessionMap.value.get(String(selectedRightUuid.value)))

type AddConnTarget = 'left' | 'right'
const addConnTargetSide = ref<AddConnTarget>('right')

const CREATE_FILE_CONN_VALUE = '__create_file_conn__'

const leftSelectOptions = computed(() => {
  const opts = sessionNodes.value.map((n: any) => ({
    label: getConnDisplayName(String(n.value ?? '')),
    value: String(n.value ?? ''),
    disabled: !!selectedRightUuid.value && String(n.value) === String(selectedRightUuid.value)
  }))
  opts.push({
    label: t('files.addSftpConnection'),
    value: CREATE_FILE_CONN_VALUE,
    disabled: false
  })
  return opts
})

const rightSelectOptions = computed(() => {
  const opts = sessionNodes.value.map((n: any) => ({
    label: getConnDisplayName(String(n.value ?? '')),
    value: String(n.value ?? ''),
    disabled: !!selectedLeftUuid.value && String(n.value) === String(selectedLeftUuid.value)
  }))
  opts.push({
    label: t('files.addSftpConnection'),
    value: CREATE_FILE_CONN_VALUE,
    disabled: false
  })
  return opts
})

const lastRightUuid = ref<string>('')

watch(
  selectedRightUuid,
  (v) => {
    const val = String(v || '')
    if (val && val !== CREATE_FILE_CONN_VALUE) lastRightUuid.value = val
  },
  { immediate: true }
)

const lastLeftUuid = ref<string>('')

watch(
  selectedLeftUuid,
  (v) => {
    const val = String(v || '')
    if (val && val !== CREATE_FILE_CONN_VALUE) lastLeftUuid.value = val
  },
  { immediate: true }
)

const onLeftSelectChange = async (v: any) => {
  const val = String(v || '')

  if (val === CREATE_FILE_CONN_VALUE) {
    selectedLeftUuid.value = lastLeftUuid.value || ''
    await openAddConnModal('left')
    return
  }

  // It is not allowed to select the same connection on both sides
  if (val && selectedRightUuid.value && val === String(selectedRightUuid.value)) {
    selectedLeftUuid.value = lastLeftUuid.value || ''
    return
  }

  selectedLeftUuid.value = val
  ensureSessionState(val)
  openSession(val)
  await refreshAfterSelect(val)
}

const refreshAfterSelect = async (uuid: string) => {
  const u = String(uuid || '')
  if (!u || u === CREATE_FILE_CONN_VALUE) return

  await nextTick()

  for (let i = 0; i < 12; i++) {
    await new Promise<void>((r) => requestAnimationFrame(() => r()))
    const inst = FS_CACHE.get(u)?.inst
    if (inst?.refresh) {
      try {
        await inst.refresh()
      } catch {
        // ignore
      }
      return
    }
  }
}

// Add connection (right side)
const addConnVisible = ref(false)
const addConnTab = ref<'active' | 'asset'>('active')

const activeSelectableOptions = computed(() => {
  // Disable the currently displayed connections on both the left and right sides
  const used = new Set(
    [selectedLeftUuid.value, selectedRightUuid.value].map((v) => String(v || '')).filter((v) => !!v && v !== CREATE_FILE_CONN_VALUE)
  )

  return sessionNodes.value
    .map((n: any) => {
      const v = String(n.value ?? '')
      return {
        label: getConnDisplayName(v),
        value: v,
        disabled: used.has(v)
      }
    })
    .filter((o) => String(o.value) !== CREATE_FILE_CONN_VALUE)
})

const openAddConnModal = async (side: AddConnTarget = 'right') => {
  addConnTargetSide.value = side
  addConnVisible.value = true
  addConnTab.value = 'active'
  try {
    await listUserSessions()
  } catch {
    // ignore
  }
}

// Record hover state
const hoveredActive = ref<string | null>(null)

const confirmPickActive = async (val) => {
  if (addConnTargetSide.value === 'left') {
    selectedLeftUuid.value = val
    ensureSessionState(val)
    openSession(val)
  } else {
    selectedRightUuid.value = val
    ensureSessionState(val)
    openSession(val)
  }

  addConnVisible.value = false
  await refreshAfterSelect(val)
}

// Asset/Host search (extracted from ContextSelectPopup - Level 2: Hosts List)
type HostOption = {
  key: string
  label: string
  value: string
  uuid?: string
  connect?: string
  type?: any
  selectable?: boolean
  organizationUuid?: string
  organizationId?: string
  title?: string
  isLocalHost?: boolean
  assetType?: string
  children?: HostOption[]
  childrenCount?: number
  expanded?: boolean
  level?: number
  // Optional connection hints (not required if connectAssetInfo is available)
  ip?: string
  host?: string
  username?: string
  port?: number
}

// State
const hostOptions = ref<HostOption[]>([])
const hostOptionsLoading = ref(false)
const hostOptionsLimit = 50
const expandedJumpservers = ref<Set<string>>(new Set())

const assetSearchValue = ref<string>('')
const hovered = ref<string | null>(null)
const keyboardSelectedIndex = ref<number>(-1)
const selectedHostValue = ref<string>('')

// Keep the same bastion detection semantics as your existing Context popup
const isBastionHostType = (type: any) => {
  return type === 'bastion'
}

const normalizeHostArray = (input: any): any[] => {
  if (!input) return []
  if (Array.isArray(input)) return input
  if (typeof input !== 'object') return []
  if (Array.isArray((input as any).data)) return (input as any).data
  if (Array.isArray((input as any).list)) return (input as any).list
  // If it already looks like a host record, wrap it
  if ((input as any).uuid || (input as any).ip || (input as any).label || (input as any).host) return [input]
  // Otherwise flatten dictionary values
  const out: any[] = []
  for (const v of Object.values(input)) out.push(...normalizeHostArray(v))
  return out
}

const toHostOption = (raw: any): HostOption => {
  const childrenRaw =
    (Array.isArray(raw?.children) && raw.children) || (Array.isArray(raw?.hosts) && raw.hosts) || (Array.isArray(raw?.nodes) && raw.nodes) || []

  const children = childrenRaw.map((c: any) => toHostOption(c))

  const uuid = String(raw?.uuid ?? raw?.assetUuid ?? raw?.asset_uuid ?? raw?.id ?? raw?.key ?? '')
  const key = String(raw?.key ?? uuid ?? raw?.id ?? raw?.ip ?? raw?.label ?? raw?.host ?? raw?.title ?? '')
  const label = String(raw?.label ?? raw?.ip ?? raw?.host ?? raw?.title ?? raw?.name ?? key ?? '')
  const connect = String(
    raw?.connect ?? raw?.connection ?? raw?.organizationId ?? raw?.organization_id ?? raw?.orgId ?? raw?.org_id ?? raw?.type ?? ''
  )
  const type = raw?.type ?? raw?.hostType ?? raw?.assetType ?? raw?.asset_type ?? connect
  const organizationUuid = String(raw?.organizationUuid ?? raw?.organization_uuid ?? '')
  const organizationId = String(raw?.organizationId ?? raw?.organization_id ?? organizationUuid ?? '')
  const assetType = String(raw?.assetType ?? raw?.asset_type ?? '')
  const ip = String(raw?.ip ?? raw?.asset_ip ?? raw?.host ?? '')
  const port = raw?.port ? Number(raw.port) : undefined
  const username = raw?.username ? String(raw.username) : undefined

  const selectable = raw?.selectable ?? children.length === 0

  return {
    key: key || uuid || label,
    value: String(raw?.value ?? (key || uuid || label)),
    label,
    uuid: uuid || String(raw?.value ?? ''),
    connect,
    type,
    selectable,
    organizationUuid,
    organizationId,
    title: String(raw?.title ?? label),
    isLocalHost: label === '127.0.0.1' || label === 'localhost',
    assetType,
    children,
    childrenCount: children.length,
    ip,
    host: ip || label,
    port,
    username
  }
}

const formatHostsCompat = (data: any): HostOption[] => {
  const arr = normalizeHostArray(data)
  return arr.map((x) => toHostOption(x))
}

const fetchHostOptions = async (search: string) => {
  if (hostOptionsLoading.value) return
  hostOptionsLoading.value = true
  try {
    const res = typeof (api as any).getUserHosts === 'function' ? await (api as any).getUserHosts(search || '', hostOptionsLimit) : null
    const formatted = res?.data ? formatHostsCompat(res.data) : formatHostsCompat(res)

    // Local host option (only show when it matches search, same as your context popup)
    const localHostOption: HostOption = {
      key: 'localhost',
      label: '127.0.0.1',
      value: 'localhost',
      uuid: 'localhost',
      connect: 'localhost',
      title: t('ai.localhost'),
      isLocalHost: true,
      type: 'personal',
      selectable: true,
      level: 0
    }

    const st = String(search || '').toLowerCase()
    const shouldShowLocalHost = !st || 'localhost'.includes(st) || '127.0.0.1'.includes(st) || String(t('ai.localhost')).toLowerCase().includes(st)

    hostOptions.value = shouldShowLocalHost ? [localHostOption, ...formatted] : formatted

    // Expand all bastion hosts by default
    const bastionKeys = formatted.filter((h) => isBastionHostType(h.type)).map((h) => h.key)
    expandedJumpservers.value = new Set(bastionKeys)
  } catch (e) {
    hostOptions.value = []
    message.error(t('files.getAssetListFailed'))
  } finally {
    hostOptionsLoading.value = false
  }
}

const toggleJumpserverExpand = (key: string) => {
  if (expandedJumpservers.value.has(key)) {
    expandedJumpservers.value.delete(key)
  } else {
    expandedJumpservers.value.add(key)
  }
  expandedJumpservers.value = new Set(expandedJumpservers.value)
}

// Flatten host options with children based on expand state (same as Context popup)
const flattenedHostOptions = computed<HostOption[]>(() => {
  const result: HostOption[] = []

  for (const item of hostOptions.value) {
    const isExpanded = expandedJumpservers.value.has(item.key)
    result.push({
      ...item,
      expanded: isExpanded,
      level: 0
    })

    if (isBastionHostType(item.type) && isExpanded && item.children) {
      for (const child of item.children) {
        result.push({
          ...child,
          key: child.key,
          label: child.label,
          value: child.key,
          uuid: child.uuid,
          connect: child.connect,
          type: child.type,
          selectable: child.selectable,
          organizationUuid: child.organizationUuid,
          organizationId: child.organizationId,
          assetType: child.assetType,
          level: 1
        })
      }
    }
  }

  return result
})

const filteredHostOptions = computed<HostOption[]>(() => {
  const searchTerm = assetSearchValue.value.toLowerCase().trim()
  if (!searchTerm) {
    return flattenedHostOptions.value
  }

  const result: HostOption[] = []
  for (const item of hostOptions.value) {
    const labelMatches = String(item.label || '')
      .toLowerCase()
      .includes(searchTerm)

    if (isBastionHostType(item.type)) {
      const matchingChildren =
        item.children?.filter((child) =>
          String(child.label || '')
            .toLowerCase()
            .includes(searchTerm)
        ) || []

      if (labelMatches || matchingChildren.length > 0) {
        result.push({
          ...item,
          expanded: true,
          level: 0
        })

        const childrenToShow = labelMatches ? item.children || [] : matchingChildren
        for (const child of childrenToShow) {
          result.push({
            key: child.key,
            label: child.label,
            value: child.key,
            uuid: child.uuid,
            connect: child.connect,
            type: child.type,
            selectable: child.selectable,
            organizationUuid: child.organizationUuid,
            organizationId: child.organizationId,
            assetType: child.assetType,
            level: 1
          })
        }
      }
    } else if (labelMatches) {
      result.push(item)
    }
  }

  return result
})

const handleMouseOver = (value: string, index: number) => {
  hovered.value = value
  keyboardSelectedIndex.value = index
}

const moveKeyboard = (delta: number) => {
  const len = filteredHostOptions.value.length
  if (!len) return
  let next = keyboardSelectedIndex.value
  if (next < 0) next = 0
  next = (next + delta + len) % len
  keyboardSelectedIndex.value = next
  hovered.value = String(filteredHostOptions.value[next]?.value || '')
}

const confirmKeyboardSelect = () => {
  const idx = keyboardSelectedIndex.value
  const item = idx >= 0 ? filteredHostOptions.value[idx] : null
  if (!item) return
  if (isBastionHostType(item.type) && !item.selectable) {
    toggleJumpserverExpand(String(item.key))
    return
  }
  void onHostClick(item)
}

const onHostClick = async (item: HostOption) => {
  if (!item) return

  // Bastion parent node click => expand/collapse
  if (isBastionHostType(item.type) && !item.selectable) {
    toggleJumpserverExpand(String(item.key))
    return
  }

  if (item.selectable === false) return

  selectedHostValue.value = String(item.value || '')

  // Local host: just switch panel to Local session (no need to call connect API)
  if (item.isLocalHost) {
    const target: PanelSide = addConnTargetSide.value === 'left' ? 'left' : 'right'
    if (target === 'left') {
      selectedLeftUuid.value = LOCAL_ID
      if (String(selectedRightUuid.value || '') === LOCAL_ID) selectedRightUuid.value = ''
    } else {
      selectedRightUuid.value = LOCAL_ID
      if (String(selectedLeftUuid.value || '') === LOCAL_ID) selectedLeftUuid.value = ''
    }

    ensureSessionState(LOCAL_ID)
    collapsedState[LOCAL_ID] = false
    openSession(LOCAL_ID)

    addConnVisible.value = false
    assetSearchValue.value = ''
    hovered.value = null
    keyboardSelectedIndex.value = -1
    await nextTick()
    await refreshAfterSelect(LOCAL_ID)
    return
  }
  // Convert to payload expected by connectSftpFromAssetNode
  const node = {
    uuid: item.uuid || item.value,
    ip: item.ip || item.label,
    host: item.host || item.label,
    username: item.username,
    port: item.port,
    organizationId: item.organizationId || item.connect || item.organizationUuid,
    organizationUuid: item.organizationUuid,
    type: item.type,
    asset_type: item.assetType
  }

  addConnVisible.value = false
  assetSearchValue.value = ''
  hovered.value = null
  keyboardSelectedIndex.value = -1

  // Use the same connect pipeline as sidebar click/drag
  await handleOpenSftpByAssetNode({
    node,
    side: addConnTargetSide.value || 'auto',
    source: 'click'
  })
}

// Open asset tab => load initial list (default shows a portion of assets)
watch(
  () => addConnTab.value,
  async (tab) => {
    if (tab === 'asset') {
      await fetchHostOptions('')
      keyboardSelectedIndex.value = filteredHostOptions.value.length ? 0 : -1
    }
  }
)

// Typing in search => debounce refetch from backend, just like Context popup
const debouncedFetchHosts = debounce(() => {
  if (addConnVisible.value && addConnTab.value === 'asset') {
    void fetchHostOptions(assetSearchValue.value)
  }
}, 300)

watch(assetSearchValue, () => {
  keyboardSelectedIndex.value = -1
  debouncedFetchHosts()
})

const onRightSelectChange = async (v: any) => {
  const val = String(v || '')

  if (val === CREATE_FILE_CONN_VALUE) {
    selectedRightUuid.value = lastRightUuid.value || ''
    openAddConnModal('right')
    return
  }

  selectedRightUuid.value = val
  if (val && selectedLeftUuid.value && val === String(selectedLeftUuid.value)) {
    selectedLeftUuid.value = ''
  }
  ensureSessionState(val)
  openSession(val)
  await refreshAfterSelect(val)
}
const addRightPanel = async () => {
  selectedRightUuid.value = lastRightUuid.value || ''
  openAddConnModal('right')
  return
}
const addLeftPanel = async () => {
  selectedLeftUuid.value = lastLeftUuid.value || ''
  openAddConnModal('left')
  return
}

watch(addConnVisible, (open) => {
  if (!open) {
    selectedHostValue.value = ''
    assetSearchValue.value = ''
  }
})

const isTransferAvailable = computed(() => ((treeData.value as any[]) || []).length >= 1)

watch(isTransferAvailable, (ok) => {
  if (!ok) {
    uiMode.value = 'default'
  }
})

// Keep selections valid + unique when sessions update
watch(
  treeData,
  () => {
    const uuids = new Set(sessionNodes.value.map((n: any) => String(n.value)))

    if (uuids.size === 0) return

    if (selectedLeftUuid.value && !uuids.has(String(selectedLeftUuid.value))) {
      selectedLeftUuid.value = ''
    }

    if (selectedRightUuid.value && !uuids.has(String(selectedRightUuid.value))) {
      selectedRightUuid.value = ''
    }

    if (selectedLeftUuid.value && selectedRightUuid.value && String(selectedLeftUuid.value) === String(selectedRightUuid.value)) {
      selectedLeftUuid.value = ''
    }

    // ensure collapse/open state map exists
    uuids.forEach((u) => ensureSessionState(u))

    // open selected sessions
    if (selectedLeftUuid.value) openSession(String(selectedLeftUuid.value))
    if (selectedRightUuid.value) openSession(String(selectedRightUuid.value))
  },
  { deep: true, immediate: true }
)

watch(
  uiMode,
  (m) => {
    if (m === 'transfer') {
      // make sure selected sessions are mounted/opened
      if (selectedLeftUuid.value) {
        ensureSessionState(String(selectedLeftUuid.value))
        openSession(String(selectedLeftUuid.value))
      }
      if (selectedRightUuid.value) {
        ensureSessionState(String(selectedRightUuid.value))
        openSession(String(selectedRightUuid.value))
      }
    }
  },
  { immediate: true }
)

// Cross-panel file transfer (triggered by TermFileSystem DnD)
interface CrossTransferPayload {
  kind: 'fs-item'
  fromUuid: string
  fromSide: PanelSide
  srcPath: string
  name: string
  isDir: boolean
  toUuid: string
  toSide: PanelSide
  targetDir: string
}

// simple POSIX-like join (backend side usually normalizes)
const joinPath = (...parts: string[]) => parts.join('/').replace(/\/+/g, '/')

const refreshByUuid = (uuid: string) => {
  FS_CACHE.get(String(uuid))?.inst?.refresh?.()
}

const stateChange = (s: any) => {
  const key = String(s.uuid)
  const entry = FS_CACHE.get(key) || {}

  entry.cache = {
    path: String(s.path || ''),
    ts: Date.now()
  }

  FS_CACHE.set(key, entry)
}

const bindFsInst = (uuid: string, el: any) => {
  const key = String(uuid)
  const entry = FS_CACHE.get(key) || {}

  if (el) entry.inst = markRaw(el as TermFsExpose)
  else delete entry.inst

  FS_CACHE.set(key, entry)
}

const fsRefFor = (uuid: string) => (el: any) => bindFsInst(uuid, el)

type OpKind = 'upload' | 'download' | 'transfer'

const pickFailLabel = (res: any, extra?: { fromUuid?: string; toUuid?: string }) => {
  const side = res?.errorSide as string | undefined
  const pickLocalTeam = (uuid: string) => {
    if (uuid.includes('local-team')) {
      const [, rest = ''] = String(uuid || '').split('@')
      const parts = rest.split(':')
      return safeDecodeB64(parts[2] || '')
    }
    return uuid
  }
  if (side === 'from') return pickLocalTeam(<string>extra?.fromUuid)
  if (side === 'to') return pickLocalTeam(<string>extra?.toUuid)
  if (side === 'local') return 'local'
  return res?.host || res?.id || ''
}
const notifyByStatus = (res: any, kind: OpKind, refreshUuid: string, extra?: { fromUuid?: string; toUuid?: string }) => {
  const status = res?.status
  const msg = res?.message || ''
  if (kind === 'upload') {
    if (status === 'success') {
      refreshByUuid(refreshUuid)
      return message.success(t('files.uploadSuccess'))
    }
    if (status === 'cancelled') return message.info(t('files.uploadCancel'))
    if (status === 'skipped') return message.info(t('files.uploadSkipped'))
    const label = pickFailLabel(res, extra)
    return message.error(`${t('files.uploadFailed')}：[${label || ''}] ${msg}`)
  }

  if (kind === 'download') {
    if (status === 'success') {
      refreshByUuid(refreshUuid)
      return message.success(t('files.downloadSuccess'))
    }
    if (status === 'cancelled') return message.info(t('files.downloadCancel'))
    if (status === 'skipped') return message.info(t('files.downloadSkipped'))
    const label = pickFailLabel(res, extra)
    return message.error(`${t('files.downloadFailed')}：[${label || ''}] ${msg}`)
  }

  // transfer
  if (status === 'success') {
    refreshByUuid(refreshUuid)
    return message.success(t('files.transferSuccess'))
  }
  if (status === 'cancelled') return message.info(t('files.transferCancel'))
  if (status === 'skipped') return message.info(t('files.transferSkipped'))
  const label = pickFailLabel(res, extra)

  return message.error(`${t('files.transferFailed')}：[${label || ''}] ${msg}`)
}

const handleCrossTransfer = async (p: CrossTransferPayload) => {
  if (!p || p.kind !== 'fs-item') return
  if (p.fromSide === p.toSide) return
  if (p.fromUuid === p.toUuid) return
  try {
    // local -> remote
    if (isLocalId(p.fromUuid) && !isLocalId(p.toUuid)) {
      const res = p.isDir
        ? await api.uploadDirectory({ id: p.toUuid, localPath: p.srcPath, remotePath: p.targetDir })
        : await api.uploadFile({ id: p.toUuid, localPath: p.srcPath, remotePath: p.targetDir })
      notifyByStatus(res, 'upload', p.toUuid)
      return
    }

    // remote -> local
    if (!isLocalId(p.fromUuid) && isLocalId(p.toUuid)) {
      if (p.isDir) {
        const res = await api.downloadDirectory({ id: p.fromUuid, remoteDir: p.srcPath, localDir: p.targetDir })
        notifyByStatus(res, 'download', p.toUuid)
      } else {
        const localPath = joinPath(p.targetDir, p.name)
        const res = await api.downloadFile({ id: p.fromUuid, remotePath: p.srcPath, localPath })
        notifyByStatus(res, 'download', p.toUuid)
      }
      return
    }

    // remote -> remote
    if (!isLocalId(p.fromUuid) && !isLocalId(p.toUuid)) {
      const res = p.isDir
        ? await api.transferDirectoryRemoteToRemote({
            fromId: p.fromUuid,
            toId: p.toUuid,
            fromDir: p.srcPath,
            toDir: p.targetDir,
            autoRename: true,
            concurrency: 3
          })
        : await api.transferFileRemoteToRemote({
            fromId: p.fromUuid,
            toId: p.toUuid,
            fromPath: p.srcPath,
            toPath: joinPath(p.targetDir, p.name),
            autoRename: true
          })

      notifyByStatus(res, 'transfer', p.toUuid, { fromUuid: p.fromUuid, toUuid: p.toUuid })
      return
    }
  } catch (err: any) {
    message.error(`${t('transferFailed')}：${(err as Error)?.message || String(err)}`)
  }
}

const updateTreeData = (newData: object) => {
  treeData.value = objectToTreeData(newData)
}

const isLocalId = (value: string) => value.includes('localhost@127.0.0.1:local')

const safeDecodeB64 = (s: string) => {
  try {
    return Base64Util.decode(s)
  } catch {
    return ''
  }
}

const localHome = ref('')
onMounted(async () => {
  try {
    localHome.value = await api.getAppPath('home')
  } catch {
    localHome.value = ''
  }
})

const getBasePath = (value: string) => {
  if (value.includes('local-team')) {
    const [, rest = ''] = String(value || '').split('@')
    const parts = rest.split(':')
    const hostname = safeDecodeB64(parts[2] || '') || 'Local'
    return `/Default/${hostname}`
  }

  return ''
}
const resolvePaths = (value: string) => {
  if (isLocalId(value)) {
    return localHome.value || ''
  }

  const [username] = String(value || '').split('@')
  return username === 'root' ? '/root' : `/home/${username}`
}

// Define editor interface
// Use interface-typed reactive array
const openEditors = reactive<editorData[]>([])

const getFileExt = (filePath: string) => {
  const idx = filePath.lastIndexOf('.')
  if (idx === -1) return '' // No extension
  return filePath.slice(idx).toLowerCase()
}
const openFile = async (data) => {
  const { filePath, terminalId } = data

  const { stdout, stderr } = await api.sshConnExec({
    cmd: `cat ${filePath}`,
    id: terminalId
  })
  let action = 'edit'
  if (stderr.indexOf('No such file or directory') !== '-1') {
    action = 'create'
  }
  if (stderr.indexOf('Permission denied') !== -1) {
    message.error(t('common.permissionDenied'))
  } else {
    const contentType = getFileExt(filePath) ? getFileExt(filePath) : '.python'
    const existingEditor = openEditors.find((editor) => editor?.filePath === filePath)
    const rect = fileElement.value?.getBoundingClientRect()
    if (!existingEditor && rect && rect.width > 0 && rect.height > 0) {
      const w = Math.round(rect.width * 0.7)
      const h = Math.round(rect.height * 0.7)
      openEditors.push({
        filePath: filePath,
        visible: true,
        vimText: stdout,
        originVimText: stdout,
        action: action,
        vimEditorX: Math.round(rect.width * 0.5 - w * 0.5),
        vimEditorY: Math.round(rect.height * 0.5 - h * 0.5),
        contentType: LanguageMap[contentType] ? LanguageMap[contentType] : 'python',
        vimEditorHeight: h,
        vimEditorWidth: w,
        loading: false,
        fileChange: false,
        saved: false,
        key: terminalId + '-' + filePath,
        terminalId: terminalId,
        editorType: contentType,
        userResized: false
      } as UnwrapRef<editorData>)
    } else if (existingEditor) {
      existingEditor.visible = true
      existingEditor.vimText = data
    }
  }
}

const closeVimEditor = (data) => {
  const { key, editorType } = data
  const editor = openEditors.find((editor) => editor?.key === key)
  if (editor?.fileChange) {
    if (!editor?.saved) {
      Modal.confirm({
        title: t('common.saveConfirmTitle'),
        content: t('common.saveConfirmContent', { filePath: editor?.filePath }),
        okText: t('common.confirm'),
        cancelText: t('common.cancel'),
        onOk() {
          handleSave({ key: editor?.key, needClose: true, editorType: editorType })
        },
        onCancel() {
          const index = openEditors.indexOf(editor)
          if (index !== -1) {
            openEditors.splice(index, 1)
          }
        }
      })
    }
  } else {
    const index = editor ? openEditors.indexOf(editor) : -1
    if (index !== -1) {
      openEditors.splice(index, 1)
    }
  }
}

const handleSave = async (data) => {
  const { key, needClose } = data
  const editor = openEditors.find((editor) => editor?.key === key)
  if (!editor) return
  let errMsg = ''

  if (editor?.fileChange) {
    editor.loading = true
    const { stderr } = await api.sshConnExec({
      cmd: `cat <<'EOFChaterm:save' > ${editor.filePath}\n${editor?.vimText}\nEOFChaterm:save\n`,
      id: editor?.terminalId
    })
    errMsg = stderr

    if (errMsg !== '') {
      message.error(`${t('common.saveFailed')}: ${errMsg}`)
      editor.loading = false
    } else {
      message.success(t('common.saveSuccess'))
      // Close
      if (editor) {
        if (needClose) {
          const index = openEditors.indexOf(editor)
          if (index !== -1) {
            openEditors.splice(index, 1)
          }
        } else {
          editor.loading = false
          editor.saved = true
          editor.fileChange = false
        }
      }
    }
  }
}

defineExpose({
  updateTreeData
})
</script>

<style lang="less" scoped>
.tree-container {
  height: 100%;
  overflow-y: auto;
  overflow-x: auto;
  border-radius: 2px;
  // scrollbar-width: auto;
  // scrollbar-color: var(--border-color-light) transparent;
}

/* Transfer mode: lock outer scrolling, let each side scroll independently (WinSCP-like). */
.tree-container.is-transfer {
  overflow: hidden;
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
}

.tree-container.is-resizing {
  user-select: none;
}

.tree-container.is-transfer .transfer-layout {
  flex: 1 1 auto;
  min-height: 0;
}

.tabs-content::-webkit-scrollbar {
  height: 3px;
}

:deep(.dark-tree) {
  background-color: var(--bg-color);
  height: 30% !important;
  padding-top: 8px;
  .ant-tree-node-content-wrapper,
  .ant-tree-title,
  .ant-tree-switcher,
  .ant-tree-node-selected {
    color: var(--text-color) !important;
    background-color: var(--bg-color) !important;
  }

  .ant-tree-switcher {
    color: var(--text-color-tertiary) !important;
  }

  .ant-tree-node-selected {
    background-color: var(--bg-color) !important;
  }

  .ant-tree-node-content-wrapper:hover {
    background-color: var(--bg-color) !important;
  }
}

.custom-tree-node {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  position: relative;
  padding-right: 24px;

  .title-with-icon {
    display: flex;
    align-items: center;
    color: var(--text-color);
    flex-grow: 1;

    .computer-icon {
      margin-right: 6px;
      font-size: 14px;
      color: var(--text-color);
    }
  }

  .favorite-icon {
    position: absolute;
    right: 0;
    top: 50%;
    transform: translateY(-50%);
    cursor: pointer;
    color: var(--text-color);
    margin-left: 8px;

    &:hover {
      opacity: 0.8;
    }
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
    margin-left: 6px;

    &:hover {
      color: var(--text-color-tertiary);
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
    color: var(--text-color-tertiary);
    min-width: 10px;
    height: 24px;
    flex-shrink: 0;

    &:hover {
      color: var(--text-color-tertiary);
    }
  }
}

/* Highlight the currently active terminal */
:deep(.active-terminal) {
  background-color: var(--primary-color) !important;
  color: white !important;

  .ant-tree-title {
    color: white !important;
  }
}

:deep(.active-terminal:hover) {
  background-color: var(--primary-color) !important;
}

.mode-switch {
  padding: 10px 0px 0px 10px;
  position: sticky;
  top: 0;
  z-index: 20;
  background: var(--bg-color);
}

.mode-radio {
  background: var(--bg-color-secondary);
  color: var(--text-color);
  border-color: var(--border-color-light);
}

.transfer-layout {
  display: grid;
  /* gridTemplateColumns is controlled by :style="transferLayoutStyle" */
  column-gap: 10px;
  padding: 10px;
  flex: 1 1 auto;
  min-height: 0;
  box-sizing: border-box;
}

.transfer-side {
  --sb-size: 6px;
  --sb-thumb: var(--border-color-light);
  --sb-thumb-hover: var(--text-color-tertiary);
  --sb-track: transparent;

  flex: 1 1 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  border-radius: 6px;
  background: var(--bg-color);
  overflow-y: auto;
  min-height: 0;
}

/* Chromium/Electron */
.transfer-side::-webkit-scrollbar {
  width: var(--sb-size);
  height: var(--sb-size);
}
.transfer-side::-webkit-scrollbar-track {
  background: var(--sb-track);
}
.transfer-side::-webkit-scrollbar-thumb {
  background-color: var(--sb-thumb);
  border-radius: 6px;
}
.transfer-side::-webkit-scrollbar-thumb:hover {
  background-color: var(--sb-thumb-hover);
}

.transfer-side.root-drop-active {
  border-color: var(--button-bg-color);
  box-shadow: 0 0 0 2px var(--select-border);
}

.transfer-divider {
  width: 8px;
  position: relative;
  cursor: col-resize;
  background: transparent;
}

.transfer-divider::before {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  left: 50%;
  width: 1px;
  transform: translateX(-50%);
  background: var(--border-color-light);
}

.transfer-divider:hover::before {
  width: 2px;
}

.tree-container.is-resizing .transfer-divider::before {
  width: 2px;
  background: var(--button-bg-color);
}

.session-card {
  border: 1px solid var(--border-color-light);
  border-radius: 6px;
  overflow: hidden;
  background: var(--bg-color);
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.session-card :deep(.ant-card) {
  box-shadow: none !important;
}
.session-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 10px;
  user-select: none;
  cursor: grab;
  background: var(--bg-color-secondary);
  border-bottom: 1px solid var(--border-color-light);
}

.session-header.disabled {
  cursor: not-allowed;
  opacity: 0.7;
}

.session-collapse {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 4px;
  color: var(--text-color-tertiary);
  cursor: pointer;
  flex: 0 0 auto;
  &:hover {
    background: var(--bg-color);
    color: var(--text-color);
  }
}

.session-title {
  font-weight: 700;
  color: var(--text-color);
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.session-error {
  color: red;
  font-weight: 700;
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.session-body {
  padding: 6px;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  text-align: center;
}

.empty-icon {
  margin-bottom: 16px;
}

.empty-text {
  font-size: 14px;
  color: var(--text-color-secondary);
}

.session-header-static {
  cursor: default;
}

.session-select {
  width: 80% !important;
}

.session-select :deep(.ant-select-selector) {
  background-color: var(--bg-color) !important;
  border: 1px solid var(--border-color) !important;
  border-radius: 6px;
  color: var(--text-color) !important;
  transition: all 0.3s;
  height: 32px;
}

.session-select :deep(.ant-select-selector:hover) {
  border-color: #1890ff !important;
  background-color: var(--bg-color) !important;
}

.session-select :deep(.ant-select-focused .ant-select-selector),
.session-select :deep(.ant-select-selector:focus) {
  border-color: #1890ff !important;
  box-shadow: 0 0 0 2px rgba(24, 144, 255, 0.2) !important;
  background-color: var(--bg-color) !important;
}

.session-select :deep(.ant-select-selection-item) {
  color: var(--text-color) !important;
  font-size: 14px;
  line-height: 32px;
}

.session-select :deep(.ant-select-selection-placeholder) {
  color: var(--text-color-tertiary) !important;
  font-size: 14px;
  line-height: 32px;
}

.session-select :deep(.ant-select-arrow) {
  color: var(--text-color) !important;
  opacity: 0.7;
}

/* Proxy form select dropdown styles */
.session-select :deep(.ant-select-dropdown) {
  background-color: var(--bg-color-secondary) !important;
  border: 1px solid var(--border-color) !important;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15) !important;
}

.session-select :deep(.ant-select-item) {
  color: var(--text-color) !important;
  background-color: var(--bg-color-secondary) !important;
  font-size: 14px;
}

.session-select :deep(.ant-select-item-option-active),
.session-select :deep(.ant-select-item-option-selected) {
  color: var(--text-color) !important;
  background-color: var(--hover-bg-color) !important;
}

.session-select :deep(.ant-select-item-option:hover) {
  color: var(--text-color) !important;
  background-color: var(--hover-bg-color) !important;
}

//
.session-body-fill {
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
}
//
/* Right pane empty placeholder (+) */
.right-empty {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 70px 32px;
  border: 2px dashed var(--border-color);
  border-radius: 20px;
  background-color: var(--bg-color-secondary);
  transition: all 0.3s ease;
  cursor: pointer;
}

.right-empty.drop-active {
  border-color: #1890ff;
  background-color: rgba(24, 144, 255, 0.05);
  transform: scale(1.01);
}

.right-empty-inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}
.right-empty-plus-wrapper {
  position: relative;
  width: 80px;
  height: 80px;
  background: var(--bg-color);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.1);
  color: var(--text-color-secondary);
  transition: all 0.3s;
}

.right-empty-plus-wrapper:hover {
  color: #1890ff;
  box-shadow: 0 6px 15px rgba(24, 144, 255, 0.2);
}

.plus-icon {
  font-size: 32px;
}

.drag-hint-icon {
  position: absolute;
  right: -5px;
  top: -5px;
  background: #1890ff;
  color: white;
  padding: 6px;
  border-radius: 50%;
  font-size: 14px;
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.2);
}

.right-empty-text {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-color);
  margin-top: 8px;
}

.right-empty-sub {
  font-size: 12px;
  color: var(--text-color-tertiary);
  text-align: center;
  max-width: 300px;
  line-height: 1.6;
}

.add-conn-section {
  padding: 6px 4px 0;
}

.add-conn-row {
  display: flex;
  gap: 12px;
  align-items: center;
}

.add-conn-hint {
  margin-top: 10px;
  font-size: 12px;
  color: var(--text-color-secondary);
}

/* Drag from TabIndex: highlight drop side + forbid cursor */
.panel-drop-hover {
  outline: 2px dashed rgba(22, 119, 255, 0.6);
  outline-offset: -2px;
}

.panel-drop-forbidden {
  cursor: not-allowed;
}

.panel-spin {
  width: 100%;
  height: 100%;
}

.panel-spin-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
}

.session-btn-first {
  margin-left: auto;
  margin-right: -5px;
}

.session-action-btn {
  padding: 0 4px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.session-action-btn + .ant-tooltip-wrapper .session-action-btn,
.session-action-btn :deep(.anticon) {
  color: var(--text-color) !important;
}

.session-action-btn:hover :deep(.anticon) {
  opacity: 0.8;
}
.session-error {
  flex: 1 1 auto;
  min-width: 0;
}

.add-conn-section-asset {
  .add-conn-row--asset-search {
    margin-bottom: 12px;
  }

  .select-list {
    max-height: 360px;
    overflow: auto;
    border: 1px solid var(--border-color);
    border-radius: 8px;
    padding: 4px;
    background: var(--bg-color);
  }

  .select-list::-webkit-scrollbar {
    width: 7px;
  }
  .select-list::-webkit-scrollbar-track {
    background: transparent;
  }
  .select-list::-webkit-scrollbar-thumb {
    background: var(--border-color);
    border-radius: 10px;
  }
  .select-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 8px 10px;
    border-radius: 6px;
    cursor: pointer;
    user-select: none;
  }

  .select-item.hovered,
  .select-item.keyboard-selected {
    background: rgba(24, 144, 255, 0.08);
  }

  .select-item.disabled {
    opacity: 0.45;
    cursor: not-allowed;
    pointer-events: none;
    background-color: var(--bg-color-switch);
  }

  .select-group {
    font-weight: 600;
  }

  .group-label {
    flex: 1 1 auto;
    min-width: 0;
  }

  .group-badge {
    font-size: 12px;
    opacity: 0.7;
  }

  .group-toggle {
    opacity: 0.7;
  }

  .selected-icon {
    opacity: 0.75;
  }

  .select-loading,
  .select-empty {
    padding: 12px;
    text-align: center;
    opacity: 0.7;
  }
}

.session-select-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.session-select-option .opt-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.session-select-option .opt-close {
  padding: 0 4px;
  line-height: 1;
}

.opt-close :deep(.anticon) {
  color: var(--text-color) !important;
}

.opt-close:hover :deep(.anticon) {
  opacity: 0.8;
}
.session-cancel {
  margin-left: 4px;
}

.add-model-switch {
  color: var(--text-color);
}
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

.drag-hint-dot {
  position: absolute;
  right: 5px;
  top: 5px;
  width: 12px;
  height: 12px;
  background-color: #1890ff;
  border: 2px solid var(--bg-color);
  border-radius: 50%;
  display: inline-block;
  z-index: 1;
}
</style>
