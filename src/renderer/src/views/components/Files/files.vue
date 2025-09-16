<template>
  <div>
    <a-card class="base-file">
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
          <a-space>
            <div class="fs-header-right-item">
              <a-tooltip :title="$t('files.uploadDirectory')">
                <a-button
                  type="primary"
                  size="small"
                  ghost
                  @click="uploadDirectory"
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
      <a-table
        ref="tableRef"
        :row-key="(record: FileRecord) => record.name"
        :columns="columns"
        :data-source="files"
        size="small"
        :pagination="false"
        :loading="loading"
        class="files-table"
        :scroll="tableScroll"
        :custom-row="customRow"
      >
        <template #bodyCell="{ column, record }">
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
                  style="cursor: pointer"
                  @click="rowClick(record)"
                >
                  <FolderFilled style="color: #1890ff; margin-right: -1px" />
                  {{ record.name }}
                </span>
                <span
                  v-else-if="record.isLink"
                  style="cursor: default"
                >
                  <LinkOutlined style="color: #ff8300; margin-right: -1px" />
                  {{ record.name }}
                </span>
                <span
                  v-else
                  class="no-select"
                  style="cursor: pointer"
                  @dblclick="openFile(record)"
                >
                  <a-tooltip
                    placement="top"
                    :title="t('files.doubleClickToOpen')"
                  >
                    <FileFilled style="color: var(--text-color-quaternary); margin-right: -1px" />
                    {{ record.name }}
                  </a-tooltip>
                </span>
              </template>

              <div
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
                    @click.stop="downloadFile(record)"
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
                    @click.stop="renameFile(record)"
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
                    @click.stop="chmodFile(record)"
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
                        @click="copyFile(record)"
                      >
                        <CopyOutlined />
                        {{ $t('files.copy') }}
                      </a-menu-item>
                      <a-menu-item
                        v-if="!isTeam"
                        @click="moveFile(record)"
                      >
                        <ScissorOutlined />
                        {{ $t('files.move') }}
                      </a-menu-item>
                      <a-menu-item @click="deleteFile(record)">
                        <DeleteOutlined />
                        {{ $t('files.delete') }}
                      </a-menu-item>
                    </a-menu>
                  </template>
                </a-dropdown>
              </div>
            </div>
          </template>
        </template>
      </a-table>
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
      :origin-path="currentRecord?.path"
      :type="copyOrMoveModalType"
      @confirm="copyOrMoveModalOk"
      @update:visible="copyOrMoveDialog = $event"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, h, onMounted, watch, reactive } from 'vue'
import copyOrMoveModal from './moveModal.vue'
import {
  CloseOutlined,
  CheckOutlined,
  LockOutlined,
  DeleteOutlined,
  ExclamationCircleOutlined,
  ScissorOutlined,
  CopyOutlined,
  EditOutlined,
  DownloadOutlined,
  EllipsisOutlined,
  CloudUploadOutlined,
  UploadOutlined,
  RollbackOutlined,
  RedoOutlined,
  FolderFilled,
  LinkOutlined,
  FileFilled
} from '@ant-design/icons-vue'
import { message, Modal } from 'ant-design-vue'
import { ColumnsType } from 'ant-design-vue/es/table'
import { useI18n } from 'vue-i18n'
import { CheckboxValueType } from 'ant-design-vue/es/checkbox/interface'
import cloneDeep from 'clone-deep'

const emit = defineEmits(['openFile'])
const api = (window as any).api
const { t } = useI18n()
const { t: $t } = useI18n()

