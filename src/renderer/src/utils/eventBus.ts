import mitt from 'mitt'

/**
 * Define event types
 */
export interface AppEvents {
  currentClickServer: any // Can be replaced with actual item type instead of any
  updateRightIcon: boolean // Update right icon status
  executeTerminalCommand: { command: string; tabId?: string } // Execute terminal command
  autoExecuteCode: { command: string; tabId: string }
  focusActiveTerminal: string | undefined // Return focus to currently active terminal
  getActiveTabAssetInfo: void | { tabId?: string } // Request to get asset information of current active tab
  assetInfoResult: any | { assetInfo: any; tabId?: string } // Return asset information result
  LocalAssetMenu: any // Update asset directory
  SettingModelChanged: any // Setting page model change event
  AiTabModelChanged: any // AI Tab model change event
  apiProviderChanged: any
  activeTabChanged: any
  chatToAi: any
  sendMessageToAi: { content: string; tabId?: string }
  toggleMenu: any
  updateWatermark: string // Update watermark status
  updateSecretRedaction: string // Update secret redaction status
  updateDataSync: string // Update data sync status
  keyChainUpdated: void // Keychain update event, used to sync key options in host configuration
  aliasStatusChanged: number // Alias status change event, 1 means enabled, 2 means disabled
  openUserTab: any // Open Tab
  // Can extend more events
  [key: string | symbol]: any
}

const emitter = mitt<AppEvents>()

export default emitter
