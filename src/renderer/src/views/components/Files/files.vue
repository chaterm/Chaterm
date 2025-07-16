<template>
  <div>
    <a-card class="base-file">
      <div class="fs-header">
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
              <a-tooltip :title="$t('common.refresh')">
                <a-button
                  type="primary"
                  size="small"
                  ghost
                  @click="refresh"
                >
                  <template #icon><ReloadOutlined /></template>
                </a-button>
              </a-tooltip>
            </div>
          </a-space>
        </div>
      </div>
      <p
        v-show="showErr"
        style="font-weight: 700; color: #d30000"
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
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.dataIndex === 'name'">
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
                title="双击打开"
              >
                <FileFilled style="color: var(--text-color-quaternary); margin-right: -1px" />
                {{ record.name }}
              </a-tooltip>
            </span>
          </template>
        </template>
      </a-table>
    </a-card>
  </div>
</template>

<script setup lang="ts">
import { ref, h, onMounted, watch, defineProps, reactive } from 'vue'
import { ReloadOutlined, FolderFilled, LinkOutlined, FileFilled } from '@ant-design/icons-vue'
import { termFileLs } from '@/api/term/term'
import { encrypt } from '@/utils/util.js'
import { notification } from 'ant-design-vue'
import { defineEmits } from 'vue'
import { ColumnsType } from 'ant-design-vue/es/table'
import { useI18n } from 'vue-i18n'

const emit = defineEmits(['openFile'])
const api = window.api as any
const { t } = useI18n()

// 定义props，并提供默认值
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

interface FileRecord {
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
    ellipsis: true
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

const loadFiles = async (uuid: string, filePath: string): Promise<void> => {
  loading.value = true
  showErr.value = false
  errTips.value = ''
  if (props.connectType === 'remote') {
    const authData = {
      uuid: uuid,
      filePath: filePath || '/'
    }
    const auth = decodeURIComponent(encrypt(authData))
    termFileLs({ uuid: auth })
      .then((res: any) => {
        if (res.message === 'error') {
          loading.value = false
          notification.error({
            message: res.error
          })
        } else {
          loading.value = false
          const data = res.data as ApiFileRecord[]

          // 优先文件夹
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
      })
      .catch(() => {
        loading.value = false
      })
  } else {
    const data = await api.sshSftpList({
      path: filePath || '/',
      id: uuid
    })
    loading.value = false
    if (data.length > 0) {
      if (typeof data[0] === 'string') {
        errTips.value = data[0]
        showErr.value = true
      }
    }

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

const handleRefresh = (): void => {
  // if (tableRef.value?.refresh) {
  //   tableRef.value.refresh()
  // }
  refresh()
}

onMounted(() => {
  loadFiles(props.uuid, localCurrentDirectory.value)
})

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
  margin-right: 16px;
}

.fs-header-right-item {
  display: inline-block;
}

.no-select {
  user-select: none;
}

.files-table :deep(.ant-table-tbody) {
  background-color: var(--bg-color);
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

.input-search {
  background-color: var(--bg-color-secondary);
  border-color: var(--bg-color-secondary);
  height: 80%;
}
</style>
