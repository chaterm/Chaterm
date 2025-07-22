<template>
  <div class="term_host_list">
    <div class="term_host_header">
      <div style="width: 100%; margin-top: 10px">
        <div class="tree-container">
          <a-tree
            v-model:expanded-keys="expandedKeys"
            class="dark-tree"
            block-node
            :tree-data="treeData"
            :default-expand-all="true"
          >
            <template #title="{ dataRef }">
              <div>
                <span>{{ dataRef.title }}</span>
                <div v-if="dataRef.expanded || expandedKeys.includes(dataRef.key)">
                  <TermFileSystem
                    :uuid="dataRef.value"
                    :current-directory="
                      dataRef.value.includes('@')
                        ? dataRef.value.split('@')[0] === 'root'
                          ? '/root'
                          : `/home/${dataRef.value.split('@')[0]}`
                        : dataRef.value
                    "
                    :current-directory-input="
                      dataRef.value.includes('@')
                        ? dataRef.value.split('@')[0] === 'root'
                          ? '/root'
                          : `/home/${dataRef.value.split('@')[0]}`
                        : dataRef.value
                    "
                    :connect-type="dataRef.value.indexOf('local') !== -1 ? 'local' : 'remote'"
                    @open-file="openFile"
                  />
                </div>
              </div>
            </template>
          </a-tree>
        </div>
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
    </div>
    <div></div>
  </div>
</template>

<script lang="ts" setup>
import { ref, onMounted, reactive, UnwrapRef } from 'vue'
import type { TreeProps } from 'ant-design-vue/es/tree'
import TermFileSystem from './files.vue'
import { useI18n } from 'vue-i18n'
import { getUserSessionList } from '@/api/term/term'
import { userInfoStore } from '@/store'
import { encrypt } from '@/utils/util.js'
import { termFileContent, termFileContentSave } from '@/api/term/term'
import EditorCode from '../Term/Editor/dragEditor.vue'
import { editorData } from '../Term/Editor/dragEditor.vue'
import { message, Modal, notification } from 'ant-design-vue'
import { LanguageMap } from '../Term/Editor/languageMap'

const { t } = useI18n()
onMounted(() => {
  listUserSessions()
})
const api = window.api as any
const expandedKeys = ref<string[]>([])
// editor绑定
const activeEditorKey = ref(null)
const handleFocusEditor = (key) => {
  activeEditorKey.value = key
}
const listUserSessions = async () => {
  const sessionData: string[] = await api.sftpConnList()
  const sessionResult = sessionData.reduce<Record<string, string>>((acc, uuid) => {
    const ip = uuid.split(':')[0].split('@')[1]
    if (!(ip in acc)) acc[ip] = uuid
    return acc
  }, {})

  const authData = { uid: userInfoStore()?.userInfo.uid }
  const auth = decodeURIComponent(encrypt(authData))
  const apiResp = await getUserSessionList({ data: auth })
  const apiResult = (apiResp && apiResp.message) || {}

  updateTreeData({ ...sessionResult, ...apiResult })
}

function objectToTreeData(obj: object): any[] {
  return Object.entries(obj).map(([key, value]) => {
    const keys: string[] = []
    const node = {
      title: key,
      key: key,
      draggable: true,
      value: String(value),
      isLeaf: false
    }
    if (keys.length < 1) {
      keys.push(key)
      expandedKeys.value = keys
    }
    return node
  })
}

const treeData = ref<TreeProps['treeData']>([])

