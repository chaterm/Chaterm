<template>
  <div class="asset-config-container">
    <div class="split-layout">
      <div class="left-section">
        <AssetSearch
          v-model="searchValue"
          @search="handleSearch"
          @new-asset="openNewPanel"
          @import-assets="handleImportAssets"
          @import-file="handleImportFile"
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
          @clone="handleContextMenuClone"
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
          :ssh-proxy-configs="sshProxyConfigs"
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
import { Modal, message, notification } from 'ant-design-vue'
import { ref, onMounted, onBeforeUnmount, reactive, watch, h } from 'vue'
import AssetSearch from './components/AssetSearch.vue'
import AssetList from './components/AssetList.vue'
import AssetForm from './components/AssetForm.vue'
import AssetContextMenu from './components/AssetContextMenu.vue'
import eventBus from '@/utils/eventBus'
import i18n from '@/locales'
import { handleRefreshOrganizationAssets } from './components/refreshOrganizationAssets'
import type { AssetNode, AssetFormData, KeyChainItem, SshProxyConfigItem } from './types'

interface ParsedSession {
  name: string
  host: string
  port: number
  username: string
  password?: string
  authType: 'password' | 'keyBased'
  keyFile?: string
  protocol?: string
  groupName?: string
  proxyHost?: string
  proxyPort?: number
  proxyUser?: string
  proxyPass?: string
}

const { t } = i18n.global

const isEditMode = ref(false)
const editingAssetUUID = ref<string | null>(null)
const isRightSectionVisible = ref(false)
const searchValue = ref('')
const assetGroups = ref<AssetNode[]>([])
const keyChainOptions = ref<KeyChainItem[]>([])
const sshProxyConfigs = ref<SshProxyConfigItem[]>([])
const defaultGroups = ref(['development', 'production', 'staging', 'testing', 'database'])
const contextMenuVisible = ref(false)
const contextMenuPosition = reactive({ x: 0, y: 0 })
const selectedAsset = ref<AssetNode | null>(null)
import { userConfigStore } from '@/services/userConfigStoreService'

const formData = reactive<AssetFormData>({
  username: '',
  password: '',
  ip: '',
  label: '',
  group_name: t('personal.defaultGroup'),
  auth_type: 'password',
  keyChain: undefined,
  port: 22,
  asset_type: 'person',
  needProxy: false,
  proxyName: ''
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
    asset_type: 'person',
    needProxy: false,
    proxyName: ''
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
    asset_type: asset.asset_type || 'person',
    needProxy: asset.needProxy || false,
    proxyName: asset.proxyName || ''
  })

  getAssetGroup()
  if (formData.auth_type === 'keyBased') {
    getkeyChainData()
  }
  isRightSectionVisible.value = true
}

