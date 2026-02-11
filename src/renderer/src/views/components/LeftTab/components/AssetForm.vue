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
        <!-- Device category selection (Cascader) -->
        <a-form-item
          v-if="!isEditMode"
          :label="t('personal.deviceCategory')"
        >
          <a-cascader
            v-model:value="deviceTypePath"
            :options="deviceOptions"
            :placeholder="t('personal.selectDeviceType')"
            style="width: 100%"
            :allow-clear="false"
            @change="handleDeviceTypeChange"
          />
        </a-form-item>

        <!-- Bastion host selection (dynamic based on available definitions) -->
        <a-form-item
          v-if="!isEditMode && deviceTypePath[0] === 'server' && deviceTypePath[1] === 'bastion' && hasPluginBastions"
          :label="t('personal.bastionType')"
        >
          <a-select
            v-model:value="bastionType"
            style="width: 100%"
            :options="bastionTypeOptions"
            @change="handleBastionTypeChange"
          />
        </a-form-item>

        <!-- Switch brand selection (only when device is switch) -->
        <a-form-item v-if="!isEditMode && deviceTypePath[0] === 'network' && deviceTypePath[1] === 'switch'">
          <a-radio-group
            v-model:value="switchBrand"
            button-style="solid"
            style="width: 100%"
            @change="handleSwitchBrandChange"
          >
            <a-radio-button value="cisco">{{ t('personal.switchCisco') }}</a-radio-button>
            <a-radio-button value="huawei">{{ t('personal.switchHuawei') }}</a-radio-button>
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
            v-if="showAuthMethodSelector"
            :label="t('personal.verificationMethod')"
          >
            <a-radio-group
              v-model:value="formData.auth_type"
              button-style="solid"
              style="width: 100%"
              @change="handleAuthChange"
            >
              <a-radio-button
                v-if="currentBastionSupportsPassword"
                value="password"
                >{{ t('personal.password') }}</a-radio-button
              >
              <a-radio-button
                v-if="currentBastionSupportsKey"
                value="keyBased"
                >{{ t('personal.key') }}</a-radio-button
              >
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
              v-if="isOrganizationAsset(formData.asset_type)"
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
                v-if="sshProxyConfigs && sshProxyConfigs.length > 0"
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
              <div
                v-else
                style="
                  width: 100%;
                  padding: 12px;
                  border: 1px solid var(--border-color);
                  border-radius: 4px;
                  text-align: center;
                  background-color: var(--bg-color);
                "
              >
                <div style="margin-bottom: 8px; color: var(--text-color-secondary)">
                  {{ t('personal.noProxyConfigFound') }}
                </div>
                <a-button
                  type="link"
                  size="small"
                  @click="handleAddProxyConfig"
                  >{{ t('personal.goToProxyConfig') }}</a-button
                >
              </div>
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
import { reactive, watch, ref, computed, onMounted } from 'vue'
import { ToTopOutlined } from '@ant-design/icons-vue'
import { message } from 'ant-design-vue'
import i18n from '@/locales'
import eventBus from '@/utils/eventBus'
import type { AssetFormData, KeyChainItem, SshProxyConfigItem, AssetType, BastionDefinitionSummary } from '../utils/types'
import { getSwitchBrand, isOrganizationAsset, getBastionHostType, getAssetTypeFromBastionType, resolveBastionAuthType } from '../utils/types'

const { t } = i18n.global
const logger = createRendererLogger('config.assetForm')

// Available bastion definitions from plugins
const availableBastions = ref<BastionDefinitionSummary[]>([])
const hasPluginBastions = computed(() => availableBastions.value.length > 0)

// Load available bastion definitions from capability registry
const loadBastionDefinitions = async () => {
  try {
    const definitions = await window.api.getBastionDefinitions()
    availableBastions.value = definitions || []
    logger.info('Loaded bastion definitions', {
      types: availableBastions.value.map((d) => d.type)
    })
  } catch (error) {
    logger.warn('Failed to load bastion definitions', { error: error instanceof Error ? error.message : String(error) })
    availableBastions.value = []
  }
}

// Get display name for bastion type (using i18n key from definition)
const getBastionDisplayName = (bastion: BastionDefinitionSummary): string => {
  // Try to use the displayNameKey for i18n lookup
  const i18nKey = bastion.displayNameKey
  if (!i18nKey) return bastion.type
  const translated = t(i18nKey)
  // If translation not found (returns the key itself), use type as fallback
  return translated !== i18nKey ? translated : bastion.type
}

