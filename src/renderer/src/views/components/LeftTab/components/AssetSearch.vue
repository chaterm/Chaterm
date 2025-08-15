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
          <template #icon><DatabaseOutlined /></template>
          {{ t('personal.newHost') }}
        </a-button>
        <a-button
          size="small"
          class="action-button"
          @click="handleImport"
        >
          <template #icon><ImportOutlined /></template>
          {{ t('personal.import') }}
        </a-button>

        <a-tooltip :title="t('personal.importHelp')">
          <a-button
            size="small"
            class="action-button help-button"
            @click="showImportHelp"
          >
            <template #icon><QuestionCircleOutlined /></template>
          </a-button>
        </a-tooltip>

        <a-button
          size="small"
          class="action-button"
          @click="handleExport"
        >
          <template #icon><ExportOutlined /></template>
          {{ t('personal.export') }}
        </a-button>
      </div>
    </div>

    <input
      ref="fileInputRef"
      type="file"
      accept=".json"
      style="display: none"
      @change="handleFileSelect"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
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

  // Clear the file input field to allow selecting the same file again
  target.value = ''
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
    overflow-y: auto;
    overflow-x: hidden;
  }
}
</style>
