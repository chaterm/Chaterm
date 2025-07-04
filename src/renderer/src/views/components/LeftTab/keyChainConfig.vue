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
                  {{ t('keyChain.newKey') }}
                </span>
              </a-button>
            </div>
          </div>
        </div>
        <!-- 密钥列表 -->
        <div class="keychain-list-container">
          <div
            class="keychain-cards"
            :class="{ 'wide-layout': !isRightSectionVisible }"
          >
            <!-- 密钥卡片 -->
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
                      :src="keyIcon"
                      alt="Key Card Icon"
                      style="width: 24px; height: 24px"
                    />
                  </div>
                  <div class="keychain-info">
                    <div class="keychain-name">{{ item.chain_name }}</div>
                    <div class="keychain-type">{{ t('keyChain.type') }}{{ item.chain_type }}</div>
                  </div>
                  <div
                    class="edit-icon"
                    @click.stop="handleEdit(item)"
                  >
                    <EditOutlined />
                  </div>
                </div>
              </a-card>
            </div>
          </div>
        </div>

        <!-- 右键菜单 -->
        <div
          v-if="contextMenuVisible"
          class="context-menu"
          :style="{ top: contextMenuPosition.y + 'px', left: contextMenuPosition.x + 'px' }"
        >
          <div
            class="context-menu-item"
            @click="handleEdit(selectedKeyChain)"
          >
            <div class="context-menu-icon"><EditOutlined /></div>
            <div class="context-menu-text">{{ t('common.edit') }}</div>
          </div>
          <div
            class="context-menu-item delete"
            @click="handleRemove(selectedKeyChain)"
          >
            <div class="context-menu-icon"><DeleteOutlined /></div>
            <div class="context-menu-text">{{ t('common.remove') }}</div>
          </div>
        </div>
      </div>

      <!-- 右侧面板 -->
      <div
        v-if="isRightSectionVisible"
        class="right-section"
        :class="{ 'right-section-visible': isRightSectionVisible }"
      >
        <div class="right-section-header">
          <div style="font-size: 14px; font-weight: bold">
            <h3>{{ isEditMode ? t('keyChain.editKey') : t('keyChain.newKey') }}</h3>
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
            <a-form-item :label="`${t('keyChain.name')}*`">
              <a-input
                v-model:value="createForm.label"
                :placeholder="t('keyChain.pleaseInput')"
              />
            </a-form-item>
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
            <a-form-item :label="t('keyChain.publicKey')">
              <a-textarea
                v-model:value="createForm.publicKey"
                :rows="4"
                :auto-size="{ minRows: 5, maxRows: 8 }"
                spellcheck="false"
                autocorrect="off"
                autocapitalize="off"
                autocomplete="off"
                :placeholder="t('keyChain.pleaseInput')"
              />
            </a-form-item>
            <a-form-item :label="t('keyChain.passphrase')">
              <a-input-password
                v-model:value="createForm.passphrase"
                :placeholder="t('keyChain.pleaseInput')"
              />
            </a-form-item>
            <div
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
            {{ isEditMode ? t('keyChain.saveKey') : t('keyChain.createKey') }}
          </a-button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, reactive, computed, watch } from 'vue'
import { Modal, message } from 'ant-design-vue'
import { EditOutlined, DeleteOutlined, ToTopOutlined, SearchOutlined } from '@ant-design/icons-vue'
import keyIcon from '@/assets/menu/key.svg'
import i18n from '@/locales'
import eventBus from '@/utils/eventBus'
const { t } = i18n.global

interface KeyChainItem {
  key_chain_id: number
  chain_name: string
  chain_type: string
  private_key?: string
  public_key?: string
  passphrase?: string
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
  type: string
  passphrase: string
}

const createForm = reactive<CreateFormType>({
  label: '',
  privateKey: '',
  publicKey: '',
  type: 'RSA',
  passphrase: ''
})

const resetForm = () => {
  Object.assign(createForm, {
    label: '',
    privateKey: '',
    publicKey: '',
    type: 'RSA',
    passphrase: ''
  })
}

