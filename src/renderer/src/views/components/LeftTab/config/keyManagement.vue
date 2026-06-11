<template>
  <div class="keychain-config-container">
    <div class="split-layout">
      <div class="left-section">
        <div class="header-container">
          <div class="search-container">
            <a-input
              v-model:value="searchValue"
              :placeholder="t('common.search')"
              class="search-input"
              @input="handleSearch"
            >
              <template #suffix>
                <search-outlined />
              </template>
            </a-input>
            <div
              class="toggle-btn"
              @click="openNewPanel"
            >
              <a-button
                type="primary"
                size="small"
                class="workspace-button"
              >
                <template #icon
                  ><img
                    :src="keyIcon"
                    alt="Key Icon"
                    style="width: 14px; height: 14px; margin-right: 5px"
                /></template>
                <span style="margin-left: 5px">
                  {{ t('keyChain.newCredential') }}
                </span>
              </a-button>
            </div>
          </div>
        </div>
        <!-- Keychain list -->
        <div class="keychain-list-container">
          <div
            class="keychain-cards"
            :class="{ 'wide-layout': !isRightSectionVisible }"
          >
            <!-- Keychain card -->
            <div
              v-for="item in filteredKeyChainList"
              :key="item.key_chain_id"
              class="card-wrapper"
            >
              <a-card
                class="keychain-card"
                :bordered="false"
                @contextmenu.prevent="showContextMenu($event, item)"
                @click="handleCardClick(item)"
              >
                <div class="keychain-card-content">
                  <div class="keychain-icon">
                    <img
                      v-if="!isPasswordChain(item)"
                      :src="keyIcon"
                      alt="Key Card Icon"
                      style="width: 24px; height: 24px"
                    />
                    <LockOutlined
                      v-else
                      class="password-card-icon"
                    />
                  </div>
                  <div class="keychain-info">
                    <div class="keychain-name">{{ item.chain_name }}</div>
                    <div class="keychain-type">{{ t('keyChain.type') }}{{ getCredentialTypeLabel(item.chain_type) }}</div>
                  </div>
                  <div class="action-buttons">
                    <div
                      class="action-button edit-button"
                      :title="t('common.edit')"
                      @click.stop="handleEdit(item)"
                    >
                      <EditOutlined />
                    </div>
                    <div
                      class="action-button delete-button"
                      :title="t('common.remove')"
                      @click.stop="handleRemove(item)"
                    >
                      <DeleteOutlined />
                    </div>
                  </div>
                </div>
              </a-card>
            </div>
          </div>

          <div
            v-if="filteredKeyChainList.length === 0"
            class="empty-state"
          >
            <div class="empty-icon">
              <KeyOutlined class="empty-icon-svg" />
            </div>
            <div class="empty-text">
              {{ searchValue ? t('common.noSearchResults') : t('keyChain.noCredentials') }}
            </div>
          </div>
        </div>

        <KeyContextMenu
          v-if="contextMenuVisible"
          :visible="contextMenuVisible"
          :position="contextMenuPosition"
          :key-chain="selectedKeyChain"
          @close="closeContextMenu"
          @edit="handleContextMenuEdit"
          @remove="handleContextMenuRemove"
        />
      </div>

      <div
        v-if="isRightSectionVisible"
        class="right-section"
        :class="{ 'right-section-visible': isRightSectionVisible }"
      >
        <div class="right-section-header">
          <div style="font-size: 14px; font-weight: bold">
            <h3>{{ isEditMode ? t('keyChain.editCredential') : t('keyChain.newCredential') }}</h3>
          </div>
          <ToTopOutlined
            style="font-size: 20px; transform: rotate(90deg); cursor: pointer"
            class="top-icon"
            @click="isRightSectionVisible = false"
          />
        </div>

        <div class="right-section-content">
          <a-form
            :label-col="{ span: 27 }"
            :wrapper-col="{ span: 27 }"
            layout="vertical"
            class="custom-form"
          >
            <a-form-item :label="t('keyChain.credentialType')">
              <a-radio-group
                v-model:value="createForm.credentialType"
                button-style="solid"
                class="credential-type-radio"
                :disabled="isCredentialTypeLocked"
                style="width: 100%"
              >
                <a-radio-button :value="PASSWORD_CHAIN_TYPE">{{ t('keyChain.passwordCredential') }}</a-radio-button>
                <a-radio-button :value="KEY_CREDENTIAL_TYPE">{{ t('keyChain.keyCredential') }}</a-radio-button>
              </a-radio-group>
            </a-form-item>

            <a-form-item
              :label="`${t('keyChain.name')}*`"
              :validate-status="validationErrors.label ? 'error' : ''"
              :help="validationErrors.label"
            >
              <a-input
                v-model:value="createForm.label"
                :class="{ 'error-input': validationErrors.label }"
                :placeholder="t('keyChain.pleaseInput')"
                @input="validateField('label', createForm.label)"
              />
            </a-form-item>

            <template v-if="createForm.credentialType === PASSWORD_CHAIN_TYPE">
              <a-form-item :label="t('keyChain.username')">
                <a-input
                  :key="`password-username-${editingKeyChainId ?? 'new'}`"
                  v-model:value="createForm.username"
                  :placeholder="t('keyChain.pleaseInput')"
                  autocomplete="off"
                />
              </a-form-item>
              <a-form-item :label="`${t('keyChain.password')}*`">
                <a-input-password
                  v-model:value="createForm.password"
                  :placeholder="t('keyChain.pleaseInput')"
                />
              </a-form-item>
            </template>

            <template v-else>
              <a-form-item :label="`${t('keyChain.privateKey')}*`">
                <a-textarea
                  v-model:value="createForm.privateKey"
                  :rows="4"
                  :auto-size="{ minRows: 5, maxRows: 8 }"
                  spellcheck="false"
                  autocorrect="off"
                  autocapitalize="off"
                  autocomplete="off"
                  :placeholder="t('keyChain.pleaseInput')"
                />
              </a-form-item>
              <a-form-item
                :label="t('keyChain.publicKey')"
                :validate-status="validationErrors.publicKey ? 'error' : ''"
                :help="validationErrors.publicKey"
              >
                <a-textarea
                  v-model:value="createForm.publicKey"
                  :class="{ 'error-input': validationErrors.publicKey }"
                  :rows="4"
                  :auto-size="{ minRows: 3, maxRows: 8 }"
                  spellcheck="false"
                  autocorrect="off"
                  autocapitalize="off"
                  autocomplete="off"
                  :placeholder="t('keyChain.pleaseInput')"
                  @input="validateField('publicKey', createForm.publicKey)"
                />
              </a-form-item>
              <a-form-item
                :label="t('keyChain.passphrase')"
                :validate-status="validationErrors.passphrase ? 'error' : ''"
                :help="validationErrors.passphrase"
              >
                <a-input-password
                  v-model:value="createForm.passphrase"
                  :class="{ 'error-input': validationErrors.passphrase }"
                  :placeholder="t('keyChain.pleaseInput')"
                  @input="validateField('passphrase', createForm.passphrase)"
                />
              </a-form-item>
            </template>
            <div
              v-if="createForm.credentialType !== PASSWORD_CHAIN_TYPE"
              class="drag-drop-area"
              :class="{ 'drag-over': isDragOver }"
              style="
                margin-top: 8px;
                padding: 18px 0;
                border: 1px dashed #d9d9d9;
                border-radius: 8px;
                text-align: center;
                background: var(--bg-color-secondary);
                cursor: pointer;
              "
              @dragover.prevent
              @dragenter.prevent="isDragOver = true"
              @dragleave.prevent="isDragOver = false"
              @drop.prevent="handleDrop"
              @click="handleClickUpload"
            >
              <input
                ref="fileInputRef"
                type="file"
                style="display: none"
                accept=".pem,.key,.txt,.pub,.asc,.crt,.cer,.der,.p12,.pfx,.ssh,.ppk,.gpg,.asc,.any"
                @change="handleFileChange"
              />
              <div style="display: flex; flex-direction: column; align-items: center; justify-content: center">
                <svg
                  width="32"
                  height="32"
                  viewBox="0 0 32 32"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <rect
                    width="32"
                    height="32"
                    rx="8"
                    fill="#E0E0E0"
                  />
                  <path
                    d="M16 10V22"
                    stroke="#B0B6BE"
                    stroke-width="2"
                    stroke-linecap="round"
                  />
                  <path
                    d="M10 16L16 10L22 16"
                    stroke="#B0B6BE"
                    stroke-width="2"
                    stroke-linecap="round"
                  />
                </svg>
                <div style="color: #888; font-size: 14px; margin-top: 8px">{{ t('keyChain.keyDrop') }}</div>
              </div>
            </div>
          </a-form>
        </div>

        <div class="connect-button-container">
          <a-button
            type="primary"
            class="connect-button"
            @click="isEditMode ? handleUpdateKeyChain() : handleCreateKeyChain()"
          >
            {{ isEditMode ? t('keyChain.saveCredential') : t('keyChain.createCredential') }}
          </a-button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, reactive, computed, watch, nextTick } from 'vue'
