<template>
  <div class="asset-config-container">
    <div class="split-layout">
      <div class="left-section">
        <AssetSearch
          v-model="searchValue"
          @search="handleSearch"
          @new-asset="openNewPanel"
          @import-assets="handleImportAssets"
          @export-assets="handleExportAssets"
        />
        <AssetList
          :asset-groups="assetGroups"
          :search-value="searchValue"
          :wide-layout="!isRightSectionVisible"
          @asset-click="handleAssetClick"
          @asset-double-click="handleAssetConnect"
          @asset-edit="handleAssetEdit"
          @asset-context-menu="handleAssetContextMenu"
        />
        <AssetContextMenu
          v-if="contextMenuVisible"
          :visible="contextMenuVisible"
          :position="contextMenuPosition"
          :asset="selectedAsset"
          @close="closeContextMenu"
          @connect="handleContextMenuConnect"
          @edit="handleContextMenuEdit"
          @refresh="handleContextMenuRefresh"
          @remove="handleContextMenuRemove"
        />
      </div>

      <div
        class="right-section"
        :class="{ collapsed: !isRightSectionVisible }"
      >
        <AssetForm
          v-if="isRightSectionVisible"
          :is-edit-mode="isEditMode"
          :initial-data="formData"
          :key-chain-options="keyChainOptions"
          :default-groups="defaultGroups"
          @close="closeForm"
          @submit="handleFormSubmit"
          @add-keychain="addKeychain"
          @auth-change="handleAuthChange"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Modal, message } from 'ant-design-vue'
import { ref, onMounted, onBeforeUnmount, reactive, watch } from 'vue'
import AssetSearch from './components/AssetSearch.vue'
import AssetList from './components/AssetList.vue'
import AssetForm from './components/AssetForm.vue'
import AssetContextMenu from './components/AssetContextMenu.vue'
import eventBus from '@/utils/eventBus'
import i18n from '@/locales'
import { handleRefreshOrganizationAssets } from './components/refreshOrganizationAssets'
import type { AssetNode, AssetFormData, KeyChainItem } from './types'

const { t } = i18n.global

const isEditMode = ref(false)
const editingAssetUUID = ref<string | null>(null)
const isRightSectionVisible = ref(false)
const searchValue = ref('')
const assetGroups = ref<AssetNode[]>([])
const keyChainOptions = ref<KeyChainItem[]>([])
const defaultGroups = ref(['development', 'production', 'staging', 'testing', 'database'])
const contextMenuVisible = ref(false)
const contextMenuPosition = reactive({ x: 0, y: 0 })
const selectedAsset = ref<AssetNode | null>(null)

const formData = reactive<AssetFormData>({
  username: '',
  password: '',
  ip: '',
  label: '',
  group_name: t('personal.defaultGroup'),
  auth_type: 'password',
  keyChain: undefined,
  port: 22,
  asset_type: 'person'
})

const resetForm = () => {
  Object.assign(formData, {
    username: '',
    password: '',
    ip: '',
    label: '',
    group_name: t('personal.defaultGroup'),
    auth_type: 'password',
    keyChain: undefined,
    port: 22,
    asset_type: 'person'
  })
}

const openNewPanel = () => {
  isEditMode.value = false
  editingAssetUUID.value = null
  resetForm()
  getAssetGroup()
  if (formData.auth_type === 'keyBased') {
    getkeyChainData()
  }
  isRightSectionVisible.value = true
}

const closeForm = () => {
  isRightSectionVisible.value = false
}

const handleSearch = () => {
  // Search is handled by computed property in AssetList, so we don't need to do anything here
}

const handleAssetClick = (asset: AssetNode) => {
  console.log('Asset clicked:', asset)
}

const handleAssetConnect = (asset: AssetNode) => {
  console.log('Connecting to asset:', asset)
  eventBus.emit('currentClickServer', asset)
}

const handleAssetEdit = (asset: AssetNode) => {
  if (!asset) return
  isEditMode.value = true
  editingAssetUUID.value = asset.uuid || null

  let keyChain = asset.key_chain_id
  console.log('keyChain: ', keyChain)
  if (keyChain === 0) {
    keyChain = undefined
  }

  Object.assign(formData, {
    username: asset.username || '',
    password: asset.password || '',
    ip: asset.ip || '',
    label: asset.title || '',
    group_name: asset.group_name || 'Hosts',
    auth_type: asset.auth_type || 'password',
    keyChain: keyChain,
    port: asset.port || 22,
    asset_type: asset.asset_type || 'person'
  })

  getAssetGroup()
  if (formData.auth_type === 'keyBased') {
    getkeyChainData()
  }
  isRightSectionVisible.value = true
}

