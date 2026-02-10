<template>
  <div>
    <a-card
      :bordered="false"
      class="base-file"
      :class="{ 'transfer-mode': uiMode === 'transfer' }"
    >
      <div class="fs-header">
        <div>
          <a-space>
            <div class="fs-header-right-item">
              <a-tooltip :title="$t('files.rollback')">
                <a-button
                  type="primary"
                  size="small"
                  ghost
                  @click="rollback"
                >
                  <template #icon>
                    <RollbackOutlined />
                  </template>
                </a-button>
              </a-tooltip>
            </div>
          </a-space>
        </div>
        <div class="fs-header-left">
          <a-input
            v-model:value="localCurrentDirectoryInput"
            class="input-search"
            @press-enter="handleRefresh"
            @mousedown.stop
            @dragstart.prevent
            @click.stop
          />
        </div>
        <div class="fs-header-right">
          <a-space>
            <div
              v-if="isLocal"
              class="fs-header-right-item"
            >
              <a-tooltip :title="$t('files.openFolder')">
                <a-button
                  type="primary"
                  size="small"
                  ghost
                  @click="openLocalFolder"
                >
                  <template #icon>
                    <FolderOpenOutlined />
                  </template>
                </a-button>
              </a-tooltip>
            </div>
          </a-space>
          <a-space v-if="!isLocal">
            <div class="fs-header-right-item">
              <a-tooltip :title="$t('files.uploadFile')">
                <a-button
                  type="primary"
                  size="small"
                  ghost
                  @click="uploadFile"
                >
                  <template #icon>
                    <CloudUploadOutlined />
                  </template>
                </a-button>
              </a-tooltip>
            </div>
          </a-space>
          <a-space v-if="!isLocal">
            <div class="fs-header-right-item">
              <a-tooltip :title="$t('files.uploadDirectory')">
                <a-button
                  type="primary"
                  size="small"
                  ghost
                  @click="uploadFolder"
                >
                  <template #icon>
                    <UploadOutlined />
                  </template>
                </a-button>
              </a-tooltip>
            </div>
          </a-space>
          <a-space>
            <div class="fs-header-right-item">
              <a-tooltip :title="$t('common.refresh')">
                <a-button
                  type="primary"
                  size="small"
                  ghost
                  @click="refresh"
                >
                  <template #icon>
                    <RedoOutlined />
                  </template>
                </a-button>
              </a-tooltip>
            </div>
          </a-space>
        </div>
      </div>
      <p
        v-show="showErr"
        style="font-weight: bold; color: red"
        >{{ errTips }}</p
      >
      <div
        class="transfer-drop-zone"
        :class="{
          'drop-active': dropActive && uiMode === 'transfer',
          'drop-not-allowed': dropNotAllowed && uiMode === 'transfer'
        }"
        @dragenter.capture="onDropZoneEnter"
        @dragleave.capture="onDropZoneLeave"
        @dragover.capture="onDropZoneOver"
        @drop.capture="onDropZoneDrop"
      >
        <a-table
          ref="tableRef"
          :row-key="(record: FileRecord) => record.name"
          :columns="tableColumns"
          :data-source="files"
          size="small"
          :pagination="false"
          :loading="loading"
          class="files-table"
          :scroll="tableScroll"
          :custom-row="customRow"
        >
          <template #bodyCell="{ column, record, text }">
            <template v-if="column.dataIndex === 'name'">
              <div
                class="file-name-cell"
                style="position: relative"
              >
                <template v-if="editableData[record.key]">
                  <span style="position: absolute; top: 0; left: 0; display: flex; align-items: center; padding-right: 8px">
                    <template v-if="record.isDir">
                      <FolderFilled style="color: #1890ff; margin-right: 4px" />
                    </template>
                    <template v-else-if="record.isLink">
                      <LinkOutlined style="color: #ff8300; margin-right: 4px" />
                    </template>
                    <template v-else>
                      <FileFilled style="color: var(--text-color-quaternary); margin-right: 4px" />
                    </template>

                    <div style="flex: 1 1 auto; min-width: 0">
                      <a-input
                        v-model:value="editableData[record.key][column.dataIndex]"
                        size="small"
                        style="width: 100%"
                      />
                    </div>

                    <a-button
                      type="link"
                      size="small"
                      style="flex-shrink: 0"
                      @click.stop="renameOk(record)"
                    >
                      <template #icon><CheckOutlined /></template>
                    </a-button>
                    <a-button
                      type="link"
                      size="small"
                      style="flex-shrink: 0"
                      @click.stop="renameCancel(record)"
                    >
                      <template #icon><CloseOutlined /></template>
                    </a-button>
                  </span>
                </template>
                <template v-else>
                  <span
                    v-if="record.isDir"
                    class="file-name-main"
                    style="cursor: pointer"
                    @click="rowClick(record as FileRecord)"
                  >
                    <FolderFilled
                      class="file-name-icon"
                      style="color: #1890ff"
                    />
                    <a-tooltip
                      :title="record.name"
                      placement="top"
                    >
                      <span class="file-name-text">{{ record.name }}</span>
                    </a-tooltip>
                  </span>

                  <span
                    v-else-if="record.isLink"
                    class="file-name-main"
                    style="cursor: default"
                  >
                    <LinkOutlined
                      class="file-name-icon"
                      style="color: #ff8300"
                    />
                    <a-tooltip
                      :title="record.name"
                      placement="top"
                    >
                      <span class="file-name-text">{{ record.name }}</span>
                    </a-tooltip>
                  </span>

                  <span
                    v-else-if="uuid.includes('local-team') || isLocal"
                    class="file-name-main no-select"
                    style="cursor: pointer"
                  >
                    <FileFilled
                      class="file-name-icon"
                      style="color: var(--text-color-quaternary)"
                    />
                    <a-tooltip
                      :title="record.name"
                      placement="top"
                    >
                      <span class="file-name-text">{{ record.name }}</span>
                    </a-tooltip>
                  </span>

                  <span
                    v-else
                    class="file-name-main no-select"
                    style="cursor: pointer"
                    @dblclick="openFile(record as FileRecord)"
                  >
                    <FileFilled
                      class="file-name-icon"
                      style="color: var(--text-color-quaternary)"
                    />
                    <a-tooltip placement="top">
                      <template #title>
                        <div style="max-width: 420px; word-break: break-all">{{ record.name }}</div>
                        <div style="opacity: 0.75">{{ t('files.doubleClickToOpen') }}</div>
                      </template>
                      <span class="file-name-text">{{ record.name }}</span>
                    </a-tooltip>
                  </span>
                </template>

                <div
                  v-if="!editableData[record.key] && !record.isDir && !record.isLink"
                  class="hover-actions"
                  :data-record="record.name"
                >
                  <a-tooltip
                    v-if="!record.isDir && !record.isLink"
                    :title="t('files.download')"
                  >
                    <a-button
                      type="text"
                      size="small"
                      :title="t('files.download')"
                      @click.stop="downloadFile(record as FileRecord)"
                    >
                      <template #icon>
                        <DownloadOutlined />
                      </template>
                    </a-button>
                  </a-tooltip>
                  <a-tooltip :title="t('files.rename')">
                    <a-button
                      type="text"
                      size="small"
                      :title="t('files.rename')"
                      @click.stop="renameFile(record as FileRecord)"
                    >
                      <template #icon>
                        <EditOutlined />
                      </template>
                    </a-button>
                  </a-tooltip>
                  <a-tooltip :title="t('files.permissions')">
                    <a-button
                      type="text"
                      size="small"
                      :title="t('files.permissions')"
                      @click.stop="chmodFile(record as FileRecord)"
                    >
                      <template #icon>
                        <LockOutlined />
                      </template>
                    </a-button>
                  </a-tooltip>
                  <a-dropdown
                    placement="bottom"
                    trigger="click"
                    :visible="dropdownVisible[record.name]"
                    @visible-change="(visible) => handleDropdownVisibleChange(visible, record.name)"
                  >
                    <a-tooltip :title="t('files.more')">
                      <a-button
                        type="text"
                        size="small"
                        :title="t('files.more')"
                        @click.stop="handleMoreButtonClick(record.name)"
                        @mouseenter="handleMoreButtonEnter(record.name)"
                        @mouseleave="handleMoreButtonLeave(record.name)"
                      >
                        <template #icon>
                          <EllipsisOutlined />
                        </template>
                      </a-button>
                    </a-tooltip>
                    <template #overlay>
                      <a-menu
                        style="padding: 2px; background-color: var(--border-color)"
                        @mouseenter="handleDropdownMenuEnter(record.name)"
                        @mouseleave="handleDropdownMenuLeave(record.name)"
                        @click="handleMenuClick"
                      >
                        <a-menu-item
                          v-if="!isTeam"
                          @click="copyFile(record as FileRecord)"
                        >
                          <CopyOutlined />
                          {{ $t('files.copy') }}
                        </a-menu-item>
                        <a-menu-item
                          v-if="!isTeam"
                          @click="moveFile(record as FileRecord)"
                        >
                          <ScissorOutlined />
                          {{ $t('files.move') }}
                        </a-menu-item>
                        <a-menu-item
                          v-if="!record.isDir && !record.isLink"
                          @click="deleteFile(record as FileRecord)"
                        >
                          <DeleteOutlined />
                          {{ $t('files.delete') }}
                        </a-menu-item>
                      </a-menu>
                    </template>
                  </a-dropdown>
                </div>
              </div>
            </template>
            <template v-else>
              <a-tooltip placement="top">
                <template #title>
                  {{ column.dataIndex === 'size' ? renderSize(record.size) : text }}
                </template>

                <span class="column-ellipsis-text">
                  <template v-if="column.dataIndex === 'size'">
                    {{ !record.isDir && !record.isLink ? renderSize(record.size) : '' }}
                  </template>
                  <template v-else>
                    {{ text }}
                  </template>
                </span>
              </a-tooltip>
            </template>
          </template>
        </a-table>
      </div>
    </a-card>

    <a-modal
      v-model:visible="chmodFileDialog"
      :title="`${t('files.permissionSettings')} - ${currentRecord?.name || ''}`"
      :width="500"
      @ok="chmodOk"
      @cancel="chmodCancel"
    >
      <template #footer>
        <a-button @click="chmodCancel">{{ $t('common.cancel') }}</a-button>
        <a-button
          type="primary"
          @click="chmodOk"
          >{{ $t('common.confirm') }}
        </a-button>
      </template>

      <div class="permission-content">
        <a-row :gutter="16">
          <a-col :span="12">
            <div class="permission-group">
              <h4>{{ $t('files.owner') }}</h4>
              <a-checkbox-group
                v-model:value="permissions.owner"
                :options="ownerOptions"
              />
            </div>

            <div class="permission-group">
              <h4>{{ $t('files.userGroups') }}</h4>
              <a-checkbox-group
                v-model:value="permissions.group"
                :options="groupOptions"
              />
            </div>
          </a-col>
          <a-col :span="12">
            <div class="permission-group">
              <h4>{{ $t('files.publicGroup') }}</h4>
              <a-checkbox-group
                v-model:value="permissions.public"
                :options="publicOptions"
              />
            </div>
          </a-col>
        </a-row>
        <div class="permission-settings">
          <a-row :gutter="16">
            <a-col :span="12">
              <div class="setting-item">
                <label>{{ $t('files.permissions') }}</label>
                <a-input
                  v-model:value="permissions.code"
                  placeholder="644"
                  disabled
                />
              </div>
            </a-col>
          </a-row>
        </div>
        <div class="permission-settings">
          <a-row :gutter="16">
            <a-col :span="12">
              <div class="setting-item">
                <a-checkbox v-model:checked="permissions.recursive">{{ $t('files.applyToSubdirectories') }}</a-checkbox>
              </div>
            </a-col>
          </a-row>
        </div>
      </div>
    </a-modal>

    <copyOrMoveModal
      :id="props.uuid"
      v-model:visible="copyOrMoveDialog"
      :origin-path="currentRecord?.path || ''"
      :type="copyOrMoveModalType"
      @confirm="copyOrMoveModalOk"
      @update:visible="copyOrMoveDialog = $event"
    />
  </div>