import { Modal, message } from 'ant-design-vue'
import { EditOutlined, DeleteOutlined, ToTopOutlined, SearchOutlined, KeyOutlined, LockOutlined } from '@ant-design/icons-vue'
import keyIcon from '@/assets/menu/key.svg'
import i18n from '@/locales'
import eventBus from '@/utils/eventBus'
import KeyContextMenu from '../components/KeyContextMenu.vue'

const { t } = i18n.global
const logger = createRendererLogger('config.keyManagement')
const PASSWORD_CHAIN_TYPE = 'PASSWORD'
const KEY_CREDENTIAL_TYPE = 'KEY'

interface KeyChainItem {
  key_chain_id: number
  chain_name: string
  chain_type: string
  private_key?: string
  public_key?: string
  passphrase?: string
}

type KeyChainDetail = KeyChainItem & {
  publicKey?: string
  privateKey?: string
}

const isPasswordChainType = (type?: string | null): boolean => {
  return (
    String(type || '')
      .trim()
      .toUpperCase() === PASSWORD_CHAIN_TYPE
  )
}

const normalizeKeyChainDetail = (raw: KeyChainDetail | null, fallback: KeyChainItem): KeyChainItem | null => {
  if (!raw || raw.key_chain_id == null) {
    return null
  }

  return {
    key_chain_id: raw.key_chain_id,
    chain_name: raw.chain_name ?? fallback.chain_name,
    chain_type: raw.chain_type ?? fallback.chain_type,
    private_key: raw.private_key ?? raw.privateKey,
    public_key: raw.public_key ?? raw.publicKey,
    passphrase: raw.passphrase
  }
}