const filteredKeyChainList = computed(() => {
  if (!searchValue.value.trim()) return keyChainList.value

  const lowerCaseInput = searchValue.value.toLowerCase()
  return keyChainList.value.filter(
    (item) => item.chain_name.toLowerCase().includes(lowerCaseInput) || item.chain_type.toLowerCase().includes(lowerCaseInput)
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
    console.error('获取秘钥列表失败:', error)
    message.error('获取秘钥列表失败')
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
  const menuWidth = 160
  const menuHeight = 120
  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight
  let x = event.clientX
  let y = event.clientY
  if (x + menuWidth > viewportWidth) {
    x = viewportWidth - menuWidth - 10
  }
  if (y + menuHeight > viewportHeight) {
    y = viewportHeight - menuHeight - 10
  }
  x = Math.max(10, x)
  y = Math.max(10, y)

  contextMenuPosition.x = x
  contextMenuPosition.y = y
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
  console.log('Card clicked:', keyChain)
}

const handleEdit = async (keyChain: KeyChainItem | null) => {
  if (!keyChain) return
  editingKeyChainId.value = keyChain.key_chain_id

  const api = window.api as any
  await api.getKeyChainInfo({ id: keyChain.key_chain_id }).then((res) => {
    keyChain = res
    console.log(keyChain)
  })
  isEditMode.value = true
  console.log('sss')
  console.log(keyChain)

  Object.assign(createForm, {
    label: keyChain.chain_name || '',
    privateKey: keyChain.private_key || '',
    publicKey: keyChain.public_key || '',
    type: keyChain.chain_type || 'RSA',
    passphrase: keyChain.passphrase || ''
  })
  isRightSectionVisible.value = true
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
          console.error('deleteKeyChain API not implemented')
          message.error(t('keyChain.deleteError'))
        }
      } catch (err: any) {
        message.error(t('keyChain.deleteError', { error: err.message || '未知错误' }))
      }
    }
  })
}

const handleCreateKeyChain = async () => {
  try {
    if (!createForm.label) {
      return message.error('请输入标签名称')
    }
    if (!createForm.privateKey) {
      return message.error('请输入私钥')
    }
    const api = window.api as any
    if (api.createKeyChain) {
      const cleanForm = {
        chain_name: createForm.label,
        private_key: createForm.privateKey,
        public_key: createForm.publicKey,
        chain_type: createForm.type,
        passphrase: createForm.passphrase
      }
      cleanForm.chain_type = detectKeyType(createForm.privateKey, createForm.publicKey)

      const res = await api.createKeyChain({ form: cleanForm })
      if (res?.data?.message === 'success') {
        message.success('创建成功')
        isRightSectionVisible.value = false
        fetchKeyChainList()
        eventBus.emit('keyChainUpdated')
      } else {
        throw new Error('创建失败')
      }
    }
  } catch (e: any) {
    message.error(e.message || '创建出错')
  }
}

const handleUpdateKeyChain = async () => {
  if (!editingKeyChainId.value) return message.error('缺少密钥 ID')

  try {
    if (!createForm.label) {
      return message.error('请输入标签名称')
    }
    if (!createForm.privateKey) {
      return message.error('请输入私钥')
    }

    const api = window.api as any
    if (api.updateKeyChain) {
      const cleanForm = {
        key_chain_id: editingKeyChainId.value,
        chain_name: createForm.label,
        private_key: createForm.privateKey,
        public_key: createForm.publicKey,
        chain_type: createForm.type,
        passphrase: createForm.passphrase
      }
      cleanForm.chain_type = detectKeyType(createForm.privateKey, createForm.publicKey)

      const res = await api.updateKeyChain({ form: cleanForm })
      if (res?.data?.message === 'success') {
        message.success('保存成功')
        isRightSectionVisible.value = false
        fetchKeyChainList()
        eventBus.emit('keyChainUpdated')
      } else {
        throw new Error('保存失败')
      }
    } else {
      console.error('updateKeyChain API not implemented')
    }
  } catch (e: any) {
    message.error(e.message || '保存出错')
  }
}

const handleSearch = () => {}

const handleDocumentClick = () => {
  if (contextMenuVisible.value) {
    contextMenuVisible.value = false
  }
}

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
      /* 忽略 */
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
      message.success('密钥文件已导入')
    }
    reader.onerror = () => {
      message.error('读取文件失败')
    }
    reader.readAsText(file)
  }
}

function handleClickUpload() {
  if (fileInputRef.value) {
    fileInputRef.value.value = '' // 清空，确保可重复选择同一文件
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
      message.success('密钥文件已导入')
    }
    reader.onerror = () => {
      message.error('读取文件失败')
    }
    reader.readAsText(file)
  }
}

onMounted(() => {
  fetchKeyChainList()
  document.addEventListener('click', handleDocumentClick)
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && contextMenuVisible.value) {
      contextMenuVisible.value = false
    }
  })
})