</template>

<script setup lang="ts">
import { h, onBeforeUnmount, onMounted, reactive, ref, watch, computed, shallowRef } from 'vue'
import copyOrMoveModal from './moveModal.vue'
import {
  CheckOutlined,
  CloseOutlined,
  CloudUploadOutlined,
  CopyOutlined,
  DeleteOutlined,
  DownloadOutlined,
  EditOutlined,
  EllipsisOutlined,
  ExclamationCircleOutlined,
  FileFilled,
  FolderFilled,
  LinkOutlined,
  LockOutlined,
  RedoOutlined,
  RollbackOutlined,
  ScissorOutlined,
  UploadOutlined,
  FolderOpenOutlined
} from '@ant-design/icons-vue'
import { message, Modal } from 'ant-design-vue'
import { ColumnsType } from 'ant-design-vue/es/table'
import { useI18n } from 'vue-i18n'
import { CheckboxValueType } from 'ant-design-vue/es/checkbox/interface'
import cloneDeep from 'clone-deep'

const emit = defineEmits(['openFile', 'crossTransfer', 'stateChange'])
const api = (window as any).api
const { t } = useI18n()
const { t: $t } = useI18n()

const props = defineProps({
  currentDirectoryInput: {
    type: String,
    default: () => {
      return '/'
    }
  },
  uuid: {
    type: String,
    default: () => {
      return ''
    }
  },
  basePath: {
    type: String,
    default: () => {
      return ''
    }
  },
  connectType: {
    type: String,
    default: () => {
      return 'local'
    }
  },
  // UI mode (default or WinSCP-like transfer layout)
  uiMode: {
    type: String,
    default: () => {
      return 'default'
    }
  },
  // Which panel this file table belongs to in transfer mode
  panelSide: {
    type: String,
    default: () => {
      return ''
    }
  },
  // cache
  cachedState: {
    type: Object,
    default: () => null
  }
})

export interface ApiFileRecord {
  name: string
  path: string
  isDir: boolean
  mode: string
  isLink: boolean
  modTime: string
  size: number
}

export interface FileRecord {
  name: string
  path: string
  isDir: boolean
  mode: string
  isLink: boolean
  modTime: string
  size: number
  key?: string
  filePath?: string
  disabled?: boolean
}

type PanelSide = 'left' | 'right' | ''

const uiMode = computed(() => props.uiMode as 'default' | 'transfer')
const panelSide = computed(() => props.panelSide as PanelSide)

const localCurrentDirectoryInput = ref(props.currentDirectoryInput)
const basePath = ref(props.basePath)
const files = ref<FileRecord[]>([])
const loading = ref(false)
const showErr = ref(false)
const errTips = ref('')
const tableRef = ref<HTMLElement | null>(null)

