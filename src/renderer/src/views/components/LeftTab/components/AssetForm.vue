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
        <!-- Asset type selection -->
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

        <!-- Address information -->
        <div class="form-section">
          <div class="section-title">
            <div class="title-indicator"></div>
            {{ t('personal.address') }}
          </div>

          <a-form-item
            :label="t('personal.remoteHost')"
            :validate-status="validationErrors.ip ? 'error' : ''"
            :help="validationErrors.ip"
          >
            <a-input
              v-model:value="formData.ip"
              :placeholder="t('personal.pleaseInputRemoteHost')"
              :class="{ 'error-input': validationErrors.ip }"
              @input="handleIpInput"
            />
          </a-form-item>

          <a-form-item
            :label="t('personal.port')"
            :validate-status="validationErrors.port ? 'error' : ''"
            :help="validationErrors.port"
          >
            <a-input
              v-model:value="formData.port"
              :min="20"
              :max="65536"
              :placeholder="t('personal.pleaseInputPort')"
              :class="{ 'error-input': validationErrors.port }"
              style="width: 100%"
              @input="handlePortInput"
            />
          </a-form-item>
        </div>

        <!-- Authentication information -->
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

          <a-form-item
            :label="t('personal.username')"
            :validate-status="validationErrors.username ? 'error' : ''"
            :help="validationErrors.username"
          >
            <a-input
              v-model:value="formData.username"
              :placeholder="t('personal.pleaseInputUsername')"
              :class="{ 'error-input': validationErrors.username }"
              @input="handleUsernameInput"
            />
          </a-form-item>

          <a-form-item
            v-if="formData.auth_type == 'password'"
            :label="t('personal.password')"
            :validate-status="validationErrors.password ? 'error' : ''"
            :help="validationErrors.password"
          >
            <a-input-password
              v-model:value="formData.password"
              :placeholder="t('personal.pleaseInputPassword')"
              :class="{ 'error-input': validationErrors.password }"
              @input="handlePasswordInput"
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
              :validate-status="validationErrors.password ? 'error' : ''"
              :help="validationErrors.password"
            >
              <a-input-password
                v-model:value="formData.password"
                :placeholder="t('personal.pleaseInputPassword')"
                :class="{ 'error-input': validationErrors.password }"
                @input="handlePasswordInput"
              />
            </a-form-item>
          </template>

          <div>
            <a-form-item
              :label="t('personal.proxyConfig')"
              class="user_my-ant-form-item"
            >
              <a-switch
                :checked="formData.needProxy"
                class="user_my-ant-form-item-content"
                @change="handleSshProxyStatusChange"
              />
            </a-form-item>

            <a-form-item
              v-if="formData.needProxy"
              :label="t('personal.pleaseSelectSshProxy')"
            >
              <a-select
                v-model:value="formData.proxyName"
                :placeholder="t('personal.pleaseSelectSshProxy')"
                style="width: 100%"
                show-search
                :max-tag-count="4"
                :options="sshProxyConfigs"
                :option-filter-prop="'label'"
                :field-names="{ value: 'key', label: 'label' }"
                :allow-clear="true"
              >
              </a-select>
            </a-form-item>
          </div>
        </div>

        <!-- General information -->
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
import { SshProxyConfigItem } from '../types'

const { t } = i18n.global

// Props
interface Props {
  isEditMode?: boolean
  initialData?: Partial<AssetFormData>
  keyChainOptions?: KeyChainItem[]
  sshProxyConfigs?: SshProxyConfigItem[]
  defaultGroups?: string[]
}

const props = withDefaults(defineProps<Props>(), {
  isEditMode: false,
  initialData: () => ({}),
  keyChainOptions: () => [],
  sshProxyConfigs: () => [],
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
  group_name: 'Hosts', // Use default value to avoid using t() in reactive
  auth_type: 'password',
  keyChain: undefined,
  port: 22,
  asset_type: 'person',
  needProxy: false,
  proxyName: '',
  ...props.initialData
})

// Validation errors state
const validationErrors = reactive({
  ip: '',
  port: '',
  username: '',
  password: ''
})

// Set default group name after component mount
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
  } else if (typeof val === 'number') {
    formData.group_name = String(val)
  } else {
    formData.group_name = ''
  }
}

// Check if input contains spaces
const hasSpaces = (value: string): boolean => {
  return Boolean(value && value.includes(' '))
}

// Validate field for spaces
const validateField = (field: keyof typeof validationErrors, value: string) => {
  if (hasSpaces(value)) {
    switch (field) {
      case 'ip':
        validationErrors.ip = t('personal.validationIpNoSpaces')
        break
      case 'port':
        validationErrors.port = t('personal.validationPortNoSpaces')
        break
      case 'username':
        validationErrors.username = t('personal.validationUsernameNoSpaces')
        break
      case 'password':
        validationErrors.password = t('personal.validationPasswordNoSpaces')
        break
    }
  } else {
    validationErrors[field] = ''
  }
}

const validateForm = (): boolean => {
  // Enterprise asset validation
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

  // Space validation
  validateField('ip', formData.ip)
  validateField('port', String(formData.port))
  validateField('username', formData.username)
  validateField('password', formData.password)

  // Check if any validation errors exist
  if (Object.values(validationErrors).some((error) => error !== '')) {
    return false
  }

  return true
}

const handleSubmit = () => {
  if (!validateForm()) return
  emit('submit', { ...formData })
}

const handleSshProxyStatusChange = async (checked) => {
  formData.needProxy = checked
}

// Input handler functions - real-time space detection
const handleIpInput = (event: Event) => {
  const target = event.target as HTMLInputElement
  const value = target.value
  validateField('ip', value)
}

const handlePortInput = (event: Event) => {
  const target = event.target as HTMLInputElement
  const value = target.value
  validateField('port', value)
}

const handleUsernameInput = (event: Event) => {
  const target = event.target as HTMLInputElement
  const value = target.value
  validateField('username', value)
}

const handlePasswordInput = (event: Event) => {
  const target = event.target as HTMLInputElement
  const value = target.value
  validateField('password', value)
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
      needProxy: false,
      proxyName: '',
      ...newData
    })
    // Reset validation errors
    Object.assign(validationErrors, {
      ip: '',
      port: '',
      username: '',
      password: ''
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
  scrollbar-width: thin;
  scrollbar-color: var(--border-color-light) transparent;
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

/* Error input styles */
.error-input {
  border-color: #ff4d4f !important;
  box-shadow: 0 0 0 2px rgba(255, 77, 79, 0.2) !important;
}

.error-input:focus {
  border-color: #ff4d4f !important;
  box-shadow: 0 0 0 2px rgba(255, 77, 79, 0.2) !important;
}

.error-input:hover {
  border-color: #ff4d4f !important;
}

/* Special handling for password input fields */
:deep(.ant-input-password.error-input .ant-input) {
  border-color: #ff4d4f !important;
  box-shadow: 0 0 0 2px rgba(255, 77, 79, 0.2) !important;
}

:deep(.ant-input-password.error-input .ant-input:focus) {
  border-color: #ff4d4f !important;
  box-shadow: 0 0 0 2px rgba(255, 77, 79, 0.2) !important;
}

:deep(.ant-input-password.error-input .ant-input:hover) {
  border-color: #ff4d4f !important;
}
</style>
