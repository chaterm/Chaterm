<template>
  <div class="keychain-config-container">
    <div class="split-layout">
      <div class="left-section">
        <div class="header-container">
          <div
            class="toggle-btn"
            @click="openNewPanel"
          >
            <a-button
              type="primary"
              size="small"
              class="workspace-button"
            >
              <template #icon><KeyOutlined /></template>{{ $t('personal.newKey') }}
            </a-button>
          </div>
          <div class="search-box">
            <a-input
              v-model:value="searchValue"
              placeholder="搜索..."
              class="search-input"
              @input="handleSearch"
            >
              <template #prefix>
                <KeyOutlined />
              </template>
            </a-input>
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
                    <KeyOutlined style="font-size: 24px" />
                  </div>
                  <div class="keychain-info">
                    <div class="keychain-name">{{ item.chain_name }}</div>
                    <div class="keychain-type">Type: {{ item.chain_type }}</div>
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
            <div class="context-menu-text">Edit</div>
          </div>
          <div
            class="context-menu-item"
            @click="handleRemove(selectedKeyChain)"
          >
            <div class="context-menu-icon"><DeleteOutlined /></div>
            <div class="context-menu-text">Remove</div>
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
            <h3>{{ isEditMode ? 'Edit Key' : 'New Key' }}</h3>
          </div>
          <ToTopOutlined
            style="font-size: 20px; transform: rotate(90deg); cursor: pointer"
            class="top-icon"
            @click="isRightSectionVisible = false"
          />
        </div>

        <br />
        <a-card class="form-card">
          <div class="input-container">
            <div class="input-label">Label*</div>
            <a-input
              v-model:value="createForm.label"
              placeholder="Label"
            />
          </div>
          <div class="input-container-textarea">
            <div class="input-label">Private key*</div>
            <a-textarea
              v-model:value="createForm.privateKey"
              :rows="4"
              :auto-size="{ minRows: 6, maxRows: 8 }"
              spellcheck="false"
              autocorrect="off"
              autocapitalize="off"
              autocomplete="off"
            />
          </div>
          <div class="input-container-textarea">
            <div class="input-label">Public key</div>
            <a-textarea
              v-model:value="createForm.publicKey"
              :rows="4"
              :auto-size="{ minRows: 5, maxRows: 8 }"
              spellcheck="false"
              autocorrect="off"
              autocapitalize="off"
              autocomplete="off"
            />
          </div>
          <div class="input-container">
            <div class="input-label">Passphrase</div>
            <a-input-password v-model:value="createForm.passphrase" />
          </div>
        </a-card>
        <div class="form-actions">
          <a-button
            type="primary"
            class="form-actions-button"
            @click="isEditMode ? handleUpdateKeyChain() : handleCreateKeyChain()"
          >
            {{ isEditMode ? 'Save' : 'Create' }}
          </a-button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, reactive, computed, watch } from 'vue'
import { Modal, message } from 'ant-design-vue'
import { KeyOutlined, EditOutlined, DeleteOutlined, ToTopOutlined } from '@ant-design/icons-vue'

interface KeyChainItem {
  key_chain_id: number
  chain_name: string
  chain_type: string
  private_key?: string
  public_key?: string
  passphrase?: string
}

// 注意：这里我们不重新定义全局接口，而是使用类型断言

// 状态变量
const keyChainList = ref<KeyChainItem[]>([])
const searchValue = ref('')
const isRightSectionVisible = ref(false)
const isEditMode = ref(false)
const editingKeyChainId = ref<number | null>(null)
const contextMenuVisible = ref(false)
const contextMenuPosition = reactive({ x: 0, y: 0 })
const selectedKeyChain = ref<KeyChainItem | null>(null)

// 表单数据
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

// 重置表单
const resetForm = () => {
  Object.assign(createForm, {
    label: '',
    privateKey: '',
    publicKey: '',
    type: 'RSA',
    passphrase: ''
  })
}

// 过滤密钥列表
const filteredKeyChainList = computed(() => {
  if (!searchValue.value.trim()) return keyChainList.value

  const lowerCaseInput = searchValue.value.toLowerCase()
  return keyChainList.value.filter(
    (item) =>
      item.chain_name.toLowerCase().includes(lowerCaseInput) ||
      item.chain_type.toLowerCase().includes(lowerCaseInput)
  )
})