const keyChainList = ref<KeyChainItem[]>([])
const searchValue = ref('')
const isRightSectionVisible = ref(false)
const isEditMode = ref(false)
const editingKeyChainId = ref<number | null>(null)
const contextMenuVisible = ref(false)
const contextMenuPosition = reactive({ x: 0, y: 0 })
const selectedKeyChain = ref<KeyChainItem | null>(null)
const isDragOver = ref(false)
const fileInputRef = ref<HTMLInputElement | null>(null)

interface CreateFormType {
  label: string
  privateKey: string
  publicKey: string
  credentialType: string
  type: string
  passphrase: string
  username: string
  password: string
}

const createForm = reactive<CreateFormType>({
  label: '',
  privateKey: '',
  publicKey: '',
  credentialType: PASSWORD_CHAIN_TYPE,
  type: 'RSA',
  passphrase: '',
  username: '',
  password: ''
})

const validationErrors = reactive({
  label: '',
  publicKey: '',
  passphrase: ''
})

const resetForm = () => {
  Object.assign(createForm, {
    label: '',
    privateKey: '',
    publicKey: '',
    credentialType: PASSWORD_CHAIN_TYPE,
    type: 'RSA',
    passphrase: '',
    username: '',
    password: ''
  })
  Object.assign(validationErrors, {
    label: '',
    publicKey: '',
    passphrase: ''
  })
}

const isCredentialTypeLocked = computed(() => isEditMode.value)

const isPasswordChain = (item: KeyChainItem | null): boolean => {
  return isPasswordChainType(item?.chain_type)
}

