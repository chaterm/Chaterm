<template>
  <div
    ref="fileElement"
    class="tree-container"
  >
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
              @open-file="openFile"
            />
          </div>
        </div>
      </template>
    </a-tree>
    <a-empty
      v-else
      description="暂无数据，请先连接服务器~"
    />
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
</template>

<script lang="ts" setup>
import { ref, onMounted, reactive, UnwrapRef, onBeforeUnmount } from 'vue'
import type { TreeProps } from 'ant-design-vue/es/tree'
import TermFileSystem from './files.vue'
import { useI18n } from 'vue-i18n'
import EditorCode from '../Ssh/editors/dragEditor.vue'
import { editorData } from '../Ssh/editors/dragEditor.vue'
import { message, Modal } from 'ant-design-vue'
import { LanguageMap } from '../Ssh/editors/languageMap'
import { Base64Util } from '../../../utils/base64'
import eventBus from '../../../utils/eventBus'

const { t } = useI18n()

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
})
const api = (window as any).api
const expandedKeys = ref<string[]>([])
// editor绑定
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

const listUserSessions = async () => {
  const sessionData: SftpConnectionInfo[] = await api.sftpConnList()
  const sessionResult = sessionData.reduce<Record<string, SftpConnectionInfo>>((acc, item) => {
    const [, rest] = item.id.split('@')
    const parts = rest.split(':')
    let ip = parts[0] || 'Unknown'
    if (item.id.includes('local-team')) {
      const hostnameBase64 = parts[2] || 'Unknown'
      ip = Base64Util.decode(hostnameBase64)
    }

    if (!(ip in acc)) {
      acc[ip] = item
    }
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

const updateTreeData = (newData: object) => {
  treeData.value = objectToTreeData(newData)
}

const resolvePaths = (value: string) => {
  const [username] = value.split('@')
  return username === 'root' ? '/root' : `/home/${username}`
}
const getBasePath = (value: string) => {
  const [, rest] = value.split('@')
  const parts = rest.split(':')

  if (value.includes('local-team')) {
    const hostnameBase64 = parts[2] || ''
    let hostname = ''
    hostname = Base64Util.decode(hostnameBase64)
    return `/Default/${hostname}`
  }
  return ''
}

// 定义编辑器接口
// 使用接口类型化响应式数组
const openEditors = reactive<editorData[]>([])

const getFileExt = (filePath: string) => {
  const idx = filePath.lastIndexOf('.')
  if (idx === -1) return '' // 没有扩展名
  return filePath.slice(idx).toLowerCase()
}
const openFile = async (data) => {
  const { filePath, terminalId } = data

  const { stdout, stderr } = await api.sshConnExec({
    cmd: `cat ${filePath}`,
    id: terminalId
  })
  let action = '编辑'
  if (stderr.indexOf('No such file or directory') !== '-1') {
    action = '创建'
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
      // 关闭
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

.tabs-content::-webkit-scrollbar {
  height: 3px;
}

.tabs-content::-webkit-scrollbar-track {
  background: transparent;
}

.tabs-content::-webkit-scrollbar-thumb {
  background-color: var(--border-color-light);
  border-radius: 3px;
}

.tabs-content::-webkit-scrollbar-thumb:hover {
  background-color: var(--text-color-tertiary);
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

/* 高亮显示当前活跃的终端 */
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
</style>
