<template>
  <div class="userInfo">
    <a-card
      :bordered="false"
      class="userInfo-container"
    >
      <a-form
        :colon="false"
        label-align="left"
        wrapper-align="right"
        :label-col="{ span: 7, offset: 0 }"
        :wrapper-col="{ span: 17, class: 'right-aligned-wrapper' }"
        class="custom-form"
      >
        <a-form-item>
          <template #label>
            <span class="label-text">{{ $t('user.terminalSetting') }}</span>
          </template>
        </a-form-item>
        <a-form-item
          :label="$t('user.terminalType')"
          class="user_my-ant-form-item"
        >
          <a-select
            v-model:value="userConfig.terminalType"
            class="terminal-type-select"
          >
            <a-select-option value="xterm">xterm</a-select-option>
            <a-select-option value="xterm-256color">xterm-256color</a-select-option>
            <a-select-option value="vt100">vt100</a-select-option>
            <a-select-option value="vt102">vt102</a-select-option>
            <a-select-option value="vt220">vt220</a-select-option>
            <a-select-option value="vt320">vt320</a-select-option>
            <a-select-option value="linux">linux</a-select-option>
            <a-select-option value="scoansi">scoansi</a-select-option>
            <a-select-option value="ansi">ansi</a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item
          :label="$t('user.fontSize')"
          class="user_my-ant-form-item"
        >
          <a-input-number
            v-model:value="userConfig.fontSize"
            :bordered="false"
            style="width: 20%"
            :min="8"
            :max="64"
            class="user_my-ant-form-item-content"
          />
        </a-form-item>
        <a-form-item
          :label="$t('user.fontFamily')"
          class="user_my-ant-form-item"
        >
          <a-select
            v-model:value="userConfig.fontFamily"
            class="font-family-select"
            :options="fontFamilyOptions"
          />
        </a-form-item>
        <a-form-item
          :label="$t('user.scrollBack')"
          class="user_my-ant-form-item"
        >
          <a-input-number
            v-model:value="userConfig.scrollBack"
            :bordered="false"
            style="width: 20%"
            :min="1"
            class="user_my-ant-form-item-content"
          />
        </a-form-item>
        <a-form-item
          :label="$t('user.cursorStyle')"
          class="user_my-ant-form-item"
        >
          <a-radio-group
            v-model:value="userConfig.cursorStyle"
            class="custom-radio-group"
          >
            <a-radio value="block">{{ $t('user.cursorStyleBlock') }}</a-radio>
            <a-radio value="bar">{{ $t('user.cursorStyleBar') }}</a-radio>
            <a-radio value="underline">{{ $t('user.cursorStyleUnderline') }}</a-radio>
          </a-radio-group>
        </a-form-item>
        <a-form-item
          label="SSH Agents"
          class="user_my-ant-form-item"
        >
          <a-switch
            :checked="userConfig.sshAgentsStatus === 1"
            class="user_my-ant-form-item-content"
            @change="handleSshAgentsStatusChange"
          />
        </a-form-item>
        <a-form-item
          v-show="userConfig.sshAgentsStatus === 1"
          :label="$t('user.sshAgentSettings')"
          class="user_my-ant-form-item"
        >
          <a-button @click="openAgentConfig">{{ $t('common.setting') }}</a-button>
        </a-form-item>
        <a-form-item
          :label="$t('user.mouseEvent')"
          class="user_my-ant-form-item"
        >
          <div class="mouse-event-container">
            <div class="mouse-event-row">
              <span class="mouse-event-label">{{ $t('user.middleMouseEvent') }}:</span>
              <a-select
                v-model:value="userConfig.middleMouseEvent"
                class="mouse-event-select"
              >
                <a-select-option value="none">{{ $t('user.none') }}</a-select-option>
                <a-select-option value="paste">{{ $t('user.pasteClipboard') }}</a-select-option>
                <a-select-option value="contextMenu">{{ $t('user.showContextMenu') }}</a-select-option>
              </a-select>
            </div>
            <div class="mouse-event-row">
              <span class="mouse-event-label">{{ $t('user.rightMouseEvent') }}:</span>
              <a-select
                v-model:value="userConfig.rightMouseEvent"
                class="mouse-event-select"
              >
                <a-select-option value="none">{{ $t('user.none') }}</a-select-option>
                <a-select-option value="paste">{{ $t('user.pasteClipboard') }}</a-select-option>
                <a-select-option value="contextMenu">{{ $t('user.showContextMenu') }}</a-select-option>
              </a-select>
            </div>
          </div>
        </a-form-item>
      </a-form>
    </a-card>

    <a-modal
      v-model:visible="agentConfigModalVisible"
      :title="$t('user.sshAgentSettings')"
      width="700px"
    >
      <a-table
        :row-key="(record) => record.fingerprint"
        :columns="columns"
        :data-source="agentKeys"
        size="small"
        :pagination="false"
        :locale="{ emptyText: $t('user.noKeyAdd') }"
        class="agent-table"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'action'">
            <a-button
              type="link"
              @click="removeKey(record)"
              >{{ $t('user.remove') }}
            </a-button>
          </template>
        </template>
      </a-table>

      <a-form
        layout="inline"
        style="width: 100%; margin-top: 20px; margin-bottom: 10px"
      >
        <a-form-item
          :label="t('personal.key')"
          style="flex: 1"
        >
          <a-select
            v-model:value="keyChainData"
            :options="keyChainOptions"
            :field-names="{ value: 'key', label: 'label' }"
            style="width: 200px"
          />
        </a-form-item>
        <a-form-item>
          <a-button
            type="primary"
            @click="addKey"
            >{{ $t('common.add') }}</a-button
          >
        </a-form-item>
      </a-form>

      <template #footer>
        <a-button @click="handleAgentConfigClose">{{ $t('common.close') }}</a-button>
      </template>
    </a-modal>
  </div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue'