const getCredentialTypeLabel = (type?: string | null): string => {
  return isPasswordChainType(type) ? t('keyChain.passwordCredential') : t('keyChain.keyCredential')
}

watch(
  () => createForm.credentialType,
  () => {
    validationErrors.publicKey = ''
    validationErrors.passphrase = ''
  }
)

const validateField = (field: keyof typeof validationErrors, value: string) => {
  if (value.includes(' ')) {
    switch (field) {
      case 'label':
        validationErrors.label = t('keyChain.nameContainsSpace')
        break
      case 'publicKey':
        validationErrors.publicKey = t('keyChain.publicKeyContainsSpace')
        break
      case 'passphrase':
        validationErrors.passphrase = t('keyChain.passphraseContainsSpace')
        break
    }
  } else {
    validationErrors[field] = ''
  }
}

const validateAllFields = () => {
  validateField('label', createForm.label)
  if (createForm.credentialType !== PASSWORD_CHAIN_TYPE) {
    validateField('publicKey', createForm.publicKey)
    validateField('passphrase', createForm.passphrase)
  }

  return !Object.values(validationErrors).some((error) => error !== '')
}

const filteredKeyChainList = computed(() => {
  if (!searchValue.value.trim()) return keyChainList.value

  const lowerCaseInput = searchValue.value.toLowerCase()
  return keyChainList.value.filter(
    (item) =>
      item.chain_name.toLowerCase().includes(lowerCaseInput) ||
      String(item.chain_type || '')
        .toLowerCase()
        .includes(lowerCaseInput) ||
      getCredentialTypeLabel(item.chain_type).toLowerCase().includes(lowerCaseInput)
  )
})

const fetchKeyChainList = async () => {
  try {
    const api = window.api as any
    const result = await api.getKeyChainList()
    if (result && result.data && result.data.keyChain) {
      keyChainList.value = result.data.keyChain
    }
  } catch (error) {
    logger.error('Failed to get key list', { error: error })
    message.error(t('keyChain.getKeyListFailed'))
  }
}

const openNewPanel = () => {
  isEditMode.value = false
  editingKeyChainId.value = null
  resetForm()
  isRightSectionVisible.value = true
}

const showContextMenu = (event: MouseEvent, keyChain: KeyChainItem) => {
  event.preventDefault()
  contextMenuPosition.x = event.clientX
  contextMenuPosition.y = event.clientY
  selectedKeyChain.value = keyChain
  contextMenuVisible.value = true

  const closeMenu = () => {
    contextMenuVisible.value = false
    document.removeEventListener('click', closeMenu)
  }

  setTimeout(() => {
    document.addEventListener('click', closeMenu)
  }, 0)
}

const handleCardClick = (keyChain: KeyChainItem) => {
  logger.info('Card clicked', { event: 'keychain.click', id: keyChain.key_chain_id })
}

const closeContextMenu = () => {
  contextMenuVisible.value = false
}

const handleContextMenuEdit = () => {
  if (selectedKeyChain.value) {
    handleEdit(selectedKeyChain.value)
  }
  closeContextMenu()
}

const handleContextMenuRemove = () => {
  if (selectedKeyChain.value) {
    handleRemove(selectedKeyChain.value)
  }
}

const applyKeyChainToForm = (detail: KeyChainItem) => {
  const isPassword = isPasswordChainType(detail.chain_type)

  Object.assign(createForm, {
    label: detail.chain_name || '',
    privateKey: isPassword ? '' : detail.private_key || '',
    publicKey: isPassword ? '' : detail.public_key || '',
    credentialType: isPassword ? PASSWORD_CHAIN_TYPE : KEY_CREDENTIAL_TYPE,
    type: isPassword ? PASSWORD_CHAIN_TYPE : detail.chain_type || 'RSA',
    passphrase: isPassword ? '' : detail.passphrase || '',
    username: isPassword ? detail.public_key || '' : '',
    password: isPassword ? detail.passphrase || '' : ''
  })
}

