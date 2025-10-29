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
    <div
      v-if="error"
      class="editor-error"
    >
      <ExclamationCircleOutlined />
      {{ error }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, computed } from 'vue'
import { notification } from 'ant-design-vue'
import { mcpConfigService } from '@/services/mcpService'
import { useI18n } from 'vue-i18n'
import { ExclamationCircleOutlined } from '@ant-design/icons-vue'
import MonacoEditor from '@views/components/Term/Editor/monacoEditor.vue'
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

// 根据当前主题设置编辑器主题
const currentTheme = computed(() => {
  return getMonacoTheme()
})

// 显示完整的绝对路径
const displayPath = computed(() => {
  return configPath.value || ''
})

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
})

// Handle content change with auto-save
const handleContentChange = (newValue: string) => {
  error.value = ''
  lastSaved.value = false

  // Validate JSON
  try {
    JSON.parse(newValue)
    error.value = ''

    // Auto-save after 1 second of no typing
    if (saveTimer) {
      clearTimeout(saveTimer)
    }
    saveTimer = setTimeout(() => {
      saveConfig()
    }, 1000)
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    error.value = t('mcp.invalidJson') + ': ' + errorMessage
  }
}

// Save config (called automatically)
const saveConfig = async () => {
  // Validate JSON before saving
  try {
    JSON.parse(configContent.value)
  } catch (err) {
    return // Don't save invalid JSON
  }

  isSaving.value = true
  try {
    await mcpConfigService.writeConfigFile(configContent.value)
    isSaving.value = false
    lastSaved.value = true

    // 3秒后隐藏保存成功提示
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

  .editor-error {
    margin: 12px 16px;
    padding: 8px 12px;
    background-color: #fff2f0;
    border: 1px solid #ffccc7;
    border-radius: 4px;
    color: #ff4d4f;
    font-size: 12px;
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }
}
</style>