const handleAssetClone = (asset: AssetNode) => {
  if (!asset) return

  // Set to create mode (not edit mode)
  isEditMode.value = false
  editingAssetUUID.value = null

  let keyChain = asset.key_chain_id
  if (keyChain === 0) {
    keyChain = undefined
  }

  // Copy asset data but modify label to indicate it's a clone
  Object.assign(formData, {
    username: asset.username || '',
    password: asset.password || '',
    ip: asset.ip || '',
    label: (asset.title || '') + '_Clone',
    group_name: asset.group_name || 'Hosts',
    auth_type: asset.auth_type || 'password',
    keyChain: keyChain,
    port: asset.port || 22,
    asset_type: asset.asset_type || 'person',
    needProxy: asset.needProxy || false,
    proxyName: asset.proxyName || ''
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

const handleContextMenuClone = () => {
  if (selectedAsset.value) {
    handleAssetClone(selectedAsset.value)
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

// 显示重复数据确认对话框
const showDuplicateConfirmDialog = async (duplicateAssets: any[]): Promise<boolean> => {
  return new Promise((resolve) => {
    Modal.confirm({
      title: t('personal.importDuplicateTitle'),
      content: h('div', [
        h('p', t('personal.importDuplicateMessage', { count: duplicateAssets.length })),
        h('div', { style: 'max-height: 200px; overflow-y: auto; margin-top: 10px;' }, [
          h(
            'ul',
            duplicateAssets.map((asset) =>
              h('li', { key: asset.ip + asset.username, style: 'margin: 5px 0;' }, [
                h('strong', `${asset.label || asset.ip}`),
                h('span', ` (${asset.ip}:${asset.port}) - `),
                h(
                  'span',
                  { style: 'color: #666;' },
                  t('personal.existingAsset', {
                    label: asset.existingLabel,
                    date: new Date(asset.existingCreatedAt).toLocaleString()
                  })
                )
              ])
            )
          )
        ])
      ]),
      okText: t('personal.importOverwrite'),
      cancelText: t('personal.importSkip'),
      onOk: () => resolve(true),
      onCancel: () => resolve(false)
    })
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
    let duplicateCount = 0
    const duplicateAssets: any[] = []

    // 第一轮：检查重复数据
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
          asset_type: asset.asset_type || 'person',
          needProxy: asset.needProxy || false,
          proxyName: asset.proxyName || ''
        }

        const result = await api.createAsset({ form: cleanForm })
        if (result && result.data) {
          if (result.data.message === 'success') {
            successCount++
          } else if (result.data.message === 'duplicate') {
            duplicateCount++
            duplicateAssets.push({
              ...cleanForm,
              existingLabel: result.data.existingLabel,
              existingCreatedAt: result.data.existingCreatedAt,
              existingUuid: result.data.existingUuid || result.data.uuid
            })
          } else {
            errorCount++
          }
        } else {
          errorCount++
        }
      } catch (error) {
        console.error('Import asset error:', error)
        errorCount++
      }
    }

    // 如果有重复数据，询问用户是否要覆盖
    if (duplicateAssets.length > 0) {
      const shouldOverwrite = await showDuplicateConfirmDialog(duplicateAssets)
      if (shouldOverwrite) {
        // User chooses to overwrite, using the updateAsset method
        for (const asset of duplicateAssets) {
          try {
            // Build updated data, including uuid
            const updateForm = {
              uuid: asset.existingUuid,
              username: asset.username,
              password: asset.password,
              ip: asset.ip,
              label: asset.label,
              group_name: asset.group_name,
              auth_type: asset.auth_type,
              keyChain: asset.keyChain,
              port: asset.port,
              asset_type: asset.asset_type,
              needProxy: asset.needProxy,
              proxyName: asset.proxyName
            }

            const result = await api.updateAsset({ form: updateForm })
            if (result && result.data && result.data.message === 'success') {
              successCount++
              duplicateCount--
            } else {
              errorCount++
            }
          } catch (error) {
            console.error('Update duplicate asset error:', error)
            errorCount++
          }
        }
      }
    }

    // 显示导入结果
    if (successCount > 0) {
      message.success(t('personal.importSuccessCount', { count: successCount }))
      getAssetList()
      eventBus.emit('LocalAssetMenu')
    }

    if (duplicateCount > 0) {
      message.warning(t('personal.importDuplicateCount', { count: duplicateCount }))
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
              asset_type: node.asset_type || 'person',
              needProxy: node.needProxy || false,
              proxyName: node.proxyName || ''
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

// Handle file import
const handleImportFile = async (data: { file: File; type: string }) => {
  try {
    let parsedSessions: ParsedSession[] = []

    // Select parser based on file type
    if (data.type === 'xshell') {
      // Check if it's an XTS file
      if (data.file.name.toLowerCase().endsWith('.xts')) {
        parsedSessions = await parseXShellXTS(data.file)
      } else {
        // Other XShell formats (CSV, XSH)
        const content = await readFileContent(data.file)
        parsedSessions = parseXShellFile(content, data.file.name)
      }
    } else if (data.type === 'securecrt') {
      const content = await readFileContent(data.file)
      parsedSessions = parseSecureCRTFile(content, data.file.name)
    } else if (data.type === 'mobaxterm') {
      const content = await readFileContent(data.file)
      parsedSessions = parseMobaXtermFile(content, data.file.name)
    }

    if (parsedSessions.length === 0) {
      message.warning(t('personal.importNoData'))
      return
    }

    // Convert to Chaterm format
    const convertedAssets = convertToAssetFormat(parsedSessions)

    // Show password warning for third-party tools
    if (data.type !== 'chaterm') {
      notification.warning({
        message: t('personal.importPasswordWarningTitle'),
        description: t('personal.importPasswordWarningDesc'),
        duration: 8,
        placement: 'topRight'
      })
    }

    // Import directly without showing preview dialog
    await handleImportAssets(convertedAssets)

    // Remind again after successful import
    if (data.type !== 'chaterm') {
      message.info(t('personal.importSuccessNeedPassword', { count: convertedAssets.length }))
    }
  } catch (error) {
    console.error('File parsing error:', error)
    message.error(t('personal.importParseError'))
  }
}

// File reading helper function
const readFileContent = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => resolve(e.target?.result as string)
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsText(file, 'utf-8')
  })
}

// XShell file parser
const parseXShellFile = (content: string, fileName: string): ParsedSession[] => {
  const fileExtension = fileName.split('.').pop()?.toLowerCase()

  if (fileExtension === 'xsh') {
    return parseXShellXSH(content)
  }
  // XTS files are handled separately by parseXShellXTS, not here
  return []
}

// XShell XSH parser
const parseXShellXSH = (content: string): ParsedSession[] => {
  const sessions: ParsedSession[] = []

  // Check if it's a single XSH file format (contains [SessionInfo])
  if (content.includes('[SessionInfo]') && content.includes('Xshell session file')) {
    // This is a single XSH session file
    const session = parseXShellXSHContent(content, 'session')
    if (session.host && session.username) {
      sessions.push(session)
    }
    return sessions
  }

  // Original multi-session parsing logic (backward compatible)
  const lines = content.split('\n')
  let currentSession: Partial<ParsedSession> = {}
  let sessionCount = 0

  for (const line of lines) {
    const trimmedLine = line.trim()

    // XShell uses [CONNECTION] to identify new sessions
    if (trimmedLine === '[CONNECTION]') {
      // Save previous session
      if (currentSession.host && currentSession.username) {
        sessions.push(currentSession as ParsedSession)
      }
      sessionCount++
      currentSession = {
        name: `Session ${sessionCount}` // Default name, may be overwritten later
      }
    } else if (trimmedLine.includes('=')) {
      const [key, value] = trimmedLine.split('=', 2)
      const cleanKey = key.trim()
      const cleanValue = value.trim()

      switch (cleanKey) {
        case 'Host':
          currentSession.host = cleanValue
          currentSession.name = cleanValue // Use hostname as session name
          break
        case 'Port':
          currentSession.port = parseInt(cleanValue) || 22
          break
        case 'UserName':
          currentSession.username = cleanValue
          break
        case 'Method':
          currentSession.authType = cleanValue === 'PUBLICKEY' ? 'keyBased' : 'password'
          break
        case 'PrivateKeyFile':
          if (cleanValue) {
            currentSession.keyFile = cleanValue
            currentSession.authType = 'keyBased'
          }
          break
      }
    }
  }

  // Add the last session
  if (currentSession.host && currentSession.username) {
    sessions.push(currentSession as ParsedSession)
  }

  return sessions
}

// XShell XTS parser (directly handles ZIP format)
const parseXShellXTS = async (file: File): Promise<ParsedSession[]> => {
  const sessions: ParsedSession[] = []

  try {
    // Read file as ArrayBuffer
    const arrayBuffer = await file.arrayBuffer()
    const uint8Array = new Uint8Array(arrayBuffer)

    // Check ZIP file header (50 4B 03 04)
    if (uint8Array[0] === 0x50 && uint8Array[1] === 0x4b && uint8Array[2] === 0x03 && uint8Array[3] === 0x04) {
      // Process ZIP file through main process
      const api = window.api as any
      const zipData = Array.from(uint8Array)
      const result = await api.parseXtsFile({ data: zipData, fileName: file.name })

      if (result && result.success && result.sessions) {
        const parsedSessions = result.sessions.map((session: any) => ({
          name: session.name,
          host: session.host,
          port: session.port || 22,
          username: session.username,
          password: session.password || '',
          authType: session.authType || 'password',
          protocol: session.protocol || 'SSH',
          groupName: session.groupName
        }))

        if (parsedSessions.length > 0) {
          message.success(t('personal.xtsParseSuccess', { count: parsedSessions.length }))
        } else {
          message.warning(t('personal.xtsNoSessions'))
        }

        return parsedSessions
      } else {
        throw new Error(result?.error || 'Failed to parse XTS file')
      }
    } else {
      // Not a ZIP file, might be text format
      const content = new TextDecoder().decode(uint8Array)
      const lines = content.split('\n')

      // Find possible connection information
      for (const line of lines) {
        const trimmedLine = line.trim()

        // Find IP address pattern
        const ipMatch = trimmedLine.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/g)
        const portMatch = trimmedLine.match(/:(\d+)/)
        const userMatch = trimmedLine.match(/user[=:]([^\s,;]+)/i)

        if (ipMatch && ipMatch.length > 0) {
          const host = ipMatch[0]
          const port = portMatch ? parseInt(portMatch[1]) : 22
          const username = userMatch ? userMatch[1] : 'root'

          // Avoid duplicates
          const existingSession = sessions.find((s) => s.host === host && s.port === port)
          if (!existingSession) {
            sessions.push({
              name: `${host}:${port}`,
              host: host,
              port: port,
              username: username,
              authType: 'password',
              protocol: 'SSH'
            })
          }
        }
      }
    }
  } catch (error) {
    console.error('Error parsing XTS file:', error)
    message.error(t('personal.xtsParseError'))
  }

  return sessions
}

// XShell XSH file parser (for extracted .xsh files)
const parseXShellXSHContent = (content: string, fileName: string): ParsedSession => {
  const session: Partial<ParsedSession> = {}
  const lines = content.split('\n')

  // Extract session name from filename (remove .xsh extension)
  session.name = fileName.replace('.xsh', '')

  for (const line of lines) {
    const trimmedLine = line.trim()

    if (trimmedLine.includes('=')) {
      const [key, value] = trimmedLine.split('=', 2)
      const cleanKey = key.trim()
      const cleanValue = value.trim()

      switch (cleanKey) {
        case 'Host':
          session.host = cleanValue
          // If session name is an IP address, use hostname as a more friendly name
          if (session.name === fileName.replace('.xsh', '') && cleanValue !== session.name) {
            session.name = cleanValue
          }
          break
        case 'Port':
          session.port = parseInt(cleanValue) || 22
          break
        case 'UserName':
          session.username = cleanValue
          break
        case 'Password':
          // XShell passwords are usually encrypted, only check if it exists
          if (cleanValue && cleanValue !== '') {
            session.password = '' // Don't save encrypted password, user needs to re-enter
          }
          break
        case 'Protocol':
          session.protocol = cleanValue
          break
        case 'Description':
          // If there's a description, it can be used as a supplement to the session name
          if (cleanValue && cleanValue !== 'Xshell session file') {
            session.name = cleanValue
          }
          break
      }
    }
  }

  // Set default values
  if (!session.port) session.port = 22
  if (!session.protocol) session.protocol = 'SSH'
  if (!session.authType) {
    session.authType = 'password' // Default password authentication
  }

  return session as ParsedSession
}

// SecureCRT file parser
const parseSecureCRTFile = (content: string, fileName: string): ParsedSession[] => {
  const fileExtension = fileName.split('.').pop()?.toLowerCase()

  if (fileExtension === 'ini') {
    return parseSecureCRTINI(content, fileName)
  } else if (fileExtension === 'xml') {
    return parseSecureCRTXML(content)
  }
  return []
}

// SecureCRT INI parser
const parseSecureCRTINI = (content: string, fileName: string): ParsedSession[] => {
  const sessions: ParsedSession[] = []
  const lines = content.split('\n')

  // Default to using filename as initial session name (for single file import)
  let currentSession: Partial<ParsedSession> = {
    name: fileName.replace(/\.ini$/i, '')
  }

  for (const line of lines) {
    const trimmedLine = line.trim()
    if (!trimmedLine) continue

    // Detect session section [Sessions\SessionName]
    // Note: Single file import may not have this section, or format may differ
    if (trimmedLine.startsWith('[Sessions\\') && trimmedLine.endsWith(']')) {
      // If previous session is valid, save it first
      if (currentSession.host) {
        if (!currentSession.username) currentSession.username = 'root'
        sessions.push(currentSession as ParsedSession)
      }
      // Start new session
      currentSession = {
        name: trimmedLine.slice(10, -1) // Remove [Sessions\ and ]
      }
    } else if (trimmedLine.includes('=')) {
      const equalIndex = trimmedLine.indexOf('=')
      const rawKey = trimmedLine.substring(0, equalIndex).trim()
      const rawValue = trimmedLine.substring(equalIndex + 1).trim()

      // Process Key: remove S:, D: prefix, remove quotes
      // Example: S:"Hostname"=10.0.0.1 -> Hostname
      const key = rawKey.replace(/^[SD]:/, '').replace(/"/g, '')
      // Process Value: remove quotes
      const value = rawValue.replace(/"/g, '')

      switch (key) {
        case 'Hostname':
          currentSession.host = value
          break
        case 'Port':
          // SecureCRT port may be hexadecimal (00000016) or decimal
          // Usually hexadecimal starts with 00 and is longer
          if (value.length > 5 && value.startsWith('00')) {
            currentSession.port = parseInt(value, 16) || 22
          } else {
            currentSession.port = parseInt(value) || 22
          }
          break
        case 'Username':
          currentSession.username = value
          break
        case 'Protocol Name':
          currentSession.protocol = value
          break
        case 'Auth Method':
          // "PublicKey", "Password", "Keyboard Interactive"
          // Only set auth type if no key file detected, to avoid overwriting keyBased
          if (!currentSession.keyFile) {
            currentSession.authType = value.toLowerCase().includes('publickey') ? 'keyBased' : 'password'
          }
          break
        case 'Identity Filename V2':
          if (value) {
            currentSession.keyFile = value
            currentSession.authType = 'keyBased'
          }
          break
      }
    }
  }

  // Add the last session
  if (currentSession.host) {
    if (!currentSession.username) currentSession.username = 'root'
    sessions.push(currentSession as ParsedSession)
  }

  return sessions
}

// SecureCRT XML parser (handles real format)
const parseSecureCRTXML = (content: string): ParsedSession[] => {
  const sessions: ParsedSession[] = []

  try {
    // SecureCRT uses <key name="SessionName"> format
    const sessionMatches = content.match(/<key name="[^"]*"[^>]*>[\s\S]*?<\/key>/gi)

    if (sessionMatches) {
      for (const sessionXml of sessionMatches) {
        // Extract session name
        const nameMatch = sessionXml.match(/<key name="([^"]*)"/)
        if (!nameMatch || nameMatch[1] === 'Sessions') continue // Skip root node

        const sessionName = nameMatch[1]

        // Extract each field
        const hostMatch = sessionXml.match(/<string name="Hostname">([^<]*)<\/string>/i)
        const portMatch = sessionXml.match(/<dword name="Port">(\d+)<\/dword>/i)
        const usernameMatch = sessionXml.match(/<string name="Username">([^<]*)<\/string>/i)
        const authMatch = sessionXml.match(/<string name="Auth Method">([^<]*)<\/string>/i)
        const keyFileMatch = sessionXml.match(/<string name="Identity Filename V2">([^<]*)<\/string>/i)

        if (hostMatch && usernameMatch) {
          const authMethod = authMatch?.[1] || 'Password'
          const keyFilePath = keyFileMatch?.[1]

          // If Identity Filename V2 exists, force keyBased
          // Otherwise determine based on Auth Method
          let authType: 'password' | 'keyBased'
          if (keyFilePath && keyFilePath.trim() !== '') {
            authType = 'keyBased'
          } else {
            authType = authMethod.toLowerCase().includes('key') ? 'keyBased' : 'password'
          }

          sessions.push({
            name: sessionName,
            host: hostMatch[1],
            port: parseInt(portMatch?.[1] || '22'),
            username: usernameMatch[1],
            authType: authType,
            keyFile: keyFilePath || undefined,
            protocol: 'SSH'
          })
        }
      }
    }
  } catch (error) {
    console.error('Error parsing SecureCRT XML:', error)

    // Fallback to simple parsing (compatible with other formats)
    const simpleMatches = content.match(/<session[^>]*>[\s\S]*?<\/session>/gi)
    if (simpleMatches) {
      for (const sessionXml of simpleMatches) {
        const nameMatch = sessionXml.match(/<name>(.*?)<\/name>/i)
        const hostMatch = sessionXml.match(/<hostname>(.*?)<\/hostname>/i)
        const portMatch = sessionXml.match(/<port>(.*?)<\/port>/i)
        const usernameMatch = sessionXml.match(/<username>(.*?)<\/username>/i)

        if (hostMatch && usernameMatch) {
          sessions.push({
            name: nameMatch?.[1] || hostMatch[1],
            host: hostMatch[1],
            port: parseInt(portMatch?.[1] || '22'),
            username: usernameMatch[1],
            authType: 'password',
            protocol: 'SSH'
          })
        }
      }
    }
  }

  return sessions
}

// MobaXterm file parser
const parseMobaXtermFile = (content: string, fileName: string): ParsedSession[] => {
  const fileExtension = fileName.split('.').pop()?.toLowerCase()

  if (fileExtension === 'mxtsessions' || fileName.includes('mobaxterm')) {
    return parseMobaXtermINI(content)
  }
  return []
}

// MobaXterm INI parser
const parseMobaXtermINI = (content: string): ParsedSession[] => {
  const sessions: ParsedSession[] = []
  const lines = content.split('\n')

  for (const line of lines) {
    const trimmedLine = line.trim()

    // Skip empty lines and [Bookmarks] section
    if (!trimmedLine || trimmedLine === '[Bookmarks]' || trimmedLine.startsWith('SubRep=') || trimmedLine.startsWith('ImgNum=')) {
      continue
    }

    // Detect if it's bookmark section format [Bookmarks_N]
    if (trimmedLine.match(/^\[Bookmarks_\d+\]$/)) {
      continue
    }

    // Parse MobaXterm encoded format
    // Format: IP=#109#0%IP%PORT%USERNAME%%-1%-1%%%PORT%%...
    if (trimmedLine.includes('=#109#0%') || trimmedLine.includes('=')) {
      try {
        const session = parseMobaXtermEncodedLine(trimmedLine)
        if (session) {
          sessions.push(session)
        }
      } catch (error) {
        console.warn('Failed to parse MobaXterm line:', trimmedLine, error)
        continue
      }
    }
  }

  return sessions
}

// Parse MobaXterm encoded line
const parseMobaXtermEncodedLine = (line: string): ParsedSession | null => {
  try {
    // Split key-value pair
    const [sessionName, encodedData] = line.split('=', 2)
    if (!encodedData) return null

    // MobaXterm format detailed analysis:
    // #109#0%HOST%PORT%USERNAME%PASSWORD%DOMAIN%GATEWAY_HOST%GATEWAY_PORT%GATEWAY_USER%GATEWAY_PASS%ACTUAL_PORT%FLAGS%...
    if (encodedData.startsWith('#109#0%')) {
      const parts = encodedData.substring(7).split('%') // Remove #109#0% prefix

      if (parts.length >= 3) {
        const host = parts[0] || sessionName.trim() // Field 0: host address
        const username = parts[2] || 'root' // Field 2: username
        const password = parts[3] || '' // Field 3: password
        const gatewayHost = parts[5] || '' // Field 5: gateway host
        const gatewayPort = parts[6] || '' // Field 6: gateway port
        const gatewayUser = parts[7] || '' // Field 7: gateway user
        const gatewayPass = parts[8] || '' // Field 8: gateway password
        const actualPort = parts[9] || parts[1] || '22' // Field 9: actual port (may be duplicated)

        // Check if gateway/jump server is used
        const needProxy = !!(gatewayHost && gatewayHost !== '-1')

        // Check authentication method
        let authType: 'password' | 'keyBased' = 'password'
        let keyFile = ''

        // Iterate through all fields to find key file path
        // MobaXterm usually uses _ProfileDir_ prefix, or in specific positions
        for (let i = 0; i < parts.length; i++) {
          const part = parts[i]
          if (!part || part === '-1') continue

          // Check if it starts with _ProfileDir_
          if (part.startsWith('_ProfileDir_')) {
            keyFile = part
            authType = 'keyBased'
            break
          }

          // Check common key file extensions (as fallback)
          if (i > 9 && (part.endsWith('.pem') || part.endsWith('.ppk') || part.includes('id_rsa'))) {
            keyFile = part
            authType = 'keyBased'
            break
          }
        }

        // Check if there's a valid host and username
        if (host && username && host !== '-1' && username !== '-1') {
          return {
            name: sessionName.trim(),
            host: host,
            port: parseInt(actualPort) || parseInt(parts[1]) || 22,
            username: username,
            password: password && password !== '-1' ? password : '',
            authType: authType,
            keyFile: keyFile || undefined,
            protocol: 'SSH',
            // If there's gateway information, it can be handled here
            ...(needProxy && {
              proxyHost: gatewayHost,
              proxyPort: parseInt(gatewayPort) || 22,
              proxyUser: gatewayUser !== '-1' ? gatewayUser : '',
              proxyPass: gatewayPass !== '-1' ? gatewayPass : ''
            })
          }
        }
      }
    }

    // Try to parse other MobaXterm formats
    if (encodedData.startsWith('#')) {
      // Might be other session types (RDP, VNC, etc.), skip for now
      return null
    }

    // Try to parse traditional INI format (if exists)
    if (line.includes('SessionName=') || line.includes('ServerHost=')) {
      return parseMobaXtermTraditionalINI(line)
    }

    return null
  } catch (error) {
    console.error('Error parsing MobaXterm encoded line:', error)
    return null
  }
}

// Parse traditional INI format MobaXterm line (fallback method)
const parseMobaXtermTraditionalINI = (line: string): ParsedSession | null => {
  const session: Partial<ParsedSession> = {}

  if (line.includes('SessionName=')) {
    const match = line.match(/SessionName=([^%\s]+)/)
    if (match) session.name = match[1]
  }

  if (line.includes('ServerHost=')) {
    const match = line.match(/ServerHost=([^%\s]+)/)
    if (match) session.host = match[1]
  }

  if (line.includes('UserName=')) {
    const match = line.match(/UserName=([^%\s]+)/)
    if (match) session.username = match[1]
  }

  if (line.includes('PortNum=')) {
    const match = line.match(/PortNum=(\d+)/)
    if (match) session.port = parseInt(match[1]) || 22
  }

  if (session.host && session.username) {
    return {
      name: session.name || session.host,
      host: session.host,
      port: session.port || 22,
      username: session.username,
      authType: 'password',
      protocol: 'SSH'
    }
  }

  return null
}

// Data converter
const convertToAssetFormat = (sessions: ParsedSession[]): any[] => {
  return sessions.map((session) => ({
    username: session.username,
    password: session.password || '',
    ip: session.host,
    label: session.name || session.host,
    group_name: session.groupName || t('personal.defaultGroup'),
    auth_type: session.authType,
    keyChain: undefined, // Need to handle based on keyFile
    port: session.port || 22,
    asset_type: 'person',
    needProxy: !!(session.proxyHost && session.proxyHost !== '-1'),
    proxyName: session.proxyHost && session.proxyHost !== '-1' ? `${session.proxyHost}:${session.proxyPort || 22}` : ''
  }))
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
const getProxyConfigData = async () => {
  try {
    const savedConfig = await userConfigStore.getConfig()
    if (savedConfig) {
      const savedConfigProxyConfig = savedConfig.sshProxyConfigs || []
      sshProxyConfigs.value = savedConfigProxyConfig.map((config) => ({
        key: config.name,
        label: config.name
      }))
    }
  } catch (error) {
    console.error('Failed to load config:', error)
    notification.error({
      message: t('user.loadConfigFailed'),
      description: t('user.loadConfigFailedDescription')
    })
  }
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
      asset_type: data.asset_type,
      needProxy: data.needProxy,
      proxyName: data.proxyName
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
      asset_type: data.asset_type,
      needProxy: data.needProxy,
      proxyName: data.proxyName
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
  getProxyConfigData()
  eventBus.on('keyChainUpdated', () => {
    getkeyChainData()
  })
  eventBus.on('sshProxyConfigsUpdated', () => {
    getProxyConfigData()
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
  eventBus.off('sshProxyConfigsUpdated')
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
  scrollbar-width: thin;
  scrollbar-color: var(--border-color-light) transparent;
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
