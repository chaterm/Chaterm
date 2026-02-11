import { message } from 'ant-design-vue'
import eventBus from '@/utils/eventBus'
import i18n from '@/locales'
import { isOrganizationAsset } from '../utils/types'


const { t } = i18n.global
const logger = createRendererLogger('config.refreshAssets')

export const handleRefreshOrganizationAssets = async (host: any, onSuccess?: () => void) => {
  if (!host || !isOrganizationAsset(host.asset_type)) {
    logger.warn('Invalid organization asset node', { data: host })
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

    logger.info('Refresh organization assets result', { data: result })

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
    logger.error('Failed to refresh organization assets', { error: error instanceof Error ? error.message : String(error) })
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
              if (isOrganizationAsset(asset.asset_type)) {
                if (asset.uuid === nodeKey) {
                  logger.info('Found matching organization asset config by uuid', { data: asset })
                  return asset
                }
                if (asset.key === nodeKey) {
                  logger.info('Found matching organization asset config by key', { data: asset })
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
                if (asset.uuid === organizationUuid && isOrganizationAsset(asset.asset_type)) {
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
    logger.error('Failed to find organization asset', { error: error instanceof Error ? error.message : String(error) })
  }

  return null
}

export const refreshOrganizationAssetFromWorkspace = async (dataRef: any, onSuccess?: () => void) => {
  logger.info('Refresh organization asset node from Workspace', { data: dataRef })

  const organizationAsset = await findOrganizationAssetByKey(dataRef.key)

  if (organizationAsset) {
    await handleRefreshOrganizationAssets(organizationAsset, onSuccess)
  } else {
    logger.warn('No matching organization asset config found', { data: dataRef })
    message.warning('No matching organization asset config found')
  }
}