import { notification } from 'ant-design-vue'
import { userConfigStore } from '@/services/userConfigStoreService'
import { useI18n } from 'vue-i18n'
import eventBus from '@/utils/eventBus'
const { t } = useI18n()
const userConfig = ref({
  fontSize: 12,
  fontFamily: 'Menlo, Monaco, "Courier New", Consolas, Courier, monospace',
  scrollBack: 1000,
  cursorStyle: 'block',
  middleMouseEvent: 'paste',
  rightMouseEvent: 'contextMenu',
  terminalType: 'vt100',
  sshAgentsStatus: 2,
  sshAgentsMap: '[]'
})

const fontFamilyOptions = [
  { value: 'Menlo, Monaco, "Courier New", Consolas, Courier, monospace', label: 'Menlo (默认)' },
  { value: 'Monaco, "Courier New", Consolas, Courier, monospace', label: 'Monaco' },
  { value: '"Courier New", Courier, monospace', label: 'Courier New' },
  { value: 'Consolas, "Courier New", Courier, monospace', label: 'Consolas' },
  { value: 'Courier, monospace', label: 'Courier' },
  { value: '"DejaVu Sans Mono", "Bitstream Vera Sans Mono", Monaco, "Courier New", Courier, monospace', label: 'DejaVu Sans Mono' },
  { value: '"Fira Code", "Courier New", Courier, monospace', label: 'Fira Code' },
  { value: '"JetBrains Mono", "Courier New", Courier, monospace', label: 'JetBrains Mono' },
  { value: '"Source Code Pro", "Courier New", Courier, monospace', label: 'Source Code Pro' },
  { value: '"Ubuntu Mono", "Courier New", Courier, monospace', label: 'Ubuntu Mono' },
  { value: '"Liberation Mono", "Courier New", Courier, monospace', label: 'Liberation Mono' },
  { value: '"SF Mono", Monaco, "Courier New", Courier, monospace', label: 'SF Mono' },
  { value: '"Hack", "Courier New", Courier, monospace', label: 'Hack' },
  { value: '"Inconsolata", "Courier New", Courier, monospace', label: 'Inconsolata' },
  { value: '"Roboto Mono", "Courier New", Courier, monospace', label: 'Roboto Mono' }
]

const columns = [
  {
    title: t('user.fingerprint'),
    dataIndex: 'fingerprint',
    key: 'fingerprint'
  },
  {
    title: t('user.comment'),
    dataIndex: 'comment',
    key: 'comment'
  },
  {
    title: t('user.type'),
    dataIndex: 'keyType',
    key: 'keyType'
  },
  {
    title: t('extensions.action'),
    dataIndex: 'action',
    key: 'action'
  }
]