type FlexibleColumn = Partial<ColumnsType<FileRecord>[number]>

const baseColumns: FlexibleColumn[] = [
  {
    title: t('files.name'),
    dataIndex: 'name',
    key: 'name',
    sorter: (a: FileRecord, b: FileRecord) => {
      if (a.key === '..') {
        return 0
      }
      if (b.key === '..') {
        return 0
      }
      return a.name.localeCompare(b.name)
    },
    sortDirections: ['descend', 'ascend'],
    ellipsis: true,
    width: '500px'
  },
  {
    title: t('files.permissions'),
    dataIndex: 'mode',
    key: 'mode',
    customRender: ({ record }: { record: FileRecord }) => {
      return h('span', { class: 'dode' }, record.mode)
    },
    ellipsis: true
  },
  {
    title: t('files.size'),
    dataIndex: 'size',
    key: 'size',
    customRender: ({ record }: { record: FileRecord }) => {
      if (!record.isDir && !record.isLink) {
        return h('span', { class: 'dode' }, renderSize(record.size))
      }
      return h('span', { class: 'dode' })
    },
    sorter: (a: FileRecord, b: FileRecord) => {
      if (a.key === '..') {
        return 0
      }
      if (b.key === '..') {
        return 0
      }
      return a.size - b.size
    },
    ellipsis: true
  },
  {
    title: t('files.modifyDate'),
    dataIndex: 'modTime',
    key: 'modTime',
    sorter: (a: FileRecord, b: FileRecord) => {
      if (a.key === '..') {
        return 0
      }
      if (b.key === '..') {
        return 0
      }
      return a.modTime.localeCompare(b.modTime)
    },
    sortDirections: ['descend', 'ascend'],
    customRender: ({ record }: { record: FileRecord }) => {
      return h('span', { class: 'dode' }, record.modTime)
    },
    ellipsis: true
  }
]

const tableColumns = computed(() => {
  if (uiMode.value !== 'transfer') return baseColumns

  return baseColumns
    .filter((c: any) => c.dataIndex !== 'mode')
    .map((c: any) => {
      if (c.dataIndex === 'name') {
        return { ...c, width: 120, minWidth: 80, ellipsis: true }
      }
      if (c.dataIndex === 'size') {
        return { ...c, width: 40, minWidth: 40, ellipsis: true }
      }
      if (c.dataIndex === 'modTime') {
        return { ...c, width: 70, minWidth: 60, ellipsis: true }
      }
      return { ...c, width: 70, minWidth: 70, ellipsis: true }
    })
})
// const tableScroll = computed(() => (uiMode.value === 'transfer' ? {} : { x: 'max-content' }))
const tableScroll = computed(() => (uiMode.value === 'transfer' ? { x: 350 } : { x: 'max-content' }))
const renderSize = (value: number): string => {
  if (value == null || value === 0) {
    return '0 B'
  }
  const unitArr = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB']
  const srcSize = parseFloat(value.toString())
  const index = Math.floor(Math.log(srcSize) / Math.log(1024))
  let size = srcSize / Math.pow(1024, index)
  size = parseFloat(size.toFixed(2))
  return size + ' ' + unitArr[index]
}

const sortByName = (a: FileRecord, b: FileRecord): number => {
  const a1 = a.name.toUpperCase()
  const a2 = b.name.toUpperCase()
  if (a1 < a2) {
    return -1
  }
  if (a1 > a2) {
    return 1
  }
  return 0
}

let isFirstLoad = ref(true)

function removeBasePathInContent(content: string) {
  const escapedBase = basePath.value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  let result = content.replace(new RegExp(escapedBase, 'g'), '')
  result = result.replace(/\/{2,}/g, '/')
  return result
}

function hasDuplicateSlashes(path: string): boolean {
  return /\/{2,}/.test(path)
}

function fixPath(path: string): string {
  if (path == null || path === '') return path

  if (!hasDuplicateSlashes(path)) {
    return path
  }
  return path.replace(/\/+/g, '/')
}

import { nextTick } from 'vue'

const raf = () => new Promise<void>((r) => requestAnimationFrame(() => r()))

const loadFiles = async (uuid: string, filePath: string): Promise<void> => {
  filePath = fixPath(filePath)
  loading.value = true
  showErr.value = false
  errTips.value = ''

  await nextTick()
  await raf()

  const fetchList = async (path: string) => {
    return await api.sshSftpList({ path, id: uuid })
  }

  let data = await fetchList(filePath || '/')

  if (data.length > 0 && typeof data[0] === 'string') {
    errTips.value = removeBasePathInContent(data[0])
    showErr.value = true
  }

  if (isFirstLoad.value) isFirstLoad.value = false

  const items = data.map((item: ApiFileRecord) => ({ ...item, key: item.path }) as FileRecord)

  const dirs = items.filter((item) => item.isDir === true)
  dirs.sort(sortByName)

  const fileItems = items.filter((item) => item.isDir === false)
  fileItems.sort(sortByName)
  dirs.push(...fileItems)

  if (filePath !== '/' && !isWindowsDriveRoot(filePath)) {
    dirs.splice(0, 0, {
      filePath: '..',
      name: '..',
      path: '..',
      isDir: true,
      disabled: true,
      mode: '',
      isLink: false,
      modTime: '',
      size: 0,
      key: '..'
    })
  }

  files.value = dirs
  localCurrentDirectoryInput.value = getLoadFilePath(filePath)

  loading.value = false

  emit('stateChange', {
    uuid: props.uuid,
    path: filePath
  })
}

const isLocalId = (value: string) => String(value || '').includes('localhost@127.0.0.1:local')
const isLocal = computed(() => isLocalId(props.uuid))
const normalizeSlashes = (p: string) => String(p || '').replace(/\\/g, '/')
const isWindowsDriveRoot = (p: string) => /^[A-Za-z]:\/?$/.test(normalizeSlashes(p))

const openLocalFolder = async () => {
  const localPath = await api.openDirectoryDialog()
  if (!localPath) return

  await loadFiles(props.uuid, localPath)
}

function getLoadFilePath(filePath: string): string {
  const trimEndSlash = (p: string) => p.replace(/\/+$/, '')

  const full = trimEndSlash(filePath)
  const base = trimEndSlash(basePath.value)

  if (!full.startsWith(base)) return full

  const rest = full.slice(base.length)
  return rest || '/'
}

const rowClick = (record: FileRecord): void => {
  if (record.isDir || record.isLink) {
    if (record.path === '..') {
      // Get parent directory of current directory
      const currentDirectory = basePath.value + localCurrentDirectoryInput.value
      if (isWindowsDriveRoot(currentDirectory)) return
      const cur = normalizeSlashes(currentDirectory)
      const idx = cur.lastIndexOf('/')
      let parentDirectory = idx <= 0 ? '/' : cur.slice(0, idx)

      if (parentDirectory === '') {
        localCurrentDirectoryInput.value = '/'
        parentDirectory = '/'
      }

      loadFiles(props.uuid, parentDirectory)
    } else {
      loadFiles(props.uuid, record.path)
    }
  }
}

const openFile = (record: FileRecord): void => {
  emit('openFile', {
    filePath: record.path,
    terminalId: props.uuid,
    connectType: props.connectType
  })
}

const refresh = (): void => {
  loadFiles(props.uuid, basePath.value + localCurrentDirectoryInput.value)
}

