import Database from 'better-sqlite3'
import type { Anthropic } from '@anthropic-ai/sdk'
import { initChatermDatabase, getCurrentUserId } from './connection'
import {
  getLocalAssetRouteLogic,
  updateLocalAssetLabelLogic,
  updateLocalAsseFavoriteLogic,
  getAssetGroupLogic,
  createAssetLogic,
  createOrUpdateAssetLogic,
  deleteAssetLogic,
  updateAssetLogic,
  connectAssetInfoLogic,
  getUserHostsLogic,
  refreshOrganizationAssetsLogic,
  updateOrganizationAssetFavoriteLogic,
  updateOrganizationAssetCommentLogic,
  createCustomFolderLogic,
  getCustomFoldersLogic,
  updateCustomFolderLogic,
  deleteCustomFolderLogic,
  moveAssetToFolderLogic,
  removeAssetFromFolderLogic,
  getAssetsInFolderLogic,
  getOrganizationAssetsLogic,
  createOrganizationAssetLogic,
  updateOrganizationAssetLogic,
  deleteOrganizationAssetLogic,
  batchDeleteOrganizationAssetsLogic,
  recordConnectionLogic
} from './chaterm/assets'
import {
  deleteChatermHistoryByTaskIdLogic,
  getApiConversationHistoryLogic,
  saveApiConversationHistoryLogic,
  getSavedChatermMessagesLogic,
  getSavedChatermMessagesPageLogic,
  saveChatermMessagesLogic,
  getTaskMetadataLogic,
  saveTaskMetadataLogic,
  saveTaskTitleLogic,
  saveTaskFavoriteLogic,
  getTaskListLogic,
  ensureTaskMetadataExistsLogic,
  touchTaskUpdatedAtLogic,
  getContextHistoryLogic,
  saveContextHistoryLogic
} from './chaterm/agent'
import type { TaskListItem } from '../../agent/core/context/context-tracking/ContextTrackerTypes'
import {
  getKeyChainSelectLogic,
  createKeyChainLogic,
  deleteKeyChainLogic,
  getKeyChainInfoLogic,
  updateKeyChainLogic,
  getKeyChainListLogic
} from './chaterm/keychains'
import { userSnippetOperationLogic } from './chaterm/snippets'
import {
  getToolStateLogic,
  setToolStateLogic,
  getServerToolStatesLogic,
  getAllToolStatesLogic,
  deleteServerToolStatesLogic
} from './chaterm/mcp-tool-state'
import {
  getSkillStatesLogic,
  getSkillStateLogic,
  setSkillStateLogic,
  updateSkillConfigLogic,
  updateSkillLastUsedLogic,
  deleteSkillStateLogic,
  getEnabledSkillNamesLogic
} from './chaterm/skills'
import {
  listK8sClustersLogic,
  getK8sClusterLogic,
  addK8sClusterLogic,
  updateK8sClusterLogic,
  removeK8sClusterLogic,
  setActiveK8sClusterLogic,
  updateK8sClusterStatusLogic,
  listK8sTerminalSessionsLogic,
  addK8sTerminalSessionLogic,
  removeK8sTerminalSessionLogic,
  removeAllK8sTerminalSessionsLogic,
  type K8sClusterRecord,
  type K8sTerminalSessionRecord
} from './chaterm/k8s-clusters'
import type { SkillState } from '../../agent/shared/skills'
import type { ChatSyncTaskState, TaskSnapshotTables } from '../chat_sync/models/ChatSyncTypes'
const logger = createLogger('db')

/**
 * Strip the local-only surrogate 'id' column from a snapshot row.
 * The 'id' is an auto-increment INTEGER PRIMARY KEY assigned by SQLite and
 * differs across devices, so including it would cause hash instability.
 */
function stripLocalId(row: Record<string, unknown>): Record<string, unknown> {
  if (!('id' in row)) return row
  const { id: _, ...rest } = row
  return rest
}

export class ChatermDatabaseService {
  private static instances: Map<number, ChatermDatabaseService> = new Map()
  // Lock map to prevent race conditions during async initialization
  private static initializingPromises: Map<number, Promise<ChatermDatabaseService>> = new Map()
  private db: Database.Database
  private userId: number

  private constructor(db: Database.Database, userId: number) {
    this.db = db
    this.userId = userId
  }

