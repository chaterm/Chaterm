<template>
  <DraggableResizable
    :x="editor.vimEditorX"
    :y="editor.vimEditorY"
    :width="editor.vimEditorWidth"
    :height="editor.vimEditorHeight"
    class="file-vim-content"
    :drag-handle="'.drag-handle'"
    @drag-stop="(args) => onDragStop(args, editor)"
    @resize-stop="(args) => onResizeStop(args, editor)"
  >
    <div class="editor-container">
      <div class="editor-toolbar drag-handle">
        <div class="toolbar-left">
          <a-button
            class="toolbar-btn save-btn"
            :loading="editor.loading"
            @click="handleSave(editor.filePath, false)"
          >
            <span class="btn-icon"><SaveOutlined :style="{ fontSize: '18px' }" /></span>
            <span>保存</span>
          </a-button>
        </div>
        <div class="toolbar-center">
          <span
            class="file-path"
            :title="editorFilter(editor.action) + editor.filePath"
          >
            {{ editorFilter(editor.action) }}{{ editor.filePath }}
          </span>
        </div>
        <div class="toolbar-right">
          <a-tooltip
            v-if="showVimFullScreenEditor"
            title="全屏"
            @click="fullScreenVimEditor()"
          >
            <a-button class="toolbar-btn op-btn">
              <span class="btn-icon"><FullscreenOutlined :style="{ fontSize: '18px' }" /></span>
            </a-button>
          </a-tooltip>

          <a-tooltip
            v-if="showVimFullScreenExitEditor"
            title="退出全屏"
            @click="exitFullScreenVimEditor()"
          >
            <a-button class="toolbar-btn op-btn">
              <span class="btn-icon"><FullscreenExitOutlined :style="{ fontSize: '18px' }" /></span>
            </a-button>
          </a-tooltip>

          <a-tooltip title="关闭">
            <a-button
              class="toolbar-btn op-btn"
              @click="closeVimEditor(editor.filePath)"
            >
              <span class="btn-icon"><CloseOutlined :style="{ fontSize: '18px' }" /></span>
            </a-button>
          </a-tooltip>
        </div>
      </div>
      <EditorCode
        v-model="editor.vimText"
        :language="editor.contentType"
        theme="vs-dark"
        @update:model-value="(newValue) => handleTextChange(editor, newValue)"
      />
    </div>
  </DraggableResizable>
</template>

<script setup lang="ts">
import EditorCode from './monacoEditor.vue'
import DraggableResizable from './dragResize.vue'
import {
  FullscreenOutlined,
  FullscreenExitOutlined,
  CloseOutlined,
  SaveOutlined
} from '@ant-design/icons-vue'

import { PropType, defineEmits, shallowRef } from 'vue'

export interface editorData {
  filePath: string
  visible: boolean
  vimText: string
  originVimText: string
  action: string
  vimEditorX: number
  vimEditorY: number
  contentType: string
  vimEditorHeight: number
  vimEditorWidth: number
  lastVimEditorY: number
  lastVimEditorHeight: number
  lastVimEditorWidth: number
  lastVimEditorX: number
  loading: boolean
  fileChange: boolean
  saved: boolean
  key: string
  editorType: string
}
// 定义属性
const props = defineProps({
  editor: {
    type: Object as PropType<editorData>,
    default: () => ({})
  }
})
const editor = props.editor
const emit = defineEmits(['handleSave', 'closeVimEditor'])

const handleSave = (filePath, needClose) => {
  emit('handleSave', {
    filePath: filePath,
    needClose: needClose,
    editorType: props.editor.editorType
  })
}
const closeVimEditor = (filePath) => {
  emit('closeVimEditor', { filePath: filePath, editorType: props.editor.editorType })
}

const showVimFullScreenEditor = shallowRef(true)
const showVimFullScreenExitEditor = shallowRef(false)

const handleTextChange = (editor, newValue) => {
  if (editor.originVimText !== newValue) {
    editor.fileChange = true
    editor.saved = false
  } else {
    editor.fileChange = false
  }
}
const fullScreenVimEditor = () => {
  editor.lastVimEditorX = editor.vimEditorX
  editor.lastVimEditorY = editor.vimEditorY
  editor.lastVimEditorHeight = editor.vimEditorHeight
  editor.lastVimEditorWidth = editor.vimEditorWidth
  editor.vimEditorX =
    Math.round(window.innerWidth * 0.5) - Math.round(window.innerWidth * 0.85 * 0.5)
  editor.vimEditorY =
    Math.round(window.innerHeight * 0.5) - Math.round(window.innerHeight * 0.85 * 0.5)
  editor.vimEditorHeight = Math.round(window.innerHeight * 0.85)
  editor.vimEditorWidth = Math.round(window.innerWidth * 0.85)
  showVimFullScreenEditor.value = false
  showVimFullScreenExitEditor.value = true
}
const exitFullScreenVimEditor = () => {
  editor.vimEditorHeight = editor.lastVimEditorHeight
  editor.vimEditorWidth = editor.lastVimEditorWidth
  editor.vimEditorX = editor.lastVimEditorX
  editor.vimEditorY = editor.lastVimEditorY

  showVimFullScreenEditor.value = true
  showVimFullScreenExitEditor.value = false
}

const onDragStop = (args, editor) => {
  editor.vimEditorX = args.x
  editor.vimEditorY = args.y
}
const onResizeStop = (args, editor) => {
  editor.vimEditorX = args.x
  editor.vimEditorY = args.y
  editor.vimEditorWidth = args.width
  editor.vimEditorHeight = args.height
}
const editorFilter = (action) => {
  if (action === 'editor') {
    return '编辑文件：'
  } else {
    return '新建文件：'
  }
}
</script>

<style scoped>
.editor-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  overflow: hidden;
  background-color: #1e1e1e;
}

.editor-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  height: 40px;
  min-height: 40px;
  padding: 0 10px;
  background-color: #2d2d2d;
  border-bottom: 1px solid #3d3d3d;
  transition: all 0.3s ease;
}

.toolbar-left,
.toolbar-right {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.toolbar-center {
  flex: 1;
  display: flex;
  justify-content: center;
  overflow: hidden;
  margin: 0 10px;
  transition: opacity 0.3s ease;
}

.file-path {
  cursor: default;
  color: #cecece;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
}

.toolbar-btn {
  display: flex;
  align-items: center;
  padding: 6px 12px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
  transition: background-color 0.2s;
  margin-right: 4px;
}

.save-btn {
  background-color: #0e639c;
  color: white;
}

.save-btn:hover {
  background-color: #1177bb;
  color: white;
}

.op-btn {
  color: gray;
}
.op-btn:hover {
  color: white;
}

.op-btn {
  background-color: transparent;
  color: #cccccc;
}

.btn-icon {
  margin-right: 6px;
  font-size: 14px;
}

.file-vim-content {
  background: #2c2c2c;
  padding: 4px;
  border-radius: 8px;
  width: 1000px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  position: fixed;
  top: 12px;
  z-index: 1000;
  border: 0px;
}
</style>
