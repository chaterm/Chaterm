<template>
  <div class="security-config-editor">
    <div class="editor-toolbar">
      <div class="toolbar-left">
        <span
          class="editor-title"
          :title="configPath"
          >{{ displayPath }}</span
        >
      </div>
      <div class="toolbar-center"></div>
    </div>
    <div class="editor-content">
      <MonacoEditor
        v-if="!isLoading && configContent"
        :key="configPath"
        v-model="configContent"
        language="json"
        :theme="currentTheme"
        @update:model-value="handleContentChange"
      />
      <div
        v-else
        class="editor-loading"
      >
        {{ t('common.loading') || 'Loading...' }}
      </div>
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
import { ref, onMounted, onBeforeUnmount, computed, nextTick } from 'vue'
import { notification } from 'ant-design-vue'
import { securityConfigService } from '@/services/securityConfigService'
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
const isLoading = ref(true)
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
  try {
    isLoading.value = true

    // 获取配置文件路径
    configPath.value = await securityConfigService.getConfigPath()

    // 读取配置内容
    const rawContent = await securityConfigService.readConfigFile()

    // 确保内容不为空
    if (rawContent && rawContent.trim()) {
      configContent.value = rawContent
    } else {
      // 使用默认配置
      configContent.value = JSON.stringify(
        {
          security: {
            enableCommandSecurity: true,
            enableStrictMode: false,
            blacklistPatterns: [],
            whitelistPatterns: ['ls', 'pwd', 'whoami', 'date'],
            dangerousCommands: ['rm', 'format', 'shutdown'],
            maxCommandLength: 10000,
            securityPolicy: {
              blockCritical: true,
              askForMedium: true,
              askForHigh: true,
              askForBlacklist: false
            }
          }
        },
        null,
        2
      )
    }

    // 标记加载完成，允许编辑器渲染
    isLoading.value = false

    // 等待编辑器渲染完成后再设置监听
    await nextTick()

    // 设置文件变更监听
    if (securityConfigService.onFileChanged) {
      removeFileChangeListener = securityConfigService.onFileChanged((newContent: string) => {
        if (newContent !== configContent.value) {
          configContent.value = newContent
          error.value = ''
        }
      })
    }
  } catch (err: unknown) {
    console.error('Failed to load security config:', err)
    const errorMessage = err instanceof Error ? err.message : String(err)
    notification.error({
      message: t('user.error') || 'Error',
      description: errorMessage
    })
    // 即使出错也设置默认内容，让编辑器至少可以显示
    configContent.value = JSON.stringify(
      {
        security: {
          enableCommandSecurity: true,
          enableStrictMode: false,
          blacklistPatterns: [],
          whitelistPatterns: [],
          dangerousCommands: [],
          maxCommandLength: 10000,
          securityPolicy: {
            blockCritical: true,
            askForMedium: true,
            askForHigh: true,
            askForBlacklist: false
          }
        }
      },
      null,
      2
    )

    // 即使出错也标记加载完成
    isLoading.value = false
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
    error.value = t('user.invalidJson', { error: errorMessage }) || `Invalid JSON: ${errorMessage}`
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
    await securityConfigService.writeConfigFile(configContent.value)
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
    console.error('Failed to save security config:', err)
    isSaving.value = false
    const errorMessage = err instanceof Error ? err.message : String(err)
    notification.error({
      message: t('user.saveFailed') || 'Save Failed',
      description: errorMessage
    })
  }
}
</script>

<style scoped lang="less">
.security-config-editor {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 500px;
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
    min-height: 400px;
    display: flex;
    flex-direction: column;

    .editor-loading {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--text-color-secondary);
      font-size: 14px;
    }

    :deep(.monaco-editor-container) {
      height: 100%;
      width: 100%;
      min-height: 400px;
    }

    :deep(.monaco-editor-inner) {
      height: 100%;
      width: 100%;
      min-height: 400px;
    }
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

    /* 适配主题 */
    .theme-dark & {
      background-color: rgba(255, 77, 79, 0.1);
      border-color: rgba(255, 77, 79, 0.3);
      color: #ff7875;
    }
  }
}
</style>
