import { ElectronAPI } from '@electron-toolkit/preload'
import type { TaskMetadata } from '../main/agent/core/context/context-tracking/ContextTrackerTypes'
import type { CommandGenerationContext, WebviewMessage } from '../main/agent/shared/WebviewMessage'

interface Cookie {
  name: string
  value: string
}

// ============================================================================
// Interactive Command Execution Types
// ============================================================================

/**
 * Interaction types that can be detected
 */
export type InteractionType = 'confirm' | 'select' | 'password' | 'pager' | 'enter' | 'freeform'

/**
 * Values for confirm-type interactions
 */
export interface ConfirmValues {
  /** Positive response value (e.g., "y", "Y", "yes") */
  yes: string
  /** Negative response value (e.g., "n", "N", "no") */
  no: string
  /** Default value if user presses Enter (optional) */
  default?: string
}

/**
 * Request sent to renderer process when interaction is needed
 */
export interface InteractionRequest {
  /** Unique command identifier */
  commandId: string
  /** Task identifier this command belongs to */
  taskId?: string
  /** Type of interaction needed */
  interactionType: InteractionType
  /** Human-readable prompt hint */
  promptHint: string
  /** Options for select-type interactions */
  options?: string[]
  /** Actual values to send for each option */
  optionValues?: string[]
  /** Values for confirm-type interactions */
  confirmValues?: ConfirmValues
  /** Exit key/command for the interactive program (e.g., 'q', 'quit', 'exit') */
  exitKey?: string
  /** Whether to append newline when sending exit key (default: true) */
  exitAppendNewline?: boolean
}

/**
 * Response from user interaction
 */
export interface InteractionResponse {
  /** Command identifier this response is for */
  commandId: string
  /** User input value */
  input: string
  /** Whether to append newline to input */
  appendNewline: boolean
  /** Type of interaction (for special handling like pager) */
  interactionType?: InteractionType
}

/**
 * Error codes for interaction submission failures
 */
export type InteractionErrorCode = 'timeout' | 'closed' | 'not-writable' | 'write-failed'

/**
 * Result of submitting an interaction
 */
export interface InteractionSubmitResult {
  /** Whether the submission was successful */
  success: boolean
  /** Error message if submission failed */
  error?: string
  /** Error code for UI to differentiate error types */
  code?: InteractionErrorCode
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

// KV transaction operation type
type KvOp = { action: 'set'; key: string; value: string } | { action: 'delete'; key: string }

// KV transaction context for collecting operations in renderer process
interface KvTransactionContext {
  get(key: string): Promise<string | null>
  set(key: string, value: string): void
  delete(key: string): void
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
  aiSuggestCommand: (data: { command: string; osInfo?: string }) => Promise<{ command: string; explanation: string } | null>
  getLocalAssetRoute: (data: { searchType: string; params?: any[] }) => Promise<any>
  recordConnection: (data: {
    assetUuid: string
    assetIp: string
    assetLabel?: string
    assetPort?: number
    assetUsername?: string
    assetType: string
    organizationId?: string
  }) => Promise<void>
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
  forkSession: (params: { sourceConnectionId: string; newConnectionId: string; host: string; port: number; username: string }) => Promise<any>
  startSshTunnel: (params: {
    connectionId: string
    tunnelId: string
    type: 'local_forward' | 'remote_forward' | 'dynamic_socks'
    localPort: number
    remotePort?: number
  }) => Promise<{ success: boolean; error?: string }>
  stopSshTunnel: (params: { tunnelId: string }) => Promise<{ success: boolean; error?: string }>
  shell: (params: any) => Promise<any>
  writeToShell: (params: any) => Promise<any>
  disconnect: (params: any) => Promise<any>
  selectPrivateKey: () => Promise<any>
  onShellData: (id: string, callback: (data: any) => void) => () => void
  onShellError: (id: string, callback: (data: any) => void) => () => void
  onShellClose: (
    id: string,
    callback: (data?: { reason: 'manual' | 'network' | 'unknown'; isNetworkDisconnect: boolean; errorCode?: string; errorMessage?: string }) => void
  ) => () => void
  recordTerminalState: (params: any) => Promise<any>
  recordCommand: (params: any) => Promise<any>
  sshSftpList: (opts: { id: string; path: string }) => Promise<any>
  sftpConnList: () => Promise<string[]>
  sshConnExec: (args: { id: string; cmd: string }) => Promise<any>
  sendToMain: (message: WebviewMessage) => Promise<void | null>
  onMainMessage: (callback: (message: any) => void) => () => void
  onCommandGenerationResponse: (callback: (response: { command?: string; error?: string; tabId: string }) => void) => () => void
  onCommandExplainResponse: (
    callback: (response: { explanation?: string; error?: string; tabId?: string; commandMessageId?: string }) => void
  ) => () => void
  cancelTask: (tabContext?: { tabId?: string } | string) => Promise<any>
  gracefulCancelTask: (tabContext?: { tabId?: string } | string) => Promise<any>
  userSnippetOperation: (data: { operation: 'list' | 'create' | 'delete' | 'update' | 'swap' | 'reorder'; params?: any }) => Promise<{
    code: number
    message?: string
    data?: any
  }>
  updateOrganizationAssetFavorite: (data: { organizationUuid: string; host: string; status: number }) => Promise<any>
  updateOrganizationAssetComment: (data: { organizationUuid: string; host: string; comment: string }) => Promise<any>
  // Organization asset management API
  getOrganizationAssets: (data: { organizationUuid: string; search?: string; page?: number; pageSize?: number }) => Promise<any>
  createOrganizationAsset: (data: { organizationUuid: string; hostname: string; host: string; comment?: string }) => Promise<any>
  updateOrganizationAsset: (data: { uuid: string; hostname?: string; host?: string; comment?: string }) => Promise<any>
  deleteOrganizationAsset: (data: { uuid: string }) => Promise<any>
  batchDeleteOrganizationAssets: (data: { uuids: string[] }) => Promise<any>
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
  onXshellWakeup: (callback: (payload: any) => void) => () => void
  consumePendingXshellWakeups: () => Promise<any[]>
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