  public static async getInstance(userId?: number): Promise<ChatermDatabaseService> {
    const targetUserId = userId || getCurrentUserId()
    if (!targetUserId) {
      throw new Error('User ID is required for ChatermDatabaseService')
    }

    // Return existing instance immediately if available
    const existingInstance = ChatermDatabaseService.instances.get(targetUserId)
    if (existingInstance) {
      return existingInstance
    }

    // Check if initialization is already in progress for this user
    const existingPromise = ChatermDatabaseService.initializingPromises.get(targetUserId)
    if (existingPromise) {
      logger.info(`Waiting for existing initialization for user ${targetUserId}`)
      return existingPromise
    }

    // Start new initialization and store the promise
    logger.info(`Creating new ChatermDatabaseService instance for user ${targetUserId}`)
    const initPromise = (async () => {
      try {
        const db = await initChatermDatabase(targetUserId)
        const instance = new ChatermDatabaseService(db, targetUserId)
        ChatermDatabaseService.instances.set(targetUserId, instance)
        return instance
      } finally {
        // Clean up the initializing promise after completion (success or failure)
        ChatermDatabaseService.initializingPromises.delete(targetUserId)
      }
    })()

    ChatermDatabaseService.initializingPromises.set(targetUserId, initPromise)
    return initPromise
  }

  public getUserId(): number {
    return this.userId
  }

  async getLocalAssetRoute(searchType: string, params: any[] = []): Promise<any> {
    return await getLocalAssetRouteLogic(this.db, searchType, params)
  }

  recordConnection(params: {
    assetUuid: string
    assetIp: string
    assetLabel?: string
    assetPort?: number
    assetUsername?: string
    assetType: string
    organizationId?: string
  }): void {
    recordConnectionLogic(this.db, params)
  }

  updateLocalAssetLabel(uuid: string, label: string): any {
    return updateLocalAssetLabelLogic(this.db, uuid, label)
  }

  updateLocalAsseFavorite(uuid: string, status: number): any {
    return updateLocalAsseFavoriteLogic(this.db, uuid, status)
  }

  getAssetGroup(): any {
    return getAssetGroupLogic(this.db)
  }

  // Get keychain options
  getKeyChainSelect(): any {
    return getKeyChainSelectLogic(this.db)
  }
  createKeyChain(params: any): any {
    return createKeyChainLogic(this.db, params)
  }

  deleteKeyChain(id: number): any {
    return deleteKeyChainLogic(this.db, id)
  }
  getKeyChainInfo(id: number): any {
    return getKeyChainInfoLogic(this.db, id)
  }
  updateKeyChain(params: any): any {
    return updateKeyChainLogic(this.db, params)
  }

  createAsset(params: any): any {
    return createAssetLogic(this.db, params)
  }

  createOrUpdateAsset(params: any): any {
    return createOrUpdateAssetLogic(this.db, params)
  }

  deleteAsset(uuid: string): any {
    return deleteAssetLogic(this.db, uuid)
  }

  updateAsset(params: any): any {
    return updateAssetLogic(this.db, params)
  }

  getKeyChainList(): any {
    return getKeyChainListLogic(this.db)
  }
  connectAssetInfo(uuid: string): any {
    return connectAssetInfoLogic(this.db, uuid)
  }
  // @Get user host list (limited)
  getUserHosts(search: string, limit: number = 50): any {
    return getUserHostsLogic(this.db, search, limit)
  }

  // Transaction handling
  transaction(fn: () => void): any {
    return this.db.transaction(fn)()
  }

  // Agent API conversation history related methods

  async deleteChatermHistoryByTaskId(taskId: string): Promise<void> {
    return deleteChatermHistoryByTaskIdLogic(this.db, taskId)
  }

  async getApiConversationHistory(taskId: string): Promise<any[]> {
    return getApiConversationHistoryLogic(this.db, taskId)
  }

  async saveApiConversationHistory(taskId: string, apiConversationHistory: Anthropic.MessageParam[]): Promise<void> {
    return saveApiConversationHistoryLogic(this.db, taskId, apiConversationHistory)
  }

  // Agent UI message related methods
  async getSavedChatermMessages(taskId: string): Promise<any[]> {
    return getSavedChatermMessagesLogic(this.db, taskId)
  }

  async getSavedChatermMessagesPage(taskId: string, options?: { beforeCursor?: number | null; limit?: number }) {
    return getSavedChatermMessagesPageLogic(this.db, taskId, options)
  }

  async saveChatermMessages(taskId: string, uiMessages: any[]): Promise<void> {
    return saveChatermMessagesLogic(this.db, taskId, uiMessages)
  }

  // Agent task metadata related methods
  async getTaskMetadata(taskId: string): Promise<any> {
    return getTaskMetadataLogic(this.db, taskId)
  }

  async saveTaskMetadata(taskId: string, metadata: any): Promise<void> {
    return saveTaskMetadataLogic(this.db, taskId, metadata)
  }

  async saveTaskTitle(taskId: string, title: string): Promise<void> {
    return saveTaskTitleLogic(this.db, taskId, title)
  }

  async saveTaskFavorite(taskId: string, favorite: boolean): Promise<void> {
    return saveTaskFavoriteLogic(this.db, taskId, favorite)
  }

  async getTaskList(): Promise<TaskListItem[]> {
    return getTaskListLogic(this.db)
  }

  async ensureTaskMetadataExists(taskId: string, initialTitle?: string): Promise<void> {
    return ensureTaskMetadataExistsLogic(this.db, taskId, initialTitle)
  }

