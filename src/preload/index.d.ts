import { ElectronAPI } from '@electron-toolkit/preload'
import type { TaskMetadata } from '../main/agent/core/context/context-tracking/ContextTrackerTypes'
import type { CommandGenerationContext, WebviewMessage } from '../main/agent/shared/WebviewMessage'

interface Cookie {
  name: string
  value: string
}

// ============================================================================
// Bastion Definition Types (mirrored from capabilityRegistry.ts)
// ============================================================================

/**
 * Authentication policy types supported by bastion hosts.
 */
export type BastionAuthPolicy = 'password' | 'keyBased'

/**
 * Agent execution strategy for command execution.
 * - 'stream': Use getShellStream for command execution (standard stream-based)
 * - 'custom': Plugin provides custom runCommand implementation
 */
export type BastionAgentExecStrategy = 'stream' | 'custom'

/**
 * BastionDefinition describes the metadata and capabilities of a plugin-based bastion host.
 * Used by frontend for dynamic UI rendering and routing decisions.
 */
export interface BastionDefinition {
  /** Unique bastion type identifier (e.g., 'qizhi', 'tencent') */
  type: string

  /** Definition version for schema evolution and compatibility */
  version: number

  /** i18n key for display name (e.g., 'bastion.qizhi.name') */
  displayNameKey: string

  /** Asset type prefix, defaults to 'organization-${type}' */
  assetTypePrefix: string

  /** Supported authentication policies */
  authPolicy: BastionAuthPolicy[]

  /** Whether this bastion supports asset refresh */
  supportsRefresh: boolean

  /** Whether this bastion provides getShellStream for agent execution */
  supportsShellStream: boolean

  /** Agent execution strategy */
  agentExec: BastionAgentExecStrategy

  /** Optional UI hints for rendering customization */
  uiHints?: Record<string, unknown>
}

interface ApiType {
  getCookie: (name: string) => Promise<{
    success: boolean
    value?: string
  }>
  setCookie: (
    name: string,
    value: string,
    expirationDays: number
  ) => Promise<{
    success: boolean
    value?: string
  }>