// Load saved configuration
const loadSavedConfig = async () => {
  try {
    const savedConfig = await userConfigStore.getConfig()
    if (savedConfig) {
      userConfig.value = {
        ...userConfig.value,
        ...savedConfig
      }
    }
  } catch (error) {
    console.error('Failed to load config:', error)
    notification.error({
      message: t('user.loadConfigFailed'),
      description: t('user.loadConfigFailedDescription')
    })
  }
}

const handleSshAgentsStatusChange = async (checked) => {
  userConfig.value.sshAgentsStatus = checked ? 1 : 2
  window.api.agentEnableAndConfigure({ enabled: checked }).then((res) => {
    if (checked && res.success) {
      const sshAgentMaps = JSON.parse(userConfig.value.sshAgentsMap)
      for (const keyId in sshAgentMaps) {
        loadKey(sshAgentMaps[keyId])
      }
    }
  })
}

const agentConfigModalVisible = ref(false)

const keyChainOptions = ref([])
const agentKeys = ref([])
const keyChainData = ref()

const openAgentConfig = async () => {
  agentConfigModalVisible.value = true
  getKeyChainData()
  await getAgentKeys()
}

const handleAgentConfigClose = async () => {
  agentConfigModalVisible.value = false
}

const removeKey = async (record) => {
  await api.removeKey({ keyId: record.id })
  const target = keyChainOptions.value.find((item) => item.label === record.comment)

  if (target) {
    const sshAgentsMap = JSON.parse(userConfig.value.sshAgentsMap)
    const index = sshAgentsMap.indexOf(target.key)
    if (index !== -1) {
      sshAgentsMap.splice(index, 1)
    }
    userConfig.value.sshAgentsMap = JSON.stringify(sshAgentsMap)
  }
  await getAgentKeys()
}

const loadKey = async (keyId) => {
  await window.api.getKeyChainInfo({ id: keyId }).then((res) => {
    window.api.addKey({
      keyData: res.private_key,
      comment: res.chain_name,
      passphrase: res.passphrase
    })
  })
}
const addKey = async () => {
  if (keyChainData.value) {
    await api.getKeyChainInfo({ id: keyChainData.value }).then((res) => {
      api
        .addKey({
          keyData: res.private_key,
          comment: res.chain_name,
          passphrase: res.passphrase
        })
        .then(() => {
          notification.success({
            message: t('user.addSuccess')
          })
          let sshAgentKey = JSON.parse(userConfig.value.sshAgentsMap)
          sshAgentKey.push(keyChainData.value)
          sshAgentKey = Array.from(new Set(sshAgentKey))
          userConfig.value.sshAgentsMap = JSON.stringify(sshAgentKey)
          keyChainData.value = null
          getAgentKeys()
        })
        .catch((error) => {
          notification.error({
            message: t('user.addFailed')
          })
          keyChainData.value = null
        })
    })
  }
}
const getAgentKeys = async () => {
  const res = await api.listKeys()
  agentKeys.value = res.keys
}

const getKeyChainData = () => {
  api.getKeyChainSelect().then((res) => {
    keyChainOptions.value = res.data.keyChain
  })
}

const saveConfig = async () => {
  try {
    const configToStore = {
      fontSize: userConfig.value.fontSize,
      fontFamily: userConfig.value.fontFamily,
      scrollBack: userConfig.value.scrollBack,
      cursorStyle: userConfig.value.cursorStyle,
      middleMouseEvent: userConfig.value.middleMouseEvent,
      rightMouseEvent: userConfig.value.rightMouseEvent,
      terminalType: userConfig.value.terminalType,
      sshAgentsStatus: userConfig.value.sshAgentsStatus,
      sshAgentsMap: userConfig.value.sshAgentsMap
    }

    await userConfigStore.saveConfig(configToStore)
  } catch (error) {
    console.error('Failed to save config:', error)
    notification.error({
      message: t('user.error'),
      description: t('user.saveConfigFailedDescription')
    })
  }
}

watch(
  () => userConfig.value,
  async () => {
    await saveConfig()
  },
  { deep: true }
)

watch(
  () => userConfig.value.fontFamily,
  (newFontFamily) => {
    eventBus.emit('updateTerminalFont', newFontFamily)
  }
)

onMounted(async () => {
  await loadSavedConfig()
})
</script>

