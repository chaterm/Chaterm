<template>
  <div
    ref="fileElement"
    class="tree-container"
    :class="{ 'is-transfer': uiMode === 'transfer' && treeData && treeData.length >= 2, 'is-resizing': isResizing }"
  >
    <div
      v-if="treeData && treeData.length >= 2"
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
          value="default"
          >{{ t('files.defaultMode') }}</a-radio-button
        >
        <a-radio-button
          class="mode-radio"
          value="transfer"
          >{{ t('files.dragTransferMode') }}</a-radio-button
        >
      </a-radio-group>
    </div>

    <!-- Transfer mode (WinSCP-like) -->
    <template v-if="uiMode === 'transfer' && treeData && treeData.length >= 2">
      <div
        ref="transferLayoutRef"
        class="transfer-layout"
        :style="transferLayoutStyle"
      >
        <div
          class="transfer-side"
          :class="{ 'root-drop-active': rootDropSide === 'left' }"
          @dragover="(e) => onRootDragOver(e, 'left')"
          @dragleave="onRootDragEnd"
          @drop.prevent="(e) => onRootDrop(e, 'left')"
        >
          <div
            v-for="node in leftNodes"
            :key="node.key"
            class="session-card"
          >
            <div
              class="session-header"
              :draggable="canDragRoot('left')"
              :class="{ disabled: !canDragRoot('left') }"
              @dragstart="(e) => onRootDragStart(e, node, 'left')"
              @dragend="onRootDragEnd"
            >
              <a-tooltip :title="isCollapsed(String(node.value)) ? t('files.treeExpand') : t('files.treeFoldUp')">
                <span
                  class="session-collapse"
                  @click.stop="toggleSession(String(node.value))"
                >
                  <RightOutlined v-if="isCollapsed(String(node.value))" />
                  <DownOutlined v-else />
                </span>
              </a-tooltip>
              <span class="session-title">{{ node.title }}</span>
              <span
                v-if="node.errorMsg"
                class="session-error"
              >
                {{ t('files.sftpConnectFailed') }}：{{ node.errorMsg }}
              </span>
            </div>

            <div
              v-show="!isCollapsed(String(node.value))"
              class="session-body"
            >
              <TermFileSystem
                v-if="isOpened(String(node.value))"
                :ref="(el) => bindFsInst(String(node.value), el)"
                :uuid="String(node.value)"
                :current-directory-input="resolvePaths(String(node.value))"
                :base-path="getBasePath(String(node.value))"
                panel-side="left"
                :cached-state="FS_CACHE.get(String(node.value))?.cache"
                ui-mode="transfer"
                @state-change="stateChange"
                @open-file="openFile"
                @cross-transfer="handleCrossTransfer"
              />
            </div>
          </div>
        </div>

        <div
          class="transfer-divider transfer-resizer"
          @mousedown="onTransferResizeMouseDown"
        />

        <div
          class="transfer-side"
          :class="{ 'root-drop-active': rootDropSide === 'right' }"
          @dragover="(e) => onRootDragOver(e, 'right')"
          @dragleave="onRootDragEnd"
          @drop.prevent="(e) => onRootDrop(e, 'right')"
        >
          <div
            v-for="node in rightNodes"
            :key="node.key"
            class="session-card"
          >
            <div
              class="session-header"
              :draggable="canDragRoot('right')"
              :class="{ disabled: !canDragRoot('right') }"
              @dragstart="(e) => onRootDragStart(e, node, 'right')"
              @dragend="onRootDragEnd"
            >
              <a-tooltip :title="isCollapsed(String(node.value)) ? t('files.treeExpand') : t('files.treeFoldUp')">
                <span
                  class="session-collapse"
                  @click.stop="toggleSession(String(node.value))"
                >
                  <RightOutlined v-if="isCollapsed(String(node.value))" />
                  <DownOutlined v-else />
                </span>
              </a-tooltip>
              <span class="session-title">{{ node.title }}</span>
              <span
                v-if="node.errorMsg"
                class="session-error"
              >
                {{ t('files.sftpConnectFailed') }}：{{ node.errorMsg }}
              </span>
            </div>

            <div
              v-show="!isCollapsed(String(node.value))"
              class="session-body"
            >
              <TermFileSystem
                v-if="isOpened(String(node.value))"
                :ref="(el) => bindFsInst(String(node.value), el)"
                :uuid="String(node.value)"
                :current-directory-input="resolvePaths(String(node.value))"
                :base-path="getBasePath(String(node.value))"
                :cached-state="FS_CACHE.get(String(node.value))?.cache"
                ui-mode="transfer"
                panel-side="right"
                @state-change="stateChange"
                @open-file="openFile"
                @cross-transfer="handleCrossTransfer"
              />
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- Default mode (existing UI, unchanged) -->
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
  <TransferPanel />