  async touchTaskUpdatedAt(taskId: string): Promise<void> {
    return touchTaskUpdatedAtLogic(this.db, taskId)
  }

  // Agent context history related methods
  async getContextHistory(taskId: string): Promise<any> {
    return getContextHistoryLogic(this.db, taskId)
  }

  async saveContextHistory(taskId: string, contextHistory: any): Promise<void> {
    return saveContextHistoryLogic(this.db, taskId, contextHistory)
  }
  // Shortcut command related methods
  userSnippetOperation(
    operation: 'list' | 'create' | 'delete' | 'update' | 'swap' | 'reorder' | 'listGroups' | 'createGroup' | 'updateGroup' | 'deleteGroup',
    params?: any
  ): any {
    return userSnippetOperationLogic(this.db, operation, params)
  }

  async refreshOrganizationAssets(organizationUuid: string, jumpServerConfig: any): Promise<any> {
    return await refreshOrganizationAssetsLogic(this.db, organizationUuid, jumpServerConfig)
  }

  async refreshOrganizationAssetsWithAuth(
    organizationUuid: string,
    jumpServerConfig: any,
    keyboardInteractiveHandler?: any,
    authResultCallback?: any
  ): Promise<any> {
    return await refreshOrganizationAssetsLogic(this.db, organizationUuid, jumpServerConfig, keyboardInteractiveHandler, authResultCallback)
  }

  updateOrganizationAssetFavorite(organizationUuid: string, host: string, status: number): any {
    try {
      const result = updateOrganizationAssetFavoriteLogic(this.db, organizationUuid, host, status)
      return result
    } catch (error) {
      logger.error('ChatermDatabaseService.updateOrganizationAssetFavorite error', { error: error })
      throw error
    }
  }

  updateOrganizationAssetComment(organizationUuid: string, host: string, comment: string): any {
    try {
      const result = updateOrganizationAssetCommentLogic(this.db, organizationUuid, host, comment)
      return result
    } catch (error) {
      logger.error('ChatermDatabaseService.updateOrganizationAssetComment error', { error: error })
      throw error
    }
  }

  // Custom folder management methods
  createCustomFolder(name: string, description?: string): any {
    try {
      const result = createCustomFolderLogic(this.db, name, description)
      return result
    } catch (error) {
      logger.error('ChatermDatabaseService.createCustomFolder error', { error: error })
      throw error
    }
  }

  getCustomFolders(): any {
    try {
      const result = getCustomFoldersLogic(this.db)
      return result
    } catch (error) {
      logger.error('ChatermDatabaseService.getCustomFolders error', { error: error })
      throw error
    }
  }

  updateCustomFolder(folderUuid: string, name: string, description?: string): any {
    try {
      const result = updateCustomFolderLogic(this.db, folderUuid, name, description)
      return result
    } catch (error) {
      logger.error('ChatermDatabaseService.updateCustomFolder error', { error: error })
      throw error
    }
  }

  deleteCustomFolder(folderUuid: string): any {
    try {
      const result = deleteCustomFolderLogic(this.db, folderUuid)
      return result
    } catch (error) {
      logger.error('ChatermDatabaseService.deleteCustomFolder error', { error: error })
      throw error
    }
  }

  moveAssetToFolder(folderUuid: string, organizationUuid: string, assetHost: string): any {
    try {
      const result = moveAssetToFolderLogic(this.db, folderUuid, organizationUuid, assetHost)
      return result
    } catch (error) {
      logger.error('ChatermDatabaseService.moveAssetToFolder error', { error: error })
      throw error
    }
  }

  removeAssetFromFolder(folderUuid: string, organizationUuid: string, assetHost: string): any {
    try {
      const result = removeAssetFromFolderLogic(this.db, folderUuid, organizationUuid, assetHost)
      return result
    } catch (error) {
      logger.error('ChatermDatabaseService.removeAssetFromFolder error', { error: error })
      throw error
    }
  }

  getAssetsInFolder(folderUuid: string): any {
    try {
      const result = getAssetsInFolderLogic(this.db, folderUuid)
      return result
    } catch (error) {
      logger.error('ChatermDatabaseService.getAssetsInFolder error', { error: error })
      throw error
    }
  }

  // Organization asset management methods
  getOrganizationAssets(organizationUuid: string, search?: string, page?: number, pageSize?: number): any {
    try {
      const result = getOrganizationAssetsLogic(this.db, organizationUuid, search, page, pageSize)
      return result
    } catch (error) {
      logger.error('ChatermDatabaseService.getOrganizationAssets error', { error: error })
      throw error
    }
  }

  createOrganizationAsset(organizationUuid: string, data: { hostname: string; host: string; comment?: string }): any {
    try {
      const result = createOrganizationAssetLogic(this.db, organizationUuid, data)
      return result
    } catch (error) {
      logger.error('ChatermDatabaseService.createOrganizationAsset error', { error: error })
      throw error
    }
  }

