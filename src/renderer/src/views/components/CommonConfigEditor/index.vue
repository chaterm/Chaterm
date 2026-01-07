<template>
  <div class="mcp-config-editor">
    <div class="editor-toolbar">
      <div class="toolbar-left">
        <span
          class="editor-title"
          :title="filePath"
          >{{ displayPath }}</span
        >
      </div>
    </div>
    <div class="editor-content">
      <MonacoEditor
        v-model="configContent"
        language="json"
        :theme="currentTheme"
        @update:model-value="handleContentChange"
      />
    </div>
    <div
      v-if="error"
      class="error-bar"
    >
      <span class="error-text">{{ error }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, computed } from 'vue'
import { notification } from 'ant-design-vue'
import MonacoEditor from '@renderer/views/components/Ssh/editors/monacoEditor.vue'
import { getMonacoTheme, addSystemThemeListener } from '@/utils/themeUtils'

interface Props {
  filePath: string
  pluginId?: string
  initialContent?: string
}
const props = defineProps<Props>()

const configContent = ref('')
const error = ref('')
const isSaving = ref(false)
const lastSaved = ref(false)
const isFormatting = ref(false)

let saveTimer: NodeJS.Timeout | null = null
let statusTimer: NodeJS.Timeout | null = null
let removeSystemThemeListener: (() => void) | undefined

const themeState = ref(getMonacoTheme())
const currentTheme = computed(() => themeState.value)
const displayPath = computed(() => props.filePath || '')

const handleKeydown = (e: KeyboardEvent) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault()
    if (saveTimer) {
      clearTimeout(saveTimer)
      saveTimer = null
    }
    saveConfig(true)
  }
}

onMounted(async () => {
  try {
    if (props.initialContent) {
      configContent.value = props.initialContent
    } else if (props.filePath) {
      configContent.value = await (window as any).api.readFile(props.filePath)
    }
  } catch (err: any) {
    notification.error({ message: 'Load Failed', description: err.message })
  }

  const systemThemeRemover = addSystemThemeListener(() => {
    themeState.value = getMonacoTheme()
  })
  const observer = new MutationObserver(() => {
    themeState.value = getMonacoTheme()
  })
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
  removeSystemThemeListener = () => {
    systemThemeRemover()
    observer.disconnect()
  }

  window.addEventListener('keydown', handleKeydown)
})

onBeforeUnmount(() => {
  if (saveTimer) clearTimeout(saveTimer)
  if (statusTimer) clearTimeout(statusTimer)
  if (removeSystemThemeListener) removeSystemThemeListener()
  window.removeEventListener('keydown', handleKeydown)
})

const handleContentChange = (newValue: string) => {
  if (isFormatting.value) return
  error.value = ''
  lastSaved.value = false
  try {
    JSON.parse(newValue)
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => saveConfig(), 2000)
  } catch (err: any) {
    error.value = err.message
  }
}

const saveConfig = async (isManualSave = false) => {
  let parsedJson: any
  try {
    parsedJson = JSON.parse(configContent.value)
  } catch (err: any) {
    error.value = err.message
    return
  }

  isSaving.value = true
  try {
    await (window as any).api.writeFile(props.filePath, configContent.value)

    isSaving.value = false
    lastSaved.value = true

    if (isManualSave) {
      isFormatting.value = true
      configContent.value = JSON.stringify(parsedJson, null, 2)
      setTimeout(() => {
        isFormatting.value = false
      }, 100)
    }

    if (props.pluginId) {
      ;(window as any).api.executeCommand(`${props.pluginId}.refreshExplorer`)
    }

    if (statusTimer) clearTimeout(statusTimer)
    statusTimer = setTimeout(() => {
      lastSaved.value = false
    }, 3000)
  } catch (err: any) {
    isSaving.value = false
    notification.error({ message: 'Save Failed', description: err.message })
  }
}
</script>

<style scoped lang="less">
.mcp-config-editor {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  overflow: hidden;
  background-color: var(--bg-color-vim-editor);

  .editor-toolbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    height: 32px;
    min-height: 32px;
    padding: 0 12px;
    background-color: var(--bg-color-vim-editor);
    border-bottom: 1px solid var(--border-color-light);
    transition: all 0.3s ease;

    .toolbar-left {
      display: flex;
      align-items: center;
      flex-shrink: 0;
      flex: 1;
      overflow: hidden;

      .editor-title {
        cursor: default;
        font-size: 11px;
        font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', 'Consolas', monospace;
        color: var(--text-color-secondary);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        max-width: 100%;
        line-height: 1.2;
      }
    }

    .toolbar-center {
      flex: 0;
      display: flex;
      justify-content: center;
      overflow: hidden;
      margin: 0 10px;
      transition: opacity 0.3s ease;
    }
  }

  .editor-content {
    flex: 1;
    overflow: hidden;
    position: relative;
  }

  .error-bar {
    display: flex;
    align-items: center;
    padding: 8px 12px;
    background-color: var(--error-bg, #fef2f2);
    border-top: 1px solid var(--error-border, #fecaca);
    color: var(--error-text, #dc2626);
    font-size: 12px;
    font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', 'Consolas', monospace;
    min-height: 32px;
    max-height: 80px;
    overflow-y: auto;

    .error-icon {
      margin-right: 8px;
      flex-shrink: 0;
    }

    .error-text {
      flex: 1;
      line-height: 1.4;
      word-break: break-all;
    }
  }
}
</style>
