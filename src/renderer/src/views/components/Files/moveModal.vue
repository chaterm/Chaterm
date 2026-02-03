<template>
  <a-modal
    :title="type === 'move' ? $t('files.moveTo') : $t('files.cpTo')"
    :visible="visible"
    :confirm-loading="confirmLoading"
    :ok-text="$t('common.confirm')"
    :cancel-text="$t('common.cancel')"
    @ok="handleOk"
    @cancel="$emit('update:visible', false)"
  >
    <div style="margin-bottom: 16px">
      <div style="margin-bottom: 4px">{{ $t('files.originPath') }}</div>
      <span>{{ originPathData }}</span>
    </div>

    <div>
      <div style="margin-bottom: 4px">{{ $t('files.targetPath') }}</div>
      <div
        ref="pathContainer"
        style="margin-bottom: 12px; min-height: 32px; display: flex; align-items: flex-start"
        @click="onPathBlankClick"
      >
        <a-input
          v-if="editingPath"
          v-model:value="currentPath"
          :placeholder="$t('files.pathInputTips')"
          style="margin-bottom: 8px; flex: 1"
          @blur="handleInputBlur"
        />
        <a-breadcrumb
          v-else
          separator=">"
          style="flex: 1; padding: 4px 8px; border: 1px solid #d9d9d9; border-radius: 4px; background-color: #f5f5f5; margin-bottom: 8px"
        >
          <a-breadcrumb-item
            v-for="(p, i) in targetPathStack"
            :key="i"
          >
            <a-dropdown
              trigger="click"
              @visible-change="(v) => v && loadSubDirs(i)"
            >
              <template #overlay>
                <a-menu
                  style="max-height: 300px; overflow-y: auto"
                  class="ant-scrollbar"
                  @click="({ key }) => enterSubDir(i, key)"
                >
                  <template v-if="(subDirMap[i] || []).length">
                    <a-menu-item
                      v-for="item in subDirMap[i] || []"
                      :key="item.name"
                    >
                      <FolderFilled style="margin-right: 8px; color: #1890ff" />
                      {{ item.name }}
                    </a-menu-item>
                  </template>
                  <template v-else>
                    <a-menu-item disabled>{{ $t('files.noDirTips') }}</a-menu-item>
                  </template>
                </a-menu>
              </template>
              <span style="cursor: pointer">
                <span @click.stop="onPathClick(i)">{{ p || '/' }}</span>
                <DownOutlined style="margin-left: 4px" />
              </span>
            </a-dropdown>
          </a-breadcrumb-item>
        </a-breadcrumb>

        <span
          class="edit-trigger"
          style="margin-left: 8px; color: #1890ff; cursor: pointer; white-space: nowrap; display: flex; align-items: center; height: 32px"
          @click="editPath()"
        >
          {{ $t('files.dirEdit') }}
        </span>
      </div>
    </div>
  </a-modal>
  <a-modal
    v-model:visible="showConflictModal"
    :title="$t('files.conflictTips')"
    :footer="null"
    @cancel="handleConflictAction('cancel')"
  >
    <p
      >{{ $t('files.file') }} <strong>{{ originFileName }}</strong> {{ $t('files.exists') }} {{ currentPath }} {{ $t('files.overwriteTips') }}</p
    >
    <div style="display: flex; justify-content: flex-end; gap: 8px; margin-top: 24px">
      <a-input
        v-model:value="newFileName"
        :placeholder="$t('files.newFileName')"
      />
      <a-button
        type="primary"
        @click="handleConflictAction('rename')"
        >{{ $t('files.rename') }}</a-button
      >
      <a-button
        type="primary"
        danger
        @click="handleConflictAction('overwrite')"
        >{{ $t('files.overwrite') }}</a-button
      >
      <a-button @click="handleConflictAction('cancel')">{{ $t('common.cancel') }}</a-button>
    </div>
  </a-modal>
</template>

<script setup lang="ts">
import { ref, watch, computed, onMounted, onBeforeUnmount } from 'vue'
import { message } from 'ant-design-vue'
import { FolderFilled, DownOutlined } from '@ant-design/icons-vue'
import type { FileRecord } from './files.vue'
import { useI18n } from 'vue-i18n'

const { t: $t } = useI18n()
const api = (window as any).api

const props = defineProps<{
  visible: boolean
  id: string
  originPath: string
  type: 'move' | 'copy'
}>()

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void
  (e: 'confirm', targetPath: string): void
}>()

const currentPath = ref('')
const confirmLoading = ref(false)
const editingPath = ref(false)
const subDirMap = ref<Record<number, FileRecord[]>>({})
const pathContainer = ref<HTMLElement | null>(null)
const originPathData = ref('')
const targetPathStack = computed(() => {
  return ['/', ...currentPath.value.split('/').filter(Boolean)]
})

