import { ref } from 'vue'
import { message } from 'ant-design-vue'
import eventBus from '@/utils/eventBus'
import i18n from '@/locales'

const { t } = i18n.global

// 二次验证相关状态
export const showOtpDialog = ref(false)
export const showOtpDialogErr = ref(false)
export const showOtpDialogCheckErr = ref(false)
export const otpPrompt = ref('')
export const otpCode = ref('')
export const currentOtpId = ref<string | null>(null)
export const otpAttempts = ref(0)
export const MAX_OTP_ATTEMPTS = 5

// 二次验证监听器
let removeOtpRequestListener = (): void => {}
let removeOtpTimeoutListener = (): void => {}
let removeOtpResultListener = (): void => {}

// 重置二次验证对话框状态
export const resetOtpDialog = () => {
  showOtpDialog.value = false
  showOtpDialogErr.value = false
  showOtpDialogCheckErr.value = false
  otpPrompt.value = ''
  otpCode.value = ''
  currentOtpId.value = null
}

// 二次验证请求处理
export const handleOtpRequest = (data: any) => {
  currentOtpId.value = data.id
  otpPrompt.value = data.prompts.join('\n')
  showOtpDialog.value = true
  showOtpDialogErr.value = false
  showOtpDialogCheckErr.value = false
  otpAttempts.value = 0
}

// 二次验证结果处理
export const handleOtpError = (data: any) => {
  if (data.id === currentOtpId.value) {
    if (data.status === 'success') {
      closeOtp()
    } else {
      showOtpDialogErr.value = true
      otpAttempts.value += 1
      otpCode.value = ''
      if (otpAttempts.value >= MAX_OTP_ATTEMPTS) {
        showOtpDialog.value = false
        cancelOtp()
      }
    }
  }
}

// 二次验证超时处理
export const handleOtpTimeout = (data: any) => {
  if (data.id === currentOtpId.value && showOtpDialog.value) {
    resetOtpDialog()
  }
}

// 提交二次验证码
export const submitOtpCode = () => {
  showOtpDialogCheckErr.value = false
  showOtpDialogErr.value = false
  if (otpCode.value && currentOtpId.value) {
    const api = window.api as any
    api.submitKeyboardInteractiveResponse(currentOtpId.value, otpCode.value)
  } else {
    showOtpDialogCheckErr.value = true
  }
}

// 取消二次验证
export const cancelOtp = () => {
  if (currentOtpId.value) {
    const api = window.api as any
    api.cancelKeyboardInteractive(currentOtpId.value)
    cleanupOtpListeners()
    resetOtpDialog()
  }
}

// 关闭二次验证
export const closeOtp = () => {
  if (currentOtpId.value) {
    cleanupOtpListeners()
    resetOtpDialog()
  }
}

// 为刷新企业资产设置MFA监听器
export const setupOtpListenersForRefresh = () => {
  // 先清理现有的监听器
  cleanupOtpListeners()

  // 重置二次验证相关状态
  resetOtpDialog()

  // 重新设置监听器（仅用于刷新企业资产）
  const api = window.api as any
  removeOtpRequestListener = api.onKeyboardInteractiveRequest(handleOtpRequest)
  removeOtpTimeoutListener = api.onKeyboardInteractiveTimeout(handleOtpTimeout)
  removeOtpResultListener = api.onKeyboardInteractiveResult(handleOtpError)
}

// 清理MFA监听器（刷新完成后）
export const cleanupOtpListeners = () => {
  if (typeof removeOtpRequestListener === 'function') removeOtpRequestListener()
  if (typeof removeOtpTimeoutListener === 'function') removeOtpTimeoutListener()
  if (typeof removeOtpResultListener === 'function') removeOtpResultListener()

  // 重置为空函数
  removeOtpRequestListener = (): void => {}
  removeOtpTimeoutListener = (): void => {}
  removeOtpResultListener = (): void => {}
}

// 刷新企业资产的核心函数
export const handleRefreshOrganizationAssets = async (host: any, onSuccess?: () => void) => {
  if (!host || host.asset_type !== 'organization') {
    console.warn('无效的企业资产节点:', host)
    return
  }

  // 为刷新企业资产专门设置MFA监听器
  setupOtpListenersForRefresh()

  const hide = message.loading(t('personal.refreshingAssets'), 0)

  try {
    const api = window.api as any
    const result = await api.refreshOrganizationAssets({
      organizationUuid: host.uuid,
      jumpServerConfig: {
        host: host.ip,
        port: host.port || 22,
        username: host.username,
        password: host.password,
        keyChain: host.key_chain_id
      }
    })

    console.log('刷新企业资产结果:', result)

    if (result?.data?.message === 'success') {
      hide() // 只隐藏加载消息
      message.success(t('personal.refreshSuccess'))

      // 触发资产列表刷新
      eventBus.emit('LocalAssetMenu')

      // 如果有成功回调，执行它
      if (onSuccess && typeof onSuccess === 'function') {
        onSuccess()
      }
    } else {
      throw new Error('刷新失败')
    }
  } catch (error) {
    console.error('刷新企业资产失败:', error)
    hide() // 隐藏加载消息
    message.error(t('personal.refreshError'))
  } finally {
    // 刷新完成后清理MFA监听器，避免与后续连接操作冲突
    cleanupOtpListeners()
  }
}

// 根据节点信息查找对应的企业资产配置
export const findOrganizationAssetByKey = async (nodeKey: string): Promise<any | null> => {
  try {
    const api = window.api as any
    const res = await api.getLocalAssetRoute({ searchType: 'assetConfig', params: [] })

    if (res && res.data && res.data.routers) {
      const findAssetInGroups = (groups: any[]): any | null => {
        for (const group of groups) {
          if (group.children) {
            for (const asset of group.children) {
              if (asset.key === nodeKey && asset.asset_type === 'organization') {
                return asset
              }
            }
          }
        }
        return null
      }

      return findAssetInGroups(res.data.routers)
    }
  } catch (error) {
    console.error('查找企业资产失败:', error)
  }

  return null
}

// 从 Workspace 组件调用的刷新函数
export const refreshOrganizationAssetFromWorkspace = async (dataRef: any, onSuccess?: () => void) => {
  console.log('从 Workspace 刷新企业资产节点:', dataRef)

  // 尝试从节点信息中获取企业资产配置
  let organizationAsset = null

  // 如果节点本身就是企业资产配置
  if (dataRef.asset_type === 'organization' && dataRef.uuid) {
    organizationAsset = dataRef
  } else {
    // 否则根据 key 查找对应的企业资产配置
    organizationAsset = await findOrganizationAssetByKey(dataRef.key)
  }

  if (organizationAsset) {
    await handleRefreshOrganizationAssets(organizationAsset, onSuccess)
  } else {
    console.warn('未找到对应的企业资产配置:', dataRef)
    message.warning('未找到对应的企业资产配置')
  }
}