const handleEdit = async (keyChain: KeyChainItem | null) => {
  if (!keyChain) return
  editingKeyChainId.value = keyChain.key_chain_id

  const api = window.api as any
  let detail: KeyChainItem = keyChain

  try {
    const res = await api.getKeyChainInfo({ id: keyChain.key_chain_id })
    const normalized = normalizeKeyChainDetail(res, keyChain)
    if (normalized) {
      detail = normalized
      logger.info('Loaded keyChain info', { event: 'keychain.loaded', id: detail.key_chain_id })
    } else {
      logger.warn('KeyChain detail missing after load', { event: 'keychain.load_empty', id: keyChain.key_chain_id })
      message.error(t('keyChain.getKeyListFailed'))
    }
  } catch (error) {
    logger.error('Failed to load keychain info', { error: error })
    message.error(t('keyChain.getKeyListFailed'))
  }

  logger.info('KeyChain data for editing', {
    event: 'keychain.edit',
    id: detail.key_chain_id,
    type: detail.chain_type,
    isPassword: isPasswordChainType(detail.chain_type),
    hasUsername: isPasswordChainType(detail.chain_type) ? !!detail.public_key : false
  })

  isEditMode.value = true
  applyKeyChainToForm(detail)
  isRightSectionVisible.value = true
  await nextTick()
}

const handleRemove = (keyChain: KeyChainItem | null) => {
  if (!keyChain) return

  Modal.confirm({
    title: t('keyChain.deleteConfirm'),
    content: t('keyChain.deleteConfirmContent', { name: keyChain.chain_name }),
    okText: t('common.delete'),
    okType: 'danger',
    cancelText: t('common.cancel'),
    maskClosable: true,
    onOk: async () => {
      try {
        const api = window.api as any
        if (api.deleteKeyChain) {
          const res = await api.deleteKeyChain({ id: keyChain.key_chain_id })
          if (res?.data?.message === 'success') {
            message.success(t('keyChain.deleteSuccess', { name: keyChain.chain_name }))
            fetchKeyChainList()
            eventBus.emit('keyChainUpdated')
          } else {
            message.error(t('keyChain.deleteFailure'))
          }
        } else {
          logger.error('deleteKeyChain API not implemented')
          message.error(t('keyChain.deleteError'))
        }
      } catch (err: any) {
        message.error(t('keyChain.deleteError', { error: err.message || t('ssh.unknownError') }))
      }
    }
  })
}

const handleCreateKeyChain = async () => {
  try {
    // Validate all fields first
    if (!validateAllFields()) {
      return message.error(t('keyChain.nameContainsSpace'))
    }

    if (!createForm.label) {
      return message.error(t('common.pleaseInputLabel'))
    }
    if (createForm.credentialType === PASSWORD_CHAIN_TYPE && !createForm.password) {
      return message.error(t('keyChain.pleaseInputPassword'))
    }
    if (createForm.credentialType !== PASSWORD_CHAIN_TYPE && !createForm.privateKey) {
      return message.error(t('common.pleaseInputPrivateKey'))
    }
    const api = window.api as any
    if (api.createKeyChain) {
      const cleanForm = {
        chain_name: createForm.label,
        private_key: createForm.credentialType === PASSWORD_CHAIN_TYPE ? '' : createForm.privateKey,
        public_key: createForm.credentialType === PASSWORD_CHAIN_TYPE ? createForm.username : createForm.publicKey,
        chain_type: createForm.credentialType === PASSWORD_CHAIN_TYPE ? PASSWORD_CHAIN_TYPE : createForm.type,
        passphrase: createForm.credentialType === PASSWORD_CHAIN_TYPE ? createForm.password : createForm.passphrase
      }
      if (createForm.credentialType !== PASSWORD_CHAIN_TYPE) {
        cleanForm.chain_type = detectKeyType(createForm.privateKey, createForm.publicKey)
      }

      const res = await api.createKeyChain({ form: cleanForm })
      if (res?.data?.message === 'success') {
        message.success(t('keyChain.createCredentialSuccess'))
        isRightSectionVisible.value = false
        fetchKeyChainList()
        eventBus.emit('keyChainUpdated')
      } else {
        throw new Error('Creation failed')
      }
    }
  } catch (e: any) {
    message.error(e.message || t('keyChain.createError'))
  }
}