// 获取秘钥列表
const fetchKeyChainList = async () => {
  try {
    // 使用类型断言
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

// 打开新建面板
const openNewPanel = () => {
  isEditMode.value = false
  editingKeyChainId.value = null
  resetForm()
  isRightSectionVisible.value = true
}

// 显示右键菜单
const showContextMenu = (event: MouseEvent, keyChain: KeyChainItem) => {
  event.preventDefault()
  contextMenuPosition.x = event.clientX
  contextMenuPosition.y = event.clientY
  selectedKeyChain.value = keyChain
  contextMenuVisible.value = true

  // 点击其他区域关闭菜单
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
  // 这里可以添加连接逻辑
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

  // 填充表单
  Object.assign(createForm, {
    label: keyChain.chain_name || '',
    privateKey: keyChain.private_key || '',
    publicKey: keyChain.public_key || '',
    type: keyChain.chain_type || 'RSA',
    passphrase: keyChain.passphrase || ''
  })
  // 显示右侧面板
  isRightSectionVisible.value = true
}

// 处理删除
const handleRemove = (keyChain: KeyChainItem | null) => {
  if (!keyChain) return

  // 确认删除
  Modal.confirm({
    title: '删除确认',
    content: `确定要删除密钥 "${keyChain.chain_name}" 吗？`,
    okText: '删除',
    okType: 'danger',
    cancelText: '取消',
    maskClosable: true,
    onOk: async () => {
      try {
        // 使用类型断言
        const api = window.api as any
        // 这里需要实现删除API
        if (api.deleteKeyChain) {
          const res = await api.deleteKeyChain({ id: keyChain.key_chain_id })
          if (res?.data?.message === 'success') {
            message.success(`删除密钥 ${keyChain.chain_name} 成功`)
            fetchKeyChainList()
          } else {
            message.error('删除失败')
          }
        } else {
          console.error('deleteKeyChain API not implemented')
          message.error('删除功能尚未实现')
        }
      } catch (err: any) {
        message.error(`删除出错: ${err.message || '未知错误'}`)
      }
    }
  })
}

// 创建密钥
const handleCreateKeyChain = async () => {
  try {
    // 验证表单
    if (!createForm.label) {
      return message.error('请输入标签名称')
    }
    if (!createForm.privateKey) {
      return message.error('请输入私钥')
    }

    // 使用类型断言
    const api = window.api as any
    // 创建密钥
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
      } else {
        throw new Error('创建失败')
      }
    }
  } catch (e: any) {
    message.error(e.message || '创建出错')
  }
}