// instead of path.dirname()
const getDirname = (filepath: string) => {
  const p = normalizeSlashes(filepath)

  if (isWindowsDriveRoot(p)) return p

  const lastSlashIndex = p.lastIndexOf('/')
  if (lastSlashIndex === -1) return p
  if (lastSlashIndex === 0) return '/'

  return p.substring(0, lastSlashIndex)
}

const joinPath = (...parts: string[]) => {
  return parts
    .map((p) => p.trim())
    .filter(Boolean)
    .join('/')
    .replace(/\/+/g, '/')
}

// Transfer mode drag & drop (cross-panel)
const DND_MIME = 'application/x-synchro-fs-item'

// Fallback channel for cross-component drag context (dragover may not expose custom MIME on some browsers)
const GLOBAL_DND_FROM_SIDE_KEY = '__synchro_fs_dnd_from_side__'
const setGlobalDragFromSide = (side: string | null) => {
  ;(globalThis as any)[GLOBAL_DND_FROM_SIDE_KEY] = side
}
const getGlobalDragFromSide = (): string | null => {
  return ((globalThis as any)[GLOBAL_DND_FROM_SIDE_KEY] as string | null) || null
}

// Visual feedback for drop zone
const dropActive = ref(false)
const dropNotAllowed = ref(false)

// Folder-row hover feedback while dragging (target side only)
const dragHoverRow = ref<string | null>(null)
const dragHoverTargetDir = ref<string | null>(null)

// Some WebKit/Electron builds won't expose custom MIME on dragover; keep a text/plain fallback.
const DND_TEXT_PREFIX = 'synchro-fs-item:'

// Cache parsing to avoid JSON.parse on every dragover tick
let lastDndKey = ''
let lastDndPayload: any = null

const readDndPayload = (e: DragEvent) => {
  const dt = e.dataTransfer
  if (!dt) return null

  // Prefer custom MIME
  let raw = dt.getData(DND_MIME) || ''

  // Fallback to text/plain (more widely readable during dragover)
  if (!raw) {
    const txt = dt.getData('text/plain') || ''
    if (txt.startsWith(DND_TEXT_PREFIX)) {
      raw = txt.slice(DND_TEXT_PREFIX.length)
    } else {
      const t = txt.trim()
      if (t.startsWith('{') && t.includes('"kind"')) raw = t
    }
  }

  if (!raw) return null
  if (raw === lastDndKey) return lastDndPayload
  lastDndKey = raw
  try {
    lastDndPayload = JSON.parse(raw)
    return lastDndPayload
  } catch {
    lastDndPayload = null
    return null
  }
}

const clearDragHover = () => {
  if (dragHoverRow.value !== null) dragHoverRow.value = null
  if (dragHoverTargetDir.value !== null) dragHoverTargetDir.value = null
}

// Build a lookup map for fast rowKey -> record resolution
// const recordByName = computed(() => {
//   const m = new Map<string, FileRecord>()
//   for (const r of files.value) m.set(r.name, r)
//   return m
// })
const recordByName = shallowRef(new Map<string, FileRecord>())
watch(
  files,
  (list) => {
    const m = new Map<string, FileRecord>()
    for (const r of list) m.set(r.name, r)
    recordByName.value = m
  },
  { immediate: true }
)

// rAF throttle to avoid flooding reactivity during dragover
let dndRaf = 0
let lastDragOverEvent: DragEvent | null = null

// Drop-zone lifecycle (avoid TTL clearing: dragover can be sparse when crossing panels)
let dragDepth = 0
let leaveTimer: number | null = null

const cancelLeaveTimer = () => {
  if (leaveTimer) window.clearTimeout(leaveTimer)
  leaveTimer = null
}

const clearDropState = () => {
  dropActive.value = false
  dropNotAllowed.value = false
  clearDragHover()
  clearHoverRowDom()
}

const scheduleLeaveClear = () => {
  cancelLeaveTimer()
  // buffer a bit to avoid enter/leave chatter when moving across children
  leaveTimer = window.setTimeout(() => {
    clearDropState()
  }, 300)
}

const onRowDragStart = (e: DragEvent, record: FileRecord) => {
  if (uiMode.value !== 'transfer' || !panelSide.value) return
  if (!e.dataTransfer) return
  // Filter non-dragable items
  if (record.key === '..' || record.disabled || record.isLink) return

  e.dataTransfer.effectAllowed = 'copy'
  const data = {
    kind: 'fs-item',
    fromUuid: props.uuid,
    fromSide: panelSide.value,
    srcPath: record.path,
    name: record.name,
    isDir: !!record.isDir
  }

  e.dataTransfer.setData(DND_MIME, JSON.stringify(data))
  // Fallback for dragover (some builds can't read custom MIME during dragover)
  e.dataTransfer.setData('text/plain', `${DND_TEXT_PREFIX}${JSON.stringify(data)}`)
  setGlobalDragFromSide(panelSide.value)

  // reset per-drag state
  dropNotAllowed.value = false
  clearDragHover()
  lastDndKey = ''
  lastDndPayload = null
}

const onRowDragEnd = () => {
  setGlobalDragFromSide(null)
  dragDepth = 0
  cancelLeaveTimer()
  clearDropState()

  // reset per-drag caches
  lastDndKey = ''
  lastDndPayload = null
  lastRowElCache = null
  lastHitTestAt = 0
}
const onDropZoneEnter = (e: DragEvent) => {
  if (uiMode.value !== 'transfer' || !panelSide.value) return
  dragDepth++
  cancelLeaveTimer()
  onDropZoneOver(e)
}

const onDropZoneLeave = (_e: DragEvent) => {
  if (uiMode.value !== 'transfer' || !panelSide.value) return
  // `dragenter`/`dragleave` events are frequently triggered between child nodes. Use depth counting to avoid jitter
  dragDepth = Math.max(0, dragDepth - 1)
  if (dragDepth === 0) scheduleLeaveClear()
}

let lastHitTestAt = 0
let lastRowElCache: HTMLElement | null = null

const findRowElFast = (ev: DragEvent) => {
  const t = ev.target as HTMLElement | null
  if (t?.closest) {
    const tr = t.closest('tr.ant-table-row, .ant-table-row') as HTMLElement | null
    if (tr) return tr
  }

  const path = (ev.composedPath?.() || []) as any[]
  for (let i = 0; i < Math.min(path.length, 12); i++) {
    const p = path[i]
    if (p && p.closest) {
      const tr = (p as HTMLElement).closest('tr.ant-table-row, .ant-table-row') as HTMLElement | null
      if (tr) return tr
    }
  }

  return null
}

let lastHoverTr: HTMLElement | null = null
let lastHoverDir: string | null = null

const setHoverRowDom = (rowKey: string) => {
  const tableEl = (tableRef.value as any)?.$el as HTMLElement | undefined
  if (!tableEl) return

  // The Ant Table row has a data-row-key
  const tr = rowKey ? (tableEl.querySelector(`tbody tr[data-row-key="${CSS.escape(rowKey)}"]`) as HTMLElement | null) : null

  if (tr === lastHoverTr) return

  if (lastHoverTr) lastHoverTr.classList.remove('file-table-row-drag-hover')
  if (tr) tr.classList.add('file-table-row-drag-hover')

  lastHoverTr = tr
}

