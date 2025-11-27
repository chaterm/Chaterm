<template>
  <div class="asset-search-container">
    <div class="search-wrapper">
      <a-input
        v-model:value="searchValue"
        :placeholder="t('common.search')"
        class="search-input"
        @input="handleSearch"
        @change="handleSearch"
      >
        <template #suffix>
          <search-outlined />
        </template>
      </a-input>
      <div class="action-buttons">
        <a-button
          v-if="showNewButton"
          size="small"
          class="action-button"
          @click="handleNewAsset"
        >
          <template #icon>
            <DatabaseOutlined />
          </template>
          {{ t('personal.newHost') }}
        </a-button>
        <a-tooltip
          placement="bottom"
          :mouse-enter-delay="0.5"
        >
          <template #title>
            <div class="import-tooltip">
              <div class="tooltip-title">{{ t('personal.supportedFormats') }}</div>
              <div class="format-item">JSON - Chaterm {{ t('personal.standardFormat') }}</div>
              <div class="format-item">XSH/XTS - XShell {{ t('personal.sessionFiles') }}</div>
              <div class="format-item">INI/XML - SecureCRT {{ t('personal.configFiles') }}</div>
              <div class="format-item">MXTSESSIONS - MobaXterm {{ t('personal.sessionFiles') }}</div>
            </div>
          </template>
          <a-button
            size="small"
            class="action-button"
            @click="handleImport"
          >
            <template #icon>
              <ImportOutlined />
            </template>
            {{ t('personal.import') }}
          </a-button>
        </a-tooltip>

        <a-tooltip :title="t('personal.importHelp')">
          <a-button
            size="small"
            class="action-button help-button"
            @click="showImportHelp"
          >
            <template #icon>
              <QuestionCircleOutlined />
            </template>
          </a-button>
        </a-tooltip>

        <a-button
          size="small"
          class="action-button"
          @click="handleExport"
        >
          <template #icon>
            <ExportOutlined />
          </template>
          {{ t('personal.export') }}
        </a-button>
      </div>
    </div>

    <input
      ref="fileInputRef"
      type="file"
      accept=".json,.csv,.xsh,.xts,.ini,.xml,.mxtsessions"
      style="display: none"
      @change="handleFileSelect"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, watch, h } from 'vue'
import { SearchOutlined, DatabaseOutlined, ImportOutlined, ExportOutlined, QuestionCircleOutlined } from '@ant-design/icons-vue'
import { message, Modal } from 'ant-design-vue'
import i18n from '@/locales'

const { t } = i18n.global

interface Props {
  modelValue?: string
  placeholder?: string
  showNewButton?: boolean
  newButtonText?: string
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: '',
  placeholder: '',
  showNewButton: true,
  newButtonText: ''
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
  search: [value: string]
  'new-asset': []
  'import-assets': [assets: any[]]
  'import-file': [data: { file: File; type: string }]
  'export-assets': []
}>()

const searchValue = ref(props.modelValue)
const fileInputRef = ref<HTMLInputElement>()

watch(
  () => props.modelValue,
  (newValue) => {
    searchValue.value = newValue
  }
)

watch(searchValue, (newValue) => {
  emit('update:modelValue', newValue)
})

const handleSearch = () => {
  emit('search', searchValue.value)
}

const handleNewAsset = () => {
  emit('new-asset')
}

const handleImport = () => {
  fileInputRef.value?.click()
}

const handleExport = () => {
  emit('export-assets')
}

const handleFileSelect = (event: Event) => {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]

  if (!file) return

  const fileName = file.name.toLowerCase()
  const fileExtension = fileName.split('.').pop()

  //Intelligent recognition of file types
  let importType = 'unknown'

  if (fileExtension === 'json') {
    importType = 'json'
  } else if (['xsh', 'xts'].includes(fileExtension || '') || fileName.includes('xshell')) {
    importType = 'xshell'
  } else if (['ini', 'xml'].includes(fileExtension || '') || fileName.includes('securecrt')) {
    importType = 'securecrt'
  } else if (fileExtension === 'mxtsessions' || fileName.includes('mobaxterm')) {
    importType = 'mobaxterm'
  }

  if (importType === 'unknown') {
    message.error(t('personal.unsupportedFileFormat'))
    showSupportedFormatsDialog()
    return
  }

  //Process files
  if (importType === 'json') {
    //Existing JSON processing logic
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string
        const assets = JSON.parse(content)
        if (Array.isArray(assets)) {
          emit('import-assets', assets)
          message.success(t('personal.importSuccess'))
        } else {
          message.error(t('personal.importFormatError'))
        }
      } catch (error) {
        console.error('Import file parsing error:', error)
        message.error(t('personal.importError'))
      }
    }
    reader.readAsText(file)
  } else {
    // //XShell, SecureCRT, and MobaXterm file processing
    emit('import-file', { file, type: importType })
  }

  target.value = ''
}

