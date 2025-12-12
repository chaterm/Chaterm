<template>
  <div
    class="editor-container"
    @click="emit('focusEditor', editor.key)"
  >
    <DraggableResizable
      :x="editor.vimEditorX"
      :y="editor.vimEditorY"
      :width="editor.vimEditorWidth"
      :height="editor.vimEditorHeight"
      :boundary-el="boundaryEl"
      class="file-vim-content"
      :drag-handle="'.drag-handle'"
      :z-index="isActive ? 100 : 10"
      @drag-stop="(args) => onDragStop(args, editor)"
      @resize-stop="(args) => onResizeStop(args, editor)"
    >
      <div class="editor-container">
        <div class="editor-toolbar drag-handle">
          <div class="toolbar-left">
            <a-button
              class="toolbar-btn save-btn"
              :loading="editor.loading"
              @click="handleSave(editor.key, false)"
            >
              <span class="btn-icon"><SaveOutlined /></span>
              <span>{{ t('common.save') }}</span>
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
              :title="t('common.fullscreen')"
              @click="fullScreenVimEditor()"
            >
              <a-button class="toolbar-btn op-btn">
                <span class="btn-icon"><FullscreenOutlined :style="{ fontSize: '18px' }" /></span>
              </a-button>
            </a-tooltip>

            <a-tooltip
              v-if="showVimFullScreenExitEditor"
              :title="t('common.exitFullscreen')"
              @click="exitFullScreenVimEditor()"
            >
              <a-button class="toolbar-btn op-btn">
                <span class="btn-icon"><FullscreenExitOutlined :style="{ fontSize: '18px' }" /></span>
              </a-button>
            </a-tooltip>

            <a-tooltip :title="t('common.close')">
              <a-button
                class="toolbar-btn op-btn"
                @click="closeVimEditor(editor.key)"
              >
                <span class="btn-icon"><CloseOutlined :style="{ fontSize: '18px' }" /></span>
              </a-button>
            </a-tooltip>
          </div>
        </div>
        <EditorCode
          v-model="editor.vimText"
          :language="editor.contentType"
          :theme="currentTheme"
          @update:model-value="(newValue) => handleTextChange(editor, newValue)"
        />
      </div>
    </DraggableResizable>
  </div>
</template>

<script setup lang="ts">
import EditorCode from './monacoEditor.vue'
import DraggableResizable from './dragResize.vue'
import { FullscreenOutlined, FullscreenExitOutlined, CloseOutlined, SaveOutlined } from '@ant-design/icons-vue'
import { useI18n } from 'vue-i18n'
import { PropType, shallowRef, onBeforeUnmount, watch, computed } from 'vue'
import { getMonacoTheme } from '@/utils/themeUtils'

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
  terminalId: string
  editorType: string
  userResized?: boolean
}
// 定义属性
const props = defineProps({
  editor: {
    type: Object as PropType<editorData>,
    default: () => ({})
  },
  isActive: {
    type: Boolean,
    default: false
  },
  boundaryEl: {
    type: HTMLElement,
    default: null
  }
})

const handleKeydown = (e: KeyboardEvent) => {
  const isSaveShortcut = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's'
  if (isSaveShortcut) {
    e.preventDefault()
    // 调用保存方法
    handleSave(editor.key, false)
  }
}

watch(
  () => props.isActive,
  (val) => {
    if (val) {
      window.addEventListener('keydown', handleKeydown)
    } else {
      window.removeEventListener('keydown', handleKeydown)
    }
  },
  { immediate: true }
)

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeydown)
})
const { t } = useI18n()
const editor = props.editor
const emit = defineEmits(['handleSave', 'closeVimEditor', 'focusEditor'])

const handleSave = (key, needClose) => {
  emit('handleSave', {
    key: key,
    needClose: needClose,
    editorType: props.editor.editorType
  })
}
const closeVimEditor = (key) => {
  emit('closeVimEditor', { key: key, editorType: props.editor.editorType })
}

const showVimFullScreenEditor = shallowRef(true)
const showVimFullScreenExitEditor = shallowRef(false)

// 根据当前主题设置编辑器主题
const currentTheme = computed(() => {
  return getMonacoTheme()
})

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
  editor.vimEditorX = Math.round(window.innerWidth * 0.5) - Math.round(window.innerWidth * 0.85 * 0.5)
  editor.vimEditorY = Math.round(window.innerHeight * 0.5) - Math.round(window.innerHeight * 0.85 * 0.5)
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

function onDragStop(args: { x: number; y: number }, editor: editorData) {
  editor.vimEditorX = args.x
  editor.vimEditorY = args.y
}

function onResizeStop(args: { x: number; y: number; width: number; height: number }, editor: editorData) {
  editor.vimEditorX = args.x
  editor.vimEditorY = args.y
  editor.vimEditorWidth = args.width
  editor.vimEditorHeight = args.height
  editor.userResized = true
}
const editorFilter = (action) => {
  if (action === 'editor') {
    return t('common.editFile')
  } else {
    return t('common.newFile')
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
  background-color: var(--bg-color-vim-editor);
}

.editor-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  height: 40px;
  min-height: 40px;
  padding: 0 10px;
  background-color: var(--bg-color-vim-editor);
  border-bottom: 1px solid var(--border-color-light);
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
  font-size: 14px;
  color: var(--text-color-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
}

.toolbar-btn {
  display: flex;
  align-items: center;
  padding: 4px 12px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
  transition: background-color 0.2s;
  margin-right: 4px;
}

.save-btn {
  background-color: #1890ff;
  color: white;
}

.save-btn:hover {
  background-color: #40a9ff;
  color: white;
}

.op-btn {
  color: gray;
}
.op-btn:hover {
  color: var(--text-color-secondary);
}

.op-btn {
  background-color: transparent;
  color: var(--text-color-secondary-light);
}

.btn-icon {
  margin-right: 6px;
  font-size: 14px;
}

.file-vim-content {
  background: var(--bg-color-vim-editor);
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