// 更新密钥
const handleUpdateKeyChain = async () => {
  if (!editingKeyChainId.value) return message.error('缺少密钥 ID')

  try {
    // 验证表单
    if (!createForm.label) {
      return message.error('请输入标签名称')
    }
    if (!createForm.privateKey) {
      return message.error('请输入私钥')
    }

    // 使用类型断言
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

// 搜索处理
const handleSearch = () => {
  // 搜索逻辑已通过计算属性 filteredKeyChainList 实现
}

// 点击页面关闭右键菜单
const handleDocumentClick = () => {
  if (contextMenuVisible.value) {
    contextMenuVisible.value = false
  }
}

function detectKeyType(privateKey = '', publicKey = ''): 'RSA' | 'ED25519' | 'ECDSA' {
  // 1. 先看 public key
  if (publicKey.trim()) {
    const algo = publicKey.trim().split(/\s+/)[0] // 取第一段
    if (algo === 'ssh-ed25519') return 'ED25519'
    if (algo === 'ssh-rsa') return 'RSA'
    if (algo.startsWith('ecdsa-')) return 'ECDSA'
  }

  // 2. 再看 private key PEM 头
  if (privateKey.includes('BEGIN RSA PRIVATE KEY')) return 'RSA'
  if (privateKey.includes('BEGIN EC PRIVATE KEY')) return 'ECDSA'

  // 3. OpenSSH 私钥（新的统一格式）
  if (privateKey.includes('BEGIN OPENSSH PRIVATE KEY')) {
    try {
      // 去掉头尾、换行和空格，得到纯 Base64
      const body = privateKey.replace(/-----(BEGIN|END)[\s\S]+?KEY-----/g, '').replace(/\s+/g, '')
      // 解码看看里面出现谁
      const decoded = atob(body)
      if (decoded.includes('ssh-ed25519')) return 'ED25519'
      if (decoded.includes('ssh-rsa')) return 'RSA'
      if (decoded.includes('ecdsa-sha2')) return 'ECDSA'
    } catch (_) {
      /* 忽略 */
    }
  }

  // 4. 兜底：默认 RSA
  return 'RSA'
}

onMounted(() => {
  fetchKeyChainList()

  // 添加全局点击事件监听
  document.addEventListener('click', handleDocumentClick)
})

onBeforeUnmount(() => {
  // 移除全局事件监听
  document.removeEventListener('click', handleDocumentClick)
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
  height: 28px;
  display: flex;
  align-items: center;
  background-color: rgb(90, 94, 115);
  border-color: rgb(90, 94, 115);

  &:hover {
    background-color: rgb(110, 114, 135);
    border-color: rgb(110, 114, 135);
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
  padding: 15px;
  padding-top: 50px;
  overflow-y: auto;
  background-color: #1a1a1a;
  width: 100%; /* 确保左侧部分占满可用空间 */
}

/* 移除旧的搜索容器样式 */

.search-input {
  background-color: #3a3a3a;
  border-color: #3a3a3a;
  color: white;

  :deep(.ant-input) {
    background-color: #3a3a3a;
    color: white;

    &::placeholder {
      color: rgba(255, 255, 255, 0.5);
    }
  }

  :deep(.ant-input-prefix) {
    color: rgba(255, 255, 255, 0.7);
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
  background-color: #2c2c2c;
  border-radius: 8px;
  overflow: hidden;
  cursor: pointer;
  transition: all 0.3s ease;

  &:hover {
    background-color: #383838;
  }

  :deep(.ant-card-body) {
    padding: 12px;
  }
}

.edit-icon {
  position: absolute;
  top: 50%;
  right: 24px;
  transform: translateY(-50%);
  color: rgba(255, 255, 255, 0.6);
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
  color: #1890ff;
  margin-right: 12px;
}

.keychain-info {
  flex: 1;
  overflow: hidden; /* 防止内容溢出 */
}

.keychain-name {
  font-size: 14px;
  font-weight: bold;
  color: white;
  margin-bottom: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis; /* 文本过长时显示省略号 */
}

.keychain-type {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.6);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis; /* 文本过长时显示省略号 */
}

.right-section {
  flex: 0 0 30%;
  background: #2c2c2c;
  border-left: 1px solid var(--ev-c-white);
  transition: all 0.3s ease;
  height: 100%;
  display: flex;
  flex-direction: column;
  box-sizing: border-box; /* 确保内边距不会增加元素的总尺寸 */
  padding: 0;
  overflow: hidden;
  max-width: 30%; /* 限制最大宽度 */
}

.right-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 16px 16px 0 16px;
  flex-shrink: 0;
}

.right-section-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 16px 16px 0 16px;
  overflow: auto;
  height: calc(100% - 40px);
}

.form-card {
  margin: 0 10px 10px;
  margin-bottom: 16px;
  background-color: #f5f5f5;
  border: 1px solid #d9d9d9;
  border-radius: 10px;

  :deep(.ant-card-body) {
    padding: 5px;
  }
}
.input-container {
  margin: 5px;
  margin-bottom: 10px;
  .input-label {
    color: rgba(38, 106, 55, 0.9);
    font-size: 12px;
    margin-bottom: 4px;
  }
}

.input-container-textarea {
  margin: 5px;
  margin-bottom: 10px;
  :deep(.ant-input),
  :deep(.ant-input-textarea) {
    font-size: 12px;
    line-height: 1.4;
  }
  .input-label {
    color: rgba(38, 106, 55, 0.9);
    font-size: 12px;
    margin-bottom: 4px;
  }
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
  margin-bottom: 16px;
}

/* 右键菜单样式 */
.context-menu {
  position: fixed;
  z-index: 1000;
  background-color: #2c2c2c;
  border-radius: 4px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  padding: 4px 0;
  min-width: 160px;
}

.context-menu-item {
  display: flex;
  align-items: center;
  padding: 8px 12px;
  cursor: pointer;
  transition: background-color 0.2s;
  color: white;

  &:hover {
    background-color: #383838;
  }
}

.context-menu-icon {
  margin-right: 8px;
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.context-menu-text {
  flex: 1;
}

/* 右侧表单样式 */
:deep(.ant-form-item-label > label) {
  color: white;
}

/* 右侧表单输入框样式 */
.right-section {
  :deep(.ant-input),
  :deep(.ant-input-password),
  :deep(.ant-select:not(.ant-select-customize-input) .ant-select-selector),
  :deep(.ant-input-number),
  :deep(.ant-picker),
  :deep(.ant-input-affix-wrapper),
  :deep(.ant-textarea) {
    background-color: white;
    border-color: #d9d9d9;
    color: rgba(0, 0, 0, 0.85);

    &::placeholder {
      color: rgba(0, 0, 0, 0.45);
    }

    &:hover,
    &:focus {
      border-color: #1890ff;
      box-shadow: 0 0 0 2px rgba(24, 144, 255, 0.2);
    }
  }
}

:deep(.ant-select-dropdown) {
  background-color: #3a3a3a;
}

:deep(.ant-select-item) {
  color: white;
}

:deep(.ant-select-item-option-selected:not(.ant-select-item-option-disabled)) {
  background-color: #1890ff;
  color: white;
}

:deep(.ant-select-item-option-active:not(.ant-select-item-option-disabled)) {
  background-color: #4a4a4a;
}

.header-container {
  display: flex;
  justify-content: space-between;
  align-items: center;
  position: absolute;
  top: 10px;
  left: 10px;
  right: 10px;
  z-index: 10;
}

.toggle-btn {
  flex: 0 0 auto;
}

.search-box {
  flex: 0 0 auto;
  width: 200px;
}
.form-actions-button {
  width: 96%;
  margin: 0 auto;
  height: 40px;
  font-size: 16px;
  border-radius: 12px;
  background-color: #1890ff;
  border-color: #1890ff;
  &:hover {
    background-color: #40a9ff;
    border-color: #40a9ff;
  }
}
</style>
