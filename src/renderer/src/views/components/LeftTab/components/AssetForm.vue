<template>
  <div class="asset-form-container">
    <div class="form-header">
      <div style="font-size: 14px; font-weight: bold">
        <h3>{{ isEditMode ? t('personal.editHost') : t('personal.newHost') }}</h3>
      </div>
      <ToTopOutlined
        style="font-size: 20px; transform: rotate(90deg); cursor: pointer"
        class="close-icon"
        @click="handleClose"
      />
    </div>

    <div class="form-content">
      <a-form
        :label-col="{ span: 27 }"
        :wrapper-col="{ span: 27 }"
        layout="vertical"
        class="custom-form"
      >
        <!-- 资产类型选择 -->
        <a-form-item v-if="!isEditMode">
          <a-radio-group
            v-model:value="formData.asset_type"
            button-style="solid"
            style="width: 100%"
          >
            <a-radio-button value="person">{{ t('personal.personalAsset') }}</a-radio-button>
            <a-radio-button value="organization">
              <a-tooltip :title="t('personal.organizationTip')">
                {{ t('personal.enterpriseAsset') }}
              </a-tooltip>
            </a-radio-button>
          </a-radio-group>
        </a-form-item>

        <!-- 地址信息 -->
        <div class="form-section">
          <div class="section-title">
            <div class="title-indicator"></div>
            {{ t('personal.address') }}
          </div>

          <a-form-item :label="t('personal.remoteHost')">
            <a-input
              v-model:value="formData.ip"
              :placeholder="t('personal.pleaseInputRemoteHost')"
            />
          </a-form-item>

          <a-form-item :label="t('personal.port')">
            <a-input
              v-model:value="formData.port"
              :min="20"
              :max="65536"
              :placeholder="t('personal.pleaseInputPort')"
              style="width: 100%"
            />
          </a-form-item>
        </div>

        <!-- 认证信息 -->
        <div class="form-section">
          <a-form-item
            v-if="formData.asset_type === 'person'"
            :label="t('personal.verificationMethod')"
          >
            <a-radio-group
              v-model:value="formData.auth_type"
              button-style="solid"
              style="width: 100%"
              @change="handleAuthChange"
            >
              <a-radio-button value="password">{{ t('personal.password') }}</a-radio-button>
              <a-radio-button value="keyBased">{{ t('personal.key') }}</a-radio-button>
            </a-radio-group>
          </a-form-item>

          <a-form-item :label="t('personal.username')">
            <a-input
              v-model:value="formData.username"
              :placeholder="t('personal.pleaseInputUsername')"
            />
          </a-form-item>

          <a-form-item
            v-if="formData.auth_type == 'password'"
            :label="t('personal.password')"
          >
            <a-input-password
              v-model:value="formData.password"
              :placeholder="t('personal.pleaseInputPassword')"
            />
          </a-form-item>

          <template v-if="formData.auth_type === 'keyBased'">
            <a-form-item :label="t('personal.key')">
              <a-select
                v-model:value="formData.keyChain"
                :placeholder="t('personal.pleaseSelectKeychain')"
                style="width: 100%"
                show-search
                :max-tag-count="4"
                :options="keyChainOptions"
                :option-filter-prop="'label'"
                :field-names="{ value: 'key', label: 'label' }"
                :allow-clear="true"
              >
                <template #notFoundContent>
                  <div style="text-align: center; width: 100%">
                    <a-button
                      type="link"
                      @click="handleAddKeychain"
                      >{{ t('keyChain.newKey') }}</a-button
                    >
                  </div>
                </template>
              </a-select>
            </a-form-item>

            <a-form-item
              v-if="formData.asset_type === 'organization'"
              :label="t('personal.password')"
            >
              <a-input-password
                v-model:value="formData.password"
                :placeholder="t('personal.pleaseInputPassword')"
              />
            </a-form-item>
          </template>
        </div>

        <!-- 通用信息 -->
        <div class="form-section">
          <div class="section-title">
            <div class="title-indicator"></div>
            {{ t('personal.general') }}
          </div>

          <a-form-item :label="t('personal.alias')">
            <a-input
              v-model:value="formData.label"
              :placeholder="t('personal.pleaseInputAlias')"
            />
          </a-form-item>

          <a-form-item
            :label="t('personal.group')"
            class="general-group"
          >
            <a-select
              v-model:value="formData.group_name"
              mode="tags"
              :placeholder="t('personal.pleaseSelectGroup')"
              :max-tag-count="2"
              style="width: 100%"
              @change="handleGroupChange"
            >
              <a-select-option
                v-for="item in defaultGroups"
                :key="item"
                :value="item"
              >
                {{ item }}
              </a-select-option>
            </a-select>
          </a-form-item>
        </div>
      </a-form>
    </div>

    <div class="form-footer">
      <a-button
        type="primary"
        class="submit-button"
        @click="handleSubmit"
      >
        {{ isEditMode ? t('personal.saveAsset') : t('personal.createAsset') }}
      </a-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, watch } from 'vue'
import { ToTopOutlined } from '@ant-design/icons-vue'
import { message } from 'ant-design-vue'
import i18n from '@/locales'
import type { AssetFormData, KeyChainItem } from '../types'

const { t } = i18n.global

// Props
interface Props {
  isEditMode?: boolean
  initialData?: Partial<AssetFormData>
  keyChainOptions?: KeyChainItem[]
  defaultGroups?: string[]
}

const props = withDefaults(defineProps<Props>(), {
  isEditMode: false,
  initialData: () => ({}),
  keyChainOptions: () => [],
  defaultGroups: () => ['development', 'production', 'staging', 'testing', 'database']
})