const clearHoverRowDom = () => {
  if (lastHoverTr) lastHoverTr.classList.remove('file-table-row-drag-hover')
  lastHoverTr = null
  lastHoverDir = null
}
const onAnyDndFinish = () => {
  // only handle our internal transfer drags
  if (uiMode.value !== 'transfer') return
  if (!getGlobalDragFromSide()) return

  setGlobalDragFromSide(null)
  dragDepth = 0
  cancelLeaveTimer()
  clearDropState()
  if (dndRaf) {
    window.cancelAnimationFrame(dndRaf)
    dndRaf = 0
  }

  lastDndKey = ''
  lastDndPayload = null
  lastRowElCache = null
  lastHitTestAt = 0
}

const onDropZoneOver = (e: DragEvent) => {
  if (uiMode.value !== 'transfer' || !panelSide.value) return

  if (dragDepth === 0) dragDepth = 1
  cancelLeaveTimer()

  // Update the lastDragOverEvent every time
  lastDragOverEvent = e

  const dt = e.dataTransfer

  const fromSide = getGlobalDragFromSide() || ''
  const isFsItem = !!fromSide

  // Non-file transfer drag and drop: not participating in drop
  if (!isFsItem || !fromSide) {
    clearDropState()
    return
  }

  const sameSide = fromSide === panelSide.value
  const crossSide = fromSide !== panelSide.value

  if (sameSide) {
    // Same side: Display prohibition symbol
    dropNotAllowed.value = true
    dropActive.value = false
    clearDragHover()
    clearHoverRowDom()

    e.preventDefault()
    e.stopPropagation()
    if (dt) dt.dropEffect = 'none'
    return
  }

  if (!crossSide) {
    clearDropState()
    return
  }

  dropNotAllowed.value = false
  dropActive.value = true
  e.preventDefault()
  e.stopPropagation()
  if (dt) dt.dropEffect = 'copy'

  if (dndRaf) return

  dndRaf = window.requestAnimationFrame(() => {
    dndRaf = 0
    const ev = lastDragOverEvent
    if (!ev) return

    // Highlight the directory line when you move to it
    const findRowEl = (ev: DragEvent) => {
      const fast = findRowElFast(ev)
      if (fast) {
        lastRowElCache = fast
        return fast
      }

      const now = performance.now()
      if (now - lastHitTestAt < 100) {
        return lastRowElCache
      }
      lastHitTestAt = now

      const el = document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null
      const tr = el?.closest?.('tr.ant-table-row, .ant-table-row') as HTMLElement | null
      if (tr) lastRowElCache = tr
      return tr
    }

    const rowEl = findRowEl(ev)
    const rowKey = rowEl?.getAttribute?.('data-row-key') || (rowEl as any)?.dataset?.rowKey || ''

    if (rowKey) {
      const rec = recordByName.value.get(rowKey)
      if (rec && rec.isDir && rec.key !== '..' && !rec.disabled) {
        setHoverRowDom(rowKey)
        lastHoverDir = rec.path
      } else {
        clearHoverRowDom()
      }
    } else {
      clearHoverRowDom()
    }

    dropActive.value = true
    cancelLeaveTimer()
  })
}

const getHoveredDirByPoint = (ev: DragEvent) => {
  const el = document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null
  const tr = el?.closest?.('tr.ant-table-row, .ant-table-row') as HTMLElement | null
  const rowKey = tr?.getAttribute?.('data-row-key') || (tr as any)?.dataset?.rowKey || ''
  if (!rowKey) return null

  const rec = recordByName.value.get(rowKey)
  if (rec && rec.isDir && rec.key !== '..' && !rec.disabled) {
    return rec.path
  }
  return null
}

const onDropZoneDrop = (e: DragEvent) => {
  // Always prevent default on drop to avoid browser side-effects
  e.preventDefault()
  const dropHitDir = getHoveredDirByPoint(e)
  const hoveredDir = dropHitDir || lastHoverDir

  // Drag end: Unified cleanup
  setGlobalDragFromSide(null)
  dragDepth = 0
  cancelLeaveTimer()
  clearDropState()
  if (dndRaf) {
    window.cancelAnimationFrame(dndRaf)
    dndRaf = 0
  }

  // reset per-drag caches
  lastDndKey = ''
  lastDndPayload = null
  lastRowElCache = null
  lastHitTestAt = 0

  if (uiMode.value !== 'transfer' || !panelSide.value) return

  const payload = readDndPayload(e)
  if (!payload || payload?.kind !== 'fs-item') return

  if (payload.fromSide === panelSide.value) return

  emit('crossTransfer', {
    ...payload,
    toUuid: props.uuid,
    toSide: panelSide.value,
    // Drop to the directory where the hover is located first; otherwise, drop to the current directory
    targetDir: hoveredDir || joinPath(basePath.value, localCurrentDirectoryInput.value)
  })
}

const rollback = (): void => {
  loadFiles(props.uuid, getDirname(basePath.value + localCurrentDirectoryInput.value))
}

const handleRefresh = (): void => {
  refresh()
}

onMounted(async () => {
  document.addEventListener('dragend', onAnyDndFinish, true)
  document.addEventListener('drop', onAnyDndFinish, true)

  isTeamCheck(props.uuid)

  const c: any = props.cachedState
  if (c && typeof c.path === 'string') {
    try {
      localCurrentDirectoryInput.value = getLoadFilePath(c.path)

      await loadFiles(props.uuid, basePath.value + localCurrentDirectoryInput.value)

      loading.value = false
      return
    } catch {}
  }

  await loadFiles(props.uuid, basePath.value + localCurrentDirectoryInput.value)
})

onBeforeUnmount(() => {
  document.removeEventListener('dragend', onAnyDndFinish, true)
  document.removeEventListener('drop', onAnyDndFinish, true)
  cancelLeaveTimer()
  if (dndRaf) {
    window.cancelAnimationFrame(dndRaf)
    dndRaf = 0
  }
})

const uploadFile = async () => {
  const localPath = await api.openFileDialog()
  if (!localPath) return

  try {
    const res = await api.uploadFile({
      id: key,
      remotePath: basePath.value + localCurrentDirectoryInput.value,
      localPath: localPath
    })
    refresh()
    const config = {
      success: { type: 'success', text: t('files.uploadSuccess') },
      cancelled: { type: 'info', text: t('files.uploadCancel') },
      skipped: { type: 'info', text: t('files.uploadSkipped') }
    }[res.status] || { type: 'error', text: `${t('files.uploadFailed')}：${res.message}` }

    message[config.type]({
      content: config.text,
      key,
      duration: 3
    })
  } catch (err: any) {
    message.error({ content: `${t('files.uploadError')}：${(err as Error).message}`, key, duration: 3 })
  }
}

const uploadFolder = async () => {
  const localPath = await api.openDirectoryDialog()
  if (!localPath) return

  try {
    const res = await api.uploadDirectory({
      id: props.uuid,
      localPath: localPath,
      remotePath: (basePath.value + localCurrentDirectoryInput.value).replace(/\/+/g, '/')
    })

    const statusMap = {
      success: t('files.uploadSuccess'),
      cancelled: t('files.uploadCancel')
    }

    const content = statusMap[res.status] || `${t('files.uploadFailed')}：${res.message}`

    message.success({
      content,
      key,
      duration: 3
    })
  } catch (err: any) {
    message.error('Directory Upload Error:', err)
  }
}

// dropdown management
const currentHoverRow = ref<string | null>(null)
const dropdownVisible = reactive({})
const hoverLock = ref(false)
// Clear the map of the timer
const hoverTimers = new Map<string, number | NodeJS.Timeout>()

// The status of the mouse in the dropdown menu area
const mouseInDropdown = reactive({})