function updateTreeData(newData: object) {
  treeData.value = objectToTreeData(newData)
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
  const { filePath, terminalId, connectType } = data
  if (connectType === 'remote') {
    const authData = {
      uuid: terminalId,
      filePath: filePath
    }
    const auth = decodeURIComponent(encrypt(authData))
    try {
      const response = await termFileContent({ uuid: auth })
      if (response.error && response.error !== '') {
        console.log('!ERR', response.error)
      } else {
        const existingEditor = openEditors.find((editor) => editor?.filePath === filePath)
        if (!existingEditor) {
          openEditors.push({
            filePath: filePath,
            visible: true,
            vimText: response.content,
            originVimText: response.content,
            action: response.action,
            vimEditorX: Math.round(window.innerWidth * 0.5) - Math.round(window.innerWidth * 0.7 * 0.5),
            vimEditorY: Math.round(window.innerHeight * 0.5) - Math.round(window.innerHeight * 0.7 * 0.5),
            contentType: response.contentType,
            vimEditorHeight: Math.round(window.innerHeight * 0.7),
            vimEditorWidth: Math.round(window.innerWidth * 0.7),
            loading: false,
            fileChange: false,
            saved: false,
            key: terminalId + '-' + filePath,
            terminalId: terminalId,
            editorType: connectType
          } as UnwrapRef<editorData>)
        } else {
          existingEditor.visible = true
          existingEditor.vimText = response.content
        }
      }
    } catch (error) {
      console.error('打开文件失败', error)
    }
  } else {
    const { stdout, stderr } = await api.sshConnExec({
      cmd: `cat ${filePath}`,
      id: terminalId
    })
    let action = '编辑'
    if (stderr.indexOf('No such file or directory') !== '-1') {
      action = '创建'
    }
    if (stderr.indexOf('Permission denied') !== -1) {
      message.error('Permission denied')
    } else {
      const contentType = getFileExt(filePath) ? getFileExt(filePath) : '.python'
      const existingEditor = openEditors.find((editor) => editor?.filePath === filePath)
      if (!existingEditor) {
        openEditors.push({
          filePath: filePath,
          visible: true,
          vimText: stdout,
          originVimText: stdout,
          action: action,
          vimEditorX: Math.round(window.innerWidth * 0.5) - Math.round(window.innerWidth * 0.7 * 0.5),
          vimEditorY: Math.round(window.innerHeight * 0.5) - Math.round(window.innerHeight * 0.7 * 0.5),
          contentType: LanguageMap[contentType] ? LanguageMap[contentType] : 'python',
          vimEditorHeight: Math.round(window.innerHeight * 0.7),
          vimEditorWidth: Math.round(window.innerWidth * 0.7),
          loading: false,
          fileChange: false,
          saved: false,
          key: terminalId + '-' + filePath,
          terminalId: terminalId,
          editorType: contentType
        } as UnwrapRef<editorData>)
      } else {
        existingEditor.visible = true
        existingEditor.vimText = data
      }
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
  const { key, needClose, editorType } = data
  const editor = openEditors.find((editor) => editor?.key === key)
  if (!editor) return
  if (editorType === 'remote') {
    const authData = {
      uuid: editor.key,
      filePath: editor.filePath,
      content: editor.vimText
    }
    const auth = decodeURIComponent(encrypt(authData))
    try {
      if (editor?.fileChange) {
        editor.loading = true
        const response = await termFileContentSave({ data: auth })
        if (response.error !== '') {
          message.error(`${t('common.saveFailed')}: ${response.error}`)
        } else {
          message.success(t('common.saveSuccess'))
          // 关闭
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
      } else {
        message.success(t('common.saveSuccess'))
      }
    } catch (error) {
      message.error(`${t('common.saveFailed')}: ${error}`)
    }
  } else {
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
}

defineExpose({
  updateTreeData
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

  .term_host_header {
    width: 100%;
    height: auto;
  }
  .term_com_list {
    display: inline-block;
    float: right;
  }
  .term_com_list .ant-select-selection-item {
    color: var(--text-color) !important;
  }
  .term_com_list .ant-select-selector {
    color: var(--text-color) !important;
  }
  .term_com_list .ant-select-single {
    color: var(--text-color) !important;
  }
  :deep(.term_com_list .ant-select-selector) {
    color: var(--text-color) !important;
  }
}
.tree-container {
  margin-top: 8px;
  overflow-y: auto;
  overflow-x: hidden;
  border-radius: 2px;
  background-color: var(--bg-color);
}

:deep(.dark-tree) {
  background-color: var(--bg-color);
  height: 30% !important;

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
</style>