  updateOrganizationAsset(uuid: string, data: { hostname?: string; host?: string; comment?: string }): any {
    try {
      const result = updateOrganizationAssetLogic(this.db, uuid, data)
      return result
    } catch (error) {
      logger.error('ChatermDatabaseService.updateOrganizationAsset error', { error: error })
      throw error
    }
  }

  deleteOrganizationAsset(uuid: string): any {
    try {
      const result = deleteOrganizationAssetLogic(this.db, uuid)
      return result
    } catch (error) {
      logger.error('ChatermDatabaseService.deleteOrganizationAsset error', { error: error })
      throw error
    }
  }

  batchDeleteOrganizationAssets(uuids: string[]): any {
    try {
      const result = batchDeleteOrganizationAssetsLogic(this.db, uuids)
      return result
    } catch (error) {
      logger.error('ChatermDatabaseService.batchDeleteOrganizationAssets error', { error: error })
      throw error
    }
  }

  // MCP tool state management methods
  getMcpToolState(serverName: string, toolName: string): any {
    try {
      const result = getToolStateLogic(this.db, serverName, toolName)
      return result
    } catch (error) {
      logger.error('ChatermDatabaseService.getMcpToolState error', { error: error })
      throw error
    }
  }

  setMcpToolState(serverName: string, toolName: string, enabled: boolean): void {
    try {
      setToolStateLogic(this.db, serverName, toolName, enabled)
    } catch (error) {
      logger.error('ChatermDatabaseService.setMcpToolState error', { error: error })
      throw error
    }
  }

  getServerMcpToolStates(serverName: string): any {
    try {
      const result = getServerToolStatesLogic(this.db, serverName)
      return result
    } catch (error) {
      logger.error('ChatermDatabaseService.getServerMcpToolStates error', { error: error })
      throw error
    }
  }

  getAllMcpToolStates(): Record<string, boolean> {
    try {
      const result = getAllToolStatesLogic(this.db)
      return result
    } catch (error) {
      logger.error('ChatermDatabaseService.getAllMcpToolStates error', { error: error })
      throw error
    }
  }

  deleteServerMcpToolStates(serverName: string): void {
    try {
      deleteServerToolStatesLogic(this.db, serverName)
    } catch (error) {
      logger.error('ChatermDatabaseService.deleteServerMcpToolStates error', { error: error })
      throw error
    }
  }

  // ==================== Skills State Management Methods ====================

  /**
   * Get all skill states
   */
  getSkillStates(): SkillState[] {
    try {
      return getSkillStatesLogic(this.db)
    } catch (error) {
      logger.error('ChatermDatabaseService.getSkillStates error', { error: error })
      return []
    }
  }

  /**
   * Get a specific skill state
   */
  getSkillState(skillId: string): SkillState | null {
    try {
      return getSkillStateLogic(this.db, skillId)
    } catch (error) {
      logger.error('ChatermDatabaseService.getSkillState error', { error: error })
      return null
    }
  }

  /**
   * Set skill enabled state
   */
  setSkillState(skillId: string, enabled: boolean): void {
    try {
      setSkillStateLogic(this.db, skillId, enabled)
    } catch (error) {
      logger.error('ChatermDatabaseService.setSkillState error', { error: error })
      throw error
    }
  }

  /**
   * Update skill config
   */
  updateSkillConfig(skillId: string, config: Record<string, unknown>): void {
    try {
      updateSkillConfigLogic(this.db, skillId, config)
    } catch (error) {
      logger.error('ChatermDatabaseService.updateSkillConfig error', { error: error })
      throw error
    }
  }

  /**
   * Update skill last used timestamp
   */
  updateSkillLastUsed(skillId: string): void {
    try {
      updateSkillLastUsedLogic(this.db, skillId)
    } catch (error) {
      logger.error('ChatermDatabaseService.updateSkillLastUsed error', { error: error })
    }
  }

  /**
   * Delete skill state
   */
  deleteSkillState(skillId: string): void {
    try {
      deleteSkillStateLogic(this.db, skillId)
    } catch (error) {
      logger.error('ChatermDatabaseService.deleteSkillState error', { error: error })
      throw error
    }
  }

  /**
   * Get enabled skill names
   */
  getEnabledSkillNames(): string[] {
    try {
      return getEnabledSkillNamesLogic(this.db)
    } catch (error) {
      logger.error('ChatermDatabaseService.getEnabledSkillNames error', { error: error })
      return []
    }
  }

  // ==================== K8S Cluster Management Methods ====================

  /**
   * List all K8S clusters
   */
  listK8sClusters(): K8sClusterRecord[] {
    try {
      return listK8sClustersLogic(this.db)
    } catch (error) {
      logger.error('ChatermDatabaseService.listK8sClusters error', { error: error })
      return []
    }
  }