<style scoped>
.userInfo {
  width: 100%;
  height: 100%;
}

.userInfo-container {
  width: 100%;
  height: 100%;
  background-color: var(--bg-color) !important;
  border-radius: 6px;
  overflow: hidden;
  padding: 4px;
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.15);
  color: var(--text-color);
}

:deep(.ant-card) {
  height: 100%;
  background-color: var(--bg-color) !important;
}

:deep(.ant-card-body) {
  height: 100%;
  display: flex;
  flex-direction: column;
  background-color: var(--bg-color);
}

.custom-form {
  color: var(--text-color);
  align-content: center;
}

.custom-form :deep(.ant-form-item-label) {
  padding-right: 20px;
}

.custom-form :deep(.ant-form-item-label > label) {
  color: var(--text-color);
}

.custom-form :deep(.ant-input),
.custom-form :deep(.ant-input-number),
.custom-form :deep(.ant-radio-wrapper) {
  color: var(--text-color);
}

.custom-form :deep(.ant-input-number) {
  background-color: var(--bg-color-secondary);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  transition: all 0.3s;
  width: 100px !important;
}

.custom-form :deep(.ant-input-number:hover) {
  border-color: #1890ff;
  background-color: var(--hover-bg-color);
}

.custom-form :deep(.ant-input-number:focus),
.custom-form :deep(.ant-input-number-focused) {
  border-color: #1890ff;
  box-shadow: 0 0 0 2px rgba(24, 144, 255, 0.2);
  background-color: var(--hover-bg-color);
}

.custom-form :deep(.ant-input-number-input) {
  height: 32px;
  padding: 4px 8px;
  background-color: transparent;
  color: var(--text-color);
}

[data-theme='light'] .custom-form :deep(.ant-input-number) {
  background-color: #f5f5f5;
}

[data-theme='light'] .custom-form :deep(.ant-input-number:hover),
[data-theme='light'] .custom-form :deep(.ant-input-number:focus),
[data-theme='light'] .custom-form :deep(.ant-input-number-focused) {
  background-color: #fafafa;
}

[data-theme='dark'] .custom-form :deep(.ant-input-number) {
  background-color: #2a2a2a;
}

[data-theme='dark'] .custom-form :deep(.ant-input-number:hover),
[data-theme='dark'] .custom-form :deep(.ant-input-number:focus),
[data-theme='dark'] .custom-form :deep(.ant-input-number-focused) {
  background-color: #363636;
}

.label-text {
  font-size: 20px;
  font-weight: bold;
  line-height: 1.3;
}

.user_my-ant-form-item {
  -webkit-box-sizing: border-box;
  box-sizing: border-box;
  margin: 0;
  padding: 0;
  color: rgba(0, 0, 0, 0.65);
  font-size: 30px;
  font-variant: tabular-nums;
  line-height: 1.5;
  list-style: none;
  -webkit-font-feature-settings: 'tnum';
  font-feature-settings: 'tnum';
  margin-bottom: 14px;
  vertical-align: top;
  color: #ffffff;
}

.terminal-type-select {
  width: 150px !important;
  text-align: left;
}

.font-family-select {
  width: 200px !important;
  text-align: left;
}

.font-family-select :deep(.ant-select-selector) {
  background-color: var(--bg-color-secondary);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  color: var(--text-color);
  transition: all 0.3s;
  height: 32px;
}

.font-family-select :deep(.ant-select-selector:hover) {
  border-color: #1890ff;
  background-color: var(--hover-bg-color);
}

.font-family-select :deep(.ant-select-focused .ant-select-selector),
.font-family-select :deep(.ant-select-selector:focus) {
  border-color: #1890ff;
  box-shadow: 0 0 0 2px rgba(24, 144, 255, 0.2);
  background-color: var(--hover-bg-color);
}

.font-family-select :deep(.ant-select-selection-item) {
  color: var(--text-color);
  font-size: 14px;
  line-height: 32px;
}

.font-family-select :deep(.ant-select-arrow) {
  color: var(--text-color);
  opacity: 0.7;
}

[data-theme='light'] .font-family-select :deep(.ant-select-selector) {
  background-color: #f5f5f5;
  border-color: #d9d9d9;
}

[data-theme='light'] .font-family-select :deep(.ant-select-selector:hover),
[data-theme='light'] .font-family-select :deep(.ant-select-focused .ant-select-selector) {
  background-color: #fafafa;
  border-color: #1890ff;
}

