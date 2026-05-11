import type { Host, AssetInfo } from '../types'
import { isSwitchAssetType } from '../utils'
import { useSessionState } from './useSessionState'
import i18n from '@/locales'
import eventBus from '@/utils/eventBus'
import { Notice } from '@/views/components/Notice'
import { getBastionHostType } from '../../LeftTab/utils/types'
import { AI_TAB_DEFAULT_WORKSPACE, type AiTabWorkspace } from '../workspace'

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
 *
 * `workspace` identifies which surface owns this AiTab instance. When set
 * to `'database'` the composable:
 *   - returns `null` from `getCurentTabAssetInfo` immediately (no 5s event
 *     bus timeout, no reliance on a terminal tab that does not exist in
 *     the Database workspace)
 *   - skips the agent→cmd auto-flip inside `updateHosts` (DB workspace
 *     locks chat mode to agent; see docs/database_ai.md §3.2)
 * For `'terminal'` (default, legacy callers) behaviour is byte-for-byte
 * identical to the pre-#18 implementation.
 */
export const useHostState = (workspace: AiTabWorkspace = AI_TAB_DEFAULT_WORKSPACE) => {
  const { t } = i18n.global
  const { hosts, chatTypeValue } = useSessionState()

  /**
   * Get current tab's asset information via event bus.
   *
   * In Database workspace there is no SSH tab to respond to the
   * `getActiveTabAssetInfo` event, so issuing the request guarantees a 5s
   * timeout and spews `ai.timeoutGettingAssetInfo` into the logger on
   * every tab activation. Short-circuit to `null` instead.
   */
  const getCurentTabAssetInfo = async (): Promise<AssetInfo | null> => {
    if (workspace === 'database') {
      return null
    }
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
   * Update hosts based on host info. In `terminal` workspace this also
   * flips `chatTypeValue` from `agent` to `cmd` when the asset is a
   * network-switch device (those devices do not support agent-mode
   * tooling). In `database` workspace the flip is suppressed — DB chat
   * sessions stay in agent mode by design, and hosts is expected to be
   * empty anyway.
   */
  const updateHosts = (hostInfo: HostInfo | null) => {
    if (hostInfo) {
      if (workspace !== 'database' && chatTypeValue.value === 'agent' && isSwitchAssetType(hostInfo.assetType)) {
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