  getAllCookies: () => Promise<{
    success: boolean
    cookies?: Cookie[]
  }>
  removeCookie: (name: string) => Promise<{
    success: boolean
  }>
  getLocalIP: () => Promise<string>
  getMacAddress: () => Promise<string>
  getPlatform: () => Promise<string>
  invokeCustomAdsorption: (data: { appX: number; appY: number }) => void
  queryCommand: (data: { command: string; ip: string }) => Promise<any>
  insertCommand: (data: { command: string; ip: string }) => Promise<any>
  getLocalAssetRoute: (data: { searchType: string; params?: any[] }) => Promise<any>
  updateLocalAssetLabel: (data: { uuid: string; label: string }) => Promise<any>
  updateLocalAsseFavorite: (data: { uuid: string; status: number }) => Promise<any>
  chatermInsert: (data: { sql: string; params?: any[] }) => Promise<any>
  chatermUpdate: (data: { sql: string; params?: any[] }) => Promise<any>
  deleteAsset: (data: { uuid: string }) => Promise<any>
  getKeyChainSelect: () => Promise<any>
  getAssetGroup: () => Promise<any>
  createAsset: (data: { form: any }) => Promise<any>
  createOrUpdateAsset: (data: { form: any }) => Promise<any>
  updateAsset: (data: { form: any }) => Promise<any>
  getKeyChainList: () => Promise<any>
  createKeyChain: (data: { form: any }) => Promise<any>
  deleteKeyChain: (data: { id: number }) => Promise<any>
  getKeyChainInfo: (data: { id: number }) => Promise<any>
  updateKeyChain: (data: { form: any }) => Promise<any>
  connectAssetInfo: (data: { uuid: string }) => Promise<any>
  openBrowserWindow: (url: string) => Promise<void>
  connect: (connectionInfo: any) => Promise<any>
  shell: (params: any) => Promise<any>
  writeToShell: (params: any) => Promise<any>
  disconnect: (params: any) => Promise<any>
  selectPrivateKey: () => Promise<any>
  onShellData: (id: string, callback: (data: any) => void) => () => void
  onShellError: (id: string, callback: (data: any) => void) => () => void
  onShellClose: (id: string, callback: () => void) => () => void
  recordTerminalState: (params: any) => Promise<any>
  recordCommand: (params: any) => Promise<any>
  sshSftpList: (opts: { id: string; remotePath: string }) => Promise<any>
  sftpConnList: () => Promise<string[]>
  sshConnExec: (args: { id: string; cmd: string }) => Promise<any>
  sendToMain: (message: WebviewMessage) => Promise<void | null>
  onMainMessage: (callback: (message: any) => void) => () => void
  onCommandGenerationResponse: (callback: (response: { command?: string; error?: string; tabId: string }) => void) => () => void
  cancelTask: (tabContext?: { tabId?: string } | string) => Promise<any>
  gracefulCancelTask: (tabContext?: { tabId?: string } | string) => Promise<any>
  userSnippetOperation: (data: { operation: 'list' | 'create' | 'delete' | 'update' | 'swap'; params?: any }) => Promise<{
    code: number
    message?: string
    data?: any
  }>
  updateOrganizationAssetFavorite: (data: { organizationUuid: string; host: string; status: number }) => Promise<any>
  updateOrganizationAssetComment: (data: { organizationUuid: string; host: string; comment: string }) => Promise<any>
  // Custom folder management API
  createCustomFolder: (data: { name: string; description?: string }) => Promise<any>
  getCustomFolders: () => Promise<any>
  updateCustomFolder: (data: { folderUuid: string; name: string; description?: string }) => Promise<any>
  deleteCustomFolder: (data: { folderUuid: string }) => Promise<any>
  moveAssetToFolder: (data: { folderUuid: string; organizationUuid: string; assetHost: string }) => Promise<any>
  removeAssetFromFolder: (data: { folderUuid: string; organizationUuid: string; assetHost: string }) => Promise<any>
  getAssetsInFolder: (data: { folderUuid: string }) => Promise<any>
  refreshOrganizationAssets: (data: { organizationUuid: string; jumpServerConfig: any }) => Promise<any>
  updateTheme: (params: any) => Promise<boolean>
  mainWindowShow: () => Promise<void>
  getVersionPrompt: () => Promise<{
    shouldShow: boolean
    version: string
    releaseDate?: string
    highlights: string[]
    releaseNotesUrl?: string
    isFirstInstall: boolean
  }>
  dismissVersionPrompt: () => Promise<void>
  getReleaseNotes: (version?: string) => Promise<{
    version: string
    date?: string
    highlights?: Record<string, string[]> | string[]
  } | null>
  onSystemThemeChanged: (callback: (theme: string) => void) => () => void
  // Keyboard-interactive authentication
  onKeyboardInteractiveRequest: (callback: (data: any) => void) => () => void
  onKeyboardInteractiveTimeout: (callback: (data: any) => void) => () => void
  onKeyboardInteractiveResult: (callback: (data: any) => void) => () => void
  submitKeyboardInteractiveResponse: (id: string, code: string) => void
  cancelKeyboardInteractive: (id: string) => void
  // JumpServer user selection
  onUserSelectionRequest: (callback: (data: any) => void) => () => void
  onUserSelectionTimeout: (callback: (data: any) => void) => () => void
  sendUserSelectionResponse: (id: string, userId: number) => void
  sendUserSelectionCancel: (id: string) => void
  // MCP configuration management
  getMcpConfigPath: () => Promise<string>
  readMcpConfig: () => Promise<string>
  writeMcpConfig: (content: string) => Promise<void>
  getMcpServers: () => Promise<any[]>
  toggleMcpServer: (serverName: string, disabled: boolean) => Promise<void>
  deleteMcpServer: (serverName: string) => Promise<void>
  getMcpToolState: (serverName: string, toolName: string) => Promise<any>
  setMcpToolState: (serverName: string, toolName: string, enabled: boolean) => Promise<void>
  getAllMcpToolStates: () => Promise<Record<string, boolean>>
  setMcpToolAutoApprove: (serverName: string, toolName: string, autoApprove: boolean) => Promise<void>
  onMcpStatusUpdate: (callback: (servers: any[]) => void) => () => void
  onMcpServerUpdate: (callback: (server: any) => void) => () => void
  onMcpConfigFileChanged: (callback: (content: string) => void) => () => void