onBeforeUnmount(() => {
  document.removeEventListener('click', handleDocumentClick)
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
  width: 100%; /* 确保左侧部分占满可用空间 */
}

.search-input {
  background-color: var(--bg-color-secondary);
  border-color: var(--border-color);
  color: var(--text-color);
  :deep(.ant-input) {
    background-color: var(--bg-color-secondary);
    color: var(--text-color);

    &::placeholder {
      color: var(--text-color-tertiary);
    }
  }

  :deep(.ant-input-prefix) {
    color: var(--text-color-secondary);
    margin-right: 8px;
  }
}

.keychain-list-container {
  width: 100%;
}

.keychain-cards {
  display: flex;
  flex-wrap: wrap;
  gap: 15px;
  margin-bottom: 20px;
}

/* 当右侧面板关闭时，显示更多卡片 */
.keychain-cards.wide-layout {
  .card-wrapper {
    width: calc(33.33% - 10px); /* 一行显示3个，考虑15px的间距 */
  }
}

/* 当右侧面板打开时，显示较少卡片 */
.keychain-cards:not(.wide-layout) {
  .card-wrapper {
    width: calc(50% - 7.5px); /* 一行显示2个，考虑15px的间距 */
  }
}

/* 卡片包装器，用于控制宽度 */
.card-wrapper {
  margin-bottom: 0;
  transition: width 0.3s ease;
}

/* 移动端适配 */
@media (max-width: 768px) {
  .keychain-cards {
    .card-wrapper {
      width: 100% !important; /* 小屏幕一行显示1个 */
    }
  }
}

.keychain-card {
  position: relative;
  padding-right: 36px;
  background-color: var(--bg-color-secondary);
  border-radius: 8px;
  overflow: hidden;
  cursor: pointer;
  transition: all 0.3s ease;

  &:hover {
    background-color: var(--hover-bg-color);
  }
}

.edit-icon {
  position: absolute;
  top: 50%;
  right: 24px;
  transform: translateY(-50%);
  color: var(--text-color-tertiary);
  font-size: 22px;
  opacity: 0;
  pointer-events: none;
  transition:
    opacity 0.2s ease,
    color 0.2s ease;
}

.keychain-card:hover .edit-icon {
  opacity: 1;
  pointer-events: auto; /* 允许点击 */
}

.edit-icon:hover {
  color: #1890ff;
}

.keychain-card-content {
  display: flex;
  align-items: center;
  min-height: 60px; /* 确保卡片有最小高度 */
}

.keychain-icon {
  width: 40px;
  height: 40px;
  min-width: 40px; /* 确保图标不会被压缩 */
  display: flex;
  align-items: center;
  justify-content: center;
  margin-right: 12px;

  img {
    filter: brightness(0) saturate(100%) invert(48%) sepia(57%) saturate(2303%) hue-rotate(198deg) brightness(102%) contrast(96%);
  }

  :global(.light-theme) & img {
    filter: brightness(0) saturate(100%) invert(31%) sepia(98%) saturate(1720%) hue-rotate(199deg) brightness(95%) contrast(107%);
  }
}

.keychain-info {
  flex: 1;
  overflow: hidden; /* 防止内容溢出 */
}

.keychain-name {
  font-size: 14px;
  font-weight: bold;
  color: var(--text-color);
  margin-bottom: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis; /* 文本过长时显示省略号 */
}

.keychain-type {
  font-size: 12px;
  color: var(--text-color-tertiary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis; /* 文本过长时显示省略号 */
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
  color: rgba(255, 255, 255, 0.85);
  :deep(.ant-form-item) {
    margin-bottom: 12px;
    color: rgba(255, 255, 255, 0.65);
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

/* 右侧表单输入框样式 */
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

.context-menu {
  position: fixed;
  z-index: 1000;
  background-color: var(--bg-color);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  box-shadow:
    0 8px 32px rgba(0, 0, 0, 0.1),
    0 4px 16px rgba(0, 0, 0, 0.08),
    inset 0 1px 0 rgba(255, 255, 255, 0.1);
  min-width: 160px;
  padding: 6px 0;
  backdrop-filter: blur(20px);
  animation: contextMenuFadeIn 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  overflow: hidden;
}

@keyframes contextMenuFadeIn {
  from {
    opacity: 0;
    transform: scale(0.9) translateY(-8px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

.context-menu-item {
  display: flex;
  align-items: center;
  padding: 8px 16px;
  cursor: pointer;
  color: var(--text-color);
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
  font-size: 14px;
  font-weight: 500;
  margin: 0 4px;
  border-radius: 8px;

  &:hover {
    background-color: var(--hover-bg-color);
    color: var(--text-color);
    transform: translateX(2px);

    .context-menu-icon {
      transform: scale(1.1);
      color: #1890ff;
    }
  }

  &:active {
    background-color: var(--active-bg-color);
    transform: translateX(2px) scale(0.98);
  }

  &.delete {
    color: #ff6b6b;

    &:hover {
      background-color: rgba(255, 107, 107, 0.15);
      color: #ff8e8e;

      .context-menu-icon {
        color: #ff6b6b;
      }
    }

    &:active {
      background-color: rgba(255, 107, 107, 0.2);
    }
  }

  /* 添加分隔线 */
  &:not(:last-child)::after {
    content: '';
    position: absolute;
    bottom: 0;
    left: 20px;
    right: 20px;
    height: 1px;
    background: linear-gradient(90deg, transparent 0%, var(--border-color) 50%, transparent 100%);
  }
}

.context-menu-icon {
  margin-right: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  font-size: 14px;
  color: var(--text-color-tertiary);
}

.context-menu-text {
  flex: 1;
  font-weight: 500;
  letter-spacing: 0.3px;
  user-select: none;
}

/* 确保右键菜单在边界内显示 */
.context-menu {
  max-width: calc(100vw - 20px);
  max-height: calc(100vh - 20px);
  overflow: hidden;
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
</style>