</template>

<script lang="ts" setup>
import { nextTick, ref, onMounted, reactive, UnwrapRef, onBeforeUnmount, computed, watch, markRaw } from 'vue'
import type { TreeProps } from 'ant-design-vue/es/tree'
import TermFileSystem from './files.vue'
import { useI18n } from 'vue-i18n'
import EditorCode from '../Ssh/editors/dragEditor.vue'
import { editorData } from '../Ssh/editors/dragEditor.vue'
import { message, Modal } from 'ant-design-vue'
import { LanguageMap } from '../Editors/base/languageMap'
import { Base64Util } from '../../../utils/base64'
import eventBus from '../../../utils/eventBus'
import { initTransferListener } from './fileTransfer'
import TransferPanel from './fileTransferProgress.vue'
import fileIcon from '@/assets/menu/files.svg'
import { DownOutlined, RightOutlined } from '@ant-design/icons-vue'

const { t } = useI18n()

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
    console.error(t('common.errorGettingAssetInfo'), error)
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
    console.error('Failed to resize terminal:', error)
  }
}

let resizeObserver: ResizeObserver | null = null
const debouncedUpdate = debounce(handleResize, 100)

onMounted(async () => {
  initTransferListener()
  const activeTerminal = await getCurrentActiveTerminalInfo()
  if (activeTerminal) {
    currentActiveTerminal.value = activeTerminal
  }
  await listUserSessions()
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

const uiMode = ref<UiMode>('default')

const uiModeView = ref(uiMode.value)

const onModeChange = async (val: 'default' | 'transfer') => {
  uiModeView.value = val
  await nextTick()

  await new Promise<void>((r) => requestAnimationFrame(() => r()))

  uiMode.value = val
}

// --- Transfer mode: per-session collapse + lazy mount (avoid fetching for collapsed trees) ---
const transferInitCollapsedOnce = ref(false)
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
    const next = clamp(x / total, minRatio, maxRatio)
    splitRatio.value = next
  }

  splitUpListener = () => {
    cleanupSplitListeners()
  }

  window.addEventListener('mousemove', splitMoveListener)
  window.addEventListener('mouseup', splitUpListener, { once: true })
}

// In transfer mode, sessions are split into left/right panels.
// Default behavior: put the last session to the right side.
const leftOrder = ref<string[]>([])
const rightOrder = ref<string[]>([])

const ROOT_DND_MIME = 'application/x-synchro-root'
const rootDropSide = ref<PanelSide | null>(null)

const sessionUuids = () => ((treeData.value as any[]) || []).map((n: any) => String(n.value))

const initTransferSplit = () => {
  const uuids = sessionUuids()
  if (uuids.length < 2) {
    leftOrder.value = [...uuids]
    rightOrder.value = []
    return
  }
  rightOrder.value = [uuids[uuids.length - 1]]
  leftOrder.value = uuids.slice(0, -1)
}
const initTransferCollapsed = () => {
  // Only do the "collapse all but the top tree on each side" once per app lifecycle.
  if (transferInitCollapsedOnce.value) return
  transferInitCollapsedOnce.value = true

  const uuids = sessionUuids()
  uuids.forEach((u) => ensureSessionState(u))

  const leftTop = leftOrder.value[0]
  const rightTop = rightOrder.value[0]

  uuids.forEach((u) => {
    if (u === leftTop || u === rightTop) {
      openSession(u)
    } else {
      collapseSession(u)
    }
  })
}

const syncOrdersWithTreeData = () => {
  const uuids = sessionUuids()
  uuids.forEach((u) => ensureSessionState(u))
  const uuidSet = new Set(uuids)

  leftOrder.value = leftOrder.value.filter((u) => uuidSet.has(u))
  rightOrder.value = rightOrder.value.filter((u) => uuidSet.has(u))

  const existing = new Set([...leftOrder.value, ...rightOrder.value])
  const newOnes = uuids.filter((u) => !existing.has(u))
  if (newOnes.length) {
    leftOrder.value.push(...newOnes)
  }

  // Ensure right side has at least one session when available
  if (uuids.length >= 2 && rightOrder.value.length === 0 && leftOrder.value.length > 1) {
    rightOrder.value = [leftOrder.value.pop() as string]
  }
}