// Emits
const emit = defineEmits<{
  close: []
  submit: [data: AssetFormData]
  'add-keychain': []
  'auth-change': [authType: string]
}>()

// State
const formData = reactive<AssetFormData>({
  username: '',
  password: '',
  ip: '',
  label: '',
  group_name: 'Hosts', // 使用默认值，避免在reactive中使用t()
  auth_type: 'password',
  keyChain: undefined,
  port: 22,
  asset_type: 'person',
  ...props.initialData
})

// 在组件挂载后设置默认组名
watch(
  () => props.initialData,
  (newData) => {
    if (!newData?.group_name) {
      formData.group_name = t('personal.defaultGroup')
    }
  },
  { immediate: true }
)

// Watch for asset type changes
watch(
  () => formData.asset_type,
  (newAssetType) => {
    if (newAssetType === 'organization') {
      formData.auth_type = 'keyBased'
    } else {
      formData.auth_type = 'password'
    }
  }
)

// Watch for edit mode and asset type
watch(
  [() => props.isEditMode, () => formData.asset_type],
  ([editing, assetType]) => {
    if (editing && assetType === 'organization') {
      formData.auth_type = 'keyBased'
    }
  },
  { immediate: true }
)

// Methods
const handleClose = () => {
  emit('close')
}

const handleAuthChange = () => {
  if (formData.auth_type === 'keyBased') {
    emit('auth-change', 'keyBased')
  }
  if (formData.auth_type === 'password') {
    formData.keyChain = undefined
  } else {
    formData.password = ''
  }
}

const handleAddKeychain = () => {
  emit('add-keychain')
}

const handleGroupChange = (val: any) => {
  if (Array.isArray(val) && val.length > 0) {
    formData.group_name = String(val[val.length - 1])
  } else if (typeof val === 'string') {
    formData.group_name = val
  } else {
    formData.group_name = ''
  }
}

const validateForm = (): boolean => {
  // 企业资产校验
  if (formData.asset_type === 'organization') {
    if (!formData.ip || !formData.ip.trim()) {
      message.error(t('personal.validationRemoteHostRequired'))
      return false
    }
    if (!formData.port || formData.port <= 0) {
      message.error(t('personal.validationPortRequired'))
      return false
    }
    if (!formData.username || !formData.username.trim()) {
      message.error(t('personal.validationUsernameRequired'))
      return false
    }
    if (formData.auth_type === 'keyBased' && !formData.keyChain) {
      message.error(t('personal.validationKeychainRequired'))
      return false
    }
  }
  return true
}

const handleSubmit = () => {
  if (!validateForm()) return
  emit('submit', { ...formData })
}

// Reset form data when initialData changes
watch(
  () => props.initialData,
  (newData) => {
    const defaultGroupName = t('personal.defaultGroup')
    Object.assign(formData, {
      username: '',
      password: '',
      ip: '',
      label: '',
      group_name: defaultGroupName,
      auth_type: 'password',
      keyChain: undefined,
      port: 22,
      asset_type: 'person',
      ...newData
    })
  },
  { deep: true }
)
</script>

<style lang="less" scoped>
.asset-form-container {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--bg-color);
}

.form-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px 0 16px;
  flex-shrink: 0;
}

.close-icon {
  &:hover {
    color: #52c41a;
    transition: color 0.3s;
  }
}

.form-content {
  flex: 1;
  padding: 12px 16px 0 16px;
  overflow: auto;
  color: var(--text-color);
}

.form-footer {
  padding: 12px 16px;
  flex-shrink: 0;
}

.submit-button {
  width: 100%;
  height: 36px;
  border-radius: 4px;
  background-color: #1890ff;
  border-color: #1890ff;

  &:hover {
    background-color: #40a9ff;
    border-color: #40a9ff;
  }
}

.form-section {
  margin-bottom: 16px;
}

.section-title {
  display: flex;
  align-items: center;
  margin-bottom: 12px;
  font-weight: 500;
  color: var(--text-color);
}

.title-indicator {
  width: 2px;
  height: 12px;
  background: #1677ff;
  margin-right: 4px;
}

.custom-form {
  color: var(--text-color);

  :deep(.ant-form-item) {
    margin-bottom: 12px;
  }

  :deep(.ant-form-item-label) {
    min-width: 250px;
    padding-bottom: 4px;

    > label {
      color: var(--text-color);
    }
  }
}

:deep(.ant-form-item) {
  color: var(--text-color-secondary);
}

:global(.light-theme) {
  .custom-form {
    :deep(.ant-form-item-label > label) {
      color: rgba(0, 0, 0, 0.85) !important;
    }
  }
}

.custom-form :deep(.ant-input),
.custom-form :deep(.ant-input-password),
.custom-form :deep(.ant-select-selector),
.custom-form :deep(.ant-input-number-input) {
  color: var(--text-color);
  background-color: var(--bg-color) !important;
  border-color: var(--border-color) !important;

  &::placeholder {
    color: var(--text-color-tertiary);
  }
}

.custom-form :deep(.ant-select-selection-placeholder) {
  color: var(--text-color-tertiary);
}

.custom-form :deep(.ant-radio-button-wrapper) {
  background: var(--bg-color) !important;
  color: var(--text-color);

  .ant-radio-button-checked {
    border: #1677ff;
  }
}

.custom-form :deep(.ant-radio-button-wrapper-checked) {
  color: #1677ff;
}

.custom-form :deep(.ant-select-selector),
.custom-form :deep(.anticon.ant-input-password-icon),
.custom-form :deep(.ant-select-arrow) {
  color: var(--text-color);
}

.general-group :deep(.ant-select-selection-item) {
  background-color: var(--hover-bg-color);
}
</style>
