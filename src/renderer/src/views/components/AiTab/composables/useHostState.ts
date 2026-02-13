import type { Host, AssetInfo } from '../types'
import { isSwitchAssetType } from '../utils'
import { useSessionState } from './useSessionState'
import i18n from '@/locales'
import eventBus from '@/utils/eventBus'
import { Notice } from '@/views/components/Notice'
import { getBastionHostType } from '../../LeftTab/utils/types'

const logger = createRendererLogger('aitab.hostState')

/**
 * Host info for updating hosts
 */
export interface HostInfo {
  ip: string
  uuid: string
  connection: string
  assetType?: string
}

/**
 * Composable for host state operations
 * Provides functions to manage hosts data
 * Note: No singleton needed since all state comes from useSessionState
 */
export const useHostState = () => {
  const { t } = i18n.global
  const { hosts, chatTypeValue } = useSessionState()

  /**
   * Get current tab's asset information via event bus
   */
  const getCurentTabAssetInfo = async (): Promise<AssetInfo | null> => {
    const TIMEOUT_MS = 5000

    try {
      const assetInfo = await new Promise<AssetInfo | null>((resolve, reject) => {
        const timeout = setTimeout(() => {
          eventBus.off('assetInfoResult', handleResult)
          reject(new Error(t('ai.timeoutGettingAssetInfo')))
        }, TIMEOUT_MS)

        const handleResult = (assetInfo: AssetInfo | null) => {
          clearTimeout(timeout)
          eventBus.off('assetInfoResult', handleResult)
          resolve(assetInfo)
        }
        eventBus.on('assetInfoResult', handleResult)
        eventBus.emit('getActiveTabAssetInfo')
      })

      if (!assetInfo) {
        return null
      }

      // Determine connection type based on assetType
      // getBastionHostType returns 'jumpserver' | 'qizhi' | null
      const bastionType = getBastionHostType(assetInfo.assetType)
      assetInfo.connection = bastionType || 'personal'
      return assetInfo
    } catch (error) {
      logger.error('Error getting asset information', { error: error })
      return null
    }
  }

  /**
   * Update hosts based on host info
   */
  const updateHosts = (hostInfo: HostInfo | null) => {
    if (chatTypeValue.value === 'chat') {
      hosts.value = []
      return
    }

    if (hostInfo) {
      if (chatTypeValue.value === 'agent' && isSwitchAssetType(hostInfo.assetType)) {
        chatTypeValue.value = 'cmd'
        Notice.open({
          type: 'info',
          description: t('ai.switchNotSupportAgent'),
          placement: 'bottomRight'
        })
      }
      const newHost: Host = {
        host: hostInfo.ip,
        uuid: hostInfo.uuid,
        connection: hostInfo.connection,
        assetType: hostInfo.assetType
      }
      hosts.value = [newHost]
    } else {
      hosts.value = []
    }
  }

  /**
   * Update hosts for command mode based on current tab's asset info
   */
  const updateHostsForCommandMode = async () => {
    const assetInfo = await getCurentTabAssetInfo()

    if (assetInfo && assetInfo.ip) {
      updateHosts({
        ip: assetInfo.ip,
        uuid: assetInfo.uuid,
        connection: assetInfo.connection || 'personal',
        assetType: assetInfo.assetType
      })
    } else {
      updateHosts(null)
    }
  }

  return {
    getCurentTabAssetInfo,
    updateHosts,
    updateHostsForCommandMode
  }
}