const customRow = (record: FileRecord) => {
  const row: any = {
    class: getRowClass(record.name),
    onMouseenter: () => handleRowMouseEnter(record.name),
    onMouseleave: () => handleRowMouseLeave(record.name)
  }

  if (uiMode.value === 'transfer' && panelSide.value) {
    // Disallow dragging ".." and links; allow files and folders.
    if (record.key !== '..' && !record.disabled && !record.isLink) {
      row.draggable = true
      row.onDragstart = (e: DragEvent) => onRowDragStart(e, record)
      row.onDragend = () => onRowDragEnd()
    }
  }

  return row
}

const getRowClass = (recordName) => {
  const classes = ['file-table-row']
  // Hover (mouse) actions
  if (currentHoverRow.value === recordName || dropdownVisible[recordName] || mouseInDropdown[recordName]) {
    classes.push('file-table-row-hover')
  }

  // Hover (drag) folder target
  if (dragHoverRow.value === recordName) {
    // Reuse the same background style as normal hover (like .ssh in your screenshot)
    classes.push('file-table-row-drag-hover')
    classes.push('file-table-row-hover')
  }

  return classes.join(' ')
}

// Clear the timer for the specified row
const clearHoverTimer = (recordName: string) => {
  const key = recordName
  const timer = hoverTimers.get(key)
  if (timer) {
    clearTimeout(timer)
    hoverTimers.delete(key)
  }
}

// Force the hover row to be set
const forceSetHoverRow = (recordName: string) => {
  clearHoverTimer(recordName)
  currentHoverRow.value = recordName
}

// Set hover row
const setHoverRow = (recordName: string) => {
  const lastHoverRow = currentHoverRow.value
  currentHoverRow.value = recordName
  // If in hover lock state, return
  if (hoverLock.value) return

  clearHoverTimer(recordName)

  if (lastHoverRow !== recordName) {
    Object.keys(dropdownVisible).forEach((key) => {
      if (key !== recordName && dropdownVisible[key]) {
        dropdownVisible[key] = false
        delete mouseInDropdown[recordName]
      }
    })
  }
}

// Clear hover row
const clearHoverRow = (recordName: string) => {
  // If the dropdown menu is open or the mouse is in the dropdown menu, do not clear it
  if (dropdownVisible[recordName] || mouseInDropdown[recordName]) {
    return
  }

  // Clean up the timer
  clearHoverTimer(recordName)

  const timer = setTimeout(() => {
    if (!dropdownVisible[recordName] && !mouseInDropdown[recordName] && currentHoverRow.value === recordName) {
      currentHoverRow.value = null
    }
    hoverTimers.delete(recordName)
  }, 100)

  hoverTimers.set(recordName, timer)
}

// Processing row mouse entry
const handleRowMouseEnter = (recordName: string) => {
  setHoverRow(recordName)
}

// Processing row mouse leave
const handleRowMouseLeave = (recordName: string) => {
  if (dropdownVisible[recordName]) {
    // Delayed processing waiting to enter the dropdown-menu
    const timer = setTimeout(() => {
      if (mouseInDropdown[recordName] === undefined) {
        handleDropdownVisibleChange(false, recordName)
      }
      if (!mouseInDropdown[recordName] || !dropdownVisible[recordName]) {
        if (currentHoverRow.value === recordName) {
          currentHoverRow.value = null
        }
      }
    }, 100)
    hoverTimers.set(recordName, timer)
  }

  // If the mouse jumps directly over the drop-down menu
  if (mouseInDropdown[recordName]) {
    return
  }

  // Only the current hover row needs to handle the leave event
  if (currentHoverRow.value === recordName) {
    clearHoverRow(recordName)
  }
}

const handleMoreButtonClick = (recordName: string) => {
  // Force lock state when clicking, regardless of the current state
  forceSetHoverRow(recordName)
}

// Handle "More" button mouse entry
const handleMoreButtonEnter = (recordName: string) => {
  forceSetHoverRow(recordName)
}

// Handle "More" button mouse leave

const handleMoreButtonLeave = (_recordName: string) => {
  // Don't clean up immediately when button leaves, let other events handle it
}

const handleDropdownVisibleChange = (visible: boolean, recordName: string) => {
  dropdownVisible[recordName] = visible

  if (visible) {
    hoverLock.value = true
    forceSetHoverRow(recordName)

    Object.keys(dropdownVisible).forEach((key) => {
      if (key !== recordName && dropdownVisible[key]) {
        dropdownVisible[key] = false
        mouseInDropdown[key] = false
      }
    })
  } else {
    hoverLock.value = false
    delete mouseInDropdown[recordName]
  }
}

// Handle drop-down menu mouse entry
const handleDropdownMenuEnter = (recordName: string) => {
  clearHoverTimer(recordName)
  mouseInDropdown[recordName] = true
  forceSetHoverRow(recordName)
}

// Handle drop-down menu mouse leave
const handleDropdownMenuLeave = (recordName: string) => {
  mouseInDropdown[recordName] = false
  if (!dropdownVisible[recordName]) {
    clearHoverRow(recordName)
  }
  handleDropdownVisibleChange(false, recordName)
}

// Handle menu item click
const handleMenuClick = () => {
  currentHoverRow.value = null
  Object.keys(dropdownVisible).forEach((key) => {
    dropdownVisible[key] = false
    mouseInDropdown[key] = false
  })
}

// Operation methods
const currentRecord = ref<FileRecord | null>(null)
const chmodFileDialog = ref<boolean>(false)
const permissions = reactive({
  owner: ['read' as CheckboxValueType, 'write' as CheckboxValueType],
  group: ['read' as CheckboxValueType, 'write' as CheckboxValueType],
  public: ['read' as CheckboxValueType],
  code: '644',
  owner_name: 'root',
  recursive: false
})
const ownerOptions = [
  { label: t('files.read'), value: 'read' },
  { label: t('files.write'), value: 'write' },
  { label: t('files.exec'), value: 'execute' }
]
const groupOptions = [
  { label: $t('files.read'), value: 'read' },
  { label: $t('files.write'), value: 'write' },
  { label: $t('files.exec'), value: 'execute' }
]
const publicOptions = [
  { label: $t('files.read'), value: 'read' },
  { label: $t('files.write'), value: 'write' },
  { label: $t('files.exec'), value: 'execute' }
]

// Change file permissions
const chmodFile = (record: FileRecord) => {
  if (record) {
    currentRecord.value = record
    parsePermissions(record.mode)
  }
  chmodFileDialog.value = true
}
const chmodOk = async () => {
  if (!currentRecord.value) {
    return
  }
  try {
    const filePath = getDirname(currentRecord.value.path)
    const res = await api.chmodFile({
      id: props.uuid,
      remotePath: joinPath(filePath, currentRecord.value.name),
      mode: permissions.code,
      recursive: permissions.recursive
    })
    chmodFileDialog.value = false
    currentRecord.value = null

    if (res.status === 'success') {
      refresh()
    } else {
      message.error(`${t('files.modifyFilePermissionsFailed')}：${res.message}`)
    }
  } catch (error) {
    message.error(`${t('files.modifyFilePermissionsError')}：${error}`)
  }
}

const chmodCancel = () => {
  chmodFileDialog.value = false
  currentRecord.value = null
}