const props = defineProps({
  currentDirectory: {
    type: String,
    default: () => {
      return '/'
    }
  },
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
  connectType: {
    type: String,
    default: () => {
      return 'local'
    }
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

const localCurrentDirectoryInput = ref(props.currentDirectoryInput)
const localCurrentDirectory = ref(props.currentDirectory)
const files = ref<FileRecord[]>([])
const loading = ref(false)
const showErr = ref(false)
const errTips = ref('')
const tableRef = ref<HTMLElement | null>(null)

type FlexibleColumn = Partial<ColumnsType<FileRecord>[number]>

const columns: FlexibleColumn[] = [
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

const tableScroll = reactive({
  x: 'max-content'
})

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

const loadFiles = async (uuid: string, filePath: string): Promise<void> => {
  loading.value = true
  showErr.value = false
  errTips.value = ''
  const fetchList = async (path: string) => {
    return await api.sshSftpList({ path, id: uuid })
  }
  let data = await fetchList(filePath || '/')
  if (data.length > 0 && typeof data[0] === 'string') {
    if (isFirstLoad.value) {
      filePath = '/'
      data = await fetchList(filePath)
      isFirstLoad.value = false
    }
    if (data.length > 0 && typeof data[0] === 'string') {
      errTips.value = data[0]
      showErr.value = true
    }
  }
  if (isFirstLoad.value) {
    isFirstLoad.value = false
  }

  loading.value = false
  const items = data.map((item: ApiFileRecord) => {
    return {
      ...item,
      key: item.path
    } as FileRecord
  })
  const dirs = items.filter((item: FileRecord) => item.isDir === true)
  dirs.sort(sortByName)

  const fileItems = items.filter((item: FileRecord) => item.isDir === false)
  fileItems.sort(sortByName)
  dirs.push(...fileItems)

  if (filePath !== '/') {
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
  localCurrentDirectory.value = filePath
  localCurrentDirectoryInput.value = filePath
}

const rowClick = (record: FileRecord): void => {
  if (record.isDir || record.isLink) {
    if (record.path === '..') {
      // 获取当前目录的上级目录
      const currentDirectory = localCurrentDirectory.value
      let parentDirectory = currentDirectory.substring(0, currentDirectory.lastIndexOf('/'))
      if (parentDirectory === '') {
        localCurrentDirectoryInput.value = '/'
        localCurrentDirectory.value = '/'
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
  loadFiles(props.uuid, localCurrentDirectoryInput.value)
}

// instead of path.dirname()
const getDirname = (filepath: string) => {
  const lastSlashIndex = filepath.lastIndexOf('/')

  if (lastSlashIndex === -1) return '.'
  if (lastSlashIndex === 0) return '/'

  return filepath.substring(0, lastSlashIndex)
}

const joinPath = (...parts: string[]) => {
  return parts.join('/').replace(/\/+/g, '/')
}
const rollback = (): void => {
  loadFiles(props.uuid, getDirname(localCurrentDirectoryInput.value))
}

const handleRefresh = (): void => {
  refresh()
}

onMounted(async () => {
  isTeamCheck(props.uuid)
  await loadFiles(props.uuid, localCurrentDirectory.value)
})

const uploadFile = async (): Promise<void> => {
  const selected = await api.openFileDialog()
  if (!selected) return
  const key = props.uuid
  try {
    message.loading({ content: t('files.uploading'), key, duration: 0 })
    const res = await api.uploadFile({
      id: key,
      remotePath: localCurrentDirectoryInput.value,
      localPath: selected
    })
    refresh()
    message.success({
      content: res.status === 'success' ? t('files.uploadSuccess') : `${t('files.uploadFailed')}：${res.message}`,
      key,
      duration: 3
    })
  } catch (err) {
    message.error({ content: `${t('files.uploadError')}：${(err as Error).message}`, key, duration: 3 })
  }
}

const uploadDirectory = async (): Promise<void> => {
  const selected = await api.openDirectoryDialog()
  if (!selected) return
  const key = props.uuid
  try {
    message.loading({ content: t('files.uploading'), key, duration: 0 })
    const res = await api.uploadDirectory({
      id: key,
      localDir: selected,
      remoteDir: localCurrentDirectoryInput.value
    })
    refresh()
    message.success({
      content: res.status === 'success' ? t('files.uploadSuccess') : `${t('files.uploadFailed')}：${res.message}`,
      key,
      duration: 3
    })
  } catch (err) {
    message.error({ content: `${t('files.uploadError')}：${(err as Error).message}`, key, duration: 3 })
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

const customRow = (record) => {
  return {
    class: getRowClass(record.name),
    onMouseenter: () => handleRowMouseEnter(record.name),
    onMouseleave: () => handleRowMouseLeave(record.name)
  }
}

const getRowClass = (recordName) => {
  const classes = ['file-table-row']

  // Conditions for displaying hover effect：
  if (currentHoverRow.value === recordName || dropdownVisible[recordName] || mouseInDropdown[recordName]) {
    classes.push('file-table-row-hover')
    // classes.push()
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
const handleMoreButtonLeave = (recordName: string) => {
  // 按钮离开时不立即清理，让其他事件处理
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

// 处理菜单项点击
const handleMenuClick = () => {
  currentHoverRow.value = null
  Object.keys(dropdownVisible).forEach((key) => {
    dropdownVisible[key] = false
    mouseInDropdown[key] = false
  })
}

// 操作方法
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
  const [mod, ownerCode, groupCode, publicCode] = mode.split('').map(Number)

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

const downloadFile = async (record: FileRecord) => {
  const key = props.uuid
  const remotePath = record.path
  const savePath = await api.openSaveDialog({ fileName: record.name })
  if (!savePath) return

  try {
    message.loading({ content: t('files.downloading'), key, duration: 0 })
    const res = await api.downloadFile({ id: key, remotePath: remotePath, localPath: savePath })
    message.success({
      content: res.status === 'success' ? t('files.downloadSuccess') : `${t('files.downloadFailed')}：${res.message}`,
      key,
      duration: 3
    })
  } catch (err) {
    message.error({ content: `${t('files.downloadError')}：${(err as Error).message}`, key, duration: 3 })
  }
}

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
    content: h('div', { style: 'color:red;font-weight: bold;' }, record.path),
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
const isTeamCheck = (uuid: string) => {
  const parts = uuid.split('@')
  if (parts.length < 2) return false

  const rest = parts[1]
  const orgType = rest.split(':')[1]
  isTeam.value = orgType === 'local-team'
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
let copyOrMoveModalType = ref('')
const copyFile = (record: FileRecord) => {
  currentRecord.value = record
  copyOrMoveModalType.value = 'copy'
  copyOrMoveDialog.value = true
}

const copyOrMoveModalOk = async (targetPath: string) => {
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

watch(
  () => props.currentDirectory,
  (newVal) => {
    if (newVal !== localCurrentDirectory.value) {
      localCurrentDirectory.value = newVal
      loadFiles(props.uuid, newVal)
    }
  }
)

watch(
  () => props.currentDirectoryInput,
  (newVal) => {
    if (newVal !== localCurrentDirectoryInput.value) {
      localCurrentDirectoryInput.value = newVal
    }
  }
)

defineExpose({
  refresh,
  loadFiles
})
</script>

<style scoped>
.base-file {
  border-color: var(--border-color);
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
    border-color: red;
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
  //box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  z-index: 10;
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

.file-name-cell > span {
  position: relative;
  z-index: 1;
  max-width: calc(100% - 120px);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

@media (max-width: 768px) {
  .hover-actions {
    position: static;
    opacity: 1;
    visibility: visible;
    transform: none;
    margin-left: auto;
  }

  .file-name-cell > span {
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
  border-top: 1px solid #f0f0f0;
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
  background-color: var(--bg-color-secondary) !important;
}

:deep(.ant-dropdown-menu-item) {
  background-color: var(--border-color) !important;
  color: var(--text-color) !important;
}

:deep(.ant-dropdown-menu-item:hover) {
  background-color: var(--hover-bg-color) !important;
}
</style>