[data-theme='dark'] .font-family-select :deep(.ant-select-selector) {
  background-color: #2a2a2a;
  border-color: #404040;
}

[data-theme='dark'] .font-family-select :deep(.ant-select-selector:hover),
[data-theme='dark'] .font-family-select :deep(.ant-select-focused .ant-select-selector) {
  background-color: #363636;
  border-color: #1890ff;
}

.divider-container {
  width: calc(65%);
  margin: -10px calc(16%);
}

:deep(.right-aligned-wrapper) {
  text-align: right;
  color: #ffffff;
}

.checkbox-md :deep(.ant-checkbox-inner) {
  width: 20px;
  height: 20px;
}

.telemetry-description-item {
  margin-top: -15px;
  margin-bottom: 14px;
}

.telemetry-description-item :deep(.ant-form-item-control) {
  margin-left: 0 !important;
  max-width: 100% !important;
}

.telemetry-description {
  font-size: 12px;
  color: var(--text-color-secondary);
  line-height: 1.4;
  opacity: 0.8;
  text-align: left;
  margin: 0;
  margin-left: 20px;
  padding: 0;
  word-wrap: break-word;
}

.telemetry-description a {
  color: #1890ff;
  text-decoration: none;
  transition: color 0.3s;
}

.telemetry-description a:hover {
  color: #40a9ff;
  text-decoration: underline;
}

.mouse-event-row {
  margin-bottom: 10px;
  min-height: 32px;
}

.mouse-event-label {
  font-size: 14px;
  color: var(--text-color);
  min-width: 110px;
  text-align: left;
  opacity: 0.9;
  margin-right: 10px;
}

.mouse-event-select {
  width: 140px;
}

.mouse-event-select :deep(.ant-select-selector) {
  background-color: var(--bg-color-secondary);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  color: var(--text-color);
  transition: all 0.3s;
  height: 32px;
}

.mouse-event-select :deep(.ant-select-selector:hover) {
  border-color: #1890ff;
  background-color: var(--hover-bg-color);
  background-color: var(--bg-color-secondary);
}

.mouse-event-select :deep(.ant-select-focused .ant-select-selector),
.mouse-event-select :deep(.ant-select-selector:focus) {
  border-color: #1890ff;
  box-shadow: 0 0 0 2px rgba(24, 144, 255, 0.2);
  background-color: var(--hover-bg-color);
  background-color: var(--bg-color-secondary);
}

.mouse-event-select :deep(.ant-select-selection-item) {
  color: var(--text-color);
  font-size: 14px;
  line-height: 32px;
}

.mouse-event-select :deep(.ant-select-arrow) {
  color: var(--text-color);
  opacity: 0.7;
}

[data-theme='light'] .mouse-event-select :deep(.ant-select-selector) {
  background-color: #f5f5f5;
  border-color: #d9d9d9;
}

[data-theme='light'] .mouse-event-select :deep(.ant-select-selector:hover),
[data-theme='light'] .mouse-event-select :deep(.ant-select-focused .ant-select-selector) {
  background-color: #fafafa;
  border-color: #1890ff;
}

[data-theme='dark'] .mouse-event-select :deep(.ant-select-selector) {
  background-color: #2a2a2a;
  border-color: #404040;
}

[data-theme='dark'] .mouse-event-select :deep(.ant-select-selector:hover),
[data-theme='dark'] .mouse-event-select :deep(.ant-select-focused .ant-select-selector) {
  background-color: #363636;
  border-color: #1890ff;
}

:deep(.ant-select) {
  .ant-select-selector {
    background-color: var(--bg-color-secondary) !important;
    border: 1px solid var(--border-color);
    color: var(--text-color);
  }

  &.ant-select-focused {
    .ant-select-selector {
      background-color: var(--bg-color-secondary) !important;
      border-color: #1890ff !important;
    }
  }
}
::v-deep(.agent-table .ant-table-tbody > tr > td),
::v-deep(.agent-table .ant-table-thead > tr > th) {
  padding-top: 2px !important;
  padding-bottom: 2px !important;
  line-height: 1 !important;
  font-size: 12px !important;
}
.agent-table .ant-table-tbody > tr {
  height: 28px !important;
}
</style>