// Check if a specific bastion type supports an auth method
const bastionSupportsAuth = (bastionType: string, authMethod: 'password' | 'keyBased'): boolean => {
  if (bastionType === 'jumpserver') {
    // JumpServer only supports keyBased
    return authMethod === 'keyBased'
  }
  const definition = availableBastions.value.find((d) => d.type === bastionType)
  if (!definition) return authMethod === 'password' // Default to password if not found
  return definition.authPolicy.includes(authMethod)
}

const bastionTypeOptions = computed(() => {
  const options = [{ label: 'JumpServer', value: 'jumpserver' }]

  if (availableBastions.value && availableBastions.value.length > 0) {
    availableBastions.value.forEach((bastion) => {
      options.push({
        label: getBastionDisplayName(bastion),
        value: bastion.type
      })
    })
  }

  return options
})

// Check on mount
onMounted(() => {
  loadBastionDefinitions()
})

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

const emit = defineEmits<{
  close: []
  submit: [data: AssetFormData]
  'add-keychain': []
  'auth-change': [authType: string]
}>()

// Device type path for Cascader: ['server'] or ['network', 'switch']
const deviceTypePath = ref<string[]>([])

const deviceOptions = computed(() => [
  {
    value: 'server',
    label: t('personal.deviceServer'),
    children: [
      { value: 'personal', label: t('personal.personalAsset') },
      { value: 'bastion', label: t('personal.bastionHost') }
    ]
  },
  {
    value: 'network',
    label: t('personal.deviceNetwork'),
    children: [{ value: 'switch', label: t('personal.deviceSwitch') }]
  }
])

// Initialize deviceTypePath based on initialData
const initDeviceTypePath = () => {
  if (props.initialData?.asset_type?.startsWith('person-switch-')) {
    deviceTypePath.value = ['network', 'switch']
  } else if (isOrganizationAsset(props.initialData?.asset_type)) {
    deviceTypePath.value = ['server', 'bastion']
  } else {
    deviceTypePath.value = ['server', 'personal']
  }
}

// Call initialization
initDeviceTypePath()

// Bastion host type: 'jumpserver' or plugin type (e.g., 'qizhi', 'tencent')
const bastionType = ref<string>(getBastionHostType(props.initialData?.asset_type) || 'jumpserver')

// Switch brand: 'cisco' or 'huawei'
const switchBrand = ref<'cisco' | 'huawei'>(getSwitchBrand(props.initialData?.asset_type) || 'cisco')

const applyBastionType = () => {
  formData.asset_type = getAssetTypeFromBastionType(bastionType.value)
}

// Computed properties for dynamic auth method display
const currentBastionSupportsPassword = computed(() => {
  if (!isOrganizationAsset(formData.asset_type)) return true // Personal assets always support password
  return bastionSupportsAuth(bastionType.value, 'password')
})

const currentBastionSupportsKey = computed(() => {
  if (!isOrganizationAsset(formData.asset_type)) return true // Personal assets always support key
  return bastionSupportsAuth(bastionType.value, 'keyBased')
})

// Show auth method selector: for personal assets, switches, or bastions with multiple auth options
const showAuthMethodSelector = computed(() => {
  const assetType = formData.asset_type
  // Personal server or switch - show selector
  if (assetType === 'person' || assetType?.startsWith('person-switch-')) return true
  // Organization asset - show selector only if both auth methods are supported
  if (isOrganizationAsset(assetType)) {
    return currentBastionSupportsPassword.value && currentBastionSupportsKey.value
  }
  return false
})

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

const cachedAuth = reactive<{ password: string; keyChain?: number }>({
  password: '',
  keyChain: undefined
})

const validationErrors = reactive({
  ip: '',
  port: '',
  username: '',
  password: ''
})

watch(
  () => props.initialData,
  (newData) => {
    if (!newData?.group_name) {
      formData.group_name = t('personal.defaultGroup')
    }
  },
  { immediate: true }
)

const syncAuthType = () => {
  const resolved = resolveBastionAuthType(formData.asset_type, availableBastions.value, formData.auth_type)
  if (resolved !== formData.auth_type) {
    formData.auth_type = resolved
  }
}

watch([() => formData.asset_type, () => availableBastions.value], syncAuthType, { immediate: true })

