import { message } from 'ant-design-vue'
import eventBus from '@/utils/eventBus'
import i18n from '@/locales'

const { t } = i18n.global

// 刷新企业资产的核心函数
export const handleRefreshOrganizationAssets = async (host: any, onSuccess?: () => void) => {
  if (!host || host.asset_type !== 'organization') {
    console.warn('无效的企业资产节点:', host)
    return
  }

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
