import { message } from 'ant-design-vue'
import eventBus from '@/utils/eventBus'
import i18n from '@/locales'

const { t } = i18n.global

export const handleRefreshOrganizationAssets = async (host: any, onSuccess?: () => void) => {
  if (!host || host.asset_type !== 'organization') {
    console.warn('Invalid organization asset node:', host)
    return
  }

  const hide = message.loading(t('personal.refreshingAssets'), 0)
  const jmsToken = localStorage.getItem('jms-token')
  try {
    const api = window.api as any
    const result = await api.refreshOrganizationAssets({
      organizationUuid: host.uuid,
      jumpServerConfig: {
        host: host.ip,
        port: host.port || 22,
        username: host.username,
        password: host.password,
        keyChain: host.key_chain_id,
        connIdentToken: jmsToken
      }
    })

    console.log('Refresh organization assets result:', result)

    if (result?.data?.message === 'success') {
      hide()
      message.success(t('personal.refreshSuccess'))

      eventBus.emit('LocalAssetMenu')

      if (onSuccess && typeof onSuccess === 'function') {
        onSuccess()
      }
    } else {
      throw new Error('Refresh failed')
    }
  } catch (error) {
    console.error('Failed to refresh organization assets:', error)
    hide()
    message.error(t('personal.refreshError'))
  }
}

export const findOrganizationAssetByKey = async (nodeKey: string): Promise<any | null> => {
  try {
    const api = window.api as any
    const res = await api.getLocalAssetRoute({ searchType: 'assetConfig', params: [] })

    if (res && res.data && res.data.routers) {
      const findAssetInGroups = (groups: any[]): any | null => {
        for (const group of groups) {
          if (group.children) {
            for (const asset of group.children) {
              if (asset.asset_type === 'organization') {
                if (asset.uuid === nodeKey) {
                  console.log('Found matching organization asset config by uuid:', asset)
                  return asset
                }
                if (asset.key === nodeKey) {
                  console.log('Found matching organization asset config by key:', asset)
                  return asset
                }
              }
            }
          }
        }
        return null
      }

      let result = findAssetInGroups(res.data.routers)
      if (!result && nodeKey.includes('_')) {
        const parts = nodeKey.split('_')
        if (parts.length >= 2) {
          const organizationUuid = parts[0]
          for (const group of res.data.routers) {
            if (group.children) {
              for (const asset of group.children) {
                if (asset.uuid === organizationUuid && asset.asset_type === 'organization') {
                  return asset
                }
              }
            }
          }
        }
      }

      return result
    }
  } catch (error) {
    console.error('Failed to find organization asset:', error)
  }

  return null
}

export const refreshOrganizationAssetFromWorkspace = async (dataRef: any, onSuccess?: () => void) => {
  console.log('Refresh organization asset node from Workspace:', dataRef)

  let organizationAsset = null

  if (dataRef.asset_type === 'organization' && dataRef.children) {
    organizationAsset = await findOrganizationAssetByKey(dataRef.key)
  } else {
    organizationAsset = await findOrganizationAssetByKey(dataRef.key)
  }

  if (organizationAsset) {
    await handleRefreshOrganizationAssets(organizationAsset, onSuccess)
  } else {
    console.warn('No matching organization asset config found:', dataRef)
    message.warning('No matching organization asset config found')
  }
}