const getDirname = (filepath: string) => {
  const lastSlashIndex = filepath.lastIndexOf('/')

  if (lastSlashIndex === -1) return '.'
  if (lastSlashIndex === 0) return '/'

  return filepath.substring(0, lastSlashIndex)
}

// direct hits
const onPathClick = (index: number) => {
  const segments = targetPathStack.value.slice(0, index + 1)
  const pathParts = segments[0] === '/' ? segments.slice(1) : segments
  currentPath.value = '/' + pathParts.join('/')
  editingPath.value = false
}

// dropdown menu selection
const enterSubDir = async (index: number, name: string) => {
  const newStack = targetPathStack.value.slice(0, index + 1)
  newStack.push(name)
  const pathParts = newStack[0] === '/' ? newStack.slice(1) : newStack
  currentPath.value = '/' + pathParts.join('/')
  editingPath.value = false
}

const loadSubDirs = async (index: number) => {
  const path = '/' + targetPathStack.value.slice(0, index + 1).join('/')
  const res = await api.sshSftpList({ id: props.id, path: path })
  if (Array.isArray(res)) {
    subDirMap.value[index] = (res as FileRecord[]).filter((i) => i.isDir)
  } else {
    subDirMap.value[index] = []
  }
}

const editPath = () => {
  editingPath.value = true
}
const handleInputBlur = () => {
  editingPath.value = false
}

//input switching
const onPathBlankClick = (e: MouseEvent) => {
  const target = e.target as HTMLElement
  if (target.closest('.ant-breadcrumb')) return
  editingPath.value = true
}

const onGlobalClick = (e: MouseEvent) => {
  if (!pathContainer.value) return
  if (!pathContainer.value.contains(e.target as Node)) {
    editingPath.value = false
  }
}

onMounted(() => {
  document.addEventListener('click', onGlobalClick)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', onGlobalClick)
})

watch(
  () => props.visible,
  (val) => {
    if (val) {
      originPathData.value = getDirname(props.originPath)
      currentPath.value = getDirname(props.originPath)
      editingPath.value = false
      subDirMap.value = {}
    }
  },
  { immediate: true }
)

const showConflictModal = ref(false)
const newFileName = ref('')

const originFileName = computed(() => {
  const parts = props.originPath.split('/')
  return parts[parts.length - 1]
})

const handleConflictAction = (action: 'cancel' | 'overwrite' | 'rename') => {
  if (action === 'cancel') {
    showConflictModal.value = false
  } else if (action === 'overwrite') {
    showConflictModal.value = false
    emit('confirm', currentPath.value + '/' + originFileName.value)
  } else if (action === 'rename') {
    if (!newFileName.value.trim()) {
      message.error($t('files.pleaseInputNewFileName'))
      return
    }
    showConflictModal.value = false
    emit('confirm', currentPath.value + '/' + newFileName.value.trim())
  }
}

const splitFileName = (filename: string) => {
  const lastDotIndex = filename.lastIndexOf('.')
  if (lastDotIndex <= 0) {
    return { baseName: filename, ext: '' }
  }
  return {
    baseName: filename.slice(0, lastDotIndex),
    ext: filename.slice(lastDotIndex)
  }
}

const checkFileConflict = async () => {
  const dirPath = currentPath.value
  const list = await api.sshSftpList({ id: props.id, path: dirPath })
  const fileList = Array.isArray(list) ? list.map((item: any) => (typeof item === 'string' ? item : item.name)) : []

  const name = originFileName.value
  if (fileList.includes(name)) {
    // Generate non conflicting file names
    const { baseName, ext } = splitFileName(name)
    let i = 1
    let newName = `${baseName}_${i}${ext}`
    while (fileList.includes(newName)) {
      i++
      newName = `${baseName}_${i}${ext}`
    }

    newFileName.value = newName
    showConflictModal.value = true
    return true
  }
  return false
}

const handleOk = async () => {
  const conflict = await checkFileConflict()
  if (!conflict) {
    emit('confirm', currentPath.value + '/' + originFileName.value)
    setTimeout(() => {
      emit('update:visible', false)
    }, 300)
  }
}
// const handleConfirm = async () => {
//
// }
</script>

<style scoped>
.ant-breadcrumb > span {
  user-select: none;
}
.ant-breadcrumb > span:hover {
  color: #1890ff;
}

.ant-scrollbar {
  &::-webkit-scrollbar {
    width: 6px;
    height: 6px;
  }

  &::-webkit-scrollbar-track {
    background: var(--bg-color);
    border-radius: 3px;
  }

  &::-webkit-scrollbar-thumb {
    background: rgba(0, 0, 0, 0.12);
    border-radius: 3px;
  }

  &::-webkit-scrollbar-thumb:hover {
    background: rgba(0, 0, 0, 0.18);
  }
}
</style>