const handleUpdateKeyChain = async () => {
  if (!editingKeyChainId.value) return message.error(t('keyChain.missingKeyId'))

  try {
    if (!validateAllFields()) {
      return message.error(t('keyChain.nameContainsSpace'))
    }

    if (!createForm.label) {
      return message.error(t('common.pleaseInputLabel'))
    }
    if (createForm.credentialType === PASSWORD_CHAIN_TYPE && !createForm.password) {
      return message.error(t('keyChain.pleaseInputPassword'))
    }
    if (createForm.credentialType !== PASSWORD_CHAIN_TYPE && !createForm.privateKey) {
      return message.error(t('common.pleaseInputPrivateKey'))
    }

    const api = window.api as any
    if (api.updateKeyChain) {
      const cleanForm = {
        key_chain_id: editingKeyChainId.value,
        chain_name: createForm.label,
        private_key: createForm.credentialType === PASSWORD_CHAIN_TYPE ? '' : createForm.privateKey,
        public_key: createForm.credentialType === PASSWORD_CHAIN_TYPE ? createForm.username : createForm.publicKey,
        chain_type: createForm.credentialType === PASSWORD_CHAIN_TYPE ? PASSWORD_CHAIN_TYPE : createForm.type,
        passphrase: createForm.credentialType === PASSWORD_CHAIN_TYPE ? createForm.password : createForm.passphrase
      }
      if (createForm.credentialType !== PASSWORD_CHAIN_TYPE) {
        cleanForm.chain_type = detectKeyType(createForm.privateKey, createForm.publicKey)
      }

      const res = await api.updateKeyChain({ form: cleanForm })
      if (res?.data?.message === 'success') {
        message.success(t('common.saveSuccess'))
        isRightSectionVisible.value = false
        fetchKeyChainList()
        eventBus.emit('keyChainUpdated')
      } else {
        throw new Error(t('common.saveFailed'))
      }
    } else {
      logger.error('updateKeyChain API not implemented')
    }
  } catch (e: any) {
    message.error(e.message || t('common.saveError'))
  }
}

const handleSearch = () => {}

function detectKeyType(privateKey = '', publicKey = ''): 'RSA' | 'ED25519' | 'ECDSA' {
  if (publicKey.trim()) {
    const algo = publicKey.trim().split(/\s+/)[0]
    if (algo === 'ssh-ed25519') return 'ED25519'
    if (algo === 'ssh-rsa') return 'RSA'
    if (algo.startsWith('ecdsa-')) return 'ECDSA'
  }

  if (privateKey.includes('BEGIN RSA PRIVATE KEY')) return 'RSA'
  if (privateKey.includes('BEGIN EC PRIVATE KEY')) return 'ECDSA'

  if (privateKey.includes('BEGIN OPENSSH PRIVATE KEY')) {
    try {
      const body = privateKey.replace(/-----(BEGIN|END)[\s\S]+?KEY-----/g, '').replace(/\s+/g, '')
      const decoded = atob(body)
      if (decoded.includes('ssh-ed25519')) return 'ED25519'
      if (decoded.includes('ssh-rsa')) return 'RSA'
      if (decoded.includes('ecdsa-sha2')) return 'ECDSA'
    } catch (_) {
      /* Ignore */
    }
  }

  return 'RSA'
}

function handleDrop(e: DragEvent) {
  isDragOver.value = false
  const files = e.dataTransfer?.files
  if (files && files.length > 0) {
    const file = files[0]
    const reader = new FileReader()
    reader.onload = (event) => {
      const text = event.target?.result as string
      createForm.privateKey = text
      message.success('Key file imported successfully')
    }
    reader.onerror = () => {
      message.error('Failed to read file')
    }
    reader.readAsText(file)
  }
}

function handleClickUpload() {
  if (fileInputRef.value) {
    fileInputRef.value.value = '' // Clear to ensure same file can be selected again
    fileInputRef.value.click()
  }
}

function handleFileChange(e: Event) {
  const input = e.target as HTMLInputElement
  if (input.files && input.files.length > 0) {
    const file = input.files[0]
    const reader = new FileReader()
    reader.onload = (event) => {
      const text = event.target?.result as string
      createForm.privateKey = text
      message.success('Key file imported successfully')
    }
    reader.onerror = () => {
      message.error('Failed to read file')
    }
    reader.readAsText(file)
  }
}