  // IndexedDB migration related API
  getMigrationStatus: (params: { dataSource?: string }) => Promise<any>
  aliasesQuery: (params: { action: string; searchText?: string; alias?: string }) => Promise<any[]>
  aliasesMutate: (params: { action: string; data?: any; alias?: string }) => Promise<void>
  kvGet: (params: { key?: string }) => Promise<any>
  kvMutate: (params: { action: string; key: string; value?: string }) => Promise<void>
  chatermGetChatermMessages: (data: { taskId: string }) => Promise<any>
  getTaskMetadata: (taskId: string) => Promise<{
    success: boolean
    data?: TaskMetadata
    error?: { message: string }
  }>
  getUserHosts: (search: string, limit?: number) => Promise<any>
  initUserDatabase: (data: { uid: number }) => Promise<any>
  // File dialog and local file operations
  saveCustomBackground: (sourcePath: string) => Promise<{
    success: boolean
    path?: string
    fileName?: string
    url?: string
    error?: string
  }>
  openSaveDialog: (opts: { fileName: string }) => Promise<string | null>
  writeLocalFile: (filePath: string, content: string) => Promise<void>
  getLocalWorkingDirectory: () => Promise<{ success: boolean; cwd: string }>
  getShellsLocal: () => Promise<any>
  agentEnableAndConfigure: (opts: { enabled: boolean }) => Promise<any>
  addKey: (opts: { keyData: string; passphrase?: string; comment?: string }) => Promise<any>
  getSecurityConfigPath: () => Promise<string>
  readSecurityConfig: () => Promise<string>
  writeSecurityConfig: (content: string) => Promise<void>
  onSecurityConfigFileChanged: (callback: (content: string) => void) => () => void
  getKeywordHighlightConfigPath: () => Promise<string>
  readKeywordHighlightConfig: () => Promise<string>
  writeKeywordHighlightConfig: (content: string) => Promise<{ success: boolean }>
  onKeywordHighlightConfigFileChanged: (callback: (content: string) => void) => () => void
  setDataSyncEnabled: (enabled: boolean) => Promise<any>
  getSystemInfo: (id: string) => Promise<{
    success: boolean
    data?: CommandGenerationContext
    error?: string
  }>

  // Plugin bastion capability API
  // Get registered bastion types (plugin-based, not including built-in JumpServer)
  getRegisteredBastionTypes: () => Promise<string[]>
  // Get all registered bastion definitions (plugin metadata for UI rendering)
  getBastionDefinitions: () => Promise<BastionDefinition[]>
  // Get a specific bastion definition by type
  getBastionDefinition: (type: string) => Promise<BastionDefinition | undefined>
  // Check if a specific bastion type is available
  hasBastionCapability: (type: string) => Promise<boolean>

  // K8s related APIs
  k8sGetContexts: () => Promise<{
    success: boolean
    data?: Array<{
      name: string
      cluster: string
      namespace: string
      server: string
      isActive: boolean
    }>
    currentContext?: string
    error?: string
  }>
  k8sGetContextDetail: (contextName: string) => Promise<{
    success: boolean
    data?: any
    error?: string
  }>
  k8sSwitchContext: (contextName: string) => Promise<{
    success: boolean
    currentContext?: string
    error?: string
  }>
  k8sReloadConfig: () => Promise<{
    success: boolean
    data?: any[]
    currentContext?: string
    error?: string
  }>
  k8sValidateContext: (contextName: string) => Promise<{
    success: boolean
    isValid?: boolean
    error?: string
  }>
  k8sInitialize: () => Promise<{
    success: boolean
    data?: any[]
    currentContext?: string
    error?: string
  }>

  // K8s watch stream APIs
  k8sStartWatch: (
    contextName: string,
    resourceType: string,
    options?: { namespace?: string; labelSelector?: string }
  ) => Promise<{
    success: boolean
    error?: string
  }>
  k8sStopWatch: (
    contextName: string,
    resourceType: string
  ) => Promise<{
    success: boolean
    error?: string
  }>
  k8sOnDeltaBatch: (callback: (batch: any) => void) => () => void
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: ApiType
  }
}