const showSupportedFormatsDialog = () => {
  Modal.info({
    title: t('personal.unsupportedFileFormat'),
    content: h('div', [
      h('p', t('personal.pleaseSelectSupportedFormat')),
      h('div', { class: 'supported-formats-list' }, [
        h('div', 'JSON - Chaterm ' + t('personal.standardFormat')),
        h('div', 'XSH/XTS - XShell ' + t('personal.sessionFiles')),
        h('div', 'INI/XML - SecureCRT ' + t('personal.configFiles')),
        h('div', 'MXTSESSIONS - MobaXterm ' + t('personal.sessionFiles'))
      ])
    ])
  })
}

const showImportHelp = () => {
  const helpText = `
${t('personal.importFormatGuide')}
${t('personal.importFormatStep1')}
${t('personal.importFormatStep2')}
${t('personal.importFormatStep3')}
   - username: ${t('personal.importFormatUsername')}
   - ip: ${t('personal.importFormatIp')}
   - password: ${t('personal.importFormatPassword')}
   - label: ${t('personal.importFormatLabel')}
   - group_name: ${t('personal.importFormatGroup')}
   - auth_type: ${t('personal.importFormatAuthType')}
   - keyChain: ${t('personal.importFormatKeyChain')}
   - port: ${t('personal.importFormatPort')}
   - asset_type: ${t('personal.importFormatAssetType')}

${t('personal.importFormatExample')}
[
  {
    "username": "root",
    "password": "password123",
    "ip": "192.168.1.100",
    "label": "Web Server",
    "group_name": "production",
    "auth_type": "password",
    "port": 22,
    "asset_type": "person"
  }
]

${t('personal.importFormatThirdPartyNote')}
  `.trim()

  Modal.info({
    title: t('personal.importFormatTitle'),
    content: helpText,
    width: 600,
    okText: t('common.ok'),
    class: 'import-help-modal'
  })
}
</script>

<style lang="less" scoped>
.asset-search-container {
  width: 100%;
  margin-bottom: 16px;
}

.search-wrapper {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
}

.search-input {
  flex: 1;
  min-width: 200px;
  background-color: var(--bg-color-secondary) !important;
  border: 1px solid var(--border-color) !important;

  :deep(.ant-input) {
    background-color: var(--bg-color-secondary) !important;
    color: var(--text-color) !important;

    &::placeholder {
      color: var(--text-color-tertiary) !important;
    }
  }

  :deep(.ant-input-suffix) {
    color: var(--text-color-tertiary) !important;
  }
}

.action-buttons {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.action-button {
  display: flex;
  align-items: center;
  gap: 4px;
  height: 32px;
  padding: 0 12px;
  border-radius: 4px;
  background: var(--bg-color);
  border: 1px solid var(--border-color);
  color: var(--text-color);
  transition: all 0.3s ease;

  &:hover {
    background: var(--hover-bg-color);
    border-color: var(--primary-color);
    color: var(--primary-color);
  }

  &:active {
    background: var(--active-bg-color);
  }

  &.help-button {
    padding: 0 8px;
    min-width: 32px;
  }
}

.import-tooltip {
  max-width: 280px;

  .tooltip-title {
    font-weight: 500;
    margin-bottom: 8px;
    color: #fff;
  }

  .format-item {
    margin-bottom: 4px;
    font-size: 12px;
    line-height: 1.4;
    color: rgba(255, 255, 255, 0.85);
  }
}

.supported-formats-list {
  margin-top: 12px;

  div {
    margin-bottom: 8px;
    padding: 4px 8px;
    background-color: #f5f5f5;
    border-radius: 4px;
    font-size: 13px;
  }
}

:global(.import-help-modal) {
  .ant-modal-body {
    user-select: text;
    -webkit-user-select: text;
    -moz-user-select: text;
    -ms-user-select: text;
    white-space: pre-wrap;
    font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
    font-size: 12px;
    line-height: 1.5;
    max-height: 80vh;
    overflow-y: auto;
    overflow-x: hidden;
  }
}
</style>