  /**
   * Get a K8S cluster by ID
   */
  getK8sCluster(id: string): K8sClusterRecord | null {
    try {
      return getK8sClusterLogic(this.db, id)
    } catch (error) {
      logger.error('ChatermDatabaseService.getK8sCluster error', { error: error })
      return null
    }
  }

  /**
   * Add a new K8S cluster
   */
  addK8sCluster(params: {
    name: string
    kubeconfigPath?: string
    kubeconfigContent?: string
    contextName: string
    serverUrl: string
    authType?: string
    autoConnect?: boolean
    defaultNamespace?: string
  }): { success: boolean; id?: string; error?: string } {
    try {
      return addK8sClusterLogic(this.db, params)
    } catch (error) {
      logger.error('ChatermDatabaseService.addK8sCluster error', { error: error })
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  }

  /**
   * Update a K8S cluster
   */
  updateK8sCluster(
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
  ): { success: boolean; error?: string } {
    try {
      return updateK8sClusterLogic(this.db, id, params)
    } catch (error) {
      logger.error('ChatermDatabaseService.updateK8sCluster error', { error: error })
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  }

  /**
   * Remove a K8S cluster
   */
  removeK8sCluster(id: string): { success: boolean; error?: string } {
    try {
      return removeK8sClusterLogic(this.db, id)
    } catch (error) {
      logger.error('ChatermDatabaseService.removeK8sCluster error', { error: error })
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  }

  /**
   * Set active K8S cluster
   */
  setActiveK8sCluster(id: string): { success: boolean; error?: string } {
    try {
      return setActiveK8sClusterLogic(this.db, id)
    } catch (error) {
      logger.error('ChatermDatabaseService.setActiveK8sCluster error', { error: error })
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  }

  /**
   * Update K8S cluster connection status
   */
  updateK8sClusterStatus(id: string, status: 'connected' | 'disconnected' | 'error'): { success: boolean; error?: string } {
    try {
      return updateK8sClusterStatusLogic(this.db, id, status)
    } catch (error) {
      logger.error('ChatermDatabaseService.updateK8sClusterStatus error', { error: error })
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  }

  /**
   * List K8S terminal sessions for a cluster
   */
  listK8sTerminalSessions(clusterId: string): K8sTerminalSessionRecord[] {
    try {
      return listK8sTerminalSessionsLogic(this.db, clusterId)
    } catch (error) {
      logger.error('ChatermDatabaseService.listK8sTerminalSessions error', { error: error })
      return []
    }
  }

  /**
   * Add a K8S terminal session
   */
  addK8sTerminalSession(params: { clusterId: string; name?: string; namespace?: string }): { success: boolean; id?: string; error?: string } {
    try {
      return addK8sTerminalSessionLogic(this.db, params)
    } catch (error) {
      logger.error('ChatermDatabaseService.addK8sTerminalSession error', { error: error })
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  }

  /**
   * Remove a K8S terminal session
   */
  removeK8sTerminalSession(id: string): { success: boolean; error?: string } {
    try {
      return removeK8sTerminalSessionLogic(this.db, id)
    } catch (error) {
      logger.error('ChatermDatabaseService.removeK8sTerminalSession error', { error: error })
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  }

  /**
   * Remove all K8S terminal sessions for a cluster
   */
  removeAllK8sTerminalSessions(clusterId: string): { success: boolean; error?: string } {
    try {
      return removeAllK8sTerminalSessionsLogic(this.db, clusterId)
    } catch (error) {
      logger.error('ChatermDatabaseService.removeAllK8sTerminalSessions error', { error: error })
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  }

  // ==================== IndexedDB Migration Status Query Methods ====================

  /**
   * Get migration status
   */
  getMigrationStatus(dataSource: string): any {
    try {
      const row = this.db.prepare('SELECT * FROM indexdb_migration_status WHERE data_source = ?').get(dataSource)
      return row || null
    } catch (error) {
      logger.error('ChatermDatabaseService.getMigrationStatus error', { error: error })
      throw error
    }
  }

  /**
   * Get all migration status
   */
  getAllMigrationStatus(): any[] {
    try {
      const rows = this.db.prepare('SELECT * FROM indexdb_migration_status').all()
      return rows
    } catch (error) {
      logger.error('ChatermDatabaseService.getAllMigrationStatus error', { error: error })
      throw error
    }
  }

  // ==================== Aliases CRUD Methods (Core Business Logic, Permanently Reserved) ====================
  // Note: These methods are not only used for IndexedDB migration, but more importantly by normal business logic
  // Dependencies: commandStoreService.ts calls via IPC handlers 'db:aliases:query' and 'db:aliases:mutate'
  // These methods should remain after migration is complete, as standard CRUD interfaces for SQLite database

  /**
   * Get all aliases
   * Usage: Renderer process calls via window.api.aliasesQuery({ action: 'getAll' })
   */
  getAliases(): any[] {
    try {
      const rows = this.db.prepare('SELECT * FROM t_aliases ORDER BY created_at DESC').all()
      return rows
    } catch (error) {
      logger.error('ChatermDatabaseService.getAliases error', { error: error })
      throw error
    }
  }

  /**
   * Get by alias name
   * Usage: Renderer process calls via window.api.aliasesQuery({ action: 'getByAlias', alias })
   */
  getAliasByName(alias: string): any {
    try {
      const row = this.db.prepare('SELECT * FROM t_aliases WHERE alias = ?').get(alias)
      return row || null
    } catch (error) {
      logger.error('ChatermDatabaseService.getAliasByName error', { error: error })
      throw error
    }
  }

  /**
   * Search aliases
   * Usage: Renderer process calls via window.api.aliasesQuery({ action: 'search', searchText })
   */
  searchAliases(searchText: string): any[] {
    try {
      const rows = this.db
        .prepare('SELECT * FROM t_aliases WHERE alias LIKE ? OR command LIKE ? ORDER BY created_at DESC')
        .all(`%${searchText}%`, `%${searchText}%`)
      return rows
    } catch (error) {
      logger.error('ChatermDatabaseService.searchAliases error', { error: error })
      throw error
    }
  }

  /**
   * Save alias
   * Usage: Renderer process calls via window.api.aliasesMutate({ action: 'save', data })
   */
  saveAlias(data: any): void {
    try {
      this.db
        .prepare(
          `
        INSERT OR REPLACE INTO t_aliases (id, alias, command, created_at)
        VALUES (?, ?, ?, ?)
      `
        )
        .run(data.id, data.alias, data.command, data.created_at || Date.now())
    } catch (error) {
      logger.error('ChatermDatabaseService.saveAlias error', { error: error })
      throw error
    }
  }

  /**
   * Delete alias
   * Usage: Renderer process calls via window.api.aliasesMutate({ action: 'delete', alias })
   */
  deleteAlias(alias: string): void {
    try {
      this.db.prepare('DELETE FROM t_aliases WHERE alias = ?').run(alias)
    } catch (error) {
      logger.error('ChatermDatabaseService.deleteAlias error', { error: error })
      throw error
    }
  }

  // ==================== Key-Value Store CRUD Methods (Core Business Logic, Permanently Reserved) ====================
  // Note: These methods are not only used for IndexedDB migration, but more importantly by normal business logic
  // Dependencies: userConfigStoreService.ts and key-storage.ts call via IPC handlers 'db:kv:get' and 'db:kv:mutate'
  // These methods should remain after migration is complete, as standard CRUD interfaces for SQLite database

  /**
   * Get key-value pair
   * Usage: Renderer process calls via window.api.kvGet({ key })
   */
  getKeyValue(key: string): any {
    try {
      const row = this.db.prepare('SELECT * FROM key_value_store WHERE key = ?').get(key)
      return row || null
    } catch (error) {
      logger.error('ChatermDatabaseService.getKeyValue error', { error: error })
      throw error
    }
  }

  /**
   * Get all keys
   * Usage: Renderer process calls via window.api.kvGet() (without key parameter)
   */
  getAllKeys(): string[] {
    try {
      const rows = this.db.prepare('SELECT key FROM key_value_store').all() as Array<{ key: string }>
      return rows.map((row) => row.key)
    } catch (error) {
      logger.error('ChatermDatabaseService.getAllKeys error', { error: error })
      throw error
    }
  }

  /**
   * Set key-value pair
   * Usage: Renderer process calls via window.api.kvMutate({ action: 'set', key, value })
   */
  setKeyValue(data: any): void {
    try {
      this.db
        .prepare(
          `
        INSERT OR REPLACE INTO key_value_store (key, value, updated_at)
        VALUES (?, ?, ?)
      `
        )
        .run(data.key, data.value, data.updated_at || Date.now())
    } catch (error) {
      logger.error('ChatermDatabaseService.setKeyValue error', { error: error })
      throw error
    }
  }

  /**
   * Delete key-value pair
   * Usage: Renderer process calls via window.api.kvMutate({ action: 'delete', key })
   */
  deleteKeyValue(key: string): void {
    try {
      this.db.prepare('DELETE FROM key_value_store WHERE key = ?').run(key)
    } catch (error) {
      logger.error('ChatermDatabaseService.deleteKeyValue error', { error: error })
      throw error
    }
  }

  /**
   * Execute multiple KV operations in a single SQLite transaction.
   * All operations succeed or all are rolled back.
   * Usage: Renderer process calls via window.api.kvTransaction(callback)
   */
  kvTransaction(ops: Array<{ action: 'set' | 'delete'; key: string; value?: string }>): void {
    const setStmt = this.db.prepare('INSERT OR REPLACE INTO key_value_store (key, value, updated_at) VALUES (?, ?, ?)')
    const deleteStmt = this.db.prepare('DELETE FROM key_value_store WHERE key = ?')

    this.db.transaction(() => {
      const now = Date.now()
      for (const op of ops) {
        switch (op.action) {
          case 'set':
            setStmt.run(op.key, op.value, now)
            break
          case 'delete':
            deleteStmt.run(op.key)
            break
          default:
            throw new Error(`Invalid KV transaction action: ${(op as any).action}`)
        }
      }
    })()
  }

  // ==================== Chat Sync V2 Methods ====================

  /**
   * Get the raw database instance for transactional operations.
   * Only ChatSnapshotStore should use this.
   */
  getDb(): Database.Database {
    return this.db
  }

  /**
   * Export 4 chat tables for a task as a snapshot.
   * Excludes local-only surrogate 'id' column to ensure cross-device hash stability.
   */
  exportTaskSnapshot(taskId: string): TaskSnapshotTables {
    const apiHistory = this.db
      .prepare(`SELECT * FROM agent_api_conversation_history_v1 WHERE task_id = ? ORDER BY sequence_order ASC`)
      .all(taskId) as Record<string, unknown>[]

    const uiMessages = this.db.prepare(`SELECT * FROM agent_ui_messages_v1 WHERE task_id = ? ORDER BY ts ASC`).all(taskId) as Record<
      string,
      unknown
    >[]

    const taskMetadata = this.db.prepare(`SELECT * FROM agent_task_metadata_v1 WHERE task_id = ?`).all(taskId) as Record<string, unknown>[]

    const contextHistory = this.db.prepare(`SELECT * FROM agent_context_history_v1 WHERE task_id = ?`).all(taskId) as Record<string, unknown>[]

    return {
      agent_api_conversation_history_v1: apiHistory.map(stripLocalId),
      agent_ui_messages_v1: uiMessages.map(stripLocalId),
      agent_task_metadata_v1: taskMetadata,
      agent_context_history_v1: contextHistory
    }
  }

  /**
   * Import a remote snapshot into the 4 chat tables in a single transaction.
   * Deletes existing data for the task first, then inserts new data.
   */
  importTaskSnapshot(taskId: string, tables: TaskSnapshotTables): void {
    this.db.transaction(() => {
      this._importTaskSnapshotRaw(taskId, tables)
    })()
  }

  /**
   * Import snapshot data WITHOUT wrapping in a transaction.
   * Use this when you need to combine import with other operations
   * in an outer transaction (SQLite does not support nested transactions).
   */
  _importTaskSnapshotRaw(taskId: string, tables: TaskSnapshotTables): void {
    // Delete existing data
    this.db.prepare('DELETE FROM agent_api_conversation_history_v1 WHERE task_id = ?').run(taskId)
    this.db.prepare('DELETE FROM agent_ui_messages_v1 WHERE task_id = ?').run(taskId)
    this.db.prepare('DELETE FROM agent_task_metadata_v1 WHERE task_id = ?').run(taskId)
    this.db.prepare('DELETE FROM agent_context_history_v1 WHERE task_id = ?').run(taskId)

    // Insert new data from snapshot
    this._insertSnapshotRows('agent_api_conversation_history_v1', tables.agent_api_conversation_history_v1)
    this._insertSnapshotRows('agent_ui_messages_v1', tables.agent_ui_messages_v1)
    this._insertSnapshotRows('agent_task_metadata_v1', tables.agent_task_metadata_v1)
    this._insertSnapshotRows('agent_context_history_v1', tables.agent_context_history_v1)
  }

  /**
   * Insert snapshot rows into a table.
   * Uses column whitelist from the actual table to filter incoming data.
   * Excludes 'id' column so SQLite assigns fresh local auto-increment values.
   */
  private _insertSnapshotRows(tableName: string, rows: Record<string, unknown>[]): void {
    if (!rows || rows.length === 0) return

    // Get valid column names from the actual table, excluding local surrogate 'id'
    const tableInfo = this.db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{
      name: string
    }>
    const validColumns = new Set(tableInfo.map((col) => col.name))
    validColumns.delete('id')

    for (const row of rows) {
      // Filter to only valid columns that exist in the row
      const columns = Object.keys(row).filter((key) => validColumns.has(key))
      if (columns.length === 0) continue

      const placeholders = columns.map(() => '?').join(', ')
      const values = columns.map((col) => {
        const val = row[col]
        if (val === null || val === undefined) return null
        if (typeof val === 'object') return JSON.stringify(val)
        return val
      })

      this.db.prepare(`INSERT INTO ${tableName} (${columns.join(', ')}) VALUES (${placeholders})`).run(...values)
    }
  }

  /**
   * Delete all 4 chat tables data for a task in a single transaction.
   */
  deleteTaskChatData(taskId: string): void {
    this.db.transaction(() => {
      this.db.prepare('DELETE FROM agent_api_conversation_history_v1 WHERE task_id = ?').run(taskId)
      this.db.prepare('DELETE FROM agent_ui_messages_v1 WHERE task_id = ?').run(taskId)
      this.db.prepare('DELETE FROM agent_task_metadata_v1 WHERE task_id = ?').run(taskId)
      this.db.prepare('DELETE FROM agent_context_history_v1 WHERE task_id = ?').run(taskId)
    })()
  }

  // ==================== Chat Sync Task State Methods ====================

  getSyncTaskState(taskId: string): ChatSyncTaskState | null {
    const row = this.db.prepare('SELECT * FROM agent_chat_sync_task_state WHERE task_id = ?').get(taskId) as ChatSyncTaskState | undefined
    return row || null
  }

  getAllPendingUploadTasks(): ChatSyncTaskState[] {
    return this.db
      .prepare('SELECT * FROM agent_chat_sync_task_state WHERE pending_upload = 1 AND remote_deleted = 0 AND is_deleted = 0')
      .all() as ChatSyncTaskState[]
  }

  getRemoteDeletedNotCleanedTasks(): ChatSyncTaskState[] {
    return this.db.prepare('SELECT * FROM agent_chat_sync_task_state WHERE remote_deleted = 1 AND is_deleted = 0').all() as ChatSyncTaskState[]
  }

  getTasksPendingRemoteDeletion(): ChatSyncTaskState[] {
    return this.db
      .prepare('SELECT * FROM agent_chat_sync_task_state WHERE is_deleted = 1 AND last_server_revision > 0 AND remote_deleted = 0')
      .all() as ChatSyncTaskState[]
  }

  getTasksPendingRepair(): ChatSyncTaskState[] {
    return this.db
      .prepare(
        "SELECT * FROM agent_chat_sync_task_state WHERE last_sync_status = 'apply_failed' AND sync_blocked_reason IS NULL AND pending_upload = 0 AND remote_deleted = 0 AND is_deleted = 0"
      )
      .all() as ChatSyncTaskState[]
  }

  getAllSyncedTasks(): ChatSyncTaskState[] {
    return this.db.prepare('SELECT * FROM agent_chat_sync_task_state WHERE last_server_revision > 0 AND is_deleted = 0').all() as ChatSyncTaskState[]
  }

  upsertSyncTaskState(state: Partial<ChatSyncTaskState> & { task_id: string }): void {
    const existing = this.getSyncTaskState(state.task_id)
    const now = Math.floor(Date.now() / 1000)

    if (existing) {
      const updates: string[] = []
      const values: unknown[] = []

      for (const [key, val] of Object.entries(state)) {
        if (key === 'task_id') continue
        updates.push(`${key} = ?`)
        values.push(val)
      }
      updates.push('updated_at = ?')
      values.push(now)
      values.push(state.task_id)

      this.db.prepare(`UPDATE agent_chat_sync_task_state SET ${updates.join(', ')} WHERE task_id = ?`).run(...values)
    } else {
      this.db
        .prepare(
          `INSERT INTO agent_chat_sync_task_state
          (task_id, local_change_seq, acked_local_change_seq,
           last_uploaded_hash, last_uploaded_hash_version,
           last_applied_hash, last_applied_hash_version,
           last_server_revision, pending_upload, is_deleted, remote_deleted,
           sync_blocked_reason, last_sync_status, last_error, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          state.task_id,
          state.local_change_seq ?? 0,
          state.acked_local_change_seq ?? 0,
          state.last_uploaded_hash ?? null,
          state.last_uploaded_hash_version ?? 0,
          state.last_applied_hash ?? null,
          state.last_applied_hash_version ?? 0,
          state.last_server_revision ?? 0,
          state.pending_upload ?? 0,
          state.is_deleted ?? 0,
          state.remote_deleted ?? 0,
          state.sync_blocked_reason ?? null,
          state.last_sync_status ?? null,
          state.last_error ?? null,
          now
        )
    }
  }

  // ==================== Chat Sync Cursor Methods ====================
  // Uses key_value_store table with a fixed key instead of a dedicated table.
  // Each database file is per-user, so no user-id scoping is needed.

  private static readonly SYNC_CURSOR_KEY = 'chat_sync_global_revision'

  getSyncCursorRevision(): number {
    const row = this.db.prepare('SELECT value FROM key_value_store WHERE key = ?').get(ChatermDatabaseService.SYNC_CURSOR_KEY) as
      | { value: string }
      | undefined
    return row ? Number(row.value) : 0
  }

  upsertSyncCursorRevision(sinceGlobalRevision: number): void {
    this.db
      .prepare(
        `INSERT INTO key_value_store (key, value, updated_at)
         VALUES (?, ?, strftime('%s', 'now'))
         ON CONFLICT(key) DO UPDATE SET
           value = excluded.value,
           updated_at = strftime('%s', 'now')`
      )
      .run(ChatermDatabaseService.SYNC_CURSOR_KEY, String(sinceGlobalRevision))
  }
}