watch(
  [() => props.isEditMode, () => formData.asset_type],
  ([editing, assetType]) => {
    // In edit mode, JumpServer bastion host forces keyBased, Qizhi bastion host keeps current auth type
    if (editing && assetType === 'organization') {
      formData.auth_type = 'keyBased'
    }
  },
  { immediate: true }
)

// Handle device type change from Cascader
const handleDeviceTypeChange = (val: string[]) => {
  if (!val || val.length === 0) return

  if (val[0] === 'server') {
    if (val[1] === 'personal') {
      // Personal server
      formData.asset_type = 'person'
      formData.auth_type = 'password'
    } else if (val[1] === 'bastion') {
      // Bastion host
      applyBastionType()
    }
  } else if (val[0] === 'network' && val[1] === 'switch') {
    // Switching to network switch
    formData.asset_type = `person-switch-${switchBrand.value}` as AssetType
    formData.auth_type = 'password'
  }
}

// Handle bastion host type change (jumpserver/qizhi)
const handleBastionTypeChange = () => {
  if (deviceTypePath.value[0] === 'server' && deviceTypePath.value[1] === 'bastion') {
    applyBastionType()
  }
}

// Handle switch brand change (cisco/huawei)
const handleSwitchBrandChange = () => {
  if (deviceTypePath.value[0] === 'network' && deviceTypePath.value[1] === 'switch') {
    formData.asset_type = `person-switch-${switchBrand.value}` as AssetType
  }
}

const handleClose = () => {
  emit('close')
}

const handleAuthChange = () => {
  if (formData.auth_type === 'keyBased') {
    cachedAuth.password = formData.password
    emit('auth-change', 'keyBased')
  }
  if (formData.auth_type === 'password') {
    cachedAuth.keyChain = formData.keyChain
    formData.keyChain = undefined
  } else {
    formData.password = ''
  }
  if (formData.auth_type === 'keyBased' && cachedAuth.keyChain !== undefined) {
    formData.keyChain = cachedAuth.keyChain
  }
  if (formData.auth_type === 'password') {
    formData.password = cachedAuth.password
  }
}

const handleAddKeychain = () => {
  emit('add-keychain')
}

const handleGroupChange = (val: any) => {
  if (Array.isArray(val) && val.length > 0) {
    formData.group_name = String(val[val.length - 1])
  } else if (typeof val === 'string' && val.trim()) {
    formData.group_name = val
  } else if (typeof val === 'number') {
    formData.group_name = String(val)
  } else {
    formData.group_name = ''
  }
}

const hasSpaces = (value: string): boolean => {
  return Boolean(value && value.includes(' '))
}

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
  if (isOrganizationAsset(formData.asset_type)) {
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
    // JumpServer bastion host requires keychain for keyBased auth
    if (formData.asset_type === 'organization' && formData.auth_type === 'keyBased' && !formData.keyChain) {
      message.error(t('personal.validationKeychainRequired'))
      return false
    }
    // Plugin-based bastion hosts: validate based on selected auth type
    if (formData.asset_type !== 'organization' && isOrganizationAsset(formData.asset_type)) {
      if (formData.auth_type === 'keyBased' && !formData.keyChain) {
        message.error(t('personal.validationKeychainRequired'))
        return false
      }
      if (formData.auth_type === 'password' && !formData.password) {
        message.error(t('personal.validationPasswordRequired'))
        return false
      }
    }
  }

  validateField('ip', formData.ip)
  validateField('port', String(formData.port))
  validateField('username', formData.username)
  validateField('password', formData.password)

  if (Object.values(validationErrors).some((error) => error !== '')) {
    return false
  }

  return true
}

const handleSubmit = () => {
  if (!validateForm()) return

  const submitData = { ...formData }
  if (!submitData.group_name || submitData.group_name.trim() === '') {
    submitData.group_name = t('personal.defaultGroup')
  }

  emit('submit', submitData)
}

const handleSshProxyStatusChange = async (checked) => {
  formData.needProxy = checked
}

const handleAddProxyConfig = () => {
  eventBus.emit('openUserTab', 'userConfig')
  setTimeout(() => {
    eventBus.emit('switchToTerminalTab')
    setTimeout(() => {
      eventBus.emit('openAddProxyConfigModal')
    }, 200)
  }, 100)
}

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

watch(
  () => props.initialData,
  (newData) => {
    const defaultGroupName = t('personal.defaultGroup')
    cachedAuth.password = newData?.password ?? ''
    cachedAuth.keyChain = newData?.keyChain
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