const handleAssetRefresh = async (asset: AssetNode) => {
  if (!asset || asset.asset_type !== 'organization') return

  await handleRefreshOrganizationAssets(asset, () => {
    getAssetList()
  })
  closeContextMenu()
}

const handleAssetContextMenu = (event: MouseEvent, asset: AssetNode) => {
  event.preventDefault()
  contextMenuPosition.x = event.clientX
  contextMenuPosition.y = event.clientY
  selectedAsset.value = asset
  contextMenuVisible.value = true

  const closeMenu = () => {
    contextMenuVisible.value = false
    document.removeEventListener('click', closeMenu)
  }

  setTimeout(() => {
    document.addEventListener('click', closeMenu)
  }, 0)
}

const closeContextMenu = () => {
  contextMenuVisible.value = false
}

const handleContextMenuConnect = () => {
  if (selectedAsset.value) {
    handleAssetConnect(selectedAsset.value)
  }
  closeContextMenu()
}

const handleContextMenuEdit = () => {
  if (selectedAsset.value) {
    handleAssetEdit(selectedAsset.value)
  }
  closeContextMenu()
}

const handleContextMenuRefresh = () => {
  if (selectedAsset.value) {
    handleAssetRefresh(selectedAsset.value)
  }
}

const handleContextMenuRemove = () => {
  if (selectedAsset.value) {
    handleAssetRemove(selectedAsset.value)
  }
}

const handleAssetRemove = (asset: AssetNode) => {
  if (!asset || !asset.uuid) return
  closeContextMenu()
  Modal.confirm({
    title: t('personal.deleteConfirm'),
    content: t('personal.deleteConfirmContent', { name: asset.title }),
    okText: t('common.delete'),
    okType: 'danger',
    cancelText: t('common.cancel'),
    maskClosable: true,
    onOk: async () => {
      try {
        const api = window.api as any
        const res = await api.deleteAsset({ uuid: asset.uuid })
        if (res?.data?.message === 'success') {
          message.success(t('personal.deleteSuccess', { name: asset.title }))
          getAssetList()
          eventBus.emit('LocalAssetMenu')
        } else {
          message.error(t('personal.deleteFailure'))
        }
      } catch (err: any) {
        message.error(t('personal.deleteError', { error: err.message || t('ssh.unknownError') }))
      }
    }
  })
}

const handleImportAssets = async (assets: any[]) => {
  if (!assets || assets.length === 0) {
    message.warning(t('personal.importNoData'))
    return
  }

  try {
    const api = window.api as any
    let successCount = 0
    let errorCount = 0

    for (const asset of assets) {
      try {
        if (!asset.ip || !asset.username) {
          errorCount++
          continue
        }

        const cleanForm = {
          username: asset.username || '',
          password: asset.password || '',
          ip: asset.ip || '',
          label: asset.label || asset.ip,
          group_name: asset.group_name || t('personal.defaultGroup'),
          auth_type: asset.auth_type || 'password',
          keyChain: asset.keyChain,
          port: asset.port || 22,
          asset_type: asset.asset_type || 'person'
        }

        const result = await api.createAsset({ form: cleanForm })
        if (result && result.data && result.data.message === 'success') {
          successCount++
        } else {
          errorCount++
        }
      } catch (error) {
        console.error('Import asset error:', error)
        errorCount++
      }
    }

    if (successCount > 0) {
      message.success(t('personal.importSuccessCount', { count: successCount }))
      getAssetList()
      eventBus.emit('LocalAssetMenu')
    }

    if (errorCount > 0) {
      message.warning(t('personal.importErrorCount', { count: errorCount }))
    }
  } catch (error) {
    console.error('Batch import error:', error)
    message.error(t('personal.importError'))
  }
}

const handleExportAssets = () => {
  try {
    const allAssets: any[] = []

    const extractAssets = (nodes: AssetNode[]) => {
      nodes.forEach((node) => {
        if (node.children && node.children.length > 0) {
          extractAssets(node.children)
        } else {
          if (node.ip && node.username) {
            allAssets.push({
              username: node.username,
              password: node.password || '',
              ip: node.ip,
              label: node.label || node.title,
              group_name: node.group_name,
              auth_type: node.auth_type || 'password',
              keyChain: node.key_chain_id,
              port: node.port || 22,
              asset_type: node.asset_type || 'person'
            })
          }
        }
      })
    }

    extractAssets(assetGroups.value)

    if (allAssets.length === 0) {
      message.warning(t('personal.exportNoData'))
      return
    }

    const dataStr = JSON.stringify(allAssets, null, 2)
    const dataBlob = new Blob([dataStr], { type: 'application/json' })
    const url = URL.createObjectURL(dataBlob)

    const link = document.createElement('a')
    link.href = url
    link.download = `chaterm-assets-${new Date().toISOString().split('T')[0]}.json`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)

    message.success(t('personal.exportSuccess', { count: allAssets.length }))
  } catch (error) {
    console.error('Export assets error:', error)
    message.error(t('personal.exportError'))
  }
}

