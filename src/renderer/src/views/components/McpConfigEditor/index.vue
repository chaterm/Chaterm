<template>
  <div class="mcp-config-editor">
    <div class="editor-toolbar">
      <div class="toolbar-left">
        <span
          class="editor-title"
          :title="configPath"
          >{{ displayPath }}</span
        >
      </div>
      <div class="toolbar-center"> </div>
    </div>
    <div class="editor-content">
      <MonacoEditor
        v-model="configContent"
        language="json"
        :theme="currentTheme"
        @update:model-value="handleContentChange"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, computed } from 'vue'
import { notification } from 'ant-design-vue'
import { mcpConfigService } from '@/services/mcpService'
import { useI18n } from 'vue-i18n'
import MonacoEditor from '@renderer/views/components/Ssh/editors/monacoEditor.vue'
import { getMonacoTheme } from '@/utils/themeUtils'

const { t } = useI18n()
const configContent = ref('')
const error = ref('')
const isSaving = ref(false)
const lastSaved = ref(false)
const configPath = ref('')
let saveTimer: NodeJS.Timeout | null = null
let statusTimer: NodeJS.Timeout | null = null
let removeFileChangeListener: (() => void) | undefined
let isFormatting = ref(false) // 标记是否正在格式化

// 根据当前主题设置编辑器主题
const currentTheme = computed(() => {
  return getMonacoTheme()
})

// 显示完整的绝对路径
const displayPath = computed(() => {
  return configPath.value || ''
})

// 键盘事件处理：Ctrl+S / Cmd+S 快捷键保存
const handleKeydown = (e: KeyboardEvent) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault() // 阻止浏览器默认保存行为

    if (saveTimer) {
      clearTimeout(saveTimer)
      saveTimer = null
    }

    saveConfig(true)
  }
}

// Load config on mount
onMounted(async () => {
  console.log('Loading MCP config...')
  try {
    // 获取配置文件路径
    configPath.value = await mcpConfigService.getConfigPath()
    // 读取配置内容
    configContent.value = await mcpConfigService.readConfigFile()

    if (window.api && window.api.onMcpConfigFileChanged) {
      removeFileChangeListener = window.api.onMcpConfigFileChanged((newContent: string) => {
        if (newContent !== configContent.value) {
          configContent.value = newContent
          error.value = ''
        }
      })
    }
  } catch (err: unknown) {
    console.error('Failed to load MCP config:', err)
    const errorMessage = err instanceof Error ? err.message : String(err)
    notification.error({
      message: t('mcp.error'),
      description: errorMessage
    })
  }

  window.addEventListener('keydown', handleKeydown)
})

// Clean up timers and listeners on unmount
onBeforeUnmount(() => {
  if (saveTimer) {
    clearTimeout(saveTimer)
  }
  if (statusTimer) {
    clearTimeout(statusTimer)
  }
  if (removeFileChangeListener) {
    removeFileChangeListener()
  }
  window.removeEventListener('keydown', handleKeydown)
})

// Handle content change with auto-save
const handleContentChange = (newValue: string) => {
  if (isFormatting.value) {
    return
  }

  error.value = ''
  lastSaved.value = false

  // Validate JSON
  try {
    JSON.parse(newValue)
    error.value = ''

    // Auto-save after 2 seconds of no typing
    if (saveTimer) {
      clearTimeout(saveTimer)
    }
    saveTimer = setTimeout(() => {
      saveConfig()
    }, 2000)
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    error.value = t('mcp.invalidJson') + ': ' + errorMessage
  }
}

// @param isManualSave - 是否为手动保存（Ctrl+S），手动保存时会格式化 JSON
const saveConfig = async (isManualSave = false) => {
  // Validate JSON before saving
  let parsedJson: Record<string, unknown>
  try {
    parsedJson = JSON.parse(configContent.value)
  } catch (err) {
    return // Don't save invalid JSON
  }

  isSaving.value = true
  try {
    await mcpConfigService.writeConfigFile(configContent.value)
    isSaving.value = false
    lastSaved.value = true

    // 只有手动保存（Ctrl+S）时才格式化 JSON，让用户直观感受到已保存
    // 自动保存不格式化，避免打断用户编辑流程
    if (isManualSave) {
      isFormatting.value = true
      try {
        const formatted = JSON.stringify(parsedJson, null, 2)
        if (formatted !== configContent.value) {
          configContent.value = formatted
        }
      } finally {
        // 确保格式化标志被重置
        setTimeout(() => {
          isFormatting.value = false
        }, 100)
      }
    }

    if (statusTimer) {
      clearTimeout(statusTimer)
    }
    statusTimer = setTimeout(() => {
      lastSaved.value = false
    }, 3000)
  } catch (err: unknown) {
    console.error('Failed to save MCP config:', err)
    isSaving.value = false
    const errorMessage = err instanceof Error ? err.message : String(err)
    notification.error({
      message: t('mcp.saveFailed'),
      description: errorMessage
    })
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
}
</style>