  // Skills management
  getSkills: () => Promise<any[]>
  getEnabledSkills: () => Promise<any[]>
  setSkillEnabled: (skillId: string, enabled: boolean) => Promise<void>
  getSkillsUserPath: () => Promise<string>
  reloadSkills: () => Promise<void>
  createSkill: (metadata: any, content: string) => Promise<any>
  deleteSkill: (skillId: string) => Promise<void>
  openSkillsFolder: () => Promise<void>
  importSkillZip: (
    zipPath: string,
    overwrite?: boolean
  ) => Promise<{
    success: boolean
    skillId?: string
    skillName?: string
    error?: string
    errorCode?: 'INVALID_ZIP' | 'NO_SKILL_MD' | 'INVALID_METADATA' | 'DIR_EXISTS' | 'EXTRACT_FAILED' | 'UNKNOWN'
  }>
  readSkillContent: (skillName: string) => Promise<{ metadata: any; content: string }>
  updateSkill: (skillName: string, metadata: any, content: string) => Promise<void>
  exportSkillZip: (skillName: string) => Promise<{
    success: boolean
    filePath?: string
    error?: string
  }>
  onSkillsUpdate: (callback: (skills: any[]) => void) => () => void

  // IndexedDB migration related API
  getMigrationStatus: (params: { dataSource?: string }) => Promise<any>
  aliasesQuery: (params: { action: string; searchText?: string; alias?: string }) => Promise<any[]>
  aliasesMutate: (params: { action: string; data?: any; alias?: string }) => Promise<void>
  kvGet: (params: { key?: string }) => Promise<any>
  kvMutate: (params: { action: string; key: string; value?: string }) => Promise<void>
  kvTransaction: (callback: (tx: KvTransactionContext) => Promise<void>) => Promise<void>
  chatermGetChatermMessages: (data: { taskId: string }) => Promise<any>
  chatermGetChatermMessagesPage: (data: {
    taskId: string
    beforeCursor?: number | null
    limit?: number
  }) => Promise<import('../main/agent/shared/ExtensionMessage').ChatermMessagesPage>
  getTaskMetadata: (taskId: string) => Promise<{
    success: boolean
    data?: TaskMetadata
    error?: { message: string }
  }>
  saveTaskTitle: (
    taskId: string,
    title: string
  ) => Promise<{
    success: boolean
    error?: { message: string }
  }>
  saveTaskFavorite: (
    taskId: string,
    favorite: boolean
  ) => Promise<{
    success: boolean
    error?: { message: string }
  }>
  getTaskList: () => Promise<{
    success: boolean
    data?: Array<{
      id: string
      title: string | null
      favorite: boolean
      createdAt: number
      updatedAt: number
      hosts: Array<{ host: string; uuid: string; connection: string }>
    }>
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
  showOpenDialog: (options: {
    defaultPath?: string
    properties: string[]
    filters?: Array<{ name: string; extensions: string[] }>
  }) => Promise<{ canceled: boolean; filePaths: string[] } | undefined>
  getHomePath: () => Promise<string>

  stageChatAttachment: (payload: {
    taskId: string
    srcAbsPath: string
  }) => Promise<{ mode: 'as_is'; refPath: string } | { mode: 'offload'; refPath: string }>

  getPathForFile: (file: File) => string
  kbCheckPath: (absPath: string) => Promise<{ exists: boolean; isDirectory: boolean; isFile: boolean }>
  kbEnsureRoot: () => Promise<{ success: boolean }>
  kbGetRoot: () => Promise<{ root: string }>
  kbListDir: (relDir: string) => Promise<Array<{ name: string; relPath: string; type: 'file' | 'dir'; size?: number; mtimeMs?: number }>>
  kbReadFile: (relPath: string, encoding?: 'utf-8' | 'base64') => Promise<{ content: string; mtimeMs: number; mimeType?: string; isImage?: boolean }>
  kbWriteFile: (relPath: string, content: string, encoding?: 'utf-8' | 'base64') => Promise<{ mtimeMs: number }>
  kbCreateImage: (relDir: string, name: string, base64: string) => Promise<{ relPath: string }>
  kbMkdir: (relDir: string, name: string) => Promise<{ success: boolean; relPath: string }>
  kbCreateFile: (relDir: string, name: string, content?: string) => Promise<{ relPath: string }>
  kbRename: (relPath: string, newName: string) => Promise<{ relPath: string }>
  kbDelete: (relPath: string, recursive?: boolean) => Promise<{ success: boolean }>
  kbMove: (srcRelPath: string, dstRelDir: string) => Promise<{ relPath: string }>
  kbCopy: (srcRelPath: string, dstRelDir: string) => Promise<{ relPath: string }>
  kbImportFile: (srcAbsPath: string, dstRelDir: string) => Promise<{ jobId: string; relPath: string }>
  kbImportFolder: (srcAbsPath: string, dstRelDir: string) => Promise<{ jobId: string; relPath: string }>
  kbSetSearchEnabled: (enabled: boolean) => Promise<{ success: boolean; error?: string }>
  onKbTransferProgress: (callback: (data: { jobId: string; transferred: number; total: number; destRelPath: string }) => void) => () => void
  kbSyncGetStatus: () => Promise<{ status: 'idle' | 'syncing' }>
  kbSyncLastTime: () => Promise<number | null>
  kbSyncLastResults: () => Promise<{
    finishedAt: number
    uploads: Array<{ relPath: string; kind: 'upload' | 'delete'; status: string; message: string }>
    deletes: Array<{ relPath: string; kind: 'upload' | 'delete'; status: string; message: string }>
  }>
  getKbCloudStorage: () => Promise<{ usedBytes: number; totalBytes: number }>
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
  // Chat Sync V2
  chatSyncSetEnabled: (enabled: boolean) => Promise<{ success: boolean; error?: string }>
  chatSyncGetStatus: () => Promise<{ success: boolean; data?: any; error?: string }>
  chatSyncSyncNow: () => Promise<{ success: boolean; error?: string }>
  chatSyncSetAiTabVisible: (visible: boolean) => Promise<{ success: boolean }>
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

  // K8s Proxy Configuration APIs
  k8sSetProxy: (
    proxyConfig: {
      type?: 'HTTP' | 'HTTPS' | 'SOCKS4' | 'SOCKS5'
      host: string
      port: number
      enableProxyIdentity?: boolean
      username?: string
      password?: string
    } | null
  ) => Promise<{
    success: boolean
    error?: string
  }>
  k8sGetProxy: () => Promise<{
    success: boolean
    data?: {
      type?: 'HTTP' | 'HTTPS' | 'SOCKS4' | 'SOCKS5'
      host: string
      port: number
      enableProxyIdentity?: boolean
      username?: string
      password?: string
    } | null
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

  // K8s Cluster Management APIs
  k8sClusterList: () => Promise<{
    success: boolean
    data?: Array<{
      id: string
      name: string
      kubeconfig_path: string | null
      kubeconfig_content: string | null
      context_name: string
      server_url: string
      auth_type: string
      is_active: number
      connection_status: string
      auto_connect: number
      default_namespace: string
      created_at: string
      updated_at: string
    }>
    error?: string
  }>
  k8sClusterGet: (id: string) => Promise<{
    success: boolean
    data?: {
      id: string
      name: string
      kubeconfig_path: string | null
      kubeconfig_content: string | null
      context_name: string
      server_url: string
      auth_type: string
      is_active: number
      connection_status: string
      auto_connect: number
      default_namespace: string
      created_at: string
      updated_at: string
    } | null
    error?: string
  }>
  k8sClusterAdd: (params: {
    name: string
    kubeconfigPath?: string
    kubeconfigContent?: string
    contextName: string
    serverUrl: string
    authType?: string
    autoConnect?: boolean
    defaultNamespace?: string
  }) => Promise<{
    success: boolean
    id?: string
    error?: string
  }>
  k8sClusterUpdate: (
    id: string,
    params: {
      name?: string
      kubeconfigPath?: string
      kubeconfigContent?: string
      contextName?: string
      serverUrl?: string
      authType?: string
      isActive?: boolean
      connectionStatus?: string
      autoConnect?: boolean
      defaultNamespace?: string
    }
  ) => Promise<{
    success: boolean
    error?: string
  }>
  k8sClusterRemove: (id: string) => Promise<{
    success: boolean
    error?: string
  }>
  k8sClusterTest: (params: { kubeconfigPath?: string; kubeconfigContent?: string; contextName: string }) => Promise<{
    success: boolean
    isValid?: boolean
    error?: string
  }>
  k8sClusterImportKubeconfig: (kubeconfigPath: string) => Promise<{
    success: boolean
    data?: {
      contexts: Array<{
        name: string
        cluster: string
        namespace: string
        server: string
        isActive: boolean
      }>
      kubeconfigPath: string
      kubeconfigContent: string
    }
    error?: string
  }>
  k8sClusterConnect: (id: string) => Promise<{
    success: boolean
    status?: string
    error?: string
  }>
  k8sClusterDisconnect: (id: string) => Promise<{
    success: boolean
    status?: string
    error?: string
  }>

  // K8s Terminal APIs
  k8sTerminalCreate: (config: { id: string; clusterId: string; namespace?: string; cols?: number; rows?: number }) => Promise<{
    success: boolean
    id?: string
    error?: string
  }>
  k8sTerminalWrite: (
    terminalId: string,
    data: string
  ) => Promise<{
    success: boolean
    error?: string
  }>
  k8sTerminalResize: (
    terminalId: string,
    cols: number,
    rows: number
  ) => Promise<{
    success: boolean
    error?: string
  }>
  k8sTerminalClose: (terminalId: string) => Promise<{
    success: boolean
    error?: string
  }>
  k8sTerminalList: (clusterId: string) => Promise<{
    success: boolean
    data?: Array<{
      id: string
      cluster_id: string
      name: string | null
      namespace: string
      created_at: string
      updated_at: string
    }>
    error?: string
  }>
  k8sOnTerminalData: (terminalId: string, callback: (data: string) => void) => () => void
  k8sOnTerminalExit: (terminalId: string, callback: (exitCode: any) => void) => () => void

  // ============================================================================
  // K8S Agent API
  // ============================================================================

  /**
   * Set current cluster for Agent operations
   */
  k8sAgentSetCluster: (params: {
    clusterId: string
    contextName: string
    kubeconfigPath?: string
    kubeconfigContent?: string
  }) => Promise<{ success: boolean; error?: string }>

  /**
   * Set proxy configuration for K8S Agent
   */
  k8sAgentSetProxy: (
    proxyConfig: {
      type?: 'HTTP' | 'HTTPS' | 'SOCKS4' | 'SOCKS5'
      host: string
      port: number
      enableProxyIdentity?: boolean
      username?: string
      password?: string
    } | null
  ) => Promise<{ success: boolean; error?: string }>

  /**
   * Execute kubectl command
   */
  k8sAgentKubectl: (
    command: string,
    timeout?: number
  ) => Promise<{
    success: boolean
    output: string
    error?: string
    exitCode?: number
  }>

  /**
   * Get pods
   */
  k8sAgentGetPods: (namespace?: string) => Promise<{
    success: boolean
    output: string
    error?: string
  }>

  /**
   * Get nodes
   */
  k8sAgentGetNodes: () => Promise<{
    success: boolean
    output: string
    error?: string
  }>

  /**
   * Get namespaces
   */
  k8sAgentGetNamespaces: () => Promise<{
    success: boolean
    output: string
    error?: string
  }>

  /**
   * Get services
   */
  k8sAgentGetServices: (namespace?: string) => Promise<{
    success: boolean
    output: string
    error?: string
  }>

  /**
   * Get deployments
   */
  k8sAgentGetDeployments: (namespace?: string) => Promise<{
    success: boolean
    output: string
    error?: string
  }>

  /**
   * Get pod logs
   */
  k8sAgentGetPodLogs: (params: { podName: string; namespace?: string; container?: string; tailLines?: number }) => Promise<{
    success: boolean
    output: string
    error?: string
  }>

  /**
   * Describe resource
   */
  k8sAgentDescribe: (params: { resourceType: string; resourceName: string; namespace?: string }) => Promise<{
    success: boolean
    output: string
    error?: string
  }>

  /**
   * Test K8S connection
   */
  k8sAgentTestConnection: () => Promise<{
    success: boolean
    output: string
    error?: string
  }>

  /**
   * Get current cluster info
   */
  k8sAgentGetCurrentCluster: () => Promise<{
    success: boolean
    data?: {
      clusterId: string | null
      contextName: string | null
    }
    error?: string
  }>

  /**
   * Cleanup K8S Agent resources
   */
  k8sAgentCleanup: () => Promise<{ success: boolean; error?: string }>

  // ============================================================================
  // Interactive Command Execution API
  // ============================================================================

  /**
   * Listen for interaction requests from main process
   * Returns cleanup function to remove listener
   */
  onInteractionNeeded: (callback: (request: InteractionRequest) => void) => () => void

  /**
   * Listen for interaction close events from main process
   * Returns cleanup function to remove listener
   */
  onInteractionClosed: (callback: (data: { commandId: string }) => void) => () => void

  /**
   * Listen for interaction suppressed events from main process
   * Returns cleanup function to remove listener
   */
  onInteractionSuppressed: (callback: (data: { commandId: string }) => void) => () => void

  /**
   * Listen for TUI detected events from main process
   * Returns cleanup function to remove listener
   */
  onTuiDetected: (callback: (data: { commandId: string; taskId?: string; message: string }) => void) => () => void

  /**
   * Listen for alternate screen entered events (TUI programs like vim, man, git log)
   * Returns cleanup function to remove listener
   */
  onAlternateScreenEntered: (callback: (data: { commandId: string; taskId?: string; message: string }) => void) => () => void

  /**
   * Submit user interaction response
   */
  submitInteraction: (response: InteractionResponse) => Promise<InteractionSubmitResult>

  /**
   * Cancel interaction (sends Ctrl+C)
   */
  cancelInteraction: (commandId: string) => Promise<InteractionSubmitResult>

  /**
   * Dismiss interaction (close UI but continue detection)
   */
  dismissInteraction: (commandId: string) => Promise<InteractionSubmitResult>

  /**
   * Suppress interaction detection for a command
   */
  suppressInteraction: (commandId: string) => Promise<InteractionSubmitResult>

  /**
   * Resume interaction detection for a suppressed command
   */
  unsuppressInteraction: (commandId: string) => Promise<InteractionSubmitResult>

  /**
   * Report renderer performance marks to main process
   */
  reportPerfMarks: (marks: Array<{ name: string; startTime: number; timestamp: number }>) => Promise<{ success: boolean }>

  /**
   * Get combined startup timeline from main process
   */
  getPerfTimeline: () => Promise<{
    main: { process: string; marks: Array<{ name: string; offset: number; timestamp: number }> }
    renderer: { process: string; marks: Array<{ name: string; offset: number; timestamp: number }> } | null
  }>

  /**
   * Send a log entry from renderer to main process
   */
  log: (payload: {
    level: 'debug' | 'info' | 'warn' | 'error'
    process: 'renderer' | 'preload'
    module: string
    message: string
    meta?: Record<string, unknown>
  }) => Promise<{ success: boolean; error?: string }>

  /**
   * Open the log directory in the system file manager
   */
  openLogDir: () => Promise<void>
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: ApiType
  }
}