const handleAuthChange = (authType: string) => {
  if (authType === 'keyBased') {
    getkeyChainData()
  }
}

const getkeyChainData = () => {
  const api = window.api as any
  api.getKeyChainSelect().then((res) => {
    keyChainOptions.value = res.data.keyChain
  })
}

const getAssetGroup = () => {
  const api = window.api as any
  api.getAssetGroup().then((res) => {
    defaultGroups.value = res.data.groups
  })
}

const addKeychain = () => {
  eventBus.emit('openUserTab', 'keyChainConfig')
}

const handleFormSubmit = async (data: AssetFormData) => {
  try {
    if (isEditMode.value) {
      await handleSaveAsset(data)
    } else {
      await handleCreateAsset(data)
    }
  } catch (error) {
    console.error('Form submission error:', error)
  }
}

const handleCreateAsset = async (data: AssetFormData) => {
  try {
    let groupName = data.group_name
    if (Array.isArray(groupName) && groupName.length > 0) {
      groupName = groupName[0]
    }

    const cleanForm = {
      username: data.username,
      password: data.password,
      ip: data.ip,
      label: data.label || data.ip,
      group_name: groupName,
      auth_type: data.auth_type,
      keyChain: data.keyChain,
      port: data.port,
      asset_type: data.asset_type
    }

    const api = window.api as any
    const result = await api.createAsset({ form: cleanForm })

    if (result && result.data && result.data.message === 'success') {
      message.success(t('personal.createSuccess'))
      resetForm()
      isRightSectionVisible.value = false
      getAssetList()
      eventBus.emit('LocalAssetMenu')
    } else {
      throw new Error('Failed to create asset')
    }
  } catch (error) {
    console.error('Create asset error:', error)
    message.error(t('personal.createError'))
  }
}

const handleSaveAsset = async (data: AssetFormData) => {
  if (!editingAssetUUID.value) {
    message.error(t('personal.missingAssetId'))
    return
  }

  try {
    let groupName = data.group_name
    if (Array.isArray(groupName) && groupName.length > 0) {
      groupName = groupName[0]
    }

    const cleanForm = {
      uuid: editingAssetUUID.value,
      username: data.username,
      password: data.password,
      ip: data.ip,
      label: data.label || data.ip,
      group_name: groupName,
      auth_type: data.auth_type,
      keyChain: data.keyChain,
      port: data.port,
      asset_type: data.asset_type
    }

    const api = window.api as any
    const res = await api.updateAsset({ form: cleanForm })

    if (res?.data?.message === 'success') {
      message.success(t('personal.saveSuccess'))
      isRightSectionVisible.value = false
      getAssetList()
      eventBus.emit('LocalAssetMenu')
    } else {
      throw new Error('保存失败')
    }
  } catch (e: any) {
    message.error(e.message || t('personal.saveError'))
  }
}

const getAssetList = () => {
  const api = window.api as any
  api
    .getLocalAssetRoute({ searchType: 'assetConfig', params: [] })
    .then((res) => {
      if (res && res.data) {
        const data = res.data.routers || []
        assetGroups.value = data as AssetNode[]
      } else {
        assetGroups.value = []
      }
    })
    .catch((err) => console.error(err))
}

onMounted(() => {
  getAssetList()
  getkeyChainData()
  eventBus.on('keyChainUpdated', () => {
    getkeyChainData()
  })
  // 监听语言变更事件，重新加载资产数据
  eventBus.on('languageChanged', () => {
    console.log('Language changed in asset config, refreshing asset list...')
    getAssetList()
    eventBus.emit('LocalAssetMenu') // 通知工作空间组件也刷新
  })
})

onBeforeUnmount(() => {
  eventBus.off('keyChainUpdated')
  eventBus.off('languageChanged')
})

watch(isRightSectionVisible, (val) => {
  if (!val) {
    resetForm()
    isEditMode.value = false
    editingAssetUUID.value = null
  }
})
</script>

<style lang="less" scoped>
.asset-config-container {
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

.right-section.collapsed {
  flex: 0 0 0 !important;
  width: 0 !important;
  max-width: 0 !important;
  min-width: 0 !important;
  flex: 0 !important;
  border-left: 0 !important;
  padding: 0;
  margin: 0;
  opacity: 0;
  visibility: hidden;
  overflow: hidden;
  pointer-events: none;
}
</style>