const calculatePermissionCode = () => {
  let ownerCode = 0
  let groupCode = 0
  let publicCode = 0

  if (permissions.owner.includes('read')) ownerCode += 4
  if (permissions.owner.includes('write')) ownerCode += 2
  if (permissions.owner.includes('execute')) ownerCode += 1

  if (permissions.group.includes('read')) groupCode += 4
  if (permissions.group.includes('write')) groupCode += 2
  if (permissions.group.includes('execute')) groupCode += 1

  if (permissions.public.includes('read')) publicCode += 4
  if (permissions.public.includes('write')) publicCode += 2
  if (permissions.public.includes('execute')) publicCode += 1

  return `${ownerCode}${groupCode}${publicCode}`
}
const parsePermissions = (mode: string) => {
  const [ownerCode, groupCode, publicCode] = mode.split('').slice(1).map(Number)

  permissions.owner = []
  if (ownerCode & 4) permissions.owner.push('read' as CheckboxValueType)
  if (ownerCode & 2) permissions.owner.push('write' as CheckboxValueType)
  if (ownerCode & 1) permissions.owner.push('execute' as CheckboxValueType)

  permissions.group = []
  if (groupCode & 4) permissions.group.push('read' as CheckboxValueType)
  if (groupCode & 2) permissions.group.push('write' as CheckboxValueType)
  if (groupCode & 1) permissions.group.push('execute' as CheckboxValueType)

  permissions.public = []
  if (publicCode & 4) permissions.public.push('read' as CheckboxValueType)
  if (publicCode & 2) permissions.public.push('write' as CheckboxValueType)
  if (publicCode & 1) permissions.public.push('execute' as CheckboxValueType)

  permissions.code = mode
}

watch(
  () => [permissions.group, permissions.group, permissions.public],
  () => {
    permissions.code = calculatePermissionCode()
  },
  { deep: true }
)

const downloadFile = async (record: any) => {
  const remotePath = record.path
  const fileName = record.name

  const localPath = await api.openSaveDialog({ fileName })
  if (!localPath) return

  // TODO Delete
  // const taskKey =`${props.uuid}:up:${remotePath}:${localPath}`
  // transferTasks.value[taskKey] = {
  //   id: props.uuid,
  //   taskKey: taskKey,
  //   name: fileName,
  //   remotePath: remotePath,
  //   progress: 0,
  //   speed: '0 KB/s',
  //   type: 'download',
  //   lastBytes: 0,
  //   lastTime: Date.now()
  // }

  try {
    const res = await api.downloadFile({
      id: props.uuid,
      remotePath: remotePath,
      localPath: localPath
    })

    const config = {
      success: { type: 'success', text: t('files.downloadSuccess') },
      cancelled: { type: 'info', text: t('files.downloadCancel') },
      skipped: { type: 'info', text: t('files.downloadSkipped') }
    }[res.status] || { type: 'error', text: `${t('files.downloadFailed')}：${res.message}` }
    message[config.type]({
      content: config.text,
      key,
      duration: 3
    })
  } catch (err: any) {
    console.error('Download Error:', err)
    message.error({ content: `${t('files.downloadError')}：${(err as Error).message}`, key, duration: 3 })
  }
}

// TODO Delete
// const downloadFile = async (record: FileRecord) => {
//   const key = props.uuid
//   const remotePath = record.path
//   const savePath = await api.openSaveDialog({ fileName: record.name })
//   if (!savePath) return
//
//   try {
//     message.loading({ content: t('files.downloading'), key, duration: 0 })
//     const res = await api.downloadFile({ id: key, remotePath: remotePath, localPath: savePath })
//     message.success({
//       content: res.status === 'success' ? t('files.downloadSuccess') : `${t('files.downloadFailed')}：${res.message}`,
//       key,
//       duration: 3
//     })
//   } catch (err) {
//     message.error({ content: `${t('files.downloadError')}：${(err as Error).message}`, key, duration: 3 })
//   }
// }

const editableData = reactive({})
const renameFile = (record: FileRecord): void => {
  if (!record?.key) {
    console.warn('Invalid record: missing key')
    return
  }

  const key = record.key

  if (editableData[key]) {
    delete editableData[key]
  } else {
    const targetFile = files.value.find((item) => item.key === key)
    if (targetFile) {
      editableData[key] = cloneDeep(targetFile)
    } else {
      console.warn(`File with key ${key} not found`)
    }
  }
}
const key = props.uuid
const renameOk = async (record) => {
  const filePath = getDirname(record.path)
  const oldName = record.name
  const newName = editableData[record.key].name
  delete editableData[record.key]
  try {
    const res = await api.renameFile({
      id: props.uuid,
      oldPath: joinPath(filePath, oldName),
      newPath: joinPath(filePath, newName)
    })
    refresh()
    if (res.status === 'success') {
      message.success({
        content: t('files.modifySuccess'),
        key,
        duration: 3
      })
    } else {
      message.error({ content: `${t('files.modifyFailed')}：${res.message}`, key, duration: 3 })
    }
  } catch (err) {
    message.error({ content: `${t('files.modifyError')}：${(err as Error).message}`, key, duration: 3 })
  }
}

const renameCancel = (record) => {
  delete editableData[record.key]
}

const deleteFileDialog = ref(false)
const deleteFile = (record: FileRecord) => {
  Modal.confirm({
    title: t('files.deleteFileTips'),
    icon: h(ExclamationCircleOutlined),
    content: h('div', { style: 'color:red;font-weight: bold;' }, removeBasePathInContent(record.path)),
    okText: t('common.ok'),
    okType: 'danger',
    cancelText: t('common.cancel'),
    onOk() {
      confirmDeleteFile(record)
    },
    onCancel() {
      deleteFileDialog.value = false
    }
  })
}

const isTeam = ref(false)
const isTeamCheck = (uuid: string): boolean => {
  const parts = uuid.split('@')
  if (parts.length < 2) return false

  const rest = parts[1]
  const orgType = rest.split(':')[1]
  isTeam.value = orgType === 'local-team'
  return isTeam.value
}

const confirmDeleteFile = async (record: FileRecord) => {
  deleteFileDialog.value = false
  const key = props.uuid
  try {
    message.loading({ content: t('files.deleting'), key, duration: 0 })
    const res = await api.deleteFile({
      id: key,
      remotePath: record.path
    })
    refresh()
    message.success({
      content: res.status === 'success' ? t('files.deleteSuccess') : `${t('files.deleteFailed')}：${res.message}`,
      key,
      duration: 3
    })
  } catch (err) {
    message.error({ content: `${t('files.deleteError')}：${(err as Error).message}`, key, duration: 3 })
  }
}

const copyOrMoveDialog = ref(false)
const copyOrMoveModalType = ref<'copy' | 'move'>('copy')
const copyFile = (record: FileRecord) => {
  currentRecord.value = record
  copyOrMoveModalType.value = 'copy'
  copyOrMoveDialog.value = true
}

const copyOrMoveModalOk = async (targetPath: string) => {
  if (!currentRecord.value) {
    return
  }
  const src = currentRecord.value.path
  const dest = targetPath
  if (copyOrMoveModalType.value == 'copy') {
    try {
      const cmd = `cp -r "${src}" "${dest}"`
      const { stderr } = await api.sshConnExec({
        cmd: cmd,
        id: props.uuid
      })
      currentRecord.value = null
      copyOrMoveDialog.value = false

      if (stderr !== '') {
        message.error(`${t('files.copyFileFailed')}：${stderr}`)
      } else {
        message.success(t('files.copyFileSuccess'))
        localCurrentDirectoryInput.value = getDirname(dest)
        refresh()
      }
    } catch (error) {
      message.error(`${t('files.copyFileError')}：${error}`)
    }
  } else {
    try {
      const cmd = `mv "${src}" "${dest}"`
      const { stderr } = await api.sshConnExec({
        cmd: cmd,
        id: props.uuid
      })
      currentRecord.value = null
      copyOrMoveDialog.value = false

      if (stderr !== '') {
        message.error(`${t('files.moveFileFailed')}：${stderr}`)
      } else {
        message.success(t('files.moveFileSuccess'))
        localCurrentDirectoryInput.value = getDirname(dest)
        refresh()
      }
    } catch (error) {
      message.error(`${t('files.moveFileError')}：${error}`)
    }
  }
}