const sessionMap = computed(() => {
  const map = new Map<string, any>()
  ;((treeData.value as any[]) || []).forEach((n: any) => map.set(String(n.value), n))
  return map
})

const leftNodes = computed(() => leftOrder.value.map((id) => sessionMap.value.get(id)).filter(Boolean))
const rightNodes = computed(() => rightOrder.value.map((id) => sessionMap.value.get(id)).filter(Boolean))

const isTransferAvailable = computed(() => ((treeData.value as any[]) || []).length >= 2)

watch(isTransferAvailable, (ok) => {
  if (!ok) {
    uiMode.value = 'default'
  }
})

watch(
  uiMode,
  (m) => {
    if (m === 'transfer') {
      initTransferSplit()
      initTransferCollapsed()
    }
  },
  { immediate: true }
)

watch(
  treeData,
  () => {
    if (uiMode.value === 'transfer') {
      syncOrdersWithTreeData()
      initTransferCollapsed()
    }
  },
  { deep: true }
)

const canDragRoot = (side: PanelSide) => {
  const n = side === 'left' ? leftOrder.value.length : rightOrder.value.length
  return n > 1
}

const onRootDragStart = (e: DragEvent, node: any, fromSide: PanelSide) => {
  if (!canDragRoot(fromSide)) {
    e.preventDefault()
    return
  }
  if (!e.dataTransfer) return
  e.dataTransfer.effectAllowed = 'move'
  e.dataTransfer.setData(
    ROOT_DND_MIME,
    JSON.stringify({
      kind: 'root',
      uuid: String(node.value),
      fromSide
    })
  )
}

// rAF throttle to reduce reactivity churn during dragover
let rootDndRaf = 0
let pendingRootDropSide: PanelSide | null = null

const onRootDragOver = (e: DragEvent, side: PanelSide) => {
  // Only in transfer mode
  if (uiMode.value !== 'transfer') return

  const raw = e.dataTransfer?.getData(ROOT_DND_MIME)
  if (!raw) {
    pendingRootDropSide = null
  } else {
    let payload: any
    try {
      payload = JSON.parse(raw)
    } catch {
      payload = null
    }

    // Allow drop only if it's a root payload and cross-side
    const isRoot = payload?.kind === 'root'
    const sameSide = isRoot && payload.fromSide === side

    if (!isRoot || sameSide) {
      // Don't preventDefault => forbidden cursor + drop won't trigger
      pendingRootDropSide = null
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'none'
    } else {
      e.preventDefault()
      pendingRootDropSide = side
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
    }
  }

  if (rootDndRaf) return
  rootDndRaf = window.requestAnimationFrame(() => {
    rootDndRaf = 0
    if (rootDropSide.value !== pendingRootDropSide) {
      rootDropSide.value = pendingRootDropSide
    }
  })
}

const onRootDragEnd = () => {
  rootDropSide.value = null
}

const onRootDrop = (e: DragEvent, toSide: PanelSide) => {
  rootDropSide.value = null
  const raw = e.dataTransfer?.getData(ROOT_DND_MIME)
  if (!raw) return
  let payload: any
  try {
    payload = JSON.parse(raw)
  } catch {
    return
  }
  if (payload?.kind !== 'root') return

  const uuid = String(payload.uuid)
  const fromSide = payload.fromSide as PanelSide
  if (fromSide === toSide) return

  const fromList = fromSide === 'left' ? leftOrder : rightOrder
  const toList = toSide === 'left' ? leftOrder : rightOrder

  if (fromList.value.length <= 1) {
    return
  }

  fromList.value = fromList.value.filter((u) => u !== uuid)
  if (!toList.value.includes(uuid)) {
    toList.value.push(uuid)
  }
}

// --- Cross-panel file transfer (triggered by TermFileSystem DnD) ---
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
  background-color: var(--bg-color);
  scrollbar-width: auto;
  scrollbar-color: var(--border-color-light) transparent;
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
  padding: 8px;
  border: 1px solid var(--border-color-light);
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
  flex: 0 0 auto;
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
</style>