onMounted(() => {
  fetchKeyChainList()
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && contextMenuVisible.value) {
      contextMenuVisible.value = false
    }
  })
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', (event) => {
    if (event.key === 'Escape' && contextMenuVisible.value) {
      contextMenuVisible.value = false
    }
  })
})

watch(isRightSectionVisible, (val) => {
  if (!val) {
    resetForm()
    isEditMode.value = false
    editingKeyChainId.value = null
  }
})
</script>

<style lang="less" scoped>
.workspace-button {
  font-size: 14px;
  height: 30px;
  display: flex;
  align-items: center;
  background-color: #1677ff;
  border-color: #1677ff;

  &:hover {
    background-color: #398bff;
    border-color: #398bff;
  }

  &:active {
    background-color: rgb(130, 134, 155);
    border-color: rgb(130, 134, 155);
  }
}

.keychain-config-container {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.split-layout {
  display: flex;
  width: 100%;
  height: 100%;
  position: relative;
  flex: 1;
  overflow: hidden;
  justify-content: flex-start;
}

.left-section {
  flex: 1 1 auto;
  position: relative;
  transition: all 0.3s ease;
  padding: 10px;
  overflow-y: auto;
  background-color: var(--bg-color);
  width: 100%;
  scrollbar-width: thin;
  scrollbar-color: var(--border-color-light) transparent;
}

.search-input {
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

.keychain-list-container {
  width: 100%;
}

.keychain-cards {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 16px;
}

/* Show more cards when right panel is closed */
.keychain-cards.wide-layout {
  .card-wrapper {
    width: calc(33.33% - 8px); /* Display 3 per row, accounting for 8px spacing */
  }
}

/* Show fewer cards when right panel is open */
.keychain-cards:not(.wide-layout) {
  .card-wrapper {
    width: calc(50% - 6px); /* Display 2 per row, accounting for 8px spacing */
  }
}

/* Card wrapper for controlling width */
.card-wrapper {
  margin-bottom: 0;
  transition: width 0.3s ease;
}

/* Mobile adaptation */
@media (max-width: 768px) {
  .keychain-cards {
    .card-wrapper {
      width: 100% !important; /* Small screen displays 1 per row */
    }
  }
}

.keychain-card {
  position: relative;
  padding-right: 60px;
  background-color: var(--bg-color-card);
  border-radius: 6px;
  overflow: hidden;
  cursor: pointer;
  transition: all 0.3s ease;

  &:hover {
    background-color: var(--hover-bg-color);
  }

  :deep(.ant-card-body) {
    padding: 8px 12px;
  }
}

.action-buttons {
  position: absolute;
  top: 50%;
  right: 12px;
  transform: translateY(-50%);
  display: flex;
  align-items: center;
  gap: 8px;
  opacity: 0;
  pointer-events: none;
  transition:
    opacity 0.2s ease,
    color 0.2s ease;
}

.keychain-card:hover .action-buttons {
  opacity: 1;
  pointer-events: auto;
}

.action-button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 4px;
  color: var(--text-color-tertiary);
  font-size: 16px;
  cursor: pointer;
  transition: all 0.2s ease;
  background-color: transparent;

  &:hover {
    background-color: var(--hover-bg-color);
    color: #1890ff;
  }

  &:active {
    transform: scale(0.95);
  }
}

.edit-button:hover {
  color: #1890ff;
}

.delete-button:hover {
  color: #ff6b6b;
  background-color: rgba(255, 107, 107, 0.15);
}

.keychain-card-content {
  display: flex;
  align-items: center;
  min-height: 48px;
}

.keychain-icon {
  width: 32px;
  height: 32px;
  min-width: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #1890ff;
  margin-right: 8px;
  position: relative;

  img {
    filter: brightness(0) saturate(100%) invert(48%) sepia(57%) saturate(2303%) hue-rotate(198deg) brightness(102%) contrast(96%);
  }

  :global(.light-theme) & img {
    filter: brightness(0) saturate(100%) invert(31%) sepia(98%) saturate(1720%) hue-rotate(199deg) brightness(95%) contrast(107%);
  }
}

.password-card-icon {
  font-size: 22px;
  color: #1890ff;
}

.keychain-info {
  flex: 1;
  overflow: hidden; /* Prevent content overflow */
}

.keychain-name {
  font-size: 13px;
  font-weight: bold;
  color: var(--text-color);
  margin-bottom: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  display: flex;
  align-items: center;
  gap: 6px;
}

.keychain-type {
  font-size: 12px;
  color: var(--text-color-tertiary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis; /* Show ellipsis when text is too long */
}

.right-section {
  flex: 0 0 30%;
  background: var(--bg-color);
  transition: all 0.3s ease;
  height: 100%;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  padding: 0;
  overflow: hidden;
  max-width: 30%;
  min-width: 300px;
}

.right-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 12px 16px 0 16px;
  flex-shrink: 0;
}

.right-section-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 12px 16px 0 16px;
  overflow: auto;
  height: calc(100% - 40px);
}