const moveFile = (record: FileRecord) => {
  currentRecord.value = record
  copyOrMoveModalType.value = 'move'
  copyOrMoveDialog.value = true
}

defineExpose({
  uploadFile,
  uploadFolder,
  downloadFile,
  refresh,
  basePath,
  localCurrentDirectoryInput
})
</script>

<style scoped>
.base-file {
  background-color: var(--bg-color);
}

.base-file :deep(.ant-card-body) {
  padding: 0px 7px;
}

.fs-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 16px;
}

.fs-header-left {
  flex: 1;
  margin-right: 5px;
  margin-left: 5px;
}

.fs-header-right-item {
  display: inline-block;
  margin-right: 2px;
  margin-left: 2px;
}

.no-select {
  user-select: none;
}

.files-table :deep(.ant-table-tbody) {
  background-color: var(--bg-color);
}

.files-table :deep(.file-table-row) {
  .action-buttons {
    opacity: 0;
    transition: opacity 0.2s ease-in-out;
  }

  &:hover .action-buttons {
    opacity: 1;
  }
}

.files-table :deep(.ant-table-thead > tr > th) {
  background: var(--bg-color);
  color: var(--text-color);
  padding: 8px;
  border-radius: 0;
  border: none !important;
  border-bottom: 1px solid var(--border-color) !important;
}

.files-table :deep(.ant-table-tbody > tr > td) {
  background: var(--bg-color);
  color: var(--text-color);
  padding: 8px;
  border: none !important;
  border-bottom: 1px solid var(--border-color);
}

.files-table :deep(.ant-table-tbody > tr:hover > td) {
  background-color: var(--bg-color-secondary) !important;
}

.files-table :deep(.ant-table-tbody > tr > td) {
  padding: 1px 5px !important;
}

.files-table :deep(.ant-table-thead > tr > td) {
  padding: 1px 0px !important;
}

.files-table :deep(.ant-table-column-has-sorters:hover) {
  background-color: var(--bg-color-secondary) !important;
  padding: 5px 5px;
}

.files-table :deep(.ant-table-column-has-sorters > tr > td) {
  padding: 5px 5px;
}

.files-table :deep(.ant-table-container table > thead > tr:first-child > *:last-child) {
  border-start-end-radius: 0 !important;
  border-end-end-radius: 0 !important;
}

.files-table :deep(.ant-table-container table > thead > tr:first-child > *:first-child) {
  border-start-start-radius: 0 !important;
  border-end-start-radius: 0 !important;
}

:deep(.ant-table-wrapper .ant-table-column-sorter) {
  color: var(--text-color) !important;
}

.input-search {
  background-color: var(--bg-color-secondary);
  border-color: var(--bg-color-secondary);
  color: var(--text-color);
  height: 80%;
}

.file-name-cell {
  position: relative;
  width: 100%;
  min-height: 24px;
  display: flex;
  align-items: center;
}

.files-table :deep(.ant-table-cell::before) {
  display: none !important;
}

.hover-actions {
  position: absolute;
  right: 10px;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  gap: 2px;
  opacity: 0;
  visibility: hidden;
  transition: all 0.2s ease-in-out;
  background-color: var(--bg-color-secondary);
  border-radius: 4px;
  padding: 2px;
  /* box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1); */
  z-index: 10;
}

.files-table :deep(.ant-table-tbody > tr.file-table-row-drag-hover) > td {
  background-color: var(--hover-bg-color) !important;
  outline-offset: -1px;
}

.transfer-drop-zone.drop-not-allowed {
  cursor: not-allowed !important;
}

.files-table :deep(.ant-table-tbody > tr.file-table-row-hover) .hover-actions {
  opacity: 1;
  visibility: visible;
}

.hover-actions .ant-btn {
  padding: 0;
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: var(--text-color);
  font-size: 12px;
  border-radius: 3px;
  transition: background-color 0.2s ease;
}

.hover-actions .ant-btn:hover {
  background-color: var(--border-color);
  color: var(--text-color);
}

.hover-actions .ant-btn.ant-btn-dangerous:hover {
  color: var(--border-color);
  background-color: rgba(255, 77, 79, 0.1);
}

.file-name-main {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  min-width: 0;
  max-width: calc(100% - 120px);
}

.file-name-icon {
  flex: 0 0 auto;
  margin-right: 4px;
}

.file-name-text {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  vertical-align: bottom;
}

@media (max-width: 768px) {
  .hover-actions {
    position: static;
    opacity: 1;
    visibility: visible;
    transform: none;
    margin-left: auto;
  }

  .file-name-main {
    max-width: calc(100% - 140px);
  }
}

.permission-content {
  padding: 10px 0;
}

.permission-group {
  margin-bottom: 10px;
}

.permission-settings {
  margin-top: 15px;
  padding-top: 15px;
}

.setting-item {
  display: flex;
  flex-direction: column;
}

.setting-item label {
  margin-bottom: 8px;
  font-weight: 500;
  color: #262626;
}

.files-table :deep(.ant-table-tbody > tr.file-table-row-hover > td) {
  background-color: var(--hover-bg-color) !important;
}

:deep(.ant-dropdown-menu-item) {
  background-color: var(--border-color) !important;
  color: var(--text-color) !important;
}

:deep(.ant-dropdown-menu-item:hover) {
  background-color: var(--hover-bg-color) !important;
}

.transfer-drop-zone {
  border-radius: 6px;
}

.transfer-drop-zone.drop-active {
  background: transparent !important;
  box-shadow: inset 0 0 0 1px var(--button-bg-color);
}

.transfer-mode .file-name-main {
  max-width: calc(100% - 90px);
}

.files-table {
  --sb-size: 6px;
  --sb-thumb: var(--border-color-light);
  --sb-thumb-hover: var(--text-color-tertiary);
  --sb-track: transparent;
}

.files-table :deep(.ant-table-body),
.files-table :deep(.ant-table-content) {
  background: var(--bg-color);
}

/* Chromium/Electron */
.files-table :deep(.ant-table-body)::-webkit-scrollbar,
.files-table :deep(.ant-table-content)::-webkit-scrollbar {
  width: var(--sb-size);
  height: var(--sb-size);
}

.files-table :deep(.ant-table-body)::-webkit-scrollbar-track,
.files-table :deep(.ant-table-content)::-webkit-scrollbar-track {
  background: var(--sb-track);
}

.files-table :deep(.ant-table-body)::-webkit-scrollbar-thumb,
.files-table :deep(.ant-table-content)::-webkit-scrollbar-thumb {
  background-color: var(--sb-thumb);
  border-radius: 6px;
}

.files-table :deep(.ant-table-body)::-webkit-scrollbar-thumb:hover,
.files-table :deep(.ant-table-content)::-webkit-scrollbar-thumb:hover {
  background-color: var(--sb-thumb-hover);
}

.files-table :deep(.ant-table-cell) {
  white-space: nowrap;
}
</style>
