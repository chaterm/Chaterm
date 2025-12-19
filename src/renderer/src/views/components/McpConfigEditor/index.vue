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
      class="error-bar"
    >
      <span class="error-icon">⚠️</span>
      <span class="error-text">{{ error }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, computed } from 'vue'
import { notification } from 'ant-design-vue'
import { mcpConfigService } from '@/services/mcpService'
import { useI18n } from 'vue-i18n'
import MonacoEditor from '@renderer/views/components/Ssh/editors/monacoEditor.vue'
import { getMonacoTheme, addSystemThemeListener } from '@/utils/themeUtils'

const { t } = useI18n()
const configContent = ref('')
const error = ref('')
const isSaving = ref(false)
const lastSaved = ref(false)
const configPath = ref('')
let saveTimer: NodeJS.Timeout | null = null
let statusTimer: NodeJS.Timeout | null = null
let removeFileChangeListener: (() => void) | undefined
let isFormatting = ref(false) // Flag indicating if formatting is in progress
let removeSystemThemeListener: (() => void) | undefined

// Reactive theme state that will trigger re-renders
const themeState = ref(getMonacoTheme())

// Set editor theme based on current theme
const currentTheme = computed(() => {
  return themeState.value
})

// Display full absolute path
const displayPath = computed(() => {
  return configPath.value || ''
})

// Keyboard event handling: Ctrl+S / Cmd+S shortcut to save
const handleKeydown = (e: KeyboardEvent) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault() // Prevent browser default save behavior

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
    // Get config file path
    configPath.value = await mcpConfigService.getConfigPath()
    // Read config content
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

  // Add theme change listener
  const systemThemeRemover = addSystemThemeListener(() => {
    themeState.value = getMonacoTheme()
  })

  // Listen for document class changes (manual theme switching)
  const observer = new MutationObserver(() => {
    themeState.value = getMonacoTheme()
  })
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class']
  })

  // Store cleanup functions
  removeSystemThemeListener = () => {
    systemThemeRemover()
    observer.disconnect()
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
  if (removeSystemThemeListener) {
    removeSystemThemeListener()
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
    error.value = errorMessage
  }
}

// @param isManualSave - Whether it's manual save (Ctrl+S), manual save will format JSON
const saveConfig = async (isManualSave = false) => {
  // Validate JSON before saving
  let parsedJson: Record<string, unknown>
  try {
    parsedJson = JSON.parse(configContent.value)
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    error.value = errorMessage
    return // Don't save invalid JSON
  }

  isSaving.value = true
  try {
    await mcpConfigService.writeConfigFile(configContent.value)
    isSaving.value = false
    lastSaved.value = true

    // Only format JSON when manually saving (Ctrl+S), so users can visually see it's saved
    // Auto-save doesn't format, to avoid interrupting user editing flow
    if (isManualSave) {
      isFormatting.value = true
      try {
        const formatted = JSON.stringify(parsedJson, null, 2)
        if (formatted !== configContent.value) {
          configContent.value = formatted
        }
      } finally {
        // Ensure formatting flag is reset
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