.custom-form {
  color: var(--text-color);
  :deep(.ant-form-item) {
    margin-bottom: 12px;
    color: var(--text-color-secondary);
  }
}

.custom-form :deep(.credential-type-radio) {
  display: flex;
  width: 100%;

  .ant-radio-button-wrapper {
    flex: 1;
    text-align: center;
    background: var(--bg-color-secondary) !important;
    border-color: var(--border-color) !important;
    color: var(--text-color) !important;

    &::before {
      background-color: var(--border-color) !important;
    }

    &:hover {
      color: #1677ff !important;
    }
  }

  .ant-radio-button-wrapper-checked:not(.ant-radio-button-wrapper-disabled) {
    background: #1677ff !important;
    border-color: #1677ff !important;
    color: #fff !important;

    &:hover {
      color: #fff !important;
    }
  }

  .ant-radio-button-wrapper-disabled {
    color: var(--text-color-tertiary) !important;
    background: var(--bg-color-secondary) !important;
  }

  .ant-radio-button-wrapper-checked.ant-radio-button-wrapper-disabled {
    background: var(--border-color) !important;
    color: var(--text-color) !important;
  }
}

.connect-button-container {
  width: 100%;
  padding: 12px 16px;
  margin-top: auto;
  flex-shrink: 0;
  position: sticky;
  bottom: 0;
}

.connect-button {
  width: 100%;
  border-radius: 4px;
  background-color: #1890ff;
  border-color: #1890ff;

  &:hover {
    background-color: #40a9ff;
    border-color: #40a9ff;
  }
}

/* Right section form input styles */
.right-section {
  :deep(.ant-input),
  :deep(.ant-select:not(.ant-select-customize-input) .ant-select-selector),
  :deep(.ant-input-number),
  :deep(.ant-picker),
  :deep(.ant-input-affix-wrapper),
  :deep(.ant-textarea) {
    color: var(--text-color);
    background-color: var(--bg-color) !important;
    border-color: var(--border-color) !important;
    padding: 4px 11px;

    &::placeholder {
      color: var(--text-color-tertiary) !important;
    }
    &:hover,
    &:focus {
      border-color: #1890ff;
    }
  }
  :deep(.ant-form-item-label) {
    padding-bottom: 4px;
    > label {
      color: var(--text-color);
    }
  }
  :deep(.anticon.ant-input-password-icon) {
    color: var(--text-color);
  }

  :global(.light-theme) & {
    :deep(.ant-form-item-label) > label {
      color: rgba(0, 0, 0, 0.85) !important;
    }
  }
}

.toggle-btn {
  flex: 0 0 auto;
  margin-left: 10px;
}

.search-container {
  margin-bottom: 20px;
  display: flex;
  width: 60%;
}

.drag-drop-area {
  transition:
    border-color 0.2s,
    background 0.2s;
}
.drag-drop-area.drag-over {
  border-color: #1890ff;
  background: #e6f7ff;
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

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  text-align: center;
}

.empty-icon {
  margin-bottom: 16px;

  .empty-icon-svg {
    font-size: 48px;
    color: var(--text-color-tertiary);
    opacity: 0.6;
  }
}

.empty-text {
  font-size: 14px;
  color: var(--text-color-secondary);
}
</style>
